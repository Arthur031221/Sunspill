// Direct sun through the windows of a convex room, as exact polygons.
//
// For one window and one sun direction the lit part of the opening is the
// opening, narrowed by the wall thickness, minus the shadow of the eave above
// it and of the building across the street. Every piece stays convex. The
// pieces are then carried along the sun rays onto the floor (or any
// horizontal plane) and onto the walls and clipped to them. In a convex room
// a ray that enters through the opening reaches the boundary exactly once, so
// no further occlusion test is needed.

import { clipConvex, rect, subtractConvex, unionArea } from './poly.js'
import { WALLS, wallFrame, sunInRoom } from './room.js'
import { prismShadow, balconyPrism, sceneObstacles } from './obstacles.js'

/** Below these the sun is edge on to the wall or the horizon and the beam is not worth tracing. */
const MIN_NORMAL = 0.02
const MIN_UP = 0.003
const BIG = 1000

const SIDE_PLANES = {
  top: { axis: 1, side: 'max' },
  bottom: { axis: 1, side: 'min' },
  right: { axis: 0, side: 'max' },
  left: { axis: 0, side: 'min' },
}

const overlaps = (poly, [a0, b0, a1, b1]) => {
  let lo0 = Infinity
  let lo1 = Infinity
  let hi0 = -Infinity
  let hi1 = -Infinity
  for (const [x, y] of poly) {
    lo0 = Math.min(lo0, x)
    hi0 = Math.max(hi0, x)
    lo1 = Math.min(lo1, y)
    hi1 = Math.max(hi1, y)
  }
  return hi0 > a0 && lo0 < a1 && hi1 > b0 && lo1 < b1
}

/**
 * Pieces of the opening, in outer face coordinates (a along the wall, b above the floor), that the sun reaches.
 * `prisms` are further shadow casters in room metres (see obstacles.js): buildings and trees.
 */
export function litOpening(room, win, s, minHeight = 0, prisms = []) {
  const frame = wallFrame(room, win.wall)
  const sn = s[0] * frame.n[0] + s[1] * frame.n[1]
  const st = s[0] * frame.t[0] + s[1] * frame.t[1]
  const sz = s[2]
  if (sn < MIN_NORMAL || sz < MIN_UP) return { pieces: [], frame, sn, st, sz }

  const top = win.sill + win.h
  // The ray must also clear the inner edge of the wall, which sits `wall` metres behind the outer one.
  const shiftA = (room.wall * st) / sn
  const shiftB = (room.wall * sz) / sn
  const a0 = Math.max(0, shiftA)
  const a1 = Math.min(win.w, win.w + shiftA)
  const b0 = Math.max(win.sill, win.sill + shiftB, minHeight)
  const b1 = Math.min(top, top + shiftB)
  if (a1 - a0 < 1e-6 || b1 - b0 < 1e-6) return { pieces: [], frame, sn, st, sz }
  let pieces = [rect(a0, b0, a1, b1)]

  const shadows = []
  const { eave, across } = win
  if (eave.depth > 0) {
    const zE = top + eave.gap
    const reach = zE - (eave.depth * sz) / sn
    const k = st / sz
    const lo = (b) => -eave.ext - (zE - b) * k
    const hi = (b) => win.w + eave.ext - (zE - b) * k
    shadows.push([[lo(reach), reach], [hi(reach), reach], [hi(zE), zE], [lo(zE), zE]])
  }
  if (across) {
    const limit = across.height - (across.distance * sz) / sn
    shadows.push(rect(-BIG, -BIG, BIG, limit))
  }
  const rail = balconyPrism(room, win)
  const casters = rail ? [rail, ...prisms] : prisms
  const box = [a0, b0, a1, b1]
  for (const prism of casters) {
    const shadow = prismShadow(room, win, frame, s, prism)
    if (shadow && overlaps(shadow, box)) shadows.push(shadow)
  }
  for (const shadow of shadows) pieces = pieces.flatMap((p) => subtractConvex(p, shadow))
  return { pieces, frame, sn, st, sz }
}

/** Outer face point for opening coordinates (a, b). */
function outerPoint(room, win, frame, a, b) {
  const along = win.pos + a
  return [frame.o[0] + frame.t[0] * along + frame.n[0] * room.wall, frame.o[1] + frame.t[1] * along + frame.n[1] * room.wall, b]
}

/** Slide a point along the sun ray, away from the sun, by tau metres of ray length per unit sun height. */
const along = (p, s, tau) => [p[0] - tau * s[0], p[1] - tau * s[1], p[2] - tau * s[2]]

/**
 * The sunlit patches of one window.
 * @returns {{floor: number[][][], walls: {wall:string, poly:number[][]}[], opening: number[][][]}}
 *   floor patches are [x, y] polygons at height planeZ. wall patches are [x, y, z] polygons.
 */
export function windowPatches(room, win, s, { planeZ = 0, walls = true, obstacles = [] } = {}) {
  const whole = litOpening(room, win, s, 0, obstacles)
  const { frame, sz } = whole
  const out = { floor: [], walls: [], opening: whole.pieces }
  if (!whole.pieces.length) return out
  const clipRoom = rect(0, 0, room.w, room.d)
  // light that arrives below the plane never reaches it, but it still lights the walls
  const above = planeZ > 0 ? litOpening(room, win, s, planeZ, obstacles).pieces : whole.pieces
  const outer = (piece) => piece.map(([a, b]) => outerPoint(room, win, frame, a, b))

  for (const piece of above) {
    const onPlane = outer(piece).map((p) => along(p, s, (p[2] - planeZ) / sz))
    const poly = clipConvex(onPlane.map((p) => [p[0], p[1]]), clipRoom)
    if (poly.length) out.floor.push(poly)
  }
  if (!walls) return out

  for (const piece of whole.pieces) {
    const points = outer(piece)
    for (const wall of WALLS) {
      if (wall === win.wall) continue
      const { axis, side } = SIDE_PLANES[wall]
      const c = side === 'max' ? (axis === 0 ? room.w : room.d) : 0
      const taus = points.map((p) => (p[axis] - c) / s[axis])
      // a window that meets this wall at a corner has vertices on its plane, at distance zero
      if (!taus.every((t) => t >= -1e-9)) continue
      const hit = points.map((p, i) => along(p, s, taus[i]))
      const u = axis === 0 ? 1 : 0
      const length = axis === 0 ? room.d : room.w
      const flat = clipConvex(hit.map((p) => [p[u], p[2]]), rect(0, 0, length, room.h))
      if (!flat.length) continue
      out.walls.push({ wall, poly: flat.map(([x, z]) => (axis === 0 ? [c, x, z] : [x, c, z])) })
    }
  }
  return out
}

/** Patches of every window for one sun position. `sun` is {azimuth, elevation} in degrees; elevation is the apparent one. */
export function scenePatches(scene, sun, options) {
  if (!(sun.elevation > 0)) return { floor: [], walls: [], windows: scene.windows.map(() => ({ floor: [], walls: [], opening: [] })) }
  const s = sunInRoom(scene, sun.azimuth, sun.elevation)
  const opts = { ...options, obstacles: sceneObstacles(scene) }
  const windows = scene.windows.map((win) => windowPatches(scene.room, win, s, opts))
  return {
    floor: windows.flatMap((w) => w.floor),
    walls: windows.flatMap((w) => w.walls),
    windows,
  }
}

/** Area in square metres covered by a list of patches, overlaps between windows counted once. */
export const totalArea = unionArea
