/**
 * cluster/features.js — pass-1 orchestrator: filter, project, weight, cluster, report.
 * Extracted from the original single-file tool. The clustering maths is unchanged and
 * held to that by the golden-master regression (test/pass1.regression.test.js); the
 * stages were split into named helpers, the two population indices merged into one,
 * and unenforceable population floors are now reported instead of silently dropped.
 */

import { RasterField } from '../io/raster-field.js';
import { build_weight } from '../io/weight.js';
import { make_projector } from '../geo/projector.js';
import { GridIndex } from '../geo/grid-index.js';
import { run_dbscan } from './dbscan.js';
import { run_hdbscan } from './hdbscan.js';
import { NOISE, FILTERED, UNVISITED } from './labels.js';

/**
 * Bin size in metres for the index used to attach raster population to points.
 * A speed/memory knob for `GridIndex.nearest` only — it bounds no search and caps
 * no distance, so changing it cannot change which points get which population.
 */
const ALLOCATION_INDEX_CELL_M = 5000;

/**
 * Apply the raster filters, and count points that fell outside each raster.
 *
 * A point over nodata reads as 0, which is how the original tool behaved and is
 * safe for population rasters (every pixel carries a value, possibly zero). A point
 * outside the raster's extent reads as 0 too, but that means the inputs do not line
 * up geographically, so it is counted and reported rather than passed over.
 *
 * @param {Array<{lon: number, lat: number}>} points EPSG:4326
 * @param {Array<{raster: string, op: string, value: number}>} filters_cfg `op` is
 *   `'<='`, or `'>='` for anything else
 * @param {(name: string) => RasterField} need raster lookup that throws if absent
 * @returns {{keep: boolean[], outside: Record<string, number>}} per-point survival, and
 *   points-outside-extent counted per raster (absent when zero)
 */
function applyFilters(points, filters_cfg, need) {
  const keep = new Array(points.length).fill(true);
  const outside = {};
  for (const f of filters_cfg) {
    const field = need(f.raster);
    for (let i = 0; i < points.length; i++) {
      if (!keep[i]) continue;
      const { lon, lat } = points[i];
      const val = field.sample(lon, lat);
      if (val == null && !field.covers(lon, lat)) outside[f.raster] = (outside[f.raster] || 0) + 1;
      const v = val == null ? 0 : val;
      const ok = f.op === '<=' ? v <= f.value : v >= f.value;
      if (!ok) keep[i] = false;
    }
  }
  return { keep, outside };
}

/**
 * Build the continuous clustering weight (sample weight) from a population raster.
 *
 * Population is normalised to mean 1 then floored, so `min_pts` / `min_cluster_size`
 * / `min_samples` stay in "effective average-population points" whatever the absolute
 * population scale. With no weight raster every point weighs 1, which reproduces the
 * unweighted algorithms exactly.
 *
 * @param {object} opts the `cluster_features` options
 * @param {Array} kept points that survived filtering
 * @param {(lon: number, lat: number) => [number, number]} project degrees -> metres
 * @param {GridIndex} alloc_idx index over the projected kept points
 * @param {(name: string) => RasterField} need raster lookup that throws if absent
 * @param {Array<{raster: string}>} weights_cfg reporting weights, checked to avoid
 *   reporting the same raster twice
 * Layer weights (spec §3.11) multiply in after population weighting; the product is
 * renormalised to mean 1 and floored. When every layer weight is 1 that step is
 * skipped, so results are identical to running without layer weights.
 *
 * @returns {{cw: Float64Array, weighting: {requested: boolean, applied: boolean, layers?: true},
 *   cw_report: {name: string, values: Float64Array}|null}} normalised weights, whether
 *   weighting took effect, and the un-normalised population for reporting
 */
