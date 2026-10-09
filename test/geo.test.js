import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toLocal, fromLocal, metresPerDegree, haversine, lonLatToTile, tileToLonLat, moveRoom, insideRing, ownBuilding, roomCorners, metresPerPixel } from '../src/core/geo.js'
import { parseBuildings, parseLength, buildingHeight, buildingQuery, fitRing, simplifyRing, parsePlaces, shortLabel } from '../src/core/osm.js'
import { declination, decimalYear, inRange } from '../src/core/declination.js'
import { headingFromAngles, rotationMatrix, circularMean, circularSpread, createAverager, trueHeading } from '../src/core/compass.js'
import { zoneAt } from '../src/core/zone.js'
import { normalizeScene } from '../src/core/room.js'
import { encodeScene, decodeScene, blurScene } from '../src/core/codec.js'
import { sceneObstacles } from '../src/core/obstacles.js'

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

test('east and north offsets agree with pyproj to a few centimetres within 400 m', () => {
  const ref = fixture('geo-reference.json')
  let worst = 0
  for (const [lat0, lon0, lat, lon, east, north] of ref.rows) {
    const [e, n] = toLocal({ lat: lat0, lon: lon0 }, lat, lon)
    worst = Math.max(worst, Math.hypot(e - east, n - north))
  }
  console.log(`# local metres: ${ref.rows.length} points, worst error ${worst.toFixed(4)} m`)
  assert.ok(worst < 0.05, `worst ${worst} m`)
})

test('toLocal and fromLocal are inverses, and cross the date line', () => {
  const c = { lat: 25.033, lon: 121.565 }
  const back = fromLocal(c, 123.4, -56.7)
  const [e, n] = toLocal(c, back.lat, back.lon)
  assert.ok(Math.abs(e - 123.4) < 1e-6 && Math.abs(n + 56.7) < 1e-6)
  const [de] = toLocal({ lat: 0, lon: 179.999 }, 0, -179.999)
  assert.ok(de > 0 && de < 500, `east across the date line is ${de}`)
  assert.ok(Math.abs(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111195) < 100)
  const m = metresPerDegree(60)
  assert.ok(Math.abs(m.lon / m.lat - 0.5) < 0.01)
})

test('tile positions match the slippy map formula and invert', () => {
  const ref = fixture('tile-reference.json')
  for (const [lat, lon, z, x, y] of ref.rows) {
    const t = lonLatToTile(lon, lat, z)
    assert.ok(Math.abs(t.x - x) < 1e-6 * 2 ** z && Math.abs(t.y - y) < 1e-6 * 2 ** z, `${lat},${lon},${z}`)
    const p = tileToLonLat(t.x, t.y, z)
    assert.ok(Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lon - lon) < 1e-6)
  }
  assert.ok(Math.abs(metresPerPixel(0, 0) - 156543.03392) < 1e-6)
})

test('declination agrees with the World Magnetic Model through pygeomag', () => {
  const ref = fixture('declination-reference.json')
  let worst = 0
  for (const [lat, lon, year, height, d] of ref.rows) worst = Math.max(worst, Math.abs(declination(lat, lon, year, height) - d))
  console.log(`# declination: ${ref.rows.length} points, worst error ${worst.toFixed(4)} degrees`)
  assert.ok(worst < 0.01, `worst ${worst}`)
  assert.ok(Math.abs(declination(25.033, 121.565, 2026.77) + 5.06) < 0.02, 'Taipei reads about 5 degrees west')
  assert.ok(Math.abs(decimalYear(Date.UTC(2026, 6, 2, 12)) - 2026.5) < 0.01)
  assert.ok(inRange(2026.5) && !inRange(2020) && !inRange(2040))
})

test('phone angles give the same heading as numpy rotation matrices', () => {
  const ref = fixture('compass-reference.json')
  let worst = 0
  for (const [alpha, beta, gamma, back, top, upright] of ref.rows) {
    const R = rotationMatrix(alpha, beta, gamma)
    const hb = ((Math.atan2(-R[0][2], -R[1][2]) * 180) / Math.PI + 360) % 360
    const ht = ((Math.atan2(R[0][1], R[1][1]) * 180) / Math.PI + 360) % 360
    worst = Math.max(worst, angle(hb, back), angle(ht, top))
    const read = headingFromAngles(alpha, beta, gamma)
    assert.equal(read.from, upright >= 0.5 ? 'back' : 'top')
    assert.ok(angle(read.bearing, read.from === 'back' ? back : top) < 1e-6)
  }
  assert.ok(worst < 1e-6, `worst ${worst}`)
})

