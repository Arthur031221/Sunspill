import { locale, t } from './i18n.js'

const FT = 3.28084

export const toUnit = (m, units) => (units === 'ft' ? m * FT : m)
export const fromUnit = (v, units) => (units === 'ft' ? v / FT : v)

export function trim(n, places = 2) {
  return String(Number(n.toFixed(places)))
}

export const lengthText = (m, units) => `${trim(toUnit(m, units), units === 'ft' ? 1 : 2)} ${units === 'ft' ? 'ft' : 'm'}`
export const areaText = (m2, units) => (units === 'ft' ? `${trim(m2 * FT * FT, 0)} ft²` : `${trim(m2, 1)} m²`)

const PING = 3.305785
/** The floor area of the room. Listings in Taiwan give rooms and flats in ping (坪), so the Traditional Chinese page adds it. */
export const floorAreaText = (m2, units) => areaText(m2, units) + (locale() === 'zh-TW' ? `（約 ${trim(m2 / PING, 1)} 坪）` : '')

export function clock(minutes) {
  const m = Math.round(minutes)
  const hh = Math.floor(m / 60) % 24
  return `${String(hh).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** "4 h 20 min" in the interface language. */
export function duration(hours) {
  const total = Math.round(hours * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return t('fmt.min', { m })
  if (m === 0) return t('fmt.hour', { h })
  return t('fmt.hm', { h, m })
}

export function dateText(month, day, style = 'long') {
  const d = new Date(Date.UTC(2026, month - 1, day))
  return new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', month: style, day: 'numeric' }).format(d)
}

export function monthName(month, style = 'long') {
  return new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', month: style }).format(new Date(Date.UTC(2026, month - 1, 1)))
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export const compassKey = (deg) => `compass.${POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]}`
export const bearingText = (deg) => `${t(compassKey(deg))} ${Math.round(((deg % 360) + 360) % 360)}°`

/** "Desk", or "Desk 2" when there is more than one, so two pieces of the same kind can be told apart. */
export function itemName(items, i) {
  const kind = items[i].kind
  const same = items.filter((o) => o.kind === kind)
  return same.length > 1 ? `${t(`kind.${kind}`)} ${same.indexOf(items[i]) + 1}` : t(`kind.${kind}`)
}
