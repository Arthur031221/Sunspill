import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, firefox, webkit } from 'playwright'
import { readFileSync } from 'node:fs'
import { serve } from '../serve.js'
import { decodeGif } from '../helpers/gif-decode.js'

const engine = { firefox, webkit }[process.env.BROWSER] ?? chromium
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

// Playwright's Firefox sometimes stops answering about five loads in a hundred once the page has installed its
// offline worker. A real Firefox 157 never did in 300 first visits, and neither did Playwright's own Firefox
// binary started without its automation layer in 150, so the worker is left out there. Chromium keeps it and
// the offline test runs there.
const workers = engine === firefox ? 'block' : 'allow'

async function open(options = {}, hash = '') {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true, locale: 'en-GB', serviceWorkers: workers, ...options })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(site.url + hash)
  await page.waitForSelector('html[data-ready]')
  return { page, context, errors }
}

const scene = (page) => page.evaluate(() => structuredClone(window.__sunspill.store.scene))
const ui = (page) => page.evaluate(() => structuredClone(window.__sunspill.store.ui))
/** Total sunlit floor area in square metres, from the same frame the canvas shows. */
const floorArea = (page) => page.evaluate(() => window.__sunspill.floorArea())

test('opens with the sample room, nothing else is fetched and the console is clean', async () => {
  const { page, context, errors } = await open()
  assert.deepEqual(site.seen.filter((u) => !['/', '/sw.js', '/manifest.webmanifest', '/icon-192.png'].includes(u)), [], 'only the page, its offline worker, its install manifest and its icon are ever requested')
  assert.equal((await scene(page)).place.name, 'Taipei')
  assert.deepEqual(errors, [])
  await context.close()
})

test('the sun is already moving on the first screen unless motion is reduced', async () => {
  const moving = await open({ reducedMotion: 'no-preference' })
  const a = (await scene(moving.page)).minutes
  await moving.page.waitForTimeout(1500)
  const b = (await scene(moving.page)).minutes
  assert.notEqual(a, b)
  assert.equal((await ui(moving.page)).playing, true)
  await moving.context.close()
  const still = await open({ reducedMotion: 'reduce' })
  assert.equal((await ui(still.page)).playing, false)
  await still.context.close()
})

test('the drawn patch is where the geometry says it is', async () => {
  const { page, context } = await open()
  const probe = await page.evaluate(() => {
    const { stage, store } = window.__sunspill
    const frame = window.__sunspill.frame()
    const poly = frame.patches.floor.sort((a, b) => b.length - a.length)[0]
    const inside = (x, y) => poly.every((p, i) => {
      const q = poly[(i + 1) % poly.length]
      return Math.sign((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])) === Math.sign(area(poly)) || Math.abs((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])) < 1e-9
    })
    const area = (pts) => pts.reduce((s, p, i) => s + (p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1]), 0)
    const covered = (x, y) => store.scene.items.some((it) => x > it.x - 0.15 && x < it.x + it.w + 0.15 && y > it.y - 0.15 && y < it.y + it.d + 0.15)
    let point = null
    for (let x = 0.05; x < store.scene.room.w && !point; x += 0.1) for (let y = 0.05; y < store.scene.room.d && !point; y += 0.1) if (inside(x, y) && !covered(x, y)) point = [x, y]
    const read = (px, py) => {
      const [sx, sy] = stage.camera.project(px, py, 0)
      return [...stage.ctx.getImageData(Math.round(sx * stage.dpr), Math.round(sy * stage.dpr), 1, 1).data]
    }
    return { lit: read(...point), dark: read(3.4, 0.2) }
  })
  assert.ok(probe.lit[0] > 235 && probe.lit[1] > 170 && probe.lit[2] < 130, `inside the patch: ${probe.lit}`)
  assert.ok(probe.dark[2] > probe.lit[2] + 40, `outside the patch: ${probe.dark}`)
  await context.close()
})

