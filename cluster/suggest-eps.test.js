import { describe, it, expect } from 'vitest';
import { suggestEps1 } from './suggest-eps.js';
import { EARTH_R, DEG2RAD } from '../geo/projector.js';

// Build EPSG:4326 points from km offsets around the equator (so km ≈ projected metres).
const M_PER_DEG = EARTH_R * DEG2RAD;
const at = (kx, ky) => ({ lon: 37 + (kx * 1000) / M_PER_DEG, lat: (ky * 1000) / M_PER_DEG });

describe('suggestEps1', () => {
  it('returns a knee near the within-cluster spacing, not the far gaps', () => {
    // A dense 10×10 lattice at 0.1 km spacing, plus a few distant outliers.
    const points = [];
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) points.push(at(i * 0.1, j * 0.1));
    for (const d of [30, 45, 60]) points.push(at(d, d));
    const eps = suggestEps1(points, 4);
    // Should sit around the lattice spacing (~0.1–0.15 km), far below the 30+ km gaps.
    expect(eps).toBeGreaterThan(0.05);
    expect(eps).toBeLessThan(2);
  });

  it('is deterministic and returns null when there are too few points', () => {
    const points = Array.from({ length: 20 }, (_, i) => at(i * 0.2, 0));
    expect(suggestEps1(points, 4)).toBe(suggestEps1(points, 4));
    expect(suggestEps1([at(0, 0), at(1, 0)], 4)).toBeNull();
  });
});
