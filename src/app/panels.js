// The side panel: five tabs of controls. Each tab builds once and then only
// refreshes its values when the scene changes, so typing never loses focus.

import { h, clamp } from './dom.js'
import { t } from './i18n.js'
import { numberField, compassDial } from './fields.js'
import { coordinateFields } from './place-fields.js'
import { bearingText, clock, dateText, duration, areaText, lengthText, monthName, toUnit, fromUnit, trim, itemName } from './format.js'
import { WALLS, ITEM_KINDS, ITEM_SIZES, MAX_WINDOWS, MAX_ITEMS, wallBearing, wallLength } from '../core/room.js'
import { searchCities, cityPlace } from '../core/cities.js'
import { setPlacePoint } from '../core/geo.js'
import { freeSpot } from '../core/snap.js'
import { isZone } from '../core/solar.js'
import { periodDays } from './analysis.js'
import { encodeScene, blurScene } from '../core/codec.js'

export const TABS = ['room', 'place', 'things', 'results', 'share']

const select = (options, value, onChange, label) => {
  const el = h('select', { class: 'select', 'aria-label': label, style: 'max-width:none;width:100%' }, ...options.map(([v, text]) => h('option', { value: v }, text)))
  el.value = value
  el.addEventListener('change', () => onChange(el.value))
  return el
}

const monthOptions = () => Array.from({ length: 12 }, (_, i) => [i + 1, monthName(i + 1)])

