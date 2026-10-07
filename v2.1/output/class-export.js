/**
 * output/class-export.js — export only the sub-areas of one class (spec §6.8).
 *
 * Two kinds of class, kept honest:
 *  - absolute (comparable across the map): a map-wide fifth of the sub-areas'
 *    population-weighted mean ability to pay, or a custom value range;
 *  - relative (within each cluster): the lowest or highest band of every cluster. Band
 *    numbers are not comparable across clusters (spec §3.8), so every exported feature
 *    and the file metadata say so.
 * Pure: reads the pass-2 result, filters FeatureCollections, never recomputes values.
 */

const FIFTHS = ['lowest', 'second', 'middle', 'fourth', 'highest'];

/**
 * Map-wide quintile cut points of the sub-areas' measured means.
 * @param {object} pass2 the pass-2 result
 * @returns {{ cuts: number[], count: number }|null} four ascending cut points (nearest
 *   rank) and the number of measured sub-areas; null when none has a measured mean
 * @determinism Pure function of its argument.
 */
export function mapQuintiles(pass2) {
  const values = measured(pass2)
    .map((s) => s.meanAbilityToPay)
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const rank = (q) => values[Math.ceil(q * values.length) - 1];
  return { cuts: [0.2, 0.4, 0.6, 0.8].map(rank), count: values.length };
}

/**
 * Choose the sub-areas in one class.
 *
 * @param {object} pass2 the pass-2 result (bands method for relative classes)
 * @param {{ kind: 'fifth', fifth: 1|2|3|4|5 } | { kind: 'range', min: number, max: number }
 *   | { kind: 'band', which: 'lowest'|'highest' }} selection the class
 * @returns {{ ids: Set<string>, label: string, definition: string, comparable: boolean,
 *   bounds: object|null, excludedClusters: number }} the chosen sub-area ids and how the
 *   class is described; `bounds` holds the value limits of an absolute class (null for
 *   relative), `excludedClusters` the single-band clusters a relative class skips
 * @throws {Error} for a custom range whose limits are not numbers with min ≤ max
 */
export function selectSubareas(pass2, selection) {
  if (selection.kind === 'band') return byBand(pass2, selection.which);
  let lo;
  let hi;
  let label;
  let definition;
  if (selection.kind === 'fifth') {
    const q = mapQuintiles(pass2);
    const k = selection.fifth;
    lo = q && k > 1 ? q.cuts[k - 2] : -Infinity;
    hi = q && k < 5 ? q.cuts[k - 1] : Infinity;
    label = `${FIFTHS[k - 1]} fifth across the map`;
    definition =
      `Sub-areas whose population-weighted mean ability to pay is in the ${FIFTHS[k - 1]} ` +
      `fifth of all ${q ? q.count : 0} measured sub-areas on the map.`;
  } else {
    const { min, max } = selection;
    if (!(Number.isFinite(min) && Number.isFinite(max) && min <= max)) {
      throw new Error('the value range needs two numbers, with the minimum not above the maximum');
    }
    label = `value ${min} to ${max}`;
    definition = `Sub-areas whose population-weighted mean ability to pay is between ${min} and ${max}.`;
    return absolute(pass2, (v) => v >= min && v <= max, label, definition, { min, max });
  }
  return absolute(pass2, (v) => v > lo && v <= hi, label, definition, {
    above: Number.isFinite(lo) ? lo : null,
    upTo: Number.isFinite(hi) ? hi : null,
  });
}

/**
 * Keep only the chosen sub-areas of a points or boundaries FeatureCollection.
 * @param {{ features: object[], meta?: object }} featureCollection decorated GeoJSON
 * @param {ReturnType<typeof selectSubareas>} picked the class from {@link selectSubareas}
 * @returns {object} a new FeatureCollection of the class's sub-area features, each with
 *   `export_class` and `export_comparable_across_map`; `meta.export` describes the class
 */
export function filterByClass(featureCollection, picked) {
  const features = featureCollection.features
    .filter(
      (f) =>
        (f.properties.kind === 'subarea' || f.properties.kind === 'subarea_boundary') &&
        picked.ids.has(f.properties.subarea_id)
    )
    .map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        export_class: picked.label,
        export_comparable_across_map: picked.comparable,
      },
    }));
  return {
    ...featureCollection,
    features,
    meta: {
      ...featureCollection.meta,
      export: {
        class: picked.label,
        definition: picked.definition,
        comparableAcrossMap: picked.comparable,
        bounds: picked.bounds,
        exported: features.length,
        excludedClusters: picked.excludedClusters,
      },
    },
  };
}

/** Every sub-area with a measured mean, across all clusters. */
function measured(pass2) {
  return pass2.clusters.flatMap((c) => c.subAreas).filter((s) => s.meanAbilityToPay != null);
}

function absolute(pass2, inClass, label, definition, bounds) {
  const ids = new Set(
    measured(pass2)
      .filter((s) => inClass(s.meanAbilityToPay))
      .map((s) => s.subAreaId)
  );
  return { ids, label, definition, comparable: true, bounds, excludedClusters: 0 };
}

function byBand(pass2, which) {
  const ids = new Set();
  let excludedClusters = 0;
  for (const c of pass2.clusters) {
    if (c.k <= 1) {
      excludedClusters++;
      continue;
    }
    const band = which === 'lowest' ? 0 : c.k - 1;
    for (const s of c.subAreas) if (s.band === band) ids.add(s.subAreaId);
  }
  return {
    ids,
    label: `${which} band within its own cluster`,
    definition:
      `The ${which} band of each cluster, from that cluster's own values. NOT comparable ` +
      `across clusters: the lowest band of one cluster can be richer than the highest of ` +
      `another. Clusters with a single band (${excludedClusters}) are left out.`,
    comparable: false,
    bounds: null,
    excludedClusters,
  };
}
