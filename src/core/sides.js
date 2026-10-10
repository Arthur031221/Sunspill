// The sides of a building as the quick check sees them. A footprint is cut into its walls, the walls that
// face the same one of eight compass sectors are one side, and each side gets a window that is not there:
// 1.8 by 1.5 metres, sill 0.9 metres up, in the middle of the longest wall of the side, facing out. The sun
// on that window is what the person is told about the side. A wall that touches a neighbour at least as tall
// as the window is a party wall, so it has no window and is no side.

import { insideRing, fromLocal } from './geo.js'
import { normalizeScene, MAX_OBSTACLES } from './room.js'
import { signedArea } from './poly.js'

const RAD = Math.PI / 180
export const SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
/** The room that the virtual window is cut into, the same as the room a new scene starts with. */
export const ROOM = { w: 3.6, d: 4.4, h: 2.6, wall: 0.15 }
export const WINDOW = { w: 1.8, h: 1.5, sill: 0.9 }
/** A wall shorter than this has no window worth the name. */
export const MIN_SIDE = 3
/** Just outside a wall, a point this far out in a neighbour means the wall is shared. Drawn outlines leave small gaps. */
const NEXT_DOOR = 0.6
const ALONG = [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92]

/**
 * The sides of a footprint, in compass order. `ring` is in metres east and north of any point.
 * Each is `{id, sector, bearing, length, edges, a, b, point}`: the sector name and number, the bearing the
 * longest wall faces (so a window on it faces the way the wall does), the total length of the walls in the
 * sector, those walls, the longest one as `a` and `b`, and the middle of it.
 * `neighbours` are `{ring, h}` and `top` is the height of the top of the window above the ground.
 */
export function footprintSides(ring, { neighbours = [], top = 0, minLength = MIN_SIDE } = {}) {
  const pts = ring.filter((p, i) => i === 0 || Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1]) > 1e-9)
  if (pts.length < 3) return []
  const ccw = signedArea(pts) > 0
  const tall = neighbours.filter((o) => o.h >= top)
  const groups = new Map()
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length < 1e-9) continue
    // going round a counter clockwise ring the outside is on the right
    const normal = ccw ? [(b[1] - a[1]) / length, -(b[0] - a[0]) / length] : [-(b[1] - a[1]) / length, (b[0] - a[0]) / length]
    if (shared(a, b, normal, tall)) continue
    const bearing = (((Math.atan2(normal[0], normal[1]) / RAD) % 360) + 360) % 360
    const sector = Math.round(bearing / 45) % 8
    const g = groups.get(sector) ?? { sector, length: 0, edges: [], best: null }
    g.length += length
    g.edges.push([a, b])
    if (!g.best || length > g.best.length) g.best = { a, b, length, bearing }
    groups.set(sector, g)
  }
  return [...groups.values()]
    .filter((g) => g.length >= minLength)
    .sort((p, q) => p.sector - q.sector)
    .map((g) => ({
      id: SECTORS[g.sector],
      sector: g.sector,
      bearing: g.best.bearing,
      length: g.length,
      edges: g.edges,
      a: g.best.a,
      b: g.best.b,
      point: [(g.best.a[0] + g.best.b[0]) / 2, (g.best.a[1] + g.best.b[1]) / 2],
    }))
}

/** True when most of the points just outside the wall from a to b are inside a neighbour. */
function shared(a, b, normal, neighbours) {
  if (!neighbours.length) return false
  let hits = 0
  for (const t of ALONG) {
    const p = [a[0] + (b[0] - a[0]) * t + normal[0] * NEXT_DOOR, a[1] + (b[1] - a[1]) * t + normal[1] * NEXT_DOOR]
    if (neighbours.some((o) => insideRing(o.ring, p))) hits++
  }
  return hits >= 5
}

const shiftRing = (ring, c) => ring.map(([e, n]) => [e - c[0], n - c[1]])

/**
 * A scene for the window of one side: the room is laid behind the wall so that the outer face of the window
 * is on the wall, the room faces the way the wall does, and every neighbour keeps its place on the ground.
 * The building itself is left out, or put in switched off as the room's own building when `own` is given.
 * Of the neighbours the 80 that look highest from the window are kept (the scene holds no more), and those
 * lower than the sill are left out, since a ray that goes up can never meet them.
 * @param {{origin:{lat:number,lon:number}, side:object, floor:number, storey?:number, neighbours?:object[], own?:object|null, name?:string, zone?:string}} options
 *   `origin` is the point that the footprint and the neighbours are measured from
 */
export function sideScene({ origin, side, floor, storey = 3, neighbours = [], own = null, name = '', zone = 'Asia/Taipei' }) {
  const b = side.bearing * RAD
  const back = ROOM.d / 2 + ROOM.wall
  const c = [side.point[0] - Math.sin(b) * back, side.point[1] - Math.cos(b) * back]
  const sill = (floor - 1) * storey + WINDOW.sill
  const look = (o) => Math.atan2(o.h - sill, Math.max(1, Math.min(...o.ring.map((p) => Math.hypot(p[0] - side.point[0], p[1] - side.point[1])))))
  const kept = neighbours
    .filter((o) => o.h > sill)
    .map((o) => ({ o, look: look(o) }))
    .sort((p, q) => q.look - p.look)
    .slice(0, MAX_OBSTACLES - (own ? 1 : 0))
    .map(({ o }) => ({ type: 'building', src: 'osm', id: o.id, name: o.name ?? '', ring: shiftRing(o.ring, c), h: o.h, base: o.base ?? 0, est: Boolean(o.est), own: false, on: true }))
  const obstacles = own ? [{ type: 'building', src: 'osm', id: own.id, name: own.name ?? '', ring: shiftRing(own.ring, c), h: own.h, base: own.base ?? 0, est: Boolean(own.est), own: true, on: false }, ...kept] : kept
  const at = fromLocal(origin, c[0], c[1])
  return normalizeScene({
    room: { ...ROOM },
    facing: side.bearing,
    floor: { n: floor, storey },
    windows: [{ wall: 'top', pos: (ROOM.w - WINDOW.w) / 2, w: WINDOW.w, h: WINDOW.h, sill: WINDOW.sill, eave: { depth: 0, gap: 0.15, ext: 0.3 }, across: null, balcony: null }],
    place: { name, lat: at.lat, lon: at.lon, zone },
    obstacles,
  })
}
