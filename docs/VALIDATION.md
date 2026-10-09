# What was checked

Every geometry piece in Sunspill is compared with a reference that shares no code with it. Run `node scripts/validate.mjs` to reproduce every number here. The Python scripts that make the reference data are in `scripts/` and the data they wrote is in `test/fixtures/`, so the comparison runs without Python.

| Piece | Compared with | Result |
| --- | --- | --- |
| Sun position | The NREL Solar Position Algorithm in pvlib 0.16.1 | 403 samples, worst 0.0068 degrees in elevation and 0.0588 in azimuth |
| Light through a window | A ray tracer written separately, `test/helpers/raytrace.js`, which borrows only the wall frame helper | 3,767,000 probes, 0 disagreements |
| Shadows of buildings, trees, balcony rails and eaves | The same ray tracer, which uses the real outline of each building | 987,660 probes, 0 disagreements |
| Shadows of buildings, trees, balcony rails and eaves | pvlib for the sun, then shapely rays against extruded polygons in a world frame | 54,000 probes, 0 disagreements |
| Overlap, difference and union of convex polygons, centroids, a point inside, edges that cross, the convex parts of a concave outline | shapely (GEOS), `scripts/make-polygon-reference.py` | 300 pairs, 150 sets, 400 outlines and 160 footprints (142 of them concave), worst area difference 2e-14 m2 |
| Outline of a building drawn as several ways (a multipolygon) | shapely `linemerge` and `polygonize`, areas in a pyproj azimuthal projection | 4 real Overpass relations, within 0.5 % before thinning to 40 corners and 3 % after |
| East and north offsets from latitude and longitude | pyproj, WGS84 topocentric frame | 80 points within 400 m, worst 3.8 cm |
| Map tile positions | The slippy map formula from the OpenStreetMap wiki | 40 points, worst 2e-16 of the world width |
| Magnetic declination | pygeomag with the World Magnetic Model 2025 coefficients | 105 points, worst 0.0003 degrees |
| Phone angles to a heading | numpy rotation matrices in the DeviceOrientation order | 120 orientations, worst 1e-13 degrees |
| Time zone at a point | timezonefinder | 121 of 125 land points name the same zone |
| Perspective map for a photo of the floor | OpenCV `getPerspectiveTransform` | 40 maps, worst 0.0001 pixel |
| Fitting the facing and the window | Synthetic rooms with known answers and a marked patch that wobbles by 3 cm | Facing within 1.5 degrees and window position within 8 cm, in `test/fit.test.js` |

## Sun position

`src/core/solar.js` follows the NOAA Global Monitoring Laboratory equations. It is compared with the NREL Solar Position Algorithm (the reference method of Reda and Andreas, 2004) as implemented in pvlib 0.16.1, with the settings the NOAA equations assume: no delta T, a standard atmosphere.

- 403 samples: 15 places on every continent and both hemispheres (Taipei, Singapore, Quito, Sydney, Cape Town, Reykjavik, Tromso, New York, Los Angeles, London, Mumbai, Tokyo, Sao Paulo, Dubai, Auckland), 5 days (20 March, 21 June, 22 September, 21 December and 9 August), 6 local times, sun above 0.5 degrees.
- Elevation (geometric and with refraction): mean error 0.0027 degrees, worst 0.0068 degrees.
- Azimuth: mean error 0.0031 degrees, worst 0.0588 degrees. The worst values are with the sun almost overhead, where azimuth is ill defined. With the sun below 80 degrees elevation the worst is 0.0125 degrees.
- The worked example in the NREL paper (Boulder, 17 October 2003) matches to 0.02 degrees in zenith and azimuth.

With the delta T of 69 seconds that real ephemerides use, the reference moves by at most 0.0008 degrees in elevation and 0.0194 degrees in azimuth over the same samples, so ignoring it, as NOAA does, stays inside the numbers above.

The reference rows are in `test/fixtures/solar-reference.json`. `scripts/make-reference.py` writes them.

## Which points a window lights

Each case is a random room (2.5 to 8 metres a side), one to four windows with random size, sill, shade and building across the street, a wall thickness from none to 40 cm, a random sun direction aimed at one of the windows and a random floor or table height. The exact polygons from `src/core/light.js` are compared with a ray tracer written separately (`test/helpers/raytrace.js`, which only borrows the wall frame helper from `src/core/room.js`): from each probe point it follows the ray toward the sun through the room, the wall, the shade and the building, and asks whether it gets out of a window.

- Across five random seeds, 3,767 rooms and 3,767,000 probe points on the floor and the four walls, of which 213,948 were lit: 0 disagreements.
- `node scripts/validate.mjs` runs the five seeds (1 to 5). The tests in `test/light.test.js` run a sixth seed on every change and fail on a single disagreement.
- The comparison found one real bug while it was being written: light that arrived below a raised plane was also dropped from the wall patches. It is fixed and covered.

## Buildings, trees, balcony rails and eaves

A building or a tree is a convex prism, which is a footprint lifted between two heights. A building outline of any shape is cut into convex parts first. The shadow a prism throws on the outer face of a window is the convex hull of its corners carried along the sun rays, and it is taken out of the lit opening. `test/obstacles.test.js` checks this three ways.

