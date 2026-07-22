import { describe, it, expect } from 'vitest';
import { runPass2InWorker } from './client.js';
import { handlePass2 } from './handler.js';
import { runPass2 } from '../subcluster/pass2.js';

const input = {
  px: new Float64Array([0, 0, 0, 0]),
  py: new Float64Array([0, 0, 0, 0]),
  labels: new Int32Array([1, 1, 1, -1]),
  ability: [2, 2, null, 2],
  population: [10, 10, 5, 7],
};

/** A Worker stub that runs the real handler on the posted message. */
class EchoWorker {
  postMessage(message, transfer) {
    this.message = message;
    this.transfer = transfer;
    queueMicrotask(() => this.onmessage({ data: { result: handlePass2(message) } }));
  }
  terminate() {
    this.terminated = true;
  }
}

describe('runPass2InWorker', () => {
  it('resolves with the same result as a direct run and terminates the worker', async () => {
    const worker = new EchoWorker();
    const result = await runPass2InWorker(input, { createWorker: () => worker });
    expect(result).toEqual(runPass2(input));
    expect(worker.terminated).toBe(true);
    expect(worker.transfer).toHaveLength(5);
  });

  it('rejects when the worker reports an error', async () => {
    const worker = {
      postMessage() {
        queueMicrotask(() => this.onmessage({ data: { error: 'boom' } }));
      },
      terminate() {},
    };
    await expect(runPass2InWorker(input, { createWorker: () => worker })).rejects.toThrow('boom');
  });

  it('rejects when the worker fails to start', async () => {
    const worker = {
      postMessage() {
        queueMicrotask(() => this.onerror({ message: 'failed to load' }));
      },
      terminate() {},
    };
    await expect(runPass2InWorker(input, { createWorker: () => worker })).rejects.toThrow(
      'failed to load'
    );
  });
});
