/**
 * region/regionalize.js — SKATER-style regionalization (spec §8 EXCEPTION, opt-in).
 *
 * Partitions a parent cluster's with-data points into a target number of CONTIGUOUS
 * regions that are internally homogeneous in the socio-economic value. Unlike the
 * default band-then-respatialise method, this DELIBERATELY fuses geography and value —
 * which spec §8 forbids by default — so it is an explicit, opt-in mode that a product
 * owner chooses, never the default.
 *
 * Method (SKATER, Assunção et al. 2006, simplified):
 *   1. adjacency = a k-nearest-neighbour graph over the points (geography only);
 *   2. weight each edge by the squared difference of the two points' values;
 *   3. take the minimum spanning tree (keeps value-similar neighbours together);
 *   4. cut the highest-dissimilarity tree edges until `targetRegions` pieces remain.
 * Each piece is spatially connected (a subtree of a spatial graph) and value-similar
 * (the internal edges are the low-dissimilarity ones). The kNN graph is index-backed,
 * so no full distance matrix is built (spec §4).
 */

import { GridIndex } from '../geo/grid-index.js';

/** Default neighbours per node in the adjacency graph. */
const DEFAULT_KNN = 8;

/**
 * Regionalize one cluster's with-data points into contiguous, value-homogeneous regions.
 *
 * @param {object} args
 * @param {Float64Array} args.px x coordinates in metres, index-aligned to the run
 * @param {Float64Array} args.py y coordinates in metres, same order as `px`
 * @param {Array<number>|Float64Array} args.values socio-economic value per run-point
 * @param {number[]} args.members indices into `px`/`py`/`values` of the with-data points
 * @param {number} args.targetRegions desired number of regions (>= 1)
 * @param {number} [args.knn=8] neighbours per node in the adjacency graph
 * @returns {Int32Array} region id (1..R) per entry of `members`, where R is
 *   min(targetRegions, members.length) — or the count of disconnected adjacency
 *   components when that is larger
 * @determinism Same members (in the same order), values, `targetRegions`, and `knn`
 *   ⇒ identical labels (edges carry a total order via a weight-then-index tiebreak).
 */
export function regionalize({ px, py, values, members, targetRegions, knn = DEFAULT_KNN }) {
  const n = members.length;
  const labels = new Int32Array(n);
  if (n <= 1 || targetRegions <= 1) {
    labels.fill(n === 0 ? 0 : 1);
    return labels;
  }

  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  for (let i = 0; i < n; i++) {
    const m = members[i];
    const x = px[m];
    const y = py[m];
    sx[i] = x;
    sy[i] = y;
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  const cell = Math.max(Math.max(maxx - minx, maxy - miny) / Math.sqrt(n), 1e-6);
  const index = new GridIndex(sx, sy, cell);

  // Adjacency edges (geography), weighted by value dissimilarity. Deduped to i < j.
  const kk = Math.min(knn, n - 1);
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (const j of index.kNearest(i, kk)) {
      if (j <= i) continue;
      const d = values[members[i]] - values[members[j]];
      edges.push([d * d, i, j]);
    }
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);

  // Minimum spanning forest over the adjacency graph (Kruskal + union-find).
  const mst = kruskal(edges, n);

  // Cut the highest-dissimilarity tree edges until targetRegions pieces remain.
  const components = n - mst.length;
  const cuts = Math.max(0, Math.min(targetRegions, n) - components);
  const byWeightDesc = mst.slice().sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
  const kept = byWeightDesc.slice(cuts);

  // Relabel connected components of the kept edges, ids in ascending member order.
  const parent = new Int32Array(n).map((_, i) => i);
  const find = makeFind(parent);
  for (const [, a, b] of kept) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  const idOf = new Map();
  let next = 0;
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!idOf.has(root)) idOf.set(root, ++next);
    labels[i] = idOf.get(root);
  }
  return labels;
}

/**
 * Kruskal minimum spanning forest.
 * @param {Array<[number, number, number]>} edges [weight, a, b], pre-sorted ascending
 * @param {number} n node count
 * @returns {Array<[number, number, number]>} the chosen edges (n - components of them)
 */
function kruskal(edges, n) {
  const parent = new Int32Array(n).map((_, i) => i);
  const find = makeFind(parent);
  const tree = [];
  for (const e of edges) {
    const ra = find(e[1]);
    const rb = find(e[2]);
    if (ra !== rb) {
      parent[ra] = rb;
      tree.push(e);
    }
  }
  return tree;
}

/**
 * Path-halving union-find lookup bound to a parent array.
 * @param {Int32Array} parent disjoint-set parent pointers
 * @returns {(x: number) => number} the representative of `x`'s set
 */
function makeFind(parent) {
  return function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
}
