import { describe, it, expect } from 'vitest';
import { encodePass2Request } from './protocol.js';
import { handlePass2 } from './handler.js';
import { runPass2 } from '../subcluster/pass2.js';

const input = {
  px: new Float64Array([0, 0, 0, 0]),
  py: new Float64Array([0, 0, 0, 0]),
  labels: new Int32Array([1, 1, 1, -1]),
  ability: [2, 2, null, 2],
  population: [10, 10, 5, 7],
};

describe('encodePass2Request', () => {
  it('encodes missing values as NaN and lists five buffers to transfer', () => {
    const { message, transfer } = encodePass2Request(input);
    expect(message.ability).toBeInstanceOf(Float64Array);
    expect(Number.isNaN(message.ability[2])).toBe(true);
    expect(transfer).toHaveLength(5);
    expect(message.options).toEqual({});
  });

  it('does not detach the caller arrays, so the same input can be encoded again', () => {
    const px = new Float64Array([1, 2, 3, 4]);
    const labels = new Int32Array([1, 1, -1, 1]);
    const reused = {
      px,
      py: new Float64Array(4),
      labels,
      ability: [1, 2, null, 4],
      population: [1, 1, 1, 1],
    };
    encodePass2Request(reused);
    // A transferred buffer would report byteLength 0; these must stay intact.
    expect(px.byteLength).toBe(32);
    expect(labels.byteLength).toBe(16);
    expect(px[0]).toBe(1);
    // Encoding a second time (a re-run) must not throw on a detached buffer.
    expect(() => encodePass2Request(reused)).not.toThrow();
  });
});

describe('handlePass2', () => {
  it('produces the same result as calling runPass2 directly', () => {
    const { message } = encodePass2Request(input);
    expect(handlePass2(message)).toEqual(runPass2(input));
  });
});
