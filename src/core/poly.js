// Convex polygon helpers on [x, y] vertex lists. Every polygon the light
// model produces is convex, so clipping and subtraction stay exact and small.

export const EPS = 1e-9

export const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

/** Signed area, positive when the vertices run counter clockwise. */
export function signedArea(p) {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    s += x0 * y1 - x1 * y0
  }
  return s / 2
}

export const area = (p) => Math.abs(signedArea(p))

export const ccw = (p) => (signedArea(p) < 0 ? p.slice().reverse() : p)

const hasLength = (p, q) => Math.abs(q[0] - p[0]) > 1e-12 || Math.abs(q[1] - p[1]) > 1e-12

export function centroid(p) {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    const f = x0 * y1 - x1 * y0
    a += f
    cx += (x0 + x1) * f
    cy += (y0 + y1) * f
  }
  if (Math.abs(a) < EPS) return p.length ? [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length] : [0, 0]
  return [cx / (3 * a), cy / (3 * a)]
}

/** Drop repeated vertices: a zero length edge has no direction, so it cannot be used to cut. */
export function dedupe(poly) {
  const out = []
  for (const p of poly) {
    const last = out[out.length - 1]
    if (!last || Math.abs(p[0] - last[0]) > 1e-12 || Math.abs(p[1] - last[1]) > 1e-12) out.push(p)
  }
  while (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) <= 1e-12 && Math.abs(out[0][1] - out[out.length - 1][1]) <= 1e-12) out.pop()
  return out
}

/** Keep the part of a polygon where a*x + b*y + c >= 0. */
export function clipHalf(poly, a, b, c) {
  const out = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % n]
    const fp = a * p[0] + b * p[1] + c
    const fq = a * q[0] + b * q[1] + c
    if (fp >= 0) out.push(p)
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq)
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
    }
  }
  return dedupe(out)
}

/** The half plane to the left of the directed edge p to q. */
const leftOf = (p, q) => [-(q[1] - p[1]), q[0] - p[0], (q[1] - p[1]) * p[0] - (q[0] - p[0]) * p[1]]

/** Intersection of two convex polygons. */
export function clipConvex(poly, clip) {
  const c = ccw(dedupe(clip))
  let out = dedupe(poly)
  for (let i = 0; i < c.length && out.length; i++) {
    if (!hasLength(c[i], c[(i + 1) % c.length])) continue
    const [a, b, k] = leftOf(c[i], c[(i + 1) % c.length])
    out = clipHalf(out, a, b, k)
  }
  return out.length >= 3 && area(out) > EPS ? out : []
}

/** poly minus hole, as a list of disjoint convex pieces. */
export function subtractConvex(poly, hole) {
  const h = ccw(dedupe(hole))
  if (h.length < 3 || area(h) < EPS) return [poly]
  const pieces = []
  let rest = dedupe(poly)
  for (let i = 0; i < h.length && rest.length; i++) {
    const [a, b, k] = leftOf(h[i], h[(i + 1) % h.length])
    const outside = clipHalf(rest, -a, -b, -k)
    if (outside.length >= 3 && area(outside) > EPS) pieces.push(outside)
    rest = clipHalf(rest, a, b, k)
  }
  return pieces
}

/** Area covered by a set of convex polygons that may overlap, each part counted once. */
export function unionArea(polys) {
  const pieces = []
  let total = 0
  for (const poly of polys) {
    let fresh = [poly]
    for (const old of pieces) {
      fresh = fresh.flatMap((f) => subtractConvex(f, old))
      if (!fresh.length) break
    }
    for (const f of fresh) {
      pieces.push(f)
      total += area(f)
    }
  }
  return total
}

/** True when the point is inside a convex polygon (either winding). */
export function insideConvex(poly, x, y) {
  const sign = signedArea(poly) < 0 ? -1 : 1
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    if (sign * ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])) < -EPS) return false
  }
  return true
}

const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))

/** True when two edges of a ring that do not share a corner cross each other. */
export function selfCrossing(ring) {
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      const c = ring[j]
      const d = ring[(j + 1) % n]
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true
    }
  }
  return false
}
