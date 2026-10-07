/**
 * io/points.js — flatten point GeoJSON datasets into clustering points.
 * Extracted verbatim from the original single-file tool (behaviour unchanged).
 */

/**
 * Flatten point datasets into one clustering-ready point list.
 *
 * Point and MultiPoint geometries are taken; every other geometry type is skipped.
 * Each MultiPoint vertex becomes its own point, all sharing the feature's original id.
 *
 * @param {Array<{name: string, geojson: object}>} datasets named FeatureCollections,
 *   EPSG:4326; null or feature-less entries are ignored
 * @returns {Array<{id: string, lon: number, lat: number, source: string, orig_id: *}>}
 *   points in dataset then feature order, `id` being `"<dataset>:<n>"`
 * @remarks Deterministic: output order follows input order, and ids are positional.
 */
export function merge_point_datasets(datasets) {
  const out = [];
  for (const d of datasets || []) {
    const fc = d && d.geojson;
    if (!fc || !fc.features) continue;
    let k = 0;
    const push = (lon, lat, raw) => {
      out.push({ id: d.name + ':' + k, lon, lat, source: d.name, orig_id: raw });
      k++;
    };
    for (const f of fc.features) {
      const g = f.geometry;
      if (!g) continue;
      const raw =
        f.id != null ? f.id : f.properties && f.properties.id != null ? f.properties.id : null;
      if (g.type === 'Point') push(g.coordinates[0], g.coordinates[1], raw);
      else if (g.type === 'MultiPoint') for (const c of g.coordinates) push(c[0], c[1], raw);
    }
  }
  return out;
}
