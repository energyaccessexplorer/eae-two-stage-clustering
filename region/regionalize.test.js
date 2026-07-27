import { describe, it, expect } from 'vitest';
import { regionalize } from './regionalize.js';

// Nine points evenly spaced on a line (1 km apart). Value has a low pocket in the
// middle: [10,10,10, 0,0,0, 10,10,10]. Coordinates are metres.
const px = Float64Array.from({ length: 9 }, (_, i) => i * 1000);
const py = new Float64Array(9);
const values = [10, 10, 10, 0, 0, 0, 10, 10, 10];
const members = [...Array(9).keys()];

describe('regionalize', () => {
  it('cuts a line at its value boundaries into contiguous regions', () => {
    const labels = regionalize({ px, py, values, members, targetRegions: 3, knn: 2 });
    // The low-value middle becomes its own region, flanked by two high-value regions.
    expect([...labels]).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });

  it('returns a single region when one is requested', () => {
    const labels = regionalize({ px, py, values, members, targetRegions: 1, knn: 2 });
    expect([...labels]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('keeps each region spatially contiguous and value-similar', () => {
    const labels = regionalize({ px, py, values, members, targetRegions: 3, knn: 2 });
    // The middle region holds exactly the zero-value points.
    const mid = members.filter((m) => labels[m] === 2);
    expect(mid).toEqual([3, 4, 5]);
    expect(mid.every((m) => values[m] === 0)).toBe(true);
  });

  it('is deterministic', () => {
    const opts = { px, py, values, members, targetRegions: 3, knn: 2 };
    expect([...regionalize(opts)]).toEqual([...regionalize(opts)]);
  });
});
