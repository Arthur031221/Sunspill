import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCsv, parseRoc, floorOf, floorsOf, typeOf, dealFromRow, pointColumns, createGeocoder, readPoints, CITIES } from '../scripts/lib/lvr.mjs'
import { monthIndex } from '../src/core/deals.js'

// Rows copied from the files of 內政部不動產交易實價查詢服務網 (season 115S3 and the two before it) and from the address
// files of the four cities, as they were on 2026-10-10. Both are open data under 政府資料開放授權條款第1版.
const fixture = (name) => readFileSync(new URL(`./fixtures/deals/${name}`, import.meta.url), 'utf8')
const LETTER = { 臺北市: 'a', 新北市: 'f', 臺中市: 'b', 桃園市: 'h' }

/** Every row of the sales and the rentals fixtures, as dealFromRow reads it. */
function readDeals(cutoff = 0) {
  const out = []
  for (const [file, kind] of [['lvr-sales.csv', 'sale'], ['lvr-rents.csv', 'rent']]) {
    const rows = parseCsv(fixture(file))
    const headers = rows[0]
    rows.slice(2).forEach((row, i) => {
      const address = row[headers.indexOf('土地位置建物門牌')]
      const r = dealFromRow(headers, row, kind, { cutoff })
      out.push({ kind, i, address, ...r, city: LETTER[/^(.{2}[市縣])/.exec(address)?.[1]] })
    })
  }
  return out
}

test('a CSV file is read with its quotes, doubled quotes, line breaks inside a field, CRLF line ends and byte order mark', () => {
  const text = '﻿a,b,c\r\n1,"two, with a comma","say ""hi"""\r\n"x\ny",,\r\n4,5,6'
  assert.deepEqual(parseCsv(text), [['a', 'b', 'c'], ['1', 'two, with a comma', 'say "hi"'], ['x\ny', '', ''], ['4', '5', '6']])
  assert.deepEqual(parseCsv(''), [])
  assert.deepEqual(parseCsv('a,b\n'), [['a', 'b']])
})

test('a date of the Republic of China is read, with a year of two digits or three', () => {
  assert.deepEqual(parseRoc('1150902'), { year: 2026, month: 9, day: 2 })
  assert.deepEqual(parseRoc('0711130'), { year: 1982, month: 11, day: 30 })
  assert.deepEqual(parseRoc('991231'), { year: 2010, month: 12, day: 31 })
  for (const bad of ['', '115', '1151301', 'abcdefg', undefined, '11509021']) assert.equal(parseRoc(bad), null, String(bad))
})

test('the floor of a deal is the lowest one named, and a whole house, a mezzanine and nothing have none', () => {
  const cases = { 十層: 10, 三層: 3, '三層，四層，五層': 3, 一層: 1, 地下一層: -1, 地下層: -1, 地下二層: -2, 5: 5, 七樓: 7, 十二層: 12, 全: null, 夾層: null, 見其他登記事項: null, '': null }
  for (const [text, floor] of Object.entries(cases)) assert.equal(floorOf(text), floor, text)
  assert.equal(floorOf(undefined), null)
  assert.equal(floorsOf('十五層'), 15)
  assert.equal(floorsOf('12'), 12)
  assert.equal(floorsOf('一百零一層'), 101)
  assert.equal(floorsOf(''), null)
})

test('only homes have a type: the five kinds of dwelling, and not shops, offices, factories or land', () => {
  assert.equal(typeOf('住宅大樓(11層含以上有電梯)'), 'high')
  assert.equal(typeOf('華廈(10層含以下有電梯)'), 'mid')
  assert.equal(typeOf('公寓(5樓含以下無電梯)'), 'walkup')
  assert.equal(typeOf('透天厝'), 'house')
  assert.equal(typeOf('套房(1房1廳1衛)'), 'studio')
  for (const other of ['店面(店鋪)', '辦公商業大樓', '工廠', '廠辦', '倉庫', '農舍', '其他', '', undefined]) assert.equal(typeOf(other), null, String(other))
})

