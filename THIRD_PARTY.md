# Third party material

- **Fraunces** (variable, latin subset) by the Fraunces Project Authors, embedded in `dist/index.html` for headings and the clock. SIL Open Font License 1.1, full text in `licenses/FRAUNCES-OFL.txt`.
- **NOAA solar position equations** (NOAA Global Monitoring Laboratory) are implemented in `src/core/solar.js`. The equations are public.
- **pvlib** 0.16.1 and its NREL Solar Position Algorithm implementation were used once to produce `test/fixtures/solar-reference.json`. They are not part of the build and not shipped.
- **esbuild** (build) and **Playwright** (browser tests) are development dependencies and are not shipped.
