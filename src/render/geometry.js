// Small 2D helpers shared by the drawing code.

/** Convex hull of 2D points (Andrew's monotone chain). */
export function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper = []
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

export function pathOf(ctx, points) {
  ctx.beginPath()
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

export const lerp = (a, b, t) => a + (b - a) * t

export function mix(a, b, t) {
  const pa = hexToRgb(a)
  const pb = hexToRgb(b)
  return `rgb(${Math.round(lerp(pa[0], pb[0], t))}, ${Math.round(lerp(pa[1], pb[1], t))}, ${Math.round(lerp(pa[2], pb[2], t))})`
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** A colour along a list of hex stops, t in 0..1. */
export function ramp(stops, t) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const pa = hexToRgb(stops[i])
  const pb = hexToRgb(stops[i + 1])
  const f = x - i
  return [lerp(pa[0], pb[0], f), lerp(pa[1], pb[1], f), lerp(pa[2], pb[2], f)]
}
