import { describe, it, expect } from 'vitest';
import { cluster_features } from '../cluster/features.js';
import { merge_point_datasets } from '../io/points.js';
import { makeDataset, makeRaster, makeScenarios } from './fixtures/pass1/inputs.mjs';

// The golden master freezes pass-1's *numbers*. These tests cover the guarantees it
// cannot see: determinism, a stable result shape, and the reporting of constraints
// that were requested but could not be applied.

const points = merge_point_datasets([makeDataset()]);
const raster = makeRaster();
const scenarios = makeScenarios(points, raster);
const rasters = { pop: raster };

/** The raster spans lon 36.70..36.96, lat -1.39..-1.19; this sits well outside it. */
const OUTSIDE = { id: 'outside:0', lon: 40.5, lat: -5.5 };

describe('determinism', () => {
  for (const name of ['dbscan_cluster_weight_allocate', 'hdbscan_cluster_weight']) {
    it(`${name} produces identical labels on a second run`, () => {
      const first = cluster_features(scenarios[name]);
      const second = cluster_features(scenarios[name]);
      expect(Array.from(second.labels)).toEqual(Array.from(first.labels));
      expect(second.clusters.map((c) => c.id)).toEqual(first.clusters.map((c) => c.id));
    });
  }
});

describe('result shape', () => {
  it('is identical whether or not any point survives filtering', () => {
    const base = { points, algorithm: 'dbscan', rasters, eps_km: 1.5, min_pts: 5 };
    const normal = cluster_features(base);
    // A floor no cell can meet removes every point.
    const empty = cluster_features({
      ...base,
      filters: [{ raster: 'pop', op: '>=', value: 1e9 }],
    });
    expect(empty.clusters).toEqual([]);
    expect(Object.keys(empty).sort()).toEqual(Object.keys(normal).sort());
  });
});

describe('min_pop floors', () => {
  const base = { points, algorithm: 'dbscan', rasters, eps_km: 1.5, min_pts: 5 };

  it('are enforced when a finite min_pop is given', () => {
    const out = cluster_features({
      ...base,
      weighted: true,
      // No neighbourhood can hold this many people, so nothing may become a core point.
      weights: [{ raster: 'pop', allocation: 'allocate', min_pop: 1e12 }],
    });
    expect(out.floors).toEqual({ requested: true, applied: true, skipped: [] });
    expect(out.clusters).toEqual([]);
  });

  it('are reported as skipped, not silently dropped, when min_pop is missing', () => {
    const withoutFloor = cluster_features({
      ...base,
      weighted: true,
      weights: [{ raster: 'pop', allocation: 'allocate' }],
    });
    expect(withoutFloor.floors).toEqual({
      requested: true,
      applied: false,
      skipped: ['pop'],
    });
    // And the run really did proceed unfloored, matching the un-weighted request.
    const unfloored = cluster_features({
      ...base,
      weights: [{ raster: 'pop', allocation: 'allocate' }],
    });
    expect(Array.from(withoutFloor.labels)).toEqual(Array.from(unfloored.labels));
  });

  it('are reported as skipped on the HDBSCAN path, which has no floor to apply', () => {
    const out = cluster_features({
      ...scenarios.hdbscan_cluster_weight,
      weighted: true,
      weights: [{ raster: 'pop', allocation: 'allocate', min_pop: 3000 }],
    });
    expect(out.floors).toEqual({ requested: true, applied: false, skipped: ['pop'] });
  });

  it('are not requested when the weighted flag is off', () => {
    const out = cluster_features(scenarios.dbscan_rank_by);
    expect(out.floors).toEqual({ requested: false, applied: false, skipped: [] });
  });
});

describe('raster coverage reporting', () => {
  const filters = [{ raster: 'pop', op: '>=', value: 20 }];

  it('counts points filtered while outside the raster extent', () => {
    const out = cluster_features({
      points: [...points, OUTSIDE],
      algorithm: 'dbscan',
      rasters,
      eps_km: 1.5,
      min_pts: 5,
      filters,
    });
    expect(out.points_outside_raster).toEqual({ pop: 1 });
    // The point read as 0 and so was filtered out, exactly as before — this is a
    // report of a data-alignment problem, not a change of behaviour.
    expect(out.filtered_ids).toContain(OUTSIDE.id);
  });

  it('reports nothing when every point falls inside the raster', () => {
    const out = cluster_features(scenarios.dbscan_filter);
    expect(out.points_outside_raster).toEqual({});
  });
});
