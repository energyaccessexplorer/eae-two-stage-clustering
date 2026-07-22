/**
 * output/geojson.js — assemble the pass-2 output FeatureCollection (spec §6.1).
 *
 * A pure formatter: it turns the {@link import('../subcluster/pass2.js').runPass2}
 * result into one GeoJSON FeatureCollection of sub-area, last-mile, and unknown
 * features, with the provenance `meta` block attached at the top. All domain
 * statistics are already computed in subcluster/; nothing is recomputed here.
 *
 * Sub-area geometry is a MultiPoint of the member points — the honest footprint that
 * invents no coverage (an area/hull view is a render-time overlay, not baked into the
 * saved artifact). Each feature also carries a `centroid` property and a `bbox` for
 * labelling and quick extent comparison.
 *
 * Admin tagging (spec §3.7, agreed v1 scope: no hierarchy) is optional. When supplied,
 * each feature's `admin_units` lists the ids its members fall in and `straddle` marks
 * those spanning more than one; without it those fields are null/false.
 */

import { adminUnitsOf } from '../admin/tag.js';

/**
 * Build the output FeatureCollection.
 *
 * @param {object} args
 * @param {object} args.pass2 the pass-2 result from `runPass2`
 * @param {Array<{ lon: number, lat: number }>} args.points EPSG:4326 points, index-aligned
 *   to the pass-2 member indices (the same array/order the run was given)
 * @param {object} [args.meta] provenance block from {@link import('./provenance.js').buildProvenance};
 *   attached as the collection's top-level `meta` member when present
 * @param {{ pointUnit: Int32Array, units: Array<{ id: string|number }> }} [args.admin]
 *   admin tagging from admin/tag.js (`locatePoints` + `parseAdminUnits`); when present,
 *   fills each feature's `admin_units` and `straddle`
 * @returns {{ type: 'FeatureCollection', features: object[], meta?: object }} a single
 *   FeatureCollection; features are ordered deterministically (clusters ascending, then
 *   each cluster's sub-areas, then its unknown group, then the last-mile group)
 */
export function buildFeatureCollection({ pass2, points, meta, admin }) {
  const features = [];
  for (const cluster of pass2.clusters) {
    for (const sub of cluster.subAreas) {
      features.push(
        subareaFeature(sub, cluster.parentClusterId, cluster.hasUnknown, points, admin)
      );
    }
    if (cluster.unknown) {
      features.push(unknownFeature(cluster.unknown, cluster.parentClusterId, points, admin));
    }
  }
  if (pass2.lastMile.count > 0) {
    features.push(lastMileFeature(pass2.lastMile, points, admin));
  }

  const collection = { type: 'FeatureCollection', features };
  if (meta) collection.meta = meta;
  return collection;
}

/**
 * Build a sub-area feature (spec §6.1, `kind: "subarea"`).
 * @param {object} sub sub-area record from pass 2
 * @param {number} parentClusterId pass-1 cluster id
 * @param {boolean} hasUnknown whether the parent cluster has unmeasured points
 * @param {Array<{ lon: number, lat: number }>} points index-aligned points
 * @param {object} [admin] optional admin tagging (see buildFeatureCollection)
 * @returns {object} a GeoJSON Feature
 */
function subareaFeature(sub, parentClusterId, hasUnknown, points, admin) {
  return makeFeature(
    sub.subAreaId,
    sub.memberIndices,
    points,
    {
      kind: 'subarea',
      subarea_id: sub.subAreaId,
      parent_cluster_id: parentClusterId,
      band: sub.band,
      band_value_range: sub.bandValueRange,
      population: Math.round(sub.population),
      mean_ability_to_pay: sub.meanAbilityToPay,
      has_unknown: hasUnknown,
      scattered: sub.scattered,
      missing_population_count: sub.missingPopCount,
    },
    admin
  );
}

/**
 * Build the unknown-group feature for a cluster (spec §6.1, `kind: "unknown"`).
 * @param {object} unknown unknown-group record from pass 2
 * @param {number} parentClusterId pass-1 cluster id
 * @param {Array<{ lon: number, lat: number }>} points index-aligned points
 * @param {object} [admin] optional admin tagging (see buildFeatureCollection)
 * @returns {object} a GeoJSON Feature
 */
function unknownFeature(unknown, parentClusterId, points, admin) {
  const id = `${parentClusterId}-unknown`;
  return makeFeature(
    id,
    unknown.memberIndices,
    points,
    {
      kind: 'unknown',
      subarea_id: id,
      parent_cluster_id: parentClusterId,
      band: null,
      band_value_range: null,
      population: Math.round(unknown.population),
      mean_ability_to_pay: unknown.meanAbilityToPay,
      has_unknown: true,
      scattered: false,
      missing_population_count: unknown.missingPopCount,
    },
    admin
  );
}

/**
 * Build the last-mile feature (spec §6.1, `kind: "last_mile"`).
 * @param {object} lastMile last-mile record from pass 2
 * @param {Array<{ lon: number, lat: number }>} points index-aligned points
 * @param {object} [admin] optional admin tagging (see buildFeatureCollection)
 * @returns {object} a GeoJSON Feature
 */
function lastMileFeature(lastMile, points, admin) {
  return makeFeature(
    'last-mile',
    lastMile.memberIndices,
    points,
    {
      kind: 'last_mile',
      subarea_id: 'last-mile',
      parent_cluster_id: null,
      band: null,
      band_value_range: null,
      population: Math.round(lastMile.population),
      mean_ability_to_pay: lastMile.meanAbilityToPay,
      has_unknown: false,
      scattered: false,
      missing_population_count: lastMile.missingPopCount,
    },
    admin
  );
}

/**
 * Assemble a MultiPoint Feature with a `bbox`, `centroid`, and admin tags.
 * @param {string} id stable feature id
 * @param {number[]} members point indices in this group
 * @param {Array<{ lon: number, lat: number }>} points index-aligned points
 * @param {object} properties the feature's properties
 * @param {object} [admin] optional admin tagging (see buildFeatureCollection)
 * @returns {object} a GeoJSON Feature with MultiPoint geometry
 */
function makeFeature(id, members, points, properties, admin) {
  const coordinates = new Array(members.length);
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let sumLon = 0;
  let sumLat = 0;
  for (let i = 0; i < members.length; i++) {
    const { lon, lat } = points[members[i]];
    coordinates[i] = [lon, lat];
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    sumLon += lon;
    sumLat += lat;
  }
  const n = members.length;
  const adminUnits = admin ? adminUnitsOf(members, admin.pointUnit, admin.units) : null;
  return {
    type: 'Feature',
    id,
    bbox: [minLon, minLat, maxLon, maxLat],
    geometry: { type: 'MultiPoint', coordinates },
    properties: {
      ...properties,
      admin_units: adminUnits,
      straddle: adminUnits != null && adminUnits.length > 1,
      point_count: n,
      centroid: [sumLon / n, sumLat / n],
    },
  };
}
