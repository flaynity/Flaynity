/**
 * ============================================================
 * FLAYNITY SERVICE WORKER  v3.0
 * ============================================================
 * Cache strategy:
 *   - Cache-first for static assets (HTML shell, CSS, JS, fonts,
 *     images, avatars, thumbnails).
 *   - Network-only for Firebase Realtime Database requests
 *     (*.firebaseio.com) – Firebase handles its own offline
 *     persistence via enablePersistence().
 *   - Network-only for Cloudflare R2 media uploads.
 *   - On first install with no internet → serve offline.html.
 *   - Once the main app shell is cached → serve it offline
 *     instead of offline.html.
 *
 * NEVER caches Firebase data permanently.
 * ============================================================
 */

'use strict';

const CACHE_NAME    = 'flaynity-static-v3';
const OFFLINE_PAGE  = '/offline.html';
const APP_SHELL_URL = '/';   // index.html served at root

/** Static assets to pre-cache on install */
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/offline.html',
    '/engine/firebase-engine.js',
    '/engine/network-manager.js',
    '/engine/sync-manager.js',
    '/engine/offline-manager.js',
    '/engine/feed-manager.js',
    '/engine/upload-manager.js',
    '/engine/refresh-manager.js',
];

/** URL patterns that must NEVER be cached (always network) */
const NETWORK_ONLY_PATTERNS = [
    /firebaseio\.com/,
    /googleapis\.com\/identitytoolkit/,
    /r2\.cloudflarestorage\.com/,
    /r2\.dev\/uploads\//,          // media uploads
    /api\.themoviedb\.org/,
];

function isNetworkOnly(url) {
    return NETWORK_ONLY_PATTERNS.some(re => re.test(url));
}

/* ── Install ─────────────────────────────────────────────── */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(PRECACHE_URLS).catch(err => {
                console.warn('[SW] Pre-cache partial failure (offline install?):', err);
            });
        }).then(() => self.skipWaiting())
    );
});

/* ── Activate ────────────────────────────────────────────── */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

/* ── Fetch ───────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = request.url;

    // Only handle GET requests
    if (request.method !== 'GET') return;

    // Network-only paths (Firebase, R2 uploads, TMDB)
    if (isNetworkOnly(url)) {
        event.respondWith(fetch(request));
        return;
    }

    // Navigation requests → serve app shell or offline page
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Cache the fresh shell
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(request, clone));
                    return response;
                })
                .catch(() =>
                    // Offline: serve cached shell if available, else offline.html
                    caches.match(request)
                        .then(cached => cached || caches.match(OFFLINE_PAGE))
                )
        );
        return;
    }

    // Static assets → cache-first, update in background
    event.respondWith(
        caches.match(request).then(cached => {
            const networkFetch = fetch(request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(request, clone));
                }
                return response;
            }).catch(() => null);

            return cached || networkFetch;
        })
    );
});