test('an upright phone against a window reads the way the window faces, a flat one the way its top points', () => {
  // beta 90 means standing up, alpha 0 means the top edge toward north and the back faces north
  assert.ok(angle(headingFromAngles(0, 90, 0).bearing, 0) < 1e-9)
  assert.ok(angle(headingFromAngles(270, 90, 0).bearing, 90) < 1e-9)
  assert.ok(angle(headingFromAngles(90, 90, 0).bearing, 270) < 1e-9)
  const flat = headingFromAngles(90, 0, 0)
  assert.equal(flat.from, 'top')
  assert.ok(angle(flat.bearing, 270) < 1e-9)
  // tilting an upright phone a little changes nothing much
  assert.ok(angle(headingFromAngles(0, 80, 0).bearing, 0) < 1e-9)
})

test('circular statistics work across north', () => {
  assert.ok(angle(circularMean([350, 10, 0]), 0) < 1e-9)
  assert.ok(angle(circularMean([170, 190]), 180) < 1e-9)
  assert.ok(circularSpread([359, 1, 0, 360]) < 1.5)
  assert.ok(circularSpread([0, 90, 180, 270]) > 60)
  assert.equal(circularSpread([5]), 180)
  assert.equal(trueHeading(355, 8), 3)
  assert.equal(trueHeading(10, -15), 355)
})

test('the averager reports a heading only when the phone is held still', () => {
  const a = createAverager({ windowMs: 1000, minSamples: 10, maxSpread: 4 })
  for (let i = 0; i < 40; i++) a.add(100 + Math.sin(i) * 1.5, i * 30)
  assert.equal(a.state.steady, true)
  assert.ok(angle(a.state.heading, 100) < 2)
  for (let i = 0; i < 40; i++) a.add(100 + i * 4, 1200 + i * 30)
  assert.equal(a.state.steady, false, 'turning the phone is not steady')
  a.reset()
  assert.equal(a.state.heading, null)
})

test('time zones from a point agree with timezonefinder', () => {
  // the reference names open sea with fixed offset zones (Etc/GMT-11); a room is on land, so judge the land points
  const ref = { rows: fixture('zone-reference.json').rows.filter((r) => !r[2].startsWith('Etc/')) }
  let same = 0
  const odd = []
  for (const [lat, lon, zone] of ref.rows) {
    const got = zoneAt(lat, lon)
    if (got === zone) same++
    else odd.push([lat, lon, zone, got])
  }
  // two data sets cut borders and name zones in slightly different ways, so judge by the clock too
  const clock = (z) => new Intl.DateTimeFormat('en', { timeZone: z, timeZoneName: 'longOffset' }).format(Date.UTC(2026, 0, 15)) + new Intl.DateTimeFormat('en', { timeZone: z, timeZoneName: 'longOffset' }).format(Date.UTC(2026, 6, 15))
  const sameClock = odd.filter(([, , zone, got]) => got && clock(zone) === clock(got)).length
  console.log(`# time zone: ${ref.rows.length} points, ${same} same name, ${sameClock} same clock rules, ${odd.length - sameClock} different`)
  assert.ok((same + sameClock) / ref.rows.length > 0.97, `${odd.length - sameClock} different: ${JSON.stringify(odd.slice(0, 5))}`)
  for (const [lat, lon, zone] of [[25.033, 121.565, 'Asia/Taipei'], [22.63, 120.3, 'Asia/Taipei'], [35.68, 139.65, 'Asia/Tokyo'], [40.71, -74, 'America/New_York'], [-33.87, 151.2, 'Australia/Sydney']]) assert.equal(zoneAt(lat, lon), zone)
})

test('lengths and heights from OpenStreetMap tags', () => {
  assert.equal(parseLength('12'), 12)
  assert.equal(parseLength('12.5 m'), 12.5)
  assert.equal(parseLength('12,5'), 12.5)
  assert.ok(Math.abs(parseLength("40'") - 12.192) < 1e-9)
  assert.ok(Math.abs(parseLength("10'6\"") - 3.2004) < 1e-9)
  assert.ok(Math.abs(parseLength('30 ft') - 9.144) < 1e-9)
  for (const bad of ['tall', '', '12 storeys', null, undefined, {}]) assert.equal(parseLength(bad), null)
  assert.deepEqual(buildingHeight({ height: '21', 'building:levels': '7' }), { h: 21, base: 0, est: false })
  assert.deepEqual(buildingHeight({ 'building:levels': '5' }), { h: 16, base: 0, est: true })
  assert.deepEqual(buildingHeight({ 'building:levels': '2', 'roof:shape': 'gabled' }), { h: 7.9, base: 0, est: true })
  assert.deepEqual(buildingHeight({ building: 'house' }), { h: 7, base: 0, est: true })
  assert.deepEqual(buildingHeight({ building: 'yes' }), { h: 9, base: 0, est: true })
  assert.deepEqual(buildingHeight({ height: '30', min_height: '10' }), { h: 30, base: 10, est: false })
})

