# EAE Two-Stage Clustering — Method, Findings & Training Notes

_Working reference for the pass-2 (socio-economic sub-clustering) work. Captures how the
method works, what real Kenya/Nepal data showed, and the nuances to keep in mind when
explaining or training others. Companion to the developer `README.md` and `docs/user-note.md`._

## 1. What the tool does

The tool groups facility points in two passes, entirely in the browser:

- **Pass 1 — geography.** DBSCAN (or HDBSCAN) clusters points by location, in kilometres.
- **Pass 2 — socio-economic.** Inside each pass-1 cluster it separates points by a
  socio-economic value (e.g. Relative Wealth Index), then groups those spatially into
  sub-areas. Two methods are offered:
  - **bands** (default, spec-compliant): band the values within the cluster (natural
    breaks), then re-cluster each band spatially.
  - **regions** (opt-in): SKATER-style regionalization — contiguous regions that are
    internally similar in value. This deliberately fuses geography and value.

Pass-1 noise becomes a **last-mile** layer; points with no value become an **unknown**
layer; neither is ever dropped. Admin boundaries are an optional human-in-the-loop overlay.

## 2. Core concepts

- **Bands are within a cluster.** "Lowest fifth" means lowest within that cluster, not
  nationally. Band index is therefore **not comparable across clusters** — the default map
  colours by **absolute value** on one shared ramp so the same colour means the same value
  everywhere.
- **Population is summed; value is population-weighted-averaged**, never summed.
- **Pass 2 requires population.** Without a population layer, only pass 1 runs.
- **Unknown / last-mile / scattered** points are always shown, never discarded.
- **Determinism & units.** Data is EPSG:4326; all clustering is in kilometres; identical
  inputs give identical outputs; no full distance matrix is ever built.

## 3. Real-data findings (Kenya & Nepal)

Tested on Kenya (health 9,987 & schools 37,870 points; WorldPop + Meta RWI; subcounty
admin) and Nepal (health 5,726 & education 12,884; WorldPop + Meta RWI).

### Efficiency

| Test                                | Result                          |
| ----------------------------------- | ------------------------------- |
| Pass 1, 38k points                  | ~90 ms                          |
| Pass 2, ~10k points, any mode       | < 35 ms                         |
| Largest single real cluster         | 32,851 points (Nairobi schools) |
| Banding that cluster — Ckmeans      | ~17 ms                          |
| Banding that cluster — Fisher-Jenks | ~10 s (identical breaks)        |

The index-backed design scales well. Fisher-Jenks (O(k·n²)) is only viable on small
clusters, which is why the Ckmeans fallback exists (see §5).

### The Karen vs Kibera test (the most important nuance)

Nairobi's Karen (wealthy) and Kibera (large informal settlement) came out with **nearly
identical RWI (~1.19 vs ~1.16) and both in the upper bands** — the tool could not tell them
apart. This is **not** an algorithm failure: the RWI grid is ~3 km, Kibera is ~2.5 km
across, and the RWI surface is smooth at that scale. At this resolution the tool separates
**urban-core from periphery, not neighbourhood-scale pockets.**

Takeaway: the method is only as sharp as the socio-economic layer. With a coarse layer,
detected "multimodality" is real variance but not necessarily the socio-economically
meaningful contrast.

### Sensitivity

| Knob                      | Behaviour                               |
| ------------------------- | --------------------------------------- |
| pass-1 eps                | DOMINANT: noise 70% → 22% across 1–5 km |
| band count (3 vs 5)       | Stable (~3% change in sub-areas)        |
| eps2 percentile (0.3–0.7) | Stable                                  |
| region count              | Scales roughly linearly (as expected)   |

The fragile choice is **pass-1 eps** — two analysts with different eps get very different
maps. The pass-2 parameters are comparatively robust.

## 4. Nuances & caveats (training-critical)

1. **Resolution ceiling.** Output cannot resolve contrast finer than the socio-economic
   layer's cell size. RWI (~3 km) → core-vs-periphery, not Kibera-scale pockets. Now
   recorded in the output provenance (`caveats.resolutionCeilingKm`).
2. **eps1 is the sensitive knob.** Use the "suggest eps" button (k-distance knee) as a
   starting point, then sanity-check the noise fraction.
3. **"Multimodal" ≠ "meaningful."** A cluster can have statistical structure that does not
   correspond to a real socio-economic divide. The modality guard helps, but does not
   guarantee meaning.
4. **Bands are within-cluster only.** Never present band index as cross-cluster comparable;
   use the absolute-value colouring for national comparison.
5. **Regions mode fuses geography + value** — it is an explicit exception to the "never
   fuse" rule (spec §8), so it is opt-in and a product-owner choice, never the default.
6. **Population gate.** No population layer → no pass 2 (correct behaviour; Nepal initially
   lacked one).
7. **Raster orientation & CRS.** Some providers ship a positive y-resolution with a
   top-left origin (the Meta RWI tiles do); the sampler normalises this. RWI is EPSG:3857,
   population often EPSG:4326 — both handled. A 0%-sampled result now raises a warning
   (almost always a CRS/extent mismatch, not empty data).

## 5. Parameters & guidance

| Parameter              | Role                            | Guidance                                 |
| ---------------------- | ------------------------------- | ---------------------------------------- |
| eps1 (km)              | pass-1 neighbourhood radius     | Most sensitive; start from "suggest eps" |
| min1                   | pass-1 core threshold           | 5 is a reasonable default                |
| min2                   | pass-2 core threshold           | Default 4                                |
| eps2 percentile        | derived pass-2 radius           | Default 0.5 (median); robust             |
| band count             | number of value bands           | Default 5; expert-settable               |
| region count           | target regions (regions mode)   | Default 4                                |
| modality guard         | skip banding on smooth clusters | Off by default; size-gate recommended    |
| banding size threshold | Fisher-Jenks → Ckmeans switch   | Default 1500 (data-backed)               |

## 6. Reading the map

- **Absolute value (default):** same colour = same value everywhere; safe for comparison.
- **Band rank:** within-cluster shading, per-cluster legend (no global band legend).
- **Distinct sub-cluster:** one hue per sub-cluster, for identification only.
- **Grey** = unknown / last-mile; **hollow ring** = scattered; **dashed outline** = parent
  cluster boundary.
- **Download GeoJSON** carries every layer plus the full provenance/caveats block.

## 7. Known limitations & future work

- Ground-truth was inconclusive at RWI resolution; re-test with a finer socio-economic
  layer when available (RWI is currently the finest to hand).
- Add an in-browser end-to-end check on real rasters (worker + GeoTIFF.js + proj4 path).
- Size-gate the modality guard (bimodality coefficient is noisy on small clusters).
- Test at national scale (100k+ points) and profile worker memory.
- Fold the v2 fixes into the deployed V1 once changes are finalised.
- Consider auto-eps as a default and clearer per-geography parameter guidance.

## 8. Glossary

- **Cluster (pass 1):** a geographic grouping of points.
- **Sub-area / band / region (pass 2):** a socio-economic subdivision within a cluster.
- **Last-mile:** pass-1 noise (unclustered points) — the assistance-need layer.
- **Unknown:** points with no socio-economic value — never banded or imputed.
- **Scattered:** band points too spread out to form a contiguous sub-area.
- **RWI:** Relative Wealth Index (Meta / Data for Good) — the socio-economic layer used here.
