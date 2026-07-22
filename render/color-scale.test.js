import { describe, it, expect } from 'vitest';
import { interpolateHex, makeSequentialScale } from './color-scale.js';

describe('interpolateHex', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(interpolateHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(interpolateHex('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('interpolates the midpoint', () => {
    expect(interpolateHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('clamps out-of-range t', () => {
    expect(interpolateHex('#000000', '#ffffff', -1)).toBe('#000000');
    expect(interpolateHex('#000000', '#ffffff', 2)).toBe('#ffffff');
  });
});

describe('makeSequentialScale', () => {
  const scale = makeSequentialScale(0, 10, { low: '#000000', high: '#ffffff' });

  it('maps the domain ends to the ramp ends', () => {
    expect(scale(0)).toBe('#000000');
    expect(scale(10)).toBe('#ffffff');
    expect(scale(5)).toBe('#808080');
  });

  it('maps everything to the low end when the domain is degenerate', () => {
    const flat = makeSequentialScale(5, 5, { low: '#000000', high: '#ffffff' });
    expect(flat(5)).toBe('#000000');
  });
});
