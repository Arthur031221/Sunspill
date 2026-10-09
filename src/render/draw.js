// Paints the room: floor, walls, windows, furniture, the light patches, the
// sun on its arc and the compass. Everything is orthographic, so a room point
// maps to the screen with one affine transform and the patches stay exact.

import { WALLS, wallFrame, sunInRoom, itemFootprint } from '../core/room.js'
import { hullOf } from '../core/obstacles.js'
import { hull, pathOf, mix } from './geometry.js'

const DOOR_HEIGHT = 2.05

const WALL_NORMALS = { top: [0, 1], right: [1, 0], bottom: [0, -1], left: [-1, 0] }
const QUAD = (x0, y0, x1, y1, z) => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]

function wallPoint(room, wall, u, z) {
  const f = wallFrame(room, wall)
  return [f.o[0] + f.t[0] * u, f.o[1] + f.t[1] * u, z]
}

const windowCorners = (room, win) => [
  wallPoint(room, win.wall, win.pos, win.sill),
  wallPoint(room, win.wall, win.pos + win.w, win.sill),
  wallPoint(room, win.wall, win.pos + win.w, win.sill + win.h),
  wallPoint(room, win.wall, win.pos, win.sill + win.h),
]

/**
 * Where the sun is drawn, in room metres: on the true direction line from the room
 * centre, pulled in when it is high so the whole sky stays on screen.
 */
export function sunPoint(scene, sun, radius) {
  const s = sunInRoom(scene, sun.azimuth, sun.elevation)
  const { room } = scene
  const r = Math.min(radius, (room.h * 0.9) / Math.max(s[2], 0.05))
  return [room.w / 2 + s[0] * r, room.d / 2 + s[1] * r, room.h * 0.35 + s[2] * r]
}

/** Radius of the sun's drawn path: wide in 3D, hugging the room in the plan view where only the bearing matters. */
export function arcRadius(room, pitch = 33) {
  const wide = Math.max(4.2, Math.max(room.w, room.d) * 0.9 + 0.8)
  const tight = Math.hypot(room.w, room.d) / 2 + 1
  const k = Math.min(1, Math.max(0, (pitch - 33) / 57))
  return wide + (tight - wide) * (k * k * (3 - 2 * k))
}

function fillSurface(ctx, pts, clip, pal, dpr, soft = 14) {
  ctx.save()
  if (clip) {
    pathOf(ctx, clip)
    ctx.clip()
  }
  ctx.shadowColor = pal.glow
  ctx.shadowBlur = soft * dpr
  ctx.fillStyle = pal.patch
  pathOf(ctx, pts)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.lineWidth = 1
  ctx.strokeStyle = pal.patchEdge
  ctx.globalAlpha = 0.55
  ctx.stroke()
  ctx.restore()
}

function drawFloor(ctx, cam, room, pal, frame) {
  const slab = 0.14
  const corners = QUAD(0, 0, room.w, room.d, 0).map((p) => cam.project(...p))
  // visible edges of the floor slab
  ctx.fillStyle = pal.slab
  for (const wall of WALLS) {
    const [nx, ny] = WALL_NORMALS[wall]
    if (cam.isBackWall(nx, ny)) continue
    const a = wallPoint(room, wall, 0, 0)
    const b = wallPoint(room, wall, wallFrame(room, wall).length, 0)
    pathOf(ctx, [cam.project(a[0], a[1], 0), cam.project(b[0], b[1], 0), cam.project(b[0], b[1], -slab), cam.project(a[0], a[1], -slab)])
    ctx.fill()
  }
  ctx.fillStyle = pal.floor
  pathOf(ctx, corners)
  ctx.fill()
  // plank lines, so the floor reads as a surface and the patch has something to land on
  ctx.save()
  pathOf(ctx, corners)
  ctx.clip()
  ctx.strokeStyle = pal.floorLine
  ctx.lineWidth = 1
  const gap = 0.5
  ctx.beginPath()
  for (let x = gap; x < room.w; x += gap) {
    const a = cam.project(x, 0, 0)
    const b = cam.project(x, room.d, 0)
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
  }
  ctx.stroke()
  ctx.restore()
  return corners
}

