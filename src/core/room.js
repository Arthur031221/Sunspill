// The scene model: a rectangular room, its windows, where it stands and which
// moment is shown. normalizeScene accepts anything (a shared link, a pasted
// file) and returns a scene whose every number is inside a safe range.

import { isZone } from './solar.js'

export const WALLS = ['top', 'right', 'bottom', 'left']
export const ITEM_KINDS = ['bed', 'desk', 'sofa', 'table', 'plant', 'box', 'shelf']
export const OBSTACLE_TYPES = ['building', 'tree']
export const MAX_WINDOWS = 4
export const MAX_DOORS = 3
export const MAX_ITEMS = 16
export const MAX_OBSTACLES = 60
export const MAX_RING = 40
export const MAX_CHECKS = 6
export const YEAR = 2026

export const LIMITS = {
  room: { w: [1.5, 20], d: [1.5, 20], h: [2, 6], wall: [0, 0.6] },
  window: { w: [0.3, 12], h: [0.3, 4], sill: [0, 4] },
  eave: { depth: [0, 4], gap: [0, 1.5], ext: [0, 3] },
  across: { height: [0, 400], distance: [2, 300] },
  balcony: { depth: [0.3, 4], rail: [0, 2], ext: [0, 3] },
  floor: { n: [1, 99], storey: [2.4, 6] },
  door: { w: [0.5, 3] },
  building: { h: [1, 600], base: [0, 599], coord: [-1500, 1500] },
  tree: { r: [0.4, 15], h: [1, 45], base: [0, 44] },
}

