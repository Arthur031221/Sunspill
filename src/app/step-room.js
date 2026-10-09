// Steps 2 and 3: the room (a template, the size, the floor, or traced from a
// plan) and its windows, balconies and doors.

import { h } from './dom.js'
import { t } from './i18n.js'
import { numberField } from './fields.js'
import { lengthText } from './format.js'
import { TEMPLATES, applyTemplate } from '../core/templates.js'
import { WALLS, MAX_WINDOWS, MAX_DOORS, wallBearing, wallLength } from '../core/room.js'
import { bearingText } from './format.js'
import { openTrace } from './trace-ui.js'

export function roomStep(ctx) {
  const { store, toast } = ctx
  const fields = []
  const add = (opts) => {
    const f = numberField({ store, compact: true, ...opts })
    fields.push(f)
    return f.el
  }
  const grid = h('div', { class: 'tpl-grid', role: 'group', 'aria-label': t('wiz.room.templates') })
  const sizes = []
  for (const tp of TEMPLATES) {
    const size = h('small', {})
    sizes.push([size, tp])
    grid.append(h('button', {
      type: 'button', class: 'tpl', dataset: { template: tp.id },
      onclick: () => {
        store.update((d) => Object.assign(d, applyTemplate(d, tp.id)))
        store.setUi({ selected: null, selectedWindow: 0 })
        toast(t('wiz.room.applied', { name: t(`tpl.${tp.id}`) }))
      },
    }, h('b', {}, t(`tpl.${tp.id}`)), size))
  }
  const main = h('div', {},
    h('p', {}, t('wiz.room.intro')),
    grid,
    h('h3', {}, t('wiz.room.size')),
    h('div', { class: 'grid2' },
      add({ label: t('f.width'), min: 1.5, max: 20, step: 0.05, get: (s) => s.room.w, set: (d, v) => { d.room.w = v }, key: 'room.w' }),
      add({ label: t('f.depth'), min: 1.5, max: 20, step: 0.05, get: (s) => s.room.d, set: (d, v) => { d.room.d = v }, key: 'room.d' }),
      add({ label: t('f.height'), min: 2, max: 6, step: 0.05, get: (s) => s.room.h, set: (d, v) => { d.room.h = v }, key: 'room.h' }),
      add({ label: t('wiz.room.floor'), kind: 'num', places: 0, min: 1, max: 99, step: 1, get: (s) => s.floor.n, set: (d, v) => { d.floor.n = Math.round(v) }, key: 'floor.n' })),
    h('p', { class: 'note' }, t('wiz.room.floorNote')),
    h('details', { class: 'more' }, h('summary', {}, t('wiz.room.more')),
      h('div', { class: 'grid2' },
        add({ label: t('f.wallThickness'), min: 0, max: 0.6, step: 0.01, get: (s) => s.room.wall, set: (d, v) => { d.room.wall = v }, key: 'room.wall' }),
        add({ label: t('wiz.room.storey'), min: 2.4, max: 6, step: 0.05, get: (s) => s.floor.storey, set: (d, v) => { d.floor.storey = v }, key: 'floor.storey' })),
      h('p', { class: 'note' }, t('room.thicknessNote'))),
    h('h3', {}, t('wiz.room.trace')),
    h('p', { class: 'note' }, t('wiz.room.traceNote')),
    h('button', { class: 'btn block', type: 'button', id: 'trace-open', onclick: startTrace }, t('wiz.room.traceButton')))
  const traceCard = h('div', { hidden: true })
  const el = h('section', { class: 'wiz-step' }, main, traceCard)
  let tracing = null

  function startTrace() {
    main.hidden = true
    traceCard.hidden = false
    ctx.showTrace(true)
    tracing = openTrace({
      pane: ctx.tracepane, card: traceCard, store, toast,
      done: (applied) => {
        tracing = null
        ctx.showTrace(false)
        main.hidden = false
        traceCard.hidden = true
        if (applied) toast(t('wiz.room.traced'))
      },
    })
  }

  return {
    el,
    sync() {
      fields.forEach((f) => f.sync())
      for (const [small, tp] of sizes) small.textContent = `${lengthText(tp.room.w, store.ui.units)} × ${lengthText(tp.room.d, store.ui.units)}`
    },
    leave() {
      tracing?.close()
    },
  }
}

