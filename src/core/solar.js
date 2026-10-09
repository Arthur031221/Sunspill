// Sun position from the NOAA Global Monitoring Laboratory equations, plus the
// time zone helpers that turn a wall clock reading into an instant.
// Angles in degrees. Azimuth runs clockwise from north.

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const mod = (a, n) => ((a % n) + n) % n

/** Refraction of the apparent sun position, in degrees, for a standard atmosphere (NOAA). */
function refraction(elevation) {
  if (elevation > 85) return 0
  const t = Math.tan(elevation * RAD)
  let seconds
  if (elevation > 5) seconds = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5
  else if (elevation > -0.575) seconds = 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)))
  else seconds = -20.772 / t
  return seconds / 3600
}

/**
 * Where the sun is for an instant and a place.
 * @param {number|Date} when UTC instant (milliseconds or Date)
 * @param {number} lat degrees north
 * @param {number} lon degrees east
 * @returns {{azimuth:number, elevation:number, apparent:number, declination:number, equationOfTime:number}}
 *   elevation is geometric, apparent includes refraction. equationOfTime is in minutes.
 */
export function solarPosition(when, lat, lon) {
  const ms = typeof when === 'number' ? when : when.getTime()
  const jd = ms / 86400000 + 2440587.5
  const T = (jd - 2451545) / 36525
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360)
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
  const Mr = M * RAD
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289
  const trueLong = L0 + C
  const omega = 125.04 - 1934.136 * T
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD)
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD)
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD))
  const y = Math.tan((eps * RAD) / 2) ** 2
  const L0r = L0 * RAD
  const eot = 4 * DEG * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr))

  const utcMinutes = mod(ms / 60000, 1440)
  const solarTime = mod(utcMinutes + eot + 4 * lon, 1440)
  const H = (solarTime / 4 - 180) * RAD
  const phi = lat * RAD
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H)
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl))) * DEG
  const azimuth = mod(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) * DEG + 180, 360)
  return { azimuth, elevation, apparent: elevation + refraction(elevation), declination: decl * DEG, equationOfTime: eot }
}

/** Unit vector toward the sun as [east, north, up]. */
export function sunVector(azimuth, elevation) {
  const a = azimuth * RAD
  const h = elevation * RAD
  return [Math.cos(h) * Math.sin(a), Math.cos(h) * Math.cos(a), Math.sin(h)]
}

const formatters = new Map()
function zoneFormat(zone) {
  let f = formatters.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    formatters.set(zone, f)
  }
  return f
}

const FIXED = /^UTC([+-])(\d{1,2})(?::?([0-5]\d))?$/
function fixedOffset(zone) {
  const m = FIXED.exec(zone)
  if (!m || Number(m[2]) > 14) return null
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0))
}

/** True when the text is an IANA zone this runtime knows, or a fixed offset from UTC-14:59 to UTC+14:59. */
export function isZone(zone) {
  if (typeof zone !== 'string') return false
  if (fixedOffset(zone) !== null) return true
  if (FIXED.test(zone)) return false
  try {
    zoneFormat(zone)
    return true
  } catch {
    return false
  }
}

function lookupOffset(zone, ms) {
  const p = {}
  for (const part of zoneFormat(zone).formatToParts(ms)) p[part.type] = Number(part.value)
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60000
}

// Looking an offset up costs a few microseconds and a day of sun needs thousands, so offsets are
// remembered per quarter hour. A quarter hour is only trusted when the offset is the same at both
// of its ends, which leaves the rare quarter hour that holds a clock change to be looked up every time.
const offsetCache = new Map()
const QUARTER = 15 * 60000

/** Offset of a zone from UTC at an instant, in minutes east. */
export function zoneOffset(zone, ms) {
  const fixed = fixedOffset(zone)
  if (fixed !== null) return fixed
  const bucket = Math.floor(ms / QUARTER)
  const key = `${zone}|${bucket}`
  let hit = offsetCache.get(key)
  if (hit === undefined) {
    const start = lookupOffset(zone, bucket * QUARTER)
    if (start !== lookupOffset(zone, (bucket + 1) * QUARTER - 1000)) return lookupOffset(zone, ms)
    if (offsetCache.size > 20000) offsetCache.clear()
    offsetCache.set(key, start)
    hit = start
  }
  return hit
}

/**
 * The instant for a local calendar day and minutes after local midnight. On the
 * night a clock moves, a time that does not exist or happens twice gets one of
 * its two readings.
 */
export function localToUtc(year, month, day, minutes, zone) {
  const naive = Date.UTC(year, month - 1, day, 0, 0) + minutes * 60000
  const first = zoneOffset(zone, naive)
  const guess = naive - first * 60000
  const second = zoneOffset(zone, guess)
  return second === first ? guess : naive - second * 60000
}

/** Local calendar parts for an instant. */
export function utcToLocal(ms, zone) {
  const offset = zoneOffset(zone, ms)
  const d = new Date(ms + offset * 60000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 }
}

/**
 * The stretches of a local day, in minutes after local midnight, when the sun is
 * above the horizon (apparent upper limb), found at one minute resolution and
 * refined by linear interpolation. A stretch that starts at 0 or ends at 1440
 * continues past midnight. Near the polar circles a day can have two stretches.
 */
export function daylightIntervals(year, month, day, lat, lon, zone) {
  const el = (m) => solarPosition(localToUtc(year, month, day, m, zone), lat, lon).apparent
  const out = []
  let prev = el(0)
  let start = prev > 0 ? 0 : null
  for (let m = 1; m <= 1440; m++) {
    const cur = el(m)
    if (prev <= 0 && cur > 0) start = m - 1 + -prev / (cur - prev)
    if (prev > 0 && cur <= 0 && start !== null) {
      out.push([start, m - 1 + prev / (prev - cur)])
      start = null
    }
    prev = cur
  }
  if (start !== null) out.push([start, 1440])
  return out
}

/**
 * Sunrise and sunset for a local day, in minutes after local midnight. Sunrise is
 * the first time the sun comes up and sunset the last time it goes down. A day
 * that starts or ends with the sun up has null for that end. polarDay means the
 * sun is up all day and polarNight that it never rises.
 */
export function sunTimes(year, month, day, lat, lon, zone) {
  const intervals = daylightIntervals(year, month, day, lat, lon, zone)
  if (!intervals.length) return { sunrise: null, sunset: null, polarDay: false, polarNight: true, intervals }
  const first = intervals[0]
  const last = intervals[intervals.length - 1]
  return {
    sunrise: first[0] === 0 ? null : first[0],
    sunset: last[1] === 1440 ? null : last[1],
    polarDay: first[0] === 0 && last[1] === 1440 && intervals.length === 1,
    polarNight: false,
    intervals,
  }
}

/** Sun positions through a local day: [{minutes, azimuth, elevation, apparent}] at a step, while the sun is up. */
export function dayTrack(year, month, day, lat, lon, zone, stepMinutes = 5) {
  const { sunrise, sunset, polarDay, polarNight, intervals } = sunTimes(year, month, day, lat, lon, zone)
  const samples = []
  for (const [from, to] of intervals) {
    for (let m = Math.ceil(from / stepMinutes) * stepMinutes; m <= to; m += stepMinutes) {
      const p = solarPosition(localToUtc(year, month, day, m, zone), lat, lon)
      if (p.apparent > 0) samples.push({ minutes: m, ...p })
    }
  }
  return { sunrise, sunset, polarDay, polarNight, samples }
}
