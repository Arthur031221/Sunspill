import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PALETTES } from '../src/render/palette.js'

const channel = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const rgb = (css) => {
  const hex = css.match(/^#([0-9a-f]{6})$/i)
  if (hex) return { c: [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)), a: 1 }
  const m = css.match(/^rgba?\(([^)]+)\)$/).slice(1)[0].split(',').map(Number)
  return { c: m.slice(0, 3), a: m[3] ?? 1 }
}
/** WCAG contrast ratio of a colour (with its alpha) laid over a background. */
function contrast(fg, bg) {
  const b = rgb(bg).c
  const f = rgb(fg)
  const over = f.c.map((v, i) => v * f.a + b[i] * (1 - f.a))
  const [hi, lo] = [luminance(over), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('the edge of the sun patch stands out from the floor by 3 to 1, and the text by 4.5 to 1, in both themes', () => {
  for (const pal of Object.values(PALETTES)) {
    assert.ok(contrast(pal.patchEdge, pal.floor) >= 3, `${pal.name}: the patch edge is ${contrast(pal.patchEdge, pal.floor).toFixed(2)} to 1 against the floor`)
    assert.ok(contrast(pal.ink, pal.bg) >= 4.5, `${pal.name}: ink on the page`)
    assert.ok(contrast(pal.muted, pal.bg) >= 4.5, `${pal.name}: quiet text on the page`)
  }
})
