/**
 * cluster/suggest-params.js — data-driven pass-1 defaults with a dominance guard (spec §3.10).
 *
 * The k-distance knee (`suggestEps1`) alone overestimates eps on dense facility networks:
 * on every real layer tested (Kenya, Nepal) it chained most points into one cluster
 * holding 54–90% of them. The guard steps eps down until no single cluster dominates,
 * without letting noise (the last-mile layer) balloon. It reuses the existing knee and
 * pass-1 clustering; it adds no clustering code of its own.
 *
 * The guard judges geography only: plain DBSCAN on the points, with no weights or filters.
 */

import { suggestEps1 } from './suggest-eps.js';
import { cluster_features } from './features.js';

/** Largest-cluster share of points above which eps is stepped down (spec §3.10). */
export const DOMINANCE_SHARE = 0.5;
/** Factor applied to eps at each guard step. */
export const STEP_FACTOR = 0.8;
/** Noise share a guard step may not exceed; the step that would is not taken. */
export const NOISE_CAP = 0.25;
/** Maximum number of guard steps. */
export const MAX_STEPS = 10;

/**
 * Suggest pass-1 eps (DBSCAN) and max_link (HDBSCAN) from the point set.
 *
 * @param {Array<{ id: string, lon: number, lat: number }>} points EPSG:4326 points
 * @param {{ minPts: number }} opts DBSCAN core threshold the suggestion is paired with
 * @returns {{ epsKm: number, maxLinkKm: number, guard: { kneeKm: number, steps: number,
 *   largestShare: number, noiseShare: number, stoppedBy: 'ok'|'noise-cap'|'step-limit' } }|null}
 *   distances in **kilometres**; `largestShare`/`noiseShare` are fractions of all points at
 *   the returned eps; `stoppedBy` is 'ok' when the largest cluster is within
 *   {@link DOMINANCE_SHARE}. Null when there are too few points (n <= minPts).
 * @determinism Pure function of the point set and minPts; independent of point order.
 */
export function suggestPass1Params(points, { minPts }) {
  const kneeKm = suggestEps1(points, minPts);
  if (kneeKm == null) return null;

  let epsKm = kneeKm;
  let shares = clusterShares(points, epsKm, minPts);
  let steps = 0;
  let stoppedBy = 'ok';
  while (shares.largest > DOMINANCE_SHARE) {
    if (steps === MAX_STEPS) {
      stoppedBy = 'step-limit';
      break;
    }
    const nextKm = epsKm * STEP_FACTOR;
    const next = clusterShares(points, nextKm, minPts);
    if (next.noise > NOISE_CAP) {
      stoppedBy = 'noise-cap';
      break;
    }
    epsKm = nextKm;
    shares = next;
    steps++;
  }

  return {
    epsKm,
    maxLinkKm: epsKm,
    guard: { kneeKm, steps, largestShare: shares.largest, noiseShare: shares.noise, stoppedBy },
  };
}

/**
 * Run plain pass-1 DBSCAN and measure how concentrated the result is.
 * @param {Array<{ id: string, lon: number, lat: number }>} points EPSG:4326 points
 * @param {number} epsKm neighbourhood radius in km
 * @param {number} minPts core threshold
 * @returns {{ largest: number, noise: number }} largest-cluster and noise shares of all points
 */
function clusterShares(points, epsKm, minPts) {
  const result = cluster_features({ points, algorithm: 'dbscan', eps_km: epsKm, min_pts: minPts });
  let largest = 0;
  for (const c of result.clusters) if (c.size > largest) largest = c.size;
  return { largest: largest / points.length, noise: result.noise_ids.length / points.length };
}
