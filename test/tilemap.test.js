import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planTiles, TILE, tileKey } from '../src/core/tilemap.js'
import { lonLatToTile } from '../src/core/geo.js'

const view = { lat: 25.0284704, lon: 121.5439379, width: 390, height: 600 }
const centre = (zoom) => {
  const p = lonLatToTile(view.lon, view.lat, zoom)
  return [p.x * TILE, p.y * TILE]
}
/** The plan for a camera at `zoom`, with a set of tile keys that are loaded. */
const plan = (zoom, have = new Set(), extra = {}) => {
  const [cx, cy] = centre(zoom)
  return planTiles({ zoom, cx, cy, width: view.width, height: view.height, ready: (z, x, y) => have.has(tileKey(z, x, y)), ...extra })
}
/** Every tile that a plan wants, as a set of keys. */
const wantedKeys = (p) => new Set(p.wanted.map((w) => tileKey(w.z, w.x, w.y)))

test('with every tile loaded each one is drawn whole, and nothing is blank', () => {
  const p0 = plan(17)
  assert.ok(p0.wanted.length >= 6 && p0.wanted.length <= 12, `${p0.wanted.length} tiles`)
  const p = plan(17, wantedKeys(p0))
  assert.equal(p.blank, 0)
  assert.equal(p.z, 17)
  assert.equal(p.ops.length, p0.wanted.length)
  for (const op of p.ops) {
    assert.deepEqual([op.sx, op.sy, op.sw, op.sh], [0, 0, TILE, TILE])
    assert.equal(op.z, 17)
  }
})

test('a view between two zoom levels loads the nearer one and scales it', () => {
  const p = plan(16.4)
  assert.equal(p.z, 16)
  // a 256 pixel tile is 2^0.4 pixels on the screen for each of its own
  assert.ok(Math.abs(p.size - TILE * 2 ** 0.4) < 1e-9)
  assert.equal(plan(16.6).z, 17)
})

test('the tile zoom stops at 19, and a view above it is scaled up from level 19', () => {
  const p = plan(20.7)
  assert.equal(p.z, 19)
  assert.ok(Math.abs(p.size - TILE * 2 ** 1.7) < 1e-9)
  assert.ok(p.wanted.every((w) => w.z === 19))
  assert.ok(p.wanted.length <= 4, `${p.wanted.length} tiles at 20.7`)
  assert.equal(plan(22).z, 19)
  assert.equal(plan(2.2).z, 2)
})

test('a missing tile is filled from the tile above it, cut to the right quarter, so there is no hole', () => {
  const all = wantedKeys(plan(17))
  // the camera has just crossed from level 16 to 17: only the level 16 tiles are in
  const parents = new Set()
  for (const w of plan(17).wanted) parents.add(tileKey(16, Math.floor(w.x / 2), Math.floor(w.y / 2)))
  const p = plan(17, parents)
  assert.equal(p.blank, 0)
  assert.equal(p.ops.length, all.size)
  for (const op of p.ops) {
    assert.equal(op.z, 16)
    assert.equal(op.sw, TILE / 2)
    assert.equal(op.sh, TILE / 2)
    assert.ok(op.sx === 0 || op.sx === TILE / 2)
  }
  // each piece lands where the missing tile would have been
  const exact = plan(17, all)
  const byKey = new Map(exact.ops.map((o) => [tileKey(o.z, o.x, o.y), o]))
  for (const w of plan(17).wanted) {
    const fill = p.ops.find((o) => Math.abs(o.dx - byKey.get(tileKey(w.z, w.x, w.y)).dx) < 1e-9 && Math.abs(o.dy - byKey.get(tileKey(w.z, w.x, w.y)).dy) < 1e-9)
    assert.ok(fill, `no fill for ${w.x}/${w.y}`)
  }
})

test('a tile two or three levels up is used when the one right above is missing too', () => {
  const p0 = plan(18)
  const top = new Set()
  for (const w of p0.wanted) top.add(tileKey(15, w.x >> 3, w.y >> 3))
  const p = plan(18, top)
  assert.equal(p.blank, 0)
  assert.ok(p.ops.every((o) => o.z === 15 && o.sw === TILE / 8))
  // four levels up is the last that is tried, and past that the hole is left
  const far = new Set()
  for (const w of p0.wanted) far.add(tileKey(13, w.x >> 5, w.y >> 5))
  assert.equal(plan(18, far).blank, 1)
})

