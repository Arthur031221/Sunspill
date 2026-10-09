import { createStore } from './store.js'
import { h, $, frameThrottle } from './dom.js'
import { LOCALES, pickLocale, setLocale, locale, t, onLocale } from './i18n.js'
import { Stage } from './stage.js'
import { createDock } from './timeline.js'
import { createPanels, toast } from './panels.js'
import { createAnalysis } from './analysis.js'
import { frameFor, itemSunHours, floorArea } from './frame.js'
import { renderCard, renderGif } from './export.js'
import { clock, dateText, duration, bearingText, areaText, lengthText, itemName } from './format.js'
import { defaultScene } from '../core/room.js'
import { encodeScene, decodeScene, blurScene } from '../core/codec.js'
import { hoursAt } from '../core/hours.js'
import { legendGradient } from '../render/heat.js'
import { PALETTES } from '../render/palette.js'
import { createNet } from './net.js'
import { createConsent } from './consent.js'
import { createModal } from './modal.js'
import { MapView } from './mapview.js'
import { createWizard } from './wizard.js'
import { openCompass } from './compass-ui.js'
import { declination, decimalYear } from '../core/declination.js'
import { setPlacePoint, haversine } from '../core/geo.js'
import { zoneAt } from '../core/zone.js'

// the version in package.json, put in by the build (the test pages that load the source see the placeholder)
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev'
const PREFS_KEY = 'sunspill.prefs'
const loadPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}
  } catch {
    return {}
  }
}
const savePrefs = (ui) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: ui.theme, lang: ui.lang, units: ui.units, arc: ui.showArc, net: ui.net, setup: ui.setupDone }))
  } catch {
    // private mode: the settings simply do not persist
  }
}

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const dark = matchMedia('(prefers-color-scheme: dark)')
const prefs = loadPrefs()
const ROOM_KEY = 'sunspill.room'
// the room that a friend's link pushed aside, so that one edit does not cost you yours
const EARLIER_KEY = 'sunspill.room.earlier'
// rooms kept by name, to flip between flats: a short list of links that stays in this browser
const SAVED_KEY = 'sunspill.saved'
const MAX_SAVED = 12
const stored = (key) => {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}
const loadRoom = () => decodeScene(stored(ROOM_KEY))
/** The named rooms, newest first, each with the scene its link holds. Anything that does not decode is left out. */
function readSaved() {
  let list = []
  try {
    list = JSON.parse(stored(SAVED_KEY))
  } catch {
    // nothing saved yet, or not readable
  }
  if (!Array.isArray(list)) return []
  return list
    .filter((r) => r && typeof r.name === 'string' && typeof r.code === 'string')
    .map((r) => ({ name: r.name.slice(0, 60), code: r.code, at: Number(r.at) || 0, scene: decodeScene(r.code) }))
    .filter((r) => r.scene)
    .slice(0, MAX_SAVED)
}
const writeSaved = (list) => {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list.map(({ name, code, at }) => ({ name, code, at }))))
    return true
  } catch {
    return false
  }
}
const fromLink = decodeScene(location.hash.slice(1))
// without a link, the room that was last edited here comes back
const restored = fromLink ? null : loadRoom()
// a link opened over a room of your own: the first edit keeps yours aside
let aside = fromLink && stored(ROOM_KEY) && stored(ROOM_KEY) !== location.hash.slice(1) ? stored(ROOM_KEY) : ''
const initial = fromLink ?? restored ?? defaultScene()
let edited = false
const lang = LOCALES[prefs.lang] ? prefs.lang : pickLocale(navigator.languages)
const imperial = /^en-(US|LR|MM)$/i.test(navigator.language || '')
const northern = initial.place.lat >= 0

