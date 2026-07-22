/**
 * banding/bands.js — within-cluster ability-to-pay banding (spec §3.2, §3.3).
 *
 * Public entry point for pass 2's banding step. Assigns each with-data point of a
 * SINGLE parent cluster to a band by its ability-to-pay ratio, using deterministic
 * natural breaks computed within that cluster. Pure 1D maths: no geography,
 * population, or missing-value handling — callers pass with-data values only, and
 * geography enters later in `subcluster/`. This module boundary is what keeps
 * geography and ability-to-pay from ever being fused (spec §8).
 */

import { fisherJenks, ckmeans } from './breaks.js';

/**
 * Default banding parameters.
 * @property {number} maxBands starting band count (spec default 5)
 * @property {number} floor minimum points per band (spec default 5)
 * @property {number} minBands never band below this (spec minimum 2)
 * @property {number} varianceEps spread (max - min) at or below which a cluster is
 *   treated as homogeneous. Default 0 fires the guard only on truly constant data;
 *   the operational value is a spec §7 open item to be tuned on real data.
 * @property {number} sizeThreshold with-data count above which the `ckmeans` path is
 *   used instead of Fisher-Jenks. Default Infinity (always Fisher-Jenks) until the
 *   spec §7 largest-cluster test sets a real threshold.
 */
const DEFAULTS = {
  maxBands: 5,
  floor: 5,
  minBands: 2,
  varianceEps: 0,
  sizeThreshold: Infinity,
};

/**
 * Assign within-cluster ability-to-pay bands.
 * @param {number[]|Float64Array} values with-data ability-to-pay **ratios** for ONE
 *   parent cluster (unitless; never summed, never geographic). All must be finite.
 * @param {object} [options] overrides for {@link DEFAULTS}.
 * @returns {{
 *   bandOf: Int32Array,
 *   k: number,
 *   breaks: number[],
 *   ranges: Array<[number, number]>,
 *   method: 'fisher-jenks' | 'ckmeans' | 'single-unit',
 *   flag: null | 'homogeneous' | 'insufficient-points'
 * }} `bandOf` is aligned to input order, values 0..k-1 with 0 = lowest ability to
 *   pay; `k` is the final band count (1 when reported as a single unit); `breaks`
 *   holds the k-1 upper-edge values ([] when k === 1); `ranges[b]` is the [min, max]
 *   of band b; `method` records which kernel ran; `flag` marks a single-unit reason.
 * @throws {Error} if any value is not finite, or options are out of range.
 * @determinism Same value multiset and options ⇒ identical breaks, bands, and
 *   ranges. Input order does not affect the result; `bandOf` is realigned to it.
 */
export function assignBands(values, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  validateOptions(opts);
  const { maxBands, floor, minBands, varianceEps, sizeThreshold } = opts;

  const n = values.length;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(values[i])) {
      throw new Error(
        `assignBands: value at index ${i} is not finite; missing values must be removed before banding`
      );
    }
  }
  if (n === 0) {
    return {
      bandOf: new Int32Array(0),
      k: 0,
      breaks: [],
      ranges: [],
      method: 'single-unit',
      flag: 'insufficient-points',
    };
  }

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // Near-zero-variance guard: a homogeneous cluster is reported as one unit.
  if (max - min <= varianceEps) {
    return singleUnit(n, min, max, 'homogeneous');
  }

  const sortedAsc = Float64Array.from(values);
  sortedAsc.sort();

  // Adaptive band count: try from maxBands down to minBands, accept the first k
  // whose every band holds at least `floor` points.
  for (let k = Math.min(maxBands, n); k >= minBands; k--) {
    if (n < k * floor) continue; // even a perfect split cannot meet the floor
    const useCkmeans = n > sizeThreshold;
    const starts = useCkmeans ? ckmeans(sortedAsc, k) : fisherJenks(sortedAsc, k);
    const breaks = [];
    for (let c = 0; c < k - 1; c++) breaks.push(sortedAsc[starts[c + 1] - 1]);

    const bandOf = new Int32Array(n);
    const sizes = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const b = bandFor(values[i], breaks, k);
      bandOf[i] = b;
      sizes[b]++;
    }
    if (!meetsFloor(sizes, floor)) continue;

    return {
      bandOf,
      k,
      breaks,
      ranges: rangesFrom(values, bandOf, k),
      method: useCkmeans ? 'ckmeans' : 'fisher-jenks',
      flag: null,
    };
  }

  // No band count from minBands upward satisfies the floor.
  return singleUnit(n, min, max, 'insufficient-points');
}

