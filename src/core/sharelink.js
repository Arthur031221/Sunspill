// The quick check as a short link: the place, the building, the floor and the sides the person picked. It is a
// format of its own (`q1=`), apart from the room links of codec.js (`r1=` and `r2=`), so neither reader ever
// takes the other's link for its own. Everything after the # stays in the browser, as for a room.

import { SECTORS } from './sides.js'

export const QUICK_PREFIX = 'q1='
const MAX_LENGTH = 4000
const MAX_NAME = 60
/** A building drawn with more corners than this goes by its OpenStreetMap number alone. */
const MAX_CORNERS = 60
const MAX_RING = 400
/** A building farther than this from the place, in decimetres, is not one the quick check could have loaded. */
const REACH = 20000
const FLAG_PIN = 1

const toBase64Url = (bytes) => {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

const finite = (v) => typeof v === 'number' && Number.isFinite(v)
const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi
const dm = (v) => Math.round(v * 10)
const five = (v) => Math.round(v * 1e5) / 1e5

/**
 * The hash string (without the #) for a quick check answer.
 * @param {{lat:number, lon:number, name?:string, pin?:boolean, floor:number, sides?:string[],
 *   building:{id?:number, ring?:number[][]|null, h?:number, levels?:number}}} link
 *   `ring` is in metres east and north of the place. `id` is the OpenStreetMap number, or 0 or less for a square
 *   that stood in for a building with no outline. Throws when there is no place, or when the building has
 *   neither a number nor an outline, since such a link could not open the same answer.
 */
export function encodeQuick(link) {
  if (!link || !finite(link.lat) || !finite(link.lon) || Math.abs(link.lat) > 90 || Math.abs(link.lon) > 180) throw new Error('a quick link needs a place')
  const b = link.building
  const id = b && Number.isInteger(b.id) && b.id > 0 ? b.id : 0
  const ring = Array.isArray(b?.ring) && b.ring.length >= 3 ? b.ring : null
  if (!id && !ring) throw new Error('a quick link needs a building')
  const mask = (link.sides ?? []).reduce((m, s) => m | (SECTORS.includes(s) ? 1 << SECTORS.indexOf(s) : 0), 0)
  const packed = [
    five(link.lat), five(link.lon),
    String(link.name ?? '').slice(0, MAX_NAME),
    link.pin === false ? 0 : FLAG_PIN,
    Math.min(99, Math.max(1, Math.round(finite(link.floor) ? link.floor : 1))),
    mask,
    id,
    Math.max(0, Math.min(6000, dm(finite(b.h) ? b.h : 0))),
    Math.max(0, Math.min(200, Math.round(finite(b.levels) ? b.levels : 0))),
  ]
  // the outline is kept when it is the only way to find the building again, or when it is small enough to be worth it
  if (ring && (!id || ring.length <= MAX_CORNERS)) {
    let px = 0
    let py = 0
    for (const [x, y] of ring) {
      packed.push(dm(x) - px, dm(y) - py)
      px = dm(x)
      py = dm(y)
    }
  }
  return QUICK_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(packed)))
}

/**
 * A quick check answer from a hash string, or null when it is not one of ours, is damaged, or holds a number
 * that no link of ours would. The result has `lat`, `lon` (five decimals), `name`, `pin`, `floor`, `sides` (in
 * compass order) and `building` as `{id, ring, h, levels}`, with `id` 0 and `ring` null when there is none.
 */
export function decodeQuick(hash) {
  const text = typeof hash === 'string' ? hash.replace(/^#/, '') : ''
  if (!text.startsWith(QUICK_PREFIX) || text.length > MAX_LENGTH) return null
  try {
    const a = JSON.parse(new TextDecoder().decode(fromBase64Url(text.slice(QUICK_PREFIX.length))))
    if (!Array.isArray(a) || a.length < 9) return null
    const [lat, lon, name, flags, floor, mask, id, h, levels] = a
    if (!finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    if (typeof name !== 'string' || name.length > MAX_NAME) return null
    if (flags !== 0 && flags !== FLAG_PIN) return null
    if (!whole(floor, 1, 99) || !whole(mask, 0, 255) || !whole(id, 0, Number.MAX_SAFE_INTEGER) || !whole(h, 0, 6000) || !whole(levels, 0, 200)) return null
    let ring = null
    if (a.length > 9) {
      const flat = a.slice(9)
      if (flat.length % 2 || flat.length < 6 || flat.length > MAX_RING || !flat.every((v) => whole(v, -REACH * 2, REACH * 2))) return null
      ring = []
      let x = 0
      let y = 0
      for (let i = 0; i < flat.length; i += 2) {
        x += flat[i]
        y += flat[i + 1]
        if (Math.abs(x) > REACH || Math.abs(y) > REACH) return null
        ring.push([x / 10, y / 10])
      }
    }
    if (!id && !ring) return null
    return { lat: five(lat), lon: five(lon), name, pin: flags === FLAG_PIN, floor, sides: SECTORS.filter((_, i) => mask & (1 << i)), building: { id, ring, h: h / 10, levels } }
  } catch {
    return null
  }
}
