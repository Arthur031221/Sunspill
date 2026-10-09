// Steps 4 and 5, both on the map: which way the windows face, and what stands
// around the room.

import { h } from './dom.js'
import { t } from './i18n.js'
import { numberField, compassDial } from './fields.js'
import { bearingText, duration, dateText, clock } from './format.js'
import { sunTimes } from '../core/solar.js'
import { sunAt } from '../core/hours.js'
import { sunInRoom } from '../core/room.js'
import { shadingObstacles } from '../core/obstacles.js'
import { WALLS, wallBearing, floorLift, MAX_OBSTACLES } from '../core/room.js'
import { moveRoom, refreshOwn, blockRing, haversine, snapToOutline } from '../core/geo.js'
import { openCompass, compassSupported } from './compass-ui.js'
import { sunHoursInside } from './frame.js'

/** Fetch the building outlines around the room, after asking, and keep them next to the ones drawn by hand. */
export async function loadBuildings(ctx) {
  const { store, net, consent, toast } = ctx
  if (ctx.loading) return false
  if (!(await consent.ask('buildings'))) return false
  const asked = { ...store.scene.place }
  ctx.loading = new AbortController()
  const mine = ctx.loading
  toast(t('wiz.map.loading'))
  try {
    // a building lower than the lowest window sill cannot shade the window, so those are the last to be kept
    const sills = store.scene.windows.map((w) => w.sill)
    const eye = floorLift(store.scene) + (sills.length ? Math.min(...sills) : 0.9)
    const { buildings, total, cutoff } = await net.buildings(asked, 200, mine.signal, { eye })
    // the answer is for the spot that was asked about, so it is dropped when the room has been put somewhere else since
    const now = store.scene.place
    if (mine.signal.aborted || haversine(asked, now) > 25) return false
    store.update((d) => {
      // what was drawn by hand is kept, and the loaded outlines take the room that is left
      const manual = d.obstacles.filter((o) => o.src !== 'osm')
      d.obstacles = [...buildings.slice(0, Math.max(0, MAX_OBSTACLES - manual.length)), ...manual]
      refreshOwn(d)
    })
    store.setUi({ obstacle: null })
    ctx.partial = total > buildings.length ? { n: buildings.length, total, deg: Math.max(1, Math.ceil(cutoff)) } : null
    toast(total ? t('wiz.map.loaded', { n: buildings.length }) : t('wiz.map.empty'))
    ctx.map.invalidate()
    return true
  } catch (err) {
    if (!mine.signal.aborted) toast(t('wiz.map.failed', { why: String(err.message || err).slice(0, 90) }))
    return false
  } finally {
    if (ctx.loading === mine) ctx.loading = null
  }
}

/** A clock for the map: drag it and the sun's line on the map and the buildings that shade a window follow. */
function timeRow(ctx) {
  const { store } = ctx
  const slider = h('input', { type: 'range', id: 'map-time', min: 0, max: 1439, step: 5, 'aria-label': t('dock.time') })
  const time = h('b', { class: 'map-time' })
  const line = h('span', { class: 'note', style: 'margin:0' })
  slider.addEventListener('input', () => store.update((d) => { d.minutes = Number(slider.value) }, { history: false }))
  const el = h('div', { class: 'time-row' }, h('div', { class: 'row', style: 'flex-wrap:nowrap;align-items:center' }, time, slider), line, h('p', { class: 'note' }, t('wiz.map.sunNote')))
  return {
    el,
    sync() {
      const s = store.scene
      const { sunrise, sunset } = sunTimes(2026, s.date.month, s.date.day, s.place.lat, s.place.lon, s.place.zone)
      // whole fives, so the thumb lands on times like 09:00 and not on 08:59
      slider.min = sunrise == null ? 0 : Math.ceil(sunrise / 5) * 5
      slider.max = sunset == null ? 1435 : Math.floor(sunset / 5) * 5
      slider.value = s.minutes
      slider.setAttribute('aria-valuetext', clock(s.minutes))
      time.textContent = clock(s.minutes)
      const sun = sunAt(s.place, s.date.month, s.date.day, s.minutes)
      line.textContent = sun.elevation > 0 ? t('dock.sunAt', { el: Math.round(sun.elevation), dir: bearingText(sun.azimuth) }) : t('dock.belowHorizon')
    },
  }
}

