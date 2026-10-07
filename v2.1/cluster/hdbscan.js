/**
 * cluster/hdbscan.js — scalable HDBSCAN* (EOM) with kNN-bounded candidate edges.
 * Extracted verbatim from the original single-file tool (behaviour unchanged).
 */

import { GridIndex } from '../geo/grid-index.js';
import { NOISE } from './labels.js';

/**
 * Lower bound on candidate edges kept per point when building the MST. Above
 * `min_samples` it costs little and guards against a sparse graph disconnecting
 * clusters that should have linked.
 */
const MIN_EDGE_K = 16;

/**
 * Floor on mutual reachability, in metres. Lambda is 1/reachability, so coincident
 * or near-coincident points would otherwise divide by zero and produce an infinite
 * birth level. One metre is far below any meaningful settlement separation.
 */
const MIN_REACHABILITY_M = 1;

/**
 * Label points by weighted HDBSCAN* with excess-of-mass cluster extraction.
 *
 * "Mass" is the sum of point weights rather than a raw count, so `min_cluster_size`
 * and `min_samples` are thresholds in effective average-population points — see
 * cluster/features.js, which normalises the weights before calling in.
 *
 * @param {Float64Array} px x coordinates in metres, local frame (geo/projector.js)
 * @param {Float64Array} py y coordinates in metres, same length and order as px
 * @param {Float64Array} w per-point weight (mass); all ones reproduces unweighted HDBSCAN*
 * @param {object} params
 * @param {number} params.min_cluster_size minimum mass for a condensed node to be a cluster
 * @param {number} params.min_samples mass reached before a point's core distance is set
 * @param {number} params.max_link_m maximum edge length considered, in metres; also the
 *   index cell size, so no radius query ever exceeds it
 * @returns {Int32Array} one label per point: NOISE (-1), or a cluster id counting from 1
 * @remarks Deterministic: candidate edges are generated in point order, `Array.prototype.sort`
 *   is stable so equal-weight edges keep that order, and Map/Set iteration is insertion-ordered.
 */