export const ITEM_SIZES = {
  bed: { w: 1.5, d: 2, h: 0.5 },
  desk: { w: 1.2, d: 0.6, h: 0.75 },
  sofa: { w: 2, d: 0.9, h: 0.8 },
  table: { w: 1.2, d: 0.8, h: 0.75 },
  plant: { w: 0.3, d: 0.3, h: 0.8 },
  box: { w: 0.6, d: 0.6, h: 0.6 },
  shelf: { w: 0.8, d: 0.3, h: 1.8 },
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export const daysInMonth = (month) => DAYS_IN_MONTH[month - 1]

const num = (v, [lo, hi], fallback) => Math.min(hi, Math.max(lo, typeof v === 'number' && Number.isFinite(v) ? v : fallback))
const round = (v, places = 3) => Math.round(v * 10 ** places) / 10 ** places

export function wallLength(room, wall) {
  return wall === 'top' || wall === 'bottom' ? room.w : room.d
}

/**
 * Frame of a wall seen from inside the room: o is the left end, t runs left
 * to right along the wall, n points out of the room. All in room metres,
 * x to the right and y up on the plan.
 */
export function wallFrame(room, wall) {
  const { w, d } = room
  switch (wall) {
    case 'top': return { o: [0, d], t: [1, 0], n: [0, 1], length: w }
    case 'right': return { o: [w, d], t: [0, -1], n: [1, 0], length: d }
    case 'bottom': return { o: [w, 0], t: [-1, 0], n: [0, -1], length: w }
    default: return { o: [0, 0], t: [0, 1], n: [-1, 0], length: d }
  }
}

/** Compass bearing the outside of a wall faces, in degrees clockwise from north. */
export function wallBearing(scene, wall) {
  return (((scene.facing + WALLS.indexOf(wall) * 90) % 360) + 360) % 360
}

/** The unit vector toward the sun, in room axes (x right, y up the plan, z up). */
export function sunInRoom(scene, azimuth, elevation) {
  const a = (azimuth * Math.PI) / 180
  const e = (elevation * Math.PI) / 180
  const east = Math.cos(e) * Math.sin(a)
  const north = Math.cos(e) * Math.cos(a)
  const f = (scene.facing * Math.PI) / 180
  // top wall normal in world axes is (sin f, cos f), the right wall normal is (cos f, -sin f)
  return [east * Math.cos(f) - north * Math.sin(f), east * Math.sin(f) + north * Math.cos(f), Math.sin(e)]
}

export function defaultScene() {
  return {
    v: 2,
    room: { w: 3.6, d: 4.4, h: 2.6, wall: 0.15 },
    facing: 270,
    floor: { n: 1, storey: 3 },
    windows: [{ wall: 'top', pos: 0.9, w: 1.8, h: 1.4, sill: 0.9, eave: { depth: 0, gap: 0.15, ext: 0.3 }, across: null, balcony: null }],
    doors: [],
    place: { name: 'Taipei', lat: 25.033, lon: 121.565, zone: 'Asia/Taipei' },
    obstacles: [],
    date: { month: 7, day: 15 },
    minutes: 990,
    items: [
      { kind: 'bed', x: 0.25, y: 1.5, w: 1.5, d: 2, h: 0.5, rot: 0 },
      { kind: 'desk', x: 2.2, y: 3.5, w: 1.2, d: 0.6, h: 0.75, rot: 0 },
    ],
    checks: [],
  }
}

/** Convert a room point to metres east and north of the room centre. */
export function roomToLocal(scene, x, y) {
  const f = (scene.facing * Math.PI) / 180
  const dx = x - scene.room.w / 2
  const dy = y - scene.room.d / 2
  return [dx * Math.cos(f) + dy * Math.sin(f), -dx * Math.sin(f) + dy * Math.cos(f)]
}

/** Convert metres east and north of the room centre to a room point. */
export function localToRoom(scene, east, north) {
  const f = (scene.facing * Math.PI) / 180
  return [east * Math.cos(f) - north * Math.sin(f) + scene.room.w / 2, east * Math.sin(f) + north * Math.cos(f) + scene.room.d / 2]
}

/** Height of this room's floor above the ground outside, in metres. */
export const floorLift = (scene) => (scene.floor.n - 1) * scene.floor.storey

function normalizeWindow(raw, room) {
  const win = raw && typeof raw === 'object' ? raw : {}
  const wall = WALLS.includes(win.wall) ? win.wall : 'top'
  const length = wallLength(room, wall)
  const w = num(win.w, [LIMITS.window.w[0], Math.min(LIMITS.window.w[1], length)], Math.min(1.5, length))
  const h = num(win.h, [LIMITS.window.h[0], Math.min(LIMITS.window.h[1], room.h)], Math.min(1.4, room.h))
  const sill = num(win.sill, [0, Math.max(0, room.h - h)], Math.min(0.9, Math.max(0, room.h - h)))
  const pos = num(win.pos, [0, Math.max(0, length - w)], Math.max(0, (length - w) / 2))
  const e = win.eave && typeof win.eave === 'object' ? win.eave : {}
  const across = win.across && typeof win.across === 'object'
    ? { height: num(win.across.height, LIMITS.across.height, 30), distance: num(win.across.distance, LIMITS.across.distance, 15) }
    : null
  const b = win.balcony && typeof win.balcony === 'object' ? win.balcony : null
  return {
    wall,
    pos: round(pos),
    w: round(w),
    h: round(h),
    sill: round(sill),
    eave: {
      depth: round(num(e.depth, LIMITS.eave.depth, 0)),
      gap: round(num(e.gap, LIMITS.eave.gap, 0.15)),
      ext: round(num(e.ext, LIMITS.eave.ext, 0.3)),
    },
    across: across && { height: round(across.height, 1), distance: round(across.distance, 1) },
    balcony: b && {
      depth: round(num(b.depth, LIMITS.balcony.depth, 1.2)),
      rail: round(num(b.rail, LIMITS.balcony.rail, 1)),
      ext: round(num(b.ext, LIMITS.balcony.ext, 0.3)),
    },
  }
}

function normalizeDoor(raw, room) {
  const door = raw && typeof raw === 'object' ? raw : {}
  const wall = WALLS.includes(door.wall) ? door.wall : 'bottom'
  const length = wallLength(room, wall)
  const w = num(door.w, [LIMITS.door.w[0], Math.min(LIMITS.door.w[1], length)], Math.min(0.9, length))
  return { wall, pos: round(num(door.pos, [0, Math.max(0, length - w)], 0.2)), w: round(w) }
}

/** Half the width and depth of the box a turned rectangle covers. */
export function turnedExtent(w, d, rot) {
  const r = (rot * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  return [(c * w + s * d) / 2, (s * w + c * d) / 2]
}

/** The corners of a piece of furniture on the floor, counter clockwise, after it is turned about its centre. */
export function itemFootprint(item) {
  const cx = item.x + item.w / 2
  const cy = item.y + item.d / 2
  const r = ((item.rot || 0) * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [[-item.w / 2, -item.d / 2], [item.w / 2, -item.d / 2], [item.w / 2, item.d / 2], [-item.w / 2, item.d / 2]].map(([u, v]) => [cx + u * c - v * s, cy + u * s + v * c])
}

function normalizeItem(raw, room) {
  if (!raw || typeof raw !== 'object' || !ITEM_KINDS.includes(raw.kind)) return null
  const base = ITEM_SIZES[raw.kind]
  const w = num(raw.w, [0.1, Math.min(4, room.w)], base.w)
  const d = num(raw.d, [0.1, Math.min(4, room.d)], base.d)
  const h = num(raw.h, [0.05, room.h], base.h)
  const rot = round(((num(raw.rot, [-1e6, 1e6], 0) % 360) + 360) % 360, 1)
  // x and y are the corner of the unturned box, which turns about its centre; the turned box stays inside the room
  const [ex, ey] = turnedExtent(w, d, rot)
  const cx = room.w >= 2 * ex ? Math.min(room.w - ex, Math.max(ex, num(raw.x, [-1e6, 1e6], 0) + w / 2)) : room.w / 2
  const cy = room.d >= 2 * ey ? Math.min(room.d - ey, Math.max(ey, num(raw.y, [-1e6, 1e6], 0) + d / 2)) : room.d / 2
  return { kind: raw.kind, x: round(cx - w / 2), y: round(cy - d / 2), w: round(w), d: round(d), h: round(h), rot }
}

const coord = (v) => round(num(v, LIMITS.building.coord, 0), 2)

function normalizeObstacle(raw) {
  if (!raw || typeof raw !== 'object' || !OBSTACLE_TYPES.includes(raw.type)) return null
  const common = {
    on: raw.on !== false,
    est: raw.est === true,
    src: raw.src === 'osm' ? 'osm' : 'manual',
    own: raw.own === true,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : '',
  }
  if (raw.type === 'tree') {
    const h = num(raw.h, LIMITS.tree.h, 8)
    return {
      type: 'tree', ...common,
      x: coord(raw.x), y: coord(raw.y),
      r: round(num(raw.r, LIMITS.tree.r, 2), 2),
      h: round(h, 1),
      base: round(num(raw.base, [0, Math.max(0, h - 0.5)], Math.min(h * 0.3, 3)), 1),
    }
  }
  if (!Array.isArray(raw.ring)) return null
  const ring = raw.ring.slice(0, MAX_RING).filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [coord(p[0]), coord(p[1])])
  while (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop()
  if (ring.length < 3) return null
  const h = num(raw.h, LIMITS.building.h, 9)
  const out = { type: 'building', ...common, ring, h: round(h, 1), base: round(num(raw.base, [0, Math.max(0, h - 1)], 0), 1) }
  if (Number.isFinite(raw.id)) out.id = Math.round(raw.id)
  return out
}

function normalizeCheck(raw, room, baseDate) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.poly)) return null
  const poly = raw.poly.slice(0, 12).filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [round(num(p[0], [0, room.w], 0), 2), round(num(p[1], [0, room.d], 0), 2)])
  if (poly.length < 3) return null
  const month = Math.round(num(raw.month, [1, 12], baseDate.month))
  return { month, day: Math.round(num(raw.day, [1, daysInMonth(month)], baseDate.day)), minutes: Math.round(num(raw.minutes, [0, 1439], 720)), poly }
}

