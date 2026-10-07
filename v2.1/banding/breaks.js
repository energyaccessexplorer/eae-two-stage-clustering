/**
 * banding/breaks.js — deterministic 1D natural-breaks kernels.
 *
 * Two implementations of the SAME objective: partition a sorted 1D array into k
 * contiguous classes minimising total within-class sum of squared deviations
 * (SSE). Fisher-Jenks is the canonical O(k·n²) dynamic program; `ckmeans` is the
 * O(k·n log n) divide-and-conquer twin used for large clusters. Because both
 * return the global optimum with the same tie rule, they produce identical
 * breaks — provenance can record which one ran without changing the result.
 *
 * No geography here: these operate purely on ability-to-pay ratio values.
 */

/**
 * Build an O(1) segment-SSE evaluator from prefix sums.
 * @param {Float64Array} a values sorted ascending, all finite
 * @returns {(i: number, j: number) => number} sse for the half-open range [i, j);
 *   the within-class sum of squared deviations of a[i..j-1]. Returns 0 for j <= i.
 * @determinism Pure function of `a`.
 */
export function prefixCost(a) {
  const n = a.length;
  const p1 = new Float64Array(n + 1);
  const p2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    p1[i + 1] = p1[i] + a[i];
    p2[i + 1] = p2[i] + a[i] * a[i];
  }
  return (i, j) => {
    const m = j - i;
    if (m <= 0) return 0;
    const s = p1[j] - p1[i];
    const sse = p2[j] - p2[i] - (s * s) / m;
    // Clamp tiny negative round-off so the cost is never below zero.
    return sse > 0 ? sse : 0;
  };
}

/**
 * Reconstruct ascending class start indices from a per-layer argmin table.
 * @param {Int32Array[]} arg arg[c][j] = start index of the c-th class ending at j
 * @param {number} k number of classes
 * @param {number} n number of values
 * @returns {number[]} length-k ascending start indices, starts[0] === 0
 */
function reconstruct(arg, k, n) {
  const starts = new Array(k);
  let j = n;
  for (let c = k; c >= 1; c--) {
    const i = arg[c][j];
    starts[c - 1] = i;
    j = i;
  }
  return starts;
}

/**
 * Fisher-Jenks natural breaks via canonical dynamic programming.
 * @param {Float64Array} a values sorted ascending, all finite; length n
 * @param {number} k number of classes, 1 <= k <= n
 * @returns {number[]} length-k ascending class start indices, starts[0] === 0.
 *   Class c spans [starts[c], starts[c+1]) (last class ends at n).
 * @determinism On equal cost the lowest boundary index is chosen (strict-<
 *   improvement while scanning i ascending), matching `ckmeans`.
 */
export function fisherJenks(a, k) {
  const n = a.length;
  const sse = prefixCost(a);
  const D = Array.from({ length: k + 1 }, () => new Float64Array(n + 1).fill(Infinity));
  const arg = Array.from({ length: k + 1 }, () => new Int32Array(n + 1));
  D[0][0] = 0;
  for (let c = 1; c <= k; c++) {
    for (let j = c; j <= n; j++) {
      let best = Infinity;
      let bi = c - 1;
      for (let i = c - 1; i <= j - 1; i++) {
        const prev = D[c - 1][i];
        if (prev === Infinity) continue;
        const cost = prev + sse(i, j);
        if (cost < best) {
          best = cost;
          bi = i;
        }
      }
      D[c][j] = best;
      arg[c][j] = bi;
    }
  }
  return reconstruct(arg, k, n);
}

/**
 * Ckmeans.1d.dp-style exact 1D clustering via divide-and-conquer DP.
 * Produces the same optimal partition as {@link fisherJenks} in O(k·n log n),
 * exploiting the concave (Monge) structure of the SSE cost so that the optimal
 * boundary is monotone in j.
 * @param {Float64Array} a values sorted ascending, all finite; length n
 * @param {number} k number of classes, 1 <= k <= n
 * @returns {number[]} length-k ascending class start indices, starts[0] === 0
 * @determinism Same lowest-boundary tie rule as {@link fisherJenks}, so the two
 *   return identical breaks on identical input.
 */
export function ckmeans(a, k) {
  const n = a.length;
  const sse = prefixCost(a);
  const arg = Array.from({ length: k + 1 }, () => new Int32Array(n + 1));
  let Dprev = new Float64Array(n + 1).fill(Infinity);
  Dprev[0] = 0;
  for (let c = 1; c <= k; c++) {
    const Dcur = new Float64Array(n + 1).fill(Infinity);
    const argc = arg[c];
    // solve computes Dcur[j] for j in [jlo, jhi], knowing the optimal boundary
    // lies in [ilo, ihi]. Boundaries are monotone in j, giving O(n log n) per layer.
    const solve = (jlo, jhi, ilo, ihi) => {
      if (jlo > jhi) return;
      const jmid = (jlo + jhi) >> 1;
      let best = Infinity;
      let bi = ilo;
      const hi = Math.min(ihi, jmid - 1);
      for (let i = ilo; i <= hi; i++) {
        const prev = Dprev[i];
        if (prev === Infinity) continue;
        const cost = prev + sse(i, jmid);
        if (cost < best) {
          best = cost;
          bi = i;
        }
      }
      Dcur[jmid] = best;
      argc[jmid] = bi;
      solve(jlo, jmid - 1, ilo, bi);
      solve(jmid + 1, jhi, bi, ihi);
    };
    solve(c, n, c - 1, n - 1);
    Dprev = Dcur;
  }
  return reconstruct(arg, k, n);
}
