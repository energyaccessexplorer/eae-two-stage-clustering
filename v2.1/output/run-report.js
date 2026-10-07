/**
 * output/run-report.js — the downloadable run report (spec §6.3).
 *
 * A snapshot of one run in tidy long format: one fact per row, so it opens cleanly in a
 * spreadsheet and two reports can be compared line by line. It only arranges facts that
 * already exist (the run-time settings, the run summary, the provenance block); it
 * recomputes nothing.
 */

import { PARAMETERS } from '../config/parameters.js';
import { CRS, DISTANCE_METHOD } from './provenance.js';
import { toCsv } from './csv.js';

/** Report columns, in order. */
export const REPORT_COLUMNS = ['section', 'item', 'value', 'unit', 'source'];

/**
 * Build the report rows.
 *
 * @param {object} args
 * @param {string} args.timestamp run time (ISO string), captured by the caller
 * @param {string} args.toolVersion tool version string
 * @param {Array<{ item: string, value: string|number, unit: string }>} args.inputs one row
 *   per fact about the loaded files
 * @param {Record<string, *>} args.params parameter values at run time, keyed as in
 *   {@link PARAMETERS}
 * @param {Record<string, 'suggested'|'standard'|'user'>} args.sources each parameter's source
 * @param {Array<{ raster: string, allocation: string, min_pop: number }>} args.weights
 *   population-weight rows (user-added)
 * @param {Array<{ raster: string, op: string, value: number }>} args.filters filter rows
 * @param {string|null} args.rankBy ranking raster, or null
 * @param {{ kneeKm: number, steps: number, largestShare: number, stoppedBy: string }|null}
 *   args.suggestion the dominance-guard outcome, or null when nothing was suggested
 * @param {Array<{ label: string, value: number|string }>} args.summary
 *   {@link import('./run-summary.js').runSummary} rows
 * @param {object|null} args.meta {@link import('./provenance.js').buildProvenance} block,
 *   or null when pass 2 did not run
 * @param {Array<{ id: number, name: string, size: number, nameSource: 'auto'|'user',
 *   composition: string }>} args.clusters each pass-1 cluster with its name (spec §6.7)
 *   and its places per layer as text (spec §3.11), in output order
 * @param {Array<{ layer: string, weight: number }>} args.layerWeights the weight of each
 *   loaded layer (spec §3.11)
 * @returns {Array<{ section: string, item: string, value: *, unit: string, source: string }>}
 *   rows in section order: run, input, parameter, suggestion, result, cluster, banding,
 *   caveat
 * @determinism Pure function of its arguments.
 */
export function buildRunReport(args) {
  const { timestamp, toolVersion, inputs, summary, meta } = args;
  const row = (section, item, value, unit = '', source = '') => ({
    section,
    item,
    value,
    unit,
    source,
  });
  return [
    row('run', 'timestamp', timestamp),
    row('run', 'tool version', toolVersion),
    row('run', 'CRS', CRS),
    row('run', 'clustering distance method', DISTANCE_METHOD),
    ...inputs.map((i) => row('input', i.item, i.value, i.unit)),
    ...parameterRows(args, row),
    ...suggestionRows(args.suggestion, row),
    ...summary.map((s) => row('result', s.label, s.value)),
    ...args.clusters.map((c) =>
      row('cluster', `cluster ${c.id}`, c.name, `${c.size} places: ${c.composition}`, c.nameSource)
    ),
    ...(meta ? bandingRows(meta, args.clusters, row) : []),
    ...caveatRows(meta, row),
  ];
}

/**
 * The report as CSV text.
 * @param {object} args see {@link buildRunReport}
 * @returns {string} CSV with {@link REPORT_COLUMNS}
 */
export function runReportCsv(args) {
  return toCsv(
    REPORT_COLUMNS,
    buildRunReport(args).map((r) => REPORT_COLUMNS.map((c) => r[c]))
  );
}

/** Parameters that applied to this run, then weights, filters and ranking. */
function parameterRows({ params, sources, weights, filters, rankBy, layerWeights, meta }, row) {
  const applies = (p) =>
    (!p.algorithm || p.algorithm === params.algorithm) &&
    (p.pass !== 'pass2' || meta) &&
    (!p.method || p.method === params.pass2_method);
  return [
    ...PARAMETERS.filter(applies).map((p) =>
      row('parameter', p.label, params[p.key], p.unit, sources[p.key])
    ),
    ...layerWeights.map((l) =>
      row(
        'parameter',
        `layer weight: ${l.layer}`,
        l.weight,
        'x, relative to other layers',
        l.weight === 1 ? 'standard' : 'user'
      )
    ),
    ...weights.map((w, i) =>
      row(
        'parameter',
        `population weight ${i + 1}`,
        `${w.raster}, ${w.allocation}, min_pop ${w.min_pop}`,
        'people (min_pop)',
        'user'
      )
    ),
    ...filters.map((f, i) =>
      row('parameter', `filter ${i + 1}`, `${f.raster} ${f.op} ${f.value}`, '', 'user')
    ),
    row(
      'parameter',
      'rank clusters by',
      rankBy,
      'raster (empty = none)',
      rankBy ? 'user' : 'standard'
    ),
  ];
}

/** The dominance-guard outcome behind the suggested distance (spec §3.10). */
function suggestionRows(suggestion, row) {
  if (!suggestion) return [];
  return [
    row('suggestion', 'k-distance knee', suggestion.kneeKm, 'km'),
    row('suggestion', 'guard steps (x0.8 each)', suggestion.steps),
    row(
      'suggestion',
      'largest cluster share at suggested distance',
      suggestion.largestShare,
      'fraction of points'
    ),
    row('suggestion', 'guard stopped because', suggestion.stoppedBy),
  ];
}

/** Banding method and band count actually used per cluster, labelled with its name. */
function bandingRows(meta, clusters, row) {
  const nameOf = new Map(clusters.map((c) => [String(c.id), c.name]));
  return meta.banding.perCluster.map((c) =>
    row(
      'banding',
      nameOf.has(String(c.parentClusterId))
        ? `${nameOf.get(String(c.parentClusterId))} (cluster ${c.parentClusterId})`
        : `cluster ${c.parentClusterId}`,
      `${c.method}, ${c.bandCount} band(s)${c.flag ? `, ${c.flag}` : ''}`
    )
  );
}

/** Plain-language caveats a reader needs to interpret the run. */
function caveatRows(meta, row) {
  return [
    ...(meta
      ? [
          row('caveat', 'resolution ceiling', meta.caveats.note),
          row(
            'caveat',
            'bands',
            'Bands are computed within each cluster; band numbers are not comparable across clusters. Compare clusters by the absolute value instead.'
          ),
          row(
            'caveat',
            'unknown',
            'Places with no socio-economic value. Shown, never given a band or an estimated value.'
          ),
        ]
      : []),
    row(
      'caveat',
      'last-mile',
      'Places that did not join any cluster. Kept as the last-mile layer, never dropped.'
    ),
  ];
}
