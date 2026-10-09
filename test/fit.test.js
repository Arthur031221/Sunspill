import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareCheck, fitScene, predictedPatch, azimuthSpread, shiftAlongWall } from '../src/core/fit.js'
import { normalizeScene } from '../src/core/room.js'
import { hullOf } from '../src/core/obstacles.js'

const truth = (extra = {}) => normalizeScene({
  room: { w: 4.2, d: 5.4, h: 2.6, wall: 0.15 },
  facing: 180,
  windows: [{ wall: 'top', pos: 0.8, w: 2.2, h: 1.5, sill: 0.6 }],
  place: { name: 'Taipei', lat: 25.033, lon: 121.565, zone: 'Asia/Taipei' },
  items: [], date: { month: 12, day: 21 },
  ...extra,
})

/** What a person looking at the floor would mark: the patch corners, with the wobble of a finger. */
function observe(scene, minutes, seed = 1, jitter = 0) {
  const check = { month: scene.date.month, day: scene.date.day, minutes, poly: [] }
  const patch = predictedPatch(scene, check)
  let a = seed
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const corners = hullOf(patch.flat())
  return { ...check, poly: corners.map(([x, y]) => [x + (rand() - 0.5) * 2 * jitter, y + (rand() - 0.5) * 2 * jitter]) }
}

test('a model that matches what was marked scores one, and a patch in the wrong place scores less', () => {
  const scene = truth()
  const check = observe(scene, 11 * 60 + 30)
  const same = compareCheck(scene, check)
  assert.ok(same.iou > 0.999, String(same.iou))
  assert.ok(same.covered > 0.999)
  assert.ok(Math.hypot(...same.shift) < 1e-6)
  const turned = compareCheck({ ...scene, facing: 195 }, check)
  assert.ok(turned.iou < 0.8 && turned.iou > 0, String(turned.iou))
  assert.ok(Math.hypot(...turned.shift) > 0.2)
  const dark = compareCheck({ ...scene, facing: 0 }, check)
  assert.equal(dark.iou, 0)
  assert.equal(dark.shift, null)
})

test('the shift of a patch is told from the window wall: sideways and away from the window', () => {
  const room = { w: 4, d: 5, h: 2.6, wall: 0.1 }
  assert.deepEqual(shiftAlongWall(room, 'top', [0.3, -0.4]), { lateral: 0.3, depth: 0.4 })
  const right = shiftAlongWall(room, 'right', [-0.5, 0.2])
  assert.ok(Math.abs(right.depth - 0.5) < 1e-12 && Math.abs(right.lateral + 0.2) < 1e-12)
})

test('one observation fits the facing alone and finds the true facing from a wrong start', () => {
  const real = truth()
  const check = observe(real, 12 * 60, 3, 0.03)
  const start = { ...real, facing: real.facing + 11 }
  const fit = fitScene(start, [check])
  assert.equal(fit.mode, 'facing')
  assert.ok(Math.abs(fit.scene.facing - 180) < 2, `facing ${fit.scene.facing}`)
  assert.ok(fit.meanAfter > fit.meanBefore + 0.2)
  assert.ok(fit.meanAfter > 0.85, String(fit.meanAfter))
})

test('observations at different hours separate a turned room from a window that sits aside', () => {
  const real = truth()
  const checks = [9 * 60 + 30, 11 * 60 + 30, 14 * 60, 15 * 60 + 30].map((m, i) => observe(real, m, 10 + i, 0.03))
  assert.ok(azimuthSpread(real, checks) >= 15, `spread ${azimuthSpread(real, checks)}`)
  // the model has the room turned 7 degrees too far and the window 0.2 m to the side
  const wrong = normalizeScene({ ...real, facing: real.facing + 7, windows: [{ ...real.windows[0], pos: real.windows[0].pos + 0.2 }] })
  const fit = fitScene(wrong, checks)
  assert.equal(fit.mode, 'facing+window')
  assert.ok(Math.abs(fit.dFacing + 7) < 1.5, `turn ${fit.dFacing}`)
  assert.ok(Math.abs(fit.dPos + 0.2) < 0.08, `slide ${fit.dPos}`)
  assert.ok(fit.meanAfter > 0.92, String(fit.meanAfter))
  assert.ok(fit.meanBefore < 0.8)
})

test('the window is only moved when it clearly helps', () => {
  const real = truth()
  const checks = [9 * 60 + 30, 12 * 60, 15 * 60].map((m, i) => observe(real, m, 20 + i, 0.02))
  const fit = fitScene({ ...real, facing: real.facing - 4 }, checks)
  assert.equal(fit.mode, 'facing')
  assert.ok(Math.abs(fit.scene.facing - 180) < 1.5)
  assert.equal(fit.scene.windows[0].pos, real.windows[0].pos)
})

test('there is nothing to fit without a window or without marks', () => {
  const real = truth()
  assert.equal(fitScene(real, []), null)
  assert.equal(fitScene({ ...real, windows: [] }, [observe(real, 720)]), null)
  assert.equal(fitScene(real, [{ month: 12, day: 21, minutes: 720, poly: [[1, 1], [2, 2]] }]), null)
})

test('the fit stays inside its limits and is reproducible', () => {
  const real = truth()
  const check = observe({ ...real, facing: 200 }, 12 * 60)
  const a = fitScene(real, [check], { maxTurn: 10 })
  const b = fitScene(real, [check], { maxTurn: 10 })
  assert.equal(a.scene.facing, b.scene.facing)
  assert.ok(Math.abs(a.dFacing) <= 10.0001)
})

test('a patch with a notch in it is compared as it is marked, not as its hull', () => {
  const scene = normalizeScene({ room: { w: 4, d: 4, h: 3, wall: 0 }, facing: 180, windows: [{ wall: 'top', pos: 1, w: 2, h: 2, sill: 0 }], place: { name: 'Taipei', lat: 25.033, lon: 121.565, zone: 'Asia/Taipei' }, items: [], date: { month: 12, day: 21 } })
  const check = { month: 12, day: 21, minutes: 720, poly: [] }
  const patch = predictedPatch(scene, check)
  const xs = patch.flat().map((p) => p[0])
  const ys = patch.flat().map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  // the same outline with a bite taken out of the top edge, marked corner after corner
  const mid = (x0 + x1) / 2
  const notched = [[x0, y0], [x1, y0], [x1, y1], [mid + 0.2, y1], [mid + 0.2, y1 - 0.5], [mid - 0.2, y1 - 0.5], [mid - 0.2, y1], [x0, y1]]
  const r = compareCheck(scene, { ...check, poly: notched })
  const bite = 0.4 * 0.5
  const full = (x1 - x0) * (y1 - y0)
  assert.ok(Math.abs(r.observed - (full - bite)) < 1e-6, `observed ${r.observed}, outline ${full - bite}`)
  assert.ok(r.iou < 1 - bite / full * 0.9, `the notch is missing from the model patch, so the overlap is below 1: ${r.iou}`)
  assert.ok(r.iou > 0.8)
})

test('the fine search around the best sweep angle does not drift', () => {
  const real = truth()
  const exact = observe({ ...real, facing: 180.4 }, 720)
  const fit = fitScene({ ...real, facing: 180 }, [exact])
  assert.ok(Math.abs(fit.scene.facing - 180.4) < 0.06, `facing ${fit.scene.facing}`)
})
