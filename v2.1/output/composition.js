/**
 * output/composition.js — what each output group is made of, by point layer (spec §3.11).
 *
 * "12 schools, 3 clinics": per-layer counts for every cluster outline, sub-area,
 * unknown and last-mile group, from that group's own members. Counts places only; it
 * never sums population or ability to pay. Pure.
 */

/**
 * Count a group's places per layer.
 * @param {number[]} members point indices
 * @param {string[]} sources the layer of each point
 * @param {string[]} layers loaded layers, in load order
 * @returns {Record<string, number>} count per layer (every layer present, zeros included)
 */
export function compositionOf(members, sources, layers) {
  const counts = Object.fromEntries(layers.map((l) => [l, 0]));
  for (const i of members) counts[sources[i]] += 1;
  return counts;
}

/**
 * A composition as short text, largest first: "schools 9, health 3". Layers with no
 * places are left out.
 * @param {Record<string, number>} counts from {@link compositionOf}
 * @returns {string} the text, or '' when the group is empty
 */
export function compositionText(counts) {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([layer, n]) => `${layer} ${n}`)
    .join(', ');
}

/**
 * The attribute column for a layer's count: `n_` plus the layer name in lower case,
 * with anything other than letters and digits replaced by `_` ("EV Stations" → n_ev_stations).
 * @param {string} layer layer name
 * @returns {string} column name
 */
export function countColumn(layer) {
  return `n_${layer.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
}

/**
 * Copy a FeatureCollection with an `n_<layer>` count column per layer on every group
 * feature, from that feature's own members.
 *
 * @param {{ features: object[] }} featureCollection the points, boundaries or class-export GeoJSON
 * @param {object} args
 * @param {Int32Array} args.labels pass-1 label per point (for cluster outlines)
 * @param {string[]} args.sources the layer of each point
 * @param {string[]} args.layers loaded layers, in load order (one column each)
 * @param {object|null} args.pass2 the pass-2 result (for sub-area, unknown and last-mile members)
 * @returns {object} a new FeatureCollection; features whose members are unknown here are
 *   copied unchanged
 */
export function withComposition(featureCollection, { labels, sources, layers, pass2 }) {
  const byLabel = new Map();
  labels.forEach((label, i) => {
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(i);
  });
  const bySubarea = new Map();
  const byUnknown = new Map();
  for (const c of pass2 ? pass2.clusters : []) {
    for (const sub of c.subAreas) bySubarea.set(sub.subAreaId, sub.memberIndices);
    if (c.unknown) byUnknown.set(String(c.parentClusterId), c.unknown.memberIndices);
  }
  const membersOf = (p) => {
    if (p.kind === 'cluster_boundary') return byLabel.get(p.parent_cluster_id);
    if (p.kind === 'subarea' || p.kind === 'subarea_boundary') return bySubarea.get(p.subarea_id);
    if (p.kind === 'unknown') return byUnknown.get(String(p.parent_cluster_id));
    if (p.kind === 'last_mile') return pass2 && pass2.lastMile.memberIndices;
    return undefined;
  };

  const features = featureCollection.features.map((f) => {
    const members = membersOf(f.properties);
    if (!members) return f;
    const counts = compositionOf(members, sources, layers);
    const columns = Object.fromEntries(layers.map((l) => [countColumn(l), counts[l]]));
    return { ...f, properties: { ...f.properties, ...columns } };
  });
  return { ...featureCollection, features };
}
