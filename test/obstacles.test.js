import { test } from 'node:test'
import assert from 'node:assert/strict'
import { windowPatches, scenePatches, totalArea } from '../src/core/light.js'
import { convexParts, hullOf, prismShadow, sceneObstacles, crownRing, shadingObstacles } from '../src/core/obstacles.js'
import { area, insideConvex } from '../src/core/poly.js'
import { normalizeScene, sunInRoom, wallFrame, roomToLocal, localToRoom, itemFootprint } from '../src/core/room.js'
import { rayHitsPrism } from './helpers/raytrace.js'
import { compareWithTracer, compareWithReference } from './helpers/obstacle-cases.js'

const RAD = Math.PI / 180
const sunAt = (azimuth, elevation) => [Math.cos(elevation * RAD) * Math.sin(azimuth * RAD), Math.cos(elevation * RAD) * Math.cos(azimuth * RAD), Math.sin(elevation * RAD)]
const plain = (over = {}) => ({ wall: 'top', pos: 1.5, w: 2, h: 1.2, sill: 0.8, eave: { depth: 0, gap: 0.1, ext: 0.3 }, across: null, balcony: null, ...over })

test('a very wide tall prism reproduces the flat building across the street', () => {
  const room = { w: 6, d: 8, h: 2.8, wall: 0.2 }
  for (const [az, el] of [[0, 20], [15, 33], [-30, 45], [40, 12]]) {
    const s = sunAt(az, el)
    const across = plain({ across: { height: 12, distance: 20 } })
    // a wall of 4 km, 20 m in front of the outer face, from deep below the floor up to 12 m
    const f = wallFrame(room, 'top')
    const at = (u, v) => [f.o[0] + f.t[0] * u + f.n[0] * (room.wall + v), f.o[1] + f.t[1] * u + f.n[1] * (room.wall + v)]
    const prism = { footprint: [at(-2000, 20), at(2000, 20), at(2000, 60), at(-2000, 60)], z0: -50, z1: 12 }
    const a = totalArea(windowPatches(room, across, s).floor)
    const b = totalArea(windowPatches(room, plain(), s, { obstacles: [prism] }).floor)
    assert.ok(Math.abs(a - b) < 1e-9, `${az}/${el}: ${a} vs ${b}`)
  }
})

test('a prism behind the wall, or beside the sun path, casts nothing', () => {
  const room = { w: 6, d: 8, h: 2.8, wall: 0 }
  const f = wallFrame(room, 'top')
  const frame = f
  const s = sunAt(0, 30)
  const behind = { footprint: [[1, 1], [3, 1], [3, 3], [1, 3]], z0: 0, z1: 30 }
  assert.equal(prismShadow(room, plain(), frame, s, behind), null)
  const infront = { footprint: [[1, 10], [3, 10], [3, 12], [1, 12]], z0: 0, z1: 30 }
  assert.ok(prismShadow(room, plain(), frame, s, infront))
  // the same prism shifted far to the side leaves the opening untouched
  const side = { footprint: [[301, 10], [303, 10], [303, 12], [301, 12]], z0: 0, z1: 30 }
  const bare = totalArea(windowPatches(room, plain(), s).floor)
  assert.ok(Math.abs(totalArea(windowPatches(room, plain(), s, { obstacles: [side] }).floor) - bare) < 1e-9)
})

test('convex parts cover a concave footprint exactly, each part convex', () => {
  const l = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]
  const parts = convexParts(l)
  assert.ok(parts.length >= 2 && parts.length <= 4)
  assert.ok(Math.abs(parts.reduce((s, p) => s + area(p), 0) - area(l)) < 1e-9)
  for (const p of parts) assert.deepEqual(hullOf(p).length, p.length, 'a convex part equals its own hull')
  // a clockwise ring and a ring that repeats its first vertex work too
  const lArea = area(l)
  assert.ok(Math.abs(convexParts(l.slice().reverse()).reduce((s, p) => s + area(p), 0) - lArea) < 1e-9)
  assert.ok(Math.abs(convexParts(l.concat([l[0]])).reduce((s, p) => s + area(p), 0) - lArea) < 1e-9)
  const star = Array.from({ length: 10 }, (_, i) => [(i % 2 ? 3 : 8) * Math.cos((i * Math.PI) / 5), (i % 2 ? 3 : 8) * Math.sin((i * Math.PI) / 5)])
  const sp = convexParts(star)
  assert.ok(Math.abs(sp.reduce((s, p) => s + area(p), 0) - area(star)) < 1e-9)
  assert.deepEqual(convexParts([[0, 0], [1, 1]]), [])
  assert.deepEqual(convexParts([[0, 0], [1, 1], [2, 2]]), [], 'a flat ring has no area')
})

test('a ring that crosses itself is replaced by its hull and never throws', () => {
  const bow = [[0, 0], [4, 0], [0, 3], [5, 3]]
  const parts = convexParts(bow)
  assert.ok(parts.length >= 1)
  for (const p of parts) assert.ok(area(p) > 0)
})

