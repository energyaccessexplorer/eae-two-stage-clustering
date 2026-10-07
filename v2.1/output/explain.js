/**
 * output/explain.js — a plain-language explanation of one run (spec §6.6).
 *
 * For users who do not know how clustering works. Three parts (clusters, sub-areas,
 * last-mile), each a fixed general paragraph followed by sentences built from the
 * run's own settings and numbers. Pure: it reads results and settings and uses the
 * existing index and statistics primitives; it never re-runs any clustering.
 */

import { GridIndex } from '../geo/grid-index.js';
import { weightedStats } from '../subcluster/stats.js';
import { NOISE } from '../cluster/labels.js';

/** Why pass 2 kept a cluster whole, in plain words (keyed by the pass-2 flag). */
const WHOLE_REASONS = {
  'insufficient-points': 'there were too few places with a wealth value to split',
  homogeneous: 'their wealth values were all the same',
  unimodal: 'their wealth values were spread smoothly, with no distinct groups',
  'all-unknown': 'no place had a wealth value',
};

const count = (n) => n.toLocaleString('en-US');
const pct = (share) => `${Math.round(share * 100)}%`;
const km = (x) => (x < 10 ? x.toFixed(2) : x.toFixed(1));

/**
 * Facts about the last-mile places (pass-1 noise) of a run.
 *
 * @param {object} args
 * @param {Float64Array} args.px x coordinates in **metres** (projected), one per point
 * @param {Float64Array} args.py y coordinates in metres
 * @param {Int32Array} args.labels pass-1 label per point (cluster id; NOISE = last-mile;
 *   other negatives, such as filtered points, belong to neither group)
 * @param {string[]} args.sources the loaded layer each point came from
 * @param {number} args.groupingKm the distance that formed clusters (eps1 or max_link), km
 * @param {Array<number|null>|null} args.population population per point, or null when no
 *   population map is loaded
 * @param {Array<number|null>|null} args.ability ability to pay per point, or null
 * @returns {{ count: number, share: number, nearestKm: { median: number, p90: number }|null,
 *   nearMissShare: number|null, byLayer: Array<{ layer: string, count: number }>,
 *   people: { lastMile: object, clustered: object }|null }} `share` is of all points;
 *   `nearestKm` is the distance from each last-mile place to the nearest clustered place
 *   (null when there are no clusters or no last-mile places); `nearMissShare` is the
 *   share of last-mile places within 2 × `groupingKm` of a cluster; `people` holds
 *   {@link weightedStats} for both groups when population is known
 * @determinism Pure function of its arguments; nearest distances are index-backed.
 */
export function lastMileFacts({ px, py, labels, sources, groupingKm, population, ability }) {
  const lastMile = [];
  const clustered = [];
  labels.forEach((label, i) => {
    if (label === NOISE) lastMile.push(i);
    else if (label >= 0) clustered.push(i);
  });

  let nearestKm = null;
  let nearMissShare = null;
  if (lastMile.length && clustered.length) {
    const cx = Float64Array.from(clustered, (i) => px[i]);
    const cy = Float64Array.from(clustered, (i) => py[i]);
    const index = new GridIndex(cx, cy, groupingKm * 1000);
    const dists = lastMile
      .map((i) => {
        const j = index.nearest(px[i], py[i]);
        return Math.hypot(cx[j] - px[i], cy[j] - py[i]) / 1000;
      })
      .sort((a, b) => a - b);
    const rank = (q) => dists[Math.min(dists.length - 1, Math.ceil(q * dists.length) - 1)];
    nearestKm = { median: rank(0.5), p90: rank(0.9) };
    nearMissShare = dists.filter((d) => d <= 2 * groupingKm).length / dists.length;
  }

  const perLayer = new Map();
  for (const i of lastMile) perLayer.set(sources[i], (perLayer.get(sources[i]) || 0) + 1);
  const byLayer = [...perLayer]
    .map(([layer, n]) => ({ layer, count: n }))
    .sort((a, b) => b.count - a.count || a.layer.localeCompare(b.layer));

  const noAbility = labels.length ? Array.from(labels, () => null) : [];
  const people = population
    ? {
        lastMile: weightedStats(lastMile, ability || noAbility, population),
        clustered: weightedStats(clustered, ability || noAbility, population),
      }
    : null;

  return {
    count: lastMile.length,
    share: labels.length ? lastMile.length / labels.length : 0,
    nearestKm,
    nearMissShare,
    byLayer,
    people,
  };
}

