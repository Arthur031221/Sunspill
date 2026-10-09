// Writes test/fixtures/height-reference.json from Overpass answers made with buildingQuery():
// for every building that carries a height or a floor count, where its middle is (metres east and north of
// the point that was asked about) and its height. test/obstacles.test.js leaves each one out in turn and
// guesses it from the others, which is how the guess for a building without a height is checked.
//
//   node scripts/make-height-sample.mjs name1 lat1 lon1 answer1.json name2 lat2 lon2 answer2.json ...
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildingHeight, hasHeight } from '../src/core/osm.js'
import { toLocal } from '../src/core/geo.js'

const args = process.argv.slice(2)
const sets = []
for (let i = 0; i + 3 < args.length + 0; i += 4) {
  const [name, lat, lon, file] = args.slice(i, i + 4)
  const center = { lat: Number(lat), lon: Number(lon) }
  const rows = []
  let untagged = 0
  for (const e of JSON.parse(readFileSync(file, 'utf8')).elements) {
    if (e.type !== 'way' || !e.tags || (!e.tags.building && !e.tags['building:part']) || !Array.isArray(e.geometry)) continue
    if (!hasHeight(e.tags)) { untagged++; continue }
    const pts = e.geometry.map((g) => toLocal(center, g.lat, g.lon))
    rows.push([Number((pts.reduce((s, p) => s + p[0], 0) / pts.length).toFixed(1)), Number((pts.reduce((s, p) => s + p[1], 0) / pts.length).toFixed(1)), Number(buildingHeight(e.tags).h.toFixed(1))])
  }
  sets.push({ name, center, untagged, rows })
}
const out = fileURLToPath(new URL('../test/fixtures/height-reference.json', import.meta.url))
writeFileSync(out, JSON.stringify({ source: 'Overpass answers to buildingQuery(), OpenStreetMap contributors, ODbL, fetched 2026-10-10', sets }))
console.log(out, sets.map((s) => `${s.name} ${s.rows.length} with a height, ${s.untagged} without`).join('; '))
