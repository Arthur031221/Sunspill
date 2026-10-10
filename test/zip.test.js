import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readZip } from '../scripts/lib/zip.mjs'

const sample = readFileSync(new URL('./fixtures/deals/sample.zip', import.meta.url))

test('a zip is read into its files, deflated and stored alike, and a folder is not a file', () => {
  const files = readZip(sample)
  assert.deepEqual([...files.keys()].sort(), ['a_lvr_land_a.csv', 'build_time.xml', 'c_lvr_land_c.csv'])
  assert.equal(files.get('build_time.xml').toString('utf8'), '<lvr_time>登記日期 115年6月11日至 115年9月10日</lvr_time>')
  assert.equal(files.get('a_lvr_land_a.csv').toString('utf8'), '鄉鎮市區,交易標的\n大安區,房地\n'.repeat(40))
  assert.equal(files.get('c_lvr_land_c.csv').toString('utf8'), 'x')
})

test('only the files that are asked for are opened', () => {
  assert.deepEqual([...readZip(sample, (name) => name.endsWith('.xml')).keys()], ['build_time.xml'])
})

test('something that is not a zip, or is cut short, is refused', () => {
  assert.throws(() => readZip(Buffer.from('<html>no such season</html>')), /not a zip/)
  assert.throws(() => readZip(sample.subarray(0, sample.length - 30)), /not a zip|damaged/)
  assert.throws(() => readZip(Buffer.alloc(0)), /not a zip/)
})
