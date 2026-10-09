# Architecture

```
src/core     pure code, no DOM, runs in Node and the browser
  solar.js     NOAA sun position, time zones, sunrise and sunset
  poly.js      convex polygon clipping and subtraction
  room.js      the scene, its limits, wall frames, normalizeScene
  light.js     window opening, shade, building, projection onto floor and walls
  hours.js     day steps, sun hours grids, afternoon check, plant spots
  codec.js     scene <-> link
  cities.js    built-in city list and search
  gif.js       GIF89a encoder
src/render   canvas drawing (needs a 2D context)
  camera.js    orthographic camera, plane and wall picking
  draw.js      floor, walls, windows, furniture, patches, sun path, compass
  heat.js      the sun hours map image
src/app      the interface
  main.js      wires state, stage, dock, panels, analysis and exports
  store.js     scene and settings, undo, clamping
  stage.js     canvas, view animation, dragging furniture and windows
  timeline.js  clock, day scrubber with the sunlit area curve, play, date
  panels.js    the five tabs      fields.js  number fields and the compass dial
  analysis.js  long jobs run in slices and cancelled on change
  export.js    PNG card and GIF   i18n.js format.js dom.js frame.js
src/locales  one JSON file per language
scripts      build, reference data, validation, demo recording
test         unit tests, test/e2e browser tests, test/helpers
```

## How a patch is found

For a window and a sun direction `s` (unit vector toward the sun, in room axes):

1. **Opening.** The window is a rectangle on the wall. A beam through a wall of thickness `t` has to clear both faces, so the usable opening is the rectangle intersected with itself shifted by `t` along the ray. This takes a rectangle in, a rectangle out.
2. **Shade.** An eave is a horizontal slab at height `zE` reaching `depth` out from the outer face and `ext` past each side. The shadow it throws on the window plane is the parallelogram `b >= zE - depth * sz / sn` between two sheared lateral limits. A building across the street, `L` away with roof height `H`, shades the half plane `b < H - L * sz / sn`. Each shadow is convex, so subtracting it from the opening leaves a few convex pieces. Subtraction splits the piece with the edges of the hole one at a time.
3. **Projection.** Each piece is carried along `-s` onto the floor (or any horizontal plane) and onto each wall the beam can reach, then clipped to that surface. The room is convex, so a ray that enters through the opening meets the boundary exactly once and nothing inside can block it. That is why the result needs no ray casting.
4. **Sun hours.** A grid of cell centres is stamped with the patches at each step of the day and summed. Steps sit at the middle of equal slices of each stretch of daylight, so the hours add up with no end effect.

`test/helpers/raytrace.js` finds the same lit points a different way (a ray from the point through the wall, the eave and the building) and the tests compare the two on random rooms.

## The interface

The scene is the only state worth saving. `store.update(mutator)` clones it, lets the mutator change the clone, runs `normalizeScene` and keeps an undo step unless the edit is a time or date move. The stage, the timeline and the panels redraw from the store on the next animation frame. Number fields keep their own focus, so typing is never interrupted by a redraw.

The page is one HTML file: esbuild bundles the app, the build inlines the script, the CSS and the Fraunces font, and writes a Content Security Policy that allows only that script by its hash and no network access. `dist/sw.js` is a cache first worker so the page opens offline.

## Why canvas and not WebGL

Everything is orthographic, so a room point maps to the screen with one affine transform and the exact polygons from the light code can be drawn directly. That keeps the picture identical to the numbers, keeps the code small and works in every browser, including when exporting the picture and the GIF.
