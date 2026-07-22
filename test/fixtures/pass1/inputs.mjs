/**
 * Deterministic pass-1 regression inputs.
 *
 * Shared by the golden-master capture script and the regression test so both
 * exercise byte-identical inputs. Everything here is generated from a fixed seed;
 * no randomness leaks in. Coordinates are EPSG:4326 (lon/lat, degrees); the raster
 * is a synthetic geographic population-count grid covering the points' bbox.
 */

/** Deterministic LCG in [0, 1). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1103515245 * s + 12345) >>> 0;
    return s / 0x100000000;
  };
}

/** One standard-normal sample via Box-Muller, driven by the given LCG. */
function gauss(rnd) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const RASTER_MIN_LON = 36.7;
const RASTER_MAX_LAT = -1.19;
const RASTER_RES = 0.005;
const RASTER_W = 52;
const RASTER_H = 40;
const RASTER_NODATA = -9999;

/** A-cluster centre, used for both the point blob and the population peak. */
const PEAK_LON = 36.82;
const PEAK_LAT = -1.29;

/**
 * Build the synthetic point GeoJSON: three Gaussian blobs plus uniform noise.
 * @returns {{ name: string, geojson: object }} a single dataset for merge_point_datasets
 */
export function makeDataset() {
  const rnd = lcg(20260719);
  const features = [];
  let k = 0;
  const blob = (cx, cy, n, sd) => {
    for (let i = 0; i < n; i++) {
      const lon = cx + gauss(rnd) * sd;
      const lat = cy + gauss(rnd) * sd;
      features.push({
        type: 'Feature',
        id: 'p' + k++,
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {},
      });
    }
  };
  blob(PEAK_LON, PEAK_LAT, 80, 0.015);
  blob(36.9, -1.24, 60, 0.012);
  blob(36.76, -1.34, 40, 0.01);
  for (let i = 0; i < 20; i++) {
    const lon = 36.72 + rnd() * 0.22;
    const lat = -1.37 + rnd() * 0.16;
    features.push({
      type: 'Feature',
      id: 'p' + k++,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {},
    });
  }
  return { name: 'facilities', geojson: { type: 'FeatureCollection', features } };
}

/**
 * Build the synthetic population raster def (counts per cell, EPSG:4326).
 * A Gaussian population peak sits over the A-cluster; a deterministic scatter of
 * nodata cells is included so the regression covers nodata handling.
 * @returns {object} a RasterField def
 */
export function makeRaster() {
  const values = new Array(RASTER_W * RASTER_H);
  for (let row = 0; row < RASTER_H; row++) {
    for (let col = 0; col < RASTER_W; col++) {
      const lon = RASTER_MIN_LON + (col + 0.5) * RASTER_RES;
      const lat = RASTER_MAX_LAT - (row + 0.5) * RASTER_RES;
      const idx = row * RASTER_W + col;
      if ((idx * 7 + 3) % 37 === 0) {
        values[idx] = RASTER_NODATA;
        continue;
      }
      const dl = lon - PEAK_LON;
      const da = lat - PEAK_LAT;
      const peak = 900 * Math.exp(-(dl * dl + da * da) / (2 * 0.02 * 0.02));
      values[idx] = Math.round(15 + peak);
    }
  }
  return {
    values,
    width: RASTER_W,
    height: RASTER_H,
    origin: [RASTER_MIN_LON, RASTER_MAX_LAT],
    resolution: [RASTER_RES, -RASTER_RES],
    nodata: RASTER_NODATA,
    is_density: false,
    is_geographic: true,
    to_meter: 1,
  };
}

/**
 * The scenarios to run through cluster_features, covering both algorithms and the
 * weighting / filter / rank paths.
 * @param {Array} points merged points (from merge_point_datasets(makeDataset()))
 * @param {object} raster the raster def (from makeRaster())
 * @returns {Record<string, object>} scenario name -> cluster_features options
 */
export function makeScenarios(points, raster) {
  const rasters = { pop: raster };
  const dbscanBase = { points, algorithm: 'dbscan', rasters, eps_km: 1.5, min_pts: 5 };
  return {
    dbscan_unweighted: { points, algorithm: 'dbscan', eps_km: 1.5, min_pts: 5 },
    dbscan_cluster_weight_allocate: {
      ...dbscanBase,
      cluster_weight: 'pop',
      cluster_weight_alloc: 'allocate',
    },
    dbscan_weighted_minpop: {
      ...dbscanBase,
      weighted: true,
      weights: [{ raster: 'pop', allocation: 'allocate', min_pop: 3000 }],
    },
    dbscan_filter: {
      ...dbscanBase,
      filters: [{ raster: 'pop', op: '>=', value: 20 }],
    },
    dbscan_rank_by: {
      ...dbscanBase,
      weights: [{ raster: 'pop', allocation: 'allocate', min_pop: 0 }],
      rank_by: 'pop',
    },
    hdbscan: {
      points,
      algorithm: 'hdbscan',
      min_cluster_size: 15,
      min_samples: 8,
      max_link_km: 4,
    },
    hdbscan_cluster_weight: {
      points,
      algorithm: 'hdbscan',
      rasters,
      cluster_weight: 'pop',
      min_cluster_size: 15,
      min_samples: 8,
      max_link_km: 4,
    },
  };
}
