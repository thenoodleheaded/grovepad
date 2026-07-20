const CACHE_PREFIX = 'grovepad-shell-'
const CACHE_NAME = `${CACHE_PREFIX}v2`
const INSTALL_SHELL = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/app-icon-192.svg',
  '/app-icon-512.svg',
]

async function precacheCurrentShell() {
  const cache = await caches.open(CACHE_NAME)
  const shellResponse = await fetch('/')
  if (!shellResponse.ok) throw new Error('Could not fetch the application shell')
  const html = await shellResponse.clone().text()
  await cache.put('/', shellResponse)
  const builtEntries = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+(?:\?[^"#]*)?)"/g)]
    .map((match) => match[1])
  await Promise.allSettled([...new Set([...INSTALL_SHELL, ...builtEntries])].map((url) => cache.add(url)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheCurrentShell())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put('/', response.clone())
    return response
  } catch {
    return (await cache.match(request)) ?? (await cache.match('/')) ?? Response.error()
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname === '/service-worker.js') return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (['script', 'style', 'image', 'font', 'worker', 'manifest'].includes(request.destination)) {
    event.respondWith(cacheFirstAsset(request))
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return
  const urls = event.data.urls.filter((url) => typeof url === 'string' && url.startsWith('/'))
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled([...new Set(urls)].map((url) => cache.add(url))))
      .then(() => event.ports[0]?.postMessage({ type: 'CACHE_URLS_COMPLETE' })),
  )
})
