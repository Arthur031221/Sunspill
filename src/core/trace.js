// Reading a room off a floor plan picture or a photo. The picture stays in the
// browser: these functions only do the arithmetic on points the user taps.

import { wallFrame, WALLS, LIMITS } from './room.js'

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1]
const len = (a) => Math.hypot(a[0], a[1])

/** Pixels per metre from two points on the picture and the real distance between them. */
export function scaleFromPoints(p1, p2, metres) {
  const px = len(sub(p2, p1))
  if (!(px > 1e-6) || !(metres > 0)) return null
  return px / metres
}

/**
 * A rectangular room from three taps: two ends of one wall (a to b) and any
 * point on the opposite wall (c). The picture has y growing down; the room has
 * y growing up. The first wall becomes the bottom wall, read left to right, and
 * the room extends to the side c is on, so a tap order that goes round the
 * room either way gives the same room.
 * @returns {{w:number, d:number, toRoom:(p:number[])=>number[], toPicture:(q:number[])=>number[], corners:number[][], turn:number}|null}
 *   turn is the angle in degrees of the bottom wall on the picture, 0 when it runs left to right.
 */
export function rectFromCorners(a, b, c, pxPerMetre) {
  if (!(pxPerMetre > 0)) return null
  // work with y up
  const A = [a[0], -a[1]]
  const B = [b[0], -b[1]]
  const C = [c[0], -c[1]]
  const ab = sub(B, A)
  const width = len(ab)
  if (width < 1e-6) return null
  let u = [ab[0] / width, ab[1] / width]
  let origin = A
  let v = [-u[1], u[0]]
  const side = dot(sub(C, A), v)
  if (Math.abs(side) < 1e-6) return null
  if (side < 0) {
    origin = B
    u = [-u[0], -u[1]]
    v = [-u[1], u[0]]
  }
  const depth = Math.abs(side)
  const toRoom = (p) => {
    const q = sub([p[0], -p[1]], origin)
    return [dot(q, u) / pxPerMetre, dot(q, v) / pxPerMetre]
  }
  const toPicture = (q) => {
    const x = origin[0] + (u[0] * q[0] + v[0] * q[1]) * pxPerMetre
    const y = origin[1] + (u[1] * q[0] + v[1] * q[1]) * pxPerMetre
    return [x, -y]
  }
  const w = width / pxPerMetre
  const d = depth / pxPerMetre
  return { w, d, toRoom, toPicture, corners: [[0, 0], [w, 0], [w, d], [0, d]].map(toPicture), turn: (Math.atan2(u[1], u[0]) * 180) / Math.PI }
}

/**
 * The opening two taps on a wall describe: which wall, where it starts and how wide.
 * `tolerance` is how far from a wall line (metres) both taps may be, so a tap
 * beside the picture of a wall still counts.
 */
export function openingFromTaps(room, p, q, tolerance = 0.6) {
  let best = null
  for (const wall of WALLS) {
    const f = wallFrame(room, wall)
    const dist = (pt) => Math.abs((pt[0] - f.o[0]) * f.n[0] + (pt[1] - f.o[1]) * f.n[1])
    const along = (pt) => (pt[0] - f.o[0]) * f.t[0] + (pt[1] - f.o[1]) * f.t[1]
    const cost = dist(p) + dist(q)
    if (dist(p) > tolerance || dist(q) > tolerance) continue
    if (!best || cost < best.cost) best = { wall, cost, a: along(p), b: along(q), length: f.length }
  }
  if (!best) return null
  const lo = Math.max(0, Math.min(best.a, best.b))
  const hi = Math.min(best.length, Math.max(best.a, best.b))
  if (hi - lo < LIMITS.window.w[0]) return null
  return { wall: best.wall, pos: lo, w: hi - lo }
}

// ---------------------------------------------------------------- homography

/** Solve an n by n system by Gaussian elimination with partial pivoting. */
function solve(m, rhs) {
  const n = rhs.length
  const a = m.map((row, i) => [...row, rhs[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r
    if (Math.abs(a[p][c]) < 1e-12) return null
    ;[a[c], a[p]] = [a[p], a[c]]
    for (let r = c + 1; r < n; r++) {
      const k = a[r][c] / a[c][c]
      for (let j = c; j <= n; j++) a[r][j] -= k * a[c][j]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r][n]
    for (let j = r + 1; j < n; j++) s -= a[r][j] * x[j]
    x[r] = s / a[r][r]
  }
  return x
}

/** The 3 by 3 projective map that takes four points src to four points dst, or null when three of them are in line. */
export function homography(src, dst) {
  const rows = []
  const rhs = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const [u, v] = dst[i]
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    rhs.push(u)
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    rhs.push(v)
  }
  const h = solve(rows, rhs)
  return h ? [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]] : null
}

export function applyHomography(H, [x, y]) {
  const w = H[2][0] * x + H[2][1] * y + H[2][2]
  return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w]
}

export function invert3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-18) return null
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ]
}

/**
 * Lay a photo of the floor flat as seen from above. `corners` are the four
 * floor corners of the room tapped on the photo, in the order of the room
 * corners (left and bottom first, then counter clockwise). The result is an
 * RGBA image of `width` by `height` pixels, with transparent pixels where the
 * photo does not reach.
 * @param photo {{data:Uint8ClampedArray, width:number, height:number}}
 */
export function flattenPhoto(photo, corners, room, width, height) {
  const plan = [[0, 0], [width, 0], [width, height], [0, height]] // top left of the image is room (0, d)
  const floor = [[0, room.d], [room.w, room.d], [room.w, 0], [0, 0]]
  const toPhoto = homography(plan, [corners[3], corners[2], corners[1], corners[0]])
  void floor
  if (!toPhoto) return null
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = applyHomography(toPhoto, [x + 0.5, y + 0.5])
      const fx = sx - 0.5
      const fy = sy - 0.5
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      if (x0 < 0 || y0 < 0 || x0 + 1 >= photo.width || y0 + 1 >= photo.height || !Number.isFinite(fx)) continue
      const tx = fx - x0
      const ty = fy - y0
      const o = (y * width + x) * 4
      for (let ch = 0; ch < 3; ch++) {
        const p = (xx, yy) => photo.data[(yy * photo.width + xx) * 4 + ch]
        out[o + ch] = p(x0, y0) * (1 - tx) * (1 - ty) + p(x0 + 1, y0) * tx * (1 - ty) + p(x0, y0 + 1) * (1 - tx) * ty + p(x0 + 1, y0 + 1) * tx * ty
      }
      out[o + 3] = 255
    }
  }
  return { data: out, width, height }
}
