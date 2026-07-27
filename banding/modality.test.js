import { describe, it, expect } from 'vitest';
import { bimodalityCoefficient, isUnimodal, UNIFORM_BC } from './modality.js';

// Two separated point masses — strongly bimodal.
const bimodal = [...Array(10).fill(0), ...Array(10).fill(100)];
// A tight central peak with light tails — clearly unimodal.
const unimodal = [5, 5, 5, 5, 5, 5, 5, 5, 4, 6];

describe('bimodalityCoefficient', () => {
  it('exceeds the uniform reference for a bimodal distribution', () => {
    expect(bimodalityCoefficient(bimodal)).toBeGreaterThan(UNIFORM_BC);
    expect(bimodalityCoefficient(bimodal)).toBeGreaterThan(0.7);
  });

  it('is below the uniform reference for a unimodal distribution', () => {
    expect(bimodalityCoefficient(unimodal)).toBeLessThan(UNIFORM_BC);
    expect(bimodalityCoefficient(unimodal)).toBeLessThan(0.2);
  });

  it('is null when it cannot be computed', () => {
    expect(bimodalityCoefficient([1, 2, 3])).toBeNull(); // fewer than 4 values
    expect(bimodalityCoefficient([2, 2, 2, 2, 2])).toBeNull(); // no spread
  });

  it('is deterministic and order-independent', () => {
    const shuffled = [
      100, 0, 100, 0, 0, 100, 0, 100, 0, 100, 0, 100, 0, 100, 0, 100, 0, 100, 0, 100,
    ];
    expect(bimodalityCoefficient(shuffled)).toBeCloseTo(bimodalityCoefficient(bimodal), 12);
  });
});

describe('isUnimodal', () => {
  it('is true for a smooth distribution, false for a multimodal one', () => {
    expect(isUnimodal(unimodal)).toBe(true);
    expect(isUnimodal(bimodal)).toBe(false);
  });

  it('is false when the coefficient cannot be computed (so the caller still bands)', () => {
    expect(isUnimodal([1, 2, 3])).toBe(false);
    expect(isUnimodal([2, 2, 2, 2])).toBe(false);
  });

  it('honours a custom threshold', () => {
    // With a threshold above the bimodal value, even the bimodal set reads as one mode.
    expect(isUnimodal(bimodal, 0.9)).toBe(true);
  });
});
