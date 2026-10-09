// Latitude and longitude to metres, map tiles, and moving the room on the map.
// Everything near a room is flat enough for a local east and north frame: the
// length of a degree is taken from the WGS84 ellipsoid at the room's latitude,
// which is good to a millimetre over a few hundred metres.

import { localToRoom } from './room.js'

const RAD = Math.PI / 180

/** Metres in one degree of latitude and of longitude at a latitude (series for the WGS84 ellipsoid). */
export function metresPerDegree(lat) {
  const p = lat * RAD
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p),
  }
}

/** Metres east and north of a centre for a latitude and longitude. */
export function toLocal(center, lat, lon) {
  const m = metresPerDegree(center.lat)
  let dLon = lon - center.lon
  if (dLon > 180) dLon -= 360
  if (dLon < -180) dLon += 360
  return [dLon * m.lon, (lat - center.lat) * m.lat]
}

/** Latitude and longitude of a point metres east and north of a centre. */
export function fromLocal(center, east, north) {
  const m = metresPerDegree(center.lat)
  return { lat: center.lat + north / m.lat, lon: center.lon + east / m.lon }
}

/** Great circle distance in metres between two latitude and longitude pairs. */
export function haversine(a, b) {
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The Web Mercator tile position (fractional) of a longitude and latitude at a zoom level. */
export function lonLatToTile(lon, lat, zoom) {
  const n = 2 ** zoom
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat))
  const x = ((lon + 180) / 360) * n
  const y = ((1 - Math.log(Math.tan(clamped * RAD) + 1 / Math.cos(clamped * RAD)) / Math.PI) / 2) * n
  return { x, y }
}

export function tileToLonLat(x, y, zoom) {
  const n = 2 ** zoom
  return { lon: (x / n) * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) / RAD }
}

/** Metres on the ground for one pixel of a 256 pixel tile map at a latitude and zoom. */
export const metresPerPixel = (lat, zoom) => (156543.03392 * Math.cos(lat * RAD)) / 2 ** zoom

/**
 * Move the room across the ground by metres east and north: the place moves,
 * and every building and tree keeps its spot on the ground, so its offset from
 * the room centre changes the other way.
 */
export function moveRoom(scene, dEast, dNorth) {
  const place = { ...scene.place, ...fromLocal(scene.place, dEast, dNorth) }
  const shift = (e, n) => [e - dEast, n - dNorth]
  const obstacles = scene.obstacles.map((o) => {
    if (o.type === 'tree') {
      const [x, y] = shift(o.x, o.y)
      return { ...o, x, y }
    }
    return { ...o, ring: o.ring.map(([e, n]) => shift(e, n)) }
  })
  return { ...scene, place, obstacles }
}

/**
 * Put the room at a new point that is not the result of dragging it. A move of
 * 25 metres or less is a nudge: every building and tree stays where it is on
 * the ground, as when the room is dragged. A longer one is a different place,
 * so the outlines loaded from OpenStreetMap for the old spot go, and buildings
 * drawn by hand stay as they were.
 */
export function setPlacePoint(scene, lat, lon) {
  const [east, north] = toLocal(scene.place, lat, lon)
  if (Math.hypot(east, north) > 25) {
    scene.obstacles = scene.obstacles.filter((o) => o.src !== 'osm')
    scene.place.lat = lat
    scene.place.lon = lon
    return scene
  }
  const moved = moveRoom(scene, east, north)
  scene.place = { ...scene.place, lat: moved.place.lat, lon: moved.place.lon }
  scene.obstacles = moved.obstacles
  return refreshOwn(scene)
}

/** True when the point is inside the outline (any simple polygon). */
export function insideRing(ring, [x, y]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Which building outline holds the room centre, or -1. Trees never do. */
export function ownBuilding(scene) {
  return scene.obstacles.findIndex((o) => o.type === 'building' && insideRing(o.ring, [0, 0]))
}

/**
 * After the room moves, a building loaded from OpenStreetMap that now holds
 * the room is the room's own and stops casting shade, and one that no longer
 * does casts it again. Buildings added by hand are left as they are.
 */
export function refreshOwn(scene) {
  for (const o of scene.obstacles) {
    if (o.type !== 'building' || o.src !== 'osm') continue
    const own = insideRing(o.ring, [0, 0])
    if (own !== o.own) {
      o.own = own
      o.on = !own
    }
  }
  return scene
}

/** A rectangle of buildings' kind: its outline in metres east and north of the room, `bearing` degrees from north and `distance` metres away, `width` across the view and `depth` along it. */
export function blockRing(bearing, distance, width, depth) {
  const b = (bearing * Math.PI) / 180
  const c = [distance * Math.sin(b), distance * Math.cos(b)]
  const u = [Math.cos(b), -Math.sin(b)]
  const v = [Math.sin(b), Math.cos(b)]
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, d]) => [c[0] + (a * width * u[0]) / 2 + (d * depth * v[0]) / 2, c[1] + (a * width * u[1]) / 2 + (d * depth * v[1]) / 2])
}

/** The corners of the room on the ground in metres east and north of its centre. */
export function roomCorners(scene) {
  const { w, d } = scene.room
  const f = (scene.facing * Math.PI) / 180
  return [[0, 0], [w, 0], [w, d], [0, d]].map(([x, y]) => {
    const dx = x - w / 2
    const dy = y - d / 2
    return [dx * Math.cos(f) + dy * Math.sin(f), -dx * Math.sin(f) + dy * Math.cos(f)]
  })
}

export { localToRoom }