test('scrubbing the day with the keyboard moves the sun and the patch', async () => {
  const { page, context } = await open()
  const before = await floorArea(page)
  await page.focus('.rail input[type=range]')
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight')
  const s = await scene(page)
  assert.equal(s.minutes, 990 + 60)
  assert.ok((await floorArea(page)) !== before)
  await page.waitForFunction(() => document.querySelector('.clock .time').textContent === '17:30')
  await context.close()
})

test('typing a room width updates the scene, the link and the undo trail', async () => {
  const { page, context } = await open()
  const input = page.locator('#tab-body .field input[type=number]').first()
  await input.fill('5')
  await input.press('Enter')
  assert.equal((await scene(page)).room.w, 5)
  await page.waitForTimeout(450)
  assert.match(await page.evaluate(() => location.hash), /^#r2=/)
  await page.click('#undo')
  assert.equal((await scene(page)).room.w, 3.6)
  await page.click('#redo')
  assert.equal((await scene(page)).room.w, 5)
  await context.close()
})

test('a 90 cm shade over the west window shrinks the afternoon patch', async () => {
  const { page, context } = await open()
  const bare = await floorArea(page)
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.windows[0].eave.depth = 0.9; d.windows[0].eave.gap = 0 }))
  const shaded = await floorArea(page)
  assert.ok(shaded < bare * 0.8, `${shaded} vs ${bare}`)
  await context.close()
})

test('plan view lays the room flat and the 3D view comes back', async () => {
  const { page, context } = await open()
  await page.click('#view button:nth-child(2)')
  await page.waitForFunction(() => window.__sunspill.stage.view.pitch === 90)
  await page.click('#view button:nth-child(1)')
  await page.waitForFunction(() => window.__sunspill.stage.view.pitch < 40)
  await context.close()
})

test('dragging a bed across the floor moves it and keeps it inside the room', async () => {
  const { page, context } = await open()
  const start = await page.evaluate(() => {
    const { stage } = window.__sunspill
    const hit = stage.hits.items.find((i) => i.index === 0)
    const box = stage.canvas.getBoundingClientRect()
    const cx = hit.hull.reduce((s, p) => s + p[0], 0) / hit.hull.length
    const cy = hit.hull.reduce((s, p) => s + p[1], 0) / hit.hull.length
    return { x: box.left + cx, y: box.top + cy }
  })
  const before = (await scene(page)).items[0]
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 90, start.y + 20, { steps: 8 })
  await page.mouse.up()
  const after = (await scene(page)).items[0]
  assert.ok(after.x !== before.x || after.y !== before.y)
  const s = await scene(page)
  assert.ok(after.x >= 0 && after.x + after.w <= s.room.w + 1e-9 && after.y >= 0 && after.y + after.d <= s.room.d + 1e-9)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 3000, start.y - 3000, { steps: 4 })
  await page.mouse.up()
  const far = (await scene(page)).items[0]
  assert.ok(far.x + far.w <= s.room.w + 1e-9 && far.y >= 0)
  await context.close()
})

test('dragging a window along its wall slides it and the patch follows', async () => {
  const { page, context } = await open()
  const start = await page.evaluate(() => {
    const { stage } = window.__sunspill
    const hit = stage.hits.windows.find((w) => w.index === 0)
    const box = stage.canvas.getBoundingClientRect()
    const cx = hit.quad.reduce((s, p) => s + p[0], 0) / hit.quad.length
    const cy = hit.quad.reduce((s, p) => s + p[1], 0) / hit.quad.length
    return { x: box.left + cx, y: box.top + cy }
  })
  const before = (await scene(page)).windows[0]
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 60, start.y - 20, { steps: 8 })
  await page.mouse.up()
  const after = (await scene(page)).windows[0]
  assert.notEqual(after.pos, before.pos)
  assert.ok(after.pos >= 0 && after.pos + after.w <= 3.6 + 1e-9)
  await context.close()
})

