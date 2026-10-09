// Shared by the unit tests and scripts/validate.mjs: random rooms with buildings, trees and
// balconies compared with the ray tracer in raytrace.js, and the Python reference compared
// with Sunspill.

import { windowPatches, scenePatches } from '../../src/core/light.js'
import { sceneObstacles } from '../../src/core/obstacles.js'
import { insideConvex } from '../../src/core/poly.js'
import { normalizeScene, wallFrame } from '../../src/core/room.js'
import { isLit, isWallLit, casterRings } from './raytrace.js'

const RAD = Math.PI / 180

export function rng(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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


/** Random rooms against the ray tracer. Returns the counts and the first few disagreements. */
export function compareWithTracer(seed, count) {
  const rand = rng(seed)
  const between = (lo, hi) => lo + (hi - lo) * rand()
  let cases = 0
  let points = 0
  let lit = 0
  let shadedByCasters = 0
  let mismatches = 0
  for (let n = 0; n < count; n++) {
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
  return { cases, points, lit, shadedByCasters, mismatches }
}

const halton = (i, base) => {
  let f = 1
  let r = 0
  while (i > 0) {
    f /= base
    r += f * (i % base)
    i = Math.floor(i / base)
  }
  return r
}

export function compareWithReference(reference) {
  const { floor: nf, wall: nw } = reference.probes
  const walls = ['top', 'right', 'bottom', 'left']
  let probes = 0
  let lit = 0
  let darkened = 0
  const misses = []
  reference.cases.forEach((c, index) => {
    const scene = normalizeScene({ room: c.room, facing: c.facing, floor: c.floor, windows: c.windows, obstacles: c.obstacles.map((o) => ({ ...o, src: 'manual' })), place: c.place })
    // every value in the reference is one the scene keeps as it is
    if (scene.windows.length !== c.windows.length) throw new Error("the reference windows were changed by normalizeScene")
    for (const [i, w] of c.windows.entries()) if (scene.windows[i].pos !== w.pos || scene.windows[i].w !== w.w || scene.windows[i].sill !== w.sill) throw new Error('the reference windows were changed by normalizeScene')
    const patches = scenePatches(scene, { azimuth: c.sun.azimuth, elevation: c.sun.elevation })
    const { w: rw, d: rd, h: rh } = scene.room
    const expected = c.lit
    let k = 0
    const check = (got, what) => {
      const want = expected[k] === '1'
      probes++
      if (want) lit++
      if (c.bare[k] === '1' && !want) darkened++
      if (got !== want) misses.push(`case ${index} ${what}: reference ${want}, Sunspill ${got}`)
      k++
    }
    for (let i = 1; i <= nf; i++) {
      const x = halton(i, 2) * rw
      const y = halton(i, 3) * rd
      check(patches.floor.some((poly) => insideConvex(poly, x, y)), `floor ${x.toFixed(3)},${y.toFixed(3)}`)
    }
    for (const wall of walls) {
      const length = wall === 'top' || wall === 'bottom' ? rw : rd
      const flat = patches.walls.filter((q) => q.wall === wall).map((q) => q.poly.map((p) => (wall === 'left' || wall === 'right' ? [p[1], p[2]] : [p[0], p[2]])))
      for (let i = 1; i <= nw; i++) {
        // the reference measures along the wall from its left end as seen from inside, the patches by the room axes
        const u = halton(i, 2) * length
        const along = { top: u, right: rd - u, bottom: rw - u, left: u }[wall]
        const z = 0.05 + halton(i, 3) * (rh - 0.1)
        check(flat.some((poly) => insideConvex(poly, along, z)), `${wall} wall ${u.toFixed(3)},${z.toFixed(3)}`)
      }
    }
  })
  return { cases: reference.cases.length, probes, lit, darkened, misses }
}
