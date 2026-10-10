# Architecture

```
src/core     pure code, no DOM, runs in Node and the browser
  solar.js     NOAA sun position, time zones, sunrise and sunset
  poly.js      convex polygon clipping and subtraction
  room.js      the scene, its limits, wall frames, normalizeScene
  light.js     window opening, shade, projection onto floor and walls
  obstacles.js buildings, trees and balcony rails as prisms, their shadow on a window, and which of them shade a window now
  hours.js     day steps, sun hours grids, afternoon check, plant spots
  geo.js       latitude and longitude to metres, map tiles, moving the room on the ground
  address.js   plainer forms of an address for a second search (house number after a space, no floor), built from the typed words only
  twaddress.js a Taiwanese address and its floor taken out of typed or pasted text, as the street and city of a structured search
  sides.js     a footprint cut into compass sides, party walls left out, and the scene of the virtual window of a side
  sidesun.js   the sun on that window: afternoon minutes in the hot season, winter hours, the year, and a verdict
  tilemap.js   which map tiles a view needs, and what to draw for one that has not come
  osm.js       OpenStreetMap answers (buildings, address matches) turned into scene parts: relation ways joined into rings, heights guessed from neighbours
  zone.js      the time zone at a point, from a bundled table
  declination.js, wmm2025.js   magnetic declination from the World Magnetic Model
  compass.js   phone sensor angles to a heading, averaging until steady
  trace.js     scale, room and openings from taps on a plan, photo of the floor to a plan
  fit.js       overlap of a marked patch with the model, and the search for the best facing
  snap.js      snapping for windows along a wall and furniture over the floor
  templates.js typical rooms
  codec.js     scene <-> link
  sharelink.js the quick check's answer <-> link, a format of its own (q1=) apart from the room links
  cities.js    built-in city list and search
  gif.js       GIF89a encoder
src/render   canvas drawing (needs a 2D context)
  camera.js    orthographic camera, plane and wall picking
  draw.js      floor, walls, windows, doors, furniture, patches, sun path, compass, dimensions
  heat.js      the sun hours map image
src/app      the interface
  main.js      wires state, stage, dock, panels, analysis, the map and the wizard
  store.js     scene and settings, undo, clamping
  stage.js     canvas, view animation, dragging and turning furniture and windows
  timeline.js  clock, day scrubber with the sunlit area curve, play, date
  panels.js    the five tabs      fields.js  number fields and the compass dial
  wizard.js    the seven step setup shell
  step-place.js, step-room.js, step-map.js, step-check.js   the steps
  mapview.js   map canvas: tiles, outlines, the room, pan, pinch, move and turn, and the quick check's buildings and arrows
  tilecache.js the map pictures: asked for when on the screen, cancelled when not, asked again when they fail
  taps.js      tap and double tap
  quick.js     the quick check, the first screen   compare.js   the flats kept for comparing
  picture.js   a picture canvas for tracing a plan and flattening a photo
  trace-ui.js, compass-ui.js   the tracing and compass flows
  net.js       the only code that makes a request, with the three services and their hosts
  consent.js, modal.js   the sheets that ask before anything is sent
  analysis.js  long jobs run in slices and cancelled on change
  export.js    PNG card and GIF   i18n.js format.js dom.js frame.js
src/locales  one JSON file per language, and quick.en.json and quick.zh-TW.json for the quick check
scripts      build, reference data, validation, sensitivity, demo recording
test         unit tests, test/e2e browser tests, test/helpers, test/fixtures
```

## How a patch is found

For a window and a sun direction `s` (unit vector toward the sun, in room axes):

1. **Opening.** The window is a rectangle on the wall. A beam through a wall of thickness `t` has to clear both faces, so the usable opening is the rectangle intersected with itself shifted by `t` along the ray. This takes a rectangle in, a rectangle out.
2. **Shade.** An eave is a horizontal slab at height `zE` reaching `depth` out from the outer face and `ext` past each side. The shadow it throws on the window plane is the parallelogram `b >= zE - depth * sz / sn` between two sheared lateral limits. Each shadow is convex, so subtracting it from the opening leaves a few convex pieces. Subtraction splits the piece with the edges of the hole one at a time.
3. **Buildings, trees and rails.** Each is a convex prism: a convex footprint in room metres between a bottom and a top height. A building outline of any shape is cut into convex parts (ear clipping, then merging neighbours while they stay convex). Only the part of the footprint in front of the wall can shade it, so the footprint is clipped to the half plane in front of the outer face. A point `Q` of the prism, at distance `dist` in front of the wall, lands on the window plane at `Q - (dist / sn) * s`. That map is linear, so the shadow of the clipped prism is the convex hull of its carried corners. It is subtracted like an eave. The old flat building across the street is the same thing with a footprint of unlimited width. The shadows come out in window coordinates, so one list of prisms in room metres serves every window and every sun position.
4. **Projection.** Each piece is carried along `-s` onto the floor (or any horizontal plane) and onto each wall the beam can reach, then clipped to that surface. The room is convex, so a ray that enters through the opening meets the boundary exactly once and nothing inside can block it. That is why the result needs no ray casting.
5. **Sun hours.** A grid of cell centres is stamped with the patches at each step of the day and summed. Steps sit at the middle of equal slices of each stretch of daylight, so the hours add up with no end effect.

