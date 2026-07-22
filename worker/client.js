/**
 * worker/client.js — run pass 2 in the Web Worker and await the result.
 *
 * A thin promise wrapper over the module worker. The worker is created per call and
 * terminated as soon as it answers, keeping ownership simple. The worker factory is
 * injectable so the promise wiring can be tested without a real Worker.
 */

import { encodePass2Request } from './protocol.js';

/** Create the default module worker resolved relative to this file. */
function defaultCreateWorker() {
  return new Worker(new URL('./pass2.worker.js', import.meta.url), { type: 'module' });
}

/**
 * Run pass 2 off the main thread.
 *
 * The input's ability/population arrays may contain nulls for missing values; they
 * are encoded as NaN for transfer. The encoded typed arrays are transferred (zero-copy),
 * so do not reuse the exact arrays passed in after calling.
 *
 * @param {object} input a {@link import('../subcluster/pass2.js').runPass2} input
 * @param {object} [opts]
 * @param {() => Worker} [opts.createWorker] worker factory; defaults to the module
 *   worker. Override in tests to inject a stub.
 * @returns {Promise<object>} resolves with the pass-2 result; rejects if the worker
 *   reports an error or fails to start
 */
export function runPass2InWorker(input, opts = {}) {
  const createWorker = opts.createWorker || defaultCreateWorker;
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    worker.onmessage = (event) => {
      worker.terminate();
      const data = event.data || {};
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'pass-2 worker failed'));
    };
    const { message, transfer } = encodePass2Request(input);
    worker.postMessage(message, transfer);
  });
}
