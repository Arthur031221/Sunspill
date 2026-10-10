// The quick check on a phone: the first screen, with the three OpenStreetMap hosts answered by the test
// (fixtures from the real servers) and any other outside request refused and counted.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, firefox, webkit } from 'playwright'
import { readFileSync } from 'node:fs'
import { serve } from '../serve.js'
import { encodeQuick, decodeQuick } from '../../src/core/sharelink.js'
import { packDeal, tileName, tileOf } from '../../src/core/deals.js'
import { fromLocal } from '../../src/core/geo.js'

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
 * function of the query fields, `answers.overpassFail` is how many Overpass requests answer 504 first,
 * `answers.tile(path)` can delay, fail or let through each tile, and `answers.deals` is the files of data/deals by name,
 * each a string, or a function (name) returning a string or a status number.
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
  const dealsAsked = []
  if (answers.deals && !existing) {
    await context.route((url) => url.pathname.includes('/data/deals/'), (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop()
      dealsAsked.push(name)
      const found = typeof answers.deals === 'function' ? answers.deals(name) : answers.deals[name]
      if (typeof found === 'number') return route.fulfill({ status: found, body: '' })
      if (found === undefined) return route.fulfill({ status: 404, body: '' })
      return route.fulfill({ status: 200, contentType: 'application/json', body: found })
    })
  }
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
  await page.goto(site.url + hash)
  await page.waitForSelector('html[data-ready]')
  return { page, context, errors, outside, dealsAsked }
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

// ---------------------------------------------------------------- share

/** Stand-ins for the phone's share sheet and the clipboard, which record what they were given. */
const stubShare = (page, { share = 'sheet', clipboard = 'ok' } = {}) => page.evaluate(({ share, clipboard }) => {
  window.__shared = []
  window.__copied = []
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: share === 'none' ? undefined : async (data) => {
      window.__shared.push(data)
      if (share === 'cancel') throw Object.assign(new Error('cancelled'), { name: 'AbortError' })
      if (share === 'broken') throw Object.assign(new Error('not allowed'), { name: 'NotAllowedError' })
    },
  })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => { if (clipboard === 'refuse') throw new Error('refused'); window.__copied.push(text) } },
  })
}, { share, clipboard })

/** The answer of the fixture building on the 6th floor with the north and west sides picked, as a link. */
async function shareFromFirstPage() {
  const first = await open()
  await stubShare(first.page)
  await findFlat(first.page)
  await tapBuilding(first.page)
  await first.page.tap('#floor-more')
  await first.page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sidesFloor === 6)
  await first.page.tap('.side-card[data-side=W]')
  await first.page.tap('.side-card[data-side=N]')
  await first.page.tap('#quick-share')
  const [data] = await first.page.evaluate(() => window.__shared)
  const ring = await first.page.evaluate((id) => window.__sunspill.quick.state.buildings.find((b) => b.id === id).ring, BUILDING)
  await first.context.close()
  return { data, hash: new URL(data.url).hash, ring }
}