test('room and local coordinates are inverses and agree with sunInRoom', () => {
  const scene = normalizeScene({ room: { w: 5, d: 7, h: 2.6, wall: 0.1 }, facing: 123 })
  for (const [x, y] of [[0, 0], [2.5, 3.5], [5, 7], [1.3, 6.2]]) {
    const [e, n] = roomToLocal(scene, x, y)
    const [x2, y2] = localToRoom(scene, e, n)
    assert.ok(Math.abs(x - x2) < 1e-9 && Math.abs(y - y2) < 1e-9)
  }
  // a point 100 m due west of the centre lies in the direction a due west sun has in the room
  const [px, py] = localToRoom(scene, -100, 0)
  const s = sunInRoom(scene, 270, 0)
  assert.ok(Math.abs((px - 2.5) / 100 - s[0]) < 1e-9 && Math.abs((py - 3.5) / 100 - s[1]) < 1e-9)
})

test('a neighbour block west of a west window shades the afternoon, and an offset floor lets the same block reach the window', () => {
  const base = {
    facing: 270, room: { w: 4, d: 5, h: 2.6, wall: 0.15 },
    windows: [{ wall: 'top', pos: 1, w: 2, h: 1.4, sill: 0.9 }], items: [],
    obstacles: [{ type: 'building', ring: [[-12, -20], [-12, 20], [-28, 20], [-28, -20]], h: 15 }],
  }
  const low = normalizeScene({ ...base, floor: { n: 1, storey: 3 } })
  const high = normalizeScene({ ...base, floor: { n: 8, storey: 3 } })
  const none = normalizeScene({ ...base, obstacles: [] })
  const sun = { azimuth: 270, elevation: 25 }
  const a = (sc) => totalArea(scenePatches(sc, sun).floor)
  assert.equal(a(low), 0, 'a 15 m block 12 m away hides a 25 degree sun from the ground floor')
  assert.ok(a(none) > 1)
  assert.ok(Math.abs(a(high) - a(none)) < 1e-9, 'from the eighth floor (21 m up) the block is below the sill')
})

test('switched off obstacles are ignored', () => {
  const scene = normalizeScene({ facing: 270, obstacles: [{ type: 'building', ring: [[-12, -20], [-12, 20], [-28, 20], [-28, -20]], h: 60, on: false }] })
  assert.equal(sceneObstacles(scene).length, 0)
})

test('a tree crown is a twelve sided prism within five percent of the circle', () => {
  const r = 3
  const ring = crownRing(0, 0, r)
  assert.equal(ring.length, 12)
  const ratio = area(ring) / (Math.PI * r * r)
  assert.ok(ratio > 0.95 && ratio < 1.05, String(ratio))
})

test('normalizing keeps obstacles, floors and turned furniture, and rejects junk', () => {
  const scene = normalizeScene({
    floor: { n: 5.4, storey: 99 },
    obstacles: [
      { type: 'building', ring: [[1, 1], [5, 1], [5, 5], [1, 5], [1, 1]], h: 12, est: true, id: 77 },
      { type: 'building', ring: [[0, 0], [1, 1]], h: 5 },
      { type: 'tree', x: 10, y: -4, r: 99, h: 7 },
      { type: 'spaceship' },
      null,
    ],
    items: [{ kind: 'shelf', x: 0, y: 0, rot: 725 }],
  })
  assert.equal(scene.floor.n, 5)
  assert.equal(scene.floor.storey, 6)
  assert.equal(scene.obstacles.length, 2)
  assert.equal(scene.obstacles[0].ring.length, 4, 'the repeated closing vertex is dropped')
  assert.equal(scene.obstacles[0].id, 77)
  assert.equal(scene.obstacles[1].r, 15)
  assert.equal(scene.items[0].rot, 5)
  assert.equal(JSON.stringify(normalizeScene(scene)), JSON.stringify(scene))
})

test('turned furniture stays inside the room', () => {
  const scene = normalizeScene({ room: { w: 3, d: 3, h: 2.6, wall: 0.1 }, items: [{ kind: 'bed', x: 0, y: 0, rot: 45 }, { kind: 'sofa', x: 2.9, y: 2.9, rot: 90 }] })
  for (const item of scene.items) for (const [x, y] of itemFootprint(item)) {
    assert.ok(x > -0.01 && x < 3.01 && y > -0.01 && y < 3.01, `${item.kind} corner ${x},${y}`)
  }
})

test('agrees with the independent ray tracer on random rooms with buildings, trees and balconies', () => {
  const r = compareWithTracer(11, 400)
  console.log(`# ${r.cases} random rooms with obstacles, ${r.points} probes (${r.lit} lit, ${r.shadedByCasters} floor probes darkened by obstacles), ${r.mismatches} disagreements`)
  assert.ok(r.cases >= 150)
  assert.ok(r.lit > 4000, `only ${r.lit} lit probes`)
  assert.ok(r.shadedByCasters > 500, `only ${r.shadedByCasters} probes were darkened by obstacles, the test is too weak`)
  assert.equal(r.mismatches, 0)
})


