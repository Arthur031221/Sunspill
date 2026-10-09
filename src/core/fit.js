// Checking the model against what the user saw, and nudging it to agree.
//
// An observation is the patch of sun the user marked on the floor at a known
// time. The model predicts the same patch from the scene. Their overlap
// (intersection over union of the areas) says how well they agree, and a
// search over the direction the room faces, and the placement of the window
// that lets the light in, finds the scene that agrees best.

import { scenePatches } from './light.js'
import { sunAt } from './hours.js'
import { clipConvex, area, centroid, unionArea } from './poly.js'
import { hullOf } from './obstacles.js'
import { wallFrame } from './room.js'

/** The floor patches the model predicts for an observation. */
export function predictedPatch(scene, check) {
  const sun = sunAt(scene.place, check.month, check.day, check.minutes)
  if (!(sun.elevation > 0)) return []
  return scenePatches(scene, { azimuth: sun.azimuth, elevation: sun.elevation }, { walls: false }).floor
}

/** The marked points as a convex outline: a sunlit patch from one window is convex. */
export const observedOutline = (check) => hullOf(check.poly)

/**
 * How the model patch and the marked patch compare.
 * @returns {{iou:number, observed:number, predicted:number, shared:number, shift:number[]|null, covered:number}}
 *   areas in square metres; shift is the model centre to the marked centre in room metres;
 *   covered is the share of the marked area the model lights.
 */
export function compareCheck(scene, check) {
  const outline = observedOutline(check)
  const model = predictedPatch(scene, check)
  const observed = outline.length >= 3 ? area(outline) : 0
  const predicted = unionArea(model)
  const shared = unionArea(model.map((p) => clipConvex(p, outline)).filter((p) => p.length))
  const union = observed + predicted - shared
  let shift = null
  if (model.length && observed > 0) {
    // area weighted centre of the model pieces
    let cx = 0
    let cy = 0
    let total = 0
    for (const p of model) {
      const a = area(p)
      const c = centroid(p)
      cx += c[0] * a
      cy += c[1] * a
      total += a
    }
    const mc = [cx / total, cy / total]
    const oc = centroid(outline)
    shift = [oc[0] - mc[0], oc[1] - mc[1]]
  }
  return { iou: union > 1e-9 ? shared / union : 0, observed, predicted, shared, shift, covered: observed > 1e-9 ? shared / observed : 0 }
}

/** The shift of a patch as lateral and depth distances seen from a window's wall: right and away from the window are positive. */
export function shiftAlongWall(room, wall, shift) {
  const f = wallFrame(room, wall)
  return { lateral: shift[0] * f.t[0] + shift[1] * f.t[1], depth: -(shift[0] * f.n[0] + shift[1] * f.n[1]) }
}

const average = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)

/** Lower is better: one minus the overlap, plus a small pull toward the marked place while there is no overlap. */
function cost(scene, checks) {
  return average(checks.map((c) => {
    const r = compareCheck(scene, c)
    if (!r.shift) return 2
    return 1 - r.iou + 0.05 * Math.min(1, Math.hypot(r.shift[0], r.shift[1]) / 3)
  }))
}

const withFacing = (scene, facing) => ({ ...scene, facing: (((facing % 360) + 360) % 360) })

function withWindow(scene, index, dPos, dSill) {
  const windows = scene.windows.map((w, i) => {
    if (i !== index) return w
    const length = wallFrame(scene.room, w.wall).length
    return {
      ...w,
      pos: Math.min(Math.max(0, length - w.w), Math.max(0, w.pos + dPos)),
      sill: Math.min(Math.max(0, scene.room.h - w.h), Math.max(0, w.sill + dSill)),
    }
  })
  return { ...scene, windows }
}

/** The sun azimuths of a set of observations, to tell whether they can separate a turn from a slide. */
export function azimuthSpread(scene, checks) {
  const az = checks.map((c) => sunAt(scene.place, c.month, c.day, c.minutes)).filter((s) => s.elevation > 0).map((s) => s.azimuth)
  if (az.length < 2) return 0
  let best = 0
  for (const a of az) for (const b of az) best = Math.max(best, Math.abs(((a - b + 540) % 360) - 180))
  return best
}

