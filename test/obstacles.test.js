import { test } from 'node:test'
import assert from 'node:assert/strict'
import { windowPatches, scenePatches, totalArea } from '../src/core/light.js'
import { convexParts, hullOf, prismShadow, sceneObstacles, crownRing } from '../src/core/obstacles.js'
import { area, insideConvex } from '../src/core/poly.js'
import { normalizeScene, sunInRoom, wallFrame, roomToLocal, localToRoom, itemFootprint } from '../src/core/room.js'
import { isLit, isWallLit, casterRings, rayHitsPrism } from './helpers/raytrace.js'

const RAD = Math.PI / 180
const sunAt = (azimuth, elevation) => [Math.cos(elevation * RAD) * Math.sin(azimuth * RAD), Math.cos(elevation * RAD) * Math.cos(azimuth * RAD), Math.sin(elevation * RAD)]
const plain = (over = {}) => ({ wall: 'top', pos: 1.5, w: 2, h: 1.2, sill: 0.8, eave: { depth: 0, gap: 0.1, ext: 0.3 }, across: null, balcony: null, ...over })

function rng(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

function randomScene(rand) {
  const between = (lo, hi) => lo + (hi - lo) * rand()
  const room = { w: between(2.5, 7), d: between(2.5, 7), h: between(2.4, 3.2), wall: rand() < 0.4 ? 0 : between(0.05, 0.3) }
  const windows = []
  for (const wall of ['top', 'right', 'bottom', 'left'].filter(() => rand() < 0.45)) {
    const length = wall === 'top' || wall === 'bottom' ? room.w : room.d
    const w = between(0.6, Math.min(3, length - 0.2))
    const h = between(0.6, 1.8)
    windows.push({
      wall, w, h, pos: between(0.05, length - w - 0.05), sill: between(0, room.h - h - 0.05),
      eave: { depth: rand() < 0.4 ? 0 : between(0.2, 1), gap: between(0, 0.3), ext: between(0, 0.6) },
      across: null,
      balcony: rand() < 0.35 ? { depth: between(0.6, 2), rail: between(0.4, 1.3), ext: between(0, 0.8) } : null,
    })
  }
  if (!windows.length) return null
  const obstacles = []
  const count = 1 + Math.floor(rand() * 5)
  for (let i = 0; i < count; i++) {
    const bearing = rand() * 2 * Math.PI
    const dist = between(6, 70)
    const cx = Math.sin(bearing) * dist
    const cy = Math.cos(bearing) * dist
    if (rand() < 0.3) {
      obstacles.push({ type: 'tree', x: cx, y: cy, r: between(1.5, 5), h: between(5, 20), base: between(1, 4) })
    } else {
      // a random simple polygon: points sorted by angle round a centre, or an L shape
      const size = between(5, 25)
      const turn = rand() * Math.PI
      const base = rand() < 0.5
        ? [[-1, -1], [1, -1], [1, 0], [0, 0], [0, 1], [-1, 1]]
        : ((sides) => Array.from({ length: sides }, (_, k) => {
          const radius = 0.6 + 0.4 * rand()
          return [Math.cos((2 * Math.PI * k) / sides) * radius, Math.sin((2 * Math.PI * k) / sides) * radius]
        }))(3 + Math.floor(rand() * 5))
      obstacles.push({ type: 'building', ring: base.map(([u, v]) => [cx + size * (u * Math.cos(turn) - v * Math.sin(turn)), cy + size * (u * Math.sin(turn) + v * Math.cos(turn))]), h: between(6, 60), base: 0 })
    }
  }
  return normalizeScene({ room, windows, obstacles, facing: rand() * 360, floor: { n: 1 + Math.floor(rand() * 6), storey: between(2.8, 3.4) }, items: [] })
}

test('agrees with the independent ray tracer on random rooms with buildings, trees and balconies', () => {
  const rand = rng(11)
  const between = (lo, hi) => lo + (hi - lo) * rand()
  let cases = 0
  let points = 0
  let lit = 0
  let shadedByCasters = 0
  let mismatches = 0
  for (let n = 0; n < 400; n++) {
    const scene = randomScene(rand)
    if (!scene) continue
    const r = scene.room
    const casters = casterRings(scene)
    const f = wallFrame(r, scene.windows[Math.floor(rand() * scene.windows.length)].wall)
    const el = between(5, 60) * RAD
    const off = between(-60, 60) * RAD
    const s = [Math.cos(el) * (f.n[0] * Math.cos(off) + f.t[0] * Math.sin(off)), Math.cos(el) * (f.n[1] * Math.cos(off) + f.t[1] * Math.sin(off)), Math.sin(el)]
    const planeZ = rand() < 0.6 ? 0 : between(0.3, 1)
    const patches = scene.windows.map((win) => windowPatches(r, win, s, { planeZ, obstacles: sceneObstacles(scene) }))
    const floor = patches.flatMap((p) => p.floor)
    cases++
    const box = floor.flat()
    const near = box.length ? { x0: Math.min(...box.map((q) => q[0])) - 0.3, x1: Math.max(...box.map((q) => q[0])) + 0.3, y0: Math.min(...box.map((q) => q[1])) - 0.3, y1: Math.max(...box.map((q) => q[1])) + 0.3 } : null
    for (let i = 0; i < 300; i++) {
      const focus = near && i % 2 === 1
      const x = focus ? between(Math.max(0.01, near.x0), Math.min(r.w - 0.01, near.x1)) : between(0.01, r.w - 0.01)
      const y = focus ? between(Math.max(0.01, near.y0), Math.min(r.d - 0.01, near.y1)) : between(0.01, r.d - 0.01)
      if (!(x > 0 && x < r.w && y > 0 && y < r.d)) continue
      const expected = isLit(r, scene.windows, s, [x, y, planeZ], casters)
      const got = floor.some((poly) => insideConvex(poly, x, y))
      points++
      if (expected) lit++
      if (!expected && isLit(r, scene.windows, s, [x, y, planeZ], [])) shadedByCasters++
      if (expected !== got) {
        mismatches++
        if (process.env.DEBUG_SUN && mismatches < 4) console.log('MISMATCH', JSON.stringify({ expected, got, x, y, planeZ, scene, s }))
      }
    }
    for (const wall of ['top', 'right', 'bottom', 'left']) {
      const length = wall === 'top' || wall === 'bottom' ? r.w : r.d
      const flat = patches.flatMap((p) => p.walls.filter((q) => q.wall === wall))
      for (let i = 0; i < 60; i++) {
        const u = between(0.01, length - 0.01)
        const z = between(0.05, r.h - 0.05)
        const expected = isWallLit(r, scene.windows, s, wall, [u, z], casters)
        const got = flat.some((q) => insideConvex(q.poly.map((p) => (wall === 'left' || wall === 'right' ? [p[1], p[2]] : [p[0], p[2]])), u, z))
        points++
        if (expected) lit++
        if (expected !== got) mismatches++
      }
    }
  }
  console.log(`# ${cases} random rooms with obstacles, ${points} probes (${lit} lit, ${shadedByCasters} floor probes darkened by obstacles), ${mismatches} disagreements`)
  assert.ok(cases >= 150)
  assert.ok(lit > 4000, `only ${lit} lit probes`)
  assert.ok(shadedByCasters > 500, `only ${shadedByCasters} probes were darkened by obstacles, the test is too weak`)
  assert.equal(mismatches, 0)
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
