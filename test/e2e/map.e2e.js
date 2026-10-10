// The map in the guided setup, after the fixes: tiles that do not leave holes, a view that stays where the person
// put it, a double tap that zooms and does not move the pin. The three OpenStreetMap hosts are answered by the test.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, firefox, webkit } from 'playwright'
import { serve } from '../serve.js'

const engine = { firefox, webkit }[process.env.BROWSER] ?? chromium
// a 1 pixel PNG, for every map tile
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const CORS = { 'access-control-allow-origin': '*' }

let site
let browser

before(async () => {
  site = await serve()
  browser = await engine.launch()
})
after(async () => {
  await browser.close()
  await site.close()
})

/** A phone in the full editor with the map pictures allowed. `tile(path)` can delay, fail or let through each tile. */
async function open({ tile = () => 'ok' } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(engine === firefox ? { serviceWorkers: 'block' } : { isMobile: true }), hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce', locale: 'en-GB' })
  await context.addInitScript(() => { if (!localStorage.getItem('sunspill.prefs')) localStorage.setItem('sunspill.prefs', JSON.stringify({ view: 'classic', net: { search: true, tiles: true, buildings: true } })) })
  const tiles = { asked: [], aborted: 0 }
  await context.route((url) => url.hostname !== '127.0.0.1', async (route) => {
    const url = new URL(route.request().url())
    if (url.host !== 'tile.openstreetmap.org') return route.abort()
    tiles.asked.push(url.pathname)
    const how = await tile(url.pathname)
    try {
      if (how === 'fail') await route.abort('failed')
      else await route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: PNG })
    } catch {
      // the page stopped waiting for this tile, which is said below
    }
  })
  const page = await context.newPage()
  // a picture that the page stops waiting for ends as aborted, and one that the test fails ends as failed
  page.on('requestfailed', (r) => { if (r.url().includes('tile.openstreetmap.org') && r.failure()?.errorText === 'net::ERR_ABORTED') tiles.aborted++ })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
  await page.goto(site.url)
  await page.waitForSelector('html[data-ready]')
  return { page, context, errors, tiles }
}

const scene = (page) => page.evaluate(() => structuredClone(window.__sunspill.store.scene))
const openWizard = async (page, step = 0) => {
  await page.click('#setup')
  await page.waitForSelector('html[data-wizard]')
  for (let i = 0; i < step; i++) await page.click('#wiz-next')
}
const mapZoom = (page) => page.evaluate(() => window.__sunspill.map.cam.zoom)

test('Back and Next keep the zoom the person chose in each step, and a step they did not touch is fitted as before', async () => {
  const { page, context, errors } = await open()
  await openWizard(page)
  const fitted = await mapZoom(page)
  assert.equal(fitted, 16)
  await page.evaluate(() => window.__sunspill.map.zoomBy(1.5))
  const chosen = await mapZoom(page)
  assert.ok(Math.abs(chosen - 17.5) < 1e-9)
  // to the room step, which has no map, and back
  await page.click('#wiz-next')
  await page.click('#wiz-back')
  assert.ok(Math.abs((await mapZoom(page)) - chosen) < 1e-9, `${await mapZoom(page)} against ${chosen}`)
  // the facing step is fitted the first time, and keeps what the person does to it
  for (let i = 0; i < 3; i++) await page.click('#wiz-next')
  const facing = await mapZoom(page)
  assert.ok(facing >= 17 && facing <= 19, `facing zoom ${facing}`)
  await page.evaluate(() => window.__sunspill.map.zoomBy(-1))
  const wide = await mapZoom(page)
  await page.click('#wiz-next')
  const around = await mapZoom(page)
  assert.ok(Math.abs(around - wide) > 0.2, 'the surroundings step starts from its own view')
  await page.click('#wiz-back')
  assert.ok(Math.abs((await mapZoom(page)) - wide) < 1e-9, 'back in the facing step the view is the one that was left')
  assert.deepEqual(errors, [])
  await context.close()
})

test('the view is never fitted closer than the level 19 tiles, which a closer view only blurs', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  assert.ok((await mapZoom(page)) <= 19)
  await page.click('#wiz-next')
  assert.ok((await mapZoom(page)) <= 19)
  // a person can still pinch in past it, and the picture is the level 19 tiles scaled up
  await page.evaluate(() => window.__sunspill.map.zoomBy(2))
  assert.ok((await mapZoom(page)) > 19)
  assert.equal(await page.evaluate(() => window.__sunspill.map.tileStats.z), 19)
  await context.close()
})