function roomTab({ store, stage }) {
  const fields = []
  const add = (opts) => {
    const f = numberField({ store, ...opts })
    fields.push(f)
    return f.el
  }
  const el = h('section')
  el.append(
    h('h2', {}, t('room.size')),
    add({ label: t('f.width'), min: 1.5, max: 20, step: 0.05, get: (s) => s.room.w, set: (d, v) => { d.room.w = v }, key: 'room.w' }),
    add({ label: t('f.depth'), min: 1.5, max: 20, step: 0.05, get: (s) => s.room.d, set: (d, v) => { d.room.d = v }, key: 'room.d' }),
    add({ label: t('f.height'), min: 2, max: 6, step: 0.05, get: (s) => s.room.h, set: (d, v) => { d.room.h = v }, key: 'room.h' }),
    add({ label: t('f.wallThickness'), min: 0, max: 0.6, step: 0.01, get: (s) => s.room.wall, set: (d, v) => { d.room.wall = v }, key: 'room.wall' }),
    h('p', { class: 'note' }, t('room.thicknessNote')),
  )

  const target = () => clamp(store.ui.selectedWindow ?? 0, 0, Math.max(0, store.scene.windows.length - 1))
  const wallOf = () => store.scene.windows[target()]?.wall ?? 'top'
  const dialLabel = h('p', { class: 'note', style: 'text-align:center;margin-top:0' })
  const dial = compassDial({
    label: t('room.dial'),
    get: () => wallBearing(store.scene, wallOf()),
    onChange: (b) => store.update((d) => { d.facing = (((b - WALLS.indexOf(wallOf()) * 90) % 360) + 360) % 360 }, { key: 'facing' }),
  })
  const bearingNum = numberField({ store, label: t('room.facingDeg'), kind: 'deg', min: 0, max: 359, step: 1, get: (s) => wallBearing(s, wallOf()), set: (d, v) => { d.facing = (((v - WALLS.indexOf(wallOf()) * 90) % 360) + 360) % 360 }, key: 'facing' })
  fields.push(bearingNum)
  const compassBtn = h('button', { class: 'btn block', type: 'button', onclick: () => store.panelActions.openCompass(wallOf()) }, t('room.useCompass'))
  el.append(h('h2', {}, t('room.orient')), dialLabel, dial.el, bearingNum.el, 'DeviceOrientationEvent' in window ? compassBtn : null, h('p', { class: 'note' }, t('room.orientNote')))

  const winWrap = h('div')
  el.append(h('h2', {}, t('win.title')), winWrap)
  const cards = []
  store.scene.windows.forEach((win, i) => {
    const wf = []
    const addw = (opts) => {
      const f = numberField({ store, ...opts })
      wf.push(f)
      return f.el
    }
    const wallSel = h('select', { class: 'select', style: 'max-width:none;width:100%', 'aria-label': t('win.wall') }, ...WALLS.map((w) => h('option', { value: w }, w)))
    wallSel.addEventListener('change', () => store.update((d) => { if (d.windows[i]) d.windows[i].wall = wallSel.value }, { key: `w${i}.wall` }))
    const len = (s) => wallLength(s.room, s.windows[i].wall)
    const acrossOn = h('input', { type: 'checkbox', id: `across${i}` })
    acrossOn.addEventListener('change', () => store.update((d) => { if (d.windows[i]) d.windows[i].across = acrossOn.checked ? { height: 30, distance: 15 } : null }))
    const title = h('b', {}, t('win.name', { n: i + 1 }))
    const dup = h('button', { class: 'mini', type: 'button', onclick: () => duplicateWindow(store, i), title: t('win.duplicate') }, t('win.duplicate'))
    const del = h('button', { class: 'mini', type: 'button', onclick: () => removeWindow(store, i), title: t('win.remove') }, t('win.remove'))
    const across = h('div', {},
      addw({ label: t('f.acrossHeight'), min: 0, max: 400, step: 0.5, get: (s) => s.windows[i].across?.height ?? 30, set: (d, v) => { if (d.windows[i].across) d.windows[i].across.height = v }, key: `w${i}.ah` }),
      addw({ label: t('f.acrossDistance'), min: 2, max: 300, step: 0.5, get: (s) => s.windows[i].across?.distance ?? 15, set: (d, v) => { if (d.windows[i].across) d.windows[i].across.distance = v }, key: `w${i}.ad` }),
    )
    const card = h('div', { class: 'card', dataset: { window: i } },
      h('div', { class: 'card-head' }, title, dup, del),
      h('div', { class: 'row' }, wallSel),
      addw({ label: t('f.pos'), min: 0, max: (s) => Math.max(0, len(s) - s.windows[i].w), step: 0.05, get: (s) => s.windows[i].pos, set: (d, v) => { d.windows[i].pos = v }, key: `w${i}.pos` }),
      addw({ label: t('f.winWidth'), min: 0.3, max: (s) => Math.min(12, len(s)), step: 0.05, get: (s) => s.windows[i].w, set: (d, v) => { d.windows[i].w = v }, key: `w${i}.w` }),
      addw({ label: t('f.winHeight'), min: 0.3, max: (s) => Math.min(4, s.room.h), step: 0.05, get: (s) => s.windows[i].h, set: (d, v) => { d.windows[i].h = v }, key: `w${i}.h` }),
      addw({ label: t('f.sill'), min: 0, max: (s) => Math.max(0, s.room.h - s.windows[i].h), step: 0.05, get: (s) => s.windows[i].sill, set: (d, v) => { d.windows[i].sill = v }, key: `w${i}.sill` }),
      h('h3', {}, t('win.shade')),
      addw({ label: t('f.shadeDepth'), min: 0, max: 4, step: 0.05, get: (s) => s.windows[i].eave.depth, set: (d, v) => { d.windows[i].eave.depth = v }, key: `w${i}.ed` }),
      addw({ label: t('f.shadeGap'), min: 0, max: 1.5, step: 0.05, get: (s) => s.windows[i].eave.gap, set: (d, v) => { d.windows[i].eave.gap = v }, key: `w${i}.eg` }),
      addw({ label: t('f.shadeExt'), min: 0, max: 3, step: 0.05, get: (s) => s.windows[i].eave.ext, set: (d, v) => { d.windows[i].eave.ext = v }, key: `w${i}.ee` }),
      h('h3', {}, t('win.across')),
      h('label', { class: 'check', htmlFor: `across${i}` }, acrossOn, t('win.acrossOn')),
      across,
    )
    card.addEventListener('pointerdown', () => pick({ type: 'window', index: i }))
    // a keyboard moving into the card picks the window as well, so the arrow keys on the drawing move it
    card.addEventListener('focusin', () => pick({ type: 'window', index: i }))
    card.addEventListener('focusin', () => pick({ type: 'window', index: i }))
    const sync = () => {
      const s = store.scene
      wf.forEach((f) => f.sync())
      for (const o of wallSel.options) o.textContent = `${t(`wall.${o.value}`)} · ${bearingText(wallBearing(s, o.value))}`
      wallSel.value = s.windows[i].wall
      acrossOn.checked = Boolean(s.windows[i].across)
      across.hidden = !acrossOn.checked
      dup.disabled = s.windows.length >= MAX_WINDOWS
      card.classList.toggle('selected', store.ui.selected?.type === 'window' && store.ui.selected.index === i)
    }
    cards.push({ card, sync })
    winWrap.append(card)
  })
  if (!store.scene.windows.length) winWrap.append(h('p', { class: 'note' }, t('win.none')))
  const addBtn = h('button', { class: 'btn block', type: 'button', onclick: () => addWindow(store) }, t('win.add'))
  el.append(addBtn)

  function pick(sel) {
    if (store.ui.selected?.type === sel.type && store.ui.selected.index === sel.index) return
    stage.select(sel)
    store.setUi({ selected: sel, selectedWindow: sel.index })
  }

  return {
    el,
    sync() {
      fields.forEach((f) => f.sync())
      dial.sync()
      const w = target()
      dialLabel.textContent = store.scene.windows.length ? t('room.faces', { n: w + 1, dir: bearingText(wallBearing(store.scene, wallOf())) }) : t('room.facesTop', { dir: bearingText(wallBearing(store.scene, 'top')) })
      cards.forEach((c) => c.sync())
      addBtn.disabled = store.scene.windows.length >= MAX_WINDOWS
    },
    structure: () => store.scene.windows.length,
  }
}