test('every language loads: the interface text changes and no key shows through', async () => {
  const { page, context } = await open()
  const english = await page.textContent('#tagline')
  for (const code of ['zh-TW', 'zh-CN', 'ja', 'ko', 'es', 'fr', 'de', 'pt-BR']) {
    await page.selectOption('#lang', code)
    assert.equal(await page.evaluate(() => document.documentElement.lang), code)
    assert.notEqual(await page.textContent('#tagline'), english, code)
    const text = await page.evaluate(() => document.body.innerText)
    assert.ok(!/\b(room|win|dock|share|results|place|things|tab|top|view|stage)\.[a-zA-Z]+/.test(text), `${code} shows a raw key`)
  }
  await context.close()
})

test('the browser language picks the interface language', async () => {
  const { page, context } = await open({ locale: 'zh-TW' })
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'zh-TW')
  await context.close()
  const jp = await open({ locale: 'ja-JP' })
  assert.equal(await jp.page.evaluate(() => document.documentElement.lang), 'ja')
  await jp.context.close()
})

test('dark theme follows the system and the toggle cycles auto, light, dark', async () => {
  const { page, context } = await open({ colorScheme: 'dark' })
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark')
  await page.click('#theme')
  assert.equal(await page.getAttribute('html', 'data-theme'), 'light')
  await page.click('#theme')
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark')
  await context.close()
})

test('a shared link opens the same room in a fresh browser', async () => {
  const first = await open()
  await first.page.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 4.2; d.facing = 200; d.minutes = 800; d.date = { month: 12, day: 21 } }))
  await first.page.click('#tab-share')
  const link = await first.page.inputValue('#tab-body input[readonly]')
  const wanted = await scene(first.page)
  await first.context.close()
  const second = await open({}, link.slice(link.indexOf('#')))
  assert.deepEqual(await scene(second.page), { ...wanted, minutes: (await scene(second.page)).minutes })
  assert.equal((await scene(second.page)).room.w, 4.2)
  assert.equal((await ui(second.page)).playing, false)
  await second.context.close()
})

test('hiding the location rounds it in the link', async () => {
  const { page, context } = await open()
  await page.click('#tab-share')
  await page.check('#hide')
  const link = await page.inputValue('#tab-body input[readonly]')
  const hash = link.slice(link.indexOf('#'))
  const decoded = await page.evaluate((h) => window.__sunspill.decode(h), hash)
  assert.equal(decoded.place.name, '')
  assert.equal(decoded.place.lat, 25)
  assert.equal(decoded.place.lon, 122)
  await context.close()
})

test('the picture is 1080 by 1350 and the GIF decodes with the frames it promises', async () => {
  const { page, context } = await open()
  await page.click('#tab-share')
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('text=Save a picture')])
  await png.saveAs('.tmp/e2e-card.png')
  const head = readFileSync('.tmp/e2e-card.png')
  assert.equal(head.readUInt32BE(16), 1080)
  assert.equal(head.readUInt32BE(20), 1350)
  await page.click('text=Make a GIF')
  await page.waitForSelector('a[download="sunspill.gif"]', { timeout: 90000 })
  const [gif] = await Promise.all([page.waitForEvent('download'), page.click('a[download="sunspill.gif"]')])
  await gif.saveAs('.tmp/e2e.gif')
  const decoded = decodeGif(Uint8Array.from(readFileSync('.tmp/e2e.gif')))
  assert.equal(decoded.width, 540)
  assert.equal(decoded.frames.length, 60)
  assert.equal(decoded.loops, 0)
  assert.notDeepEqual([...decoded.frames[0].indices], [...decoded.frames[59].indices])
  await context.close()
})

