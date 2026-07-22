/**
 * geo/projector.js — km distance helpers and a local equirectangular projection.
 * Extracted verbatim from the original single-file tool (behaviour unchanged).
 *
 * All clustering distances in both passes are metric. Source data is EPSG:4326
 * (lon/lat degrees); `make_projector` is the single point where degrees become
 * metres, and nothing downstream of it may treat a coordinate as a degree.
 */

/** Earth radius in metres, as used by the local equirectangular projection. */
export const EARTH_R = 6371000;

export const DEG2RAD = Math.PI / 180;

/**
 * Ground area of one raster cell, for converting a density to a count.
 *
 * @param {number} rx cell width in degrees of longitude (sign ignored)
 * @param {number} ry cell height in degrees of latitude (sign ignored)
 * @param {number} lat latitude of the cell in degrees — longitude cells narrow
 *   towards the poles, so cell area is latitude-dependent
 * @returns {number} cell area in km²
 */
export function cell_km2(rx, ry, lat) {
  const lon_km = 111.32 * Math.cos(lat * DEG2RAD);
  return Math.abs(rx * lon_km) * Math.abs(ry * 110.574);
}

/**
 * Build a local equirectangular projection centred on the given points.
 *
 * Accurate enough for clustering at country scale and cheap enough to call per
 * point. Distortion grows with distance from the centroid, so a projector is only
 * valid for the point set it was built from — never reuse one across datasets.
 *
 * @param {Array<{lon: number, lat: number}>} points EPSG:4326 degrees; must be non-empty
 * @returns {(lon: number, lat: number) => [number, number]} maps lon/lat degrees to
 *   [x, y] in **metres**, origin at the point-set centroid
 * @remarks Deterministic: the centroid depends on the point set, not on its order,
 *   up to floating-point summation.
 */
export function make_projector(points) {
  let slon = 0,
    slat = 0;
  for (const p of points) {
    slon += p.lon;
    slat += p.lat;
  }
  const lon0 = slon / points.length,
    lat0 = slat / points.length,
    coslat = Math.cos(lat0 * DEG2RAD);
  return (lon, lat) => [
    EARTH_R * (lon - lon0) * DEG2RAD * coslat,
    EARTH_R * (lat - lat0) * DEG2RAD,
  ];
}
