import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snapWindow, snapItem } from '../src/core/snap.js'
import { normalizeScene } from '../src/core/room.js'

const scene = (extra = {}) => normalizeScene({
  room: { w: 4, d: 5, h: 2.6, wall: 0.15 },
  windows: [{ wall: 'top', pos: 0.5, w: 1.2, h: 1.2, sill: 0.9 }, { wall: 'top', pos: 2.6, w: 1, h: 1.2, sill: 0.9 }],
  doors: [{ wall: 'bottom', pos: 0.4, w: 0.9 }],
  items: [{ kind: 'bed', x: 1, y: 1, w: 1.5, d: 2 }, { kind: 'desk', x: 2.5, y: 3, w: 1.2, d: 0.6 }],
  ...extra,
})

test('a window dragged near a wall end, the middle or a neighbour comes to rest there', () => {
  const s = scene()
  assert.deepEqual(snapWindow(s, 0, 0.06), { pos: 0, guide: 'start' })
  assert.deepEqual(snapWindow(s, 1, 2.93), { pos: 3, guide: 'end' })
  assert.equal(snapWindow(s, 0, 1.45).guide, 'window', 'flush against the next window')
  assert.ok(Math.abs(snapWindow(s, 0, 1.4).pos - 1.4) < 1e-9 || snapWindow(s, 0, 1.4).guide === 'window')
  const alone = scene({ windows: [{ wall: 'top', pos: 1, w: 1, h: 1.2, sill: 0.9 }] })
  assert.deepEqual(snapWindow(alone, 0, 1.55), { pos: 1.5, guide: 'centre' })
  assert.deepEqual(snapWindow(alone, 0, 0.77), { pos: 0.75, guide: null }, 'otherwise the 5 cm grid')
  assert.equal(snapWindow(alone, 0, -3).pos, 0)
  assert.equal(snapWindow(alone, 0, 99).pos, 3)
})

test('a window snaps beside a door on the same wall only', () => {
  const s = scene({ windows: [{ wall: 'bottom', pos: 2.5, w: 1, h: 1.2, sill: 0.9 }] })
  assert.equal(snapWindow(s, 0, 1.35).guide, 'door')
  assert.ok(Math.abs(snapWindow(s, 0, 1.35).pos - 1.3) < 1e-9)
  const other = scene({ windows: [{ wall: 'top', pos: 2.5, w: 1, h: 1.2, sill: 0.9 }] })
  assert.notEqual(snapWindow(other, 0, 1.35).guide, 'door')
})

test('furniture snaps to walls, the middle of the room and its neighbours, and says what it snapped to', () => {
  const s = scene()
  // the bed dragged to within a few centimetres of the left wall
  const a = snapItem(s, 0, 0.06, 1.3)
  assert.equal(a.x, 0)
  assert.deepEqual(a.guides.filter((g) => g.axis === 'x'), [{ axis: 'x', at: 0 }])
  // against the desk's left edge (x = 2.5): the bed's right side meets it
  const b = snapItem(s, 0, 0.95, 1)
  assert.ok(Math.abs(b.x + 1.5 - 2.5) < 1e-9, `${b.x}`)
  assert.deepEqual(b.guides.filter((g) => g.axis === 'x'), [{ axis: 'x', at: 2.5 }])
  // far from everything: only the grid
  const c = snapItem(s, 0, 0.52, 1.2)
  assert.deepEqual(c.guides, [])
  assert.ok(Math.abs(c.x - 0.5) < 1e-9 && Math.abs(c.y - 1.2) < 1e-9)
})

test('a turned piece snaps by the edges of its turned box', () => {
  const s = scene({ items: [{ kind: 'bed', x: 1, y: 1, w: 1.5, d: 2, rot: 90 }] })
  // turned a quarter, the bed is 2 wide and 1.5 deep: its left edge touches the wall when the centre is 1 from it
  const r = snapItem(s, 0, 0.3, 1.7)
  const cx = r.x + 0.75
  assert.ok(Math.abs(cx - 1) < 1e-9, `centre ${cx}`)
  assert.equal(r.guides.some((g) => g.axis === 'x' && g.at === 0), true)
})
