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

**`windowPatches(room, win, s, { planeZ = 0, walls = true, obstacles = [] })`** returns `{ floor, walls, opening }`. `floor` is a list of convex `[x, y]` polygons on the horizontal plane at height `planeZ`. `walls` is a list of `{ wall, poly }` with `[x, y, z]` vertices. The polygons are exact, not rasterised.

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

## Buildings, trees and rails

A scene's `obstacles` are buildings and trees in metres east and north of the room centre, see [CONFIG.md](CONFIG.md).

**`sceneObstacles(scene)`** returns the convex prisms `{ footprint, z0, z1 }` of every switched on building and tree, in room metres with heights counted from the room's floor. It is remembered for the scene object.

**`prismShadow(room, win, frame, s, prism)`** returns the shadow one prism throws on the outer face of a window, as a convex polygon in (along the wall, height), or `null`. **`convexParts(ring)`** cuts a building outline of any simple shape into convex parts. **`windowPatches`** and **`scenePatches`** take the obstacles into account, and `litOpening(room, win, s, minHeight, prisms)` takes a list of prisms.

## Places and phones

**`toLocal(center, lat, lon)`** and **`fromLocal(center, east, north)`** convert between latitude and longitude and metres east and north of a centre. **`moveRoom(scene, east, north)`** moves the room on the ground and keeps every building and tree where it was. **`haversine(a, b)`** is the distance in metres.

**`parseBuildings(overpassJson, center, { limit, eye })`** turns an Overpass answer into `{ buildings, total, cutoff }`: buildings with heights, flagging the ones whose height is a guess and the one that holds the room. It keeps `limit` (60) of them, the ones that rise highest above a window `eye` metres up, and `cutoff` is how many degrees above that window the highest left out rises. A building drawn as a multipolygon needs the answer to `buildingQuery(lat, lon, radius)`, which asks relations for their members. **`buildingHeight(tags)`** and **`parseLength(text)`** are the pieces. The library makes no request itself.

**`declination(lat, lon, year, heightKm)`** is the magnetic declination in degrees, east positive, from the World Magnetic Model 2025. **`headingFromAngles(alpha, beta, gamma)`** gives the compass bearing a phone faces from its DeviceOrientation angles, and **`trueHeading(magnetic, declination)`** adds the two.

## Checking against what you saw

**`compareCheck(scene, check)`** compares a marked patch `{ month, day, minutes, poly }` with the model: `{ iou, observed, predicted, shared, shift, covered }`. **`fitScene(scene, checks)`** searches for the facing, and with enough observations the window position, that agree best with the marks and returns the fitted scene and the overlap before and after. **`predictedPatch(scene, check)`** is the model patch.

**`scaleFromPoints`**, **`rectFromCorners`** and **`openingFromTaps`** read a room off taps on a plan. **`homography`** and **`applyHomography`** are the four point perspective map used to flatten a photo of the floor. **`TEMPLATES`** and **`applyTemplate(scene, id)`** give typical rooms.

## Links and cities

**`encodeScene(scene)`** and **`decodeScene(hash)`** (null for anything that is not a valid link, and both link formats open). **`blurScene(scene)`** rounds the place and drops the names of places and buildings. **`CITIES`** is the built-in list and **`searchCities(query, limit)`** searches names and spellings in several scripts. **`addressVariants(text)`** gives the plainer forms of an address to try when a search finds nothing, most exact first, each as `{ query, exact }`: a Taiwanese address ending in a house number and a floor becomes the road, a space and the number, and then the street, a Latin address loses its floor and unit and then its house number.

## Example

How long does the west window light a desk at 75 cm on 15 July?

```js
import { defaultScene, sunHours, hoursAt } from 'sunspill'

const scene = defaultScene()
const grid = await sunHours(scene, [{ month: 7, day: 15 }], { planeZ: 0.75, cell: 0.05 })
console.log(hoursAt(grid, scene.room, 2.8, 3.8).toFixed(2), 'hours')
```
