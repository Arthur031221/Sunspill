// Tracing a floor plan picture: choose it, tell the scale with two taps, tap
// three corners for the room and the ends of its windows and doors.

import { h } from './dom.js'
import { t } from './i18n.js'
import { PictureCanvas, loadPicture, dot } from './picture.js'
import { scaleFromPoints, rectFromCorners, openingFromTaps } from '../core/trace.js'
import { fromUnit, lengthText } from './format.js'
import { LIMITS, MAX_WINDOWS, MAX_DOORS } from '../core/room.js'

const STEPS = ['pick', 'scale', 'corners', 'openings']

/**
 * @param options.pane  the element over the stage that shows the picture
 * @param options.card  the element for the instructions
 * @param options.store the scene store
 * @param options.done  called when the trace is applied or cancelled
 * @param options.toast shows a short message
 */
export function openTrace({ pane, card, store, done, toast }) {
  const state = { step: 'pick', canvas: null, scalePts: [], ppm: null, corners: [], openings: [], kind: 'window', pendingOpening: null, rect: null }
  pane.hidden = false
  const picture = new PictureCanvas({
    root: pane,
    draw: (ctx, view) => paint(ctx, view),
    onTap: (p) => tap(p),
    onHandle: (id, p) => drag(id, p),
  })

  const units = () => store.ui.units

  function rectNow() {
    if (state.corners.length < 3 || !state.ppm) return null
    return rectFromCorners(state.corners[0], state.corners[1], state.corners[2], state.ppm)
  }

  function paint(ctx, view) {
    const S = (p) => view.toScreen(p)
    ctx.save()
    ctx.lineJoin = 'round'
    if (state.scalePts.length) {
      ctx.strokeStyle = '#2b5fd9'
      ctx.lineWidth = 3
      ctx.beginPath()
      state.scalePts.forEach((p, i) => (i ? ctx.lineTo(...S(p)) : ctx.moveTo(...S(p))))
      ctx.stroke()
      state.scalePts.forEach((p, i) => dot(ctx, S(p), String.fromCharCode(65 + i), '#2b5fd9'))
    }
    const r = rectNow()
    if (r) {
      ctx.strokeStyle = '#c2410c'
      ctx.fillStyle = 'rgba(245, 165, 36, 0.22)'
      ctx.lineWidth = 3
      ctx.beginPath()
      r.corners.forEach((p, i) => (i ? ctx.lineTo(...S(p)) : ctx.moveTo(...S(p))))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    state.corners.forEach((p, i) => dot(ctx, S(p), i + 1))
    if (r) {
      for (const o of state.openings) {
        const a = S(r.toPicture(o.a))
        const b = S(r.toPicture(o.b))
        ctx.strokeStyle = o.kind === 'door' ? '#7c5a2f' : '#2b8ad9'
        ctx.lineWidth = 7
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(...a)
        ctx.lineTo(...b)
        ctx.stroke()
      }
    }
    if (state.pendingOpening) dot(ctx, S(r ? r.toPicture(state.pendingOpening) : state.pendingOpening), '•', '#2b8ad9')
    ctx.restore()
    picture.handles = [
      ...(state.step === 'scale' ? state.scalePts.map((at, i) => ({ id: `s${i}`, at })) : []),
      ...(state.step === 'corners' ? state.corners.map((at, i) => ({ id: `c${i}`, at })) : []),
    ]
  }

  function drag(id, p) {
    const i = Number(id.slice(1))
    if (id[0] === 's') state.scalePts[i] = p
    else state.corners[i] = p
    render()
    picture.invalidate()
  }

  function tap(p) {
    if (state.step === 'scale' && state.scalePts.length < 2) state.scalePts.push(p)
    else if (state.step === 'corners' && state.corners.length < 3) state.corners.push(p)
    else if (state.step === 'openings') {
      const r = rectNow()
      if (!r) return
      const q = r.toRoom(p)
      if (!state.pendingOpening) {
        state.pendingOpening = q
      } else {
        const found = openingFromTaps({ w: r.w, d: r.d }, state.pendingOpening, q)
        state.pendingOpening = null
        if (!found) toast(t('trace.noWall'))
        else {
          state.openings.push({ ...found, kind: state.kind, a: wallPoint(r, found, 0), b: wallPoint(r, found, 1) })
        }
      }
    } else return
    render()
    picture.invalidate()
  }

  /** The two ends of an opening as room points, to draw it on the picture. */
  function wallPoint(r, o, end) {
    const room = { w: r.w, d: r.d }
    const u = o.pos + (end ? o.w : 0)
    const at = { top: [u, room.d], bottom: [room.w - u, 0], right: [room.w, room.d - u], left: [0, u] }[o.wall]
    return at
  }

  function go(step) {
    state.step = step
    render()
    picture.invalidate()
  }

  function cancel() {
    picture.observer.disconnect()
    pane.hidden = true
    pane.replaceChildren()
    done(false)
  }

  function apply() {
    const r = rectNow()
    if (!r) return
    store.update((d) => {
      d.room.w = r.w
      d.room.d = r.d
      d.checks = []
    })
    const windows = state.openings.filter((o) => o.kind === 'window').slice(0, MAX_WINDOWS)
    const doors = state.openings.filter((o) => o.kind === 'door').slice(0, MAX_DOORS)
    store.update((d) => {
      if (windows.length) {
        d.windows = windows.map((o) => (o.w >= 1.9 ? { wall: o.wall, pos: o.pos, w: o.w, h: 2.1, sill: 0, eave: { depth: 0, gap: 0.15, ext: 0.3 }, across: null, balcony: null } : { wall: o.wall, pos: o.pos, w: o.w, h: 1.3, sill: 0.9, eave: { depth: 0, gap: 0.15, ext: 0.3 }, across: null, balcony: null }))
      }
      if (state.openings.some((o) => o.kind === 'door')) d.doors = doors.map((o) => ({ wall: o.wall, pos: o.pos, w: o.w }))
    })
    picture.observer.disconnect()
    pane.hidden = true
    pane.replaceChildren()
    done(true)
  }

  function render() {
    const index = STEPS.indexOf(state.step)
    const bar = h('ol', { class: 'trace-steps' }, ...STEPS.map((s, i) => h('li', { 'aria-current': i === index ? 'step' : null, class: i < index ? 'done' : '' }, t(`trace.step.${s}`))))
    const body = []
    if (state.step === 'pick') {
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true })
      file.addEventListener('change', async () => {
        const f = file.files?.[0]
        if (!f) return
        try {
          state.canvas = await loadPicture(f)
          picture.setImage(state.canvas)
          go('scale')
        } catch {
          toast(t('trace.badPicture'))
        }
      })
      body.push(h('p', {}, t('trace.pick')), h('button', { class: 'btn primary block', type: 'button', onclick: () => file.click() }, t('trace.choose')), file, h('p', { class: 'note' }, t('trace.privacy')))
    } else if (state.step === 'scale') {
      body.push(h('p', {}, t('trace.scaleHelp')))
      if (state.scalePts.length === 2) {
        const unit = units() === 'ft' ? 'ft' : 'm'
        const input = h('input', { type: 'number', inputMode: 'decimal', min: '0.1', step: 'any', 'aria-label': t('trace.distance', { unit }), value: state.distance ?? '' })
        input.addEventListener('input', () => { state.distance = input.value })
        body.push(h('div', { class: 'field', style: 'grid-template-columns:1fr 110px' }, h('label', {}, t('trace.distance', { unit })), input))
        body.push(h('button', {
          class: 'btn primary block', type: 'button',
          onclick: () => {
            const metres = fromUnit(Number(input.value), units())
            const ppm = scaleFromPoints(state.scalePts[0], state.scalePts[1], metres)
            if (!ppm) return toast(t('trace.badScale'))
            state.ppm = ppm
            go('corners')
          },
        }, t('trace.setScale')))
      } else body.push(h('p', { class: 'note' }, t('trace.scaleTaps', { n: state.scalePts.length })))
      body.push(h('button', { class: 'btn block', type: 'button', onclick: () => { state.scalePts = []; render(); picture.invalidate() } }, t('trace.clear')))
    } else if (state.step === 'corners') {
      body.push(h('p', {}, t('trace.cornersHelp')))
      const r = rectNow()
      if (r) body.push(h('p', { class: 'big-line' }, t('trace.size', { w: lengthText(r.w, units()), d: lengthText(r.d, units()) })), h('p', { class: 'note' }, r.w < LIMITS.room.w[0] || r.d < LIMITS.room.d[0] || r.w > LIMITS.room.w[1] || r.d > LIMITS.room.d[1] ? t('trace.sizeRange') : t('trace.dragHint')))
      else body.push(h('p', { class: 'note' }, t('trace.cornerTaps', { n: state.corners.length })))
      body.push(h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { state.corners = []; render(); picture.invalidate() } }, t('trace.clear')),
        h('button', { class: 'btn primary', type: 'button', disabled: !r, onclick: () => go('openings') }, t('trace.next'))))
    } else {
      body.push(h('p', {}, t('trace.openHelp')))
      body.push(h('div', { class: 'seg', role: 'group', 'aria-label': t('trace.kind') }, ...['window', 'door'].map((k) => h('button', { type: 'button', 'aria-pressed': String(state.kind === k), onclick: () => { state.kind = k; state.pendingOpening = null; render(); picture.invalidate() } }, t(`trace.${k}`)))))
      if (state.pendingOpening) body.push(h('p', { class: 'note' }, t('trace.secondTap')))
      body.push(...state.openings.map((o, i) => h('div', { class: 'spot' }, h('span', { class: 'n' }, i + 1), h('span', {}, t('trace.found', { kind: t(`trace.${o.kind}`), wall: t(`wall.${o.wall}`), at: lengthText(o.pos, units()), w: lengthText(o.w, units()) })), h('button', { class: 'mini', type: 'button', onclick: () => { state.openings.splice(i, 1); render(); picture.invalidate() } }, t('things.remove')))))
      body.push(h('button', { class: 'btn primary block', type: 'button', onclick: apply }, t('trace.apply')))
    }
    body.push(h('button', { class: 'btn block', type: 'button', onclick: cancel }, t('trace.cancel')))
    card.replaceChildren(h('h2', {}, t('trace.title')), bar, ...body)
  }

  render()
  return { close: cancel }
}