/**
 * Band index for a value given ascending upper-edge breaks.
 * Assigns by value (not by sorted position), so equal values always share a band
 * and the result is independent of input order.
 * @param {number} v value
 * @param {number[]} breaks k-1 ascending upper edges
 * @param {number} k band count
 * @returns {number} band index in 0..k-1
 */
function bandFor(v, breaks, k) {
  let b = 0;
  while (b < k - 1 && v > breaks[b]) b++;
  return b;
}

/**
 * @param {Int32Array} sizes per-band counts
 * @param {number} floor minimum points per band
 * @returns {boolean} true when every band holds at least `floor` points
 */
function meetsFloor(sizes, floor) {
  for (let b = 0; b < sizes.length; b++) {
    if (sizes[b] < floor) return false;
  }
  return true;
}

/**
 * Per-band value range [min, max], computed from the actual assignment.
 * @param {number[]|Float64Array} values input values
 * @param {Int32Array} bandOf band per value
 * @param {number} k band count
 * @returns {Array<[number, number]>} length-k ascending, non-overlapping ranges
 */
function rangesFrom(values, bandOf, k) {
  const mn = new Float64Array(k).fill(Infinity);
  const mx = new Float64Array(k).fill(-Infinity);
  for (let i = 0; i < values.length; i++) {
    const b = bandOf[i];
    const v = values[i];
    if (v < mn[b]) mn[b] = v;
    if (v > mx[b]) mx[b] = v;
  }
  const ranges = [];
  for (let b = 0; b < k; b++) ranges.push([mn[b], mx[b]]);
  return ranges;
}

/**
 * Build a single-unit result (variance guard or floor failure).
 * @param {number} n point count
 * @param {number} min cluster minimum value
 * @param {number} max cluster maximum value
 * @param {'homogeneous' | 'insufficient-points'} flag reason
 * @returns {object} banding result with k === 1 and every point in band 0
 */
function singleUnit(n, min, max, flag) {
  return {
    bandOf: new Int32Array(n),
    k: 1,
    breaks: [],
    ranges: [[min, max]],
    method: 'single-unit',
    flag,
  };
}

/**
 * Validate banding options, throwing a clear error on any out-of-range value.
 * @param {object} opts merged options
 * @throws {Error} when an option is not a valid number or violates the constraints
 */
function validateOptions(opts) {
  const { maxBands, floor, minBands, varianceEps, sizeThreshold } = opts;
  if (!Number.isInteger(maxBands) || maxBands < 1)
    throw new Error(`assignBands: maxBands must be an integer >= 1, got ${maxBands}`);
  if (!Number.isInteger(minBands) || minBands < 1)
    throw new Error(`assignBands: minBands must be an integer >= 1, got ${minBands}`);
  if (minBands > maxBands)
    throw new Error(`assignBands: minBands (${minBands}) must not exceed maxBands (${maxBands})`);
  if (!Number.isInteger(floor) || floor < 1)
    throw new Error(`assignBands: floor must be an integer >= 1, got ${floor}`);
  if (!(varianceEps >= 0))
    throw new Error(`assignBands: varianceEps must be >= 0, got ${varianceEps}`);
  if (!(sizeThreshold >= 0))
    throw new Error(`assignBands: sizeThreshold must be >= 0, got ${sizeThreshold}`);
}
