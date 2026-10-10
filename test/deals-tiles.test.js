import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTiles, indexText, tileText } from '../scripts/lib/tiles.mjs'
import { parseTile, tileOf } from '../src/core/deals.js'
import { seasonCodes, seasonEnd } from '../scripts/make-deals.mjs'

const deal = (lat, lon, extra = {}) => ({ lat, lon, kind: 'sale', date: '2026-08', floor: 5, floors: 12, type: 'high', built: 1998, ping: 31.5, price: 2560, unit: 81.3, lift: true, addr: null, ...extra })

test('deals are grouped by the level 15 tile of their place, one file for each, named level-x-y', () => {
  const { files, leaves, oversize } = buildTiles([deal(25.0339, 121.5645), deal(25.0340, 121.5646), deal(24.1477, 120.6736)])
  assert.deepEqual([...files.keys()].sort(), ['15-27367-14117.json', '15-27449-14029.json'])
  assert.deepEqual(leaves, { 15: ['27367-14117', '27449-14029'] })
  assert.deepEqual(oversize, [])
  assert.equal(files.get('15-27449-14029.json').deals, 2)
  const text = files.get('15-27449-14029.json').text
  const file = JSON.parse(text)
  assert.deepEqual([file.v, file.z, file.x, file.y, file.rows.length], [1, 15, 27449, 14029, 2])
  assert.equal(files.get('15-27449-14029.json').bytes, Buffer.byteLength(text))
})

test('a file reads back into the deals that went in, and every place in it is inside its tile', () => {
  const input = [deal(25.0339, 121.5645, { addr: '甲路1號', date: '2026-05' }), deal(25.0341, 121.5647, { addr: '甲路3號' }), deal(25.0343, 121.5649, { addr: '甲路1號', kind: 'rent', price: 25000, unit: 1500 })]
  const { files } = buildTiles(input)
  const [[name, file]] = [...files]
  const parsed = JSON.parse(file.text)
  assert.deepEqual(parsed.addrs, ['甲路1號', '甲路3號'], 'each address once, in order')
  const deals = parseTile(parsed)
  assert.equal(deals.length, 3)
  assert.deepEqual(deals.map((d) => [d.date, d.addr, d.kind]), [['2026-08', '甲路1號', 'rent'], ['2026-08', '甲路3號', 'sale'], ['2026-05', '甲路1號', 'sale']], 'newest first, and from north to south within a month')
  assert.ok(deals.every((d) => tileOf(d.lat, d.lon, parsed.z).x === parsed.x && tileOf(d.lat, d.lon, parsed.z).y === parsed.y))
  assert.equal(name, '15-27449-14029.json')
})

test('the file is the same whatever order the deals come in, with a row on each line', () => {
  const list = [deal(25.0339, 121.5645), deal(25.0341, 121.5647, { date: '2026-06' }), deal(25.0343, 121.5649, { price: 3000 }), deal(25.0345, 121.5641, { kind: 'rent', price: 25000, unit: 1500 })]
  const a = buildTiles(list).files.get('15-27449-14029.json').text
  const b = buildTiles([...list].reverse()).files.get('15-27449-14029.json').text
  assert.equal(a, b)
  assert.equal(a.split('\n').length, 4 + 3, 'a line each for the head, the four rows and the two closing ones')
  assert.ok(a.endsWith(']}\n'))
  assert.equal(tileText({ z: 15, x: 1, y: 2, addrs: [], rows: [] }), '{"v":1,"z":15,"x":1,"y":2,"cols":["lat","lon","kind","date","floor","floors","type","built","ping","price","unit","lift","addr"],"addrs":[],"rows":[\n\n]}\n')
})

test('a tile over the size limit is cut into its four tiles, again if they are over it too, up to level 17', () => {
  // 400 deals round the middle of tile 15-27449-14029, so that its four children each get some
  const crowd = Array.from({ length: 400 }, (_, i) => deal(25.0299 + (i % 20) * 0.0001, 121.5683 + Math.floor(i / 20) * 0.0001, { price: 1000 + i }))
  const whole = buildTiles(crowd, { maxBytes: 1e9 })
  assert.equal(whole.files.size, 1)
  const size = whole.files.values().next().value.bytes
  const cut = buildTiles(crowd, { maxBytes: Math.floor(size / 2) })
  assert.ok(cut.files.size > 1, `${cut.files.size} files`)
  assert.ok([...cut.files.keys()].every((n) => /^16-\d+-\d+\.json$|^17-\d+-\d+\.json$|^15-/.test(n)))
  assert.ok(!cut.files.has('15-27449-14029.json'), 'no file for a tile that was cut')
  assert.equal([...cut.files.values()].reduce((n, f) => n + f.deals, 0), 400, 'no deal lost, none twice')
  for (const [name, file] of cut.files) {
    const [z, x, y] = name.replace('.json', '').split('-').map(Number)
    assert.ok(file.bytes <= Math.floor(size / 2) || z === 17, name)
    for (const d of parseTile(JSON.parse(file.text))) assert.deepEqual(tileOf(d.lat, d.lon, z), { z, x, y }, `${name} ${d.lat} ${d.lon}`)
  }
  // the leaves list the files at each level that exist
  assert.deepEqual(Object.values(cut.leaves).flat().length, cut.files.size)
  assert.equal(cut.oversize.length, 0)
  // a limit too small for level 17 is said to be over
  const tiny = buildTiles(crowd, { maxBytes: 600 })
  assert.ok(tiny.oversize.length > 0)
  assert.ok(tiny.oversize.every((n) => n.startsWith('17-')))
})

test('the index names the tile files, the version, the freshness and where the data comes from', () => {
  const { leaves } = buildTiles([deal(25.0339, 121.5645), deal(24.1477, 120.6736)])
  const index = JSON.parse(indexText({ asof: '2026-09', built: '2026-10-10', leaves, counts: { sale: 2, rent: 0 }, sources: ['內政部不動產交易實價查詢服務網'] }))
  assert.deepEqual([index.v, index.zoom, index.maxZoom, index.asof, index.built], [1, 15, 17, '2026-09', '2026-10-10'])
  assert.deepEqual(index.tiles, { 15: ['27367-14117', '27449-14029'] })
  assert.deepEqual(index.counts, { sale: 2, rent: 0 })
  assert.equal(index.cols.length, 13)
  assert.deepEqual(index.kinds, ['sale', 'rent'])
})

test('the seasons to try are the one of today and the ones before it, and a season ends where its note says', () => {
  assert.deepEqual(seasonCodes(new Date('2026-10-10T12:00:00Z'), 5), ['115S4', '115S3', '115S2', '115S1', '114S4'])
  assert.deepEqual(seasonCodes(new Date('2027-01-02T12:00:00Z'), 3), ['116S1', '115S4', '115S3'])
  assert.equal(seasonEnd('<lvr_time>資料內容：登記日期 115年6月11日至 115年9月10日之買賣案件，及訂約日期 115年5月11日至 115年8月10日之租賃案件</lvr_time>'), '2026-09')
  assert.equal(seasonEnd('nothing to read'), null)
})
