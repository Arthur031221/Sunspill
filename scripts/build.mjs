// Builds dist/index.html (the whole app in one file) and dist/sunspill.js (the
// sun and light library on its own).
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

const app = await build({
  entryPoints: [resolve(root, 'src/app/main.js')],
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
  `img-src data: blob: ${ORIGINS.images.join(' ')}`,
  `connect-src ${ORIGINS.connect.join(' ')}`,
  "worker-src 'self'",
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
// A cache-first worker, so a page opened once keeps working without a connection.
const version = createHash('sha256').update(html).digest('hex').slice(0, 10)
writeFileSync(resolve(root, 'dist/sw.js'), `const CACHE = 'sunspill-${version}'
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./'])).then(() => self.skipWaiting()))
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