export function windowsStep(ctx) {
  const { store, stage } = ctx
  const fields = []
  const syncs = []
  const winList = h('div', {})
  const doorList = h('div', {})
  let shape = ''

  const add = (opts) => {
    const f = numberField({ store, compact: true, ...opts })
    fields.push(f)
    return f.el
  }
  const selectWall = (value, onChange, label) => {
    const sel = h('select', { class: 'select', style: 'max-width:none;width:100%', 'aria-label': label }, ...WALLS.map((w) => h('option', { value: w }, w)))
    sel.addEventListener('change', () => onChange(sel.value))
    return sel
  }

  function windowCard(i) {
    const pick = () => {
      stage.select({ type: 'window', index: i })
      store.setUi({ selected: { type: 'window', index: i }, selectedWindow: i })
    }
    const wall = selectWall(null, (v) => store.update((d) => { d.windows[i].wall = v }, { key: `w${i}.wall` }), t('win.wall'))
    const len = (s) => wallLength(s.room, s.windows[i].wall)
    const balconyOn = h('input', { type: 'checkbox', id: `bal${i}` })
    balconyOn.addEventListener('change', () => store.update((d) => { d.windows[i].balcony = balconyOn.checked ? { depth: 1.2, rail: 1, ext: 0.3 } : null }))
    const roofOn = h('input', { type: 'checkbox', id: `roof${i}` })
    roofOn.addEventListener('change', () => store.update((d) => { d.windows[i].eave.depth = roofOn.checked ? Math.max(1, d.windows[i].balcony?.depth ?? 1) : 0 }))
    const balcony = h('div', { class: 'grid2' },
      add({ label: t('wiz.win.balconyDepth'), min: 0.3, max: 4, step: 0.05, get: (s) => s.windows[i].balcony?.depth ?? 1.2, set: (d, v) => { if (d.windows[i].balcony) d.windows[i].balcony.depth = v }, key: `w${i}.bd` }),
      add({ label: t('wiz.win.rail'), min: 0, max: 2, step: 0.05, get: (s) => s.windows[i].balcony?.rail ?? 1, set: (d, v) => { if (d.windows[i].balcony) d.windows[i].balcony.rail = v }, key: `w${i}.br` }))
    const roof = h('div', {}, add({ label: t('f.shadeDepth'), min: 0, max: 4, step: 0.05, get: (s) => s.windows[i].eave.depth, set: (d, v) => { d.windows[i].eave.depth = v }, key: `w${i}.ed` }))
    const bearing = h('span', { class: 'tag' })
    const card = h('div', { class: 'card', dataset: { window: i } },
      h('div', { class: 'card-head' }, h('b', {}, t('win.name', { n: i + 1 })), bearing,
        h('button', { class: 'mini', type: 'button', onclick: () => store.update((d) => { const c = structuredClone(d.windows[i]); const l = wallLength(d.room, c.wall); c.pos = c.pos + c.w + 0.3 + c.w <= l ? c.pos + c.w + 0.3 : Math.max(0, c.pos - c.w - 0.3); d.windows.push(c) }) }, t('win.duplicate')),
        h('button', { class: 'mini', type: 'button', onclick: () => { store.update((d) => { d.windows.splice(i, 1) }); store.setUi({ selected: null, selectedWindow: 0 }) } }, t('win.remove'))),
      wall,
      h('div', { class: 'grid2' },
        add({ label: t('f.pos'), min: 0, max: (s) => Math.max(0, len(s) - s.windows[i].w), step: 0.05, get: (s) => s.windows[i].pos, set: (d, v) => { d.windows[i].pos = v }, key: `w${i}.pos` }),
        add({ label: t('f.winWidth'), min: 0.3, max: (s) => Math.min(12, len(s)), step: 0.05, get: (s) => s.windows[i].w, set: (d, v) => { d.windows[i].w = v }, key: `w${i}.w` }),
        add({ label: t('f.winHeight'), min: 0.3, max: (s) => Math.min(4, s.room.h), step: 0.05, get: (s) => s.windows[i].h, set: (d, v) => { d.windows[i].h = v }, key: `w${i}.h` }),
        add({ label: t('f.sill'), min: 0, max: (s) => Math.max(0, s.room.h - s.windows[i].h), step: 0.05, get: (s) => s.windows[i].sill, set: (d, v) => { d.windows[i].sill = v }, key: `w${i}.sill` })),
      h('label', { class: 'check', htmlFor: `bal${i}` }, balconyOn, t('wiz.win.balcony')),
      balcony,
      h('label', { class: 'check', htmlFor: `roof${i}` }, roofOn, t('wiz.win.roof')),
      roof)
    card.addEventListener('pointerdown', pick)
    card.addEventListener('focusin', pick)
    syncs.push(() => {
      const s = store.scene
      const w = s.windows[i]
      if (!w) return
      for (const o of wall.options) o.textContent = `${t(`wall.${o.value}`)} · ${bearingText(wallBearing(s, o.value))}`
      wall.value = w.wall
      bearing.textContent = bearingText(wallBearing(s, w.wall))
      balconyOn.checked = Boolean(w.balcony)
      balcony.hidden = !w.balcony
      roofOn.checked = w.eave.depth > 0
      roof.hidden = !roofOn.checked
      card.classList.toggle('selected', store.ui.selected?.type === 'window' && store.ui.selected.index === i)
    })
    return card
  }

  function doorCard(i) {
    const wall = selectWall(null, (v) => store.update((d) => { d.doors[i].wall = v }), t('win.wall'))
    const len = (s) => wallLength(s.room, s.doors[i].wall)
    const card = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('b', {}, t('wiz.door.name', { n: i + 1 })), h('button', { class: 'mini', type: 'button', onclick: () => store.update((d) => { d.doors.splice(i, 1) }) }, t('win.remove'))),
      wall,
      h('div', { class: 'grid2' },
        add({ label: t('f.pos'), min: 0, max: (s) => Math.max(0, len(s) - s.doors[i].w), step: 0.05, get: (s) => s.doors[i].pos, set: (d, v) => { d.doors[i].pos = v }, key: `d${i}.pos` }),
        add({ label: t('f.winWidth'), min: 0.5, max: (s) => Math.min(3, len(s)), step: 0.05, get: (s) => s.doors[i].w, set: (d, v) => { d.doors[i].w = v }, key: `d${i}.w` })))
    syncs.push(() => {
      for (const o of wall.options) o.textContent = t(`wall.${o.value}`)
      if (store.scene.doors[i]) wall.value = store.scene.doors[i].wall
    })
    return card
  }

  const addWin = h('button', { class: 'btn', type: 'button', onclick: () => {
    store.update((d) => {
      const wall = WALLS.find((w) => !d.windows.some((x) => x.wall === w)) ?? 'top'
      const length = wallLength(d.room, wall)
      const w = Math.min(1.5, length - 0.4)
      d.windows.push({ wall, pos: (length - w) / 2, w, h: 1.4, sill: 0.9, eave: { depth: 0, gap: 0.15, ext: 0.3 }, across: null, balcony: null })
    })
    const index = store.scene.windows.length - 1
    store.setUi({ selected: { type: 'window', index }, selectedWindow: index })
  } }, t('win.add'))
  const addDoor = h('button', { class: 'btn', type: 'button', onclick: () => store.update((d) => {
    const wall = WALLS.find((w) => !d.windows.some((x) => x.wall === w) && !d.doors.some((x) => x.wall === w)) ?? 'bottom'
    d.doors.push({ wall, pos: 0.3, w: 0.9 })
  }) }, t('wiz.door.add'))

  function rebuild() {
    fields.length = 0
    syncs.length = 0
    const s = store.scene
    winList.replaceChildren(...s.windows.map((_, i) => windowCard(i)), ...(s.windows.length ? [] : [h('p', { class: 'note' }, t('win.none'))]))
    doorList.replaceChildren(...s.doors.map((_, i) => doorCard(i)))
    shape = `${s.windows.length}|${s.doors.length}`
  }

  const el = h('section', { class: 'wiz-step' },
    h('p', {}, t('wiz.win.intro')),
    winList, h('div', { class: 'row' }, addWin),
    h('h3', {}, t('wiz.door.title')), doorList, h('div', { class: 'row' }, addDoor),
    h('p', { class: 'note' }, t('wiz.win.snap')))

  return {
    el,
    enter() {
      store.setUi({ dims: true })
    },
    leave() {
      store.setUi({ dims: false })
    },
    sync() {
      const s = store.scene
      if (shape !== `${s.windows.length}|${s.doors.length}`) rebuild()
      fields.forEach((f) => f.sync())
      syncs.forEach((fn) => fn())
      addWin.disabled = s.windows.length >= MAX_WINDOWS
      addDoor.disabled = s.doors.length >= MAX_DOORS
    },
  }
}