export function run_hdbscan(px, py, w, { min_cluster_size, min_samples, max_link_m }) {
  const n = px.length;
  const mcs = Math.max(1e-9, +min_cluster_size); // mass threshold (effective points)
  const ms = Math.max(1e-9, +min_samples); // core mass threshold (effective points)
  const index = new GridIndex(px, py, max_link_m);
  const max2 = max_link_m * max_link_m;

  // 1. one neighbour pass: core distance + k-nearest-neighbour candidate edges.
  // Bounding candidate edges to k nearest (not every pair within radius) keeps
  // the MST tractable at tens of thousands of points (scalable HDBSCAN*).
  const edge_k = Math.max(MIN_EDGE_K, Math.ceil(min_samples));
  const core = new Float64Array(n);
  const knn = new Array(n);
  for (let i = 0; i < n; i++) {
    const nb = index.within(i, max2),
      arr = [];
    for (const j of nb)
      if (j !== i) {
        const dx = px[j] - px[i],
          dy = py[j] - py[i];
        arr.push([dx * dx + dy * dy, j]);
      }
    arr.sort((a, b) => a[0] - b[0]);
    // weighted core distance: smallest radius where cumulative neighbour weight reaches ms.
    let acc = 0,
      cd = arr.length ? Math.sqrt(arr[arr.length - 1][0]) : max_link_m;
    for (let t = 0; t < arr.length; t++) {
      acc += w[arr[t][1]];
      if (acc >= ms) {
        cd = Math.sqrt(arr[t][0]);
        break;
      }
    }
    core[i] = cd;
    const lim = Math.min(edge_k, arr.length),
      keep = new Array(lim);
    for (let t = 0; t < lim; t++) keep[t] = [arr[t][1], Math.sqrt(arr[t][0])];
    knn[i] = keep;
  }
  // 2. mutual-reachability edges from the kNN graph (deduped, undirected)
  const E = [],
    seen = new Set();
  for (let i = 0; i < n; i++)
    for (const [j, d] of knn[i]) {
      const a = i < j ? i : j,
        b = i < j ? j : i,
        // Pair key as a single number: exact while a * n + b stays under 2^53,
        // i.e. well past 10^7 points, far above anything this tool handles.
        key = a * n + b;
      if (seen.has(key)) continue;
      seen.add(key);
      let mw = Math.max(core[a], core[b], d);
      if (mw < MIN_REACHABILITY_M) mw = MIN_REACHABILITY_M;
      E.push([mw, a, b]);
    }
  E.sort((a, b) => a[0] - b[0]);
  // 3. minimum spanning forest -> dendrogram (Kruskal + union-find)
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const SZ = 2 * n,
    left = new Int32Array(SZ).fill(-1),
    right = new Int32Array(SZ).fill(-1);
  const nmass = new Float64Array(SZ),
    nlam = new Float64Array(SZ);
  for (let i = 0; i < n; i++) nmass[i] = w[i]; // leaf mass = point weight
  const comp = new Int32Array(n);
  for (let i = 0; i < n; i++) comp[i] = i;
  let next = n;
  for (const [mw, a, b] of E) {
    const ra = find(a),
      rb = find(b);
    if (ra === rb) continue;
    const na = comp[ra],
      nb = comp[rb],
      id = next++;
    left[id] = na;
    right[id] = nb;
    nmass[id] = nmass[na] + nmass[nb];
    nlam[id] = 1.0 / mw;
    parent[ra] = rb;
    comp[find(rb)] = id;
  }
  const rootset = new Set();
  for (let i = 0; i < n; i++) rootset.add(comp[find(i)]);
  // 4. condense + stability
  const c_birth = [],
    c_parent = [],
    c_stab = [];
  const home = new Int32Array(n).fill(-1);
  const newC = (birth, par) => {
    const id = c_birth.length;
    c_birth.push(birth);
    c_parent.push(par);
    c_stab.push(0);
    return id;
  };
  const leavesUnder = (node, cb) => {
    const st = [node];
    while (st.length) {
      const x = st.pop();
      if (x < n) cb(x);
      else {
        st.push(left[x]);
        st.push(right[x]);
      }
    }
  };
  const work = [];
  for (const r of rootset) work.push([r, newC(0, -1)]);
  while (work.length) {
    const [node, C] = work.pop();
    if (node < n) {
      home[node] = C;
      continue;
    }
    const L = left[node],
      R = right[node],
      sL = nmass[L],
      sR = nmass[R],
      lam = nlam[node],
      birth = c_birth[C];
    if (sL < mcs && sR < mcs) {
      c_stab[C] += nmass[node] * (lam - birth);
      leavesUnder(node, (p) => (home[p] = C));
    } else if (sL < mcs) {
      c_stab[C] += sL * (lam - birth);
      leavesUnder(L, (p) => (home[p] = C));
      work.push([R, C]);
    } else if (sR < mcs) {
      c_stab[C] += sR * (lam - birth);
      leavesUnder(R, (p) => (home[p] = C));
      work.push([L, C]);
    } else {
      c_stab[C] += nmass[node] * (lam - birth);
      work.push([L, newC(lam, C)]);
      work.push([R, newC(lam, C)]);
    }
  }
  // 5. EOM extraction
  const K = c_birth.length,
    children = Array.from({ length: K }, () => []);
  for (let i = 0; i < K; i++) if (c_parent[i] >= 0) children[c_parent[i]].push(i);
  const order = [...Array(K).keys()].sort((a, b) => c_birth[b] - c_birth[a]); // deepest first
  const homeMass = new Float64Array(K);
  for (let p = 0; p < n; p++) if (home[p] >= 0) homeMass[home[p]] += w[p];
  const subMass = new Float64Array(K);
  for (const c of order) {
    let s = homeMass[c];
    for (const ch of children[c]) s += subMass[ch];
    subMass[c] = s;
  }
  const selected = new Array(K).fill(false),
    selStab = new Float64Array(K);
  const deselect = (c) => {
    const st = [...children[c]];
    while (st.length) {
      const x = st.pop();
      selected[x] = false;
      for (const ch of children[x]) st.push(ch);
    }
  };
  for (const c of order) {
    const childSum = children[c].reduce((a, ch) => a + selStab[ch], 0);
    if (children[c].length === 0) {
      if (subMass[c] >= mcs) {
        selected[c] = true;
        selStab[c] = c_stab[c];
      } else {
        selected[c] = false;
        selStab[c] = 0;
      }
    } else if (c_stab[c] >= childSum && subMass[c] >= mcs) {
      selected[c] = true;
      selStab[c] = c_stab[c];
      deselect(c);
    } else {
      selected[c] = false;
      selStab[c] = childSum;
    }
  }
  // 6. labels: nearest selected ancestor-or-self of each point's home cluster
  const clabel = new Map();
  let nx = 0;
  for (const c of order) if (selected[c]) clabel.set(c, ++nx);
  const labels = new Int32Array(n).fill(NOISE);
  for (let p = 0; p < n; p++) {
    let c = home[p];
    while (c >= 0 && !selected[c]) c = c_parent[c];
    labels[p] = c >= 0 ? clabel.get(c) : NOISE;
  }
  return labels;
}
