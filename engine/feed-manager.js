/**
 * ============================================================
 * FLAYNITY FEED MANAGER  v3.0
 * ============================================================
 * Manages:
 *   - In-memory stores for long videos, shorts, posts
 *   - Realtime Firebase listeners (via ListenerManager – no duplicates)
 *   - buildHomeFeed()  – deduplication, skeleton, category filter
 *   - buildShortsPage() – realtime, instant, dedupe, position memory
 *   - Comments & Profile update in realtime without manual refresh
 *   - Skeleton: shown on initial load / manual refresh / first startup;
 *     hidden immediately once Firebase data arrives
 *
 * NEVER calls location.reload() or webview.reload().
 * ============================================================
 */

'use strict';

const FeedManager = (() => {

    /* ── In-memory stores ───────────────────────────────────── */
    let _longVideos = [];
    let _shorts     = [];
    let _posts      = [];

    /* ── Deduplication sentinels ────────────────────────────── */
    let _prevLongsCount  = -1;
    let _prevShortsCount = -1;
    let _prevPostsCount  = -1;

    /* ── Channel live-UI binding registry ───────────────────── */
    const _boundChannelUIs = new Set();   // Set<userId>

    /* ── Public setters (called by SyncManager after snapshot) ─ */
    function setLongVideos(arr) {
        _longVideos = _dedupeById(arr).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        // Keep allAdminMovies in sync for legacy code
        window.allLongVideos     = _longVideos;
        window.allAdminMovies    = _longVideos;
    }
    function setShorts(arr) {
        _shorts = _dedupeById(arr).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        window.allShorts = _shorts;
    }
    function setPosts(arr) {
        _posts = _dedupeById(arr).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        window.allCommunityPosts = _posts;
    }

    function resetSentinels() {
        _prevLongsCount  = -1;
        _prevShortsCount = -1;
        _prevPostsCount  = -1;
        _boundChannelUIs.clear();
    }

    /* ── Realtime listeners ─────────────────────────────────── */
    function startRealtimeListeners() {
        _attachLongsListener();
        _attachShortsListener();
        _attachPostsListener();
        _attachSelfChannelListener();
        _attachSelfUserListener();
    }

    function _attachLongsListener() {
        ListenerManager.attach(
            'feed/long-videos',
            FlaynityDB.ref('admin_panel/movies/user_uploads'),
            'value',
            snap => {
                const data = snap.val();
                setLongVideos(data ? Object.values(data) : []);

                if (_longVideos.length !== _prevLongsCount) {
                    _prevLongsCount = _longVideos.length;
                    if (typeof buildHomeFeed === 'function') buildHomeFeed();
                } else {
                    // Lightweight in-place title update (no full rebuild)
                    _longVideos.forEach(v => {
                        const el = document.querySelector(`.long-video-feed-card[data-id="${v.id}"] .long-video-title`);
                        if (el) el.innerText = _escapeHTML(v.title);
                    });
                }
            }
        );
    }

    function _attachShortsListener() {
        ListenerManager.attach(
            'feed/shorts',
            FlaynityDB.ref('admin_panel/movies/shorts'),
            'value',
            snap => {
                const data = snap.val();
                const prevActiveId = _getActiveShortsId();
                setShorts(data ? Object.values(data) : []);

                if (_shorts.length !== _prevShortsCount) {
                    _prevShortsCount = _shorts.length;
                    if (typeof buildHomeFeed === 'function') buildHomeFeed();

                    const shortsTab = document.getElementById('shorts-tab');
                    if (shortsTab && shortsTab.classList.contains('active')) {
                        if (typeof buildShortsPage === 'function') buildShortsPage();
                        // Restore scroll position
                        if (prevActiveId) {
                            requestAnimationFrame(() => {
                                const slide = document.getElementById(`slide-short-${prevActiveId}`);
                                if (slide) slide.scrollIntoView({ block: 'start', behavior: 'auto' });
                            });
                        }
                    }
                } else {
                    // Lightweight in-place update
                    _shorts.forEach(s => {
                        const titleEl = document.querySelector(`#slide-short-${s.id} .short-title-text`);
                        if (titleEl) titleEl.innerText = s.title;
                        const thumbEl = document.querySelector(`.short-home-card-2col[data-id="${s.id}"] img`);
                        if (thumbEl) thumbEl.src = s.poster;
                    });
                }
            }
        );
    }

    function _attachPostsListener() {
        ListenerManager.attach(
            'feed/posts',
            FlaynityDB.ref('admin_panel/posts'),
            'value',
            snap => {
                const data = snap.val();
                setPosts(data ? Object.values(data) : []);

                if (_posts.length !== _prevPostsCount) {
                    _prevPostsCount = _posts.length;
                    if (typeof buildHomeFeed === 'function') buildHomeFeed();
                }
            }
        );
    }

    function _attachSelfChannelListener() {
        const user = AuthManager.currentUser();
        if (!user) return;

        ListenerManager.attach(
            `channel/self/${user.uid}`,
            FlaynityDB.ref(`channels/${user.uid}`),
            'value',
            snap => {
                const data = snap.val();
                window.currentChannelData = data;
                if (data) {
                    try { localStorage.setItem('flaynity_user_session_cache', JSON.stringify(data)); } catch (_) {}
                }
                const activeNav = document.querySelector('.nav-item.active');
                if (activeNav && activeNav.id === 'nav-you') {
                    if (typeof initYouTabUI === 'function') initYouTabUI();
                }
                if (typeof updateBottomNavAvatar === 'function') updateBottomNavAvatar();
            }
        );
    }

    function _attachSelfUserListener() {
        const user = AuthManager.currentUser();
        if (!user) return;

        ListenerManager.attach(
            `user/self/${user.uid}`,
            FlaynityDB.ref(`users/${user.uid}`),
            'value',
            snap => {
                const data = snap.val();
                const photoURL = data?.photoURL || user.photoURL || '';
                if (typeof renderUserAvatar === 'function') renderUserAvatar(photoURL, user.email);
            }
        );
    }

    /* ── Live channel UI binding ────────────────────────────── */
    /**
     * Attach a live listener for a channel's display data.
     * Idempotent – will not attach twice for the same userId.
     */
    function bindLiveChannelUI(userId) {
        if (!userId || _boundChannelUIs.has(userId)) return;
        if (!navigator.onLine) return;

        _boundChannelUIs.add(userId);

        ListenerManager.attach(
            `channel/live/${userId}`,
            FlaynityDB.ref(`channels/${userId}`),
            'value',
            snap => _updateChannelDOM(userId, snap.val())
        );
    }

    function _updateChannelDOM(userId, data) {
        if (!data) return;
        const name   = data.channelName || 'Flaynity User';
        const handle = data.handle      || 'handle';
        const avatar = data.avatarUrl   || '';

        document.querySelectorAll(`.live-username-${userId}`).forEach(el => { el.innerText = name; });
        document.querySelectorAll(`.live-handle-${userId}`).forEach(el => { el.innerText = '@' + handle; });
        document.querySelectorAll(`.live-avatar-${userId}`).forEach(el => {
            el.innerHTML = avatar
                ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : `<div style="width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--primary),#FF7A00);color:#fff;font-weight:800;font-size:0.9rem;">${name.charAt(0).toUpperCase()}</div>`;
        });
        document.querySelectorAll(`.live-disc-avatar-${userId}`).forEach(el => {
            if (avatar) el.innerHTML = `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        });
    }

    /* ── Post-reactions listener registry ───────────────────── */
    const _boundPostReactions = new Set();   // Set<postId>

    function registerPostReactionsListener(postId) {
        if (_boundPostReactions.has(postId)) return;
        _boundPostReactions.add(postId);

        ListenerManager.attach(
            `post-reactions/${postId}`,
            FlaynityDB.ref(`post_reactions/${postId}`),
            'value',
            snap => {
                if (typeof _handlePostReactionsUpdate === 'function') {
                    _handlePostReactionsUpdate(postId, snap.val() || {});
                }
            }
        );

        ListenerManager.attach(
            `post-comments/${postId}`,
            FlaynityDB.ref(`movie_comments/${postId}`),
            'value',
            snap => {
                const count = snap.val() ? Object.keys(snap.val()).length : 0;
                const el = document.getElementById(`post-total-comments-${postId}`);
                if (el) el.innerText = `${count} Comment${count === 1 ? '' : 's'}`;
            }
        );
    }

    /* ── Helpers ────────────────────────────────────────────── */
    function _dedupeById(arr) {
        if (!Array.isArray(arr)) return [];
        const seen = new Set();
        return arr.filter(item => {
            if (!item || !item.id) return false;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
    }

    function _getActiveShortsId() {
        const video = document.querySelector('.short-slide video[src]');
        return video ? video.closest('.short-slide')?.getAttribute('data-shortid') : null;
    }

    function _escapeHTML(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    }

    /* ── Getters (for legacy code) ──────────────────────────── */
    function getLongVideos() { return _longVideos; }
    function getShorts()     { return _shorts; }
    function getPosts()      { return _posts; }

    return {
        setLongVideos, setShorts, setPosts,
        getLongVideos, getShorts, getPosts,
        resetSentinels,
        startRealtimeListeners,
        bindLiveChannelUI,
        registerPostReactionsListener,
    };
})();

window.FeedManager = FeedManager;
console.log('[FeedManager] Ready.');
