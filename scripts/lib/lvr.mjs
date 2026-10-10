// Reading the Ministry of the Interior's 實價登錄 (real price registration) files, and finding where each deal is.
// The deals come with a full house number and no coordinates. The cities publish a file of address points (a road,
// lane, alley and number in columns, with a position), and a deal gets the position of its address when the two
// agree. A deal whose address is not in the file, or is in it at two places that cannot be told apart, is left
// out and counted. Nothing here touches the network. scripts/make-deals.mjs does that.

import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { addressKey, chineseNumber } from '../../src/core/addresskey.js'
import { SQM_PER_PING, monthIndex } from '../../src/core/deals.js'
import { twd97ToWgs84 } from './twd97.mjs'

/** The four cities: the letter their files start with in the zip, and their name. */
export const CITIES = [
  { letter: 'a', name: '臺北市' },
  { letter: 'f', name: '新北市' },
  { letter: 'b', name: '臺中市' },
  { letter: 'h', name: '桃園市' },
]

// ---------------------------------------------------------------- CSV

/** The rows of a CSV file: quoted fields, doubled quotes inside them, a byte order mark at the start. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (input[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// ---------------------------------------------------------------- one deal

/** A date as the Republic of China writes it, 1150902 or 991231, as year, month and day, or null. */
export function parseRoc(text) {
  const m = /^(\d{2,3})(\d{2})(\d{2})$/.exec(String(text ?? '').trim())
  if (!m) return null
  const [year, month, day] = [Number(m[1]) + 1911, Number(m[2]), Number(m[3])]
  return month >= 1 && month <= 12 && day <= 31 ? { year, month, day } : null
}

/** The lowest floor of a deal, from 十層, 三層，四層, 地下一層, 5 or 全 (a whole house, which has none). null when there is none to read. */
export function floorOf(text) {
  let lowest = null
  for (const part of String(text ?? '').normalize('NFKC').split(/[，,、]/)) {
    const p = part.replace(/[層樓]/g, '').trim()
    const below = /^地下(.*)$/.exec(p)
    let n = null
    if (below) {
      const k = below[1] ? (/^\d+$/.test(below[1]) ? Number(below[1]) : chineseNumber(below[1])) : 1
      n = k ? -k : null
    } else n = /^\d+$/.test(p) ? Number(p) : p ? chineseNumber(p) : null
    if (n !== null && (lowest === null || n < lowest)) lowest = n
  }
  return lowest
}

/** The number of floors of a building, from 十五層 or 12. */
export function floorsOf(text) {
  const p = String(text ?? '').normalize('NFKC').replace(/[層樓]/g, '').trim()
  return /^\d+$/.test(p) ? Number(p) : p ? chineseNumber(p) : null
}

/** The kind of building, as one of core/deals.js TYPES, from the Ministry's words. null for shops, offices, factories and the rest. */
export function typeOf(text) {
  const t = String(text ?? '')
  if (/住宅大樓|11層含以上/.test(t)) return 'high'
  if (/華廈|10層含以下有電梯/.test(t)) return 'mid'
  if (/公寓|5樓含以下/.test(t)) return 'walkup'
  if (/透天/.test(t)) return 'house'
  if (/套房/.test(t)) return 'studio'
  return null
}

// a deal between relatives or a bank, a forced sale, a government purchase, a presale or one registered in parts has
// a price that says nothing about the market, and a rent of a part of a flat says nothing about the flat
const SALE_SKIP = /親友|特殊關係|債權債務|拍賣|法拍|標售|標讓售|協議價購|預售屋|分件登記|僅車位|僅供土地|地上權|未登記建物/
const RENT_SKIP = /部分範圍|親友|特殊關係|僅車位/

const number = (text) => {
  const v = Number(String(text ?? '').replace(/,/g, ''))
  return Number.isFinite(v) ? v : 0
}
const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits

/**
 * A deal from a row of a sales file (`kind` 'sale') or a rentals file ('rent'), or why it was left out.
 * @param {string[]} headers the names of the columns
 * @param {string[]} row one row
 * @param {{cutoff?: number}} options `cutoff` is the first month, as core/deals.js monthIndex counts, that is kept
 * @returns {{deal: object}|{skip: string}} A deal has no position yet: it has `keys`, the key of each house number
 *   it names (see core/addresskey.js), and `district`. `unit` is in 10,000 NTD a ping for a sale and NTD a ping a month for a rent.
 */