const store = createStore(initial, {
  theme: ['auto', 'light', 'dark'].includes(prefs.theme) ? prefs.theme : 'auto',
  themeResolved: 'light',
  lang,
  units: prefs.units === 'ft' || prefs.units === 'm' ? prefs.units : imperial ? 'ft' : 'm',
  tab: 'room',
  net: { search: prefs.net?.search === true, tiles: prefs.net?.tiles === true, buildings: prefs.net?.buildings === true },
  dims: false,
  arcOff: false,
  setupDone: prefs.setup === true,
  obstacle: null,
  selected: null,
  selectedWindow: 0,
  showArc: prefs.arc !== false,
  playing: !fromLink && !restored && !reduced,
  mode: '3d',
  heat: { on: false, period: 'day', from: 6, to: 8, z: 0 },
  west: { from: northern ? 6 : 12, to: northern ? 9 : 3, after: 14 * 60 },
  plant: { need: 'partial', height: 0.8 },
  gifRange: 'lit',
})
setLocale(lang)

const modal = createModal($('#modal'))
const consent = createConsent({ store, modal })
const net = createNet({ allowed: (service) => consent.allowed(service) })

const el = {
  canvas: $('#canvas'),
  stage: $('#stage'),
  tip: $('#tip'),
  legend: $('#legend'),
  busy: $('#busy'),
  hint: $('#hint'),
  live: $('#live'),
}

let heatShown = 0
let heatTween = 0
const analysis = createAnalysis(store, {
  onChange: (what) => {
    if (what === 'heat') updateLegend()
    stage.invalidate()
    if (panels.name === 'results') panels.refresh()
  },
  onBusy: (name, fraction) => {
    if (name !== 'heat' && !(name === 'spots' || name === 'west')) return
    const active = fraction != null
    if (name === 'heat') {
      el.busy.hidden = !active
      $('#busy-text').textContent = t('results.computing')
      $('i', el.busy).style.width = `${Math.round((fraction || 0) * 100)}%`
    }
  },
})

const overlay = { marks: null, underlay: null }
const stage = new Stage({
  canvas: el.canvas,
  store,
  reducedMotion: reduced,
  getFrame: () => frameFor(store.scene),
  getHeat: () => {
    if (!store.ui.heat.on || heatShown <= 0.01) return null
    const img = analysis.heatImage(store.ui.themeResolved)
    return img && { ...img, alpha: heatShown }
  },
  getMarkers: () => (store.ui.tab === 'results' && analysis.spots?.list) || null,
  getOverlay: () => ({ ...overlay, dimensions: store.ui.dims, fmt: (m) => lengthText(m, store.ui.units) }),
  onSelect: (sel) => store.setUi({ selected: sel, selectedWindow: sel?.type === 'window' ? sel.index : store.ui.selectedWindow }),
  onHover: (p, cam) => showTip(p, cam),
  say: (sel) => say(sel),
})

const dock = createDock({ root: $('#dock'), store, stage })