test('the sun hours map appears with a legend and a readout under the pointer', async () => {
  const { page, context } = await open()
  await page.click('#tab-results')
  await page.check('#heat-on')
  await page.waitForFunction(() => window.__sunspill.analysis.heat !== null, null, { timeout: 30000 })
  await page.waitForSelector('#legend:not([hidden])')
  const point = await page.evaluate(() => {
    const { stage } = window.__sunspill
    const box = stage.canvas.getBoundingClientRect()
    const [x, y] = stage.camera.project(1.2, 3.2, 0)
    return { x: box.left + x, y: box.top + y }
  })
  await page.mouse.move(point.x, point.y)
  await page.waitForSelector('#tip:not([hidden])')
  assert.match(await page.textContent('#tip'), /(\d+ h|\d+ min|no direct sun)/)
  await context.close()
})

test('the afternoon check and the plant finder answer with numbers', async () => {
  const { page, context } = await open()
  await page.click('#tab-results')
  await page.waitForSelector('#tab-body .big', { timeout: 30000 })
  assert.match(await page.textContent('#tab-body .big'), /\d/)
  await page.waitForSelector('#tab-body .spot, #tab-body p.note:has-text("No spot")', { timeout: 30000 })
  await context.close()
})

test('the polar night is explained and the slider is disabled', async () => {
  const { page, context } = await open()
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.place = { name: 'Tromso', lat: 69.649, lon: 18.955, zone: 'Europe/Oslo' }; d.date = { month: 12, day: 21 } }, { history: false }))
  await page.waitForFunction(() => document.querySelector('.rail input').disabled)
  assert.match(await page.textContent('.clock .sub'), /does not rise/)
  await context.close()
})

test('no sideways scrolling on a phone and the controls stay reachable', async () => {
  const { page, context } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  for (const tab of ['room', 'place', 'things', 'results', 'share']) {
    await page.click(`#tab-${tab}`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), tab)
  }
  await context.close()
})

test('space plays and pauses, and touching the stage ends the autoplay', async () => {
  const { page, context } = await open({ reducedMotion: 'no-preference' })
  assert.equal((await ui(page)).playing, true)
  await page.mouse.click(700, 500)
  assert.equal((await ui(page)).playing, false)
  await page.focus('#canvas')
  await page.keyboard.press('Space')
  assert.equal((await ui(page)).playing, true)
  await page.keyboard.press('Space')
  assert.equal((await ui(page)).playing, false)
  await context.close()
})

test('after one visit the page opens again with no network', { skip: engine === firefox }, async () => {
  const { page, context } = await open()
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await page.waitForFunction(() => navigator.serviceWorker.controller || true)
  await page.reload()
  await page.waitForSelector('html[data-ready]')
  await context.setOffline(true)
  await page.reload()
  await page.waitForSelector('html[data-ready]')
  assert.equal((await scene(page)).place.name, 'Taipei')
  await context.close()
})

test('the library example runs in a bare page', async () => {
  const { page, context, errors } = await open({}, '')
  await page.goto(site.url + 'examples/library.html')
  await page.waitForFunction(() => document.getElementById('out').textContent.startsWith('sun:'), null, { timeout: 15000 })
  const text = await page.textContent('#out')
  assert.match(text, /floor patches: [1-9]/)
  assert.match(text, /direct sun on a desk top/)
  assert.deepEqual(errors, [])
  await context.close()
})

