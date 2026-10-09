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
  assert.match(body.get('data'), /around:200,25\.02880,121\.54420/)
  assert.equal(h.calls[0].init.method, 'POST')
})

test('the page hears when the next server is tried, and the server that answered last goes first next time', async () => {
  const h = harness({ responses: [json({}, 504), json(overpass), json(overpass), json(overpass)] })
  const told = []
  await h.net.buildings({ lat: 25.0288, lon: 121.5442 }, 200, undefined, { onNext: (host) => told.push(host) })
  assert.deepEqual(told, ['overpass.openstreetmap.fr'], 'told once, before the second server')
  assert.deepEqual(h.calls.map((c) => new URL(c.url).host), ['overpass-api.de', 'overpass.openstreetmap.fr'])
  // the second server answered, so it is asked first now, and nobody is told anything
  const again = []
  await h.net.buildings({ lat: 25.0288, lon: 121.5442 }, 200, undefined, { onNext: (host) => again.push(host) })
  assert.deepEqual(again, [])
  assert.equal(new URL(h.calls[2].url).host, 'overpass.openstreetmap.fr')
  // options still reach the parser
  const { buildings, cutoff } = await h.net.buildings({ lat: 25.0288, lon: 121.5442 }, 200, undefined, { limit: 10, eye: 12 })
  assert.equal(buildings.length, 10)
  assert.ok(cutoff >= 0)
})

test('a second request that changes the preferred server does not make the first one skip it', async () => {
  const gates = []
  const hosts = []
  const net = createNet({
    allowed: () => true,
    fetch: async (url) => {
      const host = new URL(url).host
      hosts.push(host)
      // the first call to the first server waits to be told how it ends, every other call answers at once
      if (host === 'overpass-api.de' && !gates.length) return new Promise((resolve) => gates.push(resolve))
      if (host === 'overpass-api.de') return json({}, 504)
      return json(overpass)
    },
    wait: async () => {},
  })
  const center = { lat: 25.0288, lon: 121.5442 }
  const a = net.buildings(center, 200)
  // B: the first server is busy for it, the second answers, and the second is now the preferred one
  const b = await net.buildings(center, 200)
  assert.equal(b.total, 37)
  assert.deepEqual(hosts, ['overpass-api.de', 'overpass-api.de', 'overpass.openstreetmap.fr'])
  // A's first server now fails: A goes on to the server after it in its own order, which is the one that works
  gates[0](json({}, 504))
  const done = await a
  assert.equal(done.total, 37)
  assert.equal(hosts[3], 'overpass.openstreetmap.fr')
  assert.equal(hosts.length, 4)
})

test('when every server fails the error says which and why', async () => {
  const h = harness({ responses: [json({}, 504), new Error('network down'), json({}, 500)] })
  await assert.rejects(h.net.buildings({ lat: 1, lon: 1 }), /overpass-api\.de.*504.*openstreetmap\.fr.*network down.*private\.coffee.*500/)
})

test('a request cancelled before it starts, or while it runs, never goes on to the next server', async () => {
  const h = harness()
  const c = new AbortController()
  c.abort()
  await assert.rejects(h.net.buildings({ lat: 1, lon: 1 }, 200, c.signal))
  await assert.rejects(h.net.search('abc', 'en', c.signal))
  assert.equal(h.calls.length, 0, 'nothing is sent for a call that was cancelled')
  const g = harness({ responses: [Object.assign(new Error('aborted'), { name: 'AbortError' })] })
  const live = new AbortController()
  const pending = g.net.buildings({ lat: 1, lon: 1 }, 200, live.signal)
  live.abort()
  await assert.rejects(pending)
  assert.equal(g.calls.length, 1)
})

