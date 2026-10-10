// The quick check on a phone: the first screen, with the three OpenStreetMap hosts answered by the test
// (fixtures from the real servers) and any other outside request refused and counted.

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
const ADDRESS = '台北市大安區復興南路二段151巷5号5樓'
// 復興南路二段151巷5號, as OpenStreetMap has it, and the lane it is on
const HOUSE = { lat: '25.0284704', lon: '121.5439379', name: '', display_name: '5號, 復興南路二段151巷, 群賢里, 大安區, 六張犁, 臺北市, 106, 臺灣', address: { house_number: '5號', road: '復興南路二段151巷', city: '臺北市', country_code: 'tw' } }
const LANE = { lat: '25.0283496', lon: '121.5447314', name: '復興南路二段151巷', display_name: '復興南路二段151巷, 群賢里, 大安區, 六張犁, 臺北市, 10667, 臺灣', address: { road: '復興南路二段151巷', city: '臺北市', country_code: 'tw' } }
// the 8 floor apartment block north of the lane, in the fixture
const BUILDING = 587073792

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

/**
 * A phone on its first visit, with the three services answered by the test. `answers.nominatim` is a list or a
 * function of the query fields, `answers.overpassFail` is how many Overpass requests answer 504 first, and
 * `answers.tile(path)` can delay, fail or let through each tile.
 */
async function open({ locale = 'zh-TW', answers = {}, viewport = { width: 390, height: 844 }, prefs = null, hash = '', context: existing = null } = {}) {
  const context = existing ?? await browser.newContext({ viewport, ...(engine === firefox ? { serviceWorkers: 'block' } : { isMobile: true }), hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce', locale })
  if (prefs) await context.addInitScript((p) => { if (!localStorage.getItem('sunspill.prefs')) localStorage.setItem('sunspill.prefs', JSON.stringify(p)) }, prefs)
  const outside = []
  if (!existing) {
    await context.route((url) => url.hostname !== '127.0.0.1', async (route) => {
      const url = new URL(route.request().url())
      const request = route.request()
      outside.push({ host: url.host, path: url.pathname, search: url.search, fields: Object.fromEntries(url.searchParams), method: request.method(), body: request.postData() })
      if (url.host === 'nominatim.openstreetmap.org') {
        const fields = Object.fromEntries(url.searchParams)
        const body = (typeof answers.nominatim === 'function' ? answers.nominatim(fields) : answers.nominatim) ?? [HOUSE, LANE]
        return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) })
      }
      if (url.host === 'tile.openstreetmap.org') {
        const how = (await answers.tile?.(url.pathname)) ?? 'ok'
        if (how === 'fail') return route.abort('failed')
        return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: PNG })
      }
      if (/^overpass/.test(url.host)) {
        const nth = outside.filter((o) => /^overpass/.test(o.host)).length
        if (nth <= (answers.overpassFail ?? 0)) return route.fulfill({ status: 504, headers: CORS, body: 'busy' })
        return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: answers.overpass ?? overpass })
      }
      return route.abort()
    })
  }
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
  await page.goto(site.url + hash)
  await page.waitForSelector('html[data-ready]')
  return { page, context, errors, outside }
}

const quickState = (page) => page.evaluate(() => {
  const s = window.__sunspill.quick.state
  return { phase: s.phase, selected: s.selected, floor: s.floor, loadState: s.loadState, chosen: [...s.chosen], sides: s.sides.map((x) => ({ id: x.id, afternoon: x.afternoon, winter: x.winter, verdict: x.verdict, bearing: x.bearing })), working: s.working, buildings: s.buildings.length, chip: Boolean(s.chip) }
})
const scene = (page) => page.evaluate(() => structuredClone(window.__sunspill.store.scene))
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

/** The point on the page where something metres from the searched place is on the quick map. */
const screenOf = (page, id) => page.evaluate((buildingId) => {
  const { quick } = window.__sunspill
  const b = quick.state.buildings.find((x) => x.id === buildingId)
  const [e, n] = [b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length, b.ring.reduce((s, p) => s + p[1], 0) / b.ring.length]
  const [x, y] = quick.map.local(e, n)
  const r = document.querySelector('#quick-map canvas').getBoundingClientRect()
  return [r.left + x, r.top + y]
}, id)