export function dealFromRow(headers, row, kind, { cutoff = 0 } = {}) {
  const index = new Map(headers.map((h, i) => [h, i]))
  const get = (...names) => {
    for (const name of names) if (index.has(name)) return row[index.get(name)] ?? ''
    return ''
  }
  const sale = kind === 'sale'
  if (!/建物|房/.test(get('交易標的'))) return { skip: 'target' }
  if ((sale ? SALE_SKIP : RENT_SKIP).test(get('備註'))) return { skip: 'note' }
  const type = typeOf(get('建物型態'))
  if (!type) return { skip: 'type' }
  const use = get('主要用途')
  if (use && !/住|集合/.test(use)) return { skip: 'use' }
  if (!sale && /雅房|分層/.test(get('出租型態'))) return { skip: 'share' }
  const when = parseRoc(get('交易年月日', '租賃年月日'))
  if (!when) return { skip: 'date' }
  const date = `${when.year}-${String(when.month).padStart(2, '0')}`
  if (monthIndex(date) < cutoff) return { skip: 'old' }
  const address = addressKey(get('土地位置建物門牌'))
  if (!address) return { skip: 'address' }

  const total = number(get('總價元', '總額元'))
  const parkPrice = number(get('車位總價元', '車位總額元'))
  const area = number(get('建物移轉總面積平方公尺', '建物總面積平方公尺'))
  const parkArea = number(get('車位移轉總面積平方公尺', '車位面積平方公尺'))
  const unitM2 = number(get('單價元平方公尺'))
  if (!(total > 0) || !(area > 0)) return { skip: 'price' }
  // the unit price leaves the parking space out, and so does the area it was worked out on: that area is the one to give
  let m2 = area
  const implied = unitM2 > 0 && total > parkPrice ? (total - parkPrice) / unitM2 : 0
  if (implied >= area * 0.3 && implied <= area * 1.02) m2 = implied
  else if (parkArea > 0 && area > parkArea) m2 = area - parkArea
  const ping = m2 / SQM_PER_PING
  if (ping < 3 || ping > 400) return { skip: 'size' }
  const perM2 = unitM2 > 0 ? unitM2 : (total - parkPrice) / m2
  let price
  let unit
  if (sale) {
    price = round(total / 10000, 1)
    unit = round((perM2 * SQM_PER_PING) / 10000, 1)
    if (price < 50 || unit < 2 || unit > 800) return { skip: 'price' }
  } else {
    price = Math.round(total)
    unit = Math.round(perM2 * SQM_PER_PING)
    if (price < 1000 || price > 3e6 || unit < 50 || unit > 20000) return { skip: 'price' }
  }
  const lift = get('電梯', '有無電梯')
  const built = parseRoc(get('建築完成年月'))?.year
  return {
    deal: {
      serial: get('編號'),
      kind,
      date,
      floor: floorOf(get('移轉層次', '租賃層次')),
      floors: floorsOf(get('總樓層數')),
      type,
      built: built >= 1900 && built <= 2100 ? built : null,
      ping: round(ping, 1),
      price,
      unit,
      lift: lift === '有' ? true : lift === '無' ? false : null,
      district: get('鄉鎮市區'),
      keys: address.keys,
      key: address.key,
    },
  }
}

// ---------------------------------------------------------------- the address points

/** Where the columns are in the header of a city's address file. The four cities name them a little differently. */
export function pointColumns(header) {
  const find = (re) => header.findIndex((h) => re.test(h))
  const cols = {
    code: find(/鄉鎮市區代碼|areacode/i),
    road: find(/街|road/i),
    area: find(/^(地區|area)$/i),
    lane: find(/^(巷|lane)$/i),
    alley: find(/^(弄|alley)$/i),
    number: find(/^(號|number)$/i),
    x: find(/橫[座坐]標|x_3826/i),
    y: find(/縱[座坐]標|y_3826/i),
    lon: find(/經度/),
    lat: find(/緯度/),
  }
  for (const key of ['code', 'road', 'area', 'lane', 'alley', 'number']) if (cols[key] < 0) throw new Error(`an address file with no ${key} column: ${header.join(',')}`)
  if (cols.lon < 0 && (cols.x < 0 || cols.y < 0)) throw new Error(`an address file with no position: ${header.join(',')}`)
  return cols
}

/**
 * Finds the position of each address that a list of deals names. Feed it the keys the deals want, then the points, then ask.
 * A key that more than one district has (中山路 1號 is in several) is told apart by the district of the deal, and the
 * name of each district code is learned from the keys that only one district has.
 */