function buildClusterWeight(opts, kept, project, alloc_idx, need, weights_cfg) {
  const n = kept.length;
  const cw = new Float64Array(n);
  cw.fill(1);
  const layer = layerMultipliers(opts.layer_weights, kept);
  // `layers` is present only when layer weights apply, so default output is unchanged.
  const weighting = { requested: !!opts.cluster_weight, applied: false };
  if (layer) weighting.layers = true;
  const floor = opts.weight_floor != null ? opts.weight_floor : 0.1;
  let cw_report = null;

  if (opts.cluster_weight) {
    const raw = build_weight(
      need(opts.cluster_weight),
      kept,
      project,
      alloc_idx,
      opts.cluster_weight_alloc || 'allocate'
    );
    let wsum = 0;
    for (let i = 0; i < n; i++) wsum += raw[i];
    if (wsum > 0) {
      const mean = wsum / n;
      for (let i = 0; i < n; i++) cw[i] = raw[i] / mean;
      weighting.applied = true;
      // Expose the actual allocated population as a reporting total, unless the user
      // already added a weight row for this raster (which would duplicate the column).
      const duplicated = weights_cfg.some((wc) => wc.raster === opts.cluster_weight);
      cw_report = duplicated ? null : { name: opts.cluster_weight, values: raw };
    }
  }

  if (layer) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += cw[i] *= layer[i];
    const mean = sum / n;
    for (let i = 0; i < n; i++) cw[i] /= mean;
  }
  if (weighting.applied || layer) for (let i = 0; i < n; i++) cw[i] = Math.max(cw[i], floor);
  return { cw, weighting, cw_report };
}

/**
 * Per-point layer multipliers (spec §3.11).
 * @param {Record<string, number>|undefined} layerWeights weight per layer (point `source`)
 * @param {Array<{source: string}>} kept points that survived filtering
 * @returns {Float64Array|null} one multiplier per point, or null when every weight is 1
 *   (so callers skip the step and results stay identical)
 * @throws {Error} when a weight is not a finite number greater than 0
 */
function layerMultipliers(layerWeights, kept) {
  if (!layerWeights) return null;
  for (const [layer, w] of Object.entries(layerWeights)) {
    if (!(Number.isFinite(w) && w > 0)) {
      throw new Error(`layer weight for "${layer}" must be a number greater than 0`);
    }
  }
  if (Object.values(layerWeights).every((w) => w === 1)) return null;
  return Float64Array.from(kept, (p) => layerWeights[p.source] ?? 1);
}

/**
 * Work out which minimum-population floors can actually be enforced.
 *
 * A floor is only meaningful on the DBSCAN path and only when the weight row carries
 * a finite `min_pop`. Rows that fail either test used to be compared against
 * `undefined`, which is always false, so a floor the user asked for quietly went
 * unapplied. They are now named in `skipped` so the caller can say so.
 *
 * @param {boolean} requested the caller's `weighted` flag
 * @param {string} algorithm `'dbscan'` or `'hdbscan'`
 * @param {Array<{name: string, min_pop: number|undefined}>} weight_arrays reporting weights
 * @returns {{floors: {requested: boolean, applied: boolean, skipped: string[]},
 *   enforced: Array}} the report, and the rows whose floors will be applied
 */
function resolveFloors(requested, algorithm, weight_arrays) {
  const floors = { requested, applied: false, skipped: [] };
  if (!requested) return { floors, enforced: [] };
  if (algorithm === 'hdbscan') {
    // HDBSCAN* decides membership by mass, with no per-neighbourhood floor to hang
    // a min_pop on; report the request as unmet rather than pretending otherwise.
    floors.skipped = weight_arrays.map((wa) => wa.name);
    return { floors, enforced: [] };
  }
  const enforced = [];
  for (const wa of weight_arrays) {
    if (Number.isFinite(wa.min_pop)) enforced.push(wa);
    else floors.skipped.push(wa.name);
  }
  floors.applied = enforced.length > 0;
  return { floors, enforced };
}

/**
 * Group labelled points into clusters and total their weights.
 *
 * @param {Int32Array} labels per-kept-point labels from the clustering algorithm
 * @param {Array} kept points that survived filtering
 * @param {number[]} kept_orig index of each kept point in the original point array
 * @param {Int32Array} labels_out per-original-point labels, written in place
 * @param {Array<{name: string, values: Float64Array}>} report_arrays weights to total
 * @param {string|null} rank_by weight name to sort clusters by, descending
 * @returns {{clusters: Array, noise_ids: Array}} clusters with totals and centroid,
 *   and the ids of points that reached no cluster
 * @remarks Deterministic: clusters come out in first-seen label order, or by `rank_by`.
 */
