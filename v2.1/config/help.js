/**
 * config/help.js — the in-tool notes behind each "i" button (spec §3.12).
 *
 * One entry per setting (every key in config/parameters.js) and per concept shown on
 * the map or in the panels. Each note has four parts: what it is, its unit, a rule of
 * thumb, and what turning it up or down does. Wording follows docs/USER_MANUAL.md.
 */

/**
 * @typedef {object} HelpNote
 * @property {string} title short name shown on the button's label
 * @property {string} what what it is, in plain words
 * @property {string} unit its unit ('' when unitless)
 * @property {string} rule a rule of thumb
 * @property {string} turn what changing it does
 */

/** @type {Record<string, HelpNote>} */
export const HELP = {
  algorithm: {
    title: 'Clustering method',
    what: 'How places are grouped. DBSCAN uses one fixed grouping distance everywhere; HDBSCAN finds groups of different densities without one fixed distance.',
    unit: '',
    rule: 'Start with DBSCAN and the suggested distance. Switch to HDBSCAN only if dense cities and sparse countryside cannot both look right with any one distance.',
    turn: 'Changing method changes which settings apply: eps and min_pts for DBSCAN; min_cluster_size, min_samples and max_link for HDBSCAN.',
  },
  eps_km: {
    title: 'Grouping distance (eps)',
    what: 'How close two places must be to count as neighbours. A place with enough neighbours within this distance starts a cluster.',
    unit: 'km',
    rule: 'The suggested value comes from the typical spacing of your places, reduced if one group would swallow more than half of them. It is the setting that changes results most.',
    turn: 'Larger: fewer, bigger clusters and fewer last-mile places. Smaller: more, tighter clusters and more last-mile places.',
  },
  min_pts: {
    title: 'Minimum neighbours (min_pts)',
    what: 'How many places, counting the place itself, must lie within the grouping distance for a cluster to start. No cluster is smaller than this.',
    unit: 'places (population-weighted places when weighting is on)',
    rule: '4 to 6 is the usual range; the tool ships with 4.',
    turn: 'Higher: stricter, fewer clusters, more last-mile. Lower: looser, sparse chains can link up.',
  },
  weighted: {
    title: 'Enforce minimum population',
    what: 'Only lets a cluster start where the people around it reach each population row’s minimum (min_pop).',
    unit: '',
    rule: 'Leave off unless you need every cluster to serve at least a set number of people. DBSCAN only.',
    turn: 'On: clusters in thinly populated areas are dropped to last-mile.',
  },
  min_cluster_size: {
    title: 'Minimum cluster size',
    what: 'The smallest group HDBSCAN will report as a cluster. Smaller groups join a bigger one or become last-mile.',
    unit: 'places (population-weighted places when weighting is on)',
    rule: 'Set it to the smallest settlement worth reporting; the tool ships with 25.',
    turn: 'Higher: fewer, larger clusters. Lower: more, smaller clusters.',
  },
  min_samples: {
    title: 'Density estimate (min_samples)',
    what: 'How many neighbours HDBSCAN uses to judge whether an area is dense. It is not a size limit.',
    unit: 'places (population-weighted places when weighting is on)',
    rule: 'Keep it at or below the minimum cluster size; the tool ships with 10.',
    turn: 'Higher: more places treated as last-mile, tighter cluster cores. Lower: more places kept in clusters.',
  },
  max_link_km: {
    title: 'Linking distance (max_link)',
    what: 'The furthest HDBSCAN will ever link two places. Groups further apart than this can never merge.',
    unit: 'km',
    rule: 'Suggested from your data, the same way as the DBSCAN distance.',
    turn: 'Larger: distant groups may join into one cluster, and runs are slower. Smaller: groups stay apart.',
  },
  cluster_weight: {
    title: 'Population weighting',
    what: 'Counts places by the people around them, so a place in a busy area counts for more than one in an empty area. Switched on automatically when a population map is loaded.',
    unit: 'population raster',
    rule: 'Keep it on to focus clusters where people live. Turn it off for plain place counts.',
    turn: 'On: size settings count population-weighted places; empty areas form fewer clusters.',
  },
  weight_floor: {
    title: 'Minimum weight',
    what: 'The smallest weight a place keeps under weighting, so places in empty areas still count a little.',
    unit: '× the average weight',
    rule: '0.1 is the default.',
    turn: 'Higher: empty-area places count more and can still join clusters. 0: they cannot start or join a cluster on their own.',
  },
  pass2_method: {
    title: 'Sub-area method',
    what: 'How clusters are split by wealth. Bands: sort places into wealth bands, then group nearby places of the same band. Regions: draw a few connected areas of similar wealth.',
    unit: '',
    rule: 'Use bands (the default). Regions is an opt-in alternative that mixes location and wealth.',
    turn: 'Changing it changes which sub-area settings apply.',
  },
  pass2_region_count: {
    title: 'Target regions',
    what: 'About how many connected areas each cluster is divided into, in regions mode.',
    unit: 'regions per cluster',
    rule: 'Start with about 4.',
    turn: 'Higher: more, smaller regions. Lower: fewer, larger ones.',
  },
  pass2_bands: {
    title: 'Bands (max)',
    what: 'The most wealth bands a cluster is split into, using that cluster’s own values. Clusters with too few places get fewer bands, or none.',
    unit: 'bands',
    rule: '5 is the default; results are stable between 3 and 5.',
    turn: 'Higher: finer splits, more sub-areas. Lower: coarser, fewer sub-areas.',
  },
  pass2_min2: {
    title: 'Minimum places per sub-area',
    what: 'The smallest sub-area drawn. It also sets the search distance used to find sub-areas, so raising it widens that distance too.',
    unit: 'places (never weighted)',
    rule: '4 is the default; never below 2.',
    turn: 'Higher: bigger, fewer sub-areas and more scattered places. Lower: more, smaller sub-areas.',
  },
  pass2_eps2_km: {
    title: 'Sub-area distance override',
    what: 'Replaces the automatic per-cluster sub-area distance with one fixed value.',
    unit: 'km (empty or 0 = automatic)',
    rule: 'Leave it automatic unless you have a reason.',
    turn: 'Larger: fewer, more joined-up sub-areas. Smaller: more scattered places.',
  },
  pass2_eps2_pct: {
    title: 'Sub-area distance percentile',
    what: 'How the automatic sub-area distance is picked from each cluster’s own spacing: 0.5 is the median.',
    unit: 'fraction from 0 to 1',
    rule: 'Keep 0.5; results are stable from 0.3 to 0.7.',
    turn: 'Higher: larger distance, fewer sub-areas. Lower: smaller distance, more scattered places.',
  },
  pass2_respat: {
    title: 'Sub-area grouping method',
    what: 'How places of the same band are grouped into sub-areas: DBSCAN with the sub-area distance, or HDBSCAN.',
    unit: '',
    rule: 'Keep DBSCAN unless sub-areas look too fragmented.',
    turn: 'HDBSCAN gives fewer, cleaner sub-areas.',
  },
  pass2_modality: {
    title: 'Skip smooth clusters',
    what: 'Leaves a cluster whole when its wealth values spread smoothly with no distinct groups, instead of forcing bands onto it.',
    unit: '',
    rule: 'Off by default. Turn it on if bands look arbitrary in clusters with little variation.',
    turn: 'On: fewer clusters are split.',
  },
  boundary_buffer_m: {
    title: 'Outline buffer',
    what: 'Grows every cluster and sub-area outline outward, so places sit inside their boundary instead of on its edge.',
    unit: 'm (0 to 1,000)',
    rule: 'Leave at 0 for the tightest outline; 100 to 200 m suits a CMS boundaries layer.',
    turn: 'Larger: rounder, wider outlines; narrow gaps between places close up.',
  },
  layer_weight: {
    title: 'Layer weight',
    what: 'How much each place of this file counts when groups are formed, compared with the other files.',
    unit: '× (relative to the other files)',
    rule: 'Leave all at 1 unless some facilities matter more for your question, for example clinics at 3.',
    turn: 'Higher: this layer forms clusters more easily. Weights are relative, so the other layers count slightly less.',
  },
  last_mile: {
    title: 'Last-mile places',
    what: 'Places that did not join any cluster because too few other places are close to them. Kept on purpose: they are often the hardest to reach.',
    unit: '',
    rule: '"About this result" says how far they are from the nearest cluster.',
    turn: 'A larger grouping distance absorbs near misses into clusters.',
  },
  unknown: {
    title: 'Unknown value',
    what: 'Places with no value on the wealth map. They are shown, but never given a band or an estimated value.',
    unit: '',
    rule: 'Many unknowns usually mean the wealth map does not cover those places.',
    turn: 'Load a wealth map that covers the area to reduce them.',
  },
  scattered: {
    title: 'Scattered places',
    what: 'Places in a wealth band that are too spread out to form a tidy sub-area. Kept, never dropped, and never outlined.',
    unit: '',
    rule: 'A few are normal.',
    turn: 'Fewer minimum places per sub-area, or a larger sub-area distance, turns more of them into sub-areas.',
  },
  outline: {
    title: 'How outlines are drawn',
    what: 'Each outline wraps its places closely and never stretches across a gap wider than the distance that formed the group, so it does not claim empty land, lakes or river bends.',
    unit: '',
    rule: 'Dashed: a whole cluster. Solid: a sub-area. These are the polygons in the Boundaries download.',
    turn: 'Tightness follows the clustering distance and cannot be set separately; the outline buffer grows them.',
  },
  bands: {
    title: 'Band rank',
    what: 'Shading from the poorest to the richest band within each cluster, judged only against that cluster’s own values.',
    unit: '',
    rule: 'Band numbers are not comparable between clusters: a city’s lowest band can be richer than a village’s highest.',
    turn: 'Use "absolute value" colouring to compare across the map.',
  },
  absolute_colour: {
    title: 'Absolute value colouring',
    what: 'Colours each sub-area by its population-weighted mean wealth value on one scale, so the same colour means the same value everywhere.',
    unit: 'the wealth map’s own units',
    rule: 'The safe choice for comparing places across the map.',
    turn: 'Darker: higher value.',
  },
  export_class: {
    title: 'Export by class',
    what: 'Download only the sub-areas of one class. "Across the map" classes use the actual value and compare everywhere; "within each cluster" classes are the poorest or richest part of each cluster only.',
    unit: '',
    rule: 'Use the across-the-map fifths to target places nationally.',
    turn: 'Within-cluster classes leave out small clusters that have only one band.',
  },
};
