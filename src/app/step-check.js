// Steps 6 and 7: furniture (place, move, turn, see the sun land on it) and the
// check against reality (mark where the sun really was, or lay a photo of the
// floor under the plan, see how far the model is off and fit it).

import { h } from './dom.js'
import { t } from './i18n.js'
import { numberField } from './fields.js'
import { clock, dateText, duration, monthName, lengthText } from './format.js'
import { ITEM_KINDS, ITEM_SIZES, MAX_ITEMS, MAX_CHECKS, daysInMonth } from '../core/room.js'
import { itemSunHours } from './frame.js'
import { compareCheck, fitScene, shiftAlongWall } from '../core/fit.js'
import { flattenPhoto } from '../core/trace.js'
import { PictureCanvas, loadPicture, dot } from './picture.js'

export function thingsStep(ctx) {
  const { store, stage, toast } = ctx
  const fields = []
  const palette = h('div', { class: 'chips', role: 'group', 'aria-label': t('things.title') })
  for (const kind of ITEM_KINDS) {
    palette.append(h('button', {
      class: 'chip fixed', type: 'button', dataset: { kind },
      onclick: () => {
        if (store.scene.items.length >= MAX_ITEMS) return toast(t('things.max'))
        store.update((d) => {
          const size = ITEM_SIZES[kind]
          d.items.push({ kind, x: Math.max(0, (d.room.w - size.w) / 2), y: Math.max(0, (d.room.d - size.d) / 2), rot: 0, ...size })
        })
        const index = store.scene.items.length - 1
        stage.select({ type: 'item', index })
        store.setUi({ selected: { type: 'item', index } })
      },
    }, `+ ${t(`kind.${kind}`)}`))
  }
  const detail = h('div', {})
  const list = h('div', { class: 'item-list' })
  let shape = ''

  function renderDetail() {
    fields.length = 0
    const sel = store.ui.selected
    const i = sel?.type === 'item' ? sel.index : null
    const item = i != null ? store.scene.items[i] : null
    if (!item) {
      detail.replaceChildren(h('p', { class: 'note' }, t('wiz.things.pick')))
      return
    }
    const add = (opts) => {
      const f = numberField({ store, compact: true, ...opts })
      fields.push(f)
      return f.el
    }
    const turn = (deg) => store.update((d) => { d.items[i].rot = (((d.items[i].rot + deg) % 360) + 360) % 360 }, { key: `rot${i}` })
    detail.replaceChildren(h('div', { class: 'card selected' },
      h('div', { class: 'card-head' }, h('b', {}, t(`kind.${item.kind}`)), h('button', { class: 'mini', type: 'button', onclick: () => { store.update((d) => { d.items.splice(i, 1) }); store.setUi({ selected: null }); stage.select(null) } }, t('things.remove'))),
      add({ label: t('wiz.things.turn'), kind: 'deg', min: 0, max: 359, step: 1, places: 0, get: (s) => s.items[i]?.rot ?? 0, set: (d, v) => { if (d.items[i]) d.items[i].rot = v }, key: `rot${i}` }),
      h('div', { class: 'row turn' }, ...[-90, -15, 15, 90].map((n) => h('button', { class: 'btn', type: 'button', onclick: () => turn(n) }, `${n > 0 ? '+' : '−'}${Math.abs(n)}°`))),
      h('div', { class: 'grid2' },
        add({ label: t('f.itemWidth'), min: 0.1, max: (s) => Math.min(4, s.room.w), step: 0.05, get: (s) => s.items[i]?.w ?? 1, set: (d, v) => { if (d.items[i]) d.items[i].w = v }, key: `i${i}.w` }),
        add({ label: t('f.itemDepth'), min: 0.1, max: (s) => Math.min(4, s.room.d), step: 0.05, get: (s) => s.items[i]?.d ?? 1, set: (d, v) => { if (d.items[i]) d.items[i].d = v }, key: `i${i}.d` }),
        add({ label: t('f.itemHeight'), min: 0.05, max: (s) => s.room.h, step: 0.05, get: (s) => s.items[i]?.h ?? 1, set: (d, v) => { if (d.items[i]) d.items[i].h = v }, key: `i${i}.h` })),
      h('p', { class: 'note', id: 'item-sun' })))
  }

  function sync() {
    const s = store.scene
    const sel = store.ui.selected?.type === 'item' ? store.ui.selected.index : null
    const key = `${s.items.length}|${sel}`
    if (key !== shape) {
      shape = key
      renderDetail()
      list.replaceChildren(...s.items.map((it, i) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(i === sel), onclick: () => { stage.select({ type: 'item', index: i }); store.setUi({ selected: { type: 'item', index: i } }) } }, t(`kind.${it.kind}`))))
    }
    fields.forEach((f) => f.sync())
    const line = detail.querySelector('#item-sun')
    if (line && sel != null) {
      const hours = itemSunHours(s)[sel]
      line.textContent = hours == null ? '' : t('things.sunTop', { t: duration(hours), date: dateText(s.date.month, s.date.day) })
    }
    palette.querySelectorAll('button').forEach((b) => { b.disabled = s.items.length >= MAX_ITEMS })
  }

  const el = h('section', { class: 'wiz-step' }, h('p', {}, t('wiz.things.intro')), palette, h('h3', {}, t('wiz.things.onPlan')), list, detail, h('p', { class: 'note' }, t('wiz.things.keys')))
  return { el, sync }
}

