// A deliberately different way to find the lit floor: start at a floor point,
// follow the ray toward the sun through the solid room, the wall thickness,
// the eave and the building opposite, and ask whether it gets out through a
// window. It shares no code with src/core/light.js.

import { wallFrame } from '../../src/core/room.js'

const WALL_PLANES = [
  { wall: 'left', axis: 0, at: (r) => 0, outward: -1 },
  { wall: 'right', axis: 0, at: (r) => r.w, outward: 1 },
  { wall: 'bottom', axis: 1, at: (r) => 0, outward: -1 },
  { wall: 'top', axis: 1, at: (r) => r.d, outward: 1 },
]

const side = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])

/** Even odd test: is the point inside a polygon of any shape? */
function pip(ring, [x, y]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Does the ray p + tau * s (tau > 0) pass through the solid made by lifting a
 * polygon of any shape between two heights? The horizontal track of the ray is
 * cut at every edge of the polygon; each stretch between cuts is inside or
 * outside, and a stretch that is inside is solid where the ray height is
 * between the two levels.
 */
export function rayHitsPrism(p, s, ring, z0, z1) {
  const hs = [s[0], s[1]]
  const cuts = [0]
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const e = [b[0] - a[0], b[1] - a[1]]
    const denom = hs[0] * e[1] - hs[1] * e[0]
    if (Math.abs(denom) < 1e-14) continue
    const ap = [a[0] - p[0], a[1] - p[1]]
    const tau = (ap[0] * e[1] - ap[1] * e[0]) / denom
    const u = (ap[0] * hs[1] - ap[1] * hs[0]) / denom
    if (u >= 0 && u < 1 && tau > 0) cuts.push(tau)
  }
  cuts.sort((x, y) => x - y)
  for (let i = 0; i + 1 < cuts.length; i++) {
    if (cuts[i + 1] - cuts[i] < 1e-12) continue
    const mid = (cuts[i] + cuts[i + 1]) / 2
    if (!pip(ring, [p[0] + mid * hs[0], p[1] + mid * hs[1]])) continue
    const lo = p[2] + cuts[i] * s[2]
    const hi = p[2] + cuts[i + 1] * s[2]
    if (Math.max(lo, z0) < Math.min(hi, z1)) return true
  }
  return false
}

/** The thin solid rail of a balcony, written out from the window's own numbers. */
export function railCaster(room, win) {
  const b = win.balcony
  if (!b || b.rail < 0.05) return null
  const f = wallFrame(room, win.wall)
  const at = (u, v) => [f.o[0] + f.t[0] * u + f.n[0] * v, f.o[1] + f.t[1] * u + f.n[1] * v]
  const v0 = room.wall + b.depth
  return { ring: [at(win.pos - b.ext, v0), at(win.pos + win.w + b.ext, v0), at(win.pos + win.w + b.ext, v0 + 0.1), at(win.pos - b.ext, v0 + 0.1)], z0: -0.3, z1: b.rail }
}

/**
 * Buildings and trees as written in a scene (metres east and north of the room
 * centre, heights above the ground), turned into the room's own axes through
 * compass bearings and not through the scene helpers.
 */
export function casterRings(scene) {
  const lift = (scene.floor.n - 1) * scene.floor.storey
  const toRoom = (e, n) => {
    const rho = Math.hypot(e, n)
    const bearing = Math.atan2(e, n) - (scene.facing * Math.PI) / 180
    return [scene.room.w / 2 + rho * Math.sin(bearing), scene.room.d / 2 + rho * Math.cos(bearing)]
  }
  const out = []
  for (const o of scene.obstacles) {
    if (!o.on) continue
    if (o.type === 'tree') {
      // the model stands a crown up as a twelve sided prism with a circumradius 2 percent over the crown radius
      const ring = Array.from({ length: 12 }, (_, i) => toRoom(o.x + 1.02 * o.r * Math.cos((i * Math.PI) / 6), o.y + 1.02 * o.r * Math.sin((i * Math.PI) / 6)))
      out.push({ ring, z0: o.base - lift, z1: o.h - lift, tree: true })
    } else {
      out.push({ ring: o.ring.map(([e, n]) => toRoom(e, n)), z0: o.base - lift, z1: o.h - lift })
    }
  }
  return out
}

/** Is the point (x, y, z) inside the room open to the sun direction s ([x, y, z], toward the sun)? `casters` are {ring, z0, z1} in room metres. */
export function isLit(room, windows, s, [x, y, z], casters = []) {
  let best = { t: (room.h - z) / s[2], wall: null }
  for (const p of WALL_PLANES) {
    const v = s[p.axis]
    if (v * p.outward <= 1e-12) continue
    const t = (p.at(room) - [x, y][p.axis]) / v
    if (t > 1e-9 && t < best.t) best = { t, wall: p.wall }
  }
  if (!best.wall) return false
  const exit = [x + best.t * s[0], y + best.t * s[1], z + best.t * s[2]]
  for (const win of windows) {
    if (win.wall !== best.wall) continue
    const f = wallFrame(room, win.wall)
    const sn = s[0] * f.n[0] + s[1] * f.n[1]
    const st = s[0] * f.t[0] + s[1] * f.t[1]
    // the model does not trace beams within about a degree of running along the wall
    if (sn < 0.02) continue
    // position along the wall measured from the window's left edge, at the inner face
    const a = (exit[0] - f.o[0]) * f.t[0] + (exit[1] - f.o[1]) * f.t[1] - win.pos
    const b = exit[2]
    if (a < 0 || a > win.w || b < win.sill || b > win.sill + win.h) continue
    // keep going to the outer face of the wall
    const run = room.wall / sn
    const ao = a + run * st
    const bo = b + run * s[2]
    if (ao < 0 || ao > win.w || bo < win.sill || bo > win.sill + win.h) continue
    const top = win.sill + win.h
    if (win.eave.depth > 0) {
      const zE = top + win.eave.gap
      const v = ((zE - bo) / s[2]) * sn
      const aE = ao + ((zE - bo) / s[2]) * st
      if (v > 0 && v <= win.eave.depth && aE >= -win.eave.ext && aE <= win.w + win.eave.ext) continue
    }
    if (win.across) {
      const zAcross = bo + (win.across.distance / sn) * s[2]
      if (zAcross < win.across.height) continue
    }
    // the ray leaves the outer face here and runs on toward the sun
    const outer = [f.o[0] + f.t[0] * (win.pos + ao) + f.n[0] * room.wall, f.o[1] + f.t[1] * (win.pos + ao) + f.n[1] * room.wall, bo]
    const rail = railCaster(room, win)
    if (rail && rayHitsPrism(outer, s, rail.ring, rail.z0, rail.z1)) continue
    if (casters.some((c) => rayHitsPrism(outer, s, c.ring, c.z0, c.z1))) continue
    return true
  }
  return false
}

/** A wall point is lit when the sun is on the room side of it and the ray out gets through a window. */
export function isWallLit(room, windows, s, wall, [u, z], casters = []) {
  const plane = WALL_PLANES.find((p) => p.wall === wall)
  if (s[plane.axis] * plane.outward >= -1e-9) return false
  const point = plane.axis === 0 ? [plane.at(room), u, z] : [u, plane.at(room), z]
  const eps = 1e-7
  const inside = [point[0] - eps * plane.outward * (plane.axis === 0), point[1] - eps * plane.outward * (plane.axis === 1), point[2]]
  return isLit(room, windows, s, inside, casters)
}