test('Share: the button hands the phone a link that holds the place, the building, the floor and the sides, and the link opens the same answer after the one yes', async () => {
  const { data, hash } = await shareFromFirstPage()
  assert.equal(data.title, 'Sunspill 日照查詢')
  assert.match(data.text, /台北市大安區復興南路二段151巷5號 6 樓，各面的日照點開就看得到。/)
  assert.ok(data.url.startsWith(site.url + '#q1='), data.url)
  const link = decodeQuick(hash)
  assert.deepEqual([link.lat, link.lon, link.floor, link.sides, link.building.id, link.pin], [25.02847, 121.54394, 6, ['N', 'W'], BUILDING, true])
  assert.ok(link.building.ring.length >= 4)
  assert.match(link.name, /復興南路二段151巷5號/)

  // somebody else opens it: they have not said yes yet, so the one question comes first and nothing has left the phone
  const { page, context, errors, outside } = await open({ hash })
  await page.waitForSelector('#quick-allow')
  assert.deepEqual(outside, [], 'nothing before the yes')
  await page.tap('#quick-allow')
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sides.length > 0)
  const state = await quickState(page)
  assert.deepEqual([state.phase, state.floor, state.chosen.sort()], ['choose', 6, ['N', 'W']])
  assert.equal(await page.evaluate(() => { const q = window.__sunspill.quick.state; return q.buildings[q.selected].id }), BUILDING)
  assert.equal(await page.locator('#floor-value').innerText(), '6 樓')
  assert.equal(await page.locator('.side-card').count(), 4)
  assert.equal(await page.locator('.side-card[aria-pressed=true]').count(), 2)
  assert.match(await page.locator('#quick-summary').innerText(), /你的窗戶朝(西面、北面|北面、西面)/)
  assert.equal(await page.locator('#quick-q').inputValue(), link.name)
  // no address search was needed, the outlines were asked for once, and the link is not left in the address bar
  assert.equal(outside.filter((o) => o.host === 'nominatim.openstreetmap.org').length, 0)
  assert.equal(outside.filter((o) => /^overpass/.test(o.host)).length, 1)
  assert.equal(await page.evaluate(() => location.hash), '')
  assert.deepEqual(await page.evaluate(() => window.__sunspill.store.ui.net), { search: true, tiles: true, buildings: true })
  assert.equal(await page.evaluate(() => window.__sunspill.store.canUndo()), false, 'opening a link edited no room')
  assert.deepEqual(errors, [])
  await context.close()
})

test('Share: when the question was answered before, the link goes straight to the side cards with no sheet', async () => {
  const { hash } = await shareFromFirstPage()
  const { page, context, outside } = await open({ hash, prefs: { net: { search: true, tiles: true, buildings: true } } })
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sides.length > 0)
  assert.equal(await page.locator('#quick-allow').count(), 0)
  assert.equal(await page.locator('.modal').count(), 0)
  assert.deepEqual((await quickState(page)).chosen.sort(), ['N', 'W'])
  assert.equal(await page.locator('#floor-value').innerText(), '6 樓')
  assert.equal(outside.filter((o) => o.host === 'nominatim.openstreetmap.org').length, 0)
  await context.close()
})

test('Share: a person who says no to the question gets nothing sent and the way to the full editor', async () => {
  const { hash } = await shareFromFirstPage()
  const { page, context, outside } = await open({ hash })
  await page.tap('#quick-deny')
  assert.match(await page.locator('#quick-body').innerText(), /沒有連線就沒有地圖可以點/)
  assert.equal(await page.locator('#quick-declined-classic').isVisible(), true)
  assert.deepEqual(outside, [])
  await context.close()
})

test('Share: a link opens the quick check even for somebody who chose the full editor, without changing that choice', async () => {
  const { hash } = await shareFromFirstPage()
  const { page, context } = await open({ hash, prefs: { view: 'classic', net: { search: true, tiles: true, buildings: true } } })
  await page.waitForFunction(() => window.__sunspill.quick?.state.sides.length > 0 && !window.__sunspill.quick.state.working)
  assert.equal(await page.evaluate(() => document.documentElement.dataset.quick), '1')
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sunspill.prefs')).view), 'classic', 'the next plain visit is still the full editor')
  await context.close()
})

test('Share: a link pasted into the open tab opens its answer', async () => {
  const { hash } = await shareFromFirstPage()
  const { page, context } = await open({ prefs: { net: { search: true, tiles: true, buildings: true } } })
  await page.evaluate((h) => { location.hash = h }, hash)
  await page.waitForFunction(() => window.__sunspill.quick.state.sides.length > 0 && !window.__sunspill.quick.state.working)
  assert.deepEqual((await quickState(page)).chosen.sort(), ['N', 'W'])
  await context.close()
})

