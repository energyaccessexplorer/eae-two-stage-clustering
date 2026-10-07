/**
 * cluster/dbscan.js — index-backed DBSCAN driver (pass 1).
 * Extracted verbatim from the original single-file tool (behaviour unchanged),
 * bar the unused first argument to `is_core`, which was dropped.
 */

import { NOISE, UNVISITED } from './labels.js';

/**
 * Label points by DBSCAN, expanding clusters through index-backed radius queries.
 *
 * Never materialises a distance matrix: every neighbourhood comes from
 * `index.within`, which is why `index` must have been built with a cell size equal
 * to the query radius (see geo/grid-index.js).
 *
 * @param {number} n number of points; must match the arrays the index was built from
 * @param {import('../geo/grid-index.js').GridIndex} index spatial index over those points
 * @param {number} eps2 squared neighbourhood radius in metres²; must equal the index's cell²
 * @param {(neighbours: number[]) => boolean} is_core core test for a point given its
 *   neighbourhood — plain count, weighted mass, or a population floor, per caller
 * @returns {Int32Array} one label per point: NOISE (-1), or a cluster id counting from 1
 * @remarks Deterministic: clusters are seeded in ascending point order and expanded
 *   in the order `index.within` returns, so identical input yields identical labels.
 */
export function run_dbscan(n, index, eps2, is_core) {
  const labels = new Int32Array(n);
  let cid = 0;
  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNVISITED) continue;
    const nb = index.within(i, eps2);
    if (!is_core(nb)) {
      labels[i] = NOISE;
      continue;
    }
    cid++;
    labels[i] = cid;
    // `seeds` is an append-only queue and may hold a point more than once; the
    // label check below makes repeats no-ops. Deduplicating would save memory in
    // dense data but changes the expansion order, so the classic formulation stands.
    const seeds = nb.slice();
    for (let s = 0; s < seeds.length; s++) {
      const j = seeds[s];
      if (labels[j] === NOISE) labels[j] = cid;
      if (labels[j] !== UNVISITED) continue;
      labels[j] = cid;
      const jn = index.within(j, eps2);
      if (is_core(jn)) for (const k of jn) seeds.push(k);
    }
  }
  return labels;
}
