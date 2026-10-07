/**
 * cluster/suggest-eps.js — data-driven pass-1 `eps` suggestion (k-distance knee).
 *
 * Real-data testing showed pass-1 output is highly sensitive to `eps1` (noise swung
 * 70% → 22% across 1–5 km), so a good starting value matters. This is the classic
 * DBSCAN heuristic: take every point's distance to its `minPts`-th nearest neighbour,
 * sort ascending, and read the "knee" — the sharp upward bend that separates
 * within-cluster spacing from between-cluster gaps. Reuses the same projection and
 * index-backed k-distance as clustering; it never builds a distance matrix.
 *
 * It is a suggestion, not a decision: the user can always override the value.
 */

import { make_projector } from '../geo/projector.js';
import { GridIndex } from '../geo/grid-index.js';

/**
 * Suggest a pass-1 `eps` (km) from the point set's k-distance knee.
 *
 * @param {Array<{ lon: number, lat: number }>} points EPSG:4326 points
 * @param {number} minPts DBSCAN core threshold the eps will be paired with (k)
 * @returns {number|null} suggested `eps` in **kilometres**, or null when there are too
 *   few points (n <= minPts) to compute a k-distance
 * @determinism Pure function of the point set and minPts; independent of point order.
 */
export function suggestEps1(points, minPts) {
  const n = points.length;
  if (n <= minPts) return null;

  const project = make_projector(points);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  for (let i = 0; i < n; i++) {
    const [x, y] = project(points[i].lon, points[i].lat);
    px[i] = x;
    py[i] = y;
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  const cell = Math.max(Math.max(maxx - minx, maxy - miny) / Math.sqrt(n), 1);
  const index = new GridIndex(px, py, cell);

  const kdist = new Float64Array(n);
  for (let i = 0; i < n; i++) kdist[i] = index.kthNearestDist(i, minPts);
  kdist.sort();

  // Knee = the sorted-curve point farthest from the chord joining its first and last
  // points (a robust, parameter-free "point of maximum curvature").
  const x1 = n - 1;
  const y0 = kdist[0];
  const dy = kdist[n - 1] - y0;
  const norm = Math.hypot(dy, x1);
  if (norm === 0) return kdist[0] / 1000;
  let best = 0;
  let bestD = -1;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(dy * i - x1 * (kdist[i] - y0)) / norm;
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  }
  return kdist[best] / 1000;
}
