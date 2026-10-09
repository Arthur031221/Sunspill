import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeScene, decodeScene, blurPlace } from '../src/core/codec.js'
import { defaultScene, normalizeScene } from '../src/core/room.js'
import { CITIES, searchCities, cityPlace } from '../src/core/cities.js'
import { isZone, zoneOffset } from '../src/core/solar.js'

test('a scene survives the link round trip, including a non ASCII place name', () => {
  const scene = normalizeScene({ ...defaultScene(), place: { name: '台北 Café', lat: 25.033, lon: 121.565, zone: 'Asia/Taipei' }, windows: [{ wall: 'right', pos: 1, w: 1.2, h: 1.1, sill: 0.8, eave: { depth: 0.6, gap: 0.1, ext: 0.5 }, across: { height: 24, distance: 12 } }] })
  const hash = encodeScene(scene)
  assert.ok(hash.length < 700, `${hash.length} characters`)
  assert.deepEqual(decodeScene('#' + hash), scene)
})

test('damaged, foreign or oversized links decode to null instead of throwing', () => {
  for (const bad of ['', '#', '#x=1', '#r1=', '#r1=!!!', '#r1=' + btoa('not json'), '#r1=' + btoa('[1,2]').replace(/=/g, ''), '#r1=' + 'A'.repeat(7000), undefined, null]) {
    assert.equal(decodeScene(bad), null, String(bad).slice(0, 20))
  }
})

test('a hand made link with hostile numbers is clamped, not trusted', () => {
  const evil = [1e9, -4, 'x', 1e9, 99999, ['<img>', 500, 700, 'Not/Real'], 13, 40, -5, [[9, -1, 1e9, 0, 0, 1e9, 1e9, 1e9, [-1, 0]]], [[99, 1, 1, 1, 1, 1]]]
  const hash = 'r1=' + btoa(JSON.stringify(evil)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const scene = decodeScene(hash)
  assert.ok(scene.room.w <= 20 && scene.room.d >= 1.5 && scene.room.wall <= 0.6)
  assert.ok(scene.place.lat <= 80 && scene.place.lon <= 180 && scene.place.zone === 'Asia/Taipei')
  assert.ok(scene.date.month === 12 && scene.date.day === 31 && scene.minutes === 0)
  assert.equal(scene.items.length, 0)
})

test('blurPlace keeps the sun roughly right and drops the name', () => {
  const blurred = blurPlace({ name: 'Taipei', lat: 25.033, lon: 121.565, zone: 'Asia/Taipei' })
  assert.deepEqual(blurred, { name: '', lat: 25, lon: 122, zone: 'Asia/Taipei' })
})

test('every bundled city has a real zone whose clock is within a few hours of its longitude', () => {
  assert.ok(CITIES.length >= 120)
  const names = new Set()
  for (const c of CITIES) {
    assert.ok(!names.has(c.name), `duplicate ${c.name}`)
    names.add(c.name)
    assert.ok(isZone(c.zone), `${c.name}: ${c.zone}`)
    assert.ok(Math.abs(c.lat) < 80 && Math.abs(c.lon) <= 180)
    const hours = zoneOffset(c.zone, Date.UTC(2026, 0, 15)) / 60
    const solar = c.lon / 15
    assert.ok(Math.abs(hours - solar) < 3.2, `${c.name}: zone ${hours} h, longitude ${solar.toFixed(1)} h`)
    assert.ok(/^[A-Z]{2}$/.test(c.country))
  }
})

test('city search finds names, spellings in other scripts and ignores accents and case', () => {
  assert.equal(searchCities('tai')[0].name, 'Taipei')
  assert.equal(searchCities('台北')[0].name, 'Taipei')
  assert.equal(searchCities('東京')[0].name, 'Tokyo')
  assert.equal(searchCities('zurich')[0].name, 'Zurich')
  assert.equal(searchCities('SAO PAULO')[0].name, 'Sao Paulo')
  assert.equal(searchCities('sao paulo').length >= 1, true)
  assert.deepEqual(searchCities('qqqqqq'), [])
  assert.deepEqual(searchCities('   '), [])
  assert.deepEqual(Object.keys(cityPlace(CITIES[0])), ['name', 'lat', 'lon', 'zone'])
})
