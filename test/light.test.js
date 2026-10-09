import { test } from 'node:test'
import assert from 'node:assert/strict'
import { windowPatches, litOpening, scenePatches, totalArea } from '../src/core/light.js'
import { insideConvex, area } from '../src/core/poly.js'
import { sunInRoom, normalizeScene, wallBearing, wallFrame } from '../src/core/room.js'
import { isLit, isWallLit } from './helpers/raytrace.js'

const RAD = Math.PI / 180
const sunAt = (azimuth, elevation) => [Math.cos(elevation * RAD) * Math.sin(azimuth * RAD), Math.cos(elevation * RAD) * Math.cos(azimuth * RAD), Math.sin(elevation * RAD)]

function room(extra = {}) {
  return { w: 6, d: 8, h: 2.8, wall: 0, ...extra }
}
const plainWindow = (over = {}) => ({ wall: 'top', pos: 1.5, w: 2, h: 1.2, sill: 0.8, eave: { depth: 0, gap: 0.1, ext: 0.3 }, across: null, ...over })

test('south window at noon: the patch is as wide as the window and sill/tan(alt) to top/tan(alt) deep', () => {
  const r = room()
  const s = sunAt(0, 40) // sun in the +y direction (the top wall faces it)
  const p = windowPatches(r, plainWindow(), s)
  assert.equal(p.floor.length, 1)
  const ys = p.floor[0].map((q) => q[1])
  const t = Math.tan(40 * RAD)
  assert.ok(Math.abs(Math.max(...ys) - (8 - 0.8 / t)) < 1e-9)
  assert.ok(Math.abs(Math.min(...ys) - (8 - 2.0 / t)) < 1e-9)
  assert.ok(Math.abs(area(p.floor[0]) - 2 * 1.2 / t) < 1e-9)
})

test('a slanted sun shears the patch sideways: x moves by height * sin(offset) / tan(elevation)', () => {
  const r = room()
  const s = sunAt(30, 35) // 30 degrees toward +x of the top wall normal
  const p = windowPatches(r, plainWindow({ pos: 2.5 }), s)
  const xs = p.floor[0].map((q) => q[0])
  const k = Math.sin(30 * RAD) / Math.tan(35 * RAD)
  assert.ok(Math.abs(Math.min(...xs) - (2.5 - 2.0 * k)) < 1e-9)
  assert.ok(Math.abs(Math.max(...xs) - (4.5 - 0.8 * k)) < 1e-9)
})

test('sun behind the wall or below the horizon gives no light', () => {
  const r = room()
  assert.deepEqual(windowPatches(r, plainWindow(), sunAt(180, 40)).floor, [])
  assert.deepEqual(windowPatches(r, plainWindow(), [0, 1, -0.2]).floor, [])
  assert.deepEqual(scenePatches(normalizeScene({}), { azimuth: 270, elevation: -3 }).floor, [])
})

test('an eave shortens the patch: a 0.6 m shade above a south window at 60 degrees', () => {
  const r = room()
  const s = sunAt(0, 60)
  const win = plainWindow({ eave: { depth: 0.6, gap: 0, ext: 2 } })
  // Shade edge at the window top: the ray from the bottom of the shade reaches the wall plane 0.6 m out and 0.6*tan(60) lower.
  const dropAtWall = 0.6 * Math.tan(60 * RAD)
  const lowestLit = 2.0 - dropAtWall
  const p = windowPatches(r, win, s)
  const lit = p.opening.reduce((m, piece) => Math.max(m, ...piece.map((q) => q[1])), -Infinity)
  assert.ok(Math.abs(lit - lowestLit) < 1e-9 || lowestLit < 0.8)
  const bare = totalArea(windowPatches(r, plainWindow(), s).floor)
  assert.ok(totalArea(p.floor) < bare)
})

test('a deep shade blocks a high sun completely', () => {
  const r = room()
  const win = plainWindow({ eave: { depth: 2, gap: 0, ext: 3 } })
  assert.deepEqual(windowPatches(r, win, sunAt(0, 70)).floor, [])
})

