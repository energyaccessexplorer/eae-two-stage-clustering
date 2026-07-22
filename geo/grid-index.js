/**
 * geo/grid-index.js — uniform-grid spatial index for neighbour queries.
 * Extracted verbatim from the original single-file tool (behaviour unchanged),
 * with the cell-size invariant now documented and enforced (see `within`).
 *
 * All coordinates are **metres** in the local frame from geo/projector.js, never
 * degrees. The index exists so neighbour queries never require a full distance
 * matrix: it is the only neighbour-search primitive either pass may use.
 */

/** Thrown when a radius query exceeds the index's cell size (see `GridIndex.within`). */
export class GridIndexRadiusError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GridIndexRadiusError';
  }
}

export class GridIndex {
  /**
   * Bin points into a uniform grid.
   *
   * @param {Float64Array} px x coordinates in metres
   * @param {Float64Array} py y coordinates in metres, same length and order as px
   * @param {number} cell bin edge length in metres. This is the **maximum radius
   *   `within` may be queried with** — pick the clustering eps, not a round number.
   *   For `nearest`-only indices it is purely a speed/memory trade-off.
   */
  constructor(px, py, cell) {
    this.px = px;
    this.py = py;
    this.cell = cell;
    this.cell2 = cell * cell;
    this.bins = new Map();
    let minx = Infinity,
      maxx = -Infinity,
      miny = Infinity,
      maxy = -Infinity;
    for (let i = 0; i < px.length; i++) {
      const cx = this._c(px[i]),
        cy = this._c(py[i]);
      if (cx < minx) minx = cx;
      if (cx > maxx) maxx = cx;
      if (cy < miny) miny = cy;
      if (cy > maxy) maxy = cy;
      const k = cx + ',' + cy;
      let b = this.bins.get(k);
      if (!b) {
        b = [];
        this.bins.set(k, b);
      }
      b.push(i);
    }
    this._max_ring = maxx - minx + (maxy - miny) + 2;
  }

  _c(x) {
    return Math.floor(x / this.cell);
  }

  /**
   * All points within a radius of the point at index `i` (including `i` itself).
   *
   * **Invariant: the radius must not exceed the index's cell size.** Only the 3×3
   * ring of cells around the query point is scanned, so a larger radius would
   * silently miss neighbours in the next ring out — clusters would fragment with
   * no error raised. Build the index with `cell = eps` and query at `eps²`.
   *
   * @param {number} i index of the query point in the arrays given to the constructor
   * @param {number} eps2 squared radius in metres², must be <= cell²
   * @returns {number[]} indices of the neighbouring points; order is deterministic
   *   for a given index, following cell then insertion order
   * @throws {GridIndexRadiusError} if eps2 exceeds cell²
   */
  within(i, eps2) {
    if (eps2 > this.cell2)
      throw new GridIndexRadiusError(
        `radius ${Math.sqrt(eps2)} m exceeds the index cell size ${this.cell} m; ` +
          'rebuild the index with cell = the query radius'
      );
    const x = this.px[i],
      y = this.py[i],
      cx = this._c(x),
      cy = this._c(y),
      out = [];
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const b = this.bins.get(gx + ',' + gy);
        if (!b) continue;
        for (const j of b) {
          const dx = this.px[j] - x,
            dy = this.py[j] - y;
          if (dx * dx + dy * dy <= eps2) out.push(j);
        }
      }
    return out;
  }

  /**
   * Index of the point closest to an arbitrary position, at any distance.
   *
   * Unlike `within` this takes coordinates rather than a point index, and is not
   * radius-limited: it expands ring by ring until the nearest point is provably
   * found. Callers that need a maximum search distance must impose it themselves.
   *
   * @param {number} x metres, local frame
   * @param {number} y metres, local frame
   * @returns {number} index of the nearest point, or -1 if the index is empty
   */
  nearest(x, y) {
    const cx = this._c(x),
      cy = this._c(y);
    let best = -1,
      bd = Infinity;
    for (let r = 0; r <= this._max_ring; r++) {
      for (let gx = cx - r; gx <= cx + r; gx++)
        for (let gy = cy - r; gy <= cy + r; gy++) {
          if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue;
          const b = this.bins.get(gx + ',' + gy);
          if (!b) continue;
          for (const j of b) {
            const dx = this.px[j] - x,
              dy = this.py[j] - y,
              d = dx * dx + dy * dy;
            if (d < bd) {
              bd = d;
              best = j;
            }
          }
        }
      if (best >= 0) {
        const inner = r * this.cell;
        if (inner * inner > bd) break;
      }
    }
    return best;
  }

  /**
   * Distance to the k-th nearest OTHER point to the point at index `i`.
   *
   * The k-distance heuristic pass 2 uses to derive `eps2` (spec §3.9). Like
   * `nearest`, it expands ring by ring and stops once the k closest points are
   * provably settled — no full distance matrix, no radius ceiling. The query point
   * itself is excluded, so `k` counts other points only.
   *
   * @param {number} i index of the query point in the arrays given to the constructor
   * @param {number} k rank of the neighbour to measure, k >= 1
   * @returns {number} Euclidean distance in metres to the k-th nearest other point,
   *   or the distance to the farthest other point when fewer than `k` others exist;
   *   Infinity when `i` is the only point
   * @remarks Deterministic: returns a distance, so ties among equidistant neighbours
   *   never affect the result.
   */
  kthNearestDist(i, k) {
    const x = this.px[i],
      y = this.py[i],
      cx = this._c(x),
      cy = this._c(y);
    // The k smallest squared distances seen so far, kept ascending (k is small).
    const best = [];
    const consider = (d2) => {
      if (best.length < k) {
        let p = best.length;
        best.push(d2);
        while (p > 0 && best[p - 1] > best[p]) {
          const t = best[p - 1];
          best[p - 1] = best[p];
          best[p] = t;
          p--;
        }
      } else if (d2 < best[k - 1]) {
        best[k - 1] = d2;
        let p = k - 1;
        while (p > 0 && best[p - 1] > best[p]) {
          const t = best[p - 1];
          best[p - 1] = best[p];
          best[p] = t;
          p--;
        }
      }
    };
    for (let r = 0; r <= this._max_ring; r++) {
      for (let gx = cx - r; gx <= cx + r; gx++)
        for (let gy = cy - r; gy <= cy + r; gy++) {
          if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue;
          const b = this.bins.get(gx + ',' + gy);
          if (!b) continue;
          for (const j of b) {
            if (j === i) continue;
            const dx = this.px[j] - x,
              dy = this.py[j] - y;
            consider(dx * dx + dy * dy);
          }
        }
      // Any point in an unexplored ring is at least r*cell away; once the k-th best
      // is no farther than that, farther rings cannot improve it.
      if (best.length === k) {
        const inner = r * this.cell;
        if (inner * inner > best[k - 1]) break;
      }
    }
    return best.length ? Math.sqrt(best[best.length - 1]) : Infinity;
  }
}
