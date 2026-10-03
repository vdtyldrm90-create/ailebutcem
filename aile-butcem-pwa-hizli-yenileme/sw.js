const CACHE_NAME = 'aile-butcem-pwa-v12';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (path) => {
      const url = new URL(path, self.registration.scope).href;
      try {
        const response = await fetch(new Request(url, { cache: 'reload' }));
        if (response && response.ok) await cache.put(url, response.clone());
      } catch (_) {
        // An unavailable shell resource should not break service-worker installation.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('aile-butcem-pwa-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Cache third-party JavaScript opportunistically, with network-first updates.
  // This can help the app shell load after a prior visit, but cloud features need internet.
  if (request.destination === 'script' &&
      (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com')) {
    const cachePromise = caches.open(CACHE_NAME);
    const refreshPromise = cachePromise.then(cache => fetch(request).then(response => {
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone()).catch(() => {});
      return response;
    }).catch(() => null));
    event.waitUntil(refreshPromise.then(() => undefined));
    event.respondWith((async () => {
      const cache = await cachePromise;
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await refreshPromise;
      return response || new Response('Uygulama kitaplığı çevrimdışı kullanılamıyor. İnternet bağlantını açıp tekrar dene.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Serve the cached app shell immediately, and refresh it in the background.
  // The active tab is restored by the page, so refreshes return to the current section.
  if (request.mode === 'navigate') {
    const cachePromise = caches.open(CACHE_NAME);
    const indexUrl = new URL('./index.html', self.registration.scope).href;
    const refreshPromise = cachePromise.then(cache => fetch(request).then(response => {
      if (response && response.ok) cache.put(indexUrl, response.clone()).catch(() => {});
      return response;
    }).catch(() => null));
    event.waitUntil(refreshPromise.then(() => undefined));
    event.respondWith((async () => {
      const cache = await cachePromise;
      const cached = await cache.match(indexUrl) || await cache.match(request);
      if (cached) return cached;
      const response = await refreshPromise;
      return response || new Response(
        '<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aile Bütçem</title><body style="font-family:system-ui;padding:2rem;background:#f7faf9;color:#273238"><h2>Aile Bütçem</h2><p>Uygulama açılabilmek için internet bağlantısı bekliyor. İnternete bağlanıp tekrar dene.</p></body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    })());
    return;
  }

  // Static app metadata and icons can be served from cache after first visit.
  if (url.pathname.endsWith('/manifest.webmanifest') || (/\/icon-192\.png$/.test(url.pathname) || /\/icon-512\.png$/.test(url.pathname) || /\/apple-touch-icon\.png$/.test(url.pathname))) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (_) {
        return new Response('', { status: 503 });
      }
    })());
  }
});
