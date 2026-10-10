import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeQuick, decodeQuick, QUICK_PREFIX } from '../src/core/sharelink.js'
import { encodeScene, decodeScene } from '../src/core/codec.js'
import { defaultScene } from '../src/core/room.js'

// the 8 floor apartment block of the test fixture, as the quick check holds it: metres east and north of the place searched
const RING = [[-8.4, 3.1], [6.2, 3.1], [6.2, 14.7], [-8.4, 14.7]]
const link = (extra = {}) => ({ lat: 25.0284704, lon: 121.5439379, name: '台北市大安區復興南路二段151巷5號', pin: true, floor: 5, sides: ['W', 'N'], building: { id: 587073792, ring: RING, h: 26.4, levels: 8 }, ...extra })

test('a quick check link carries the place, the building, the floor and the sides, and opens as the same answer', () => {
  const hash = encodeQuick(link())
  assert.ok(hash.startsWith(QUICK_PREFIX))
  assert.ok(hash.length < 400, `${hash.length} characters`)
  const back = decodeQuick(`#${hash}`)
  assert.deepEqual(back.sides, ['N', 'W'], 'the sides come back in compass order')
  assert.deepEqual([back.lat, back.lon, back.name, back.pin, back.floor], [25.02847, 121.54394, '台北市大安區復興南路二段151巷5號', true, 5])
  assert.equal(back.building.id, 587073792)
  assert.equal(back.building.h, 26.4)
  assert.equal(back.building.levels, 8)
  assert.deepEqual(back.building.ring, RING, 'the outline to a tenth of a metre')
})

test('a square that stands for a building with no outline has no OpenStreetMap number and keeps its corners', () => {
  const square = [[-5, -5], [5, -5], [5, 5], [-5, 5]]
  const back = decodeQuick(encodeQuick(link({ pin: false, sides: [], building: { id: -1, ring: square, h: 12, levels: 0 } })))
  assert.equal(back.pin, false)
  assert.deepEqual(back.sides, [])
  assert.equal(back.building.id, 0)
  assert.deepEqual(back.building.ring, square)
})

test('a building with many corners goes by its number alone, so the link stays short', () => {
  const round = Array.from({ length: 90 }, (_, i) => [30 * Math.cos((i / 90) * 2 * Math.PI), 30 * Math.sin((i / 90) * 2 * Math.PI)])
  const hash = encodeQuick(link({ building: { id: 42, ring: round, h: 30, levels: 0 } }))
  const back = decodeQuick(hash)
  assert.equal(back.building.id, 42)
  assert.equal(back.building.ring, null)
  assert.ok(hash.length < 300)
  // with no number to go by, the corners are all it has
  const lone = decodeQuick(encodeQuick(link({ building: { id: 0, ring: round, h: 30, levels: 0 } })))
  assert.equal(lone.building.ring.length, 90)
})

test('the room link and the quick link are two formats that never read each other', () => {
  const room = encodeScene(defaultScene())
  const quick = encodeQuick(link())
  assert.equal(decodeScene(`#${quick}`), null, 'a room reader gets nothing from a quick link')
  assert.equal(decodeQuick(`#${room}`), null, 'a quick reader gets nothing from a room link')
  assert.equal(decodeQuick('#r1=' + quick.slice(QUICK_PREFIX.length)), null)
  assert.equal(decodeScene('#r2=' + quick.slice(QUICK_PREFIX.length)), null)
  assert.ok(decodeScene(`#${room}`), 'and the room link still opens')
  assert.ok(!room.startsWith(QUICK_PREFIX) && !quick.startsWith('r1=') && !quick.startsWith('r2='))
})

test('damaged, foreign or oversized links decode to null instead of throwing', () => {
  const good = encodeQuick(link())
  const body = good.slice(QUICK_PREFIX.length)
  const b64 = (value) => QUICK_PREFIX + btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const bad = ['', '#', '#x=1', '#q1=', '#q1=!!!', '#q1=' + btoa('not json'), good.slice(0, -9), QUICK_PREFIX + body + body, QUICK_PREFIX + 'A'.repeat(5000), undefined, null, 42, {},
    b64([1, 2]), b64({}), b64('x'), b64(null)]
  for (const text of bad) assert.equal(decodeQuick(text), null, String(text).slice(0, 24))
})

test('a hand made link with hostile numbers is refused, not trusted', () => {
  const b64 = (value) => QUICK_PREFIX + btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const pack = (over = {}) => {
    const a = [25.02847, 121.54394, 'x', 1, 5, 3, 7, 264, 8, -84, 31, 146, 0, 0, 116, -146, 0]
    for (const [i, v] of Object.entries(over)) a[i] = v
    return b64(a)
  }
  assert.ok(decodeQuick(pack()), 'the pattern itself is a good link')
  for (const over of [{ 0: 91 }, { 0: 'a' }, { 1: 181 }, { 4: 0 }, { 4: 100 }, { 4: 2.5 }, { 5: 256 }, { 5: -1 }, { 6: -3 }, { 6: 1.5 }, { 7: 6001 }, { 8: 201 }, { 2: 7 }, { 3: 2 }, { 9: 1e9 }, { 9: 'z' }]) {
    assert.equal(decodeQuick(pack(over)), null, JSON.stringify(over))
  }
  // a ring needs whole corners, and at least three of them
  assert.equal(decodeQuick(b64([25.02847, 121.54394, 'x', 1, 5, 3, 7, 264, 8, -84, 31, 146, 0, 0])), null, 'an odd number of values')
  assert.equal(decodeQuick(b64([25.02847, 121.54394, 'x', 1, 5, 3, 7, 264, 8, -84, 31, 146, 0])), null, 'two corners')
  // and a building with a number alone is fine
  assert.equal(decodeQuick(b64([25.02847, 121.54394, 'x', 1, 5, 3, 7, 264, 8])).building.ring, null)
})

test('the place name is cut to 60 characters, the floor kept to a whole number from 1 to 99, and the place to five decimals', () => {
  const back = decodeQuick(encodeQuick(link({ name: '路'.repeat(100), floor: 7.6, lat: 25.0284749, lon: 121.5439351 })))
  assert.equal(back.name.length, 60)
  assert.equal(back.floor, 8)
  assert.equal(back.lat, 25.02847)
  assert.equal(back.lon, 121.54394)
  assert.equal(decodeQuick(encodeQuick(link({ floor: 0 }))).floor, 1)
  assert.equal(decodeQuick(encodeQuick(link({ floor: 400 }))).floor, 99)
})

test('an unknown side is left out and a repeated one counts once', () => {
  const back = decodeQuick(encodeQuick(link({ sides: ['W', 'W', 'Q', 'SE', 'up'] })))
  assert.deepEqual(back.sides, ['SE', 'W'])
})

test('a link with no building number and no outline cannot be written', () => {
  assert.throws(() => encodeQuick(link({ building: { id: 0, ring: null, h: 10, levels: 0 } })), /building/)
  assert.throws(() => encodeQuick(link({ building: null })), /building/)
  assert.throws(() => encodeQuick(link({ lat: NaN })), /place/)
})
