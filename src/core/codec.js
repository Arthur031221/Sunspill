// The scene as a short link. Everything after the # is the scene, so a shared
// room opens exactly as it was left and no server is involved.

import { normalizeScene, WALLS, ITEM_KINDS } from './room.js'

const PREFIX = 'r1='
const MAX_LENGTH = 6000

function toBase64Url(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Round a place to whole degrees and drop its name, for sharing without giving away the exact spot. */
export function blurPlace(place) {
  return { name: '', lat: Math.round(place.lat), lon: Math.round(place.lon), zone: place.zone }
}

export function packScene(scene) {
  const s = normalizeScene(scene)
  return [
    s.room.w, s.room.d, s.room.h, s.room.wall, s.facing,
    [s.place.name, s.place.lat, s.place.lon, s.place.zone],
    s.date.month, s.date.day, s.minutes,
    s.windows.map((w) => [WALLS.indexOf(w.wall), w.pos, w.w, w.h, w.sill, w.eave.depth, w.eave.gap, w.eave.ext, w.across ? [w.across.height, w.across.distance] : 0]),
    s.items.map((i) => [ITEM_KINDS.indexOf(i.kind), i.x, i.y, i.w, i.d, i.h]),
  ]
}

export function unpackScene(a) {
  const [w, d, h, wall, facing, place, month, day, minutes, windows, items] = a
  return normalizeScene({
    room: { w, d, h, wall },
    facing,
    place: { name: place[0], lat: place[1], lon: place[2], zone: place[3] },
    date: { month, day },
    minutes,
    windows: windows.map((x) => ({ wall: WALLS[x[0]], pos: x[1], w: x[2], h: x[3], sill: x[4], eave: { depth: x[5], gap: x[6], ext: x[7] }, across: x[8] ? { height: x[8][0], distance: x[8][1] } : null })),
    items: items.map((x) => ({ kind: ITEM_KINDS[x[0]], x: x[1], y: x[2], w: x[3], d: x[4], h: x[5] })),
  })
}

/** The hash string (without the #) for a scene. */
export function encodeScene(scene) {
  return PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(packScene(scene))))
}

/** A scene from a hash string, or null when it is not one of ours or is damaged. */
export function decodeScene(hash) {
  const text = String(hash || '').replace(/^#/, '')
  if (!text.startsWith(PREFIX) || text.length > MAX_LENGTH) return null
  try {
    const packed = JSON.parse(new TextDecoder().decode(fromBase64Url(text.slice(PREFIX.length))))
    return Array.isArray(packed) ? unpackScene(packed) : null
  } catch {
    return null
  }
}