/** Type the text, press search and say yes to the one question (unless the services are on already), and wait for the outlines. */
async function findFlat(page, text = ADDRESS, { asked = true } = {}) {
  await page.fill('#quick-q', text)
  await page.tap('#quick-go')
  if (asked) {
    await page.waitForSelector('#quick-allow')
    await page.tap('#quick-allow')
  }
  await page.waitForFunction(() => window.__sunspill.quick.state.phase === 'choose')
}

async function tapBuilding(page, id = BUILDING) {
  const [x, y] = await screenOf(page, id)
  await page.touchscreen.tap(x, y)
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sides.length > 0)
}

test('a first visit opens the quick check, and the page has sent nothing and shows no result for any facing', async () => {
  const { page, context, errors, outside } = await open()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.quick), '1')
  assert.equal(await page.locator('#quick-q').isVisible(), true)
  assert.equal(await page.locator('#setup').isVisible(), false, 'the old first screen is not on the page')
  assert.match(await page.locator('#quick-body').innerText(), /找到你的房子，看陽光/)
  assert.equal(await page.locator('.side-card').count(), 0)
  assert.equal(await page.locator('#quick-summary').count(), 0)
  assert.equal(await noSideways(page), true)
  assert.deepEqual(outside, [])
  assert.deepEqual(errors, [])
  const box = await page.locator('#quick-go').boundingBox()
  assert.ok(box.height >= 44 && box.width >= 44, JSON.stringify(box))
  await context.close()
})

test('the quick check speaks Traditional Chinese there and English elsewhere, and the other languages show the English', async () => {
  for (const [locale, title, placeholder] of [['zh-TW', '找到你的房子，看陽光', '貼上地址或物件文字'], ['en-GB', 'Find your flat, see its sun', 'Address, or paste the listing text'], ['ja-JP', 'Find your flat, see its sun', 'Address, or paste the listing text']]) {
    const { page, context } = await open({ locale })
    assert.match(await page.locator('#quick-body h2').innerText(), new RegExp(title))
    assert.equal(await page.locator('#quick-q').getAttribute('placeholder'), placeholder)
    await context.close()
  }
})

test('Mei: paste an address, say yes once, tap the building, and the side cards are there after three taps', async () => {
  const { page, context, errors, outside } = await open()
  let taps = 0
  await page.fill('#quick-q', ADDRESS)
  await page.tap('#quick-go')
  taps++
  await page.waitForSelector('#quick-allow')
  // one question, and it names all three services and what leaves the phone
  const sheet = await page.locator('.modal').innerText()
  assert.match(sheet, /地圖、地址搜尋、建物輪廓 會連到 OpenStreetMap 的公開伺服器/)
  assert.match(sheet, /nominatim\.openstreetmap\.org/)
  assert.deepEqual(outside, [], 'nothing before the yes')
  await page.tap('#quick-allow')
  taps++
  await page.waitForFunction(() => window.__sunspill.quick.state.phase === 'choose')
  assert.deepEqual(await page.evaluate(() => window.__sunspill.store.ui.net), { search: true, tiles: true, buildings: true }, 'one yes switched on all three')
  // the floor in the text is the floor on the stepper, and the person has not been asked for it
  assert.equal(await page.locator('#floor-value').innerText(), '5 樓')
  await tapBuilding(page)
  taps++
  assert.ok(taps <= 4, `${taps} taps`)
  assert.equal(taps, 3)
  const state = await quickState(page)
  assert.deepEqual(state.sides.map((s) => s.id), ['W', 'N', 'S', 'E'])
  assert.equal(state.sides[0].verdict, 'strong')
  assert.equal(state.sides[3].verdict, 'none')
  assert.equal(await page.locator('.side-card').count(), 4)
  assert.match(await page.locator('.side-card').first().innerText(), /西面.*西曬強.*夏天下午直曬 4 小時.*冬天每天日照/s)
  assert.match(await page.locator('#quick-body').innerText(), /共 8 層/)
  // the grip folds the sheet away to give the map the room, and brings it back
  const tall = (await page.locator('#quick-map').boundingBox()).height
  await page.tap('.quick-grab')
  assert.equal(await page.locator('#quick-body').isVisible(), false)
  assert.ok((await page.locator('#quick-map').boundingBox()).height > tall + 150)
  assert.equal(await page.locator('.quick-grab').getAttribute('aria-expanded'), 'false')
  await page.tap('.quick-grab')
  assert.equal(await page.locator('#quick-body').isVisible(), true)
  // the address search went out as a street and a city, and nothing else of the text
  const nominatim = outside.filter((o) => o.host === 'nominatim.openstreetmap.org')
  assert.equal(nominatim.length, 1)
  assert.equal(nominatim[0].method, 'GET')
  assert.deepEqual([nominatim[0].fields.street, nominatim[0].fields.city, nominatim[0].fields.q], ['5 復興南路二段151巷', '台北市', undefined])
  const overpassCalls = outside.filter((o) => /^overpass/.test(o.host))
  assert.equal(overpassCalls.length, 1)
  assert.match(overpassCalls[0].body, /around%3A200%2C25\.02847%2C121\.54394/)
  assert.ok(!outside.some((o) => /5樓|floor|floors/.test(`${o.search}${o.body ?? ''}`)), 'the floor is not sent')
  assert.ok(outside.filter((o) => o.host === 'tile.openstreetmap.org').length > 2)
  assert.ok(outside.every((o) => ['nominatim.openstreetmap.org', 'tile.openstreetmap.org'].includes(o.host) || /^overpass/.test(o.host)))
  assert.deepEqual(errors, [])
  await context.close()
})

