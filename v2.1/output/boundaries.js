/**
 * output/boundaries.js — the boundaries GeoJSON: polygon outlines of clusters and
 * sub-areas (spec §6.5).
 *
 * A derived file that sits alongside the MultiPoint points file and never replaces it.
 * Outlines are χ-shape concave hulls whose tightness is the distance that formed the
 * group, so an outline does not bridge a gap the clustering itself would not have
 * bridged. Statistics come straight from the pass-1 and pass-2 results; nothing is
 * recomputed. Scattered, unknown and last-mile groups get no polygon: they do not form
 * an area.
 */

import { make_projector } from '../geo/projector.js';
import { concaveHull, ringPoints, RING_SEGMENTS } from '../geo/concave-hull.js';
import { subareaProperties } from './geojson.js';

/** Largest boundary buffer a user may set, in metres (spec §6.5). */
export const MAX_BUFFER_M = 1000;

/**
 * Outline of one group of places.
 *
 * Without a buffer, the χ-shape of the members. With one, the χ-shape of the members
 * plus a circle of `bufferM` around each corner of the unbuffered outline, at a
 * tightness no smaller than that outline's longest edge, so the buffer band is never
 * cut back into. Notches narrower than tightness + 2 × buffer close, as they would
 * between two buffered places.
 *
 * @param {Array<[number, number]>} lonLat member coordinates, EPSG:4326 degrees
 * @param {(lon: number, lat: number) => [number, number]} project lon/lat to metres
 * @param {number} tightnessM longest gap to leave unbridged, in metres
 * @param {number} bufferM outward growth in metres (0 for none)
 * @returns {Array<[number, number]>|null} closed exterior ring in degrees,
 *   counter-clockwise; null when the group has no area and no buffer
 * @determinism Independent of member order (see {@link concaveHull}).
 */
export function outline(lonLat, project, tightnessM, bufferM) {
  const base = hull(lonLat, project, tightnessM);
  if (bufferM === 0) return base && close(base.map((i) => lonLat[i]));

  const corners = base ?? lonLat.map((_, i) => i);
  const grown = lonLat.concat(
    corners.flatMap((i) => ringPoints(lonLat[i][0], lonLat[i][1], bufferM))
  );
  const ring = hull(grown, project, Math.max(tightnessM, longestEdge(base, lonLat, project)));
  return ring && close(ring.map((i) => grown[i]));
}

/**
 * Build the boundaries FeatureCollection.
 *
 * @param {object} args
 * @param {Array<{ lon: number, lat: number }>} args.points EPSG:4326 points, index-aligned
 *   with `labels` and the pass-2 member indices
 * @param {Int32Array} args.labels pass-1 label per point (cluster id, or negative)
 * @param {Array<{ id: number, size: number, totals: object }>} args.clusters pass-1
 *   clusters, in output order
 * @param {object|null} args.pass2 the pass-2 result, or null when pass 2 did not run
 * @param {number} args.clusterTightnessKm eps1 (DBSCAN) or max_link (HDBSCAN), in km
 * @param {number} args.bufferM outward growth in metres, 0 to {@link MAX_BUFFER_M}
 * @param {object|null} args.meta provenance block (spec §6.2), or null for a pass-1 run
 * @returns {{ type: 'FeatureCollection', features: object[], meta: object }} cluster
 *   outlines first, then each cluster's sub-area outlines; `meta.boundaries` records
 *   the method, tightness rule, buffer and the number of groups left without a polygon
 * @determinism Pure function of its arguments.
 */
export function buildBoundaries({
  points,
  labels,
  clusters,
  pass2,
  clusterTightnessKm,
  bufferM,
  meta,
}) {
  const project = make_projector(points);
  const lonLatOf = (indices) => indices.map((i) => [points[i].lon, points[i].lat]);
  const features = [];
  let skipped = 0;
  const add = (id, indices, tightnessKm, properties) => {
    const ring = outline(lonLatOf(indices), project, tightnessKm * 1000, bufferM);
    if (!ring) {
      skipped++;
      return;
    }
    features.push({
      type: 'Feature',
      id,
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { ...properties, tightness_km: tightnessKm },
    });
  };

  const membersOf = new Map(clusters.map((c) => [c.id, []]));
  labels.forEach((label, i) => membersOf.get(label)?.push(i));
  for (const c of clusters) {
    add(`cluster-${c.id}`, membersOf.get(c.id), clusterTightnessKm, {
      kind: 'cluster_boundary',
      parent_cluster_id: c.id,
      point_count: c.size,
    });
  }

  for (const cluster of pass2 ? pass2.clusters : []) {
    const tightnessKm = cluster.eps2Km ?? clusterTightnessKm;
    for (const sub of cluster.subAreas) {
      if (sub.scattered) continue;
      add(sub.subAreaId, sub.memberIndices, tightnessKm, {
        kind: 'subarea_boundary',
        ...subareaProperties(sub, cluster.parentClusterId, cluster.hasUnknown),
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
    meta: {
      ...meta,
      boundaries: {
        method: 'chi-shape concave hull (Duckham et al. 2008) on a Delaunay triangulation',
        tightness:
          'clusters: eps1 (DBSCAN) or max_link (HDBSCAN); sub-areas: the cluster eps2, else eps1',
        bufferM,
        ringSegments: RING_SEGMENTS,
        withoutPolygon: skipped,
      },
    },
  };
}

/** Concave hull of lon/lat points, as indices into them. */
function hull(lonLat, project, tightnessM) {
  const xs = new Float64Array(lonLat.length);
  const ys = new Float64Array(lonLat.length);
  lonLat.forEach(([lon, lat], i) => {
    [xs[i], ys[i]] = project(lon, lat);
  });
  return concaveHull(xs, ys, tightnessM);
}

/** Longest edge of a ring of indices, in metres; 0 when there is no ring. */
function longestEdge(ring, lonLat, project) {
  if (!ring) return 0;
  let longest = 0;
  ring.forEach((a, k) => {
    const [ax, ay] = project(...lonLat[a]);
    const [bx, by] = project(...lonLat[ring[(k + 1) % ring.length]]);
    longest = Math.max(longest, Math.hypot(ax - bx, ay - by));
  });
  return longest;
}

/** Close a ring by repeating its first vertex (RFC 7946). */
function close(ring) {
  return [...ring, ring[0]];
}