/**
 * Find the facing, and when the observations allow it the window position and
 * sill height, that make the model agree best with what was marked.
 *
 * One observation cannot tell a turned room from a window that sits a little
 * to one side, so then only the facing is fitted. Two or more at sun azimuths
 * at least 15 degrees apart also fit the window; that result is used when it
 * improves the overlap by 0.03 or more, since an extra freedom always fits
 * something.
 * @returns {null|{scene:object, mode:'facing'|'facing+window', window:number, dFacing:number, dPos:number, dSill:number,
 *   before:number[], after:number[], meanBefore:number, meanAfter:number, evaluations:number}}
 */
export function fitScene(scene, checks, { window: windowIndex = null, maxTurn = 30 } = {}) {
  const usable = checks.filter((c) => c.poly.length >= 3)
  if (!usable.length || !scene.windows.length) return null
  let evaluations = 0
  const score = (sc) => {
    evaluations++
    return cost(sc, usable)
  }
  // 1. the facing alone: a coarse sweep, then a fine one around the best
  const base = scene.facing
  let best = { d: 0, c: score(scene) }
  for (let d = -maxTurn; d <= maxTurn; d += 1) {
    const c = score(withFacing(scene, base + d))
    if (c < best.c - 1e-12) best = { d, c }
  }
  for (let k = -10; k <= 10; k++) {
    const d = Math.max(-maxTurn, Math.min(maxTurn, best.d + k / 10))
    const c = score(withFacing(scene, base + d))
    if (c < best.c - 1e-12) best = { d, c }
  }
  const facingOnly = withFacing(scene, base + best.d)
  // the window that lets the light in: the one whose own patch overlaps the marks most
  let wi = windowIndex
  if (wi == null) {
    let top = -1
    scene.windows.forEach((_, i) => {
      const only = { ...facingOnly, windows: [facingOnly.windows[i]] }
      const v = average(usable.map((c) => compareCheck(only, c).shared))
      if (v > top) { top = v; wi = i }
    })
  }
  let chosen = { scene: facingOnly, mode: 'facing', dFacing: best.d, dPos: 0, dSill: 0, c: best.c }

  // 2. the facing together with the window, when the observations can tell them apart
  if (azimuthSpread(scene, usable) >= 15) {
    let cur = { d: best.d, p: 0, s: 0, c: best.c }
    const trial = (d, p, s) => score(withWindow(withFacing(scene, base + d), wi, p, s))
    for (const [dStep, pStep, sStep] of [[1, 0.1, 0.1], [0.4, 0.04, 0.04], [0.1, 0.01, 0.01]]) {
      for (let round = 0; round < 6; round++) {
        let moved = false
        for (const [dd, dp, ds] of [[dStep, 0, 0], [-dStep, 0, 0], [0, pStep, 0], [0, -pStep, 0], [0, 0, sStep], [0, 0, -sStep]]) {
          const d = Math.max(-maxTurn, Math.min(maxTurn, cur.d + dd))
          const p = Math.max(-0.8, Math.min(0.8, cur.p + dp))
          const s = Math.max(-0.5, Math.min(0.5, cur.s + ds))
          // a small pull toward the measured values, so a window that is only a little off is not moved far
          const c = trial(d, p, s) + 0.004 * (Math.abs(p) / 0.8 + Math.abs(s) / 0.5)
          if (c < cur.c - 1e-9) {
            cur = { d, p, s, c }
            moved = true
          }
        }
        if (!moved) break
      }
    }
    const fitted = withWindow(withFacing(scene, base + cur.d), wi, cur.p, cur.s)
    if (cost(fitted, usable) <= best.c - 0.03) chosen = { scene: fitted, mode: 'facing+window', dFacing: cur.d, dPos: cur.p, dSill: cur.s, c: cost(fitted, usable) }
  }
  const iou = (sc) => usable.map((c) => compareCheck(sc, c).iou)
  const before = iou(scene)
  const after = iou(chosen.scene)
  return {
    scene: chosen.scene, mode: chosen.mode, window: wi, dFacing: Math.round(chosen.dFacing * 10) / 10, dPos: Math.round(chosen.dPos * 1000) / 1000, dSill: Math.round(chosen.dSill * 1000) / 1000,
    before, after, meanBefore: average(before), meanAfter: average(after), evaluations,
  }
}
