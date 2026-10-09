// A small GIF89a encoder for the browser: one shared palette built from a few
// sample frames, frames stored as the changed rectangle only, and LZW
// compression. Nothing leaves the page, so no worker or library is needed.

const TRANSPARENT = 255

/** Build a palette of up to 255 colours from RGBA pixel arrays by median cut over a 5 bit histogram. */
export function buildPalette(samples) {
  const counts = new Uint32Array(32768)
  for (const rgba of samples) {
    for (let i = 0; i < rgba.length; i += 4) counts[((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3)]++
  }
  const bins = []
  for (let k = 0; k < 32768; k++) if (counts[k]) bins.push({ r: (k >> 10) << 3 | 4, g: ((k >> 5) & 31) << 3 | 4, b: (k & 31) << 3 | 4, n: counts[k] })
  if (!bins.length) bins.push({ r: 0, g: 0, b: 0, n: 1 })
  let boxes = [bins]
  const spread = (box) => {
    let lo = [255, 255, 255]
    let hi = [0, 0, 0]
    for (const c of box) {
      const v = [c.r, c.g, c.b]
      for (let a = 0; a < 3; a++) {
        if (v[a] < lo[a]) lo[a] = v[a]
        if (v[a] > hi[a]) hi[a] = v[a]
      }
    }
    const widths = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]
    const axis = widths.indexOf(Math.max(...widths))
    return { axis, width: widths[axis] }
  }
  while (boxes.length < TRANSPARENT) {
    let pick = -1
    let best = 0
    boxes.forEach((box, i) => {
      if (box.length < 2) return
      const { width } = spread(box)
      const weight = width * Math.log2(1 + box.reduce((s, c) => s + c.n, 0))
      if (weight > best) {
        best = weight
        pick = i
      }
    })
    if (pick < 0) break
    const box = boxes[pick]
    const key = ['r', 'g', 'b'][spread(box).axis]
    box.sort((p, q) => p[key] - q[key])
    const half = box.reduce((s, c) => s + c.n, 0) / 2
    let run = 0
    let cut = 1
    for (let i = 0; i < box.length - 1; i++) {
      run += box[i].n
      cut = i + 1
      if (run >= half) break
    }
    boxes.splice(pick, 1, box.slice(0, cut), box.slice(cut))
  }
  const palette = boxes.map((box) => {
    const total = box.reduce((s, c) => s + c.n, 0)
    return [Math.round(box.reduce((s, c) => s + c.r * c.n, 0) / total), Math.round(box.reduce((s, c) => s + c.g * c.n, 0) / total), Math.round(box.reduce((s, c) => s + c.b * c.n, 0) / total)]
  })
  return palette
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Maps RGBA pixels to palette indices, with a light ordered dither so smooth glows do not band. */
export function makeIndexer(palette) {
  const cache = new Int16Array(32768).fill(-1)
  const nearest = (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    let hit = cache[key]
    if (hit < 0) {
      let best = Infinity
      for (let i = 0; i < palette.length; i++) {
        const dr = palette[i][0] - r
        const dg = palette[i][1] - g
        const db = palette[i][2] - b
        const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db
        if (d < best) {
          best = d
          hit = i
        }
      }
      cache[key] = hit
    }
    return hit
  }
  return (rgba, width, height) => {
    const out = new Uint8Array(width * height)
    for (let y = 0, p = 0; y < height; y++) {
      for (let x = 0; x < width; x++, p++) {
        const j = p * 4
        const t = (BAYER[(y & 3) * 4 + (x & 3)] - 7.5) * 0.55
        out[p] = nearest(Math.max(0, Math.min(255, rgba[j] + t)), Math.max(0, Math.min(255, rgba[j + 1] + t)), Math.max(0, Math.min(255, rgba[j + 2] + t)))
      }
    }
    return out
  }
}

function lzw(indices, minCode) {
  const bytes = []
  let acc = 0
  let bits = 0
  const emit = (code, size) => {
    acc |= code << bits
    bits += size
    while (bits >= 8) {
      bytes.push(acc & 255)
      acc >>>= 8
      bits -= 8
    }
  }
  const clear = 1 << minCode
  const end = clear + 1
  let size = minCode + 1
  let next = end + 1
  let dict = new Map()
  emit(clear, size)
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i]
    const key = (prefix << 8) | c
    const hit = dict.get(key)
    if (hit !== undefined) {
      prefix = hit
      continue
    }
    emit(prefix, size)
    if (next < 4096) {
      dict.set(key, next++)
      if (next > 1 << size && size < 12) size++
    } else {
      emit(clear, size)
      dict = new Map()
      size = minCode + 1
      next = end + 1
    }
    prefix = c
  }
  emit(prefix, size)
  emit(end, size)
  if (bits > 0) bytes.push(acc & 255)
  return bytes
}

/**
 * Streams a looping animation. Frames come as palette index arrays of the full
 * canvas size, so memory stays at one byte per pixel per frame in flight.
 */
export function createGif({ width, height, palette, loop = 0 }) {
  const out = []
  const push = (...b) => out.push(...b)
  const word = (v) => push(v & 255, (v >> 8) & 255)
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)
  word(width)
  word(height)
  push(0xf7, 0, 0)
  for (let i = 0; i < 256; i++) push(...(i < palette.length ? palette[i] : [0, 0, 0]))
  push(0x21, 0xff, 0x0b, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1)
  word(loop)
  push(0)
  let previous = null

  return {
    addFrame(indices, delayCs) {
      let x0 = 0
      let y0 = 0
      let x1 = width - 1
      let y1 = height - 1
      let data = indices
      if (previous) {
        x0 = width
        y0 = height
        x1 = -1
        y1 = -1
        for (let y = 0, p = 0; y < height; y++) {
          for (let x = 0; x < width; x++, p++) {
            if (indices[p] !== previous[p]) {
              if (x < x0) x0 = x
              if (x > x1) x1 = x
              if (y < y0) y0 = y
              if (y > y1) y1 = y
            }
          }
        }
        if (x1 < 0) {
          x0 = y0 = x1 = y1 = 0
          data = new Uint8Array([TRANSPARENT])
        } else {
          const w = x1 - x0 + 1
          data = new Uint8Array(w * (y1 - y0 + 1))
          for (let y = y0, q = 0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++, q++) {
              const p = y * width + x
              data[q] = indices[p] === previous[p] ? TRANSPARENT : indices[p]
            }
          }
        }
      }
      previous = indices
      push(0x21, 0xf9, 4, 0x05, delayCs & 255, (delayCs >> 8) & 255, TRANSPARENT, 0)
      push(0x2c)
      word(x0)
      word(y0)
      word(x1 - x0 + 1)
      word(y1 - y0 + 1)
      push(0)
      push(8)
      const packed = lzw(data, 8)
      for (let i = 0; i < packed.length; i += 255) {
        const chunk = packed.slice(i, i + 255)
        push(chunk.length, ...chunk)
      }
      push(0)
    },
    finish() {
      push(0x3b)
      return Uint8Array.from(out)
    },
  }
}