test('Share: with no share sheet on the phone the link is copied, and a closed sheet copies nothing', async () => {
  const { page, context } = await open()
  await findFlat(page)
  await tapBuilding(page)
  await page.tap('.side-card[data-side=W]')
  await stubShare(page, { share: 'none' })
  await page.tap('#quick-share')
  assert.match(await page.locator('#toast').innerText(), /連結已複製/)
  const copied = await page.evaluate(() => window.__copied)
  assert.equal(copied.length, 1)
  assert.ok(copied[0].startsWith(site.url + '#q1='))
  assert.deepEqual(decodeQuick(new URL(copied[0]).hash).sides, ['W'])
  // the person closes the share sheet: that is an answer, and nothing is copied after it
  await stubShare(page, { share: 'cancel' })
  await page.tap('#quick-share')
  assert.equal((await page.evaluate(() => window.__shared)).length, 1)
  assert.deepEqual(await page.evaluate(() => window.__copied), [])
  // a share sheet that fails for another reason falls back to the copy
  await stubShare(page, { share: 'broken' })
  await page.tap('#quick-share')
  assert.equal((await page.evaluate(() => window.__copied)).length, 1)
  await context.close()
})

test('Share: a browser that will not copy shows the link in a box to copy by hand', async () => {
  const { page, context } = await open()
  await findFlat(page)
  await tapBuilding(page)
  await stubShare(page, { share: 'none', clipboard: 'refuse' })
  await page.tap('#quick-share')
  await page.waitForSelector('#quick-linkbox')
  assert.match(await page.locator('.modal').innerText(), /瀏覽器不讓我們直接幫你複製/)
  const value = await page.locator('#quick-linkbox').inputValue()
  assert.ok(value.startsWith(site.url + '#q1='))
  assert.equal(decodeQuick(new URL(value).hash).building.id, BUILDING)
  assert.equal(await page.locator('#quick-linkbox').evaluate((el) => el.selectionEnd - el.selectionStart), value.length, 'the whole line is selected')
  await context.close()
})

test('Share: a damaged link opens the plain first screen, and a room link still opens the room', async () => {
  const damaged = await open({ hash: '#q1=not-a-link' })
  assert.equal(await damaged.page.evaluate(() => document.documentElement.dataset.quick), '1')
  assert.match(await damaged.page.locator('#quick-body').innerText(), /找到你的房子，看陽光/)
  assert.equal(await damaged.page.locator('.modal').count(), 0, 'no question for a link that is not one')
  await damaged.context.close()
  const first = await open()
  await first.page.tap('#quick-classic')
  await first.page.evaluate(() => window.__sunspill.store.update((d) => { d.room.w = 4.4 }))
  await first.page.waitForTimeout(500)
  const room = await first.page.evaluate(() => location.hash)
  assert.match(room, /^#r2=/)
  await first.context.close()
  const linked = await open({ hash: room })
  assert.equal(await linked.page.evaluate(() => document.documentElement.dataset.quick), undefined)
  assert.equal((await scene(linked.page)).room.w, 4.4)
  await linked.context.close()
})

test('Share: a building that has a new number on the map is found by its outline, and one that is gone is said so', async () => {
  const { ring } = await shareFromFirstPage()
  const prefs = { net: { search: true, tiles: true, buildings: true } }
  // the number is not the one the map has, but the outline lies inside the building that is there
  const renumbered = encodeQuick({ lat: 25.02847, lon: 121.54394, name: 'x', pin: true, floor: 5, sides: ['W'], building: { id: 1, ring, h: 26, levels: 8 } })
  const a = await open({ hash: `#${renumbered}`, prefs })
  await a.page.waitForFunction(() => window.__sunspill.quick.state.sides.length > 0 && !window.__sunspill.quick.state.working)
  assert.equal(await a.page.evaluate(() => { const q = window.__sunspill.quick.state; return q.buildings[q.selected].id }), BUILDING)
  assert.deepEqual((await quickState(a.page)).chosen, ['W'])
  await a.context.close()
  // a number only, which the map does not have: the page says so and waits for a tap
  const gone = encodeQuick({ lat: 25.02847, lon: 121.54394, name: 'x', pin: true, floor: 5, sides: ['W'], building: { id: 7, ring: null, h: 20, levels: 0 } })
  const b = await open({ hash: `#${gone}`, prefs })
  await b.page.waitForFunction(() => window.__sunspill.quick.state.phase === 'choose')
  assert.match(await b.page.locator('#quick-body').innerText(), /連結裡的那一棟，地圖上找不到了/)
  assert.equal((await quickState(b.page)).selected, null)
  await tapBuilding(b.page)
  assert.equal((await quickState(b.page)).sides.length, 4)
  await b.context.close()
})

test('Share: when no server sends the outlines the link still brings its own building, and a retry swaps in the real one', async () => {
  const { ring } = await shareFromFirstPage()
  const prefs = { net: { search: true, tiles: true, buildings: true } }
  // two rounds over three servers is six requests
  const empty = ring.map(([e, n]) => [e + 400, n + 400])
  const lone = encodeQuick({ lat: 25.02847, lon: 121.54394, name: 'x', pin: true, floor: 5, sides: ['S'], building: { id: 9, ring: empty, h: 20, levels: 0 } })
  const { page, context } = await open({ hash: `#${lone}`, prefs, answers: { overpassFail: 6 } })
  await page.waitForFunction(() => window.__sunspill.quick.state.loadState === 'failed', null, { timeout: 30000 })
  await page.waitForFunction(() => window.__sunspill.quick.state.sides.length > 0 && !window.__sunspill.quick.state.working)
  assert.match(await page.locator('#quick-load-failed').innerText(), /周圍建物載入失敗/)
  assert.deepEqual((await quickState(page)).chosen, ['S'])
  assert.equal(await page.locator('.side-card').count(), 4)
  assert.equal(await page.evaluate(() => window.__sunspill.quick.state.buildings.length), 1, 'the building of the link, alone')
  // the outlines come on the retry, and the building that the link carried is not counted twice as a neighbour of itself
  await page.tap('#quick-retry')
  await page.waitForFunction(() => window.__sunspill.quick.state.loadState === 'ok')
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.buildings.length > 30)
  assert.equal(await page.evaluate(() => window.__sunspill.quick.state.buildings.filter((b) => b.fromLink).length), 1, 'the link building stays since the map has no building at that spot')
  assert.deepEqual((await quickState(page)).chosen, ['S'], 'the sides the person picked since are kept')
  await context.close()
})