test('a sale becomes a deal in the units the page shows: 萬 for the price, 坪 for the area, 萬 a 坪 for the unit price', () => {
  const [a, b, c, d, e] = readDeals().filter((x) => x.kind === 'sale' && x.deal)
  assert.deepEqual({ ...a.deal, serial: undefined, keys: undefined }, {
    serial: undefined, kind: 'sale', date: '2026-08', floor: 6, floors: 12, type: 'high', built: 1984, ping: 41, price: 2680, unit: 65.4, lift: true,
    district: '內湖區', keys: undefined, key: '文德路60號',
  })
  assert.deepEqual([b.deal.floor, b.deal.floors, b.deal.type, b.deal.built, b.deal.lift], [6, 11, 'high', 1998, true])
  // an apartment with no lift
  assert.deepEqual([c.deal.type, c.deal.lift, c.deal.floors], ['walkup', false, 5])
  // a house has no floor of its own, and a floor list after the number is not part of the address
  assert.deepEqual([d.deal.type, d.deal.floor, d.deal.floors, d.deal.key], ['house', null, 2, '至誠路一段62巷3弄12號'])
  assert.ok(a.deal.serial.length > 10)
  assert.equal(e.deal.unit, 78.8)
})

test('the area is the one the unit price was worked out on, which leaves a parking space out when it is priced on its own', () => {
  const rows = parseCsv(fixture('lvr-sales.csv'))
  const headers = rows[0]
  const row = rows.slice(2).find((r) => r[headers.indexOf('土地位置建物門牌')].includes('信義路五段１１５號'))
  const get = (n) => Number(row[headers.indexOf(n)])
  // 19.9 million with 3 million of it for the parking space, 85.87 square metres with 14.97 of them parking
  assert.equal(get('總價元'), 19900000)
  assert.equal(get('車位總價元'), 3000000)
  const deal = dealFromRow(headers, row, 'sale').deal
  assert.equal(deal.ping, 21.4, '70.9 square metres, 21.4 ping, and not the 26 of the whole')
  assert.equal(deal.unit, 78.8)
  assert.equal(deal.price, 1990, 'the price is the total that the register gives')
})

test('a rental becomes a deal with the rent in NTD a month and the unit price in NTD a ping a month', () => {
  const [a] = readDeals().filter((x) => x.kind === 'rent' && x.deal)
  assert.deepEqual({ ...a.deal, serial: undefined, keys: undefined }, {
    serial: undefined, kind: 'rent', date: '2026-05', floor: 7, floors: 11, type: 'high', built: 1977, ping: 16.8, price: 25000, unit: 1491, lift: true,
    district: '中山區', keys: undefined, key: '林森北路575號',
  })
  const house = readDeals().find((x) => x.kind === 'rent' && x.address === '臺北市中正區忠孝東路二段七號')
  assert.deepEqual([house.deal.floor, house.deal.type, house.deal.key], [null, 'house', '忠孝東路二段7號'], 'a house number in Chinese is read')
})

test('what is not a home on the market is left out, and each deal says why', () => {
  const skipped = readDeals().filter((x) => x.skip).map((x) => [x.kind, x.address, x.skip])
  assert.deepEqual(skipped, [
    ['sale', '臺北市中山區敬業三路１６２巷２６號三樓', 'note'], // between relatives
    ['sale', '通化段六小段344地號', 'target'], // land
    ['sale', '臺北市中正區忠孝西路一段７２號二樓之５１', 'use'], // for business
    ['rent', '臺北市中山區建國北路二段３４號１３樓之２', 'share'], // a room in a shared flat
    ['rent', '臺北市信義區基隆路一段２７之１號３樓之１', 'note'], // part of a flat
    ['rent', '臺北市中山區民生東路一段７７號六樓之４', 'use'],
  ])
})

test('a deal older than the first month to keep is left out as old', () => {
  const cutoff = monthIndex('2026-07')
  const old = readDeals(cutoff).filter((x) => x.skip === 'old' && x.kind === 'sale')
  const kept = readDeals(cutoff).filter((x) => x.deal && x.kind === 'sale')
  assert.ok(old.length >= 2 && old.every((x) => x.i !== undefined))
  assert.ok(kept.every((x) => monthIndex(x.deal.date) >= cutoff))
  assert.ok(old.some((x) => x.address.includes('正隆巷')), 'the February sale')
})

