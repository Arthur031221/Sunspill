import { test } from 'node:test'
import assert from 'node:assert/strict'
import { footprintSides, sideScene, SECTORS, ROOM, WINDOW } from '../src/core/sides.js'
import { roomToLocal, wallFrame } from '../src/core/room.js'
import { toLocal } from '../src/core/geo.js'

const RAD = Math.PI / 180
/** A rectangle of w east by d north, turned clockwise by `turn` degrees about (cx, cy), counter clockwise ring. */
const box = (cx, cy, w, d, turn = 0) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
  const x = (a * w) / 2
  const y = (b * d) / 2
  const t = turn * RAD
  return [cx + x * Math.cos(t) + y * Math.sin(t), cy - x * Math.sin(t) + y * Math.cos(t)]
})
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`)

test('a rectangle has four sides, one for each way it faces, whichever way the ring runs', () => {
  const ring = box(0, 0, 10, 20)
  for (const r of [ring, ring.slice().reverse()]) {
    const sides = footprintSides(r)
    assert.deepEqual(sides.map((s) => s.id), ['N', 'E', 'S', 'W'])
    assert.deepEqual(sides.map((s) => Math.round(s.bearing)), [0, 90, 180, 270])
    assert.deepEqual(sides.map((s) => Math.round(s.length)), [10, 20, 10, 20])
    // the point of a side is the middle of its wall
    const west = sides.find((s) => s.id === 'W')
    close(west.point[0], -5)
    close(west.point[1], 0)
    const north = sides.find((s) => s.id === 'N')
    close(north.point[0], 0)
    close(north.point[1], 10)
  }
  assert.equal(SECTORS.length, 8)
})

test('a building turned off the compass faces the sector nearest each wall and keeps the wall own bearing', () => {
  const sides = footprintSides(box(0, 0, 12, 20, 30))
  assert.deepEqual(sides.map((s) => s.id), ['NE', 'SE', 'SW', 'NW'])
  assert.deepEqual(sides.map((s) => Math.round(s.bearing)), [30, 120, 210, 300])
  // the window of a side is put on the wall itself, so it faces the wall's own bearing and not the sector's
  const east = sides.find((s) => s.id === 'SE')
  close(east.bearing, 120, 1e-6)
})

test('a wall shorter than three metres is not a side, and walls that face the same sector add up', () => {
  assert.deepEqual(footprintSides(box(0, 0, 2.5, 12)).map((s) => s.id), ['E', 'W'])
  // an L: the two walls that look west are 5 and 10 metres, and are one side of 15
  const ell = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]]
  const sides = footprintSides(ell)
  const west = sides.find((s) => s.id === 'W')
  close(west.length, 10)
  assert.deepEqual(sides.map((s) => s.id), ['N', 'E', 'S', 'W'])
  // the window goes on the longest wall of the side
  close(west.point[0], 0)
  close(west.point[1], 5)
  const north = sides.find((s) => s.id === 'N')
  close(north.length, 10)
  const east = sides.find((s) => s.id === 'E')
  close(east.length, 10)
})

test('a wall shared with a neighbour at least as tall as the window is no side, a lower or a distant one is', () => {
  const ring = box(0, 0, 10, 20)
  const east = (gap, h) => ({ ring: box(10 + gap, 0, 10, 20), h, base: 0 })
  const ids = (neighbours, top) => footprintSides(ring, { neighbours, top }).map((s) => s.id)
  // touching, and tall: a party wall
  assert.deepEqual(ids([east(0, 20)], 9), ['N', 'S', 'W'])
  // a gap of half a metre is as good as touching
  assert.deepEqual(ids([east(0.4, 20)], 9), ['N', 'S', 'W'])
  // touching but lower than the window: the wall above it is open
  assert.deepEqual(ids([east(0, 6)], 9), ['N', 'E', 'S', 'W'])
  // an alley of three metres is not a party wall
  assert.deepEqual(ids([east(3, 20)], 9), ['N', 'E', 'S', 'W'])
  // a neighbour that covers only a small part of the wall does not make it one
  const corner = { ring: box(10, 14, 10, 10), h: 20, base: 0 }
  assert.deepEqual(ids([corner], 9), ['N', 'E', 'S', 'W'])
  // with no neighbours given nothing is shared
  assert.deepEqual(ids([], 9), ['N', 'E', 'S', 'W'])
})

test('the scene of a side puts the middle of the window on the wall, facing out, on the floor asked for', () => {
  const origin = { lat: 25.0284704, lon: 121.5439379 }
  const ring = box(0, 0, 10, 20, 20)
  const sides = footprintSides(ring)
  const neighbour = { ring: box(40, 12, 12, 12), h: 30, base: 0, est: false, id: 7, name: 'A' }
  for (const side of sides) {
    const scene = sideScene({ origin, side, floor: 5, storey: 3, neighbours: [neighbour], zone: 'Asia/Taipei', name: 'test' })
    assert.equal(scene.floor.n, 5)
    assert.equal(scene.facing, Math.round(side.bearing * 10) / 10)
    assert.equal(scene.windows.length, 1)
    const win = scene.windows[0]
    assert.deepEqual([win.wall, win.w, win.h, win.sill], ['top', WINDOW.w, WINDOW.h, WINDOW.sill])
    assert.equal(scene.room.w, ROOM.w)
    // the outer face of the window, in metres east and north of the room, lies on the wall's middle
    const f = wallFrame(scene.room, win.wall)
    const along = win.pos + win.w / 2
    const mid = roomToLocal(scene, f.o[0] + f.t[0] * along + f.n[0] * scene.room.wall, f.o[1] + f.t[1] * along + f.n[1] * scene.room.wall)
    // the room sits where the place says, and the wall's middle is the side's point seen from there
    const [ce, cn] = toLocal(origin, scene.place.lat, scene.place.lon)
    close(ce + mid[0], side.point[0], 0.02)
    close(cn + mid[1], side.point[1], 0.02)
    // the neighbour keeps its place on the ground
    const o = scene.obstacles.find((x) => x.id === 7)
    close(o.ring[0][0] + ce, neighbour.ring[0][0], 0.02)
    close(o.ring[0][1] + cn, neighbour.ring[0][1], 0.02)
    assert.equal(o.on, true)
    assert.equal(scene.place.zone, 'Asia/Taipei')
  }
})

test('the building itself never shades its own side, but can be put in as the room own building', () => {
  const origin = { lat: 25.03, lon: 121.54 }
  const ring = box(0, 0, 10, 20)
  const side = footprintSides(ring)[0]
  const scene = sideScene({ origin, side, floor: 2, neighbours: [] })
  assert.equal(scene.obstacles.length, 0)
  const withOwn = sideScene({ origin, side, floor: 2, neighbours: [], own: { ring, h: 20, base: 0 } })
  assert.equal(withOwn.obstacles.length, 1)
  assert.deepEqual([withOwn.obstacles[0].own, withOwn.obstacles[0].on], [true, false])
})

test('only the neighbours that can shade the window are kept, the highest looking ones when there are too many', () => {
  const origin = { lat: 25.03, lon: 121.54 }
  const side = footprintSides(box(0, 0, 10, 20)).find((s) => s.id === 'W')
  const many = Array.from({ length: 120 }, (_, i) => ({ ring: box(-30 - i, (i % 9) * 15, 8, 8), h: 10 + (i % 30), base: 0, id: i }))
  const scene = sideScene({ origin, side, floor: 1, neighbours: many })
  assert.ok(scene.obstacles.length <= 80)
  // a low building, under the sill of a window on the 20th floor, is of no use
  const high = sideScene({ origin, side, floor: 20, neighbours: [{ ring: box(-30, 0, 8, 8), h: 20, base: 0, id: 1 }, { ring: box(-60, 0, 8, 8), h: 90, base: 0, id: 2 }] })
  assert.deepEqual(high.obstacles.map((o) => o.id), [2])
})