function summariseClusters(labels, kept, kept_orig, labels_out, report_arrays, rank_by) {
  const groups = new Map(),
    noise_ids = [];
  for (let i = 0; i < labels.length; i++) {
    const lab = labels[i];
    labels_out[kept_orig[i]] = lab;
    if (lab === NOISE) {
      noise_ids.push(kept[i].id);
      continue;
    }
    let g = groups.get(lab);
    if (!g) {
      g = [];
      groups.set(lab, g);
    }
    g.push(i);
  }
  const clusters = [];
  for (const [id, members] of groups) {
    const totals = {};
    for (const wa of report_arrays) {
      let t = 0;
      for (const i of members) t += wa.values[i];
      totals[wa.name] = t;
    }
    let slon = 0,
      slat = 0;
    for (const i of members) {
      slon += kept[i].lon;
      slat += kept[i].lat;
    }
    clusters.push({
      id,
      size: members.length,
      member_ids: members.map((i) => kept[i].id),
      totals,
      centroid: { lon: slon / members.length, lat: slat / members.length },
    });
  }
  if (rank_by) clusters.sort((a, b) => (b.totals[rank_by] || 0) - (a.totals[rank_by] || 0));
  return { clusters, noise_ids };
}

/**
 * Run pass-1 clustering over a set of points.
 *
 * Points arrive in EPSG:4326 and are projected to metres before any distance is
 * taken — every radius in the options is in kilometres, never degrees. Neighbour
 * queries go through a grid index, so no full distance matrix is ever built.
 *
 * @param {object} opts
 * @param {Array<{id: string, lon: number, lat: number}>} opts.points EPSG:4326; required
 * @param {string} [opts.algorithm='dbscan'] `'dbscan'` or `'hdbscan'`
 * @param {Record<string, object>} [opts.rasters] raster defs by name (see RasterField)
 * @param {number} [opts.eps_km] DBSCAN neighbourhood radius in km; required for DBSCAN
 * @param {number} [opts.min_pts] DBSCAN core threshold, in points or effective
 *   average-population points when weighting applies; required for DBSCAN
 * @param {number} [opts.min_cluster_size=5] HDBSCAN minimum cluster mass
 * @param {number} [opts.min_samples] HDBSCAN core mass, defaults to min_cluster_size
 * @param {number} [opts.max_link_km=10] HDBSCAN maximum edge length in km
 * @param {string} [opts.cluster_weight] raster name whose population weights the clustering
 * @param {string} [opts.cluster_weight_alloc='allocate'] `'allocate'` or `'sample'`
 * @param {number} [opts.weight_floor=0.1] lower bound on a normalised point weight
 * @param {Record<string, number>} [opts.layer_weights] weight per point layer (`source`),
 *   each > 0, default 1; multiplies the clustering weight (spec §3.11)
 * @param {Array<{raster: string, allocation?: string, min_pop?: number}>} [opts.weights]
 *   rasters to total per cluster; `min_pop` is a DBSCAN core floor, applied only when
 *   `weighted` is set
 * @param {boolean} [opts.weighted] enforce the `min_pop` floors
 * @param {Array<{raster: string, op: string, value: number}>} [opts.filters] pre-clustering
 *   filters
 * @param {string|null} [opts.rank_by] weight name to sort clusters by, descending
 * @returns {{algorithm: string, labels: Int32Array, clusters: Array, noise_ids: Array,
 *   weighting: object, floors: object, points_outside_raster: Record<string, number>,
 *   filtered_ids: Array}} `labels` is per input point: FILTERED (-2), NOISE (-1), or a
 *   cluster id from 1. The shape is the same whether or not any point survived filtering.
 * @throws {Error} if no points are supplied, a named raster is missing, or the DBSCAN
 *   radius / core threshold is absent or out of range
 * @remarks Deterministic: identical input yields identical labels and cluster order.
 */
