// TWD97 TM2 (EPSG:3826), the grid the city address files use, to latitude and longitude. The grid is a transverse
// Mercator on the GRS80 ellipsoid with the middle line at 121 degrees east, a scale of 0.9999 on it and 250,000 metres
// added to the easting. TWD97 and WGS84 agree to well under a metre, so the answer is taken as WGS84.
// The series is Kruger's, to the fourth power of the third flattening, good to a tenth of a millimetre on the island.

const A = 6378137
const F = 1 / 298.257222101
const K0 = 0.9999
const LON0 = 121
const FALSE_EASTING = 250000

const n = F / (2 - F)
const n2 = n * n
const n3 = n2 * n
const n4 = n3 * n
const RADIUS = (A / (1 + n)) * (1 + n2 / 4 + n4 / 64)
const BETA = [
  n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360,
  n2 / 48 + n3 / 15 - (437 * n4) / 1440,
  (17 * n3) / 480 - (37 * n4) / 840,
  (4397 * n4) / 161280,
]
const DELTA = [
  2 * n - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45,
  (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45,
  (56 * n3) / 15 - (136 * n4) / 35,
  (4279 * n4) / 630,
]

/**
 * @param {number} x easting in metres
 * @param {number} y northing in metres
 * @returns {{lat:number, lon:number}} degrees
 */
export function twd97ToWgs84(x, y) {
  const xi = y / (K0 * RADIUS)
  const eta = (x - FALSE_EASTING) / (K0 * RADIUS)
  let xi2 = xi
  let eta2 = eta
  BETA.forEach((b, i) => {
    const j = 2 * (i + 1)
    xi2 -= b * Math.sin(j * xi) * Math.cosh(j * eta)
    eta2 -= b * Math.cos(j * xi) * Math.sinh(j * eta)
  })
  const chi = Math.asin(Math.sin(xi2) / Math.cosh(eta2))
  let lat = chi
  DELTA.forEach((d, i) => { lat += d * Math.sin(2 * (i + 1) * chi) })
  const lon = LON0 + (Math.atan2(Math.sinh(eta2), Math.cos(xi2)) * 180) / Math.PI
  return { lat: (lat * 180) / Math.PI, lon }
}
