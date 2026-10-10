// The sun on the virtual window of a side (see sides.js), counted three ways: the minutes of direct sun
// after 14:00 on the days of the hot season, the hours a day in the cold season, and the hours on the 15th
// of each month. The window counts as lit at a time when more than a quarter of its opening is lit.
// The light itself is light.js and obstacles.js, the same code the room uses.

import { daySteps, monthDays, seasonDays } from './hours.js'
import { litOpening } from './light.js'
import { sunInRoom, wallFrame } from './room.js'
import { sceneObstacles } from './obstacles.js'
import { clipHalf, area } from './poly.js'

export const LIT_SHARE = 0.25
export const AFTERNOON = 14 * 60
/** The verdict for a side from the minutes of afternoon sun in the hot season, each from its minimum. */
export const VERDICTS = [
  { id: 'strong', min: 120 },
  { id: 'medium', min: 45 },
  { id: 'weak', min: 10 },
  { id: 'none', min: -Infinity },
]
export const verdictOf = (minutes) => VERDICTS.find((v) => minutes >= v.min).id

/**
 * The sun positions to count, for the place: the afternoons of 1 June to 30 September, the days of December
 * and the 15th of each month. In the southern half of the world the hot season is December to March and
 * the cold one June. Days are every third day, as elsewhere in Sunspill, and steps are five minutes.
 */
export function sunPlan(place, { stepMinutes = 5 } = {}) {
  const north = place.lat >= 0
  const steps = ({ month, day }) => daySteps(place, month, day, stepMinutes).steps
  return {
    summer: seasonDays(north ? [6, 7, 8, 9] : [12, 1, 2, 3]).map((d) => steps(d).filter((s) => s.minutes >= AFTERNOON)),
    winter: monthDays(north ? 12 : 6).map(steps),
    year: Array.from({ length: 12 }, (_, i) => steps({ month: i + 1, day: 15 })),
  }
}

const FRONT = 1e-6
const memo = new WeakMap()

/** The prisms that can shade the window, with the part in front of the wall cut out once, and not on every step. */
function casters(scene) {
  let hit = memo.get(scene)
  if (hit) return hit
  const win = scene.windows[0]
  const f = wallFrame(scene.room, win.wall)
  const off = f.n[0] * f.o[0] + f.n[1] * f.o[1] + scene.room.wall
  hit = []
  for (const p of sceneObstacles(scene)) {
    // a prism that ends below the sill is under every ray that goes up
    if (!(p.z1 > win.sill)) continue
    const front = clipHalf(p.footprint, f.n[0], f.n[1], -(off + FRONT))
    if (front.length >= 3) hit.push({ ...p, footprint: front })
  }
  memo.set(scene, hit)
  return hit
}

function share(scene, s) {
  const win = scene.windows[0]
  const { pieces } = litOpening(scene.room, win, s, 0, casters(scene))
  let lit = 0
  for (const piece of pieces) lit += area(piece)
  return lit / (win.w * win.h)
}

/** The share of the window opening that the sun reaches, 0 to 1, for a sun position in degrees. */
export function litShare(scene, azimuth, elevation) {
  return elevation > 0 ? share(scene, sunInRoom(scene, azimuth, elevation)) : 0
}

/**
 * The numbers for a side: `afternoon` minutes a day, `winter` hours a day and `year`, hours on the 15th of
 * each month. A generator that stops after each day, so a page can hand the thread back now and then.
 */
export function* measureSteps(scene, plan) {
  const hours = function* (days) {
    let total = 0
    for (const day of days) {
      for (const step of day) if (share(scene, sunInRoom(scene, step.azimuth, step.elevation)) > LIT_SHARE) total += step.w
      yield
    }
    return days.length ? total / days.length : 0
  }
  const afternoon = (yield* hours(plan.summer)) * 60
  const winter = yield* hours(plan.winter)
  const year = []
  for (const day of plan.year) year.push(yield* hours([day]))
  return { afternoon, winter, year }
}

export function measureSide(scene, plan) {
  const run = measureSteps(scene, plan)
  for (;;) {
    const next = run.next()
    if (next.done) return next.value
  }
}