/** A picture laid on the floor, such as a photo flattened to a plan. */
function drawUnderlay(ctx, cam, room, underlay) {
  if (!underlay) return
  const o = cam.project(0, room.d, 0)
  const ex = cam.project(room.w, room.d, 0)
  const ey = cam.project(0, 0, 0)
  const { canvas } = underlay
  ctx.save()
  pathOf(ctx, QUAD(0, 0, room.w, room.d, 0).map((p) => cam.project(...p)))
  ctx.clip()
  ctx.transform((ex[0] - o[0]) / canvas.width, (ex[1] - o[1]) / canvas.width, (ey[0] - o[0]) / canvas.height, (ey[1] - o[1]) / canvas.height, o[0], o[1])
  ctx.globalAlpha = underlay.alpha ?? 0.8
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0)
  ctx.restore()
}

/** Lines the dragged piece snapped to. */
function drawGuides(ctx, cam, room, guides, pal) {
  if (!guides?.length) return
  ctx.save()
  ctx.strokeStyle = pal.selection
  ctx.lineWidth = 1.4
  ctx.setLineDash([6, 4])
  for (const g of guides) {
    const a = g.axis === 'x' ? cam.project(g.at, 0, 0) : cam.project(0, g.at, 0)
    const b = g.axis === 'x' ? cam.project(g.at, room.d, 0) : cam.project(room.w, g.at, 0)
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
  }
  ctx.restore()
}

