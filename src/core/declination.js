// Magnetic declination from the World Magnetic Model 2025: the angle from true
// north to magnetic north, positive to the east. A compass reads magnetic
// north, so true heading = compass heading + declination.

import { COEFFICIENTS, EPOCH, VALID_TO } from './wmm2025.js'

const RAD = Math.PI / 180
const A = 6378.137 // WGS84 semi major axis, km
const F = 1 / 298.257223563
const E2 = F * (2 - F)
const RE = 6371.2 // reference radius of the geomagnetic model, km
const N = 12

/** Decimal year (such as 2026.77) of a Date or a millisecond time. */
export function decimalYear(when) {
  const d = new Date(when)
  const y = d.getUTCFullYear()
  const start = Date.UTC(y, 0, 1)
  const end = Date.UTC(y + 1, 0, 1)
  return y + (d.getTime() - start) / (end - start)
}

/** Whether the model is inside the five years it was fitted for. */
export const inRange = (year) => year >= EPOCH && year < VALID_TO + 1

/**
 * Declination in degrees (east positive) at a geodetic latitude and longitude, height in km above the ellipsoid.
 * The result is the model, whose own error is about 0.4 degrees in most places and larger near the magnetic poles.
 */
export function declination(lat, lon, year = decimalYear(Date.now()), heightKm = 0) {
  const phi = lat * RAD
  const lam = lon * RAD
  const sp = Math.sin(phi)
  const cp = Math.cos(phi)
  // geodetic to geocentric spherical coordinates
  const rc = A / Math.sqrt(1 - E2 * sp * sp)
  const p = (rc + heightKm) * cp
  const z = (rc * (1 - E2) + heightKm) * sp
  const r = Math.hypot(p, z)
  const phiG = Math.asin(z / r)
  const sg = Math.sin(phiG) // cos of the colatitude
  const cg = Math.cos(phiG) // sin of the colatitude
  const dt = year - EPOCH

  // Schmidt semi normalised Legendre functions of sin(latitude) and their derivatives with respect to the colatitude
  const P = Array.from({ length: N + 1 }, () => new Float64Array(N + 1))
  const dP = Array.from({ length: N + 1 }, () => new Float64Array(N + 1))
  P[0][0] = 1
  for (let n = 1; n <= N; n++) {
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        const k = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n))
        P[n][n] = k * cg * P[n - 1][n - 1]
        dP[n][n] = k * (cg * dP[n - 1][n - 1] + sg * P[n - 1][n - 1])
      } else {
        const a = 2 * n - 1
        const b = Math.sqrt(n * n - m * m)
        const c = n - 1 >= m ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0
        const p2 = n - 2 >= m ? P[n - 2][m] : 0
        const d2 = n - 2 >= m ? dP[n - 2][m] : 0
        P[n][m] = (a * sg * P[n - 1][m] - c * p2) / b
        dP[n][m] = (a * (sg * dP[n - 1][m] - cg * P[n - 1][m]) - c * d2) / b
      }
    }
  }

  let x = 0 // north
  let y = 0 // east
  let zz = 0 // down
  for (const [n, m, g0, h0, gd, hd] of COEFFICIENTS) {
    const g = g0 + dt * gd
    const h = h0 + dt * hd
    const k = (RE / r) ** (n + 2)
    const cm = Math.cos(m * lam)
    const sm = Math.sin(m * lam)
    const term = g * cm + h * sm
    x += k * term * dP[n][m] // d/d(latitude) = - d/d(colatitude), and X = - dV/d(latitude), so the signs cancel
    y += (k * m * (g * sm - h * cm) * P[n][m]) / cg
    zz -= k * (n + 1) * term * P[n][m]
  }
  // back from geocentric to geodetic directions
  const dphi = phiG - phi
  const north = x * Math.cos(dphi) - zz * Math.sin(dphi)
  return Math.atan2(y, north) / RAD
}