function addWindow(store) {
  store.update((d) => {
    const used = d.windows.map((w) => w.wall)
    const wall = WALLS.find((w) => !used.includes(w)) ?? 'top'
    const length = wallLength(d.room, wall)
    const w = Math.min(1.5, length - 0.4)
    d.windows.push({ wall, pos: (length - w) / 2, w, h: 1.4, sill: 0.9, eave: { depth: 0, gap: 0.15, ext: 0.3 }, across: null })
  })
  store.setUi({ selectedWindow: store.scene.windows.length - 1, selected: { type: 'window', index: store.scene.windows.length - 1 } })
}

function duplicateWindow(store, i) {
  store.update((d) => {
    const copy = structuredClone(d.windows[i])
    const length = wallLength(d.room, copy.wall)
    copy.pos = copy.pos + copy.w + 0.3 + copy.w <= length ? copy.pos + copy.w + 0.3 : Math.max(0, copy.pos - copy.w - 0.3)
    d.windows.push(copy)
  })
}

function removeWindow(store, i) {
  store.update((d) => { d.windows.splice(i, 1) })
  store.setUi({ selectedWindow: 0, selected: null })
}

export function toast(message) {
  const el = document.getElementById('toast')
  el.textContent = message
  el.classList.add('show')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200)
}

function placeTab({ store, actions }) {
  const fields = []
  const el = h('section')
  const search = h('input', { type: 'search', placeholder: t('place.search'), 'aria-label': t('place.search'), autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'city-list', 'aria-autocomplete': 'list' })
  const list = h('ul', { class: 'suggest', hidden: true, role: 'listbox', id: 'city-list', 'aria-label': t('place.search') })
  const nameInput = h('input', { type: 'text', maxLength: 60, 'aria-label': t('place.name') })
  const zoneInput = h('input', { type: 'text', 'aria-label': t('place.zone'), spellcheck: false })
  const summary = h('p', { class: 'note' })

  const choose = (city) => {
    store.update((d) => {
      const p = cityPlace(city)
      setPlacePoint(d, p.lat, p.lon)
      d.place.name = p.name
      d.place.zone = p.zone
    })
    search.value = ''
    list.hidden = true
    search.setAttribute('aria-expanded', 'false')
    actions.afterPlace()
  }
  search.addEventListener('input', () => {
    const found = searchCities(search.value)
    list.replaceChildren(...(found.length ? found.map((c) => h('li', { role: 'option' }, h('button', { type: 'button', tabIndex: -1, onclick: () => choose(c) }, h('span', {}, c.name), h('small', {}, `${c.country} · ${trim(c.lat, 2)}, ${trim(c.lon, 2)}`)))) : search.value.trim() ? [h('li', {}, h('button', { type: 'button', disabled: true }, t('place.none')))] : []))
    list.hidden = !list.children.length
    search.setAttribute('aria-expanded', String(!list.hidden))
  })
  const buttons = () => [...list.querySelectorAll('button:not(:disabled)')]
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = searchCities(search.value)[0]
      if (first) choose(first)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      buttons()[0]?.focus()
    } else if (e.key === 'Escape') {
      list.hidden = true
      search.setAttribute('aria-expanded', 'false')
    }
  })
  list.addEventListener('keydown', (e) => {
    const all = buttons()
    const at = all.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') all[Math.min(all.length - 1, at + 1)]?.focus()
    else if (e.key === 'ArrowUp') (at <= 0 ? search : all[at - 1]).focus()
    else if (e.key === 'Escape') {
      list.hidden = true
      search.setAttribute('aria-expanded', 'false')
      search.focus()
    } else return
    e.preventDefault()
  })
  nameInput.addEventListener('change', () => store.update((d) => { d.place.name = nameInput.value.trim() }, { key: 'place.name' }))
  zoneInput.addEventListener('change', () => {
    const z = zoneInput.value.trim()
    if (isZone(z)) store.update((d) => { d.place.zone = z })
    else toast(t('place.zoneBad'))
    zoneInput.value = store.scene.place.zone
  })
  const coordinates = coordinateFields({ store, actions, places: 3, step: 0.001 })
  fields.push(...coordinates)
  const locate = h('button', { class: 'btn block', type: 'button', onclick: () => actions.locate() }, t('place.use'))
  el.append(
    h('h2', {}, t('place.title')),
    search, list, h('div', { style: 'height:8px' }), locate,
    h('h3', {}, t('place.details')),
    h('div', { class: 'field', style: 'grid-template-columns:1fr' }, h('label', {}, t('place.name')), nameInput),
    ...coordinates.map((f) => f.el),
    h('div', { class: 'field', style: 'grid-template-columns:1fr' }, h('label', {}, t('place.zone')), zoneInput),
    summary,
    h('p', { class: 'note' }, t('place.note')),
  )
  return {
    el,
    sync() {
      fields.forEach((f) => f.sync())
      const p = store.scene.place
      if (document.activeElement !== nameInput) nameInput.value = p.name
      if (document.activeElement !== zoneInput) zoneInput.value = p.zone
      summary.textContent = t('place.summary', { date: dateText(store.scene.date.month, store.scene.date.day) })
    },
  }
}

