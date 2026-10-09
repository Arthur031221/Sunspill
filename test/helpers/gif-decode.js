// A reader for the GIFs the encoder writes, written separately from it, so a
// round trip test means something. Returns each frame as full canvas palette indices.

export function decodeGif(bytes) {
  let p = 6
  const u16 = () => {
    const v = bytes[p] | (bytes[p + 1] << 8)
    p += 2
    return v
  }
  const width = u16()
  const height = u16()
  const flags = bytes[p++]
  p += 2
  const palette = []
  if (flags & 0x80) {
    const n = 2 << (flags & 7)
    for (let i = 0; i < n; i++, p += 3) palette.push([bytes[p], bytes[p + 1], bytes[p + 2]])
  }
  const frames = []
  let canvas = new Uint8Array(width * height)
  let transparent = -1
  let delay = 0
  let loops = null
  while (p < bytes.length) {
    const tag = bytes[p++]
    if (tag === 0x3b) break
    if (tag === 0x21) {
      const label = bytes[p++]
      if (label === 0xf9) {
        const packed = bytes[p + 1]
        delay = bytes[p + 2] | (bytes[p + 3] << 8)
        transparent = packed & 1 ? bytes[p + 4] : -1
      }
      if (label === 0xff && String.fromCharCode(...bytes.slice(p + 1, p + 12)) === 'NETSCAPE2.0') loops = bytes[p + 14] | (bytes[p + 15] << 8)
      while (bytes[p]) p += bytes[p] + 1
      p++
      continue
    }
    if (tag !== 0x2c) throw new Error(`unexpected block ${tag} at ${p - 1}`)
    const x0 = u16()
    const y0 = u16()
    const w = u16()
    const h = u16()
    const packed = bytes[p++]
    if (packed & 0x80) throw new Error('local palettes are not written by the encoder')
    const minCode = bytes[p++]
    const data = []
    while (bytes[p]) {
      for (let i = 1; i <= bytes[p]; i++) data.push(bytes[p + i])
      p += bytes[p] + 1
    }
    p++
    const pixels = lzwDecode(data, minCode, w * h)
    canvas = canvas.slice()
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = pixels[y * w + x]
      if (v !== transparent) canvas[(y0 + y) * width + x0 + x] = v
    }
    frames.push({ indices: canvas, delay })
  }
  return { width, height, palette, frames, loops }
}

function lzwDecode(data, minCode, expected) {
  const clear = 1 << minCode
  const end = clear + 1
  let size = minCode + 1
  let table = []
  const reset = () => {
    table = []
    for (let i = 0; i < clear; i++) table.push([i])
    table.push(null, null)
    size = minCode + 1
  }
  reset()
  const out = []
  let acc = 0
  let bits = 0
  let at = 0
  let prev = null
  while (out.length < expected) {
    while (bits < size && at < data.length) {
      acc |= data[at++] << bits
      bits += 8
    }
    if (bits < size) break
    const code = acc & ((1 << size) - 1)
    acc >>>= size
    bits -= size
    if (code === clear) {
      reset()
      prev = null
      continue
    }
    if (code === end) break
    let entry
    if (code < table.length) entry = table[code]
    else if (prev) entry = [...prev, prev[0]]
    else throw new Error('bad code')
    out.push(...entry)
    if (prev) table.push([...prev, entry[0]])
    prev = entry
    if (table.length === 1 << size && size < 12) size++
  }
  return out
}
