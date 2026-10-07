/**
 * render/style.js — decide a sub-area's fill colour under each view mode (spec §3.8).
 *
 * Two honest views, no global band-index legend ever:
 *  - 'absolute' (default): colour by ABSOLUTE ability-to-pay on one shared ramp, so the
 *    same colour means the same value across every cluster.
 *  - 'band-rank' (within-cluster inspection): shade by band rank inside the parent
 *    cluster only, paired with that cluster's own value-range legend (render/legend.js).
 *
 * Last-mile and unknown groups, and sub-areas whose weighted mean is null (no measured
 * population), are painted a neutral chrome grey rather than placed on the value ramp.
 * Neutral greys come from the caller's theme (fed from eae-design-tokens.css) so nothing
 * brand-related is hardcoded here; only the data ramp — which is deliberately non-brand
 * — has built-in defaults.
 */

import { makeSequentialScale, NEUTRAL_RAMP } from './color-scale.js';

/**
 * Default neutral theme. `unknownFill`/`lastMileFill` mirror the --eae-muted / --eae-border
 * tokens; the HTML should override them with the resolved token values.
 */
export const DEFAULT_THEME = {
  ramp: NEUTRAL_RAMP,
  unknownFill: '#c9ccce',
  lastMileFill: '#9da0a2',
};

/**
 * Global value domain for the absolute ramp: the min and max population-weighted mean
 * across every sub-area with a measured value.
 * @param {object} pass2 the {@link import('../subcluster/pass2.js').runPass2} result
 * @returns {[number, number]|null} [min, max], or null when no sub-area has a value
 */
export function absoluteValueDomain(pass2) {
  let min = Infinity;
  let max = -Infinity;
  for (const cluster of pass2.clusters) {
    for (const sub of cluster.subAreas) {
      const v = sub.meanAbilityToPay;
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return min <= max ? [min, max] : null;
}

/**
 * A ready-to-use fill function for the absolute view over a whole pass-2 result.
 * @param {object} pass2 the pass-2 result
 * @param {object} [theme=DEFAULT_THEME] neutral theme (see {@link DEFAULT_THEME})
 * @returns {{ domain: [number, number]|null, fillOf: (sub: object) => string }}
 *   `domain` is null when nothing is measurable (then every sub-area is `unknownFill`)
 */
export function absoluteView(pass2, theme = DEFAULT_THEME) {
  const domain = absoluteValueDomain(pass2);
  const scale = domain ? makeSequentialScale(domain[0], domain[1], theme.ramp) : null;
  const fillOf = (sub) =>
    sub.meanAbilityToPay == null || !scale ? theme.unknownFill : scale(sub.meanAbilityToPay);
  return { domain, fillOf };
}

/**
 * Fill for a sub-area in the within-cluster band-rank view.
 * @param {{ band: number }} sub a sub-area record
 * @param {number} k the parent cluster's band count
 * @param {object} [theme=DEFAULT_THEME] neutral theme
 * @returns {string} a per-cluster ramp shade (band 0 palest → band k-1 deepest)
 */
export function bandRankFill(sub, k, theme = DEFAULT_THEME) {
  const scale = makeSequentialScale(0, Math.max(1, k - 1), theme.ramp);
  return scale(sub.band);
}
