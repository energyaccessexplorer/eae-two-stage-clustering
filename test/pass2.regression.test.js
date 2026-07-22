import { describe, it, expect } from 'vitest';
import { cluster_features } from '../cluster/features.js';
import { runPass2 } from '../subcluster/pass2.js';
import { make_projector, EARTH_R, DEG2RAD } from '../geo/projector.js';

/**
 * Planted-pocket recovery on a synthetic city with two planted poor pockets.
 *
 * A synthetic "city" (one dense blob) has two poor pockets planted inside it. Pass 1
 * (geography DBSCAN) collapses the whole city into a single cluster; pass 2 must band
 * the city by ability-to-pay and respatialise the low band into sub-areas that land
 * on the planted pockets. This is the end-to-end feasibility claim of the spec (§2).
 */

/** Deterministic LCG in [0, 1). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1103515245 * s + 12345) >>> 0;
    return s / 0x100000000;
  };
}

/** One standard-normal sample via Box-Muller. */
function gauss(rnd) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Metres per degree at the equator, matching the projector so km↔deg round-trips.
const M_PER_DEG = EARTH_R * DEG2RAD;
const LON0 = 37;
const LAT0 = 0;
const kmToLon = (kx) => LON0 + (kx * 1000) / M_PER_DEG;
const kmToLat = (ky) => LAT0 + (ky * 1000) / M_PER_DEG;

// Two poor pockets planted inside the city: [centre_x_km, centre_y_km, radius_km].
const POCKETS = [
  [-3.5, 2.5, 1.2],
  [2.5, -3.0, 1.0],
];

/** Ability-to-pay surface in km space: rich core, two deep poor pockets. */
function ability(kx, ky) {
  let base = 0.8 - 0.02 * Math.hypot(kx, ky);
  for (const [px, py, r] of POCKETS) {
    const d = Math.hypot(kx - px, ky - py);
    if (d < r * 2.2) base -= 2.0 * Math.exp(-((d / r) ** 2));
  }
  return base;
}

/** Build the synthetic city plus a scatter of far noise, in EPSG:4326. */
function makeCity() {
  const rnd = lcg(20260721);
  const points = [];
  const abilities = [];
  let k = 0;
  for (let i = 0; i < 1500; i++) {
    const kx = gauss(rnd) * 3.5;
    const ky = gauss(rnd) * 3.5;
    points.push({ id: 'c' + k++, lon: kmToLon(kx), lat: kmToLat(ky) });
    abilities.push(ability(kx, ky) + gauss(rnd) * 0.05);
  }
  // Sparse far noise → pass-1 noise → last-mile layer.
  for (let i = 0; i < 40; i++) {
    const kx = -30 + rnd() * 60;
    const ky = -30 + rnd() * 60;
    points.push({ id: 'n' + k++, lon: kmToLon(kx), lat: kmToLat(ky) });
    abilities.push(ability(kx, ky) + gauss(rnd) * 0.05);
  }
  return { points, abilities };
}

describe('pass-2 regression: planted-pocket recovery', () => {
  const { points, abilities } = makeCity();
  const p1 = cluster_features({ points, algorithm: 'dbscan', eps_km: 1.2, min_pts: 6 });

  // No filtering ran, so pass-1 labels are in original point order; reuse the same
  // projection for pass 2 (spec §4: reuse, don't rebuild the geometry).
  const project = make_projector(points);
  const px = new Float64Array(points.length);
  const py = new Float64Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const [x, y] = project(points[i].lon, points[i].lat);
    px[i] = x;
    py[i] = y;
  }
  const population = new Float64Array(points.length).fill(1);
  const res = runPass2({ px, py, labels: p1.labels, ability: abilities, population });

  /** Largest cluster by total sub-area membership — the city. */
  const city = res.clusters.reduce(
    (best, c) => {
      const size = c.subAreas.reduce((n, s) => n + s.memberIndices.length, 0);
      return size > best.size ? { size, c } : best;
    },
    { size: -1, c: null }
  ).c;

  it('collapses the city into one dominant cluster and finds ability structure', () => {
    expect(city).not.toBeNull();
    expect(city.k).toBeGreaterThanOrEqual(2);
  });

  it('keeps pass-1 noise as a non-empty last-mile layer', () => {
    expect(res.lastMile.count).toBeGreaterThan(0);
  });

  it('lands a low-band sub-area on each planted pocket, within tolerance', () => {
    const TOL_KM = 2.0;
    const lowBand = city.subAreas.filter((s) => s.band === 0 && !s.scattered);
    expect(lowBand.length).toBeGreaterThan(0);

    const centroidsKm = lowBand.map((s) => {
      let sx = 0;
      let sy = 0;
      for (const m of s.memberIndices) {
        sx += px[m];
        sy += py[m];
      }
      const n = s.memberIndices.length;
      return [sx / n / 1000, sy / n / 1000];
    });

    for (const [pxk, pyk] of POCKETS) {
      const nearest = Math.min(...centroidsKm.map(([cx, cy]) => Math.hypot(cx - pxk, cy - pyk)));
      expect(nearest).toBeLessThan(TOL_KM);
    }
  });
});
