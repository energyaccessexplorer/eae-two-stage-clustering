/**
 * output/provenance.js — assemble the top-level provenance metadata (spec §6.2).
 *
 * Every output carries a metadata block so any result is reproducible and auditable
 * (spec §8). This module only *composes* caller-supplied facts (layer ids/vintages,
 * tool version, timestamp — all of which live outside the pure algorithm) with the
 * parameters the pass-2 run actually used. It performs no clustering and no I/O.
 */

/**
 * Build the provenance `meta` block for a pass-2 output.
 *
 * The timestamp and layer/tool identities are passed in rather than read here: the
 * pure modules never touch the clock or the environment, so the caller (browser)
 * supplies them and the result stays deterministic given identical inputs.
 *
 * @param {object} args
 * @param {object} args.pass2 the {@link import('../subcluster/pass2.js').runPass2} result;
 *   supplies the pass-2 parameters and the per-cluster banding method/band count
 * @param {{ id: string, vintage: string }} args.abilityLayer ability-to-pay layer identity
 * @param {{ id: string, vintage: string }} args.populationLayer population layer identity
 * @param {{ id: string, version: string }|null} [args.adminDataset] admin boundary dataset,
 *   or null when none was used
 * @param {{ algorithm: string, eps1Km: number, min1: number }} args.pass1 pass-1 parameters
 * @param {'default'|'expert'} args.bandMode band-count mode
 * @param {number} args.sizeThreshold Fisher-Jenks→Ckmeans switch size (spec §3.2)
 * @param {string} [args.crs='EPSG:4326'] canonical CRS of the data
 * @param {string} [args.distanceMethod='projected-equirectangular'] clustering-distance method
 * @param {string} args.toolVersion tool version string
 * @param {number} args.pointCount number of input points
 * @param {string|number} args.timestamp caller-supplied generation time (ISO string or epoch)
 * @returns {object} the `meta` block embedded at the top of the output FeatureCollection
 */
export function buildProvenance(args) {
  const {
    pass2,
    abilityLayer,
    populationLayer,
    adminDataset = null,
    pass1,
    bandMode,
    sizeThreshold,
    crs = 'EPSG:4326',
    distanceMethod = 'projected-equirectangular',
    toolVersion,
    pointCount,
    timestamp,
  } = args;

  return {
    tool: { version: toolVersion, generatedAt: timestamp },
    pointCount,
    crs,
    clusteringDistanceMethod: distanceMethod,
    layers: {
      abilityToPay: abilityLayer,
      population: populationLayer,
      admin: adminDataset,
    },
    params: {
      pass1: { algorithm: pass1.algorithm, eps1Km: pass1.eps1Km, min1: pass1.min1 },
      pass2: {
        min2: pass2.params.min2,
        eps2Rule: pass2.params.eps2Rule,
        eps2OverrideKm: pass2.params.eps2OverrideKm,
        bandMode,
        sizeThreshold,
      },
    },
    banding: {
      perCluster: pass2.clusters.map((c) => ({
        parentClusterId: c.parentClusterId,
        bandCount: c.k,
        method: c.method,
        flag: c.flag,
      })),
    },
  };
}
