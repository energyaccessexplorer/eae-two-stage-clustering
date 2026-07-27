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

describe('runPass2 — respatialisation method and eps2 percentile', () => {
  const base = {
    px: new Float64Array([0, 50, 100, 80000, 20000, 20050, 20100, 20080]),
    py: new Float64Array([0, 0, 0, 80000, 0, 0, 0, 0]),
    labels: new Int32Array([1, 1, 1, 1, 1, 1, 1, 1]),
    ability: [0, 0, 0, 0, 10, 10, 10, 10],
    population: new Float64Array(8).fill(1),
  };

  it('defaults to dbscan and the median percentile, and records them', () => {
    const p = runPass2(base).params;
    expect(p.respatialiseMethod).toBe('dbscan');
    expect(p.eps2Percentile).toBe(0.5);
  });

  it('records an hdbscan choice and a custom percentile', () => {
    const p = runPass2({
      ...base,
      options: { respatialiseMethod: 'hdbscan', eps2Percentile: 0.3 },
    }).params;
    expect(p.respatialiseMethod).toBe('hdbscan');
    expect(p.eps2Percentile).toBe(0.3);
  });

  it('runs the hdbscan path and stays deterministic', () => {
    const opts = { min2: 2, respatialiseMethod: 'hdbscan', banding: { maxBands: 2, floor: 2 } };
    const a = runPass2({ ...base, options: opts });
    const b = runPass2({ ...base, options: opts });
    expect(a).toEqual(b);
    expect(a.clusters[0].k).toBe(2);
    expect(a.clusters[0].subAreas.length).toBeGreaterThan(0);
  });
});

describe('runPass2 — modality guard (opt-in)', () => {
  // A single-peaked (unimodal) distribution spread over a real range, big enough that
  // it WOULD otherwise band into several classes.
  const unimodalAbility = [1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 8];
  const base = {
    px: new Float64Array(20),
    py: new Float64Array(20),
    labels: new Int32Array(20).fill(1),
    ability: unimodalAbility,
    population: new Float64Array(20).fill(1),
  };

  it('bands a smooth cluster normally when the guard is OFF (default)', () => {
    const c = runPass2(base).clusters[0];
    expect(c.k).toBeGreaterThan(1);
    expect(c.flag).not.toBe('unimodal');
  });

  it('reports a smooth cluster as one gradient unit when the guard is ON', () => {
    const res = runPass2({ ...base, options: { modalityGuard: true } });
    expect(res.params.modalityGuard).toBe(true);
    const c = res.clusters[0];
    expect(c.k).toBe(1);
    expect(c.flag).toBe('unimodal');
    expect(c.method).toBe('single-unit');
    expect(c.subAreas).toHaveLength(1);
  });

  it('still bands a genuinely multimodal cluster with the guard ON', () => {
    const bimodal = {
      ...base,
      ability: [...Array(10).fill(0), ...Array(10).fill(100)],
      options: { modalityGuard: true, banding: { maxBands: 2, floor: 5 } },
    };
    const c = runPass2(bimodal).clusters[0];
    expect(c.flag).not.toBe('unimodal');
    expect(c.k).toBe(2);
  });
});

describe('runPass2 — regionalization mode (opt-in)', () => {
  // One cluster on a line with a low-value pocket in the middle.
  const line = {
    px: Float64Array.from({ length: 9 }, (_, i) => i * 1000),
    py: new Float64Array(9),
    labels: new Int32Array(9).fill(1),
    ability: [10, 10, 10, 0, 0, 0, 10, 10, 10],
    population: new Float64Array(9).fill(1),
  };

  it('partitions a cluster into contiguous value-homogeneous regions', () => {
    const res = runPass2({ ...line, options: { mode: 'regions', regionCount: 3, regionKnn: 2 } });
    expect(res.params.mode).toBe('regions');
    expect(res.params.regionCount).toBe(3);
    const c = res.clusters[0];
    expect(c.method).toBe('regions');
    expect(c.k).toBe(3);
    expect(c.subAreas.map((s) => s.subAreaId)).toEqual(['1-r1', '1-r2', '1-r3']);
    // The middle region is the low-value pocket (mean 0), the others mean 10.
    const poorest = c.subAreas.reduce((a, b) => (b.meanAbilityToPay < a.meanAbilityToPay ? b : a));
    expect(poorest.meanAbilityToPay).toBe(0);
    expect(poorest.memberIndices).toEqual([3, 4, 5]);
  });

  it('reports a homogeneous cluster as a single region', () => {
    const flat = { ...line, ability: new Array(9).fill(5) };
    const c = runPass2({ ...flat, options: { mode: 'regions', regionCount: 3 } }).clusters[0];
    expect(c.k).toBe(1);
    expect(c.flag).toBe('homogeneous');
    expect(c.subAreas[0].subAreaId).toBe('1-r1');
  });
});
