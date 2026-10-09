// Form controls that read and write the scene: a number box with a slider,
// and a compass dial.

import { h, clamp } from './dom.js'
import { t } from './i18n.js'
import { toUnit, fromUnit, trim, bearingText } from './format.js'

let counter = 0

/**
 * A labelled number with a slider. `get` reads the scene, `set` writes a draft.
 * kind 'len' converts to the chosen unit, 'num' and 'deg' do not.
 */
export function numberField({ store, label, kind = 'len', min, max, step, get, set, key, places, compact = false }) {
  const id = `f${++counter}`
  const range = h('input', { type: 'range', id, 'aria-label': label })
  const num = h('input', { type: 'number', inputMode: 'decimal', 'aria-label': label })
  const el = compact ? h('div', { class: 'field compact' }, h('label', { htmlFor: id }, label), num) : h('div', { class: 'field' }, h('label', { htmlFor: id }, label), range, num)
  num.id = compact ? id : ''
  const units = () => (kind === 'len' ? store.ui.units : 'm')
  const show = (v) => (kind === 'len' ? toUnit(v, units()) : v)
  const digits = places ?? (kind === 'len' ? (units() === 'ft' ? 1 : 2) : 0)
  const lim = (v) => (typeof v === 'function' ? v(store.scene) : v)
  const stepFor = () => (kind === 'len' ? (units() === 'ft' ? 0.1 : step ?? 0.05) : step ?? 1)

  function apply(raw) {
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    const internal = kind === 'len' ? fromUnit(value, units()) : value
    store.update((draft) => set(draft, clamp(internal, lim(min), lim(max))), { key: key ?? id })
  }
  range.addEventListener('input', () => apply(range.value))
  num.addEventListener('change', () => apply(num.value))
  num.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') apply(num.value)
  })

  function sync() {
    const lo = show(lim(min))
    const hi = show(lim(max))
    const s = stepFor()
    for (const input of compact ? [num] : [range, num]) {
      input.min = trim(lo, 3)
      input.max = trim(hi, 3)
      input.step = s
    }
    const v = show(get(store.scene))
    if (!compact) range.value = v
    if (document.activeElement !== num) num.value = trim(v, digits)
  }
  sync()
  return { el, sync }
}

/** A compass dial. Drag the needle or use the arrow keys. `onChange(bearing)` gets whole degrees. */
export function compassDial({ get, onChange, label }) {
  const NS = 'http://www.w3.org/2000/svg'
  const size = 164
  const c = size / 2
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
  svg.setAttribute('width', size)
  svg.setAttribute('height', size)
  svg.setAttribute('class', 'dial')
  svg.setAttribute('role', 'slider')
  svg.setAttribute('tabindex', '0')
  svg.setAttribute('aria-label', label)
  svg.setAttribute('aria-valuemin', '0')
  svg.setAttribute('aria-valuemax', '359')
  const part = (tag, attrs) => {
    const node = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    svg.append(node)
    return node
  }
  part('circle', { cx: c, cy: c, r: 70, fill: 'var(--surface)', stroke: 'var(--line)', 'stroke-width': 2, class: 'ring' })
  for (let a = 0; a < 360; a += 15) {
    const r1 = a % 90 === 0 ? 58 : a % 45 === 0 ? 62 : 65
    const rad = (a * Math.PI) / 180
    part('line', { x1: c + Math.sin(rad) * r1, y1: c - Math.cos(rad) * r1, x2: c + Math.sin(rad) * 69, y2: c - Math.cos(rad) * 69, stroke: 'var(--muted)', 'stroke-width': a % 90 === 0 ? 2 : 1, opacity: 0.7 })
  }
  for (const [k, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    const rad = (a * Math.PI) / 180
    const text = part('text', { x: c + Math.sin(rad) * 47, y: c - Math.cos(rad) * 47 + 4, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: k === 'N' ? 'var(--accent)' : 'var(--muted)' })
    text.dataset.compass = k
  }
  const needle = part('g', {})
  const arrow = document.createElementNS(NS, 'path')
  arrow.setAttribute('d', `M${c} ${c - 56}L${c + 9} ${c + 6}L${c} ${c - 2}L${c - 9} ${c + 6}Z`)
  arrow.setAttribute('fill', 'var(--sun)')
  arrow.setAttribute('stroke', 'var(--accent)')
  arrow.setAttribute('stroke-width', 2)
  arrow.setAttribute('stroke-linejoin', 'round')
  needle.append(arrow)
  const hub = document.createElementNS(NS, 'circle')
  hub.setAttribute('cx', c)
  hub.setAttribute('cy', c)
  hub.setAttribute('r', 4)
  hub.setAttribute('fill', 'var(--ink)')
  needle.append(hub)

  function sync() {
    const b = get()
    needle.setAttribute('transform', `rotate(${b} ${c} ${c})`)
    svg.setAttribute('aria-valuenow', String(Math.round(b)))
    svg.setAttribute('aria-valuetext', bearingText(b))
    svg.querySelectorAll('[data-compass]').forEach((n) => (n.textContent = t(`compass.${n.dataset.compass}`)))
  }
  const fromPointer = (e) => {
    const r = svg.getBoundingClientRect()
    const x = e.clientX - (r.left + r.width / 2)
    const y = e.clientY - (r.top + r.height / 2)
    let deg = (Math.atan2(x, -y) * 180) / Math.PI
    if (deg < 0) deg += 360
    onChange(Math.round(e.shiftKey ? Math.round(deg / 15) * 15 : deg) % 360)
  }
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId)
    fromPointer(e)
  })
  svg.addEventListener('pointermove', (e) => {
    if (svg.hasPointerCapture(e.pointerId)) fromPointer(e)
  })
  svg.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 15 : 1
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    onChange((((Math.round(get()) + dir * step) % 360) + 360) % 360)
  })
  sync()
  return { el: svg, sync }
}
