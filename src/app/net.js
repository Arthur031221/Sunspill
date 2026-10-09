// The only code that talks to other servers. Each service is switched on
// separately by the person using the page, and a call to a service that is off
// fails before any request is made.

import { buildingQuery, parseBuildings, parsePlaces } from '../core/osm.js'
import { zoneAt } from '../core/zone.js'

export const SERVICES = {
  search: { name: 'Nominatim', hosts: ['https://nominatim.openstreetmap.org'], sends: 'the address you type' },
  tiles: { name: 'OpenStreetMap tiles', hosts: ['https://tile.openstreetmap.org'], sends: 'the part of the map you look at' },
  buildings: { name: 'Overpass', hosts: ['https://overpass-api.de', 'https://overpass.openstreetmap.fr', 'https://overpass.private.coffee'], sends: 'the position of the room' },
}

/** Every origin the page may contact, for the content security policy and for tests. */
export const ORIGINS = {
  connect: [...SERVICES.search.hosts, ...SERVICES.buildings.hosts],
  images: SERVICES.tiles.hosts,
}

const OVERPASS_PATH = '/api/interpreter'
const NOMINATIM_GAP = 1100

export class Refused extends Error {
  constructor(service) {
    super(`${service} is switched off`)
    this.service = service
  }
}

/**
 * @param options.allowed (service) => boolean, whether the person switched the service on
 * @param options.fetch   fetch, replaceable for tests
 * @param options.wait    (ms) => Promise, replaceable for tests
 */
export function createNet({ allowed, fetch: fetchImpl = (...a) => fetch(...a), wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), timeout = 15000 } = {}) {
  // a busy Overpass server takes about ten seconds to say so, which is long enough to wait before the next one is tried
  let lastSearch = 0
  let queue = Promise.resolve()
  // the Overpass server that answered last goes first next time, so a busy one is not waited for again
  let preferred = 0

  async function request(url, init, signal, service) {
    // the switch is read again right before the request, so a service turned off while a call waits sends nothing
    if (!allowed(service)) throw new Refused(service)
    if (signal?.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort)
    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal, credentials: 'omit' })
      if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`)
      return await res.json()
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }

  return {
    /** Places matching an address or a name. At most one request a second, as the Nominatim usage policy asks. */
    async search(query, lang = 'en', signal) {
      if (!allowed('search')) throw new Refused('search')
      const q = String(query).trim().slice(0, 200)
      if (q.length < 2) return []
      // one at a time, a second apart, and a search that was cancelled while it waited is never sent
      const run = async () => {
        if (signal?.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' })
        const gap = lastSearch + NOMINATIM_GAP - now()
        if (gap > 0) await wait(gap)
        lastSearch = now()
        const url = `${SERVICES.search.hosts[0]}/search?format=jsonv2&addressdetails=1&limit=6&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`
        const places = parsePlaces(await request(url, {}, signal, 'search'))
        return places.map((p) => ({ ...p, zone: zoneAt(p.lat, p.lon) }))
      }
      const mine = queue.then(run, run)
      queue = mine.catch(() => {})
      return mine
    },

    /**
     * Building outlines around a point, trying each Overpass server in turn. `options` goes to parseBuildings,
     * except `onNext(host)`, which is called before each server after the first so the page can say it is still trying.
     */
    async buildings(center, radius = 200, signal, options) {
      if (!allowed('buildings')) throw new Refused('buildings')
      const { onNext, ...parse } = options ?? {}
      const body = new URLSearchParams({ data: buildingQuery(center.lat, center.lon, radius) })
      const failures = []
      const hosts = SERVICES.buildings.hosts
      // taken once: another request may change `preferred` while this one waits, and this one must still try every server
      const first = preferred
      for (let n = 0; n < hosts.length; n++) {
        const at = (first + n) % hosts.length
        const host = hosts[at]
        if (n > 0) onNext?.(new URL(host).host)
        try {
          const json = await request(host + OVERPASS_PATH, { method: 'POST', body }, signal, 'buildings')
          if (!Array.isArray(json?.elements)) throw new Error('no elements in the answer')
          const parsed = parseBuildings(json, center, parse)
          preferred = at
          return parsed
        } catch (err) {
          if (signal?.aborted || err instanceof Refused) throw err
          failures.push(`${new URL(host).host}: ${err.message}`)
        }
      }
      throw new Error(failures.join('; '))
    },

    tileUrl(z, x, y) {
      if (!allowed('tiles')) throw new Refused('tiles')
      return `${SERVICES.tiles.hosts[0]}/${z}/${x}/${y}.png`
    },
  }
}
