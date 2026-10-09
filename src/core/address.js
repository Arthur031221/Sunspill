// Plainer forms of an address to try when OpenStreetMap finds nothing for what was typed. A Taiwanese
// address such as 台北市信義區市府路45號7樓 is not found as written, because Nominatim wants the number
// after a space and has no word for the floor, yet 台北市信義區市府路 45 gives the building. Every form is
// made only from words the person typed, so asking for one sends nothing new.

const CJK_NUMBER = /^(.*?)(\d+)(?:\s*([之-])\s*(\d+))?\s*[號号]/
const LANE = /\s*\d+\s*[巷弄]$/
const UNIT = /(?:[,，\s]+|^)(?:\d+\s*(?:[Ff]|[Ff]loor|樓|楼|層|层)|[Ff]loor\s*\d+|[Ff]l\.?\s*\d+|\d+\s*(?:st|nd|rd|th)\s+[Ff]loor|[Aa]pt\.?\s*\w+|[Uu]nit\s*\w+|[Ss]uite\s*\w+|[Rr]oom\s*\w+|#\s*\w+|[Bb]\d+)\s*$/
// "No. 45," or "Road No. 45" is a house number, but the 5 in "No. 5 Road" belongs to the street
const LATIN_NUMBER = /\b(?:No|Nr|Num)\.?\s*\d+[-\w]*\s*(?:,\s*|$)/i
const LEADING_NUMBER = /^(?:(?:No|Nr|Num)\.?\s*)?\d+[A-Za-z]?(?:-\d+)?\s*[,\s]\s*(?!(?:road|rd|street|st|avenue|ave|lane|ln|boulevard|blvd|drive|dr|way|highway|hwy)\b)/i
const FLOOR_PIECE = /\d\s*(?:室|樓|楼|層|层|[Ff])\s*$/

/**
 * Forms of `text` that may match when the text itself does not, most exact first. Each is `{ query, exact }`:
 * `exact` means the house number is still in it, so a match is the building and not the street.
 * Text with nothing to simplify gives an empty list.
 */
export function addressVariants(text) {
  const clean = String(text ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
  const out = []
  const add = (query, exact) => {
    query = query.replace(/[,，、\s]+$/, '').replace(/^[,，、\s]+/, '').trim()
    if (query.length >= 2 && query !== clean && !out.some((v) => v.query === query)) out.push({ query, exact })
  }
  const house = CJK_NUMBER.exec(clean)
  if (house && house[1].trim()) {
    let road = house[1].trim()
    // what the person typed after the number and the floor, a city or a country, stays on every form
    const tail = clean.slice(house[0].length).split(/[,，、]/).slice(1).map((x) => x.trim()).filter((x) => x && !FLOOR_PIECE.test(x)).join(', ')
    const end = tail ? `, ${tail}` : ''
    // 106之1號 is a house of its own, and 106 alone is its neighbour, so that form is not exact
    if (house[3]) add(`${road} ${house[2]}${house[3]}${house[4]}${end}`, true)
    add(`${road} ${house[2]}${end}`, !house[3])
    add(`${road}${end}`, false)
    // a lane or an alley that is not mapped: the road it leaves from
    while (LANE.test(road)) {
      road = road.replace(LANE, '').trim()
      if (road) add(`${road}${end}`, false)
    }
    return out
  }
  let bare = clean
  // a floor and a unit can follow each other
  for (let n = 0; n < 4 && UNIT.test(bare); n++) bare = bare.replace(UNIT, '')
  add(bare, true)
  const noNumber = bare.replace(LATIN_NUMBER, '').replace(LEADING_NUMBER, '')
  add(noNumber, false)
  return out
}
