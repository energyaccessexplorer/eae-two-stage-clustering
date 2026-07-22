/**
 * Golden-master generator for the pass-1 regression.
 *
 * Slices the *verbatim* clustering core out of the original single-file tool
 * (eae_clustering_tool_weighted_1_1.html) between two stable markers, loads it as
 * an ES module in Node, runs every fixture scenario through cluster_features, and
 * writes the frozen output to golden.json. Capturing from the original bytes (not
 * a hand-copy) means the golden master provably reflects pre-refactor behaviour.
 *
 * Run once to (re)generate the pristine baseline:  node test/fixtures/pass1/capture.mjs
 * Valid only until sub-stage 2.3 intentionally changes behaviour; after that the
 * golden master is owned by the modules, not this script.
 */
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { makeDataset, makeRaster, makeScenarios } from './inputs.mjs';
import { serializeResult } from './serialize.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = resolve(HERE, '../../../eae_clustering_tool_weighted_1_1.html');
const START = 'const EARTH_R = 6371000';
const END = 'const LABELS = { NOISE, FILTERED, UNVISITED };';
const EXPORTS =
  '\nexport { cluster_features, merge_point_datasets, make_projector, GridIndex, ' +
  'RasterField, run_dbscan, run_hdbscan, build_weight, cell_km2, LABELS };\n';

/** Extract the verbatim core, write it to a temp module, and dynamic-import it. */
async function loadReferenceCore() {
  const html = await readFile(HTML, 'utf8');
  const s = html.indexOf(START);
  const e = html.indexOf(END);
  if (s < 0 || e < 0) throw new Error('capture: could not locate the core markers in the HTML');
  const core = html.slice(s, e + END.length) + EXPORTS;
  const tmp = resolve(HERE, '.reference-core.generated.mjs');
  await writeFile(tmp, core, 'utf8');
  try {
    return { mod: await import(pathToFileURL(tmp).href), tmp };
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

async function main() {
  const { mod, tmp } = await loadReferenceCore();
  try {
    const points = mod.merge_point_datasets([makeDataset()]);
    const scenarios = makeScenarios(points, makeRaster());
    const out = {};
    for (const [name, opts] of Object.entries(scenarios)) {
      out[name] = serializeResult(mod.cluster_features(opts));
    }
    const golden = {
      _provenance:
        'Captured verbatim from eae_clustering_tool_weighted_1_1.html core via ' +
        'test/fixtures/pass1/capture.mjs. Frozen pass-1 baseline; do not edit by hand.',
      scenarios: out,
    };
    await writeFile(resolve(HERE, 'golden.json'), JSON.stringify(golden, null, 2) + '\n', 'utf8');
  } finally {
    await unlink(tmp).catch(() => {});
  }
  process.stdout.write('golden.json written\n');
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
