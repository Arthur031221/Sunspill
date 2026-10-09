import { ramp } from './geometry.js'

/** An offscreen canvas with one pixel per grid cell, coloured by direct sun hours. */
export function buildHeatCanvas(grid, palette, max) {
  const canvas = document.createElement('canvas')
  canvas.width = grid.nx
  canvas.height = grid.ny
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(grid.nx, grid.ny)
  const cool = palette.cool.match(/[\d.]+/g).map(Number)
  for (let i = 0; i < grid.hours.length; i++) {
    const h = grid.hours[i]
    const o = i * 4
    if (h < 0.02) {
      image.data[o] = cool[0]
      image.data[o + 1] = cool[1]
      image.data[o + 2] = cool[2]
      image.data[o + 3] = cool[3] * 255
    } else {
      const c = ramp(palette.heat, h / max)
      image.data[o] = c[0]
      image.data[o + 1] = c[1]
      image.data[o + 2] = c[2]
      image.data[o + 3] = 235
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** A CSS gradient for the legend bar. */
export function legendGradient(palette) {
  return `linear-gradient(90deg, ${palette.heat.join(', ')})`
}
