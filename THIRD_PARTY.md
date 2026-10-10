# Third party material

- **Fraunces** (variable, latin subset) by the Fraunces Project Authors, embedded in `dist/index.html` for headings and the clock. SIL Open Font License 1.1, full text in `licenses/FRAUNCES-OFL.txt`.
- **NOAA solar position equations** (NOAA Global Monitoring Laboratory) are implemented in `src/core/solar.js`. The equations are public.
- **pvlib** 0.16.1 and its NREL Solar Position Algorithm implementation were used once to produce `test/fixtures/solar-reference.json`. They are not part of the build and not shipped.
- **esbuild** (build) and **Playwright** (browser tests) are development dependencies and are not shipped.
- **OpenStreetMap** map pictures, building outlines and address search, used only after a person allows each one, come from OpenStreetMap contributors and are available under the Open Database License (https://www.openstreetmap.org/copyright). The page shows the credit with the map. `test/fixtures/overpass-taipei.json` is a small extract of that data, kept for the tests.
- **內政部不動產交易實價查詢服務網** (Ministry of the Interior, real price registration, https://plvr.land.moi.gov.tw/) is the source of the past deals in `data/deals`, and the city address points of Taipei (data.gov.tw 155472), New Taipei (168887), Taichung (169806) and Taoyuan (157689) give each deal its place. All of it is open data under the Open Government Data License, version 1 (政府資料開放授權條款第1版), which asks for the source to be named, and the quick check names it next to the numbers. `test/fixtures/deals/` holds a few dozen rows of each file for the tests. The data is only fetched by `scripts/make-deals.mjs` and is not read from any listing site.
- **@photostructure/tz-lookup** (CC0 1.0) is bundled into the page as the table that gives a time zone for a latitude and longitude. Its data comes from the timezone-boundary-builder project (ODbL).
- **World Magnetic Model 2025** by NOAA NCEI and the British Geological Survey, a public domain model, is in `src/core/wmm2025.js`.
- **pygeomag**, **pyproj**, **timezonefinder**, **shapely**, **OpenCV** and **numpy** were used once each to produce files in `test/fixtures/`. They are not part of the build and not shipped.
