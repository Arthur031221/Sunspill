// The flats kept for comparing: up to four, in the browser's local storage. Each is a label, an address, a floor,
// the sides the person said their windows face and the numbers of every side. Nothing here is sent anywhere.

import { SECTORS } from '../core/sides.js'

export const COMPARE_KEY = 'sunspill.compare'
export const MAX_COMPARE = 4

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null)
const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '')
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** A flat as it is kept, or null when it is not one. */
function clean(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null
  const lat = num(raw.lat, -80, 80)
  const lon = num(raw.lon, -180, 180)
  const floor = num(raw.floor, 1, 99)
  if (lat === null || lon === null || floor === null || !Array.isArray(raw.sides)) return null
  const sides = raw.sides.map((s) => {
    if (!s || !SECTORS.includes(s.id) || !Array.isArray(s.year) || s.year.length !== 12) return null
    const afternoon = num(s.afternoon, 0, 1440)
    const winter = num(s.winter, 0, 24)
    const year = s.year.map((v) => num(v, 0, 24))
    return afternoon === null || winter === null || year.includes(null) ? null : { id: s.id, afternoon, winter, year }
  }).filter(Boolean)
  return {
    id: raw.id.slice(0, 40),
    label: text(raw.label, 80),
    address: text(raw.address, 120),
    floor: Math.round(floor),
    lat,
    lon,
    chosen: (Array.isArray(raw.chosen) ? raw.chosen : []).filter((id) => SECTORS.includes(id)),
    sides,
    at: num(raw.at, 0, 1e15) ?? 0,
  }
}

export function createCompare(storage = globalThis.localStorage) {
  const read = () => {
    try {
      const list = JSON.parse(storage.getItem(COMPARE_KEY))
      return Array.isArray(list) ? list.map(clean).filter(Boolean).slice(0, MAX_COMPARE) : []
    } catch {
      return []
    }
  }
  const write = (list) => {
    try {
      storage.setItem(COMPARE_KEY, JSON.stringify(list))
      return true
    } catch {
      return false
    }
  }
  return {
    list: read,
    /** Keep a flat. Returns 'added', 'replaced' (the same place and floor was there), 'full' or 'failed'. */
    add(flat) {
      const list = read()
      const mine = clean({ ...flat, id: newId(), at: Date.now() })
      if (!mine) return 'failed'
      const same = list.findIndex((f) => f.floor === mine.floor && Math.abs(f.lat - mine.lat) < 1e-5 && Math.abs(f.lon - mine.lon) < 1e-5)
      if (same >= 0) {
        list[same] = { ...mine, id: list[same].id }
        return write(list) ? 'replaced' : 'failed'
      }
      if (list.length >= MAX_COMPARE) return 'full'
      list.push(mine)
      return write(list) ? 'added' : 'failed'
    },
    remove(id) {
      const list = read()
      const at = list.findIndex((f) => f.id === id)
      if (at < 0) return false
      list.splice(at, 1)
      return write(list)
    },
  }
}
