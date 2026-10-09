// The time zone at a latitude and longitude, from a table bundled in the page.
// No request is made: the table (about 80 KB, public domain) is part of the build.

import lookup from '@photostructure/tz-lookup'
import { isZone } from './solar.js'

/** An IANA zone name for a point on land or at sea, or null when the table has none the browser knows. */
export function zoneAt(lat, lon) {
  try {
    const zone = lookup(lat, lon)
    return isZone(zone) ? zone : null
  } catch {
    return null
  }
}
