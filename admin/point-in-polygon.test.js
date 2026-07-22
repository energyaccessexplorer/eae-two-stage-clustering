import { describe, it, expect } from 'vitest';
import { pointInPolygon, pointInMultiPolygon } from './point-in-polygon.js';

// A unit square with a square hole in the middle.
const withHole = [
  [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ],
  [
    [4, 4],
    [6, 4],
    [6, 6],
    [4, 6],
    [4, 4],
  ],
];

describe('pointInPolygon', () => {
  it('is inside the outer ring', () => {
    expect(pointInPolygon(1, 1, withHole)).toBe(true);
  });

  it('is outside when in a hole', () => {
    expect(pointInPolygon(5, 5, withHole)).toBe(false);
  });

  it('is outside the outer ring', () => {
    expect(pointInPolygon(20, 20, withHole)).toBe(false);
  });
});

describe('pointInMultiPolygon', () => {
  const two = [
    [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
    ],
    [
      [
        [10, 10],
        [12, 10],
        [12, 12],
        [10, 12],
        [10, 10],
      ],
    ],
  ];

  it('is inside if within any polygon', () => {
    expect(pointInMultiPolygon(1, 1, two)).toBe(true);
    expect(pointInMultiPolygon(11, 11, two)).toBe(true);
  });

  it('is outside if within none', () => {
    expect(pointInMultiPolygon(5, 5, two)).toBe(false);
  });
});