test('listing text with a phone number and a price sends only the street and the city', async () => {
  const { page, context, outside } = await open()
  await findFlat(page, '【大安區電梯華廈】捷運六張犁站步行5分鐘 3房2廳 25.8坪 地址：台北市大安區復興南路二段151巷5號8樓 總價 2,380萬 聯絡 0912-345-678')
  assert.equal(await page.locator('#floor-value').innerText(), '8 樓')
  const sent = outside.filter((o) => o.host === 'nominatim.openstreetmap.org')
  assert.equal(sent.length, 1)
  assert.ok(!/0912|2,380|電梯華廈/.test(sent[0].search))
  await context.close()
})

test('no result is shown for a side the person did not pick, and picking is a tap on a card or an arrow on the map', async () => {
  const { page, context } = await open()
  await findFlat(page)
  await tapBuilding(page)
  // the sample room's west window is nowhere in this
  assert.match(await page.locator('#quick-summary').innerText(), /還沒選窗戶朝哪面/)
  assert.equal(await page.locator('#quick-summary b').count(), 0, 'no verdict before a side is picked')
  assert.deepEqual((await quickState(page)).chosen, [])
  assert.equal((await scene(page)).facing, 270, 'the quick check does not touch the room, and uses no facing of its own')
  // a card
  await page.tap('.side-card[data-side=N]')
  assert.match(await page.locator('#quick-summary').innerText(), /你的窗戶朝北面[\s\S]*下午日曬中[\s\S]*夏天下午直曬 1 小時 3 分[\s\S]*冬天照不到太陽/)
  assert.equal(await page.locator('.side-card[data-side=N]').getAttribute('aria-pressed'), 'true')
  // an arrow on the map: the west one, picked as well
  const at = await page.evaluate(() => {
    const { quick } = window.__sunspill
    const a = quick.map.arrows.find((x) => x.id === 'W')
    const r = document.querySelector('#quick-map canvas').getBoundingClientRect()
    return [r.left + a.label[0], r.top + a.label[1]]
  })
  await page.touchscreen.tap(at[0], at[1])
  assert.deepEqual((await quickState(page)).chosen.sort(), ['N', 'W'])
  assert.match(await page.locator('#quick-summary').innerText(), /你的窗戶朝(西面、北面|北面、西面)[\s\S]*西曬強/)
  // and tapping a card again takes it back
  await page.tap('.side-card[data-side=N]')
  await page.tap('.side-card[data-side=W]')
  assert.match(await page.locator('#quick-summary').innerText(), /還沒選窗戶朝哪面/)
  await context.close()
})

