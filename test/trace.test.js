import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { scaleFromPoints, rectFromCorners, openingFromTaps, homography, applyHomography, invert3, flattenPhoto } from '../src/core/trace.js'
import { TEMPLATES, applyTemplate } from '../src/core/templates.js'
import { normalizeScene, defaultScene, wallFrame } from '../src/core/room.js'

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

test('two taps and a real distance give the scale', () => {
  assert.ok(near(scaleFromPoints([100, 100], [400, 500], 10), 50))
  assert.equal(scaleFromPoints([1, 1], [1, 1], 5), null)
  assert.equal(scaleFromPoints([0, 0], [10, 0], 0), null)
})

test('three corner taps give the room size, in whichever direction they go round', () => {
  // a 4 by 3 metre room drawn at 50 pixels a metre, a little turned
  const ppm = 50
  const turn = (12 * Math.PI) / 180
  const at = (x, y) => [300 + (x * Math.cos(turn) + y * Math.sin(turn)) * ppm, 400 + (x * Math.sin(turn) - y * Math.cos(turn)) * ppm] // picture y grows down
  const bl = at(0, 0)
  const br = at(4, 0)
  const tr = at(4, 3)
  const tl = at(0, 3)
  for (const [a, b, c] of [[bl, br, tr], [bl, br, tl], [br, bl, tl], [br, bl, tr]]) {
    const r = rectFromCorners(a, b, c, ppm)
    assert.ok(near(r.w, 4, 1e-6) && near(r.d, 3, 1e-6), `${r.w} x ${r.d}`)
    // every corner tap maps back onto a corner of the room
    for (const p of [bl, br, tr, tl]) {
      const [x, y] = r.toRoom(p)
      assert.ok([0, 4].some((v) => near(x, v, 1e-6)) && [0, 3].some((v) => near(y, v, 1e-6)), `${x}, ${y}`)
    }
    const back = r.toPicture(r.toRoom(tr))
    assert.ok(near(back[0], tr[0], 1e-6) && near(back[1], tr[1], 1e-6))
  }
  assert.equal(rectFromCorners([0, 0], [10, 0], [5, 0], 10), null, 'three taps in a line make no room')
  assert.equal(rectFromCorners([0, 0], [0, 0], [5, 5], 10), null)
})

test('a wall tapped left to right on the picture becomes the bottom wall', () => {
  const r = rectFromCorners([100, 300], [300, 300], [300, 100], 50)
  assert.ok(near(r.w, 4) && near(r.d, 4))
  assert.ok(near(r.turn, 0))
  assert.deepEqual(r.toRoom([100, 100]).map((v) => Math.round(v * 1e6) / 1e6), [0, 4])
})

test('two taps along a wall give the opening, the nearest wall wins and far taps give none', () => {
  const room = { w: 4, d: 5, h: 2.6, wall: 0.15 }
  const top = openingFromTaps(room, [1, 5.05], [2.6, 4.97])
  assert.equal(top.wall, 'top')
  assert.ok(near(top.pos, 1) && near(top.w, 1.6))
  // the top wall is read left to right from inside, so x grows with the position
  const right = openingFromTaps(room, [3.95, 4.2], [4.02, 1.2])
  assert.equal(right.wall, 'right')
  const f = wallFrame(room, 'right')
  // right wall: o = (w, d), t = (0, -1): position grows as y falls
  assert.ok(near(right.pos, (f.o[1] - 4.2) * 1, 1e-9) && near(right.w, 3))
  assert.equal(openingFromTaps(room, [2, 2.5], [3, 2.5]), null, 'taps in the middle of the room are not on a wall')
  assert.equal(openingFromTaps(room, [1, 5], [1.05, 5]), null, 'too narrow')
  const bottom = openingFromTaps(room, [3.9, -0.1], [0.5, 0.1])
  assert.ok(bottom.wall === 'bottom' && near(bottom.pos, 0.1) && near(bottom.w, 3.4), JSON.stringify(bottom))
})

