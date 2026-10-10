import { test } from 'node:test'
import assert from 'node:assert/strict'
import { footprintSides, sideScene } from '../src/core/sides.js'
import { sunPlan, measureSide, litShare, verdictOf, LIT_SHARE, VERDICTS } from '../src/core/sidesun.js'
import { sunInRoom, wallFrame } from '../src/core/room.js'
import { daySteps } from '../src/core/hours.js'
import { rayHitsPrism, casterRings } from './helpers/raytrace.js'
import { rng } from './helpers/obstacle-cases.js'

const RAD = Math.PI / 180
const ORIGIN = { lat: 25.0284704, lon: 121.5439379 }
const PLACE = { name: 'Taipei', lat: ORIGIN.lat, lon: ORIGIN.lon, zone: 'Asia/Taipei' }
const box = (cx, cy, w, d, turn = 0) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
  const x = (a * w) / 2
  const y = (b * d) / 2
  const t = turn * RAD
  return [cx + x * Math.cos(t) + y * Math.sin(t), cy - x * Math.sin(t) + y * Math.cos(t)]
})
const ring = box(0, 0, 10, 20)
const sideOf = (id, r = ring) => footprintSides(r).find((s) => s.id === id)
const sceneFor = (id, { floor = 3, neighbours = [] } = {}) => sideScene({ origin: ORIGIN, side: sideOf(id), floor, neighbours, zone: 'Asia/Taipei' })

/**
 * The share of the opening that the sun reaches, found a different way: a grid of points over the window,
 * each followed through the wall (the beam has to clear both faces) and out toward the sun, with the
 * ray tracer of the other tests deciding whether a building is in the way.
 */
function tracedShare(scene, s, n = 40, m = 30) {
  const { room } = scene
  const win = scene.windows[0]
  const f = wallFrame(room, win.wall)
  const sn = s[0] * f.n[0] + s[1] * f.n[1]
  const st = s[0] * f.t[0] + s[1] * f.t[1]
  if (sn < 0.02 || s[2] < 0.003) return 0
  const casters = casterRings(scene)
  const run = room.wall / sn
  let lit = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const a = ((i + 0.5) / n) * win.w
      const b = win.sill + ((j + 0.5) / m) * win.h
      // where the beam crossed the inner face
      const ai = a - run * st
      const bi = b - run * s[2]
      if (ai < 0 || ai > win.w || bi < win.sill || bi > win.sill + win.h) continue
      const outer = [f.o[0] + f.t[0] * (win.pos + a) + f.n[0] * room.wall, f.o[1] + f.t[1] * (win.pos + a) + f.n[1] * room.wall, b]
      if (casters.some((c) => rayHitsPrism(outer, s, c.ring, c.z0, c.z1))) continue
      lit++
    }
  }
  return lit / (n * m)
}

function randomNeighbours(rand, count) {
  const out = []
  for (let i = 0; i < count; i++) {
    const bearing = rand() * 2 * Math.PI
    const dist = 12 + rand() * 90
    const w = 8 + rand() * 20
    const d = 8 + rand() * 20
    out.push({ ring: box(Math.sin(bearing) * dist, Math.cos(bearing) * dist, w, d, rand() * 90), h: 8 + rand() * 60, base: 0, est: false, id: i })
  }
  return out
}

test('the share of the opening that is lit agrees with a ray tracer, over random neighbours, sides, floors and suns', () => {
  const rand = rng(20261010)
  let cases = 0
  let off = 0
  let shaded = 0
  for (let n = 0; n < 60; n++) {
    const id = ['N', 'E', 'S', 'W'][Math.floor(rand() * 4)]
    const scene = sceneFor(id, { floor: 1 + Math.floor(rand() * 12), neighbours: randomNeighbours(rand, 3 + Math.floor(rand() * 8)) })
    for (let k = 0; k < 25; k++) {
      const azimuth = 50 + rand() * 260
      const elevation = 3 + rand() * 65
      const s = sunInRoom(scene, azimuth, elevation)
      const model = litShare(scene, azimuth, elevation)
      const traced = tracedShare(scene, s)
      cases++
      if (traced > 0.01 && traced < 0.99) shaded++
      if (Math.abs(model - traced) > 0.05) off++
    }
  }
  assert.ok(cases >= 1500)
  assert.ok(shaded > 100, `only ${shaded} of the cases were partly shaded`)
  assert.equal(off, 0, `${off} of ${cases} differ by more than 0.05`)
})

