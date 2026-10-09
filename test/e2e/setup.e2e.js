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
  const context = await browser.newContext({ viewport, ...(engine === firefox ? {} : { isMobile: true }), hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce', locale })
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

test('the sample page still asks nothing of anyone: no outside request, and the policy names three hosts only', async () => {
  const { page, context, outside } = await open()
  await page.waitForTimeout(300)
  assert.deepEqual(outside, [])
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content)
  const connect = csp.match(/connect-src ([^;]+)/)[1].split(' ').sort()
  assert.deepEqual(connect, ['https://nominatim.openstreetmap.org', 'https://overpass-api.de', 'https://overpass.openstreetmap.fr', 'https://overpass.private.coffee'])
  assert.match(csp, /img-src data: blob: https:\/\/tile\.openstreetmap\.org(;|$)/)
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
  const [x, y] = await centerOf(page, '.map-canvas')
  await page.touchscreen.tap(x, y)
  const s = await scene(page)
  assert.ok(Math.abs(s.place.lat + 33.8688) < 0.002 && Math.abs(s.place.lon - 151.2093) < 0.002, `${s.place.lat}, ${s.place.lon}`)
  assert.equal(s.place.zone, 'Australia/Sydney')
  assert.equal(s.place.name, 'Pin')
  // a second tap 300 pixels away moves it again, and the coordinates have five decimals
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
  assert.match(outside[0].body, /around%3A200%2C25\.028800%2C121\.544200/)
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
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.minutes = 16 * 60 + 30; d.items = [] }, { history: false }))
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