/** A complete, safe scene from any input. Never throws. */
export function normalizeScene(raw) {
  const base = defaultScene()
  const input = raw && typeof raw === 'object' ? raw : {}
  const r = input.room && typeof input.room === 'object' ? input.room : {}
  const room = {
    w: round(num(r.w, LIMITS.room.w, base.room.w)),
    d: round(num(r.d, LIMITS.room.d, base.room.d)),
    h: round(num(r.h, LIMITS.room.h, base.room.h)),
    wall: round(num(r.wall, LIMITS.room.wall, base.room.wall)),
  }
  const windows = (Array.isArray(input.windows) ? input.windows : base.windows).slice(0, MAX_WINDOWS).map((w) => normalizeWindow(w, room))
  const doors = (Array.isArray(input.doors) ? input.doors : []).slice(0, MAX_DOORS).map((d) => normalizeDoor(d, room))
  const p = input.place && typeof input.place === 'object' ? input.place : {}
  const place = {
    name: typeof p.name === 'string' ? p.name.slice(0, 60) : base.place.name,
    lat: round(num(p.lat, [-80, 80], base.place.lat), 7),
    lon: round(num(p.lon, [-180, 180], base.place.lon), 7),
    zone: isZone(p.zone) ? p.zone : base.place.zone,
  }
  const f = input.floor && typeof input.floor === 'object' ? input.floor : {}
  const floor = { n: Math.round(num(f.n, LIMITS.floor.n, 1)), storey: round(num(f.storey, LIMITS.floor.storey, 3), 2) }
  const dt = input.date && typeof input.date === 'object' ? input.date : {}
  const month = Math.round(num(dt.month, [1, 12], base.date.month))
  const day = Math.round(num(dt.day, [1, daysInMonth(month)], base.date.day))
  const items = (Array.isArray(input.items) ? input.items : base.items).slice(0, MAX_ITEMS).map((i) => normalizeItem(i, room)).filter(Boolean)
  const obstacles = (Array.isArray(input.obstacles) ? input.obstacles : []).slice(0, MAX_OBSTACLES).map(normalizeObstacle).filter(Boolean)
  const date = { month, day }
  const checks = (Array.isArray(input.checks) ? input.checks : []).slice(0, MAX_CHECKS).map((c) => normalizeCheck(c, room, date)).filter(Boolean)
  return {
    v: 2,
    room,
    facing: round((((num(input.facing, [-1e6, 1e6], base.facing) % 360) + 360) % 360), 1),
    floor,
    windows,
    doors,
    place,
    obstacles,
    date,
    minutes: Math.round(num(input.minutes, [0, 1439], base.minutes)),
    items,
    checks,
  }
}