`test/helpers/raytrace.js` finds the same lit points a different way (a ray from the point through the wall, the eave, the rail and every building, cut at each edge of its real outline) and the tests compare the two on random rooms. `scripts/make-obstacle-reference.py` does it a third way, in Python with pvlib and shapely, and its answers are in `test/fixtures/`.

## Coordinates

Room axes are x to the right and y up the plan, with the top wall facing `facing` degrees clockwise from true north. Buildings and trees are kept in metres east and north of the room centre, which turns with `facing` into room axes in `sceneObstacles`. A latitude and longitude become metres with the length of a degree on the WGS84 ellipsoid at the room's latitude. Moving the room on the map changes `place` and shifts every building and tree the opposite way, so each stays where it is on the ground.

## Fitting

An observation is the day, the time and the convex outline of the patch the person marked on the floor. The model predicts the same patch with `scenePatches`. `compareCheck` gives the intersection over union of the two areas, and the offset between their centres. `fitScene` sweeps the facing in one degree steps, refines it to a tenth, and, when two observations are 15 degrees or more apart in sun azimuth, searches the facing, the position and the sill height of the window that lights the marks together by coordinate descent with a small pull toward the measured values. The extra freedom is used only if it raises the mean overlap by 0.03.

## The quick check

`quick.js` is the first screen for a visit with no link and no room of its own. It does not touch the scene until the "More" row opens the room editor. The steps are plain functions of the core:

1. `extractAddress` reads the address and the floor out of what was typed, and `net.lookupAddress` searches Nominatim by street and city.
2. `net.buildings` loads every outline within 200 metres, up to 400, and a tap picks one (the tallest where outlines overlap).
3. `footprintSides` splits that outline into walls, groups the walls by the nearest of eight compass sectors, drops a side shorter than 3 metres and a wall that touches a neighbour at least as tall as the window (a party wall has no window).
4. `sideScene` lays a 3.6 by 4.4 metre room behind the longest wall of a side so that a window of 1.8 by 1.5 metres at 0.9 metres is on that wall, facing out, with every neighbour at its place on the ground. The building itself is left out. This is an ordinary scene, so `litOpening`, with the prisms of `obstacles.js`, gives the lit part of the window with no new light code.
5. `measureSteps` counts a time step as sunlit when more than a quarter of the opening is lit, over the afternoons (after 14:00) of 1 June to 30 September, over December, and on the 15th of each month. It is a generator that stops after each day, so the page hands the thread back every 12 ms.

The Share button writes the answer as a link (`sharelink.js`: the place, the building by its OpenStreetMap number and its outline, the floor and the sides picked). Opening such a link asks the one question first when it has not been answered, loads the outlines again, picks the building by its number, else by the building that holds the middle of the outline, else from the outline in the link, and puts the sides on once the sun is worked out. `main.js` tells the two link formats apart by their prefix, and a quick link opens the quick check even when the full editor was the last choice.

The "More" row's room is the same scene of one side with the building put in switched off as the room's own building, so the editor opens at the room step with place, floor, facing and neighbours set.

## The guided setup

`wizard.js` holds seven steps, each a card built by a function that returns `{ el, sync, enter, leave }`. A step names its view: `pin`, `facing` and `surround` show the map, `3d` and `plan` show the room canvas, and the stage and the map share one box so the card sits under (or beside) the view it works on. Edits go through the same store as the rest of the page, so Undo, the link and the tabs all stay in step with the wizard.

The map draws tiles through `tilemap.js` and `tilecache.js`. `planTiles` returns the tiles on the screen at the tile level (the zoom rounded, at most 19) and, for each that is missing, the part of a tile above or below it that stands in, with the share of the screen left blank. The cache starts pictures nearest the middle first, six at a time, cancels one that has been off the screen for 300 ms, asks again twice after a failure (0.4 s, then 1.2 s), and leaves a tile that failed for good alone for 20 seconds.

`net.js` is the only file that calls `fetch` or builds a tile address. It checks a switch for the service before it does anything, and `consent.js` asks for it. The page's Content Security Policy, written by `scripts/build.mjs` from the same list of hosts, names those hosts and no others.

## The interface

The scene is the only state worth saving. `store.update(mutator)` clones it, lets the mutator change the clone, runs `normalizeScene` and keeps an undo step unless the edit is a time or date move. The stage, the timeline and the panels redraw from the store on the next animation frame. Number fields keep their own focus, so typing is never interrupted by a redraw.

The page is one HTML file: esbuild bundles the app, the build inlines the script, the CSS and the Fraunces font, and writes a Content Security Policy that allows only that script by its hash and, for the three optional services, the four hosts in `src/app/net.js`. `dist/sw.js` is a cache first worker so the page opens offline.

## Why canvas and not WebGL

Everything is orthographic, so a room point maps to the screen with one affine transform and the exact polygons from the light code can be drawn directly. That keeps the picture identical to the numbers, keeps the code small and works in every browser, including when exporting the picture and the GIF.