// ---------------------------------------------------------------- past deals

const way = JSON.parse(overpass).elements.find((e) => e.id === BUILDING)
const MIDDLE = { lat: way.geometry.reduce((a, p) => a + p.lat, 0) / way.geometry.length, lon: way.geometry.reduce((a, p) => a + p.lon, 0) / way.geometry.length }
const monthsAgo = (n) => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const yearOf = (n) => Number(monthsAgo(n).slice(0, 4))
const median = (list) => {
  const v = [...list].sort((a, b) => a - b)
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
}

/** A deal this many metres east and north of the middle of the fixture building. */
const near = (east, north, extra) => {
  const at = fromLocal(MIDDLE, east, north)
  return { lat: at.lat, lon: at.lon, kind: 'sale', date: monthsAgo(2), floor: 5, floors: 8, type: 'mid', built: 1998, ping: 30, price: 2000, unit: 66.7, lift: true, addr: null, ...extra }
}

/** The files of data/deals for a list of deals, by name, the way scripts/make-deals.mjs would have written them. */
function dealsFiles(list, { asof = monthsAgo(1), extraTiles = [] } = {}) {
  const groups = new Map()
  for (const d of list) {
    const t = tileOf(d.lat, d.lon)
    groups.set(tileName(t), { t, deals: [...(groups.get(tileName(t))?.deals ?? []), d] })
  }
  const files = {}
  for (const [name, { t, deals }] of groups) {
    const addrs = [...new Set(deals.map((d) => d.addr).filter(Boolean))]
    files[`${name}.json`] = JSON.stringify({ v: 1, z: t.z, x: t.x, y: t.y, cols: [], addrs, rows: deals.map((d) => packDeal(d, d.addr ? addrs.indexOf(d.addr) : null)) })
  }
  const tiles = [...groups.values()].map(({ t }) => `${t.x}-${t.y}`).concat(extraTiles)
  files['index.json'] = JSON.stringify({ v: 1, zoom: 15, maxZoom: 17, asof, built: '2026-10-10', tiles: { 15: tiles } })
  return files
}