test('real Overpass data for a Taipei street becomes buildings that flag guessed heights', () => {
  const json = fixture('overpass-taipei.json')
  const center = { lat: 25.0288, lon: 121.5442 }
  const { buildings, total } = parseBuildings(json, center)
  assert.equal(total, 37)
  assert.equal(buildings.length, 37)
  assert.ok(buildings.every((b) => b.type === 'building' && b.src === 'osm' && b.ring.length >= 3 && b.ring.length <= 40))
  assert.ok(buildings.some((b) => b.est) && buildings.some((b) => !b.est), 'both tagged and guessed heights occur')
  assert.ok(buildings.every((b) => b.h >= 1 && Math.hypot(...b.ring[0]) < 400), 'all within the radius, in metres from the centre')
  const normal = normalizeScene({ obstacles: buildings })
  assert.equal(normal.obstacles.length, 37, 'the scene keeps every building')
  assert.equal(JSON.stringify(normal.obstacles.map((o) => o.ring.length)), JSON.stringify(buildings.map((b) => b.ring.length)))
})

test('a building that holds the room is flagged as the room own and switched off', () => {
  const json = { elements: [
    { type: 'way', id: 1, tags: { building: 'apartments', height: '30' }, geometry: [{ lat: 0.0001, lon: -0.0001 }, { lat: 0.0001, lon: 0.0001 }, { lat: -0.0001, lon: 0.0001 }, { lat: -0.0001, lon: -0.0001 }, { lat: 0.0001, lon: -0.0001 }] },
    { type: 'way', id: 2, tags: { building: 'house' }, geometry: [{ lat: 0.0005, lon: 0.0005 }, { lat: 0.0005, lon: 0.0006 }, { lat: 0.0006, lon: 0.0006 }, { lat: 0.0006, lon: 0.0005 }, { lat: 0.0005, lon: 0.0005 }] },
    { type: 'way', id: 3, tags: { building: 'house' }, geometry: [{ lat: 0.0005, lon: 0.0005 }, { lat: 0.0005, lon: 0.0006 }, { lat: 0.0006, lon: 0.0006 }] },
    { type: 'way', id: 4, tags: { highway: 'residential' }, geometry: [] },
  ] }
  const { buildings } = parseBuildings(json, { lat: 0, lon: 0 })
  assert.equal(buildings.length, 2, 'the open way and the road are dropped')
  assert.equal(buildings[0].id, 1)
  assert.equal(buildings[0].own, true)
  assert.equal(buildings[0].on, false)
  assert.equal(buildings[1].on, true)
  assert.equal(buildings[1].est, true)
  const scene = normalizeScene({ obstacles: buildings })
  assert.equal(ownBuilding(scene), 0)
  assert.equal(sceneObstacles(scene).length, 1, 'only the neighbour casts shade')
})

test('building parts replace the outline they sit in, and relations contribute their outer rings', () => {
  const sq = (x, y, s) => [{ lat: y, lon: x }, { lat: y, lon: x + s }, { lat: y + s, lon: x + s }, { lat: y + s, lon: x }, { lat: y, lon: x }]
  const json = { elements: [
    { type: 'way', id: 1, tags: { building: 'yes' }, geometry: sq(0.001, 0.001, 0.0004) },
    { type: 'way', id: 2, tags: { 'building:part': 'yes', height: '40' }, geometry: sq(0.001, 0.001, 0.0002) },
    { type: 'way', id: 3, tags: { 'building:part': 'yes', height: '12' }, geometry: sq(0.0012, 0.001, 0.0002) },
    { type: 'relation', id: 9, tags: { building: 'yes', height: '20' }, members: [{ type: 'way', role: 'outer', geometry: sq(0.002, 0.002, 0.0003) }, { type: 'way', role: 'inner', geometry: sq(0.00205, 0.00205, 0.0001) }] },
  ] }
  const { buildings } = parseBuildings(json, { lat: 0, lon: 0 })
  assert.deepEqual(buildings.map((b) => b.id).sort(), [2, 3, 9])
  assert.equal(buildings.find((b) => b.id === 2).h, 40)
})

