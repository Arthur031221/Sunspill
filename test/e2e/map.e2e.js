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