export function facingStep(ctx) {
  const { store, map, toast } = ctx
  const fields = []
  const target = () => Math.max(0, Math.min(store.scene.windows.length - 1, store.ui.selectedWindow ?? 0))
  const wallOf = () => store.scene.windows[target()]?.wall ?? 'top'
  const setBearing = (b) => store.update((d) => { d.facing = (((b - WALLS.indexOf(wallOf()) * 90) % 360) + 360) % 360 }, { key: 'facing' })

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': t('wiz.face.which') })
  const faceLine = h('p', { class: 'where', id: 'face-line' })
  const dial = compassDial({ label: t('room.dial'), get: () => wallBearing(store.scene, wallOf()), onChange: setBearing })
  const bearing = numberField({ store, compact: true, label: t('room.facingDeg'), kind: 'deg', min: 0, max: 359, step: 1, get: (s) => wallBearing(s, wallOf()), set: (d, v) => { d.facing = (((v - WALLS.indexOf(wallOf()) * 90) % 360) + 360) % 360 }, key: 'facing' })
  fields.push(bearing)
  const turn = h('div', { class: 'row turn' }, ...[-15, -1, 1, 15].map((n) => h('button', { class: 'btn', type: 'button', 'aria-label': t('wiz.face.turn', { n: `${n > 0 ? '+' : '−'}${Math.abs(n)}` }), onclick: () => store.update((d) => { d.facing = (((d.facing + n) % 360) + 360) % 360 }, { key: 'facing' }) }, `${n > 0 ? '+' : '−'}${Math.abs(n)}°`)))
  const compassCard = h('div', { hidden: true })
  const compassBtn = compassSupported() ? h('button', { class: 'btn block', type: 'button', id: 'compass-open', onclick: startCompass }, t('room.useCompass')) : null
  const outlines = h('button', { class: 'btn block', type: 'button', id: 'load-buildings', onclick: async () => { outlines.disabled = true; await loadBuildings(ctx); outlines.disabled = false; sync() } }, t('wiz.face.outlines'))
  const outlinesNote = h('p', { class: 'note' })
  const align = h('button', { class: 'btn block', type: 'button', id: 'align-outline', onclick: alignToOutline }, t('wiz.face.align'))
  const alignNote = h('p', { class: 'note' }, t('wiz.face.alignNote'))
  const alignBox = h('div', { hidden: true }, align, alignNote)
  const clockRow = timeRow(ctx)
  const main = h('div', {},
    h('p', {}, t('wiz.face.intro')),
    clockRow.el,
    chips,
    faceLine,
    dial.el, bearing.el, turn,
    compassBtn,
    h('h3', {}, t('wiz.face.outlinesTitle')),
    outlines, outlinesNote, alignBox,
    h('p', { class: 'note' }, t('wiz.face.northNote')))
  const el = h('section', { class: 'wiz-step' }, main, compassCard)
  let reader = null

  function startCompass() {
    main.hidden = true
    compassCard.hidden = false
    reader = openCompass({
      card: compassCard,
      place: store.scene.place,
      done: (b) => {
        reader = null
        compassCard.hidden = true
        main.hidden = false
        if (b != null) {
          setBearing(b)
          toast(t('room.compassSet', { dir: bearingText(b) }))
        }
      },
    })
  }

  function alignToOutline() {
    const s = store.scene
    const found = snapToOutline(s, wallBearing(s, wallOf()))
    if (!found) return
    if (found.turn === 0) {
      toast(t('wiz.face.alignedAlready'))
      return
    }
    setBearing(found.bearing)
    toast(t('wiz.face.aligned', { n: Math.abs(found.turn), dir: bearingText(found.bearing) }))
  }

  map.on.turnBy = (delta) => store.update((d) => { d.facing = (((d.facing + delta) % 360) + 360) % 360 }, { key: 'facing' })
  map.on.turnTo = setBearing
  map.on.moveRoom = (e, n) => store.update((d) => {
    const next = moveRoom(d, e, n)
    d.place = next.place
    d.obstacles = next.obstacles
    refreshOwn(d)
  }, { key: 'moveRoom' })

  function sync() {
    fields.forEach((f) => f.sync())
    clockRow.sync()
    dial.sync()
    const s = store.scene
    const list = s.windows.length ? s.windows : [{ wall: 'top' }]
    chips.replaceChildren(...list.map((w, i) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(i === target()), onclick: () => { store.setUi({ selectedWindow: i, selected: s.windows.length ? { type: 'window', index: i } : null }); map.target = i; map.invalidate(); sync() } }, `${t('win.name', { n: i + 1 })} · ${bearingText(wallBearing(s, w.wall))}`)))
    faceLine.textContent = t('room.faces', { n: target() + 1, dir: bearingText(wallBearing(s, wallOf())) })
    const osm = s.obstacles.filter((o) => o.src === 'osm').length
    alignBox.hidden = !s.obstacles.some((o) => o.type === 'building')
    outlinesNote.textContent = osm ? t('wiz.face.outlinesOn', { n: osm }) : t('wiz.face.outlinesOff')
    map.target = target()
    map.invalidate()
  }

  return {
    el,
    sync,
    enter() {
      map.target = target()
    },
    leave() {
      reader?.close()
      ctx.loading?.abort()
      for (const k of ['turnBy', 'turnTo', 'moveRoom']) map.on[k] = null
    },
  }
}

