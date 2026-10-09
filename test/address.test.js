import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addressVariants } from '../src/core/address.js'

const queries = (text) => addressVariants(text).map((v) => v.query)

test('a Taiwanese house number takes the form OpenStreetMap finds, then the street', () => {
  assert.deepEqual(addressVariants('台北市信義區市府路45號'), [
    { query: '台北市信義區市府路 45', exact: true },
    { query: '台北市信義區市府路', exact: false },
  ])
  // the floor and the unit after the number are dropped
  assert.deepEqual(queries('台北市信義區市府路45號7樓'), ['台北市信義區市府路 45', '台北市信義區市府路'])
  assert.deepEqual(queries('臺北市中山區南京東路三段219號5樓之2'), ['臺北市中山區南京東路三段 219', '臺北市中山區南京東路三段'])
  // 之 after the number is a sub number, and a section written with a digit does not end the road early
  assert.deepEqual(queries('台北市大安區和平東路3段106號'), ['台北市大安區和平東路3段 106', '台北市大安區和平東路3段'])
  // full width digits and spaces
  assert.deepEqual(queries('台北市信義區　市府路４５號'), ['台北市信義區 市府路 45', '台北市信義區 市府路'])
})

test('a lane or an alley that is not mapped falls back to the road it leaves', () => {
  assert.deepEqual(queries('台北市大安區和平東路二段106巷5號'), ['台北市大安區和平東路二段106巷 5', '台北市大安區和平東路二段106巷', '台北市大安區和平東路二段'])
  assert.deepEqual(queries('新北市板橋區文化路一段188巷12弄3號').slice(-1), ['新北市板橋區文化路一段'])
})

test('a Latin address loses its floor and unit first, then its house number', () => {
  assert.deepEqual(addressVariants('No. 45, Shifu Road, Xinyi District, Taipei City, 5F'), [
    { query: 'No. 45, Shifu Road, Xinyi District, Taipei City', exact: true },
    { query: 'Shifu Road, Xinyi District, Taipei City', exact: false },
  ])
  assert.deepEqual(queries('1600 Pennsylvania Avenue NW, Washington, DC, Apt 4'), ['1600 Pennsylvania Avenue NW, Washington, DC', 'Pennsylvania Avenue NW, Washington, DC'])
  assert.deepEqual(queries('221B Baker Street, London'), ['Baker Street, London'])
  assert.deepEqual(queries('No. 7, Section 5, Xinyi Road, Taipei'), ['Section 5, Xinyi Road, Taipei'])
})

test('text with nothing to simplify, or no street left, gives nothing to try', () => {
  for (const text of ['台北101', 'Taipei 101', 'Shifu Road Taipei', '45號', '號', '', '  ', null, undefined]) {
    assert.deepEqual(addressVariants(text), [], String(text))
  }
})

test('a form is never the typed text, never repeated, and is made of the typed words only', () => {
  for (const text of ['台北市信義區市府路45號7樓', '10 Downing Street, London', 'No. 7, Section 5, Xinyi Road, Taipei']) {
    const all = queries(text)
    assert.equal(new Set(all).size, all.length)
    assert.ok(!all.includes(text))
    for (const q of all) for (const word of q.split(/[\s,]+/).filter(Boolean)) assert.ok(text.includes(word) || /\d/.test(word), `${word} is not in ${text}`)
  }
})

test('a sub number stays on the first form and a form without it is not called exact', () => {
  assert.deepEqual(addressVariants('台北市大安區和平東路3段106之1號'), [
    { query: '台北市大安區和平東路3段 106之1', exact: true },
    { query: '台北市大安區和平東路3段 106', exact: false },
    { query: '台北市大安區和平東路3段', exact: false },
  ])
})

test('a city or a country typed after the number stays on every form, and the floor does not', () => {
  assert.deepEqual(queries('南京路100号7楼, 上海市, 中国'), ['南京路 100, 上海市, 中国', '南京路, 上海市, 中国'])
  assert.deepEqual(queries('南京路100号7楼, 5室, 上海市'), ['南京路 100, 上海市', '南京路, 上海市'])
})

test('a street called No. 5 Road keeps its number, and a floor and a unit both go', () => {
  assert.deepEqual(queries('123 No. 5 Road, Richmond, BC, Apt 4'), ['123 No. 5 Road, Richmond, BC', 'No. 5 Road, Richmond, BC'])
  assert.deepEqual(queries('No. 5 Road, Richmond, BC'), [])
  assert.deepEqual(queries('12 Main Street, London, Floor 7, Apt 4'), ['12 Main Street, London', 'Main Street, London'])
  assert.deepEqual(queries('Xinyi Road No. 45, Taipei'), ['Xinyi Road Taipei'])
  assert.deepEqual(queries('No. 45 Shifu Road, Taipei'), ['Shifu Road, Taipei'])
})