function thingsTab({ store, stage }) {
  const el = h('section')
  const rows = []
  el.append(h('h2', {}, t('things.title')), h('p', { class: 'note' }, t('things.note')))
  const kinds = h('div', { class: 'row' })
  for (const kind of ITEM_KINDS) kinds.append(h('button', { class: 'chip fixed', type: 'button', onclick: () => addItem(store, kind) }, `+ ${t(`kind.${kind}`)}`))
  kinds.style.flexWrap = 'wrap'
  el.append(kinds)
  const list = h('div')
  el.append(list)
  store.scene.items.forEach((item, i) => {
    const fs = []
    const addf = (opts) => {
      const f = numberField({ store, compact: true, ...opts })
      fs.push(f)
      return f.el
    }
    const sunLine = h('p', { class: 'note', style: 'margin:6px 0 0' })
    const card = h('div', { class: 'card', dataset: { item: i } },
      h('div', { class: 'card-head' }, h('b', {}, itemName(store.scene.items, i)), h('button', { class: 'mini', type: 'button', onclick: () => { store.update((d) => { d.items.splice(i, 1) }); store.setUi({ selected: null }) } }, t('things.remove'))),
      h('div', { class: 'grid2' },
        addf({ label: t('f.x'), min: 0, max: (s) => s.room.w - s.items[i].w, step: 0.05, get: (s) => s.items[i].x, set: (d, v) => { d.items[i].x = v }, key: `i${i}.x` }),
        addf({ label: t('f.y'), min: 0, max: (s) => s.room.d - s.items[i].d, step: 0.05, get: (s) => s.items[i].y, set: (d, v) => { d.items[i].y = v }, key: `i${i}.y` }),
        addf({ label: t('f.itemWidth'), min: 0.1, max: (s) => Math.min(4, s.room.w), step: 0.05, get: (s) => s.items[i].w, set: (d, v) => { d.items[i].w = v }, key: `i${i}.w` }),
        addf({ label: t('f.itemDepth'), min: 0.1, max: (s) => Math.min(4, s.room.d), step: 0.05, get: (s) => s.items[i].d, set: (d, v) => { d.items[i].d = v }, key: `i${i}.d` }),
        addf({ label: t('f.itemHeight'), min: 0.05, max: (s) => s.room.h, step: 0.05, get: (s) => s.items[i].h, set: (d, v) => { d.items[i].h = v }, key: `i${i}.h` }),
      ),
      sunLine,
    )
    const pickItem = () => {
      stage.select({ type: 'item', index: i })
      store.setUi({ selected: { type: 'item', index: i } })
    }
    card.addEventListener('pointerdown', pickItem)
    // a keyboard moving into the card picks the piece as well, so the arrow keys on the drawing move it
    card.addEventListener('focusin', pickItem)
    rows.push({ card, fs, sunLine, i })
    list.append(card)
  })
  if (!store.scene.items.length) list.append(h('p', { class: 'note' }, t('things.empty')))
  return {
    el,
    sync(extra) {
      rows.forEach(({ card, fs, sunLine, i }) => {
        fs.forEach((f) => f.sync())
        card.classList.toggle('selected', store.ui.selected?.type === 'item' && store.ui.selected.index === i)
        const hours = extra?.itemHours?.[i]
        sunLine.textContent = hours == null ? '' : t('things.sunTop', { t: duration(hours), date: dateText(store.scene.date.month, store.scene.date.day) })
      })
    },
    structure: () => store.scene.items.length,
  }
}

