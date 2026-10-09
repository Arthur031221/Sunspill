// The scene as a short link. Everything after the # is the scene, so a shared
// room opens exactly as it was left and no server is involved.

import { normalizeScene, WALLS, ITEM_KINDS } from './room.js'

const PREFIX = 'r1='
const PREFIX2 = 'r2='
const MAX_LENGTH = 16000

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

/** A scene with everything that points at a place removed or rounded: the place, building names and OpenStreetMap ids. */
export function blurScene(scene) {
  const s = normalizeScene(scene)
  return normalizeScene({ ...s, place: blurPlace(s.place), obstacles: s.obstacles.map(({ name, id, ...rest }) => ({ ...rest, name: '' })) })
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

const dm = (v) => Math.round(v * 10)
const cm = (v) => Math.round(v * 100)
const FLAGS = { on: 1, est: 2, own: 4, osm: 8 }

/** Obstacles in decimetres: a building is its outline as a first point and then steps from the one before. */
function packObstacle(o) {
  const flags = (o.on ? FLAGS.on : 0) | (o.est ? FLAGS.est : 0) | (o.own ? FLAGS.own : 0) | (o.src === 'osm' ? FLAGS.osm : 0)
  if (o.type === 'tree') return [1, flags, dm(o.h), dm(o.base), o.name, 0, dm(o.x), dm(o.y), dm(o.r)]
  const flat = []
  let px = 0
  let py = 0
  for (const [x, y] of o.ring) {
    flat.push(dm(x) - px, dm(y) - py)
    px = dm(x)
    py = dm(y)
  }
  return [0, flags, dm(o.h), dm(o.base), o.name, o.id ?? 0, ...flat]
}

function unpackObstacle(a) {
  const [kind, flags, h, base, name, id] = a
  const common = { on: Boolean(flags & FLAGS.on), est: Boolean(flags & FLAGS.est), own: Boolean(flags & FLAGS.own), src: flags & FLAGS.osm ? 'osm' : 'manual', name, h: h / 10, base: base / 10 }
  if (kind === 1) return { type: 'tree', ...common, x: a[6] / 10, y: a[7] / 10, r: a[8] / 10 }
  const ring = []
  let px = 0
  let py = 0
  for (let i = 6; i + 1 < a.length; i += 2) {
    px += a[i]
    py += a[i + 1]
    ring.push([px / 10, py / 10])
  }
  return { type: 'building', ...common, ring, ...(id ? { id } : {}) }
}

/** The second link format: everything in the room, in a compact array. */
export function packScene2(scene, { obstacles = true, checks = true } = {}) {
  const s = normalizeScene(scene)
  return [
    [s.room.w, s.room.d, s.room.h, s.room.wall], s.facing,
    [s.place.name, s.place.lat, s.place.lon, s.place.zone],
    [s.floor.n, s.floor.storey],
    [s.date.month, s.date.day, s.minutes],
    s.windows.map((w) => [WALLS.indexOf(w.wall), w.pos, w.w, w.h, w.sill, w.eave.depth, w.eave.gap, w.eave.ext, w.across ? [w.across.height, w.across.distance] : 0, w.balcony ? [w.balcony.depth, w.balcony.rail, w.balcony.ext] : 0]),
    s.doors.map((d) => [WALLS.indexOf(d.wall), d.pos, d.w]),
    s.items.map((i) => [ITEM_KINDS.indexOf(i.kind), i.x, i.y, i.w, i.d, i.h, i.rot]),
    obstacles ? s.obstacles.map(packObstacle) : [],
    checks ? s.checks.map((c) => [c.month, c.day, c.minutes, ...c.poly.flatMap(([x, y]) => [cm(x), cm(y)])]) : [],
  ]
}

export function unpackScene2(a) {
  const [room, facing, place, floor, when, windows, doors, items, obstacles, checks] = a
  return normalizeScene({
    room: { w: room[0], d: room[1], h: room[2], wall: room[3] },
    facing,
    place: { name: place[0], lat: place[1], lon: place[2], zone: place[3] },
    floor: { n: floor[0], storey: floor[1] },
    date: { month: when[0], day: when[1] },
    minutes: when[2],
    windows: windows.map((x) => ({ wall: WALLS[x[0]], pos: x[1], w: x[2], h: x[3], sill: x[4], eave: { depth: x[5], gap: x[6], ext: x[7] }, across: x[8] ? { height: x[8][0], distance: x[8][1] } : null, balcony: x[9] ? { depth: x[9][0], rail: x[9][1], ext: x[9][2] } : null })),
    doors: doors.map((x) => ({ wall: WALLS[x[0]], pos: x[1], w: x[2] })),
    items: items.map((x) => ({ kind: ITEM_KINDS[x[0]], x: x[1], y: x[2], w: x[3], d: x[4], h: x[5], rot: x[6] })),
    obstacles: obstacles.map(unpackObstacle),
    checks: checks.map((x) => ({ month: x[0], day: x[1], minutes: x[2], poly: Array.from({ length: Math.floor((x.length - 3) / 2) }, (_, i) => [x[3 + 2 * i] / 100, x[4 + 2 * i] / 100]) })),
  })
}

/** Distance of an obstacle from the room, for dropping the far ones first when a link grows too long. */
const reach = (o) => (o.type === 'tree' ? Math.hypot(o.x, o.y) : Math.min(...o.ring.map(([x, y]) => Math.hypot(x, y))))

/**
 * The hash string (without the #) for a scene. A long outline list is trimmed
 * to fit: observations go first, then the buildings farthest from the room.
 */
export function encodeScene(scene) {
  const s = normalizeScene(scene)
  const write = (value) => PREFIX2 + toBase64Url(new TextEncoder().encode(JSON.stringify(packScene2(value))))
  let text = write(s)
  if (text.length <= MAX_LENGTH) return text
  let trimmed = { ...s, checks: [] }
  text = write(trimmed)
  const byReach = s.obstacles.slice().sort((a, b) => reach(a) - reach(b))
  while (text.length > MAX_LENGTH && byReach.length) {
    byReach.pop()
    trimmed = { ...trimmed, obstacles: s.obstacles.filter((o) => byReach.includes(o)) }
    text = write(trimmed)
  }
  return text
}

/** A scene from a hash string in either link format, or null when it is not one of ours or is damaged. */
export function decodeScene(hash) {
  const text = String(hash || '').replace(/^#/, '')
  const second = text.startsWith(PREFIX2)
  if (!(second || text.startsWith(PREFIX)) || text.length > MAX_LENGTH) return null
  try {
    const packed = JSON.parse(new TextDecoder().decode(fromBase64Url(text.slice(PREFIX.length))))
    if (!Array.isArray(packed)) return null
    return second ? unpackScene2(packed) : unpackScene(packed)
  } catch {
    return null
  }
}