test('a tap on the map never drops a pin or moves the room, and a tap on empty ground only offers the point', async () => {
  const { page, context } = await open()
  const before = await scene(page)
  await findFlat(page)
  const placeBefore = await page.evaluate(() => ({ ...window.__sunspill.quick.state.place }))
  // the street, between two rows of buildings
  const street = await page.evaluate(() => {
    const { quick } = window.__sunspill
    const [x, y] = quick.map.local(-40, -8)
    const r = document.querySelector('#quick-map canvas').getBoundingClientRect()
    return [r.left + x, r.top + y]
  })
  await page.touchscreen.tap(street[0], street[1])
  let s = await quickState(page)
  assert.equal(s.chip, true)
  assert.equal(s.selected, null, 'nothing was chosen by a tap on the ground')
  assert.equal(await page.locator('#quick-point').isVisible(), true)
  assert.equal(await page.locator('#quick-point').innerText(), '這裡沒有輪廓：用這個點')
  // taps on a building and on the ground, again and again, leave the room and the searched place as they were
  await tapBuilding(page)
  await page.touchscreen.tap(street[0], street[1])
  await page.touchscreen.tap(street[0] + 3, street[1] + 2)
  assert.deepEqual(await scene(page), before)
  assert.deepEqual(await page.evaluate(() => ({ ...window.__sunspill.quick.state.place })), placeBefore)
  assert.equal(await page.evaluate(() => window.__sunspill.store.canUndo()), false, 'no tap made an edit')
  await context.close()
})

test('a double tap zooms in and chooses the building once', async () => {
  const { page, context } = await open()
  await findFlat(page)
  const [x, y] = await screenOf(page, BUILDING)
  const z0 = await page.evaluate(() => window.__sunspill.quick.map.cam.zoom)
  await page.evaluate(() => {
    const { map } = window.__sunspill.quick
    window.__picks = 0
    const was = map.on.quickTap
    map.on.quickTap = (hit) => { if (hit.kind === 'building') window.__picks++; was(hit) }
  })
  await page.touchscreen.tap(x, y)
  await page.waitForTimeout(80)
  await page.touchscreen.tap(x + 2, y + 1)
  await page.waitForFunction(() => !window.__sunspill.quick.state.working)
  const z1 = await page.evaluate(() => window.__sunspill.quick.map.cam.zoom)
  assert.ok(z1 > z0 + 0.5, `zoom ${z0} to ${z1}`)
  assert.equal(await page.evaluate(() => window.__picks), 1, 'the second tap of a double tap chose nothing')
  assert.notEqual((await quickState(page)).selected, null)
  await context.close()
})

test('the floor stepper moves one floor at a time, says how many the building has, and works out the sun again', async () => {
  const { page, context } = await open()
  await findFlat(page)
  await tapBuilding(page)
  const w5 = (await quickState(page)).sides.find((s) => s.id === 'W').afternoon
  await page.tap('#floor-more')
  assert.equal(await page.locator('#floor-value').innerText(), '6 樓')
  // until the sun is worked out again the old cards are shown dimmed, and then they are the new ones
  assert.equal(await page.locator('.quick-result').getAttribute('aria-busy'), 'true')
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sidesFloor === 6)
  assert.equal(await page.locator('.quick-result').getAttribute('aria-busy'), 'false')
  assert.equal((await quickState(page)).floor, 6)
  await page.tap('#floor-less')
  await page.tap('#floor-less')
  assert.equal(await page.locator('#floor-value').innerText(), '4 樓')
  // a floor above what the map says gets a note, and is still worked out
  for (let i = 0; i < 5; i++) await page.tap('#floor-more')
  assert.equal(await page.locator('#floor-value').innerText(), '9 樓')
  assert.match(await page.locator('#quick-body').innerText(), /地圖資料說這棟只有 8 層/)
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sidesFloor === 9)
  assert.ok((await quickState(page)).sides.length > 0)
  assert.ok(w5 > 200)
  const buttons = await page.locator('.qf-btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
  assert.ok(buttons.every((h) => h >= 44), buttons.join())
  await context.close()
})

test('the neighbours decide the answer: the same side high up, above the blocks next to it, gets more winter sun', async () => {
  const { page, context } = await open()
  await findFlat(page)
  await tapBuilding(page)
  const low = await quickState(page)
  // floor 12 is above every building in the fixture but the 12 floor tower to the south west
  for (let i = 0; i < 7; i++) await page.tap('#floor-more')
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sidesFloor === 12)
  const high = await quickState(page)
  const get = (s, id) => s.sides.find((x) => x.id === id)
  assert.ok(get(high, 'S').winter > get(low, 'S').winter + 2, `south winter ${get(high, 'S').winter} against ${get(low, 'S').winter}`)
  await context.close()
})

