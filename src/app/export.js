// Pictures out of the page: the share card as a PNG and a day of sun as a GIF.
// Both draw with the same code as the stage, so they match what is on screen.

import { drawStage } from '../render/draw.js'
import { PALETTES } from '../render/palette.js'
import { makeFrameCamera } from './stage.js'
import { computeFrame, floorArea } from './frame.js'
import { dayCurve } from './timeline.js'
import { buildPalette, makeIndexer, createGif } from '../core/gif.js'
import { blurScene } from '../core/codec.js'
import { daySteps } from '../core/hours.js'
import { t } from './i18n.js'
import { clock, dateText, bearingText, duration, areaText } from './format.js'
import { wallBearing } from '../core/room.js'

const VIEW = { yaw: -32, pitch: 33 }
const wait = () => new Promise((resolve) => setTimeout(resolve, 0))

export function paintScene(ctx, { scene, width, height, palette, dpr = 1, view = VIEW, showArc = true, markers = null, compassAt, clear = true }) {
  const frame = computeFrame(scene)
  const camera = makeFrameCamera(scene, view, width, height, frame, showArc)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawStage(ctx, { scene, camera, palette, dpr, sun: frame.sun, patches: frame.patches, itemTops: frame.itemTops, path: frame.path, heat: null, selection: null, hover: null, showArc, markers, compassAt, clear })
  return frame
}

const hidden = (scene) => blurScene(scene)

async function loadFonts() {
  try {
    await document.fonts.load('600 64px "Fraunces Variable"')
    await document.fonts.load('600 28px "Fraunces Variable"')
  } catch {
    // the system serif is a fine fallback
  }
}

/** The 1080 by 1350 share card. */
export async function renderCard({ scene, themeName, hideLocation }) {
  await loadFonts()
  const shown = hideLocation ? hidden(scene) : scene
  const pal = PALETTES[themeName]
  const W = 1080
  const H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const paper = ctx.createLinearGradient(0, 0, 0, H)
  paper.addColorStop(0, themeName === 'dark' ? '#10162a' : '#fbf4e6')
  paper.addColorStop(1, themeName === 'dark' ? '#0b0f1c' : '#f1e7d3')
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, W, H)

  const stageH = 840
  const stage = document.createElement('canvas')
  stage.width = W
  stage.height = stageH
  const frame = paintScene(stage.getContext('2d'), { scene: shown, width: W, height: stageH, palette: pal, compassAt: [70, stageH - 70] })
  ctx.drawImage(stage, 0, 150)

  ctx.fillStyle = pal.ink
  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 54px ${pal.display}`
  ctx.fillText('Sunspill', 64, 96)
  ctx.textAlign = 'right'
  ctx.font = `600 34px ${pal.ui}`
  ctx.fillText(`${dateText(shown.date.month, shown.date.day)}  ${clock(shown.minutes)}`, W - 64, 92)
  ctx.textAlign = 'left'

  const curve = dayCurve(shown)
  const lit = curve.points.filter((p) => p.lit)
  const place = shown.place.name || t('card.hidden')
  const facing = bearingText(wallBearing(shown, shown.windows[0]?.wall ?? 'top'))
  ctx.fillStyle = pal.muted
  ctx.font = `500 30px ${pal.ui}`
  ctx.fillText(`${place}  ·  ${t('card.faces', { dir: facing })}`, 64, 1040)
  ctx.fillStyle = pal.ink
  ctx.font = `600 76px ${pal.display}`
  ctx.fillText(lit.length ? duration(curve.litHours) : t('card.noSun'), 64, 1126)
  ctx.fillStyle = pal.muted
  ctx.font = `500 30px ${pal.ui}`
  if (lit.length) ctx.fillText(t('card.of', { from: clock(lit[0].minutes), to: clock(lit[lit.length - 1].minutes) }), 64, 1176)
  const floor = floorArea(frame.patches)
  ctx.fillText(t('card.floorNow', { area: areaText(floor, 'm') }), 64, 1222)
  ctx.font = `500 22px ${pal.ui}`
  ctx.fillText(t('card.assume'), 64, 1286)
  ctx.textAlign = 'right'
  ctx.fillText('github.com/Arthur031221/Sunspill', W - 64, 1050)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}


/** The minute range for a GIF sweep. */
export function sweepRange(scene, which) {
  const { steps } = daySteps(scene.place, scene.date.month, scene.date.day, 10)
  if (!steps.length) return null
  const rise = steps[0].minutes
  const set = steps[steps.length - 1].minutes
  if (which === 'lit') {
    const lit = dayCurve(scene).points.filter((p) => p.lit)
    if (lit.length) return [Math.max(rise, lit[0].minutes - 20), Math.min(set, lit[lit.length - 1].minutes + 10)]
  }
  if (which === 'afternoon') return [Math.max(rise, 12 * 60), set]
  if (which === 'morning') return [rise, Math.min(set, 12 * 60)]
  return [rise, set]
}

/** A silent GIF of the sun crossing the room. Resolves to null when cancelled. */
export async function renderGif({ scene, themeName, hideLocation, range, width = 540, aspect = 0.78, fps = 12, seconds = 5, onProgress, signal }) {
  await loadFonts()
  const bounds = sweepRange(scene, range)
  if (!bounds) throw new Error(t('share.noSun'))
  const shown = hideLocation ? hidden(scene) : scene
  const pal = PALETTES[themeName]
  const height = Math.round(width * aspect)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const count = Math.max(8, Math.round(fps * seconds))
  const minutesAt = (i) => bounds[0] + ((bounds[1] - bounds[0]) * i) / (count - 1)
  const drawAt = (i) => {
    const s = { ...shown, minutes: minutesAt(i) }
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = themeName === 'dark' ? '#10162a' : '#fbf4e6'
    ctx.fillRect(0, 0, width, height)
    paintScene(ctx, { scene: s, width, height, palette: pal, compassAt: [32, height - 34], clear: false })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = pal.ink
    ctx.font = `600 30px ${pal.display}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(clock(s.minutes), width - 16, height - 16)
    ctx.font = `600 15px ${pal.ui}`
    ctx.fillStyle = pal.muted
    ctx.textAlign = 'left'
    ctx.fillText(`Sunspill  ·  ${dateText(s.date.month, s.date.day)}`, 14, 24)
    return ctx.getImageData(0, 0, width, height)
  }

  const samples = []
  for (let i = 0; i < 8; i++) samples.push(drawAt(Math.round(((count - 1) * i) / 7)).data)
  const palette = buildPalette(samples)
  const index = makeIndexer(palette)
  const gif = createGif({ width, height, palette })
  const delay = Math.round(100 / fps)
  for (let i = 0; i < count; i++) {
    if (signal?.aborted) return null
    gif.addFrame(index(drawAt(i).data, width, height), i === count - 1 ? 90 : delay)
    onProgress?.((i + 1) / count)
    await wait()
  }
  return { blob: new Blob([gif.finish()], { type: 'image/gif' }), width, height, frames: count }
}
