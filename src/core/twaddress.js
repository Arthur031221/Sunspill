// A Taiwanese address and its floor, taken out of whatever text was typed or pasted (a listing, a chat
// message). Only the address and the floor are read from the text, so only they are searched for.
// Nominatim finds 5 復興南路二段151巷 in 台北市 and does not find the same address as free text, so the
// answer carries the two fields of a structured search, street and city.

const CITY = '(?:[臺台]北|新北|桃園|[臺台]中|[臺台]南|高雄|基隆|新竹|嘉義)市|(?:新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|[臺台]東|澎湖|金門|連江)縣'
const SECTION = '(?:(?:[一二三四五六七八九十]{1,3}|\\d{1,2})段)?'
const ADDRESS = new RegExp(
  `(?:(?<city>${CITY})\\s*)?(?:(?<district>(?:(?![區鄉鎮市])[\\u4e00-\\u9fff]){1,3}[區鄉鎮市])\\s*)?(?<road>[\\u4e00-\\u9fff]{1,9}?(?:路|街|大道)${SECTION})\\s*`
  + '(?:(?<lane>\\d+)\\s*巷\\s*)?(?:(?<alley>\\d+)\\s*弄\\s*)?'
  + '(?:(?<number>\\d+(?:\\s*[之\\-]\\s*\\d+)?)\\s*[號号](?:\\s*之\\s*(?<sub>\\d+))?)?',
  'gu',
)
const DIGITS = '一二三四五六七八九'
const FLOOR = '(\\d{1,3}|[一二三四五六七八九十]{1,3})'
const NEXT = new RegExp(`^[\\s,，、]*${FLOOR}\\s*(?:[樓楼]|[Ff](?![A-Za-z]))`, 'u')
const PAIR = [
  new RegExp(`${FLOOR}\\s*(?:[樓楼]|[Ff])\\s*[/／]\\s*(?:共\\s*)?(\\d{1,3})\\s*[樓楼層层Ff]?`, 'u'),
  new RegExp(`樓層\\s*[:：]?\\s*${FLOOR}\\s*[Ff樓]?\\s*[/／]\\s*(\\d{1,3})`, 'u'),
  new RegExp(`${FLOOR}\\s*[樓楼]\\s*共\\s*(\\d{1,3})\\s*[層层樓]`, 'u'),
]
const MAX_TEXT = 20000

/** 5, 十二, 二十三 as numbers, or null. */
function floorNumber(text) {
  if (/^\d+$/.test(text)) return Number(text)
  const ten = text.indexOf('十')
  const digit = (c) => (c ? DIGITS.indexOf(c) + 1 : 0)
  if (ten < 0) return text.length === 1 && digit(text) ? digit(text) : null
  return (ten === 0 ? 1 : digit(text[ten - 1])) * 10 + digit(text[ten + 1])
}

const usable = (n) => (Number.isInteger(n) && n >= 1 && n <= 99 ? n : null)

/**
 * The first address in the text that has a house number, or else the first with a city or a district.
 * A bare road name is not an address, since it could be any road in the country.
 * @returns {null|{address:string, city:string|null, district:string|null, road:string, lane:string|null, alley:string|null,
 *   number:string|null, street:string, floor:number|null, levels:number|null, query:{street:string, city:string|null}}}
 *   `street` is the road with its lane and alley, and `query` the same with the house number before it
 */
export function extractAddress(text) {
  const clean = String(text ?? '').normalize('NFKC').slice(0, MAX_TEXT)
  let best = null
  let bestScore = 0
  for (const m of clean.matchAll(ADDRESS)) {
    const g = m.groups
    const score = g.number ? 3 : g.city ? 2 : g.district ? 1 : 0
    if (score > bestScore) {
      best = m
      bestScore = score
    }
    if (score === 3) break
  }
  if (!best) return null
  const g = best.groups
  const lane = g.lane ?? null
  const alley = g.alley ?? null
  const number = g.number ? `${g.number.replace(/\s+/g, '')}${g.sub ? `之${g.sub}` : ''}` : null
  const street = `${g.road}${lane ? `${lane}巷` : ''}${alley ? `${alley}弄` : ''}`
  const city = g.city ?? null
  const tail = clean.slice(best.index + best[0].length, best.index + best[0].length + 24)
  let floor = null
  let levels = null
  const next = NEXT.exec(tail)
  if (next) floor = usable(floorNumber(next[1]))
  for (const re of PAIR) {
    const pair = re.exec(clean.slice(best.index))
    if (!pair) continue
    // the pair belongs to this address when the floor it names is the one written after it, or when none was
    const f = usable(floorNumber(pair[1]))
    if (f !== null && (floor === null || floor === f)) {
      floor = f
      levels = usable(Number(pair[2]))
      break
    }
  }
  return {
    address: `${city ?? ''}${g.district ?? ''}${street}${number ? `${number}號` : ''}`,
    city,
    district: g.district ?? null,
    road: g.road,
    lane,
    alley,
    number,
    street,
    floor,
    levels,
    query: { street: number ? `${number} ${street}` : street, city },
  }
}
