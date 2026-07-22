# EAE two-stage clustering — pass 2 (socio-economic sub-clustering)

Pass 2 adds **within-cluster socio-economic sub-areas** to the Energy Access Explorer
clustering tool. Pass 1 (geography DBSCAN/HDBSCAN) is unchanged. Everything runs
**client-side in the browser** — no server, no build step, and no network calls.

- **Entry page:** `index.html`
- **Spec (source of truth):** `two_stage_clustering_spec_final.md`

## Method in one paragraph

Pass 1 clusters points by geography. For each pass-1 cluster, pass 2 (a) bands its
with-data points by an **ability-to-pay ratio** using deterministic natural breaks
computed **within that cluster**, then (b) **respatialises each band** into contiguous
sub-areas with DBSCAN. Population is **summed** per sub-area; ability-to-pay is a
**population-weighted mean**, never summed. Pass-1 noise becomes a **last-mile** layer;
points with no ability value become an **unknown** layer; neither is dropped. Admin
boundaries are a human-in-the-loop overlay (highlight + optional split), never automatic.

## Running

```bash
npm install
npm test          # vitest: pure logic, planted-pocket regression, pass-1 golden master
npm run lint      # eslint
npm run format    # prettier --write
```

**Run the app** (module scripts + the Web Worker require `http://`, not `file://`):

```bash
python -m http.server 8099
# open http://localhost:8099/index.html
```

Load point GeoJSON(s); add a **population** GeoTIFF to enable pass 2; add an
**ability-to-pay** GeoTIFF to band sub-areas; (optional) add **admin** boundary
GeoJSON. Click _Run clustering_, then toggle _show sub-areas (pass 2)_.

## Architecture and module map

One HTML entry file; all logic in small, single-responsibility ES modules with pure
functions for the maths (testable in isolation). No module reaches into another's
internals; data is passed explicitly.

| Module        | Responsibility                | Key exports                                                                             |
| ------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| `io/`         | load points and rasters       | `merge_point_datasets`, `RasterField`, `build_weight`                                   |
| `geo/`        | projection + spatial index    | `make_projector`, `GridIndex` (incl. `kthNearestDist`)                                  |
| `cluster/`    | pass 1 (existing)             | `cluster_features`, `run_dbscan`, `run_hdbscan`, label sentinels                        |
| `banding/`    | within-cluster natural breaks | `assignBands`, `fisherJenks`, `ckmeans`                                                 |
| `subcluster/` | pass-2 core                   | `runPass2`, `deriveEps2`, `respatialiseBand`, `weightedStats`                           |
| `admin/`      | boundary overlay              | `parseAdminUnits`, `locatePoints`, `clusterStraddles`, `splitClusterByAdmin`            |
| `worker/`     | pass 2 off the main thread    | `runPass2InWorker`, `encodePass2Request`, `handlePass2`                                 |
| `output/`     | GeoJSON + provenance          | `buildFeatureCollection`, `buildProvenance`                                             |
| `render/`     | colour, legend, labels        | `absoluteView`, `bandRankFill`, `absoluteLegendStops`, `bandRankLegend`, `subareaLabel` |

### How pass 2 plugs into the tool (data flow)

```
points + rasters
  └─ cluster_features(opts)               pass 1 (unchanged) → labels, clusters, noise
     └─ sample ability + population per point (io/raster-field.js)
        └─ runPass2InWorker({px,py,labels,ability,population})   pass 2, in a Worker
           └─ buildFeatureCollection(pass2, points, meta, admin) → GeoJSON
              ├─ render/*  → map colouring, legends, labels
              └─ buildProvenance(...) → meta block embedded in the download
```

The HTML imports `cluster_features` and `merge_point_datasets` for pass 1 and the
`worker` / `output` / `render` / `admin` modules for pass 2. Pass-1 behaviour is frozen
by `test/pass1.regression.test.js` (a golden master captured from the original tool).

## Guarantees

- **Units & CRS:** data is EPSG:4326; all clustering is in **kilometres** via a local
  equirectangular projection (`geo/projector.js`). Degrees are never used as distance.
- **No distance matrix:** every neighbour query is index-backed (`geo/grid-index.js`).
- **Determinism:** point order is pinned; `assignBands` gives identical breaks for the
  same values; `eps2` is the median of each with-data point's `min2`-th nearest-neighbour
  distance. Same input ⇒ identical output (cluster order, sub-area ids, breaks).
- **Reporting rules (spec §3.3–3.4):** population summed; ability-to-pay only
  population-weighted-averaged; points missing population are counted but excluded from
  the mean (never silently unweighted); points missing ability are `unknown`, never
  imputed.

## Output contract (GeoJSON)

One `FeatureCollection`. Each feature is a `subarea`, `last_mile`, or `unknown` group
(`kind` property), geometry = `MultiPoint` of members, plus `bbox` and a `centroid`
property. Sub-area properties include `subarea_id`, `parent_cluster_id`, `band`,
`band_value_range`, `population` (integer sum), `mean_ability_to_pay` (or null),
`scattered`, `missing_population_count`, and — when admin boundaries are loaded —
`admin_units` and `straddle`. The top-level `meta` block carries full provenance
(layer ids/vintages, all parameters, per-cluster banding method + band count, CRS,
distance method, tool version, point count, timestamp).

> Note on the admin fields: the agreed v1 scope has **no admin hierarchy**, so the
> spec's `admin_path`/`straddle_level` are represented flatly as `admin_units`
> (array) + `straddle` (boolean).

## Testing

- **Unit:** banding determinism and Fisher-Jenks/Ckmeans agreement; km-not-degrees;
  population-weighted mean; adaptive-k floor; variance guard; `eps2`; k-NN; colour ramp;
  legends; relative labels; point-in-polygon; straddle; split.
- **Regression:** planted-pocket recovery on a synthetic city with two planted pockets.
- **Pass-1 safety:** golden master — the extracted modules reproduce the original tool
  exactly.
- **Not automated:** the interactive browser flow with real GeoTIFF rasters (module
  scripts + Worker do not run in the Node test runner) — smoke-test it in the browser.

See `docs/user-note.md` for the non-GIS reader's guide to what the sub-areas mean.
