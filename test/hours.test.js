import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daySteps, sunHours, hoursAt, hoursOver, plantSpots, afternoonSun, monthDays, seasonDays, sunPath, makeGrid, stamp } from '../src/core/hours.js'
import { defaultScene, normalizeScene } from '../src/core/room.js'
import { scenePatches } from '../src/core/light.js'
import { rect, insideConvex } from '../src/core/poly.js'

const scene = normalizeScene(defaultScene())

test('day steps cover sunrise to sunset: Taipei in midsummer has about 13.7 hours of daylight', () => {
  const { steps, hours } = daySteps(scene.place, 6, 21, 5)
  assert.ok(hours > 13.4 && hours < 13.9, `${hours}`)
  assert.ok(Math.abs(steps.reduce((sum, s) => sum + s.w, 0) - hours) < 1e-9)
  assert.deepEqual(daySteps({ lat: 69.65, lon: 18.96, zone: 'Europe/Oslo' }, 12, 21).steps, [])
  // Tromso on 17 May: the sun rises at 01:33 and does not set, so the day is one long stretch of light
  const transition = daySteps({ lat: 69.6492, lon: 18.9553, zone: 'Europe/Oslo' }, 5, 17, 10)
  assert.ok(transition.hours > 22 && transition.hours < 22.6, `${transition.hours}`)
  assert.ok(transition.steps.every((s) => s.w > 0 && s.elevation > 0))
})

test('sun hours of a spot are the minutes its position is inside a patch, found two ways', async () => {
  // Pick a floor cell and count the time steps it sits inside a patch by direct polygon tests.
  const grid = await sunHours(scene, [{ month: 7, day: 15 }], { cell: 0.1, stepMinutes: 6 })
  const { steps } = daySteps(scene.place, 7, 15, 6)
  const cell = { i: 12, j: 36 }
  const x = (cell.i + 0.5) * grid.cx
  const y = (cell.j + 0.5) * grid.cy
  let lit = 0
  for (const step of steps) {
    const p = scenePatches(scene, step, { walls: false })
    if (p.floor.some((poly) => insideConvex(poly, x, y))) lit += step.w
  }
  assert.ok(Math.abs(grid.hours[cell.j * grid.nx + cell.i] - lit) < 1e-6)
  assert.ok(lit > 0, 'the chosen cell should see some sun on 15 July')
})

test('a west window gives the near wall side more afternoon sun than the far corner, and none behind it', async () => {
  const grid = await sunHours(scene, monthDays(7), { cell: 0.2 })
  const near = hoursOver(grid, 1, 3.4, 1.2, 0.8)
  const far = hoursOver(grid, 1, 0, 1.2, 0.8)
  assert.ok(near > far)
  assert.ok(Math.max(...grid.hours) < 8)
})

test('a shade cuts the daily hours and a closed room has none', async () => {
  const bare = await sunHours(scene, [{ month: 7, day: 15 }], { cell: 0.2 })
  const shaded = await sunHours({ ...scene, windows: [{ ...scene.windows[0], eave: { depth: 0.9, gap: 0.1, ext: 1 } }] }, [{ month: 7, day: 15 }], { cell: 0.2 })
  const sum = (g) => g.hours.reduce((a, b) => a + b, 0)
  assert.ok(sum(shaded) < sum(bare) * 0.8)
  const dark = await sunHours({ ...scene, windows: [] }, [{ month: 7, day: 15 }], { cell: 0.2 })
  assert.equal(sum(dark), 0)
})

test('the afternoon check reports entry times and a peak area', async () => {
  const r = await afternoonSun(scene, seasonDays([6, 7, 8, 9]))
  assert.ok(r.hoursPerDay > 2 && r.hoursPerDay < 5, `${r.hoursPerDay}`)
  assert.ok(r.peakFloorArea > 1)
  assert.ok(r.earliest >= 14 * 60 && r.latest > r.earliest && r.latest <= 19 * 60)
  const north = await afternoonSun(normalizeScene({ ...scene, facing: 90 }), seasonDays([6, 7, 8, 9]))
  assert.ok(north.hoursPerDay < r.hoursPerDay)
})

test('plant spots respect the light range, prefer the middle of it and stay apart', async () => {
  // hours rise from 0 at the left edge to 10 at the right edge of a 4 m by 2 m floor
  const grid = makeGrid({ w: 4, d: 2 }, 0.1)
  for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) grid.hours[j * grid.nx + i] = ((i + 0.5) / grid.nx) * 10
  const full = plantSpots(grid, 'full')
  assert.ok(full.length === 3 && full.every((s) => s.hours >= 6))
  assert.ok(full[0].hours > 9, 'full sun prefers the brightest spot')
  const partial = plantSpots(grid, 'partial')
  assert.ok(partial.every((s) => s.hours >= 3 && s.hours < 6) && Math.abs(partial[0].hours - 4.5) < 0.2)
  const low = plantSpots(grid, 'low')
  assert.ok(low.every((s) => s.hours >= 0.5 && s.hours < 3))
  for (const spots of [full, partial, low]) for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) >= 0.6 - 1e-9)
  assert.deepEqual(plantSpots(grid, 'nonsense'), [])
  const real = plantSpots(await sunHours(scene, monthDays(7), { cell: 0.1 }), 'low')
  assert.ok(real.length >= 1 && real.every((s) => s.hours >= 0.5 && s.hours < 3))
})

test('stamp marks cells whose centres are inside, once', () => {
  const grid = makeGrid({ w: 2, d: 2 }, 0.5)
  const mark = new Uint8Array(grid.nx * grid.ny)
  stamp(grid, [rect(0, 0, 1, 1), rect(0.5, 0.5, 1.5, 1.5)], mark)
  assert.equal(mark.reduce((a, b) => a + b, 0), 4 + 4 - 1)
  assert.equal(hoursAt({ ...grid, hours: Float32Array.from({ length: 16 }, (_, i) => i) }, null, 1.1, 0.1), 2)
})

test('sunPath gives the arc for the day', () => {
  const p = sunPath(scene.place, 3, 20)
  assert.ok(p.samples.length > 40 && p.sunrise < p.sunset)
})

test('a run can be cancelled and reports progress', async () => {
  const controller = new AbortController()
  let calls = 0
  const result = await sunHours(scene, seasonDays([1, 2, 3, 4, 5, 6]), { cell: 0.2, budget: 0, signal: controller.signal, onProgress: () => { if (++calls === 3) controller.abort() } })
  assert.equal(result, null)
  assert.ok(calls >= 3)
  assert.equal(await afternoonSun(scene, monthDays(7), { signal: AbortSignal.abort() }), null)
})

test('on a day the polar sun rises and never sets, its light is not lost', async () => {
  // a north window, so the low sun of the evening reaches the walls
  const polar = normalizeScene({ ...scene, place: { name: 'Tromso', lat: 69.649, lon: 18.955, zone: 'Europe/Oslo' }, facing: 0, windows: [{ ...scene.windows[0], wall: 'top', pos: 0.9, w: 1.8 }] })
  const r = await afternoonSun(polar, [{ month: 5, day: 17 }], { fromMinutes: 0, stepMinutes: 10 })
  assert.ok(r.hoursPerDay > 1, `${r.hoursPerDay}`)
})

test('plant spots in a big room keep the whole footprint inside the walls', () => {
  const grid = makeGrid({ w: 20, d: 20 }, 0.26)
  grid.hours.fill(4.5)
  for (const s of plantSpots(grid, 'partial')) assert.ok(s.x >= 0.15 && s.y >= 0.15 && s.x <= 19.85 && s.y <= 19.85, `${s.x}, ${s.y}`)
})
