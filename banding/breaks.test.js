import { describe, it, expect } from 'vitest';
import { prefixCost, fisherJenks, ckmeans } from './breaks.js';

/** Deterministic LCG so the randomised cases are reproducible. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1103515245 * s + 12345) >>> 0;
    return s / 0x100000000;
  };
}

/** Naive within-class SSE of a[i..j-1], for cross-checking prefixCost. */
function naiveSse(a, i, j) {
  if (j - i <= 0) return 0;
  let mean = 0;
  for (let t = i; t < j; t++) mean += a[t];
  mean /= j - i;
  let s = 0;
  for (let t = i; t < j; t++) s += (a[t] - mean) ** 2;
  return s;
}

/**
 * Brute-force optimal k-partition of sorted `a`: enumerate every choice of k-1
 * internal split points and keep the minimum-SSE partition, breaking ties toward
 * the lowest (leftmost) boundaries — the same rule the DP kernels use.
 */
function bruteOptimal(a, k) {
  const n = a.length;
  let bestCost = Infinity;
  let bestStarts = null;
  const cuts = new Array(k - 1);
  const recurse = (depth, from) => {
    if (depth === k - 1) {
      const starts = [0, ...cuts];
      let cost = 0;
      for (let c = 0; c < k; c++) {
        const lo = starts[c];
        const hi = c + 1 < k ? starts[c + 1] : n;
        cost += naiveSse(a, lo, hi);
      }
      // Strictly-less keeps the first (lowest-boundary) partition on ties.
      if (cost < bestCost - 1e-12) {
        bestCost = cost;
        bestStarts = starts.slice();
      }
      return;
    }
    for (let cut = from; cut <= n - (k - 1 - depth); cut++) {
      cuts[depth] = cut;
      recurse(depth + 1, cut + 1);
    }
  };
  recurse(0, 1);
  return bestStarts;
}

describe('prefixCost', () => {
  it('matches naive within-class SSE on every sub-range', () => {
    const a = Float64Array.from([1, 2, 4, 7, 11, 16, 22]);
    const sse = prefixCost(a);
    for (let i = 0; i < a.length; i++) {
      for (let j = i; j <= a.length; j++) {
        expect(sse(i, j)).toBeCloseTo(naiveSse(a, i, j), 9);
      }
    }
  });

  it('returns 0 for empty ranges', () => {
    const sse = prefixCost(Float64Array.from([3, 3, 3]));
    expect(sse(1, 1)).toBe(0);
    expect(sse(2, 0)).toBe(0);
  });
});

describe('fisherJenks', () => {
  it('splits at the obvious gap', () => {
    const a = Float64Array.from([1, 2, 3, 100, 101, 102]);
    expect(fisherJenks(a, 2)).toEqual([0, 3]);
  });

  it('matches the brute-force optimum on small inputs', () => {
    const a = Float64Array.from([4, 5, 9, 10, 40, 41, 80]);
    for (let k = 1; k <= a.length; k++) {
      expect(fisherJenks(a, k)).toEqual(bruteOptimal(a, k));
    }
  });

  it('returns starts[0] === 0 and ascending boundaries', () => {
    const a = Float64Array.from([1, 3, 3, 8, 9, 20, 21, 22]);
    const starts = fisherJenks(a, 4);
    expect(starts[0]).toBe(0);
    for (let c = 1; c < starts.length; c++) expect(starts[c]).toBeGreaterThan(starts[c - 1]);
  });
});

describe('ckmeans', () => {
  it('agrees with fisherJenks on a known vector', () => {
    const a = Float64Array.from([120, 108, 110, 106, 433, 488, 522, 545].sort((x, y) => x - y));
    for (let k = 2; k <= 5; k++) {
      expect(ckmeans(a, k)).toEqual(fisherJenks(a, k));
    }
  });

  it('agrees with fisherJenks across many random inputs, including ties', () => {
    const rnd = lcg(42);
    for (let trial = 0; trial < 300; trial++) {
      const n = 5 + Math.floor(rnd() * 30);
      const a = new Float64Array(n);
      // Coarse quantisation deliberately produces repeated values (ties).
      for (let i = 0; i < n; i++) a[i] = Math.floor(rnd() * 12);
      a.sort();
      const maxK = Math.min(5, n);
      for (let k = 1; k <= maxK; k++) {
        expect(ckmeans(a, k)).toEqual(fisherJenks(a, k));
      }
    }
  });

  it('matches the brute-force optimum on small inputs', () => {
    const a = Float64Array.from([2, 2, 5, 6, 6, 30, 31]);
    for (let k = 1; k <= a.length; k++) {
      expect(ckmeans(a, k)).toEqual(bruteOptimal(a, k));
    }
  });
});