const FIXTURE_DEALS = [
  // the building itself, on its outline
  near(0, 0, { date: monthsAgo(2), floor: 6, floors: 8, built: 1998, ping: 31.5, price: 2560, unit: 81.3, type: 'mid' }),
  near(1, 1, { date: monthsAgo(5), floor: 3, floors: 8, built: 1998, ping: 28, price: 1980, unit: 70.7, type: 'mid' }),
  near(-1, 0, { kind: 'rent', date: monthsAgo(3), floor: 4, floors: 8, built: 1998, ping: 20, price: 28000, unit: 1400, type: 'mid' }),
  // other sales within 300 metres
  near(50, 40, { floor: 2, built: 1980, unit: 60, price: 1500, ping: 25 }),
  near(-60, 90, { floor: 5, built: 1990, unit: 70, price: 1900, ping: 27 }),
  near(-150, -30, { floor: 7, built: 2000, unit: 80, price: 2400, ping: 30 }),
  near(10, -200, { floor: 9, built: 2010, unit: 90, price: 3000, ping: 33 }),
  near(250, 20, { floor: 12, built: 2015, unit: 100, price: 4000, ping: 40 }),
  // rentals within 300 metres
  near(60, -50, { kind: 'rent', price: 20000, unit: 1000, ping: 20 }),
  near(70, -60, { kind: 'rent', price: 25000, unit: 1250, ping: 20 }),
  near(-80, 60, { kind: 'rent', price: 30000, unit: 1500, ping: 20 }),
  // too far, too old
  near(400, 0, { unit: 999, price: 99999 }),
  near(20, 20, { unit: 555, date: monthsAgo(13) }),
]

async function dealsPage(options = {}) {
  const { answers = {}, ...rest } = options
  const files = dealsFiles(FIXTURE_DEALS)
  const result = await open({ ...rest, answers: { deals: files, ...answers } })
  await findFlat(result.page)
  await tapBuilding(result.page)
  return { ...result, files }
}

test('Deals: after the side cards the sheet says what the past deals round the building say, and that they are past deals and not listings', async () => {
  const { page, context, errors, outside, dealsAsked } = await dealsPage()
  await page.waitForSelector('#quick-deals[data-status=ok]')
  const section = page.locator('#quick-deals')
  const text = await section.innerText()
  assert.match(text, /附近實價登錄/)
  assert.match(text, /過去成交紀錄，不是目前的物件/)
  // 7 sales within 300 m in the last year: the building's two and five more, but not the one at 400 m or the one a year old
  assert.match(text, /近 12 個月、300 公尺內買賣 7 筆/)
  assert.match(text, /單價中位數 80 萬\/坪/)
  assert.match(text, /2 到 12 樓/)
  const ages = [[2, 1998], [5, 1998], [2, 1980], [2, 1990], [2, 2000], [2, 2010], [2, 2015]].map(([m, built]) => yearOf(m) - built)
  assert.match(text, new RegExp(`屋齡中位數 ${Math.round(median(ages))} 年`))
  assert.match(text, /租賃 4 筆[\s\S]*月租中位數 26,500 元，每坪 1,325 元/)
  // the deals of the building come first, newest first, and are not listed again among the nearest
  assert.match(await page.locator('#deals-same-title').innerText(), /同一棟（3 筆）/)
  const same = await page.locator('#deals-same .deal-row').allInnerTexts()
  assert.equal(same.length, 3)
  assert.match(same[0], new RegExp(`${monthsAgo(2)} · 買賣 · 2,560 萬\n6/8 樓 · 屋齡 ${yearOf(2) - 1998} 年 · 31.5 坪 · 81.3 萬/坪`))
  assert.match(same[1], new RegExp(`${monthsAgo(3)} · 租賃 · 月租 28,000 元\n4/8 樓 · 屋齡 ${yearOf(3) - 1998} 年 · 20 坪 · 每坪 1,400 元`))
  assert.match(same[2], new RegExp(monthsAgo(5)))
  // the five nearest, closest first, with how far they are
  assert.match(await page.locator('#deals-near-title').innerText(), /最近的 5 筆/)
  const nearest = await page.locator('#deals-near .deal-row').allInnerTexts()
  assert.equal(nearest.length, 5)
  // a sale 64 metres from the middle, two rentals, a third at 100 metres and a sale at 108
  assert.match(nearest[0], new RegExp(`${monthsAgo(2)} · 買賣 · 1,500 萬\\n2/8 樓 · 屋齡 ${yearOf(2) - 1980} 年 · 25 坪 · 60 萬/坪 · 約 60 公尺`))
  assert.deepEqual(nearest.map((r) => /租賃/.test(r)), [false, true, true, true, false])
  const metres = nearest.map((r) => Number(/約 (\d+) 公尺/.exec(r)[1]))
  assert.deepEqual(metres, [60, 80, 90, 100, 110])
  assert.ok(metres.every((m) => m <= 450))
  assert.ok(!nearest.some((r) => /999 萬|99,999/.test(r)), 'the deal 400 metres away is past the reach of the list')
  // where it comes from, word for word
  assert.equal(await page.locator('#deals-source').innerText(), '資料來源：內政部不動產交易實價查詢服務網（依政府資料開放授權條款）')
  assert.match(text, /位置：臺北市、新北市、臺中市、桃園市政府的門牌位置開放資料/)
  assert.match(text, /資料到 20\d\d-\d\d，每月更新/)
  // it comes after the cards and before the More row, and the files came from the page's own address
  const order = await page.evaluate(() => {
    const at = (sel) => document.querySelector(sel).getBoundingClientRect().top
    return [at('#quick-cards'), at('#quick-deals'), at('#adv-room')]
  })
  assert.ok(order[0] < order[1] && order[1] < order[2], order.join())
  assert.equal(dealsAsked[0], 'index.json')
  assert.ok(dealsAsked.slice(1).every((n) => /^15-\d+-\d+\.json$/.test(n)) && dealsAsked.length >= 2 && dealsAsked.length <= 5, dealsAsked.join())
  assert.ok(outside.every((o) => ['nominatim.openstreetmap.org', 'tile.openstreetmap.org'].includes(o.host) || /^overpass/.test(o.host)), 'no new host')
  assert.equal(await noSideways(page), true)
  assert.deepEqual(errors, [])
  await context.close()
})

