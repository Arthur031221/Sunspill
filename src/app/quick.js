// The quick check, the first screen: find the flat, tap the building, pick the floor, and see the sun on every
// side of it at once. A search box on top of a map, and the answer in a sheet under it. Only after that, if the
// person wants, comes the room editor (filled in), the list for comparing flats, and the full editor.

import { h } from './dom.js'
import { t, tq, locale, LOCALES, setLocale, onLocale } from './i18n.js'
import { MapView } from './mapview.js'
import { Refused } from './net.js'
import { duration } from './format.js'
import { createCompare, MAX_COMPARE } from './compare.js'
import { extractAddress } from '../core/twaddress.js'
import { footprintSides, sideScene, WINDOW } from '../core/sides.js'
import { sunPlan, measureSteps, verdictOf } from '../core/sidesun.js'
import { fromLocal, insideRing, ringDistance } from '../core/geo.js'
import { zoneAt } from '../core/zone.js'
import { encodeQuick } from '../core/sharelink.js'
import { addressKey } from '../core/addresskey.js'
import { summarise } from '../core/deals.js'
import { createDeals } from './deals.js'
import { dealsSection } from './deals-view.js'

const STOREY = 3
const DEFAULT_FLOOR = 3
/** The square that stands for a building with no outline, in metres across. */
const POINT_SIZE = 10
const BUILDING_LIMIT = 400
const RADIUS = 200
/** How far, in metres, the middle of a shared building may have moved on the map and still be the same building. */
const SAME_BUILDING = 25
/** How far round the building the past deals are looked for, in metres. The numbers use 300 of them, the nearest list all. */
const DEALS_REACH = 450

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const sideName = (id) => tq(`quick.side.${id}`)
const centroid = (ring) => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]

/**
 * @param ctx.store, ctx.net, ctx.consent, ctx.modal, ctx.toast  the page's own
 * @param ctx.root      the element that holds the quick check
 * @param ctx.classic   () => void, leaves for the full editor
 * @param ctx.openRoom  (scene) => void, opens the room editor with this scene
 */