test('the four point map matches OpenCV', () => {
  const ref = fixture('homography-reference.json')
  let worst = 0
  for (const [src, dst, pts, mapped] of ref.rows) {
    const H = homography(src, dst)
    pts.forEach((p, i) => {
      const q = applyHomography(H, p)
      worst = Math.max(worst, Math.hypot(q[0] - mapped[i][0], q[1] - mapped[i][1]))
    })
  }
  console.log(`# homography: ${ref.rows.length} maps, worst difference from OpenCV ${worst.toFixed(5)} pixels`)
  assert.ok(worst < 0.02, `worst ${worst}`)
})

test('a homography inverts, and three corners in a line have none', () => {
  const H = homography([[0, 0], [10, 0], [10, 10], [0, 10]], [[5, 5], [120, 20], [100, 130], [-10, 90]])
  const Hi = invert3(H)
  const p = applyHomography(Hi, applyHomography(H, [3, 7]))
  assert.ok(near(p[0], 3, 1e-9) && near(p[1], 7, 1e-9))
  assert.equal(homography([[0, 0], [1, 0], [2, 0], [0, 1]], [[0, 0], [1, 0], [2, 0], [0, 1]]), null)
  assert.equal(invert3([[1, 2, 3], [2, 4, 6], [1, 1, 1]]), null)
})

test('flattening a photo of a floor recovers the pattern on it', () => {
  const room = { w: 4, d: 3 }
  // a photo made by looking at a floor from the side: floor corners land at these photo points
  const corners = [[120, 300], [520, 300], [430, 120], [210, 120]] // room corners (0,0) (w,0) (w,d) (0,d) as tapped on the photo
  const floorToPhoto = homography([[0, 0], [room.w, 0], [room.w, room.d], [0, room.d]], corners)
  const back = invert3(floorToPhoto)
  const width = 640
  const height = 400
  const data = new Uint8ClampedArray(width * height * 4)
  // the floor carries a stripe pattern along x: lit where floor x is between 1 and 2 metres
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [fx] = applyHomography(back, [x + 0.5, y + 0.5])
    const o = (y * width + x) * 4
    const stripe = fx > 1 && fx < 2
    data[o] = stripe ? 250 : 40
    data[o + 1] = stripe ? 200 : 40
    data[o + 2] = 40
    data[o + 3] = 255
  }
  const flat = flattenPhoto({ data, width, height }, corners, room, 400, 300)
  const sample = (x, y) => flat.data[(y * 400 + x) * 4]
  // 100 pixels a metre: x = 150 is 1.5 m (lit), x = 50 is 0.5 m (dark), x = 250 is 2.5 m (dark)
  for (const y of [40, 150, 260]) {
    assert.ok(sample(150, y) > 200, `lit at row ${y}: ${sample(150, y)}`)
    assert.ok(sample(50, y) < 80 && sample(250, y) < 80)
  }
  assert.equal(flattenPhoto({ data, width, height }, [[0, 0], [1, 0], [2, 0], [3, 0]], room, 10, 10), null)
})

test('every template normalises to itself and has a window with sun to give', () => {
  assert.ok(TEMPLATES.length >= 6)
  for (const t of TEMPLATES) {
    const scene = normalizeScene(applyTemplate(defaultScene(), t.id))
    assert.equal(JSON.stringify(scene.room), JSON.stringify(t.room), t.id)
    assert.equal(scene.windows.length, t.windows.length, t.id)
    assert.equal(scene.doors.length, t.doors.length, t.id)
    assert.equal(scene.items.length, t.items.length, t.id)
    for (const [i, w] of scene.windows.entries()) {
      assert.equal(w.pos, t.windows[i].pos, `${t.id} window ${i} stays where it was put`)
      assert.equal(w.w, t.windows[i].w)
    }
    for (const it of scene.items) assert.ok(it.x >= 0 && it.y >= 0 && it.x + it.w <= scene.room.w + 1e-9 && it.y + it.d <= scene.room.d + 1e-9, `${t.id} ${it.kind}`)
  }
  assert.equal(applyTemplate(defaultScene(), 'nope').room.w, defaultScene().room.w)
})
