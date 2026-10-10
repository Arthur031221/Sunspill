#!/usr/bin/env node
// Builds the past deals data of the quick check: data/deals/<z>-<x>-<y>.json, one file for each map tile, and an index.
//
//   node scripts/make-deals.mjs [--out data/deals] [--cache .tmp/deals-cache] [--seasons 4] [--cities a,f,b,h]
//                               [--now 2026-10-10] [--max-bytes 190000] [--strict] [--offline] [--dry]
//
// What it does:
//   1. downloads the last four seasons of 實價登錄 (the sales and the rentals of Taipei, New Taipei, Taichung and
//      Taoyuan) from plvr.land.moi.gov.tw, and the address points of the four cities from their open data
//   2. keeps the deals of homes that were sold or let on the market (see scripts/lib/lvr.mjs for what is left out)
//   3. gives each deal the position of its address, and counts the ones that have none
//   4. writes the tiles, cutting any that is over --max-bytes into smaller ones
//
// It runs in Node 20 or newer with no packages, locally or in .github/workflows/deals.yml, and nowhere in the browser.
// With --strict it stops without writing anything if a dataset could not be fetched, so that a monthly run never
// replaces the data of four cities with the data of three. Only government open data is read.

import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { monthIndex } from '../src/core/deals.js'
import { CITIES, createGeocoder, dealFromRow, parseCsv, readPoints } from './lib/lvr.mjs'
import { buildTiles, indexText } from './lib/tiles.mjs'
import { readZip } from './lib/zip.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const AGENT = 'sunspill-deals/1 (https://github.com/Arthur031221/Sunspill, build script for open data)'
const SEASON_URL = (code) => `https://plvr.land.moi.gov.tw/DownloadSeason?season=${code}&type=zip&fileName=lvr_landcsv.zip`

// the address points of each city, from data.gov.tw (the dataset number) with a link that worked on 2026-10-10 to fall back on
const POINTS = {
  a: { dataset: 155472, fallback: 'https://data.taipei/api/dataset/b7c8e724-1e98-45ee-a0bd-f3840623ed97/resource/ce76ca0c-7f94-4935-ab47-1d2a41ca2abb/download', pick: 'first' },
  f: { dataset: 168887, fallback: 'https://data.ntpc.gov.tw/api/datasets/d7b568ab-3819-40c8-a6e7-a6b199443101/csv/file', pick: 'first' },
  b: { dataset: 169806, fallback: null, pick: 'drive' },
  h: { dataset: 157689, fallback: 'https://opendata.tycg.gov.tw/api/dataset/ec47dbd5-9ed8-4c8d-8ce1-ccb63b1b72e6/resource/d00ecba4-dec2-4a62-bfc7-989a8359cebe/download', pick: 'last' },
}

function options(argv) {
  const o = { out: 'data/deals', cache: '.tmp/deals-cache', seasons: 4, cities: CITIES.map((c) => c.letter), now: new Date(), maxBytes: 190000, strict: false, offline: false, dry: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--out') o.out = next()
    else if (a === '--cache') o.cache = next()
    else if (a === '--seasons') o.seasons = Number(next())
    else if (a === '--cities') o.cities = next().split(',')
    else if (a === '--now') o.now = new Date(`${next()}T12:00:00Z`)
    else if (a === '--max-bytes') o.maxBytes = Number(next())
    else if (a === '--strict') o.strict = true
    else if (a === '--offline') o.offline = true
    else if (a === '--dry') o.dry = true
    else throw new Error(`unknown option ${a}`)
  }
  return o
}

// ---------------------------------------------------------------- fetching

const log = (...a) => console.log(...a)
const failures = []

async function fetchOk(url, tries = 3) {
  let last
  for (let n = 1; n <= tries; n++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': AGENT }, redirect: 'follow', signal: AbortSignal.timeout(20 * 60 * 1000) })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return res
    } catch (err) {
      last = err
      if (n < tries) await new Promise((r) => setTimeout(r, 2000 * n))
    }
  }
  throw new Error(`${url}: ${last.message}`)
}

/** Download to a file in the cache, unless it is there already. The start of the file is checked, since some servers answer a missing file with a page. */
async function download(url, file, { offline, expect }) {
  if (existsSync(file) && statSync(file).size > 0) return file
  if (offline) throw new Error(`${file} is not in the cache and --offline was given`)
  mkdirSync(dirname(file), { recursive: true })
  const res = await fetchOk(url)
  const part = `${file}.part`
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part))
  // only the start of the file is read, since the address files are 100 MB and more
  const fd = openSync(part, 'r')
  const head = Buffer.alloc(64)
  readSync(fd, head, 0, 64, 0)
  closeSync(fd)
  if (expect === 'zip' && head.toString('latin1', 0, 2) !== 'PK') {
    rmSync(part)
    throw new Error(`${url} did not answer with a zip file`)
  }
  if (expect === 'csv' && /^\s*<(!doctype|html)/i.test(head.toString('utf8'))) {
    rmSync(part)
    throw new Error(`${url} answered with a web page and not a CSV file`)
  }
  renameSync(part, file)
  return file
}