test('outlines are thinned to a small corner count that keeps their shape', () => {
  const circle = Array.from({ length: 200 }, (_, i) => [50 * Math.cos((i * 2 * Math.PI) / 200), 50 * Math.sin((i * 2 * Math.PI) / 200)])
  const fit = fitRing(circle)
  assert.ok(fit.length <= 40 && fit.length >= 8)
  const rect = [[0, 0], [10, 0], [10, 0.05], [10, 5], [0, 5]]
  assert.equal(simplifyRing(rect, 0.2).length, 4)
  const area = (r) => Math.abs(r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2)
  assert.ok(Math.abs(area(fit) / area(circle) - 1) < 0.08)
})

test('the Overpass query names the area and asks for outlines with tags', () => {
  const q = buildingQuery(25.0288, 121.5442, 200)
  assert.ok(q.includes('around:200,25.028800,121.544200') && q.includes('out geom tags') && q.startsWith('[out:json]'))
})

test('address matches from Nominatim keep a short label, and junk rows are dropped', () => {
  const places = parsePlaces([
    { lat: '25.0338352', lon: '121.5644995', name: '台北101', display_name: '台北101, 7, 信義路五段, 信義區, 臺北市, 110, 臺灣', address: { city: '臺北市', country_code: 'tw' } },
    { lat: '25.03', lon: '121.56', name: '', display_name: 'x', address: { road: '信義路五段', house_number: '7', city: '臺北市', country_code: 'tw' } },
    { lat: 'nope', lon: '1' },
    { lat: '85', lon: '10', name: 'pole' },
    null,
  ])
  assert.equal(places.length, 2)
  assert.equal(places[0].name, '台北101, 臺北市')
  assert.equal(places[1].name, '信義路五段 7, 臺北市')
  assert.equal(places[0].country, 'TW')
  assert.deepEqual(parsePlaces(null), [])
  assert.equal(shortLabel({ display_name: 'A, B, C' }), 'A, B')
})

test('moving the room keeps every building and tree where it is on the ground', () => {
  const scene = normalizeScene({
    place: { name: 'x', lat: 25.0288, lon: 121.5442, zone: 'Asia/Taipei' },
    obstacles: [{ type: 'building', ring: [[10, 10], [20, 10], [20, 25], [10, 25]], h: 12 }, { type: 'tree', x: -8, y: 14, r: 2, h: 9 }],
  })
  const moved = moveRoom(scene, 3.5, -2.25)
  const world = (sc, e, n) => fromLocal(sc.place, e, n)
  for (const [i, j] of [[0, 0], [2, 2]]) {
    const a = world(scene, scene.obstacles[0].ring[i][0], scene.obstacles[0].ring[i][1])
    const b = world(moved, moved.obstacles[0].ring[j][0], moved.obstacles[0].ring[j][1])
    assert.ok(Math.hypot(a.lat - b.lat, a.lon - b.lon) < 1e-9)
  }
  const t0 = world(scene, scene.obstacles[1].x, scene.obstacles[1].y)
  const t1 = world(moved, moved.obstacles[1].x, moved.obstacles[1].y)
  assert.ok(Math.abs(t0.lat - t1.lat) < 1e-9 && Math.abs(t0.lon - t1.lon) < 1e-9)
  const [e, n] = toLocal(scene.place, moved.place.lat, moved.place.lon)
  assert.ok(Math.abs(e - 3.5) < 1e-6 && Math.abs(n + 2.25) < 1e-6)
})

test('roomCorners turn with the facing and keep the room size', () => {
  const scene = normalizeScene({ room: { w: 4, d: 6, h: 2.6, wall: 0.1 }, facing: 90 })
  const c = roomCorners(scene)
  assert.ok(Math.abs(Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]) - 4) < 1e-9)
  // the top wall faces east, so the corners of the top wall are the eastern ones
  assert.ok(c[2][0] > 0 && c[3][0] > 0 && c[0][0] < 0 && c[1][0] < 0)
  assert.equal(insideRing([[0, 0], [4, 0], [4, 4], [0, 4]], [2, 2]), true)
  assert.equal(insideRing([[0, 0], [4, 0], [4, 4], [0, 4]], [5, 2]), false)
})