test('minutes of sun on a side add up the same as when the ray tracer decides each step', () => {
  const rand = rng(77)
  const plan = sunPlan(PLACE)
  for (const id of ['W', 'S']) {
    const scene = sceneFor(id, { floor: 4, neighbours: randomNeighbours(rand, 10) })
    const got = measureSide(scene, plan)
    // the same day steps, each judged by the tracer
    let minutes = 0
    for (const day of plan.summer) {
      for (const step of day) {
        const s = sunInRoom(scene, step.azimuth, step.elevation)
        if (tracedShare(scene, s, 24, 18) > LIT_SHARE) minutes += step.w * 60
      }
    }
    minutes /= plan.summer.length
    assert.ok(Math.abs(got.afternoon - minutes) < 4, `${id}: ${got.afternoon.toFixed(1)} against ${minutes.toFixed(1)} minutes`)
  }
})

test('a west window with nothing in front gets the afternoon sun of the summer, and a north one a little', () => {
  const plan = sunPlan(PLACE)
  const west = measureSide(sceneFor('W'), plan)
  assert.ok(west.afternoon > 200 && west.afternoon < 290, `west ${west.afternoon}`)
  assert.equal(verdictOf(west.afternoon), 'strong')
  const east = measureSide(sceneFor('E'), plan)
  assert.ok(east.afternoon < 5, `east ${east.afternoon}`)
  assert.equal(verdictOf(east.afternoon), 'none')
  // in December the sun never gets round to the north side of a house in Taipei, and the south side has it all day
  const north = measureSide(sceneFor('N'), plan)
  assert.equal(north.winter, 0)
  const south = measureSide(sceneFor('S'), plan)
  assert.ok(south.winter > 6, `south winter ${south.winter}`)
})

test('the year has twelve values, one for the 15th of each month, and they follow the sun', () => {
  const plan = sunPlan(PLACE)
  assert.equal(plan.year.length, 12)
  const south = measureSide(sceneFor('S'), plan)
  assert.equal(south.year.length, 12)
  // a south wall has more sun in the winter than in the summer, in Taipei, where the sun is high in June
  assert.ok(south.year[11] > south.year[5], `${south.year[11]} against ${south.year[5]}`)
  // each value is no more than the daylight of that day
  south.year.forEach((hours, i) => assert.ok(hours <= daySteps(PLACE, i + 1, 15).hours + 1e-9))
  const day15 = plan.year[6].reduce((sum, step) => sum + step.w, 0)
  close(day15, daySteps(PLACE, 7, 15, 5).hours, 1e-9)
})

test('the plan counts the afternoon of 1 June to 30 September and December in the north, and the other way round in the south', () => {
  const plan = sunPlan(PLACE)
  assert.ok(plan.summer.length >= 38 && plan.summer.length <= 42, `${plan.summer.length} days`)
  for (const day of plan.summer) for (const step of day) assert.ok(step.minutes >= 14 * 60)
  assert.ok(plan.winter.length >= 9 && plan.winter.length <= 11)
  const syd = { ...PLACE, lat: -33.9, lon: 151.2, zone: 'Australia/Sydney' }
  const south = sunPlan(syd)
  const peak = (days) => Math.max(...days.flat().map((step) => step.elevation))
  // the southern winter is June, with a low sun, and the summer afternoon is December to March, with a high one
  assert.ok(peak(south.winter) < 40, `winter peak ${peak(south.winter)}`)
  assert.ok(peak(south.summer) > 70, `summer peak ${peak(south.summer)}`)
  assert.ok(south.summer.length >= 38)
})

test('a tall building across the way takes the summer afternoon from a low floor and not from a high one', () => {
  const tall = [{ ring: box(-25, 0, 20, 40), h: 60, base: 0, est: false, id: 1 }]
  const plan = sunPlan(PLACE)
  const low = measureSide(sceneFor('W', { floor: 3, neighbours: tall }), plan)
  const high = measureSide(sceneFor('W', { floor: 30, neighbours: tall }), plan)
  const open = measureSide(sceneFor('W', { floor: 3 }), plan)
  assert.ok(low.afternoon < open.afternoon * 0.5, `${low.afternoon} against ${open.afternoon}`)
  assert.ok(high.afternoon > open.afternoon * 0.95, `${high.afternoon} against ${open.afternoon}`)
})

test('the verdict follows the minutes of afternoon sun, with the edges in the open', () => {
  assert.deepEqual(VERDICTS.map((v) => v.id), ['strong', 'medium', 'weak', 'none'])
  assert.equal(verdictOf(250), 'strong')
  assert.equal(verdictOf(120), 'strong')
  assert.equal(verdictOf(119.9), 'medium')
  assert.equal(verdictOf(45), 'medium')
  assert.equal(verdictOf(44.9), 'weak')
  assert.equal(verdictOf(10), 'weak')
  assert.equal(verdictOf(9.9), 'none')
  assert.equal(verdictOf(0), 'none')
})

function close(a, b, eps) {
  assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`)
}
