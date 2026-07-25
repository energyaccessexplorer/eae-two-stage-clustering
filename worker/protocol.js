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
 * Copy an array into a fresh Float64Array, mapping null/undefined to NaN.
 *
 * Always allocates a new buffer, even when the source is already a Float64Array:
 * encodePass2Request transfers these buffers to the worker, and transferring
 * DETACHES them. Copying guarantees the caller's arrays — including any it reuses
 * across runs (e.g. the pass-1 labels) — stay valid for the next call.
 *
 * @param {number[]|Float64Array} arr source values
 * @returns {Float64Array} a new array (never the source)
 */
function toFloat64(arr) {
  return Float64Array.from(arr, (v) => (v == null ? NaN : v));
}

/**
 * Copy an array into a fresh Int32Array (always a new buffer; see {@link toFloat64}).
 * @param {number[]|Int32Array} arr source values
 * @returns {Int32Array} a new array (never the source)
 */
function toInt32(arr) {
  return Int32Array.from(arr);
}

/**
 * Encode a pass-2 input into a worker message plus its transfer list.
 *
 * The input is copied into fresh typed arrays whose buffers are listed for transfer,
 * so the caller's arrays are never detached and can be reused across runs. Coordinates
 * and labels become typed arrays; ability/population become Float64Array with NaN for
 * missing values.
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
