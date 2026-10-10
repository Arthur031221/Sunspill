// Telling a turn from a pinch. Two fingers on the map zoom it, and when they also turn round each other the room
// should follow only if the person means to turn it: the turn has to pass a clear threshold and has to be the main
// thing the fingers do. A pinch that twists a few degrees on the way turns nothing.

/** The turn, in degrees, that two fingers have to pass before the room follows them. */
export const TURN_START = 8
/** Fingers closer than this (px) give an angle that is mostly noise. */
const MIN_APART = 24
/** A turn that has taken hold lets go only when the fingers spread this much more than they turn. */
const LET_GO = 0.5

/**
 * Follow two fingers from where they went down. `dist` is the distance between them in pixels and `angle` the
 * direction of the line from the first to the second, in degrees.
 * `move(dist, angle)` gives `{turn, engaged, arc, spread}`: `turn` is the whole angle the line has turned since the
 * start (the half turn jump from 180 to -180 is not a turn), `arc` how far the fingers went round each other and
 * `spread` how far they went toward or away from each other, both in pixels. `engaged` is true while the room
 * should follow `turn`: it starts when the turn is at least {@link TURN_START} degrees and `arc` is at least
 * `spread`, and it ends when `arc` falls below half of `spread`.
 */
export function pinchTracker(dist0, angle0, { start = TURN_START } = {}) {
  let last = angle0
  let turn = 0
  let engaged = false
  return {
    move(dist, angle) {
      let step = angle - last
      if (step > 180) step -= 360
      if (step < -180) step += 360
      turn += step
      last = angle
      const arc = (dist0 * Math.abs(turn) * Math.PI) / 180
      const spread = Math.abs(dist - dist0)
      if (dist0 < MIN_APART) engaged = false
      else if (!engaged && Math.abs(turn) >= start && arc >= spread) engaged = true
      else if (engaged && arc < spread * LET_GO) engaged = false
      return { turn, engaged, arc, spread }
    },
  }
}
