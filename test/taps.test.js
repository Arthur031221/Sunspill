import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTapper } from '../src/app/taps.js'

function harness() {
  let t = 0
  const seen = []
  const tapper = createTapper({
    onTap: (x, y) => seen.push(['tap', x, y, t]),
    onDouble: (x, y) => seen.push(['double', x, y, t]),
    now: () => t,
  })
  return { tapper, seen, advance: (ms) => { t += ms } }
}

test('a tap acts at once', () => {
  const h = harness()
  h.tapper.tap(10, 20)
  assert.deepEqual(h.seen, [['tap', 10, 20, 0]])
})

test('a second tap close in time and place is a double tap, and does not act as a tap', () => {
  const h = harness()
  h.tapper.tap(100, 100)
  h.advance(120)
  h.tapper.tap(106, 98)
  assert.deepEqual(h.seen, [['tap', 100, 100, 0], ['double', 106, 98, 120]])
  // a third tap straight after starts again, and is not a second double tap
  h.advance(100)
  h.tapper.tap(106, 98)
  assert.deepEqual(h.seen.map((s) => s[0]), ['tap', 'double', 'tap'])
})

test('two taps more than 250 ms apart, or more than 28 pixels apart, are two taps', () => {
  const slow = harness()
  slow.tapper.tap(10, 10)
  slow.advance(251)
  slow.tapper.tap(10, 10)
  assert.deepEqual(slow.seen.map((s) => s[0]), ['tap', 'tap'])
  const edge = harness()
  edge.tapper.tap(10, 10)
  edge.advance(250)
  edge.tapper.tap(10, 10)
  assert.deepEqual(edge.seen.map((s) => s[0]), ['tap', 'double'])
  const far = harness()
  far.tapper.tap(10, 10)
  far.advance(100)
  far.tapper.tap(200, 10)
  assert.deepEqual(far.seen.map((s) => s[0]), ['tap', 'tap'])
})

test('cancel forgets the tap that was just made', () => {
  const h = harness()
  h.tapper.tap(10, 10)
  h.tapper.cancel()
  h.advance(50)
  h.tapper.tap(10, 10)
  assert.deepEqual(h.seen.map((s) => s[0]), ['tap', 'tap'])
})
