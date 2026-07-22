import { describe, it, expect } from 'vitest';
import { absoluteValueDomain, absoluteView, bandRankFill, DEFAULT_THEME } from './style.js';

const ramp = { low: '#000000', high: '#ffffff' };
const theme = { ...DEFAULT_THEME, ramp };

// Two clusters; one sub-area has no measured mean (null).
const pass2 = {
  clusters: [
    {
      parentClusterId: 1,
      k: 2,
      subAreas: [
        { subAreaId: '1-b0-s1', band: 0, meanAbilityToPay: 0 },
        { subAreaId: '1-b1-s1', band: 1, meanAbilityToPay: 10 },
      ],
    },
    {
      parentClusterId: 2,
      k: 1,
      subAreas: [{ subAreaId: '2-b0-s1', band: 0, meanAbilityToPay: null }],
    },
  ],
};

describe('absoluteValueDomain', () => {
  it('spans the min and max measured means, ignoring nulls', () => {
    expect(absoluteValueDomain(pass2)).toEqual([0, 10]);
  });

  it('is null when nothing is measured', () => {
    expect(
      absoluteValueDomain({ clusters: [{ subAreas: [{ meanAbilityToPay: null }] }] })
    ).toBeNull();
  });
});

describe('absoluteView', () => {
  const { domain, fillOf } = absoluteView(pass2, theme);

  it('colours by absolute value on the shared ramp', () => {
    expect(domain).toEqual([0, 10]);
    expect(fillOf(pass2.clusters[0].subAreas[0])).toBe('#000000'); // value 0 → low
    expect(fillOf(pass2.clusters[0].subAreas[1])).toBe('#ffffff'); // value 10 → high
  });

  it('paints a value-less sub-area with the neutral unknown fill', () => {
    expect(fillOf(pass2.clusters[1].subAreas[0])).toBe(theme.unknownFill);
  });

  it('paints everything unknown when no value exists', () => {
    const none = { clusters: [{ subAreas: [{ meanAbilityToPay: null }] }] };
    const view = absoluteView(none, theme);
    expect(view.domain).toBeNull();
    expect(view.fillOf(none.clusters[0].subAreas[0])).toBe(theme.unknownFill);
  });
});

describe('bandRankFill', () => {
  it('shades band 0 palest and band k-1 deepest within the cluster', () => {
    expect(bandRankFill({ band: 0 }, 5, theme)).toBe('#000000');
    expect(bandRankFill({ band: 4 }, 5, theme)).toBe('#ffffff');
  });
});