/**
 * The explanation as titled sections of plain-language paragraphs.
 *
 * @param {object} args
 * @param {Record<string, *>} args.params parameter values at run time (config/parameters.js keys)
 * @param {Record<string, string>} args.sources each parameter's source
 * @param {{ kneeKm: number, steps: number, largestShare: number, stoppedBy: string }|null}
 *   args.suggestion the dominance-guard outcome, or null
 * @param {{ clusters: Array<{ size: number }>, filtered_ids: Array }} args.result pass-1 result
 * @param {number} args.pointCount number of input points
 * @param {object|null} args.pass2 the pass-2 result, or null when pass 2 did not run
 * @param {boolean} args.abilityLoaded whether a wealth (ability-to-pay) map was loaded
 * @param {ReturnType<typeof lastMileFacts>} args.lastMile last-mile facts
 * @returns {Array<{ title: string, paragraphs: string[] }>} the three parts, in order
 * @determinism Pure function of its arguments.
 */
export function explainRun(args) {
  return [clusterSection(args), subAreaSection(args), lastMileSection(args)];
}

/**
 * The explanation as plain text, for download.
 * @param {Array<{ title: string, paragraphs: string[] }>} sections from {@link explainRun}
 * @param {{ timestamp: string, toolVersion: string }} run identifies the run
 * @returns {string} plain text, sections separated by blank lines
 */
export function explanationText(sections, { timestamp, toolVersion }) {
  const head = `EAE clustering: about this result\nRun ${timestamp}, tool ${toolVersion}\n`;
  const body = sections.map(
    (s) => `${s.title}\n${'-'.repeat(s.title.length)}\n${s.paragraphs.join('\n\n')}\n`
  );
  return [head, ...body].join('\n');
}

/** The distance that formed clusters, in km, with its parameter key. */
function grouping(params) {
  const key = params.algorithm === 'dbscan' ? 'eps_km' : 'max_link_km';
  return { key, km: params[key] };
}

function clusterSection({ params, sources, suggestion, result, pointCount }) {
  const { key, km: dist } = grouping(params);
  const paragraphs = [
    'Clustering groups places that sit close together. The tool looks at each place and ' +
      'its neighbours; where enough places lie near each other, they form a cluster. ' +
      'Places without enough neighbours nearby are not forced into a cluster: they become ' +
      'last-mile places.',
    params.algorithm === 'dbscan'
      ? `This run used DBSCAN. A place with at least ${params.min_pts} places (counting ` +
        `itself) within ${km(dist)} km starts a cluster, and every place within ${km(dist)} km ` +
        'of such a place joins it.'
      : 'This run used HDBSCAN, which finds groups of different densities without one fixed ' +
        `distance. A group must hold at least ${params.min_cluster_size} places to count as ` +
        `a cluster, and places are never linked across more than ${km(dist)} km.`,
    distanceSource(sources[key], dist, suggestion),
  ];
  if (params.cluster_weight) {
    paragraphs.push(
      'Population weighting was on, so a place in a busy area counts for more than one in ' +
        'an empty area when deciding whether enough places are nearby.'
    );
  }
  paragraphs.push(clusterCounts(result, pointCount));
  return { title: 'How the clusters formed', paragraphs };
}

function distanceSource(source, dist, suggestion) {
  if (source === 'user') return `You set this distance to ${km(dist)} km.`;
  if (source !== 'suggested' || !suggestion) {
    return `The ${km(dist)} km distance is the standard default.`;
  }
  const lead =
    suggestion.steps === 0
      ? `The ${km(dist)} km distance was suggested from the typical spacing of your places.`
      : `The typical spacing of your places pointed to ${km(suggestion.kneeKm)} km, but at ` +
        'that distance one group would have taken in more than half of all places, so it ' +
        `was reduced in ${suggestion.steps} ${suggestion.steps === 1 ? 'step' : 'steps'} to ` +
        `${km(dist)} km.`;
  return suggestion.stoppedBy === 'ok'
    ? lead
    : `${lead} One group still holds ${pct(suggestion.largestShare)} of places; this may be ` +
        'genuine (for example, many places in one city).';
}

function clusterCounts(result, pointCount) {
  const sizes = result.clusters.map((c) => c.size).sort((a, b) => a - b);
  const filtered = result.filtered_ids.length
    ? ` ${count(result.filtered_ids.length)} places were excluded by your filters first.`
    : '';
  if (!sizes.length) {
    return `No clusters formed: no place had enough neighbours close enough.${filtered}`;
  }
  const inClusters = sizes.reduce((a, b) => a + b, 0);
  const median = sizes[Math.ceil(sizes.length / 2) - 1];
  return (
    `${count(sizes.length)} clusters formed, holding ${count(inClusters)} of ` +
    `${count(pointCount)} places (${pct(inClusters / pointCount)}). The largest has ` +
    `${count(sizes[sizes.length - 1])} places and the smallest ${count(sizes[0])}; half the ` +
    `clusters have ${count(median)} places or fewer.${filtered}`
  );
}

