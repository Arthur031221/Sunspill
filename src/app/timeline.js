// The strip under the room: the clock, the day scrubber with the sunlit area
// drawn behind it, play, and the date.

import { h, clamp } from './dom.js'
import { t } from './i18n.js'
import { clock, dateText, bearingText, areaText, duration, monthName } from './format.js'
import { scenePatches } from '../core/light.js'
import { floorArea } from './frame.js'
import { daySteps } from '../core/hours.js'
import { sunTimes } from '../core/solar.js'
import { daysInMonth, YEAR } from '../core/room.js'

const DAY_SECONDS = 7
export const DATE_CHIPS = [
  { month: 3, day: 20, key: 'date.marEq' },
  { month: 6, day: 21, key: 'date.junSol' },
  { month: 9, day: 22, key: 'date.sepEq' },
  { month: 12, day: 21, key: 'date.decSol' },
]

const PLAY = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3.5v13l11-6.5z"/></svg>'
const PAUSE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3.5h3.5v13H5zM11.5 3.5H15v13h-3.5z"/></svg>'

/** Sunlit floor area and any-light flag through the day, for the curve behind the scrubber. */
export function dayCurve(scene) {
  const { steps } = daySteps(scene.place, scene.date.month, scene.date.day, 10)
  const points = steps.map((s) => {
    const p = scenePatches(scene, { azimuth: s.azimuth, elevation: s.elevation })
    const floor = floorArea(p)
    return { minutes: s.minutes, floor, lit: p.floor.length > 0 || p.walls.length > 0, elevation: s.elevation, w: s.w }
  })
  const hours = (keep) => points.filter(keep).reduce((sum, p) => sum + p.w, 0)
  return { points, litHours: hours((p) => p.lit), floorHours: hours((p) => p.floor > 1e-4) }
}