test('declining the question sends nothing and offers the full editor', async () => {
  const { page, context, outside } = await open()
  await page.fill('#quick-q', ADDRESS)
  await page.tap('#quick-go')
  await page.waitForSelector('#quick-deny')
  await page.tap('#quick-deny')
  assert.match(await page.locator('#quick-body').innerText(), /沒有連線就沒有地圖可以點/)
  assert.deepEqual(outside, [])
  assert.deepEqual(await page.evaluate(() => window.__sunspill.store.ui.net), { search: false, tiles: false, buildings: false })
  await page.tap('#quick-declined-classic')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.quick), undefined)
  assert.equal(await page.locator('#setup').isVisible(), true)
  assert.deepEqual(outside, [])
  await context.close()
})

test('the house number is not mapped: the street is found, the page says so, and the building is still tapped', async () => {
  const { page, context, outside } = await open({ answers: { nominatim: (f) => (f.street.startsWith('5 ') ? [] : [LANE]) } })
  await findFlat(page)
  assert.match(await page.locator('#quick-body').innerText(), /只找到這條路，沒有找到門牌/)
  const sent = outside.filter((o) => o.host === 'nominatim.openstreetmap.org').map((o) => o.fields.street)
  assert.deepEqual(sent, ['5 復興南路二段151巷', '復興南路二段151巷'])
  await tapBuilding(page)
  assert.equal((await quickState(page)).sides.length, 4)
  await context.close()
})

test('several streets and no house: the matches are listed and one tap picks one', async () => {
  const other = { ...LANE, lat: '25.0338', lon: '121.5645', display_name: '復興南路, 大安區, 臺北市', name: '復興南路二段' }
  const { page, context } = await open({ answers: { nominatim: [LANE, other] } })
  await page.fill('#quick-q', '台北市大安區復興南路二段')
  await page.tap('#quick-go')
  await page.tap('#quick-allow')
  await page.waitForSelector('#quick-body .result-list')
  assert.equal(await page.locator('#quick-body .result-list li').count(), 2)
  await page.tap('#quick-body .result-list li:nth-child(1) button')
  await page.waitForFunction(() => window.__sunspill.quick.state.phase === 'choose')
  assert.ok(Math.abs((await page.evaluate(() => window.__sunspill.quick.state.origin.lat)) - 25.0283496) < 1e-6)
  await context.close()
})

test('nothing matches: the page says so and offers to load the buildings around the middle of the map', async () => {
  const { page, context, outside } = await open({ answers: { nominatim: [] } })
  await page.fill('#quick-q', ADDRESS)
  await page.tap('#quick-go')
  await page.tap('#quick-allow')
  await page.waitForSelector('#quick-load-here')
  assert.match(await page.locator('#quick-body').innerText(), /找不到這個地址/)
  assert.equal(outside.filter((o) => o.host === 'nominatim.openstreetmap.org').length, 4, 'four requests at most, the last one the plain forms')
  await page.tap('#quick-load-here')
  await page.waitForFunction(() => window.__sunspill.quick.state.loadState === 'ok')
  assert.ok((await quickState(page)).buildings > 0)
  await context.close()
})

