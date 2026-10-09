import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'

const FILES = {
  '/': ['dist/index.html', 'text/html; charset=utf-8'],
  '/sw.js': ['dist/sw.js', 'text/javascript'],
  '/manifest.webmanifest': ['dist/manifest.webmanifest', 'application/manifest+json'],
  '/icon-192.png': ['dist/icon-192.png', 'image/png'],
  '/icon-512.png': ['dist/icon-512.png', 'image/png'],
  '/icon-maskable-512.png': ['dist/icon-maskable-512.png', 'image/png'],
  '/dist/sunspill.js': ['dist/sunspill.js', 'text/javascript'],
  '/examples/library.html': ['examples/library.html', 'text/html; charset=utf-8'],
}

// Serves the built files and records every request, so a test can show that
// nothing but the page itself is ever fetched.
export async function serve() {
  const seen = []
  const server = createServer((req, res) => {
    seen.push(req.url)
    const entry = FILES[req.url.split('#')[0].split('?')[0]]
    if (!entry || !existsSync(new URL(`../${entry[0]}`, import.meta.url))) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': entry[1] })
    res.end(readFileSync(new URL(`../${entry[0]}`, import.meta.url)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return { url: `http://127.0.0.1:${port}/`, origin: `http://127.0.0.1:${port}`, seen, close: () => new Promise((resolve) => server.close(resolve)) }
}