export function cluster_features(opts) {
  const points = opts.points || [],
    algorithm = opts.algorithm || 'dbscan';
  const raster_defs = opts.rasters || {},
    weights_cfg = opts.weights || [],
    filters_cfg = opts.filters || [],
    rank_by = opts.rank_by || null;
  if (!points.length) throw new Error('no points supplied');
  const fields = {};
  for (const name in raster_defs) fields[name] = new RasterField(raster_defs[name]);
  const need = (name) => {
    if (!fields[name]) throw new Error(`raster '${name}' not provided`);
    return fields[name];
  };

  const { keep, outside } = applyFilters(points, filters_cfg, need);
  const kept = [],
    kept_orig = [];
  for (let i = 0; i < points.length; i++)
    if (keep[i]) {
      kept.push(points[i]);
      kept_orig.push(i);
    }
  const labels_out = new Int32Array(points.length).fill(FILTERED);
  for (let i = 0; i < points.length; i++) if (keep[i]) labels_out[i] = UNVISITED;
  const filtered_ids = points.filter((_, i) => !keep[i]).map((p) => p.id);
  if (!kept.length)
    return {
      algorithm,
      labels: labels_out,
      clusters: [],
      noise_ids: [],
      weighting: { requested: !!opts.cluster_weight, applied: false },
      floors: { requested: !!opts.weighted, applied: false, skipped: [] },
      points_outside_raster: outside,
      filtered_ids,
    };

  const project = make_projector(kept),
    n = kept.length,
    px = new Float64Array(n),
    py = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y] = project(kept[i].lon, kept[i].lat);
    px[i] = x;
    py[i] = y;
  }

  // One index serves every raster-to-point attachment: the clustering weight and
  // each reporting weight all resolve population by nearest point.
  const alloc_idx = new GridIndex(px, py, ALLOCATION_INDEX_CELL_M);
  const { cw, weighting, cw_report } = buildClusterWeight(
    opts,
    kept,
    project,
    alloc_idx,
    need,
    weights_cfg
  );
  const weight_arrays = weights_cfg.map((wc) => ({
    name: wc.raster,
    min_pop: wc.min_pop,
    values: build_weight(need(wc.raster), kept, project, alloc_idx, wc.allocation || 'sample'),
  }));
  const { floors, enforced } = resolveFloors(!!opts.weighted, algorithm, weight_arrays);

  let labels;
  if (algorithm === 'hdbscan') {
    labels = run_hdbscan(px, py, cw, {
      min_cluster_size: opts.min_cluster_size || 5,
      min_samples: opts.min_samples || opts.min_cluster_size || 5,
      max_link_m: (opts.max_link_km || 10) * 1000,
    });
  } else {
    if (!(opts.eps_km > 0)) throw new Error('eps_km must be > 0');
    if (!(opts.min_pts >= 1)) throw new Error('min_pts must be >= 1');
    const min_pts = opts.min_pts,
      eps_m = opts.eps_km * 1000,
      eps2 = eps_m * eps_m;
    // Base core test: weighted neighbourhood mass >= min_pts (uniform weights => count).
    const baseCore =
      weighting.applied || weighting.layers
        ? (nb) => {
            let s = 0;
            for (const j of nb) s += cw[j];
            return s >= min_pts;
          }
        : (nb) => nb.length >= min_pts;
    // Optional hard min_pop gate layered on top of the base test.
    const is_core = enforced.length
      ? (nb) => {
          if (!baseCore(nb)) return false;
          for (const wa of enforced) {
            let s = 0;
            for (const j of nb) s += wa.values[j];
            if (s < wa.min_pop) return false;
          }
          return true;
        }
      : baseCore;
    labels = run_dbscan(n, new GridIndex(px, py, eps_m), eps2, is_core);
  }

  const report_arrays = weight_arrays.concat(cw_report ? [cw_report] : []);
  const { clusters, noise_ids } = summariseClusters(
    labels,
    kept,
    kept_orig,
    labels_out,
    report_arrays,
    rank_by
  );
  return {
    algorithm,
    labels: labels_out,
    clusters,
    noise_ids,
    weighting,
    floors,
    points_outside_raster: outside,
    filtered_ids,
  };
}