function addItem(store, kind) {
  if (store.scene.items.length >= MAX_ITEMS) return toast(t('things.max'))
  store.update((d) => {
    const size = ITEM_SIZES[kind]
    d.items.push({ kind, ...freeSpot(d, size), ...size })
  })
  const index = store.scene.items.length - 1
  store.setUi({ selected: { type: 'item', index } })
}

function resultsTab({ store, analysis, stage }) {
  const el = h('section')
  const fields = []
  const heatOn = h('input', { type: 'checkbox', id: 'heat-on' })
  heatOn.addEventListener('change', () => actions().setHeat({ on: heatOn.checked }))
  const period = select([['day', t('period.day')], ['month', t('period.month')], ['year', t('period.year')], ['range', t('period.range')]], store.ui.heat.period, (v) => actions().setHeat({ period: v }), t('results.period'))
  const from = select(monthOptions(), store.ui.heat.from, (v) => actions().setHeat({ from: Number(v) }), t('results.from'))
  const to = select(monthOptions(), store.ui.heat.to, (v) => actions().setHeat({ to: Number(v) }), t('results.to'))
  const rangeRow = h('div', { class: 'row' }, from, to)
  const heatNote = h('p', { class: 'note' })
  const zField = numberField({ store, label: t('results.height'), min: 0, max: (s) => s.room.h - 0.1, step: 0.05, get: () => store.ui.heat.z, set: () => {} })
  // the plane height lives in the interface settings, not the scene
  const zSlider = zField.el.querySelector('input[type=range]')
  const zNum = zField.el.querySelector('input[type=number]')
  const setZ = (raw) => actions().setHeat({ z: clamp(fromUnit(Number(raw), store.ui.units), 0, store.scene.room.h - 0.1) })
  zSlider.oninput = () => setZ(zSlider.value)
  zNum.onchange = () => setZ(zNum.value)
  zField.sync = () => {
    const lo = 0
    const hi = toUnit(store.scene.room.h - 0.1, store.ui.units)
    for (const input of [zSlider, zNum]) { input.min = lo; input.max = trim(hi, 2); input.step = store.ui.units === 'ft' ? 0.1 : 0.05 }
    zSlider.value = toUnit(store.ui.heat.z, store.ui.units)
    if (document.activeElement !== zNum) zNum.value = trim(toUnit(store.ui.heat.z, store.ui.units), 2)
  }
  const presets = h('div', { class: 'row', style: 'flex-wrap:wrap' },
    h('button', { class: 'chip fixed', type: 'button', onclick: () => actions().setHeat({ z: 0 }) }, t('results.floor')),
    h('button', { class: 'chip fixed', type: 'button', onclick: () => actions().setHeat({ z: 0.75 }) }, t('results.desk')),
  )

  const westFrom = select(monthOptions(), store.ui.west.from, (v) => actions().setWest({ from: Number(v) }), t('results.from'))
  const westTo = select(monthOptions(), store.ui.west.to, (v) => actions().setWest({ to: Number(v) }), t('results.to'))
  const westAfter = h('input', { type: 'time', value: clock(store.ui.west.after), 'aria-label': t('results.after') })
  westAfter.addEventListener('change', () => {
    const [hh, mm] = westAfter.value.split(':').map(Number)
    if (Number.isFinite(hh)) actions().setWest({ after: hh * 60 + (mm || 0) })
  })
  const westOut = h('div', { class: 'results' })
  const westRule = h('p', { class: 'note' })

  const need = select([['full', t('need.full')], ['partial', t('need.partial')], ['low', t('need.low')]], store.ui.plant.need, (v) => actions().setPlant({ need: v }), t('plant.need'))
  const plantH = numberField({ store, label: t('plant.height'), min: 0, max: (s) => s.room.h - 0.1, step: 0.05, get: () => store.ui.plant.height, set: () => {} })
  const pSlider = plantH.el.querySelector('input[type=range]')
  const pNum = plantH.el.querySelector('input[type=number]')
  const setP = (raw) => actions().setPlant({ height: clamp(fromUnit(Number(raw), store.ui.units), 0, store.scene.room.h - 0.1) })
  pSlider.oninput = () => setP(pSlider.value)
  pNum.onchange = () => setP(pNum.value)
  plantH.sync = () => {
    const hi = toUnit(store.scene.room.h - 0.1, store.ui.units)
    for (const input of [pSlider, pNum]) { input.min = 0; input.max = trim(hi, 2); input.step = store.ui.units === 'ft' ? 0.1 : 0.05 }
    pSlider.value = toUnit(store.ui.plant.height, store.ui.units)
    if (document.activeElement !== pNum) pNum.value = trim(toUnit(store.ui.plant.height, store.ui.units), 2)
  }
  const spotsOut = h('div')
  const plantRule = h('p', { class: 'note' })

  fields.push(zField, plantH)
  el.append(
    h('h2', {}, t('results.map')),
    h('label', { class: 'check', htmlFor: 'heat-on' }, heatOn, t('results.show')),
    h('div', { class: 'row' }, period), rangeRow, zField.el, presets, heatNote,
    h('h2', {}, t('results.west')),
    h('div', { class: 'row' }, westFrom, westTo),
    h('div', { class: 'field', style: 'grid-template-columns:1fr 110px' }, h('label', {}, t('results.after')), westAfter),
    westOut, westRule,
    h('h2', {}, t('plant.title')),
    h('div', { class: 'row' }, need), plantH.el, spotsOut, plantRule,
  )

  function actions() {
    return store.panelActions
  }

  return {
    el,
    sync() {
      fields.forEach((f) => f.sync())
      const ui = store.ui
      heatOn.checked = ui.heat.on
      period.value = ui.heat.period
      from.value = ui.heat.from
      to.value = ui.heat.to
      rangeRow.hidden = ui.heat.period !== 'range'
      const days = periodDays(store.scene, ui.heat)
      heatNote.textContent = t('results.heatNote', { n: days.length })
      westFrom.value = ui.west.from
      westTo.value = ui.west.to
      if (document.activeElement !== westAfter) westAfter.value = clock(ui.west.after)
      need.value = ui.plant.need
      renderWest()
      renderSpots()
    },
    refresh() {
      renderWest()
      renderSpots()
    },
  }

  function renderWest() {
    const w = analysis.west
    const ui = store.ui.west
    westRule.textContent = t('results.westRule', { after: clock(ui.after), from: monthName(ui.from), to: monthName(ui.to) })
    if (!w || w.after !== ui.after || w.from !== ui.from || w.to !== ui.to) {
      westOut.replaceChildren(h('p', { class: 'note' }, t('results.computing')))
      return
    }
    westOut.replaceChildren(
      h('div', { class: 'card' },
        h('span', { class: 'big' }, duration(w.hoursPerDay)),
        h('p', { class: 'note', style: 'margin:2px 0 8px' }, t('results.westLine', { after: clock(w.after) })),
        h('div', { class: 'kv' }, h('span', {}, t('results.earliest')), h('b', {}, w.earliest == null ? '-' : clock(w.earliest))),
        h('div', { class: 'kv' }, h('span', {}, t('results.latest')), h('b', {}, w.latest == null ? '-' : clock(w.latest))),
        h('div', { class: 'kv' }, h('span', {}, t('results.peak')), h('b', {}, areaText(w.peakFloorArea, store.ui.units))),
      ),
    )
  }

  function renderSpots() {
    const sp = analysis.spots
    const ui = store.ui.plant
    plantRule.textContent = t('plant.rule')
    if (!sp || sp.need !== ui.need || sp.height !== ui.height) {
      spotsOut.replaceChildren(h('p', { class: 'note' }, t('results.computing')))
      return
    }
    if (!sp.list.length) {
      spotsOut.replaceChildren(h('p', { class: 'note' }, t('plant.none')))
      return
    }
    spotsOut.replaceChildren(...sp.list.map((s, i) => h('div', { class: 'spot' },
      h('span', { class: 'n' }, i + 1),
      h('span', {}, t('plant.spot', { x: lengthText(s.x, store.ui.units), y: lengthText(s.y, store.ui.units), t: duration(s.hours) })),
      h('button', { class: 'mini', type: 'button', onclick: () => placePlant(store, s) }, t('plant.place')),
    )))
  }
}