test('the phone compass reads a steady heading, adds the declination and turns the window', async () => {
  const { page, context } = await open()
  // desktop browsers refuse the permission, so stand in for a phone that grants it
  await page.evaluate(() => { DeviceOrientationEvent.requestPermission = async () => 'granted' })
  await page.click('text=Read the phone compass')
  await page.waitForSelector('.modal .compass-reading')
  // the phone stands upright against the window with its back toward 290 degrees on the magnetic compass:
  // beta 90 and gamma 0 stand it up, and alpha grows counter clockwise, so alpha is 360 - 290
  const alpha = 360 - 290
  const send = (a) => page.evaluate((angle) => window.dispatchEvent(Object.assign(new Event('deviceorientationabsolute'), { absolute: true, alpha: angle, beta: 90, gamma: 0 })), a)
  const use = page.locator('.modal button.primary')
  assert.equal(await use.isDisabled(), true, 'one reading is not a steady one')
  for (let i = 0; i < 70 && (await use.isDisabled()); i++) {
    await send(alpha + (i % 2 ? 0.8 : -0.8))
    await page.waitForTimeout(30)
  }
  assert.equal(await use.isDisabled(), false)
  await use.click()
  // Taipei is 5.1 degrees west of true north in 2026, so true north is 5.1 degrees clockwise from magnetic
  const declination = await page.evaluate(() => window.__sunspill.declination(25.033, 121.565))
  assert.ok(declination < -4 && declination > -6, `declination ${declination}`)
  const facing = (await scene(page)).facing
  assert.ok(Math.abs(facing - (((290 + declination) % 360 + 360) % 360)) < 1.5, `facing ${facing}`)
  await context.close()
})

test('the compass dial and the bearing box turn the window to a new direction', async () => {
  const { page, context } = await open()
  const box = await page.locator('#tab-body svg.dial').boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx + 40, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy + 40, { steps: 6 })
  await page.mouse.up()
  assert.equal((await scene(page)).facing, 180)
  const bearing = page.locator('#tab-body .field input[type=number]').nth(4)
  await bearing.fill('45')
  await bearing.press('Enter')
  assert.equal((await scene(page)).facing, 45)
  await context.close()
})

test('on a touch screen a finger drags a piece of furniture', { skip: engine !== chromium }, async () => {
  const { page, context } = await open({ viewport: { width: 420, height: 900 }, isMobile: true, hasTouch: true })
  const spot = await page.evaluate(() => {
    const { stage } = window.__sunspill
    const hit = stage.hits.items.find((i) => i.index === 0)
    const box = stage.canvas.getBoundingClientRect()
    return { x: box.left + hit.hull.reduce((s, p) => s + p[0], 0) / hit.hull.length, y: box.top + hit.hull.reduce((s, p) => s + p[1], 0) / hit.hull.length }
  })
  const before = (await scene(page)).items[0]
  const cdp = await context.newCDPSession(page)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', spot.x, spot.y)
  for (let i = 1; i <= 8; i++) await touch('touchMove', spot.x + i * 6, spot.y + i * 2)
  await touch('touchEnd')
  const after = (await scene(page)).items[0]
  assert.ok(after.x !== before.x || after.y !== before.y, 'the piece should have moved')
  await context.close()
})

test('searching for a city sets the place, the time zone and the afternoon months', async () => {
  const { page, context } = await open()
  await page.click('#tab-place')
  await page.fill('#tab-body input[type=search]', '東京')
  await page.click('#tab-body .suggest button')
  const s = await scene(page)
  assert.deepEqual([s.place.name, s.place.zone], ['Tokyo', 'Asia/Tokyo'])
  await page.fill('#tab-body input[type=search]', 'sydney')
  await page.press('#tab-body input[type=search]', 'Enter')
  assert.equal((await scene(page)).place.zone, 'Australia/Sydney')
  assert.deepEqual([(await ui(page)).west.from, (await ui(page)).west.to], [12, 3], 'the hot months flip in the southern hemisphere')
  await page.fill('#tab-body input[type=search]', 'tai')
  await page.press('#tab-body input[type=search]', 'ArrowDown')
  await page.keyboard.press('Escape')
  assert.equal(await page.getAttribute('#tab-body input[type=search]', 'aria-expanded'), 'false')
  assert.equal(await page.evaluate(() => document.querySelector('#city-list').hidden), true)
  await context.close()
})

