/**
 * admin/point-in-polygon.js — even-odd ray-casting point-in-polygon tests.
 *
 * Topological containment for tagging points against admin boundaries. Runs on
 * EPSG:4326 lon/lat degrees directly: containment is a topological question, not a
 * metric one, so no projection to kilometres is needed here (unlike clustering).
 * Boundary-exact points are not specially handled — admin borders effectively never
 * pass exactly through a facility, and v1 does not need the tie rule.
 */

/**
 * Even-odd test of a point against a single linear ring.
 * @param {number} x longitude
 * @param {number} y latitude
 * @param {Array<[number, number]>} ring closed or open ring of [lon, lat] vertices
 * @returns {boolean} true when the point is inside the ring
 */
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Point-in-polygon with holes (GeoJSON Polygon coordinate array).
 * @param {number} x longitude
 * @param {number} y latitude
 * @param {Array<Array<[number, number]>>} rings ring[0] is the outer ring; any further
 *   rings are holes
 * @returns {boolean} true when inside the outer ring and outside every hole
 */
export function pointInPolygon(x, y, rings) {
  if (!pointInRing(x, y, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(x, y, rings[h])) return false;
  }
  return true;
}

/**
 * Point-in-multipolygon (GeoJSON MultiPolygon coordinate array).
 * @param {number} x longitude
 * @param {number} y latitude
 * @param {Array<Array<Array<[number, number]>>>} polygons list of polygons, each a
 *   rings array as accepted by {@link pointInPolygon}
 * @returns {boolean} true when inside any one of the polygons
 */
export function pointInMultiPolygon(x, y, polygons) {
  for (const rings of polygons) {
    if (pointInPolygon(x, y, rings)) return true;
  }
  return false;
}
