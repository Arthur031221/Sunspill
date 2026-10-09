// Snapping for things dragged around the plan: windows along their wall,
// furniture over the floor. A value within `tolerance` metres of a useful line
// (a wall, the middle of the room, the edge of a neighbour) jumps onto it, and
// the line is returned so the drawing can show why. Otherwise the value is
// rounded to a 5 cm grid.

import { wallFrame, itemFootprint, turnedExtent } from './room.js'

const GRID = 0.05
export const TOLERANCE = 0.09

const grid = (v) => Math.round(v / GRID) * GRID
const near = (value, candidates, tolerance) => {
  let best = null
  for (const c of candidates) {
    const d = Math.abs(c.at - value)
    if (d <= tolerance && (!best || d < best.d)) best = { ...c, d }
  }
  return best
}

/**
 * Where a window dragged along its wall comes to rest.
 * @returns {{pos:number, guide:string|null}} guide names what it snapped to: 'start', 'end', 'centre', 'window', 'door' or null
 */
export function snapWindow(scene, index, pos, tolerance = TOLERANCE) {
  const win = scene.windows[index]
  const length = wallFrame(scene.room, win.wall).length
  const candidates = [
    { at: 0, guide: 'start' },
    { at: length - win.w, guide: 'end' },
    { at: (length - win.w) / 2, guide: 'centre' },
  ]
  scene.windows.forEach((o, i) => {
    if (i === index || o.wall !== win.wall) return
    candidates.push({ at: o.pos + o.w, guide: 'window' }, { at: o.pos - win.w, guide: 'window' }, { at: o.pos, guide: 'window' })
  })
  for (const d of scene.doors || []) {
    if (d.wall !== win.wall) continue
    candidates.push({ at: d.pos + d.w, guide: 'door' }, { at: d.pos - win.w, guide: 'door' })
  }
  const hit = near(pos, candidates.filter((c) => c.at >= -1e-9 && c.at <= length - win.w + 1e-9), tolerance)
  const out = hit ? hit.at : grid(pos)
  return { pos: Math.min(Math.max(0, length - win.w), Math.max(0, out)), guide: hit ? hit.guide : null }
}

/**
 * Where a piece of furniture dragged over the floor comes to rest. x and y are
 * the corner of its unturned box, as stored; the box turns about its centre, so
 * snapping works on the edges of the turned box.
 * @returns {{x:number, y:number, guides:{axis:'x'|'y', at:number}[]}}
 */
export function snapItem(scene, index, x, y, tolerance = TOLERANCE) {
  const item = scene.items[index]
  const { room } = scene
  const [ex, ey] = turnedExtent(item.w, item.d, item.rot || 0)
  const cx = x + item.w / 2
  const cy = y + item.d / 2
  const xs = [
    { at: ex, line: 0, label: 'wall' },
    { at: room.w - ex, line: room.w, label: 'wall' },
    { at: room.w / 2, line: room.w / 2, label: 'centre' },
  ]
  const ys = [
    { at: ey, line: 0, label: 'wall' },
    { at: room.d - ey, line: room.d, label: 'wall' },
    { at: room.d / 2, line: room.d / 2, label: 'centre' },
  ]
  scene.items.forEach((o, i) => {
    if (i === index) return
    const box = itemFootprint(o)
    const [x0, x1] = [Math.min(...box.map((p) => p[0])), Math.max(...box.map((p) => p[0]))]
    const [y0, y1] = [Math.min(...box.map((p) => p[1])), Math.max(...box.map((p) => p[1]))]
    xs.push({ at: x1 + ex, line: x1, label: 'item' }, { at: x0 - ex, line: x0, label: 'item' }, { at: x0 + ex, line: x0, label: 'item' }, { at: x1 - ex, line: x1, label: 'item' })
    ys.push({ at: y1 + ey, line: y1, label: 'item' }, { at: y0 - ey, line: y0, label: 'item' }, { at: y0 + ey, line: y0, label: 'item' }, { at: y1 - ey, line: y1, label: 'item' })
  })
  const hx = near(cx, xs, tolerance)
  const hy = near(cy, ys, tolerance)
  const guides = []
  if (hx) guides.push({ axis: 'x', at: hx.line })
  if (hy) guides.push({ axis: 'y', at: hy.line })
  const nx = hx ? hx.at : grid(cx)
  const ny = hy ? hy.at : grid(cy)
  return { x: nx - item.w / 2, y: ny - item.d / 2, guides }
}

/**
 * Where a new piece of furniture goes: the free place on the floor nearest the
 * middle of the room, clear of every piece that is already there. When the
 * floor is full it goes in the middle anyway. `size` is its width and depth.
 * @returns {{x:number, y:number}} the corner of its box, as stored
 */
export function freeSpot(scene, size, gap = 0.05) {
  const { room } = scene
  const boxes = scene.items.map((o) => {
    const f = itemFootprint(o)
    return [Math.min(...f.map((p) => p[0])), Math.min(...f.map((p) => p[1])), Math.max(...f.map((p) => p[0])), Math.max(...f.map((p) => p[1]))]
  })
  const mid = { x: Math.max(0, (room.w - size.w) / 2), y: Math.max(0, (room.d - size.d) / 2) }
  const free = (x, y) => boxes.every(([x0, y0, x1, y1]) => x + size.w <= x0 - gap || x >= x1 + gap || y + size.d <= y0 - gap || y >= y1 + gap)
  if (free(mid.x, mid.y)) return mid
  let best = null
  for (let x = 0; x <= room.w - size.w + 1e-9; x += 0.1) {
    for (let y = 0; y <= room.d - size.d + 1e-9; y += 0.1) {
      if (!free(x, y)) continue
      const away = Math.hypot(x - mid.x, y - mid.y)
      if (!best || away < best.away) best = { x, y, away }
    }
  }
  return best ? { x: Math.round(best.x * 100) / 100, y: Math.round(best.y * 100) / 100 } : mid
}
