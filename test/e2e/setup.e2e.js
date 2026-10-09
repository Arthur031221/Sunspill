// The guided setup on a phone: every step, with the three OpenStreetMap hosts
// answered by the test and any other outside request refused and counted.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, firefox, webkit } from 'playwright'
import { readFileSync } from 'node:fs'
import { serve } from '../serve.js'

const engine = { firefox, webkit }[process.env.BROWSER] ?? chromium
const overpass = readFileSync(new URL('../fixtures/overpass-taipei.json', import.meta.url), 'utf8')
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

/** A phone with the three services answered by the test. `answers` can replace any of them. */
async function open({ locale = 'en-GB', answers = {}, hash = '', viewport = { width: 390, height: 844 } } = {}) {
  const context = await browser.newContext({ viewport, ...(engine === firefox ? { serviceWorkers: 'block' } : { isMobile: true }), hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce', locale })
  const outside = []
  await context.route((url) => url.hostname !== '127.0.0.1', async (route) => {
    const url = new URL(route.request().url())
    const request = route.request()
    outside.push({ host: url.host, path: url.pathname, search: url.search, method: request.method(), body: request.postData() })
    if (url.host === 'nominatim.openstreetmap.org') {
      const body = answers.nominatim ?? [{ lat: '25.0338352', lon: '121.5644995', name: '台北101', display_name: '台北101, 7, 信義路五段, 信義區, 臺北市, 臺灣', address: { city: '臺北市', country_code: 'tw' } }]
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) })
    }
    if (url.host === 'tile.openstreetmap.org') return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: PNG })
    if (/^overpass/.test(url.host)) {
      const fail = answers.overpassFail ?? 0
      const nth = outside.filter((o) => /^overpass/.test(o.host)).length
      if (nth <= fail) return route.fulfill({ status: 504, headers: CORS, body: 'busy' })
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: answers.overpass ?? overpass })
    }
    return route.abort()
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
  await page.goto(site.url + hash)
  await page.waitForSelector('html[data-ready]')
  return { page, context, errors, outside }
}

const scene = (page) => page.evaluate(() => structuredClone(window.__sunspill.store.scene))
const ui = (page) => page.evaluate(() => structuredClone(window.__sunspill.store.ui))
const openWizard = async (page, step = 0) => {
  await page.click('#setup')
  await page.waitForSelector('html[data-wizard]')
  for (let i = 0; i < step; i++) await page.click('#wiz-next')
}
const title = (page) => page.locator('.wiz-title').innerText()
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

/** Where the center of the room stage canvas or the map is, in page pixels. */
const centerOf = (page, selector) => page.evaluate((sel) => {
  const r = document.querySelector(sel).getBoundingClientRect()
  return [r.left + r.width / 2, r.top + r.height / 2]
}, selector)

/** One finger down at the first point, along the rest and up again, through the browser's own touch input. */
async function drag(page, context, points) {
  if (engine !== chromium) throw new Error('needs Chromium touch input')
  const cdp = await context.newCDPSession(page)
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p[0], y: p[1] }] })
  await touch('touchStart', points[0])
  for (const p of points.slice(1)) await touch('touchMove', p)
  await touch('touchEnd', points.at(-1))
  await cdp.detach()
}
const line = (a, b, steps = 8) => Array.from({ length: steps + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps])

/** Synthetic touches on an element: each finger is a list of [x, y] points, moved together step by step. */
async function gesture(page, selector, fingers) {
  await page.evaluate(({ selector, fingers }) => {
    const el = document.querySelector(selector)
    const fire = (type, id, [x, y]) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true }))
    fingers.forEach((path, i) => fire('pointerdown', i + 1, path[0]))
    const steps = fingers[0].length
    for (let s = 1; s < steps; s++) fingers.forEach((path, i) => fire('pointermove', i + 1, path[s]))
    fingers.forEach((path, i) => fire('pointerup', i + 1, path[steps - 1]))
  }, { selector, fingers })
}

test('the first screen offers the setup and the seven steps fit a phone one after another', async () => {
  const { page, context, errors, outside } = await open()
  const box = await page.locator('#setup').boundingBox()
  assert.ok(box && box.y < 120 && box.y + box.height < 844, `the button sits at ${box?.y}`)
  assert.ok(box.height >= 36)
  await openWizard(page)
  const titles = ['Where is the room?', 'The room', 'Windows and doors', 'Which way does it face?', 'What stands around it?', 'Furniture', 'Check against the real sun']
  for (let i = 0; i < 7; i++) {
    assert.equal(await title(page), titles[i])
    assert.equal(await page.locator('.wiz-count').innerText(), `Step ${i + 1} of 7`)
    assert.equal(await noSideways(page), true, `step ${i + 1} scrolls sideways`)
    const next = await page.locator('#wiz-next').boundingBox()
    assert.ok(next.y + next.height <= 844 && next.height >= 44, `step ${i + 1}: next button ${JSON.stringify(next)}`)
    const stage = await page.locator('#stage').boundingBox()
    assert.ok(stage.height >= 190 && stage.height <= 340, `step ${i + 1}: the view is ${stage.height} px tall`)
    assert.equal(await page.evaluate(() => document.activeElement?.className), 'wiz-title', 'the heading takes the focus')
    if (i < 6) await page.click('#wiz-next')
  }
  await page.click('#wiz-back')
  assert.equal(await title(page), 'Furniture')
  await page.click('#wiz-next')
  await page.click('#wiz-next')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.wizard), undefined, 'finishing closes the setup')
  assert.equal((await ui(page)).tab, 'results')
  assert.deepEqual(errors, [])
  assert.deepEqual(outside, [], 'nothing was sent anywhere without a yes')
  await context.close()
})

test('the sample page still asks nothing of anyone: no outside request, and the policy names five hosts only', async () => {
  const { page, context, outside } = await open()
  await page.waitForTimeout(300)
  assert.deepEqual(outside, [])
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content)
  const connect = csp.match(/connect-src ([^;]+)/)[1].split(' ').sort()
  assert.deepEqual(connect, ['https://nominatim.openstreetmap.org', 'https://overpass-api.de', 'https://overpass.openstreetmap.fr', 'https://overpass.private.coffee'])
  assert.match(csp, /img-src 'self' data: blob: https:\/\/tile\.openstreetmap\.org(;|$)/)
  assert.match(csp, /default-src 'none'/)
  await context.close()
})

test('address search asks first, says who gets the text, and sets place and time zone from the answer', async () => {
  const { page, context, outside } = await open()
  await openWizard(page)
  await page.fill('#place-q', 'Taipei 101')
  await page.press('#place-q', 'Enter')
  await page.waitForSelector('.modal[role=dialog]')
  const text = await page.locator('.modal').innerText()
  assert.match(text, /nominatim\.openstreetmap\.org/)
  assert.match(text, /The room itself is not sent/)
  assert.equal(await page.evaluate(() => document.activeElement.closest('.modal') !== null), true, 'focus moves into the sheet')
  // saying no sends nothing and the built in list still answers
  await page.click('.modal >> text=Not now')
  assert.deepEqual(outside, [])
  assert.match(await page.locator('.search-row ~ p[role=status]').innerText(), /No city in the built in list matched/)
  assert.equal((await ui(page)).net.search, false)
  // Escape also says no, and gives the focus back
  await page.press('#place-q', 'Enter')
  await page.waitForSelector('.modal')
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.modal').count(), 0)
  assert.deepEqual(outside, [])
  // saying yes sends the text and only the text
  await page.press('#place-q', 'Enter')
  await page.click('.modal button.primary')
  await page.waitForSelector('.result-list >> text=台北101')
  assert.equal(outside.length, 1)
  const url = new URL(`https://${outside[0].host}${outside[0].path}${outside[0].search}`)
  assert.equal(url.host, 'nominatim.openstreetmap.org')
  assert.equal(url.searchParams.get('q'), 'Taipei 101')
  assert.equal(outside[0].method, 'GET')
  assert.equal(outside[0].body, null)
  await page.click('.result-list >> text=台北101')
  const s = await scene(page)
  assert.ok(Math.abs(s.place.lat - 25.0338352) < 1e-6 && Math.abs(s.place.lon - 121.5644995) < 1e-6, `${s.place.lat}, ${s.place.lon}`)
  assert.equal(s.place.zone, 'Asia/Taipei')
  assert.match(s.place.name, /台北101/)
  assert.match(await page.locator('.where').innerText(), /Time zone Asia\/Taipei \(UTC\+8\)/)
  // the yes is remembered and shown
  assert.equal((await ui(page)).net.search, true)
  assert.match(await page.locator('#wiz-online').innerText(), /1 of 3 on/)
  assert.match(await page.evaluate(() => localStorage.getItem('sunspill.prefs')), /"search":true/)
  await page.press('#place-q', 'Enter')
  await page.waitForTimeout(200)
  assert.equal(await page.locator('.modal').count(), 0, 'it does not ask twice')
  await context.close()
})

