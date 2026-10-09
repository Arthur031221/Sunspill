// Records assets/demo.gif from the real page: the sun crossing a west bedroom,
// the clock dragged, the window turned east and back, a winter day, and the sun
// hours map. Needs Playwright's Chromium and ffmpeg on the PATH.
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '../test/serve.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VIEW = { width: 1180, height: 740 }

async function dress(page) {
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = `
      #demo-cap { position: fixed; left: 50%; top: 84px; transform: translateX(-50%); z-index: 99; width: max-content; max-width: 56vw; padding: 9px 18px; border-radius: 999px; background: #231b12; color: #fbf4e6; font: 600 17px/1.2 system-ui, sans-serif; box-shadow: 0 8px 24px rgb(0 0 0 / .3); text-align: center; pointer-events: none; transition: opacity .25s; }
      #demo-dot { position: fixed; left: 0; top: 0; width: 26px; height: 26px; margin: -13px 0 0 -13px; border: 3px solid #d9480f; border-radius: 50%; background: rgb(217 72 15 / .2); z-index: 98; pointer-events: none; transition: scale .12s ease; }
      #demo-dot.down { scale: .7; }`
    document.head.append(style)
    const cap = Object.assign(document.createElement('div'), { id: 'demo-cap' })
    const dot = Object.assign(document.createElement('div'), { id: 'demo-dot' })
    document.body.append(cap, dot)
    addEventListener('pointermove', (e) => (dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`), true)
    addEventListener('pointerdown', () => dot.classList.add('down'), true)
    addEventListener('pointerup', () => dot.classList.remove('down'), true)
  })
}
const say = (page, text) => page.evaluate((t) => (document.getElementById('demo-cap').textContent = t), text)
const center = async (page, selector) => {
  const b = await page.locator(selector).boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b }
}
async function click(page, selector) {
  const c = await center(page, selector)
  await page.mouse.move(c.x, c.y, { steps: 14 })
  await page.waitForTimeout(120)
  await page.mouse.down()
  await page.waitForTimeout(70)
  await page.mouse.up()
}
/** Drag the time thumb to a minute of the day. */
async function scrub(page, minutes, steps = 40) {
  const { x, box } = await center(page, '.rail input')
  const { lo, hi, value } = await page.evaluate(() => {
    const e = document.querySelector('.rail input')
    return { lo: Number(e.min), hi: Number(e.max), value: Number(e.value) }
  })
  const at = (m) => box.x + 8 + ((m - lo) / (hi - lo)) * (box.width - 16)
  const y = box.y + box.height / 2
  await page.mouse.move(at(value), y, { steps: 10 })
  await page.mouse.down()
  await page.mouse.move(at(minutes), y, { steps })
  await page.mouse.up()
}
async function turnDial(page, from, to) {
  const c = await center(page, '#tab-body svg.dial')
  const r = 40
  const pt = (deg) => [c.x + r * Math.sin((deg * Math.PI) / 180), c.y - r * Math.cos((deg * Math.PI) / 180)]
  await page.mouse.move(...pt(from), { steps: 12 })
  await page.mouse.down()
  const turn = ((to - from + 540) % 360) - 180
  for (let i = 1; i <= 30; i++) await page.mouse.move(...pt(from + (turn * i) / 30), { steps: 1 })
  await page.mouse.up()
}

const site = await serve()
const browser = await chromium.launch()
const work = resolve(root, '.tmp/demo')
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
const context = await browser.newContext({ viewport: VIEW, locale: 'en-GB', colorScheme: 'light', recordVideo: { dir: work, size: VIEW } })
const opened = Date.now()
const page = await context.newPage()
await page.goto(site.url)
await page.waitForSelector('html[data-ready]')
await dress(page)
await page.mouse.move(600, 420)
const lead = (Date.now() - opened) / 1000 + 0.3

await page.evaluate(() => window.__sunspill.store.update((d) => { d.minutes = 13 * 60 + 20 }, { history: false }))
await say(page, 'A west window on a July afternoon, Taipei')
await page.waitForTimeout(3000)

await say(page, 'Drag the clock and the sun patch follows')
await click(page, '.play')
await scrub(page, 14 * 60, 20)
await scrub(page, 17 * 60 + 40, 55)
await page.waitForTimeout(300)

await say(page, 'Turn the window to face east')
await scrub(page, 16 * 60 + 30, 20)
await turnDial(page, 270, 90)
await page.waitForTimeout(900)
await say(page, 'No direct sun inside at all')
await page.waitForTimeout(1100)

await say(page, 'Turn it back to the west')
await turnDial(page, 90, 270)
await page.waitForTimeout(500)

await say(page, 'Sun hours map: where the floor gets its light')
await click(page, '#tab-results')
await page.locator('#heat-on').check()
await page.waitForFunction(() => window.__sunspill.analysis.heat !== null, null, { timeout: 30000 })
await page.waitForTimeout(1500)

await say(page, 'Plan view, with the same numbers')
await click(page, '#view button:nth-child(2)')
await page.waitForTimeout(1900)

const video = page.video()
await context.close()
const webm = await video.path()
const out = resolve(root, 'assets/demo.gif')
const filters = 'fps=10,scale=760:-1:flags=lanczos'
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', lead.toFixed(2), '-i', webm, '-vf', `${filters},palettegen=max_colors=96:stats_mode=diff`, resolve(work, 'palette.png')])
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', lead.toFixed(2), '-i', webm, '-i', resolve(work, 'palette.png'), '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, out])
console.log('assets/demo.gif written')
await browser.close()
await site.close()