test('a building across the street blocks the sun below its roof line', () => {
  const r = room()
  const win = plainWindow({ across: { height: 20, distance: 10 } })
  // The ray over the building must climb 20 - b in 10 m of travel: needs tan(el) > (20 - b) / 10 for b in [0.8, 2]
  assert.deepEqual(windowPatches(r, win, sunAt(0, 40)).floor, [])
  assert.ok(windowPatches(r, win, sunAt(0, 70)).floor.length > 0)
})

test('wall thickness narrows the opening for an oblique sun and not for a head on one', () => {
  const thick = room({ wall: 0.4 })
  const head = litOpening(thick, plainWindow(), sunAt(0, 40)).pieces
  assert.ok(Math.abs(area(head[0]) - 2 * (1.2 - 0.4 * Math.tan(40 * RAD))) < 1e-9)
  const oblique = litOpening(thick, plainWindow(), sunAt(60, 40)).pieces
  assert.ok(area(oblique[0]) < area(head[0]))
})

test('a grazing sun is ignored instead of producing a huge beam', () => {
  assert.deepEqual(litOpening(room(), plainWindow(), sunAt(89.5, 30)).pieces, [])
})

test('light that misses the floor lands on the wall opposite', () => {
  const r = room({ d: 3 })
  const p = windowPatches(r, plainWindow(), sunAt(0, 12))
  assert.equal(p.floor.length, 0)
  assert.ok(p.walls.length > 0 && p.walls.every((w) => w.wall === 'bottom'))
  for (const w of p.walls) for (const q of w.poly) assert.ok(Math.abs(q[1]) < 1e-9 && q[2] >= -1e-9 && q[2] <= r.h + 1e-9)
})

test('a plane above the sill only sees the part of the beam that reaches it', () => {
  const r = room()
  const s = sunAt(0, 45)
  const low = totalArea(windowPatches(r, plainWindow(), s, { planeZ: 0 }).floor)
  const high = totalArea(windowPatches(r, plainWindow(), s, { planeZ: 1.5 }).floor)
  assert.ok(high < low)
  assert.deepEqual(windowPatches(r, plainWindow(), s, { planeZ: 2.5 }).floor, [])
})