test('a failed search says why and leaves the place alone', async () => {
  const { page, context } = await open({ answers: { nominatim: [] } })
  await openWizard(page)
  await page.evaluate(() => window.__sunspill.consent.set('search', true))
  await page.fill('#place-q', 'zzzzzz')
  await page.press('#place-q', 'Enter')
  await page.waitForSelector('text=No address matched')
  assert.equal((await scene(page)).place.name, 'Taipei')
  await context.close()
})

test('the city list answers with no connection at all', async () => {
  const { page, context, outside } = await open()
  await openWizard(page)
  await page.fill('#place-q', 'Tokyo')
  await page.press('#place-q', 'Enter')
  await page.click('.modal >> text=Not now')
  await page.click('.result-list >> text=Tokyo')
  const s = await scene(page)
  assert.equal(s.place.zone, 'Asia/Tokyo')
  assert.deepEqual(outside, [])
  await context.close()
})

test('the map pictures are off until allowed, then come from one host with the credit shown', { skip: engine !== chromium }, async () => {
  const { page, context, outside } = await open()
  await openWizard(page)
  assert.equal(await page.locator('.map-cta button').getAttribute('title'), 'The map pictures are off. You can still place and turn the room on a plain grid.')
  assert.equal(await page.locator('.map-credit').isHidden(), true)
  await page.click('.map-cta >> text=Show the map')
  assert.match(await page.locator('.modal').innerText(), /tile\.openstreetmap\.org/)
  await page.click('.modal button.primary')
  await page.waitForSelector('.map-credit', { state: 'visible' })
  await page.waitForFunction(() => document.querySelector('.map-cta').hidden)
  await page.waitForTimeout(400)
  assert.ok(outside.length > 2, `${outside.length} tiles asked for`)
  assert.ok(outside.every((o) => o.host === 'tile.openstreetmap.org' && /^\/\d+\/\d+\/\d+\.png$/.test(o.path)))
  assert.equal(await page.locator('.map-credit').getAttribute('href'), 'https://www.openstreetmap.org/copyright')
  // switching it off again in the settings sheet stops it and hides the credit
  await page.click('#wiz-online')
  await page.uncheck('#net-tiles')
  await page.click('.modal >> text=Done')
  assert.equal(await page.locator('.map-credit').isHidden(), true)
  const before = outside.length
  await drag(page, context, line([150, 200], [40, 120], 5))
  await page.waitForTimeout(250)
  assert.equal(outside.length, before, 'no tile is asked for once it is off')
  await context.close()
})

test('a tap on the map drops the pin: latitude, longitude and the zone of that spot', async () => {
  const { page, context } = await open()
  await openWizard(page)
  await page.evaluate(() => {
    const { map } = window.__sunspill
    map.cam = { lat: -33.8688, lon: 151.2093, zoom: 13 }
    map.invalidate()
  })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const [x, y] = await centerOf(page, '.map-canvas')
  await page.touchscreen.tap(x, y)
  const s = await scene(page)
  assert.ok(Math.abs(s.place.lat + 33.8688) < 0.002 && Math.abs(s.place.lon - 151.2093) < 0.002, `${s.place.lat}, ${s.place.lon}`)
  assert.equal(s.place.zone, 'Australia/Sydney')
  assert.equal(s.place.name, 'Pin')
  // a second tap 300 pixels away moves it again, and the coordinates have five decimals
  await page.waitForTimeout(700) // two quick taps are a double tap, which zooms
  await page.touchscreen.tap(x + 100, y - 60)
  const t = await scene(page)
  assert.ok(Math.abs(t.place.lat - s.place.lat) > 0.001)
  assert.match(String(t.place.lat), /^-33\.\d{1,5}$/)
  await context.close()
})

test('a template, the size and the floor number go into the scene and the link', async () => {
  const { page, context } = await open()
  await openWizard(page, 1)
  await page.click('.tpl[data-template=studio]')
  let s = await scene(page)
  assert.deepEqual([s.room.w, s.room.d], [3.3, 5.2])
  assert.equal(s.windows[0].balcony.depth, 1.2)
  assert.equal(s.doors.length, 1)
  assert.equal(s.items.length, 3)
  assert.match(await page.locator('#toast').innerText(), /Started from: Studio suite/)
  await page.fill('.wiz-step input[aria-label="Floor number"]', '7')
  await page.press('.wiz-step input[aria-label="Floor number"]', 'Enter')
  s = await scene(page)
  assert.equal(s.floor.n, 7)
  await page.waitForTimeout(400)
  const hash = await page.evaluate(() => location.hash)
  const back = await page.evaluate((h) => window.__sunspill.decode(h), hash)
  assert.equal(back.floor.n, 7)
  assert.equal(back.windows[0].balcony.depth, 1.2)
  // undo takes the template back
  await page.click('#wiz-undo')
  await page.click('#wiz-undo')
  assert.equal((await scene(page)).room.w, 3.6)
  await context.close()
})

test('windows: a balcony rail shades low sun, a window dragged near the wall end clings to it, lengths are drawn', { skip: engine !== chromium }, async () => {
  const { page, context } = await open()
  await openWizard(page, 2)
  assert.equal((await ui(page)).dims, true)
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.minutes = 17 * 60 + 30; d.windows[0].sill = 0.2; d.windows[0].h = 2 }, { history: false }))
  const bare = await page.evaluate(() => window.__sunspill.floorArea())
  await page.check('#bal0')
  await page.waitForSelector('text=Solid railing height')
  const withRail = await page.evaluate(() => window.__sunspill.floorArea())
  assert.ok(withRail < bare - 0.05, `rail ${withRail} against bare ${bare}`)
  await page.uncheck('#bal0')
  await page.waitForTimeout(200)
  // drag the window by its line in the plan toward the right end of the top wall
  const [fromX, fromY, toX] = await page.evaluate(() => {
    const { stage, store } = window.__sunspill
    const hit = stage.hits.windows[0]
    const [a, b] = hit.quad
    const wall = store.scene.room
    const end = stage.camera.project(wall.w, wall.d, 0)
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, end[0]]
  })
  const box = await page.locator('#canvas').boundingBox()
  await drag(page, context, line([box.x + fromX, box.y + fromY], [box.x + toX - 40, box.y + fromY]))
  const s = await scene(page)
  assert.ok(Math.abs(s.windows[0].pos - (s.room.w - s.windows[0].w)) < 1e-6, `pos ${s.windows[0].pos}`)
  // a door can be added, and the wall length shown is the real one
  await page.click('text=Add a door')
  assert.equal((await scene(page)).doors.length, 1)
  await page.fill('#wizard .card input[type=number][aria-label="Window width"]', '2.4')
  await page.press('#wizard .card input[type=number][aria-label="Window width"]', 'Enter')
  assert.equal((await scene(page)).windows[0].w, 2.4)
  await context.close()
})

