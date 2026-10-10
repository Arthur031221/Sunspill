// A Taiwanese address as a key to match on. A past deal (實價登錄) is written "臺北市文山區羅斯福路６段１０６號十樓",
// a point in a city's address file is its road, lane, alley and number in separate columns, and a person types
// "台北市文山區羅斯福路六段106號". The key is the same for all three: the road with its section, the lane and the
// alley, and the house number, in plain digits, and nothing else (no city, district, floor or unit).
// The city and district are taken off with extractAddress (twaddress.js), and the rest is read here, since
// that function does not read a lane with a name, the third level some Taoyuan streets have (衖), or a list of numbers.

import { extractAddress } from './twaddress.js'

const CHINESE_SECTION = '一二三四五六七八九'
const BIG = '壹貳參肆伍陸柒捌玖'
// one house number: 24, 24之1, 24之1之2, or a number with the alley level of Taoyuan in front of it, 2衖1
const NUM = '(?:\\d+(?:之\\d+)*衖)?\\d+(?:之\\d+)*'
const LIST = new RegExp(`^(.*?)(${NUM}(?:[、,，及和至~]${NUM})*)號`, 'u')
const WORDS = /^(.*?)([一二三四五六七八九十]{1,3})號/u

const DIGITS = '一二三四五六七八九'
const WORD_NUMBER = /^(?:([一二三四五六七八九])百)?(?:([一二三四五六七八九])?十)?([一二三四五六七八九])?$/u

/** 7, 十二, 二十五, 一百零一 as numbers, or null when the text is not one. */
export function chineseNumber(text) {
  const m = WORD_NUMBER.exec(String(text).replace(/[零〇]/g, ''))
  if (!m || !m[0]) return null
  const hundreds = m[1] ? DIGITS.indexOf(m[1]) + 1 : 0
  const tens = m[0].includes('十') ? (m[2] ? DIGITS.indexOf(m[2]) + 1 : 1) : 0
  const ones = m[3] ? DIGITS.indexOf(m[3]) + 1 : 0
  return hundreds * 100 + tens * 10 + ones
}

/** A section number in Chinese: 1 to 9 one character, 10 and over as 十, 十一 and so on. */
function sectionWord(n) {
  const v = Number(n)
  return v <= 9 ? CHINESE_SECTION[v - 1] : v === 10 ? '十' : `十${CHINESE_SECTION[v - 11] ?? ''}`
}

/** The same text for the same place: one kind of digit, 台 for 臺, 號 for 号, no spaces, 之 for a hyphen between numbers, a section in Chinese. */
function plain(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/臺/g, '台')
    .replace(/号/g, '號')
    .replace(/(\d+)[-–](?=\d+[號巷弄衖])/g, '$1之')
    .replace(/([路街道])([壹貳參肆伍陸柒捌玖])段/g, (_, w, n) => `${w}${CHINESE_SECTION[BIG.indexOf(n)]}段`)
    .replace(/([路街道])(\d{1,2})段/g, (_, w, n) => `${w}${sectionWord(n)}段`)
}

/** A leading city (or county) and district, whatever of them there is. extractAddress finds them, with a plainer pattern behind it. */
function split(text) {
  const found = extractAddress(text)
  const prefix = `${found?.city ?? ''}${found?.district ?? ''}`.replace(/臺/g, '台')
  if (prefix && text.startsWith(prefix)) {
    // 平鎮區 is read as 平鎮 by extractAddress, which leaves the 區 at the start of what is left
    const tail = text.slice(prefix.length)
    const extra = tail.startsWith('區') && found.district ? '區' : ''
    return { city: found.city?.replace(/臺/g, '台') ?? null, district: `${found.district ?? ''}${extra}` || null, rest: tail.slice(extra.length) }
  }
  const plainer = /^([一-鿿]{2}[市縣])?((?:(?![區鄉鎮市])[一-鿿]){1,3}[區鄉鎮市])?/u.exec(text)
  return { city: plainer?.[1] ?? null, district: plainer?.[2] ?? null, rest: text.slice((plainer?.[1] ?? '').length + (plainer?.[2] ?? '').length) }
}

/**
 * @param {string} text an address as written in a deal, in an address file or by a person, with or without city,
 *   district, floor and unit
 * @param {{prefix?: boolean}} options `prefix: false` for text that starts at the road, as the columns of an
 *   address file do, so that nothing at the start is taken for a district
 * @returns {null|{key:string, keys:string[], city:string|null, district:string|null}} `keys` has one key for each
 *   house number when there are several (a list such as 419、421號, or a range such as 106至108號), and `key` is the
 *   first of them. null when there is no road and house number to read.
 */
export function addressKey(text, { prefix = true } = {}) {
  const clean = plain(text)
  const { city, district, rest } = prefix ? split(clean) : { city: null, district: null, rest: clean }
  let street = null
  let numbers = null
  let m = LIST.exec(rest)
  if (m) {
    street = m[1]
    numbers = m[2].split(/[、,，及和至~]/)
  } else if ((m = WORDS.exec(rest))) {
    const n = chineseNumber(m[2])
    if (n) {
      street = m[1]
      numbers = [String(n)]
    }
  }
  if (!street || !numbers || !/[路街道巷弄段村里]/.test(street)) return null
  const keys = numbers.map((n) => `${street}${n}號`)
  return { key: keys[0], keys, city, district }
}