test('the ray and prism test itself: concave footprints, levels and starting inside', () => {
  const l = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]
  assert.equal(rayHitsPrism([20, 20, 0], [0.6, 0.6, 0.5], l, 0, 100), false, 'a ray that leads away from the L')
  assert.equal(rayHitsPrism([12, 6, 3], [-1, 0, 0.1], l, 0, 2), false, 'passes over the top')
  assert.equal(rayHitsPrism([12, 6, 0.5], [-1, 0, 0.01], l, 0, 2), true, 'runs into the tall arm after crossing the notch')
  assert.equal(rayHitsPrism([12, 6, 0.5], [-1, 0, 0.01], l.map(([x, y]) => [x, y + 20]), 0, 2), false, 'the same ray misses a prism moved aside')
  assert.equal(rayHitsPrism([2, 2, 0], [0, 0.2, 0.98], l, 1, 100), true, 'starting inside, rising into the solid')
  assert.equal(rayHitsPrism([2, 2, 0], [0, 0.2, 0.98], l, 50, 100), false, 'the ray leaves the footprint before it reaches the level')
})

// Whether Sunspill agrees with a reference made without any of its code: the sun from pvlib (NREL SPA),
// the room, windows and obstacles placed in a world frame by compass bearings, and the rays traced with
// shapely against extruded polygons. scripts/make-obstacle-reference.py writes it.
// Whether Sunspill agrees with a reference made without any of its code: the sun from pvlib (NREL SPA),
// the room, windows and obstacles placed in a world frame by compass bearings, and the rays traced with
// shapely against extruded polygons. scripts/make-obstacle-reference.py writes it.
test('agrees with a reference made in Python with pvlib and shapely: sun, rays and polygons that share no code with it', async () => {
  const { readFileSync } = await import('node:fs')
  const reference = JSON.parse(readFileSync(new URL('./fixtures/obstacle-reference.json', import.meta.url), 'utf8'))
  const r = compareWithReference(reference)
  console.log(`# against pvlib and shapely: ${r.cases} rooms, ${r.probes} probes (${r.lit} lit, ${r.darkened} darkened by buildings, trees or rails), ${r.misses.length} disagreements`)
  assert.ok(r.cases >= 250 && r.lit > 1500 && r.darkened > 400, 'the reference must have plenty of lit and shaded probes')
  assert.deepEqual(r.misses.slice(0, 5), [])
})

test('a self crossing outline with no net area still becomes its hull', () => {
  const bow = [[0, 0], [2, 2], [0, 2], [2, 0]] // two triangles that cancel: the signed area is zero
  const parts = convexParts(bow)
  assert.equal(parts.length, 1)
  assert.ok(Math.abs(area(parts[0]) - 4) < 1e-9, `area ${parts[0] && area(parts[0])}`)
})

test('the buildings that shade a window now are the ones whose shadow reaches its opening', () => {
  const scene = normalizeScene({
    facing: 270, room: { w: 4, d: 5, h: 2.6, wall: 0.15 }, windows: [{ wall: 'top', pos: 1, w: 2, h: 1.4, sill: 0.9 }], items: [],
    obstacles: [
      { type: 'building', ring: [[-12, -20], [-12, 20], [-28, 20], [-28, -20]], h: 15 }, // west, tall and close
      { type: 'building', ring: [[-12, -20], [-12, 20], [-28, 20], [-28, -20]], h: 15, on: false }, // the same, switched off
      { type: 'building', ring: [[-12, -20], [-12, 20], [-28, 20], [-28, -20]], h: 2.5 }, // west but lower than the sill
      { type: 'building', ring: [[28, -20], [28, 20], [12, 20], [12, -20]], h: 60 }, // east, behind the window
      { type: 'building', ring: [[-12, 80], [-12, 120], [-28, 120], [-28, 80]], h: 15 }, // west but far to the north of the sun path
    ],
  })
  const low = sunInRoom(scene, 270, 25)
  assert.deepEqual(shadingObstacles(scene, low), [0], 'only the tall one close to the west')
  const high = sunInRoom(scene, 270, 70)
  assert.deepEqual(shadingObstacles(scene, high), [], 'a high sun clears every roof')
  assert.deepEqual(shadingObstacles(scene, sunInRoom(scene, 90, 30)), [], 'a sun behind the window is not shaded by anything')
  assert.deepEqual(shadingObstacles(scene, [0, 1, -0.2]), [], 'nothing shades at night')
  // and it agrees with the light model: switching the flagged building off brings light back
  const without = normalizeScene({ ...scene, obstacles: scene.obstacles.map((o, i) => (i === 0 ? { ...o, on: false } : o)) })
  assert.equal(totalArea(scenePatches(scene, { azimuth: 270, elevation: 25 }).floor), 0)
  assert.ok(totalArea(scenePatches(without, { azimuth: 270, elevation: 25 }).floor) > 0.5)
})