const actions = {
  locate() {
    if (!navigator.geolocation) return toast(t('place.denied'))
    toast(t('place.locating'))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const zone = zoneAt(pos.coords.latitude, pos.coords.longitude) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        store.update((d) => {
          setPlacePoint(d, pos.coords.latitude, pos.coords.longitude)
          d.place.name = t('place.here')
          d.place.zone = zone
        })
        actions.afterPlace()
      },
      () => toast(t('place.denied')),
      { timeout: 10000, maximumAge: 600000 },
    )
  },
  afterPlace() {
    const north = store.scene.place.lat >= 0
    store.setUi({ west: { ...store.ui.west, from: north ? 6 : 12, to: north ? 9 : 3 } })
  },
  async copyLink(hide) {
    const scene = hide ? blurScene(store.scene) : store.scene
    const url = `${location.origin}${location.pathname}#${encodeScene(scene)}`
    try {
      await navigator.clipboard.writeText(url)
      toast(t('share.copied'))
    } catch {
      toast(t('share.copyFailed'))
    }
  },
  async savePng(hide) {
    toast(t('share.rendering'))
    const blob = await renderCard({ scene: store.scene, themeName: store.ui.themeResolved, hideLocation: hide })
    download(blob, `sunspill-${stamp()}.png`)
  },
  gifController: null,
  async makeGif(hide, onProgress) {
    actions.gifController?.abort()
    const controller = (actions.gifController = new AbortController())
    return renderGif({ scene: store.scene, themeName: store.ui.themeResolved, hideLocation: hide, range: store.ui.gifRange, onProgress, signal: controller.signal })
  },
  cancelGif() {
    actions.gifController?.abort()
  },
  exportJson(hide) {
    const scene = hide ? blurScene(store.scene) : store.scene
    download(new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' }), `sunspill-room-${stamp()}.json`)
  },
  async importJson(file) {
    try {
      if (file.size > 1_000_000) throw new Error('a room file is a few kilobytes')
      const data = JSON.parse(await file.text())
      if (!data || typeof data !== 'object' || !data.room) throw new Error('no room')
      store.replace(data)
      edited = true
      toast(t('share.imported'))
    } catch {
      toast(t('share.importFailed'))
    }
  },
  hasEarlier: () => Boolean(decodeScene(stored(EARLIER_KEY))),
  savedRooms: () => readSaved(),
  /** Keep the room under a name. The same name again replaces that room. Returns 'saved', 'full', 'name' or 'failed'. */
  saveRoom(name) {
    const clean = String(name).replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!clean) return 'name'
    const list = readSaved()
    const at = list.findIndex((r) => r.name.toLowerCase() === clean.toLowerCase())
    const entry = { name: clean, code: encodeScene(store.scene), at: Date.now() }
    if (at >= 0) list.splice(at, 1)
    else if (list.length >= MAX_SAVED) return 'full'
    list.unshift(entry)
    if (!writeSaved(list)) return 'failed'
    toast(t('saved.saved', { name: clean }))
    return 'saved'
  },
  /** Show a saved room. The room that was open is set aside, so Bring back my earlier room returns to it and Undo does too. */
  openRoom(index) {
    const room = readSaved()[index]
    if (!room) return false
    flushSave()
    const now = encodeScene(store.scene)
    // the room to set aside is the one that is yours: the room a friend's link pushed aside, or else the one on the page,
    // unless that is only the sample room nobody touched
    const keep = aside || (edited || restored || fromLink ? now : '')
    store.replace(room.scene)
    edited = true
    try {
      if (keep && keep !== room.code) localStorage.setItem(EARLIER_KEY, keep)
      localStorage.setItem(ROOM_KEY, room.code)
    } catch {
      // the room is on the page either way
    }
    aside = ''
    toast(t('saved.opened', { name: room.name }))
    afterScene()
    return true
  },
  deleteRoom(index) {
    const list = readSaved()
    const [gone] = list.splice(index, 1)
    if (!gone) return false
    writeSaved(list)
    toast(t('saved.deleted', { name: gone.name }))
    return true
  },
  /** Swap with the room a link pushed aside, so that a second press goes back. */
  bringBack() {
    flushSave()
    const before = { earlier: stored(EARLIER_KEY), mine: stored(ROOM_KEY) }
    try {
      // the room that is waiting to be set aside is the one to bring back
      if (aside) localStorage.setItem(EARLIER_KEY, aside)
    } catch {
      // nothing can be kept in this browser
    }
    const earlier = decodeScene(aside || stored(EARLIER_KEY))
    aside = ''
    if (!earlier) return false
    const now = encodeScene(store.scene)
    store.replace(earlier)
    edited = true
    try {
      localStorage.setItem(EARLIER_KEY, now)
      localStorage.setItem(ROOM_KEY, encodeScene(earlier))
    } catch {
      // one write may have gone through without the other: put both back as they were
      try {
        localStorage.setItem(EARLIER_KEY, before.earlier)
        localStorage.setItem(ROOM_KEY, before.mine)
      } catch {
        // the room is back on the page either way
      }
    }
    toast(t('share.earlierBack'))
    afterScene()
    return true
  },
  reset() {
    edited = false
    aside = ''
    try {
      localStorage.removeItem(ROOM_KEY)
      localStorage.removeItem(EARLIER_KEY)
    } catch {
      // nothing was kept
    }
    store.replace(defaultScene())
    store.setUi({ playing: !reduced })
    dock.start()
  },
  setHeat(patch) {
    const wasOn = store.ui.heat.on
    store.setUi({ heat: { ...store.ui.heat, ...patch } })
    if (store.ui.heat.on) analysis.ensureHeat()
    if (patch.on !== undefined && patch.on !== wasOn) tweenHeat(patch.on)
    updateLegend()
    panels.refresh()
    analysis.ensureSpots()
    stage.invalidate()
  },
  setWest(patch) {
    store.setUi({ west: { ...store.ui.west, ...patch } })
    analysis.ensureWest()
    panels.refresh()
  },
  setPlant(patch) {
    store.setUi({ plant: { ...store.ui.plant, ...patch } })
    analysis.ensureSpots()
    panels.refresh()
  },
  /** The phone compass in a sheet, for the window on `wall`. */
  openCompass(wall) {
    const card = h('div')
    modal.show(t('compass.title'), [card], [], { onClose: () => reader?.close() })
    const reader = openCompass({
      card,
      place: store.scene.place,
      done: (bearing) => {
        modal.close(true)
        if (bearing == null) return
        store.update((d) => { d.facing = (((bearing - ['top', 'right', 'bottom', 'left'].indexOf(wall) * 90) % 360) + 360) % 360 }, { key: 'facing' })
        toast(t('room.compassSet', { dir: bearingText(bearing) }))
      },
    })
    modal.refocus()
  },
  resultsOpened() {
    analysis.ensureWest()
    analysis.ensureSpots()
    if (store.ui.heat.on) analysis.ensureHeat()
  },
}
const panels = createPanels({ store, tabsEl: $('#tabs'), bodyEl: $('#tab-body'), stage, analysis, actions })