test('every Overpass server busy: the page says the buildings did not load, still answers for a point, and a retry brings them', async () => {
  // two rounds over three servers is six requests
  const { page, context, outside } = await open({ answers: { overpassFail: 6 } })
  await page.fill('#quick-q', ADDRESS)
  await page.tap('#quick-go')
  await page.tap('#quick-allow')
  await page.waitForFunction(() => window.__sunspill.quick.state.loadState === 'failed', null, { timeout: 30000 })
  assert.equal(outside.filter((o) => /^overpass/.test(o.host)).length, 6, 'each server twice, the busy ones only')
  assert.match(await page.locator('#quick-load-failed').innerText(), /周圍建物載入失敗，結果未計入遮擋/)
  assert.equal(await page.locator('#quick-retry').isVisible(), true)
  // no outline at all, so the person offers the point of the home, and gets the four walls of a square
  const spot = await page.evaluate(() => {
    // open ground west of the 12 floor tower of the fixture, 7 metres from its wall
    const [x, y] = window.__sunspill.quick.map.local(-38, -40)
    const r = document.querySelector('#quick-map canvas').getBoundingClientRect()
    return [r.left + x, r.top + y]
  })
  await page.touchscreen.tap(spot[0], spot[1])
  await page.tap('#quick-point')
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sides.length > 0)
  const s = await quickState(page)
  assert.deepEqual(s.sides.map((x) => x.id).sort(), ['E', 'N', 'S', 'W'])
  assert.match(await page.locator('#quick-body').innerText(), /這一棟沒有輪廓，先當成 10 公尺見方/)
  assert.match(await page.locator('#quick-body').innerText(), /周圍建物載入失敗，結果未計入遮擋/, 'it keeps saying that nothing in front is counted')
  // with nothing in front the west side has the whole afternoon
  assert.equal(s.sides.find((x) => x.id === 'W').verdict, 'strong')
  const alone = (await quickState(page)).sides.find((x) => x.id === 'E').winter
  await page.tap('#quick-retry')
  await page.waitForFunction(() => window.__sunspill.quick.state.loadState === 'ok')
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.buildings.length > 30)
  assert.equal(await page.locator('#quick-load-failed').count(), 0)
  // the square is still the chosen building, and now the neighbours count
  const now = await quickState(page)
  assert.equal(now.buildings > 30 && now.selected === now.buildings - 1, true)
  assert.deepEqual(now.sides.map((x) => x.id).sort(), ['E', 'N', 'S', 'W'])
  assert.ok(now.sides.find((x) => x.id === 'E').winter < alone - 1, 'the tower now shades the east side in the morning')
  await context.close()
})

test('the first Overpass server busy is no trouble: the next one answers and the person only sees a short note', async () => {
  const { page, context, outside } = await open({ answers: { overpassFail: 1 } })
  await findFlat(page)
  assert.equal((await quickState(page)).loadState, 'ok')
  assert.deepEqual(outside.filter((o) => /^overpass/.test(o.host)).map((o) => o.host), ['overpass-api.de', 'overpass.kumi.systems'])
  await context.close()
})

test('the more row: the room editor opens at the room step with the place, the floor, the facing and the neighbours in', async () => {
  const { page, context } = await open()
  await findFlat(page)
  await tapBuilding(page)
  // it needs a side first, and says so
  assert.equal(await page.locator('#adv-room').isDisabled(), true)
  assert.match(await page.locator('#adv-room').innerText(), /先點一面窗戶朝的方向/)
  await page.tap('.side-card[data-side=W]')
  const bearing = (await quickState(page)).sides.find((s) => s.id === 'W').bearing
  await page.tap('#adv-room')
  await page.waitForSelector('html[data-wizard]')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.quick), undefined)
  assert.equal(await page.evaluate(() => window.__sunspill.wizard.index), 1, 'the room step, so the place is not asked again')
  assert.match(await page.locator('.wiz-title').innerText(), /房間/)
  const s = await scene(page)
  assert.equal(s.floor.n, 5)
  assert.ok(Math.abs(s.facing - bearing) < 0.06, `${s.facing} against ${bearing}`)
  assert.ok(Math.abs(s.place.lat - 25.02847) < 0.001 && Math.abs(s.place.lon - 121.5439) < 0.002)
  assert.equal(s.windows.length, 1)
  assert.ok(s.obstacles.length > 20)
  assert.deepEqual(s.obstacles.filter((o) => o.own).map((o) => o.on), [false], 'the building holding the room is the room own building and is off')
  assert.equal(s.obstacles.filter((o) => o.id === BUILDING).length, 1)
  // the room is kept, so it comes back the next time
  await page.waitForTimeout(500)
  assert.match(await page.evaluate(() => localStorage.getItem('sunspill.room')), /^r2=/)
  await context.close()
})

