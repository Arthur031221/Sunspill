import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLS, DEALS_ZOOM, SQM_PER_PING, TYPES, ageAt, childTiles, median, monthIndex, packDeal, parseTile, summarise, tileBox, tileName, tileOf, tilesAround, unpackDeal } from '../src/core/deals.js'
import { fromLocal } from '../src/core/geo.js'

// ---------------------------------------------------------------- tiles

test('a place is in the map tile that the slippy map formula gives, at the levels of the deals files', () => {
  // worked out with the standard formula, in Python, apart from this code
  const cases = [[25.0339, 121.5645, [13724, 7014], [27449, 14029], [54898, 28058], [109796, 56116]], [24.1477, 120.6736, [13683, 7058], [27367, 14117], [54735, 28235], [109471, 56471]], [24.9937, 121.3009, [13712, 7016], [27425, 14033], [54850, 28066], [109700, 56132]]]
  for (const [lat, lon, ...tiles] of cases) {
    tiles.forEach(([x, y], i) => assert.deepEqual(tileOf(lat, lon, 14 + i), { z: 14 + i, x, y }, `${lat} ${lon} level ${14 + i}`))
  }
  assert.equal(DEALS_ZOOM, 15)
  assert.deepEqual(tileOf(25.0339, 121.5645), { z: 15, x: 27449, y: 14029 })
  assert.equal(tileName({ z: 15, x: 27449, y: 14029 }), '15-27449-14029')
})

test('the box of a tile holds the places in it, and its four children hold the four quarters', () => {
  const t = tileOf(25.0339, 121.5645)
  const box = tileBox(t)
  assert.ok(box.south < 25.0339 && 25.0339 < box.north && box.west < 121.5645 && 121.5645 < box.east)
  assert.ok(Math.abs(box.north - 25.035838555635) < 1e-9 && Math.abs(box.west - 121.563720703125) < 1e-9)
  const kids = childTiles(t)
  assert.deepEqual(kids.map((k) => [k.x, k.y]), [[54898, 28058], [54899, 28058], [54898, 28059], [54899, 28059]])
  assert.ok(kids.every((k) => k.z === 16))
  assert.deepEqual(tileOf(25.0339, 121.5645, 16), kids[0])
  const small = tileBox(kids[3])
  assert.ok(Math.abs(small.east - box.east) < 1e-12 && Math.abs(small.south - box.south) < 1e-12)
})

test('the tiles that a circle of 450 metres reaches are one in the middle of a tile, two at an edge and four at a corner', () => {
  const t = tileOf(25.0339, 121.5645)
  const box = tileBox(t)
  const mid = [(box.north + box.south) / 2, (box.east + box.west) / 2]
  assert.equal(tilesAround(mid[0], mid[1], 450).length, 1)
  assert.equal(tilesAround(mid[0], mid[1], 450).map(tileName)[0], '15-27449-14029')
  assert.equal(tilesAround(mid[0], box.west + 0.001, 450).length, 2, 'near the west edge')
  assert.equal(tilesAround(box.north - 0.001, box.east - 0.001, 450).length, 4, 'near the north east corner')
  const four = tilesAround(box.north - 0.001, box.east - 0.001, 450).map((x) => [x.x, x.y])
  assert.deepEqual(four, [[27449, 14028], [27450, 14028], [27449, 14029], [27450, 14029]])
  // a tile level that is finer reaches more of them, and a wider circle too
  assert.ok(tilesAround(mid[0], mid[1], 450, 17).length > 4)
  assert.ok(tilesAround(mid[0], mid[1], 900).length > 1)
})

// ---------------------------------------------------------------- rows

const deal = (extra = {}) => ({ lat: 25.02847, lon: 121.54394, kind: 'sale', date: '2026-08', floor: 6, floors: 12, type: 'high', built: 1998, ping: 31.5, price: 2560, unit: 81.3, lift: true, ...extra })

test('a deal packs into a row of the columns in COLS and unpacks to the same deal, with its address from the file\'s list', () => {
  assert.deepEqual(COLS, ['lat', 'lon', 'kind', 'date', 'floor', 'floors', 'type', 'built', 'ping', 'price', 'unit', 'lift', 'addr'])
  const row = packDeal(deal(), 1)
  assert.deepEqual(row, [25.02847, 121.54394, 0, '2026-08', 6, 12, 2, 1998, 31.5, 2560, 81.3, 1, 1])
  assert.deepEqual(unpackDeal(row, ['復興南路二段151巷3號', '復興南路二段151巷5號']), { ...deal(), addr: '復興南路二段151巷5號' })
  const rent = deal({ kind: 'rent', price: 25000, unit: 1491, floor: null, floors: null, built: null, lift: null, type: 'house' })
  assert.deepEqual(packDeal(rent), [25.02847, 121.54394, 1, '2026-08', null, null, 3, null, 31.5, 25000, 1491, null, null])
  assert.deepEqual(unpackDeal(packDeal(rent), []), { ...rent, addr: null })
  assert.deepEqual(TYPES, ['walkup', 'mid', 'high', 'house', 'studio'])
})