test('facing: the phone compass in the step, a flip of 180 degrees and a turn with two fingers', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  await page.evaluate(() => { DeviceOrientationEvent.requestPermission = async () => 'granted' })
  assert.equal(await page.locator('#face-line').innerText(), 'Window 1 faces W 270°')
  await page.click('#compass-open')
  await page.waitForSelector('.compass-reading')
  assert.match(await page.locator('.compass-reading').innerText(), /--/)
  const send = (alpha) => page.evaluate((a) => window.dispatchEvent(Object.assign(new Event('deviceorientationabsolute'), { absolute: true, alpha: a, beta: 90, gamma: 0 })), alpha)
  const use = page.locator('.wiz-step button:has-text("Use this direction")')
  for (let i = 0; i < 70 && (await use.isDisabled()); i++) {
    await send(360 - 200 + (i % 2 ? 0.5 : -0.5))
    await page.waitForTimeout(30)
  }
  assert.equal(await page.locator('.wiz-step >> text=The reading is steady').count(), 1)
  await page.click('.wiz-step button:has-text("Flip 180")')
  await send(160)
  await page.click('.wiz-step button:has-text("Flip 180")')
  for (let i = 0; i < 70 && (await use.isDisabled()); i++) {
    await send(160 + (i % 2 ? 0.5 : -0.5))
    await page.waitForTimeout(30)
  }
  await use.click()
  const declination = await page.evaluate(() => window.__sunspill.declination(25.033, 121.565))
  const f = (await scene(page)).facing
  assert.ok(Math.abs(f - (200 + declination)) < 1.5, `facing ${f}, declination ${declination}`)
  // two fingers turn the room on the map by the angle between them
  const [cx, cy] = await centerOf(page, '.map-canvas')
  const start = (await scene(page)).facing
  const path = (a, b, steps = 6) => Array.from({ length: steps }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (steps - 1), a[1] + ((b[1] - a[1]) * i) / (steps - 1)])
  // fingers 100 px apart, turned a quarter of a turn clockwise about the middle: the room follows
  const rot = (deg, r) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)]
  const arc = (from, to, r) => Array.from({ length: 7 }, (_, i) => rot(from + ((to - from) * i) / 6, r))
  await gesture(page, '.map-canvas', [arc(300, 330, 60), arc(120, 150, 60)])
  const turned = (await scene(page)).facing
  const delta = ((turned - start + 540) % 360) - 180
  assert.ok(Math.abs(delta - 30) < 2, `turned by ${delta}`)
  void path
  await page.waitForTimeout(150)
  assert.equal(await page.locator('#face-line').innerText(), `Window 1 faces ${await page.evaluate(() => {
    const s = window.__sunspill.store.scene
    return `${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(s.facing / 45) % 8]} ${Math.round(s.facing)}°`
  })}`)
  await context.close()
})

test('facing: the buildings load after a yes, the first server may fail, and dragging the room leaves them where they are on the ground', { skip: engine !== chromium }, async () => {
  const { page, context, outside } = await open({ answers: { overpassFail: 1 } })
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.place = { name: 'Da-an', lat: 25.0288, lon: 121.5442, zone: 'Asia/Taipei' } }))
  await openWizard(page, 3)
  await page.click('#load-buildings')
  await page.click('.modal button.primary')
  await page.waitForFunction(() => window.__sunspill.store.scene.obstacles.length > 0)
  assert.deepEqual(outside.map((o) => o.host), ['overpass-api.de', 'overpass.openstreetmap.fr'], 'the second server answered after the first was busy')
  assert.match(outside[0].body, /around%3A200%2C25\.02880%2C121\.54420/)
  assert.match(await page.locator('.wiz-step').innerText(), /37 buildings are loaded/)
  const s0 = await scene(page)
  assert.equal(s0.obstacles.length, 37)
  assert.ok(s0.obstacles.every((o) => o.src === 'osm'))
  // pick a corner of one building and note where it is on the ground
  const ground = (sc, o) => {
    const e = o.ring[0][0]
    const n = o.ring[0][1]
    return { lat: sc.place.lat + n / 111195, lon: sc.place.lon + e / (111320 * Math.cos((sc.place.lat * Math.PI) / 180)) }
  }
  const before = ground(s0, s0.obstacles[3])
  // drag the room 30 px right and 20 px down on the map
  const [cx, cy] = await centerOf(page, '.map-canvas')
  await drag(page, context, line([cx, cy], [cx + 30, cy + 20], 6))
  const s1 = await scene(page)
  assert.ok(Math.abs(s1.place.lon - s0.place.lon) > 1e-5, 'the room moved')
  const after = ground(s1, s1.obstacles[3])
  assert.ok(Math.abs(after.lat - before.lat) < 2e-6 && Math.abs(after.lon - before.lon) < 2e-6, 'the building did not move on the ground')
  await context.close()
})

test('surroundings: a building drawn as a multipolygon of several ways loads, and the query asks for its members', { skip: engine !== chromium }, async () => {
  const relations = JSON.parse(readFileSync(new URL('../fixtures/overpass-relations.json', import.meta.url), 'utf8'))
  // the two relations at Taipei Main Station, each with an outer ring that closes only when its ways are joined
  const station = relations.elements.filter((el) => relations.expected[el.id].ways > 1)
  assert.equal(station.length, 2)
  const { page, context, outside } = await open({ answers: { overpass: JSON.stringify({ elements: station }) } })
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.place = { name: 'Taipei Main Station', lat: 25.0478, lon: 121.517, zone: 'Asia/Taipei' } }))
  await openWizard(page, 3)
  await page.click('#load-buildings')
  await page.click('.modal button.primary')
  await page.waitForFunction(() => window.__sunspill.store.scene.obstacles.length > 0)
  const query = decodeURIComponent(outside[0].body.replace(/^data=/, '').replace(/\+/g, ' '))
  assert.match(query, /relation\["building"\]/)
  assert.match(query, /out geom;$/)
  const s = await scene(page)
  assert.deepEqual(s.obstacles.map((o) => o.id).sort(), station.map((el) => el.id).sort())
  assert.ok(s.obstacles.every((o) => o.ring.length >= 4 && o.src === 'osm'))
  assert.match(await page.locator('.wiz-step').innerText(), /2 buildings are loaded/)
  await context.close()
})

test('surroundings: a tower drawn as stacked parts carries one height label, and no two labels sit on each other', { skip: engine !== chromium }, async () => {
  const { page, context } = await open()
  await openWizard(page, 4)
  await page.evaluate(() => window.__sunspill.store.update((d) => {
    const square = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]
    // five parts of one tower on the same spot, and two separate blocks beside it
    d.obstacles = [64, 42, 35, 32, 26].map((h) => ({ type: 'building', src: 'osm', name: '', ring: square(-60, 20, 70), h, base: 0, est: h % 2 === 0, own: false, on: true }))
    d.obstacles.push({ type: 'building', src: 'osm', name: '', ring: square(40, 20, 50), h: 18, base: 0, est: false, own: false, on: true })
    d.obstacles.push({ type: 'building', src: 'osm', name: '', ring: square(40, -80, 50), h: 22, base: 0, est: true, own: false, on: true })
  }, { history: false }))
  await page.waitForFunction(() => window.__sunspill.map.labelBoxes?.length > 0)
  await page.waitForTimeout(300)
  const boxes = await page.evaluate(() => window.__sunspill.map.labelBoxes)
  assert.ok(boxes.length >= 1 && boxes.length <= 3, `${boxes.length} labels for seven buildings of which five are one tower`)
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]
    const b = boxes[j]
    assert.ok(!(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]), 'two labels overlap')
  }
  await context.close()
})

test('surroundings: with more buildings than fit, the ones above the window are kept, and the page says what was left out', { skip: engine !== chromium }, async () => {
  const center = { lat: 25.0288, lon: 121.5442 }
  const ring = (east, north, size) => [[east, north], [east + size, north], [east + size, north + size], [east, north + size], [east, north]]
    .map(([e, n]) => ({ lat: center.lat + n / 111195, lon: center.lon + e / (111320 * Math.cos((center.lat * Math.PI) / 180)) }))
  // 35 houses of 20 m at 40 m and 35 blocks of 60 m at 150 m: from the ground the houses stand higher in the sky
  const around = (distance, i) => [distance * Math.sin((i / 35) * 2 * Math.PI), distance * Math.cos((i / 35) * 2 * Math.PI)]
  const elements = []
  for (let i = 0; i < 35; i++) {
    const [he, hn] = around(40, i)
    elements.push({ type: 'way', id: 100 + i, tags: { building: 'yes', height: '20' }, geometry: ring(he, hn, 6) })
    const [te, tn] = around(150, i)
    elements.push({ type: 'way', id: 200 + i, tags: { building: 'yes', height: '60' }, geometry: ring(te, tn, 20) })
  }
  const { page, context } = await open({ answers: { overpass: JSON.stringify({ elements }) } })
  await page.evaluate((c) => window.__sunspill.store.update((d) => { d.place = { name: 'Da-an', lat: c.lat, lon: c.lon, zone: 'Asia/Taipei' } }), center)
  await openWizard(page, 4)
  const blocks = async () => (await scene(page)).obstacles.filter((o) => o.h === 60).length
  await page.click('#load-buildings')
  await page.click('.modal button.primary')
  await page.waitForFunction(() => window.__sunspill.store.scene.obstacles.length > 0)
  assert.equal((await scene(page)).obstacles.length, 60)
  assert.equal(await blocks(), 25, 'on the ground floor the houses come first')
  assert.match(await page.locator('#partial-load').innerText(), /^60 of 70 buildings were kept: the ones that rise highest above your window\. The rest rise less than 22 degrees above it/)
  // on the 8th floor the houses are below the window and the blocks are what matters
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.floor.n = 8 }))
  await page.click('#load-buildings')
  await page.waitForFunction(() => window.__sunspill.store.scene.obstacles.filter((o) => o.h === 60).length === 35)
  assert.equal(await blocks(), 35)
  assert.match(await page.locator('#partial-load').innerText(), /^60 of 70 buildings were kept/)
  await context.close()
})

