import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPalette, makeIndexer, createGif } from '../src/core/gif.js'
import { decodeGif } from './helpers/gif-decode.js'

function scene(width, height, t) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    const lit = Math.abs(x - (10 + t * 6)) < 8 && y > 12 && y < 40
    rgba[i] = lit ? 255 : 40 + x
    rgba[i + 1] = lit ? 190 : 60 + y
    rgba[i + 2] = lit ? 80 : 120
    rgba[i + 3] = 255
  }
  return rgba
}

test('palette has at most 255 colours and covers the colours it was given', () => {
  const frames = [scene(64, 48, 0), scene(64, 48, 3)]
  const palette = buildPalette(frames)
  assert.ok(palette.length <= 255 && palette.length > 20)
  const index = makeIndexer(palette)
  const out = index(frames[0], 64, 48)
  let error = 0
  for (let p = 0; p < out.length; p++) for (let c = 0; c < 3; c++) error += Math.abs(palette[out[p]][c] - frames[0][p * 4 + c])
  assert.ok(error / (out.length * 3) < 10, `mean error ${error / (out.length * 3)}`)
})

test('frames round trip through the encoder and an independent decoder', () => {
  const w = 64
  const h = 48
  const frames = Array.from({ length: 6 }, (_, t) => scene(w, h, t))
  const palette = buildPalette(frames)
  const index = makeIndexer(palette)
  const gif = createGif({ width: w, height: h, palette })
  const indexed = frames.map((f) => index(f, w, h))
  indexed.forEach((f, i) => gif.addFrame(f, 7 + i))
  const bytes = gif.finish()
  assert.deepEqual([...bytes.slice(0, 6)].map((c) => String.fromCharCode(c)).join(''), 'GIF89a')
  const decoded = decodeGif(bytes)
  assert.equal(decoded.width, w)
  assert.equal(decoded.height, h)
  assert.equal(decoded.loops, 0)
  assert.equal(decoded.frames.length, 6)
  decoded.frames.forEach((f, i) => {
    assert.equal(f.delay, 7 + i)
    assert.deepEqual([...f.indices], [...indexed[i]], `frame ${i}`)
  })
  assert.ok(bytes.length < 6 * w * h, `${bytes.length} bytes`)
})

test('an unchanged frame costs almost nothing and noise survives the 12 bit code limit', () => {
  const w = 120
  const h = 90
  let seed = 3
  const noise = new Uint8Array(w * h).map(() => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 20) % 200)
  const palette = Array.from({ length: 200 }, (_, i) => [i, 255 - i, (i * 7) % 256])
  const gif = createGif({ width: w, height: h, palette })
  gif.addFrame(noise, 5)
  const before = gif.finish().length
  const again = createGif({ width: w, height: h, palette })
  again.addFrame(noise, 5)
  again.addFrame(noise, 5)
  const bytes = again.finish()
  assert.ok(bytes.length - before < 40, `${bytes.length - before} extra bytes`)
  const decoded = decodeGif(bytes)
  assert.deepEqual([...decoded.frames[1].indices], [...noise])
  assert.deepEqual([...decoded.frames[0].indices], [...noise])
})