const map = new MapView({
  root: $('#mapview'),
  store,
  net,
  tilesOn: () => consent.allowed('tiles'),
  askTiles: async () => {
    if (await consent.ask('tiles')) map.paintChrome()
  },
  on: {},
})
let wizardView = null
const wizard = createWizard({
  store, stage, map, net, consent, modal, actions, toast, overlay,
  root: $('#wizard'),
  tracepane: $('#tracepane'),
  showTrace: (on) => { $('#tracepane').hidden = !on },
  setView(view) {
    wizardView = view
    const mapView = view === 'pin' || view === 'facing' || view === 'surround'
    el.stage.classList.toggle('map-on', mapView)
    $('#mapview').hidden = !mapView
    // the sun path across the plan hides the numbers on it, so the planning steps draw without it
    store.setUi({ arcOff: view === 'plan' })
    if (mapView) map.setMode(view, { select: store.ui.obstacle ?? null, target: Math.max(0, store.ui.selectedWindow ?? 0) })
    else {
      store.setUi({ mode: view === '3d' ? '3d' : view === 'plan' ? 'plan' : store.ui.mode })
      stage.setMode(store.ui.mode)
      chrome()
    }
  },
  onClose: (finished) => {
    el.stage.classList.remove('map-on')
    $('#mapview').hidden = true
    store.setUi({ arcOff: false })
    if (finished) {
      store.setUi({ setupDone: true })
      toast(t('wiz.finished'))
    }
    store.setUi({ tab: 'results' })
    panels.show('results')
    setMode('3d')
    $('#setup').focus()
  },
})
$('#setup').addEventListener('click', () => {
  store.setUi({ playing: false })
  wizard.open(0)
})

