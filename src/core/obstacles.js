// Buildings, trees and balcony rails as shadow casters.
//
// Every caster is a convex prism: a convex footprint in room metres between a
// bottom and a top height. A point of a window's outer face is in shadow when
// the ray from it toward the sun enters a prism. Only the part of the prism in
// front of the wall matters, and carrying that part along the sun rays onto
// the window plane gives the shadow it throws there. The carrying is linear,
// so the shadow of a convex prism is the convex hull of its carried corners.
// light.js subtracts that hull from the lit opening, the same way it does for
// an eave.

import { clipHalf, signedArea, dedupe, area, selfCrossing } from './poly.js'
import { wallFrame, localToRoom, floorLift } from './room.js'

const FRONT = 1e-6

/** Which side of the directed line a to b the point p lies on: positive is left. */
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])

/** Convex hull, counter clockwise, of a set of 2D points. */
export function hullOf(points) {
  const pts = points.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const keep = (list, p) => {
    while (list.length >= 2 && cross(list[list.length - 2], list[list.length - 1], p) <= 0) list.pop()
    list.push(p)
  }
  const lower = []
  for (const p of pts) keep(lower, p)
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) keep(upper, pts[i])
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

const isConvex = (poly) => {
  for (let i = 0; i < poly.length; i++) if (cross(poly[i], poly[(i + 1) % poly.length], poly[(i + 2) % poly.length]) < -1e-9) return false
  return true
}

/** True when p lies inside the triangle abc (counter clockwise), edges included. */
const inTriangle = (a, b, c, p) => cross(a, b, p) >= -1e-12 && cross(b, c, p) >= -1e-12 && cross(c, a, p) >= -1e-12

/** Split a simple polygon into triangles by ear clipping, or null when it has no ears (a self crossing outline). */
function triangulate(ring) {
  const idx = ring.map((_, i) => i)
  const tris = []
  let guard = ring.length * ring.length
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length]
      const i1 = idx[k]
      const i2 = idx[(k + 1) % idx.length]
      const [a, b, c] = [ring[i0], ring[i1], ring[i2]]
      const turn = cross(a, b, c)
      if (Math.abs(turn) < 1e-12) {
        idx.splice(k, 1) // a straight run adds nothing
        clipped = true
        break
      }
      if (turn < 0) continue
      if (idx.some((j) => j !== i0 && j !== i1 && j !== i2 && inTriangle(a, b, c, ring[j]))) continue
      tris.push([i0, i1, i2])
      idx.splice(k, 1)
      clipped = true
      break
    }
    if (!clipped) return null
  }
  if (idx.length === 3) tris.push(idx.slice())
  return tris
}

/**
 * Cover a footprint with convex polygons. A convex footprint comes back whole.
 * A simple concave one is triangulated and neighbours are merged back while the
 * result stays convex (Hertel and Mehlhorn). An outline that crosses itself
 * cannot be triangulated and is replaced by its hull, which can only add shade.
 */
export function convexParts(ring) {
  let poly = dedupe(ring)
  if (poly.length < 3) return []
  // an outline that crosses itself has no inside to cut up, and its signed area can cancel to nothing
  if (selfCrossing(poly)) {
    const hull = hullOf(poly)
    return hull.length >= 3 && area(hull) > 1e-9 ? [hull] : []
  }
  if (signedArea(poly) < 0) poly = poly.slice().reverse()
  if (area(poly) < 1e-9) return []
  if (isConvex(poly)) return [poly]
  const tris = triangulate(poly)
  if (!tris) return [hullOf(poly)]
  // each part is a list of ring indices; two parts that share an edge merge when the union is convex
  let parts = tris.map((t) => t.slice())
  let merged = true
  while (merged) {
    merged = false
    outer: for (let a = 0; a < parts.length; a++) {
      for (let b = a + 1; b < parts.length; b++) {
        const union = tryMerge(parts[a], parts[b], poly)
        if (union) {
          parts[a] = union
          parts.splice(b, 1)
          merged = true
          break outer
        }
      }
    }
  }
  return parts.map((p) => p.map((i) => poly[i])).filter((p) => p.length >= 3 && area(p) > 1e-9)
}

