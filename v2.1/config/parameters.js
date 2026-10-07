/**
 * config/parameters.js — the catalogue of every tunable parameter (spec §3.10, §6.3).
 *
 * One list, so the UI's standard defaults and the run report's labels and units cannot
 * drift apart. `algorithm` / `method` mark parameters that only apply to one pass-1
 * algorithm or one pass-2 method; the report omits them otherwise.
 */

/**
 * @typedef {object} Parameter
 * @property {string} key state key used by the UI
 * @property {string} label plain-language name shown in reports
 * @property {string} unit unit of the value ('' when unitless)
 * @property {string|number|boolean|null} standard standard default (spec §3.10)
 * @property {'pass1'|'pass2'|'output'} pass which pass the parameter belongs to ('output'
 *   for settings that only shape the outputs)
 * @property {'dbscan'|'hdbscan'} [algorithm] only applies to this pass-1 algorithm
 * @property {'bands'|'regions'} [method] only applies to this pass-2 method
 */

const EFFECTIVE = 'points (population-weighted places when weighting is on)';

/** @type {Parameter[]} */
export const PARAMETERS = [
  { key: 'algorithm', label: 'pass-1 algorithm', unit: '', standard: 'dbscan', pass: 'pass1' },
  {
    key: 'eps_km',
    label: 'grouping distance (eps)',
    unit: 'km',
    standard: 5,
    pass: 'pass1',
    algorithm: 'dbscan',
  },
  {
    key: 'min_pts',
    label: 'min_pts',
    unit: EFFECTIVE,
    standard: 4,
    pass: 'pass1',
    algorithm: 'dbscan',
  },
  {
    key: 'weighted',
    label: 'enforce min_pop floors',
    unit: '',
    standard: false,
    pass: 'pass1',
    algorithm: 'dbscan',
  },
  {
    key: 'min_cluster_size',
    label: 'min_cluster_size',
    unit: EFFECTIVE,
    standard: 25,
    pass: 'pass1',
    algorithm: 'hdbscan',
  },
  {
    key: 'min_samples',
    label: 'min_samples',
    unit: EFFECTIVE,
    standard: 10,
    pass: 'pass1',
    algorithm: 'hdbscan',
  },
  {
    key: 'max_link_km',
    label: 'linking distance (max_link)',
    unit: 'km',
    standard: 8,
    pass: 'pass1',
    algorithm: 'hdbscan',
  },
  {
    key: 'cluster_weight',
    label: 'reshape clusters by',
    unit: 'raster (empty = none)',
    standard: null,
    pass: 'pass1',
  },
  {
    key: 'weight_floor',
    label: 'min weight floor',
    unit: 'x mean weight',
    standard: 0.1,
    pass: 'pass1',
  },
  { key: 'pass2_method', label: 'pass-2 method', unit: '', standard: 'bands', pass: 'pass2' },
  {
    key: 'pass2_region_count',
    label: 'target regions',
    unit: 'regions',
    standard: 4,
    pass: 'pass2',
    method: 'regions',
  },
  {
    key: 'pass2_bands',
    label: 'bands (max)',
    unit: 'bands',
    standard: 5,
    pass: 'pass2',
    method: 'bands',
  },
  {
    key: 'pass2_min2',
    label: 'min points per sub-cluster (min2)',
    unit: 'points',
    standard: 4,
    pass: 'pass2',
    method: 'bands',
  },
  {
    key: 'pass2_eps2_km',
    label: 'eps2 override',
    unit: 'km (empty = auto per cluster)',
    standard: null,
    pass: 'pass2',
    method: 'bands',
  },
  {
    key: 'pass2_eps2_pct',
    label: 'eps2 percentile',
    unit: 'quantile 0-1',
    standard: 0.5,
    pass: 'pass2',
    method: 'bands',
  },
  {
    key: 'pass2_respat',
    label: 'respatialise with',
    unit: '',
    standard: 'dbscan',
    pass: 'pass2',
    method: 'bands',
  },
  {
    key: 'pass2_modality',
    label: 'modality guard',
    unit: '',
    standard: false,
    pass: 'pass2',
    method: 'bands',
  },
  {
    key: 'boundary_buffer_m',
    label: 'boundary buffer',
    unit: 'm',
    standard: 0,
    pass: 'output',
  },
];

/**
 * The standard default of every parameter, keyed by state key.
 * @returns {Record<string, string|number|boolean|null>} a fresh object on each call
 */
export function standardValues() {
  return Object.fromEntries(PARAMETERS.map((p) => [p.key, p.standard]));
}
