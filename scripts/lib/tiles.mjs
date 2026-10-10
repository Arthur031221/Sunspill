// Deals with a position, cut into the small files the quick check reads: one file for each map tile at level 15,
// and a tile that comes out too big is cut into its four tiles one level down, again and again to level 17.
// There is no file for a tile that was cut, only for the tiles it was cut into, and the index lists the files.

import { Buffer } from 'node:buffer'
import { COLS, DEALS_FORMAT, DEALS_MAX_ZOOM, DEALS_ZOOM, TYPES, KINDS, childTiles, packDeal, tileName, tileOf } from '../../src/core/deals.js'

/** A tile file as text: a header, and one row to a line so that a month's change is a small diff. */
export function tileText(file) {
  const head = { v: DEALS_FORMAT, z: file.z, x: file.x, y: file.y, cols: COLS, addrs: file.addrs }
  const lines = file.rows.map((r) => JSON.stringify(r)).join(',\n')
  return `${JSON.stringify(head).slice(0, -1)},"rows":[\n${lines}\n]}\n`
}

/** Newest first, then by place and price, so that the same data always gives the same file. */
const order = (a, b) => b.date.localeCompare(a.date) || b.lat - a.lat || a.lon - b.lon || a.kind.localeCompare(b.kind) || a.price - b.price

function make(tile, deals) {
  const sorted = [...deals].sort(order)
  const addrs = [...new Set(sorted.map((d) => d.addr).filter(Boolean))].sort()
  const index = new Map(addrs.map((a, i) => [a, i]))
  return { ...tile, addrs, rows: sorted.map((d) => packDeal(d, d.addr ? index.get(d.addr) : null)) }
}

/**
 * @param {object[]} deals each with `lat`, `lon`, the fields of a deal (see core/deals.js packDeal) and `addr`, its address key or null
 * @param {{maxBytes?: number, zoom?: number, maxZoom?: number}} options `maxBytes` is the most a file may take (200,000 is the aim)
 * @returns {{files: Map<string, {text:string, deals:number, bytes:number}>, leaves: Record<number, string[]>, oversize: string[]}}
 *   `files` by name, `leaves` the names (x-y) of the files at each level, `oversize` the files still too big at the deepest level
 */
export function buildTiles(deals, { maxBytes = 190000, zoom = DEALS_ZOOM, maxZoom = DEALS_MAX_ZOOM } = {}) {
  const files = new Map()
  const leaves = {}
  const oversize = []
  const place = (tile, group) => {
    const file = make(tile, group)
    const text = tileText(file)
    const bytes = Buffer.byteLength(text)
    if (bytes > maxBytes && tile.z < maxZoom) {
      const next = childTiles(tile)
      const parts = next.map(() => [])
      for (const d of group) {
        const at = tileOf(d.lat, d.lon, tile.z + 1)
        parts[next.findIndex((c) => c.x === at.x && c.y === at.y)].push(d)
      }
      next.forEach((c, i) => parts[i].length && place(c, parts[i]))
      return
    }
    if (bytes > maxBytes) oversize.push(tileName(tile))
    files.set(`${tileName(tile)}.json`, { text, deals: group.length, bytes })
    ;(leaves[tile.z] ??= []).push(`${tile.x}-${tile.y}`)
  }
  const groups = new Map()
  // the tile of a deal is the tile of the place as it is written in the file, which is rounded to five decimals
  for (const d of deals.map((x) => ({ ...x, lat: Math.round(x.lat * 1e5) / 1e5, lon: Math.round(x.lon * 1e5) / 1e5 }))) {
    const t = tileOf(d.lat, d.lon, zoom)
    const name = tileName(t)
    if (!groups.has(name)) groups.set(name, { tile: t, deals: [] })
    groups.get(name).deals.push(d)
  }
  for (const { tile, deals: group } of [...groups.values()].sort((a, b) => a.tile.x - b.tile.x || a.tile.y - b.tile.y)) place(tile, group)
  for (const z of Object.keys(leaves)) leaves[z].sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]) || Number(a.split('-')[1]) - Number(b.split('-')[1]))
  return { files, leaves, oversize }
}

/** The index file: what the data is, how fresh, and which tile files exist. */
export function indexText({ asof, built, leaves, counts, sources }) {
  return `${JSON.stringify({ v: DEALS_FORMAT, zoom: DEALS_ZOOM, maxZoom: DEALS_MAX_ZOOM, asof, built, cols: COLS, kinds: KINDS, types: TYPES, counts, sources, tiles: leaves })}\n`
}
