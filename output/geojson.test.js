import { describe, it, expect } from 'vitest';
import { runPass2 } from '../subcluster/pass2.js';
import { buildFeatureCollection } from './geojson.js';

// One homogeneous cluster (single unit) with a with-no-ability point (unknown), plus
// a pass-1 noise point (last-mile). Coordinates for clustering are irrelevant to the
// formatter, so px/py are zero; lon/lat drive the emitted geometry.
const pass2 = runPass2({
  px: new Float64Array(4),
  py: new Float64Array(4),
  labels: new Int32Array([1, 1, 1, -1]),
  ability: [2, 2, null, 2],
  population: [10, 10, 5, 7],
});
const points = [
  { lon: 0, lat: 0 },
  { lon: 1, lat: 1 },
  { lon: 2, lat: 2 },
  { lon: 3, lat: 3 },
];

describe('buildFeatureCollection', () => {
  const fc = buildFeatureCollection({ pass2, points });

  it('is a FeatureCollection with subarea, unknown, then last_mile features in order', () => {
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.map((f) => f.properties.kind)).toEqual(['subarea', 'unknown', 'last_mile']);
  });

  it('emits MultiPoint geometry of the member points, with bbox and centroid', () => {
    const sub = fc.features[0];
    expect(sub.geometry).toEqual({
      type: 'MultiPoint',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    });
    expect(sub.bbox).toEqual([0, 0, 1, 1]);
    expect(sub.properties.centroid).toEqual([0.5, 0.5]);
    expect(sub.properties.point_count).toBe(2);
  });

  it('carries the spec §6.1 sub-area properties', () => {
    const p = fc.features[0].properties;
    expect(p).toMatchObject({
      kind: 'subarea',
      subarea_id: '1-b0-s1',
      parent_cluster_id: 1,
      band: 0,
      band_value_range: [2, 2],
      population: 20,
      mean_ability_to_pay: 2,
      admin_units: null,
      straddle: false,
      has_unknown: true,
      scattered: false,
      missing_population_count: 0,
    });
    expect(fc.features[0].id).toBe('1-b0-s1');
  });

  it('reports the unknown group with a null mean but a real population', () => {
    const p = fc.features[1].properties;
    expect(p.kind).toBe('unknown');
    expect(p.subarea_id).toBe('1-unknown');
    expect(p.band).toBeNull();
    expect(p.population).toBe(5);
    expect(p.mean_ability_to_pay).toBeNull();
  });

  it('reports the last-mile group with no parent and a summary', () => {
    const p = fc.features[2].properties;
    expect(p.kind).toBe('last_mile');
    expect(p.subarea_id).toBe('last-mile');
    expect(p.parent_cluster_id).toBeNull();
    expect(p.population).toBe(7);
    expect(p.mean_ability_to_pay).toBe(2);
  });

  it('attaches the provenance meta block only when provided', () => {
    expect(fc.meta).toBeUndefined();
    const withMeta = buildFeatureCollection({ pass2, points, meta: { tool: { version: 'x' } } });
    expect(withMeta.meta).toEqual({ tool: { version: 'x' } });
  });

  it('fills admin_units and straddle when admin tagging is supplied', () => {
    // Sub-area members are points 0 and 1; put them in different admin units → straddle.
    const admin = { pointUnit: new Int32Array([0, 1, -1, 0]), units: [{ id: 'A' }, { id: 'B' }] };
    const tagged = buildFeatureCollection({ pass2, points, admin });
    expect(tagged.features[0].properties.admin_units).toEqual(['A', 'B']);
    expect(tagged.features[0].properties.straddle).toBe(true);
    // The unknown group's single point is outside all units.
    expect(tagged.features[1].properties.admin_units).toEqual([]);
    expect(tagged.features[1].properties.straddle).toBe(false);
  });

  it('rounds population to an integer count', () => {
    const fractional = runPass2({
      px: new Float64Array(2),
      py: new Float64Array(2),
      labels: new Int32Array([1, 1]),
      ability: [2, 2],
      population: [10.4, 10.4],
    });
    const fc2 = buildFeatureCollection({ pass2: fractional, points });
    expect(fc2.features[0].properties.population).toBe(21); // 20.8 → 21
  });
});
