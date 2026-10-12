const CACHE = 'sunspill-2245bbf31c'
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', 'manifest.webmanifest', 'icon-192.png'].map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('sunspill-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
const fresh = (request, key) => {
  const network = fetch(request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) caches.open(CACHE).then((cache) => cache.put(key, res.clone()))
    return res
  })
  const late = new Promise((resolve) => setTimeout(resolve, 4000)).then(() => caches.match(key, { ignoreSearch: true }))
  return Promise.race([network, late.then((hit) => hit || network)]).catch(() => caches.match(key, { ignoreSearch: true }))
}
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== location.origin) return
  if (event.request.mode === 'navigate') return event.respondWith(fresh(event.request, './'))
  if (url.pathname.includes('/data/')) return event.respondWith(fresh(event.request, event.request))
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)))
})