test('tiles one level down fill a missing tile, as far as they go', () => {
  const p0 = plan(16)
  const w = p0.wanted[0]
  // two of the four tiles below the first wanted tile are in
  const have = new Set([tileKey(17, w.x * 2, w.y * 2), tileKey(17, w.x * 2 + 1, w.y * 2)])
  const p = plan(16, have)
  assert.equal(p.ops.length, 2)
  assert.ok(p.ops.every((o) => o.z === 17 && o.sw === TILE && o.dw < TILE))
  // the blank share is the part of the screen the two pieces do not cover, so it is below the whole of that tile
  assert.ok(p.blank > 0.8 && p.blank < 1, `${p.blank}`)
})

test('the blank share is the part of the screen that is empty: 1 with nothing loaded, 0 when covered, and the area of a missing tile between', () => {
  const p0 = plan(17)
  assert.equal(p0.blank, 1)
  const all = wantedKeys(p0)
  assert.equal(plan(17, all).blank, 0)
  // the tile farthest from the middle is the one missing
  const last = p0.wanted.at(-1)
  const have = new Set(all)
  have.delete(tileKey(last.z, last.x, last.y))
  const op = plan(17, all).ops.find((o) => o.x === last.x && o.y === last.y)
  const w = Math.min(view.width, op.dx + op.dw) - Math.max(0, op.dx)
  const h = Math.min(view.height, op.dy + op.dh) - Math.max(0, op.dy)
  const p = plan(17, have)
  assert.ok(Math.abs(p.blank - (w * h) / (view.width * view.height)) < 1e-9, `${p.blank}`)
  assert.ok(p.blank > 0 && p.blank < 0.2)
  assert.equal(p.total, p0.wanted.length)
})

test('the tiles wanted are the ones on the screen, nearest the middle first', () => {
  const p = plan(17.2)
  const [cx, cy] = centre(17.2)
  const scale = 2 ** (p.z - 17.2)
  const mid = [(cx * scale) / TILE, (cy * scale) / TILE]
  const dist = (w) => Math.hypot(w.x + 0.5 - mid[0], w.y + 0.5 - mid[1])
  for (let i = 1; i < p.wanted.length; i++) assert.ok(dist(p.wanted[i - 1]) <= dist(p.wanted[i]) + 1e-9)
  // the tile that holds the middle of the screen is first
  assert.equal(p.wanted[0].x, Math.floor(mid[0]))
  assert.equal(p.wanted[0].y, Math.floor(mid[1]))
})

test('tiles wrap round the date line and stop at the poles', () => {
  const [cx, cy] = [(lonLatToTile(179.99, 0, 5).x) * TILE, lonLatToTile(179.99, 0, 5).y * TILE]
  const p = planTiles({ zoom: 5, cx, cy, width: 600, height: 400, ready: () => false })
  assert.ok(p.wanted.some((w) => w.x === 31) && p.wanted.some((w) => w.x === 0))
  assert.ok(p.wanted.every((w) => w.x >= 0 && w.x < 32))
  const north = planTiles({ zoom: 3, cx: 4 * TILE, cy: 10, width: 400, height: 400, ready: () => false })
  assert.ok(north.wanted.every((w) => w.y >= 0))
})

test('a view covered by tiles of any mix of levels is blank 0 exactly, and not a rounding error', () => {
  // every view of a walk across two zoom levels, with the tiles above loaded, adds up to the screen to within rounding
  for (let zoom = 16.2; zoom < 18.9; zoom += 0.137) {
    const p0 = plan(zoom)
    const up = new Set()
    for (const w of p0.wanted) up.add(tileKey(w.z - 1, Math.floor(w.x / 2), Math.floor(w.y / 2)))
    assert.equal(plan(zoom, up).blank, 0, `zoom ${zoom}`)
  }
})