function subAreaSection({ params, pass2, abilityLoaded }) {
  const title = 'How sub-areas split the clusters';
  const general =
    params.pass2_method === 'regions'
      ? 'Inside each cluster, the tool divides the places into a few connected areas of ' +
        `similar wealth (about ${params.pass2_region_count} per cluster).`
      : 'Inside each cluster, the tool looks at the wealth (socio-economic) value of each ' +
        `place, sorts the places into up to ${params.pass2_bands} bands from lowest to ` +
        "highest using that cluster's own values, and then groups nearby places of the same " +
        'band into sub-areas.';
  if (!pass2) {
    return { title, paragraphs: [general, 'No sub-areas were made: they need a population map.'] };
  }
  if (!abilityLoaded) {
    return {
      title,
      paragraphs: [
        general,
        'No wealth map was loaded, so every place in a cluster is "unknown" and no sub-areas ' +
          'were made. Load a socio-economic map to split the clusters.',
      ],
    };
  }

  let subAreas = 0;
  let scattered = 0;
  let unknown = 0;
  const whole = new Map();
  for (const cluster of pass2.clusters) {
    for (const sub of cluster.subAreas) {
      if (sub.scattered) scattered++;
      else subAreas++;
    }
    if (cluster.unknown) unknown += cluster.unknown.count;
    if (cluster.k <= 1 && WHOLE_REASONS[cluster.flag]) {
      whole.set(cluster.flag, (whole.get(cluster.flag) || 0) + 1);
    }
  }
  const paragraphs = [
    general,
    `This run found ${count(subAreas)} sub-areas. ` +
      (scattered
        ? `${count(scattered)} groups of places were in a band but too spread out to form a ` +
          'tidy sub-area ("scattered"). '
        : '') +
      (unknown
        ? `${count(unknown)} places had no wealth value ("unknown") and were not given a band.`
        : 'Every place in a cluster had a wealth value.'),
  ];
  if (whole.size) {
    const reasons = [...whole].map(([flag, n]) => `${count(n)} because ${WHOLE_REASONS[flag]}`);
    paragraphs.push(`Some clusters were kept whole: ${reasons.join('; ')}.`);
  }
  paragraphs.push(
    "Band numbers are not comparable between clusters: each cluster's bands come from its " +
      "own values, so the lowest band of a city cluster can be richer than another cluster's " +
      'highest. To compare places across the map, colour sub-areas by absolute value.'
  );
  return { title, paragraphs };
}

function lastMileSection({ params, lastMile }) {
  const title = 'Last-mile places';
  const general =
    'Last-mile places did not join any cluster because too few other places are close to ' +
    'them. They are kept on purpose: they are often the places that are hardest to reach.';
  if (lastMile.count === 0) {
    return { title, paragraphs: [general, 'Every place joined a cluster in this run.'] };
  }
  const { km: dist } = grouping(params);
  const reason =
    params.algorithm === 'dbscan'
      ? `fewer than ${params.min_pts} places (counting themselves) lie within ${km(dist)} km of ` +
        `them, and they are not within ${km(dist)} km of a place that has that many.`
      : 'they sit in areas too sparse to form a group of at least ' +
        `${params.min_cluster_size} places linked at up to ${km(dist)} km.`;
  const paragraphs = [
    general,
    `${count(lastMile.count)} places (${pct(lastMile.share)}) are last-mile: ${reason}`,
  ];
  if (lastMile.nearestKm) {
    paragraphs.push(
      `Half of them are within ${km(lastMile.nearestKm.median)} km of the nearest clustered ` +
        `place, and 90% within ${km(lastMile.nearestKm.p90)} km. ${pct(lastMile.nearMissShare)} ` +
        `are within ${km(2 * dist)} km (twice the grouping distance): these are near misses ` +
        'that a slightly larger distance would absorb. The rest are genuinely remote.'
    );
  }
  paragraphs.push(
    'By layer: ' + lastMile.byLayer.map((l) => `${l.layer} ${count(l.count)}`).join(', ') + '.'
  );
  if (lastMile.people) {
    const { lastMile: lm, clustered: cl } = lastMile.people;
    let text =
      `The population map shows about ${count(Math.round(lm.population))} people in the ` +
      'cells where last-mile places sit.';
    if (lm.meanAbilityToPay != null && cl.meanAbilityToPay != null) {
      text +=
        ` Their average wealth value is ${lm.meanAbilityToPay.toFixed(2)}, compared with ` +
        `${cl.meanAbilityToPay.toFixed(2)} for places in clusters (both weighted by population).`;
    }
    paragraphs.push(text);
  }
  paragraphs.push('Last-mile places are a result to act on, not an error in the data.');
  return { title, paragraphs };
}
