/**
 * render/labels.js — within-cluster relative labels for bands and sub-areas.
 *
 * Spec §3.8: labels use within-cluster RELATIVE language ("lowest fifth … highest
 * fifth of this area"), never absolute wealth language, because bands are computed
 * within the parent cluster and are not comparable across clusters. Pure string
 * helpers, no DOM.
 */

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const FRACTIONS = { 2: 'half', 3: 'third', 4: 'quarter', 5: 'fifth', 6: 'sixth', 7: 'seventh' };

/**
 * The fraction word for a k-band split (e.g. 5 → "fifth").
 * @param {number} k band count
 * @returns {string} the fraction noun, or "1/k" band for unusual k
 */
function fractionWord(k) {
  return FRACTIONS[k] || `1/${k}`;
}

/**
 * Relative label for a band within its parent cluster.
 *
 * @param {number} band band index, 0 = lowest ability-to-pay
 * @param {number} k band count for this cluster
 * @returns {string} e.g. "lowest fifth", "second-lowest fifth", "highest fifth", or
 *   "whole area" when the cluster is a single band
 */
export function bandLabel(band, k) {
  if (k <= 1) return 'whole area';
  if (band === 0) return `lowest ${fractionWord(k)}`;
  if (band === k - 1) return `highest ${fractionWord(k)}`;
  const nth = ORDINALS[band] || `${band + 1}th`;
  return `${nth}-lowest ${fractionWord(k)}`;
}

/**
 * Relative label for a sub-area, marking the scattered (non-contiguous) case.
 * @param {{ band: number, scattered: boolean }} sub a sub-area record
 * @param {number} k band count for the parent cluster
 * @returns {string} the band label, prefixed "scattered " for the scattered sub-area
 */
export function subareaLabel(sub, k) {
  const base = `${bandLabel(sub.band, k)} of this area`;
  return sub.scattered ? `scattered points — ${base}` : base;
}
