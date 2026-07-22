import { describe, it, expect } from 'vitest';
import { weightedStats } from './stats.js';

describe('weightedStats', () => {
  const ability = [1, 3, 5, 2, 9];
  const population = [10, 30, null, 20, 0];

  it('sums population and population-weights the mean', () => {
    // members 0,1: pop 10+30 = 40; mean = (10*1 + 30*3) / 40 = 2.5.
    expect(weightedStats([0, 1], ability, population)).toEqual({
      population: 40,
      meanAbilityToPay: 2.5,
      missingPopCount: 0,
    });
  });

  it('counts a missing-population member and excludes it from the mean', () => {
    // member 2 has no population: counted, contributes nothing to sum or mean.
    expect(weightedStats([0, 2], ability, population)).toEqual({
      population: 10,
      meanAbilityToPay: 1, // only member 0 weighs in
      missingPopCount: 1,
    });
  });

  it('excludes a missing-ability member from the mean but keeps its population', () => {
    const ab = [4, null];
    const pop = [10, 90];
    expect(weightedStats([0, 1], ab, pop)).toEqual({
      population: 100, // both populations summed
      meanAbilityToPay: 4, // only the member with ability weighs in
      missingPopCount: 0,
    });
  });

  it('returns a null mean when no member has both population and ability', () => {
    expect(weightedStats([2], ability, population)).toEqual({
      population: 0,
      meanAbilityToPay: null,
      missingPopCount: 1,
    });
  });

  it('treats zero population as present but zero-weight', () => {
    // member 4 has population 0: no missing flag, but it cannot weigh the mean.
    expect(weightedStats([4], ability, population)).toEqual({
      population: 0,
      meanAbilityToPay: null,
      missingPopCount: 0,
    });
  });
});
