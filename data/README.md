# Test data

Drop local test layers here to exercise the tool on real geographies (e.g. Kenya).
These files are **git-ignored** — they are large binaries with their own licences, and
the tool loads them at runtime, so they are never bundled or committed. Only this
README is tracked. Fetch the layers from the sources below and place them in this
folder; then load them through the UI.

All layers must be **EPSG:4326**. The tool re-projects to kilometres internally.

## Expected layers

| Purpose                     | File (suggested)     | Format                       | Notes                                                                                 |
| --------------------------- | -------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| Facility points             | `facilities.geojson` | GeoJSON Point/MultiPoint     | the features to cluster (health sites, schools, etc.)                                 |
| Population                  | `population.tif`     | GeoTIFF                      | count or density (tick "raster is density" in the UI if density); required for pass 2 |
| Socio-economic parameter    | `rwi.tif`            | GeoTIFF                      | a **ratio** layer (e.g. relative wealth index); enables sub-areas                     |
| Admin boundaries (optional) | `admin.geojson`      | GeoJSON Polygon/MultiPolygon | for straddle highlighting / split                                                     |

## Suggested sources (Kenya)

- **Population:** WorldPop (`worldpop.org`) or GHS-POP (`ghsl.jrc.ec.europa.eu`) — download
  the Kenya tile, clip to the study area to keep it small.
- **Relative Wealth Index:** Meta Data for Good, via HDX (`data.humdata.org`, search
  "Relative Wealth Index Kenya"). It ships as points/CSV — rasterise to a GeoTIFF first.
- **Facilities:** your own EAE facility layer, or OSM/HDX health-facility exports.
- **Admin boundaries:** GADM (`gadm.org`) or Kenya's official boundaries on HDX.

## Keep it small

Clip rasters to the city/region you are testing (e.g. Nairobi) and downsample if needed —
a few MB is plenty and keeps browser loading fast. Record each layer's **source, vintage,
and licence** here when you add it, so results stay reproducible and attributable.
