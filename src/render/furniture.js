// Furniture as a few real parts instead of one box: a bed has legs, a frame,
// a headboard, a mattress, a duvet and pillows, and a desk has a top and legs.
// Every part is a box in the piece's own axes (u across its width, v from the
// front to the back, z up), so a piece of any size and turn draws the same way.
// The light code still treats the piece as one box of its full height.

import { pathOf, mix } from './geometry.js'

const clampTo = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

/** Each part is [u0, u1, v0, v1, z0, z1, material], with v = 0 at the front. */
export function pieceParts(kind, w, d, h) {
  const leg = clampTo(Math.min(w, d) * 0.06, 0.03, 0.06)
  const legs = (top, mat, inset = 0.02) => [
    [inset, inset + leg, inset, inset + leg, 0, top, mat],
    [w - inset - leg, w - inset, inset, inset + leg, 0, top, mat],
    [inset, inset + leg, d - inset - leg, d - inset, 0, top, mat],
    [w - inset - leg, w - inset, d - inset - leg, d - inset, 0, top, mat],
  ]
  switch (kind) {
    case 'bed': {
      const head = Math.min(0.08, d * 0.05)
      const frameTop = h * 0.62
      const pillowD = Math.min(0.42, d * 0.22)
      const duvetEnd = d - head - pillowD - 0.08
      const gap = w > 1.1 ? 0.06 : 0
      const pw = w > 1.1 ? (w - 0.24 - gap) / 2 : w - 0.2
      const pillows = w > 1.1
        ? [[0.12, 0.12 + pw, d - head - pillowD - 0.04, d - head - 0.04, h, h + 0.11, 'pillow'],
            [0.12 + pw + gap, w - 0.12, d - head - pillowD - 0.04, d - head - 0.04, h, h + 0.11, 'pillow']]
        : [[0.1, w - 0.1, d - head - pillowD - 0.04, d - head - 0.04, h, h + 0.11, 'pillow']]
      return [
        ...legs(h * 0.24, 'woodDark', 0.04),
        [0, w, 0, d - head, h * 0.24, frameTop, 'wood'],
        [0.03, w - 0.03, 0.03, d - head - 0.02, frameTop, h, 'linen'],
        [0, w, 0, Math.max(0.3, duvetEnd), frameTop - 0.04, h + 0.035, 'duvet'],
        [0, w, Math.max(0.3, duvetEnd) - 0.14, Math.max(0.3, duvetEnd), h + 0.035, h + 0.06, 'duvetFold'],
        ...pillows,
        [0, w, d - head, d, 0, Math.min(1.05, h + 0.5), 'wood'],
      ]
    }
    case 'desk': {
      const top = 0.035
      const drawer = Math.min(0.42, w * 0.35)
      return [
        ...legs(h - top, 'metal'),
        [w - drawer - 0.03, w - 0.03, 0.04, d - 0.04, h - top - 0.16, h - top, 'woodDark'],
        [0, w, 0, d, h - top, h, 'wood'],
      ]
    }
    case 'table': {
      const top = 0.04
      return [...legs(h - top, 'woodDark', 0.06), [0, w, 0, d, h - top, h, 'wood']]
    }
    case 'sofa': {
      const arm = Math.min(0.2, w * 0.1)
      const back = Math.min(0.24, d * 0.28)
      const seat = Math.min(0.46, h * 0.58)
      const n = w - 2 * arm > 1.3 ? 2 : 1
      const cw = (w - 2 * arm - (n - 1) * 0.02) / n
      const cushions = Array.from({ length: n }, (_, i) =>
        [arm + i * (cw + 0.02), arm + i * (cw + 0.02) + cw, 0.02, d - back, seat - 0.1, seat, 'cushion'])
      return [
        ...legs(0.08, 'woodDark', 0.05),
        [0, w, 0, d, 0.08, seat - 0.1, 'fabric'],
        ...cushions,
        [arm, w - arm, d - back, d, seat - 0.1, h, 'fabric'],
        [arm + 0.06, w - arm - 0.06, d - back - 0.1, d - back, seat, h - 0.1, 'cushion'],
        [0, arm, 0, d, 0.08, Math.min(h - 0.12, seat + 0.18), 'fabric'],
        [w - arm, w, 0, d, 0.08, Math.min(h - 0.12, seat + 0.18), 'fabric'],
      ]
    }
    case 'shelf': {
      const t = 0.025
      const boards = Math.max(2, Math.round(h / 0.42))
      const parts = [
        [0, w, d - 0.015, d, 0, h, 'woodDark'],
        [0, t, 0, d, 0, h, 'wood'],
        [w - t, w, 0, d, 0, h, 'wood'],
      ]
      const books = ['bookA', 'bookB', 'bookC', 'bookD']
      for (let i = 0; i <= boards; i++) {
        const z = i === boards ? h - t : (i * h) / boards
        parts.push([t, w - t, 0, d - 0.015, z, z + t, 'wood'])
        if (i === boards) continue
        // a row of books on each board, leaving a gap at the end
        let u = t + 0.02
        let k = i
        const room = (h / boards) - t - 0.04
        while (u < w - t - 0.12) {
          const bw = 0.03 + ((k * 7) % 4) * 0.008
          const bh = room * (0.62 + ((k * 5) % 4) * 0.09)
          parts.push([u, u + bw, d * 0.18, d - 0.03, z + t, z + t + bh, books[k % 4]])
          u += bw + 0.004
          k++
          if ((k + i) % 9 === 0) u += 0.08
        }
      }
      return parts
    }
    case 'box': {
      // a low chest of drawers
      const rows = h > 0.5 ? 3 : 2
      const parts = [[0, w, 0.02, d, 0.05, h - 0.03, 'woodDark'], [0, w, 0, d, h - 0.03, h, 'wood'],
        [0.04, 0.08, 0.06, 0.1, 0, 0.05, 'woodDark'], [w - 0.08, w - 0.04, 0.06, 0.1, 0, 0.05, 'woodDark']]
      const fh = (h - 0.12) / rows
      for (let i = 0; i < rows; i++) {
        const z0 = 0.06 + i * fh + 0.012
        parts.push([0.03, w - 0.03, 0, 0.02, z0, z0 + fh - 0.024, 'wood'])
        parts.push([w / 2 - 0.07, w / 2 + 0.07, -0.012, 0, z0 + fh / 2 - 0.022, z0 + fh / 2 - 0.004, 'metal'])
      }
      return parts
    }
    default:
      return [[0, w, 0, d, 0, h, 'wood']]
  }
}