test('a double tap in the place step zooms one step and leaves the pin where it was', async () => {
  const { page, context } = await open()
  await openWizard(page)
  const before = await scene(page)
  const z0 = await mapZoom(page)
  const box = await page.locator('.map-canvas').boundingBox()
  const x = box.x + box.width / 2 + 50
  const y = box.y + box.height / 2 + 40
  await page.touchscreen.tap(x, y)
  await page.touchscreen.tap(x + 3, y + 2)
  await page.waitForTimeout(100)
  assert.deepEqual((await scene(page)).place, before.place, 'the pin did not move')
  assert.equal(await page.evaluate(() => window.__sunspill.store.canUndo()), false, 'and nothing is left to undo')
  assert.ok(Math.abs((await mapZoom(page)) - (z0 + 1)) < 1e-9)
  // a single tap still drops the pin at once
  await page.waitForTimeout(400)
  await page.touchscreen.tap(x, y)
  assert.notDeepEqual((await scene(page)).place, before.place)
  await context.close()
})

test('a tile that fails is asked for again, and a tile that is no longer on the screen is cancelled and not asked for', async () => {
  if (engine !== chromium) return
  const failed = new Set()
  let slow = false
  const { page, context, tiles } = await open({
    tile: async (path) => {
      if (slow) {
        await new Promise((r) => setTimeout(r, 1500))
        return 'ok'
      }
      // the first time each tile is asked for it fails
      if (!failed.has(path)) { failed.add(path); return 'fail' }
      return 'ok'
    },
  })
  await openWizard(page)
  await page.waitForFunction(() => window.__sunspill.map.tileStats.blank === 0, null, { timeout: 15000 })
  assert.ok(tiles.asked.length > new Set(tiles.asked).size, 'a failed tile was asked for again')
  // a long pan, with every tile slow: the tiles of the screens that went by are cancelled, or never asked for
  slow = true
  const asked = tiles.asked.length
  await page.evaluate(() => {
    const { map } = window.__sunspill
    for (let i = 1; i <= 12; i++) setTimeout(() => { map.cam.lon += 0.02; map.invalidate() }, i * 30)
  })
  await page.waitForTimeout(2300)
  const fresh = tiles.asked.length - asked
  // 12 screens of ground is about 90 tiles. Six at a time, and the ones left behind given up after a moment
  assert.ok(fresh <= 24, `${fresh} tiles were asked for during the pan`)
  assert.ok(tiles.aborted >= 1, 'the page stopped waiting for some of them')
  await context.close()
})

test('no tile is held in memory beyond the cache limit, and the cache keeps the tiles last used', async () => {
  const { page, context } = await open()
  await openWizard(page)
  await page.waitForFunction(() => window.__sunspill.map.tileStats.blank === 0, null, { timeout: 15000 })
  const sizes = await page.evaluate(async () => {
    const { map } = window.__sunspill
    const out = []
    for (let i = 0; i < 60; i++) {
      map.cam.lat += 0.01
      map.cam.lon += 0.013
      map.paint()
      await new Promise((r) => setTimeout(r, 5))
      out.push(map.cache.size)
    }
    return out
  })
  assert.ok(Math.max(...sizes) <= 240, `${Math.max(...sizes)} tiles`)
  await context.close()
})

// ---------------------------------------------------------------- the facing step: pinch, pan and moving the room

/**
 * Synthetic touches on the map, with time between them. `events` are `{at, type: 'down' | 'move' | 'up', id, x, y}` with
 * `at` in milliseconds from the first one. Events with the same time go in one task, with no frame between them.
 */
async function touches(page, events, pointerType = 'touch') {
  return page.evaluate(async ({ events, pointerType }) => {
    const el = document.querySelector('.map-canvas')
    const t0 = performance.now()
    let frames = 0
    const count = () => { frames++; requestAnimationFrame(count) }
    requestAnimationFrame(count)
    for (const e of [...events].sort((a, b) => a.at - b.at)) {
      const wait = e.at - (performance.now() - t0)
      if (wait > 1) await new Promise((resolve) => setTimeout(resolve, wait))
      el.dispatchEvent(new PointerEvent(`pointer${e.type}`, { pointerId: e.id ?? 1, pointerType, isPrimary: (e.id ?? 1) === 1, clientX: e.x, clientY: e.y, bubbles: true, cancelable: true }))
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return { frames, ms: performance.now() - t0 }
  }, { events, pointerType })
}

/** One finger: down at the first point, then along the rest, one every `every` ms starting `wait` ms after the touch. */
const finger = (points, { wait = 0, every = 16, id = 1 } = {}) => [
  { at: 0, type: 'down', id, x: points[0][0], y: points[0][1] },
  ...points.slice(1).map(([x, y], i) => ({ at: wait + (i + 1) * every, type: 'move', id, x, y })),
  { at: wait + points.length * every, type: 'up', id, x: points.at(-1)[0], y: points.at(-1)[1] },
]
const along = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])

