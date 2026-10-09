// Reading the way a window faces from the phone: hold the phone against the
// glass, wait until the reading is steady and take it. The sensor gives
// magnetic north, so the local declination is added.

import { h } from './dom.js'
import { t } from './i18n.js'
import { bearingText } from './format.js'
import { headingFromAngles, createAverager, trueHeading } from '../core/compass.js'
import { declination, decimalYear } from '../core/declination.js'

export const compassSupported = () => typeof window !== 'undefined' && 'DeviceOrientationEvent' in window

/** The magnetic heading from one sensor event, or null for a relative one. */
export function magneticHeading(e) {
  if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) return { bearing: e.webkitCompassHeading, from: 'ios' }
  if (e.absolute === true && typeof e.alpha === 'number' && typeof e.beta === 'number' && typeof e.gamma === 'number') return headingFromAngles(e.alpha, e.beta, e.gamma)
  return null
}

/**
 * Show the compass reader inside `card` (any element) and call `done(bearing)`
 * with the true bearing the phone faces, or `done(null)` when it is closed.
 */
export function openCompass({ card, place, done, now = () => performance.now() }) {
  const averager = createAverager({ windowMs: 1500, minSamples: 10, maxSpread: 4 })
  const dec = declination(place.lat, place.lon, decimalYear(Date.now()))
  let flip = false
  let last = null
  let gotAny = false
  let timer = 0
  let closed = false

  const reading = h('p', { class: 'compass-reading', 'aria-live': 'off' }, '--')
  const state = h('p', { class: 'note', role: 'status' }, t('compass.waiting'))
  const bar = h('div', { class: 'progress' }, h('i'))
  const use = h('button', { class: 'btn primary', type: 'button', disabled: true }, t('compass.use'))
  const flipBtn = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false' }, t('compass.flip'))
  const cancel = h('button', { class: 'btn', type: 'button' }, t('trace.cancel'))
  card.replaceChildren(
    h('h2', {}, t('compass.title')),
    h('p', {}, t('compass.hold')),
    h('p', { class: 'note' }, t('compass.flatTip')),
    reading, bar, state,
    h('p', { class: 'note' }, t('compass.declination', { d: `${dec >= 0 ? '+' : '−'}${Math.abs(dec).toFixed(1)}°` })),
    h('div', { class: 'row' }, flipBtn, use),
    cancel,
  )

  const heading = () => {
    const { heading: m } = averager.state
    return m == null ? null : trueHeading(m + (flip ? 180 : 0), dec)
  }

  function refresh() {
    const s = averager.state
    const value = heading()
    reading.textContent = value == null ? '--' : bearingText(value)
    bar.firstChild.style.width = `${Math.min(100, Math.round((s.count / 10) * 100))}%`
    use.disabled = !s.steady
    state.textContent = s.steady ? t('compass.steady') : s.count ? t('compass.unsteady') : t('compass.waiting')
  }

  function onEvent(e) {
    const r = magneticHeading(e)
    if (!r) return
    gotAny = true
    last = r
    averager.add(r.bearing, now())
    refresh()
  }

  function close(result) {
    if (closed) return
    closed = true
    clearTimeout(timer)
    window.removeEventListener('deviceorientationabsolute', onEvent, true)
    window.removeEventListener('deviceorientation', onEvent, true)
    done(result)
  }

  async function start() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') {
          state.textContent = t('room.compassDenied')
          return
        }
      } catch {
        state.textContent = t('room.compassDenied')
        return
      }
    }
    window.addEventListener('deviceorientationabsolute', onEvent, true)
    window.addEventListener('deviceorientation', onEvent, true)
    timer = setTimeout(() => {
      if (!gotAny) state.textContent = t('compass.none')
    }, 3000)
  }

  use.addEventListener('click', () => close(heading()))
  cancel.addEventListener('click', () => close(null))
  flipBtn.addEventListener('click', () => {
    flip = !flip
    flipBtn.setAttribute('aria-pressed', String(flip))
    refresh()
  })
  start()
  return { close: () => close(null), get last() { return last } }
}
