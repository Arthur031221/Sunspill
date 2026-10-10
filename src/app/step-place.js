// Step 1: where the room is. Type an address or a place, or drop a pin on the
// map; the latitude, longitude and time zone follow.

import { h } from './dom.js'
import { t, locale } from './i18n.js'
import { coordinateFields } from './place-fields.js'
import { searchCities, cityPlace } from '../core/cities.js'
import { zoneAt } from '../core/zone.js'
import { zoneOffset, isZone } from '../core/solar.js'
import { haversine, setPlacePoint } from '../core/geo.js'
import { Refused } from './net.js'

const offsetText = (zone) => {
  const m = zoneOffset(zone, Date.now())
  const sign = m < 0 ? '−' : '+'
  const a = Math.abs(m)
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`
}

export function placeStep(ctx) {
  const { store, net, consent, map, toast } = ctx
  const fields = []
  const input = h('input', { type: 'search', id: 'place-q', placeholder: t('wiz.place.placeholder'), 'aria-label': t('wiz.place.placeholder'), autocomplete: 'off', enterKeyHint: 'search', maxLength: 200 })
  const results = h('ul', { class: 'result-list', 'aria-label': t('wiz.place.results') })
  const status = h('p', { class: 'note', role: 'status' })
  const where = h('p', { class: 'where', 'aria-live': 'polite', tabIndex: -1 })
  let abort = null
  let generation = 0

  /** Move the room to a place: the name, the point and the time zone together. */
  function choose(place, { recentre = true } = {}) {
    const old = store.scene.place
    const zone = (isZone(place.zone) && place.zone) || zoneAt(place.lat, place.lon) || old.zone
    store.update((d) => {
      setPlacePoint(d, place.lat, place.lon)
      d.place.name = place.name || d.place.name
      d.place.zone = zone
    })
    ctx.actions.afterPlace()
    ctx.loadNote = ''
    // the button that was pressed goes with the list, so the focus moves to the line that says where the room is now
    const focused = results.contains(document.activeElement)
    results.replaceChildren()
    status.textContent = ''
    if (focused) where.focus({ preventScroll: true })
    // a result from the search brings the map to it, a tap on the map leaves the view where the person put it
    if (recentre) map.fit('pin')
  }

  function row(place, tag) {
    return h('li', {}, h('button', { type: 'button', onclick: () => choose(place) }, h('span', { class: 'rl-name' }, place.name), h('small', {}, [tag, place.label].filter(Boolean).join(' · '))))
  }

  function show(places) {
    results.replaceChildren(...places)
  }

  async function search() {
    const q = input.value.trim()
    if (q.length < 2) return
    abort?.abort()
    const mine = ++generation
    const stale = () => mine !== generation
    const cities = searchCities(q, 3).map((c) => ({ ...cityPlace(c), label: `${c.country}` }))
    show(cities.map((c) => row(c, t('wiz.place.builtin'))))
    status.textContent = ''
    const yes = await consent.ask('search')
    if (stale()) return
    if (!yes) {
      status.textContent = cities.length ? t('wiz.place.offlineOnly') : t('wiz.place.noneOffline')
      return
    }
    const controller = new AbortController()
    abort = controller
    status.textContent = t('wiz.place.searching')
    try {
      const { places: found, query: used, exact } = await net.lookup(q, locale(), controller.signal)
      if (stale()) return
      status.textContent = !found.length ? t('wiz.place.none') : used ? (exact ? t('wiz.place.simpler', { query: used }) : t('wiz.place.street', { query: used })) : ''
      show([...found.map((p) => row(p)), ...cities.map((c) => row(c, t('wiz.place.builtin')))])
    } catch (err) {
      if (controller.signal.aborted || stale()) return
      status.textContent = err instanceof Refused ? t('wiz.place.offlineOnly') : t('wiz.place.failed', { why: String(err.message || err).slice(0, 80) })
    }
  }

  const form = h('form', { class: 'search-row', role: 'search', onsubmit: (e) => { e.preventDefault(); search() } }, input, h('button', { class: 'btn primary fixed', type: 'submit' }, t('wiz.place.search')))
  const locate = h('button', { class: 'btn block', type: 'button', onclick: () => ctx.actions.locate() }, t('place.use'))

  const nameInput = h('input', { type: 'text', maxLength: 60, 'aria-label': t('place.name') })
  nameInput.addEventListener('change', () => store.update((d) => { d.place.name = nameInput.value.trim() }, { key: 'place.name' }))
  const zoneInput = h('input', { type: 'text', 'aria-label': t('place.zone'), spellcheck: false })
  zoneInput.addEventListener('change', () => {
    const z = zoneInput.value.trim()
    if (isZone(z)) store.update((d) => { d.place.zone = z })
    else toast(t('place.zoneBad'))
    zoneInput.value = store.scene.place.zone
  })
  const coordinates = coordinateFields({ store, actions: ctx.actions, places: 5, step: 0.00001, compact: true })
  fields.push(...coordinates)
  const details = h('details', { class: 'more' }, h('summary', {}, t('wiz.place.edit')),
    h('div', { class: 'field compact' }, h('label', {}, t('place.name')), nameInput),
    h('div', { class: 'grid2' }, ...coordinates.map((f) => f.el)),
    h('div', { class: 'field compact' }, h('label', {}, t('place.zone')), zoneInput))

  const el = h('section', { class: 'wiz-step' },
    h('p', {}, t('wiz.place.intro')),
    form, status, results, locate, where, details,
    h('p', { class: 'note' }, t('wiz.place.privacy')))

  // the scene that the last pin made, so a double tap, which zooms, can take that pin back
  let lastPin = null
  map.on.pin = (lat, lon) => {
    const old = store.scene.place
    const before = store.scene
    const close = haversine(old, { lat, lon }) < 150
    choose({ name: close ? old.name : t('wiz.place.pin'), lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 }, { recentre: false })
    lastPin = store.scene !== before ? store.scene : null
    toast(t('wiz.place.pinned'))
  }
  map.on.undoPin = () => {
    if (lastPin && store.scene === lastPin && store.canUndo()) store.undo()
    lastPin = null
  }

  return {
    el,
    sync() {
      fields.forEach((f) => f.sync())
      const p = store.scene.place
      where.textContent = t('wiz.place.where', { name: p.name || '-', lat: p.lat.toFixed(5), lon: p.lon.toFixed(5), zone: p.zone, offset: offsetText(p.zone) })
      if (document.activeElement !== nameInput) nameInput.value = p.name
      if (document.activeElement !== zoneInput) zoneInput.value = p.zone
      map.invalidate()
    },
    leave() {
      generation++
      abort?.abort()
      map.on.pin = null
      map.on.undoPin = null
    },
  }
}
