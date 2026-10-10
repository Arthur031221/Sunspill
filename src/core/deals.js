// Past deals, from the Ministry of the Interior's 實價登錄 (real price registration), as small files by map tile.
// scripts/make-deals.mjs writes them and the quick check reads them. This file is what both agree on: which tile
// a place is in, how a deal is packed into a row, and the numbers the quick check shows for the deals nearby.
// A deal is a past sale or a past rental. None of it is a listing.

import { lonLatToTile, tileToLonLat, toLocal, ringDistance } from './geo.js'

export const DEALS_FORMAT = 1
/** The tile level a file covers unless it was too big and was split. */
export const DEALS_ZOOM = 15
/** The deepest level a split goes to. */
export const DEALS_MAX_ZOOM = 17
/** Square metres in one ping (坪), the Taiwanese unit for floor area. */
export const SQM_PER_PING = 3.305785
/** The columns of a row in a tile file, in order. */
export const COLS = ['lat', 'lon', 'kind', 'date', 'floor', 'floors', 'type', 'built', 'ping', 'price', 'unit', 'lift', 'addr']
export const KINDS = ['sale', 'rent']
/** Kinds of building, as the number in a row: walk up (公寓), mid rise with a lift (華廈), high rise (住宅大樓), house (透天厝), studio (套房). */
export const TYPES = ['walkup', 'mid', 'high', 'house', 'studio']

/** The tile of a place at a level. */
export function tileOf(lat, lon, z = DEALS_ZOOM) {
  const t = lonLatToTile(lon, lat, z)
  return { z, x: Math.floor(t.x), y: Math.floor(t.y) }
}

export const tileName = ({ z, x, y }) => `${z}-${x}-${y}`

/** The four tiles one level down. */
export const childTiles = ({ z, x, y }) => [0, 1, 2, 3].map((i) => ({ z: z + 1, x: x * 2 + (i & 1), y: y * 2 + (i >> 1) }))

/** The edges of a tile in degrees. */
export function tileBox({ z, x, y }) {
  const nw = tileToLonLat(x, y, z)
  const se = tileToLonLat(x + 1, y + 1, z)
  return { north: nw.lat, south: se.lat, west: nw.lon, east: se.lon }
}

/** Every tile at a level that touches the square of `metres` round a place. */
export function tilesAround(lat, lon, metres, z = DEALS_ZOOM) {
  const dLat = metres / 111132
  const dLon = metres / (111320 * Math.cos((lat * Math.PI) / 180))
  const a = tileOf(lat + dLat, lon - dLon, z)
  const b = tileOf(lat - dLat, lon + dLon, z)
  const out = []
  for (let y = a.y; y <= b.y; y++) for (let x = a.x; x <= b.x; x++) out.push({ z, x, y })
  return out
}

const round = (v, digits) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** digits) / 10 ** digits)

/**
 * A deal as a row of a tile file. `deal.kind` is 'sale' or 'rent', `deal.type` one of TYPES, `deal.lift` a boolean or
 * null, `price` is in 10,000 NTD for a sale and in NTD a month for a rent, and `unit` in 10,000 NTD a ping for a sale
 * and in NTD a ping a month for a rent. `addr` is an index into the file's list of addresses, or null.
 */
export function packDeal(deal, addr = null) {
  return [
    round(deal.lat, 5), round(deal.lon, 5), KINDS.indexOf(deal.kind), deal.date, deal.floor ?? null, deal.floors ?? null,
    deal.type == null ? null : TYPES.indexOf(deal.type), deal.built ?? null, round(deal.ping, 1), deal.price, deal.unit,
    deal.lift == null ? null : deal.lift ? 1 : 0, addr,
  ]
}

const inTaiwan = (lat, lon) => lat > 21.5 && lat < 26.5 && lon > 118 && lon < 123
const maybe = (v, lo, hi) => v === null || (Number.isFinite(v) && v >= lo && v <= hi)

/**
 * A deal from a row, or null when the row is not one we wrote. `addrs` is the file's list of addresses.
 */
export function unpackDeal(row, addrs = []) {
  if (!Array.isArray(row) || row.length < COLS.length) return null
  const [lat, lon, kind, date, floor, floors, type, built, ping, price, unit, lift, addr] = row
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inTaiwan(lat, lon)) return null
  if (kind !== 0 && kind !== 1) return null
  if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return null
  if (!maybe(floor, -9, 200) || !maybe(floors, 0, 200) || !maybe(built, 1900, 2100) || !maybe(ping, 0, 5000)) return null
  if (!(type === null || (Number.isInteger(type) && type >= 0 && type < TYPES.length))) return null
  if (!Number.isFinite(price) || price < 0 || !maybe(unit, 0, 1e7)) return null
  if (!(lift === null || lift === 0 || lift === 1)) return null
  if (!(addr === null || (Number.isInteger(addr) && addr >= 0 && addr < addrs.length))) return null
  return { lat, lon, kind: KINDS[kind], date, floor, floors, type: type === null ? null : TYPES[type], built, ping, price, unit, lift: lift === null ? null : lift === 1, addr: addr === null ? null : addrs[addr] }
}

