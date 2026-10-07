/**
 * worker/pass2.worker.js — the pass-2 Web Worker entry point.
 *
 * Runs pass 2 off the main thread so the map never freezes (spec §4, §8). Thin by
 * design: all logic lives in handler.js (pure) and subcluster/. Errors are posted
 * back as `{ error }` rather than swallowed, so the client can surface them.
 *
 * Loaded as a module worker: `new Worker(url, { type: 'module' })`.
 */

import { handlePass2 } from './handler.js';

self.onmessage = (event) => {
  try {
    self.postMessage({ result: handlePass2(event.data) });
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
