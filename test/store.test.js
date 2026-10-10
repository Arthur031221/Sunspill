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

test('edits made live leave no undo step, and a commit keeps one for the whole gesture, however long it paused', async () => {
  const store = make()
  const before = store.scene
  const x0 = before.items[0].x
  for (let i = 0; i < 40; i++) store.update((d) => { d.items[0].x += 0.01 }, { history: false })
  assert.equal(store.canUndo(), false, 'nothing is kept while the gesture goes on')
  assert.ok(Math.abs(store.scene.items[0].x - x0 - 0.4) < 1e-9, 'but the scene follows it')
  // a pause longer than the 700 ms that joins edits with one key makes no difference
  await new Promise((resolve) => setTimeout(resolve, 760))
  store.update((d) => { d.items[0].x += 0.01 }, { history: false })
  assert.equal(store.commit(before), true)
  assert.equal(store.canUndo(), true)
  assert.equal(store.undo(), true)
  assert.equal(store.scene, before, 'one step goes back to where the gesture began')
  assert.equal(store.undo(), false)
})

test('a commit of a gesture that changed nothing, or came back to where it began, keeps no step', () => {
  const store = make()
  const before = store.scene
  assert.equal(store.commit(before), false)
  store.update((d) => { d.items[0].x += 0.3 }, { history: false })
  store.update((d) => { d.items[0].x -= 0.3 }, { history: false })
  assert.equal(store.commit(before), false)
  assert.equal(store.canUndo(), false)
  assert.equal(store.commit(null), false)
})

test('a commit counts as an edit, tells the page once and drops the redo trail', () => {
  const store = make()
  let edits = 0
  store.onEdit = () => { edits++ }
  nudge(store, 0.1)
  store.undo()
  assert.equal(store.canRedo(), true)
  const before = store.scene
  edits = 0
  let seen = 0
  store.subscribe((_, what) => { if (what === 'scene') seen++ })
  store.update((d) => { d.items[0].x += 0.2 }, { history: false })
  assert.equal(edits, 0, 'a live edit is not an edit yet')
  assert.equal(store.canRedo(), true, 'and does not drop what can be redone yet')
  seen = 0
  store.commit(before)
  assert.equal(edits, 1)
  assert.equal(seen, 1, 'listeners hear it, so the room is saved after the last live edit')
  assert.equal(store.canRedo(), false)
})
