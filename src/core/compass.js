// Turning phone sensor readings into the direction a window faces.
//
// DeviceOrientation gives three angles (alpha about the vertical, beta about
// the left to right axis, gamma about the top to bottom axis, applied in the
// order Z X' Y''). From them the direction the back of the phone faces, and the
// direction its top edge points, follow from one rotation matrix.

const RAD = Math.PI / 180
const mod = (a, n) => ((a % n) + n) % n

/** Device axes in earth axes (x east, y north, z up) for the three angles in degrees. */
export function rotationMatrix(alpha, beta, gamma) {
  const [ca, sa] = [Math.cos(alpha * RAD), Math.sin(alpha * RAD)]
  const [cb, sb] = [Math.cos(beta * RAD), Math.sin(beta * RAD)]
  const [cg, sg] = [Math.cos(gamma * RAD), Math.sin(gamma * RAD)]
  // R = Rz(alpha) Rx(beta) Ry(gamma)
  return [
    [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
    [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
    [-cb * sg, sb, cb * cg],
  ]
}

const bearing = (east, north) => mod(Math.atan2(east, north) / RAD, 360)

/**
 * The direction the phone points, as a compass bearing in degrees clockwise
 * from the reference north of the sensor (magnetic north for a phone compass).
 * Held upright against a window the back of the phone faces out, so that is the
 * direction used; lying flat, the top edge is. Returns the bearing, which of
 * the two it is and how upright the phone is (0 flat, 1 standing).
 */
export function headingFromAngles(alpha, beta, gamma) {
  const R = rotationMatrix(alpha, beta, gamma)
  const back = [-R[0][2], -R[1][2]] // the screen normal points at the user, so the back is the opposite
  const upright = Math.hypot(back[0], back[1])
  if (upright >= 0.5) return { bearing: bearing(back[0], back[1]), from: 'back', upright }
  return { bearing: bearing(R[0][1], R[1][1]), from: 'top', upright }
}

/** The mean of angles in degrees, which is right across the 0 and 360 seam. */
export function circularMean(angles) {
  let s = 0
  let c = 0
  for (const a of angles) {
    s += Math.sin(a * RAD)
    c += Math.cos(a * RAD)
  }
  return mod(Math.atan2(s, c) / RAD, 360)
}

/** The circular standard deviation in degrees: small when the readings agree. */
export function circularSpread(angles) {
  if (angles.length < 2) return 180
  let s = 0
  let c = 0
  for (const a of angles) {
    s += Math.sin(a * RAD)
    c += Math.cos(a * RAD)
  }
  const r = Math.hypot(s, c) / angles.length
  return r >= 1 ? 0 : Math.sqrt(-2 * Math.log(Math.max(r, 1e-9))) / RAD
}

/** True north from a magnetic reading, given the declination at the spot (east positive). */
export const trueHeading = (magnetic, declination) => mod(magnetic + declination, 360)

/**
 * Collects readings and says when they have settled. A reading older than
 * `windowMs` is dropped, so the answer follows a phone that is being moved and
 * becomes steady once it is held still.
 */
export function createAverager({ windowMs = 1500, minSamples = 12, maxSpread = 4 } = {}) {
  let samples = []
  return {
    add(angle, now) {
      samples.push({ angle, now })
      samples = samples.filter((s) => now - s.now <= windowMs)
    },
    reset() {
      samples = []
    },
    get state() {
      const angles = samples.map((s) => s.angle)
      const spread = circularSpread(angles)
      const span = samples.length > 1 ? samples[samples.length - 1].now - samples[0].now : 0
      return { heading: angles.length ? circularMean(angles) : null, spread, count: angles.length, steady: angles.length >= minSamples && span >= windowMs * 0.8 && spread <= maxSpread }
    },
  }
}
