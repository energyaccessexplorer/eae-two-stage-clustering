/**
 * subcluster/stats.js — population-weighted statistics for a group of points.
 *
 * The single place the pass-2 reporting rules of spec §3.3–§3.4 are enforced, shared
 * by sub-areas, the last-mile layer, and the unknown group so the maths is identical
 * everywhere. Population is summed; ability-to-pay is only ever a population-weighted
 * mean, never summed. This keeps output/ a pure formatter with no domain arithmetic.
 */

/**
 * Summarise one group of points.
 *
 * A member with no population is counted (`missingPopCount`) and kept in the group
 * (still shown on the map), but is excluded from the weighted mean — the mean is
 * never silently replaced by an unweighted one (spec §3.4). A member with no
 * ability-to-pay contributes to the population sum but not to the mean; a group with
 * no usable (population, ability) pair reports a null mean rather than a fabricated
 * value (spec §3.6).
 *
 * @param {number[]} members point indices into `ability`/`population`
 * @param {Array<number|null>|Float64Array} ability ability-to-pay ratio per point
 * @param {Array<number|null>|Float64Array} population population count per point
 * @returns {{ population: number, meanAbilityToPay: number|null, missingPopCount: number }}
 *   population sum, population-weighted mean ability (or null), and the count of
 *   members lacking population
 * @determinism Pure; independent of member order up to floating-point summation.
 */
export function weightedStats(members, ability, population) {
  let popSum = 0;
  let weighted = 0;
  let weightSum = 0;
  let missingPopCount = 0;
  for (const m of members) {
    const pop = population[m];
    const hasPop = Number.isFinite(pop);
    if (hasPop) popSum += pop;
    else missingPopCount++;
    if (hasPop && Number.isFinite(ability[m])) {
      weighted += pop * ability[m];
      weightSum += pop;
    }
  }
  return {
    population: popSum,
    meanAbilityToPay: weightSum > 0 ? weighted / weightSum : null,
    missingPopCount,
  };
}
