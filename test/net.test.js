import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createNet, Refused, ORIGINS, SERVICES } from '../src/app/net.js'

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
const overpass = JSON.parse(readFileSync(new URL('./fixtures/overpass-taipei.json', import.meta.url), 'utf8'))

function harness({ on = ['search', 'tiles', 'buildings'], responses = [] } = {}) {
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
  return { net, calls, waits, tick: (ms) => { t += ms } }
}

test('a switched off service is refused before any request is made', async () => {
  const h = harness({ on: [] })
  await assert.rejects(h.net.search('Taipei 101'), Refused)
  await assert.rejects(h.net.buildings({ lat: 25, lon: 121 }), Refused)
  assert.throws(() => h.net.tileUrl(17, 1, 2), Refused)
  assert.equal(h.calls.length, 0)
})

test('address search asks Nominatim for the typed text only, and fills in the time zone', async () => {
  const h = harness({ responses: [json([{ lat: '25.0338', lon: '121.5645', name: '台北101', display_name: '台北101, 臺北市', address: { city: '臺北市', country_code: 'tw' } }])] })
  const places = await h.net.search('台北101', 'zh-TW')
  assert.equal(h.calls.length, 1)
  const u = new URL(h.calls[0].url)
  assert.equal(u.origin, 'https://nominatim.openstreetmap.org')
  assert.equal(u.searchParams.get('q'), '台北101')
  assert.equal(u.searchParams.get('accept-language'), 'zh-TW')
  assert.equal(h.calls[0].init.credentials, 'omit')
  assert.equal(h.calls[0].init.headers, undefined, 'no custom headers, so no preflight')
  assert.equal(places[0].zone, 'Asia/Taipei')
  assert.equal(places[0].name, '台北101, 臺北市')
})

test('searches are spaced a second apart and very short text sends nothing', async () => {
  const h = harness()
  await h.net.search('ab')
  await h.net.search('abc')
  await h.net.search('abcd')
  assert.equal(h.calls.length, 3)
  assert.equal(h.waits.length, 2, 'each later request waited for the first second to pass')
  assert.ok(h.waits.every((w) => w > 1000 && w <= 1100))
  assert.deepEqual(await h.net.search(' x '), [])
  assert.equal(h.calls.length, 3, 'one letter sends nothing')
})

test('buildings come from the first Overpass server that answers, and the position is the only thing sent', async () => {
  const h = harness({ responses: [json({}, 504), json({ elements: 'no' }), json(overpass)] })
  const { buildings, total } = await h.net.buildings({ lat: 25.0288, lon: 121.5442 }, 200)
  assert.equal(total, 37)
  assert.ok(buildings.length === 37)
  assert.deepEqual(h.calls.map((c) => new URL(c.url).origin), ['https://overpass-api.de', 'https://overpass.openstreetmap.fr', 'https://overpass.private.coffee'])
  const body = h.calls[0].init.body
  assert.ok(body instanceof URLSearchParams)
  assert.match(body.get('data'), /around:200,25\.028800,121\.544200/)
  assert.equal(h.calls[0].init.method, 'POST')
})

test('when every server fails the error says which and why', async () => {
  const h = harness({ responses: [json({}, 504), new Error('network down'), json({}, 500)] })
  await assert.rejects(h.net.buildings({ lat: 1, lon: 1 }), /overpass-api\.de.*504.*openstreetmap\.fr.*network down.*private\.coffee.*500/)
})

test('a cancelled request stops without trying the next server', async () => {
  const h = harness({ responses: [Object.assign(new Error('aborted'), { name: 'AbortError' })] })
  const c = new AbortController()
  c.abort()
  await assert.rejects(h.net.buildings({ lat: 1, lon: 1 }, 200, c.signal))
  assert.equal(h.calls.length, 1)
})

test('tiles are plain https images from one host, and the list of origins is what the policy will allow', () => {
  const h = harness()
  assert.equal(h.net.tileUrl(17, 109708, 56367), 'https://tile.openstreetmap.org/17/109708/56367.png')
  assert.deepEqual(ORIGINS.images, ['https://tile.openstreetmap.org'])
  assert.deepEqual(ORIGINS.connect, ['https://nominatim.openstreetmap.org', 'https://overpass-api.de', 'https://overpass.openstreetmap.fr', 'https://overpass.private.coffee'])
  assert.equal(Object.keys(SERVICES).length, 3)
})