/** The shift of the marked patch from the model, in words. */
function shiftText(scene, shift, windowIndex, units) {
  const wall = scene.windows[windowIndex]?.wall ?? 'top'
  const { lateral, depth } = shiftAlongWall(scene.room, wall, shift)
  const side = Math.abs(lateral) < 0.03 ? null : lateral > 0 ? t('wiz.check.right', { d: lengthText(Math.abs(lateral), units) }) : t('wiz.check.left', { d: lengthText(Math.abs(lateral), units) })
  const away = Math.abs(depth) < 0.03 ? null : depth > 0 ? t('wiz.check.farther', { d: lengthText(Math.abs(depth), units) }) : t('wiz.check.nearer', { d: lengthText(Math.abs(depth), units) })
  if (!side && !away) return t('wiz.check.same')
  return t('wiz.check.shift', { where: [side, away].filter(Boolean).join(', ') })
}

export function checkStep(ctx) {
  const { store, stage, toast, overlay } = ctx
  // marks that are not saved yet survive a rebuild of the step (a new language, new units)
  const draft = (ctx.draft ??= { points: [], marking: false })
  let points = draft.points
  let marking = draft.marking
  let fit = null
  let photo = Boolean(overlay.underlay)
  let session = null
  let gone = false

  const month = h('select', { class: 'select', 'aria-label': t('date.month') }, ...Array.from({ length: 12 }, (_, i) => h('option', { value: i + 1 }, monthName(i + 1))))
  const day = h('input', { type: 'number', min: 1, max: 31, 'aria-label': t('date.day'), class: 'num-in' })
  const time = h('input', { type: 'time', 'aria-label': t('dock.time'), step: 60 })
  const setWhen = () => {
    const [hh, mm] = (time.value || '12:00').split(':').map(Number)
    store.update((d) => {
      d.date.month = Number(month.value)
      d.date.day = Math.min(daysInMonth(d.date.month), Math.max(1, Number(day.value) || 1))
      d.minutes = hh * 60 + (mm || 0)
    }, { history: false })
    points = draft.points = []
    fit = null
    refreshOverlay()
    sync()
  }
  month.addEventListener('change', setWhen)
  day.addEventListener('change', setWhen)
  time.addEventListener('change', setWhen)

  const markBtn = h('button', { class: 'btn primary block', type: 'button', id: 'mark-toggle', 'aria-pressed': 'false', onclick: () => setMarking(!marking) }, t('wiz.check.mark'))
  const pointsLine = h('p', { class: 'note', role: 'status' })
  const undoPoint = h('button', { class: 'btn', type: 'button', onclick: () => { points.pop(); refreshOverlay(); sync() } }, t('wiz.check.undoPoint'))
  const clearPoints = h('button', { class: 'btn', type: 'button', onclick: () => { points = draft.points = []; refreshOverlay(); sync() } }, t('trace.clear'))
  const savePatch = h('button', { class: 'btn primary', type: 'button', id: 'save-patch', onclick: save }, t('wiz.check.save'))
  const photoCard = h('div', { hidden: true })
  const photoBtn = h('button', { class: 'btn block', type: 'button', id: 'photo-open', onclick: startPhoto }, t('wiz.check.photo'))
  const photoOff = h('button', { class: 'btn block', type: 'button', onclick: () => { overlay.underlay = null; photo = null; refreshOverlay(); sync() } }, t('wiz.check.photoOff'))
  const checksList = h('div', {})
  const verdict = h('div', { class: 'verdict' })
  const fitBtn = h('button', { class: 'btn primary block', type: 'button', id: 'fit-run', onclick: runFit }, t('wiz.check.fit'))
  const fitOut = h('div', {})

  function setMarking(on) {
    marking = draft.marking = on
    markBtn.setAttribute('aria-pressed', String(on))
    stage.setTool(on ? { onPoint: (x, y) => { points.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]); refreshOverlay(); sync() } } : null)
    sync()
  }

  function refreshOverlay() {
    overlay.marks = { points, saved: store.scene.checks.map((c) => c.poly) }
    stage.invalidate()
  }

  function save() {
    if (points.length < 3) return
    if (store.scene.checks.length >= MAX_CHECKS) return toast(t('wiz.check.max'))
    const s = store.scene
    store.update((d) => { d.checks.push({ month: s.date.month, day: s.date.day, minutes: s.minutes, poly: points.map(([x, y]) => [x, y]) }) })
    points = draft.points = []
    fit = null
    setMarking(false)
    refreshOverlay()
    toast(t('wiz.check.saved'))
    sync()
  }

  function startPhoto() {
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true })
    input.addEventListener('change', async () => {
      const f = input.files?.[0]
      if (!f) return
      let canvas
      try {
        canvas = await loadPicture(f)
      } catch {
        return toast(t('trace.badPicture'))
      }
      if (gone) return
      beginCorners(canvas)
    })
    document.body.append(input)
    input.click()
    input.remove()
  }

  function beginCorners(canvas) {
    const taps = []
    ctx.showTrace(true)
    ctx.tracepane.hidden = false
    photoCard.hidden = false
    const instruction = h('p', {})
    const skip = h('button', { class: 'btn block', type: 'button', onclick: () => finish(null) }, t('trace.cancel'))
    const render = () => {
      instruction.textContent = taps.length < 4 ? t('wiz.photo.tap', { n: taps.length + 1, corner: t(`wiz.photo.corner.${taps.length + 1}`) }) : t('wiz.photo.flattening')
    }
    session = { end: () => finish(null) }
    const pic = new PictureCanvas({
      root: ctx.tracepane,
      draw: (c2, view) => {
        taps.forEach((p, i) => dot(c2, view.toScreen(p), i + 1))
        if (taps.length > 1) {
          c2.save()
          c2.strokeStyle = '#c2410c'
          c2.lineWidth = 3
          c2.beginPath()
          taps.forEach((p, i) => (i ? c2.lineTo(...view.toScreen(p)) : c2.moveTo(...view.toScreen(p))))
          if (taps.length === 4) c2.closePath()
          c2.stroke()
          c2.restore()
        }
      },
      onTap: (p) => {
        if (taps.length >= 4) return
        taps.push(p)
        render()
        pic.invalidate()
        if (taps.length === 4) finish(taps)
      },
    })
    pic.setImage(canvas)
    render()
    photoCard.replaceChildren(h('h2', {}, t('wiz.check.photo')), instruction, h('p', { class: 'note' }, t('wiz.photo.order')), skip)
    function finish(corners) {
      session = null
      pic.observer.disconnect()
      ctx.tracepane.hidden = true
      ctx.tracepane.replaceChildren()
      ctx.showTrace(false)
      photoCard.hidden = true
      if (!corners) return
      const { room } = store.scene
      const width = 480
      const height = Math.max(40, Math.round((width * room.d) / room.w))
      const src = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
      const flat = flattenPhoto(src, corners, room, width, height)
      if (!flat) return toast(t('wiz.photo.bad'))
      const out = document.createElement('canvas')
      out.width = width
      out.height = height
      out.getContext('2d').putImageData(new ImageData(flat.data, width, height), 0, 0)
      overlay.underlay = { canvas: out, alpha: 0.8 }
      photo = true
      refreshOverlay()
      toast(t('wiz.photo.ready'))
      sync()
    }
  }

  function runFit() {
    const s = store.scene
    fit = fitScene(s, s.checks)
    renderFit()
  }

  function renderFit() {
    if (!fit) {
      fitOut.replaceChildren()
      return
    }
    const s = store.scene
    const pct = (v) => `${Math.round(v * 100)}%`
    const lines = [h('p', { class: 'big-line' }, t('wiz.fit.overlap', { a: pct(fit.meanBefore), b: pct(fit.meanAfter) }))]
    if (fit.meanAfter - fit.meanBefore < 0.02) lines.push(h('p', {}, t('wiz.fit.nothing')))
    else {
      lines.push(h('p', {}, fit.dFacing === 0 ? t('wiz.fit.noTurn') : t('wiz.fit.turn', { deg: `${fit.dFacing > 0 ? '+' : '−'}${Math.abs(fit.dFacing).toFixed(1)}°`, to: `${Math.round(fit.scene.facing)}°` })))
      if (fit.mode === 'facing+window') lines.push(h('p', {}, t('wiz.fit.window', { n: fit.window + 1, slide: lengthText(Math.abs(fit.dPos), store.ui.units), side: fit.dPos > 0 ? t('wiz.fit.right') : t('wiz.fit.left'), sill: lengthText(Math.abs(fit.dSill), store.ui.units), dir: fit.dSill > 0 ? t('wiz.fit.higher') : t('wiz.fit.lower') })))
      else lines.push(h('p', { class: 'note' }, s.checks.length < 2 ? t('wiz.fit.oneCheck') : t('wiz.fit.facingOnly')))
      lines.push(h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { fit = null; renderFit() } }, t('wiz.fit.dismiss')),
        h('button', { class: 'btn primary', type: 'button', id: 'fit-apply', onclick: () => {
          store.update((d) => { d.facing = fit.scene.facing; d.windows = structuredClone(fit.scene.windows) })
          fit = null
          toast(t('wiz.fit.applied'))
          renderFit()
          sync()
        } }, t('wiz.fit.apply'))))
    }
    fitOut.replaceChildren(h('div', { class: 'card selected' }, ...lines))
  }

  function sync() {
    const s = store.scene
    month.value = String(s.date.month)
    if (document.activeElement !== day) day.value = String(s.date.day)
    if (document.activeElement !== time) time.value = clock(s.minutes)
    pointsLine.textContent = marking ? (points.length < 3 ? t('wiz.check.points', { n: points.length }) : t('wiz.check.pointsReady', { n: points.length })) : ''
    undoPoint.hidden = clearPoints.hidden = !marking
    savePatch.hidden = !marking
    savePatch.disabled = points.length < 3
    photoBtn.hidden = Boolean(photo)
    photoOff.hidden = !photo
    checksList.replaceChildren(...s.checks.map((c, i) => {
      const r = compareCheck(s, c)
      return h('div', { class: 'spot' },
        h('span', { class: 'n' }, i + 1),
        h('span', {}, t('wiz.check.row', { date: dateText(c.month, c.day), time: clock(c.minutes), pct: Math.round(r.iou * 100) })),
        h('button', { class: 'mini', type: 'button', onclick: () => { store.update((d) => { d.date.month = c.month; d.date.day = c.day; d.minutes = c.minutes }, { history: false }) } }, t('wiz.check.show')),
        h('button', { class: 'mini', type: 'button', onclick: () => { store.update((d) => { d.checks.splice(i, 1) }); fit = null; refreshOverlay() } }, t('things.remove')))
    }))
    // how the model does against everything that was marked
    if (!s.checks.length) verdict.replaceChildren(h('p', { class: 'note' }, t('wiz.check.none')))
    else {
      const results = s.checks.map((c) => compareCheck(s, c))
      const mean = results.reduce((a, r) => a + r.iou, 0) / results.length
      const first = results.find((r) => r.shift)
      let wi = 0
      let best = -1
      s.windows.forEach((w, i) => {
        const only = { ...s, windows: [w] }
        const v = s.checks.reduce((a, c) => a + compareCheck(only, c).shared, 0)
        if (v > best) { best = v; wi = i }
      })
      verdict.replaceChildren(h('div', { class: 'card' },
        h('span', { class: 'big' }, `${Math.round(mean * 100)}%`),
        h('p', { class: 'note', style: 'margin:2px 0 6px' }, t('wiz.check.overlap')),
        first ? h('p', {}, shiftText(s, first.shift, wi, store.ui.units)) : h('p', {}, t('wiz.check.dark'))))
    }
    fitBtn.disabled = !s.checks.length || !s.windows.length
    fitBtn.hidden = !s.checks.length
  }

  const main = h('div', {},
    h('p', {}, t('wiz.check.intro')),
    h('h3', {}, t('wiz.check.when')),
    h('div', { class: 'row' }, month, day, time),
    markBtn, pointsLine, h('div', { class: 'row' }, undoPoint, clearPoints, savePatch),
    photoBtn, photoOff,
    h('h3', {}, t('wiz.check.saved.title')), checksList, verdict, fitBtn, fitOut,
    h('p', { class: 'note' }, t('wiz.check.accuracy')),
    h('a', { class: 'note', href: 'https://github.com/Arthur031221/Sunspill/blob/main/docs/ACCURACY.md', target: '_blank', rel: 'noopener' }, t('wiz.check.docs')))
  const el = h('section', { class: 'wiz-step' }, main, photoCard)

  return {
    el,
    sync,
    enter() {
      refreshOverlay()
      store.setUi({ playing: false })
      if (marking) setMarking(true)
    },
    leave({ rebuilding } = {}) {
      gone = true
      session?.end()
      stage.setTool(null)
      if (rebuilding) return // the new step takes up the same marks and photo
      overlay.marks = null
      overlay.underlay = null
      ctx.draft = null
      stage.invalidate()
    },
  }
}