test('facing: the button lines the window wall up with a wall of the building that holds the room, and is hidden with no building', { skip: engine !== chromium }, async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  assert.equal(await page.locator('#align-outline').isVisible(), false)
  // a building 30 by 12 metres turned 17 degrees, with the room inside it
  await page.evaluate(() => window.__sunspill.store.update((d) => {
    const t = (17 * Math.PI) / 180
    const ring = [[-15, -6], [15, -6], [15, 6], [-15, 6]].map(([x, y]) => [x * Math.cos(t) + y * Math.sin(t), -x * Math.sin(t) + y * Math.cos(t)])
    d.obstacles = [{ type: 'building', src: 'manual', ring, h: 20 }]
    d.facing = 0
    d.windows[0].wall = 'top'
  }))
  await page.waitForSelector('#align-outline', { state: 'visible' })
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.facing = 290 }))
  await page.click('#align-outline')
  await page.waitForTimeout(150)
  const f = (await scene(page)).facing
  assert.ok(Math.abs(f - 287) < 0.1, `facing ${f}`)
  assert.match(await page.locator('#toast').innerText(), /Turned 3 degrees/)
  // pressing it again has nothing left to do
  await page.click('#align-outline')
  await page.waitForTimeout(100)
  assert.ok(Math.abs((await scene(page)).facing - 287) < 0.1)
  assert.match(await page.locator('#toast').innerText(), /already follows/)
  await context.close()
})

test('surroundings: estimated heights are marked, editing one clears the mark, and a block to the west takes the afternoon sun', async () => {
  const { page, context } = await open()
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.place = { name: 'Da-an', lat: 25.0288, lon: 121.5442, zone: 'Asia/Taipei' } }))
  await page.evaluate(() => window.__sunspill.consent.set('buildings', true))
  await openWizard(page, 4)
  await page.click('#load-buildings')
  await page.waitForFunction(() => window.__sunspill.store.scene.obstacles.length > 0)
  const est = page.locator('.obstacle-list .tag.est').first()
  assert.equal(await est.innerText(), 'estimated')
  const n0 = await page.locator('.obstacle-list .tag.est').count()
  const input = page.locator('.obstacle-list .card:has(.tag.est) input[type=number]').first()
  await input.fill('31')
  await input.press('Enter')
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.obstacle-list .tag.est').count(), n0 - 1)
  assert.match(await page.locator('.wiz-step').innerText(), /with a guessed height/)
  // a tall block 14 m west of the window, on the ground floor
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.obstacles = []; d.minutes = 16 * 60 + 30 }, { history: false }))
  const open1 = await page.evaluate(() => window.__sunspill.floorArea())
  assert.ok(open1 > 1)
  await page.click('summary:has-text("Add a building by hand")')
  await page.fill('#nb-bearing', '270')
  await page.fill('#nb-dist', '14')
  await page.fill('#nb-width', '60')
  await page.fill('#nb-depth', '15')
  await page.fill('#nb-height', '40')
  await page.click('text=Add this building')
  await page.waitForTimeout(250)
  const s = await scene(page)
  assert.equal(s.obstacles.length, 1)
  assert.equal(s.obstacles[0].src, 'manual')
  assert.equal(await page.evaluate(() => window.__sunspill.floorArea()), 0, 'the block hides the 16:30 sun')
  assert.match(await page.locator('.wiz-step').innerText(), /Direct sun inside on July 15: .* with these, 6 h 15 min without/)
  // switching it off brings the sun back
  await page.uncheck('.obstacle-list input[type=checkbox]')
  await page.waitForTimeout(150)
  assert.ok((await page.evaluate(() => window.__sunspill.floorArea())) > 1)
  // a tree to the south west
  await page.click('summary:has-text("Add a tree")')
  await page.click('text=Add this tree')
  assert.equal((await scene(page)).obstacles.at(-1).type, 'tree')
  await context.close()
})

test('furniture: add a shelf, turn it with the buttons, the handle and the keyboard, and it keeps inside the room', { skip: engine !== chromium }, async () => {
  const { page, context } = await open()
  await openWizard(page, 5)
  await page.click('.chip[data-kind=shelf]')
  let s = await scene(page)
  assert.equal(s.items.at(-1).kind, 'shelf')
  const index = s.items.length - 1
  await page.click('.wiz-step button:has-text("+90°")')
  assert.equal((await scene(page)).items[index].rot, 90)
  await page.click('.wiz-step button:has-text("−15°")')
  assert.equal((await scene(page)).items[index].rot, 75)
  // the handle: drag it straight above the piece, which turns the front to the top of the plan
  const handle = await page.evaluate(() => window.__sunspill.stage.hits.handle.at)
  const box = await page.locator('#canvas').boundingBox()
  const centre = await page.evaluate((i) => {
    const { stage, store } = window.__sunspill
    const it = store.scene.items[i]
    return stage.camera.project(it.x + it.w / 2, it.y + it.d / 2, 0)
  }, index)
  await drag(page, context, line([box.x + handle[0], box.y + handle[1]], [box.x + centre[0] + 2, box.y + centre[1] - 60], 6))
  const rot = (await scene(page)).items[index].rot
  assert.ok(rot === 0 || rot === 360 || rot < 6 || rot > 354, `rot ${rot}`)
  // the keyboard turns by 15 degrees
  await page.focus('#canvas')
  await page.keyboard.press(']')
  assert.equal((await scene(page)).items[index].rot, 15)
  // drag it to a wall: it snaps flush
  const target = await page.evaluate((i) => {
    const { stage, store } = window.__sunspill
    const it = store.scene.items[i]
    return { from: stage.camera.project(it.x + it.w / 2, it.y + it.d / 2, it.h / 2), wall: stage.camera.project(0.2, it.y + it.d / 2, 0) }
  }, index)
  await drag(page, context, line([box.x + target.from[0], box.y + target.from[1]], [box.x + target.wall[0], box.y + target.wall[1]], 10))
  s = await scene(page)
  const it = s.items[index]
  const half = (Math.abs(Math.cos((it.rot * Math.PI) / 180)) * it.w + Math.abs(Math.sin((it.rot * Math.PI) / 180)) * it.d) / 2
  assert.ok(Math.abs(it.x + it.w / 2 - half) < 0.011, `centre ${it.x + it.w / 2}, half ${half}`)
  await context.close()
})

