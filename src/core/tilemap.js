// Which map tiles a view needs, and what to draw where a tile has not come yet. A tile that is missing is
// stood in for by the tile above it (cut to the right part and scaled up), or by the tiles below it that
// are in, so that a pinch across a zoom level never shows a hole where a picture is still on its way.

export const TILE = 256
export const tileKey = (z, x, y) => `${z}/${x}/${y}`

/**
 * The tiles of a view and the drawing that covers it with what is loaded.
 * `cx` and `cy` are the middle of the view in pixels of the whole map at `zoom` (a 256 pixel tile each).
 * `ready(z, x, y)` says whether a tile is loaded. The tile level is the zoom rounded and kept to `maxZoom`,
 * and a view past it is the level `maxZoom` scaled up.
 * @returns {{z:number, size:number, ops:object[], wanted:{z:number,x:number,y:number}[], total:number, blank:number}}
 *   `ops` are drawings of part of a loaded tile, `{z, x, y, sx, sy, sw, sh, dx, dy, dw, dh}`, source then screen
 *   rectangle. `wanted` are the tiles on the screen at the tile level, the nearest the middle first.
 *   `blank` is the share of the screen that no drawing covers, 0 to 1.
 */
export function planTiles({ zoom, cx, cy, width, height, ready, maxZoom = 19, maxUp = 4, maxDown = 2 }) {
  const z = Math.min(maxZoom, Math.max(0, Math.round(zoom)))
  const size = TILE * 2 ** (zoom - z)
  const left = cx - width / 2
  const top = cy - height / 2
  const scale = 2 ** (z - zoom)
  const n = 2 ** z
  const x0 = Math.floor((left * scale) / TILE)
  const x1 = Math.floor(((left + width) * scale) / TILE)
  const y0 = Math.max(0, Math.floor((top * scale) / TILE))
  const y1 = Math.min(n - 1, Math.floor(((top + height) * scale) / TILE))
  const mid = [(cx * scale) / TILE, (cy * scale) / TILE]
  const wanted = []
  const ops = []
  let covered = 0
  const add = (op) => {
    ops.push(op)
    const w = Math.min(width, op.dx + op.dw) - Math.max(0, op.dx)
    const h = Math.min(height, op.dy + op.dh) - Math.max(0, op.dy)
    if (w > 0 && h > 0) covered += w * h
  }
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const x = ((tx % n) + n) % n
      wanted.push({ z, x, y: ty, d: Math.hypot(tx + 0.5 - mid[0], ty + 0.5 - mid[1]) })
      const dx = tx * size - left
      const dy = ty * size - top
      if (ready(z, x, ty)) {
        add({ z, x, y: ty, sx: 0, sy: 0, sw: TILE, sh: TILE, dx, dy, dw: size, dh: size })
        continue
      }
      // the nearest tile above that is loaded, cut down to the part that this tile covers
      let filled = false
      for (let d = 1; d <= maxUp && z - d >= 0 && !filled; d++) {
        const f = 2 ** d
        const px = Math.floor(x / f)
        const py = Math.floor(ty / f)
        if (!ready(z - d, px, py)) continue
        const part = TILE / f
        add({ z: z - d, x: px, y: py, sx: (x - px * f) * part, sy: (ty - py * f) * part, sw: part, sh: part, dx, dy, dw: size, dh: size })
        filled = true
      }
      // else the tiles below, as many as are in
      for (let d = 1; d <= maxDown && z + d <= maxZoom && !filled; d++) {
        const f = 2 ** d
        const part = size / f
        for (let j = 0; j < f; j++) {
          for (let i = 0; i < f; i++) {
            const cxTile = x * f + i
            const cyTile = ty * f + j
            if (!ready(z + d, cxTile, cyTile)) continue
            add({ z: z + d, x: cxTile, y: cyTile, sx: 0, sy: 0, sw: TILE, sh: TILE, dx: dx + i * part, dy: dy + j * part, dw: part, dh: part })
            filled = true
          }
        }
      }
    }
  }
  wanted.sort((a, b) => a.d - b.d)
  return {
    z,
    size,
    ops,
    wanted: wanted.map(({ z: wz, x, y }) => ({ z: wz, x, y })),
    total: wanted.length,
    // the pieces add up to the screen only to within rounding, which is not a blank
    blank: Math.max(0, 1 - covered / (width * height)) < 1e-9 ? 0 : 1 - covered / (width * height),
  }
}
