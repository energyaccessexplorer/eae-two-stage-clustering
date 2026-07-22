import { describe, it, expect } from 'vitest';
import { respatialiseBand } from './respatialise.js';
import { NOISE } from '../cluster/labels.js';

/**
 * Two tight 4-point blobs 10 km apart, plus one far outlier. Coordinates in metres;
 * index layout: blob A = 0..3, blob B = 4..7, outlier = 8.
 */
function twoBlobsAndOutlier() {
  const px = new Float64Array([0, 50, 0, 50, 10000, 10050, 10000, 10050, 100000]);
  const py = new Float64Array([0, 0, 50, 50, 0, 0, 50, 50, 100000]);
  return { px, py };
}

describe('respatialiseBand', () => {
  it('separates two contiguous blobs into two sub-areas', () => {
    const { px, py } = twoBlobsAndOutlier();
    const labels = respatialiseBand({
      px,
      py,
      members: [0, 1, 2, 3, 4, 5, 6, 7],
      eps2m: 200,
      min2: 2,
    });
    // Each blob is one label; the two blobs differ; nothing is noise.
    expect(labels[0]).toBe(labels[1]);
    expect(labels[0]).toBe(labels[3]);
    expect(labels[4]).toBe(labels[7]);
    expect(labels[0]).not.toBe(labels[4]);
    expect([...labels].filter((l) => l === NOISE)).toHaveLength(0);
    expect(new Set(labels).size).toBe(2);
  });

  it('marks an isolated point as noise (a scattered point)', () => {
    const { px, py } = twoBlobsAndOutlier();
    const labels = respatialiseBand({
      px,
      py,
      members: [0, 1, 2, 3, 8],
      eps2m: 200,
      min2: 2,
    });
    // The blob (first four) clusters; the outlier at index position 4 is noise.
    expect(labels[4]).toBe(NOISE);
    expect(labels[0]).not.toBe(NOISE);
  });
});
