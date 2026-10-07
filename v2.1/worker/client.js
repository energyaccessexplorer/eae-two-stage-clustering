/**
 * worker/client.js — run pass 2 and the boundary outlines in Web Workers and await
 * the results.
 *
 * Thin promise wrappers over module workers. A worker is created per call and
 * terminated as soon as it answers, keeping ownership simple. Worker factories are
 * injectable so the promise wiring can be tested without a real Worker.
 */

import { encodePass2Request } from './protocol.js';

/**
 * Post one message to a fresh worker and settle with its single answer.
 * @param {() => Worker} createWorker worker factory
 * @param {*} message structured-cloneable request
 * @param {Transferable[]} transfer buffers to transfer
 * @param {string} name what the worker does, for start-up failure messages
 * @returns {Promise<*>} the worker's `result`; rejects with its `error`, or if it fails
 *   to start
 */
function runInWorker(createWorker, message, transfer, name) {
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
      reject(new Error(event.message || `${name} worker failed`));
    };
    worker.postMessage(message, transfer);
  });
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
  const createWorker =
    opts.createWorker ||
    (() => new Worker(new URL('./pass2.worker.js', import.meta.url), { type: 'module' }));
  const { message, transfer } = encodePass2Request(input);
  return runInWorker(createWorker, message, transfer, 'pass-2');
}

/**
 * Build the boundaries FeatureCollection off the main thread (spec §6.5): with a
 * buffer, outlining the largest real datasets takes several hundred milliseconds.
 *
 * @param {object} args a {@link import('../output/boundaries.js').buildBoundaries} input;
 *   it is copied to the worker, not transferred
 * @param {object} [opts]
 * @param {() => Worker} [opts.createWorker] worker factory; defaults to the module worker
 * @returns {Promise<object>} resolves with the boundaries FeatureCollection; rejects if
 *   the worker reports an error or fails to start
 */
export function buildBoundariesInWorker(args, opts = {}) {
  const createWorker =
    opts.createWorker ||
    (() => new Worker(new URL('./boundaries.worker.js', import.meta.url), { type: 'module' }));
  return runInWorker(createWorker, args, [], 'boundaries');
}
