/**
 * io/raster-field.js — CRS-aware raster sampling (population count or density).
 * Extracted verbatim from the original single-file tool (behaviour unchanged);
 * the cell lookup shared by `sample` and `covers` was factored out of `sample`.
 */

import { cell_km2 } from '../geo/projector.js';

const IDENT = (a, b) => [a, b];

/**
 * A sampled raster with its CRS hooks, exposing point lookups and a cell walk.
 *
 * Handles two shapes of population raster: counts (people per cell, used as-is) and
 * densities (people per km², multiplied by cell area). Cell area depends on the CRS,
 * which is why the geographic/projected distinction is carried here.
 */
export class RasterField {
  /**
   * @param {object} r raster definition
   * @param {ArrayLike<number>} r.values row-major grid, length width * height
   * @param {number} r.width columns
   * @param {number} r.height rows
   * @param {[number, number]} r.origin top-left corner in raster CRS units
   * @param {[number, number]} r.resolution [rx, ry] cell size in raster CRS units;
   *   ry is normally negative for a north-up grid
   * @param {number} r.nodata value meaning "no observation"
   * @param {boolean} [r.is_density] values are people per km² rather than per cell
   * @param {(lon: number, lat: number) => [number, number]} [r.to_xy] EPSG:4326 to raster
   *   CRS; identity when the raster is already 4326
   * @param {(X: number, Y: number) => [number, number]} [r.from_xy] the inverse of to_xy
   * @param {boolean} [r.is_geographic=true] resolution is in degrees rather than a
   *   linear unit; drives how density becomes a count
   * @param {number} [r.to_meter=1] linear unit to metres, for projected rasters
   */
  constructor(r) {
    this.v = r.values;
    this.w = r.width;
    this.h = r.height;
    this.ox = r.origin[0];
    this.oy = r.origin[1];
    this.rx = r.resolution[0];
    this.ry = r.resolution[1];
    this.nodata = r.nodata;
    this.is_density = !!r.is_density;
    // CRS hooks: lon/lat -> raster XY and back. Identity when raster is 4326.
    this.to_xy = r.to_xy || IDENT;
    this.from_xy = r.from_xy || IDENT;
    // CRS nature, for correct density -> count cell area. Default geographic (degrees).
    this.is_geographic = r.is_geographic !== false;
    this.to_meter = r.to_meter || 1; // linear-unit -> metres (projected rasters)
  }

  /**
   * Ground area of one cell at the given latitude.
   *
   * @param {number} lat degrees; ignored for projected rasters
   * @returns {number} km²
   */
  cell_area_km2(lat) {
    // Geographic raster: rx/ry are degrees, area varies with latitude.
    if (this.is_geographic) return cell_km2(this.rx, this.ry, lat);
    // Projected raster: rx/ry are linear units; the projected pixel area is the
    // density denominator (exact for equal-area grids like Mollweide).
    const mx = Math.abs(this.rx * this.to_meter),
      my = Math.abs(this.ry * this.to_meter);
    return (mx * my) / 1e6;
  }

  /** Grid position of a lon/lat, or null when it falls outside the raster. */
  _cell(lon, lat) {
    const [X, Y] = this.to_xy(lon, lat);
    const col = Math.floor((X - this.ox) / this.rx);
    const row = Math.floor((Y - this.oy) / this.ry);
    if (col < 0 || row < 0 || col >= this.w || row >= this.h) return null;
    return row * this.w + col;
  }

  /**
   * Whether a position falls inside the raster's extent.
   *
   * Lets callers tell "outside the raster" apart from "nodata", which `sample`
   * deliberately collapses into a single null.
   *
   * @param {number} lon degrees, EPSG:4326
   * @param {number} lat degrees, EPSG:4326
   * @returns {boolean}
   */
  covers(lon, lat) {
    return this._cell(lon, lat) !== null;
  }

  /**
   * Raw raster value under a position.
   *
   * @param {number} lon degrees, EPSG:4326
   * @param {number} lat degrees, EPSG:4326
   * @returns {number|null} the stored value, or null when the position is outside the
   *   raster, hits nodata, or holds a non-finite value — use `covers` to tell which
   */
  sample(lon, lat) {
    const at = this._cell(lon, lat);
    if (at === null) return null;
    const val = this.v[at];
    if (val === this.nodata || !Number.isFinite(val)) return null;
    return val;
  }

  /**
   * People living under a position, converting density to a count where needed.
   *
   * @param {number} lon degrees, EPSG:4326
   * @param {number} lat degrees, EPSG:4326
   * @returns {number} people; 0 where there is no usable value
   */
  people_at_point(lon, lat) {
    const raw = this.sample(lon, lat);
    if (raw == null) return 0;
    return this.is_density ? raw * this.cell_area_km2(lat) : raw;
  }

  /**
   * Visit every cell holding a positive population.
   *
   * @param {(X: number, Y: number, people: number) => void} cb receives the cell centroid
   *   in **raster CRS** units (use `from_xy` for lon/lat) and its people count
   * @remarks Deterministic: cells are visited in row-major order.
   */
  for_each_populated_cell(cb) {
    // yields raster-CRS centroid X,Y plus people
    const { v, w, h, ox, oy, rx, ry, nodata, is_density } = this;
    for (let row = 0; row < h; row++) {
      const Y = oy + (row + 0.5) * ry,
        base = row * w;
      for (let col = 0; col < w; col++) {
        const raw = v[base + col];
        if (raw === nodata || !Number.isFinite(raw) || raw <= 0) continue;
        const X = ox + (col + 0.5) * rx;
        let people = raw;
        if (is_density) {
          const ll = this.from_xy(X, Y);
          people = raw * this.cell_area_km2(ll[1]);
        }
        cb(X, Y, people);
      }
    }
  }
}
