// What OpenStreetMap sends back, turned into things the scene understands:
// building outlines with heights from the Overpass API, and address matches
// from Nominatim. Nothing here makes a request; src/app/net.js does.

import { toLocal, insideRing } from './geo.js'
import { LIMITS, MAX_RING } from './room.js'

/** Most buildings kept from one answer, which leaves room in the scene for the ones drawn by hand. */
export const OSM_LIMIT = 60

const LEVEL = 3.2

/** Heights to use when a building has no height and no level count, by its OpenStreetMap building value. */
const TYPICAL = {
  house: 7, detached: 7, semidetached_house: 7, terrace: 7, bungalow: 4, cabin: 3, hut: 3, shed: 3, garage: 3, garages: 3, carport: 3, roof: 4, farm_auxiliary: 5, barn: 6,
  apartments: 15, residential: 12, dormitory: 12, hotel: 18, commercial: 14, office: 18, retail: 8, supermarket: 8, industrial: 9, warehouse: 8,
  school: 12, university: 14, hospital: 16, church: 12, temple: 10, shrine: 8, public: 10, civic: 10, government: 12, train_station: 10, parking: 9,
}
export const DEFAULT_HEIGHT = 9

/** A length in metres from an OpenStreetMap tag such as "12", "12.5 m" or "40'", or null. */
export function parseLength(text) {
  if (typeof text !== 'string' && typeof text !== 'number') return null
  const s = String(text).trim().toLowerCase().replace(',', '.')
  const feet = s.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/)
  if (feet) return (Number(feet[1]) + (feet[2] ? Number(feet[2]) / 12 : 0)) * 0.3048
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(m|ft|feet|meters|metres)?$/)
  if (!m) return null
  const v = Number(m[1])
  return m[2] === 'ft' || m[2] === 'feet' ? v * 0.3048 : v
}

/** Height of a building and whether it is a guess, from its tags. */
export function buildingHeight(tags = {}) {
  const top = parseLength(tags.height)
  const base = parseLength(tags.min_height)
  if (top != null && top > 0) return { h: top, base: base ?? 0, est: false }
  const levels = Number(tags['building:levels'])
  const minLevel = Number(tags['building:min_level'])
  if (Number.isFinite(levels) && levels > 0) {
    // a pitched roof is not counted in the levels, so add a little for it
    const roof = tags['roof:shape'] && tags['roof:shape'] !== 'flat' ? 1.5 : 0
    return { h: levels * LEVEL + roof, base: Number.isFinite(minLevel) && minLevel > 0 ? minLevel * LEVEL : base ?? 0, est: true }
  }
  return { h: TYPICAL[tags.building] ?? DEFAULT_HEIGHT, base: base ?? 0, est: true }
}

const area2 = (r) => r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2
const centroid = (r) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]

/** Douglas and Peucker line simplification of a closed ring to a tolerance in metres. */
export function simplifyRing(ring, tolerance) {
  if (ring.length <= 4) return ring
  // split the ring at its two farthest apart points, simplify both halves
  let a = 0
  let b = 0
  let best = -1
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
    const d = (ring[i][0] - ring[j][0]) ** 2 + (ring[i][1] - ring[j][1]) ** 2
    if (d > best) { best = d; a = i; b = j }
  }
  const half = (from, to) => {
    const pts = []
    for (let i = from; i !== to; i = (i + 1) % ring.length) pts.push(ring[i])
    pts.push(ring[to])
    return dp(pts, tolerance)
  }
  const one = half(a, b)
  const two = half(b, a)
  return one.slice(0, -1).concat(two.slice(0, -1))
}

function dp(pts, tol) {
  if (pts.length < 3) return pts
  const [ax, ay] = pts[0]
  const [bx, by] = pts[pts.length - 1]
  const len = Math.hypot(bx - ax, by - ay) || 1e-12
  let worst = -1
  let at = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len
    if (d > worst) { worst = d; at = i }
  }
  if (worst <= tol) return [pts[0], pts[pts.length - 1]]
  return dp(pts.slice(0, at + 1), tol).slice(0, -1).concat(dp(pts.slice(at), tol))
}