const FACES = [
  // [corner a, corner b, normal in piece axes]
  [0, 1, [0, -1]],
  [1, 2, [1, 0]],
  [2, 3, [0, 1]],
  [3, 0, [-1, 0]],
]

/** Draws the parts of one piece, far ones first, then the sun patches on its top. */
export function drawPiece(ctx, cam, item, pal, lit, fillLit) {
  const mats = pal.materials
  const cx = item.x + item.w / 2
  const cy = item.y + item.d / 2
  const r = ((item.rot || 0) * Math.PI) / 180
  const cs = Math.cos(r)
  const sn = Math.sin(r)
  const toRoom = (u, v) => {
    const a = u - item.w / 2
    const b = v - item.d / 2
    return [cx + a * cs - b * sn, cy + a * sn + b * cs]
  }
  const parts = pieceParts(item.kind, item.w, item.d, item.h).map((p) => {
    const [u0, u1, v0, v1, z0, z1, mat] = p
    const base = [toRoom(u0, v0), toRoom(u1, v0), toRoom(u1, v1), toRoom(u0, v1)]
    const mid = toRoom((u0 + u1) / 2, (v0 + v1) / 2)
    return { base, box: [u0, u1, v0, v1], z0, z1, mat, depth: cam.depth(mid[0], mid[1], 0), above: z0 >= item.h - 0.001 }
  })
  const under = paintOrder(parts.filter((p) => !p.above))
  const over = paintOrder(parts.filter((p) => p.above))
  under.forEach((p) => drawBox(ctx, cam, p, mats, cs, sn))
  if (lit?.length) {
    // the light code sees one box of the full height, so its patch belongs on the parts whose top is at that height
    const tops = parts.filter((p) => Math.abs(p.z1 - item.h) < 0.05).map((p) => p.base.map(([x, y]) => cam.project(x, y, item.h)))
    if (tops.length) {
      ctx.save()
      ctx.beginPath()
      for (const t of tops) t.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.clip()
      fillLit(lit)
      ctx.restore()
    }
  }
  over.forEach((p) => drawBox(ctx, cam, p, mats, cs, sn))
}

const overlaps = (a, b) => a.box[0] < b.box[1] - 1e-6 && b.box[0] < a.box[1] - 1e-6 && a.box[2] < b.box[3] - 1e-6 && b.box[2] < a.box[3] - 1e-6

/** Far parts first, but a part that sits on another is never drawn before it. */
function paintOrder(parts) {
  const left = parts.slice()
  const out = []
  const farthest = (list) => list.reduce((a, b) => (b.depth > a.depth ? b : a))
  while (left.length) {
    // take the farthest part, but if something it rests on is still waiting, draw that first
    let pick = farthest(left)
    for (let guard = 0; guard < parts.length; guard++) {
      const below = left.filter((q) => q !== pick && q.z1 <= pick.z0 + 1e-6 && overlaps(pick, q))
      if (!below.length) break
      pick = farthest(below)
    }
    out.push(pick)
    left.splice(left.indexOf(pick), 1)
  }
  return out
}

function drawBox(ctx, cam, part, mats, cs, sn) {
  const colour = mats[part.mat] || mats.wood
  const { base, z0, z1 } = part
  for (const [a, b, n0] of FACES) {
    const n = [n0[0] * cs - n0[1] * sn, n0[0] * sn + n0[1] * cs]
    if (cam.isBackWall(n[0], n[1])) continue
    const side = Math.abs(n[0]) > Math.abs(n[1]) ? 0.62 : 0.8
    ctx.fillStyle = mix(colour, '#1a140c', 1 - side)
    pathOf(ctx, [cam.project(base[a][0], base[a][1], z0), cam.project(base[b][0], base[b][1], z0),
      cam.project(base[b][0], base[b][1], z1), cam.project(base[a][0], base[a][1], z1)])
    ctx.fill()
  }
  const top = base.map(([x, y]) => cam.project(x, y, z1))
  ctx.fillStyle = colour
  pathOf(ctx, top)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.13)'
  ctx.lineWidth = 0.8
  ctx.stroke()
}
