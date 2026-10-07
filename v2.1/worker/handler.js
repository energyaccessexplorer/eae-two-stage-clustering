/**
 * worker/handler.js — pure request handler for the pass-2 worker.
 *
 * Split from the worker's plumbing so it can be exercised in Node without a Web
 * Worker: it simply runs pass 2 on a decoded message. The message's typed arrays are
 * exactly what `runPass2` accepts (Float64Array ability/population with NaN for
 * missing), so no decoding step is needed.
 */

import { runPass2 } from '../subcluster/pass2.js';

/**
 * Run pass 2 for a decoded worker message.
 * @param {object} message the payload from {@link import('./protocol.js').encodePass2Request}
 * @returns {object} the {@link runPass2} result (structured-clone-safe)
 */
export function handlePass2(message) {
  return runPass2(message);
}
