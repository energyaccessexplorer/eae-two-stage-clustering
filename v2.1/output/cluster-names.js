/**
 * output/cluster-names.js — automatic cluster names (spec §6.7).
 *
 * A cluster is named after the admin area that holds most of its places, so names in
 * the tool and in the CMS mean something to a reader ("Ainabkoi", not "Cluster 12").
 * Naming only reads where places fall; it never splits or changes a cluster (spec §8).
 * Pure and deterministic.
 */

/**
 * Automatic names for the clusters of a run.
 *
 * @param {object} args
 * @param {Array<{ id: number }>} args.clusters pass-1 clusters, in output order
 * @param {Int32Array} args.labels pass-1 label (cluster id) per point
 * @param {Int32Array|null} args.pointUnit per point, the index into `units` of its admin
 *   area, or -1 outside every area (from `locatePoints`); null without boundaries
 * @param {Array<{ name: string }>|null} args.units parsed admin units, or null
 * @returns {Map<number, string>} name per cluster id. The majority area wins; a tie
 *   goes to the area earlier in the boundary file; repeats are numbered in output order
 *   ("Ainabkoi", "Ainabkoi 2"). When the top area holds under half of the cluster's
 *   places, the name says how many more areas it spans ("Bobasi and 85 more areas").
 *   "Cluster N" when there are no boundaries, or when more of the cluster's places lie
 *   outside every area than in any one area.
 * @determinism Pure function of its arguments.
 */
export function autoClusterNames({ clusters, labels, pointUnit, units }) {
  const base = new Map(clusters.map((c) => [c.id, `Cluster ${c.id}`]));
  if (pointUnit && units && units.length) {
    const tallies = new Map(clusters.map((c) => [c.id, new Map()]));
    labels.forEach((label, i) => {
      const tally = tallies.get(label);
      if (tally) tally.set(pointUnit[i], (tally.get(pointUnit[i]) || 0) + 1);
    });
    for (const [id, tally] of tallies) {
      let best = -1;
      let bestCount = 0;
      let total = 0;
      let areas = 0;
      for (const [unit, n] of tally) {
        total += n;
        if (unit < 0) continue;
        areas++;
        if (n > bestCount || (n === bestCount && unit < best)) {
          best = unit;
          bestCount = n;
        }
      }
      if (best < 0 || bestCount < (tally.get(-1) || 0)) continue;
      const others = areas - 1;
      const spread = 2 * bestCount < total && others > 0;
      const more = others === 1 ? '1 more area' : `${others} more areas`;
      base.set(id, spread ? `${units[best].name} and ${more}` : units[best].name);
    }
  }

  const seen = new Map();
  const names = new Map();
  for (const c of clusters) {
    const name = base.get(c.id);
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    names.set(c.id, n === 1 ? name : `${name} ${n}`);
  }
  return names;
}

/**
 * The name to show for a pass-2 cluster id, including admin pieces after a split.
 *
 * @param {number|string|null} parentClusterId a pass-1 cluster id, or a split piece id
 *   "<cluster id>@<area id>" ("outside" for places outside every area)
 * @param {Map<number, string>} names cluster names (automatic or user-edited)
 * @param {Array<{ id: string|number, name: string }>|null} units parsed admin units
 * @returns {string|null} "<cluster name>" or "<cluster name> · <area name>"; null for
 *   the last-mile group (no cluster)
 */
export function displayName(parentClusterId, names, units) {
  if (parentClusterId == null) return null;
  const [id, area] = String(parentClusterId).split('@');
  const cluster = names.get(Number(id)) ?? `Cluster ${id}`;
  if (area === undefined) return cluster;
  if (area === 'outside') return `${cluster} · outside the areas`;
  const unit = units && units.find((u) => String(u.id) === area);
  return `${cluster} · ${unit ? unit.name : area}`;
}
