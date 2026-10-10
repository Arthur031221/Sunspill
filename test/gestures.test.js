import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pinchTracker, TURN_START } from '../src/core/gestures.js'

// two fingers 120 px apart, as the map sees them: the distance between them and the angle of the line from the first to the second
const run = (steps, { dist = 120, angle = 90 } = {}) => {
  const tracker = pinchTracker(dist, angle)
  let last = null
  for (const [d, a] of steps) last = tracker.move(d, a)
  return last
}
const ramp = (from, to, n) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n)

test('the room follows the fingers only after they have turned past 8 degrees', () => {
  assert.equal(TURN_START, 8)
  const small = run(ramp(90, 97.9, 8).map((a) => [120, a]))
  assert.equal(small.engaged, false)
  assert.ok(Math.abs(small.turn - 7.9) < 1e-9)
  const past = run(ramp(90, 98.2, 8).map((a) => [120, a]))
  assert.equal(past.engaged, true)
})

test('once it follows, the turn is the whole angle between the fingers, with no step to make up', () => {
  const r = run(ramp(90, 120, 20).map((a) => [120, a]))
  assert.equal(r.engaged, true)
  assert.ok(Math.abs(r.turn - 30) < 1e-9, `${r.turn}`)
  const back = run([...ramp(90, 120, 20), ...ramp(120, 60, 20)].map((a) => [120, a]))
  assert.ok(Math.abs(back.turn + 30) < 1e-9, 'and the other way too')
})

test('a pinch that twists a little is a zoom and turns nothing, even when the twist passes 8 degrees', () => {
  // 90 px to 330 px while the line turns 12 degrees: the fingers moved 240 px apart and 19 px round each other
  const zoomIn = run(ramp(0, 1, 14).map((k) => [90 + 240 * k, 90 + 12 * k]), { dist: 90 })
  assert.equal(zoomIn.engaged, false)
  assert.ok(Math.abs(zoomIn.turn - 12) < 1e-9)
  const zoomOut = run(ramp(0, 1, 14).map((k) => [330 - 240 * k, 90 - 15 * k]), { dist: 330 })
  assert.equal(zoomOut.engaged, false)
})

test('a turn that is the main motion follows, and one that falls behind the zoom lets go and takes hold again', () => {
  const tracker = pinchTracker(120, 90)
  assert.equal(tracker.move(120, 100).engaged, true, '10 degrees round, nothing apart')
  assert.equal(tracker.move(300, 101).engaged, false, 'now the fingers spread far more than they turned')
  assert.ok(Math.abs(tracker.move(300, 101).turn - 11) < 1e-9, 'the angle is still counted')
  assert.equal(tracker.move(300, 140).engaged, false, 'a turn that only just keeps up with the spread does not take hold yet')
  assert.equal(tracker.move(300, 190).engaged, true, 'and one that is the main motion does')
})

test('the angle is counted across the half turn where it jumps from 180 to -180', () => {
  const r = run([175, 179, -178, -170, -160].map((a) => [120, a]), { angle: 170 })
  assert.equal(r.engaged, true)
  assert.ok(Math.abs(r.turn - 30) < 1e-9, `${r.turn}`)
})

test('fingers closer than 24 px say nothing about a turn', () => {
  const r = run(ramp(0, 90, 10).map((a) => [20, a]), { dist: 20, angle: 0 })
  assert.equal(r.engaged, false)
  assert.ok(Math.abs(r.turn - 90) < 1e-9)
})
