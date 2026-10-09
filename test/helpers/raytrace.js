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

/** Is the point (x, y, z) inside the room open to the sun direction s ([x, y, z], toward the sun)? */
export function isLit(room, windows, s, [x, y, z]) {
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
    return true
  }
  return false
}

/** A wall point is lit when the sun is on the room side of it and the ray out gets through a window. */
export function isWallLit(room, windows, s, wall, [u, z]) {
  const plane = WALL_PLANES.find((p) => p.wall === wall)
  if (s[plane.axis] * plane.outward >= -1e-9) return false
  const point = plane.axis === 0 ? [plane.at(room), u, z] : [u, plane.at(room), z]
  const eps = 1e-7
  const inside = [point[0] - eps * plane.outward * (plane.axis === 0), point[1] - eps * plane.outward * (plane.axis === 1), point[2]]
  return isLit(room, windows, s, inside)
}
