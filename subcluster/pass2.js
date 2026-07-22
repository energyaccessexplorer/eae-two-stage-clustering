/**
 * subcluster/pass2.js — pass-2 orchestrator (spec §5 steps 3–10).
 *
 * Turns each pass-1 cluster into banded, respatialised sub-areas with
 * population-weighted statistics, and carries pass-1 noise through as the last-mile
 * layer. Consumes index-aligned arrays only — no dependency on pass-1 internals, no
 * geometry building (that is the output/ stage) — so the maths stays pure and
 * testable. Geography and ability-to-pay enter through separate steps (banding then
 * respatialisation) and are never fused (spec §8).
 */

import { NOISE } from '../cluster/labels.js';
import { assignBands } from '../banding/bands.js';
import { deriveEps2 } from './eps2.js';
import { respatialiseBand } from './respatialise.js';
import { weightedStats } from './stats.js';

/** Default pass-2 core threshold (spec leaves this open; resolved with the user). */
const DEFAULT_MIN2 = 4;

/**
 * Run pass 2 over a clustered point set.
 *
 * Every array is index-aligned and the same length `N`; index `i` refers to the same
 * point across all of them. Coordinates are the pass-1 projection reused verbatim
 * (metres, never degrees). Ability-to-pay is a unitless ratio; population is a count.
 *
 * @param {object} input
 * @param {Float64Array} input.px x coordinates in metres
 * @param {Float64Array} input.py y coordinates in metres
 * @param {Int32Array|number[]} input.labels pass-1 label per point: a cluster id >= 1,
 *   NOISE (-1) → last-mile, or any other sentinel (e.g. FILTERED) → ignored
 * @param {Array<number|null>|Float64Array} input.ability ability-to-pay **ratio** per
 *   point; a non-finite entry (null/NaN) marks a with-no-data point (spec §3.6)
 * @param {Array<number|null>|Float64Array} input.population population **count** per
 *   point; a non-finite entry marks a point with no population (spec §3.4)
 * @param {object} [input.options]
 * @param {number} [input.options.min2=4] pass-2 DBSCAN core threshold
 * @param {number} [input.options.eps2OverrideKm] expert-mode fixed `eps2` in km; when
 *   set, replaces the derived per-cluster value for every cluster
 * @param {object} [input.options.banding] overrides forwarded to {@link assignBands}
 * @returns {{
 *   clusters: Array<object>,
 *   lastMile: { count: number, memberIndices: number[] },
 *   params: { min2: number, eps2Rule: string, eps2OverrideKm: number|null, banding: object }
 * }} Per-cluster sub-areas (see {@link makeSubArea}), the unknown group per cluster,
 *   and the last-mile layer. Point indices are indices into the input arrays.
 * @throws {Error} if the input arrays differ in length
 * @determinism Same inputs and options ⇒ identical output, including cluster order
 *   (ascending parent id), sub-area order, and ids; independent of point order.
 */
export function runPass2(input) {
  const { px, py, labels, ability, population } = input;
  const options = input.options || {};
  const n = labels.length;
  if (px.length !== n || py.length !== n || ability.length !== n || population.length !== n) {
    throw new Error('runPass2: px, py, labels, ability, and population must be the same length');
  }
  const min2 = options.min2 != null ? options.min2 : DEFAULT_MIN2;
  const eps2OverrideKm = options.eps2OverrideKm != null ? options.eps2OverrideKm : null;
  const banding = options.banding || {};

  // Group clustered points by parent id; collect pass-1 noise as the last-mile layer.
  const byCluster = new Map();
  const lastMile = [];
  for (let i = 0; i < n; i++) {
    const label = labels[i];
    if (label === NOISE) {
      lastMile.push(i);
    } else if (label >= 1) {
      let members = byCluster.get(label);
      if (!members) {
        members = [];
        byCluster.set(label, members);
      }
      members.push(i);
    }
  }

  const clusterIds = [...byCluster.keys()].sort((a, b) => a - b);
  const clusters = clusterIds.map((id) =>
    processCluster(id, byCluster.get(id), {
      px,
      py,
      ability,
      population,
      min2,
      eps2OverrideKm,
      banding,
    })
  );

  return {
    clusters,
    lastMile: {
      count: lastMile.length,
      memberIndices: lastMile,
      ...weightedStats(lastMile, ability, population),
    },
    params: {
      min2,
      eps2Rule: eps2OverrideKm != null ? 'override' : 'median-min2-nn',
      eps2OverrideKm,
      banding,
    },
  };
}

/**
 * Band and respatialise a single parent cluster.
 * @param {number} parentClusterId pass-1 cluster id
 * @param {number[]} members point indices belonging to the cluster
 * @param {object} ctx shared arrays and resolved parameters
 * @returns {object} the cluster's pass-2 record (see the return of {@link runPass2})
 */