function placePlant(store, spot) {
  if (store.scene.items.length >= MAX_ITEMS) return toast(t('things.max'))
  store.update((d) => {
    const size = ITEM_SIZES.plant
    d.items.push({ kind: 'plant', x: spot.x - size.w / 2, y: spot.y - size.d / 2, ...size })
  })
  toast(t('plant.placed'))
}

/** Rooms kept by name in this browser: save the one on screen, open another, delete one. */
function savedSection({ store, actions }) {
  const name = h('input', { type: 'text', id: 'saved-name', maxLength: 60, autocomplete: 'off', placeholder: t('saved.placeholder'), 'aria-label': t('saved.name') })
  const note = h('p', { class: 'note', role: 'status' })
  const list = h('div', { class: 'saved-list' })
  const save = h('button', { class: 'btn primary fixed', type: 'button', id: 'saved-save' }, t('saved.save'))
  let sure = ''
  let sureTimer = 0
  const doSave = () => {
    const result = actions.saveRoom(name.value)
    if (result === 'saved') note.textContent = ''
    else if (result === 'full') note.textContent = t('saved.full')
    else if (result === 'name') note.textContent = t('saved.noName')
    else note.textContent = t('saved.failed')
    render()
  }
  save.addEventListener('click', doSave)
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSave() } })
  function render() {
    const rooms = actions.savedRooms()
    if (!rooms.length) {
      list.replaceChildren(h('p', { class: 'note' }, t('saved.empty')))
      return
    }
    list.replaceChildren(...rooms.map((r, i) => {
      const s = r.scene
      const where = s.place.name || '-'
      const del = h('button', { class: 'btn', type: 'button', onclick: () => {
        clearTimeout(sureTimer)
        note.textContent = ''
        if (sure === r.id) {
          sure = ''
          actions.deleteRoom(r.id)
        } else {
          sure = r.id
          sureTimer = setTimeout(() => { sure = ''; render() }, 4000)
        }
        render()
      } }, sure === r.id ? t('saved.sure') : t('saved.delete'))
      return h('div', { class: 'saved-row' },
        h('div', { class: 'saved-text' }, h('b', {}, r.name), h('span', { class: 'note' }, t('saved.row', { place: where, w: lengthText(s.room.w, store.ui.units), d: lengthText(s.room.d, store.ui.units) }))),
        h('div', { class: 'saved-buttons' },
          h('button', { class: 'btn', type: 'button', onclick: () => {
            note.textContent = ''
            const result = actions.openRoom(r.id)
            if (result === 'full') note.textContent = t('saved.fullOpen')
            else if (result === 'failed') note.textContent = t('saved.failed')
          } }, t('saved.open')),
          del,
        ),
      )
    }))
  }
  const el = h('div', { class: 'saved' },
    h('h2', {}, t('saved.title')),
    h('div', { class: 'row' }, name, save),
    note,
    list,
    h('p', { class: 'note' }, t('saved.note')),
  )
  return { el, render }
}