/** The patches a person marked on the floor, saved ones dashed and the one in progress with its points. */
function drawMarks(ctx, cam, marks, pal) {
  if (!marks) return
  const outline = (pts) => pts.map(([x, y]) => cam.project(x, y, 0))
  ctx.save()
  ctx.lineJoin = 'round'
  for (const poly of marks.saved || []) {
    ctx.strokeStyle = pal.mark
    ctx.fillStyle = pal.name === 'dark' ? 'rgba(94, 234, 212, 0.14)' : 'rgba(15, 118, 110, 0.12)'
    ctx.lineWidth = 2
    ctx.setLineDash([7, 4])
    pathOf(ctx, outline(poly))
    ctx.fill()
    ctx.stroke()
  }
  const pts = marks.points || []
  if (pts.length >= 3) {
    ctx.strokeStyle = pal.mark
    ctx.fillStyle = pal.name === 'dark' ? 'rgba(94, 234, 212, 0.2)' : 'rgba(15, 118, 110, 0.18)'
    ctx.lineWidth = 2.4
    ctx.setLineDash([])
    pathOf(ctx, outline(hullOf(pts)))
    ctx.fill()
    ctx.stroke()
  }
  pts.forEach(([x, y], i) => {
    const [px, py] = cam.project(x, y, 0)
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(px, py, 9, 0, Math.PI * 2)
    ctx.fillStyle = pal.mark
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = `700 11px ${pal.ui}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), px, py + 0.5)
  })
  ctx.restore()
}

/** Real lengths along the walls of the plan: each window, door and the wall between them. */
function drawDimensions(ctx, cam, scene, pal, fmt) {
  const { room } = scene
  ctx.save()
  ctx.font = `600 11.5px ${pal.ui}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.strokeStyle = pal.muted
  ctx.fillStyle = pal.ink
  ctx.lineWidth = 1
  for (const wall of WALLS) {
    const f = wallFrame(room, wall)
    const spans = [
      ...scene.windows.filter((w) => w.wall === wall).map((w) => [w.pos, w.pos + w.w, true]),
      ...(scene.doors || []).filter((d) => d.wall === wall).map((d) => [d.pos, d.pos + d.w, true]),
    ].sort((a, b) => a[0] - b[0])
    const cuts = []
    let at = 0
    for (const [a, b, open] of spans) {
      cuts.push([at, a, false], [a, b, open])
      at = Math.max(at, b)
    }
    cuts.push([at, f.length, false])
    const lift = room.wall + 0.42
    const point = (u, v) => cam.project(f.o[0] + f.t[0] * u + f.n[0] * v, f.o[1] + f.t[1] * u + f.n[1] * v, 0)
    for (const [a, b, open] of cuts) {
      if (b - a < 0.12) continue
      const p = point(a, lift)
      const q = point(b, lift)
      ctx.globalAlpha = open ? 1 : 0.75
      ctx.beginPath()
      ctx.moveTo(p[0], p[1])
      ctx.lineTo(q[0], q[1])
      for (const u of [a, b]) {
        const t0 = point(u, lift - 0.1)
        const t1 = point(u, lift + 0.1)
        ctx.moveTo(t0[0], t0[1])
        ctx.lineTo(t1[0], t1[1])
      }
      ctx.stroke()
      const mid = point((a + b) / 2, lift + 0.32)
      ctx.lineWidth = 3
      ctx.strokeStyle = pal.name === 'dark' ? 'rgba(11, 15, 28, 0.85)' : 'rgba(255, 250, 240, 0.9)'
      ctx.strokeText(fmt(b - a), mid[0], mid[1])
      ctx.fillText(fmt(b - a), mid[0], mid[1])
      ctx.lineWidth = 1
      ctx.strokeStyle = pal.muted
    }
  }
  ctx.restore()
}

function drawHeat(ctx, cam, room, heat, dpr) {
  if (!heat) return
  const o = cam.project(0, 0, 0)
  const px = cam.project(1, 0, 0)
  const py = cam.project(0, 1, 0)
  ctx.save()
  pathOf(ctx, QUAD(0, 0, room.w, room.d, 0).map((p) => cam.project(...p)))
  ctx.clip()
  ctx.transform(px[0] - o[0], px[1] - o[1], py[0] - o[0], py[1] - o[1], o[0], o[1])
  ctx.scale(heat.grid.cx, heat.grid.cy)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.globalAlpha = heat.alpha ?? 1
  ctx.drawImage(heat.canvas, 0, 0)
  ctx.restore()
}

function drawWalls(ctx, cam, scene, pal, frame, hits) {
  const { room } = scene
  const plan = cam.pitch > 84
  const fade = Math.min(1, Math.max(0, (88 - cam.pitch) / 8))
  if (plan || fade < 1) drawPlanWalls(ctx, cam, scene, pal, frame, hits, 1 - fade)
  if (fade <= 0) return
  ctx.save()
  ctx.globalAlpha = fade
  WALLS.forEach((wall, wi) => {
    const [nx, ny] = WALL_NORMALS[wall]
    const f = wallFrame(room, wall)
    const poly = [wallPoint(room, wall, 0, 0), wallPoint(room, wall, f.length, 0), wallPoint(room, wall, f.length, room.h), wallPoint(room, wall, 0, room.h)].map((p) => cam.project(...p))
    const back = cam.isBackWall(nx, ny)
    if (back) {
      const g = ctx.createLinearGradient(poly[0][0], poly[0][1], poly[3][0], poly[3][1])
      g.addColorStop(0, pal.wall[wi % 2])
      g.addColorStop(1, mix(pal.wall[wi % 2], pal.bg, 0.35))
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = pal.wallGhost
    }
    pathOf(ctx, poly)
    ctx.fill()
    ctx.strokeStyle = pal.wallEdge
    ctx.lineWidth = back ? 1.4 : 1
    ctx.globalAlpha = fade * (back ? 1 : 0.55)
    ctx.stroke()
    ctx.globalAlpha = fade
    scene.windows.forEach((win, index) => {
      if (win.wall !== wall) return
      const quad = windowCorners(room, win).map((p) => cam.project(...p))
      hits.windows.push({ index, quad, back })
      const lit = frame.patches?.windows?.[index]?.opening?.length > 0
      if (back) {
        const g = ctx.createLinearGradient(quad[3][0], quad[3][1], quad[0][0], quad[0][1])
        g.addColorStop(0, pal.skyTop)
        g.addColorStop(1, pal.skyBottom)
        ctx.fillStyle = g
        pathOf(ctx, quad)
        ctx.fill()
        if (lit) {
          ctx.save()
          ctx.shadowColor = pal.glow
          ctx.shadowBlur = 22 * frame.dpr
          ctx.strokeStyle = pal.sun
          ctx.lineWidth = 2
          pathOf(ctx, quad)
          ctx.stroke()
          ctx.restore()
        }
      }
      ctx.strokeStyle = frame.selection?.type === 'window' && frame.selection.index === index ? pal.selection : pal.frame
      ctx.lineWidth = frame.selection?.type === 'window' && frame.selection.index === index ? 3 : back ? 2.2 : 1.4
      pathOf(ctx, quad)
      ctx.stroke()
      if (back) {
        // cross bar, so the opening reads as a window and not a hole
        ctx.lineWidth = 1.2
        ctx.beginPath()
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const t = mid(quad[3], quad[2])
        const b = mid(quad[0], quad[1])
        ctx.moveTo(t[0], t[1])
        ctx.lineTo(b[0], b[1])
        ctx.stroke()
      }
    })
    ;(scene.doors || []).forEach((door) => {
      if (door.wall !== wall) return
      const quad = [wallPoint(room, wall, door.pos, 0), wallPoint(room, wall, door.pos + door.w, 0), wallPoint(room, wall, door.pos + door.w, Math.min(room.h - 0.05, DOOR_HEIGHT)), wallPoint(room, wall, door.pos, Math.min(room.h - 0.05, DOOR_HEIGHT))].map((p) => cam.project(...p))
      ctx.fillStyle = pal.door
      pathOf(ctx, quad)
      ctx.fill()
      ctx.strokeStyle = pal.frame
      ctx.lineWidth = back ? 2 : 1.2
      ctx.stroke()
      if (back) {
        const knob = [quad[1][0] * 0.82 + quad[0][0] * 0.18, quad[1][1] * 0.82 + quad[0][1] * 0.18 + (quad[3][1] - quad[0][1]) * 0.45]
        ctx.fillStyle = pal.frame
        ctx.beginPath()
        ctx.arc(knob[0], knob[1], 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
    })
  })
  ctx.restore()
}

function drawPlanWalls(ctx, cam, scene, pal, frame, hits, alpha) {
  const { room } = scene
  const thick = Math.max(4, room.wall * cam.scale)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineCap = 'butt'
  for (const wall of WALLS) {
    const f = wallFrame(room, wall)
    const a = wallPoint(room, wall, 0, 0)
    const b = wallPoint(room, wall, f.length, 0)
    const [nx, ny] = WALL_NORMALS[wall]
    const off = thick / 2 / cam.scale
    const pa = cam.project(a[0] + nx * off, a[1] + ny * off, 0)
    const pb = cam.project(b[0] + nx * off, b[1] + ny * off, 0)
    ctx.strokeStyle = pal.frame
    ctx.lineWidth = thick
    ctx.beginPath()
    ctx.moveTo(pa[0], pa[1])
    ctx.lineTo(pb[0], pb[1])
    ctx.stroke()
    scene.windows.forEach((win, index) => {
      if (win.wall !== wall) return
      const w0 = wallPoint(room, wall, win.pos, 0)
      const w1 = wallPoint(room, wall, win.pos + win.w, 0)
      const qa = cam.project(w0[0] + nx * off, w0[1] + ny * off, 0)
      const qb = cam.project(w1[0] + nx * off, w1[1] + ny * off, 0)
      const lit = frame.patches?.windows?.[index]?.opening?.length > 0
      const selected = frame.selection?.type === 'window' && frame.selection.index === index
      ctx.save()
      if (lit) {
        ctx.shadowColor = pal.glow
        ctx.shadowBlur = 16 * frame.dpr
      }
      ctx.strokeStyle = selected ? pal.selection : lit ? pal.sun : pal.skyBottom
      ctx.lineWidth = thick * 0.8
      ctx.beginPath()
      ctx.moveTo(qa[0], qa[1])
      ctx.lineTo(qb[0], qb[1])
      ctx.stroke()
      ctx.restore()
      hits.windows.push({ index, quad: [qa, qb], back: true, plan: true })
    })
    for (const door of scene.doors || []) {
      if (door.wall !== wall) continue
      const d0 = wallPoint(room, wall, door.pos, 0)
      const d1 = wallPoint(room, wall, door.pos + door.w, 0)
      const qa = cam.project(d0[0] + nx * off, d0[1] + ny * off, 0)
      const qb = cam.project(d1[0] + nx * off, d1[1] + ny * off, 0)
      // the wall is open here: paint the floor over it, then the leaf swung half open and the arc it sweeps
      ctx.save()
      ctx.strokeStyle = pal.floor
      ctx.lineWidth = thick + 1
      ctx.beginPath()
      ctx.moveTo(qa[0], qa[1])
      ctx.lineTo(qb[0], qb[1])
      ctx.stroke()
      const hinge = cam.project(d0[0], d0[1], 0)
      const free = cam.project(d1[0], d1[1], 0)
      const into = cam.project(d0[0] - nx * door.w, d0[1] - ny * door.w, 0)
      ctx.strokeStyle = pal.frame
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(hinge[0], hinge[1])
      ctx.lineTo(into[0], into[1])
      ctx.stroke()
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(into[0], into[1])
      ctx.quadraticCurveTo(into[0] + (free[0] - hinge[0]), into[1] + (free[1] - hinge[1]), free[0], free[1])
      ctx.stroke()
      ctx.restore()
    }
    scene.windows.forEach((win) => {
      if (win.wall !== wall || !win.balcony) return
      const b = win.balcony
      const f = wallFrame(room, wall)
      const at = (u, v) => cam.project(f.o[0] + f.t[0] * u + f.n[0] * v, f.o[1] + f.t[1] * u + f.n[1] * v, 0)
      const quad = [at(win.pos - b.ext, room.wall), at(win.pos + win.w + b.ext, room.wall), at(win.pos + win.w + b.ext, room.wall + b.depth), at(win.pos - b.ext, room.wall + b.depth)]
      ctx.save()
      ctx.fillStyle = pal.name === 'dark' ? 'rgba(150, 170, 230, 0.12)' : 'rgba(120, 100, 70, 0.1)'
      pathOf(ctx, quad)
      ctx.fill()
      ctx.strokeStyle = pal.frame
      ctx.lineWidth = 1
      ctx.setLineDash([5, 4])
      ctx.stroke()
      if (b.rail >= 0.05) {
        ctx.setLineDash([])
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(quad[3][0], quad[3][1])
        ctx.lineTo(quad[2][0], quad[2][1])
        ctx.stroke()
      }
      ctx.restore()
    })
  }
  ctx.restore()
}

function boxFaces(cam, item) {
  const base = itemFootprint(item)
  const top = base.map(([x, y]) => cam.project(x, y, item.h))
  const r = ((item.rot || 0) * Math.PI) / 180
  const cs = Math.cos(r)
  const sn = Math.sin(r)
  const sides = []
  const defs = [
    ['bottom', [base[0], base[1]], [0, -1]],
    ['right', [base[1], base[2]], [1, 0]],
    ['top', [base[2], base[3]], [0, 1]],
    ['left', [base[3], base[0]], [-1, 0]],
  ]
  for (const [name, [a, b], n0] of defs) {
    const n = [n0[0] * cs - n0[1] * sn, n0[0] * sn + n0[1] * cs]
    if (cam.isBackWall(n[0], n[1])) continue // facing away from the viewer
    sides.push({ name, n, poly: [cam.project(a[0], a[1], 0), cam.project(b[0], b[1], 0), cam.project(b[0], b[1], item.h), cam.project(a[0], a[1], item.h)] })
  }
  const all = [...top, ...sides.flatMap((s) => s.poly), ...base.map(([x, y]) => cam.project(x, y, 0))]
  return { top, sides, silhouette: hull(all) }
}

function drawItems(ctx, cam, scene, pal, frame, hits) {
  const order = scene.items.map((item, index) => ({ item, index, d: cam.depth(item.x + item.w / 2, item.y + item.d / 2, item.h / 2) })).sort((a, b) => b.d - a.d)
  for (const { item, index } of order) {
    const colors = pal.items[item.kind]
    const faces = boxFaces(cam, item)
    hits.items.push({ index, hull: faces.silhouette })
    ctx.save()
    if (item.kind === 'plant') {
      drawPlant(ctx, cam, item, colors)
    } else {
      sidesOf(ctx, faces, colors)
      ctx.fillStyle = colors[0]
      pathOf(ctx, faces.top)
      ctx.fill()
      const lit = frame.itemTops?.[index] ?? []
      for (const poly of lit) fillSurface(ctx, poly.map(([x, y]) => cam.project(x, y, item.h)), faces.top, pal, frame.dpr, 7)
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'
      ctx.lineWidth = 1
      pathOf(ctx, faces.top)
      ctx.stroke()
    }
    ctx.restore()
    const selected = frame.selection?.type === 'item' && frame.selection.index === index
    const hovered = frame.hover?.type === 'item' && frame.hover.index === index
    if (selected) {
      // a round handle just beyond the front edge: drag it to turn the piece
      const r = ((item.rot || 0) * Math.PI) / 180
      const reach = item.d / 2 + 0.34
      const at = cam.project(item.x + item.w / 2 - reach * Math.sin(r), item.y + item.d / 2 + reach * Math.cos(r), 0)
      hits.handle = { index, at }
      ctx.save()
      ctx.beginPath()
      ctx.arc(at[0], at[1], 12, 0, Math.PI * 2)
      ctx.fillStyle = pal.selection
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(at[0], at[1], 5, -2.4, 1.2)
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    }
    if (selected || hovered) {
      ctx.save()
      pathOf(ctx, faces.silhouette)
      if (hovered && !selected) {
        ctx.fillStyle = pal.hover
        ctx.fill()
      }
      ctx.strokeStyle = pal.selection
      ctx.lineWidth = selected ? 2.4 : 1.6
      ctx.setLineDash(selected ? [] : [4, 3])
      ctx.stroke()
      ctx.restore()
    }
  }
}

function sidesOf(ctx, faces, colors) {
  faces.sides.forEach((s) => {
    ctx.fillStyle = Math.abs(s.n[0]) > Math.abs(s.n[1]) ? colors[2] : colors[1]
    pathOf(ctx, s.poly)
    ctx.fill()
  })
}

function drawPlant(ctx, cam, item, colors) {
  const cx = item.x + item.w / 2
  const cy = item.y + item.d / 2
  const potH = Math.min(item.h * 0.4, 0.35)
  const base = cam.project(cx, cy, 0)
  const rim = cam.project(cx, cy, potH)
  const r = (item.w / 2) * cam.scale
  ctx.fillStyle = colors[1]
  ctx.beginPath()
  ctx.moveTo(base[0] - r * 0.8, base[1])
  ctx.lineTo(rim[0] - r, rim[1])
  ctx.lineTo(rim[0] + r, rim[1])
  ctx.lineTo(base[0] + r * 0.8, base[1])
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = colors[0]
  ctx.beginPath()
  ctx.ellipse(rim[0], rim[1], r, r * 0.4, 0, 0, Math.PI * 2)
  ctx.fill()
  const top = cam.project(cx, cy, item.h)
  const leaf = Math.max(r * 1.5, 9)
  ctx.strokeStyle = colors[2]
  ctx.lineWidth = Math.max(2, r * 0.18)
  ctx.beginPath()
  ctx.moveTo(rim[0], rim[1])
  ctx.lineTo(top[0], top[1] + leaf * 0.35)
  ctx.stroke()
  ctx.fillStyle = colors[2]
  for (const [dx, dy, s] of [[0, 0, 1], [-0.7, 0.35, 0.75], [0.7, 0.3, 0.8], [0.1, -0.5, 0.7]]) {
    ctx.beginPath()
    ctx.ellipse(top[0] + dx * leaf * 0.6, top[1] + dy * leaf * 0.6, leaf * 0.55 * s, leaf * 0.8 * s, dx * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawBeams(ctx, cam, scene, frame, pal) {
  const { sun, patches } = frame
  if (!sun || !(sun.elevation > 0) || !patches) return
  const s = sunInRoom(scene, sun.azimuth, sun.elevation)
  const len = Math.max(scene.room.w, scene.room.d) * 0.55
  scene.windows.forEach((win, index) => {
    const pieces = patches.windows[index]?.opening ?? []
    const f = wallFrame(scene.room, win.wall)
    for (const piece of pieces) {
      const near = piece.map(([a, b]) => {
        const along = win.pos + a
        return [f.o[0] + f.t[0] * along + f.n[0] * scene.room.wall, f.o[1] + f.t[1] * along + f.n[1] * scene.room.wall, b]
      })
      const far = near.map((p) => [p[0] + s[0] * len, p[1] + s[1] * len, p[2] + s[2] * len])
      const pts = hull([...near, ...far].map((p) => cam.project(...p)))
      const n0 = cam.project(...near[0])
      const f0 = cam.project(...far[0])
      const g = ctx.createLinearGradient(n0[0], n0[1], f0[0], f0[1])
      g.addColorStop(0, `rgba(${pal.beam.join(',')}, 0.34)`)
      g.addColorStop(1, `rgba(${pal.beam.join(',')}, 0)`)
      ctx.fillStyle = g
      pathOf(ctx, pts)
      ctx.fill()
    }
  })
}

function arcPoints(cam, scene, frame) {
  const radius = arcRadius(scene.room, cam.pitch)
  const centre = cam.depth(scene.room.w / 2, scene.room.d / 2, scene.room.h / 2)
  return frame.path.samples.map((s) => {
    const at = sunPoint(scene, { azimuth: s.azimuth, elevation: s.elevation }, radius)
    return { s, p: cam.project(...at), far: cam.depth(...at) > centre }
  })
}

/** The sun's path: the stretch behind the room is drawn first so the walls cover it, the rest on top. */
function drawArc(ctx, cam, scene, frame, pal, far) {
  const { path } = frame
  if (!path?.samples?.length) return
  const pts = arcPoints(cam, scene, frame)
  ctx.save()
  ctx.strokeStyle = pal.arc
  ctx.lineWidth = 1.6
  ctx.setLineDash([2, 5])
  ctx.lineCap = 'round'
  for (let i = 1; i < pts.length; i++) {
    if ((pts[i].far && pts[i - 1].far) !== far) continue
    ctx.beginPath()
    ctx.moveTo(pts[i - 1].p[0], pts[i - 1].p[1])
    ctx.lineTo(pts[i].p[0], pts[i].p[1])
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.font = `600 10px ${pal.ui}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const { s, p, far: isFar } of pts) {
    if (isFar !== far || s.minutes % 60 !== 0) continue
    ctx.beginPath()
    ctx.arc(p[0], p[1], 2.2, 0, Math.PI * 2)
    ctx.fillStyle = pal.arc
    ctx.fill()
    if ((s.minutes / 60) % 2 === 0) {
      ctx.fillStyle = pal.muted
      ctx.fillText(String(s.minutes / 60), p[0], p[1] - 10)
    }
  }
  ctx.restore()
}

function drawSun(ctx, cam, scene, frame, pal) {
  const { sun } = frame
  if (!sun || !(sun.elevation > 0)) return
  const [x, y] = cam.project(...sunPoint(scene, sun, arcRadius(scene.room, cam.pitch)))
  const cx = Math.min(cam.width - 18, Math.max(18, x))
  const cy = Math.min(cam.height - 18, Math.max(18, y))
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 34)
  g.addColorStop(0, pal.glow)
  g.addColorStop(1, 'rgba(255,170,30,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, 34, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = pal.sun
  ctx.beginPath()
  ctx.arc(cx, cy, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = pal.sunCore
  ctx.beginPath()
  ctx.arc(cx - 2, cy - 2, 5, 0, Math.PI * 2)
  ctx.fill()
}

function drawMarkers(ctx, cam, markers, pal) {
  if (!markers?.length) return
  ctx.save()
  ctx.font = `700 11px ${pal.ui}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  markers.forEach((m, i) => {
    const [x, y] = cam.project(m.x, m.y, 0)
    ctx.beginPath()
    ctx.arc(x, y, 11, 0, Math.PI * 2)
    ctx.fillStyle = pal.accent
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = pal.bg
    ctx.stroke()
    ctx.fillStyle = pal.name === 'dark' ? '#1c1405' : '#ffffff'
    ctx.fillText(String(i + 1), x, y + 0.5)
  })
  ctx.restore()
}

function drawCompass(ctx, cam, scene, pal, at) {
  const f = (scene.facing * Math.PI) / 180
  const dir = cam.direction(-Math.sin(f), Math.cos(f))
  const len = Math.hypot(dir[0], dir[1])
  const r = 18
  const ux = len > 0.2 ? dir[0] / len : 0
  const uy = len > 0.2 ? dir[1] / len : -1
  ctx.save()
  ctx.translate(at[0], at[1])
  ctx.strokeStyle = pal.muted
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
  // a kite: bright half toward north, pale half behind
  const px = -uy
  const py = ux
  ctx.fillStyle = pal.accent
  ctx.beginPath()
  ctx.moveTo(ux * (r - 2), uy * (r - 2))
  ctx.lineTo(px * 4.5, py * 4.5)
  ctx.lineTo(-px * 4.5, -py * 4.5)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = pal.muted
  ctx.globalAlpha = 0.45
  ctx.beginPath()
  ctx.moveTo(-ux * (r - 2), -uy * (r - 2))
  ctx.lineTo(px * 4.5, py * 4.5)
  ctx.lineTo(-px * 4.5, -py * 4.5)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = pal.ink
  ctx.font = `700 10px ${pal.ui}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('N', ux * (r + 10), uy * (r + 10))
  ctx.restore()
}

/**
 * Draws one frame.
 * @param frame {{scene, camera, palette, dpr, sun, patches, itemTops, path, heat, selection, hover, showArc}}
 * @returns hit shapes for pointer picking: {windows: [{index, quad}], items: [{index, hull}]}
 */
export function drawStage(ctx, frame) {
  const { scene, camera: cam, palette: pal } = frame
  const hits = { windows: [], items: [], handle: null }
  const { room } = scene
  if (frame.clear !== false) ctx.clearRect(0, 0, cam.width, cam.height)
  if (frame.showArc) drawArc(ctx, cam, scene, frame, pal, true)
  const floor = drawFloor(ctx, cam, room, pal, frame)
  drawUnderlay(ctx, cam, room, frame.underlay)
  drawHeat(ctx, cam, room, frame.heat, frame.dpr)
  drawWalls(ctx, cam, scene, pal, frame, hits)
  // light on the floor, and on the walls the sun reaches
  if (frame.patches) {
    const outline = Boolean(frame.heat)
    for (const poly of frame.patches.floor) {
      const pts = poly.map(([x, y]) => cam.project(x, y, 0))
      if (outline) {
        ctx.save()
        ctx.strokeStyle = pal.patchEdge
        ctx.lineWidth = 2
        pathOf(ctx, pts)
        ctx.stroke()
        ctx.restore()
      } else {
        fillSurface(ctx, pts, floor, pal, frame.dpr)
      }
    }
    if (cam.pitch < 84) {
      for (const { wall, poly } of frame.patches.walls) {
        const f = wallFrame(room, wall)
        const wallPoly = [wallPoint(room, wall, 0, 0), wallPoint(room, wall, f.length, 0), wallPoint(room, wall, f.length, room.h), wallPoint(room, wall, 0, room.h)].map((p) => cam.project(...p))
        ctx.save()
        ctx.globalAlpha = Math.min(1, (88 - cam.pitch) / 8) * (cam.isBackWall(...WALL_NORMALS[wall]) ? 1 : 0.55)
        fillSurface(ctx, poly.map((p) => cam.project(...p)), wallPoly, { ...pal, patch: pal.patchWall }, frame.dpr, 10)
        ctx.restore()
      }
    }
  }
  drawMarkers(ctx, cam, frame.markers, pal)
  drawBeams(ctx, cam, scene, frame, pal)
  drawMarks(ctx, cam, frame.marks, pal)
  drawItems(ctx, cam, scene, pal, frame, hits)
  drawGuides(ctx, cam, room, frame.guides, pal)
  if (frame.dimensions && cam.pitch > 84 && frame.fmt) drawDimensions(ctx, cam, scene, pal, frame.fmt)
  if (frame.showArc) {
    drawArc(ctx, cam, scene, frame, pal, false)
    drawSun(ctx, cam, scene, frame, pal)
  }
  if (frame.compass !== false) drawCompass(ctx, cam, scene, pal, frame.compassAt ?? [34, cam.height - 38])
  return hits
}
