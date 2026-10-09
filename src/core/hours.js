// Direct sun hours: how long each spot of a room sees the sun on a day, a
// month or a season, and the questions built on that (the afternoon check,
// where a plant would sit best).

import { dayTrack, localToUtc, solarPosition, sunTimes } from './solar.js'
import { scenePatches } from './light.js'
import { YEAR, daysInMonth } from './room.js'
import { insideConvex, unionArea } from './poly.js'

const MIN_ELEVATION = 0.2

const pause = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Lets a long loop hand the thread back now and then and be cancelled: await slice(i, n) once per day. */
function slicer({ signal, onProgress, budget = 12 } = {}) {
  let t0 = performance.now()
  return async (done, total) => {
    if (signal?.aborted) return true
    if (performance.now() - t0 > budget) {
      onProgress?.(done / total)
      await pause()
      t0 = performance.now()
      return Boolean(signal?.aborted)
    }
    return false
  }
}

/**
 * Sun positions for a local day at equal steps inside each stretch of daylight
 * (the middle of each step), so the hours add up with no end effect.
 * @returns {{steps: {minutes:number, azimuth:number, elevation:number, w:number}[], hours:number}}
 *   w is the width of a step in hours, hours is the total daylight covered
 */
export function daySteps(place, month, day, stepMinutes = 5) {
  const { lat, lon, zone } = place
  const steps = []
  let hours = 0
  for (const [from, to] of sunTimes(YEAR, month, day, lat, lon, zone).intervals) {
    const count = Math.max(1, Math.ceil((to - from) / stepMinutes))
    const width = (to - from) / count
    for (let i = 0; i < count; i++) {
      const minutes = from + width * (i + 0.5)
      const p = solarPosition(localToUtc(YEAR, month, day, minutes, zone), lat, lon)
      if (p.apparent > MIN_ELEVATION) {
        steps.push({ minutes, azimuth: p.azimuth, elevation: p.apparent, w: width / 60 })
        hours += width / 60
      }
    }
  }
  return { steps, hours }
}

/** The sun at a local time, with the apparent elevation the light model uses. */
export function sunAt(place, month, day, minutes) {
  const p = solarPosition(localToUtc(YEAR, month, day, minutes, place.zone), place.lat, place.lon)
  return { azimuth: p.azimuth, elevation: p.apparent, geometric: p.elevation }
}

/** Sample days that stand for a month: every third day, so about ten per month. */
export function monthDays(month) {
  const days = []
  for (let d = 2; d <= daysInMonth(month); d += 3) days.push({ month, day: d })
  return days
}

export function seasonDays(months) {
  return months.flatMap(monthDays)
}

export function makeGrid(room, cell) {
  const nx = Math.max(1, Math.round(room.w / cell))
  const ny = Math.max(1, Math.round(room.d / cell))
  return { nx, ny, cx: room.w / nx, cy: room.d / ny, hours: new Float32Array(nx * ny) }
}

/** Mark the grid cells whose centres fall inside any of the polygons. */
export function stamp(grid, polys, mark) {
  const { nx, ny, cx, cy } = grid
  for (const poly of polys) {
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const [x, y] of poly) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    const i0 = Math.max(0, Math.floor(x0 / cx - 0.5))
    const i1 = Math.min(nx - 1, Math.ceil(x1 / cx - 0.5))
    const j0 = Math.max(0, Math.floor(y0 / cy - 0.5))
    const j1 = Math.min(ny - 1, Math.ceil(y1 / cy - 0.5))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!mark[j * nx + i] && insideConvex(poly, (i + 0.5) * cx, (j + 0.5) * cy)) mark[j * nx + i] = 1
      }
    }
  }
}

/**
 * Average hours of direct sun per day for every cell of a horizontal plane.
 * @param {object} scene a normalized scene
 * @param {{month:number, day:number}[]} days the days to average
 * @param {{planeZ?:number, cell?:number, stepMinutes?:number, signal?:AbortSignal, onProgress?:(fraction:number)=>void}} options
 * @returns {Promise<object|null>} the grid, or null when the signal aborted the run
 */
export async function sunHours(scene, days, { planeZ = 0, cell = 0.1, stepMinutes = 6, ...slicing } = {}) {
  const grid = makeGrid(scene.room, cell)
  const mark = new Uint8Array(grid.nx * grid.ny)
  const slice = slicer(slicing)
  let done = 0
  for (const { month, day } of days) {
    if (await slice(done++, days.length)) return null
    for (const step of daySteps(scene.place, month, day, stepMinutes).steps) {
      const patches = scenePatches(scene, step, { planeZ, walls: false })
      if (!patches.floor.length) continue
      mark.fill(0)
      stamp(grid, patches.floor, mark)
      for (let i = 0; i < mark.length; i++) if (mark[i]) grid.hours[i] += step.w
    }
  }
  const n = Math.max(1, days.length)
  for (let i = 0; i < grid.hours.length; i++) grid.hours[i] /= n
  return grid
}

