import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../src/app/store.js'
import { defaultScene } from '../src/core/room.js'

const make = () => createStore(defaultScene(), { tab: 'room' })
const nudge = (store, by, key) => store.update((d) => { d.items[0].x += by }, key ? { key } : {})

test('an edit changes the scene once, an edit that changes nothing is not recorded', () => {
  const store = make()
  assert.equal(nudge(store, 0.1), true)
  assert.equal(store.canUndo(), true)
  const before = store.scene
  assert.equal(store.update((d) => { d.items[0].x = before.items[0].x }), false)
  assert.equal(store.scene, before, 'the same scene object stays')
})

test('edits that share a key within 700 ms are one undo step, others are not', () => {
  const store = make()
  const x0 = store.scene.items[0].x
  for (let i = 0; i < 5; i++) nudge(store, 0.05, 'drag')
  assert.equal(store.undo(), true)
  assert.equal(store.scene.items[0].x, x0, 'five moves of one drag come back in one step')
  assert.equal(store.undo(), false)
  nudge(store, 0.05, 'a')
  nudge(store, 0.05, 'b')
  assert.equal(store.undo(), true)
  assert.equal(store.undo(), true)
  assert.equal(store.undo(), false, 'two different keys are two steps')
})

test('a new edit after an undo drops the redo trail, and redo walks forward again', () => {
  const store = make()
  nudge(store, 0.1)
  nudge(store, 0.1)
  const second = store.scene.items[0].x
  store.undo()
  assert.equal(store.canRedo(), true)
  store.redo()
  assert.equal(store.scene.items[0].x, second)
  store.undo()
  nudge(store, 0.3)
  assert.equal(store.canRedo(), false)
  assert.equal(store.redo(), false)
})

test('the undo trail keeps the last 80 steps, whether they came from edits, replacements or redo', () => {
  const store = make()
  for (let i = 0; i < 120; i++) nudge(store, i % 2 ? 0.01 : -0.01)
  let steps = 0
  while (store.undo()) steps++
  assert.equal(steps, 80)
  const other = make()
  for (let i = 0; i < 120; i++) other.replace({ ...defaultScene(), minutes: 400 + i })
  steps = 0
  while (other.undo()) steps++
  assert.equal(steps, 80, 'replace is capped as well')
  const redo = make()
  for (let i = 0; i < 80; i++) nudge(redo, i % 2 ? 0.01 : -0.01)
  redo.undo()
  redo.replace(defaultScene())
  redo.undo()
  assert.ok(redo.canRedo())
  redo.redo()
  steps = 0
  while (redo.undo()) steps++
  assert.ok(steps <= 80)
})

test('time and date moves are kept out of the trail when asked, and listeners hear about every change', () => {
  const store = make()
  const heard = []
  const off = store.subscribe((state, what) => heard.push(what))
  store.update((d) => { d.minutes = 700 }, { history: false })
  assert.equal(store.canUndo(), false)
  store.setUi({ tab: 'place' })
  nudge(store, 0.2)
  off()
  nudge(store, 0.2, 'later')
  assert.deepEqual(heard, ['scene', 'ui', 'scene'])
  let edits = 0
  store.onEdit = () => edits++
  nudge(store, 0.2, 'once')
  store.update((d) => { d.minutes = 800 }, { history: false })
  assert.equal(edits, 1, 'onEdit is told of edits and not of clock moves')
})

test('a scene that is out of range is clamped on the way in', () => {
  const store = make()
  store.update((d) => { d.room.w = 500; d.facing = 725 })
  assert.equal(store.scene.room.w, 20)
  assert.equal(store.scene.facing, 5)
})