test('check: marked corners agree with the model, a wrong facing is fitted back, and it can be undone', async () => {
  const { page, context } = await open()
  await openWizard(page, 6)
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.date = { month: 7, day: 15 }; d.minutes = 16 * 60 + 30; d.items = [] }, { history: false }))
  await page.waitForTimeout(100)
  await page.click('#mark-toggle')
  // tap the corners of the model patch itself, as if the sun had landed exactly there
  const taps = await page.evaluate(() => {
    const { stage } = window.__sunspill
    const frame = window.__sunspill.frame()
    const poly = frame.patches.floor.slice().sort((a, b) => b.length - a.length)[0]
    return poly.map(([x, y]) => stage.camera.project(x, y, 0))
  })
  const box = await page.locator('#canvas').boundingBox()
  for (const [x, y] of taps) await page.touchscreen.tap(box.x + x, box.y + y)
  assert.match(await page.locator('.wiz-step').innerText(), new RegExp(`${taps.length} points`))
  await page.click('#save-patch')
  let s = await scene(page)
  assert.equal(s.checks.length, 1)
  assert.match(await page.locator('.verdict').innerText(), /^9\d%|^100%/)
  // turn the room 9 degrees, as a bad compass reading would
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.facing += 9 }))
  await page.waitForTimeout(150)
  const worse = await page.locator('.verdict .big').innerText()
  assert.ok(parseInt(worse, 10) < 85, `overlap ${worse}`)
  assert.match(await page.locator('.verdict').innerText(), /patch you marked sits/)
  await page.click('#fit-run')
  await page.waitForSelector('#fit-apply')
  assert.match(await page.locator('.wiz-step').innerText(), /Turn the room by/)
  await page.click('#fit-apply')
  s = await scene(page)
  assert.ok(Math.abs(s.facing - 270) < 1.5, `facing ${s.facing}`)
  assert.ok(parseInt(await page.locator('.verdict .big').innerText(), 10) >= 95)
  // one undo gives the wrong facing back
  await page.click('#wiz-undo')
  assert.ok(Math.abs((await scene(page)).facing - 279) < 0.01)
  await context.close()
})

test('tracing a floor plan: the scale from two taps, three corners and a window give the room', async () => {
  const { page, context, outside } = await open()
  await openWizard(page, 1)
  // a plan 800 by 600 pixels: the room is 4 by 3 metres at 100 pixels a metre
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 800
    c.height = 600
    const g = c.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 800, 600)
    g.strokeStyle = '#000'
    g.lineWidth = 6
    g.strokeRect(200, 100, 400, 300)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    const buf = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (const b of buf) bin += String.fromCharCode(b)
    return btoa(bin)
  })
  await page.click('#trace-open')
  await page.waitForSelector('.pic-canvas')
  await page.setInputFiles('.wiz-step input[type=file]', { name: 'plan.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await page.waitForSelector('text=Tap two points whose real distance')
  const box = await page.locator('.pic-canvas').boundingBox()
  const k = Math.min(box.width / 800, box.height / 600)
  const at = ([x, y]) => [box.x + (box.width - 800 * k) / 2 + x * k, box.y + (box.height - 600 * k) / 2 + y * k]
  const tap = async (p) => {
    const [sx, sy] = at(p)
    await page.touchscreen.tap(sx, sy)
  }
  await tap([200, 100])
  await tap([600, 100])
  await page.fill('#trace-distance', '4')
  await page.click('text=Set the scale')
  await tap([200, 400])
  await tap([600, 400])
  await tap([600, 100])
  assert.match(await page.locator('.wiz-step .big-line').innerText(), /Room: 4(\.0\d)? m by 3(\.0\d)? m/)
  await page.click('.wiz-step button:has-text("Next")')
  // a window along the top edge of the picture, from 3 m to 5 m
  await tap([300, 100])
  await tap([500, 100])
  assert.match(await page.locator('.wiz-step .spot').innerText(), /Window, Top wall: (1|0\.99|1\.01) m from the left end, 2(\.0\d)? m wide/)
  await page.click('text=Use this room')
  const s = await scene(page)
  assert.ok(Math.abs(s.room.w - 4) < 0.03 && Math.abs(s.room.d - 3) < 0.03, `${s.room.w} x ${s.room.d}`)
  assert.equal(s.windows.length, 1)
  assert.equal(s.windows[0].wall, 'top')
  assert.ok(Math.abs(s.windows[0].pos - 1) < 0.04 && Math.abs(s.windows[0].w - 2) < 0.04)
  assert.deepEqual(outside, [], 'the picture never left the page')
  await context.close()
})

test('every language shows the whole setup with no message key showing through', async () => {
  const { page, context } = await open()
  const codes = await page.evaluate(() => [...document.querySelectorAll('#lang option')].map((o) => o.value))
  assert.equal(codes.length, 9)
  const english = {}
  for (const code of codes) {
    await page.selectOption('#lang', code)
    await openWizard(page)
    const titles = []
    for (let i = 0; i < 7; i++) {
      titles.push(await title(page))
      const text = await page.locator('#wizard').innerText()
      assert.doesNotMatch(text, /\b(wiz|trace|net|map|compass|tpl|kind)\.[a-z]/i, `${code} step ${i + 1} shows a key`)
      assert.doesNotMatch(text, /\{\w+\}/, `${code} step ${i + 1} shows a placeholder`)
      assert.equal(await noSideways(page), true, `${code} step ${i + 1} scrolls sideways`)
      if (i < 6) await page.click('#wiz-next')
    }
    if (code === 'en') english.titles = titles
    else assert.notDeepEqual(titles, english.titles, `${code} is still in English`)
    await page.click('#wiz-exit')
  }
  await context.close()
})

test('the sheet traps the focus and gives it back', async () => {
  const { page, context } = await open()
  await openWizard(page)
  await page.focus('#place-q')
  await page.fill('#place-q', 'Taipei')
  await page.press('#place-q', 'Enter')
  await page.waitForSelector('.modal')
  const first = await page.evaluate(() => document.activeElement.textContent)
  assert.equal(first, 'Not now')
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Allow')
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Not now', 'Tab stays inside the sheet')
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => document.activeElement.id), 'place-q')
  await context.close()
})

test('a dark phone, a wide phone and a tablet keep the setup usable', async () => {
  for (const viewport of [{ width: 320, height: 640 }, { width: 430, height: 932 }, { width: 820, height: 1180 }]) {
    const { page, context } = await open({ viewport })
    await openWizard(page, 2)
    assert.equal(await noSideways(page), true, `${viewport.width}: sideways scroll`)
    const next = await page.locator('#wiz-next').boundingBox()
    assert.ok(next.y + next.height <= viewport.height, `${viewport.width}: next button at ${next.y}`)
    const stage = await page.locator('#stage').boundingBox()
    assert.ok(stage.height > 150, `${viewport.width}: the view is ${stage.height} px`)
    await context.close()
  }
})

test('the room you edited comes back next time, a friend\'s link does not replace it, and Start over forgets it', async () => {
  const { page, context } = await open()
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 4.4; d.windows[0].w = 2.2 }))
  await page.waitForTimeout(500)
  assert.match(await page.evaluate(() => localStorage.getItem('sunspill.room')), /^r2=/)
  // the page opened again with no link in the address
  await page.goto(site.url)
  await page.waitForSelector('html[data-ready]')
  assert.equal((await scene(page)).room.w, 4.4)
  assert.match(await page.locator('#toast').innerText(), /last room was brought back/)
  assert.equal((await ui(page)).playing, false, 'a room that comes back does not start playing')
  // somebody else's link opens their room and leaves yours in the store
  const theirs = await page.evaluate(() => {
    const s = structuredClone(window.__sunspill.store.scene)
    s.room.w = 7
    return location.origin + location.pathname + '#' + window.__sunspill.encode(s)
  })
  await page.goto(theirs)
  await page.waitForSelector('html[data-ready]')
  assert.equal((await scene(page)).room.w, 7)
  await page.waitForTimeout(500)
  await page.goto(site.url)
  await page.waitForSelector('html[data-ready]')
  assert.equal((await scene(page)).room.w, 4.4, 'viewing a link does not overwrite your room')
  // Start over forgets it
  await page.click('#tab-share')
  await page.click('text=Start over')
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => localStorage.getItem('sunspill.room')), null)
  await page.goto(site.url)
  await page.waitForSelector('html[data-ready]')
  assert.equal((await scene(page)).room.w, 3.6)
  await context.close()
})