function tryMerge(pa, pb, ring) {
  for (let i = 0; i < pa.length; i++) {
    const u = pa[i]
    const v = pa[(i + 1) % pa.length]
    const j = pb.findIndex((x, k) => x === v && pb[(k + 1) % pb.length] === u)
    if (j < 0) continue
    // walk pa from v around to u, then pb from u's successor around to v's predecessor
    const out = []
    for (let k = 1; k <= pa.length; k++) out.push(pa[(i + k) % pa.length])
    for (let k = 2; k < pb.length; k++) out.push(pb[(j + k) % pb.length])
    const pts = out.map((x) => ring[x])
    const trimmed = out.filter((x, k) => Math.abs(cross(pts[(k + pts.length - 1) % pts.length], pts[k], pts[(k + 1) % pts.length])) > 1e-12)
    return isConvex(trimmed.map((x) => ring[x])) ? trimmed : null
  }
  return null
}

/** A tree crown as a twelve sided prism, one corner pointing east, whose area is within five percent of the circle. */
export function crownRing(x, y, r) {
  const R = r * 1.02
  return Array.from({ length: 12 }, (_, i) => [x + R * Math.cos((i * Math.PI) / 6), y + R * Math.sin((i * Math.PI) / 6)])
}

/**
 * The convex prisms of every switched on building and tree, in the room's own
 * metres, with heights counted from this room's floor. The result is kept for
 * as long as the scene object lives.
 */
const memo = new WeakMap()
export function sceneObstacles(scene) {
  let hit = memo.get(scene)
  if (hit) return hit
  const lift = floorLift(scene)
  hit = []
  for (const o of scene.obstacles || []) {
    if (!o.on) continue
    if (o.type === 'tree') {
      // the crown is laid out on the compass, so turning the room does not change its shape
      hit.push({ footprint: crownRing(o.x, o.y, o.r).map(([e, n]) => localToRoom(scene, e, n)), z0: o.base - lift, z1: o.h - lift })
      continue
    }
    const ring = o.ring.map(([e, n]) => localToRoom(scene, e, n))
    for (const part of convexParts(ring)) hit.push({ footprint: part, z0: o.base - lift, z1: o.h - lift })
  }
  memo.set(scene, hit)
  return hit
}

/** The solid part of a balcony rail in front of a window, as a thin prism. */
export function balconyPrism(room, win) {
  const b = win.balcony
  if (!b || b.rail < 0.05) return null
  const f = wallFrame(room, win.wall)
  const at = (u, v) => [f.o[0] + f.t[0] * u + f.n[0] * v, f.o[1] + f.t[1] * u + f.n[1] * v]
  const u0 = win.pos - b.ext
  const u1 = win.pos + win.w + b.ext
  const v0 = room.wall + b.depth
  const v1 = v0 + 0.1
  return { footprint: [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], z0: -0.3, z1: b.rail }
}

/**
 * The shadow one prism throws on the outer face of a window, as a convex polygon
 * in (along the wall from the window's left edge, height above the floor), or
 * null when the prism is behind the wall or the shadow is empty.
 * @param s unit vector toward the sun in room axes, already checked to be in front of the wall
 */
export function prismShadow(room, win, frame, s, prism) {
  const off = frame.n[0] * frame.o[0] + frame.n[1] * frame.o[1] + room.wall
  const front = clipHalf(prism.footprint, frame.n[0], frame.n[1], -(off + FRONT))
  if (front.length < 3) return null
  const sn = s[0] * frame.n[0] + s[1] * frame.n[1]
  const st = s[0] * frame.t[0] + s[1] * frame.t[1]
  const pts = []
  for (const q of front) {
    const dist = frame.n[0] * q[0] + frame.n[1] * q[1] - off
    const tau = dist / sn
    const a = frame.t[0] * (q[0] - frame.o[0]) + frame.t[1] * (q[1] - frame.o[1]) - tau * st - win.pos
    pts.push([a, prism.z0 - tau * s[2]], [a, prism.z1 - tau * s[2]])
  }
  const poly = hullOf(pts)
  return poly.length >= 3 ? poly : null
}
