/**
 * banding/modality.js — is a cluster's value distribution multimodal or smooth?
 *
 * Spec §7 open question: real within-city socio-economic distributions may be smooth
 * rather than multimodal, and banding a smooth distribution imposes structure that is
 * not there. This module gives a deterministic, dependency-free test so the caller can
 * choose to report a smooth cluster as a single gradient instead of fabricating bands.
 *
 * The measure is the sample **bimodality coefficient** (SAS definition):
 *   BC = (skewness² + 1) / kurtosis
 * with sample-corrected skewness and (non-excess) kurtosis. A uniform distribution
 * gives BC = 5/9 ≈ 0.556; values ABOVE that suggest bi-/multimodality, values below
 * suggest a single mode. It is a heuristic (heavy tails can inflate it), so the
 * threshold is caller-tunable and the guard is opt-in.
 */

/** Bimodality coefficient of a uniform distribution — the neutral reference point. */
export const UNIFORM_BC = 5 / 9;

/**
 * Sample bimodality coefficient of a set of values.
 *
 * @param {number[]|Float64Array} values finite values
 * @returns {number|null} the coefficient in (0, 1], or null when it is undefined —
 *   fewer than 4 values, or no spread (all values equal)
 * @determinism Pure function of the value multiset (order-independent).
 */
export function bimodalityCoefficient(values) {
  const n = values.length;
  if (n < 4) return null;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += values[i];
  mean /= n;

  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - mean;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  if (m2 <= 0) return null; // no spread

  // Population skewness / excess kurtosis, then Fisher's sample corrections.
  const skewPop = m3 / (m2 * Math.sqrt(m2));
  const kurtExcessPop = m4 / (m2 * m2) - 3;
  const g1 = (skewPop * Math.sqrt(n * (n - 1))) / (n - 2);
  const g2 = (((n + 1) * kurtExcessPop + 6) * (n - 1)) / ((n - 2) * (n - 3));

  const denom = g2 + (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
  return (g1 * g1 + 1) / denom;
}

/**
 * Is the distribution smooth enough that banding would impose false structure?
 *
 * @param {number[]|Float64Array} values finite values
 * @param {number} [threshold=UNIFORM_BC] bimodality coefficient at or below which the
 *   distribution is treated as a single mode
 * @returns {boolean} true only when the coefficient is defined and does not exceed the
 *   threshold; false when it is multimodal OR cannot be computed (too few points / no
 *   spread), so the caller falls through to normal banding in the undecidable cases
 */
export function isUnimodal(values, threshold = UNIFORM_BC) {
  const bc = bimodalityCoefficient(values);
  return bc != null && bc <= threshold;
}
