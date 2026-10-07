/**
 * geo/concave-hull.js — χ-shape concave hull and buffer ring points (spec §6.5).
 *
 * The χ-shape (Duckham et al., 2008) starts from the Delaunay triangulation, whose
 * outer edge is the convex hull, and repeatedly removes the longest boundary edge
 * longer than `maxEdge`, so long as the shape stays one simple polygon. The result
 * never bridges a gap wider than `maxEdge` unless that is needed to stay one polygon.
 * Triangulation is O(n log n) (Delaunator); no distance matrix is ever built.
 */

import Delaunator from '../vendor/delaunator/index.js';
import { EARTH_R, DEG2RAD } from './projector.js';

/** Segments used to approximate a full circle in buffer rings (spec §6.5). */
export const RING_SEGMENTS = 16;

const nextEdge = (e) => (e % 3 === 2 ? e - 2 : e + 1);
const prevEdge = (e) => (e % 3 === 0 ? e + 2 : e - 1);

/**
 * Concave outline of a planar point set.
 *
 * @param {ArrayLike<number>} xs x coordinates in **metres** (projected)
 * @param {ArrayLike<number>} ys y coordinates in metres, index-aligned with `xs`
 * @param {number} maxEdge longest boundary edge to keep where possible, in metres
 * @returns {number[]|null} indices into `xs`/`ys` of the outline ring, counter-clockwise,
 *   not closed (first index is not repeated); null when fewer than three distinct,
 *   non-collinear points exist
 * @determinism Depends only on the set of points and `maxEdge`, not on their order:
 *   points are sorted before triangulating, so ties resolve the same way every time.
 */
export function concaveHull(xs, ys, maxEdge) {
  const n = xs.length;
  if (n < 3) return null;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => xs[a] - xs[b] || ys[a] - ys[b]
  );
  const coords = new Float64Array(2 * n);
  order.forEach((p, k) => {
    coords[2 * k] = xs[p];
    coords[2 * k + 1] = ys[p];
  });
  const { triangles, halfedges } = new Delaunator(coords);
  if (triangles.length === 0) return null;

  const length = (e) => {
    const a = triangles[e];
    const b = triangles[nextEdge(e)];
    return Math.hypot(coords[2 * a] - coords[2 * b], coords[2 * a + 1] - coords[2 * b + 1]);
  };
  const boundaryEdge = new Uint8Array(triangles.length);
  const boundaryVertex = new Uint8Array(n);
  const heap = new MaxHeap();
  for (let e = 0; e < triangles.length; e++) {
    if (halfedges[e] !== -1) continue;
    boundaryEdge[e] = 1;
    boundaryVertex[triangles[e]] = 1;
    heap.push(e, length(e));
  }

  // Remove the triangle behind the longest boundary edge while that keeps the polygon
  // simple: its third vertex must not already lie on the boundary.
  while (heap.size > 0) {
    const { item: e, key } = heap.pop();
    if (key <= maxEdge) break;
    const apex = triangles[prevEdge(e)];
    if (boundaryVertex[apex]) continue;
    boundaryEdge[e] = 0;
    boundaryVertex[apex] = 1;
    for (const inner of [nextEdge(e), prevEdge(e)]) {
      const twin = halfedges[inner];
      boundaryEdge[twin] = 1;
      heap.push(twin, length(twin));
    }
  }

  return orderedRing(triangles, boundaryEdge, coords).map((k) => order[k]);
}

/**
 * Walk the boundary edges into one ring, starting at the lowest vertex for
 * determinism, and orient it counter-clockwise (RFC 7946 exterior ring).
 */
function orderedRing(triangles, boundaryEdge, coords) {
  const outgoing = new Map();
  for (let e = 0; e < triangles.length; e++) {
    if (boundaryEdge[e]) outgoing.set(triangles[e], e);
  }
  let start = Infinity;
  for (const v of outgoing.keys()) if (v < start) start = v;
  const ring = [];
  let v = start;
  do {
    ring.push(v);
    v = triangles[nextEdge(outgoing.get(v))];
  } while (v !== start && ring.length <= outgoing.size);

  let area2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area2 += coords[2 * a] * coords[2 * b + 1] - coords[2 * b] * coords[2 * a + 1];
  }
  return area2 < 0 ? ring.reverse() : ring;
}

/**
 * Points on a circle of the given ground radius around a location, for buffering.
 *
 * @param {number} lon longitude in degrees (EPSG:4326)
 * @param {number} lat latitude in degrees
 * @param {number} radiusM circle radius in **metres** of ground distance
 * @returns {Array<[number, number]>} {@link RING_SEGMENTS} [lon, lat] points in degrees
 */
export function ringPoints(lon, lat, radiusM) {
  const dLat = radiusM / EARTH_R / DEG2RAD;
  const dLon = dLat / Math.cos(lat * DEG2RAD);
  return Array.from({ length: RING_SEGMENTS }, (_, k) => {
    const t = (2 * Math.PI * k) / RING_SEGMENTS;
    return [lon + dLon * Math.cos(t), lat + dLat * Math.sin(t)];
  });
}

/** Binary max-heap of items keyed by number; ties resolve by the larger item. */
class MaxHeap {
  constructor() {
    this.keys = [];
    this.items = [];
  }

  get size() {
    return this.keys.length;
  }

  above(i, j) {
    return (
      this.keys[i] > this.keys[j] ||
      (this.keys[i] === this.keys[j] && this.items[i] > this.items[j])
    );
  }

  swap(i, j) {
    [this.keys[i], this.keys[j]] = [this.keys[j], this.keys[i]];
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
  }

  push(item, key) {
    this.keys.push(key);
    this.items.push(item);
    for (let i = this.keys.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (!this.above(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop() {
    const top = { item: this.items[0], key: this.keys[0] };
    const lastKey = this.keys.pop();
    const lastItem = this.items.pop();
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.items[0] = lastItem;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < this.keys.length && this.above(l, best)) best = l;
        if (r < this.keys.length && this.above(r, best)) best = r;
        if (best === i) break;
        this.swap(i, best);
        i = best;
      }
    }
    return top;
  }
}
