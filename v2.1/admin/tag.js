/**
 * admin/tag.js — locate points in admin units and highlight straddling clusters.
 *
 * The admin overlay is boundary-blind and human-in-the-loop (spec §3.7, §8):
 * clustering never uses these boundaries, and nothing here splits anything. This
 * module only answers two questions the UI needs — which admin unit each point falls
 * in, and which pass-1 clusters a boundary would split — so the user can decide.
 *
 * Per the agreed v1 scope there is no admin hierarchy: an admin unit is a single
 * flat polygon with an id.
 */

import { pointInMultiPolygon } from './point-in-polygon.js';

/** Common area-name properties, most specific first (spec §6.7). */
const NAME_KEYS = [
  'name',
  'NAME',
  'Name',
  'shapeName',
  'ADM3_EN',
  'ADM2_EN',
  'ADM1_EN',
  'ADM3',
  'ADM2',
  'ADM1',
  'NAME_3',
  'NAME_2',
  'NAME_1',
];

/**
 * Properties that hold non-empty text in at least half of the features: the candidates
 * for an area-name field.
 * @param {{ features: Array<object> }} featureCollection admin-boundary GeoJSON
 * @returns {string[]} property keys, in first-seen order
 */
export function nameFields(featureCollection) {
  const features = (featureCollection && featureCollection.features) || [];
  const textCount = new Map();
  for (const f of features) {
    for (const [key, value] of Object.entries((f && f.properties) || {})) {
      const isText = typeof value === 'string' && value.trim() !== '';
      textCount.set(key, (textCount.get(key) || 0) + (isText ? 1 : 0));
    }
  }
  return [...textCount].filter(([, n]) => n > 0 && n >= features.length / 2).map(([key]) => key);
}

/**
 * The most likely area-name property: a common name key if present, else the first
 * text property.
 * @param {{ features: Array<object> }} featureCollection admin-boundary GeoJSON
 * @returns {string|null} the property key, or null when no property holds text
 */
export function detectNameField(featureCollection) {
  const fields = nameFields(featureCollection);
  return NAME_KEYS.find((k) => fields.includes(k)) ?? fields[0] ?? null;
}

/**
 * Normalise an admin-boundary FeatureCollection into flat, bbox-tagged units.
 *
 * @param {{ features: Array<object> }} featureCollection GeoJSON of Polygon/MultiPolygon
 *   features in EPSG:4326; a unit id is taken from `feature.id`, else `properties.id`,
 *   else `properties.name`, else the feature's position
 * @param {string|null} [nameField=null] property holding the area name (see
 *   {@link detectNameField}); units without it are named by their id
 * @returns {Array<{ id: string|number, name: string, polygons: Array,
 *   bbox: [number, number, number, number] }>} one entry per usable feature;
 *   non-polygon features are skipped
 */
export function parseAdminUnits(featureCollection, nameField = null) {
  const units = [];
  const features = (featureCollection && featureCollection.features) || [];
  features.forEach((f, i) => {
    const g = f && f.geometry;
    if (!g) return;
    let polygons;
    if (g.type === 'Polygon') polygons = [g.coordinates];
    else if (g.type === 'MultiPolygon') polygons = g.coordinates;
    else return;

    let minx = Infinity;
    let miny = Infinity;
    let maxx = -Infinity;
    let maxy = -Infinity;
    for (const rings of polygons) {
      for (const [x, y] of rings[0]) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
    const id =
      f.id != null
        ? f.id
        : f.properties && f.properties.id != null
          ? f.properties.id
          : f.properties && f.properties.name != null
            ? f.properties.name
            : i;
    const label = nameField && f.properties ? f.properties[nameField] : null;
    const name = label != null && String(label).trim() !== '' ? String(label) : String(id);
    units.push({ id, name, polygons, bbox: [minx, miny, maxx, maxy] });
  });
  return units;
}

/**
 * Locate each point in an admin unit.
 *
 * A bounding-box pre-check rejects most unit/point pairs before the ray cast, so no
 * full point×polygon comparison is built. The first containing unit wins (admin
 * units are assumed non-overlapping).
 *
 * @param {Array<{ lon: number, lat: number }>} points EPSG:4326 points
 * @param {Array<object>} units parsed admin units from {@link parseAdminUnits}
 * @returns {Int32Array} one entry per point: the index into `units` of its admin unit,
 *   or -1 when the point falls outside every unit
 */
export function locatePoints(points, units) {
  const out = new Int32Array(points.length).fill(-1);
  for (let i = 0; i < points.length; i++) {
    const { lon, lat } = points[i];
    for (let u = 0; u < units.length; u++) {
      const [minx, miny, maxx, maxy] = units[u].bbox;
      if (lon < minx || lon > maxx || lat < miny || lat > maxy) continue;
      if (pointInMultiPolygon(lon, lat, units[u].polygons)) {
        out[i] = u;
        break;
      }
    }
  }
  return out;
}

/**
 * Distinct admin unit ids among a set of member points (outside points excluded).
 * @param {number[]} members point indices
 * @param {Int32Array} pointUnit per-point unit index from {@link locatePoints}
 * @param {Array<object>} units parsed admin units
 * @returns {Array<string|number>} unit ids, in ascending unit-index order
 */
export function adminUnitsOf(members, pointUnit, units) {
  const seen = new Set();
  for (const m of members) {
    if (pointUnit[m] >= 0) seen.add(pointUnit[m]);
  }
  return [...seen].sort((a, b) => a - b).map((u) => units[u].id);
}

/**
 * Find which clusters a boundary would split, so the UI can highlight them.
 *
 * A cluster straddles when its members fall in more than one admin unit; the user
 * then decides whether to split it (see admin/split.js). Points outside all units do
 * not by themselves cause a straddle.
 *
 * @param {object} pass2 the {@link import('../subcluster/pass2.js').runPass2} result
 * @param {Int32Array} pointUnit per-point unit index from {@link locatePoints}
 * @param {Array<object>} units parsed admin units
 * @returns {Array<{ parentClusterId: number, adminUnitIds: Array<string|number>,
 *   straddle: boolean }>} one entry per cluster, in the pass-2 cluster order
 */
export function clusterStraddles(pass2, pointUnit, units) {
  return pass2.clusters.map((c) => {
    const members = clusterMembers(c);
    const adminUnitIds = adminUnitsOf(members, pointUnit, units);
    return { parentClusterId: c.parentClusterId, adminUnitIds, straddle: adminUnitIds.length > 1 };
  });
}

/**
 * All member indices of a cluster (every sub-area plus the unknown group).
 * @param {object} cluster a pass-2 cluster record
 * @returns {number[]} member point indices
 */
export function clusterMembers(cluster) {
  const members = [];
  for (const sub of cluster.subAreas) members.push(...sub.memberIndices);
  if (cluster.unknown) members.push(...cluster.unknown.memberIndices);
  return members;
}
