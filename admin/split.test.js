import { describe, it, expect } from 'vitest';
import { runPass2 } from '../subcluster/pass2.js';
import { splitClusterByAdmin } from './split.js';

// One cluster of nine points: four in admin unit A, four in B, one outside both.
const n = 9;
const px = new Float64Array(n);
const py = new Float64Array(n);
const labels = new Int32Array(n).fill(1);
const ability = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const population = new Float64Array(n).fill(1);
const pointUnit = new Int32Array([0, 0, 0, 0, 1, 1, 1, 1, -1]);
const units = [{ id: 'A' }, { id: 'B' }];

const pass2 = runPass2({ px, py, labels, ability, population });

describe('splitClusterByAdmin', () => {
  const result = splitClusterByAdmin({
    parentClusterId: 1,
    pass2,
    pointUnit,
    units,
    px,
    py,
    ability,
    population,
  });

  it('partitions the cluster into one piece per admin unit, outside points last', () => {
    expect(result.parentClusterId).toBe(1);
    expect(result.pieces.map((p) => p.adminUnitId)).toEqual(['A', 'B', null]);
  });

  it('recomputes pass 2 within each piece over its own members only', () => {
    const memberCount = (piece) =>
      piece.pass2.clusters.reduce(
        (sum, c) => sum + c.subAreas.reduce((s, sub) => s + sub.memberIndices.length, 0),
        0
      );
    expect(result.pieces.map(memberCount)).toEqual([4, 4, 1]);
  });

  it('throws for a cluster id that is not present', () => {
    expect(() =>
      splitClusterByAdmin({
        parentClusterId: 99,
        pass2,
        pointUnit,
        units,
        px,
        py,
        ability,
        population,
      })
    ).toThrow(/not found/);
  });
});