export function createQuick(ctx) {
  const { store, net, consent, modal, toast, root } = ctx
  const compare = createCompare()

  const state = {
    phase: 'idle',
    message: '',
    declined: false,
    places: [],
    found: null,
    exact: true,
    place: null,
    origin: null,
    buildings: [],
    loadState: 'none',
    selected: null,
    floor: DEFAULT_FLOOR,
    chosen: new Set(),
    working: false,
    shared: false,
    // the floor that the sides on show were worked out for, which is behind `floor` for a moment after the stepper moves
    sidesFloor: 0,
    sidesFor: null,
    sides: [],
    plan: null,
    chip: null,
    gen: 0,
    analysisGen: 0,
    view: 'main',
    added: false,
    // the answer of a link that is being opened: the building to find, the sides to pick, and whether they were picked yet
    link: null,
    // the past deals round the selected building: which building they were asked for, how it went, and what they say
    deals: { for: '', status: 'idle', summary: null, asof: '' },
  }
  const dealsLoader = createDeals()
  let dealsController = null
  let controller = null
  let floorTimer = 0

  // ---------------------------------------------------------------- the page

  const input = h('input', { type: 'search', id: 'quick-q', class: 'quick-q', placeholder: tq('quick.placeholder'), 'aria-label': tq('quick.placeholder'), autocomplete: 'off', enterKeyHint: 'search', maxLength: 4000 })
  const go = h('button', { class: 'btn primary fixed', type: 'submit', id: 'quick-go' }, tq('quick.go'))
  const locate = h('button', { class: 'btn fixed quick-locate', type: 'button', id: 'quick-locate', title: tq('quick.locate'), 'aria-label': tq('quick.locate'), onclick: () => useLocation() })
  locate.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>'
  const form = h('form', { class: 'quick-search', role: 'search', onsubmit: (e) => { e.preventDefault(); submit() } }, input, go, locate)

  const mapRoot = h('div', { class: 'quick-map', id: 'quick-map' })
  const chipBox = h('div', { class: 'quick-chips' })
  const recenter = h('button', { class: 'quick-recenter btn', type: 'button', id: 'quick-recenter', onclick: () => flyToBuilding(), hidden: true }, tq('quick.recenter'))
  const pointChip = h('button', { class: 'btn primary', type: 'button', id: 'quick-point', onclick: () => usePoint(), hidden: true }, tq('quick.usePoint'))
  const compareChip = h('button', { class: 'chip', type: 'button', id: 'quick-compare', onclick: () => showCompare(), hidden: true })
  chipBox.append(compareChip)
  mapRoot.append(chipBox, recenter, h('div', { class: 'quick-point' }, pointChip))

  const grab = h('button', { class: 'quick-grab', type: 'button', 'aria-expanded': 'true', 'aria-label': tq('quick.sheet.toggle'), onclick: () => toggleSheet() }, h('span'))
  const body = h('div', { class: 'quick-body', id: 'quick-body' })
  const foot = h('footer', { class: 'quick-foot' })
  const sheet = h('section', { class: 'quick-sheet', id: 'quick-sheet', 'aria-label': tq('quick.title') }, grab, body, foot)
  root.append(form, mapRoot, sheet)

  const map = new MapView({
    root: mapRoot,
    store,
    net,
    tilesOn: () => consent.allowed('tiles'),
    askTiles: async () => {
      if (await consent.askQuick()) map.paintChrome()
    },
    on: { quickTap: (hit) => tapped(hit) },
  })
  map.cam = { lat: 25.04, lon: 121.55, zoom: 13 }
  map.setMode('quick')

  function toggleSheet() {
    const open = sheet.dataset.open !== '0'
    sheet.dataset.open = open ? '0' : '1'
    grab.setAttribute('aria-expanded', String(!open))
  }

  // ---------------------------------------------------------------- state to the map

  const building = () => (state.selected == null ? null : state.buildings[state.selected] ?? null)

  function pushMap() {
    map.quick = {
      origin: state.origin ?? { lat: store.scene.place.lat, lon: store.scene.place.lon },
      buildings: state.buildings,
      selected: state.selected,
      pin: state.place ? { lat: state.place.lat, lon: state.place.lon } : null,
      point: state.chip ? [state.chip.east, state.chip.north] : null,
      sides: state.sides.map((s) => ({ id: s.id, label: t(`compass.${s.id}`), point: s.point, bearing: s.bearing, verdict: s.verdict, chosen: state.chosen.has(s.id) })),
    }
    const b = building()
    recenter.hidden = !(b || state.place)
    pointChip.hidden = !state.chip
    pointChip.textContent = tq('quick.usePoint')
    map.invalidate()
  }

  /** Zoom that puts a stretch of ground at about half the width of the map. */
  function zoomFor(metres) {
    const ppm = (Math.min(map.width, map.height) * 0.5) / Math.max(12, metres)
    return clamp(Math.log2((ppm * 40075016.686 * Math.cos(state.origin.lat * (Math.PI / 180))) / 256), 17, 19.5)
  }

  function flyToBuilding() {
    const b = building()
    if (b) {
      const [e, n] = centroid(b.ring)
      const xs = b.ring.map((p) => p[0])
      const ys = b.ring.map((p) => p[1])
      const at = fromLocal(state.origin, e, n)
      map.flyTo(at.lat, at.lon, zoomFor(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.6))
    } else if (state.place) map.flyTo(state.place.lat, state.place.lon, 18)
  }

  // ---------------------------------------------------------------- search

  function stop() {
    state.gen++
    state.analysisGen++
    state.link = null
    dealsController?.abort()
    dealsController = null
    state.deals = { for: '', status: 'idle', summary: null, asof: '' }
    controller?.abort()
    controller = null
  }

  function setPhase(phase, message = '') {
    state.phase = phase
    state.message = message
    render()
  }

  async function submit() {
    const text = input.value.trim()
    if (text.length < 2) return
    stop()
    const mine = state.gen
    const stale = () => mine !== state.gen
    state.view = 'main'
    state.found = extractAddress(text)
    state.floor = state.found?.floor ?? DEFAULT_FLOOR
    state.declined = false
    if (!(await consent.askQuick())) {
      if (stale()) return
      state.declined = true
      setPhase('idle', tq('quick.declined'))
      return
    }
    if (stale()) return
    setPhase('search', tq('quick.searching'))
    controller = new AbortController()
    try {
      const found = await net.lookupAddress(text, locale(), controller.signal)
      if (stale()) return
      if (!found.places.length) {
        setPhase('idle', tq('quick.none'))
        return
      }
      state.exact = found.exact
      if (found.places.length === 1 || found.exact) choose(found.places[0])
      else {
        state.places = found.places
        setPhase('pick', tq('quick.pick'))
      }
    } catch (err) {
      if (stale() || controller?.signal.aborted) return
      setPhase('idle', err instanceof Refused ? tq('quick.declined') : tq('quick.failed', { why: String(err.message || err).slice(0, 80) }))
    }
  }

  function useLocation() {
    if (!navigator.geolocation) return toast(t('place.denied'))
    stop()
    const mine = state.gen
    consent.askQuick().then((yes) => {
      if (!yes || mine !== state.gen) return
      toast(t('place.locating'))
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (mine !== state.gen) return
          const { latitude: lat, longitude: lon } = pos.coords
          state.found = null
          state.exact = true
          choose({ name: t('place.here'), label: '', lat, lon, zone: zoneAt(lat, lon) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })
        },
        () => toast(t('place.denied')),
        { timeout: 10000, maximumAge: 600000 },
      )
    })
  }

  function choose(place) {
    state.link = null
    state.place = place
    state.origin = { lat: place.lat, lon: place.lon }
    state.buildings = []
    state.selected = null
    state.sides = []
    state.chosen.clear()
    state.chip = null
    state.loadState = 'loading'
    state.view = 'main'
    state.analysisGen++
    map.flyTo(place.lat, place.lon, 18)
    pushMap()
    setPhase('loading', tq('quick.loading'))
    loadBuildings(state.origin, state.found && !state.exact ? tq('quick.foundStreet') : tq('quick.foundExact'))
  }

  /** The outlines round a point, tried again and across the servers (see net.js), and on failure the page says so and offers a retry. */
  async function loadBuildings(origin, done) {
    controller?.abort()
    const mine = ++state.gen
    controller = new AbortController()
    const signal = controller.signal
    state.loadState = 'loading'
    let gone = false
    try {
      const { buildings } = await net.buildings(origin, RADIUS, signal, { limit: BUILDING_LIMIT, rounds: 2, onNext: (host) => toast(t('wiz.map.another', { host })) })
      if (mine !== state.gen) return
      // a square that stood in for a building with no outline stays chosen, now with its neighbours in
      const square = building()?.synthetic && !building().fromLink ? building() : null
      state.buildings = buildings
      state.selected = null
      if (square) {
        state.buildings.push(square)
        state.selected = state.buildings.length - 1
      }
      state.loadState = buildings.length ? 'ok' : 'empty'
      gone = !square && applyLink()
    } catch (err) {
      if (mine !== state.gen || signal.aborted) return
      state.loadState = err instanceof Refused ? 'refused' : 'failed'
      // no outlines, but a link that carries its building's outline can still say what the sun does at it
      state.buildings = state.buildings.filter((b) => !b.fromLink)
      state.selected = null
      gone = applyLink()
    }
    pushMap()
    setPhase('choose', gone ? tq('quick.link.gone') : state.loadState === 'ok' ? done || tq('quick.tapBuilding') : '')
    if (state.selected !== null) analyse()
  }

  // ---------------------------------------------------------------- a link that is being opened

  /**
   * Where the building of a link stands among the outlines that were loaded: the one with its OpenStreetMap number,
   * as long as it is where the link says, and else the building that holds the middle of the link's outline. -1 when none.
   */
  function findLinked(list, wanted) {
    const c = wanted.ring ? centroid(wanted.ring) : null
    let best = -1
    let near = Infinity
    if (wanted.id) {
      list.forEach((o, i) => {
        if (o.id !== wanted.id || o.fromLink) return
        const d = c ? Math.hypot(centroid(o.ring)[0] - c[0], centroid(o.ring)[1] - c[1]) : 0
        if (d < near) {
          best = i
          near = d
        }
      })
      if (near <= SAME_BUILDING) return best
    }
    best = -1
    if (c) list.forEach((o, i) => { if (!o.fromLink && !o.synthetic && insideRing(o.ring, c) && (best < 0 || o.h > list[best].h)) best = i })
    return best
  }

  /** The building a link carries, for when the map has no outline for it. */
  function linkedBuilding(wanted) {
    const base = { type: 'building', src: 'osm', name: '', ring: wanted.ring, h: wanted.h || 12, base: 0, est: true, own: false, on: true, fromLink: true }
    return wanted.id ? { ...base, id: wanted.id, ...(wanted.levels ? { levels: wanted.levels } : {}) } : { ...base, id: -1, synthetic: true }
  }

  /**
   * Choose the building of the link among the outlines that were loaded, put the sides it named on, and report
   * whether the building could not be found at all. A link whose outline is kept never fails that way.
   */
  function applyLink() {
    const link = state.link
    if (!link) return false
    const at = findLinked(state.buildings, link.building)
    if (at >= 0) {
      state.selected = at
      state.link = null
    } else if (link.building.ring) {
      state.buildings.push(linkedBuilding(link.building))
      state.selected = state.buildings.length - 1
    } else {
      state.link = null
      return true
    }
    if (!link.applied) {
      link.applied = true
      state.chosen.clear()
      for (const id of link.sides) state.chosen.add(id)
    }
    flyToBuilding()
    return false
  }

  /** Open the answer of a link: ask the one question first when it has not been answered, then load the outlines and choose the same building, floor and sides. */
  async function openShared(link) {
    stop()
    const mine = state.gen
    state.view = 'main'
    state.declined = false
    state.found = null
    state.exact = true
    state.floor = link.floor
    state.added = false
    state.link = { building: link.building, sides: link.sides, applied: false }
    input.value = link.name
    setPhase('idle', '')
    if (!(await consent.askQuick())) {
      if (mine !== state.gen) return
      state.declined = true
      state.link = null
      setPhase('idle', tq('quick.declined'))
      return
    }
    if (mine !== state.gen) return
    // the link has done its work, and the address bar should not keep an answer that the person is about to change
    ctx.linkOpened?.()
    const place = link.pin ? { name: link.name, label: '', lat: link.lat, lon: link.lon, zone: zoneAt(link.lat, link.lon) || 'Asia/Taipei' } : null
    state.place = place
    state.origin = { lat: link.lat, lon: link.lon }
    state.buildings = []
    state.selected = null
    state.sides = []
    state.chosen.clear()
    state.chip = null
    state.loadState = 'loading'
    state.analysisGen++
    map.flyTo(link.lat, link.lon, 18)
    pushMap()
    setPhase('loading', tq('quick.loading'))
    loadBuildings(state.origin, '')
  }

  // ---------------------------------------------------------------- taps on the map

  function tapped(hit) {
    if (state.view !== 'main') return
    if (hit.kind === 'side') {
      toggleSide(hit.id)
      return
    }
    if (hit.kind === 'building') {
      state.chip = null
      if (hit.index !== state.selected) selectBuilding(hit.index)
      else pushMap()
      return
    }
    // bare ground: offer the point, do nothing else
    if (!state.origin) return
    state.chip = hit
    pushMap()
  }

  function selectBuilding(index) {
    state.link = null
    state.selected = index
    state.chip = null
    state.chosen.clear()
    state.added = false
    flyToBuilding()
    pushMap()
    analyse()
  }

  /** A building with no outline: a square round the tapped point stands in for it. */
  function usePoint() {
    const c = state.chip
    if (!c) return
    const r = POINT_SIZE / 2
    const ring = [[c.east - r, c.north - r], [c.east + r, c.north - r], [c.east + r, c.north + r], [c.east - r, c.north + r]]
    state.buildings = state.buildings.filter((b) => !b.synthetic)
    state.buildings.push({ type: 'building', src: 'osm', id: -1, name: '', ring, h: 12, base: 0, est: true, own: false, on: true, synthetic: true })
    selectBuilding(state.buildings.length - 1)
  }

  function nearest() {
    const o = [0, 0]
    let best = null
    state.buildings.forEach((b, i) => {
      const d = ringDistance(b.ring, o)
      if (!best || d < best.d || (d === best.d && b.h > state.buildings[best.i].h)) best = { i, d }
    })
    if (best) selectBuilding(best.i)
  }

  function toggleSide(id) {
    if (!state.sides.some((s) => s.id === id)) return
    if (state.chosen.has(id)) state.chosen.delete(id)
    else state.chosen.add(id)
    state.added = false
    pushMap()
    render()
  }

  function setFloor(n) {
    const floor = clamp(Math.round(n), 1, 99)
    if (floor === state.floor) return
    state.floor = floor
    state.added = false
    render()
    clearTimeout(floorTimer)
    floorTimer = setTimeout(() => {
      if (building()) analyse()
    }, 220)
  }

  // ---------------------------------------------------------------- the sun on each side

  async function analyse() {
    const b = building()
    if (!b) return
    ensureDeals()
    const mine = ++state.analysisGen
    state.working = true
    // a new building has no sides until they are worked out, and a new floor keeps the old ones, dimmed, for the moment
    if (state.sidesFor !== state.selected) state.sides = []
    render()
    const neighbours = state.buildings.filter((_, i) => i !== state.selected)
    const top = (state.floor - 1) * STOREY + WINDOW.sill + WINDOW.h
    const sides = footprintSides(b.ring, { neighbours, top })
    // some wall was left out because a neighbour shares it
    const length = (list) => list.reduce((sum, side) => sum + side.length, 0)
    state.shared = length(footprintSides(b.ring, { neighbours: [], top })) - length(sides) > 1
    const zone = state.place?.zone || zoneAt(state.origin.lat, state.origin.lon) || 'Asia/Taipei'
    const plan = sunPlan({ name: '', lat: state.origin.lat, lon: state.origin.lon, zone })
    state.plan = { total: neighbours.length, est: neighbours.filter((o) => o.est).length }
    const done = []
    for (const side of sides) {
      const scene = sideScene({ origin: state.origin, side, floor: state.floor, storey: STOREY, neighbours, zone, name: state.place?.name ?? '' })
      const run = measureSteps(scene, plan)
      let t0 = performance.now()
      let result
      while (true) {
        const next = run.next()
        if (next.done) {
          result = next.value
          break
        }
        // the thread goes back to the page now and then, so a slow phone stays alive
        if (performance.now() - t0 > 12) {
          await tick()
          if (mine !== state.analysisGen) return
          t0 = performance.now()
        }
      }
      done.push({ ...side, ...result, verdict: verdictOf(result.afternoon) })
    }
    if (mine !== state.analysisGen) return
    state.sides = done.sort((p, q) => q.afternoon - p.afternoon || p.sector - q.sector)
    state.sidesFloor = state.floor
    state.sidesFor = state.selected
    for (const id of [...state.chosen]) if (!state.sides.some((s) => s.id === id)) state.chosen.delete(id)
    state.working = false
    pushMap()
    render()
  }

  // ---------------------------------------------------------------- past deals nearby

  /** Ask for the past deals round the selected building, unless they are here already or on their way. */
  function ensureDeals(again = false) {
    const b = building()
    if (!b || !state.origin) return
    const key = `${state.origin.lat},${state.origin.lon}|${state.selected}|${b.id}`
    if (!again && state.deals.for === key && state.deals.status !== 'failed') return
    dealsController?.abort()
    dealsController = new AbortController()
    const { signal } = dealsController
    state.deals = { for: key, status: 'loading', summary: null, asof: '' }
    render()
    const [east, north] = centroid(b.ring)
    const at = fromLocal(state.origin, east, north)
    dealsLoader.around(at.lat, at.lon, DEALS_REACH, signal).then(
      (found) => {
        if (signal.aborted || state.deals.for !== key) return
        if (found.status === 'ok') {
          const address = addressKey(state.found?.address || state.place?.name || '')?.key ?? null
          state.deals = { for: key, status: 'ok', asof: found.asof, summary: summarise(found.deals, { origin: state.origin, ring: b.ring, address, now: new Date(), reach: DEALS_REACH }) }
        } else state.deals = { for: key, status: found.status, summary: null, asof: '' }
        render()
      },
      () => {},
    )
  }

  const dealsBlock = () => dealsSection(state.deals, () => ensureDeals(true))

  // ---------------------------------------------------------------- the sheet

  const bars = (year) => {
    const max = 14
    return h('div', { class: 'bars', role: 'img', 'aria-label': `${tq('quick.card.chart')}: ${year.map((v) => Math.round(v * 10) / 10).join(', ')}` },
      ...year.map((v, i) => h('i', { style: `height:${Math.max(2, Math.round((Math.min(v, max) / max) * 100))}%`, title: `${i + 1}: ${duration(v)}` })))
  }

  const summerLine = (minutes) => (minutes < 1 ? tq('quick.card.summerNone') : tq('quick.card.summer', { time: duration(minutes / 60) }))
  const winterLine = (hours) => (hours < 1 / 60 ? tq('quick.card.winterNone') : tq('quick.card.winter', { time: duration(hours) }))

  function floorStepper() {
    const b = building()
    const note = b?.levels ? tq('quick.floor.levels', { n: b.levels }) : b && !b.synthetic ? tq('quick.floor.tall', { h: Math.round(b.h) }) : ''
    const over = b?.levels && state.floor > b.levels ? tq('quick.floor.over', { n: b.levels }) : ''
    return h('div', { class: 'quick-floor' },
      h('div', { class: 'qf-row' },
        h('span', { class: 'qf-label', id: 'qf-label' }, tq('quick.floor')),
        h('button', { class: 'qf-btn', type: 'button', id: 'floor-less', 'aria-label': tq('quick.floor.less'), disabled: state.floor <= 1, dataset: { k: 'less' }, onclick: () => setFloor(state.floor - 1) }, '−'),
        h('output', { class: 'qf-value', id: 'floor-value', 'aria-labelledby': 'qf-label', 'aria-live': 'polite' }, tq('quick.floor.value', { n: state.floor })),
        h('button', { class: 'qf-btn', type: 'button', id: 'floor-more', 'aria-label': tq('quick.floor.more'), disabled: state.floor >= 99, dataset: { k: 'more' }, onclick: () => setFloor(state.floor + 1) }, '+'),
        note ? h('span', { class: 'qf-note' }, note) : null),
      over ? h('p', { class: 'note warn' }, over) : null)
  }

  // only a side that looks west is called 西曬, any other side gets plain afternoon sun
  const verdictText = (verdict, ids) => tq(`quick.verdict.${ids.some((id) => /W$/.test(id)) ? 'west.' : ''}${verdict}`)

  function summary() {
    const picked = state.sides.filter((s) => state.chosen.has(s.id))
    if (!picked.length) return h('p', { class: 'quick-summary pick', id: 'quick-summary' }, tq('quick.summary.pick'))
    const afternoon = Math.max(...picked.map((s) => s.afternoon))
    const winter = Math.max(...picked.map((s) => s.winter))
    const verdict = verdictOf(afternoon)
    return h('div', { class: `quick-summary v-${verdict}`, id: 'quick-summary', 'aria-live': 'polite' },
      h('small', {}, tq('quick.summary.head', { sides: picked.map((s) => sideName(s.id)).join(tq('quick.join')) })),
      h('b', { class: 'big' }, verdictText(verdict, picked.map((s) => s.id))),
      h('p', {}, summerLine(afternoon)),
      h('p', {}, winterLine(winter)))
  }

  function card(side) {
    const on = state.chosen.has(side.id)
    return h('button', { class: `side-card v-${side.verdict}${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), 'aria-label': `${tq('quick.card.pick', { side: sideName(side.id) })}. ${verdictText(side.verdict, [side.id])}. ${summerLine(side.afternoon)}. ${winterLine(side.winter)}`, dataset: { side: side.id, k: `side-${side.id}` }, onclick: () => toggleSide(side.id) },
      h('span', { class: 'sc-head' }, h('b', {}, sideName(side.id)), h('span', { class: 'verdict' }, verdictText(side.verdict, [side.id]))),
      h('span', { class: 'sc-text' }, h('span', {}, summerLine(side.afternoon)), h('span', {}, winterLine(side.winter))),
      bars(side.year))
  }

  function advanced() {
    const canRoom = state.chosen.size > 0
    // while the sun is worked out again for a new floor the sides on show are the old floor's, so nothing is taken from them
    const stale = state.working || state.sidesFloor !== state.floor
    const saved = compare.list()
    const room = h('button', { class: 'adv-btn', type: 'button', id: 'adv-room', disabled: !canRoom || stale, onclick: () => openRoom() },
      h('b', {}, tq('quick.adv.room')), h('small', {}, canRoom ? tq('quick.adv.roomNote') : tq('quick.adv.roomNeed')))
    const add = h('button', { class: 'adv-btn', type: 'button', id: 'adv-compare', onclick: () => addToCompare(), disabled: state.added || stale }, h('b', {}, state.added ? tq('quick.adv.added') : tq('quick.adv.compare')), h('small', {}, `${saved.length} / ${MAX_COMPARE}`))
    return h('div', { class: 'quick-adv' }, h('h3', {}, tq('quick.adv.title')), room, add)
  }

  function mainBody() {
    const frag = []
    const b = building()
    if (state.phase === 'idle' || state.phase === 'search' || state.phase === 'loading') {
      frag.push(h('h2', {}, tq('quick.title')))
      if (state.phase === 'idle' && !state.message) frag.push(h('p', {}, tq('quick.intro')))
      if (state.message) frag.push(h('p', { class: 'quick-status', role: 'status' }, state.message))
      if (state.declined) frag.push(h('button', { class: 'btn block', type: 'button', id: 'quick-declined-classic', onclick: () => ctx.classic() }, tq('quick.full')))
      if (state.phase === 'idle' && state.message && !state.declined) frag.push(h('button', { class: 'btn block', type: 'button', id: 'quick-load-here', onclick: () => loadHere() }, tq('quick.loadHere')))
      return frag
    }
    if (state.phase === 'pick') {
      frag.push(h('h2', {}, tq('quick.title')), h('p', { class: 'quick-status', role: 'status' }, state.message))
      frag.push(h('ul', { class: 'result-list' }, ...state.places.map((p) => h('li', {}, h('button', { type: 'button', onclick: () => choose(p) }, h('span', { class: 'rl-name' }, p.name), h('small', {}, p.label))))))
      return frag
    }
    // outlines are in, or have failed
    if (!b) {
      frag.push(h('h2', {}, tq('quick.title')))
      if (state.message) frag.push(h('p', { class: 'quick-status', role: 'status' }, state.message))
      if (state.loadState === 'failed' || state.loadState === 'refused') {
        frag.push(h('p', { class: 'note warn', id: 'quick-load-failed' }, tq('quick.loadFailed')))
        frag.push(h('button', { class: 'btn block', type: 'button', id: 'quick-retry', onclick: () => { setPhase('loading', tq('quick.loading')); loadBuildings(state.origin, '') } }, tq('quick.retry')))
        frag.push(h('p', {}, tq('quick.noOutlines')))
      } else if (state.loadState === 'empty') frag.push(h('p', {}, tq('quick.noOutlines')))
      if (state.buildings.length) frag.push(h('button', { class: 'btn block', type: 'button', id: 'quick-nearest', onclick: () => nearest() }, tq('quick.nearest')))
      frag.push(floorStepper())
      return frag
    }
    frag.push(h('div', { class: 'quick-head' },
      h('h2', {}, b.name ? tq('quick.building.named', { name: b.name }) : tq('quick.building')),
      h('button', { class: 'btn', type: 'button', id: 'quick-share', 'aria-label': tq('quick.share.aria'), onclick: () => share() }, tq('quick.share'))))
    if (b.synthetic) frag.push(h('p', { class: 'note' }, tq('quick.pointNote')))
    if (state.loadState === 'failed' || state.loadState === 'refused') {
      frag.push(h('p', { class: 'note warn', id: 'quick-load-failed' }, tq('quick.loadFailed')),
        h('button', { class: 'btn block', type: 'button', id: 'quick-retry', onclick: () => loadBuildings(state.origin, '') }, tq('quick.retry')))
    }
    frag.push(floorStepper())
    if (state.working && !state.sides.length) {
      frag.push(h('p', { class: 'quick-status', role: 'status', id: 'quick-working' }, tq('quick.working')))
      return frag
    }
    if (!state.sides.length) {
      frag.push(h('p', { class: 'note', id: 'quick-nosides' }, tq('quick.nosides')))
      if (state.shared) frag.push(h('p', { class: 'note' }, tq('quick.party')))
      frag.push(dealsBlock())
      return frag
    }
    // for the moment after the stepper moves the cards are those of the floor before, and are shown dimmed
    const stale = state.sidesFloor !== state.floor
    frag.push(h('div', { class: stale ? 'quick-result stale' : 'quick-result', 'aria-busy': String(stale) }, summary(), h('p', { class: 'note sorted' }, tq('quick.sorted')), h('div', { class: 'quick-cards', id: 'quick-cards' }, ...state.sides.map(card))))
    frag.push(h('p', { class: 'note' }, tq('quick.help')))
    if (state.shared) frag.push(h('p', { class: 'note' }, tq('quick.party')))
    frag.push(dealsBlock())
    frag.push(advanced())
    frag.push(h('details', { class: 'more quick-how' }, h('summary', {}, tq('quick.how.title')), h('p', { class: 'note' }, tq('quick.how.body', { est: state.plan?.est ?? 0, total: state.plan?.total ?? 0 }))))
    return frag
  }

  async function loadHere() {
    const at = { lat: map.cam.lat, lon: map.cam.lon }
    if (!(await consent.askQuick())) return
    state.link = null
    state.place = null
    state.origin = at
    state.buildings = []
    state.selected = null
    state.sides = []
    state.chosen.clear()
    pushMap()
    setPhase('loading', tq('quick.loading'))
    loadBuildings(at, '')
  }

  // ---------------------------------------------------------------- share

  /** The link that opens this answer again: the place, the building, the floor and the sides picked. */
  function shareUrl() {
    const b = building()
    const hash = encodeQuick({
      lat: state.origin.lat,
      lon: state.origin.lon,
      name: state.found?.address || state.place?.name || '',
      pin: Boolean(state.place),
      floor: state.floor,
      sides: [...state.chosen],
      building: { id: b.synthetic ? 0 : b.id, ring: b.ring, h: b.h, levels: b.levels ?? 0 },
    })
    return `${location.origin}${location.pathname}#${hash}`
  }

  /** The link in a box to copy by hand, for a browser that will not copy it. */
  function showLink(url) {
    const box = h('input', { type: 'text', readOnly: true, value: url, class: 'quick-linkbox', id: 'quick-linkbox', 'aria-label': tq('quick.share.manual.title') })
    box.addEventListener('focus', () => box.select())
    modal.show(tq('quick.share.manual.title'), [h('p', {}, tq('quick.share.manual.body')), box], [h('button', { class: 'btn primary', type: 'button', onclick: () => modal.close(true) }, tq('quick.share.done'))])
  }

  /** The share sheet of the phone when there is one, else the link is copied. */
  async function share() {
    if (!building() || !state.origin) return
    const url = shareUrl()
    const place = state.found?.address || state.place?.name || tq('quick.share.here')
    const data = { title: tq('quick.share.title'), text: tq('quick.share.text', { place, floor: tq('quick.floor.value', { n: state.floor }) }), url }
    if (typeof navigator.share === 'function' && navigator.canShare?.(data) !== false) {
      try {
        await navigator.share(data)
        return
      } catch (err) {
        // the person closed the sheet, which is an answer
        if (err?.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast(tq('quick.share.copied'))
    } catch {
      showLink(url)
    }
  }

  // ---------------------------------------------------------------- compare

  function addToCompare() {
    const b = building()
    if (!b || !state.sides.length) return
    const [e, n] = centroid(b.ring)
    const at = fromLocal(state.origin, e, n)
    const place = state.found?.address || state.place?.name || ''
    const result = compare.add({
      label: [place, tq('quick.floor.value', { n: state.floor })].filter(Boolean).join(' · ').slice(0, 80),
      address: place,
      floor: state.floor,
      lat: at.lat,
      lon: at.lon,
      chosen: [...state.chosen],
      sides: state.sides.map((s) => ({ id: s.id, afternoon: s.afternoon, winter: s.winter, year: s.year })),
    })
    if (result === 'full') toast(tq('quick.adv.full'))
    else if (result === 'failed') toast(tq('quick.compare.saveFailed'))
    else {
      state.added = true
      toast(tq('quick.adv.added'))
    }
    renderChips()
    render()
  }

  function showCompare() {
    state.view = 'compare'
    render()
    sheet.dataset.open = '1'
  }

  function compareBody() {
    const list = compare.list()
    const frag = [h('div', { class: 'cmp-head' }, h('h2', {}, tq('quick.compare.title')), h('button', { class: 'btn', type: 'button', id: 'compare-back', onclick: () => { state.view = 'main'; render() } }, tq('quick.compare.back')))]
    if (!list.length) {
      frag.push(h('p', {}, tq('quick.compare.empty')))
      return frag
    }
    frag.push(h('div', { class: 'cmp-grid', id: 'compare-grid' }, ...list.map((f) => {
      const picked = f.sides.filter((s) => f.chosen.includes(s.id))
      return h('section', { class: 'cmp-col', dataset: { id: f.id } },
        h('h3', {}, f.label || f.address),
        h('p', { class: 'note' }, [f.address, tq('quick.floor.value', { n: f.floor })].filter(Boolean).join(' · ')),
        ...(picked.length ? picked.map((s) => h('div', { class: `cmp-side v-${verdictOf(s.afternoon)}` },
          h('b', {}, sideName(s.id)),
          h('span', { class: 'verdict' }, verdictText(verdictOf(s.afternoon), [s.id])),
          h('p', {}, summerLine(s.afternoon)),
          h('p', {}, winterLine(s.winter)),
          bars(s.year))) : [h('p', { class: 'note' }, tq('quick.compare.none')), ...f.sides.map((s) => h('p', { class: 'cmp-line' }, `${sideName(s.id)} ${duration(s.afternoon / 60)}`))]),
        h('button', { class: 'mini', type: 'button', onclick: () => { compare.remove(f.id); renderChips(); render() } }, tq('quick.compare.remove')))
    })))
    return frag
  }

  function renderChips() {
    const n = compare.list().length
    compareChip.hidden = n === 0
    compareChip.textContent = tq('quick.compare.button', { n })
  }

  // ---------------------------------------------------------------- the room editor

  function openRoom() {
    const b = building()
    const side = state.sides.filter((s) => state.chosen.has(s.id)).sort((p, q) => q.afternoon - p.afternoon)[0]
    if (!b || !side) return
    const neighbours = state.buildings.filter((_, i) => i !== state.selected)
    const zone = state.place?.zone || zoneAt(state.origin.lat, state.origin.lon) || 'Asia/Taipei'
    ctx.openRoom(sideScene({ origin: state.origin, side, floor: state.floor, storey: STOREY, neighbours, own: b, name: state.place?.name ?? state.found?.address ?? '', zone }))
  }

  // ---------------------------------------------------------------- drawing it all

  function renderFoot() {
    const lang = h('select', { class: 'select', id: 'quick-lang', 'aria-label': 'Language' }, ...Object.entries(LOCALES).map(([code, l]) => h('option', { value: code }, l.name)))
    lang.value = locale()
    lang.addEventListener('change', () => {
      setLocale(lang.value)
      store.setUi({ lang: lang.value })
    })
    foot.replaceChildren(
      h('button', { class: 'linkbtn', type: 'button', id: 'quick-classic', onclick: () => ctx.classic() }, tq('quick.full')),
      h('button', { class: 'linkbtn', type: 'button', id: 'quick-online', onclick: () => consent.settings() }, t('net.footer', { n: consent.count() })),
      lang)
  }

  // what the sheet is about, so that it starts at the top for another view or building and keeps its place otherwise
  let shown = ''
  function render() {
    const keep = document.activeElement?.dataset?.k ?? document.activeElement?.id ?? null
    const about = `${state.view}|${state.selected}|${state.phase}`
    const scroll = about === shown ? body.scrollTop : 0
    shown = about
    body.replaceChildren(...(state.view === 'compare' ? compareBody() : mainBody()))
    body.scrollTop = scroll
    if (keep && body.contains(document.activeElement) === false) {
      const again = body.querySelector(`[data-k="${keep}"]`) ?? body.querySelector(`#${keep}`)
      again?.focus({ preventScroll: true })
    }
    renderChips()
  }

  function translate() {
    input.placeholder = tq('quick.placeholder')
    input.setAttribute('aria-label', tq('quick.placeholder'))
    go.textContent = tq('quick.go')
    locate.title = tq('quick.locate')
    locate.setAttribute('aria-label', tq('quick.locate'))
    recenter.textContent = tq('quick.recenter')
    grab.setAttribute('aria-label', tq('quick.sheet.toggle'))
    sheet.setAttribute('aria-label', tq('quick.title'))
    map.paintChrome()
    renderFoot()
    render()
  }

  onLocale(() => translate())
  store.subscribe((_, what) => {
    if (what === 'ui') {
      map.paintChrome()
      renderFoot()
    }
  })
  translate()

  // a read only handle for the browser tests
  return {
    map,
    state,
    show() {
      map.resize()
      map.paintChrome()
      // a phone would raise the keyboard over the map at once, so only a pointer that is not a finger gets the focus
      if (!matchMedia('(pointer: coarse)').matches) input.focus({ preventScroll: true })
    },
    hide() {
      stop()
    },
    /** The paste box, for the test and for a link that fills it. */
    fill(text) {
      input.value = text
    },
    submit,
    openShared,
  }
}
