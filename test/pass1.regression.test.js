import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cluster_features } from '../cluster/features.js';
import { merge_point_datasets } from '../io/points.js';
import { makeDataset, makeRaster, makeScenarios } from './fixtures/pass1/inputs.mjs';
import { serializeResult } from './fixtures/pass1/serialize.mjs';

// Pass-1 safety net: the extracted modules must reproduce, exactly, the behaviour
// frozen from the original single-file tool in test/fixtures/pass1/golden.json.
const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(HERE, 'fixtures/pass1/golden.json'), 'utf8'));

const points = merge_point_datasets([makeDataset()]);
const scenarios = makeScenarios(points, makeRaster());

describe('pass-1 regression (golden master)', () => {
  for (const name of Object.keys(golden.scenarios)) {
    it(`${name} reproduces the frozen output`, () => {
      expect(serializeResult(cluster_features(scenarios[name]))).toEqual(golden.scenarios[name]);
    });
  }
});
