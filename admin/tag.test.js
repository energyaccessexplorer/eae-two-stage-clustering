import { describe, it, expect } from 'vitest';
import { parseAdminUnits, locatePoints, clusterStraddles, adminUnitsOf } from './tag.js';

/** Two 10×10 squares: A at the origin, B shifted 20° east; ids via properties.name. */
function adminFC() {
  const square = (x0, name) => ({
    type: 'Feature',
    properties: { name },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x0, 0],
          [x0 + 10, 0],
          [x0 + 10, 10],
          [x0, 10],
          [x0, 0],
        ],
      ],
    },
  });
  return { type: 'FeatureCollection', features: [square(0, 'A'), square(20, 'B')] };
}

const units = parseAdminUnits(adminFC());
const points = [
  { lon: 5, lat: 5 }, // in A
  { lon: 25, lat: 5 }, // in B
  { lon: 2, lat: 2 }, // in A
  { lon: 100, lat: 100 }, // outside both
];
const pointUnit = locatePoints(points, units);

describe('parseAdminUnits', () => {
  it('resolves ids and bounding boxes', () => {
    expect(units.map((u) => u.id)).toEqual(['A', 'B']);
    expect(units[0].bbox).toEqual([0, 0, 10, 10]);
  });
});

describe('locatePoints', () => {
  it('locates each point, -1 when outside every unit', () => {
    expect([...pointUnit]).toEqual([0, 1, 0, -1]);
  });
});

describe('adminUnitsOf', () => {
  it('lists distinct in-unit ids, excluding outside points', () => {
    expect(adminUnitsOf([0, 1], pointUnit, units)).toEqual(['A', 'B']);
    expect(adminUnitsOf([2, 3], pointUnit, units)).toEqual(['A']);
  });
});

describe('clusterStraddles', () => {
  it('flags a cluster whose members fall in more than one admin unit', () => {
    const pass2 = {
      clusters: [
        { parentClusterId: 1, subAreas: [{ memberIndices: [0, 1] }], unknown: null },
        { parentClusterId: 2, subAreas: [{ memberIndices: [2] }], unknown: { memberIndices: [3] } },
      ],
    };
    expect(clusterStraddles(pass2, pointUnit, units)).toEqual([
      { parentClusterId: 1, adminUnitIds: ['A', 'B'], straddle: true },
      { parentClusterId: 2, adminUnitIds: ['A'], straddle: false },
    ]);
  });
});
