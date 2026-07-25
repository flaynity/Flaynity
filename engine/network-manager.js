/**
 * ============================================================
 * FLAYNITY NETWORK MANAGER  v3.0
 * ============================================================
 * Production-quality network detection:
 *   - navigator.onLine + window online/offline events
 *   - Firebase .info/connected (via FirebaseConnectionMonitor)
 *   - Android ConnectivityManager push via JavaScript Interface
 *   - Debounced reconnect logic (no polling, no location.reload())
 *   - Exposes window.FlaynityNetworkOnline / FlaynityNetworkOffline
 *     so MainActivity.java's NetworkCallback can call them directly
 *
 * ── Android Integration ──────────────────────────────────────
 * In MainActivity.java's registerNetworkCallback(), the
 * ConnectivityManager.NetworkCallback should call:
 *
 *   onAvailable(Network n) →
 *       webview.evaluateJavascript(
 *           "window.FlaynityNetworkOnline && window.FlaynityNetworkOnline();", null);
 *
 *   onLost(Network n) →
 *       webview.evaluateJavascript(
 *           "window.FlaynityNetworkOffline && window.FlaynityNetworkOffline();", null);
 *
 *   onCapabilitiesChanged(Network n, NetworkCapabilities c) →
 *       // Optionally push signal strength:
 *       webview.evaluateJavascript(
 *           "window.FlaynityNetworkWeak && window.FlaynityNetworkWeak();", null);
 *
 * The JS functions are defined below and are safe to call from
 * any thread via evaluateJavascript (they run on the JS thread).
 * ============================================================
 */

'use strict';

const NetworkManager = (() => {

    /* ── State ─────────────────────────────────────────────── */
    let _isOnline        = navigator.onLine;
    let _isWeak          = false;
    let _debounceTimer   = null;
    const DEBOUNCE_MS    = 1200;   // ignore flapping within this window

    const _onlineCallbacks  = new Set();
    const _offlineCallbacks = new Set();
    const _weakCallbacks    = new Set();

    /* ── Internal helpers ──────────────────────────────────── */
    function _notifyOnline() {
        if (_debounceTimer) return;          // already scheduled
        _debounceTimer = setTimeout(() => {
            _debounceTimer = null;
            if (!navigator.onLine) return;   // browser still says offline – skip
            _isOnline = true;
            _isWeak   = false;

            // Tell Firebase to reconnect its WebSocket
            try { FlaynityDB.goOnline(); } catch (_) {}

            _onlineCallbacks.forEach(cb => { try { cb(); } catch (e) { console.error('[NetworkManager] online cb:', e); } });

            console.log('[NetworkManager] ✅ Online');
        }, DEBOUNCE_MS);
    }

    function _notifyOffline() {
        clearTimeout(_debounceTimer);
        _debounceTimer = null;
        if (!_isOnline) return;              // already offline – skip
        _isOnline = false;

        // Tell Firebase to stop retrying (saves battery / CPU)
        try { FlaynityDB.goOffline(); } catch (_) {}

        _offlineCallbacks.forEach(cb => { try { cb(); } catch (e) { console.error('[NetworkManager] offline cb:', e); } });

        console.log('[NetworkManager] ❌ Offline');
    }

    function _notifyWeak() {
        _isWeak = true;
        _weakCallbacks.forEach(cb => { try { cb(); } catch (e) {} });
        console.log('[NetworkManager] ⚠️ Weak network');
    }

    /* ── Browser events ────────────────────────────────────── */
    window.addEventListener('online',  () => _notifyOnline(),  { passive: true });
    window.addEventListener('offline', () => _notifyOffline(), { passive: true });

    /* ── Firebase .info/connected ──────────────────────────── */
    if (typeof FirebaseConnectionMonitor !== 'undefined') {
        FirebaseConnectionMonitor.onChange(connected => {
            if (connected) {
                _notifyOnline();
            } else if (!navigator.onLine) {
                _notifyOffline();
            }
        });
    }

    /* ── Public API ────────────────────────────────────────── */

    /** Subscribe to network-online events. */
    function onOnline(cb)  { _onlineCallbacks.add(cb); }
    /** Subscribe to network-offline events. */
    function onOffline(cb) { _offlineCallbacks.add(cb); }
    /** Subscribe to weak-network events. */
    function onWeak(cb)    { _weakCallbacks.add(cb); }

    function offOnline(cb)  { _onlineCallbacks.delete(cb); }
    function offOffline(cb) { _offlineCallbacks.delete(cb); }
    function offWeak(cb)    { _weakCallbacks.delete(cb); }

    /** Returns true if the device is currently online. */
    function isOnline()  { return _isOnline; }
    /** Returns true if the network is detected as weak. */
    function isWeak()    { return _isWeak; }

    return { onOnline, onOffline, onWeak, offOnline, offOffline, offWeak, isOnline, isWeak };
})();

/* ─────────────────────────────────────────────────────────────
   GLOBAL ENTRY POINTS  (called by MainActivity.java via evaluateJavascript)
   ───────────────────────────────────────────────────────────── */

/**
 * Called by Android ConnectivityManager.NetworkCallback.onAvailable()
 * and by the browser 'online' event (both paths converge here).
 *
 * DO NOT call location.reload() or webview.reload() here.
 */
window.FlaynityNetworkOnline = function () {
    if (!navigator.onLine) return;   // Android fired but browser disagrees – wait

    // Show a toast
    if (typeof showNotification === 'function') {
        showNotification('Network Restored! Syncing live data…', 'success');
    }

    // Hide any offline overlay
    const spinner = document.getElementById('network-spinner-overlay');
    if (spinner) spinner.style.display = 'none';

    // Sync pending offline likes
    if (typeof syncOfflineLikes === 'function') syncOfflineLikes();

    // Resume paused uploads
    if (typeof UploadManager !== 'undefined') UploadManager.resumeAll();

    // Full data refresh (no page reload)
    if (typeof SyncManager !== 'undefined') SyncManager.refreshEverything();

    // Resume any paused short video
    const activeVideo = document.querySelector('.short-slide video[src]');
    if (activeVideo && activeVideo.paused && activeVideo.readyState > 2) {
        activeVideo.play().catch(() => {});
    }
};

/**
 * Called by Android ConnectivityManager.NetworkCallback.onLost()
 * and by the browser 'offline' event.
 */
window.FlaynityNetworkOffline = function () {
    if (typeof showNotification === 'function') {
        showNotification('Offline Mode – showing cached content.', 'error');
    }

    // Pause active short video to save bandwidth
    const activeVideo = document.querySelector('.short-slide video[src]');
    if (activeVideo && !activeVideo.paused) activeVideo.pause();

    // Show skeletons on visible feed
    if (typeof renderAllSkeletons === 'function') renderAllSkeletons();
};

/**
 * Called by Android when signal strength drops below a threshold.
 * Optional – MainActivity can call this from onCapabilitiesChanged.
 */
window.FlaynityNetworkWeak = function () {
    if (typeof showNotification === 'function') {
        showNotification('Weak network detected – some content may load slowly.', 'error');
    }
};

/**
 * Called by MainActivity.onResume() to trigger a background refresh
 * when the app returns to the foreground.
 * Safe to call even if already refreshing (SyncManager guards it).
 */
window.FlaynityNativeRefresh = function () {
    if (!navigator.onLine) return;
    if (typeof SyncManager !== 'undefined') SyncManager.refreshEverything();
};

/* ── Export ─────────────────────────────────────────────────── */
window.NetworkManager = NetworkManager;
console.log('[NetworkManager] Ready. Online:', navigator.onLine);
