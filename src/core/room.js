// The scene model: a rectangular room, its windows, where it stands and which
// moment is shown. normalizeScene accepts anything (a shared link, a pasted
// file) and returns a scene whose every number is inside a safe range.

import { isZone } from './solar.js'

export const WALLS = ['top', 'right', 'bottom', 'left']
export const ITEM_KINDS = ['bed', 'desk', 'sofa', 'table', 'plant', 'box']
export const MAX_WINDOWS = 4
export const MAX_ITEMS = 12
export const YEAR = 2026

export const LIMITS = {
  room: { w: [1.5, 20], d: [1.5, 20], h: [2, 6], wall: [0, 0.6] },
  window: { w: [0.3, 12], h: [0.3, 4], sill: [0, 4] },
  eave: { depth: [0, 4], gap: [0, 1.5], ext: [0, 3] },
  across: { height: [0, 400], distance: [2, 300] },
}

export const ITEM_SIZES = {
  bed: { w: 1.5, d: 2, h: 0.5 },
  desk: { w: 1.2, d: 0.6, h: 0.75 },
  sofa: { w: 2, d: 0.9, h: 0.8 },
  table: { w: 1.2, d: 0.8, h: 0.75 },
  plant: { w: 0.3, d: 0.3, h: 0.8 },
  box: { w: 0.6, d: 0.6, h: 0.6 },
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
    v: 1,
    room: { w: 3.6, d: 4.4, h: 2.6, wall: 0.15 },
    facing: 270,
    windows: [{ wall: 'top', pos: 0.9, w: 1.8, h: 1.4, sill: 0.9, eave: { depth: 0, gap: 0.15, ext: 0.3 }, across: null }],
    place: { name: 'Taipei', lat: 25.033, lon: 121.565, zone: 'Asia/Taipei' },
    date: { month: 7, day: 15 },
    minutes: 990,
    items: [
      { kind: 'bed', x: 0.25, y: 1.5, w: 1.5, d: 2, h: 0.5 },
      { kind: 'desk', x: 2.2, y: 3.5, w: 1.2, d: 0.6, h: 0.75 },
    ],
  }
}

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
  }
}

function normalizeItem(raw, room) {
  if (!raw || typeof raw !== 'object' || !ITEM_KINDS.includes(raw.kind)) return null
  const base = ITEM_SIZES[raw.kind]
  const w = num(raw.w, [0.1, Math.min(4, room.w)], base.w)
  const d = num(raw.d, [0.1, Math.min(4, room.d)], base.d)
  const h = num(raw.h, [0.05, room.h], base.h)
  return {
    kind: raw.kind,
    x: round(num(raw.x, [0, room.w - w], 0)),
    y: round(num(raw.y, [0, room.d - d], 0)),
    w: round(w),
    d: round(d),
    h: round(h),
  }
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
  const p = input.place && typeof input.place === 'object' ? input.place : {}
  const place = {
    name: typeof p.name === 'string' ? p.name.slice(0, 60) : base.place.name,
    lat: round(num(p.lat, [-80, 80], base.place.lat), 3),
    lon: round(num(p.lon, [-180, 180], base.place.lon), 3),
    zone: isZone(p.zone) ? p.zone : base.place.zone,
  }
  const dt = input.date && typeof input.date === 'object' ? input.date : {}
  const month = Math.round(num(dt.month, [1, 12], base.date.month))
  const day = Math.round(num(dt.day, [1, daysInMonth(month)], base.date.day))
  const items = (Array.isArray(input.items) ? input.items : base.items).slice(0, MAX_ITEMS).map((i) => normalizeItem(i, room)).filter(Boolean)
  return {
    v: 1,
    room,
    facing: round((((num(input.facing, [-1e6, 1e6], base.facing) % 360) + 360) % 360), 1),
    windows,
    place,
    date: { month, day },
    minutes: Math.round(num(input.minutes, [0, 1439], base.minutes)),
    items,
  }
}
