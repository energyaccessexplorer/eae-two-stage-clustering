# EAE Clustering Tool — Step-by-Step User Manual

_A plain-language guide. No GIS or programming knowledge needed. If a word looks
technical, check the Glossary at the end — every term is explained there._

## What this tool does (in one minute)

Imagine you have a list of places — health clinics, schools, shops — spread across a
country. This tool does two things:

1. It finds **clusters**: bunches of places that sit close together (like "all the clinics
   in and around this town").
2. Inside each cluster, it finds **sub-areas**: smaller groups separated by how rich or
   poor the surrounding area is (using a wealth map you provide).

The result is a map you can use to see, for example, "here is a poorer pocket inside this
otherwise well-off town." Everything runs in your web browser, and **your data never leaves
your computer.**

## The key ideas, in plain words

_You can skip this and start clicking (next section), then come back when a term appears.
Nothing here is math — just what the buttons mean._

- **Clustering** — grouping things that are close together. Step 1 groups places by
  location; step 2 groups them again by wealth.
- **DBSCAN** (the step-1 method) — imagine drawing a small circle around every place. Where
  enough circles overlap, those places form a **cluster**. Places with too few neighbours
  are left out as loners. That's the whole idea: crowds become clusters, loners become
  leftovers.
- **eps** — the size of that circle, in kilometres. It's the "how close is close enough?"
  setting. **Bigger eps → fewer, larger clusters; smaller eps → more, tighter clusters and
  more loners.** (Use the **suggest eps** button for a good starting value.)
- **min_pts** — how many places must fall inside the circle for it to count as a real crowd
  (rather than a lucky pair). 5 is a sensible default.
- **HDBSCAN** — an optional, smarter version of DBSCAN for when some areas are densely
  packed and others sparse; it doesn't force one fixed circle size. Most people can ignore
  it and use DBSCAN.
- **Noise / last-mile** — the loners DBSCAN left out. The tool keeps them as a separate
  "last-mile" layer because isolated places often matter most for planning.
- **Bands (natural breaks)** — inside a cluster, the tool sorts places by wealth and finds
  the natural gaps, like grading a class on a curve: lowest fifth, next fifth, … highest
  fifth. Each tier is a **band**.
- **Regions** — an alternative to bands: instead of tiers, the tool draws a few connected
  areas where neighbours have similar wealth — more like drawing neighbourhood boundaries.
  Choose "regions" and a **target number** (say 4) if you prefer clean bounded areas.
- **Sub-area** — any of those band or region pieces inside a cluster.
- **Population-weighted average** — when the tool reports a wealth number for an area, places
  where more people live count more, so the number reflects where people actually are (not
  just how many dots are on the map).
- **RWI (Relative Wealth Index)** — a ready-made "wealth score" map many teams use as the
  wealth input. Higher = relatively better off.
- **Raster / GeoTIFF** — a map stored as a grid of squares, each holding a number (people, or
  a wealth score). Your population and wealth maps are rasters (`.tif` files).
- **GeoJSON** — a file listing point locations or area shapes. Your places, and any district
  outlines, are GeoJSON (`.geojson`).
- **Projection / coordinate system (CRS)** — the way a map states _where_ things are. All
  your files should use ordinary latitude/longitude so they line up.

## What you need before you start

- A computer with a modern web browser (Chrome, Edge, or Firefox).
- Your data files. You can start with just the first one:

| File                       | What it is (plain words)                                                 | File type  |
| -------------------------- | ------------------------------------------------------------------------ | ---------- |
| Places                     | A list of point locations to group (e.g. clinics).                       | `.geojson` |
| Population map             | A map where each square says how many people live there.                 | `.tif`     |
| Wealth map                 | A map where each square has a wealth score (e.g. Relative Wealth Index). | `.tif`     |
| District shapes (optional) | The outlines of districts/counties.                                      | `.geojson` |

Two simple rules for the files:

- They should all use ordinary GPS coordinates (latitude/longitude). Data from normal
  mapping sources usually already does.
- You only _need_ the Places file to begin. The Population map unlocks sub-areas; the
  Wealth map is what splits places into richer/poorer groups.

## Opening the tool

The tool is a single web page, but you must open it through a small local "server" — not by
double-clicking the file. (Browsers block parts of the tool if you open the file directly;
this is normal and is about security, not a fault.)

**The easy way (once someone sets it up):** just open the web link you were given, for
example `http://localhost:8000/` or a shared address, and skip to the next section.

**Doing it yourself (Windows):**

1. Put the tool folder somewhere on your computer (e.g. your Desktop).
2. Open that folder in File Explorer.
3. Click the address bar at the top, type `powershell`, and press **Enter**. A black window
   opens.
4. Type `python -m http.server 8000` and press **Enter**. Leave this window open.
5. Open your browser and go to `http://localhost:8000/`.

You should now see **three columns**: **Controls** on the left, the **Map** in the middle,
and **Results** on the right.

## Step 1 — Load your places

1. On the left, under **Load data**, click the first file button ("Point datasets").
2. Choose your `.geojson` file of places.
3. You'll see the file name appear in the list, with a count of how many places it holds.

_The middle panel still says "Load point datasets to begin" until you run — that's fine._

## Step 2 — Add the population map (needed for sub-areas)

1. Under **Load data**, click the **population raster** file button and choose your `.tif`.
2. Only tick **"raster is density"** if your population map is stored as people-per-km²
   rather than head counts. **If you're not sure, leave it unticked.**

Without a population map the tool still finds clusters, but it cannot make sub-areas.

## Step 3 — Add the wealth (socio-economic) map

1. Click the **Socio-economic parameter raster** file button and choose your `.tif`
   (e.g. a Relative Wealth Index map).
2. This is the map the tool uses to tell richer areas from poorer ones inside each cluster.

## Step 4 — Check the projection

Look at the **Projection check** line.

- **Green** = the maps and places line up correctly. Good to go.
- **Red** = the coordinate systems don't match. Ask a technical colleague to reproject the
  map to standard latitude/longitude, or paste the definition it asks for.

## Step 5 — Choose how tightly to group

Under **Algorithm**, leave the method as **dbscan**. Two settings matter:

- **eps (km)** — how close two places must be to be "neighbours." Bigger number = fewer,
  larger groups; smaller = more, tighter groups, and more leftovers.
- **min_pts** — the smallest number of places that counts as a group. **5** is a fine start.

💡 **Tip:** click **"suggest eps"** and the tool will propose a sensible distance based on
your data. Treat it as a starting point and adjust if the map looks too clumped or too
scattered.

## Step 6 — Run

Click the blue **Run clustering** button. The middle map fills with coloured groups (each
colour is one cluster; grey dots are lone places that didn't join any group).

## Step 7 — Show the sub-areas (the socio-economic split)

1. Scroll down the left panel to **Sub-areas (pass 2)**.
2. Tick **"show sub-areas (pass 2) on the map."**
3. **Colour sub-areas by** — pick one:
   - **absolute value** (recommended): colour = the actual wealth value, so the same
     colour means the same value everywhere on the map.
   - **band rank**: shading from poorest to richest _within each cluster_.
   - **distinct sub-cluster**: a different colour per sub-group, just to tell them apart.
4. **Pass-2 method**:
   - **bands** (default): split by wealth, then group the nearby ones.
   - **regions**: draw a few clean, bounded areas of similar wealth. Set **target regions**
     to about **4** to start.
5. If you change any setting here, click **Apply to sub-areas** to redraw.

Optional extras: **show parent cluster boundaries** draws a dashed outline around each
whole cluster; **outline each sub-cluster** draws a boundary around each sub-group.

## Step 8 — (Optional) District boundaries and splitting

1. Load a **district shapes** `.geojson` under Load data.
2. Any cluster that crosses a district line gets highlighted below the map.
3. Click **"split along boundary"** next to it to divide that cluster along the district
   line. Nothing is split automatically — it's always your choice.

## Step 9 — Save your results

Click **Download sub-areas GeoJSON**. This saves a single file containing all the sub-areas,
the "unknown" and "last-mile" groups, and a record of every setting used (so the result can
be reproduced later).

## Reading the map

- **Colours** on sub-areas = the wealth value. On the recommended "absolute value" setting,
  the same colour means the same value anywhere on the map.
- **Grey** = either "unknown" (no wealth value available there) or "last-mile" (lone places
  that didn't join a cluster). Both are shown on purpose — never hidden.
- **Hollow rings** = "scattered" places (in a wealth band, but too spread out to form a tidy
  group).
- **Dashed outline** = the boundary of a whole cluster.

## The Results panel (right side)

After you run, the right panel lists every cluster with its size. Click any row (or any
shape on the map) to see the individual places inside it.

## Troubleshooting

| What you see                                  | What it means / what to do                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| The left panel is blank                       | You opened the file directly. Open it through `http://localhost:8000/` instead.                                 |
| Warning: "0% of points got a value"           | The wealth or population map doesn't line up with your places — wrong file or coordinate system.                |
| Everything turns grey after adding population | Normal if you haven't added a **wealth** map yet — grey means "no wealth value." Add the wealth map and re-run. |
| Too many grey (leftover) dots                 | Your **eps** is too small. Increase it, or click **suggest eps**.                                               |
| Nothing happens when you click Run            | Load at least one Places file first.                                                                            |

## Important things to know

- **The tool is only as detailed as your maps.** A coarse wealth map (large squares) can
  show broad rich-vs-poor differences but **cannot** pick out a small neighbourhood-sized
  pocket. If you need fine detail, you need a finer wealth map.
- **Groups are ranked within their own cluster**, not against the whole country — that's why
  the recommended colouring uses the actual value, so national comparisons stay honest.
- **Your data stays on your computer.** Nothing is uploaded, even when the tool is opened
  from a web link.

## Glossary

- **GeoJSON** — a file listing locations or shapes. Here: your places, or district outlines.
- **GeoTIFF / raster** — a map stored as a grid of squares, each holding a number (people, or
  a wealth score). File ending `.tif`.
- **Cluster** — a bunch of places close together (found in the first step).
- **Sub-area** — a smaller group inside a cluster, separated by wealth (found in the second
  step).
- **DBSCAN** — the step-1 method that grows clusters from crowded areas and leaves loners
  out. **HDBSCAN** — a smarter variant for mixed dense/sparse areas.
- **eps** — the neighbour distance (in km) used to decide what counts as "close."
- **min_pts** — the fewest places needed to form a group.
- **Natural breaks** — the way the tool finds wealth tiers (bands): it splits the values at
  their natural gaps, like grading on a curve.
- **Modality guard** — an optional switch: if a cluster's wealth values are all similar,
  don't split it into bands (there is nothing meaningful to split).
- **Population-weighted average** — an average where places with more people count more, so
  the reported wealth reflects where people actually live.
- **Projection / coordinate system** — the way a map states _where_ things are. All files
  here should use ordinary latitude/longitude.
- **RWI (Relative Wealth Index)** — a common wealth-score map; a typical choice for the
  wealth map.
- **Last-mile** — lone places that didn't join any cluster; often the ones needing most
  attention.
- **Unknown** — places with no wealth value available; shown, but never guessed at.
- **Scattered** — places in a wealth band that are too spread out to form a tidy sub-area.
- **Band / Region** — two ways of drawing sub-areas: bands rank by wealth; regions draw a few
  clean bounded areas of similar wealth.
