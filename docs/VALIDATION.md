# What was checked

Two parts of the model can be checked against something outside this repository: where the sun is, and which points of the room a window lights. Run `node scripts/validate.mjs` to reproduce the numbers.

## Sun position

`src/core/solar.js` follows the NOAA Global Monitoring Laboratory equations. It is compared with the NREL Solar Position Algorithm (the reference method of Reda and Andreas, 2004) as implemented in pvlib 0.16.1, with the settings the NOAA equations assume: no delta T, a standard atmosphere.

- 403 samples: 15 places on every continent and both hemispheres (Taipei, Singapore, Quito, Sydney, Cape Town, Reykjavik, Tromso, New York, Los Angeles, London, Mumbai, Tokyo, Sao Paulo, Dubai, Auckland), 5 days (20 March, 21 June, 22 September, 21 December and 9 August), 6 local times, sun above 0.5 degrees.
- Elevation (geometric and with refraction): mean error 0.0027 degrees, worst 0.0068 degrees.
- Azimuth: mean error 0.0031 degrees, worst 0.0588 degrees. The worst values are with the sun almost overhead, where azimuth is ill defined. With the sun below 80 degrees elevation the worst is 0.0125 degrees.
- The worked example in the NREL paper (Boulder, 17 October 2003) matches to 0.02 degrees in zenith and azimuth.

With the delta T of 69 seconds that real ephemerides use, the reference moves by at most 0.0008 degrees in elevation and 0.0194 degrees in azimuth over the same samples, so ignoring it, as NOAA does, stays inside the numbers above.

The reference rows are in `test/fixtures/solar-reference.json`. `scripts/make-reference.py` writes them.

## Which points a window lights

Each case is a random room (2.5 to 8 metres a side), one to four windows with random size, sill, shade and building across the street, a wall thickness from none to 40 cm, a random sun direction aimed at one of the windows and a random floor or table height. The exact polygons from `src/core/light.js` are compared with a ray tracer that shares no code with them (`test/helpers/raytrace.js`): from each probe point it follows the ray toward the sun through the room, the wall, the shade and the building, and asks whether it gets out of a window.

- Across five random seeds, 3,767 rooms and 3,767,000 probe points on the floor and the four walls, of which 213,948 were lit: 0 disagreements.
- `node scripts/validate.mjs` runs the five seeds (1 to 5). The tests in `test/light.test.js` run a sixth seed on every change and fail on a single disagreement.
- The comparison found one real bug while it was being written: light that arrived below a raised plane was also dropped from the wall patches. It is fixed and covered.

Both sides share the same modelling choices, so this checks the geometry and the bookkeeping, not the choices. The choices are:

- Beams within about one degree of running along the wall (the sun is nearly edge on to the window) are ignored.
- The wall thickness is the same all around the window and the opening has the same size on both faces.
- The shade is a thin horizontal slab. The building across the street is a flat front of unlimited width.
- Direct sun only, with a clear sky.
- Hours are counted on the local clock. On the one day a year a clock moves, a day that has a repeated hour counts as 24 hours. It only matters where the sun is up through the change, for example in Antarctica.

## What is not checked

There is no photograph of a real room next to a prediction yet. Until there is one, treat the patch as a geometric prediction for a clear sky and a room that matches what you typed in, and expect real rooms to differ because of window frames, trees, neighbouring buildings, reflections and the exact orientation. If you can measure a room, please open an issue with the room file, the date, the place, the time and a photograph with a tape measure in it.

The phone compass reads magnetic north. The model needs true north. The difference is the magnetic declination of your location (a few degrees in Taiwan, more than 15 degrees in parts of Canada and Russia), and Sunspill does not correct for it.
