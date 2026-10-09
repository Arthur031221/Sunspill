import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { solarPosition, sunVector, localToUtc, utcToLocal, zoneOffset, isZone, sunTimes, dayTrack } from '../src/core/solar.js'

const reference = JSON.parse(readFileSync(new URL('./fixtures/solar-reference.json', import.meta.url), 'utf8'))
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

test('agrees with the NREL SPA reference on every sampled place, day and hour', () => {
  let worstAz = 0
  let worstEl = 0
  for (const r of reference.rows) {
    const p = solarPosition(r.utcMs, r.lat, r.lon)
    worstAz = Math.max(worstAz, angle(p.azimuth, r.azimuth))
    worstEl = Math.max(worstEl, Math.abs(p.apparent - r.apparent), Math.abs(p.elevation - r.elevation))
  }
  console.log(`# ${reference.rows.length} samples, worst azimuth error ${worstAz.toFixed(4)} deg, worst elevation error ${worstEl.toFixed(4)} deg`)
  assert.ok(reference.rows.length >= 300)
  assert.ok(worstAz < 0.1, `azimuth ${worstAz}`)
  assert.ok(worstEl < 0.1, `elevation ${worstEl}`)
})

test('matches the worked example in the NREL SPA paper (Reda and Andreas 2004)', () => {
  // Boulder, 17 October 2003, 12:30:30 at UTC-7. The paper gives zenith 50.11162 and azimuth 194.34024 degrees.
  const ms = Date.UTC(2003, 9, 17, 19, 30, 30)
  const p = solarPosition(ms, 39.742476, -105.1786)
  assert.ok(Math.abs(90 - p.elevation - 50.11162) < 0.02, `zenith ${90 - p.elevation}`)
  assert.ok(angle(p.azimuth, 194.34024) < 0.02, `azimuth ${p.azimuth}`)
})

test('the sun is due south at solar noon in the northern mid latitudes and north in the southern', () => {
  const north = solarPosition(Date.UTC(2026, 5, 21, 12), 45, 0)
  assert.ok(angle(north.azimuth, 180) < 5, `${north.azimuth}`)
  const south = solarPosition(Date.UTC(2026, 11, 21, 12), -35, 0)
  assert.ok(angle(south.azimuth, 0) < 5, `${south.azimuth}`)
})

test('the equinox sun at the equator passes overhead and rises due east', () => {
  const noon = solarPosition(Date.UTC(2026, 2, 20, 12, 0), 0, 0)
  assert.ok(noon.elevation > 88, `${noon.elevation}`)
  const dawn = solarPosition(Date.UTC(2026, 2, 20, 6, 5), 0, 0)
  assert.ok(angle(dawn.azimuth, 90) < 2, `${dawn.azimuth}`)
})

test('sunVector is a unit vector pointing the right way', () => {
  const [e, n, u] = sunVector(90, 30)
  assert.ok(Math.abs(Math.hypot(e, n, u) - 1) < 1e-12)
  assert.ok(e > 0.86 && Math.abs(n) < 1e-12 && Math.abs(u - 0.5) < 1e-12)
})

test('zones: Taipei has no daylight saving, New York shifts in summer, fixed offsets parse', () => {
  assert.equal(zoneOffset('Asia/Taipei', Date.UTC(2026, 6, 15)), 480)
  assert.equal(zoneOffset('America/New_York', Date.UTC(2026, 0, 15)), -300)
  assert.equal(zoneOffset('America/New_York', Date.UTC(2026, 6, 15)), -240)
  assert.equal(zoneOffset('UTC+5:30', 0), 330)
  assert.equal(zoneOffset('UTC-3', 0), -180)
  assert.ok(isZone('Europe/Paris') && isZone('UTC+8') && !isZone('Mars/Olympus') && !isZone(7))
  assert.ok(!isZone('UTC+99:99') && !isZone('UTC+8:99') && !isZone('UTC+15') && isZone('UTC-14:00'))
})

test('localToUtc and utcToLocal round trip, including a daylight saving day', () => {
  for (const [zone, y, m, d] of [['Asia/Taipei', 2026, 7, 15], ['America/New_York', 2026, 3, 8], ['Australia/Sydney', 2026, 10, 4], ['Pacific/Auckland', 2026, 9, 27]]) {
    for (const minutes of [420, 720, 1020]) {
      const back = utcToLocal(localToUtc(y, m, d, minutes, zone), zone)
      assert.deepEqual([back.year, back.month, back.day, Math.round(back.minutes)], [y, m, d, minutes], `${zone} ${y}-${m}-${d} ${minutes}`)
    }
  }
  assert.equal(localToUtc(2026, 7, 15, 12 * 60, 'Asia/Taipei'), Date.UTC(2026, 6, 15, 4))
  // 01:30 on the night New York springs forward is still standard time, and 03:30 is daylight time
  assert.equal(localToUtc(2026, 3, 8, 90, 'America/New_York'), Date.UTC(2026, 2, 8, 6, 30))
  assert.equal(localToUtc(2026, 3, 8, 210, 'America/New_York'), Date.UTC(2026, 2, 8, 7, 30))
})

test('sunrise and sunset: Taipei midsummer, and the polar cases', () => {
  const t = sunTimes(2026, 6, 21, 25.033, 121.565, 'Asia/Taipei')
  assert.ok(Math.abs(t.sunrise - (5 * 60 + 4)) < 4, `${t.sunrise}`)
  assert.ok(Math.abs(t.sunset - (18 * 60 + 47)) < 4, `${t.sunset}`)
  assert.equal(sunTimes(2026, 6, 21, 69.6492, 18.9553, 'Europe/Oslo').polarDay, true)
  assert.equal(sunTimes(2026, 12, 21, 69.6492, 18.9553, 'Europe/Oslo').polarNight, true)
  assert.equal(dayTrack(2026, 12, 21, 69.6492, 18.9553, 'Europe/Oslo').samples.length, 0)
})

test('dayTrack walks from sunrise to sunset with the sun above the horizon', () => {
  const day = dayTrack(2026, 3, 20, 25.033, 121.565, 'Asia/Taipei', 10)
  assert.ok(day.samples.length > 60 && day.samples.length < 80)
  assert.ok(day.samples.every((s) => s.apparent > 0))
  const noon = day.samples.reduce((a, b) => (b.elevation > a.elevation ? b : a))
  assert.ok(Math.abs(noon.minutes - 12 * 60) < 40)
})

test('a day with sunrise but no sunset, and a day with two stretches of light', () => {
  const rise = sunTimes(2026, 5, 17, 69.6492, 18.9553, 'Europe/Oslo')
  assert.ok(Math.abs(rise.sunrise - 93) < 3, `${rise.sunrise}`)
  assert.equal(rise.sunset, null)
  assert.equal(rise.polarDay, false)
  assert.equal(rise.polarNight, false)
  assert.equal(rise.intervals.length, 1)
  assert.equal(dayTrack(2026, 5, 17, 69.6492, 18.9553, 'Europe/Oslo', 30).samples.length > 30, true)
})

test('the offset cache does not hide a clock change inside a quarter hour', () => {
  // Newfoundland moved its clocks at 00:01 local time in 2010, one minute into a UTC quarter hour
  const before = Date.parse('2010-03-14T03:30:00Z')
  const after = Date.parse('2010-03-14T03:32:00Z')
  assert.equal(zoneOffset('America/St_Johns', before), -210)
  assert.equal(zoneOffset('America/St_Johns', after), -150)
  assert.equal(zoneOffset('America/St_Johns', before), -210)
})