/** A ring with at most MAX_RING corners that stays within a metre of the original. */
export function fitRing(ring) {
  let tol = 0.3
  let out = simplifyRing(ring, tol)
  while (out.length > MAX_RING && tol < 3) {
    tol *= 1.6
    out = simplifyRing(ring, tol)
  }
  return out.length > MAX_RING ? out.filter((_, i) => i % Math.ceil(out.length / MAX_RING) === 0) : out
}

/** The Overpass query for building outlines within a radius of a point. */
export function buildingQuery(lat, lon, radius = 200) {
  // five decimals are about a metre, which is what the page tells people it sends
  const around = `around:${Math.round(radius)},${lat.toFixed(5)},${lon.toFixed(5)}`
  return `[out:json][timeout:20];(way["building"](${around});way["building:part"](${around});relation["building"](${around}););out geom tags;`
}

const ringOf = (geometry, center) => {
  if (!Array.isArray(geometry) || geometry.length < 4) return null
  const pts = geometry.filter((g) => g && Number.isFinite(g.lat) && Number.isFinite(g.lon)).map((g) => toLocal(center, g.lat, g.lon))
  if (pts.length < 4) return null
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.5) return null // an open way is not a building
  pts.pop()
  return pts
}

/**
 * Buildings from an Overpass response. Outlines come back in metres east and
 * north of `center`, the nearest first. A building that holds the center is
 * flagged `own` and switched off, since the room is inside it. When a building
 * is split into parts that carry their own heights, the parts replace it.
 * @returns {{buildings: object[], total: number}}
 */
export function parseBuildings(json, center, { limit = OSM_LIMIT } = {}) {
  const found = []
  for (const el of Array.isArray(json?.elements) ? json.elements : []) {
    const tags = el.tags || {}
    if (!tags.building && !tags['building:part']) continue
    const rings = []
    if (el.type === 'way') rings.push(ringOf(el.geometry, center))
    else if (el.type === 'relation' && Array.isArray(el.members)) for (const m of el.members) if (m.type === 'way' && m.role === 'outer') rings.push(ringOf(m.geometry, center))
    for (const ring of rings) {
      if (!ring || Math.abs(area2(ring)) < 2) continue
      found.push({ id: el.id, part: Boolean(tags['building:part']) && !tags.building, tags, ring })
    }
  }
  const parts = found.filter((b) => b.part)
  const kept = found.filter((b) => b.part || !parts.some((p) => insideRing(b.ring, centroid(p.ring))))
  const mapped = kept.map((b) => {
    const { h, base, est } = buildingHeight(b.tags)
    const own = insideRing(b.ring, [0, 0])
    const name = typeof b.tags.name === 'string' ? b.tags.name.slice(0, 40) : ''
    return { type: 'building', src: 'osm', id: b.id, name, ring: fitRing(b.ring), h: Math.min(h, LIMITS.building.h[1]), base: Math.min(base, Math.max(0, h - 1)), est, own, on: !own }
  })
  const rank = (o) => {
    const dist = Math.min(...o.ring.map(([x, y]) => Math.hypot(x, y)))
    return Math.atan2(o.h, Math.max(dist, 1))
  }
  mapped.sort((a, b) => (b.own ? 1 : 0) - (a.own ? 1 : 0) || rank(b) - rank(a))
  return { buildings: mapped.slice(0, limit), total: mapped.length }
}

/** A short label for a Nominatim result: its name, or street and number, then the town. */
export function shortLabel(item) {
  const a = item.address || {}
  const street = [a.road, a.house_number].filter(Boolean).join(' ')
  const town = a.city || a.town || a.village || a.suburb || a.city_district || a.county || ''
  if (item.name) return [item.name, town].filter(Boolean).join(', ').slice(0, 60)
  if (street) return [street, town].filter(Boolean).join(', ').slice(0, 60)
  const first = String(item.display_name || '').split(',').map((x) => x.trim()).filter(Boolean)
  return (first.slice(0, 2).join(', ') || '').slice(0, 60)
}

/** Places from a Nominatim search response. */
export function parsePlaces(json) {
  if (!Array.isArray(json)) return []
  return json
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({ name: shortLabel(r), label: String(r.display_name || '').slice(0, 160), lat: Number(r.lat), lon: Number(r.lon), country: String(r.address?.country_code || '').toUpperCase() }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 80 && Math.abs(p.lon) <= 180 && p.name)
}

