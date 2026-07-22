/**
 * worker/protocol.js — encode a pass-2 request for transfer to the Web Worker.
 *
 * Keeps the wire format in one place, shared by the client and (via handler.js) the
 * worker. Contains no clustering logic and no DOM/worker globals, so it is testable
 * in plain Node. Missing ability/population values arrive as `null` in JS arrays but
 * cannot live in a typed array, so they are encoded as NaN — which `runPass2` already
 * treats as "no data" (spec §3.4, §3.6), so the round-trip is lossless in meaning.
 */

/**
 * Copy an array to a Float64Array, mapping null/undefined to NaN.
 * @param {number[]|Float64Array} arr source values
 * @returns {Float64Array} the source unchanged if already Float64Array, else a copy
 */
function toFloat64(arr) {
  return arr instanceof Float64Array ? arr : Float64Array.from(arr, (v) => (v == null ? NaN : v));
}

/**
 * Copy an array to an Int32Array.
 * @param {number[]|Int32Array} arr source values
 * @returns {Int32Array} the source unchanged if already Int32Array, else a copy
 */
function toInt32(arr) {
  return arr instanceof Int32Array ? arr : Int32Array.from(arr);
}

/**
 * Encode a pass-2 input into a worker message plus its transfer list.
 *
 * The returned typed arrays' buffers are listed for transfer (zero-copy): once posted,
 * the caller must not reuse the encoded arrays. Coordinates and labels are normalised
 * to typed arrays; ability/population become Float64Array with NaN for missing values.
 *
 * @param {object} input a {@link import('../subcluster/pass2.js').runPass2} input
 * @returns {{ message: object, transfer: ArrayBuffer[] }} the postMessage payload and
 *   the list of buffers to transfer
 */
export function encodePass2Request(input) {
  const px = toFloat64(input.px);
  const py = toFloat64(input.py);
  const labels = toInt32(input.labels);
  const ability = toFloat64(input.ability);
  const population = toFloat64(input.population);
  const message = { px, py, labels, ability, population, options: input.options || {} };
  const transfer = [px.buffer, py.buffer, labels.buffer, ability.buffer, population.buffer];
  return { message, transfer };
}