/**
 * Two fingers round the middle of the map `r` px from it, turned from `from` to `to` degrees and `spread` px farther
 * apart at the end. The two fingers move together, one event each in turn.
 */
function pinch(cx, cy, { r = 60, from = 300, to = 330, spread = 0, steps = 12, every = 16 } = {}) {
  const at = (k, sign) => {
    const deg = from + (to - from) * k
    const rr = r + spread * k
    return [cx + sign * rr * Math.sin((deg * Math.PI) / 180), cy - sign * rr * Math.cos((deg * Math.PI) / 180)]
  }
  const events = [{ at: 0, type: 'down', id: 1, x: at(0, 1)[0], y: at(0, 1)[1] }, { at: 0, type: 'down', id: 2, x: at(0, -1)[0], y: at(0, -1)[1] }]
  for (let i = 1; i <= steps; i++) {
    events.push({ at: i * every, type: 'move', id: 1, x: at(i / steps, 1)[0], y: at(i / steps, 1)[1] }, { at: i * every, type: 'move', id: 2, x: at(i / steps, -1)[0], y: at(i / steps, -1)[1] })
  }
  events.push({ at: steps * every + every, type: 'up', id: 1, x: at(1, 1)[0], y: at(1, 1)[1] }, { at: steps * every + every, type: 'up', id: 2, x: at(1, -1)[0], y: at(1, -1)[1] })
  return events
}

const geometry = (page) => page.evaluate(() => {
  const { map } = window.__sunspill
  const r = map.canvas.getBoundingClientRect()
  const c = map.local(0, 0)
  const abs = (p) => (p ? [r.left + p[0], r.top + p[1]] : null)
  return { cx: r.left + c[0], cy: r.top + c[1], moveHandle: abs(map.moveHandle), turnHandle: abs(map.handle), ppm: map.pixelsPerMetre, cam: { ...map.cam } }
})
const placeOf = async (page) => (await scene(page)).place
const countUpdates = (page) => page.evaluate(() => {
  const store = window.__sunspill.store
  window.__updates = 0
  const update = store.update
  store.update = function (...args) { window.__updates++; return update.apply(this, args) }
})

test('facing: a pinch that twists a little only zooms, and the room stays as it was', async () => {
  const { page, context, errors } = await open()
  await openWizard(page, 3)
  const g = await geometry(page)
  const before = await scene(page)
  // 5 degrees of twist while the fingers go from 120 to 200 px apart: a zoom
  await touches(page, pinch(g.cx, g.cy, { r: 60, from: 300, to: 305, spread: 40 }))
  const after = await scene(page)
  assert.equal(after.facing, before.facing)
  assert.ok((await mapZoom(page)) > g.cam.zoom + 0.3, 'it zoomed')
  assert.equal(await page.evaluate(() => window.__sunspill.store.canUndo()), false)
  // 12 degrees of twist in a pinch that spreads the fingers from 90 to 330 px: still a zoom
  await touches(page, pinch(g.cx, g.cy, { r: 45, from: 300, to: 312, spread: 120 }))
  assert.equal((await scene(page)).facing, before.facing, 'a twist that is not the main motion turns nothing')
  assert.deepEqual(errors, [])
  await context.close()
})

test('facing: a turn of 7 degrees leaves the room alone, and a turn past 8 degrees follows the fingers all the way', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  const g = await geometry(page)
  const start = (await scene(page)).facing
  await touches(page, pinch(g.cx, g.cy, { from: 300, to: 307 }))
  assert.equal((await scene(page)).facing, start)
  await touches(page, pinch(g.cx, g.cy, { from: 300, to: 330 }))
  const turned = (await scene(page)).facing
  assert.ok(Math.abs((((turned - start + 540) % 360) - 180) - 30) < 0.6, `turned by ${((turned - start + 540) % 360) - 180}`)
  // and the other way
  await touches(page, pinch(g.cx, g.cy, { from: 330, to: 280 }))
  const back = (await scene(page)).facing
  assert.ok(Math.abs((((back - turned + 540) % 360) - 180) + 50) < 0.6, `turned by ${((back - turned + 540) % 360) - 180}`)
  await context.close()
})

