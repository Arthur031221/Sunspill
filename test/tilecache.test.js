import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TileCache } from '../src/app/tilecache.js'

/** A cache whose pictures, clock and timers are the test's own. */
function harness(options = {}) {
  let t = 0
  const timers = []
  const loads = []
  const changes = []
  const cache = new TileCache({
    url: (z, x, y) => `t/${z}/${x}/${y}`,
    load: (url, ok, bad) => {
      const load = { url, ok: () => ok({ url }), bad, cancelled: false }
      loads.push(load)
      return () => { load.cancelled = true }
    },
    now: () => t,
    setTimer: (fn, ms) => { const timer = { fn, at: t + ms, done: false }; timers.push(timer); return timer },
    clearTimer: (timer) => { timer.done = true },
    onChange: () => changes.push(t),
    ...options,
  })
  const advance = (ms) => {
    t += ms
    for (const timer of timers.filter((x) => !x.done && x.at <= t)) { timer.done = true; timer.fn() }
  }
  const tiles = (n, z = 5) => Array.from({ length: n }, (_, i) => ({ z, x: i, y: 0 }))
  return { cache, loads, changes, advance, tiles, now: () => t }
}
const live = (h) => h.loads.filter((l) => !l.cancelled && !l.done)

test('at most six pictures load at once, the nearest first, and each one that ends lets the next begin', () => {
  const h = harness()
  h.cache.want(h.tiles(20))
  assert.equal(h.loads.length, 6)
  assert.deepEqual(h.loads.map((l) => l.url), [0, 1, 2, 3, 4, 5].map((i) => `t/5/${i}/0`))
  h.loads[0].done = true
  h.loads[0].ok()
  assert.equal(h.loads.length, 7)
  assert.equal(h.loads[6].url, 't/5/6/0')
  assert.equal(h.cache.ready(5, 0, 0).url, 't/5/0/0')
  assert.equal(h.cache.ready(5, 1, 0), null)
  assert.equal(h.changes.length, 1, 'the page is told a picture came')
})

test('asking again for the same tiles starts nothing twice', () => {
  const h = harness()
  h.cache.want(h.tiles(4))
  h.cache.want(h.tiles(4))
  h.cache.want(h.tiles(4))
  assert.equal(h.loads.length, 4)
})

test('a load for a tile that is no longer on the screen is cancelled, once it has been off it for a moment', () => {
  const h = harness()
  h.cache.want(h.tiles(6))
  assert.equal(h.loads.length, 6)
  // the screen moved on to six other tiles
  const next = Array.from({ length: 6 }, (_, i) => ({ z: 5, x: 10 + i, y: 0 }))
  h.cache.want(next)
  assert.equal(h.loads.filter((l) => l.cancelled).length, 0, 'a tile that comes back at once is not thrown away')
  h.advance(400)
  h.cache.want(next)
  assert.equal(h.loads.slice(0, 6).filter((l) => l.cancelled).length, 6)
  assert.equal(h.loads.length, 12, 'and the new ones begin as the old ones go')
  assert.equal(h.cache.ready(5, 0, 0), null)
})

test('a tile that is queued and then no longer wanted is never started', () => {
  const h = harness()
  h.cache.want(h.tiles(10))
  assert.equal(h.loads.length, 6)
  h.cache.want([{ z: 5, x: 40, y: 0 }])
  h.advance(400)
  h.cache.want([{ z: 5, x: 40, y: 0 }])
  const started = new Set(h.loads.map((l) => l.url))
  for (const gone of [6, 7, 8, 9]) assert.ok(!started.has(`t/5/${gone}/0`), `tile ${gone} was started`)
})

test('a picture that fails is asked for again after 0.4 s and again after 1.2 s, and then is given up', () => {
  const h = harness()
  h.cache.want(h.tiles(1))
  assert.equal(h.loads.length, 1)
  h.loads[0].bad()
  assert.equal(h.loads.length, 1)
  h.advance(399)
  h.cache.want(h.tiles(1))
  assert.equal(h.loads.length, 1, 'not before the backoff is over')
  h.advance(1)
  assert.equal(h.loads.length, 2)
  h.loads[1].bad()
  h.advance(1199)
  assert.equal(h.loads.length, 2)
  h.advance(1)
  assert.equal(h.loads.length, 3)
  h.loads[2].bad()
  // two retries and no more
  h.advance(60000)
  assert.equal(h.loads.length, 3)
})

test('a failed tile does not stay a hole: it is dropped and asked for once more after a pause, not on every frame', () => {
  const h = harness()
  h.cache.want(h.tiles(1))
  h.loads[0].bad()
  h.advance(400)
  h.loads[1].bad()
  h.advance(1200)
  h.loads[2].bad()
  assert.equal(h.cache.size, 0, 'nothing is kept for it')
  // the page paints many frames, and none of them asks the server again
  for (let i = 0; i < 50; i++) { h.advance(100); h.cache.want(h.tiles(1)) }
  assert.equal(h.loads.length, 3)
  h.advance(20000)
  h.cache.want(h.tiles(1))
  assert.equal(h.loads.length, 4, 'after the pause the next frame asks again')
  // and the page is told when the pause is over, so a still picture is painted again
  assert.ok(h.changes.length >= 1)
  h.loads[3].ok()
  assert.ok(h.cache.ready(5, 0, 0))
})

test('the cache holds at most its limit and drops the tile that was used longest ago, not one in use', () => {
  const h = harness({ max: 10 })
  h.cache.want(h.tiles(6))
  for (const l of h.loads) { l.done = true; l.ok() }
  h.advance(10)
  // tile 0 is looked at again, so it is the newest
  assert.ok(h.cache.ready(5, 0, 0))
  h.cache.want([{ z: 6, x: 0, y: 0 }, { z: 6, x: 1, y: 0 }, { z: 6, x: 2, y: 0 }, { z: 6, x: 3, y: 0 }, { z: 6, x: 4, y: 0 }, { z: 6, x: 5, y: 0 }])
  for (const l of h.loads.slice(6)) { l.done = true; l.ok() }
  assert.ok(h.cache.size <= 10, `${h.cache.size}`)
  assert.ok(h.cache.ready(5, 0, 0), 'the tile looked at last is still there')
  assert.equal(h.cache.ready(5, 1, 0), null, 'the one used longest ago went')
})

test('looking up a tile that is not there does not start a load', () => {
  const h = harness()
  assert.equal(h.cache.ready(3, 1, 1), null)
  assert.equal(h.loads.length, 0)
})