test('the check step starts from today, and corners can be typed for a keyboard or a screen reader', async () => {
  const { page, context } = await open()
  await openWizard(page, 6)
  const today = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' }).formatToParts(new Date())
    return { month: Number(parts.find((p) => p.type === 'month').value), day: Number(parts.find((p) => p.type === 'day').value) }
  })
  const s0 = await scene(page)
  assert.deepEqual({ month: s0.date.month, day: s0.date.day }, today, 'not the 15 July of the sample')
  await page.click('summary:has-text("Add a corner by typing its distances")')
  for (const [x, y] of [['0.6', '2.5'], ['1.8', '2.5'], ['1.8', '3.9']]) {
    await page.fill('#corner-x', x)
    await page.fill('#corner-y', y)
    await page.click('#corner-add')
  }
  assert.match(await page.locator('.wiz-step').innerText(), /3 points/)
  await page.click('#save-patch')
  const s = await scene(page)
  assert.equal(s.checks.length, 1)
  assert.deepEqual(s.checks[0].poly, [[0.6, 2.5], [1.8, 2.5], [1.8, 3.9]])
  // marks that were not saved survive a trip to the step before and back
  await page.click('#mark-toggle')
  await page.fill('#corner-x', '2.5')
  await page.fill('#corner-y', '1')
  await page.click('#corner-add')
  await page.click('#wiz-back')
  await page.click('#wiz-next')
  assert.match(await page.locator('.wiz-step').innerText(), /1 points/)
  await context.close()
})

test('the list opens for a building picked on the map, and what was drawn by hand survives loading', async () => {
  const { page, context } = await open()
  await page.evaluate(() => {
    const s = window.__sunspill
    s.store.update((d) => {
      d.place = { name: 'Da-an', lat: 25.0288, lon: 121.5442, zone: 'Asia/Taipei' }
      d.obstacles = [{ type: 'tree', src: 'manual', x: -9, y: 5, r: 2.5, h: 9, base: 2 }]
    })
    s.consent.set('buildings', true)
  })
  await openWizard(page, 4)
  await page.click('#load-buildings')
  await page.waitForFunction(() => window.__sunspill.store.scene.obstacles.length > 20)
  const after = await scene(page)
  assert.equal(after.obstacles.filter((o) => o.src === 'manual').length, 1, 'the tree stays')
  assert.ok(after.obstacles.length <= 80)
  assert.equal(await page.locator('.obstacle-list [data-obstacle="12"]').count(), 0, 'only the first few have a card')
  await page.evaluate(() => window.__sunspill.map.on.select(12))
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.obstacle-list [data-obstacle="12"]').count(), 1, 'now the building has a card to edit')
  await context.close()
})

test('on the map in the facing step the keyboard moves the room and turns it', async () => {
  const { page, context } = await open()
  await openWizard(page, 3)
  const before = await scene(page)
  await page.focus('.map-canvas')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowUp')
  const moved = await scene(page)
  // half a metre east and half a metre north
  assert.ok(Math.abs((moved.place.lon - before.place.lon) * 111320 * Math.cos((25.033 * Math.PI) / 180) - 0.5) < 0.02)
  assert.ok(Math.abs((moved.place.lat - before.place.lat) * 110750 - 0.5) < 0.02)
  await page.keyboard.press(']')
  assert.equal((await scene(page)).facing, before.facing + 1)
  await page.keyboard.press('Shift+]')
  assert.equal((await scene(page)).facing, before.facing + 16)
  await context.close()
})

test('the map shows where the sun is and tints the buildings that shade a window at that time', async () => {
  const { page, context } = await open()
  await page.evaluate(() => {
    const s = window.__sunspill
    s.store.update((d) => {
      d.place = { name: 'x', lat: 25.0288, lon: 121.5442, zone: 'Asia/Taipei' }
      d.facing = 270
      d.date = { month: 7, day: 15 }
      d.minutes = 16 * 60 + 30
      d.floor = { n: 1, storey: 3 }
      d.obstacles = [{ type: 'building', src: 'manual', ring: [[-12, -20], [-12, 20], [-28, 20], [-28, -20]], h: 25, base: 0 }, { type: 'building', src: 'manual', ring: [[30, -10], [30, 10], [50, 10], [50, -10]], h: 25, base: 0 }]
    })
  })
  await openWizard(page, 4)
  // the block to the west is in the way of a 16:30 sun, the one to the east is not
  assert.match(await page.locator('#shade-now').innerText(), /At 16:30, 1 of these put their shadow on a window/)
  assert.deepEqual(await page.evaluate(() => [...window.__sunspill.map.sunNow().shading]), [0])
  // the clock moves the sun: at 9:00 the sun is in the east, where the second block stands
  await page.locator('#map-time').evaluate((el) => { el.value = 9 * 60; el.dispatchEvent(new Event('input', { bubbles: true })) })
  await page.waitForTimeout(200)
  assert.equal((await scene(page)).minutes, 540)
  assert.match(await page.locator('#shade-now').innerText(), /At 09:00/)
  assert.equal(await page.locator('.map-time').innerText(), '09:00')
  await context.close()
})

test('typed coordinates bring their time zone and the afternoon months along, and a far move says the loaded buildings went', async () => {
  const { page, context } = await open()
  await page.evaluate(() => window.__sunspill.store.update((d) => {
    d.obstacles = [{ type: 'building', src: 'osm', ring: [[20, 10], [40, 10], [40, 30], [20, 30]], h: 20, hEstimated: true }]
  }))
  await openWizard(page)
  await page.click('summary:has-text("Edit name, coordinates or time zone")')
  const numbers = page.locator('.wiz-step details input[type=number]')
  await numbers.nth(0).fill('35.68')
  await numbers.nth(0).dispatchEvent('change')
  await numbers.nth(1).fill('139.69')
  await numbers.nth(1).dispatchEvent('change')
  let s = await scene(page)
  assert.equal(s.place.zone, 'Asia/Tokyo', 'Tokyo is not on Taipei time')
  assert.equal(s.obstacles.length, 0, 'the buildings of the old spot went')
  await page.waitForTimeout(50)
  assert.match(await page.locator('#toast').innerText(), /buildings loaded for the old spot were removed/)
  assert.deepEqual([(await ui(page)).west.from, (await ui(page)).west.to], [6, 9])
  // a small nudge in the same zone leaves the zone and the months alone
  await page.evaluate(() => window.__sunspill.store.setUi({ west: { ...window.__sunspill.store.ui.west, from: 7, to: 8 } }))
  await numbers.nth(0).fill('35.6801')
  await numbers.nth(0).dispatchEvent('change')
  s = await scene(page)
  assert.equal(s.place.zone, 'Asia/Tokyo')
  assert.equal((await ui(page)).west.from, 7)
  // across the equator the months of the afternoon check turn around
  await numbers.nth(0).fill('-33.87')
  await numbers.nth(0).dispatchEvent('change')
  await numbers.nth(1).fill('151.21')
  await numbers.nth(1).dispatchEvent('change')
  s = await scene(page)
  assert.equal(s.place.zone, 'Australia/Sydney')
  assert.deepEqual([(await ui(page)).west.from, (await ui(page)).west.to], [12, 3])
  // the Place tab has the same boxes
  await page.click('#wiz-exit')
  await page.click('#tab-place')
  const tab = page.locator('#tab-body input[type=number]')
  await tab.nth(0).fill('51.5')
  await tab.nth(0).dispatchEvent('change')
  await tab.nth(1).fill('-0.12')
  await tab.nth(1).dispatchEvent('change')
  assert.equal((await scene(page)).place.zone, 'Europe/London')
  await context.close()
})

