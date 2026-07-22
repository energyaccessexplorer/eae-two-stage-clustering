import { describe, it, expect } from 'vitest';
import { bandLabel, subareaLabel } from './labels.js';

describe('bandLabel', () => {
  it('uses lowest/highest relative language for the extremes', () => {
    expect(bandLabel(0, 5)).toBe('lowest fifth');
    expect(bandLabel(4, 5)).toBe('highest fifth');
  });

  it('names the middle bands by rank from the bottom', () => {
    expect(bandLabel(1, 5)).toBe('second-lowest fifth');
    expect(bandLabel(2, 5)).toBe('third-lowest fifth');
  });

  it('adapts the fraction word to the band count', () => {
    expect(bandLabel(0, 2)).toBe('lowest half');
    expect(bandLabel(1, 2)).toBe('highest half');
  });

  it('calls a single-band cluster the whole area', () => {
    expect(bandLabel(0, 1)).toBe('whole area');
  });
});

describe('subareaLabel', () => {
  it('reads as within-this-area language', () => {
    expect(subareaLabel({ band: 0, scattered: false }, 5)).toBe('lowest fifth of this area');
  });

  it('marks the scattered sub-area', () => {
    expect(subareaLabel({ band: 0, scattered: true }, 5)).toBe(
      'scattered points — lowest fifth of this area'
    );
  });
});