function stamp() {
  const s = store.scene
  return `${s.date.month}-${s.date.day}`
}

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = h('a', { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function tweenHeat(on) {
  cancelAnimationFrame(heatTween)
  const from = heatShown
  const to = on ? 1 : 0
  if (reduced) {
    heatShown = to
    stage.invalidate()
    return
  }
  const start = performance.now()
  const step = (now) => {
    const k = Math.min(1, (now - start) / 450)
    heatShown = from + (to - from) * k
    stage.invalidate()
    if (k < 1) heatTween = requestAnimationFrame(step)
  }
  heatTween = requestAnimationFrame(step)
}

function updateLegend() {
  const img = analysis.heatImage(store.ui.themeResolved)
  const show = store.ui.heat.on && img
  el.legend.hidden = !show
  if (!show) return
  const ticks = []
  const max = img.max
  const stepSize = max <= 6 ? 1 : max <= 12 ? 2 : 4
  for (let v = 0; v <= max; v += stepSize) ticks.push(h('span', {}, v === max ? `${v}+` : String(v)))
  el.legend.replaceChildren(h('b', {}, t('results.legend')), h('div', { class: 'ramp', style: `background:${legendGradient(PALETTES[store.ui.themeResolved])}` }), h('div', { class: 'ticks' }, ...ticks))
}

function showTip(p, cam) {
  const img = analysis.heat
  if (!store.ui.heat.on || !img || !cam || stage.drag) {
    el.tip.hidden = true
    return
  }
  const at = cam.planeAt(p[0], p[1], 0)
  const room = store.scene.room
  if (!at || at[0] < 0 || at[1] < 0 || at[0] > room.w || at[1] > room.d) {
    el.tip.hidden = true
    return
  }
  const hours = hoursAt(img.grid, room, at[0], at[1])
  el.tip.hidden = false
  el.tip.textContent = t('tip.spot', { x: lengthText(at[0], store.ui.units), y: lengthText(at[1], store.ui.units), t: hours < 0.02 ? t('tip.none') : duration(hours) })
  el.tip.style.left = `${p[0]}px`
  el.tip.style.top = `${p[1]}px`
}

function resolveTheme() {
  const pick = store.ui.theme === 'auto' ? (dark.matches ? 'dark' : 'light') : store.ui.theme
  document.documentElement.dataset.theme = pick
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', pick === 'dark' ? '#0b0f1c' : '#f7f1e6')
  if (store.ui.themeResolved !== pick) store.setUi({ themeResolved: pick })
}

function chrome() {
  $('#tagline').textContent = t('app.tagline')
  document.title = t('app.title')
  const undo = $('#undo')
  const redo = $('#redo')
  undo.textContent = '↶'
  redo.textContent = '↷'
  undo.title = undo.ariaLabel = t('top.undo')
  redo.title = redo.ariaLabel = t('top.redo')
  const langSel = $('#lang')
  langSel.replaceChildren(...Object.entries(LOCALES).map(([code, l]) => h('option', { value: code }, l.name)))
  langSel.value = locale()
  $('#theme').textContent = t(`top.theme.${store.ui.theme}`)
  $('#theme').title = t('top.theme')
  const units = $('#units')
  units.replaceChildren(...['m', 'ft'].map((u) => h('button', { type: 'button', 'aria-pressed': String(store.ui.units === u), onclick: () => store.setUi({ units: u }) }, u)))
  units.setAttribute('aria-label', t('top.units'))
  const view = $('#view')
  view.replaceChildren(...['3d', 'plan'].map((m) => h('button', { type: 'button', 'aria-pressed': String(store.ui.mode === m), onclick: () => setMode(m) }, t(`view.${m}`))))
  view.setAttribute('aria-label', t('view.label'))
  const arc = $('#arc')
  arc.textContent = t('stage.arc')
  arc.setAttribute('aria-pressed', String(store.ui.showArc))
  el.hint.textContent = t('stage.hint')
  $('#canvas-help').textContent = t('stage.keys')
  $('#setup').textContent = t('wiz.start')
  $('#foot').replaceChildren(
    h('span', {}, t('foot.privacy')),
    h('button', { class: 'linkbtn', type: 'button', id: 'online', onclick: () => consent.settings() }, t('net.footer', { n: consent.count() })),
    h('a', { href: 'https://github.com/Arthur031221/Sunspill', rel: 'noopener' }, t('foot.source')),
    h('a', { href: `https://github.com/Arthur031221/Sunspill/releases/tag/v${VERSION}`, rel: 'noopener', title: 'Sunspill' }, `v${VERSION}`),
    h('span', {}, t('foot.model')))
  $('a.skip').textContent = t('app.skip')
  undo.disabled = !store.canUndo()
  redo.disabled = !store.canRedo()
}

function setMode(mode) {
  store.setUi({ mode })
  stage.setMode(mode)
  chrome()
}

function summary() {
  const s = store.scene
  const f = frameFor(s)
  return t('stage.aria', {
    w: lengthText(s.room.w, store.ui.units),
    d: lengthText(s.room.d, store.ui.units),
    time: clock(s.minutes),
    date: dateText(s.date.month, s.date.day),
    place: s.place.name || '',
    state: f.sun.elevation > 0 ? t('stage.ariaSun', { el: Math.round(f.sun.elevation), dir: bearingText(f.sun.azimuth), area: areaText(floorArea(f.patches), store.ui.units) }) : t('stage.ariaNight'),
  })
}


let lastHash = ''
let writeTimer = 0
/** Keep the room in this browser, but only a room that was edited here: opening somebody's link must not replace your own. */
function keepRoom(code) {
  if (!edited) return
  try {
    if (aside) {
      localStorage.setItem(EARLIER_KEY, aside)
      aside = ''
      afterScene() // the Share tab can offer the room that was set aside
    }
    localStorage.setItem(ROOM_KEY, code)
  } catch {
    // private mode: the link still holds the room
  }
}
const writeHash = () => {
  clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = 0
    lastHash = `#${encodeScene(store.scene)}`
    try {
      history.replaceState(null, '', lastHash)
    } catch {
      // Safari allows a hundred of these in thirty seconds; the room is still kept below
    }
    keepRoom(lastHash.slice(1))
  }, 300)
}
/** A save that is still waiting goes now, before something else takes the place of the room. */
function flushSave() {
  if (!writeTimer) return
  clearTimeout(writeTimer)
  writeTimer = 0
  keepRoom(encodeScene(store.scene))
}