test('switching a service off while a call waits sends nothing', async () => {
  let on = ['search', 'buildings']
  const calls = []
  const waits = []
  let t = 10_000
  const net = createNet({
    allowed: (s) => on.includes(s),
    fetch: async (url) => { calls.push(url); return json([]) },
    wait: async (ms) => { waits.push(ms); t += ms; on = [] },
    now: () => t,
  })
  await net.search('abc')
  assert.equal(calls.length, 1)
  // the second search waits out the second, and the switch goes off during the wait
  await assert.rejects(net.search('abcd'), Refused)
  assert.equal(calls.length, 1, 'the request was not sent after the switch went off')
  // between two Overpass servers
  on = ['buildings']
  const hosts = []
  const net2 = createNet({
    allowed: (s) => on.includes(s),
    fetch: async (url) => { hosts.push(new URL(url).host); on = []; return json({}, 504) },
  })
  await assert.rejects(net2.buildings({ lat: 1, lon: 1 }), Refused)
  assert.deepEqual(hosts, ['overpass-api.de'], 'the second server was never asked')
})

test('searches go out one at a time, in the order they were made', async () => {
  const order = []
  let t = 0
  const net = createNet({
    allowed: () => true,
    fetch: async (url) => {
      order.push(new URL(url).searchParams.get('q'))
      return json([])
    },
    wait: async (ms) => { t += ms },
    now: () => t,
  })
  await Promise.all([net.search('first'), net.search('second'), net.search('third')])
  assert.deepEqual(order, ['first', 'second', 'third'])
})

test('tiles are plain https images from one host, and the list of origins is what the policy will allow', () => {
  const h = harness()
  assert.equal(h.net.tileUrl(17, 109708, 56367), 'https://tile.openstreetmap.org/17/109708/56367.png')
  assert.deepEqual(ORIGINS.images, ['https://tile.openstreetmap.org'])
  assert.deepEqual(ORIGINS.connect, ['https://nominatim.openstreetmap.org', 'https://overpass-api.de', 'https://overpass.openstreetmap.fr', 'https://overpass.private.coffee'])
  assert.equal(Object.keys(SERVICES).length, 3)
})

test('an address nothing matches is tried again in plainer forms, a second apart, and stops at the first that matches', async () => {
  const hit = json([{ lat: '25.0337', lon: '121.5643', name: 'Apple 台北 101', display_name: 'Apple 台北 101, 45, 市府路, 臺北市', address: { road: '市府路', house_number: '45', city: '臺北市', country_code: 'tw' } }])
  const h = harness({ responses: [json([]), hit] })
  const found = await h.net.lookup('台北市信義區市府路45號7樓', 'zh-TW')
  assert.deepEqual(h.calls.map((c) => new URL(c.url).searchParams.get('q')), ['台北市信義區市府路45號7樓', '台北市信義區市府路 45'])
  assert.equal(found.query, '台北市信義區市府路 45')
  assert.equal(found.exact, true)
  assert.equal(found.places[0].zone, 'Asia/Taipei')
  assert.equal(h.waits.length, 1, 'the second request waited out the second')
})

test('a house number that is not mapped gives the street and says so, and a first match is not retried', async () => {
  const street = json([{ lat: '25.025', lon: '121.5425', name: '和平東路二段', display_name: '和平東路二段, 大安區, 臺北市', address: { road: '和平東路二段', city: '臺北市', country_code: 'tw' } }])
  const h = harness({ responses: [json([]), json([]), street] })
  const found = await h.net.lookup('台北市大安區和平東路二段106號')
  assert.equal(h.calls.length, 3)
  assert.equal(found.query, '台北市大安區和平東路二段')
  assert.equal(found.exact, false)
  const once = harness({ responses: [street] })
  const direct = await once.net.lookup('和平東路二段106號')
  assert.equal(once.calls.length, 1)
  assert.deepEqual([direct.query, direct.exact], [null, true])
})

test('nothing matching anywhere ends after four requests at most, and a switch turned off stops the retries', async () => {
  const h = harness()
  const none = await h.net.lookup('新北市板橋區文化路一段188巷12弄3號')
  assert.deepEqual(none.places, [])
  assert.equal(h.calls.length, 4)
  let on = ['search']
  const calls = []
  const net = createNet({ allowed: (s) => on.includes(s), fetch: async (url) => { calls.push(url); on = []; return json([]) }, wait: async () => {}, now: () => 1_000_000 })
  await assert.rejects(net.lookup('台北市信義區市府路45號'), Refused)
  assert.equal(calls.length, 1, 'turned off after the first answer, the second form is never sent')
})
