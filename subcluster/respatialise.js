/**
 * subcluster/respatialise.js — re-cluster one band into contiguous sub-areas.
 *
 * Spec §5 step 9: within a parent cluster, each ability-to-pay band is spatially
 * re-clustered with DBSCAN(`eps2`, `min2`) into contiguous sub-areas. Geography
 * alone decides contiguity here; the band was already fixed by ability-to-pay in
 * `banding/`, so the two metrics are never fused (spec §8).
 *
 * Reuses the pass-1 DBSCAN driver and grid index unchanged; the only new work is
 * subsetting the reused projected coordinates onto the band's members.
 */

import { GridIndex } from '../geo/grid-index.js';
import { run_dbscan } from '../cluster/dbscan.js';

/**
 * Spatially re-cluster the members of a single band.
 *
 * @param {object} args
 * @param {Float64Array} args.px x coordinates in metres, index-aligned to the run
 * @param {Float64Array} args.py y coordinates in metres, same order as `px`
 * @param {number[]} args.members indices into `px`/`py` of this band's points
 * @param {number} args.eps2m neighbourhood radius in **metres** (> 0); also the index
 *   cell size, satisfying `GridIndex.within`'s cell == query-radius invariant
 * @param {number} args.min2 DBSCAN core threshold (a point plus its neighbours)
 * @returns {Int32Array} one label per entry of `members`, in `members` order: NOISE
 *   (-1) for a scattered point, or a sub-area id counting from 1
 * @determinism Same members (in the same order), `eps2m`, and `min2` ⇒ identical
 *   labels; inherited from `run_dbscan`'s ascending-seed expansion.
 */
export function respatialiseBand({ px, py, members, eps2m, min2 }) {
  const nSub = members.length;
  const sx = new Float64Array(nSub);
  const sy = new Float64Array(nSub);
  for (let i = 0; i < nSub; i++) {
    const m = members[i];
    sx[i] = px[m];
    sy[i] = py[m];
  }
  const index = new GridIndex(sx, sy, eps2m);
  const eps2 = eps2m * eps2m;
  return run_dbscan(nSub, index, eps2, (nb) => nb.length >= min2);
}
