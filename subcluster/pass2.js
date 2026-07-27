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
import { isUnimodal, UNIFORM_BC } from '../banding/modality.js';
import { deriveEps2 } from './eps2.js';
import { respatialiseBand, respatialiseBandHdbscan } from './respatialise.js';
import { weightedStats } from './stats.js';
import { regionalize } from '../region/regionalize.js';

/** Default pass-2 core threshold (spec leaves this open; resolved with the user). */
const DEFAULT_MIN2 = 4;

/** Default k-distance quantile for the derived `eps2` (0.5 = spec median). */
const DEFAULT_EPS2_PERCENTILE = 0.5;

/** HDBSCAN* candidate-edge cap, as a multiple of the derived `eps2`. */
const HDBSCAN_LINK_FACTOR = 4;

/** Default number of regions in regionalization mode. */
const DEFAULT_REGION_COUNT = 4;

/** Default bimodality-coefficient threshold for the (opt-in) modality guard. */
const DEFAULT_MODALITY_THRESHOLD = UNIFORM_BC;

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
 * @param {number} [input.options.eps2Percentile=0.5] quantile of the per-point
 *   k-distances used for the derived `eps2` (lower ⇒ tighter, less over-connection)
 * @param {'dbscan'|'hdbscan'} [input.options.respatialiseMethod='dbscan'] kernel used to
 *   respatialise each band: fixed-radius DBSCAN, or density-adaptive HDBSCAN*
 * @param {boolean} [input.options.modalityGuard=false] when true, a cluster whose values
 *   are smooth (bimodality coefficient ≤ threshold) is reported as one gradient unit
 *   instead of being banded (spec §7); off by default pending real-data validation
 * @param {number} [input.options.modalityThreshold=5/9] bimodality-coefficient cut-off
 *   for the guard (the uniform-distribution value)
 * @param {'bands'|'regions'} [input.options.mode='bands'] pass-2 method (see below)
 * @param {number} [input.options.regionCount=4] target regions when mode is 'regions'
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
  const eps2Percentile =
    options.eps2Percentile != null ? options.eps2Percentile : DEFAULT_EPS2_PERCENTILE;
  const respatialiseMethod = options.respatialiseMethod === 'hdbscan' ? 'hdbscan' : 'dbscan';
  const modalityGuard = options.modalityGuard === true;
  const modalityThreshold =
    options.modalityThreshold != null ? options.modalityThreshold : DEFAULT_MODALITY_THRESHOLD;
  const mode = options.mode === 'regions' ? 'regions' : 'bands';
  const regionCount = options.regionCount != null ? options.regionCount : DEFAULT_REGION_COUNT;
  const regionKnn = options.regionKnn != null ? options.regionKnn : undefined;
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
      eps2Percentile,
      respatialiseMethod,
      modalityGuard,
      modalityThreshold,
      mode,
      regionCount,
      regionKnn,
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
      mode,
      min2,
      eps2Rule: eps2OverrideKm != null ? 'override' : `q${eps2Percentile}-min2-nn`,
      eps2OverrideKm,
      eps2Percentile,
      respatialiseMethod,
      modalityGuard,
      modalityThreshold: modalityGuard ? modalityThreshold : null,
      regionCount: mode === 'regions' ? regionCount : null,
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
  const {
    px,
    py,
    ability,
    population,
    min2,
    eps2OverrideKm,
    eps2Percentile,
    respatialiseMethod,
    modalityGuard,
    modalityThreshold,
    mode,
    regionCount,
    regionKnn,
    banding,
  } = ctx;

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

  // Opt-in regionalization: contiguous value-homogeneous regions (fuses space + value).
  if (mode === 'regions') {
    return processRegions(parentClusterId, base, withData, {
      px,
      py,
      ability,
      population,
      regionCount,
      regionKnn,
    });
  }

  const values = Float64Array.from(withData, (m) => ability[m]);

  // Modality guard (opt-in, spec §7): a smooth distribution is one gradient, not bands.
  if (modalityGuard && isUnimodal(values, modalityThreshold)) {
    return {
      ...base,
      k: 1,
      method: 'single-unit',
      flag: 'unimodal',
      eps2Km: null,
      subAreas: [
        makeSubArea(
          parentClusterId,
          0,
          valueRange(withData, ability),
          false,
          withData,
          ability,
          population,
          1
        ),
      ],
    };
  }

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
      : deriveEps2({ px, py, members: withData, min2, percentile: eps2Percentile });
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
        respatialiseMethod,
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
 * Regionalize one cluster into contiguous, value-homogeneous regions (opt-in mode).
 * Each region becomes a sub-area; a homogeneous or tiny cluster stays a single unit.
 * @param {number} parentClusterId pass-1 cluster id
 * @param {object} base shared fields (parentClusterId, hasUnknown, unknown)
 * @param {number[]} withData with-data member indices
 * @param {object} ctx px, py, ability, population, regionCount, regionKnn
 * @returns {object} the cluster's pass-2 record with regions as sub-areas
 */
