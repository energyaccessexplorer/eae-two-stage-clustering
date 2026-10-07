/**
 * output/cluster-config.js — cluster names and configuration on every output feature
 * (spec §6.7).
 *
 * Once clusters are loaded into a CMS, possibly alongside clusters from other runs,
 * each feature must say what it is called and how it was made. These are flat
 * properties (plain attribute columns in QGIS and CMS imports). One decorator serves
 * both GeoJSON downloads at download time, so renaming never requires rebuilding them.
 * Pure: inputs are not modified.
 */

import { displayName } from './cluster-names.js';

const SUBAREA_KINDS = new Set(['subarea', 'subarea_boundary']);

/**
 * The configuration columns shared by every feature of a run.
 *
 * @param {object} args
 * @param {Record<string, *>} args.params parameter values at run time (config/parameters.js keys)
 * @param {Record<string, string>} args.sources each parameter's source
 * @param {string} args.timestamp run time (ISO string)
 * @param {string} args.toolVersion tool version string
 * @returns {object} `cfg_algorithm`, `cfg_distance_km` (km), `cfg_distance_source`,
 *   `cfg_min_points`, `cfg_min_samples` (null for DBSCAN, so every file has the same
 *   columns), `cfg_weighting`, `cfg_run_time`, `cfg_tool_version`
 */
export function runConfig({ params, sources, timestamp, toolVersion }) {
  const dbscan = params.algorithm === 'dbscan';
  const distanceKey = dbscan ? 'eps_km' : 'max_link_km';
  return {
    cfg_algorithm: params.algorithm,
    cfg_distance_km: params[distanceKey],
    cfg_distance_source: sources[distanceKey],
    cfg_min_points: dbscan ? params.min_pts : params.min_cluster_size,
    cfg_min_samples: dbscan ? null : params.min_samples,
    cfg_weighting: params.cluster_weight ? 'population' : 'none',
    cfg_run_time: timestamp,
    cfg_tool_version: toolVersion,
  };
}

/**
 * Copy a FeatureCollection with `cluster_name` and the configuration columns added to
 * every feature, matched by its `parent_cluster_id`.
 *
 * @param {{ features: object[] }} featureCollection the points or boundaries GeoJSON
 * @param {object} args
 * @param {Map<number, string>} args.names cluster names (automatic or user-edited)
 * @param {Array<{ id: string|number, name: string }>|null} args.units admin units, for
 *   naming split pieces
 * @param {object} args.runCfg {@link runConfig} columns
 * @param {object|null} args.pass2 the pass-2 result, for per-cluster sub-area columns
 * @param {Record<string, *>} args.params parameter values at run time
 * @returns {object} a new FeatureCollection (meta kept). Sub-area features also get
 *   `cfg_subarea_method`, `cfg_bands_max`, `cfg_band_count`, `cfg_banding_method`,
 *   `cfg_min2` and `cfg_eps2_km` from their own cluster.
 */
export function withClusterInfo(featureCollection, { names, units, runCfg, pass2, params }) {
  const pass2ById = new Map(
    (pass2 ? pass2.clusters : []).map((c) => [String(c.parentClusterId), c])
  );
  const features = featureCollection.features.map((f) => {
    const id = f.properties.parent_cluster_id;
    const properties = { ...f.properties, cluster_name: displayName(id, names, units), ...runCfg };
    const cluster = pass2ById.get(String(id));
    if (SUBAREA_KINDS.has(f.properties.kind) && cluster) {
      Object.assign(properties, {
        cfg_subarea_method: params.pass2_method,
        cfg_bands_max: params.pass2_method === 'bands' ? params.pass2_bands : null,
        cfg_band_count: cluster.k,
        cfg_banding_method: cluster.method,
        cfg_min2: params.pass2_method === 'bands' ? params.pass2_min2 : null,
        cfg_eps2_km: cluster.eps2Km,
      });
    }
    return { ...f, properties };
  });
  return { ...featureCollection, features };
}