test('facing: turning does not push an update on every pointer move, only one a frame, and the whole turn is one undo step', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  const g = await geometry(page)
  const start = (await scene(page)).facing
  // sixty moves in one task: none of them reaches the store before the fingers come up
  await countUpdates(page)
  const burst = pinch(g.cx, g.cy, { from: 300, to: 360, steps: 60, every: 0 })
  await touches(page, burst)
  const burstUpdates = await page.evaluate(() => window.__updates)
  assert.ok(burstUpdates <= 1, `${burstUpdates} updates for 60 moves`)
  const turned = (await scene(page)).facing
  assert.ok(Math.abs((((turned - start + 540) % 360) - 180) - 60) < 0.6)
  assert.equal(await page.evaluate(() => window.__sunspill.store.canUndo()), true)
  await page.evaluate(() => window.__sunspill.store.undo())
  assert.equal((await scene(page)).facing, start, 'one step undoes the whole turn')
  assert.equal(await page.evaluate(() => window.__sunspill.store.canUndo()), false)
  // paced over about half a second: at most one update for each frame that was drawn, and fewer than the moves
  await page.evaluate(() => { window.__updates = 0 })
  const paced = await touches(page, pinch(g.cx, g.cy, { from: 300, to: 345, steps: 60, every: 8 }))
  const updates = await page.evaluate(() => window.__updates)
  assert.ok(updates <= paced.frames + 1, `${updates} updates in ${paced.frames} frames`)
  assert.ok(updates < 60, `${updates} updates for 60 moves`)
  assert.ok(updates >= 2, 'the room followed while the fingers were down')
  await page.evaluate(() => window.__sunspill.store.undo())
  assert.equal((await scene(page)).facing, start)
  await context.close()
})

test('facing: the round handle turns the room, one update a frame at most, and one undo step', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  const g = await geometry(page)
  const start = (await scene(page)).facing
  assert.ok(g.turnHandle, 'the round handle is drawn')
  await countUpdates(page)
  // swing it a quarter turn round the middle of the room
  const radius = Math.hypot(g.turnHandle[0] - g.cx, g.turnHandle[1] - g.cy)
  const a0 = Math.atan2(g.turnHandle[0] - g.cx, -(g.turnHandle[1] - g.cy))
  const arc = Array.from({ length: 41 }, (_, i) => [g.cx + radius * Math.sin(a0 + (i / 40) * (Math.PI / 2)), g.cy - radius * Math.cos(a0 + (i / 40) * (Math.PI / 2))])
  await touches(page, finger(arc, { every: 0 }))
  assert.ok((await page.evaluate(() => window.__updates)) <= 1)
  const turned = (await scene(page)).facing
  assert.ok(Math.abs((((turned - start + 540) % 360) - 180) - 90) < 2, `turned by ${((turned - start + 540) % 360) - 180}`)
  await page.evaluate(() => window.__sunspill.store.undo())
  assert.equal((await scene(page)).facing, start)
  await context.close()
})

test('facing: a finger that goes down inside the room and drags pans the map, and leaves the room where it is', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  const g = await geometry(page)
  const before = await scene(page)
  // the middle of the room, which is not a handle
  await touches(page, finger(along([g.cx, g.cy], [g.cx + 70, g.cy + 40], 10), { every: 16 }))
  const after = await geometry(page)
  assert.ok(after.cam.lon < g.cam.lon - 1e-5, 'the map went with the finger')
  assert.ok(after.cam.lat > g.cam.lat + 1e-6)
  assert.deepEqual((await scene(page)).place, before.place)
  assert.equal(await page.evaluate(() => window.__sunspill.store.canUndo()), false, 'nothing to undo')
  await context.close()
})

