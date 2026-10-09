// Makes the pictures in assets/ from the real page: the README hero in light and
// dark, the before and after pair, four share cards with thumbnails, and the
// social card. Needs Playwright's Chromium and ffmpeg on the PATH.
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '../test/serve.js'
import { defaultScene, normalizeScene, encodeScene } from '../src/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = (name) => resolve(root, 'assets', name)
mkdirSync(out('cards'), { recursive: true })

const base = defaultScene()
const scenes = {
  westJuly: base,
  eastJuly: normalizeScene({ ...base, facing: 90 }),
  westDecember: normalizeScene({ ...base, date: { month: 12, day: 21 }, minutes: 15 * 60 + 40 }),
  southWinter: normalizeScene({
    room: { w: 4.8, d: 5.6, h: 2.7, wall: 0.18 },
    facing: 180,
    windows: [{ wall: 'top', pos: 1.2, w: 2.4, h: 1.6, sill: 0.5, eave: { depth: 0, gap: 0.2, ext: 0.4 }, across: null }],
    place: { name: 'Taipei', lat: 25.033, lon: 121.565, zone: 'Asia/Taipei' },
    date: { month: 12, day: 21 },
    minutes: 12 * 60 + 10,
    items: [{ kind: 'sofa', x: 1.4, y: 2.2, w: 2, d: 0.9, h: 0.8 }, { kind: 'table', x: 1.8, y: 3.6, w: 1.2, d: 0.8, h: 0.45 }, { kind: 'plant', x: 0.5, y: 4.6, w: 0.3, d: 0.3, h: 0.8 }],
  }),
  eastMorning: normalizeScene({ ...base, facing: 90, date: { month: 6, day: 21 }, minutes: 8 * 60 + 20 }),
}
const hashFor = (scene) => `#${encodeScene(scene)}`

const site = await serve()
const browser = await chromium.launch()

async function open(scene, { theme = 'light', width = 1440, height = 880, scale = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: 'reduce', locale: 'en-GB', deviceScaleFactor: scale, acceptDownloads: true })
  const page = await context.newPage()
  await page.goto(site.url + hashFor(scene))
  await page.waitForSelector('html[data-ready]')
  await page.waitForTimeout(500)
  return { page, context }
}

// hero, light and dark
for (const theme of ['light', 'dark']) {
  const { page, context } = await open(scenes.westJuly, { theme })
  await page.screenshot({ path: out(`hero-${theme}.png`) })
  await context.close()
}

// before and after: the same room with its window turned east
for (const [name, scene] of [['before', scenes.westJuly], ['after', scenes.eastJuly]]) {
  const { page, context } = await open(scene, { width: 1100, height: 760, scale: 1 })
  await page.locator('#stage').screenshot({ path: out(`${name}.png`) })
  await context.close()
}

// four share cards from the real export, and their thumbnails
const cards = { 'west-july': scenes.westJuly, 'west-december': scenes.westDecember, 'south-winter': scenes.southWinter, 'east-morning': scenes.eastMorning }
for (const [name, scene] of Object.entries(cards)) {
  const { page, context } = await open(scene)
  await page.click('#tab-share')
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Save a picture')])
  await download.saveAs(out(`cards/${name}.png`))
  await context.close()
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out(`cards/${name}.png`), '-vf', 'scale=300:-1:flags=lanczos', out(`cards/${name}-thumb.png`)])
}

// the social card, 1200 by 675, drawn from HTML
const { page: shot, context: shotContext } = await open(scenes.westJuly, { theme: 'dark', width: 1200, height: 800, scale: 2 })
const stageBuffer = Buffer.from((await shot.evaluate(() => document.getElementById('canvas').toDataURL('image/png'))).split(',')[1], 'base64')
await shotContext.close()
const font = readFileSync(resolve(root, 'node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2')).toString('base64')
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: F; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 675px; overflow: hidden; background: radial-gradient(90% 120% at 80% 40%, #1b2650 0%, #0b0f1c 70%); color: #f3ebdd; font-family: system-ui, sans-serif; position: relative; }
.copy { position: absolute; left: 72px; top: 96px; width: 470px; }
.mark { display: flex; align-items: center; gap: 16px; font: 600 64px/1 F, serif; letter-spacing: -0.02em; }
.mark svg { width: 62px; height: 62px; }
h1 { font: 560 48px/1.1 F, serif; margin-top: 40px; letter-spacing: -0.015em; }
p { font-size: 24px; line-height: 1.4; color: #aeb7cc; margin-top: 24px; max-width: 410px; }
.facts { position: absolute; left: 72px; bottom: 64px; width: 440px; font-size: 20px; line-height: 1.4; color: #ffc24b; font-weight: 600; letter-spacing: 0.01em; }
.shot { background: radial-gradient(120% 90% at 30% 10%, #18213d, #10162a); position: absolute; right: 48px; top: 56px; width: 620px; height: 563px; border-radius: 28px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); }
.shot img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
<div class="copy">
  <div class="mark"><svg viewBox="0 0 64 64"><rect x="9" y="5" width="30" height="34" rx="4" fill="none" stroke="#F3EBDD" stroke-width="4"/><path d="M24 5V39M9 22H39" stroke="#F3EBDD" stroke-width="3"/><path d="M13 44H43L59 59H29Z" fill="#FFC24B"/></svg>Sunspill</div>
  <h1>See where the sun lands in your room.</h1>
  <p>Draw the room and its windows. Drag the clock. Check the west sun before you rent.</p>
</div>
<div class="facts">Free. Open source. Nothing leaves your browser.</div>
<div class="shot"><img src="data:image/png;base64,${stageBuffer.toString('base64')}"></div>`
const cardContext = await browser.newContext({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 })
const cardPage = await cardContext.newPage()
await cardPage.setContent(html)
await cardPage.waitForTimeout(400)
await cardPage.screenshot({ path: out('social-card.png') })
await cardContext.close()

await browser.close()
await site.close()
console.log('assets written')
