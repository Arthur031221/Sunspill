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

// ---------------------------------------------------------------- buildings, trees, balconies

import { compareWithTracer, compareWithReference } from '../test/helpers/obstacle-cases.js'

const obstacle = { cases: 0, points: 0, lit: 0, shaded: 0, misses: 0 }
for (const seed of seeds) {
  const r = compareWithTracer(100 + seed, 400)
  obstacle.cases += r.cases
  obstacle.points += r.points
  obstacle.lit += r.lit
  obstacle.shaded += r.shadedByCasters
  obstacle.misses += r.mismatches
}
console.log(`buildings, trees and balconies against the ray tracer (seeds ${seeds.join(', ')}): ${obstacle.cases} random rooms, ${obstacle.points} probe points (${obstacle.lit} lit, ${obstacle.shaded} floor probes darkened by obstacles), ${obstacle.misses} disagreements`)

const ref = compareWithReference(JSON.parse(readFileSync(new URL('../test/fixtures/obstacle-reference.json', import.meta.url), 'utf8')))
console.log(`buildings, trees and balconies against pvlib and shapely: ${ref.cases} rooms, ${ref.probes} probe points (${ref.lit} lit, ${ref.darkened} darkened), ${ref.misses.length} disagreements`)

// ---------------------------------------------------------------- places, magnets, phones, pictures

import { toLocal, lonLatToTile } from '../src/core/geo.js'
import { declination } from '../src/core/declination.js'
import { rotationMatrix } from '../src/core/compass.js'
import { zoneAt } from '../src/core/zone.js'
import { homography, applyHomography } from '../src/core/trace.js'

const fixture = (name) => JSON.parse(readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8'))
{
  const rows = fixture('geo-reference.json').rows
  const worst = Math.max(...rows.map(([lat0, lon0, lat, lon, e, n]) => Math.hypot(toLocal({ lat: lat0, lon: lon0 }, lat, lon)[0] - e, toLocal({ lat: lat0, lon: lon0 }, lat, lon)[1] - n)))
  console.log(`east and north offsets against pyproj: ${rows.length} points within 400 m, worst ${(worst * 100).toFixed(1)} cm`)
}
{
  const rows = fixture('tile-reference.json').rows
  const worst = Math.max(...rows.map(([lat, lon, z, x, y]) => Math.max(Math.abs(lonLatToTile(lon, lat, z).x - x), Math.abs(lonLatToTile(lon, lat, z).y - y)) / 2 ** z))
  console.log(`map tile positions against the slippy map formula: ${rows.length} points, worst ${worst.toExponential(1)} of the world width`)
}
{
  const rows = fixture('declination-reference.json').rows
  const worst = Math.max(...rows.map(([lat, lon, year, h, d]) => Math.abs(declination(lat, lon, year, h) - d)))
  console.log(`magnetic declination against pygeomag (World Magnetic Model 2025): ${rows.length} points, worst ${worst.toFixed(4)} degrees`)
}
{
  const rows = fixture('compass-reference.json').rows
  const worst = Math.max(...rows.map(([a, b, g, back]) => {
    const R = rotationMatrix(a, b, g)
    const h = ((Math.atan2(-R[0][2], -R[1][2]) * 180) / Math.PI + 360) % 360
    return Math.abs(((h - back + 540) % 360) - 180)
  }))
  console.log(`phone angles to a heading against numpy rotation matrices: ${rows.length} orientations, worst ${worst.toExponential(1)} degrees`)
}
{
  const rows = fixture('zone-reference.json').rows.filter((r) => !r[2].startsWith('Etc/'))
  const same = rows.filter(([lat, lon, zone]) => zoneAt(lat, lon) === zone).length
  console.log(`time zone at a point against timezonefinder: ${same} of ${rows.length} land points name the same zone`)
}
{
  const rows = fixture('homography-reference.json').rows
  let worst = 0
  for (const [src, dst, pts, mapped] of rows) {
    const H = homography(src, dst)
    pts.forEach((p, i) => { const q = applyHomography(H, p); worst = Math.max(worst, Math.hypot(q[0] - mapped[i][0], q[1] - mapped[i][1])) })
  }
  console.log(`four point perspective maps against OpenCV: ${rows.length} maps, worst ${worst.toFixed(5)} pixels`)
}
