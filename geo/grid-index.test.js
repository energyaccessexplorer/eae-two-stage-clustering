import { describe, it, expect } from 'vitest';
import { GridIndex, GridIndexRadiusError } from './grid-index.js';

/** Four points on a 1 km lattice, plus one 5 km away. Coordinates are metres. */
function lattice() {
  const px = new Float64Array([0, 1000, 0, 1000, 5000]);
  const py = new Float64Array([0, 0, 1000, 1000, 5000]);
  return { px, py };
}

describe('GridIndex radius invariant', () => {
  const { px, py } = lattice();
  const cell = 1000;

  it('accepts a query at exactly the cell size', () => {
    const idx = new GridIndex(px, py, cell);
    expect(() => idx.within(0, cell * cell)).not.toThrow();
  });

  it('rejects a query wider than the cell, rather than silently missing neighbours', () => {
    const idx = new GridIndex(px, py, cell);
    // 3 km radius over a 1 km grid: the neighbours two rings out would be invisible.
    expect(() => idx.within(0, 3000 * 3000)).toThrow(GridIndexRadiusError);
  });

  it('finds every neighbour inside a legal radius, including diagonals', () => {
    const idx = new GridIndex(px, py, 1500);
    const got = idx.within(0, 1500 * 1500).sort((a, b) => a - b);
    // self, +x, +y — the diagonal at ~1414 m is inside 1500 m, the far point is not.
    expect(got).toEqual([0, 1, 2, 3]);
  });

  it('excludes points beyond the radius', () => {
    const idx = new GridIndex(px, py, 1000);
    expect(idx.within(0, 1000 * 1000).sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });
});

describe('GridIndex.nearest', () => {
  const { px, py } = lattice();

  it('finds the closest point at any distance, beyond the cell size', () => {
    const idx = new GridIndex(px, py, 1000);
    // Query next to the far point: reachable only by expanding well past one cell.
    expect(idx.nearest(5100, 5100)).toBe(4);
  });

  it('returns -1 for an empty index', () => {
    const idx = new GridIndex(new Float64Array(0), new Float64Array(0), 1000);
    expect(idx.nearest(0, 0)).toBe(-1);
  });
});

describe('GridIndex.kthNearestDist', () => {
  /** Brute-force k-th nearest-other distance, for cross-checking the index. */
  function bruteKth(px, py, i, k) {
    const d = [];
    for (let j = 0; j < px.length; j++) {
      if (j === i) continue;
      d.push(Math.hypot(px[j] - px[i], py[j] - py[i]));
    }
    d.sort((a, b) => a - b);
    return d[Math.min(k, d.length) - 1];
  }

  it('matches a brute-force scan for every point and rank, past the cell size', () => {
    const { px, py } = lattice();
    const idx = new GridIndex(px, py, 1000);
    for (let i = 0; i < px.length; i++) {
      for (let k = 1; k <= 4; k++) {
        expect(idx.kthNearestDist(i, k)).toBeCloseTo(bruteKth(px, py, i, k), 9);
      }
    }
  });

  it('excludes the point itself: 1st nearest of a corner is the 1 km neighbour', () => {
    const { px, py } = lattice();
    const idx = new GridIndex(px, py, 1000);
    expect(idx.kthNearestDist(0, 1)).toBeCloseTo(1000, 9);
  });

  it('returns the farthest other when fewer than k others exist', () => {
    const px = new Float64Array([0, 3000]);
    const py = new Float64Array([0, 0]);
    const idx = new GridIndex(px, py, 1000);
    expect(idx.kthNearestDist(0, 5)).toBeCloseTo(3000, 9);
  });

  it('returns Infinity when the point is alone', () => {
    const idx = new GridIndex(new Float64Array([0]), new Float64Array([0]), 1000);
    expect(idx.kthNearestDist(0, 1)).toBe(Infinity);
  });
});
