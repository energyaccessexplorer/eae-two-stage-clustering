import { describe, it, expect } from 'vitest';
import { absoluteLegendStops, bandRankLegend } from './legend.js';

describe('absoluteLegendStops', () => {
  const ramp = { low: '#000000', high: '#ffffff' };

  it('produces ascending value stops from min to max', () => {
    const stops = absoluteLegendStops([0, 10], 3, ramp);
    expect(stops.map((s) => s.value)).toEqual([0, 5, 10]);
    expect(stops[0].color).toBe('#000000');
    expect(stops[2].color).toBe('#ffffff');
  });

  it('never produces fewer than two stops', () => {
    expect(absoluteLegendStops([0, 1], 1, ramp)).toHaveLength(2);
  });
});

describe('bandRankLegend', () => {
  it('lists one row per band with its within-cluster range and relative label', () => {
    const cluster = {
      k: 3,
      subAreas: [
        { band: 0, bandValueRange: [0, 2] },
        { band: 0, bandValueRange: [0, 2] }, // second sub-area of band 0
        { band: 2, bandValueRange: [7, 9] },
        { band: 1, bandValueRange: [3, 6] },
      ],
    };
    expect(bandRankLegend(cluster)).toEqual([
      { band: 0, label: 'lowest third', range: [0, 2] },
      { band: 1, label: 'second-lowest third', range: [3, 6] },
      { band: 2, label: 'highest third', range: [7, 9] },
    ]);
  });
});
