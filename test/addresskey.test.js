import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addressKey, chineseNumber } from '../src/core/addresskey.js'

const key = (text, options) => addressKey(text, options)?.key

test('a deal address is cut down to the road, lane, alley and house number, with no city, district or floor', () => {
  assert.deepEqual(addressKey('臺北市文山區羅斯福路六段１０６號十樓'), { key: '羅斯福路六段106號', keys: ['羅斯福路六段106號'], city: '台北市', district: '文山區' })
  assert.equal(key('臺北市大安區復興南路二段１５１巷５號'), '復興南路二段151巷5號')
  assert.equal(key('新北市三重區中山路36號'), '中山路36號')
  assert.equal(key('臺北市中山區新生北路三段４３號２樓之３０'), '新生北路三段43號')
})

test('the same house gives the same key however it was typed: full width digits, 臺 or 台, 号, spaces', () => {
  const forms = ['台北市大安區復興南路二段151巷5號', '臺北市大安區復興南路二段１５１巷５號十樓', '台北市大安區復興南路二段 151 巷 5 号', '復興南路二段151巷5號', '臺北市大安區　復興南路二段１５１巷５號　５樓之１']
  assert.deepEqual(new Set(forms.map((f) => key(f))), new Set(['復興南路二段151巷5號']))
})

test('a number with a part after it, 24之1, and the hyphen that some deals write for it, are the same house', () => {
  assert.equal(key('新北市五股區成泰路一段２３７之１２號三樓'), '成泰路一段237之12號')
  assert.equal(key('新北市新店區中興路三段２２１－４號十一樓'), '中興路三段221之4號')
  assert.equal(key('臺中市大里區大明路2之3之2號'), '大明路2之3之2號')
  assert.equal(key('新北市新店區中興路三段221-4號'), key('新北市新店區中興路三段221之4號'))
})

test('a section written 1段 or 貳段 is the section 一段 or 二段 of the address files', () => {
  assert.equal(key('臺北市中正區辛亥路１段７巷１１號２樓'), '辛亥路一段7巷11號')
  assert.equal(key('臺中市中區三民路貳段３７號１１樓-４'), '三民路二段37號')
  assert.equal(key('臺北市信義區基隆路2段177號'), '基隆路二段177號')
})

test('a lane with a name, the third level of Taoyuan (衖) and a house number in Chinese are read', () => {
  assert.equal(key('新北市板橋區三民路二段正隆巷４６弄１號'), '三民路二段正隆巷46弄1號')
  assert.equal(key('桃園市觀音區文化路石橋段６２５巷１６０弄１７衖９號'), '文化路石橋段625巷160弄17衖9號')
  assert.equal(key('臺北市中正區忠孝東路二段七號'), '忠孝東路二段7號')
  assert.equal(key('新北市三重區中央南路二十五號四樓'), '中央南路25號')
})

test('平鎮區 is a district whole, though the address reader of the quick check stops at 平鎮', () => {
  assert.deepEqual(addressKey('桃園市平鎮區復旦路二段２１１巷９號三樓'), { key: '復旦路二段211巷9號', keys: ['復旦路二段211巷9號'], city: '桃園市', district: '平鎮區' })
})

test('a list of houses gives a key for each, and a floor list after the number is not a list of houses', () => {
  assert.deepEqual(addressKey('臺北市大同區民生西路４１９、４２１號').keys, ['民生西路419號', '民生西路421號'])
  assert.deepEqual(addressKey('桃園市中壢區建國路５４、５６號').keys, ['建國路54號', '建國路56號'])
  assert.deepEqual(addressKey('臺北市士林區至誠路一段６２巷３弄１２號一樓、二樓').keys, ['至誠路一段62巷3弄12號'])
  assert.deepEqual(addressKey('臺北市大安區 復興南路一段１２７號十一樓之３、十一樓之４').keys, ['復興南路一段127號'])
})

test('text that has no road and house number gives nothing', () => {
  for (const text of ['通化段六小段344地號', '', '   ', undefined, null, '臺北市大安區', '復興南路二段', '5號', '123']) assert.equal(addressKey(text), null, String(text))
})

test('a row of an address file, which starts at the road and has the floor in the number column, gives the key of its deals', () => {
  const row = (road, area, lane, alley, number) => key(`${road}${area}${lane}${alley}${number}`, { prefix: false })
  assert.equal(row('三民路', '', '', '', '９１號二樓'), '三民路91號')
  assert.equal(row('大誠街', '', '３９巷', '', '２之３之２號'), '大誠街39巷2之3之2號')
  assert.equal(row('三民路二段', '', '正隆巷', '４６弄', '１號地下室'), '三民路二段正隆巷46弄1號')
  assert.equal(row('文化路石橋段', '', '６２５巷', '１６０弄', '１７衖９號'), '文化路石橋段625巷160弄17衖9號')
  assert.equal(row('中山路', '', '', '', '１４號四樓之１'), key('新北市板橋區中山路14號四樓之1'))
  // a road that starts like a district is not cut as one when there is none to cut
  assert.equal(row('市民大道', '', '', '', '８號'), '市民大道8號')
})

test('the key of what a person typed finds the deals of that house', () => {
  assert.equal(key('台北市大安區復興南路二段151巷5號5樓'), key('臺北市大安區復興南路二段１５１巷５號'))
})

test('Chinese numbers up to 999 are read, and what is not a number is not', () => {
  const cases = { 七: 7, 十: 10, 十二: 12, 二十: 20, 二十五: 25, 九十九: 99, 一百零一: 101, 一百二十三: 123, 一百一十: 110 }
  for (const [text, n] of Object.entries(cases)) assert.equal(chineseNumber(text), n, text)
  for (const bad of ['', '一二', '十十', 'abc', '全', '地下']) assert.equal(chineseNumber(bad), null, bad)
})