function rng(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('agrees with an independent ray tracer on random rooms, windows, shades and buildings', () => {
  const rand = rng(7)
  const between = (lo, hi) => lo + (hi - lo) * rand()
  let cases = 0
  let points = 0
  let mismatches = 0
  let litProbes = 0
  for (let n = 0; n < 150; n++) {
    const r = { w: between(2.5, 8), d: between(2.5, 8), h: between(2.4, 3.4), wall: rand() < 0.5 ? 0 : between(0.05, 0.4) }
    const windows = []
    for (const wall of ['top', 'right', 'bottom', 'left'].filter(() => rand() < 0.5)) {
      const length = wall === 'top' || wall === 'bottom' ? r.w : r.d
      const w = between(0.6, Math.min(3, length - 0.2))
      const h = between(0.6, 1.6)
      windows.push({
        wall, w, h, pos: between(0.05, length - w - 0.05), sill: between(0, r.h - h - 0.1),
        eave: { depth: rand() < 0.5 ? 0 : between(0.2, 1.2), gap: between(0, 0.4), ext: between(0, 0.8) },
        across: rand() < 0.25 ? { height: between(3, 25), distance: between(8, 40) } : null,
      })
    }
    if (!windows.length) continue
    // aim the sun at one window from up to 65 degrees off its normal so most cases have light to compare
    const f = wallFrame(r, windows[Math.floor(rand() * windows.length)].wall)
    const el = between(10, 65) * RAD
    const off = between(-65, 65) * RAD
    const s = [
      Math.cos(el) * (f.n[0] * Math.cos(off) + f.t[0] * Math.sin(off)),
      Math.cos(el) * (f.n[1] * Math.cos(off) + f.t[1] * Math.sin(off)),
      Math.sin(el),
    ]
    const planeZ = rand() < 0.5 ? 0 : between(0.4, 1)
    const patches = windows.map((win) => windowPatches(r, win, s, { planeZ }))
    const floor = patches.flatMap((p) => p.floor)
    cases++
    // half the probes are uniform, half cluster around the predicted patches to test their edges
    const box = floor.flat()
    const near = box.length ? { x0: Math.min(...box.map((q) => q[0])) - 0.4, x1: Math.max(...box.map((q) => q[0])) + 0.4, y0: Math.min(...box.map((q) => q[1])) - 0.4, y1: Math.max(...box.map((q) => q[1])) + 0.4 } : null
    for (let i = 0; i < 400; i++) {
      const focus = near && i % 2 === 1
      const x = focus ? between(Math.max(0.01, near.x0), Math.min(r.w - 0.01, near.x1)) : between(0, r.w)
      const y = focus ? between(Math.max(0.01, near.y0), Math.min(r.d - 0.01, near.y1)) : between(0, r.d)
      if (!(x > 0 && x < r.w && y > 0 && y < r.d)) continue
      const expected = isLit(r, windows, s, [x, y, planeZ])
      const got = floor.some((poly) => insideConvex(poly, x, y))
      points++
      if (expected) litProbes++
      if (expected !== got) {
        mismatches++
        if (process.env.DEBUG_SUN && mismatches < 6) console.log('MISMATCH floor', JSON.stringify({ expected, got, x, y, planeZ, r, windows, s }))
      }
    }
    for (const wall of ['top', 'right', 'bottom', 'left']) {
      const length = wall === 'top' || wall === 'bottom' ? r.w : r.d
      const flat = patches.flatMap((p) => p.walls.filter((q) => q.wall === wall))
      for (let i = 0; i < 150; i++) {
        const u = between(0, length)
        const z = between(0.05, r.h - 0.05)
        const expected = isWallLit(r, windows, s, wall, [u, z])
        const got = flat.some((q) => insideConvex(q.poly.map((p) => [wall === 'left' || wall === 'right' ? p[1] : p[0], p[2]]), u, z))
        points++
        if (expected) litProbes++
        if (expected !== got) mismatches++
      }
    }
  }
  console.log(`# ${cases} random rooms, ${points} probe points (${litProbes} lit), ${mismatches} disagreements`)
  assert.ok(litProbes > 6000, 'the probes must include plenty of lit points')
  assert.ok(cases >= 40)
  assert.equal(mismatches, 0, `${mismatches} of ${points} probes disagree`)
})

test('sunInRoom and wallBearing agree on which way the walls face', () => {
  const scene = normalizeScene({ facing: 270 })
  assert.equal(wallBearing(scene, 'top'), 270)
  assert.equal(wallBearing(scene, 'right'), 0)
  assert.equal(wallBearing(scene, 'bottom'), 90)
  assert.equal(wallBearing(scene, 'left'), 180)
  // A sun due west is straight in front of the top wall when it faces west.
  const s = sunInRoom(scene, 270, 30)
  assert.ok(Math.abs(s[0]) < 1e-12 && Math.abs(s[1] - Math.cos(30 * RAD)) < 1e-12)
  // Due north is along the right wall's outward normal.
  assert.ok(sunInRoom(scene, 0, 0)[0] > 0.999)
})

test('normalizeScene clamps wild input and never throws', () => {
  const wild = normalizeScene({ room: { w: -5, d: 1e9, h: 'tall' }, facing: 725, windows: Array.from({ length: 9 }, () => ({ wall: 'nope', w: 99, sill: -4 })), place: { lat: 123, lon: NaN, zone: 'Not/AZone' }, date: { month: 2, day: 31 }, minutes: 99999, items: [{ kind: 'sofa', x: 99 }, { kind: 'dragon' }, null] })
  assert.equal(wild.windows.length, 4)
  assert.ok(wild.room.w >= 1.5 && wild.room.d <= 20)
  assert.equal(wild.facing, 5)
  assert.equal(wild.date.day, 28)
  assert.equal(wild.minutes, 1439)
  assert.equal(wild.place.zone, 'Asia/Taipei')
  assert.equal(wild.place.lat, 80)
  assert.equal(wild.items.length, 1)
  assert.ok(wild.items[0].x + wild.items[0].w <= wild.room.w + 1e-9)
  for (const bad of [null, undefined, 'x', 42, [], { windows: 'no' }]) assert.ok(normalizeScene(bad).windows.length >= 0)
})

test('a window that meets a corner still lights the side wall', () => {
  const r = { w: 4, d: 4, h: 3, wall: 0 }
  const win = { wall: 'top', pos: 0, w: 2, h: 1.5, sill: 1, eave: { depth: 0, gap: 0.1, ext: 0.3 }, across: null }
  // the top wall faces north, the sun is north east and 30 degrees up, so rays run toward the left wall
  const s = sunInRoom({ facing: 0 }, 45, 30)
  const p = windowPatches(r, win, s)
  assert.ok(p.walls.some((w) => w.wall === 'left'))
  assert.ok(isLit(r, [win], s, [0 + 1e-7, 2.5, 1]), 'the independent tracer lights the same point')
})

test('overlapping windows count their shared light once', () => {
  const r = { w: 4, d: 4, h: 3, wall: 0 }
  const win = { wall: 'top', pos: 1, w: 3, h: 1.5, sill: 1, eave: { depth: 0, gap: 0.1, ext: 0.3 }, across: null }
  const s = sunAt45()
  const one = totalArea(windowPatches(r, win, s).floor)
  const four = totalArea([win, win, win, win].flatMap((w) => windowPatches(r, w, s).floor))
  assert.ok(one > 1)
  assert.ok(Math.abs(four - one) < 1e-9, `${four} vs ${one}`)
})

function sunAt45() {
  return [0, Math.SQRT1_2, Math.SQRT1_2]
}

test('normalizing twice changes nothing, even in the smallest room', () => {
  const once = normalizeScene({ room: { w: 1.5, d: 1.5 }, items: [{ kind: 'sofa', x: 99 }, { kind: 'bed' }] })
  assert.deepEqual(normalizeScene(once), once)
  for (const item of once.items) assert.ok(item.x >= 0 && item.y >= 0 && item.x + item.w <= 1.5 + 1e-9 && item.y + item.d <= 1.5 + 1e-9)
})

test('a polygon with a repeated vertex does not break the union, and thin slivers never count more than they cover', () => {
  const p = [[0, 3], [1, 3], [0, 2], [0, 2]]
  assert.ok(Math.abs(totalArea([p, p]) - 0.5) < 1e-12)
  const sliver = (a) => [[-2, -0.05], [2, -0.05], [2, 0.05], [-2, 0.05]].map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)])
  const slivers = Array.from({ length: 40 }, (_, i) => sliver((i * Math.PI) / 40))
  const union = totalArea(slivers)
  assert.ok(union <= slivers.reduce((s, q) => s + area(q), 0) + 1e-9 && union > 0.4, `${union}`)
})

test('sun running exactly along a wall lights nothing on that wall, whatever rounding does to the direction', () => {
  // the top wall faces 5 degrees and so does the sun: the beam is parallel to the left and right walls
  const scene = normalizeScene({ room: { w: 4, d: 4, h: 3, wall: 0 }, facing: 5, windows: [{ wall: 'top', pos: 0, w: 4, h: 2, sill: 0 }], items: [] })
  const p = scenePatches(scene, { azimuth: 5, elevation: 45 })
  assert.ok(p.floor.length > 0)
  assert.deepEqual(p.walls.filter((q) => q.wall === 'left' || q.wall === 'right'), [], 'no light reaches the side walls')
})
