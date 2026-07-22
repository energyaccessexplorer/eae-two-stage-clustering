# Two-stage socio-economic sub-clustering: final implementation spec

**Status:** all decisions resolved. Ready for implementation.
**Supersedes:** the earlier design brief and the open-decisions sheet; this is the single document to hand to implementation.
**Output audience:** non-GIS ministry and partner staff. Interpretability takes priority over sophistication throughout.

---

## 1. Purpose

Sub-areas stay general-purpose. EAE serves different audiences running their own multi-criteria analysis, so the output must support subsidy targeting, investment segmentation, or a prioritisation list interchangeably. The tool produces sub-areas and per-area statistics; the audience decides what they mean. Do not hardcode a single use case into the method or the labels.

---

## 2. Method at a glance

1. **Pass 1 (existing):** density clustering on geography. Unchanged.
2. **Pass 2 (new):** inside each pass-1 cluster, points are banded by an ability-to-pay ratio using deterministic natural breaks computed within that cluster, and every band is re-clustered spatially into contiguous sub-areas.
3. **Noise** from pass 1 is surfaced as a separate last-mile layer, never discarded.
4. **Admin boundaries** are a human-in-the-loop overlay, not an automatic constraint.

Feasibility is established: a synthetic prototype recovered planted poor pockets to within 0.03 and 0.29 km, with the second pass running in about 64 ms for ~4,000 points. Open items are data-quality tests (Section 7), not feasibility.

---

## 3. Resolved decisions

### 3.1 Ability-to-pay layer (the input)

- **Pluggable slot**, not fixed to RWI.
- **Ratios only in v1** (RWI, GDP per capita, purchasing power). No intensive-versus-extensive handling needed now. A future count layer must be normalised to a ratio first.
- **Bands computed within the parent cluster**, always, to surface internal variation rather than national position.
- Report per sub-area: population as a **sum**; ability-to-pay as a **population-weighted mean**, never summed.

### 3.2 Banding method (deterministic)

- **Fisher-Jenks** natural breaks (deterministic dynamic programming) is the primary method, chosen because it is the GIS-standard natural-breaks algorithm.
- **Automatic fallback to Ckmeans.1d.dp** (exact, deterministic 1D k-means) when a cluster's with-data point count exceeds a size threshold, because Fisher-Jenks is O(k·n²) and strains on a very large cluster. The switch is automatic and the result stays deterministic either way. Threshold set after the largest-cluster test (Section 7).
- **Point ordering is pinned** so DBSCAN border-point assignment is reproducible.
- **Default five bands.** Band count is fixed in default mode and user-settable only in expert mode.
- Breaks are fit on the with-data points of the parent cluster only.

### 3.3 Sub-areas and small-n handling

- **Band, then respatialise all five bands** into contiguous sub-areas.
- **Adaptive band count with a floor**, run automatically because users give little input in default mode: reduce the number of bands until each band holds at least a floor number of points (default floor: five points per band, minimum two bands); if even two bands cannot be supported, report the cluster as a single unit.
- **Near-zero-variance guard:** if a cluster's values are all within noise of one another, skip banding and report it as a single homogeneous unit with a flag.
- Each sub-area reports: population sum, population-weighted mean ability-to-pay, band, band value range, admin unit or units, and a straddle flag.

### 3.4 Population requirement

- **Pass 2 requires population.** If no population layer is added, the tool runs **pass 1 only** and shows an explicit message that sub-areas cannot be produced without population.
- Within a present population layer (assumed complete, for example GHS-POP), a rare point with no population value is flagged and excluded from that sub-area's weighted mean, but still shown on the map. The weighted mean is never silently replaced by an unweighted one.

### 3.5 Noise (unclustered points from pass 1)

- **Never dropped.** Surfaced as a separate **last-mile / assistance-need** layer with its own count and, where available, an ability-to-pay summary.

### 3.6 Coverage gaps (points with no ability-to-pay value)

- **Separate "ability-to-pay unknown" category.** Not imputed, not silently excluded. These points stay visible, may be grouped spatially so a contiguous unmeasured area is apparent, but are never assigned a band or a fabricated value.

### 3.7 Administrative boundaries (human in the loop)

