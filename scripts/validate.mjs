// Prints the numbers quoted in docs/VALIDATION.md: how far the sun position is
// from the NREL reference, and how often the window light model disagrees with
// the independent ray tracer in test/helpers/raytrace.js.
import { readFileSync } from 'node:fs'
import { solarPosition } from '../src/core/solar.js'
import { windowPatches } from '../src/core/light.js'
import { insideConvex } from '../src/core/poly.js'
import { wallFrame } from '../src/core/room.js'
import { isLit, isWallLit } from '../test/helpers/raytrace.js'

const reference = JSON.parse(readFileSync(new URL('../test/fixtures/solar-reference.json', import.meta.url), 'utf8'))
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180)
let worstAz = 0
let worstAzHigh = 0
let worstEl = 0
let sumAz = 0
let sumEl = 0
for (const r of reference.rows) {
  const p = solarPosition(r.utcMs, r.lat, r.lon)
  const az = angle(p.azimuth, r.azimuth)
  const el = Math.max(Math.abs(p.apparent - r.apparent), Math.abs(p.elevation - r.elevation))
  worstAz = Math.max(worstAz, az)
  if (r.apparent < 80) worstAzHigh = Math.max(worstAzHigh, az)
  worstEl = Math.max(worstEl, el)
  sumAz += az
  sumEl += el
}
const places = new Set(reference.rows.map((r) => r.place)).size
console.log(`sun position: ${reference.rows.length} samples, ${places} places`)
console.log(`  elevation error: mean ${(sumEl / reference.rows.length).toFixed(4)}, worst ${worstEl.toFixed(4)} degrees`)
console.log(`  azimuth error:   mean ${(sumAz / reference.rows.length).toFixed(4)}, worst ${worstAz.toFixed(4)} degrees (worst below 80 degrees elevation ${worstAzHigh.toFixed(4)})`)

function rng(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const edgeDistance = (poly, x, y) => {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]
    const [bx, by] = poly[(i + 1) % poly.length]
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)))
    best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))))
  }
  return best
}

const SIDES = ['top', 'right', 'bottom', 'left']
const total = { rooms: 0, probes: 0, lit: 0, misses: [] }

/** Random rooms from one seed: floor and wall probes, exact polygons against the ray tracer. */
function compare(seed, count) {
  const rand = rng(seed)
  const between = (lo, hi) => lo + (hi - lo) * rand()
  for (let n = 0; n < count; n++) {
    const r = { w: between(2.5, 8), d: between(2.5, 8), h: between(2.4, 3.4), wall: rand() < 0.5 ? 0 : between(0.05, 0.4) }
    const windows = []
    for (const wall of SIDES.filter(() => rand() < 0.5)) {
      const length = wall === 'top' || wall === 'bottom' ? r.w : r.d
      const w = between(0.6, Math.min(3, length - 0.2))
      const h = between(0.6, 1.6)
      windows.push({ wall, w, h, pos: between(0.05, length - w - 0.05), sill: between(0, r.h - h - 0.1), eave: { depth: rand() < 0.5 ? 0 : between(0.2, 1.2), gap: between(0, 0.4), ext: between(0, 0.8) }, across: rand() < 0.25 ? { height: between(3, 25), distance: between(8, 40) } : null })
    }
    if (!windows.length) continue
    const f = wallFrame(r, windows[Math.floor(rand() * windows.length)].wall)
    const el = between(10, 65) * (Math.PI / 180)
    const off = between(-65, 65) * (Math.PI / 180)
    const s = [Math.cos(el) * (f.n[0] * Math.cos(off) + f.t[0] * Math.sin(off)), Math.cos(el) * (f.n[1] * Math.cos(off) + f.t[1] * Math.sin(off)), Math.sin(el)]
    const planeZ = rand() < 0.5 ? 0 : between(0.4, 1)
    const patches = windows.map((win) => windowPatches(r, win, s, { planeZ }))
    const floor = patches.flatMap((p) => p.floor)
    total.rooms++
    const box = floor.flat()
    const near = box.length ? { x0: Math.min(...box.map((q) => q[0])) - 0.4, x1: Math.max(...box.map((q) => q[0])) + 0.4, y0: Math.min(...box.map((q) => q[1])) - 0.4, y1: Math.max(...box.map((q) => q[1])) + 0.4 } : null
    for (let i = 0; i < 400; i++) {
      const focus = near && i % 2 === 1
      const x = focus ? between(Math.max(0.01, near.x0), Math.min(r.w - 0.01, near.x1)) : between(0, r.w)
      const y = focus ? between(Math.max(0.01, near.y0), Math.min(r.d - 0.01, near.y1)) : between(0, r.d)
      if (!(x > 0 && x < r.w && y > 0 && y < r.d)) continue
      const expected = isLit(r, windows, s, [x, y, planeZ])
      const got = floor.some((poly) => insideConvex(poly, x, y))
      total.probes++
      if (expected) total.lit++
      if (expected !== got) total.misses.push({ kind: 'floor', d: Math.min(...floor.map((poly) => edgeDistance(poly, x, y)), 99), x, y, r, windows, s, planeZ })
    }
    for (const wall of SIDES) {
      const length = wall === 'top' || wall === 'bottom' ? r.w : r.d
      const polys = patches.flatMap((p) => p.walls.filter((q) => q.wall === wall)).map((q) => q.poly.map((p) => [wall === 'left' || wall === 'right' ? p[1] : p[0], p[2]]))
      for (let i = 0; i < 150; i++) {
        const u = between(0, length)
        const z = between(0.05, r.h - 0.05)
        const expected = isWallLit(r, windows, s, wall, [u, z])
        const got = polys.some((q) => insideConvex(q, u, z))
        total.probes++
        if (expected) total.lit++
        if (expected !== got) total.misses.push({ kind: wall, d: Math.min(...polys.map((poly) => edgeDistance(poly, u, z)), 99), u, z, expected, got, room: r, windows, s })
      }
    }
  }
}

// no argument: five seeds. A seed and a room count may be given to rerun one.
const seeds = process.argv[2] ? [Number(process.argv[2])] : [1, 2, 3, 4, 5]
for (const seed of seeds) compare(seed, Number(process.argv[3] || 800))
console.log(`window light (seeds ${seeds.join(', ')}): ${total.rooms} random rooms, ${total.probes} probe points (${total.lit} lit), ${total.misses.length} disagreements`)
if (total.misses.length) {
  const worst = total.misses.reduce((a, b) => (b.d > a.d ? b : a))
  console.log(`  the farthest disagreement lies ${worst.d.toExponential(2)} m from a patch edge (${worst.kind})`)
  if (process.env.SHOW) console.log(JSON.stringify(worst))
}
