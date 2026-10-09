// Builds dist/index.html (the whole app in one file) and dist/sunspill.js (the
// sun and light library on its own).
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORIGINS } from '../src/app/net.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(resolve(root, file), 'utf8')
const font = `data:font/woff2;base64,${readFileSync(resolve(root, 'node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2')).toString('base64')}`

mkdirSync(resolve(root, 'dist'), { recursive: true })

await build({
  entryPoints: [resolve(root, 'src/index.js')],
  outfile: resolve(root, 'dist/sunspill.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  legalComments: 'none',
  banner: { js: '// Sunspill: sun position, window light and sun hours for a room. MIT license.\n// See docs/API.md.' },
})

const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version
const app = await build({
  entryPoints: [resolve(root, 'src/app/main.js')],
  define: { __VERSION__: JSON.stringify(version) },
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  legalComments: 'none',
  loader: { '.json': 'json' },
})

// Keep the inline script from ending its own element or opening an HTML comment.
const js = app.outputFiles[0].text.replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--')
const css = read('src/app/app.css').replace('__FONT__', () => font)
const logo = read('assets/logo.svg').replace(/<svg /u, '<svg class="logo" ').replace(/\s*\n\s*/gu, '')
const favicon = `data:image/svg+xml,${encodeURIComponent(read('assets/logo.svg').replace(/\s*\n\s*/gu, ''))}`
const hash = createHash('sha256').update(js).digest('base64')
// The page makes no request until a person allows one of the three online
// services in src/app/net.js. The policy names exactly those hosts and no others.
const csp = [
  "default-src 'none'",
  `script-src 'sha256-${hash}'`,
  "style-src 'unsafe-inline'",
  'font-src data:',
  `img-src 'self' data: blob: ${ORIGINS.images.join(' ')}`,
  `connect-src ${ORIGINS.connect.join(' ')}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ')

const html = read('src/app/template.html')
  .replace('__CSP__', csp)
  .replace('__FAVICON__', () => favicon)
  .replace('__LOGO__', () => logo)
  .replace('__CSS__', () => css)
  .replace('__JS__', () => js)
writeFileSync(resolve(root, 'dist/index.html'), html)
// what lets a phone add the page to its home screen and open it full screen
const ICONS = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']
for (const name of ICONS) copyFileSync(resolve(root, 'assets', name), resolve(root, 'dist', name))
writeFileSync(resolve(root, 'dist/manifest.webmanifest'), JSON.stringify({
  name: 'Sunspill',
  short_name: 'Sunspill',
  description: 'Set up your own room and see where the sun lands on its floor, by the hour and the season.',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#f7f1e6',
  theme_color: '#f7f1e6',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n')
// A cache-first worker, so a page opened once keeps working without a connection.
const cacheId = createHash('sha256').update(html).digest('hex').slice(0, 10)
writeFileSync(resolve(root, 'dist/sw.js'), `const CACHE = 'sunspill-${cacheId}'
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', 'manifest.webmanifest', 'icon-192.png'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('sunspill-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== location.origin) return
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)))
})
`)
console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} KB, dist/sunspill.js, dist/sw.js`)
