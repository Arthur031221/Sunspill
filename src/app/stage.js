// The canvas: sizes itself, animates the view, draws the frame and turns
// pointer input into edits (drag furniture and windows, turn the room).

import { makeCamera } from '../render/camera.js'
import { drawStage, arcRadius, sunPoint } from '../render/draw.js'
import { PALETTES } from '../render/palette.js'
import { wallFrame } from '../core/room.js'
import { insideConvex } from '../core/poly.js'
import { clamp } from './dom.js'

const VIEWS = { '3d': { yaw: -32, pitch: 33 }, plan: { yaw: 0, pitch: 90 } }
const ease = (t) => 1 - (1 - t) ** 3

export function makeFrameCamera(scene, view, width, height, frame, showArc) {
  const extra = []
  if (showArc && frame.path?.samples?.length) {
    const radius = arcRadius(scene.room, view.pitch)
    for (const s of frame.path.samples) extra.push(sunPoint(scene, { azimuth: s.azimuth, elevation: s.elevation }, radius))
  }
  return makeCamera(scene.room, view, width, height, { padding: 30, extra })
}

export class Stage {
  constructor({ canvas, store, getFrame, getHeat, getMarkers, onSelect, onHover, reducedMotion }) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.store = store
    this.getFrame = getFrame
    this.getHeat = getHeat
    this.getMarkers = getMarkers
    this.onSelect = onSelect
    this.onHover = onHover
    this.reducedMotion = reducedMotion
    this.view = { ...VIEWS['3d'] }
    this.mode = '3d'
    this.hits = { windows: [], items: [] }
    this.selection = null
    this.hover = null
    this.drag = null
    this.dpr = 1
    this.queued = false
    this.tween = null
    this.userYaw = VIEWS['3d'].yaw
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas.parentElement)
    this.bind()
    this.resize()
  }

  get palette() {
    return PALETTES[this.store.ui.themeResolved || 'light']
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect()
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1)
    this.width = Math.max(1, Math.round(box.width))
    this.height = Math.max(1, Math.round(box.height))
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.invalidate()
  }

  invalidate() {
    if (this.queued) return
    this.queued = true
    requestAnimationFrame(() => {
      this.queued = false
      this.paint()
    })
  }

  setMode(mode, animate = true) {
    if (mode === this.mode) return
    this.mode = mode
    const target = mode === 'plan' ? VIEWS.plan : { yaw: this.userYaw, pitch: VIEWS['3d'].pitch }
    this.animateTo(target, animate && !this.reducedMotion ? 650 : 0)
  }

  animateTo(target, ms) {
    const from = { ...this.view }
    if (!ms) {
      this.view = { ...target }
      this.tween = null
      this.invalidate()
      return
    }
    const start = performance.now()
    const step = (now) => {
      const k = ease(Math.min(1, (now - start) / ms))
      this.view = { yaw: from.yaw + (target.yaw - from.yaw) * k, pitch: from.pitch + (target.pitch - from.pitch) * k }
      this.paint()
      if (k < 1 && this.tween === token) requestAnimationFrame(step)
    }
    const token = (this.tween = {})
    requestAnimationFrame(step)
  }

  select(selection) {
    this.selection = selection
    this.invalidate()
  }

  paint() {
    const scene = this.store.scene
    const frame = this.getFrame()
    const cam = makeFrameCamera(scene, this.view, this.width, this.height, frame, this.store.ui.showArc)
    this.camera = cam
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.hits = drawStage(this.ctx, {
      scene,
      camera: cam,
      palette: this.palette,
      dpr: this.dpr,
      sun: frame.sun,
      patches: frame.patches,
      itemTops: frame.itemTops,
      path: frame.path,
      heat: this.getHeat(),
      markers: this.getMarkers?.(),
      selection: this.selection,
      hover: this.hover,
      showArc: this.store.ui.showArc,
    })
  }

  pointer(e) {
    const r = this.canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  pick([x, y]) {
    for (let i = this.hits.items.length - 1; i >= 0; i--) {
      // items are listed far to near, so the last hit is the one in front
      const item = this.hits.items[i]
      if (insideConvex(item.hull, x, y)) return { type: 'item', index: item.index }
    }
    for (const win of this.hits.windows) if (insideConvex(win.plan ? planHit(win.quad) : win.quad, x, y)) return { type: 'window', index: win.index }
    return null
  }

  bind() {
    const c = this.canvas
    c.addEventListener('pointerdown', (e) => this.down(e))
    c.addEventListener('pointermove', (e) => this.move(e))
    c.addEventListener('pointerup', (e) => this.up(e))
    c.addEventListener('pointercancel', (e) => this.up(e))
    c.addEventListener('pointerleave', () => {
      if (!this.drag) this.setHover(null)
    })
    c.addEventListener('keydown', (e) => this.key(e))
    // Vertical swipes on empty space scroll the page on a phone. A touch that lands on a piece or a window moves it instead.
    c.addEventListener('touchstart', (e) => {
      const t = e.touches[0]
      const r = c.getBoundingClientRect()
      if (this.pick([t.clientX - r.left, t.clientY - r.top])) e.preventDefault()
    }, { passive: false })
  }

  setHover(h) {
    const same = JSON.stringify(h) === JSON.stringify(this.hover)
    this.hover = h
    this.canvas.style.cursor = h ? 'grab' : this.mode === '3d' ? 'ew-resize' : 'default'
    if (!same) this.invalidate()
  }

  down(e) {
    this.canvas.focus({ preventScroll: true })
    const p = this.pointer(e)
    const hit = this.pick(p)
    this.canvas.setPointerCapture(e.pointerId)
    this.onSelect(hit)
    this.select(hit)
    const scene = this.store.scene
    if (hit?.type === 'item' && this.camera) {
      const item = scene.items[hit.index]
      const at = this.camera.planeAt(p[0], p[1], 0)
      if (at) this.drag = { type: 'item', index: hit.index, dx: at[0] - item.x, dy: at[1] - item.y }
    } else if (hit?.type === 'window' && this.camera) {
      const win = scene.windows[hit.index]
      const at = this.camera.wallAt(win.wall, p[0], p[1])
      if (at) {
        const [lo] = spanOf(scene.room, win)
        this.drag = { type: 'window', index: hit.index, du: at[0] - lo, dz: at[1] - win.sill }
      }
    }
    if (!this.drag) this.drag = { type: 'orbit', x: p[0], y: p[1] }
    if (this.drag.type !== 'orbit') this.canvas.style.cursor = 'grabbing'
  }

  move(e) {
    const p = this.pointer(e)
    const d = this.drag
    if (!d) {
      this.setHover(this.pick(p))
      this.onHover?.(p, this.camera)
      return
    }
    const scene = this.store.scene
    if (d.type === 'item') {
      const at = this.camera.planeAt(p[0], p[1], 0)
      if (!at) return
      const snap = (v) => Math.round(v * 20) / 20
      this.store.update((s) => {
        const it = s.items[d.index]
        it.x = clamp(snap(at[0] - d.dx), 0, s.room.w - it.w)
        it.y = clamp(snap(at[1] - d.dy), 0, s.room.d - it.d)
      }, { key: `item${d.index}` })
    } else if (d.type === 'window') {
      const win = scene.windows[d.index]
      const at = this.camera.wallAt(win.wall, p[0], p[1])
      if (!at) return
      this.store.update((s) => {
        const w = s.windows[d.index]
        w.pos = posFromLow(s.room, w, at[0] - d.du)
        w.sill = clamp(Math.round((at[1] - d.dz) * 20) / 20, 0, s.room.h - w.h)
      }, { key: `window${d.index}` })
    } else if (d.type === 'orbit' && this.mode === '3d') {
      const dx = p[0] - d.x
      const dy = p[1] - d.y
      d.x = p[0]
      d.y = p[1]
      this.userYaw = clamp(this.userYaw + dx * 0.4, -80, 80)
      this.view = { yaw: this.userYaw, pitch: clamp(this.view.pitch - dy * 0.25, 18, 62) }
      this.invalidate()
    }
  }

  up(e) {
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId)
    this.drag = null
    this.setHover(this.pick(this.pointer(e)))
  }

  key(e) {
    const step = e.shiftKey ? 15 : 5
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (this.mode !== '3d') return
      this.userYaw = clamp(this.userYaw + (e.key === 'ArrowLeft' ? -step : step), -80, 80)
      this.view = { ...this.view, yaw: this.userYaw }
      this.invalidate()
      e.preventDefault()
    }
  }
}

/** The span of a window along the camera's u axis (x for top and bottom walls, y for left and right). */
export function spanOf(room, win) {
  const f = wallFrame(room, win.wall)
  const along = f.t[0] !== 0 ? 0 : 1
  const a = f.o[along] + f.t[along] * win.pos
  const b = f.o[along] + f.t[along] * (win.pos + win.w)
  return [Math.min(a, b), Math.max(a, b)]
}

/** Window position along the wall from the low coordinate of its span. */
export function posFromLow(room, win, low) {
  const f = wallFrame(room, win.wall)
  const along = f.t[0] !== 0 ? 0 : 1
  const pos = f.t[along] > 0 ? low - f.o[along] : f.o[along] - (low + win.w)
  return clamp(Math.round(pos * 20) / 20, 0, f.length - win.w)
}

/** Plan view windows are thin lines: give them a few pixels of height to click. */
function planHit([a, b]) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const n = Math.hypot(dx, dy) || 1
  const nx = (-dy / n) * 8
  const ny = (dx / n) * 8
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]
}
