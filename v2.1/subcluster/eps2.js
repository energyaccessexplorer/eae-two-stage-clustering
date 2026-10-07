/**
 * subcluster/eps2.js — derive the pass-2 spatial radius from within-cluster density.
 *
 * Spec §3.9: for each parent cluster, `eps2` is the median, over the cluster's
 * with-data points, of each point's distance to its `min2`-th nearest neighbour
 * (the classic k-distance DBSCAN heuristic, k = min2). One `eps2` serves all of
 * that cluster's bands; a split recomputes it per piece.
 *
 * No geography-vs-ability fusion happens here: this is purely a distance in the
 * projected metric frame, computed over the members the caller selected.
 */

import { GridIndex } from '../geo/grid-index.js';

/**
 * Median of a numeric array, computed on a sorted copy (input left untouched).
 * @param {Float64Array} values finite values, length >= 1
 * @param {number} p quantile in [0, 1] (0.5 = median)
 * @returns {number} the linearly-interpolated p-quantile
 */
function quantile(values, p) {
  const sorted = Float64Array.from(values);
  sorted.sort();
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Derive `eps2` for one parent cluster from its with-data point density.
 *
 * Reuses the pass-1 projection: `px`/`py` are the already-projected metre
 * coordinates, and a small `GridIndex` is built over the `members` subset only —
 * never the whole dataset, never a distance matrix (spec §4).
 *
 * @param {object} args
 * @param {Float64Array} args.px x coordinates in metres, index-aligned to the run
 * @param {Float64Array} args.py y coordinates in metres, same order as `px`
 * @param {number[]} args.members indices into `px`/`py` of the cluster's with-data points
 * @param {number} args.min2 neighbour rank for the k-distance, k = min2 (>= 1)
 * @param {number} [args.percentile=0.5] quantile of the per-point k-distances to use;
 *   0.5 is the spec's median, a lower value (e.g. 0.3) yields a tighter radius that
 *   over-connects dense bands less
 * @returns {number|null} `eps2` in **metres**, or null when the cluster has too few
 *   with-data points to have a min2-th neighbour (`members.length <= min2`), in which
 *   case the caller must skip respatialisation
 * @determinism Same members, min2, and percentile ⇒ identical `eps2`; independent of
 *   member order.
 */
export function deriveEps2({ px, py, members, min2, percentile = 0.5 }) {
  const nSub = members.length;
  if (nSub <= min2) return null;

  const sx = new Float64Array(nSub);
  const sy = new Float64Array(nSub);
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  for (let i = 0; i < nSub; i++) {
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

  // Cell size is a speed knob only for this k-nearest index (it caps no distance):
  // aim for roughly one point per cell, with a positive floor for degenerate spans.
  const maxSpan = Math.max(maxx - minx, maxy - miny);
  const cell = Math.max(maxSpan / Math.sqrt(nSub), 1e-6);
  const index = new GridIndex(sx, sy, cell);

  const dists = new Float64Array(nSub);
  for (let i = 0; i < nSub; i++) dists[i] = index.kthNearestDist(i, min2);
  return quantile(dists, percentile);
}
