// A picture on a canvas that can be panned, pinched and tapped: the floor
// plan, or a photo of the room. Points are kept in picture pixels. The picture
// never leaves the page: it is read from a file or the camera into memory.

import { h } from './dom.js'

const MAX_SIDE = 2200

/** Read an image file into a canvas no larger than MAX_SIDE on its long side. */
export async function loadPicture(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('not an image'))
      el.src = url
    })
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k))
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

export class PictureCanvas {
  /**
   * @param options.root element to fill
   * @param options.draw (ctx, view) paints marks on top, in screen pixels; view.toScreen converts picture points
   * @param options.onTap (point) a tap, in picture pixels
   * @param options.onHandle (id, point) a handle was dragged
   */
  constructor({ root, draw, onTap, onHandle }) {
    this.root = root
    this.drawOver = draw
    this.onTap = onTap
    this.onHandle = onHandle
    this.image = null
    this.handles = []
    this.view = { k: 1, x: 0, y: 0 }
    this.pointers = new Map()
    this.queued = false
    this.canvas = h('canvas', { class: 'pic-canvas', tabindex: 0, role: 'img' })
    this.ctx = this.canvas.getContext('2d')
    root.replaceChildren(this.canvas)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(root)
    this.bind()
    this.resize()
  }

  setImage(canvas) {
    this.image = canvas
    this.fit()
  }

  resize() {
    const box = this.root.getBoundingClientRect()
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1)
    this.width = Math.max(1, Math.round(box.width))
    this.height = Math.max(1, Math.round(box.height))
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    if (this.image && !this.fitted) this.fit()
    this.invalidate()
  }

  fit() {
    if (!this.image) return
    const k = Math.min(this.width / this.image.width, this.height / this.image.height)
    this.view = { k, x: (this.width - this.image.width * k) / 2, y: (this.height - this.image.height * k) / 2 }
    this.fitted = true
    this.invalidate()
  }

  toScreen([x, y]) {
    return [this.view.x + x * this.view.k, this.view.y + y * this.view.k]
  }

  toPicture([sx, sy]) {
    return [(sx - this.view.x) / this.view.k, (sy - this.view.y) / this.view.k]
  }

  invalidate() {
    if (this.queued) return
    this.queued = true
    requestAnimationFrame(() => {
      this.queued = false
      this.paint()
    })
  }

  paint() {
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.width, this.height)
    if (this.image) {
      ctx.save()
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(this.image, this.view.x, this.view.y, this.image.width * this.view.k, this.image.height * this.view.k)
      ctx.restore()
    }
    this.drawOver?.(ctx, this)
  }

  zoomAt(factor, [sx, sy]) {
    const k = Math.min(12, Math.max(0.05, this.view.k * factor))
    const f = k / this.view.k
    this.view = { k, x: sx - (sx - this.view.x) * f, y: sy - (sy - this.view.y) * f }
    this.fitted = false
    this.invalidate()
  }

  point(e) {
    const r = this.canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  bind() {
    const c = this.canvas
    c.style.touchAction = 'none'
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId)
      const p = this.point(e)
      this.pointers.set(e.pointerId, { x: p[0], y: p[1], sx: p[0], sy: p[1], at: performance.now() })
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y)
        this.drag = null
        return
      }
      const hit = this.handles.find((hd) => {
        const [hx, hy] = this.toScreen(hd.at)
        return Math.hypot(hx - p[0], hy - p[1]) < 20
      })
      this.drag = hit ? { kind: 'handle', id: hit.id, moved: 0 } : { kind: 'pan', moved: 0 }
    })
    c.addEventListener('pointermove', (e) => {
      const known = this.pointers.get(e.pointerId)
      if (!known) return
      const p = this.point(e)
      const dx = p[0] - known.x
      const dy = p[1] - known.y
      known.x = p[0]
      known.y = p[1]
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (this.pinch > 8) this.zoomAt(dist / this.pinch, [(a.x + b.x) / 2, (a.y + b.y) / 2])
        this.pinch = dist
        return
      }
      if (!this.drag) return
      this.drag.moved += Math.abs(dx) + Math.abs(dy)
      if (this.drag.kind === 'pan') {
        this.view = { ...this.view, x: this.view.x + dx, y: this.view.y + dy }
        this.fitted = false
        this.invalidate()
      } else {
        this.onHandle?.(this.drag.id, this.toPicture(p))
      }
    })
    const end = (e, cancelled) => {
      const known = this.pointers.get(e.pointerId)
      this.pointers.delete(e.pointerId)
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId)
      const d = this.drag
      if (this.pointers.size === 0) this.drag = null
      if (cancelled || !known || !d || d.kind !== 'pan' || d.moved > 6 || performance.now() - known.at > 1000 || !this.image) return
      const pic = this.toPicture([known.x, known.y])
      if (pic[0] >= 0 && pic[1] >= 0 && pic[0] <= this.image.width && pic[1] <= this.image.height) this.onTap?.(pic)
    }
    c.addEventListener('pointerup', (e) => end(e, false))
    c.addEventListener('pointercancel', (e) => end(e, true))
    c.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, this.point(e))
    }, { passive: false })
  }
}

/** A numbered dot, for marking points on a picture. */
export function dot(ctx, [x, y], label, color = '#c2410c') {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, 11, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2.5
  ctx.stroke()
  if (label != null) {
    ctx.fillStyle = '#fff'
    ctx.font = '700 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(label), x, y + 0.5)
  }
  ctx.restore()
}