test('a room of your own is saved first when the quick check opens the editor, and the quick check never overwrites it', async () => {
  const { page, context } = await open({ prefs: { view: 'classic', net: { search: true, tiles: true, buildings: true } } })
  // edit the room in the full editor, then go to the quick check by the small link
  await page.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 4.2; d.place.name = 'My room' }))
  await page.waitForTimeout(500)
  await page.tap('#to-quick')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.quick), '1')
  await findFlat(page, ADDRESS, { asked: false })
  await tapBuilding(page)
  await page.tap('.side-card[data-side=W]')
  await page.tap('#adv-room')
  await page.waitForSelector('html[data-wizard]')
  const saved = await page.evaluate(() => window.__sunspill.panelActions.savedRooms().map((r) => [r.name, r.scene.room.w]))
  assert.deepEqual(saved, [['先前：My room', 4.2]])
  await context.close()
})

test('compare: up to four flats are kept in the browser, side by side, and come back after a reload', async () => {
  const { page, context } = await open()
  await findFlat(page)
  await tapBuilding(page)
  await page.tap('.side-card[data-side=W]')
  await page.tap('#adv-compare')
  assert.equal(await page.locator('#adv-compare').isDisabled(), true, 'the same flat is not added twice')
  assert.match(await page.locator('#quick-compare').innerText(), /比較（1）/)
  await page.tap('#floor-more')
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sidesFloor === 6)
  await page.tap('.side-card[data-side=S]')
  await page.tap('#adv-compare')
  assert.match(await page.locator('#quick-compare').innerText(), /比較（2）/)
  await page.tap('#quick-compare')
  const cols = await page.locator('.cmp-col').count()
  assert.equal(cols, 2)
  const text = await page.locator('#compare-grid').innerText()
  assert.match(text, /5 樓/)
  assert.match(text, /6 樓/)
  assert.match(text, /西面/)
  assert.match(text, /西曬強/)
  const widths = await page.locator('.cmp-col').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))
  assert.ok(widths.every((w) => w >= 150), widths.join())
  assert.equal(await noSideways(page), true)
  // three more floors fill the list, and a fifth is turned away
  await page.tap('#compare-back')
  for (const n of [7, 8]) {
    await page.tap('#floor-more')
    await page.waitForFunction((f) => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sidesFloor === f, n)
    await page.tap('#adv-compare')
  }
  assert.match(await page.locator('#quick-compare').innerText(), /比較（4）/)
  await page.tap('#floor-more')
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sidesFloor === 9)
  await page.tap('#adv-compare')
  assert.match(await page.locator('#toast').innerText(), /比較清單已滿/)
  assert.match(await page.locator('#quick-compare').innerText(), /比較（4）/)
  // a reload keeps it
  await page.reload()
  await page.waitForSelector('html[data-ready]')
  assert.match(await page.locator('#quick-compare').innerText(), /比較（4）/)
  await page.tap('#quick-compare')
  assert.equal(await page.locator('.cmp-col').count(), 4)
  await page.tap('.cmp-col .mini >> nth=0')
  assert.equal(await page.locator('.cmp-col').count(), 3)
  await context.close()
})

test('the small link opens the full editor and the choice is remembered, and the full editor has a link back', async () => {
  const { page, context } = await open()
  await page.tap('#quick-classic')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.quick), undefined)
  assert.equal(await page.locator('#setup').isVisible(), true)
  assert.equal((await scene(page)).place.name, 'Taipei', 'the sample room, as before')
  await page.reload()
  await page.waitForSelector('html[data-ready]')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.quick), undefined, 'the next visit opens the full editor')
  await page.tap('#to-quick')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.quick), '1')
  await page.reload()
  await page.waitForSelector('html[data-ready]')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.quick), '1', 'and now the quick check')
  await context.close()
})

test('somebody\'s link and a room of your own still open the room, not the quick check', async () => {
  const first = await open()
  await first.page.tap('#quick-classic')
  await first.page.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 5 }))
  await first.page.waitForTimeout(500)
  const hash = await first.page.evaluate(() => location.hash)
  await first.context.close()
  const linked = await open({ hash })
  assert.equal(await linked.page.evaluate(() => document.documentElement.dataset.quick), undefined)
  assert.equal((await scene(linked.page)).room.w, 5)
  await linked.context.close()
})

