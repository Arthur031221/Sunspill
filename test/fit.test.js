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