test('a place is rounded to five decimals and the area to a tenth of a ping in the row', () => {
  const row = packDeal(deal({ lat: 25.0284749, lon: 121.5439351, ping: 31.46 }))
  assert.deepEqual([row[0], row[1], row[8]], [25.02847, 121.54394, 31.5])
})

test('a row that is not one of ours is refused: outside Taiwan, a kind that does not exist, a date that is not a month, a wrong address number', () => {
  const good = packDeal(deal(), 0)
  assert.ok(unpackDeal(good, ['x']))
  const bad = (i, v) => good.map((x, n) => (n === i ? v : x))
  for (const [i, v] of [[0, 40], [1, 10], [0, 'a'], [2, 2], [3, '2026-13'], [3, '26-08'], [3, 202608], [4, 'x'], [6, 9], [7, 1500], [8, -1], [9, 'x'], [11, 2], [12, 5], [12, 0.5]]) {
    assert.equal(unpackDeal(bad(i, v), ['x']), null, `${i} ${v}`)
  }
  assert.equal(unpackDeal(good.slice(0, 12), ['x']), null)
  assert.equal(unpackDeal(null), null)
  assert.equal(unpackDeal('x'), null)
})

test('a tile file is read into its deals, a file of another version is refused, and a bad row is left out and the rest kept', () => {
  const file = { v: 1, z: 15, x: 1, y: 2, cols: COLS, addrs: ['甲路1號'], rows: [packDeal(deal(), 0), [1, 2, 3], packDeal(deal({ date: '2026-07' }), null)] }
  const deals = parseTile(file)
  assert.equal(deals.length, 2)
  assert.equal(deals[0].addr, '甲路1號')
  assert.equal(deals[1].addr, null)
  for (const x of [null, undefined, {}, { v: 2, rows: [] }, { v: 1 }, { v: 1, rows: 'x' }, 'x', []]) assert.equal(parseTile(x), null, JSON.stringify(x))
  assert.deepEqual(parseTile({ v: 1, rows: [] }), [])
})

// ---------------------------------------------------------------- the numbers

test('the middle value of a list, and the mean of the two in the middle for an even list, and nothing for nothing', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 3, 2]), 2.5)
  assert.equal(median([5]), 5)
  assert.equal(median([]), null)
  assert.equal(median([NaN, 2, null === 1 ? 1 : 3]), 2.5, 'a value that is not a number is not counted')
  assert.equal(monthIndex('2026-01'), 2026 * 12)
  assert.equal(monthIndex('2026-12') - monthIndex('2025-12'), 12)
})

test('a building is as old as the years between its finishing and the deal, and has no age when the year is not known or is in the future', () => {
  assert.equal(ageAt({ date: '2026-08', built: 1998 }), 28)
  assert.equal(ageAt({ date: '2026-08', built: null }), null)
  assert.equal(ageAt({ date: '2026-08', built: 2027 }), 0)
  assert.equal(SQM_PER_PING, 3.305785)
})

// a street of buildings 40 metres apart going east from the origin, and one deal in the middle of each
const ORIGIN = { lat: 25.03, lon: 121.55 }
const at = (east, north = 0) => fromLocal(ORIGIN, east, north)
const placed = (east, extra = {}, north = 0) => deal({ ...at(east, north), ...extra })
const NOW = new Date(2026, 9, 10)

test('the sales within 300 metres in the last 12 months give a count, the middle unit price, the floors and the middle age', () => {
  const deals = [
    placed(50, { unit: 60, floor: 3, built: 2006 }), // age 20
    placed(120, { unit: 70, floor: 9, built: 1996 }), // age 30
    placed(280, { unit: 90, floor: 5, built: 1986 }), // age 40
    placed(310, { unit: 500, floor: 30, built: 1990 }), // too far
    placed(100, { unit: 400, date: '2025-09' }), // 13 months back
    placed(100, { unit: 400, date: '2026-11' }), // in the future
    placed(100, { kind: 'rent', price: 20000, unit: 1000 }),
  ]
  const s = summarise(deals, { origin: ORIGIN, point: ORIGIN, now: NOW })
  assert.deepEqual(s.sales, { count: 3, unit: 70, floorMin: 3, floorMax: 9, age: 30 })
  // the same sales with the page looking back 14 months take in the one 13 months old
  assert.equal(summarise(deals, { origin: ORIGIN, point: ORIGIN, now: NOW, months: 14 }).sales.count, 4)
  // November 2025 is in and October 2025 is not: twelve calendar months, this one included
  assert.equal(summarise([placed(10, { date: '2025-11' })], { origin: ORIGIN, point: ORIGIN, now: NOW }).sales.count, 1)
  assert.equal(summarise([placed(10, { date: '2025-10' })], { origin: ORIGIN, point: ORIGIN, now: NOW }).sales.count, 0)
})

