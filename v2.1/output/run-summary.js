/**
 * output/run-summary.js — the headline counts of one clustering run.
 *
 * One source for the numbers a user sees after a run, so the on-screen summary and any
 * exported report cannot disagree. Pure: it only counts what the pass-1 and pass-2
 * results already hold, and never recomputes clustering.
 */

/**
 * Summarise a run as ordered label/value rows.
 *
 * Last-mile appears once, from pass 1: pass 2's last-mile group is the same pass-1
 * noise points, so repeating it would double-report them.
 *
 * @param {object} args
 * @param {string} args.algorithm pass-1 algorithm ('dbscan' | 'hdbscan')
 * @param {number} args.pointCount number of input points
 * @param {number} args.durationMs pass-1 wall time in milliseconds
 * @param {{ clusters: Array, noise_ids: Array, filtered_ids: Array,
 *   weighting?: { requested: boolean, applied: boolean, layers?: true } }} args.result the
 *   `cluster_features` result
 * @param {object|null} args.pass2 the {@link import('../subcluster/pass2.js').runPass2}
 *   result, or null when pass 2 did not run
 * @returns {Array<{ label: string, value: number|string }>} rows in display order;
 *   pass-2 rows are present only when `pass2` is given
 * @determinism Pure function of its arguments.
 */
export function runSummary({ algorithm, pointCount, durationMs, result, pass2 }) {
  const rows = [
    { label: 'algorithm', value: algorithm },
    { label: 'points', value: pointCount },
    { label: 'clusters', value: result.clusters.length },
    { label: 'last-mile (unclustered) points', value: result.noise_ids.length },
    { label: 'filtered points', value: result.filtered_ids.length },
  ];
  if (result.weighting && result.weighting.requested) {
    rows.push({
      label: 'population weighting',
      value: result.weighting.applied ? 'applied' : 'no raster overlap, used uniform',
    });
  }
  if (result.weighting && result.weighting.layers) {
    rows.push({ label: 'layer weights', value: 'applied' });
  }
  rows.push({ label: 'pass-1 time (ms)', value: durationMs });
  if (pass2) rows.push(...pass2Rows(pass2));
  return rows;
}

/**
 * Sub-area counts across every cluster of a pass-2 result.
 * @param {object} pass2 the pass-2 result
 * @returns {Array<{ label: string, value: number }>} sub-area, scattered and unknown rows
 */
function pass2Rows(pass2) {
  let subAreas = 0;
  let scattered = 0;
  let unknown = 0;
  for (const cluster of pass2.clusters) {
    for (const sub of cluster.subAreas) {
      if (sub.scattered) scattered++;
      else subAreas++;
    }
    if (cluster.unknown) unknown += cluster.unknown.count;
  }
  return [
    { label: 'sub-areas', value: subAreas },
    { label: 'scattered groups', value: scattered },
    { label: 'unknown-value points', value: unknown },
  ];
}
