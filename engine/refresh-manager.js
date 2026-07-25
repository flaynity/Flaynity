/**
 * ============================================================
 * FLAYNITY REFRESH MANAGER  v3.0
 * ============================================================
 * YouTube-style Pull-to-Refresh:
 *   - Only triggers at scroll top (window.scrollY === 0)
 *   - Minimum pull distance before triggering (90 px)
 *   - Single refresh at a time (no duplicates)
 *   - Waits for SyncManager.refreshEverything() to complete
 *   - Hides refresh indicator ONLY after Firebase success
 *   - No polling, no location.reload(), no webview.reload()
 * ============================================================
 */

'use strict';

const RefreshManager = (() => {

    /* ── State ──────────────────────────────────────────────── */
    let _touchStartY  = 0;
    let _touchStartX  = 0;
    let _touchMoveY   = 0;
    let _isPTRActive  = false;
    let _isRefreshing = false;

    const MIN_PULL_PX = 90;    // minimum drag distance to trigger refresh
    const DRAG_RATIO  = 0.45;  // resistance factor

    /* ── DOM refs (resolved lazily) ─────────────────────────── */
    function _indicator() { return document.getElementById('ptr-indicator'); }
    function _spinner()   { return document.getElementById('ptr-spinner'); }

    /* ── Eligibility check ──────────────────────────────────── */
    function _isPTRAllowed() {
        // Block if any modal / fullscreen page is open
        const openModals = document.querySelectorAll(
            '.fullscreen-page[style*="display: flex"],' +
            '.fullscreen-page[style*="display: block"],' +
            '.premium-download-modal[style*="display: flex"],' +
            '#full-movie-page[style*="display: block"],' +
            '#theme-popup-menu[style*="display: flex"],' +
            '#full-image-preview-overlay[style*="display: flex"]'
        );
        if (openModals.length > 0) return false;

        const activeNav = document.querySelector('.nav-item.active');
        if (!activeNav) return false;
        const tabId = activeNav.id.replace('nav-', '');

        // Shorts tab has its own scroll container – PTR not applicable
        if (tabId === 'shorts') return false;

        return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
    }

    /* ── Touch handlers ─────────────────────────────────────── */
    function _onTouchStart(e) {
        if (_isRefreshing) return;
        if (_isPTRAllowed()) {
            _touchStartY = e.touches[0].clientY;
            _touchStartX = e.touches[0].clientX;
            _touchMoveY  = _touchStartY;
            _isPTRActive = true;
        } else {
            _isPTRActive = false;
        }
    }

    function _onTouchMove(e) {
        if (!_isPTRActive || _isRefreshing) return;

        if (!_isPTRAllowed()) {
            _isPTRActive = false;
            _resetIndicator();
            return;
        }

        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const deltaY   = currentY - _touchStartY;
        const deltaX   = Math.abs(currentX - _touchStartX);

        if (deltaY > 20 && deltaY > deltaX * 1.5) {
            _touchMoveY = currentY;
            const pull  = (deltaY - 20) * DRAG_RATIO;
            const ind   = _indicator();
            const spin  = _spinner();
            if (ind) {
                ind.style.opacity   = Math.min(1, pull / 40);
                ind.style.transform = `translateX(-50%) translateY(${pull - 65}px)`;
            }
            if (spin) spin.style.transform = `rotate(${pull * 3}deg)`;
        } else if (deltaY < 0) {
            _isPTRActive = false;
            _resetIndicator();
        }
    }

    function _onTouchEnd() {
        if (!_isPTRActive || _isRefreshing) {
            _isPTRActive = false;
            return;
        }

        const deltaY = _touchMoveY - _touchStartY;
        _isPTRActive = false;

        if (deltaY > MIN_PULL_PX) {
            _triggerRefresh();
        } else {
            _resetIndicator();
        }

        _touchStartY = 0;
        _touchMoveY  = 0;
    }

    /* ── Refresh execution ──────────────────────────────────── */
    async function _triggerRefresh() {
        if (_isRefreshing) return;
        _isRefreshing = true;

        // Show spinning indicator
        const ind  = _indicator();
        const spin = _spinner();
        if (ind)  { ind.style.transform = 'translateX(-50%) translateY(20px)'; ind.style.opacity = '1'; }
        if (spin) spin.classList.add('ptr-spinning');

        if (typeof playUI === 'function') playUI('click');

        if (!navigator.onLine) {
            if (typeof showNotification === 'function') showNotification('Offline – cannot refresh.', 'error');
            _finishRefresh();
            return;
        }

        try {
            await SyncManager.refreshEverything();
            if (typeof showNotification === 'function') showNotification('Feed updated!', 'success');
        } catch (e) {
            console.error('[RefreshManager] PTR error:', e);
            if (typeof showNotification === 'function') showNotification('Refresh failed.', 'error');
        } finally {
            // Hide indicator only after Firebase data has arrived
            setTimeout(() => _finishRefresh(), 400);
        }
    }

    function _finishRefresh() {
        _resetIndicator();
        _isRefreshing = false;
    }

    function _resetIndicator() {
        const ind  = _indicator();
        const spin = _spinner();
        if (ind)  { ind.style.transform = 'translateX(-50%) translateY(-70px)'; ind.style.opacity = '0'; }
        if (spin) { spin.classList.remove('ptr-spinning'); spin.style.transform = ''; }
    }

    /* ── Init ───────────────────────────────────────────────── */
    function init() {
        document.addEventListener('touchstart', _onTouchStart, { passive: true });
        document.addEventListener('touchmove',  _onTouchMove,  { passive: true });
        document.addEventListener('touchend',   _onTouchEnd,   { passive: true });
        console.log('[RefreshManager] Pull-to-refresh initialized.');
    }

    /** Programmatically trigger a refresh (e.g. from a button). */
    async function manualRefresh() {
        if (_isRefreshing) return;
        await _triggerRefresh();
    }

    return { init, manualRefresh };
})();

window.RefreshManager = RefreshManager;

// Auto-init after DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RefreshManager.init());
} else {
    RefreshManager.init();
}

console.log('[RefreshManager] Module loaded.');