async function json(url) {
  return (await fetchOk(url)).json()
}

/** Which link has the address points of a city today. */
async function pointsUrl(letter, o) {
  const spec = POINTS[letter]
  try {
    if (o.offline) throw new Error('offline')
    const meta = await json(`https://data.gov.tw/api/v2/rest/dataset/${spec.dataset}`)
    const csv = (meta.result?.distribution ?? []).filter((d) => /csv/i.test(d.resourceFormat ?? '') && (d.resourceDownloadUrl || d.downloadURL))
    const link = (d) => d.resourceDownloadUrl || d.downloadURL
    if (spec.pick === 'first' && csv.length) return link(csv[0])
    if (spec.pick === 'last' && csv.length) return link(csv.at(-1))
    if (spec.pick === 'drive' && csv.length) {
      // Taichung publishes a list of its files, and the address file is a Google Drive link in the last row that says 門牌
      const listFile = await download(link(csv[0]), `${o.cache}/points-b-list.csv`, { offline: o.offline, expect: 'csv' })
      const rows = parseCsv(readFileSync(listFile, 'utf8')).filter((r) => /門牌號碼/.test(r[0] ?? '') && /csv/i.test(r[2] ?? ''))
      const id = /\/d\/([\w-]+)/.exec(rows.at(-1)?.[3] ?? '')?.[1]
      if (id) return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`
    }
  } catch (err) {
    log(`  (${spec.dataset} could not be looked up on data.gov.tw: ${err.message})`)
  }
  if (spec.fallback) return spec.fallback
  throw new Error(`no link for the address points of dataset ${spec.dataset}`)
}

// ---------------------------------------------------------------- seasons

/** The season codes from the one of `now` back: 115S4, 115S3, 115S2 and so on. */
export function seasonCodes(now, count) {
  let year = now.getUTCFullYear() - 1911
  let q = Math.floor(now.getUTCMonth() / 3) + 1
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(`${year}S${q}`)
    if (--q === 0) {
      q = 4
      year--
    }
  }
  return out
}

/** The last day of the registrations in a season file, as yyyy-mm, from the note in it ("登記日期 115年6月11日至 115年9月10日"). */
export function seasonEnd(xml) {
  const m = /登記日期\s*\d+年\d+月\d+日至\s*(\d+)年(\d+)月(\d+)日/.exec(xml)
  return m ? `${Number(m[1]) + 1911}-${String(m[2]).padStart(2, '0')}` : null
}

// ---------------------------------------------------------------- main

async function main() {
  const o = options(process.argv.slice(2))
  const out = resolve(root, o.out)
  const cache = resolve(root, o.cache)
  o.cache = cache
  const cities = CITIES.filter((c) => o.cities.includes(c.letter))
  log(`Past deals for ${cities.map((c) => c.name).join(', ')}, ${o.seasons} seasons, now ${o.now.toISOString().slice(0, 10)}`)

  // 1. the seasons: the newest ones that exist, since a season that has not closed answers with a page
  const seasons = []
  for (const code of seasonCodes(o.now, o.seasons + 4)) {
    if (seasons.length === o.seasons) break
    try {
      const file = await download(SEASON_URL(code), `${cache}/season-${code}.zip`, { offline: o.offline, expect: 'zip' })
      seasons.push({ code, zip: readZip(await readFile(file), (n) => /^[afbh]_lvr_land_[ac]\.csv$|^build_time\.xml$/.test(n)) })
      log(`  season ${code}: ${(statSync(file).size / 1e6).toFixed(1)} MB`)
    } catch (err) {
      log(`  season ${code}: not available (${err.message.slice(0, 120)})`)
      if (!/did not answer with a zip/.test(err.message)) failures.push(`season ${code}: ${err.message}`)
    }
  }
  if (seasons.length < o.seasons) failures.push(`only ${seasons.length} of ${o.seasons} seasons could be fetched`)
  const asof = seasonEnd(seasons[0]?.zip.get('build_time.xml')?.toString('utf8') ?? '') ?? o.now.toISOString().slice(0, 7)
  // a deal is kept for 13 months of the newest data, which is a month more than the page looks back
  const cutoff = monthIndex(asof) - 13
  log(`  data to ${asof}, deals from ${Math.floor(cutoff / 12)}-${String((cutoff % 12) + 1).padStart(2, '0')}`)

  // 2. the deals of each city
  const report = {}
  const all = []
  for (const city of cities) {
    const seen = new Set()
    const rep = (report[city.letter] = { name: city.name, rows: 0, kept: 0, skipped: {}, matched: 0, misses: {} })
    const deals = []
    for (const kind of ['sale', 'rent']) {
      for (const season of seasons) {
        const buf = season.zip.get(`${city.letter}_lvr_land_${kind === 'sale' ? 'a' : 'c'}.csv`)
        if (!buf) {
          failures.push(`${city.name} ${kind} file missing from season ${season.code}`)
          continue
        }
        const rows = parseCsv(buf.toString('utf8'))
        const headers = rows[0]
        for (const row of rows.slice(2)) {
          if (row.length < headers.length - 6) continue
          rep.rows++
          const r = dealFromRow(headers, row, kind, { cutoff })
          if (r.skip) {
            rep.skipped[r.skip] = (rep.skipped[r.skip] ?? 0) + 1
            continue
          }
          const id = `${kind}:${r.deal.serial}`
          if (r.deal.serial && seen.has(id)) {
            rep.skipped.again = (rep.skipped.again ?? 0) + 1
            continue
          }
          seen.add(id)
          deals.push({ ...r.deal, city: city.letter })
        }
      }
    }
    rep.kept = deals.length
    log(`  ${city.name}: ${rep.rows} rows, ${deals.length} homes sold or let on the market`)

    // 3. their positions
    const geocoder = createGeocoder()
    for (const d of deals) geocoder.want(d.keys)
    try {
      const url = await pointsUrl(city.letter, o)
      const file = await download(url, `${cache}/points-${city.letter}.csv`, { offline: o.offline, expect: 'csv' })
      const { rows, kept } = await readPoints(file, geocoder)
      geocoder.learn(deals)
      log(`    address points: ${rows} rows, ${kept} for the addresses of the deals, ${geocoder.names.size} districts told apart`)
    } catch (err) {
      failures.push(`${city.name} address points (data.gov.tw dataset ${POINTS[city.letter].dataset}): ${err.message}`)
      log(`    address points FAILED: ${err.message}`)
      continue
    }
    for (const d of deals) {
      const at = geocoder.resolve(d)
      if (at.miss) {
        rep.misses[at.miss] = (rep.misses[at.miss] ?? 0) + 1
        continue
      }
      rep.matched++
      all.push({ ...d, lat: at.lat, lon: at.lon, addr: d.key })
    }
    log(`    matched ${rep.matched} of ${deals.length} (${((100 * rep.matched) / Math.max(1, deals.length)).toFixed(1)} percent)`)
  }

  // 4. the files
  const { files, leaves, oversize } = buildTiles(all, { maxBytes: o.maxBytes })
  const counts = { sale: all.filter((d) => d.kind === 'sale').length, rent: all.filter((d) => d.kind === 'rent').length }
  const bytes = [...files.values()].map((f) => f.bytes)
  const total = bytes.reduce((a, b) => a + b, 0)
  log('\nReport')
  for (const r of Object.values(report)) {
    const rate = (100 * r.matched) / Math.max(1, r.kept)
    log(`  ${r.name}: ${r.kept} candidates, ${r.matched} matched, ${rate.toFixed(1)} percent. Not matched: ${JSON.stringify(r.misses)}. Left out before: ${JSON.stringify(r.skipped)}`)
  }
  const kept = Object.values(report).reduce((a, r) => a + r.kept, 0)
  log(`  all: ${all.length} of ${kept} matched, ${((100 * all.length) / Math.max(1, kept)).toFixed(1)} percent (${counts.sale} sales, ${counts.rent} rentals)`)
  log(`  files: ${files.size}, largest ${Math.max(0, ...bytes)} bytes, total ${(total / 1e6).toFixed(1)} MB${oversize.length ? `, still over the limit: ${oversize.join(' ')}` : ''}`)
  if (failures.length) {
    log('\nFailed:')
    for (const f of failures) log(`  ${f}`)
  }
  if (failures.length && o.strict) {
    log('Nothing was written (--strict).')
    process.exit(1)
  }
  if (o.dry) return
  if (!all.length) throw new Error('no deals to write')

  mkdirSync(out, { recursive: true })
  for (const name of readdirSync(out)) if (/^\d+-\d+-\d+\.json$|^index\.json$/.test(name)) rmSync(`${out}/${name}`)
  for (const [name, file] of files) writeFileSync(`${out}/${name}`, file.text)
  const sources = [
    '內政部不動產交易實價查詢服務網 https://plvr.land.moi.gov.tw/ 依政府資料開放授權條款第1版',
    '臺北市、新北市、臺中市、桃園市政府門牌位置開放資料 data.gov.tw 155472 168887 169806 157689 依政府資料開放授權條款第1版',
  ]
  writeFileSync(`${out}/index.json`, indexText({ asof, built: o.now.toISOString().slice(0, 10), leaves, counts, sources }))
  log(`Wrote ${files.size} files and index.json to ${o.out}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