test('Deals: a deal that carries the address that was typed is of the same building, and one with another house number is not', async () => {
  // the address in the test is 復興南路二段151巷5號, and this deal is on the street, 30 metres from the outline
  const list = [...FIXTURE_DEALS.slice(0, 3), near(30, 30, { addr: '復興南路二段151巷5號', date: monthsAgo(4), price: 2222 }), near(30, -30, { addr: '復興南路二段151巷7號', date: monthsAgo(4), price: 3333 })]
  const { page, context } = await open({ answers: { deals: dealsFiles(list) } })
  await findFlat(page)
  await tapBuilding(page)
  await page.waitForSelector('#quick-deals[data-status=ok]')
  const same = await page.locator('#deals-same .deal-row').allInnerTexts()
  assert.equal(same.length, 4)
  assert.ok(same.some((r) => /2,222 萬/.test(r)))
  assert.ok(!same.some((r) => /3,333 萬/.test(r)))
  assert.match(await page.locator('#deals-near').innerText(), /3,333 萬/)
  await context.close()
})

test('Deals: outside the four cities the section says so in one line and shows no numbers and no source', async () => {
  // the index lists tiles, but none of them near this building
  const { page, context, dealsAsked } = await open({ answers: { deals: { 'index.json': JSON.stringify({ v: 1, zoom: 15, maxZoom: 17, asof: '2026-09', tiles: { 15: ['1-1'] } }) } } })
  await findFlat(page)
  await tapBuilding(page)
  await page.waitForSelector('#quick-deals[data-status=none]')
  assert.equal(await page.locator('#deals-none').innerText(), '這一帶還沒有成交資料，目前只有臺北、新北、臺中和桃園。')
  assert.match(await page.locator('#quick-deals').innerText(), /過去成交紀錄，不是目前的物件/)
  assert.equal(await page.locator('#deals-source').count(), 0)
  assert.equal(await page.locator('.deal-row').count(), 0)
  assert.deepEqual(dealsAsked, ['index.json'], 'no tile was asked for')
  await context.close()
})

