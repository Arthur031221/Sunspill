// A map for placing and turning the room: OpenStreetMap tiles when the person
// allows them, a plain metre grid otherwise, with building outlines, trees and
// the room drawn on top. It handles pan, pinch, wheel and keys, moves and turns
// the room in the facing step, and picks buildings in the surroundings step.

import { h } from './dom.js'
import { t } from './i18n.js'
import { bearingText, lengthText } from './format.js'
import { lonLatToTile, tileToLonLat, fromLocal, toLocal, roomCorners, metresPerPixel } from '../core/geo.js'
import { wallBearing, wallFrame, roomToLocal, sunInRoom } from '../core/room.js'
import { sunAt } from '../core/hours.js'
import { shadingObstacles } from '../core/obstacles.js'
import { PALETTES } from '../render/palette.js'

const TILE = 256
const MAX_TILE_ZOOM = 19
const RAD = Math.PI / 180

const nice = (metres) => {
  for (const v of [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) if (v >= metres) return v
  return 20000
}

export class MapView {
  /**
   * @param options.root the element that holds the canvas and its buttons
   * @param options.net  the network layer, for tile addresses
   * @param options.tilesOn () => boolean
   * @param options.askTiles () => void, asks the person to switch the map pictures on
   * @param options.on callbacks: pin(lat, lon), moveRoom(east, north), turnTo(bearing), turnBy(degrees), select(index|null), moveObstacle(index, east, north)
   */
  constructor({ root, store, net, tilesOn, askTiles, on }) {
    this.root = root
    this.store = store
    this.net = net
    this.tilesOn = tilesOn
    this.askTiles = askTiles
    this.on = on
    this.mode = 'pin'
    this.cam = { lat: store.scene.place.lat, lon: store.scene.place.lon, zoom: 15 }
    this.pointers = new Map()
    this.gesture = null
    this.tiles = new Map()
    this.selected = null
    this.target = 0
    this.queued = false
    this.canvas = h('canvas', { class: 'map-canvas', tabindex: 0, role: 'application' })
    this.ctx = this.canvas.getContext('2d')
    this.zoomIn = h('button', { class: 'map-btn', type: 'button', onclick: () => this.zoomBy(1) }, '+')
    this.zoomOut = h('button', { class: 'map-btn', type: 'button', onclick: () => this.zoomBy(-1) }, '−')
    this.credit = h('a', { class: 'map-credit', href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener noreferrer' }, '© OpenStreetMap')
    this.cta = h('div', { class: 'map-cta' })
    this.root.append(this.canvas, h('div', { class: 'map-zoom' }, this.zoomIn, this.zoomOut), this.credit, this.cta)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(this.root)
    this.bind()
    this.resize()
  }

  get scene() {
    return this.store.scene
  }

  get palette() {
    return PALETTES[this.store.ui.themeResolved || 'light']
  }

  // ---------------------------------------------------------------- camera

  resize() {
    const box = this.root.getBoundingClientRect()
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1)
    this.width = Math.max(1, Math.round(box.width))
    this.height = Math.max(1, Math.round(box.height))
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.invalidate()
  }

  world(lat, lon, zoom = this.cam.zoom) {
    const p = lonLatToTile(lon, lat, zoom)
    return [p.x * TILE, p.y * TILE]
  }

  toScreen(lat, lon) {
    const c = this.world(this.cam.lat, this.cam.lon)
    const p = this.world(lat, lon)
    return [p[0] - c[0] + this.width / 2, p[1] - c[1] + this.height / 2]
  }

  fromScreen(x, y) {
    const c = this.world(this.cam.lat, this.cam.lon)
    return tileToLonLat((c[0] + x - this.width / 2) / TILE, (c[1] + y - this.height / 2) / TILE, this.cam.zoom)
  }

  /** Screen position of a point metres east and north of the room centre. */
  local(e, n) {
    const p = fromLocal(this.scene.place, e, n)
    return this.toScreen(p.lat, p.lon)
  }

  /** Metres east and north of the room centre under a screen position. */
  unlocal(x, y) {
    const ll = this.fromScreen(x, y)
    return toLocal(this.scene.place, ll.lat, ll.lon)
  }

  get pixelsPerMetre() {
    return 1 / metresPerPixel(this.cam.lat, this.cam.zoom)
  }

  zoomBy(steps, at = [this.width / 2, this.height / 2]) {
    this.zoomTo(this.cam.zoom + steps, at)
  }

  zoomTo(zoom, at = [this.width / 2, this.height / 2]) {
    const next = Math.min(22, Math.max(3, zoom))
    const before = this.fromScreen(at[0], at[1])
    this.cam.zoom = next
    const after = this.fromScreen(at[0], at[1])
    // keep the point under the fingers where it was
    this.cam.lat += before.lat - after.lat
    this.cam.lon += before.lon - after.lon
    this.invalidate()
  }

  panBy(dx, dy) {
    const c = this.world(this.cam.lat, this.cam.lon)
    const ll = tileToLonLat((c[0] - dx) / TILE, (c[1] - dy) / TILE, this.cam.zoom)
    this.cam.lat = Math.max(-84, Math.min(84, ll.lat))
    this.cam.lon = ll.lon
    this.invalidate()
  }

  /** Centre on the room and choose a sensible zoom for the mode. */
  fit(mode = this.mode) {
    const { place } = this.scene
    this.cam.lat = place.lat
    this.cam.lon = place.lon
    if (mode === 'pin') this.cam.zoom = this.pinZoom ?? 16
    else {
      // show about sixty metres across, so the room and the buildings round it are both visible
      const ppm = Math.min(this.width, this.height) / (mode === 'surround' ? 140 : 45)
      this.cam.zoom = Math.log2(ppm * 40075016.686 * Math.cos(place.lat * RAD) / TILE)
    }
    this.invalidate()
  }

  setMode(mode, { select = null, target = 0 } = {}) {
    this.resize() // the map may have been hidden, and its size is read before it is fitted
    this.mode = mode
    this.selected = select
    this.target = target
    this.fit(mode)
    this.paintChrome()
  }

  paintChrome() {
    const on = this.tilesOn()
    this.credit.hidden = !on
    this.cta.hidden = on
    if (!on) {
      this.cta.replaceChildren(h('button', { class: 'btn primary', type: 'button', title: t('map.off'), onclick: () => this.askTiles() }, t('map.show')))
    }
    this.zoomIn.setAttribute('aria-label', t('map.zoomIn'))
    this.zoomOut.setAttribute('aria-label', t('map.zoomOut'))
    this.canvas.setAttribute('aria-label', t(`map.aria.${this.mode}`))
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

  // ---------------------------------------------------------------- tiles

  tile(z, x, y) {
    const key = `${z}/${x}/${y}`
    let tile = this.tiles.get(key)
    if (!tile) {
      tile = { img: new Image(), ready: false, at: 0 }
      tile.img.decoding = 'async'
      tile.img.onload = () => {
        tile.ready = true
        this.invalidate()
      }
      tile.img.src = this.net.tileUrl(z, x, y)
      this.tiles.set(key, tile)
      if (this.tiles.size > 220) {
        const oldest = [...this.tiles.entries()].sort((a, b) => a[1].at - b[1].at)[0]
        this.tiles.delete(oldest[0])
      }
    }
    tile.at = performance.now()
    return tile
  }

  drawTiles(ctx) {
    const z = Math.min(MAX_TILE_ZOOM, Math.max(0, Math.round(this.cam.zoom)))
    const k = 2 ** (this.cam.zoom - z)
    const size = TILE * k
    const c = this.world(this.cam.lat, this.cam.lon)
    const left = c[0] - this.width / 2
    const top = c[1] - this.height / 2
    const scale = 2 ** (z - this.cam.zoom) // world pixels at this zoom to pixels at the tile zoom
    const n = 2 ** z
    const x0 = Math.floor((left * scale) / TILE)
    const x1 = Math.floor(((left + this.width) * scale) / TILE)
    const y0 = Math.max(0, Math.floor((top * scale) / TILE))
    const y1 = Math.min(n - 1, Math.floor(((top + this.height) * scale) / TILE))
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wrapped = ((tx % n) + n) % n
        const tile = this.tile(z, wrapped, ty)
        if (!tile.ready) continue
        ctx.drawImage(tile.img, tx * size - left, ty * size - top, size + 0.5, size + 0.5)
      }
    }
  }

  drawGrid(ctx, pal) {
    // a plain sheet with lines every few metres, so turning and placing still work with the map off
    const ppm = this.pixelsPerMetre
    const step = nice(60 / ppm)
    const [e0, n0] = this.unlocal(0, this.height)
    const [e1, n1] = this.unlocal(this.width, 0)
    ctx.strokeStyle = pal.floorLine
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let e = Math.floor(e0 / step) * step; e <= e1; e += step) {
      const a = this.local(e, n0)
      const b = this.local(e, n1)
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
    }
    for (let n = Math.floor(n0 / step) * step; n <= n1; n += step) {
      const a = this.local(e0, n)
      const b = this.local(e1, n)
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
    }
    ctx.stroke()
  }

  // ---------------------------------------------------------------- drawing

  paint() {
    const ctx = this.ctx
    const pal = this.palette
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = pal.name === 'dark' ? '#1b2340' : '#efe6d2'
    ctx.fillRect(0, 0, this.width, this.height)
    const tiles = this.tilesOn()
    if (tiles) this.drawTiles(ctx)
    else this.drawGrid(ctx, pal)
    if (tiles && pal.name === 'dark') {
      ctx.fillStyle = 'rgba(8, 12, 28, 0.35)'
      ctx.fillRect(0, 0, this.width, this.height)
    }
    if (this.mode !== 'pin') {
      this.drawObstacles(ctx, pal)
      this.drawRoom(ctx, pal)
    } else {
      this.drawPin(ctx, pal)
    }
    this.drawNorth(ctx, pal)
    this.drawScale(ctx, pal)
  }

  path(ctx, pts) {
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
  }

  /** The sun now, and which buildings and trees put their shadow on a window at this moment. Kept for as long as the scene is. */
  sunNow() {
    const sc = this.scene
    if (this.sunMemo?.scene !== sc) {
      const sun = sunAt(sc.place, sc.date.month, sc.date.day, sc.minutes)
      const up = sun.elevation > 0
      this.sunMemo = { scene: sc, sun, up, shading: new Set(up ? shadingObstacles(sc, sunInRoom(sc, sun.azimuth, sun.elevation)) : []) }
    }
    return this.sunMemo
  }

  drawObstacles(ctx, pal) {
    const dark = pal.name === 'dark'
    const ppm = this.pixelsPerMetre
    const shading = this.sunNow().shading
    // heights are written after every building is drawn: the selected one first, then the list, which is sorted with
    // the buildings that matter most first, and a height that would land on one already written is left off
    // (a tower made of parts carries one label, not five)
    const labels = []
    this.scene.obstacles.forEach((o, i) => {
      const picked = this.selected === i
      ctx.save()
      if (o.type === 'tree') {
        const [x, y] = this.local(o.x, o.y)
        ctx.globalAlpha = o.on ? 1 : 0.35
        ctx.fillStyle = dark ? 'rgba(110, 190, 120, 0.7)' : 'rgba(80, 150, 80, 0.62)'
        ctx.strokeStyle = picked ? pal.selection : shading.has(i) ? '#e8590c' : dark ? '#9fe0a4' : '#3c7a41'
        ctx.lineWidth = picked ? 3 : shading.has(i) ? 3 : 1.5
        ctx.beginPath()
        ctx.arc(x, y, Math.max(3, o.r * ppm), 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = ctx.strokeStyle
        ctx.beginPath()
        ctx.arc(x, y, 1.6, 0, Math.PI * 2)
        ctx.fill()
      } else {
        const pts = o.ring.map(([e, n]) => this.local(e, n))
        const alpha = Math.min(0.7, 0.22 + o.h / 90)
        ctx.globalAlpha = o.on ? 1 : 0.4
        ctx.fillStyle = dark ? `rgba(150, 165, 205, ${alpha})` : `rgba(96, 104, 130, ${alpha})`
        ctx.strokeStyle = picked ? pal.selection : shading.has(i) ? '#e8590c' : dark ? 'rgba(200, 212, 245, 0.8)' : 'rgba(60, 66, 92, 0.85)'
        ctx.lineWidth = picked ? 3 : shading.has(i) ? 3 : 1.4
        ctx.setLineDash(o.est ? [5, 3] : o.own ? [2, 3] : [])
        this.path(ctx, pts)
        ctx.fill()
        if (shading.has(i)) {
          ctx.fillStyle = 'rgba(232, 89, 12, 0.3)'
          ctx.fill()
        }
        ctx.stroke()
        // a height is written on a building only when the building is big enough on screen to carry it
        const xs = pts.map((p) => p[0])
        const ys = pts.map((p) => p[1])
        const wide = Math.max(...xs) - Math.min(...xs)
        const high = Math.max(...ys) - Math.min(...ys)
        if (picked || (wide >= 46 && high >= 22)) {
          const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
          const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
          ctx.setLineDash([])
          ctx.fillStyle = pal.ink
          ctx.font = `600 11px ${pal.ui}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.lineWidth = 3
          ctx.strokeStyle = dark ? 'rgba(11, 15, 28, 0.85)' : 'rgba(255, 250, 240, 0.9)'
          const label = o.own ? t('map.own') : `${o.est ? '~' : ''}${this.store.ui.units === 'ft' ? `${Math.round(o.h * 3.28084)} ft` : `${Math.round(o.h)} m`}`
          const half = ctx.measureText(label).width / 2 + 3
          labels.push({ index: i, picked, label, cx, cy, box: [cx - half, cy - 8, cx + half, cy + 8] })
        }
      }
      ctx.restore()
    })
    const written = []
    const owners = []
    ctx.save()
    ctx.setLineDash([])
    ctx.fillStyle = pal.ink
    ctx.font = `600 11px ${pal.ui}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = dark ? 'rgba(11, 15, 28, 0.85)' : 'rgba(255, 250, 240, 0.9)'
    for (const l of [...labels].sort((a, b) => Number(b.picked) - Number(a.picked))) {
      if (written.some((b) => l.box[0] < b[2] && l.box[2] > b[0] && l.box[1] < b[3] && l.box[3] > b[1])) continue
      written.push(l.box)
      owners.push(l.index)
      ctx.strokeText(l.label, l.cx, l.cy)
      ctx.fillText(l.label, l.cx, l.cy)
    }
    ctx.restore()
    this.labelBoxes = written
    this.labelOwners = owners
  }

  windowEnds(win) {
    const f = wallFrame(this.scene.room, win.wall)
    const at = (u) => roomToLocal(this.scene, f.o[0] + f.t[0] * u, f.o[1] + f.t[1] * u)
    return [at(win.pos), at(win.pos + win.w)]
  }

  drawRoom(ctx, pal) {
    const scene = this.scene
    const corners = roomCorners(scene).map(([e, n]) => this.local(e, n))
    const ppm = this.pixelsPerMetre
    ctx.save()
    this.path(ctx, corners)
    ctx.fillStyle = pal.name === 'dark' ? 'rgba(255, 196, 80, 0.28)' : 'rgba(255, 190, 60, 0.38)'
    ctx.fill()
    ctx.lineWidth = Math.max(2, scene.room.wall * ppm)
    ctx.strokeStyle = pal.frame
    ctx.lineJoin = 'miter'
    ctx.stroke()
    const centre = this.local(0, 0)
    scene.windows.forEach((win, i) => {
      const [a, b] = this.windowEnds(win).map(([e, n]) => this.local(e, n))
      const picked = i === this.target
      ctx.lineCap = 'butt'
      ctx.lineWidth = Math.max(4, scene.room.wall * ppm * 1.1)
      ctx.strokeStyle = picked ? pal.selection : pal.sun
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.stroke()
      // an arrow out of the window, long enough to read on a phone
      const bearing = wallBearing(scene, win.wall) * RAD
      const dir = [Math.sin(bearing), -Math.cos(bearing)]
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const len = Math.max(26, Math.min(60, 4 * ppm))
      const tip = [mid[0] + dir[0] * len, mid[1] + dir[1] * len]
      ctx.strokeStyle = picked ? pal.selection : pal.accent
      ctx.fillStyle = ctx.strokeStyle
      ctx.lineWidth = picked ? 3.5 : 2.2
      ctx.beginPath()
      ctx.moveTo(mid[0], mid[1])
      ctx.lineTo(tip[0], tip[1])
      ctx.stroke()
      const side = [-dir[1], dir[0]]
      ctx.beginPath()
      ctx.moveTo(tip[0] + dir[0] * 9, tip[1] + dir[1] * 9)
      ctx.lineTo(tip[0] + side[0] * 6, tip[1] + side[1] * 6)
      ctx.lineTo(tip[0] - side[0] * 6, tip[1] - side[1] * 6)
      ctx.closePath()
      ctx.fill()
      ctx.font = `700 12px ${pal.ui}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const label = `${i + 1}: ${bearingText(wallBearing(scene, win.wall))}`
      // clear of the turning ring at the tip, whichever way the arrow points
      const lx = tip[0] + dir[0] * (26 + ctx.measureText(label).width / 2)
      const ly = tip[1] + dir[1] * 28
      ctx.lineWidth = 4
      ctx.strokeStyle = pal.name === 'dark' ? 'rgba(11, 15, 28, 0.9)' : 'rgba(255, 250, 240, 0.92)'
      ctx.strokeText(label, lx, ly)
      ctx.fillStyle = picked ? pal.selection : pal.ink
      ctx.fillText(label, lx, ly)
      if (picked && this.mode === 'facing') {
        // the turning handle, drawn as a ring at the arrow tip
        this.handle = [tip[0] + dir[0] * 9, tip[1] + dir[1] * 9]
        ctx.beginPath()
        ctx.arc(this.handle[0], this.handle[1], 11, 0, Math.PI * 2)
        ctx.fillStyle = pal.name === 'dark' ? 'rgba(138, 182, 255, 0.35)' : 'rgba(43, 95, 217, 0.2)'
        ctx.fill()
        ctx.strokeStyle = pal.selection
        ctx.lineWidth = 2
        ctx.stroke()
      }
    })
    ctx.beginPath()
    ctx.arc(centre[0], centre[1], 3, 0, Math.PI * 2)
    ctx.fillStyle = pal.ink
    ctx.fill()
    ctx.restore()
    this.roomHull = corners
    this.drawSun(ctx, pal, centre)
  }

  /** A line from the room toward where the sun is at the time on the clock, so a building on that line can be spotted by eye. */
  drawSun(ctx, pal, centre) {
    const { sun, up } = this.sunNow()
    if (!up) return
    const az = (sun.azimuth * Math.PI) / 180
    const reach = Math.min(Math.min(this.width, this.height) * 0.42, 150)
    const tip = [centre[0] + Math.sin(az) * reach, centre[1] - Math.cos(az) * reach]
    ctx.save()
    ctx.strokeStyle = pal.sun
    ctx.lineWidth = 2.5
    ctx.setLineDash([2, 6])
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(centre[0], centre[1])
    ctx.lineTo(tip[0], tip[1])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.shadowColor = pal.glow
    ctx.shadowBlur = 14
    ctx.fillStyle = pal.sun
    ctx.beginPath()
    ctx.arc(tip[0], tip[1], 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = pal.sunCore
    ctx.beginPath()
    ctx.arc(tip[0], tip[1], 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  drawPin(ctx, pal) {
    const [x, y] = this.toScreen(this.scene.place.lat, this.scene.place.lon)
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = pal.accent
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(-18, -20, -14, -40, 0, -40)
    ctx.bezierCurveTo(14, -40, 18, -20, 0, 0)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(0, -26, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  drawNorth(ctx, pal) {
    // north is always up on this map, and the badge says so
    const x = this.width - 34
    const y = 40
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = pal.name === 'dark' ? 'rgba(19, 26, 45, 0.9)' : 'rgba(255, 250, 240, 0.92)'
    ctx.strokeStyle = pal.muted
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, 21, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = pal.accent
    ctx.beginPath()
    ctx.moveTo(0, -17)
    ctx.lineTo(6, 4)
    ctx.lineTo(0, 0)
    ctx.lineTo(-6, 4)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = pal.ink
    ctx.font = `800 11px ${pal.ui}`
    ctx.textAlign = 'center'
    ctx.fillText(t('compass.N'), 0, 17)
    ctx.restore()
  }

  drawScale(ctx, pal) {
    const ppm = this.pixelsPerMetre
    const metres = nice(80 / ppm)
    const len = metres * ppm
    const x = 14
    const y = this.height - 16
    ctx.save()
    ctx.strokeStyle = pal.name === 'dark' ? 'rgba(11, 15, 28, 0.85)' : 'rgba(255, 250, 240, 0.9)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + len, y)
    ctx.stroke()
    ctx.strokeStyle = pal.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - 4)
    ctx.lineTo(x, y + 4)
    ctx.moveTo(x, y)
    ctx.lineTo(x + len, y)
    ctx.moveTo(x + len, y - 4)
    ctx.lineTo(x + len, y + 4)
    ctx.stroke()
    ctx.font = `600 11px ${pal.ui}`
    ctx.fillStyle = pal.ink
    ctx.textAlign = 'left'
    ctx.lineWidth = 3
    ctx.strokeStyle = pal.name === 'dark' ? 'rgba(11, 15, 28, 0.85)' : 'rgba(255, 250, 240, 0.9)'
    const label = lengthText(metres, this.store.ui.units)
    ctx.strokeText(label, x, y - 9)
    ctx.fillText(label, x, y - 9)
    ctx.restore()
  }

  // ---------------------------------------------------------------- picking

  hitRoom(x, y) {
    const poly = this.roomHull
    if (!poly) return false
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }

  hitObstacle(x, y) {
    const [e, n] = this.unlocal(x, y)
    let found = null
    this.scene.obstacles.forEach((o, i) => {
      if (o.type === 'tree') {
        if (Math.hypot(e - o.x, n - o.y) <= Math.max(o.r, 3 / this.pixelsPerMetre)) found = i
      } else {
        let inside = false
        const ring = o.ring
        for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
          const [xa, ya] = ring[a]
          const [xb, yb] = ring[b]
          if (ya > n !== yb > n && e < ((xb - xa) * (n - ya)) / (yb - ya) + xa) inside = !inside
        }
        if (inside) found = i
      }
    })
    return found
  }

  // ---------------------------------------------------------------- input

  bind() {
    const c = this.canvas
    c.style.touchAction = 'none'
    c.addEventListener('pointerdown', (e) => this.down(e))
    c.addEventListener('pointermove', (e) => this.move(e))
    c.addEventListener('pointerup', (e) => this.up(e))
    c.addEventListener('pointercancel', (e) => this.up(e, true))
    c.addEventListener('wheel', (e) => {
      e.preventDefault()
      const r = c.getBoundingClientRect()
      this.zoomBy(-Math.sign(e.deltaY) * 0.5, [e.clientX - r.left, e.clientY - r.top])
    }, { passive: false })
    c.addEventListener('dblclick', (e) => {
      const r = c.getBoundingClientRect()
      this.zoomBy(1, [e.clientX - r.left, e.clientY - r.top])
    })
    c.addEventListener('keydown', (e) => this.key(e))
  }

  point(e) {
    const r = this.canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  down(e) {
    this.canvas.focus({ preventScroll: true })
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      // a pointer that is already gone cannot be captured, and the gesture still works
    }
    const p = this.point(e)
    this.pointers.set(e.pointerId, { x: p[0], y: p[1], sx: p[0], sy: p[1], at: performance.now() })
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), angle: this.angle(a, b) }
      return
    }
    if (this.pointers.size > 2) return
    this.gesture = { kind: 'pan', moved: 0 }
    if (this.mode === 'facing') {
      if (this.handle && Math.hypot(p[0] - this.handle[0], p[1] - this.handle[1]) < 22) this.gesture = { kind: 'turn', moved: 0 }
      else if (this.hitRoom(p[0], p[1])) this.gesture = { kind: 'room', moved: 0, last: this.unlocal(p[0], p[1]) }
    } else if (this.mode === 'surround') {
      const hit = this.hitObstacle(p[0], p[1])
      const o = hit != null ? this.scene.obstacles[hit] : null
      if (hit != null && hit === this.selected && o.src === 'manual') this.gesture = { kind: 'obstacle', index: hit, moved: 0, last: this.unlocal(p[0], p[1]) }
    }
  }

  angle(a, b) {
    return (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI
  }

  move(e) {
    const known = this.pointers.get(e.pointerId)
    if (!known) return
    const p = this.point(e)
    const dx = p[0] - known.x
    const dy = p[1] - known.y
    known.x = p[0]
    known.y = p[1]
    const g = this.gesture
    if (!g) return
    if (g.kind === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const angle = this.angle(a, b)
      const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2]
      if (g.dist > 8) this.zoomTo(this.cam.zoom + Math.log2(dist / g.dist), mid)
      if (this.mode === 'facing') {
        let delta = angle - g.angle
        if (delta > 180) delta -= 360
        if (delta < -180) delta += 360
        if (Math.abs(delta) > 0.05) this.on.turnBy?.(delta)
      }
      g.dist = dist
      g.angle = angle
      return
    }
    g.moved += Math.abs(dx) + Math.abs(dy)
    if (g.kind === 'pan') this.panBy(dx, dy)
    else if (g.kind === 'room') {
      const now = this.unlocal(p[0], p[1])
      this.on.moveRoom?.(now[0] - g.last[0], now[1] - g.last[1])
      g.last = this.unlocal(p[0], p[1])
    } else if (g.kind === 'obstacle') {
      const now = this.unlocal(p[0], p[1])
      this.on.moveObstacle?.(g.index, now[0] - g.last[0], now[1] - g.last[1])
      g.last = this.unlocal(p[0], p[1])
    } else if (g.kind === 'turn') {
      const [e0, n0] = this.unlocal(p[0], p[1])
      this.on.turnTo?.((((Math.atan2(e0, n0) / RAD) % 360) + 360) % 360)
    }
  }

  up(e, cancelled = false) {
    const known = this.pointers.get(e.pointerId)
    this.pointers.delete(e.pointerId)
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId)
    const g = this.gesture
    if (this.pointers.size === 0) this.gesture = null
    else if (this.pointers.size === 1 && g?.kind === 'pinch') this.gesture = { kind: 'pan', moved: 99 }
    if (cancelled || !known || !g || g.kind === 'pinch' || g.moved > 6 || performance.now() - known.at > 1000) return
    // a tap
    const x = known.x
    const y = known.y
    if (this.mode === 'pin') {
      const ll = this.fromScreen(x, y)
      this.on.pin?.(ll.lat, ll.lon)
    } else if (this.mode === 'surround') {
      const hit = this.hitObstacle(x, y)
      this.selected = hit
      this.on.select?.(hit)
      this.invalidate()
    }
  }

  key(e) {
    // in the facing step Shift and an arrow move the room itself, half a metre at a time (a quarter with Alt)
    if (this.mode === 'facing' && e.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault()
      const by = e.altKey ? 0.25 : 0.5
      this.on.moveRoom?.({ ArrowLeft: -by, ArrowRight: by }[e.key] ?? 0, { ArrowUp: by, ArrowDown: -by }[e.key] ?? 0)
      return
    }
    const step = e.shiftKey ? 120 : 40
    const move = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]
    if (move) {
      e.preventDefault()
      this.panBy(move[0], move[1])
    } else if (e.key === '+' || e.key === '=') this.zoomBy(0.5)
    else if (e.key === '-' || e.key === '_') this.zoomBy(-0.5)
    else if (this.mode === 'facing' && (e.key === '[' || e.key === ']')) {
      e.preventDefault()
      this.on.turnBy?.((e.key === ']' ? 1 : -1) * (e.shiftKey ? 15 : 1))
    }
  }
}