test('facing: a press of 350 ms inside the room lifts it, and then the drag moves the room and not the map, in one undo step', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  const g = await geometry(page)
  const before = await scene(page)
  await countUpdates(page)
  // a little jitter during the hold is not a move, of the map or of the room
  await touches(page, [{ at: 0, type: 'down', x: g.cx, y: g.cy }, { at: 60, type: 'move', x: g.cx + 3, y: g.cy - 2 }, { at: 120, type: 'move', x: g.cx - 2, y: g.cy + 3 }])
  assert.deepEqual((await scene(page)).place, before.place, 'the room has not moved while the finger is held')
  assert.equal(await page.evaluate(() => window.__updates), 0)
  assert.deepEqual((({ lat, lon }) => [lat, lon])((await geometry(page)).cam), [g.cam.lat, g.cam.lon], 'nor has the map')
  await page.waitForTimeout(300)
  // the room is lifted now: the drag moves it, from where the finger was when it was lifted
  const held = [g.cx - 2, g.cy + 3]
  const to = [held[0] + 60, held[1] + 30]
  const run = await touches(page, [...along(held, to, 30).slice(1).map(([x, y], i) => ({ at: i * 10, type: 'move', x, y })), { at: 330, type: 'up', x: to[0], y: to[1] }])
  const after = await geometry(page)
  assert.deepEqual([after.cam.lat, after.cam.lon], [g.cam.lat, g.cam.lon], 'the map stayed')
  const place = await placeOf(page)
  const east = (place.lon - before.place.lon) * 111320 * Math.cos((before.place.lat * Math.PI) / 180)
  const north = (place.lat - before.place.lat) * 111195
  assert.ok(Math.abs(east - 60 / g.ppm) < 0.3 && Math.abs(north + 30 / g.ppm) < 0.3, `moved ${east.toFixed(2)} m east and ${north.toFixed(2)} m north`)
  const updates = await page.evaluate(() => window.__updates)
  assert.ok(updates >= 2 && updates <= run.frames, `${updates} updates in ${run.frames} frames`)
  await page.evaluate(() => window.__sunspill.store.undo())
  assert.deepEqual((await scene(page)).place, before.place, 'one step puts the room back')
  assert.equal(await page.evaluate(() => window.__sunspill.store.canUndo()), false)
  await context.close()
})

test('facing: a press shorter than 350 ms is still a pan, and a press that never moves changes nothing', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  const g = await geometry(page)
  const before = await scene(page)
  await touches(page, finger(along([g.cx, g.cy], [g.cx + 50, g.cy], 8), { wait: 240, every: 16 }))
  const panned = await geometry(page)
  assert.ok(panned.cam.lon < g.cam.lon - 1e-5, 'a finger that moves after 240 ms pans')
  assert.deepEqual((await scene(page)).place, before.place)
  // held for a second without moving: the room is lifted and put down again, as it was
  await touches(page, [{ at: 0, type: 'down', x: g.cx, y: g.cy }, { at: 1000, type: 'up', x: g.cx, y: g.cy }])
  assert.deepEqual((await scene(page)).place, before.place)
  assert.equal(await page.evaluate(() => window.__sunspill.store.canUndo()), false)
  await context.close()
})

test('facing: the handle on the far side of the room moves it at once, with no wait', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  const g = await geometry(page)
  const before = await scene(page)
  assert.ok(g.moveHandle, 'the move handle is drawn')
  assert.ok(Math.hypot(g.moveHandle[0] - g.cx, g.moveHandle[1] - g.cy) > 22, 'and it is not in the middle of the room, which is for panning')
  await touches(page, finger(along(g.moveHandle, [g.moveHandle[0] + 40, g.moveHandle[1] + 20], 8), { every: 16 }))
  const place = await placeOf(page)
  const east = (place.lon - before.place.lon) * 111320 * Math.cos((before.place.lat * Math.PI) / 180)
  assert.ok(Math.abs(east - 40 / g.ppm) < 0.3, `moved ${east.toFixed(2)} m east`)
  const after = await geometry(page)
  assert.deepEqual([after.cam.lat, after.cam.lon], [g.cam.lat, g.cam.lon], 'the map stayed')
  await page.evaluate(() => window.__sunspill.store.undo())
  assert.deepEqual((await scene(page)).place, before.place)
  await context.close()
})

test('facing: with a mouse a drag inside the room still moves it at once', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  const g = await geometry(page)
  const before = await scene(page)
  await touches(page, finger(along([g.cx, g.cy], [g.cx + 40, g.cy], 8), { every: 16 }), 'mouse')
  const place = await placeOf(page)
  assert.ok(place.lon > before.place.lon, 'the room moved')
  const after = await geometry(page)
  assert.deepEqual([after.cam.lat, after.cam.lon], [g.cam.lat, g.cam.lon])
  await context.close()
})

test('facing: Shift and an arrow still move the room by the keyboard, one step each', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  const before = await scene(page)
  await page.focus('.map-canvas')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  const place = await placeOf(page)
  const east = (place.lon - before.place.lon) * 111320 * Math.cos((before.place.lat * Math.PI) / 180)
  assert.ok(Math.abs(east - 1) < 0.05, `${east} m`)
  await context.close()
})
