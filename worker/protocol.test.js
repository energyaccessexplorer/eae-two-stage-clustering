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
});

describe('handlePass2', () => {
  it('produces the same result as calling runPass2 directly', () => {
    const { message } = encodePass2Request(input);
    expect(handlePass2(message)).toEqual(runPass2(input));
  });
});
