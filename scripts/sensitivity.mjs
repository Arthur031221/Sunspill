// How far the patch moves when one input is wrong by a realistic amount. These
// are the numbers behind docs/ACCURACY.md: change one thing, keep the rest.
//   node scripts/sensitivity.mjs
import { normalizeScene } from '../src/core/room.js'
import { compareCheck, predictedPatch } from '../src/core/fit.js'
import { sunHoursInside } from '../src/app/frame.js'
import { totalArea } from '../src/core/light.js'
import { moveRoom } from '../src/core/geo.js'
import { declination } from '../src/core/declination.js'

const base = (extra = {}) => normalizeScene({
  room: { w: 3.6, d: 4.4, h: 2.6, wall: 0.15 },
  facing: 270,
  windows: [{ wall: 'top', pos: 0.9, w: 1.8, h: 1.4, sill: 0.9 }],
  place: { name: 'Taipei', lat: 25.033, lon: 121.565, zone: 'Asia/Taipei' },
  items: [], date: { month: 7, day: 15 }, minutes: 16 * 60 + 30,
  floor: { n: 4, storey: 3 },
  // a five storey block, 18 m across a street to the west, as a Taipei side street has
  obstacles: [{ type: 'building', ring: [[-18, -30], [-18, 30], [-40, 30], [-40, -30]], h: 15, est: true }],
  ...extra,
})

const clone = (s) => structuredClone(s)
const rows = []

function report(label, scene, truth, check) {
  const a = compareCheck(truth, check)
  const b = compareCheck(scene, check)
  const shifted = b.shift ? Math.hypot(...b.shift) : null
  rows.push({ label, iou: compareCheck(scene, { ...check, poly: predictedPatch(truth, check).flat() }).iou, minutes: Math.round((sunHoursInside(scene, 1) - sunHoursInside(truth, 1)) * 60), shifted })
  void a
}

for (const [season, month, day, minutes] of [['15 July, 16:30', 7, 15, 990], ['21 December, 15:00', 12, 21, 900]]) {
  const truth = base({ date: { month, day }, minutes, obstacles: [] })
  const check = { month, day, minutes, poly: [] }
  const cases = []
  const scene = (f) => { const s = clone(truth); f(s); return normalizeScene(s) }
  cases.push(['facing off by 2 degrees', scene((s) => { s.facing += 2 })])
  cases.push(['facing off by 5 degrees', scene((s) => { s.facing += 5 })])
  cases.push(['facing off by 10 degrees', scene((s) => { s.facing += 10 })])
  cases.push(['window sill 5 cm off', scene((s) => { s.windows[0].sill += 0.05 })])
  cases.push(['window 10 cm to the side', scene((s) => { s.windows[0].pos += 0.1 })])
  cases.push(['window 10 cm too wide', scene((s) => { s.windows[0].w += 0.1 })])
  cases.push(['wall thickness 5 cm off', scene((s) => { s.room.wall += 0.05 })])
  cases.push(['room 10 cm too deep', scene((s) => { s.room.d += 0.1 })])
  cases.push(['latitude off by 0.01 degrees (1 km)', scene((s) => { s.place.lat += 0.01 })])
  const patch = predictedPatch(truth, check)
  check.poly = patch.flat()
  console.log(`\n${season}, west window, clear sky (room ${truth.room.w} by ${truth.room.d} m, patch ${totalArea(patch).toFixed(2)} m²)`)
  console.log('| One input wrong | Patch overlap with the true patch | Direct sun inside, change per day |')
  console.log('| --- | ---: | ---: |')
  for (const [label, s] of cases) {
    const iou = compareCheck(s, check).iou
    const dm = Math.round((sunHoursInside(s, 1) - sunHoursInside(truth, 1)) * 60)
    console.log(`| ${label} | ${(iou * 100).toFixed(0)}% | ${dm >= 0 ? '+' : ''}${dm} min |`)
  }
}

// buildings: the same street, with a wrong height or a wrong position of the pin
{
  console.log('\nA block across the street (15 July, west window on the fourth floor, 18 m away, 15 m high)')
  console.log('| One input wrong | Direct sun inside, change per day |')
  console.log('| --- | ---: |')
  const truth = base()
  const ref = sunHoursInside(truth, 1)
  const tweak = (label, f) => {
    const s = clone(truth)
    f(s)
    const hours = sunHoursInside(normalizeScene(s), 1)
    console.log(`| ${label} | ${Math.round((hours - ref) * 60) >= 0 ? '+' : ''}${Math.round((hours - ref) * 60)} min |`)
  }
  console.log(`| reference: ${Math.floor(ref)} h ${Math.round((ref % 1) * 60)} min of sun inside | 0 |`)
  tweak('block 3 m too low', (s) => { s.obstacles[0].h -= 3 })
  tweak('block 3 m too high', (s) => { s.obstacles[0].h += 3 })
  tweak('room 5 m farther from the block than it is', (s) => { Object.assign(s, moveRoom(s, 5, 0)) })
  tweak('room 10 m farther from the block than it is', (s) => { Object.assign(s, moveRoom(s, 10, 0)) })
  tweak('floor number one too high (3 m)', (s) => { s.floor.n += 1 })
  tweak('floor number one too low (3 m)', (s) => { s.floor.n -= 1 })
  tweak('block left out altogether', (s) => { s.obstacles = [] })
}

console.log('\nMagnetic declination, World Magnetic Model 2025 on 1 October 2026 (a phone compass reads magnetic north)')
console.log('| Place | Declination |')
console.log('| --- | ---: |')
for (const [name, lat, lon] of [['Taipei', 25.033, 121.565], ['Tokyo', 35.68, 139.65], ['London', 51.5, -0.12], ['New York', 40.71, -74.0], ['Sydney', -33.87, 151.2], ['Anchorage', 61.2, -149.9]]) {
  const d = declination(lat, lon, 2026.75)
  console.log(`| ${name} | ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}° |`)
}
