import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { twd97ToWgs84 } from '../scripts/lib/twd97.mjs'

const reference = JSON.parse(readFileSync(new URL('./fixtures/twd97-reference.json', import.meta.url), 'utf8'))

test('points on the TWD97 grid come out where pyproj puts them, to a millimetre, across the island', () => {
  assert.equal(reference.rows.length, 128)
  let worst = 0
  for (const [x, y, lat, lon] of reference.rows) {
    const got = twd97ToWgs84(x, y)
    worst = Math.max(worst, Math.abs(got.lat - lat), Math.abs(got.lon - lon))
  }
  // a millimetre is 9e-9 degrees
  assert.ok(worst < 9e-9, `${worst} degrees`)
})

test('the middle line of the grid is 121 degrees east, and 250,000 metres east of the origin is on it', () => {
  assert.ok(Math.abs(twd97ToWgs84(250000, 2600000).lon - 121) < 1e-12)
  assert.ok(Math.abs(twd97ToWgs84(250000, 0).lat) < 1e-12)
})

test('Taichung publishes its points in both TWD97 and WGS84, and the two agree with the conversion to a millimetre', () => {
  const lines = readFileSync(new URL('./fixtures/deals/points-b.csv', import.meta.url), 'utf8').trim().split('\n').slice(1)
  assert.ok(lines.length >= 9)
  for (const line of lines) {
    const f = line.split(',')
    const got = twd97ToWgs84(Number(f[9]), Number(f[10]))
    assert.ok(Math.abs(got.lat - Number(f[12])) < 2e-8 && Math.abs(got.lon - Number(f[11])) < 2e-8, line)
  }
})
