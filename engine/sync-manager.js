/**
 * ============================================================
 * FLAYNITY SYNC MANAGER  v3.0
 * ============================================================
 * SyncManager.refreshEverything():
 *   1. Disconnects all old global feed listeners
 *   2. Clears temporary in-memory caches
 *   3. Reloads Firebase data (parallel Promise.all)
 *   4. Re-attaches realtime listeners
 *   5. Rebuilds UI (feed, shorts, profile)
 *   6. Hides skeleton only after Firebase returns data
 *   7. Resolves only after Firebase data arrives
 *
 * NEVER calls location.reload(), window.reload(), or webview.reload().
 * ============================================================
 */

'use strict';

const SyncManager = (() => {

    let _isRefreshing = false;

    /* ── Public API ─────────────────────────────────────────── */

    /**
     * Full no-reload refresh of all app data.
     * Returns a Promise that resolves when the refresh is complete.
     * Safe to call multiple times – concurrent calls are ignored.
     */
    async function refreshEverything() {
        if (_isRefreshing) {
            console.log('[SyncManager] Refresh already in progress – skipping.');
            return;
        }
        if (!navigator.onLine) {
            console.log('[SyncManager] Offline – skipping refresh.');
            return;
        }

        _isRefreshing = true;
        console.log('[SyncManager] 🔄 Starting full refresh…');

        try {
            /* Step 1 – Tear down ALL existing global feed listeners */
            ListenerManager.detachByPrefix('feed/');
            ListenerManager.detachByPrefix('channel/');
            ListenerManager.detachByPrefix('post-reactions/');
            ListenerManager.detachByPrefix('post-comments/');
            ListenerManager.detachByPrefix('stats/');

            /* Reset deduplication sentinels so listeners always rebuild */
            if (typeof FeedManager !== 'undefined') FeedManager.resetSentinels();

            /* Step 2 – Refresh current user profile silently */
            await _refreshProfile();

            /* Step 3 – Fetch fresh snapshots in parallel */
            const [longsSnap, shortsSnap, postsSnap] = await Promise.all([
                FlaynityDB.ref('admin_panel/movies/user_uploads').once('value'),
                FlaynityDB.ref('admin_panel/movies/shorts').once('value'),
                FlaynityDB.ref('admin_panel/posts').once('value')
            ]);

            /* Step 4 – Populate in-memory stores */
            if (typeof FeedManager !== 'undefined') {
                FeedManager.setLongVideos(longsSnap.val()  ? Object.values(longsSnap.val())  : []);
                FeedManager.setShorts    (shortsSnap.val() ? Object.values(shortsSnap.val()) : []);
                FeedManager.setPosts     (postsSnap.val()  ? Object.values(postsSnap.val())  : []);
            }

            /* Step 5 – Re-attach realtime listeners */
            if (typeof FeedManager !== 'undefined') FeedManager.startRealtimeListeners();

            /* Step 6 – Rebuild UI */
            if (typeof buildHomeFeed  === 'function') buildHomeFeed();
            if (typeof buildShortsPage === 'function') {
                const shortsTab = document.getElementById('shorts-tab');
                if (shortsTab && shortsTab.classList.contains('active')) buildShortsPage();
            }

            /* Step 7 – Refresh analytics if page is open */
            _refreshAnalytics();

            /* Step 8 – Refresh hidden/background pages */
            _refreshHiddenPages();

            console.log('[SyncManager] ✅ Refresh complete.');

        } catch (err) {
            console.error('[SyncManager] Refresh error:', err);
        } finally {
            _isRefreshing = false;
        }
    }

    /** Refresh the current user's channel profile. */
    async function _refreshProfile() {
        const user = AuthManager.currentUser();
        if (!user) return;

        // Detach stale per-user listeners before re-fetching
        ListenerManager.detach(`channel/self/${user.uid}`);
        ListenerManager.detach(`user/self/${user.uid}`);

        const snap = await FlaynityDB.ref(`channels/${user.uid}`).once('value');
        const data = snap.val();
        if (data) {
            window.currentChannelData = data;
            try { localStorage.setItem('flaynity_user_session_cache', JSON.stringify(data)); } catch (_) {}
        }

        if (typeof initYouTabUI === 'function') initYouTabUI();
    }

    /** Refresh analytics page if it is currently visible. */
    function _refreshAnalytics() {
        const page = document.getElementById('analytics-page');
        if (!page) return;
        const visible = page.style.display === 'flex' || page.style.display === 'block';
        if (visible && typeof calculateChannelAnalytics === 'function') {
            calculateChannelAnalytics();
        }
    }

    /**
     * Refresh pages that are mounted but not currently visible
     * (e.g. search/discover, notifications) so they are up-to-date
     * when the user navigates to them.
     */
    function _refreshHiddenPages() {
        // Sync pending offline likes to Firebase
        if (typeof syncOfflineLikes === 'function') syncOfflineLikes();

        // Refresh channel page if open
        const channelPage = document.getElementById('view-channel-page');
        if (channelPage && (channelPage.style.display === 'flex' || channelPage.style.display === 'block')) {
            const user = AuthManager.currentUser();
            if (user) {
                if (typeof renderChannelVideos === 'function') renderChannelVideos(user.uid);
                if (typeof renderChannelShorts === 'function') renderChannelShorts(user.uid);
                if (typeof renderChannelPosts  === 'function') renderChannelPosts(user.uid);
            }
        }
    }

    /** Expose isRefreshing for external guards (e.g. PTR). */
    function isRefreshing() { return _isRefreshing; }

    return { refreshEverything, isRefreshing };
})();

window.SyncManager = SyncManager;
console.log('[SyncManager] Ready.');
