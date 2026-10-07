/**
 * io/weight.js — per-point weights from a raster (allocate share or point sample).
 * Extracted verbatim from the original single-file tool (behaviour unchanged).
 */

/**
 * Per-point weight from a raster, by one of two rules.
 *
 * - `'allocate'`: every populated raster cell gives its people to the **nearest**
 *   point, at any distance. Conserves the raster total across all points, but a
 *   remote point can absorb population from far away.
 * - anything else (`'sample'`): each point takes the value of the cell it sits on.
 *   Ignores everyone who does not live under a point.
 *
 * @param {import('./raster-field.js').RasterField} field source raster
 * @param {Array<{lon: number, lat: number}>} kept points that survived filtering, EPSG:4326
 * @param {(lon: number, lat: number) => [number, number]} project degrees -> metres
 * @param {import('../geo/grid-index.js').GridIndex} index over the projected `kept` points;
 *   used for `nearest` only, so its cell size is a speed knob, not a radius limit
 * @param {string} allocation `'allocate'` or `'sample'`
 * @returns {Float64Array} people per point, in the order of `kept`
 * @remarks Deterministic: cells are visited in row-major order and ties in `nearest`
 *   resolve to the lowest point index.
 */
export function build_weight(field, kept, project, index, allocation) {
  const n = kept.length,
    w = new Float64Array(n);
  if (allocation === 'allocate') {
    field.for_each_populated_cell((X, Y, people) => {
      const [lon, lat] = field.from_xy(X, Y),
        [x, y] = project(lon, lat),
        j = index.nearest(x, y);
      if (j >= 0) w[j] += people;
    });
  } else for (let i = 0; i < n; i++) w[i] = field.people_at_point(kept[i].lon, kept[i].lat);
  return w;
}