/** Where the middle of a piece, or a window, ended up after an arrow key, said aloud through the live region. */
function say(sel) {
  const s = store.scene
  const unit = store.ui.units
  let text = ''
  if (sel.type === 'item' && s.items[sel.index]) {
    const it = s.items[sel.index]
    text = t('live.item', { name: itemName(s.items, sel.index), x: lengthText(it.x + it.w / 2, unit), y: lengthText(it.y + it.d / 2, unit), rot: Math.round(it.rot) })
  } else if (sel.type === 'window' && s.windows[sel.index]) {
    const win = s.windows[sel.index]
    text = t('live.window', { n: sel.index + 1, pos: lengthText(win.pos, unit), wall: t(`wall.${win.wall}`) })
  }
  if (!text) return
  // the same words twice in a row are not read again unless the region is emptied first
  el.live.textContent = ''
  requestAnimationFrame(() => { el.live.textContent = text })
}

let announceTimer = 0
function announce() {
  clearTimeout(announceTimer)
  announceTimer = setTimeout(() => {
    el.canvas.setAttribute('aria-label', summary())
  }, 400)
}

let analysisTimer = 0
const afterScene = frameThrottle(() => {
  const frame = frameFor(store.scene)
  stage.invalidate()
  dock.sync(frame)
  panels.sync(panels.name === 'things' ? { itemHours: itemSunHours(store.scene) } : undefined)
  $('#undo').disabled = !store.canUndo()
  $('#redo').disabled = !store.canRedo()
  announce()
  wizard.sync()
  clearTimeout(analysisTimer)
  analysisTimer = setTimeout(() => {
    if (store.ui.heat.on) analysis.ensureHeat()
    if (panels.name === 'results') {
      analysis.ensureWest()
      analysis.ensureSpots()
      panels.refresh()
    }
  }, 350)
})

store.onEdit = () => {
  if (aside && !edited) toast(t('app.linkAside'))
  edited = true
  if (store.ui.playing) store.setUi({ playing: false })
  el.hint.classList.add('gone')
}

