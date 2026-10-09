# Library API

`dist/sunspill.js` is the sun and light code on its own, as an ES module with no dependencies. Angles are degrees. Azimuth runs clockwise from north. Lengths are metres.

```js
import * as sunspill from 'sunspill'
```

## Sun

**`solarPosition(when, lat, lon)`** returns `{ azimuth, elevation, apparent, declination, equationOfTime }`. `when` is a UTC instant in milliseconds or a `Date`. `elevation` is geometric, `apparent` includes atmospheric refraction, `equationOfTime` is in minutes. Based on the NOAA Global Monitoring Laboratory equations.

**`sunVector(azimuth, elevation)`** returns the unit vector toward the sun as `[east, north, up]`.

**`sunTimes(year, month, day, lat, lon, zone)`** returns `{ sunrise, sunset, polarDay, polarNight, intervals }`, with the times in minutes after local midnight. Sunrise is the first time the sun comes up and sunset the last time it goes down. A day that starts or ends with the sun up has `null` for that end. `intervals` lists every stretch of daylight, which matters near the polar circles where a day can have two. **`daylightIntervals(...)`** returns just that list.

**`dayTrack(year, month, day, lat, lon, zone, stepMinutes = 5)`** returns the day's sunrise and sunset and a list of `{ minutes, azimuth, elevation, apparent }` from sunrise to sunset.

**`localToUtc(year, month, day, minutes, zone)`**, **`utcToLocal(ms, zone)`**, **`zoneOffset(zone, ms)`**, **`isZone(zone)`**. `zone` is an IANA name or a fixed offset from `UTC-14:59` to `UTC+14:59`. The offset is the one in force at that instant, so daylight saving changes fall on the right minute. On the night a clock moves, a time that does not exist or happens twice gets one of its two readings.

## Room and window light

**`defaultScene()`** and **`normalizeScene(any)`** give a complete, clamped scene. The shape is in [CONFIG.md](CONFIG.md).

**`wallFrame(room, wall)`** returns `{ o, t, n, length }`: the left end of the wall seen from inside, the unit vector along it, the outward normal and its length.

**`wallBearing(scene, wall)`** returns the compass bearing the outside of a wall faces.

**`sunInRoom(scene, azimuth, elevation)`** converts a sun direction to room axes (x right, y up the plan, z up).

**`litOpening(room, win, s, minHeight = 0)`** returns `{ pieces }`: the convex pieces of the window opening, in coordinates along the wall and height, that the sun reaches after the wall thickness, the eave and the building across the street are taken out. `s` is the unit vector toward the sun in room axes.

**`windowPatches(room, win, s, { planeZ = 0, walls = true })`** returns `{ floor, walls, opening }`. `floor` is a list of convex `[x, y]` polygons on the horizontal plane at height `planeZ`. `walls` is a list of `{ wall, poly }` with `[x, y, z]` vertices. The polygons are exact, not rasterised.

**`scenePatches(scene, { azimuth, elevation })`** runs every window and returns `{ floor, walls, windows }` with the per window results in `windows`.

**`totalArea(polys)`** is the area covered by a list of patches, with overlaps between windows counted once.

## Sun hours

**`sunAt(place, month, day, minutes)`** returns `{ azimuth, elevation, geometric }` where `elevation` is the apparent one the light model uses.

**`daySteps(place, month, day, stepMinutes = 5)`** returns `{ steps, hours }`: sun positions at equal steps through each stretch of daylight, each standing for `w` hours, and the total hours of daylight covered.

**`sunHours(scene, days, { planeZ, cell, stepMinutes, signal, onProgress })`** resolves to a grid `{ nx, ny, cx, cy, hours }`, the average hours of direct sun per day for each cell of a horizontal plane. `days` is a list of `{ month, day }`. It yields to the event loop as it goes and resolves to `null` if the `AbortSignal` fires.

**`hoursAt(grid, room, x, y)`**, **`hoursOver(grid, x, y, w, d)`**, **`monthDays(month)`**, **`seasonDays(months)`**.

**`afternoonSun(scene, days, { fromMinutes = 840, stepMinutes })`** resolves to `{ hoursPerDay, peakFloorArea, earliest, latest, days }`.

**`plantSpots(grid, need, { footprint = 0.3, count = 3, gap = 0.6 })`** ranks places where the whole footprint sits inside a light need: `'full'` (6 hours or more), `'partial'` (3 to under 6) or `'low'` (0.5 to under 3). See `LIGHT_NEEDS`.

**`sunPath(place, month, day, stepMinutes = 15)`** returns the day's path for drawing.

## Links and cities

**`encodeScene(scene)`** and **`decodeScene(hash)`** (null for anything that is not a valid link). **`CITIES`** is the built-in list and **`searchCities(query, limit)`** searches names and spellings in several scripts.

## Example

How long does the west window light a desk at 75 cm on 15 July?

```js
import { defaultScene, sunHours, hoursAt } from 'sunspill'

const scene = defaultScene()
const grid = await sunHours(scene, [{ month: 7, day: 15 }], { planeZ: 0.75, cell: 0.05 })
console.log(hoursAt(grid, scene.room, 2.8, 3.8).toFixed(2), 'hours')
```