function shareTab({ store, actions }) {
  const el = h('section')
  const link = h('input', { type: 'text', readOnly: true, 'aria-label': t('share.link') })
  const hide = h('input', { type: 'checkbox', id: 'hide' })
  const copy = h('button', { class: 'btn primary fixed', type: 'button', onclick: () => actions.copyLink(hide.checked) }, t('share.copy'))
  const png = h('button', { class: 'btn block', type: 'button', onclick: () => actions.savePng(hide.checked) }, t('share.png'))
  const gifRange = select([['lit', t('gif.lit')], ['day', t('gif.day')], ['afternoon', t('gif.afternoon')], ['morning', t('gif.morning')]], store.ui.gifRange, (v) => store.setUi({ gifRange: v }), t('gif.range'))
  const gifBtn = h('button', { class: 'btn block', type: 'button' }, t('share.gif'))
  const bar = h('i')
  const progress = h('div', { class: 'progress', hidden: true }, bar)
  const preview = h('div')
  const cancel = h('button', { class: 'btn block', type: 'button', hidden: true, onclick: () => actions.cancelGif() }, t('share.cancel'))
  gifBtn.addEventListener('click', async () => {
    gifBtn.disabled = true
    progress.hidden = false
    cancel.hidden = false
    bar.style.width = '0%'
    preview.replaceChildren()
    try {
      const out = await actions.makeGif(hide.checked, (f) => { bar.style.width = `${Math.round(f * 100)}%` })
      if (out) {
        const url = URL.createObjectURL(out.blob)
        preview.replaceChildren(
          h('img', { class: 'preview', src: url, alt: t('share.gifAlt'), width: out.width, height: out.height }),
          h('p', { class: 'note' }, t('share.gifInfo', { frames: out.frames, kb: Math.round(out.blob.size / 1024) })),
          h('a', { class: 'btn primary block', href: url, download: 'sunspill.gif', style: 'display:flex;align-items:center;justify-content:center;text-decoration:none' }, t('share.download')),
        )
      }
    } catch (err) {
      toast(String(err.message || err))
    } finally {
      gifBtn.disabled = false
      progress.hidden = true
      cancel.hidden = true
    }
  })
  const earlier = h('div', { class: 'row', hidden: true }, h('button', { class: 'btn', type: 'button', id: 'bring-back', onclick: () => actions.bringBack() }, t('share.earlier')))
  const saved = savedSection({ store, actions })
  const importer = h('input', { type: 'file', accept: 'application/json,.json', hidden: true })
  importer.addEventListener('change', () => importer.files[0] && actions.importJson(importer.files[0]))
  el.append(
    h('h2', {}, t('share.title')),
    h('div', { class: 'row' }, link, copy),
    h('label', { class: 'check', htmlFor: 'hide' }, hide, t('share.hide')),
    h('p', { class: 'note' }, t('share.hideNote')),
    saved.el,
    h('h2', {}, t('share.image')),
    png,
    h('h2', {}, t('share.animation')),
    h('div', { class: 'row' }, gifRange), h('div', { style: 'height:8px' }), gifBtn, progress, cancel, preview,
    h('p', { class: 'note' }, t('share.gifNote')),
    h('h2', {}, t('share.data')),
    h('div', { class: 'row data-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => actions.exportJson(hide.checked) }, t('share.export')),
      h('button', { class: 'btn', type: 'button', onclick: () => importer.click() }, t('share.import')),
      h('button', { class: 'btn', type: 'button', onclick: () => actions.reset() }, t('share.reset')),
    ),
    earlier,
    importer,
  )
  const refreshLink = () => {
      earlier.hidden = !actions.hasEarlier()
      saved.render()
      link.value = location.origin === 'null' ? '' : `${location.origin}${location.pathname}#${encodeScene(hide.checked ? blurScene(store.scene) : store.scene)}`
  }
  hide.addEventListener('change', refreshLink)
  return { el, sync: refreshLink }
}

const BUILDERS = { room: roomTab, place: placeTab, things: thingsTab, results: resultsTab, share: shareTab }

export function createPanels({ store, tabsEl, bodyEl, stage, analysis, actions }) {
  let current = null
  let builtStructure = null
  let name = store.ui.tab
  const ctx = { store, stage, analysis, actions }
  store.panelActions = actions

  function renderTabs() {
    const hadFocus = tabsEl.contains(document.activeElement)
    tabsEl.replaceChildren(...TABS.map((id) => h('button', {
      type: 'button', role: 'tab', id: `tab-${id}`, 'aria-selected': String(id === name), 'aria-controls': 'tab-body', tabIndex: id === name ? 0 : -1,
      onclick: () => show(id),
      onkeydown: (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (!step) return
        e.preventDefault()
        show(TABS[(TABS.indexOf(id) + step + TABS.length) % TABS.length])
      },
    }, t(`tab.${id}`))))
    // a keyboard user keeps their place when the tab strip is rebuilt
    if (hadFocus) tabsEl.querySelector(`#tab-${name}`).focus()
  }

  function show(id) {
    name = id
    store.setUi({ tab: id })
    build()
  }

  function build() {
    renderTabs()
    current = BUILDERS[name](ctx)
    builtStructure = current.structure?.()
    bodyEl.replaceChildren(current.el)
    bodyEl.setAttribute('role', 'tabpanel')
    bodyEl.setAttribute('aria-labelledby', `tab-${name}`)
    current.sync()
    if (name === 'results') actions.resultsOpened()
  }

  return {
    build,
    show,
    sync(extra) {
      if (current.structure && current.structure() !== builtStructure) return build()
      current.sync(extra)
    },
    refresh: () => current.refresh?.(),
    get name() { return name },
  }
}
