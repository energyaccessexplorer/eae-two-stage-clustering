import { describe, it, expect } from 'vitest';
import { RasterField } from './raster-field.js';

// A 3×3 grid, top-left origin at (0, 3), 1-unit cells. Row-major, top row first:
//   row0 (y 2..3): 1 2 3
//   row1 (y 1..2): 4 5 6
//   row2 (y 0..1): 7 8 9
const base = {
  values: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  width: 3,
  height: 3,
  origin: [0, 3],
  nodata: -9999,
};

describe('RasterField sampling', () => {
  it('samples the correct cell for a standard (negative ry) raster', () => {
    const r = new RasterField({ ...base, resolution: [1, -1] });
    expect(r.sample(0.5, 2.5)).toBe(1); // top-left
    expect(r.sample(2.5, 0.5)).toBe(9); // bottom-right
    expect(r.sample(1.5, 1.5)).toBe(5); // centre
  });

  it('samples identically when the provider ships a POSITIVE ry (the orientation bug)', () => {
    const neg = new RasterField({ ...base, resolution: [1, -1] });
    const pos = new RasterField({ ...base, resolution: [1, 1] }); // e.g. the Nepal RWI tile
    for (const [lon, lat] of [
      [0.5, 2.5],
      [2.5, 0.5],
      [1.5, 1.5],
      [0.5, 0.5],
    ]) {
      expect(pos.sample(lon, lat)).toBe(neg.sample(lon, lat));
    }
  });

  it('distinguishes outside-extent from nodata', () => {
    const r = new RasterField({
      ...base,
      resolution: [1, 1],
      values: [1, 2, 3, 4, -9999, 6, 7, 8, 9],
    });
    expect(r.sample(10, 10)).toBeNull(); // outside
    expect(r.covers(10, 10)).toBe(false);
    expect(r.sample(1.5, 1.5)).toBeNull(); // nodata cell
    expect(r.covers(1.5, 1.5)).toBe(true); // still inside the extent
  });
});
