// Records assets/setup.gif from the real page on a phone: an address, the room,
// which way it faces over the buildings around it, and the sun patch, in under
// ten seconds. Needs Playwright's Chromium and ffmpeg on the PATH.
//
// The address search and the building outlines are answered from this script
// so the picture does not depend on a busy public server. The map pictures come
// from tile.openstreetmap.org when there is a connection, and fall back to the
// plain grid when there is not.
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '../test/serve.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VIEW = { width: 390, height: 844 }
const CORS = { 'access-control-allow-origin': '*' }
const overpass = readFileSync(resolve(root, 'test/fixtures/overpass-taipei.json'), 'utf8')
const found = [{ lat: '25.02880', lon: '121.54420', name: '', display_name: 'Section 2, Fuxing South Road, Da-an District, Taipei, Taiwan', address: { road: 'Section 2, Fuxing South Road', city: 'Taipei', country_code: 'tw' } }]

const site = await serve()
const browser = await chromium.launch()
const work = resolve(root, '.tmp/setup-demo')
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  viewport: VIEW, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: 'en-GB', colorScheme: 'light', reducedMotion: 'no-preference',
  recordVideo: { dir: work, size: VIEW },
})
await context.route((url) => url.hostname === 'nominatim.openstreetmap.org', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(found) }))
await context.route((url) => /^overpass/.test(url.hostname), (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: overpass }))
await context.addInitScript(() => localStorage.setItem('sunspill.prefs', JSON.stringify({ net: { search: true, tiles: true, buildings: true }, units: 'm', lang: 'en', theme: 'light' })))
const opened = Date.now()
const page = await context.newPage()
await page.goto(site.url + '#')
await page.waitForSelector('html[data-ready]')
await page.evaluate(() => {
  const style = document.createElement('style')
  style.textContent = `
    #demo-cap { position: fixed; left: 50%; top: 66px; transform: translateX(-50%); z-index: 99; width: max-content; max-width: 86vw; padding: 7px 16px; border-radius: 999px; background: #231b12; color: #fbf4e6; font: 650 15px/1.2 system-ui, sans-serif; box-shadow: 0 8px 24px rgb(0 0 0 / .3); text-align: center; pointer-events: none; }
    #demo-dot { position: fixed; left: 0; top: 0; width: 34px; height: 34px; margin: -17px 0 0 -17px; border: 3px solid #d9480f; border-radius: 50%; background: rgb(217 72 15 / .22); z-index: 98; pointer-events: none; opacity: 0; transition: opacity .25s, scale .15s ease; }
    #demo-dot.on { opacity: 1; scale: 1; }
    #toast { display: none !important; }`
  document.head.append(style)
  const cap = Object.assign(document.createElement('div'), { id: 'demo-cap' })
  const dot = Object.assign(document.createElement('div'), { id: 'demo-dot' })
  document.body.append(cap, dot)
  addEventListener('pointerdown', (e) => {
    dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
    dot.classList.add('on')
    setTimeout(() => dot.classList.remove('on'), 380)
  }, true)
})
const say = (text) => page.evaluate((t) => (document.getElementById('demo-cap').textContent = t), text)
const tap = async (selector) => {
  const b = await page.locator(selector).first().boundingBox()
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
}
await tap('#setup')
// the picture starts when the map is drawn, so the first frame already has its streets
await page.waitForFunction(() => [...window.__sunspill.map.tiles.values()].every((t) => t.ready) && window.__sunspill.map.tiles.size > 0, null, { timeout: 6000 }).catch(() => {})
await page.waitForTimeout(250)
const lead = (Date.now() - opened) / 1000
await say('1. Your address')
await tap('#place-q')
await page.keyboard.type('Fuxing South Road', { delay: 55 })
await page.keyboard.press('Enter')
await page.waitForSelector('.result-list li', { timeout: 10000 })
await page.waitForTimeout(350)
await tap('.result-list li button')
await page.waitForFunction(() => [...window.__sunspill.map.tiles.values()].every((t) => t.ready), null, { timeout: 5000 }).catch(() => {})
await page.waitForTimeout(700)

await tap('#wiz-next')
await say('2. The room')
await page.waitForTimeout(250)
await tap('.tpl[data-template=master]')
await page.waitForTimeout(950)

await page.evaluate(() => {
  window.__sunspill.store.update((d) => { d.facing = 190 }, { history: false })
  window.__sunspill.wizard.go(3)
})
await say('3. Which way it faces')
await page.click('#load-buildings')
await page.waitForFunction(() => window.__sunspill.store.scene.obstacles.length > 0, null, { timeout: 15000 })
await page.waitForTimeout(900)
await page.evaluate(() => window.__sunspill.map.zoomBy(1.4))
await page.waitForTimeout(500)
await page.waitForFunction(() => [...window.__sunspill.map.tiles.values()].every((t) => t.ready), null, { timeout: 4000 }).catch(() => {})
for (let i = 0; i < 5; i++) {
  await page.click('.turn .btn >> nth=3')
  await page.waitForTimeout(300)
}
await page.waitForTimeout(450)

await say('4. The sun on your floor')
await page.evaluate(() => {
  const s = window.__sunspill
  s.store.update((d) => { d.minutes = 15 * 60 }, { history: false })
  s.wizard.close(true)
})
await tap('#tab-room')
await page.waitForTimeout(500)
// the clock runs on through the afternoon and the patch crosses the floor
await page.evaluate(() => new Promise((resolve) => {
  const s = window.__sunspill
  const from = performance.now()
  const step = (now) => {
    const k = Math.min(1, (now - from) / 2600)
    s.store.update((d) => { d.minutes = Math.round(15 * 60 + k * 150) }, { history: false })
    if (k < 1) requestAnimationFrame(step)
    else resolve()
  }
  requestAnimationFrame(step)
}))

const video = page.video()
await context.close()
const webm = await video.path()
const out = resolve(root, 'assets/setup.gif')
const filters = 'fps=10,scale=300:-1:flags=lanczos'
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', lead.toFixed(2), '-t', '9.6', '-i', webm, '-vf', `${filters},palettegen=max_colors=112:stats_mode=diff`, resolve(work, 'palette.png')])
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', lead.toFixed(2), '-t', '9.6', '-i', webm, '-i', resolve(work, 'palette.png'), '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, out])
const seconds = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim()
console.log(`assets/setup.gif written, ${Number(seconds).toFixed(1)} seconds`)
await browser.close()
await site.close()
