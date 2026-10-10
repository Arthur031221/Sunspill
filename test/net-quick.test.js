import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createNet, Refused } from '../src/app/net.js'

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
const overpass = JSON.parse(readFileSync(new URL('./fixtures/overpass-taipei.json', import.meta.url), 'utf8'))
const CENTER = { lat: 25.0284704, lon: 121.5439379 }

const house = { lat: '25.0284704', lon: '121.5439379', name: '', display_name: '5號, 復興南路二段151巷, 大安區, 臺北市, 臺灣', address: { house_number: '5號', road: '復興南路二段151巷', city: '臺北市', country_code: 'tw' } }
const street = { lat: '25.0283496', lon: '121.5447314', name: '復興南路二段151巷', display_name: '復興南路二段151巷, 大安區, 臺北市, 臺灣', address: { road: '復興南路二段151巷', city: '臺北市', country_code: 'tw' } }

function harness({ responses = [], on = ['search', 'tiles', 'buildings'] } = {}) {
  const calls = []
  const waits = []
  let t = 1_000_000
  const net = createNet({
    allowed: (s) => on.includes(s),
    fetch: async (url, init) => {
      calls.push({ url, init })
      const next = responses.shift()
      if (next instanceof Error) throw next
      return next ?? json([])
    },
    wait: async (ms) => { waits.push(ms); t += ms },
    now: () => t,
  })
  return { net, calls, waits }
}
const fields = (call) => Object.fromEntries(new URL(call.url).searchParams)

test('a Taiwanese address in pasted text is searched by its street and city, and nothing else of the text is sent', async () => {
  const h = harness({ responses: [json([street, house])] })
  const text = '【大安區電梯華廈】3房2廳 25.8坪 屋齡32年 地址：台北市大安區復興南路二段151巷5号5樓 總價 2,380萬 聯絡 0912-345-678'
  const r = await h.net.lookupAddress(text, 'zh-TW')
  assert.equal(h.calls.length, 1)
  const u = new URL(h.calls[0].url)
  assert.equal(u.origin + u.pathname, 'https://nominatim.openstreetmap.org/search')
  assert.deepEqual(fields(h.calls[0]), { format: 'jsonv2', addressdetails: '1', limit: '6', 'accept-language': 'zh-TW', countrycodes: 'tw', street: '5 復興南路二段151巷', city: '台北市' })
  assert.ok(!h.calls[0].url.includes('0912') && !h.calls[0].url.includes('2,380'))
  assert.equal(h.calls[0].init.credentials, 'omit')
  assert.equal(h.calls[0].init.headers, undefined, 'no custom headers, so no preflight')
  // the result with the house number is the one kept
  assert.equal(r.exact, true)
  assert.equal(r.places.length, 1)
  assert.equal(r.places[0].zone, 'Asia/Taipei')
  assert.equal(r.found.floor, 5)
})

test('when the house number is not mapped the street is asked for, and the answer says it is not exact', async () => {
  const h = harness({ responses: [json([]), json([street])] })
  const r = await h.net.lookupAddress('台北市大安區復興南路二段151巷9號3樓', 'zh-TW')
  assert.equal(h.calls.length, 2)
  assert.deepEqual([fields(h.calls[1]).street, fields(h.calls[1]).city], ['復興南路二段151巷', '台北市'])
  assert.equal(r.exact, false)
  assert.equal(r.places.length, 1)
  assert.equal(h.waits.length, 1, 'a second apart')
})

test('an address that no form finds ends after four requests, and text with no Taiwanese address is searched as typed', async () => {
  const h = harness()
  const none = await h.net.lookupAddress('新北市板橋區文化路一段188巷12弄3號', 'zh-TW')
  assert.deepEqual(none.places, [])
  assert.equal(h.calls.length, 4)
  const other = harness({ responses: [json([house])] })
  const r = await other.net.lookupAddress('Taipei 101', 'en')
  assert.equal(other.calls.length, 1)
  assert.equal(fields(other.calls[0]).q, 'Taipei 101')
  assert.equal(r.found, null)
  const off = harness({ on: [] })
  await assert.rejects(off.net.lookupAddress('台北市大安區復興南路二段151巷5號'), Refused)
  assert.equal(off.calls.length, 0)
})

test('busy Overpass servers are asked again after a wait, but only the busy ones, and the first answer wins', async () => {
  const blocked = Object.assign(new TypeError('Failed to fetch'), {})
  // round one: busy, blocked (no CORS header), busy. round two asks the two busy ones only
  const h = harness({ responses: [json({}, 504), blocked, json({}, 503), json({}, 504), json(overpass)] })
  const told = []
  const r = await h.net.buildings(CENTER, 200, undefined, { rounds: 2, onNext: (host) => told.push(host) })
  assert.equal(r.total, 37)
  assert.deepEqual(h.calls.map((c) => new URL(c.url).host), ['overpass-api.de', 'overpass.kumi.systems', 'overpass.private.coffee', 'overpass-api.de', 'overpass.private.coffee'])
  assert.deepEqual(h.waits, [1500])
  assert.deepEqual(told, ['overpass.kumi.systems', 'overpass.private.coffee', 'overpass-api.de', 'overpass.private.coffee'])
})

test('when every round fails the error lists each failure, and a blocked server is not asked again', async () => {
  const blocked = new TypeError('Failed to fetch')
  const h = harness({ responses: [json({}, 504), blocked, json({}, 500), json({}, 504), json({}, 504)] })
  await assert.rejects(h.net.buildings(CENTER, 200, undefined, { rounds: 2 }), /overpass-api\.de.*504.*kumi\.systems.*Failed to fetch.*private\.coffee.*500.*overpass-api\.de.*504.*private\.coffee.*504/)
  assert.equal(h.calls.length, 5)
  // with one round, as the setup asks, nothing changes: each server once
  const once = harness({ responses: [json({}, 504), json({}, 504), json({}, 504)] })
  await assert.rejects(once.net.buildings(CENTER, 200))
  assert.equal(once.calls.length, 3)
  assert.deepEqual(once.waits, [])
})

test('a request cancelled during the wait between rounds goes no further', async () => {
  const c = new AbortController()
  const calls = []
  const net = createNet({
    allowed: () => true,
    fetch: async (url) => { calls.push(url); return json({}, 504) },
    wait: async () => c.abort(),
  })
  await assert.rejects(net.buildings(CENTER, 200, c.signal, { rounds: 2 }))
  assert.equal(calls.length, 3, 'only the first round was sent')
})
