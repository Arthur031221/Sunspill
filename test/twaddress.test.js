import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractAddress } from '../src/core/twaddress.js'

test('a Taiwanese address with a lane, a house number and a floor is taken apart', () => {
  const a = extractAddress('台北市大安區復興南路二段151巷5號5樓')
  assert.equal(a.city, '台北市')
  assert.equal(a.district, '大安區')
  assert.equal(a.road, '復興南路二段')
  assert.equal(a.lane, '151')
  assert.equal(a.number, '5')
  assert.equal(a.floor, 5)
  assert.equal(a.address, '台北市大安區復興南路二段151巷5號')
  // Nominatim finds this form and not the free text
  assert.deepEqual(a.query, { street: '5 復興南路二段151巷', city: '台北市' })
})

test('the simplified 号 and full width digits read the same as 號', () => {
  const plain = extractAddress('台北市大安區復興南路二段151巷5號5樓')
  assert.equal(plain.number, '5')
  assert.deepEqual(extractAddress('台北市大安區復興南路二段151巷5号5樓'), plain)
  assert.deepEqual(extractAddress('台北市大安區復興南路二段１５１巷５號５樓'), plain)
  assert.deepEqual(extractAddress('  台北市 大安區 復興南路二段151巷5號 5樓 '), plain)
})

test('an address is found inside pasted listing text, with its floor', () => {
  const text = '【大安區電梯華廈】捷運六張犁站步行5分鐘\n3房2廳2衛 25.8坪 屋齡32年\n地址：台北市大安區復興南路二段151巷5號5樓\n總價 2,380萬 (每坪92萬) 聯絡 0912-345-678'
  const a = extractAddress(text)
  assert.equal(a.address, '台北市大安區復興南路二段151巷5號')
  assert.equal(a.floor, 5)
  assert.equal(a.query.street, '5 復興南路二段151巷')
})

test('the floor can be written as 5F, in Chinese numerals, with a unit after it, or as a pair with the total', () => {
  assert.equal(extractAddress('台北市信義區市府路45號7F').floor, 7)
  assert.equal(extractAddress('台北市信義區市府路45號十二樓').floor, 12)
  assert.equal(extractAddress('台北市信義區市府路45號二十三樓').floor, 23)
  assert.equal(extractAddress('台北市中山區南京東路三段219號5樓之2').floor, 5)
  const pair = extractAddress('台北市大安區和平東路三段106號 樓層：8/12')
  assert.equal(pair.floor, 8)
  assert.equal(pair.levels, 12)
  const pair2 = extractAddress('台北市大安區和平東路三段106號 8樓/共12層')
  assert.equal(pair2.floor, 8)
  assert.equal(pair2.levels, 12)
  // a basement is not a floor the quick check can use
  assert.equal(extractAddress('台北市大安區和平東路三段106號B1').floor, null)
})

test('no floor in the text gives none, and a house number with a sub number keeps it', () => {
  const a = extractAddress('台北市大安區和平東路三段106之1號')
  assert.equal(a.floor, null)
  assert.equal(a.number, '106之1')
  assert.deepEqual(a.query, { street: '106之1 和平東路三段', city: '台北市' })
})

test('an alley, a county and a road with no house number', () => {
  const alley = extractAddress('新北市板橋區文化路一段188巷20弄3號2樓')
  assert.equal(alley.lane, '188')
  assert.equal(alley.alley, '20')
  assert.equal(alley.number, '3')
  assert.equal(alley.floor, 2)
  assert.deepEqual(alley.query, { street: '3 文化路一段188巷20弄', city: '新北市' })
  const county = extractAddress('彰化縣員林市中山路一段100號')
  assert.equal(county.city, '彰化縣')
  assert.equal(county.district, '員林市')
  assert.deepEqual(county.query, { street: '100 中山路一段', city: '彰化縣' })
  const road = extractAddress('台北市信義區市府路')
  assert.equal(road.number, null)
  assert.deepEqual(road.query, { street: '市府路', city: '台北市' })
})

test('without a city the road and number still go, and without a road there is nothing to take', () => {
  const a = extractAddress('復興南路二段151巷5號5樓')
  assert.equal(a.city, null)
  assert.deepEqual(a.query, { street: '5 復興南路二段151巷', city: null })
  for (const text of ['台北101', 'Taipei 101', 'No. 45, Shifu Road, Taipei', '', '   ', null, undefined, '5樓', '25坪 3房2廳']) assert.equal(extractAddress(text), null, String(text))
})

test('臺 and 台 stay as typed, and the text is never longer than what was asked for', () => {
  assert.equal(extractAddress('臺北市中正區重慶南路一段122號3樓').city, '臺北市')
  const a = extractAddress('x'.repeat(5000) + '台北市大安區復興南路二段151巷5號5樓')
  assert.equal(a.number, '5')
  assert.ok(a.address.length < 60)
})