test('editing a friend\'s link sets your own room aside, and the Share tab brings it back', async () => {
  const { page, context } = await open()
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 4.4 }))
  await page.waitForTimeout(500)
  const theirs = await page.evaluate(() => {
    const s = structuredClone(window.__sunspill.store.scene)
    s.room.w = 7
    return location.origin + location.pathname + '#' + window.__sunspill.encode(s)
  })
  // the link opened in a tab of its own
  const other = await context.newPage()
  await other.goto(theirs)
  await other.waitForSelector('html[data-ready]')
  assert.equal((await scene(other)).room.w, 7)
  assert.equal(await other.evaluate(() => localStorage.getItem('sunspill.room.earlier')), null, 'looking does not touch anything')
  // the first edit says what became of the room that was kept
  await other.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 6 }))
  assert.match(await other.locator('#toast').innerText(), /Your own room is kept/)
  await other.waitForTimeout(500)
  assert.match(await other.evaluate(() => localStorage.getItem('sunspill.room.earlier')), /^r2=/)
  await other.close()
  await page.goto(site.url)
  await page.waitForSelector('html[data-ready]')
  assert.equal((await scene(page)).room.w, 6, 'the edited room is the one kept now')
  await page.click('#tab-share')
  await page.click('#bring-back')
  assert.equal((await scene(page)).room.w, 4.4, 'your own room is back')
  await page.waitForTimeout(500)
  await page.goto(site.url)
  await page.waitForSelector('html[data-ready]')
  assert.equal((await scene(page)).room.w, 4.4, 'and it is the one kept')
  // the button swaps, so a second press returns to the other one
  await page.click('#tab-share')
  await page.click('#bring-back')
  assert.equal((await scene(page)).room.w, 6)
  await page.waitForTimeout(500)
  // a link pasted into the tab where you have been editing does not take your room either
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 3.9 }))
  await page.waitForTimeout(500)
  await page.goto(theirs)
  assert.equal((await scene(page)).room.w, 7)
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => new URLSearchParams(localStorage.getItem('sunspill.room')).has('r2')), true)
  await page.goto(site.url)
  await page.waitForSelector('html[data-ready]')
  assert.equal((await scene(page)).room.w, 3.9, 'looking at a pasted link keeps the room you had')
  // Start over forgets both
  await page.click('#tab-share')
  await page.click('text=Start over')
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => localStorage.getItem('sunspill.room.earlier')), null)
  // with no room of your own there is nothing to set aside, and no button
  const fresh = await open({ hash: new URL(theirs).hash })
  await fresh.page.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 6 }))
  assert.equal(await fresh.page.locator('#toast').innerText(), '', 'no message when nothing is set aside')
  await fresh.page.waitForTimeout(500)
  assert.equal(await fresh.page.evaluate(() => localStorage.getItem('sunspill.room.earlier')), null)
  await fresh.page.click('#tab-share')
  assert.equal(await fresh.page.locator('#bring-back').isVisible(), false)
  await fresh.context.close()
  await context.close()
})

test('leaving the setup with marks that were not saved asks first, and a plain exit does not', async () => {
  const { page, context } = await open()
  await openWizard(page, 6)
  await page.click('#wiz-exit')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.wizard), undefined, 'nothing to lose, so it closes at once')
  await openWizard(page, 6)
  await page.click('summary:has-text("Add a corner by typing its distances")')
  for (const [x, y] of [['0.6', '2.5'], ['1.8', '2.5']]) {
    await page.fill('#corner-x', x)
    await page.fill('#corner-y', y)
    await page.click('#corner-add')
  }
  await page.click('#wiz-exit')
  assert.match(await page.locator('.modal').innerText(), /not saved yet and will be lost/)
  await page.click('.modal button.primary') // Keep working
  assert.equal(await page.evaluate(() => document.documentElement.dataset.wizard), '1')
  assert.match(await page.locator('#wiz-next').innerText(), /Finish/)
  await page.click('#wiz-next') // Finish asks the same
  await page.click('#leave-anyway')
  await page.waitForFunction(() => !document.documentElement.dataset.wizard)
  assert.equal((await ui(page)).setupDone, true, 'finishing counts after the question')
  await context.close()
})

test('a box that belongs to a window which was just removed does nothing and does not throw', async () => {
  const { page, context, errors } = await open()
  await openWizard(page, 2)
  await page.evaluate(() => {
    const { store } = window.__sunspill
    const card = document.querySelector('[data-window="0"]')
    const box = card.querySelectorAll('input[type=number]')[1]
    const roof = document.getElementById('roof0')
    store.update((d) => { d.windows.splice(0, 1) })
    // both events arrive before the cards are drawn again
    box.value = '1'
    box.dispatchEvent(new Event('change'))
    roof.click()
  })
  await page.waitForTimeout(200)
  assert.deepEqual(errors, [])
  assert.equal((await scene(page)).windows.length, 0)
  await context.close()
})

test('the room set aside survives quick moves: a save that is waiting, Start over, a pasted link and the Share tab button', async () => {
  const { page, context } = await open()
  const code = (w) => page.evaluate((width) => {
    const s = structuredClone(window.__sunspill.store.scene)
    s.room.w = width
    return window.__sunspill.encode(s)
  }, w)
  const [mine, older, theirs] = [await code(4.4), await code(5.5), await code(7)]
  const store = (keys) => page.evaluate((k) => Object.fromEntries(Object.entries(k).map(([a, b]) => [a, localStorage.getItem(b)])), keys)
  const width = async () => (await scene(page)).room.w
  const widthOf = (raw) => page.evaluate((r) => window.__sunspill.decode('#' + r).room.w, raw)
  await page.evaluate(([a, e]) => { localStorage.setItem('sunspill.room', a); localStorage.setItem('sunspill.room.earlier', e) }, [mine, older])

  // 1. the first edit of a link and the button pressed in the same moment: your own room is what comes back
  await page.goto(site.url + '#' + theirs)
  await page.reload()
  await page.waitForSelector('html[data-ready]')
  assert.equal(await width(), 7)
  await page.click('#tab-share')
  assert.equal(await page.locator('#bring-back').isVisible(), true)
  await page.evaluate(() => {
    window.__sunspill.store.update((d) => { d.room.w = 6 })
    document.getElementById('bring-back').click()
  })
  assert.equal(await width(), 4.4, 'the room that was set aside is the one brought back, not an older one')
  await page.waitForTimeout(500)
  const kept = await store({ room: 'sunspill.room', earlier: 'sunspill.room.earlier' })
  assert.equal(await widthOf(kept.room), 4.4)
  assert.equal(await widthOf(kept.earlier), 6, 'the edited link room waits in the other slot')

  // 2. Start over with a room set aside leaves nothing behind, even after the next edit
  await page.goto(site.url + '#' + theirs)
  await page.reload()
  await page.waitForSelector('html[data-ready]')
  await page.evaluate(([a]) => { localStorage.setItem('sunspill.room', a); localStorage.removeItem('sunspill.room.earlier') }, [mine])
  await page.reload()
  await page.waitForSelector('html[data-ready]')
  await page.click('#tab-share')
  await page.click('text=Start over')
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 3 }))
  await page.waitForTimeout(500)
  assert.equal((await store({ earlier: 'sunspill.room.earlier' })).earlier, null)

  // 3. a link pasted into the tab right after an edit: the edit is kept first, then set aside
  await page.evaluate(([a]) => { localStorage.setItem('sunspill.room', a); localStorage.removeItem('sunspill.room.earlier') }, [mine])
  await page.goto(site.url)
  await page.waitForSelector('html[data-ready]')
  await page.evaluate((link) => {
    window.__sunspill.store.update((d) => { d.room.w = 4.8 })
    location.hash = '#' + link
  }, theirs)
  await page.waitForFunction(() => window.__sunspill.store.scene.room.w === 7)
  await page.waitForTimeout(500)
  assert.equal(await widthOf((await store({ room: 'sunspill.room' })).room), 4.8, 'the edit made a moment before the paste was kept')

  // 4. the button shows up as soon as the room is set aside, with the Share tab already open
  await page.evaluate(([a]) => { localStorage.setItem('sunspill.room', a); localStorage.removeItem('sunspill.room.earlier') }, [mine])
  await page.goto(site.url + '#' + theirs)
  await page.reload()
  await page.waitForSelector('html[data-ready]')
  await page.click('#tab-share')
  assert.equal(await page.locator('#bring-back').isVisible(), false)
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 6.5 }))
  await page.waitForTimeout(700)
  assert.equal(await page.locator('#bring-back').isVisible(), true)
  await context.close()
})

test('a photo of the floor that is half way through counts as unsaved when leaving the setup', { skip: engine !== chromium }, async () => {
  const { page, context } = await open()
  await openWizard(page, 6)
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 400
    c.height = 300
    c.getContext('2d').fillRect(0, 0, 400, 300)
    const buf = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer())
    let bin = ''
    for (const b of buf) bin += String.fromCharCode(b)
    return btoa(bin)
  })
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#photo-open')])
  await chooser.setFiles({ name: 'floor.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await page.waitForSelector('.pic-canvas')
  const box = await page.locator('.pic-canvas').boundingBox()
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await page.click('#wiz-exit')
  assert.match(await page.locator('.modal').innerText(), /not saved yet/)
  await page.click('.modal button.primary')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.wizard), '1')
  await context.close()
})

