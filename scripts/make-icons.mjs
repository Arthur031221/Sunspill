// Draws the app icons in assets/ from the logo: the window and the patch of sun on warm paper.
// The maskable one has the mark inside the middle 60 percent so a round or squircle mask never cuts it.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const logo = readFileSync(resolve(root, 'assets/logo.svg'), 'utf8').replace(/<svg[^>]*>/, '').replace('</svg>', '')
const icon = (size, { maskable = false } = {}) => {
  const scale = maskable ? 0.6 : 0.74
  const inner = size * scale
  const at = (size - inner) / 2
  const radius = maskable ? 0 : size * 0.22
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#F7F1E6"/>
  <g transform="translate(${at} ${at}) scale(${inner / 64})">${logo}</g>
</svg>`
}

const browser = await chromium.launch()
for (const [name, size, opts] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512, { maskable: true }]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${icon(size, opts)}`)
  writeFileSync(resolve(root, 'assets', name), await page.screenshot({ omitBackground: true, type: 'png' }))
  await page.close()
}
await browser.close()
console.log('assets/icon-192.png, icon-512.png and icon-maskable-512.png written')