export function surroundStep(ctx) {
  const { store, map } = ctx
  const fields = []
  const status = h('p', { class: 'where' })
  const effect = h('p', { class: 'note', role: 'status' })
  const noSun = h('p', { class: 'note', id: 'no-sun' })
  const partial = h('p', { class: 'note', id: 'partial-load' })
  const list = h('div', { class: 'obstacle-list' })
  const showAll = { on: false }
  let shape = ''

  const sel = () => store.ui.obstacle ?? null
  const select = (i) => {
    store.setUi({ obstacle: i })
    map.selected = i
    map.invalidate()
  }
  map.on.select = (i) => {
    select(i)
    // a building past the first few has no card until the list shows them all
    if (i != null && i >= 8 && !showAll.on) {
      showAll.on = true
      shape = ''
      sync()
    }
    if (i != null) list.querySelector(`[data-obstacle="${i}"]`)?.scrollIntoView({ block: 'nearest' })
  }
  map.on.moveObstacle = (i, e, n) => store.update((d) => {
    const o = d.obstacles[i]
    if (!o || o.src !== 'manual') return
    if (o.type === 'tree') { o.x += e; o.y += n } else o.ring = o.ring.map(([x, y]) => [x + e, y + n])
  }, { key: `ob${i}` })

  const label = (o) => (o.type === 'tree' ? t('wiz.sur.tree') : o.own ? t('map.own') : o.name || (o.src === 'osm' ? t('wiz.sur.osm') : t('wiz.sur.block')))

  function row(o, i) {
    const on = h('input', { type: 'checkbox', checked: o.on, id: `ob-on${i}`, 'aria-label': t('wiz.sur.on') })
    on.addEventListener('change', () => store.update((d) => { if (d.obstacles[i]) d.obstacles[i].on = on.checked }))
    const height = numberField({ store, compact: true, label: o.type === 'tree' ? t('wiz.sur.treeHeight') : t('wiz.sur.height'), min: 1, max: o.type === 'tree' ? 45 : 600, step: 0.5, get: (s) => s.obstacles[i]?.h ?? 1, set: (d, v) => { if (d.obstacles[i]) { d.obstacles[i].h = v; d.obstacles[i].est = false } }, key: `ob${i}.h` })
    fields.push(height)
    const del = h('button', { class: 'mini', type: 'button', onclick: () => { store.update((d) => { d.obstacles.splice(i, 1) }); select(null) } }, t('things.remove'))
    const card = h('div', { class: `card ob ${sel() === i ? 'selected' : ''}`, dataset: { obstacle: i }, onclick: (e) => { if (!e.target.closest('input,button,label')) select(sel() === i ? null : i) } },
      h('div', { class: 'card-head' }, h('label', { class: 'check', htmlFor: `ob-on${i}`, style: 'margin:0;flex:1' }, on, h('b', {}, label(o))), o.est ? h('span', { class: 'tag est', title: t('wiz.sur.estNote') }, t('wiz.sur.est')) : null, del),
      height.el)
    return card
  }

  function renderList() {
    fields.length = 0
    const s = store.scene
    const rows = s.obstacles.map((o, i) => [o, i])
    const shown = showAll.on ? rows : rows.slice(0, 8)
    list.replaceChildren(...shown.map(([o, i]) => row(o, i)))
    if (rows.length > 8) list.append(h('button', { class: 'btn block', type: 'button', onclick: () => { showAll.on = !showAll.on; shape = ''; sync() } }, showAll.on ? t('wiz.sur.fewer') : t('wiz.sur.all', { n: rows.length })))
    shape = `${s.obstacles.length}|${showAll.on}|${s.obstacles.map((o) => `${o.on}${o.est}`).join('')}`
  }

  const num = (id, value, min, max, step = 1) => h('input', { type: 'number', id, inputMode: 'decimal', value, min, max, step, class: 'num-in' })
  const field = (id, text, input) => h('div', { class: 'field compact' }, h('label', { htmlFor: id }, text), input)
  const bIn = { bearing: num('nb-bearing', 270, 0, 359), dist: num('nb-dist', 20, 3, 400), width: num('nb-width', 20, 2, 200), depth: num('nb-depth', 12, 2, 200), height: num('nb-height', 24, 1, 600) }
  const tIn = { bearing: num('nt-bearing', 270, 0, 359), dist: num('nt-dist', 8, 2, 200), height: num('nt-height', 9, 1, 45), crown: num('nt-crown', 5, 1, 30) }
  const read = (el, lo, hi) => Math.max(lo, Math.min(hi, Number(el.value) || lo))
  const addBlock = h('button', { class: 'btn', type: 'button', onclick: () => {
    store.update((d) => {
      if (d.obstacles.length >= MAX_OBSTACLES) return
      d.obstacles.push({ type: 'building', src: 'manual', ring: blockRing(read(bIn.bearing, 0, 359), read(bIn.dist, 3, 400), read(bIn.width, 2, 200), read(bIn.depth, 2, 200)), h: read(bIn.height, 1, 600), base: 0 })
    })
    select(store.scene.obstacles.length - 1)
  } }, t('wiz.sur.addBlock'))
  const addTree = h('button', { class: 'btn', type: 'button', onclick: () => {
    store.update((d) => {
      if (d.obstacles.length >= MAX_OBSTACLES) return
      const b = (read(tIn.bearing, 0, 359) * Math.PI) / 180
      const r = read(tIn.dist, 2, 200)
      d.obstacles.push({ type: 'tree', src: 'manual', x: r * Math.sin(b), y: r * Math.cos(b), r: read(tIn.crown, 1, 30) / 2, h: read(tIn.height, 1, 45), base: Math.min(3, read(tIn.height, 1, 45) * 0.3) })
    })
    select(store.scene.obstacles.length - 1)
  } }, t('wiz.sur.addTree'))

  const clockRow = timeRow(ctx)
  const shadeNow = h('p', { class: 'note', role: 'status', id: 'shade-now' })
  const load = h('button', { class: 'btn primary block', type: 'button', id: 'load-buildings', onclick: async () => { load.disabled = true; await loadBuildings(ctx); load.disabled = false; shape = ''; sync() } }, t('wiz.face.outlines'))
  const el = h('section', { class: 'wiz-step' },
    h('p', {}, t('wiz.sur.intro')),
    load, status, partial, clockRow.el, shadeNow, effect, noSun, list,
    h('p', { class: 'note' }, t('wiz.sur.estNote')),
    h('details', { class: 'more' }, h('summary', {}, t('wiz.sur.addBlockTitle')),
      h('div', { class: 'grid2' }, field('nb-bearing', t('wiz.sur.bearing'), bIn.bearing), field('nb-dist', t('wiz.sur.distance'), bIn.dist), field('nb-width', t('wiz.sur.width'), bIn.width), field('nb-depth', t('wiz.sur.depth'), bIn.depth), field('nb-height', t('wiz.sur.height'), bIn.height)),
      addBlock),
    h('details', { class: 'more' }, h('summary', {}, t('wiz.sur.addTreeTitle')),
      h('div', { class: 'grid2' }, field('nt-bearing', t('wiz.sur.bearing'), tIn.bearing), field('nt-dist', t('wiz.sur.distance'), tIn.dist), field('nt-height', t('wiz.sur.treeHeight'), tIn.height), field('nt-crown', t('wiz.sur.crown'), tIn.crown)),
      addTree,
      h('p', { class: 'note' }, t('wiz.sur.treeNote'))),
    h('p', { class: 'note' }, t('wiz.sur.balconyNote')))

  function sync() {
    const s = store.scene
    if (shape !== `${s.obstacles.length}|${showAll.on}|${s.obstacles.map((o) => `${o.on}${o.est}`).join('')}`) renderList()
    fields.forEach((f) => f.sync())
    clockRow.sync()
    const sun = sunAt(s.place, s.date.month, s.date.day, s.minutes)
    const shading = sun.elevation > 0 && s.obstacles.length ? shadingObstacles(s, sunInRoom(s, sun.azimuth, sun.elevation)) : []
    shadeNow.textContent = !s.obstacles.length || !(sun.elevation > 0) ? '' : shading.length ? t('wiz.sur.shadeNow', { time: clock(s.minutes), n: shading.length }) : t('wiz.sur.shadeNone', { time: clock(s.minutes) })
    list.querySelectorAll('.card.ob').forEach((c) => c.classList.toggle('selected', sel() === Number(c.dataset.obstacle)))
    status.textContent = s.obstacles.length ? t('wiz.sur.status', { n: s.obstacles.length, est: s.obstacles.filter((o) => o.est).length }) : t('wiz.sur.none')
    const withIt = sunHoursInside(s)
    const without = sunHoursInside({ ...s, obstacles: [] })
    effect.textContent = s.obstacles.some((o) => o.on) ? t('wiz.sur.effect', { date: dateText(s.date.month, s.date.day), a: duration(withIt), b: duration(without) }) : t('wiz.sur.effectNone', { date: dateText(s.date.month, s.date.day), b: duration(without) })
    noSun.textContent = without < 1 / 60 ? t('wiz.sur.noSun') : ''
    partial.textContent = ctx.partial && s.obstacles.some((o) => o.src === 'osm') ? t('wiz.map.partial', ctx.partial) : ''
    addBlock.disabled = addTree.disabled = s.obstacles.length >= MAX_OBSTACLES
    map.selected = sel()
    map.invalidate()
  }

  return {
    el,
    sync,
    enter() {
      map.selected = sel()
    },
    leave() {
      ctx.loading?.abort()
      for (const k of ['select', 'moveObstacle']) map.on[k] = null
    },
  }
}
