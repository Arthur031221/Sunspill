import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { COLS, DEALS_MAX_ZOOM, DEALS_ZOOM, parseTile, tileOf } from '../src/core/deals.js'

// The data that scripts/make-deals.mjs wrote and the page reads. Whatever the script wrote last must keep to the
// limits it was built for, and must be data that the page can read.
const dir = new URL('../data/deals/', import.meta.url)
const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'))
const names = readdirSync(dir).filter((n) => n !== 'index.json')

test('the index says what the data is, how fresh it is and where it comes from', () => {
  assert.equal(index.v, 1)
  assert.equal(index.zoom, DEALS_ZOOM)
  assert.equal(index.maxZoom, DEALS_MAX_ZOOM)
  assert.match(index.asof, /^20\d\d-(0[1-9]|1[0-2])$/)
  assert.match(index.built, /^20\d\d-\d\d-\d\d$/)
  assert.deepEqual(index.cols, COLS)
  assert.ok(index.counts.sale > 0 && index.counts.rent > 0)
  assert.ok(index.sources.some((s) => s.includes('plvr.land.moi.gov.tw') && s.includes('政府資料開放授權條款')))
  assert.ok(index.sources.some((s) => s.includes('data.gov.tw')))
  assert.ok(!/591|信義房屋|永慶|好房|樂屋/.test(JSON.stringify(index)), 'no listing site is a source')
})

test('every tile file is under 200 KB and all of them together under 60 MB', () => {
  let total = 0
  let largest = 0
  for (const name of names) {
    const size = statSync(new URL(name, dir)).size
    total += size
    largest = Math.max(largest, size)
    assert.ok(size < 200000, `${name} is ${size} bytes`)
  }
  assert.ok(total < 60e6, `${total} bytes`)
  assert.ok(names.length > 100, `${names.length} files`)
  console.log(`# ${names.length} files, largest ${largest} bytes, total ${(total / 1e6).toFixed(1)} MB`)
})

test('the index lists exactly the files there are, and each one has the deals it should', () => {
  const listed = Object.entries(index.tiles).flatMap(([z, list]) => list.map((t) => `${z}-${t}.json`)).sort()
  assert.deepEqual(listed, [...names].sort())
  let rows = 0
  for (const name of names) {
    const file = JSON.parse(readFileSync(new URL(name, dir), 'utf8'))
    const [z, x, y] = name.replace('.json', '').split('-').map(Number)
    assert.deepEqual([file.v, file.z, file.x, file.y], [1, z, x, y], name)
    assert.deepEqual(file.cols, COLS)
    assert.ok(z >= DEALS_ZOOM && z <= DEALS_MAX_ZOOM)
    const deals = parseTile(file)
    assert.equal(deals.length, file.rows.length, `${name} has a row that cannot be read`)
    for (const d of deals) assert.deepEqual(tileOf(d.lat, d.lon, z), { z, x, y }, `${name} ${d.lat} ${d.lon}`)
    rows += deals.length
  }
  assert.equal(rows, index.counts.sale + index.counts.rent)
})

test('the deals are what the page promises: homes, in the four cities, with dates up to the data\'s end, no price of nothing', () => {
  const first = JSON.parse(readFileSync(new URL(names[0], dir), 'utf8'))
  const seen = { sale: 0, rent: 0 }
  const months = new Set()
  for (const name of names.filter((_, i) => i % 7 === 0)) {
    for (const d of parseTile(JSON.parse(readFileSync(new URL(name, dir), 'utf8')))) {
      seen[d.kind]++
      months.add(d.date)
      assert.ok(d.date <= `${index.asof}` || d.date.slice(0, 7) <= index.asof, `${d.date} is after the data ends`)
      assert.ok(d.price > 0 && d.unit > 0 && d.ping >= 3)
      assert.ok(d.kind === 'sale' ? d.unit < 800 && d.price >= 50 : d.price >= 1000 && d.unit >= 50)
      assert.ok(d.lat > 24 && d.lat < 25.4 && d.lon > 120.4 && d.lon < 122, 'inside the four cities')
    }
  }
  assert.ok(seen.sale > 0 && seen.rent > 0)
  assert.ok(months.size >= 12, `${months.size} months`)
  assert.equal(first.z, tileOf(first.rows[0][0], first.rows[0][1], first.z).z)
})