test('a row from the middle of a file with fewer columns than the header is still read, and a row with nothing to read is left out', () => {
  const headers = parseCsv(fixture('lvr-sales.csv'))[0]
  assert.deepEqual(dealFromRow(headers, [], 'sale'), { skip: 'target' })
  assert.deepEqual(dealFromRow(['交易標的'], ['房地(土地+建物)'], 'sale'), { skip: 'type' })
})

test('the columns of each city\'s address file are found by their names, and a file with no position or no number is refused', () => {
  const header = (letter) => readFileSync(new URL(`./fixtures/deals/points-${letter}.csv`, import.meta.url), 'utf8').split('\n')[0].split(',')
  assert.deepEqual(pointColumns(header('a')), { code: 1, road: 4, area: 5, lane: 6, alley: 7, number: 8, x: 9, y: 10, lon: -1, lat: -1 })
  assert.deepEqual(pointColumns(header('f')), { code: 1, road: 4, area: 5, lane: 6, alley: 7, number: 8, x: 9, y: 10, lon: -1, lat: -1 })
  assert.deepEqual(pointColumns(header('b')), { code: 1, road: 4, area: 5, lane: 6, alley: 7, number: 8, x: 9, y: 10, lon: 11, lat: 12 })
  assert.deepEqual(pointColumns(header('h')), { code: 1, road: 4, area: 5, lane: 6, alley: 7, number: 8, x: 9, y: 10, lon: -1, lat: -1 })
  assert.throws(() => pointColumns(['省市縣市代碼', '鄉鎮市區代碼', '村里', '街路段', '地區', '巷', '弄', '號']), /position/)
  assert.throws(() => pointColumns(['a', 'b']), /no code column/)
})

/** The fixture deals, found against the fixture points the way scripts/make-deals.mjs does it. */
async function geocodeAll() {
  const deals = readDeals().filter((x) => x.deal).map((x) => ({ ...x.deal, city: x.city, i: x.i, address: x.address }))
  const found = []
  const misses = {}
  for (const city of CITIES) {
    const geocoder = createGeocoder()
    const mine = deals.filter((d) => d.city === city.letter)
    for (const d of mine) geocoder.want(d.keys)
    const read = await readPoints(new URL(`./fixtures/deals/points-${city.letter}.csv`, import.meta.url).pathname, geocoder)
    assert.ok(read.rows > read.kept && read.kept > 0, `${city.name} ${JSON.stringify(read)}`)
    geocoder.learn(mine)
    for (const d of mine) {
      const at = geocoder.resolve(d)
      if (at.miss) misses[at.miss] = (misses[at.miss] ?? 0) + 1
      else found.push({ ...d, ...at })
    }
  }
  return { found, misses, total: deals.length }
}

test('each deal is put where its address is in the city\'s file, from TWD97 for three cities and from the file\'s own WGS84 for Taichung', async () => {
  const { found, misses, total } = await geocodeAll()
  assert.equal(total, 26 - 6, 'twenty of the 26 rows are deals')
  assert.deepEqual(misses, {})
  assert.equal(found.length, total)
  const at = (address) => found.find((d) => d.address === address)
  const near = (d, lat, lon) => assert.ok(Math.abs(d.lat - lat) < 1e-5 && Math.abs(d.lon - lon) < 1e-5, `${d.address} ${d.lat} ${d.lon}`)
  near(at('臺北市內湖區文德路６０號六樓'), 25.07806, 121.58100)
  near(at('臺北市文山區公館街３號三樓'), 25.00496, 121.53834)
  near(at('新北市新店區安興路１１－３號八樓'), 24.96826, 121.51425)
  near(at('桃園市觀音區文化路石橋段６２５巷１６０弄１７衖９號'), 25.00313, 121.10267)
  near(at('臺中市豐原區保康路５２號四樓之３'), 24.24212, 120.72187)
  near(at('臺中市中區三民路貳段３７號１１樓-４'), 24.14123, 120.67812)
  // a house in Taipei is where Taipei is, and one in Taichung where Taichung is
  assert.ok(found.filter((d) => d.city === 'a').every((d) => d.lat > 24.9 && d.lat < 25.3 && d.lon > 121.4 && d.lon < 121.7))
  assert.ok(found.filter((d) => d.city === 'b').every((d) => d.lat > 24 && d.lat < 24.5 && d.lon > 120.4 && d.lon < 121.2))
})