test('Deals: a copy of the page with no deals data says so, and the sun answer is not held up', async () => {
  const { page, context } = await open()
  await findFlat(page)
  await tapBuilding(page)
  await page.waitForSelector('#quick-deals[data-status=missing]')
  assert.equal(await page.locator('#deals-missing').innerText(), '這個版本的頁面沒有附上成交資料。')
  assert.equal(await page.locator('.side-card').count(), 4)
  await context.close()
})

test('Deals: when the files will not come the page says so and the retry brings them', async () => {
  const files = dealsFiles(FIXTURE_DEALS)
  let fail = true
  const { page, context } = await open({ answers: { deals: (name) => (name !== 'index.json' && fail ? 500 : files[name]) } })
  await findFlat(page)
  await tapBuilding(page)
  await page.waitForSelector('#quick-deals[data-status=failed]')
  assert.equal(await page.locator('#deals-failed').innerText(), '成交資料載入失敗。')
  fail = false
  await page.tap('#deals-retry')
  await page.waitForSelector('#quick-deals[data-status=ok]')
  assert.match(await page.locator('#quick-deals').innerText(), /買賣 7 筆/)
  await context.close()
})

test('Deals: the floor stepper does not ask for the files again, and another building gets its own numbers from the same files', async () => {
  const { page, context, dealsAsked } = await dealsPage()
  await page.waitForSelector('#quick-deals[data-status=ok]')
  const asked = dealsAsked.length
  await page.tap('#floor-more')
  await page.waitForFunction(() => !window.__sunspill.quick.state.working && window.__sunspill.quick.state.sidesFloor === 6)
  assert.equal(dealsAsked.length, asked, 'a floor is not a new place')
  assert.equal(await page.locator('#quick-deals').getAttribute('data-status'), 'ok')
  // the building next door has none of the deals on its outline
  const other = await page.evaluate((id) => {
    const q = window.__sunspill.quick.state
    const c = (b) => [b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length, b.ring.reduce((s, p) => s + p[1], 0) / b.ring.length]
    const me = c(q.buildings.find((b) => b.id === id))
    return q.buildings.filter((b) => b.id !== id && b.ring.length >= 4).map((b) => ({ id: b.id, d: Math.hypot(c(b)[0] - me[0], c(b)[1] - me[1]) })).filter((x) => x.d > 25 && x.d < 80).sort((a, b) => a.d - b.d)[0].id
  }, BUILDING)
  await tapBuilding(page, other)
  await page.waitForFunction((id) => window.__sunspill.quick.state.buildings[window.__sunspill.quick.state.selected].id === id, other)
  await page.waitForSelector('#quick-deals[data-status=ok]')
  assert.equal(await page.locator('#deals-same').count(), 0, 'no deal sits on the other building')
  assert.match(await page.locator('#quick-deals').innerText(), /最近的/)
  await context.close()
})

test('Deals: the English page says the same in English, and the licence line is there', async () => {
  const { page, context } = await dealsPage({ locale: 'en-GB' })
  await page.waitForSelector('#quick-deals[data-status=ok]')
  const text = await page.locator('#quick-deals').innerText()
  assert.match(text, /nearby past deals/i)
  assert.match(text, /Past deals, not current listings/)
  assert.match(text, /7 sales within 300 m in the last 12 months/)
  assert.match(text, /median 80 萬 per ping/)
  assert.match(text, /4 rentals within 300 m/)
  assert.match(text, /Same building \(3\)/)
  assert.match(await page.locator('#deals-source').innerText(), /^Source: Ministry of the Interior real price registration service \(under the Open Government Data License, version 1\)$/)
  await context.close()
})

test('Deals: at 320 pixels the rows wrap and nothing scrolls sideways', async () => {
  const { page, context } = await dealsPage({ viewport: { width: 320, height: 640 } })
  await page.waitForSelector('#quick-deals[data-status=ok]')
  assert.equal(await noSideways(page), true)
  const widths = await page.locator('.deal-row').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right))
  assert.ok(widths.every((r) => r <= 320), widths.join())
  await context.close()
})
