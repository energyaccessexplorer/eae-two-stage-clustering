/**
 * render/legend.js — legend models for the two honest views (spec §3.8).
 *
 * The absolute view has ONE shared value legend; the band-rank view has a PER-CLUSTER
 * legend of value ranges. There is deliberately no function for a global band-index
 * legend — the hard rule that band index is not comparable across clusters is enforced
 * by never offering one. Pure data models; the HTML turns them into swatches.
 */

import { makeSequentialScale, NEUTRAL_RAMP } from './color-scale.js';
import { bandLabel } from './labels.js';

/**
 * Even value stops for the shared absolute-value ramp legend.
 * @param {[number, number]} domain [min, max] from render/style.js `absoluteValueDomain`
 * @param {number} [steps=5] number of swatches (>= 2)
 * @param {{ low: string, high: string }} [ramp=NEUTRAL_RAMP] ramp endpoints
 * @returns {Array<{ value: number, color: string }>} ascending stops from min to max
 */
export function absoluteLegendStops(domain, steps = 5, ramp = NEUTRAL_RAMP) {
  const [min, max] = domain;
  const scale = makeSequentialScale(min, max, ramp);
  const n = Math.max(2, steps);
  const stops = [];
  for (let i = 0; i < n; i++) {
    const value = min + ((max - min) * i) / (n - 1);
    stops.push({ value, color: scale(value) });
  }
  return stops;
}

/**
 * Per-cluster band-rank legend: one row per band with its within-cluster value range.
 *
 * @param {object} cluster a pass-2 cluster record (`k` bands, `subAreas`)
 * @returns {Array<{ band: number, label: string, range: [number, number] }>} one entry
 *   per band present, ascending by band; `range` is that band's ability-to-pay span
 */
export function bandRankLegend(cluster) {
  const rangeByBand = new Map();
  for (const sub of cluster.subAreas) {
    if (!rangeByBand.has(sub.band)) rangeByBand.set(sub.band, sub.bandValueRange);
  }
  return [...rangeByBand.keys()]
    .sort((a, b) => a - b)
    .map((band) => ({ band, label: bandLabel(band, cluster.k), range: rangeByBand.get(band) }));
}