test('on a phone every box is at least 16 pixels high text, so Safari does not zoom in, and nothing sticks out at 320 pixels', { skip: engine !== chromium }, async () => {
  const { page, context } = await open({ locale: 'fr', viewport: { width: 320, height: 640 } })
  const small = () => page.evaluate(() => [...document.querySelectorAll('input:not([type=range]):not([type=checkbox]), select, textarea')].filter((e) => e.offsetParent).map((e) => [e.id || e.type, parseFloat(getComputedStyle(e).fontSize)]).filter(([, px]) => px < 16))
  const sticksOut = () => page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => {
    if (e.closest('[role=tablist], .skip, canvas, svg') || !e.offsetParent) return false
    return e.getBoundingClientRect().right > document.documentElement.clientWidth + 1
  }).map((e) => e.id || e.className || e.tagName))
  for (const tab of ['room', 'place', 'things', 'results', 'share']) {
    await page.click(`#tab-${tab}`)
    assert.deepEqual(await small(), [], `tab ${tab}`)
    assert.deepEqual(await sticksOut(), [], `tab ${tab}`)
    assert.equal(await noSideways(page), true, `tab ${tab}`)
  }
  await openWizard(page)
  for (let i = 0; i < 7; i++) {
    assert.deepEqual(await small(), [], `step ${i + 1}`)
    assert.deepEqual(await sticksOut(), [], `step ${i + 1}`)
    assert.equal(await noSideways(page), true, `step ${i + 1}`)
    if (i < 6) await page.click('#wiz-next')
  }
  await context.close()
})

test('a new piece of furniture lands on free floor and two of a kind are told apart', async () => {
  const { page, context } = await open()
  await openWizard(page, 5)
  const before = (await scene(page)).items.length
  await page.click('.chip[data-kind=desk]')
  await page.click('.chip[data-kind=desk]')
  const s = await scene(page)
  assert.equal(s.items.length, before + 2)
  const boxes = s.items.map((it) => [it.x, it.y, it.x + it.w, it.y + it.d])
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]]
      assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `piece ${i} and ${j} overlap`)
    }
  }
  for (const it of s.items) assert.ok(it.x >= 0 && it.y >= 0 && it.x + it.w <= s.room.w + 1e-9 && it.y + it.d <= s.room.d + 1e-9)
  const names = await page.locator('.item-list .chip').allInnerTexts()
  assert.ok(names.includes('Desk 1') && names.includes('Desk 2'), names.join(', '))
  assert.ok(names.includes('Bed'), 'a single piece keeps its plain name')
  await context.close()
})

test('the check step starts in the middle of the day when it is night, and says so when the sun is down', async () => {
  const { page, context } = await open()
  // 04:00 in Taipei
  await page.clock.setFixedTime(new Date('2026-10-09T20:00:00Z'))
  await openWizard(page, 6)
  const s = await scene(page)
  assert.deepEqual([s.date.month, s.date.day], [10, 10])
  assert.ok(s.minutes > 10 * 60 && s.minutes < 13 * 60, `the clock starts at ${s.minutes}`)
  assert.equal(await page.locator('#check-night').innerText(), '')
  await page.fill('.wiz-step input[type=time]', '03:00')
  await page.dispatchEvent('.wiz-step input[type=time]', 'change')
  assert.match(await page.locator('#check-night').innerText(), /below the horizon/)
  await context.close()
})

test('with no sun on the floor all day the surroundings step says so', async () => {
  const { page, context } = await open()
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.date.month = 12; d.date.day = 21; d.facing = 0 }))
  await openWizard(page, 4)
  assert.match(await page.locator('#no-sun').innerText(), /No direct sun reaches the floor/)
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.facing = 180; d.windows[0].eave.depth = 0; d.windows[0].balcony = null }))
  await page.waitForFunction(() => document.querySelector('#no-sun').textContent === '')
  await context.close()
})

test('saved rooms: name two rooms, they survive a reload, opening one sets the other aside, delete asks twice, and a full or refusing browser says so', { skip: engine !== chromium }, async () => {
  const { page, context, errors } = await open({ viewport: { width: 390, height: 844 } })
  const share = async () => {
    await page.click('#tab-share')
    await page.waitForSelector('#saved-name')
  }
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.facing = 90; d.place = { name: 'Zhongxiao', lat: 25.0418, lon: 121.5436, zone: 'Asia/Taipei' } }))
  await share()
  assert.match(await page.locator('.saved-list').innerText(), /Nothing saved yet/)
  await page.click('#saved-save')
  assert.match(await page.locator('.saved .note[role=status]').innerText(), /Give the room a name first/)
  await page.fill('#saved-name', 'Flat A, bedroom')
  await page.click('#saved-save')
  assert.match(await page.locator('.saved-list').innerText(), /Flat A, bedroom/)
  assert.match(await page.locator('.saved-list').innerText(), /Zhongxiao, 3\.6 m by 4\.4 m/)
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.facing = 200; d.room.w = 4.2 }))
  await page.fill('#saved-name', 'Flat B')
  await page.click('#saved-save')
  assert.equal(await page.locator('.saved-row').count(), 2)
  assert.match(await page.locator('.saved-row').first().innerText(), /Flat B/, 'newest first')
  // the same name again replaces that room and does not add one
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 4.4 }))
  await page.fill('#saved-name', 'flat b')
  await page.click('#saved-save')
  assert.equal(await page.locator('.saved-row').count(), 2)
  await page.waitForTimeout(900)
  await page.reload()
  await page.waitForSelector('html[data-ready]')
  await share()
  assert.equal(await page.locator('.saved-row').count(), 2, 'both are still there after a reload')
  assert.equal((await scene(page)).facing, 200, 'the room last edited came back')
  // open Flat A: it replaces the room on the page, and the room that was open is set aside
  await page.locator('.saved-row', { hasText: 'Flat A' }).getByRole('button', { name: 'Open' }).click()
  await page.waitForFunction(() => window.__sunspill.store.scene.facing === 90)
  assert.equal((await scene(page)).room.w, 3.6)
  await page.waitForSelector('#bring-back', { state: 'visible' })
  await page.click('#bring-back')
  await page.waitForFunction(() => window.__sunspill.store.scene.facing === 200)
  assert.equal((await scene(page)).room.w, 4.4, 'Flat B as it was replaced')
  // delete asks a second time
  const row = page.locator('.saved-row', { hasText: 'Flat A' })
  await row.getByRole('button', { name: 'Delete' }).click()
  assert.equal(await page.locator('.saved-row').count(), 2)
  await row.getByRole('button', { name: 'Delete it?' }).click()
  assert.equal(await page.locator('.saved-row').count(), 1)
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sunspill.saved')).length), 1)
  // twelve at most
  const results = await page.evaluate(() => Array.from({ length: 12 }, (_, i) => window.__sunspill.panelActions.saveRoom(`Room ${i}`)))
  assert.deepEqual(results.slice(0, 11), Array(11).fill('saved'))
  assert.equal(results[11], 'full')
  await share()
  await page.fill('#saved-name', 'One more')
  await page.click('#saved-save')
  assert.match(await page.locator('.saved .note[role=status]').innerText(), /Twelve rooms are saved/)
  // a browser that refuses to keep anything
  await page.evaluate(() => window.__sunspill.panelActions.deleteRoom(0))
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota') } })
  await page.fill('#saved-name', 'Refused')
  await page.click('#saved-save')
  assert.match(await page.locator('.saved .note[role=status]').innerText(), /would not keep the room/)
  assert.deepEqual(errors, [])
  await context.close()
})

test('the room step shows the floor area, with ping (坪) on the Traditional Chinese page', async () => {
  const en = await open()
  await openWizard(en.page, 1)
  assert.equal(await en.page.locator('#floor-area').innerText(), 'Floor area: 15.8 m².')
  await en.page.click('[data-template="studio"]')
  assert.match(await en.page.locator('#floor-area').innerText(), /^Floor area: \d+(\.\d)? m²\.$/)
  await en.context.close()
  const zh = await open({ locale: 'zh-TW' })
  await openWizard(zh.page, 1)
  assert.equal(await zh.page.locator('#floor-area').innerText(), '地板面積：15.8 m²（約 4.8 坪）。')
  await zh.context.close()
})