test('the middle of an even number of sales is the mean of the two in the middle, and a house has no floor and a missing age is not counted', () => {
  const deals = [placed(10, { unit: 60, floor: null, type: 'house', built: null }), placed(20, { unit: 80, floor: 4, built: 2016 }), placed(30, { unit: 100, floor: 2, built: 2006 }), placed(40, { unit: 120, floor: 8, built: 1996 })]
  const s = summarise(deals, { origin: ORIGIN, point: ORIGIN, now: NOW })
  assert.equal(s.sales.count, 4)
  assert.equal(s.sales.unit, 90)
  assert.deepEqual([s.sales.floorMin, s.sales.floorMax], [2, 8])
  assert.equal(s.sales.age, 20, 'ages 10, 20 and 30')
})

test('the rentals within 300 metres give a count, the middle rent and the middle rent a ping', () => {
  const deals = [
    placed(20, { kind: 'rent', price: 20000, unit: 1000 }),
    placed(90, { kind: 'rent', price: 30000, unit: 1500 }),
    placed(150, { kind: 'rent', price: 50000, unit: 2500 }),
    placed(400, { kind: 'rent', price: 90000, unit: 9000 }),
    placed(60, { kind: 'rent', price: 99999, unit: 9999, date: '2025-01' }),
  ]
  const s = summarise(deals, { origin: ORIGIN, point: ORIGIN, now: NOW })
  assert.deepEqual(s.rents, { count: 3, rent: 30000, perPing: 1500 })
  assert.deepEqual(summarise([], { origin: ORIGIN, point: ORIGIN, now: NOW }), { sales: { count: 0, unit: null, floorMin: null, floorMax: null, age: null }, rents: { count: 0, rent: null, perPing: null }, same: [], nearest: [] })
})

// a building 20 by 20 metres with its middle 100 metres east of the origin
const RING = [[90, -10], [110, -10], [110, 10], [90, 10]]

test('the deals of the same building are the ones on its outline, newest first, and they come out of the nearest list', () => {
  const deals = [
    placed(100, { date: '2026-03', unit: 50 }),
    placed(95, { date: '2026-08', unit: 60 }, 5),
    placed(108, { date: '2025-08', unit: 40 }, -8), // older than 12 months, still the same building
    placed(130, { date: '2026-07' }), // 20 metres out of the outline
    placed(114, { date: '2026-06' }, 0), // 4 metres out of the outline, an error of the point
    placed(200, { date: '2026-05' }),
  ]
  const s = summarise(deals, { origin: ORIGIN, ring: RING, now: NOW })
  assert.deepEqual(s.same.map((d) => d.date), ['2026-08', '2026-06', '2026-03', '2025-08'])
  assert.ok(s.same.every((d) => d.metres < 15))
  assert.deepEqual(s.nearest.map((d) => d.date), ['2026-07', '2026-05'], 'the building\'s own deals are not listed twice')
  // all of them but the old one count in the numbers round the building
  assert.equal(s.sales.count, 5)
})

test('a deal that carries the address the person typed is of the same building when it is near, and not when it is a street away', () => {
  const key = '復興南路二段151巷5號'
  const deals = [placed(130, { addr: key, date: '2026-04' }), placed(160, { addr: key, date: '2026-05' }), placed(130, { addr: '復興南路二段151巷7號', date: '2026-06' })]
  const withAddress = summarise(deals, { origin: ORIGIN, ring: RING, address: key, now: NOW })
  assert.deepEqual(withAddress.same.map((d) => d.date), ['2026-04'], '20 metres from the outline counts, 50 does not')
  assert.deepEqual(summarise(deals, { origin: ORIGIN, ring: RING, now: NOW }).same, [], 'with no address only the outline counts')
  // no outline at all: the point of the building stands for it, with 15 metres of room
  const point = at(100)
  const bare = summarise([placed(105, { date: '2026-02' }), placed(130, { date: '2026-03' })], { origin: ORIGIN, point, now: NOW })
  assert.deepEqual(bare.same.map((d) => d.date), ['2026-02'])
})

test('the five nearest deals of the last year, sales and rentals together, closest first, within 450 metres', () => {
  const deals = [
    placed(100), placed(200, { kind: 'rent', price: 25000, unit: 1500 }), placed(250), placed(300, { date: '2026-01' }), placed(350), placed(400, { kind: 'rent', price: 26000, unit: 1600 }), placed(440),
    placed(700), placed(150, { date: '2025-01' }),
  ]
  const s = summarise(deals, { origin: ORIGIN, point: ORIGIN, now: NOW })
  assert.equal(s.nearest.length, 5)
  assert.deepEqual(s.nearest.map((d) => Math.round(d.metres / 10) * 10), [100, 200, 250, 300, 350])
  assert.deepEqual(s.nearest.map((d) => d.kind), ['sale', 'rent', 'sale', 'sale', 'sale'])
  assert.equal(summarise(deals, { origin: ORIGIN, point: ORIGIN, now: NOW, nearest: 8 }).nearest.length, 7, 'the 700 metre one and the old one are not near')
  assert.ok(s.nearest.every((d) => !('at' in d)))
})
