/**
 * worker/boundaries.worker.js — the boundary-outline Web Worker entry point.
 *
 * Builds the boundaries FeatureCollection (spec §6.5) off the main thread, so the map
 * does not freeze while large clusters are outlined. Thin by design: all logic lives
 * in output/boundaries.js (pure). Errors are posted back as `{ error }` rather than
 * swallowed, so the client can surface them.
 *
 * Loaded as a module worker: `new Worker(url, { type: 'module' })`.
 */

import { buildBoundaries } from '../output/boundaries.js';

self.onmessage = (event) => {
  try {
    self.postMessage({ result: buildBoundaries(event.data) });
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