export function createGeocoder() {
  const wanted = new Set()
  const found = new Map()
  const names = new Map()
  return {
    want(keys) {
      for (const key of keys) wanted.add(key)
    },
    wants: (key) => wanted.has(key),
    /** A point of an address file. Points of a key nobody asked for are dropped at once. */
    add(key, code, lat, lon) {
      if (!wanted.has(key)) return
      let byCode = found.get(key)
      if (!byCode) found.set(key, (byCode = new Map()))
      const p = byCode.get(code)
      if (!p) byCode.set(code, { n: 1, lat, lon, minLat: lat, maxLat: lat, minLon: lon, maxLon: lon })
      else {
        p.n++
        p.lat += lat
        p.lon += lon
        p.minLat = Math.min(p.minLat, lat)
        p.maxLat = Math.max(p.maxLat, lat)
        p.minLon = Math.min(p.minLon, lon)
        p.maxLon = Math.max(p.maxLon, lon)
      }
    },
    /** Learn which district each code is, from the deals whose key only one code has. */
    learn(deals) {
      const votes = new Map()
      for (const d of deals) {
        const byCode = found.get(d.key)
        if (!byCode || byCode.size !== 1) continue
        const [code] = byCode.keys()
        const v = votes.get(code) ?? new Map()
        v.set(d.district, (v.get(d.district) ?? 0) + 1)
        votes.set(code, v)
      }
      for (const [code, v] of votes) {
        const total = [...v.values()].reduce((a, b) => a + b, 0)
        const [name, n] = [...v.entries()].sort((a, b) => b[1] - a[1])[0]
        if (n >= 3 && n / total >= 0.8) names.set(code, name)
      }
      return names
    },
    names,
    /**
     * @returns {{lat:number, lon:number}|{miss:string}} the position of a deal, or why it has none:
     *   'none' (no point has the address), 'district' (only a point in another district), 'ambiguous' (two
     *   places in its district, or one address spread over more than 150 metres)
     */
    resolve(deal) {
      const points = []
      let why = 'none'
      for (const key of deal.keys) {
        const byCode = found.get(key)
        if (!byCode) continue
        let entries = [...byCode.entries()]
        if (entries.length > 1) {
          const same = entries.filter(([code]) => names.get(code) === deal.district)
          if (same.length !== 1) {
            why = 'ambiguous'
            continue
          }
          entries = same
        } else if (names.has(entries[0][0]) && names.get(entries[0][0]) !== deal.district) {
          why = 'district'
          continue
        }
        const p = entries[0][1]
        const spread = Math.max((p.maxLat - p.minLat) * 111132, (p.maxLon - p.minLon) * 101000)
        if (spread > 150) {
          why = 'ambiguous'
          continue
        }
        points.push({ lat: p.lat / p.n, lon: p.lon / p.n })
      }
      if (!points.length) return { miss: why }
      // a deal that names two houses (419、421號) is put between them when they are near each other, else at the first
      const [a, b] = points
      if (b && Math.hypot((a.lat - b.lat) * 111132, (a.lon - b.lon) * 101000) < 150) return { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 }
      return a
    },
  }
}

/**
 * Feed the geocoder from a city's address file, one line at a time (the files are 100 MB and more).
 * @param {string} file path to the CSV
 * @param {ReturnType<typeof createGeocoder>} geocoder
 * @returns {Promise<{rows:number, kept:number}>}
 */
export async function readPoints(file, geocoder) {
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  let cols = null
  let rows = 0
  let kept = 0
  for await (const raw of lines) {
    const line = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
    if (!line) continue
    const f = line.includes('"') ? parseCsv(line)[0] : line.split(',')
    if (!cols) {
      cols = pointColumns(f)
      continue
    }
    rows++
    const road = f[cols.road]
    const number = f[cols.number]
    if (!road || !number || !number.includes('號')) continue
    const a = addressKey(`${road}${f[cols.area]}${f[cols.lane]}${f[cols.alley]}${number}`, { prefix: false })
    if (!a || !geocoder.wants(a.key)) continue
    let lat
    let lon
    if (cols.lat >= 0 && Number(f[cols.lat]) > 20) {
      lat = Number(f[cols.lat])
      lon = Number(f[cols.lon])
    } else ({ lat, lon } = twd97ToWgs84(Number(f[cols.x]), Number(f[cols.y])))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    geocoder.add(a.key, f[cols.code], lat, lon)
    kept++
  }
  return { rows, kept }
}