test('adding and removing furniture and windows from the panels', async () => {
  const { page, context } = await open()
  await page.click('#tab-things')
  await page.click('#tab-body .chip:has-text("Plant")')
  assert.equal((await scene(page)).items.length, 3)
  await page.click('#tab-body .card:last-of-type .mini')
  assert.equal((await scene(page)).items.length, 2)
  await page.click('#tab-room')
  await page.click('text=Add a window')
  assert.equal((await scene(page)).windows.length, 2)
  await page.click('#tab-body [data-window="1"] .mini:has-text("Remove")')
  assert.equal((await scene(page)).windows.length, 1)
  await context.close()
})

test('the saved room file honours the hide location switch and a huge file is refused', async () => {
  const { page, context } = await open()
  await page.click('#tab-share')
  await page.check('#hide')
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('text=Save as file')])
  await file.saveAs('.tmp/e2e-room.json')
  const saved = JSON.parse(readFileSync('.tmp/e2e-room.json', 'utf8'))
  assert.deepEqual([saved.place.name, saved.place.lat, saved.place.lon], ['', 25, 122])
  await page.setInputFiles('#tab-body input[type=file]', { name: 'big.json', mimeType: 'application/json', buffer: Buffer.from(`{"room":{"w":3},"pad":"${'x'.repeat(2_000_000)}"}`) })
  await page.waitForSelector('#toast.show')
  assert.match(await page.textContent('#toast'), /not a Sunspill room/)
  assert.equal((await scene(page)).room.w, 3.6)
  await context.close()
})

test('the tabs work with the arrow keys and keep the focus', async () => {
  const { page, context } = await open()
  await page.focus('#tab-room')
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.getAttribute('#tab-place', 'aria-selected'), 'true')
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-place')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-share')
  assert.equal(await page.getAttribute('#tab-body', 'role'), 'tabpanel')
  await context.close()
})

test('the page can be installed: the manifest names the app and its icons exist', async () => {
  const { page, context } = await open()
  assert.equal(await page.evaluate(() => document.querySelector('link[rel=manifest]')?.getAttribute('href')), 'manifest.webmanifest')
  const manifest = await (await page.request.get(site.url + 'manifest.webmanifest')).json()
  assert.equal(manifest.name, 'Sunspill')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, './')
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'))
  for (const icon of manifest.icons) {
    const res = await page.request.get(site.url + icon.src)
    assert.equal(res.status(), 200, icon.src)
    assert.equal(res.headers()['content-type'], 'image/png')
  }
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content)
  assert.match(csp, /manifest-src 'self'/)
  // the footer names the version that is running, for bug reports
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.equal(await page.locator('#foot a[href*="releases/tag"]').innerText(), `v${version}`)
  await context.close()
})

test('the drawing says how to use the keyboard, and an arrow key on a piece or a window is read out', async () => {
  const { page, context } = await open()
  const canvas = page.locator('#canvas')
  assert.equal(await canvas.getAttribute('role'), 'application')
  const help = await page.evaluate(() => document.getElementById(document.getElementById('canvas').getAttribute('aria-describedby')).textContent)
  assert.match(help, /Arrow keys/)
  await page.click('#view button:has-text("Plan")')
  await page.evaluate(() => window.__sunspill.stage.select({ type: 'item', index: 0 }))
  await canvas.focus()
  const x0 = (await scene(page)).items[0].x
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => /from the left wall/.test(document.getElementById('live').textContent))
  assert.ok((await scene(page)).items[0].x > x0)
  const said = await page.locator('#live').innerText()
  assert.match(said, /^Bed: [\d.]+ m from the left wall, [\d.]+ m from the bottom wall, turned 0 degrees\.$/)
  await page.keyboard.press('[')
  await page.waitForFunction(() => /turned 345 degrees/.test(document.getElementById('live').textContent))
  await page.evaluate(() => window.__sunspill.stage.select({ type: 'window', index: 0 }))
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => /^Window 1, Top wall: [\d.]+ m from the left end\.$/.test(document.getElementById('live').textContent))
  await context.close()
})