// buildings loaded for one spot go when the room is moved to another, which should not pass in silence
let seen = { lat: store.scene.place.lat, lon: store.scene.place.lon, osm: store.scene.obstacles.filter((o) => o.src === 'osm').length }
store.subscribe((state, what) => {
  if (what !== 'scene') return
  const { place, obstacles } = state.scene
  const osm = obstacles.filter((o) => o.src === 'osm').length
  // after the message of the step that moved the room, so that this one is the one left on screen
  if (seen.osm > 0 && osm === 0 && haversine(seen, place) > 25) setTimeout(() => toast(t('app.buildingsCleared')), 0)
  seen = { lat: place.lat, lon: place.lon, osm }
})

let lastLocaleBuild = ''
store.subscribe((state, what) => {
  if (what === 'scene') {
    writeHash()
    afterScene()
    return
  }
  // interface settings changed
  map.paintChrome()
  resolveTheme()
  savePrefs(state.ui)
  chrome()
  stage.invalidate()
  dock.invalidateCurve()
  afterScene()
  const key = `${state.ui.units}|${locale()}`
  if (key !== lastLocaleBuild) {
    lastLocaleBuild = key
    dock.rebuild()
    panels.build()
    wizard.rebuild()
    updateLegend()
    afterScene()
  }
})

$('#lang').addEventListener('change', (e) => {
  setLocale(e.target.value)
  store.setUi({ lang: e.target.value })
})
$('#theme').addEventListener('click', () => {
  const order = ['auto', 'light', 'dark']
  store.setUi({ theme: order[(order.indexOf(store.ui.theme) + 1) % 3] })
})
$('#undo').addEventListener('click', () => store.undo())
$('#redo').addEventListener('click', () => store.redo())
$('#arc').addEventListener('click', () => store.setUi({ showArc: !store.ui.showArc }))
dark.addEventListener('change', () => store.ui.theme === 'auto' && (resolveTheme(), stage.invalidate(), dock.invalidateCurve(), afterScene()))
addEventListener('resize', () => afterScene())
addEventListener('hashchange', () => {
  if (location.hash === lastHash) return
  const next = decodeScene(location.hash.slice(1))
  if (!next) return
  // somebody's room pasted into this tab: it is not yours until you edit it, and yours stays set aside
  flushSave()
  const mine = stored(ROOM_KEY)
  aside = mine && mine !== location.hash.slice(1) ? mine : ''
  edited = false
  store.replace(next)
})
addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault()
    e.shiftKey ? store.redo() : store.undo()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
    e.preventDefault()
    store.redo()
  } else if (e.key === ' ' && !typing && e.target.tagName !== 'BUTTON') {
    e.preventDefault()
    dock.toggle()
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && e.target === el.canvas && store.ui.selected) {
    const sel = store.ui.selected
    e.preventDefault()
    store.update((d) => { (sel.type === 'item' ? d.items : d.windows).splice(sel.index, 1) })
    store.setUi({ selected: null })
    stage.select(null)
  }
})
// anything the user touches in the panel or on the stage ends the autoplay
for (const node of [el.canvas, $('#panel')]) node.addEventListener('pointerdown', () => store.ui.playing && store.setUi({ playing: false }), { capture: true })

onLocale(() => {
  chrome()
})
resolveTheme()
chrome()
panels.build()
if (restored) toast(t('app.restored'))
lastLocaleBuild = `${store.ui.units}|${locale()}`
afterScene()
el.canvas.setAttribute('aria-label', summary())
if (store.ui.playing) dock.start()
document.documentElement.dataset.ready = '1'
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {})
// a read only handle for the browser tests
window.__sunspill = {
  store, stage, analysis, wizard, map, consent, net, panelActions: actions,
  frame: () => frameFor(store.scene),
  floorArea: () => floorArea(frameFor(store.scene).patches),
  decode: (hash) => decodeScene(hash.slice(1)),
  declination: (lat, lon) => declination(lat, lon, decimalYear(Date.now())),
  encode: (scene) => encodeScene(scene),
}
