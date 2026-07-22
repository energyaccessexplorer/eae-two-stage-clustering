# Reading the sub-areas — a short guide

This tool groups facilities into **clusters** by location (pass 1), then splits each
cluster into **sub-areas** by an ability-to-pay measure (pass 2). It is designed to be
read without GIS training. This note explains what the sub-areas mean and the caveats
to keep in mind.

## What a sub-area is

Inside one cluster, the tool sorts points into a few **bands** by their ability-to-pay
value (for example richest fifth to poorest fifth), then draws each band's points as one
or more **contiguous sub-areas** on the map. A sub-area is "a group of nearby facilities
that sit in the same ability-to-pay band of their cluster."

Each sub-area reports:

- **Population** — the total people it covers (a sum).
- **Ability-to-pay** — the population-weighted average for that sub-area (never a sum).
- Its **band** and the value range that band spans **within its own cluster**.

## The three things on the pass-2 map

- **Coloured sub-areas** — the measured groups. By default colour shows the **absolute**
  ability-to-pay value on one shared scale, so _the same colour means the same value
  everywhere_ — safe for comparing across the whole map.
- **Grey "unknown" groups** — points with no ability-to-pay data. They are shown but
  never given a band or a made-up value.
- **Grey "last-mile" points** — points that pass 1 left unclustered (isolated
  facilities). They are never dropped; they are the assistance/last-mile layer.
- **Dashed outlines** — "scattered" points: band members too spread out to form a tight
  sub-area. Also kept, never discarded.

## Caveats (important)

- **Bands are within each cluster, not across clusters.** "Lowest fifth" in a wealthy
  city and "lowest fifth" in a poor town are _not_ the same thing. That is why the
  default colouring uses the absolute value scale. The optional **band-rank** view is
  only for inspecting one cluster at a time, and it shows a **separate value-range legend
  per cluster** — there is deliberately no single global band legend.
- **Population is required for sub-areas.** Without a population layer, only pass 1 runs.
- **Ability-to-pay is a ratio** (e.g. a wealth index or GDP per capita), version 1 only.
- **Resolution ceiling:** results are only as fine as your input points and rasters. The
  tool finds structure that is present; it does not invent a smooth surface. If a
  cluster's values are all alike, it is reported as a single unit rather than split.
- **Admin boundaries never split anything automatically.** If you load them, the tool
  _highlights_ clusters a boundary would cut and lets you choose to split — your decision.

## Saving results

**Download sub-areas GeoJSON** saves everything shown — sub-areas, unknown, and
last-mile groups — plus a provenance block recording the layers, parameters, and time,
so a result can be reproduced and audited later.
