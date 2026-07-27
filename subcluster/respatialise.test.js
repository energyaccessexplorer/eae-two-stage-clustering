import { describe, it, expect } from 'vitest';
import { respatialiseBand, respatialiseBandHdbscan } from './respatialise.js';
import { NOISE } from '../cluster/labels.js';

/** A k×k lattice of points at `step` m spacing, anchored at (cx, cy). */
function lattice(cx, cy, k, step) {
  const pts = [];
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) pts.push([cx + i * step, cy + j * step]);
  return pts;
}

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

describe('respatialiseBandHdbscan', () => {
  // Two dense 4×4 lattices 10 km apart (16 points each), plus one far outlier.
  const a = lattice(0, 0, 4, 50);
  const b = lattice(10000, 0, 4, 50);
  const all = [...a, ...b, [80000, 80000]];
  const px = Float64Array.from(all, (p) => p[0]);
  const py = Float64Array.from(all, (p) => p[1]);

  it('separates two density peaks into two sub-areas', () => {
    const members = [...Array(32).keys()]; // the two lattices only
    const labels = respatialiseBandHdbscan({
      px,
      py,
      members,
      minClusterSize: 4,
      minSamples: 4,
      maxLinkM: 300,
    });
    const clusters = new Set([...labels].filter((l) => l !== NOISE));
    expect(clusters.size).toBe(2);
    // Every point of lattice A shares one label; lattice B shares another.
    expect(new Set([...labels].slice(0, 16))).toEqual(new Set([labels[0]]));
    expect(labels[0]).not.toBe(labels[16]);
  });

  it('marks a far outlier as noise', () => {
    const members = [...Array(33).keys()]; // includes the outlier at index 32
    const labels = respatialiseBandHdbscan({
      px,
      py,
      members,
      minClusterSize: 4,
      minSamples: 4,
      maxLinkM: 300,
    });
    expect(labels[32]).toBe(NOISE);
  });

  it('is deterministic', () => {
    const members = [...Array(32).keys()];
    const opts = { px, py, members, minClusterSize: 4, minSamples: 4, maxLinkM: 300 };
    expect([...respatialiseBandHdbscan(opts)]).toEqual([...respatialiseBandHdbscan(opts)]);
  });
});
