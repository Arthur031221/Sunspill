// The slow questions, run in slices so the page stays responsive: the sun
// hours map, the afternoon check and the plant spots. A change to the room
// cancels the run in flight and starts again after a short wait.

import { sunHours, afternoonSun, monthDays, plantSpots, LIGHT_NEEDS } from '../core/hours.js'
import { buildHeatCanvas } from '../render/heat.js'
import { PALETTES } from '../render/palette.js'

export function monthsBetween(from, to) {
  const out = []
  for (let m = from; ; m = (m % 12) + 1) {
    out.push(m)
    if (m === to || out.length === 12) break
  }
  return out
}

/** The sample days a period stands for. */
export function periodDays(scene, heat) {
  const { month, day } = scene.date
  if (heat.period === 'day') return [{ month, day }]
  if (heat.period === 'month') return monthDays(month)
  if (heat.period === 'year') return monthsBetween(1, 12).flatMap(monthDays)
  return monthsBetween(heat.from, heat.to).flatMap(monthDays)
}

const dependsOn = (scene) => JSON.stringify([scene.room, scene.facing, scene.windows, scene.place])

export function createAnalysis(store, { onChange, onBusy }) {
  const runs = {}
  let heat = null
  let west = null
  let spots = null

  function start(name, key, task) {
    runs[name]?.controller.abort()
    const controller = new AbortController()
    runs[name] = { controller, key }
    onBusy?.(name, 0)
    return task(controller.signal, (f) => onBusy?.(name, f))
      .then((result) => {
        if (controller.signal.aborted || result == null) return
        runs[name] = { controller, key, done: true }
        onBusy?.(name, null)
        return result
      })
      .catch((err) => {
        onBusy?.(name, null)
        console.error(err)
      })
  }

  const cellFor = (room) => Math.max(0.1, Math.sqrt((room.w * room.d) / 6000))

  async function ensureHeat() {
    const scene = store.scene
    const h = store.ui.heat
    const key = JSON.stringify([dependsOn(scene), h.period, h.from, h.to, h.z, h.period === 'day' || h.period === 'month' ? scene.date : 0])
    if (runs.heat?.key === key) return
    heat = heat && { ...heat, stale: true }
    const result = await start('heat', key, async (signal, progress) => {
      const grid = await sunHours(scene, periodDays(scene, h), { planeZ: h.z, cell: cellFor(scene.room), signal, onProgress: progress })
      return grid
    })
    if (!result) return
    const max = Math.max(4, Math.ceil(Math.max(...result.hours)))
    heat = { grid: result, max, key, built: {} }
    onChange('heat')
  }

  /** The canvas for the current palette, built once per palette. */
  function heatImage(paletteName) {
    if (!heat) return null
    heat.built[paletteName] ??= buildHeatCanvas(heat.grid, PALETTES[paletteName], heat.max)
    return { grid: heat.grid, canvas: heat.built[paletteName], max: heat.max, stale: heat.stale }
  }

  async function ensureWest() {
    const scene = store.scene
    const w = store.ui.west
    const key = JSON.stringify([dependsOn(scene), w])
    if (runs.west?.key === key) return
    const result = await start('west', key, async (signal, progress) => {
      const days = monthsBetween(w.from, w.to).flatMap(monthDays)
      const r = await afternoonSun(scene, days, { fromMinutes: w.after, stepMinutes: 6, signal, onProgress: progress })
      return r && { ...r, from: w.from, to: w.to, after: w.after }
    })
    if (!result) return
    west = result
    onChange('west')
  }

  async function ensureSpots() {
    const need = store.ui.plant.need
    const scene = store.scene
    const h = store.ui.heat
    const key = JSON.stringify([dependsOn(scene), h.period, h.from, h.to, store.ui.plant, scene.date])
    if (runs.spots?.key === key) return
    const result = await start('spots', key, async (signal, progress) => {
      const grid = await sunHours(scene, periodDays(scene, h), { planeZ: store.ui.plant.height, cell: Math.max(0.1, cellFor(scene.room)), signal, onProgress: progress })
      return grid && { list: plantSpots(grid, need), grid }
    })
    if (!result) return
    spots = { ...result, need, height: store.ui.plant.height }
    onChange('spots')
  }

  return {
    ensureHeat, ensureWest, ensureSpots, heatImage,
    get heat() { return heat },
    get west() { return west },
    get spots() { return spots },
    clearHeat() { runs.heat?.controller.abort(); delete runs.heat; heat = null },
    cancelAll() { Object.values(runs).forEach((r) => r.controller.abort()) },
    needs: LIGHT_NEEDS,
  }
}
