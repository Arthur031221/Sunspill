// Plainer forms of an address to try when OpenStreetMap finds nothing for what was typed. A Taiwanese
// address such as 台北市信義區市府路45號7樓 is not found as written, because Nominatim wants the number
// after a space and has no word for the floor, yet 台北市信義區市府路 45 gives the building. Every form is
// made only from words the person typed, so asking for one sends nothing new.

const CJK_NUMBER = /^(.*?)(\d+)(?:\s*[之-]\s*\d+)?\s*[號号]/
const LANE = /\s*\d+\s*[巷弄]$/
const UNIT = /(?:[,，\s]+|^)(?:\d+\s*(?:[Ff]|[Ff]loor|樓|楼|層|层)|[Ff]loor\s*\d+|[Ff]l\.?\s*\d+|\d+\s*(?:st|nd|rd|th)\s+[Ff]loor|[Aa]pt\.?\s*\w+|[Uu]nit\s*\w+|[Ss]uite\s*\w+|[Rr]oom\s*\w+|#\s*\w+|[Bb]\d+)\s*$/
const LATIN_NUMBER = /\b(?:No|Nr|Num)\.?\s*\d+[-\w]*\s*,?\s*/i
const LEADING_NUMBER = /^\d+[A-Za-z]?(?:-\d+)?\s*[,\s]\s*/

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
    add(`${road} ${house[2]}`, true)
    add(road, false)
    // a lane or an alley that is not mapped: the road it leaves from
    while (LANE.test(road)) {
      road = road.replace(LANE, '').trim()
      if (road) add(road, false)
    }
    return out
  }
  const bare = clean.replace(UNIT, '')
  add(bare, true)
  const noNumber = bare.replace(LATIN_NUMBER, '').replace(LEADING_NUMBER, '')
  add(noNumber, false)
  return out
}