export function createDock({ root, store, stage }) {
  let els = {}
  let curve = null
  let curveKey = ''
  let range = [0, 1439]
  let playRange = [0, 1439]
  let clockF = 0
  let raf = 0
  let last = 0

  function daylight() {
    const { place, date } = store.scene
    const t = sunTimes(YEAR, date.month, date.day, place.lat, place.lon, place.zone)
    if (t.polarNight) return null
    return { range: [t.sunrise === null ? 0 : Math.floor(t.sunrise), t.sunset === null ? 1439 : Math.min(1439, Math.ceil(t.sunset))], sunrise: t.sunrise, sunset: t.sunset }
  }

  function build() {
    root.replaceChildren()
    const time = h('span', { class: 'time' }, '--:--')
    const sub = h('span', { class: 'sub' })
    const slider = h('input', { type: 'range', min: 0, max: 1439, step: 1, 'aria-label': t('dock.time') })
    const canvas = h('canvas', { 'aria-hidden': 'true' })
    const play = h('button', { class: 'play', type: 'button', 'aria-label': t('dock.play'), title: t('dock.play') })
    const ends = h('div', { class: 'rail-ends' }, h('span', { class: 'rise' }), h('span', { class: 'set' }))
    const month = h('select', { class: 'select', 'aria-label': t('date.month') }, ...Array.from({ length: 12 }, (_, i) => h('option', { value: i + 1 }, monthName(i + 1))))
    const day = h('input', { type: 'number', class: 'num', min: 1, max: 31, step: 1, 'aria-label': t('date.day'), style: 'width:64px;height:32px;text-align:center' })
    const chips = DATE_CHIPS.map((c) => h('button', { class: 'chip', type: 'button', title: dateText(c.month, c.day), dataset: { m: c.month, d: c.day }, onclick: () => setDate(c.month, c.day) }, t(c.key)))
    const stats = { floor: h('b'), lit: h('b') }
    root.append(
      h('div', { class: 'clock' }, time, sub, h('span', { class: 'stats' }, h('span', { class: 'stat' }, t('dock.floorNow'), stats.floor), h('span', { class: 'stat' }, t('dock.sunToday'), stats.lit))),
      h('div', { class: 'rail' }, canvas, slider),
      h('div', { class: 'dock-controls' }, play),
      ends,
      h('div', { class: 'dock-row' },
        h('span', { class: 'date-pick' }, month, day),
        ...chips,
      ),
    )
    els = { time, sub, slider, canvas, play, month, day, chips, stats, rise: ends.querySelector('.rise'), set: ends.querySelector('.set') }
    slider.addEventListener('input', () => setMinutes(Number(slider.value)))
    slider.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 30 : 5
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setMinutes(store.scene.minutes + (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : step))
      }
    })
    play.addEventListener('click', toggle)
    month.addEventListener('change', () => setDate(Number(month.value), Math.min(store.scene.date.day, daysInMonth(Number(month.value)))))
    day.addEventListener('change', () => setDate(store.scene.date.month, clamp(Math.round(Number(day.value) || 1), 1, daysInMonth(store.scene.date.month))))
    curveKey = ''
    paintPlay()
  }

  function setMinutes(m) {
    const [lo, hi] = range
    store.update((s) => { s.minutes = clamp(Math.round(m), lo, hi) }, { history: false })
  }

  function setDate(month, day) {
    store.update((s) => { s.date = { month, day } }, { history: false })
    clampToDaylight()
  }

  function clampToDaylight() {
    const light = daylight()
    if (!light) return
    range = light.range
    const m = store.scene.minutes
    if (m < range[0] || m > range[1]) setMinutes(clamp(m, range[0], range[1]))
  }

  function paintPlay() {
    const playing = store.ui.playing
    els.play.innerHTML = playing ? PAUSE : PLAY
    els.play.setAttribute('aria-label', playing ? t('dock.pause') : t('dock.play'))
    els.play.title = els.play.getAttribute('aria-label')
  }

  function toggle() {
    store.setUi({ playing: !store.ui.playing })
    if (store.ui.playing) start()
  }

  function start() {
    if (raf) return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function tick(now) {
    raf = 0
    if (!store.ui.playing) return
    const dtSec = Math.min(0.1, (now - last) / 1000)
    last = now
    const [lo, hi] = playRange
    // keep the fractional clock here, the scene holds whole minutes
    if (Math.abs(clockF - store.scene.minutes) > 1.5) clockF = store.scene.minutes
    clockF += ((hi - lo) / DAY_SECONDS) * dtSec
    if (clockF > hi || clockF < lo) clockF = lo
    raf = requestAnimationFrame(tick)
    store.update((s) => { s.minutes = clockF }, { history: false })
  }

  function paintCurve() {
    const scene = store.scene
    const key = JSON.stringify([scene.room, scene.facing, scene.windows, scene.place, scene.date, store.ui.themeResolved])
    const canvas = els.canvas
    const box = canvas.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(1, Math.round(box.width))
    const hgt = Math.max(1, Math.round(box.height))
    if (key === curveKey && canvas.width === Math.round(w * dpr)) return
    curveKey = key
    curve = dayCurve(scene)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(hgt * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, hgt)
    const css = getComputedStyle(document.documentElement)
    const [lo, hi] = range
    const x = (m) => 8 + ((m - lo) / Math.max(1, hi - lo)) * (w - 16)
    ctx.strokeStyle = css.getPropertyValue('--line')
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(8, hgt - 10)
    ctx.lineTo(w - 8, hgt - 10)
    ctx.stroke()
    if (!curve.points.length) return
    const maxFloor = Math.max(0.5, ...curve.points.map((p) => p.floor))
    const y = (v) => hgt - 14 - (v / maxFloor) * (hgt - 24)
    ctx.beginPath()
    ctx.moveTo(x(curve.points[0].minutes), hgt - 14)
    curve.points.forEach((p) => ctx.lineTo(x(p.minutes), y(p.floor)))
    ctx.lineTo(x(curve.points[curve.points.length - 1].minutes), hgt - 14)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, 0, 0, hgt)
    g.addColorStop(0, css.getPropertyValue('--sun'))
    g.addColorStop(1, 'rgba(245,165,36,0.12)')
    ctx.globalAlpha = 0.85
    ctx.fillStyle = g
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = css.getPropertyValue('--accent')
    ctx.lineWidth = 1.5
    ctx.beginPath()
    curve.points.forEach((p, i) => (i ? ctx.lineTo(x(p.minutes), y(p.floor)) : ctx.moveTo(x(p.minutes), y(p.floor))))
    ctx.stroke()
  }

  function sync(frame) {
    const scene = store.scene
    clampToDaylight()
    const light = daylight()
    const polar = !light
    els.slider.min = range[0]
    els.slider.max = range[1]
    els.slider.disabled = polar
    els.slider.value = scene.minutes
    els.slider.setAttribute('aria-valuetext', clock(scene.minutes))
    els.time.textContent = clock(scene.minutes)
    const sun = frame.sun
    els.sub.textContent = polar ? t('dock.polarNight') : sun.elevation > 0 ? t('dock.sunAt', { el: Math.round(sun.elevation), dir: bearingText(sun.azimuth) }) : t('dock.belowHorizon')
    // a day that starts or ends with the sun up has no sunrise or sunset to name on that side
    els.rise.textContent = !light || light.sunrise === null ? '' : `${t('dock.sunrise')} ${clock(light.sunrise)}`
    els.set.textContent = !light || light.sunset === null ? '' : `${t('dock.sunset')} ${clock(light.sunset)}`
    els.month.value = scene.date.month
    if (document.activeElement !== els.day) els.day.value = scene.date.day
    els.day.max = daysInMonth(scene.date.month)
    els.chips.forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.m) === scene.date.month && Number(c.dataset.d) === scene.date.day)))
    const floorNow = floorArea(frame.patches)
    els.stats.floor.textContent = areaText(floorNow, store.ui.units)
    paintCurve()
    els.stats.lit.textContent = curve ? duration(curve.litHours) : '-'
    // playing loops over the time the sun is inside, so the loop never idles in the dark
    const litPoints = curve?.points.filter((p) => p.lit) ?? []
    playRange = litPoints.length ? [Math.max(range[0], litPoints[0].minutes - 15), Math.min(range[1], litPoints[litPoints.length - 1].minutes + 15)] : range
    paintPlay()
  }

  build()
  return { sync, rebuild: build, toggle, start, invalidateCurve: () => { curveKey = '' } }
}
