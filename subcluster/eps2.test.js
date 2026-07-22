import { describe, it, expect } from 'vitest';
import { deriveEps2 } from './eps2.js';

/** Five points evenly spaced 1 km apart on a line; coordinates in metres. */
function line5() {
  return {
    px: new Float64Array([0, 1000, 2000, 3000, 4000]),
    py: new Float64Array([0, 0, 0, 0, 0]),
  };
}

describe('deriveEps2', () => {
  it('returns the median of the min2-th nearest-neighbour distances', () => {
    const { px, py } = line5();
    // 2nd-nearest-other distances are [2000,1000,1000,1000,2000]; median = 1000.
    expect(deriveEps2({ px, py, members: [0, 1, 2, 3, 4], min2: 2 })).toBeCloseTo(1000, 9);
  });

  it('is independent of member order', () => {
    const { px, py } = line5();
    const ordered = deriveEps2({ px, py, members: [0, 1, 2, 3, 4], min2: 2 });
    const shuffled = deriveEps2({ px, py, members: [3, 0, 4, 1, 2], min2: 2 });
    expect(shuffled).toBe(ordered);
  });

  it('returns null when a cluster has too few members for a min2-th neighbour', () => {
    const { px, py } = line5();
    // Need min2 *other* points, i.e. members.length > min2.
    expect(deriveEps2({ px, py, members: [0, 1, 2, 3], min2: 4 })).toBeNull();
    expect(deriveEps2({ px, py, members: [0, 1, 2, 3, 4], min2: 4 })).not.toBeNull();
  });
});