function processCluster(parentClusterId, members, ctx) {
  const { px, py, ability, population, min2, eps2OverrideKm, banding } = ctx;

  const withData = [];
  const noData = [];
  for (const m of members) {
    if (Number.isFinite(ability[m])) withData.push(m);
    else noData.push(m);
  }
  const hasUnknown = noData.length > 0;
  const unknown = hasUnknown
    ? { count: noData.length, memberIndices: noData, ...weightedStats(noData, ability, population) }
    : null;

  const base = { parentClusterId, hasUnknown, unknown };

  // Whole cluster is unmeasured: no bands, no sub-areas — only the unknown group.
  if (withData.length === 0) {
    return { ...base, k: 0, method: 'none', flag: 'all-unknown', eps2Km: null, subAreas: [] };
  }

  const values = Float64Array.from(withData, (m) => ability[m]);
  const banded = assignBands(values, banding);

  // Variance guard or insufficient points: report the cluster as one unit (spec step 5).
  if (banded.k === 1) {
    const sub = makeSubArea(
      parentClusterId,
      0,
      banded.ranges[0],
      false,
      withData,
      ability,
      population,
      1
    );
    return {
      ...base,
      k: 1,
      method: banded.method,
      flag: banded.flag,
      eps2Km: null,
      subAreas: [sub],
    };
  }

  const eps2m =
    eps2OverrideKm != null
      ? eps2OverrideKm * 1000
      : deriveEps2({ px, py, members: withData, min2 });
  const canSplit = eps2m != null && eps2m > 0;

  const subAreas = [];
  for (let b = 0; b < banded.k; b++) {
    const bandMembers = [];
    for (let i = 0; i < withData.length; i++) {
      if (banded.bandOf[i] === b) bandMembers.push(withData[i]);
    }
    if (canSplit) {
      splitBand(subAreas, parentClusterId, b, banded.ranges[b], bandMembers, {
        px,
        py,
        ability,
        population,
        eps2m,
        min2,
      });
    } else {
      // No usable eps2 (too few with-data points): the band is one sub-area, unsplit.
      subAreas.push(
        makeSubArea(
          parentClusterId,
          b,
          banded.ranges[b],
          false,
          bandMembers,
          ability,
          population,
          1
        )
      );
    }
  }

  return {
    ...base,
    k: banded.k,
    method: banded.method,
    flag: banded.flag,
    eps2Km: canSplit ? eps2m / 1000 : null,
    subAreas,
  };
}

/**
 * Respatialise one band's members and append its sub-areas (contiguous + scattered).
 * @param {object[]} subAreas output list to append to
 * @param {number} parentClusterId pass-1 cluster id
 * @param {number} band band index
 * @param {[number, number]} range band value range from banding
 * @param {number[]} bandMembers point indices in this band
 * @param {object} ctx arrays, `eps2m` (metres), and `min2`
 */
function splitBand(subAreas, parentClusterId, band, range, bandMembers, ctx) {
  const { px, py, ability, population, eps2m, min2 } = ctx;
  const localLabels = respatialiseBand({ px, py, members: bandMembers, eps2m, min2 });

  const groups = new Map();
  const scattered = [];
  for (let i = 0; i < bandMembers.length; i++) {
    const label = localLabels[i];
    if (label === NOISE) {
      scattered.push(bandMembers[i]);
    } else {
      let g = groups.get(label);
      if (!g) {
        g = [];
        groups.set(label, g);
      }
      g.push(bandMembers[i]);
    }
  }

  let s = 0;
  for (const label of [...groups.keys()].sort((a, b) => a - b)) {
    s++;
    subAreas.push(
      makeSubArea(parentClusterId, band, range, false, groups.get(label), ability, population, s)
    );
  }
  // Within-band DBSCAN noise is never dropped: it becomes one flagged sub-area (spec §8).
  if (scattered.length) {
    subAreas.push(
      makeSubArea(parentClusterId, band, range, true, scattered, ability, population, null)
    );
  }
}

/**
 * Build one sub-area record, attaching its {@link weightedStats}.
 *
 * @param {number} parentClusterId pass-1 cluster id
 * @param {number} band band index
 * @param {[number, number]} range band value range [min, max]
 * @param {boolean} scattered whether these are the band's non-contiguous noise points
 * @param {number[]} members point indices in this sub-area
 * @param {Array<number|null>|Float64Array} ability ability-to-pay ratio per point
 * @param {Array<number|null>|Float64Array} population population count per point
 * @param {number|null} seq sub-area sequence within the band (null for the scattered one)
 * @returns {{ subAreaId: string, band: number, bandValueRange: [number, number],
 *   scattered: boolean, population: number, meanAbilityToPay: number|null,
 *   missingPopCount: number, memberIndices: number[] }}
 */
function makeSubArea(parentClusterId, band, range, scattered, members, ability, population, seq) {
  const subAreaId = scattered
    ? `${parentClusterId}-b${band}-scattered`
    : `${parentClusterId}-b${band}-s${seq}`;
  return {
    subAreaId,
    band,
    bandValueRange: [range[0], range[1]],
    scattered,
    ...weightedStats(members, ability, population),
    memberIndices: members,
  };
}
