import { describe, it, expect } from 'vitest';
import { buildProvenance } from './provenance.js';

const pass2 = {
  params: { min2: 4, eps2Rule: 'median-min2-nn', eps2OverrideKm: null, banding: {} },
  clusters: [
    { parentClusterId: 1, k: 3, method: 'fisher-jenks', flag: null },
    { parentClusterId: 2, k: 1, method: 'single-unit', flag: 'homogeneous' },
  ],
};

const args = {
  pass2,
  abilityLayer: { id: 'rwi', vintage: '2021' },
  populationLayer: { id: 'ghs-pop', vintage: '2020' },
  adminDataset: { id: 'gadm', version: '4.1' },
  pass1: { algorithm: 'dbscan', eps1Km: 1.5, min1: 5 },
  bandMode: 'default',
  sizeThreshold: 5000,
  toolVersion: '0.1.0',
  pointCount: 4200,
  timestamp: '2026-07-21T00:00:00Z',
};

describe('buildProvenance', () => {
  const meta = buildProvenance(args);

  it('records tool identity, point count, CRS, and distance method with defaults', () => {
    expect(meta.tool).toEqual({ version: '0.1.0', generatedAt: '2026-07-21T00:00:00Z' });
    expect(meta.pointCount).toBe(4200);
    expect(meta.crs).toBe('EPSG:4326');
    expect(meta.clusteringDistanceMethod).toBe('projected-equirectangular');
  });

  it('records all three layer identities', () => {
    expect(meta.layers).toEqual({
      abilityToPay: { id: 'rwi', vintage: '2021' },
      population: { id: 'ghs-pop', vintage: '2020' },
      admin: { id: 'gadm', version: '4.1' },
    });
  });

  it('records pass-1 and pass-2 parameters', () => {
    expect(meta.params.pass1).toEqual({ algorithm: 'dbscan', eps1Km: 1.5, min1: 5 });
    expect(meta.params.pass2).toEqual({
      min2: 4,
      eps2Rule: 'median-min2-nn',
      eps2OverrideKm: null,
      bandMode: 'default',
      sizeThreshold: 5000,
    });
  });

  it('records the banding method and band count actually used per cluster', () => {
    expect(meta.banding.perCluster).toEqual([
      { parentClusterId: 1, bandCount: 3, method: 'fisher-jenks', flag: null },
      { parentClusterId: 2, bandCount: 1, method: 'single-unit', flag: 'homogeneous' },
    ]);
  });

  it('records the resolution ceiling caveat from the ability layer', () => {
    const m = buildProvenance({ ...args, resolutionCeilingKm: 3.09 });
    expect(m.caveats.resolutionCeilingKm).toBe(3.09);
    expect(m.caveats.note).toMatch(/3\.09 km/);
    // Defaults to null / "unknown" when not supplied.
    expect(buildProvenance(args).caveats.resolutionCeilingKm).toBeNull();
    expect(buildProvenance(args).caveats.note).toMatch(/unknown/);
  });

  it('allows admin to be absent and distance method to be overridden', () => {
    const m = buildProvenance({ ...args, adminDataset: null, distanceMethod: 'haversine' });
    expect(m.layers.admin).toBeNull();
    expect(m.clusteringDistanceMethod).toBe('haversine');
  });
});
