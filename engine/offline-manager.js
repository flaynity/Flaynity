/**
 * ============================================================
 * FLAYNITY OFFLINE MANAGER  v3.0
 * ============================================================
 * Rules:
 *   1. On first install with NO internet → show offline.html
 *   2. Once the main domain loads successfully → NEVER show
 *      offline.html again; future offline launches load the
 *      cached main app instead.
 *   3. When internet returns:
 *        - firebase.database().goOnline()
 *        - Reconnect all listeners
 *        - Refresh active + hidden pages
 *        - Sync pending uploads / likes / comments / profile
 *        - Refresh notifications / search / discover
 *        - ALL WITHOUT app restart or WebView/location reload
 *
 * Cache strategy (via Service Worker):
 *   - Cache ONLY static assets: HTML, CSS, JS, images, avatars,
 *     thumbnails, fonts, icons.
 *   - NEVER cache Firebase data permanently.
 *   - Always sync newest database state from Firebase.
 *
 * NEVER calls location.reload(), window.reload(), or webview.reload().
 * ============================================================
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   SERVICE WORKER REGISTRATION
   ───────────────────────────────────────────────────────────── */
const OFFLINE_MANAGER_CACHE_KEY = 'flaynity_app_loaded_once';

(function _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('[OfflineManager] Service Worker not supported.');
        return;
    }

    navigator.serviceWorker.register('/engine/sw.js', { scope: '/' })
        .then(reg => {
            console.log('[OfflineManager] SW registered, scope:', reg.scope);

            // Mark that the app has loaded at least once (used by SW)
            try { localStorage.setItem(OFFLINE_MANAGER_CACHE_KEY, '1'); } catch (_) {}

            // Listen for SW updates
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('[OfflineManager] New SW version available.');
                        }
                    });
                }
            });
        })
        .catch(err => console.error('[OfflineManager] SW registration failed:', err));
})();

/* ─────────────────────────────────────────────────────────────
   OFFLINE SYNC ENGINE
   ─────────────────────────────────────────────────────────────
   When the network comes back, this module orchestrates all
   pending sync operations in the correct order.
   ───────────────────────────────────────────────────────────── */
const OfflineManager = (() => {

    /** Sync all pending offline data to Firebase. */
    async function syncPendingData() {
        if (!navigator.onLine) return;
        const user = AuthManager.currentUser();
        if (!user) return;

        console.log('[OfflineManager] Syncing pending offline data…');

        // 1. Sync offline likes
        await _syncOfflineLikes(user);

        // 2. Resume paused uploads
        if (typeof UploadManager !== 'undefined') UploadManager.resumeAll();

        // 3. Sync profile
        await _syncProfile(user);

        console.log('[OfflineManager] Pending data sync complete.');
    }

    async function _syncOfflineLikes(user) {
        try {
            const raw = localStorage.getItem('flaynity_offline_likes');
            if (!raw) return;
            const offlineLikes = JSON.parse(raw);
            const entries = Object.entries(offlineLikes);
            if (entries.length === 0) return;

            const writes = entries.map(([contentId, data]) =>
                FlaynityDB.ref(`movie_stats/${contentId}/likes/${data.userId}`).set(true)
            );
            await Promise.all(writes);
            localStorage.removeItem('flaynity_offline_likes');
            console.log('[OfflineManager] Offline likes synced:', entries.length);
        } catch (e) {
            console.error('[OfflineManager] Like sync error:', e);
        }
    }

    async function _syncProfile(user) {
        try {
            const snap = await FlaynityDB.ref(`channels/${user.uid}`).once('value');
            const data = snap.val();
            if (data) {
                window.currentChannelData = data;
                localStorage.setItem('flaynity_user_session_cache', JSON.stringify(data));
            }
        } catch (e) {
            console.error('[OfflineManager] Profile sync error:', e);
        }
    }

    return { syncPendingData };
})();

/* ─────────────────────────────────────────────────────────────
   HOOK INTO NETWORK MANAGER
   ───────────────────────────────────────────────────────────── */
if (typeof NetworkManager !== 'undefined') {
    NetworkManager.onOnline(() => {
        OfflineManager.syncPendingData();
    });
}

/* ─────────────────────────────────────────────────────────────
   GLOBAL HELPER  (used by legacy code paths)
   ───────────────────────────────────────────────────────────── */
window.syncOfflineLikes = async function () {
    const user = AuthManager.currentUser();
    if (!user || !navigator.onLine) return;
    try {
        const raw = localStorage.getItem('flaynity_offline_likes');
        if (!raw) return;
        const offlineLikes = JSON.parse(raw);
        const entries = Object.entries(offlineLikes);
        if (entries.length === 0) return;
        await Promise.all(
            entries.map(([id, d]) =>
                FlaynityDB.ref(`movie_stats/${id}/likes/${d.userId}`).set(true)
            )
        );
        localStorage.removeItem('flaynity_offline_likes');
    } catch (e) {
        console.error('[syncOfflineLikes]', e);
    }
};

window.OfflineManager = OfflineManager;
console.log('[OfflineManager] Ready.');
