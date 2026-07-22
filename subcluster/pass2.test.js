import { describe, it, expect } from 'vitest';
import { runPass2 } from './pass2.js';

describe('runPass2 — statistics and single-unit handling', () => {
  // One homogeneous cluster (variance guard → one unit), one with-no-ability point
  // (unknown), one point with no population (excluded from the mean), one pass-1
  // noise point (last-mile), and one filtered point (ignored).
  const input = {
    px: new Float64Array([0, 0, 0, 0, 0, 0]),
    py: new Float64Array([0, 0, 0, 0, 0, 0]),
    labels: new Int32Array([1, 1, 1, 1, -1, -2]),
    ability: [2, 2, 2, null, 2, 2],
    population: [10, 30, null, 5, 100, 100],
  };

  it('reports a homogeneous cluster as a single unit', () => {
    const { clusters } = runPass2(input);
    expect(clusters).toHaveLength(1);
    const c = clusters[0];
    expect(c.parentClusterId).toBe(1);
    expect(c.k).toBe(1);
    expect(c.flag).toBe('homogeneous');
    expect(c.subAreas).toHaveLength(1);
    expect(c.subAreas[0].subAreaId).toBe('1-b0-s1');
  });

  it('sums population and population-weights the mean, excluding missing population', () => {
    const sub = runPass2(input).clusters[0].subAreas[0];
    expect(sub.population).toBe(40); // 10 + 30; the null-population point adds nothing
    expect(sub.meanAbilityToPay).toBeCloseTo(2, 12); // (10*2 + 30*2) / 40
    expect(sub.missingPopCount).toBe(1);
  });

  it('routes with-no-ability points to the unknown group, never banded', () => {
    const c = runPass2(input).clusters[0];
    expect(c.hasUnknown).toBe(true);
    // Point 3 has no ability but does have population (5): counted, mean stays null.
    expect(c.unknown).toEqual({
      count: 1,
      memberIndices: [3],
      population: 5,
      meanAbilityToPay: null,
      missingPopCount: 0,
    });
  });

  it('carries pass-1 noise through as the last-mile layer, with a summary', () => {
    const { lastMile } = runPass2(input);
    expect(lastMile).toEqual({
      count: 1,
      memberIndices: [4],
      population: 100,
      meanAbilityToPay: 2,
      missingPopCount: 0,
    });
  });

  it('is deterministic', () => {
    expect(runPass2(input)).toEqual(runPass2(input));
  });
});

describe('runPass2 — cluster ordering', () => {
  it('emits clusters in ascending parent-id order regardless of point order', () => {
    const { clusters } = runPass2({
      px: new Float64Array(10),
      py: new Float64Array(10),
      labels: new Int32Array([2, 2, 2, 2, 2, 1, 1, 1, 1, 1]),
      ability: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      population: new Float64Array(10).fill(1),
    });
    expect(clusters.map((c) => c.parentClusterId)).toEqual([1, 2]);
  });
});

describe('runPass2 — respatialisation and scattered noise', () => {
  // One cluster, two ability bands. The low band holds three points in a tight
  // pocket plus one far outlier; the high band is a single tight pocket far away.
  const input = {
    px: new Float64Array([0, 50, 100, 80000, 20000, 20050, 20100, 20080]),
    py: new Float64Array([0, 0, 0, 80000, 0, 0, 0, 0]),
    labels: new Int32Array([1, 1, 1, 1, 1, 1, 1, 1]),
    ability: [0, 0, 0, 0, 10, 10, 10, 10],
    population: new Float64Array(8).fill(1),
    options: { min2: 2, eps2OverrideKm: 1, banding: { maxBands: 2, floor: 2 } },
  };

  it('splits bands into contiguous sub-areas and honours the eps2 override', () => {
    const c = runPass2(input).clusters[0];
    expect(c.k).toBe(2);
    expect(c.eps2Km).toBe(1);

    const lowContiguous = c.subAreas.filter((s) => s.band === 0 && !s.scattered);
    expect(lowContiguous).toHaveLength(1);
    expect(lowContiguous[0].memberIndices).toEqual([0, 1, 2]);

    const high = c.subAreas.filter((s) => s.band === 1);
    expect(high).toHaveLength(1);
    expect(high[0].scattered).toBe(false);
    expect(high[0].memberIndices).toEqual([4, 5, 6, 7]);
  });

  it('surfaces within-band noise as one flagged scattered sub-area', () => {
    const c = runPass2(input).clusters[0];
    const scattered = c.subAreas.filter((s) => s.scattered);
    expect(scattered).toHaveLength(1);
    expect(scattered[0].band).toBe(0);
    expect(scattered[0].subAreaId).toBe('1-b0-scattered');
    expect(scattered[0].memberIndices).toEqual([3]);
  });
});

describe('runPass2 — edge clusters', () => {
  it('reports an all-unknown cluster with no sub-areas, only the unknown group', () => {
    const c = runPass2({
      px: new Float64Array(2),
      py: new Float64Array(2),
      labels: new Int32Array([1, 1]),
      ability: [null, null],
      population: [1, 1],
    }).clusters[0];
    expect(c.k).toBe(0);
    expect(c.flag).toBe('all-unknown');
    expect(c.subAreas).toEqual([]);
    expect(c.unknown).toEqual({
      count: 2,
      memberIndices: [0, 1],
      population: 2,
      meanAbilityToPay: null,
      missingPopCount: 0,
    });
  });

  it('leaves each band unsplit when eps2 cannot be derived (too few with-data points)', () => {
    // 4 with-data points and min2=4 → no min2-th neighbour → no eps2 → no split.
    const c = runPass2({
      px: new Float64Array([0, 10, 20, 30]),
      py: new Float64Array([0, 0, 0, 0]),
      labels: new Int32Array([1, 1, 1, 1]),
      ability: [0, 0, 10, 10],
      population: new Float64Array(4).fill(1),
      options: { min2: 4, banding: { maxBands: 2, floor: 2 } },
    }).clusters[0];
    expect(c.k).toBe(2);
    expect(c.eps2Km).toBeNull();
    expect(c.subAreas).toHaveLength(2);
    expect(c.subAreas.every((s) => !s.scattered)).toBe(true);
    expect(c.subAreas[0].memberIndices).toEqual([0, 1]);
    expect(c.subAreas[1].memberIndices).toEqual([2, 3]);
  });
});

describe('runPass2 — validation', () => {
  it('throws when input arrays differ in length', () => {
    expect(() =>
      runPass2({
        px: new Float64Array(3),
        py: new Float64Array(3),
        labels: new Int32Array([1, 1]),
        ability: [1, 1, 1],
        population: [1, 1, 1],
      })
    ).toThrow(/same length/);
  });
});