/** The deals in a tile file, or null when the file is not one of ours. A row that is not valid is left out. */
export function parseTile(json) {
  if (!json || json.v !== DEALS_FORMAT || !Array.isArray(json.rows)) return null
  const addrs = Array.isArray(json.addrs) ? json.addrs.filter((a) => typeof a === 'string') : []
  return json.rows.map((row) => unpackDeal(row, addrs)).filter(Boolean)
}

// ---------------------------------------------------------------- the numbers

/** Months counted from year 0, for comparing two yyyy-mm dates. */
export const monthIndex = (date) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1

/** The middle value, or the mean of the two in the middle. null for nothing. */
export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = v.length >> 1
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

/** How old the building was when the deal was made, in whole years, or null when the year it was finished is not known. */
export function ageAt(deal) {
  return deal.built ? Math.max(0, Number(deal.date.slice(0, 4)) - deal.built) : null
}

const centreOf = (ring) => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]

/**
 * What the deals near a building say.
 * @param {object[]} deals deals as unpackDeal gives them, from the tiles round the building
 * @param {object} options
 *   `origin` {lat, lon}: the point that `ring` is measured from, in metres east and north
 *   `ring`: the outline of the selected building, or null (then `point` {lat, lon} stands for it)
 *   `address`: the key (addressKey) of the address the person typed, or null, to find the deals of the same house by its address
 *   `now`: a Date. `radius` (300 m) and `months` (12) bound the numbers, `reach` (450 m) the nearest list, `nearest` (5) its length
 * @returns {{sales:{count:number, unit:number|null, floorMin:number|null, floorMax:number|null, age:number|null},
 *   rents:{count:number, rent:number|null, perPing:number|null}, same:object[], nearest:object[]}} the deals in
 *   `same` and `nearest` carry `metres`, the distance from the building. `same` is every deal of the building in the
 *   data, newest first, and `nearest` the closest deals of the last `months` months that are not in it.
 */
export function summarise(deals, { origin, ring = null, point = null, address = null, now = new Date(), radius = 300, months = 12, reach = 450, nearest = 5 } = {}) {
  const centre = ring ? centreOf(ring) : point ? toLocal(origin, point.lat, point.lon) : [0, 0]
  const last = now.getFullYear() * 12 + now.getMonth()
  const placed = deals.map((d) => {
    const at = toLocal(origin, d.lat, d.lon)
    const metres = Math.hypot(at[0] - centre[0], at[1] - centre[1])
    return { ...d, metres, at }
  })
  // the same building: its address points fall on the outline, give or take the error of the point, or they carry the address
  // that was typed and are close to the building
  const same = placed.filter((d) => {
    const toRing = ring ? ringDistance(ring, d.at) : d.metres
    if (ring ? toRing <= 6 : d.metres <= 15) return true
    return Boolean(address) && d.addr === address && toRing <= 40
  })
  const inSame = new Set(same)
  const recent = placed.filter((d) => {
    const m = monthIndex(d.date)
    return m <= last && m > last - months
  })
  const sales = recent.filter((d) => d.kind === 'sale' && d.metres <= radius)
  const rents = recent.filter((d) => d.kind === 'rent' && d.metres <= radius)
  const floors = sales.map((d) => d.floor).filter((f) => f !== null && f >= 1)
  return {
    sales: {
      count: sales.length,
      unit: median(sales.map((d) => d.unit)),
      floorMin: floors.length ? Math.min(...floors) : null,
      floorMax: floors.length ? Math.max(...floors) : null,
      age: median(sales.map(ageAt)),
    },
    rents: { count: rents.length, rent: median(rents.map((d) => d.price)), perPing: median(rents.map((d) => d.unit)) },
    same: same.map(({ at, ...d }) => d).sort((p, q) => q.date.localeCompare(p.date) || p.metres - q.metres),
    nearest: recent.filter((d) => !inSame.has(d) && d.metres <= reach).sort((p, q) => p.metres - q.metres || q.date.localeCompare(p.date)).slice(0, nearest).map(({ at, ...d }) => d),
  }
}
