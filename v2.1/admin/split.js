/**
 * admin/split.js — split a straddling cluster along admin boundaries, on demand.
 *
 * Never automatic (spec §3.7, §8): the UI calls this only after the user chooses to
 * split a highlighted cluster. The mechanic is a membership-preserving cut — partition
 * the cluster's points by the admin unit they fall in — followed by a fresh pass 2
 * within each piece, since each admin piece becomes the new parent for within-cluster
 * banding. Pass 2 is reused verbatim, not reimplemented.
 */

import { runPass2 } from '../subcluster/pass2.js';
import { clusterMembers } from './tag.js';
import { UNVISITED } from '../cluster/labels.js';

/**
 * Split one cluster into per-admin-unit pieces and recompute pass 2 in each.
 *
 * @param {object} args
 * @param {number} args.parentClusterId id of the cluster to split
 * @param {object} args.pass2 the current {@link runPass2} result (to find the cluster)
 * @param {Int32Array} args.pointUnit per-point admin unit index from admin/tag.js
 *   (`locatePoints`); -1 for points outside every unit
 * @param {Array<{ id: string|number }>} args.units parsed admin units
 * @param {Float64Array} args.px x coordinates in metres (the same run arrays)
 * @param {Float64Array} args.py y coordinates in metres
 * @param {Array<number|null>|Float64Array} args.ability ability-to-pay per point
 * @param {Array<number|null>|Float64Array} args.population population per point
 * @param {object} [args.options] pass-2 options, forwarded to {@link runPass2} so each
 *   piece re-derives its own eps2 (spec §3.9)
 * @returns {{ parentClusterId: number, pieces: Array<{ adminUnitId: string|number|null,
 *   pass2: object }> }} one piece per admin unit the cluster touched (plus a final
 *   `adminUnitId: null` piece for any points outside all units); each piece's `pass2`
 *   is a full run over that piece alone
 * @throws {Error} if the cluster id is not present in `pass2`
 */
export function splitClusterByAdmin(args) {
  const { parentClusterId, pass2, pointUnit, units, px, py, ability, population, options } = args;
  const cluster = pass2.clusters.find((c) => c.parentClusterId === parentClusterId);
  if (!cluster) throw new Error(`splitClusterByAdmin: cluster ${parentClusterId} not found`);

  // Group the cluster's members by their admin unit (-1 = outside, kept as a piece).
  const byUnit = new Map();
  for (const m of clusterMembers(cluster)) {
    const u = pointUnit[m];
    let group = byUnit.get(u);
    if (!group) {
      group = [];
      byUnit.set(u, group);
    }
    group.push(m);
  }

  // Admin units in ascending index order, with any outside group (-1) last.
  const unitKeys = [...byUnit.keys()].sort((a, b) => (a < 0) - (b < 0) || a - b);
  const n = px.length;
  const pieces = unitKeys.map((u) => {
    const labels = new Int32Array(n).fill(UNVISITED);
    for (const m of byUnit.get(u)) labels[m] = 1;
    return {
      adminUnitId: u >= 0 ? units[u].id : null,
      pass2: runPass2({ px, py, labels, ability, population, options }),
    };
  });

  return { parentClusterId, pieces };
}