export function hoursAt(grid, room, x, y) {
  const i = Math.min(grid.nx - 1, Math.max(0, Math.floor(x / grid.cx)))
  const j = Math.min(grid.ny - 1, Math.max(0, Math.floor(y / grid.cy)))
  return grid.hours[j * grid.nx + i]
}

/** Mean hours over a rectangle of the floor. */
export function hoursOver(grid, x, y, w, d) {
  const i0 = Math.max(0, Math.floor(x / grid.cx))
  const i1 = Math.min(grid.nx - 1, Math.ceil((x + w) / grid.cx) - 1)
  const j0 = Math.max(0, Math.floor(y / grid.cy))
  const j1 = Math.min(grid.ny - 1, Math.ceil((y + d) / grid.cy) - 1)
  let sum = 0
  let count = 0
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++, count++) sum += grid.hours[j * grid.nx + i]
  return count ? sum / count : 0
}

export const LIGHT_NEEDS = {
  full: { min: 6, max: Infinity },
  partial: { min: 3, max: 6 },
  low: { min: 0.5, max: 3 },
}

/**
 * Ranked places for a plant: the whole footprint must sit inside the wanted
 * range of direct sun hours, and spots closer than `gap` metres to a better one are dropped.
 */
export function plantSpots(grid, need, { footprint = 0.3, count = 3, gap = 0.6 } = {}) {
  const range = LIGHT_NEEDS[need]
  if (!range) return []
  const { nx, ny, cx, cy } = grid
  // check every cell the footprint can touch, so the whole footprint is inside the range
  const rx = Math.max(1, Math.ceil(footprint / cx - 1e-9))
  const ry = Math.max(1, Math.ceil(footprint / cy - 1e-9))
  const target = Number.isFinite(range.max) ? (range.min + range.max) / 2 : Infinity
  const found = []
  for (let j = 0; j + ry <= ny; j++) {
    for (let i = 0; i + rx <= nx; i++) {
      let lo = Infinity
      let hi = -Infinity
      for (let b = j; b < j + ry; b++) for (let a = i; a < i + rx; a++) {
        const v = grid.hours[b * nx + a]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      if (lo < range.min || hi >= range.max) continue
      const mean = (lo + hi) / 2
      found.push({ x: (i + rx / 2) * cx, y: (j + ry / 2) * cy, hours: mean, score: Number.isFinite(target) ? -Math.abs(mean - target) : mean })
    }
  }
  found.sort((p, q) => q.score - p.score)
  const picked = []
  for (const spot of found) {
    if (picked.every((p) => Math.hypot(p.x - spot.x, p.y - spot.y) >= gap)) picked.push(spot)
    if (picked.length === count) break
  }
  return picked.map(({ x, y, hours }) => ({ x, y, hours }))
}

/**
 * The afternoon sun check. For each sample day, the minutes after `fromMinutes`
 * in which direct sun reaches the floor or a wall, and the largest lit floor area.
 */
export async function afternoonSun(scene, days, { fromMinutes = 14 * 60, stepMinutes = 5, ...slicing } = {}) {
  let lit = 0
  let peak = 0
  let latest = null
  let earliest = null
  const slice = slicer(slicing)
  let done = 0
  for (const { month, day } of days) {
    if (await slice(done++, days.length)) return null
    for (const step of daySteps(scene.place, month, day, stepMinutes).steps) {
      if (step.minutes < fromMinutes) continue
      const p = scenePatches(scene, step)
      if (!p.floor.length && !p.walls.length) continue
      lit += step.w
      peak = Math.max(peak, unionArea(p.floor))
      latest = latest === null ? step.minutes : Math.max(latest, step.minutes)
      earliest = earliest === null ? step.minutes : Math.min(earliest, step.minutes)
    }
  }
  const n = Math.max(1, days.length)
  return { hoursPerDay: lit / n, peakFloorArea: peak, earliest, latest, days: days.length }
}

/** Sun positions through a day for drawing the sun's path. */
export function sunPath(place, month, day, stepMinutes = 15) {
  const t = dayTrack(YEAR, month, day, place.lat, place.lon, place.zone, stepMinutes)
  return { sunrise: t.sunrise, sunset: t.sunset, polarDay: t.polarDay, polarNight: t.polarNight, samples: t.samples.map((s) => ({ minutes: s.minutes, azimuth: s.azimuth, elevation: s.apparent })) }
}