function processRegions(parentClusterId, base, withData, ctx) {
  const { px, py, ability, population, regionCount, regionKnn } = ctx;
  const [mn, mx] = valueRange(withData, ability);

  // Homogeneous or too-small cluster: one region (no fabricated splits).
  if (withData.length < 2 || mx - mn <= 0) {
    return {
      ...base,
      k: 1,
      method: 'regions',
      flag: mx - mn <= 0 ? 'homogeneous' : null,
      eps2Km: null,
      subAreas: [regionSubArea(parentClusterId, 1, withData, ability, population)],
    };
  }

  const regionLabels = regionalize({
    px,
    py,
    values: ability,
    members: withData,
    targetRegions: regionCount,
    knn: regionKnn,
  });
  const groups = new Map();
  for (let i = 0; i < withData.length; i++) {
    const r = regionLabels[i];
    let g = groups.get(r);
    if (!g) {
      g = [];
      groups.set(r, g);
    }
    g.push(withData[i]);
  }
  const subAreas = [...groups.keys()]
    .sort((a, b) => a - b)
    .map((r) => regionSubArea(parentClusterId, r, groups.get(r), ability, population));
  return { ...base, k: subAreas.length, method: 'regions', flag: null, eps2Km: null, subAreas };
}

/**
 * Build one region sub-area record (same shape as a band sub-area, so output/render
 * treat it identically). `band` carries the region index for colouring only.
 * @param {number} parentClusterId pass-1 cluster id
 * @param {number} regionId region id counting from 1
 * @param {number[]} members region member indices
 * @param {Array<number|null>|Float64Array} ability value per point
 * @param {Array<number|null>|Float64Array} population population per point
 * @returns {object} sub-area record
 */
function regionSubArea(parentClusterId, regionId, members, ability, population) {
  return {
    subAreaId: `${parentClusterId}-r${regionId}`,
    band: regionId - 1,
    bandValueRange: valueRange(members, ability),
    scattered: false,
    ...weightedStats(members, ability, population),
    memberIndices: members,
  };
}

/**
 * [min, max] of the finite values over a set of members.
 * @param {number[]} members member indices
 * @param {Array<number|null>|Float64Array} values value per point
 * @returns {[number, number]} the range
 */
function valueRange(members, values) {
  let mn = Infinity;
  let mx = -Infinity;
  for (const m of members) {
    const v = values[m];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return [mn, mx];
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
  const { px, py, ability, population, eps2m, min2, respatialiseMethod } = ctx;
  const localLabels =
    respatialiseMethod === 'hdbscan'
      ? respatialiseBandHdbscan({
          px,
          py,
          members: bandMembers,
          minClusterSize: min2,
          minSamples: min2,
          maxLinkM: eps2m * HDBSCAN_LINK_FACTOR,
        })
      : respatialiseBand({ px, py, members: bandMembers, eps2m, min2 });

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