test('a deal that names two houses is put on the first, or between them when they are near, and a deal with no address in the file has no place', () => {
  const g = createGeocoder()
  g.want(['民生西路419號', '民生西路421號', '無此路9號'])
  g.add('民生西路419號', 'c1', 25.0, 121.5)
  g.add('民生西路421號', 'c1', 25.00002, 121.50002)
  const two = g.resolve({ keys: ['民生西路419號', '民生西路421號'], district: '大同區' })
  assert.ok(Math.abs(two.lat - 25.00001) < 1e-9 && Math.abs(two.lon - 121.50001) < 1e-9)
  g.add('民生西路421號', 'c2', 25.5, 121.9)
  assert.deepEqual(g.resolve({ keys: ['無此路9號'], district: '大同區' }), { miss: 'none' })
  assert.deepEqual(g.resolve({ keys: ['別處1號'], district: '大同區' }), { miss: 'none' })
})

test('the same address in two districts is told apart by the district, whose name is learned from the addresses that only one district has', () => {
  const g = createGeocoder()
  const keys = ['中山路1號', ...Array.from({ length: 4 }, (_, i) => `甲路${i + 1}號`), ...Array.from({ length: 4 }, (_, i) => `乙路${i + 1}號`)]
  g.want(keys)
  // 板橋區 is code 100 and 新店區 code 200, and 中山路1號 is in both
  g.add('中山路1號', '100', 25.0, 121.4)
  g.add('中山路1號', '200', 24.9, 121.5)
  for (let i = 1; i <= 4; i++) {
    g.add(`甲路${i}號`, '100', 25.01, 121.41)
    g.add(`乙路${i}號`, '200', 24.91, 121.51)
  }
  const deals = [...Array.from({ length: 4 }, (_, i) => ({ keys: [`甲路${i + 1}號`], key: `甲路${i + 1}號`, district: '板橋區' })), ...Array.from({ length: 4 }, (_, i) => ({ keys: [`乙路${i + 1}號`], key: `乙路${i + 1}號`, district: '新店區' }))]
  // before the districts are known the address is ambiguous
  assert.deepEqual(g.resolve({ keys: ['中山路1號'], district: '板橋區' }), { miss: 'ambiguous' })
  g.learn(deals)
  assert.equal(g.names.get('100'), '板橋區')
  assert.equal(g.names.get('200'), '新店區')
  assert.deepEqual(g.resolve({ keys: ['中山路1號'], district: '板橋區' }), { lat: 25.0, lon: 121.4 })
  assert.deepEqual(g.resolve({ keys: ['中山路1號'], district: '新店區' }), { lat: 24.9, lon: 121.5 })
  assert.deepEqual(g.resolve({ keys: ['中山路1號'], district: '三重區' }), { miss: 'ambiguous' })
  // an address that only the other district has is not the one in this district
  assert.deepEqual(g.resolve({ keys: ['甲路1號'], district: '新店區' }), { miss: 'district' })
})

test('an address that is at two places in one district, or spread over more than 150 metres, is not guessed', () => {
  const g = createGeocoder()
  g.want(['長路8號'])
  g.add('長路8號', '1', 25.0, 121.5)
  g.add('長路8號', '1', 25.0, 121.502)
  assert.deepEqual(g.resolve({ keys: ['長路8號'], district: 'x' }), { miss: 'ambiguous' })
  const h = createGeocoder()
  h.want(['近路8號'])
  h.add('近路8號', '1', 25.0, 121.5)
  h.add('近路8號', '1', 25.0001, 121.5001)
  const at = h.resolve({ keys: ['近路8號'], district: 'x' })
  assert.ok(Math.abs(at.lat - 25.00005) < 1e-9 && Math.abs(at.lon - 121.50005) < 1e-9, 'rows of one address at the same spot are averaged')
})

test('a point nobody asked about is dropped on the way in', () => {
  const g = createGeocoder()
  g.want(['甲路1號'])
  g.add('乙路2號', '1', 25.0, 121.5)
  assert.deepEqual(g.resolve({ keys: ['乙路2號'], district: 'x' }), { miss: 'none' })
  assert.equal(g.wants('甲路1號'), true)
  assert.equal(g.wants('乙路2號'), false)
})
