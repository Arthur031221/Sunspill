// The past deals files, fetched from the address the page itself came from. data/deals/index.json says which tile
// files exist, and a place needs the tiles that its circle touches. No other host is asked, so there is nothing to
// switch on: the files are static, like the page. The server that has the page sees which tiles were asked for,
// each about a kilometre across, as it sees any file it serves.

import { DEALS_ZOOM, DEALS_MAX_ZOOM, DEALS_FORMAT, parseTile, tileName, tilesAround } from '../core/deals.js'

export const DEALS_PATH = 'data/deals/'
const KEEP = 40

class Missing extends Error {}

/**
 * @param options.fetch   fetch, replaceable for tests
 * @param options.base    where the files are, relative to the page
 */
export function createDeals({ fetch: fetchImpl = (...a) => fetch(...a), base = DEALS_PATH } = {}) {
  let index = null
  const tiles = new Map()

  async function getJson(path, signal) {
    const res = await fetchImpl(base + path, { signal, credentials: 'omit' })
    if (res.status === 404) throw new Missing(path)
    if (!res.ok) throw new Error(`${path} answered ${res.status}`)
    return res.json()
  }

  /** The index, once. A file that is not an index of ours counts as missing. */
  function loadIndex(signal) {
    if (!index) {
      index = getJson('index.json', signal)
        .then((json) => {
          if (json?.v !== DEALS_FORMAT || typeof json.tiles !== 'object' || !json.tiles) throw new Missing('index.json')
          const have = {}
          for (const [z, list] of Object.entries(json.tiles)) if (Array.isArray(list)) have[z] = new Set(list)
          return { asof: String(json.asof ?? ''), have, zoom: Number(json.zoom) || DEALS_ZOOM, maxZoom: Number(json.maxZoom) || DEALS_MAX_ZOOM }
        })
        .catch((err) => {
          index = null
          throw err
        })
    }
    return index
  }

  function loadTile(name, signal) {
    let hit = tiles.get(name)
    if (!hit) {
      hit = getJson(`${name}.json`, signal).then((json) => parseTile(json) ?? []).catch((err) => {
        tiles.delete(name)
        // a tile that the index lists and is not there is a place with no deals, not a failure
        if (err instanceof Missing) return []
        throw err
      })
      tiles.set(name, hit)
      if (tiles.size > KEEP) tiles.delete(tiles.keys().next().value)
    }
    return hit
  }

  return {
    /**
     * The deals in the tiles that a circle round a place touches.
     * @returns {Promise<{status:'ok', deals:object[], asof:string}|{status:'none'|'missing'|'failed'}>} `none` when no
     *   tile is near (outside the four cities), `missing` when this copy of the page has no deals data, `failed` when the files would not come
     */
    async around(lat, lon, metres, signal) {
      try {
        if (typeof location !== 'undefined' && location.protocol === 'file:') return { status: 'missing' }
        const idx = await loadIndex(signal)
        const names = []
        for (let z = idx.zoom; z <= idx.maxZoom; z++) {
          const have = idx.have[z]
          if (!have) continue
          for (const t of tilesAround(lat, lon, metres, z)) if (have.has(`${t.x}-${t.y}`)) names.push(tileName(t))
        }
        if (!names.length) return { status: 'none' }
        const lists = await Promise.all(names.map((name) => loadTile(name, signal)))
        return { status: 'ok', deals: lists.flat(), asof: idx.asof }
      } catch (err) {
        if (signal?.aborted) throw err
        return { status: err instanceof Missing ? 'missing' : 'failed' }
      }
    },
  }
}