test('links keep obstacles, floors, doors, balconies, turned furniture and observations', () => {
  const scene = normalizeScene({
    room: { w: 3.6, d: 4.4, h: 2.6, wall: 0.15 }, facing: 262.5, floor: { n: 6, storey: 3.1 },
    windows: [{ wall: 'top', pos: 0.4, w: 2.2, h: 1.5, sill: 0.3, balcony: { depth: 1.4, rail: 1.1, ext: 0.4 }, eave: { depth: 1.4, gap: 0.2, ext: 0.4 } }],
    doors: [{ wall: 'bottom', pos: 0.3, w: 0.9 }],
    items: [{ kind: 'shelf', x: 0.1, y: 0.2, rot: 30 }, { kind: 'bed', x: 1.5, y: 1, rot: 90 }],
    obstacles: [
      { type: 'building', src: 'osm', id: 12345, name: 'Taipei 101', est: true, ring: [[10.1, 5.2], [22.4, 5.2], [22.4, 30.6], [10.1, 30.6]], h: 33.3, base: 0 },
      { type: 'tree', x: -14.3, y: 8.1, r: 3.2, h: 11.5, base: 2.5 },
      { type: 'building', own: true, on: false, ring: [[-3, -3], [3, -3], [3, 3], [-3, 3]], h: 20 },
    ],
    checks: [{ month: 7, day: 15, minutes: 990, poly: [[0.5, 3.1], [1.4, 3.1], [1.6, 3.9], [0.4, 3.9]] }],
  })
  const hash = encodeScene(scene)
  assert.ok(hash.startsWith('r2='))
  const back = decodeScene('#' + hash)
  assert.equal(back.obstacles[0].id, 12345)
  assert.equal(back.obstacles[0].name, 'Taipei 101')
  assert.equal(back.obstacles[0].est, true)
  assert.equal(back.obstacles[2].on, false)
  assert.equal(back.obstacles[2].own, true)
  assert.equal(back.floor.n, 6)
  assert.deepEqual(back.windows[0].balcony, { depth: 1.4, rail: 1.1, ext: 0.4 })
  assert.equal(back.items[0].rot, 30)
  assert.equal(back.doors[0].w, 0.9)
  assert.equal(back.checks[0].poly.length, 4)
  assert.deepEqual(back, scene)
})

test('a long outline list is trimmed from the far end so the link stays short', () => {
  const rings = Array.from({ length: 60 }, (_, i) => {
    const ring = Array.from({ length: 40 }, (_, k) => [10 + i * 5 + 9 * Math.cos((k * Math.PI) / 20) + Math.sin(k * 7 + i) * 1.3, 10 + 9 * Math.sin((k * Math.PI) / 20) + Math.cos(k * 5 + i) * 1.3])
    return { type: 'building', ring, h: 10 + i }
  })
  const scene = normalizeScene({ obstacles: rings })
  const hash = encodeScene(scene)
  assert.ok(hash.length <= 16000, `${hash.length}`)
  const back = decodeScene('#' + hash)
  assert.ok(back.obstacles.length > 5 && back.obstacles.length < 60, `${back.obstacles.length} kept`)
  assert.equal(Math.min(...back.obstacles.map((o) => Math.min(...o.ring.map((p) => p[0])))) < 30, true, 'the near ones are kept')
})

test('an old r1 link still opens', () => {
  const hash = 'r1=' + 'WzMuNiw0LjQsMi42LDAuMTUsMjcwLFsiVGFpcGVpIiwyNS4wMzMsMTIxLjU2NSwiQXNpYS9UYWlwZWkiXSw3LDE1LDk5MCxbWzAsMC45LDEuOCwxLjQsMC45LDAsMC4xNSwwLjMsMF1dLFtbMCwwLjI1LDEuNSwxLjUsMiwwLjVdXV0'
  const scene = decodeScene(hash)
  assert.equal(scene.place.name, 'Taipei')
  assert.equal(scene.windows.length, 1)
  assert.equal(scene.obstacles.length, 0)
  assert.equal(scene.floor.n, 1)
})

test('hiding the location also drops building names and ids', () => {
  const scene = normalizeScene({ place: { name: 'Home', lat: 25.0288, lon: 121.5442, zone: 'Asia/Taipei' }, obstacles: [{ type: 'building', name: 'Taipei 101', id: 5, ring: [[10, 10], [20, 10], [20, 20]], h: 12, src: 'osm' }] })
  const hidden = blurScene(scene)
  assert.equal(hidden.place.name, '')
  assert.equal(hidden.place.lat, 25)
  assert.equal(hidden.obstacles[0].name, '')
  assert.equal(hidden.obstacles[0].id, undefined)
  assert.equal(hidden.obstacles[0].ring.length, 3)
})
