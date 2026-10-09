// The latitude and longitude boxes, in the setup and in the Place tab. A point
// typed in another time zone brings its zone along, and one across the equator
// brings the months the afternoon check looks at.

import { numberField } from './fields.js'
import { t } from './i18n.js'
import { setPlacePoint } from '../core/geo.js'
import { zoneAt } from '../core/zone.js'

/** Move the room to a typed point. The time zone changes only when the point lies in a different one. */
export function movePoint(draft, lat, lon) {
  const before = zoneAt(draft.place.lat, draft.place.lon)
  setPlacePoint(draft, lat, lon)
  const now = zoneAt(lat, lon)
  if (now && now !== before) draft.place.zone = now
}

/** Two number fields, latitude then longitude. */
export function coordinateFields({ store, actions, places, step, compact }) {
  let north = true
  const make = (label, min, max, get, set, key) => numberField({
    store, kind: 'num', places, compact, label, min, max, step, get, key,
    set: (d, v) => { north = d.place.lat >= 0; set(d, v) },
    after: () => { if ((store.scene.place.lat >= 0) !== north) actions.afterPlace() },
  })
  return [
    make(t('place.lat'), -80, 80, (s) => s.place.lat, (d, v) => movePoint(d, v, d.place.lon), 'lat'),
    make(t('place.lon'), -180, 180, (s) => s.place.lon, (d, v) => movePoint(d, d.place.lat, v), 'lon'),
  ]
}