- **Clustering runs boundary-blind.** Boundaries never automatically constrain or pre-split clusters.
- **Straddle detection:** any cluster or sub-area intersecting two or more admin units is highlighted.
- **User decides:** for each flagged item the user chooses, on demand, whether to split along the boundary or leave it whole. Never automatic.
- **Split mechanics:** partition existing members by admin polygon (a cut that preserves membership), then recompute pass 2 (banding, adaptive-k, respatialise) within each admin piece, since each piece becomes the new parent for within-cluster banding.
- **Always tagged, at every level:** the admin boundary dataset carries a hierarchy, so each cluster and sub-area is tagged with its full admin path (for example country, state, district, ward) rather than a single level. This enables reporting and rollups at any level the user chooses. Straddle detection applies per level: an item can be whole at a higher level but straddle at a lower one, and the highlight and split apply at the level the user is working in.

### 3.8 Colouring and labels (cross-cluster honesty)

- Because bands are within-cluster, band index is **not comparable across clusters**.
- **Default map colours sub-areas by absolute ability-to-pay value** on one continuous ramp, so the same colour means the same value everywhere and national prioritisation stays honest.
- A **within-cluster inspection view toggles to band rank** with a per-cluster legend of value ranges.
- **Hard rule:** never show a single global band-index legend.
- **Labels:** within-cluster relative language ("lowest fifth ... highest fifth of this area"), not absolute wealth language. **Colour:** a neutral sequential ramp, avoiding loaded schemes such as red-for-poor.

### 3.9 Pass-2 spatial eps

- **Default is derived from within-cluster density**, deterministically: for each parent cluster, take the median of the `min2`-nearest-neighbour distances (in km) among its with-data points, and use that as `eps2` for all of that cluster's bands. Recompute per piece after a split.
- **User-overridable in expert mode.**

---

## 4. Technical constraints (critical)

- **CRS:** canonical data in **EPSG:4326** (WGS84).
- **Units:** all clustering in **kilometres, not degrees.** Do not pass degree coordinates to DBSCAN with a degree `eps`; a degree of longitude is not a fixed distance. Use either the haversine metric (radians, `eps = eps_km / 6371`) or reproject to a local metric CRS for the clustering step and map labels back. Pick one and apply it to both passes and every `eps`.
- **No distance matrix.** All DBSCAN neighbour queries use a spatial index (k-d tree or equivalent), keeping both passes near O(n log n) in time and linear in memory. This is what makes the single-huge-cluster case safe; the memory risk is the naive O(n²) matrix, which we do not build.
- **Compute ceiling:** Fisher-Jenks auto-switches to Ckmeans.1d.dp above the size threshold (Section 3.2). Spatial re-clustering relies on the indexed neighbour queries above. Actual thresholds set after the largest-cluster test.
- **Pass 2 runs in a Web Worker** so the map never freezes.
- **Reuse the pass-1 neighbour structure** in pass 2 by subsetting rather than rebuilding.
- **Geography and ability-to-pay are never fused** into one clustering metric. Wealth defines the band; geography defines contiguity within the band.

---

## 5. Algorithm specification

