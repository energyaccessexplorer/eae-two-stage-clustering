/**
 * render/color-scale.js — neutral sequential colour ramp for ability-to-pay values.
 *
 * Spec §3.8: sub-areas are coloured by ABSOLUTE ability-to-pay on one continuous ramp,
 * so the same colour means the same value everywhere. The ramp is a neutral single-hue
 * light→dark sequential, deliberately NOT a brand colour and NOT a loaded scheme such
 * as red-for-poor; brand green/coral are reserved for chrome (eae-design-tokens.css).
 *
 * Pure maths on hex colours — no DOM — so the mapping is unit-testable in isolation.
 */

/** Neutral sequential endpoints: low value = pale, high value = deep (cool, unloaded). */
export const NEUTRAL_RAMP = { low: '#eaf1f5', high: '#164a68' };

/**
 * Parse a `#rrggbb` string into [r, g, b].
 * @param {string} hex a six-digit hex colour with leading '#'
 * @returns {[number, number, number]} channel values 0–255
 */
function parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Format [r, g, b] as `#rrggbb`.
 * @param {number} r red 0–255
 * @param {number} g green 0–255
 * @param {number} b blue 0–255
 * @returns {string} hex colour
 */
function toHex(r, g, b) {
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Linearly interpolate between two hex colours.
 * @param {string} a start colour `#rrggbb`
 * @param {string} b end colour `#rrggbb`
 * @param {number} t position in [0, 1] (clamped)
 * @returns {string} interpolated hex colour
 */
export function interpolateHex(a, b, t) {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex(ar + (br - ar) * u, ag + (bg - ag) * u, ab + (bb - ab) * u);
}

/**
 * Build a sequential value→colour scale over a fixed domain.
 *
 * @param {number} min domain minimum (lowest ability-to-pay in the data)
 * @param {number} max domain maximum (highest); when equal to `min` every value maps
 *   to the ramp's low end
 * @param {{ low: string, high: string }} [ramp=NEUTRAL_RAMP] endpoint colours
 * @returns {(value: number) => string} maps a value to a `#rrggbb` colour, clamped to
 *   the domain
 * @determinism Pure function of its arguments.
 */
export function makeSequentialScale(min, max, ramp = NEUTRAL_RAMP) {
  const span = max - min;
  return (value) => interpolateHex(ramp.low, ramp.high, span > 0 ? (value - min) / span : 0);
}