test('a wide screen puts the map and the sheet side by side, and nothing scrolls sideways at 320 pixels', async () => {
  for (const viewport of [{ width: 1360, height: 900 }, { width: 320, height: 640 }]) {
    const { page, context } = await open({ viewport })
    await findFlat(page)
    await tapBuilding(page)
    assert.equal(await noSideways(page), true, `${viewport.width}`)
    const map = await page.locator('#quick-map').boundingBox()
    const sheet = await page.locator('#quick-sheet').boundingBox()
    if (viewport.width > 900) assert.ok(sheet.x >= map.x + map.width - 1 && sheet.height > 500, JSON.stringify({ map, sheet }))
    else assert.ok(sheet.y >= map.y + map.height - 1 && map.height >= 140, JSON.stringify({ map, sheet }))
    assert.equal(await page.locator('.side-card').count(), 4)
    await context.close()
  }
})

test('the keyboard reaches everything: the nearest building, the cards and the floor, and focus stays where it was', async () => {
  const { page, context } = await open()
  await findFlat(page)
  await page.focus('#quick-nearest')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sides.length > 0)
  assert.notEqual((await quickState(page)).selected, null)
  await page.focus('#floor-more')
  await page.keyboard.press('Enter')
  assert.equal(await page.evaluate(() => document.activeElement.id), 'floor-more', 'the focus is still on the button after the sheet is drawn again')
  assert.equal(await page.locator('#floor-value').innerText(), '6 樓')
  await page.waitForFunction(() => !window.__sunspill.quick.state.working)
  await page.focus('.side-card[data-side=W]')
  await page.keyboard.press('Space')
  assert.equal(await page.evaluate(() => document.activeElement.dataset.side), 'W')
  assert.deepEqual((await quickState(page)).chosen, ['W'])
  await context.close()
})

test('pinching the quick map keeps the tiles covered when each new level is slow, and turns nothing', async () => {
  if (engine !== chromium) return
  // every tile takes a third of a second to come
  const { page, context } = await open({ prefs: { net: { search: true, tiles: true, buildings: true } }, answers: { tile: () => new Promise((r) => setTimeout(() => r('ok'), 330)) } })
  await findFlat(page, ADDRESS, { asked: false })
  await page.waitForFunction(() => window.__sunspill.quick.map.tileStats.blank === 0, null, { timeout: 15000 })
  await page.evaluate(() => {
    const m = window.__sunspill.quick.map
    window.__blank = []
    const paint = m.paint.bind(m)
    m.paint = function () { paint(); window.__blank.push(m.tileStats.blank) }
  })
  const cdp = await context.newCDPSession(page)
  const box = await page.locator('#quick-map canvas').boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) })
  const scene0 = await scene(page)
  // in and out across two zoom levels, with the fingers a little tilted
  for (const [d0, d1] of [[90, 330], [330, 90]]) {
    await touch('touchStart', [[cx - d0 / 2, cy], [cx + d0 / 2, cy]])
    for (let i = 1; i <= 14; i++) {
      const d = d0 + ((d1 - d0) * i) / 14
      await touch('touchMove', [[cx - d / 2, cy - i], [cx + d / 2, cy + i]])
      await page.waitForTimeout(16)
    }
    await touch('touchEnd', [])
  }
  const blank = await page.evaluate(() => window.__blank)
  assert.ok(blank.length > 20, `${blank.length} frames`)
  assert.ok(Math.max(...blank) <= 0.2, `the worst frame was ${Math.max(...blank)} blank`)
  assert.deepEqual(await scene(page), scene0, 'the pinch did not turn or move the room')
  await context.close()
})

test('a tile that fails is asked for again, and none stays a hole', async () => {
  if (engine !== chromium) return
  const failed = new Set()
  // every tile fails the first time
  const { page, context, outside } = await open({ prefs: { net: { search: true, tiles: true, buildings: true } }, answers: { tile: (path) => { if (failed.has(path)) return 'ok'; failed.add(path); return 'fail' } } })
  await findFlat(page, ADDRESS, { asked: false })
  await page.waitForFunction(() => window.__sunspill.quick.map.tileStats.blank === 0, null, { timeout: 15000 })
  const count = new Map()
  for (const o of outside.filter((x) => x.host === 'tile.openstreetmap.org')) count.set(o.path, (count.get(o.path) ?? 0) + 1)
  assert.ok([...count.values()].some((n) => n >= 2), 'a tile that failed was asked for again')
  assert.ok(Math.max(...count.values()) <= 3, `no tile is asked for more than three times: ${Math.max(...count.values())}`)
  await context.close()
})
