import { describe, it, expect } from 'vitest';
import { assignBands } from './bands.js';

/** Deterministic LCG for the shuffle test. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1103515245 * s + 12345) >>> 0;
    return s / 0x100000000;
  };
}

/** Three tight, well-separated groups of `per` points each. */
function threeGroups(per) {
  const centres = [0, 100, 200];
  const out = [];
  for (const c of centres) {
    for (let i = 0; i < per; i++) out.push(c + i * 0.01);
  }
  return out;
}

describe('assignBands — determinism', () => {
  it('returns identical breaks, bands, and ranges on repeated calls', () => {
    const values = [1, 2, 3, 10, 11, 12, 40, 41, 42, 43, 80, 81, 82, 83, 84];
    const a = assignBands(values);
    const b = assignBands(values);
    expect(a.breaks).toEqual(b.breaks);
    expect([...a.bandOf]).toEqual([...b.bandOf]);
    expect(a.ranges).toEqual(b.ranges);
    expect(a.k).toBe(b.k);
  });

  it('is independent of input order', () => {
    const values = threeGroups(8);
    const ref = assignBands(values);

    const rnd = lcg(7);
    const shuffled = values.map((v, i) => [v, i]);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const shufValues = shuffled.map(([v]) => v);
    const out = assignBands(shufValues);

    expect(out.breaks).toEqual(ref.breaks);
    expect(out.k).toBe(ref.k);
    // Each shuffled point lands in the same band its original value had.
    shuffled.forEach(([, origIdx], pos) => {
      expect(out.bandOf[pos]).toBe(ref.bandOf[origIdx]);
    });
  });
});

describe('assignBands — adaptive-k floor', () => {
  it('reduces k until every band meets the floor', () => {
    // 24 points in three groups of 8: k=5 is skipped (needs 25), k=4 must split a
    // group into a sub-floor band, so it settles on k=3 with 8 per band.
    const out = assignBands(threeGroups(8), { floor: 5 });
    expect(out.k).toBe(3);
    expect(out.flag).toBeNull();
    const sizes = [0, 0, 0];
    for (const b of out.bandOf) sizes[b]++;
    expect(sizes).toEqual([8, 8, 8]);
  });

  it('reports a single unit when even two bands cannot meet the floor', () => {
    const out = assignBands([1, 2, 3, 50, 60, 61], { floor: 5 });
    expect(out.k).toBe(1);
    expect(out.flag).toBe('insufficient-points');
    expect([...out.bandOf]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(out.method).toBe('single-unit');
  });
});

describe('assignBands — variance guard', () => {
  it('flags a homogeneous cluster within varianceEps', () => {
    const out = assignBands([1.0, 1.001, 0.999, 1.002, 1.0, 0.998], { varianceEps: 0.01 });
    expect(out.k).toBe(1);
    expect(out.flag).toBe('homogeneous');
    expect(out.method).toBe('single-unit');
    expect(out.ranges).toEqual([[0.998, 1.002]]);
  });

  it('flags exactly-constant data with the default varianceEps of 0', () => {
    const out = assignBands([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(out.k).toBe(1);
    expect(out.flag).toBe('homogeneous');
  });
});

describe('assignBands — band semantics', () => {
  it('puts the lowest values in band 0 and the highest in band k-1', () => {
    const values = [1, 2, 3, 10, 11, 12, 40, 41, 42, 43, 80, 81, 82, 83, 84];
    const out = assignBands(values, { floor: 2 });
    const min = Math.min(...values);
    const max = Math.max(...values);
    values.forEach((v, i) => {
      if (v === min) expect(out.bandOf[i]).toBe(0);
      if (v === max) expect(out.bandOf[i]).toBe(out.k - 1);
    });
  });

  it('never splits equal values across bands', () => {
    const values = [1, 1, 1, 1, 1, 5, 5, 5, 5, 5, 9, 9, 9, 9, 9];
    const out = assignBands(values, { floor: 2 });
    const bandByValue = new Map();
    values.forEach((v, i) => {
      if (bandByValue.has(v)) expect(out.bandOf[i]).toBe(bandByValue.get(v));
      else bandByValue.set(v, out.bandOf[i]);
    });
  });

  it('reports ascending, non-overlapping band ranges', () => {
    const values = [1, 2, 3, 10, 11, 12, 40, 41, 42, 43, 80, 81, 82, 83, 84];
    const out = assignBands(values, { floor: 2 });
    for (let b = 0; b < out.k; b++) {
      expect(out.ranges[b][0]).toBeLessThanOrEqual(out.ranges[b][1]);
      if (b > 0) expect(out.ranges[b - 1][1]).toBeLessThanOrEqual(out.ranges[b][0]);
    }
  });
});

describe('assignBands — method selection', () => {
  it('switches to ckmeans by default once a cluster exceeds the size threshold (1500)', () => {
    const small = Array.from({ length: 1000 }, (_, i) => i);
    const large = Array.from({ length: 1600 }, (_, i) => i);
    expect(assignBands(small).method).toBe('fisher-jenks');
    expect(assignBands(large).method).toBe('ckmeans');
  });

  it('uses ckmeans above the size threshold and matches Fisher-Jenks', () => {
    const values = threeGroups(8);
    const jenks = assignBands(values, { floor: 5 });
    const ck = assignBands(values, { floor: 5, sizeThreshold: 0 });
    expect(jenks.method).toBe('fisher-jenks');
    expect(ck.method).toBe('ckmeans');
    expect(ck.breaks).toEqual(jenks.breaks);
    expect([...ck.bandOf]).toEqual([...jenks.bandOf]);
    expect(ck.ranges).toEqual(jenks.ranges);
  });
});

describe('assignBands — validation', () => {
  it('throws on non-finite values', () => {
    expect(() => assignBands([1, 2, NaN, 4])).toThrow(/not finite/);
  });

  it('throws on invalid options', () => {
    expect(() => assignBands([1, 2, 3], { minBands: 6, maxBands: 5 })).toThrow(/minBands/);
    expect(() => assignBands([1, 2, 3], { floor: 0 })).toThrow(/floor/);
  });
});