- A wall of unlimited width gives the same patches as the flat building across the street of version 0.1.
- 1,829 random rooms with 1 to 5 buildings (some L shaped, some with up to 7 corners), trees, balcony rails and floors from 1 to 8 give 987,660 probe points, and the separate ray tracer agrees with every one. That tracer cuts the ray at every edge of the real outline, so it does not depend on the convex parts. The disagreements it found while this was written came from a crown polygon that turned with the room instead of staying fixed to the compass. That is fixed.
- `scripts/make-obstacle-reference.py` builds 300 more rooms in a world frame of east, north and up using only compass bearings, takes the sun from pvlib and traces 54,000 probe points with shapely against extruded polygons. Of those, 4,036 are lit and 1,275 are dark only because of a building, a tree or a rail. There are 0 disagreements.

## Places, magnets, phones and pictures

- **Latitude and longitude to metres.** Sunspill uses the length of a degree on the WGS84 ellipsoid at the room's latitude. Against pyproj it is within 3.8 cm over 80 random points up to 400 m away, which is the radius buildings are loaded from.
- **Magnetic declination.** `src/core/declination.js` evaluates the World Magnetic Model 2025 spherical harmonics (degree 12) from the public domain coefficients. It matches pygeomag to 0.0003 degrees at 105 places, heights and dates from 2025 to 2030. The model itself is good to about 0.4 degrees in most places, and worse near the magnetic poles.
- **Phone compass.** The heading comes from the rotation matrix of the three DeviceOrientation angles. The direction the back of an upright phone faces is used when the phone stands against a window, and the top edge when it lies flat. The matrix agrees with numpy's. What is not checked is the sensor of a particular phone, see below.
- **Time zone.** The zone comes from a table bundled in the page, `@photostructure/tz-lookup`, built from the timezone-boundary-builder polygons. Against timezonefinder, 121 of 125 land points give the same zone name and the others fall on borders.
- **Photo of the floor.** Four taps on the floor corners fix a perspective map, which is compared with OpenCV. The flattened photo is checked on a synthetic floor with a stripe of known position.
- **Buildings drawn as relations.** A big building is often a multipolygon whose outer ring is several ways that meet end to end. `test/fixtures/overpass-relations.json` holds four of them as Overpass really answered (Taipei Main Station, Taipei 101, an apartment block), and `scripts/make-relation-reference.py` joins their ways with shapely and measures the area with pyproj. Sunspill's outline is within 0.5 % of that area before it is thinned to 40 corners and within 3 % after, whatever the order and direction of the ways. The query once asked Overpass for `out geom tags`, which leaves the members out of a relation, so these buildings were silently missing until 0.2.2. The test now also covers the answer with no members.
- **Tracing a plan.** Three taps give a room whose size is within a pixel of the drawing, in whichever direction the taps go round the room. This is in `test/trace.test.js`.

## Fitting to what you saw

`src/core/fit.js` compares the patch you mark on the floor with the patch the model predicts, by intersection over union of the two areas, and searches the facing (and, when two observations are at least 15 degrees apart in sun azimuth, the window position and sill height) for the best match. `test/fit.test.js` makes rooms with a known answer, marks their patch with a 3 cm wobble, starts the model from a wrong facing (up to 11 degrees) and a window 20 cm aside, and checks what comes back:

- One observation recovers the facing alone, to within 2 degrees.
- Four observations at different hours recover a facing error of 7 degrees to within 1.5 degrees and a window that sits 20 cm aside to within 8 cm.
- When the window move does not improve the overlap by at least 0.03, only the facing changes.

Both sides of that test use the same model, so it shows that the search finds the right answer when the model is right. It does not show that a real room agrees with the model. That needs photographs, see the next section.

## The modelling choices

The references make the same choices as Sunspill, so the comparisons check the geometry and the bookkeeping and not these choices:

- Beams within about one degree of running along the wall (the sun is nearly edge on to the window) are ignored.
- The wall thickness is the same all around the window and the opening has the same size on both faces.
- The eave is a thin horizontal slab. A balcony rail is a solid slab 10 cm thick. The side walls of a balcony are not modelled.
- A building is a prism with a flat top, so a pitched roof counts as flat at the height given. A courtyard inside an outline is filled in.
- A tree crown is a twelve sided prism with a circumradius 2 percent over the crown radius, and it is opaque. The trunk is left out and leaf-off months are not modelled.
- The floor number sets the height of the room above the ground as (floor number minus one) times the height of a floor.
- Direct sun only, with a clear sky.
- Hours are counted on the local clock. On the one day a year a clock moves, a day that has a repeated hour counts as 24 hours. It only matters where the sun is up through the change, for example in Antarctica.

## What is not checked

There is no photograph of a real room next to a prediction yet. Until there is one, treat the patch as a geometric prediction for a clear sky and a room that matches what you typed in, and expect real rooms to differ because of window frames, reflections and the exact orientation. [ACCURACY.md](ACCURACY.md) shows how far the patch moves for each kind of error, with numbers from `scripts/sensitivity.mjs`.

Two inputs come from outside and have their own errors. OpenStreetMap often has no height for a building, and then Sunspill estimates it from the number of floors or the kind of building and says so on the page. The phone compass reads magnetic north, is bent by metal and electronics, and has only been tested here against rotation maths, not on hardware. Check it against the building outline on the map, or against a patch you saw.

If you can measure a room, please open an issue with the room file, the date, the place, the time and a photograph with a tape measure in it.