```
INPUT: points in EPSG:4326, each with population and an ability-to-pay
       ratio (either may be missing); admin polygons; parameters.

GATE
  0. If no population layer: run PASS 1 only, show notice, stop.

PASS 1  (geography)
  1. DBSCAN on geography, distances in km, indexed neighbour queries
     (eps1_km, min1). Pinned point order.
  2. Noise (label -1) -> LAST-MILE layer, reported separately.

PASS 2  (per pass-1 cluster C)
  3. Partition C into WITH-DATA and NO-DATA (missing ability-to-pay).
  4. NO-DATA -> "ability-to-pay unknown" category (optionally grouped;
     never banded, never imputed).
  5. Variance guard: if WITH-DATA spread ~ 0, report C as one unit, skip.
  6. Choose band count k: start at 5, reduce until each band has >= floor
     (default 5) points, min 2; if < 2 possible, report C as one unit.
  7. Natural breaks on WITH-DATA values of C only:
        Fisher-Jenks, or Ckmeans.1d.dp if |WITH-DATA| > size_threshold.
     Assign each point a band 0..k-1 (0 = lowest ability to pay).
  8. eps2 = median of min2-NN distances (km) among C's WITH-DATA points.
  9. For EACH band b: DBSCAN(eps2, min2), indexed, on that band's points
     -> contiguous sub-areas.
 10. Per sub-area:
        population     = SUM of member populations          (count)
        ability_to_pay = population-weighted MEAN of values  (ratio)
        band, band_value_range, admin_units, straddle_flag
     (points missing population: flagged, excluded from the mean, shown)

ADMIN OVERLAY  (human in the loop)
 11. Tag admin unit(s) per cluster/sub-area; straddle_flag if > 1.
 12. Highlight straddlers. On user request: partition members by polygon,
     recompute PASS 2 per piece. Never automatic.

COLOURING
 13. Default: colour sub-areas by ABSOLUTE ability-to-pay value (one ramp).
     Toggle: band rank, per-cluster legend. No global band legend.

OUTPUT: sub-areas, per-cluster "unknown" category, last-mile layer,
        plus the metadata block in Section 6.2.
```

---

## 6. Output contract

### 6.1 Structure

Single **GeoJSON FeatureCollection**. Each feature is a sub-area, a last-mile point group, or an unknown group, distinguished by a `kind` property. Stable IDs throughout.

Per-feature properties:

- `kind`: `"subarea" | "last_mile" | "unknown"`
- `subarea_id`: stable unique id
- `parent_cluster_id`: link to the pass-1 cluster
- `band`: integer, or null for last-mile/unknown
- `band_value_range`: [min, max] of the band's ability-to-pay values, or null
- `population`: integer (sum)
- `mean_ability_to_pay`: population-weighted mean, or null
- `admin_path`: full hierarchy of intersecting admin units per level (for example `{country, state, district, ward}`); a level holds an array where the item intersects more than one unit at that level
- `straddle_level`: the finest admin level, if any, at which the item straddles more than one unit, else null
- `has_unknown`: boolean (whether the parent cluster has unmeasured points)

### 6.2 Provenance metadata (top-level `meta`)

Embedded so any output is reproducible and auditable, and users can save it to their own systems:

- ability-to-pay layer id and vintage
- population layer id and vintage
- admin boundary dataset and version
- all parameters: `eps1_km`, `min1`, `eps2` rule and any override, `min2`, band count and mode, banding method actually used per cluster (Fisher-Jenks or Ckmeans), size threshold
- CRS and clustering-distance method (haversine or projected)
- tool version, point count, timestamp

---

## 7. To validate on real data before finalising

- Are real within-city ability-to-pay distributions multimodal (real structure) or smooth? If smooth, banding imposes structure that is not there, and that should change the plan.
- Does within-city banding separate known contrasting areas (for example Karen versus Kibera in Nairobi)?
- Largest single cluster size: sets the Fisher-Jenks-to-Ckmeans threshold, the memory profile, and any Web Worker necessity.
- Admin boundary data source and currency for each geography (the hierarchy is confirmed present).
- Sensitivity to band count and to `eps` values.

---

## 8. Non-negotiable constraints

- Outputs stay interpretable for non-GIS partners.
- Geography and ability-to-pay are never fused into one clustering metric.
- v1 accepts ratio layers only; any future count layer is normalised first.
- Bands are always computed within the parent cluster, and band index is never presented as comparable across clusters.
- Population is summed; the ability-to-pay ratio is never summed.
- Pass 2 requires population; without it, only pass 1 runs, with a clear notice.
- Points with no ability-to-pay value are flagged as unknown, never imputed or silently excluded.
- Noise points are never silently dropped; they are the last-mile layer.
- Admin boundaries never split clusters automatically; splitting is a user decision on flagged straddlers, at the admin level the user is working in.
- Every cluster and sub-area is tagged with its full admin hierarchy path, and straddle detection is per level.
- Data is stored in EPSG:4326; all clustering is in kilometres, never degrees.
- No full distance matrix is ever built; neighbour queries are index-backed.
- Banding is deterministic; point ordering is pinned.
- Pass 2 runs off the main thread.
- Every output carries a full provenance metadata block.
