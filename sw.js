/* Flaynity offline app-shell cache. Keep this file small and update CACHE_VERSION when shell assets change. */
const CACHE_VERSION = 'flaynity-shell-v3';
const SHELL_FILES = [
  './',
  './index.html',
  './js/app.js',
  './js/firebase-config.js',
  './js/cloudflare-r2.js',
  './pages/home.html',
  './pages/feels.html',
  './pages/upload.html',
  './pages/discover.html',
  './pages/you.html',
  './service/upgrade-pro.html',
  './service/flay-verified-badge.html',
  './service/flay-ads.html',
  './service/boost-content.html',
  './service/flay-pay.html'
];
const CDN_FILES = [
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-database-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/aws-sdk/2.1400.0/aws-sdk.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.all(SHELL_FILES.map(async path => {
      try {
        const response = await fetch(path, { cache: 'reload' });
        if (response.ok) await cache.put(path, response);
      } catch (e) {}
    }));
    await Promise.all(CDN_FILES.map(async url => {
      try {
        const response = await fetch(url, { mode: 'no-cors', cache: 'reload' });
        if (response && (response.ok || response.type === 'opaque')) {
          await cache.put(url, response);
        }
      } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('flaynity-shell-') && key !== CACHE_VERSION)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok && url.origin === self.location.origin) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put('./index.html', response.clone()).catch(() => {});
        }
        return response;
      } catch (e) {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match(request)) ||
               (await cache.match('./index.html')) ||
               new Response('Flaynity is not cached yet. Connect once to prepare offline mode.', {
                 status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
               });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (e) {
      throw e;
    }
  })());
});
