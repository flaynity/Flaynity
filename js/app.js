/* Feels action icons (Like / Comment / Save / Share) - solid white SVG set */
window.FEELS_ICONS = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.6c-.5 0-1-.2-1.4-.6C6.100 17.400 2 13.900 2 9.300 2 6.100 4.500 3.600 7.600 3.600c1.800 0 3.500.9 4.400 2.300.9-1.400 2.600-2.300 4.400-2.300 3.100 0 5.600 2.500 5.600 5.700 0 4.600-4.100 8.100-8.600 11.700-.4.400-.9.600-1.400.6z"/></svg>',
  comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2.500C6.200 2.500 1.800 6.200 1.800 10.800c0 2.100.9 4 2.500 5.400-.1 1.500-.7 2.900-1.700 4.100 2.500-.2 4.500-1.100 5.800-2.300.9.200 1.800.3 2.800.3 5.800 0 10.200-3.700 10.200-8.500S17.800 2.500 12 2.500zM7.500 9.300a1.600 1.600 0 1 0 0 3.200 1.600 1.600 0 0 0 0-3.200zm4.500 0a1.600 1.600 0 1 0 0 3.200 1.600 1.600 0 0 0 0-3.200zm4.500 0a1.600 1.600 0 1 0 0 3.200 1.600 1.600 0 0 0 0-3.200z"/><path d="M2.600 20.300c1.300-.1 2.700-.6 3.800-1.400l-2.600-2.100c-.1 1.300-.6 2.500-1.200 3.500z" fill-opacity=".55"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.600 2.500h10.800A1.600 1.600 0 0 1 19 4.100v17.100a.5.500 0 0 1-.8.400L12 17.200l-6.200 4.400a.5.500 0 0 1-.8-.4V4.100A1.600 1.600 0 0 1 6.600 2.500z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.200 3.300l8.100 7.300a1.100 1.100 0 0 1 0 1.600l-8.100 7.300a.8.800 0 0 1-1.300-.6v-4.100c-5.100-.1-8.600 1.700-10.600 5.800-.1-6.600 3.400-11.200 10.600-11.900V3.900a.8.800 0 0 1 1.300-.6z"/></svg>'
};
/* Flaynity Modular Loader — serial page loading + offline cache */
// The WebView must never restore scroll on its own: AppNavigation saves/restores it (multi-step).
try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
// ===== BOOT GATE: never show Welcome / Log In while the saved login is still being checked =====
(function () {
    try { document.body.classList.add('auth-booting'); } catch (e) {}
    window.__flBootDone = function () {
        try { document.body.classList.remove('auth-booting'); } catch (e) {}
        if (window.__flBootTimer) { clearTimeout(window.__flBootTimer); window.__flBootTimer = null; }
    };
    window.__flWithTimeout = function (promise, ms) {
        return new Promise(function (resolve, reject) {
            const t = setTimeout(function () { const err = new Error('timeout'); err.__flTimeout = true; reject(err); }, ms);
            Promise.resolve(promise).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
        });
    };
    if (typeof window.flCheckLiveInternet !== 'function') {
        window.flCheckLiveInternet = function (timeoutMs) {
            var ms = timeoutMs || 3500;
            if (!navigator.onLine) { window.__flaynityLiveOnline = false; return Promise.resolve(false); }
            var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var timer = setTimeout(function () { if (ctrl) try { ctrl.abort(); } catch (e) {} }, ms);
            return fetch('https://www.gstatic.com/generate_204?_=' + Date.now(), {
                method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined
            }).then(function () {
                clearTimeout(timer); window.__flaynityLiveOnline = true; return true;
            }).catch(function () {
                clearTimeout(timer); window.__flaynityLiveOnline = false; return false;
            });
        };
    }

    // HOME READY: the startup splash stays on screen until the Home feed really has content (when online).
    window.__flaynityHomeReady = false;
    window.__flInitialFeedFetched = false;
    window.__flHomeHasContent = function () {
        const c = document.getElementById('home-feed-container');
        if (!c || !c.children.length) return false;
        if (c.querySelector('.offline-home-skeleton')) return false;
        return true;
    };
    window.__flWatchHomeReady = function () {
        if (window.__flaynityHomeReady || window.__flHomeWatching) return;
        window.__flHomeWatching = true;
        let tries = 0;
        const finish = function () {
            window.__flaynityHomeReady = true; window.__flHomeWatching = false;
            try { if (typeof window.__flaynityHideStartupSplash === 'function') window.__flaynityHideStartupSplash(); } catch (e) {}
        };
        const iv = setInterval(function () {
            tries++;
            if (window.__flaynityLiveOnline === false) { clearInterval(iv); finish(); return; }
            if (window.__flHomeHasContent()) { clearInterval(iv); setTimeout(finish, 180); return; }
            if (window.__flInitialFeedFetched && tries >= 15) {
                try { buildHomeFeed(); } catch (e) {}
                if (window.__flHomeHasContent() || tries >= 25) { clearInterval(iv); finish(); return; }
            }
            // Data arrived but Home still shows nothing: draw the feed again.
            if (tries % 8 === 0) {
                try {
                    if ((allLongVideos && allLongVideos.length) || (allFeels && allFeels.length) || (allCommunityPosts && allCommunityPosts.length)) {
                        previousLongsCount = -1; previousFeelsCount = -1; previousPostsCount = -1;
                        buildHomeFeed();
                    } else if (tries === 16 && typeof SyncManager !== 'undefined' && !SyncManager.isRefreshing) {
                        SyncManager.refreshEverything({ force: true });
                    }
                } catch (e) {}
            }
            if (tries >= 140) { clearInterval(iv); finish(); }   // ~14s max, never stuck
        }, 100);
    };
    window.__flBootTimer = setTimeout(function () {
        window.__flBootTimer = null;
        try {
            const u = (typeof auth !== 'undefined') ? auth.currentUser : null;
            if (u) {
                const a = document.getElementById('auth-screen'), s = document.getElementById('app-screen');
                if (a) a.style.display = 'none';
                if (s) s.style.display = 'block';
                document.body.classList.remove('auth-active');
                if (window.__flaynityLiveOnline !== false && typeof SyncManager !== 'undefined' && !SyncManager.isRefreshing) {
                    SyncManager.refreshEverything({ force: true });
                }
            }
        } catch (e) {}
        if (window.__flaynityLiveOnline === false || window.__flHomeHasContent()) {
            window.__flaynityHomeReady = true;
        }
        window.__flBootDone();
    }, 11500);
})();
(async function () {
    const pageFiles = [["home","pages/home.html"],["feels","pages/feels.html"],["posts","pages/posts.html"],["upload","pages/upload.html"],["discover","pages/discover.html"],["you","pages/you.html"],["analytics","pages/analytics.html"]];
    const CACHE_PREFIX = "flaynity-page-cache-v1:";

    function addPageStyle(doc, name) {
        const style = doc.querySelector("style");
        if (!style) return;
        const css = document.createElement("style");
        css.setAttribute("data-flaynity-page-css", name);
        css.textContent = style.textContent;
        document.head.appendChild(css);
    }

    async function getPageSource(name, url) {
        try {
            const response = await fetch(url, { cache: "no-store" });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const text = await response.text();
            try { localStorage.setItem(CACHE_PREFIX + name, text); } catch (e) {}
            return text;
        } catch (error) {
            try {
                const cached = localStorage.getItem(CACHE_PREFIX + name);
                if (cached) return cached;
            } catch (e) {}
            throw new Error("Page unavailable offline: " + url);
        }
    }

    // Pages listed here are single-file pages (HTML + CSS + JS). Their inline
    // <script> is run once, right after the page is mounted. (Scripts parsed by
    // DOMParser never execute on their own.)
    const SELF_SCRIPTED_PAGES = new Set(["home","posts","analytics"]);
    let __resolveHomeScriptsReady = null;
    window.__flHomeScriptsReady = new Promise(function (resolve) { __resolveHomeScriptsReady = resolve; });
    const pendingPageScripts = {};

    async function loadPage(name, url) {
        const text = await getPageSource(name, url);
        const doc = new DOMParser().parseFromString(text, "text/html");
        addPageStyle(doc, name);
        const nodes = Array.from(doc.body.children).map(el => el.cloneNode(true));
        if (SELF_SCRIPTED_PAGES.has(name)) {
            pendingPageScripts[name] = Array.from(doc.querySelectorAll("script")).map(s => s.textContent);
            return nodes.filter(n => n.tagName !== "SCRIPT");
        }
        return nodes;
    }

    function runPageScripts(name) {
        const scripts = pendingPageScripts[name] || [];
        delete pendingPageScripts[name];
        scripts.forEach(code => {
            try {
                const el = document.createElement("script");
                el.setAttribute("data-flaynity-page-js", name);
                el.textContent = code;
                document.body.appendChild(el);
                el.remove();
            } catch (e) { console.error("Flaynity page script error (" + name + "):", e); }
        });
    }

    function showOfflineCachedApp(forceOffline) {
        if (!forceOffline && navigator.onLine && window.__flaynityLiveOnline !== false) return;
        let cachedSession = null;
        try { cachedSession = localStorage.getItem('flaynity_user_session_cache'); } catch (e) {}
        if (!cachedSession) return;
        const authScr = document.getElementById('auth-screen');
        const appScr = document.getElementById('app-screen');
        if (authScr) authScr.style.display = 'none';
        if (appScr) appScr.style.display = 'block';
        document.body.classList.remove('auth-active');
        window.__flaynityOfflineSessionActive = true;
        if (window.__flBootDone) window.__flBootDone();
        try { window.__flWatchHomeReady && window.__flWatchHomeReady(); } catch (e) {}
        try { firebase.database().goOffline(); } catch (e) {}
        try { if (typeof renderAllSkeletons === 'function') renderAllSkeletons(); } catch (e) {}
        try { setTimeout(() => { typeof flEnsureNavYouIcon === 'function' && flEnsureNavYouIcon(); }, 400); } catch (e) {}
    }
    try {
        if (window.__flaynityLiveCheckPromise && typeof window.__flaynityLiveCheckPromise.then === 'function') {
            window.__flaynityLiveCheckPromise.then(function (isOnline) {
                if (!isOnline) showOfflineCachedApp(true);
                else { try { firebase.database().goOnline(); } catch (e) {} }
            });
        }
    } catch (e) {}

    try {
        const app = document.getElementById("app");
        if (!app) throw new Error("#app not found");

        // Load Home first so the first app screen becomes visible immediately.
        // The remaining pages are loaded in the background after Home is mounted.
        const homeNodes = await loadPage(pageFiles[0][0], pageFiles[0][1]);

        const appScreen = document.createElement("div");
        appScreen.id = "app-screen";
        const startupIds = new Set(["startupSound","toast-container","network-spinner-overlay","auth-screen","vf-legal-page","fl-create-channel","flcc-sheet-backdrop","flcc-launch-overlay","fl-email-verify-overlay","fl-auth-welcome-overlay"]);

        for (const node of homeNodes) {
            if (node.id && startupIds.has(node.id)) app.appendChild(node);
            else appScreen.appendChild(node);
        }
        app.appendChild(appScreen);
        runPageScripts("home");
        if (typeof __resolveHomeScriptsReady === "function") __resolveHomeScriptsReady();

        document.querySelectorAll(".tab-content").forEach(el => el.classList.toggle("active", el.id === "home-tab"));
        const homeTab = document.getElementById("home-tab");
        if (homeTab) homeTab.classList.add("active");

        showOfflineCachedApp();

        // Let Home render before any permission dialog can appear.
        window.dispatchEvent(new Event('flaynity-dom-ready'));

        setTimeout(() => {
            if (window.AndroidBridge && typeof window.AndroidBridge.requestNotificationPermission === 'function') {
                window.AndroidBridge.requestNotificationPermission();
            }
        }, 1800);

        // Load the other tabs without blocking the initial Home screen.
        (async function loadRemainingPagesInBackground() {
            try {
                const remaining = await Promise.all(
                    pageFiles.slice(1).map(async ([name, url]) => [name, await loadPage(name, url)])
                );
                for (const [pageName, nodes] of remaining) {
                    for (const node of nodes) appScreen.appendChild(node);
                    runPageScripts(pageName);
                }
                window.dispatchEvent(new Event('flaynity-pages-ready'));
            } catch (e) {
                console.error("Flaynity background page loading error:", e);
            }
        })();
    } catch (e) {
        console.error("Flaynity page loader error:", e);
        const app = document.getElementById("app");
        if (app) app.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif">Unable to load Flaynity. Please reconnect once to prepare offline mode.</div>';
    }
})();

function __flaynityReady(fn) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
        fn();
    }
}


/* Feed-synced bottom navigation.
   The Home feed uses the document/window as its main scroller. On mobile,
   touchmove is also tracked so the navigation moves in real time with the
   user's finger even when the browser delays a scroll event. */
(function () {
    "use strict";

    var state = { nav:null, lastY:0, offset:0, height:48, frame:0, touchY:null, touchActive:false };

    function getScrollY() {
        return Math.max(
            Number(window.scrollY || 0),
            Number(document.documentElement && document.documentElement.scrollTop || 0),
            Number(document.body && document.body.scrollTop || 0)
        );
    }

    function isHomeTabActive() {
        var active = document.querySelector(".nav-item.active");
        if (active && active.id) return active.id === "nav-home" || active.id === "nav-posts";
        return true;
    }

    function findNav() {
        var nav = document.querySelector("#app-screen .bottom-nav") ||
                  document.querySelector(".bottom-nav");
        if (!nav) return null;
        if (state.nav !== nav) {
            state.nav = nav;
            state.height = Math.max(1, nav.getBoundingClientRect().height || 48);
            nav.style.willChange = "transform";
            nav.style.transition = "none";
        }
        return nav;
    }

    function render() {
        state.frame = 0;
        var nav = findNav();
        if (!nav) return;
        var y = Math.max(0, Math.min(state.height, state.offset));
        nav.style.webkitTransform = "translate3d(0," + y.toFixed(2) + "px,0)";
        nav.style.transform = "translate3d(0," + y.toFixed(2) + "px,0)";
    }

    function scheduleRender() {
        if (!state.frame) state.frame = window.requestAnimationFrame(render);
    }

    function moveBy(delta) {
        if (!isFinite(delta) || Math.abs(delta) < 0.01) return;
        state.offset = Math.max(0, Math.min(state.height, state.offset + delta));
        scheduleRender();
    }

    function syncFromScroll() {
        var nav = findNav();
        var y = getScrollY();
        if (!nav) { state.lastY = y; return; }

        // Only Home and Posts are allowed to move the bottom navigation. All other tabs
        // keep it locked at its normal position regardless of page scrolling.
        if (!isHomeTabActive()) {
            state.offset = 0;
            state.lastY = y;
            scheduleRender();
            return;
        }

        var delta = y - state.lastY;
        if (Math.abs(delta) >= 0.01) moveBy(delta);

        if (y <= 0) {
            state.offset = 0;
            scheduleRender();
        }
        state.lastY = y;
    }

    function onTouchStart(e) {
        if (!e.touches || !e.touches.length) return;
        if (!isHomeTabActive()) {
            state.touchActive = false;
            state.touchY = null;
            state.offset = 0;
            state.lastY = getScrollY();
            scheduleRender();
            return;
        }
        state.touchActive = true;
        state.touchY = e.touches[0].clientY;
        state.lastY = getScrollY();
    }

    function onTouchMove(e) {
        if (!isHomeTabActive()) {
            state.touchActive = false;
            state.touchY = null;
            state.offset = 0;
            state.lastY = getScrollY();
            scheduleRender();
            return;
        }
        if (!state.touchActive || !e.touches || !e.touches.length) return;
        var currentY = e.touches[0].clientY;
        if (state.touchY === null) { state.touchY = currentY; return; }

        // Finger up = feed down, so the nav follows downward by the same distance.
        var delta = state.touchY - currentY;
        if (Math.abs(delta) >= 0.01) {
            moveBy(delta);
            state.touchY = currentY;
        }

        // Avoid applying the same touch movement twice when scroll fires.
        state.lastY = getScrollY();
    }

    function onTouchEnd() {
        state.touchActive = false;
        state.touchY = null;
        state.lastY = getScrollY();
    }

    function resetForPage() {
        state.nav = null;
        state.offset = 0;
        state.touchY = null;
        state.touchActive = false;
        state.lastY = getScrollY();
        if (findNav()) scheduleRender();
    }

    function start() {
        state.lastY = getScrollY();
        window.addEventListener("scroll", syncFromScroll, { passive:true });
        document.addEventListener("touchstart", onTouchStart, { passive:true });
        document.addEventListener("touchmove", onTouchMove, { passive:true });
        document.addEventListener("touchend", onTouchEnd, { passive:true });
        document.addEventListener("touchcancel", onTouchEnd, { passive:true });

        window.addEventListener("resize", function() {
            var nav = findNav();
            if (nav) {
                state.height = Math.max(1, nav.getBoundingClientRect().height || 48);
                state.offset = Math.max(0, Math.min(state.offset, state.height));
                scheduleRender();
            }
        }, { passive:true });

        window.addEventListener("flaynity-dom-ready", resetForPage);
        window.addEventListener("hashchange", resetForPage);
        // Tab changes must immediately unlock/lock the navigation state.
        window.addEventListener("flaynity-tab-changed", resetForPage);

        var observer = new MutationObserver(function() {
            if (!state.nav || !document.documentElement.contains(state.nav)) resetForPage();
        });
        if (document.body) observer.observe(document.body, {childList:true, subtree:true});
    }

    __flaynityReady(start);
})();

(function() {
    try {
        let pref = localStorage.getItem('flaynity-theme-pref') || 'light';
        document.documentElement.setAttribute('data-theme', pref);
        try { if (window.AndroidBridge && typeof window.AndroidBridge.setAppTheme === 'function') window.AndroidBridge.setAppTheme(pref); } catch (e2) {}
    } catch (e) {}
})();


// =========================================================
// BOTTOM NAV "YOU" ICON — always visible (online + offline)
// Offline এ remote avatar URL লোড হয় না => আগে আইকন ফাঁকা হয়ে যেত।
// এখন: cached avatar (data URL) -> না থাকলে/ভাঙলে default You আইকন।
// =========================================================
const FL_NAV_YOU_SVG = '<svg class="nav-icon-svg icon-unselected" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12"></circle><circle cx="16" cy="12" r="3.2"></circle><path d="M10 23c1.3-3.2 3.2-4.7 6-4.7s4.7 1.5 6 4.7"></path></svg>';

function flNavCachedAvatar() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf('flaynity_cached_channel_avatar:') === 0) {
                const v = localStorage.getItem(k);
                if (v && v.indexOf('data:image/') === 0) return v;
            }
        }
    } catch (e) {}
    return '';
}

function flAvatarFromChannel(d) {
    if (!d) return '';
    return d.avatarUrl || d.channelImageUrl || d.profileImageUrl || d.photoURL || d.photoUrl || d.imageUrl || '';
}

function flNavSessionAvatarUrl() {
    try {
        return flAvatarFromChannel(JSON.parse(localStorage.getItem('flaynity_user_session_cache') || 'null'));
    } catch (e) { return ''; }
}

function flNavChannelAvatarUrl() {
    try {
        if (typeof currentChannelData !== 'undefined' && currentChannelData) {
            const u = flAvatarFromChannel(currentChannelData);
            if (u) return u;
        }
    } catch (e) {}
    return flNavSessionAvatarUrl();
}

// Channel image => localStorage এ ডাউনলোড হয়ে থাকে (Online + Offline দুই জায়গায় একই ছবি)।
function flNavStoredAvatar() {
    try { const v = localStorage.getItem('flaynity_nav_avatar_data'); return (v && v.indexOf('data:image/') === 0) ? v : ''; } catch (e) { return ''; }
}
function flNavStoredSrc() {
    try { return localStorage.getItem('flaynity_nav_avatar_src') || ''; } catch (e) { return ''; }
}
let _flNavDl = '';
function flCacheNavAvatar(url) {
    if (!url || typeof url !== 'string') return;
    const save = (dataUrl) => {
        try {
            localStorage.setItem('flaynity_nav_avatar_data', dataUrl);
            localStorage.setItem('flaynity_nav_avatar_src', url);
        } catch (e) { try { localStorage.removeItem('flaynity_nav_avatar_data'); localStorage.removeItem('flaynity_nav_avatar_src'); } catch (e2) {} }
        try { flSetNavAvatar(url); } catch (e) {}
    };
    if (/^data:image\//i.test(url)) { save(url); return; }
    if (!navigator.onLine) return;
    if (flNavStoredSrc() === url && flNavStoredAvatar()) return;
    if (_flNavDl === url) return;
    _flNavDl = url;
    const viaCanvas = () => new Promise((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => {
            try {
                const w = im.naturalWidth, h = im.naturalHeight;
                if (!w || !h) throw new Error('size');
                const sc = Math.min(1, 240 / Math.max(w, h));
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
                c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', 0.88));
            } catch (e) { reject(e); }
        };
        im.onerror = () => reject(new Error('load'));
        im.src = url + (url.indexOf('?') > -1 ? '&' : '?') + 'flnav=1';
    });
    fetch(url, { method: 'GET', mode: 'cors', cache: 'force-cache' })
        .then(r => { if (!r.ok) throw new Error('http'); return r.blob(); })
        .then(blob => {
            if (!blob || !blob.type || blob.type.indexOf('image/') !== 0) throw new Error('type');
            return __flBlobToScaledDataUrl(blob, 240, blob.type === 'image/png' ? 'image/png' : 'image/jpeg');
        })
        .catch(() => viaCanvas())
        .then(d => { if (typeof d === 'string' && d.indexOf('data:image/') === 0) save(d); })
        .catch(() => {})
        .then(() => { if (_flNavDl === url) _flNavDl = ''; });
}

function flSetNavDefaultIcon(box) {
    box = box || document.getElementById('nav-avatar-img');
    if (box) box.innerHTML = FL_NAV_YOU_SVG;
}

function flSetNavAvatar(url) {
    const box = document.getElementById('nav-avatar-img');
    if (!box) return;
    const stored = flNavStoredAvatar(), storedSrc = flNavStoredSrc();
    let src = '';
    if (!navigator.onLine) src = stored || flNavCachedAvatar() || url || '';
    else if (url && stored && url === storedSrc) src = stored;
    else src = url || stored || flNavCachedAvatar() || '';
    if (!src) { flSetNavDefaultIcon(box); return; }
    const cur = box.querySelector('img');
    if (!(cur && cur.dataset.src === src && !(cur.complete && cur.naturalWidth === 0))) {
        const img = new Image();
        img.alt = '';
        img.dataset.src = src;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        let tried = false;
        img.onerror = function () {
            const c = flNavStoredAvatar() || flNavCachedAvatar();
            if (!tried && c && img.src !== c) { tried = true; img.dataset.src = c; img.src = c; return; }
            flSetNavDefaultIcon(box);
        };
        img.src = src;
        box.innerHTML = '';
        box.appendChild(img);
    }
    // নতুন/বদলানো ছবি হলে সঙ্গে সঙ্গে localStorage এ ডাউনলোড
    if (url && navigator.onLine && url !== storedSrc) flCacheNavAvatar(url);
}

// Safety net: কোনো কারণে You আইকন ফাঁকা/ভাঙা থাকলে default আইকন ফিরিয়ে আনে।
function flEnsureNavYouIcon() {
    const box = document.getElementById('nav-avatar-img');
    if (!box) return;
    const img = box.querySelector('img');
    if (img) {
        if (img.complete && img.naturalWidth === 0) {
            const c = flNavCachedAvatar();
            if (c && img.src !== c) img.src = c; else flSetNavDefaultIcon(box);
        }
        return;
    }
    if (box.querySelector('svg') || (box.firstElementChild && box.textContent.trim())) return;
    flSetNavDefaultIcon(box);
}
(function () {
    const run = () => { try { flEnsureNavYouIcon(); } catch (e) {} };
    window.addEventListener('offline', () => { setTimeout(run, 50); setTimeout(run, 600); });
    window.addEventListener('online', () => {
        [300, 1500, 4000].forEach(t => setTimeout(() => {
            try {
                const u = flNavChannelAvatarUrl();
                if (u) { flSetNavAvatar(u); flCacheNavAvatar(u); }
                else if (typeof auth !== 'undefined' && auth.currentUser && typeof updateBottomNavAvatar === 'function') updateBottomNavAvatar();
                run();
            } catch (e) {}
        }, t));
    });
    window.addEventListener('flaynity-dom-ready', () => { [150, 700, 1800, 4000].forEach(t => setTimeout(run, t)); });
    window.addEventListener('flaynity-pages-ready', run);
})();

(function() {
    try {
        let cachedSession = localStorage.getItem('flaynity_user_session_cache');
        if (cachedSession) {
            let data = JSON.parse(cachedSession);
            __flaynityReady(function() {
                let fullname = document.getElementById('you-fullname-txt');
                let email = document.getElementById('you-email-txt');
                let avatarLarge = document.getElementById('you-avatar-large');
                let avatarNav = document.getElementById('nav-avatar-img');
                if (fullname) fullname.innerText = data.channelName || data.gmailName || "Flaynity User";
                if (email) email.innerText = "@" + (data.handle || "handle");
                if (avatarLarge) {
                    if (data.avatarUrl) avatarLarge.innerHTML = `<img src="${data.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">`;
                    else avatarLarge.innerHTML = (data.channelName || "F").charAt(0).toUpperCase();
                }
                if (avatarNav) {
                    const _bu = flAvatarFromChannel(data);
                    if (_bu || flNavStoredAvatar()) flSetNavAvatar(_bu);
                    else flEnsureNavYouIcon();
                }
            });
        }
    } catch (e) {}
})();

// =========================================================
// YOUTUBE-STYLE ANIMATED SKELETON GENERATORS
// =========================================================
function getHomeSkeletonHTML() {
    return `
        <div class="offline-home-skeleton">
            <div class="offline-video-skeleton">
                <div class="skel-box" style="width:100%; aspect-ratio:16/9; border-radius:16px;"></div>
                <div class="offline-video-meta">
                    <div class="skel-box" style="width:40px; height:40px; border-radius:50%; flex-shrink:0;"></div>
                    <div class="offline-video-lines">
                        <div class="skel-box" style="width:85%; height:16px; border-radius:4px;"></div>
                        <div class="skel-box" style="width:50%; height:12px; border-radius:4px;"></div>
                    </div>
                </div>
            </div>

            <div class="offline-feels-skeleton">
                <div class="offline-feels-heading">
                    <div class="skel-box" style="width:20px; height:20px; border-radius:4px;"></div>
                    <div class="skel-box" style="width:80px; height:18px; border-radius:4px;"></div>
                </div>
                <div class="offline-feels-grid">
                    ${[1,2].map(() => `
                        <div class="offline-short-card">
                            <div class="skel-box" style="width:100%; aspect-ratio:2/3; border-radius:12px;"></div>
                            <div class="offline-short-meta">
                                <div class="skel-box" style="width:28px; height:28px; border-radius:50%; flex-shrink:0;"></div>
                                <div class="offline-short-lines">
                                    <div class="skel-box" style="width:90%; height:12px; border-radius:3px;"></div>
                                    <div class="skel-box" style="width:50%; height:10px; border-radius:3px;"></div>
                                </div>
                            </div>
                        </div>`).join('')}
                </div>
            </div>

            <div class="offline-video-skeleton" style="margin-top:8px;">
                <div class="skel-box" style="width:100%; aspect-ratio:16/9; border-radius:16px;"></div>
                <div class="offline-video-meta">
                    <div class="skel-box" style="width:40px; height:40px; border-radius:50%; flex-shrink:0;"></div>
                    <div class="offline-video-lines">
                        <div class="skel-box" style="width:75%; height:16px; border-radius:4px;"></div>
                        <div class="skel-box" style="width:45%; height:12px; border-radius:4px;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getFeelsSkeletonHTML() {
    return `
        <div class="offline-feels-screen">
            <div class="skel-box" style="width:100%; height:100%; border-radius:0;"></div>
            <div class="offline-feels-actions">
                <div class="skel-box" style="width:44px; height:44px; border-radius:50%;"></div>
                <div class="skel-box" style="width:44px; height:44px; border-radius:50%;"></div>
                <div class="skel-box" style="width:44px; height:44px; border-radius:50%;"></div>
                <div class="skel-box" style="width:40px; height:40px; border-radius:50%;"></div>
            </div>
            <div class="offline-feels-info">
                <div class="offline-feels-user">
                    <div class="skel-box" style="width:36px; height:36px; border-radius:50%; flex-shrink:0;"></div>
                    <div class="skel-box" style="width:110px; height:14px; border-radius:4px;"></div>
                </div>
                <div class="skel-box" style="width:80%; height:16px; border-radius:4px;"></div>
                <div class="skel-box" style="width:50%; height:12px; border-radius:4px;"></div>
            </div>
        </div>
    `;
}

function getYouSkeletonHTML() {
    return `
        <div style="display: flex; flex-direction: column; gap: 20px; margin-top: 15px;">
            <div style="background: var(--surface); border: 1px solid var(--border-color); border-radius: 24px; padding: 24px;">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div class="skel-box" style="width: 80px; height: 80px; border-radius: 50%;"></div>
                    <div style="display: flex; flex-direction: column; gap: 8px; flex: 1;">
                        <div class="skel-box" style="width: 60%; height: 20px; border-radius: 4px;"></div>
                        <div class="skel-box" style="width: 40%; height: 14px; border-radius: 4px;"></div>
                    </div>
                </div>
                <div style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 20px;">
                    <div class="skel-box" style="width: 100%; height: 48px; border-radius: 20px;"></div>
                </div>
            </div>
            <div style="background: var(--surface); border: 1px solid var(--border-color); border-radius: 24px; padding: 8px;">
                <div style="padding: 16px; display: flex; gap: 16px; align-items: center; border-bottom: 1px solid var(--border-color);">
                    <div class="skel-box" style="width: 24px; height: 24px; border-radius: 50%;"></div>
                    <div class="skel-box" style="width: 40%; height: 16px; border-radius: 4px;"></div>
                </div>
                <div style="padding: 16px; display: flex; gap: 16px; align-items: center; border-bottom: 1px solid var(--border-color);">
                    <div class="skel-box" style="width: 24px; height: 24px; border-radius: 50%;"></div>
                    <div class="skel-box" style="width: 35%; height: 16px; border-radius: 4px;"></div>
                </div>
                <div style="padding: 16px; display: flex; gap: 16px; align-items: center;">
                    <div class="skel-box" style="width: 24px; height: 24px; border-radius: 50%;"></div>
                    <div class="skel-box" style="width: 30%; height: 16px; border-radius: 4px;"></div>
                </div>
            </div>
        </div>
    `;
}

function renderAllSkeletons() {
    const home = document.getElementById('home-feed-container');
    const feels = document.getElementById('feels-swiper-container');
    const youBox = document.getElementById('channel-action-box');

    if (home) {
        home.classList.add('offline-skeleton-active');
        home.style.width = '100%';
        home.style.minWidth = '0';
        home.style.minHeight = 'calc(100vh - 82px)';
        home.style.boxSizing = 'border-box';
        home.style.overflow = 'visible';
        home.innerHTML = getHomeSkeletonHTML();
    }
    if (feels) feels.innerHTML = getFeelsSkeletonHTML();
    if (youBox) {
        youBox.innerHTML = `<div class="skel-box" style="width: 100%; height: 48px; border-radius: 20px;"></div>`;
    }
}

// Render the Home skeleton immediately when the cached app is opened offline.
// The initial offline boot does not pass through a tab change, so Home's
// header/category layout must be synchronized before the skeleton is measured.
// Otherwise Android WebView can calculate the first skeleton layout in the
// pre-navigation state and correct it only after the user taps a control.
function stabilizeInitialOfflineHomeSkeleton() {
    if (navigator.onLine) return;

    try {
        if (typeof adjustHeaderForActiveTab === 'function') {
            adjustHeaderForActiveTab('home');
        }
    } catch (e) {}

    try { window.scrollTo(0, 0); } catch (e) {}

    // Wait for the visible app layout, then render on two frames so WebView has
    // the final viewport width/height before resolving aspect-ratio skeletons.
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            renderAllSkeletons();
            try {
                const home = document.getElementById('home-feed-container');
                if (home) void home.offsetHeight;
            } catch (e) {}
        });
    });
}

window.addEventListener('flaynity-dom-ready', stabilizeInitialOfflineHomeSkeleton, { once: true });

// =========================================
// STATUS BAR ICON COLOUR (follows the REAL colour behind the status bar, page by page)
// Dark page behind the status bar -> white icons | Light page -> black icons
// =========================================
(function () {
    var lastSent = '';

    function parseColor(c) {
        var m = c && c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
        if (p.length < 3) return null;
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }

    function themeFallbackRGB() {
        var t = document.documentElement.getAttribute('data-theme') || 'light';
        return t === 'dark' ? { r: 15, g: 15, b: 15 } : { r: 255, g: 255, b: 255 };
    }

    function detectTone() {
        try {
            var x = Math.floor(window.innerWidth / 2);
            var stack = document.elementsFromPoint(x, 3) || [];
            var accR = 0, accG = 0, accB = 0, accA = 0;
            for (var i = 0; i < stack.length && accA < 0.99; i++) {
                var el = stack[i];
                var tag = (el.tagName || '').toUpperCase();
                if (tag === 'VIDEO' || tag === 'CANVAS') {
                    // video / canvas at the very top = treated as dark
                    var w = (1 - accA);
                    accR += 0 * w; accG += 0 * w; accB += 0 * w; accA = 1;
                    break;
                }
                var c = parseColor(getComputedStyle(el).backgroundColor);
                if (!c || c.a <= 0) continue;
                var contrib = c.a * (1 - accA);
                accR += c.r * contrib; accG += c.g * contrib; accB += c.b * contrib;
                accA += contrib;
            }
            if (accA < 0.99) {
                var f = themeFallbackRGB();
                var rest = 1 - accA;
                accR += f.r * rest; accG += f.g * rest; accB += f.b * rest;
            }
            var lum = (0.299 * accR + 0.587 * accG + 0.114 * accB) / 255;
            return lum < 0.5 ? 'dark' : 'light';
        } catch (e) {
            return (document.documentElement.getAttribute('data-theme') === 'dark') ? 'dark' : 'light';
        }
    }

    function update() {
        if (document.hidden) return;
        var tone = detectTone();
        if (tone === lastSent) return;
        lastSent = tone;
        try {
            if (window.AndroidBridge && typeof window.AndroidBridge.setStatusBarTheme === 'function') {
                window.AndroidBridge.setStatusBarTheme(tone);
            }
        } catch (e) {}
    }

    window.__flaynityUpdateStatusBar = update;
    setInterval(update, 300);
    window.addEventListener('flaynity-dom-ready', update);
    window.addEventListener('flaynity-pages-ready', update);
    document.addEventListener('visibilitychange', function () { lastSent = ''; update(); });
    window.addEventListener('focus', function () { lastSent = ''; update(); });
})();

// =========================================
// AUTOMATIC & MANUAL THEME ENGINE
// =========================================
function applyTheme() {
    let pref = localStorage.getItem('flaynity-theme-pref') || 'light';
    document.documentElement.setAttribute('data-theme', pref);
    // tell Android the REAL app theme (ad details sheet follows it)
    try { if (window.AndroidBridge && typeof window.AndroidBridge.setAppTheme === 'function') window.AndroidBridge.setAppTheme(pref); } catch (e) {}
    try { if (typeof window.__flaynityUpdateStatusBar === 'function') { window.__flaynityUpdateStatusBar(); setTimeout(window.__flaynityUpdateStatusBar, 350); } } catch (e) {}
    
    const themeBtns = document.querySelectorAll('.appbar-theme-btn');
    themeBtns.forEach(btn => {
        if (pref === 'light') {
            btn.innerHTML = `<i class="fas fa-sun" style="color: #FFB300;"></i>`;
        } else if (pref === 'dark') {
            btn.innerHTML = `<i class="fas fa-moon" style="color: #FF2E55;"></i>`;
        }
    });

    document.querySelectorAll('.theme-menu-item').forEach(item => {
        if (item.getAttribute('data-theme-val') === pref) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function openThemePopupMenu() {
    playUI('click');
    AppNavigation.pushModal('theme-popup-menu');
}

function selectThemeVal(val) {
    playUI('click');
    localStorage.setItem('flaynity-theme-pref', val);
    applyTheme();
    showNotification(`Theme: ${val.toUpperCase()}`, "success");
    
    const current = AppNavigation.current();
    if (current && current.id === 'theme-popup-menu') {
        AppNavigation.pop(); 
    }
}

__flaynityReady(function() {
    applyTheme();
    

    // Startup splash timing is controlled from index.html so it starts immediately
    // and cannot appear late or disappear before the full 3.5-second duration.
    try {
        if (typeof window.__flaynityHideStartupSplash === 'function') {
            window.__flaynityHideStartupSplash();
        }
    } catch (e) {}

    try {
        AppNavigation.stack = [{ type: 'tab', id: 'home' }];
        AppNavigation.updateBridge();
    } catch (e) {}
    
    const slider = document.getElementById('premium-features-slider');
    const dots = document.querySelectorAll('.slider-dot');
    if (slider && dots.length > 0) {
        slider.addEventListener('scroll', () => {
            const width = slider.offsetWidth;
            const index = Math.round(slider.scrollLeft / width);
            dots.forEach((dot, idx) => {
                if (idx === index) dot.classList.add('active');
                else dot.classList.remove('active');
            });
        });
    }

    initPullToRefresh();
});

// Home is loaded dynamically, so initialize Pull-to-Refresh again immediately
// after the Home DOM is mounted if the first DOM-ready attempt ran too early.
window.addEventListener('flaynity-dom-ready', initPullToRefresh);

// =========================================================
// OFFLINE -> ONLINE AUTO SYNC & NETWORK MONITORING
// =========================================================
let _networkOnlineDebounceTimer = null;

window.addEventListener('online', () => { window.FlaynityNetworkOnline(); });
window.addEventListener('offline', () => { window.FlaynityNetworkOffline(); });

window.FlaynityNetworkOnline = async function() {
    const isLive = typeof window.flCheckLiveInternet === 'function'
        ? await window.flCheckLiveInternet(3500)
        : navigator.onLine;
    if (!isLive) return;
    if (_networkOnlineDebounceTimer) return;
    _networkOnlineDebounceTimer = setTimeout(() => {
        _networkOnlineDebounceTimer = null;
    }, 1500);

    const spinner = document.getElementById('network-spinner-overlay');
    if (spinner) spinner.style.display = 'none';

    window.__flaynityLiveOnline = true;
    window.__flaynityOfflineSessionActive = false;
    try { firebase.database().goOnline(); } catch(e) {}
    showNotification("Network Restored! Syncing Live Data...", "success");

    const waitingUploads = uploadQueue.filter(i => i.status === 'paused' || i.status === 'waiting');
    if (waitingUploads.length > 0) {
        waitingUploads.forEach(item => { item.status = 'waiting'; });
        triggerNextActiveUpload();
    }

    syncOfflineLikes();
    SyncManager.refreshEverything({ force: true });

    const activeVideo = document.querySelector('.short-slide video[src]');
    if (activeVideo && activeVideo.paused && activeVideo.readyState > 2) {
        activeVideo.play().catch(() => {});
    }
};

window.FlaynityNetworkOffline = function() {
    window.__flaynityLiveOnline = false;
    try { firebase.database().goOffline(); } catch(e) {}
    showNotification("Offline Mode. Showing Skeletons.", "error");

    renderAllSkeletons();

    const activeVideo = document.querySelector('.short-slide video[src]');
    if (activeVideo && !activeVideo.paused) {
        activeVideo.pause();
    }
};

window.FlaynityNativeRefresh = async function() {
    const isLive = typeof window.flCheckLiveInternet === 'function'
        ? await window.flCheckLiveInternet(4000)
        : navigator.onLine;
    if (!isLive) {
        showNotification("No internet connection", "error");
        return;
    }
    if (SyncManager.isRefreshing) return;
    SyncManager.refreshEverything({ force: true });
};

// =========================================================
// GLOBAL SYNC MANAGER (No-Reload Synchronization Engine)
// =========================================================
const SyncManager = {
    isRefreshing: false,
    refreshEverything: async function(options) {
        const opts = options || {};
        // A refresh that hangs (flaky network) must never block every later refresh: treat a lock older than 25s as stale.
        if (this.isRefreshing && (Date.now() - (this._startedAt || 0)) < 25000) return false;
        if (!opts.force) {
            const isLive = typeof window.flCheckLiveInternet === 'function'
                ? await window.flCheckLiveInternet(3500)
                : navigator.onLine;
            if (!isLive) return false;
        }
        this.isRefreshing = true;
        this._startedAt = Date.now();
        const myRun = this._run = (this._run || 0) + 1;
        const withTimeout = window.__flWithTimeout || function (p) { return p; };
        let loaded = false;

        try {
            try { firebase.database().goOnline(); } catch (e) {}
            _detachAllGlobalFeedListeners();

            previousFeelsCount = -1;
            previousLongsCount  = -1;
            previousPostsCount  = -1;

            // The profile must never block (or break) the feed download.
            try { await withTimeout(this.refreshProfile(), 6000); } catch (e) { console.warn('refreshProfile skipped:', e); }

            const results = await withTimeout(Promise.allSettled([
                db.ref('admin_panel/movies/user_uploads').once('value'),
                db.ref('admin_panel/movies/feels').once('value'),
                db.ref('admin_panel/movies/shorts').once('value'),
                db.ref('admin_panel/posts').once('value')
            ]), 12000);

            const longsSnap = results[0].status === 'fulfilled' ? results[0].value : null;
            const feelsSnap = results[1].status === 'fulfilled' ? results[1].value : null;
            const legacyShortsSnap = results[2].status === 'fulfilled' ? results[2].value : null;
            const postsSnap = results[3].status === 'fulfilled' ? results[3].value : null;

            const now = Date.now();
            if (longsSnap) {
                allLongVideos = longsSnap.val()
                    ? enforceContentAdminStatus(Object.values(longsSnap.val()).filter(m => !m.scheduledTime || m.scheduledTime <= now), 'video')
                    : [];
                allLongVideos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            }
            if (feelsSnap || legacyShortsSnap) {
                const feelsData = (feelsSnap && feelsSnap.val()) ? Object.values(feelsSnap.val()) : [];
                const legacyShortsData = (legacyShortsSnap && legacyShortsSnap.val()) ? Object.values(legacyShortsSnap.val()) : [];
                const seenFeelIds = new Set();
                allFeels = enforceContentAdminStatus([...feelsData, ...legacyShortsData].filter(m => {
                    if (!m || (m.scheduledTime && m.scheduledTime > now) || !m.id || seenFeelIds.has(String(m.id))) return false;
                    seenFeelIds.add(String(m.id));
                    return true;
                }), 'short');
                allFeels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            }
            if (postsSnap) {
                allCommunityPosts = postsSnap.val()
                    ? enforceContentAdminStatus(Object.values(postsSnap.val()).filter(m => !m.scheduledTime || m.scheduledTime <= now), 'post')
                    : [];
                allCommunityPosts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            }

            loaded = !!(longsSnap || feelsSnap || legacyShortsSnap || postsSnap);
            window.__flInitialFeedFetched = true;
            startRealtimeFeedsListener();

            buildHomeFeed();

            const feelsTab = document.getElementById('feels-tab');
            if (feelsTab && feelsTab.classList.contains('active')) buildFeelsPage();

            this.refreshAnalytics();
            return loaded;

        } catch (err) {
            console.error("SyncManager Execution Error:", err);
            return false;
        } finally {
            window.__flInitialFeedFetched = true;
            if (!loaded) {
                // Download failed / timed out: the live listeners were detached above, so put them back.
                // They deliver the feed as soon as the connection is ready (no more empty Home).
                try { startRealtimeFeedsListener(); } catch (e) {}
                try { buildHomeFeed(); } catch (e) {}
            }
            if (this._run === myRun) this.isRefreshing = false;
        }
    },

    refreshProfile: async function() {
        const currentUser = auth.currentUser;
        if (currentUser) {
            try { db.ref(`channels/${currentUser.uid}`).off(); } catch(e) {}
            try { db.ref(`users/${currentUser.uid}`).off(); } catch(e) {}

            const snap = await db.ref(`channels/${currentUser.uid}`).once('value');
            currentChannelData = snap.val();
            if (currentChannelData) {
                localStorage.setItem('flaynity_user_session_cache', JSON.stringify(currentChannelData));
            }
            initYouTabUI();
        }
    },

    refreshAnalytics: function() {
        try { if (window.FlayAnalytics) window.FlayAnalytics.refresh(); } catch (e) {}
    }
};

// =========================================================
// HOME SELF-HEAL: online but Home is blank / stuck on the skeleton -> recover automatically
// (redraw if data exists, otherwise download the feeds again with a back-off).
// =========================================================
(function () {
    var lastTry = 0, attempts = 0;
    setInterval(function () {
        try {
            if (!navigator.onLine || document.hidden) return;
            var home = document.getElementById('home-feed-container');
            var homeTab = document.getElementById('home-tab');
            if (!home || !homeTab || !homeTab.classList.contains('active')) return;
            if (typeof _hfHoldRender !== 'undefined' && _hfHoldRender) return;
            if (typeof auth === 'undefined' || !auth.currentUser) return;
            if (!isAdminFeatureEnabled('homeFeedEnabled')) return;

            home.classList.remove('hf-leaving');
            var blank = !home.children.length || !!home.querySelector('.offline-home-skeleton');
            if (!blank) { attempts = 0; return; }

            var hasData = (allLongVideos && allLongVideos.length) || (allFeels && allFeels.length);
            if (hasData) { buildHomeFeed(); return; }
            if (!home.children.length) buildHomeFeed();   // at least the skeleton, never a blank screen

            var wait = attempts < 3 ? 5000 : 30000;
            if (SyncManager.isRefreshing || Date.now() - lastTry < wait) return;
            lastTry = Date.now(); attempts++;
            SyncManager.refreshEverything();
        } catch (e) {}
    }, 2000);
})();

function _detachAllGlobalFeedListeners() {
    try { db.ref('admin_panel/movies/user_uploads').off(); } catch(e) {}
    try { db.ref('admin_panel/movies/feels').off(); } catch(e) {}
        try { db.ref('admin_panel/movies/shorts').off(); } catch(e) {}
    try { db.ref('admin_panel/posts').off(); } catch(e) {}

    Object.keys(boundChannelListeners).forEach(uid => {
        try { db.ref(`channels/${uid}`).off(); } catch(e) {}
    });
    for (let key in boundChannelListeners) delete boundChannelListeners[key];

    _detachAllPostReactionListeners();
}

const _boundPostReactionListeners = {};
function _detachAllPostReactionListeners() {
    Object.keys(_boundPostReactionListeners).forEach(postId => {
        try { db.ref(`post_reactions/${postId}`).off(); } catch(e) {}
        try { db.ref(`movie_comments/${postId}`).off(); } catch(e) {}
    });
    for (let key in _boundPostReactionListeners) delete _boundPostReactionListeners[key];
}

// =========================================================
// TOP-OF-PAGE PULL TO REFRESH ENGINE
// =========================================================
let touchStartY = 0;
let touchStartX = 0;
let touchMoveY = 0;
let ptrStartAtTop = false;
let isPTRActive = false;
let isRefreshingNow = false;

function getMainScrollTop() {
    return Math.max(
        Number(window.scrollY || 0),
        Number(document.documentElement.scrollTop || 0),
        Number(document.body.scrollTop || 0)
    );
}

function forceHidePTRIndicator() {
    document.querySelectorAll('#ptr-indicator').forEach((el) => {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
    });
}

function isPTRAllowedOnCurrentView() {
    // Never on startup splash / loading / get-started / welcome / sign-up / login pages.
    if (document.body.classList.contains('auth-active')) return false;
    const _splash = document.getElementById('flaynity-startup-splash');
    if (_splash && !_splash.classList.contains('is-hidden') && getComputedStyle(_splash).display !== 'none') return false;
    const _auth = document.getElementById('auth-screen');
    if (_auth && getComputedStyle(_auth).display !== 'none') return false;
    const _appScr = document.getElementById('app-screen');
    if (!_appScr || getComputedStyle(_appScr).display === 'none') return false;
    const _flcc=document.getElementById('fl-create-channel');
    if (_flcc && getComputedStyle(_flcc).display !== 'none') return false;
    const modalsOpen = document.querySelectorAll('.fullscreen-page[style*="display: flex"], .fullscreen-page[style*="display: block"], .premium-download-modal[style*="display: flex"], #full-movie-page[style*="display: block"], #theme-popup-menu[style*="display: flex"], #full-image-preview-overlay[style*="display: flex"]');
    if (modalsOpen.length > 0) return false;

    const activeNav = document.querySelector('.nav-item.active');
    if (!activeNav) return false;
    const activeTabId = activeNav.id.replace('nav-', '');

    // Feels has its own vertical scroller and must never trigger page PTR.
    if (activeTabId === 'feels') return false;
    return activeTabId === 'home' && getMainScrollTop() <= 2;
}


function ensurePTRHomeAnimationStyles() {
    if (document.getElementById('ptr-home-animation-styles')) return;
    const style = document.createElement('style');
    style.id = 'ptr-home-animation-styles';
    style.textContent = `
        #ptr-spinner.ptr-home-icon {
            overflow: visible !important;
            fill: none !important;
            stroke: var(--primary, #FF1744) !important;
            stroke-width: 1.9 !important;
            stroke-linecap: round !important;
            stroke-linejoin: round !important;
            transform-origin: 50% 50% !important;
        }
        #ptr-spinner.ptr-home-icon path {
            fill: none !important;
            stroke: var(--primary, #FF1744) !important;
            stroke-width: 1.9 !important;
            stroke-linecap: round !important;
            stroke-linejoin: round !important;
        }
        #ptr-spinner.ptr-home-icon.ptr-home-building path {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
        }
        #ptr-spinner.ptr-home-icon.ptr-home-building {
            animation: ptrHomeGlow 1.15s ease-in-out infinite alternate !important;
        }
        @keyframes ptrHomePathBuild {
            0% { opacity: .15; transform: scale(.78); }
            55% { opacity: 1; transform: scale(1.05); }
            100% { opacity: 1; transform: scale(1); }
        }
        @keyframes ptrHomeGlow {
            0% { filter: drop-shadow(0 0 1px rgba(255,23,68,.25)); }
            100% { filter: drop-shadow(0 0 8px rgba(255,23,68,.95)) drop-shadow(0 0 16px rgba(255,23,68,.45)); }
        }
    `;
    document.head.appendChild(style);
}
function ensurePTRIndicator() {
    ensurePTRHomeAnimationStyles();
    let ptrIndicator = document.getElementById('ptr-indicator');
    if (!ptrIndicator) {
        ptrIndicator = document.createElement('div');
        ptrIndicator.id = 'ptr-indicator';
        ptrIndicator.setAttribute('aria-hidden', 'true');
        ptrIndicator.innerHTML = '<svg id="ptr-spinner" class="ptr-spinner ptr-home-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 14.5 16 7l9 7.5"></path><path d="M7 14.5V23c0 1.7 1.3 3 3 3h12c1.7 0 3-1.3 3-3v-8.5"></path><path d="M13 26v-7h6v7"></path></svg>';
        document.body.appendChild(ptrIndicator);
    }
    let ptrSpinner = document.getElementById('ptr-spinner');
    if (!ptrSpinner && ptrIndicator) {
        ptrSpinner = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ptrSpinner.id = 'ptr-spinner';
        ptrSpinner.setAttribute('class', 'ptr-spinner');
        ptrSpinner.setAttribute('viewBox', '0 0 32 32');
        ptrSpinner.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('pathLength', '1'); path.setAttribute('d', 'M7 14.5 16 7l9 7.5'); path.style.stroke = 'var(--primary, #FF1744)'; path.style.strokeWidth = '1.9'; path.style.fill = 'none';
        ptrSpinner.appendChild(path);
        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('pathLength', '1');
        path2.setAttribute('d', 'M7 14.5V23c0 1.7 1.3 3 3 3h12c1.7 0 3-1.3 3-3v-8.5'); path2.style.stroke = 'var(--primary, #FF1744)'; path2.style.strokeWidth = '1.9'; path2.style.fill = 'none';
        ptrSpinner.appendChild(path2);
        const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path3.setAttribute('pathLength', '1');
        path3.setAttribute('d', 'M13 26v-7h6v7'); path3.style.stroke = 'var(--primary, #FF1744)'; path3.style.strokeWidth = '1.9'; path3.style.fill = 'none';
        ptrSpinner.appendChild(path3);
        ptrIndicator.appendChild(ptrSpinner);
    }
    // Remove duplicate indicators (Home page markup + dynamically created one).
    document.querySelectorAll('#ptr-indicator').forEach((el) => { if (el !== ptrIndicator) el.remove(); });
    if (ptrIndicator) {
        ptrIndicator.style.setProperty('position', 'fixed', 'important');
        ptrIndicator.style.setProperty('top', '58px', 'important');
        ptrIndicator.style.setProperty('left', '50%', 'important');
        ptrIndicator.style.setProperty('width', '42px', 'important');
        ptrIndicator.style.setProperty('height', '42px', 'important');
        ptrIndicator.style.setProperty('align-items', 'center', 'important');
        ptrIndicator.style.setProperty('justify-content', 'center', 'important');
        ptrIndicator.style.setProperty('pointer-events', 'none', 'important');
        ptrIndicator.style.setProperty('background', 'var(--surface, #0F0F0F)', 'important');
        ptrIndicator.style.setProperty('border', '2px solid var(--primary, #FF1744)', 'important');
        ptrIndicator.style.setProperty('border-radius', '50%', 'important');
        ptrIndicator.style.setProperty('box-shadow', '0 4px 16px rgba(0,0,0,0.35)', 'important');
        ptrIndicator.style.setProperty('z-index', '2147483647', 'important');
        // Hidden by default. Only the Home pull gesture may show it.
        ptrIndicator.style.setProperty('display', 'none', 'important');
        ptrIndicator.style.setProperty('visibility', 'hidden', 'important');
        ptrIndicator.style.setProperty('opacity', '0', 'important');
        ptrIndicator.style.setProperty('transform', 'translate3d(-50%, -90px, 0) scale(0.72)', 'important');
    }
    if (ptrSpinner) {
        ptrSpinner.style.setProperty('width', '24px', 'important');
        ptrSpinner.style.setProperty('height', '24px', 'important');
        ptrSpinner.style.setProperty('display', 'block', 'important');
        ptrSpinner.style.setProperty('fill', 'var(--primary, #FF1744)', 'important');
        ptrSpinner.style.setProperty('stroke', 'var(--primary, #FF1744)', 'important');
        ptrSpinner.style.setProperty('stroke-width', '2.4', 'important');
        ptrSpinner.style.setProperty('stroke-linecap', 'round', 'important');
        ptrSpinner.style.setProperty('stroke-linejoin', 'round', 'important');
        ptrSpinner.style.setProperty('transform-origin', '50% 50%', 'important');
    }
    return { ptrIndicator, ptrSpinner };
}

function resetPTRIndicator() {
    const indicators = document.querySelectorAll('#ptr-indicator');
    const spinners = document.querySelectorAll('#ptr-spinner');

    // Smoothly stop the spinner and fade/slide the indicator away.
    indicators.forEach((ptrIndicator) => {
        ptrIndicator.style.setProperty('display', 'flex', 'important');
        ptrIndicator.style.setProperty('visibility', 'visible', 'important');
        ptrIndicator.style.setProperty('pointer-events', 'none', 'important');
        ptrIndicator.style.setProperty('transition', 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease', 'important');
        ptrIndicator.style.setProperty('transform', 'translate3d(-50%, -12px, 0) scale(0.72)', 'important');
        ptrIndicator.style.setProperty('opacity', '0', 'important');
    });

    spinners.forEach((ptrSpinner) => {
        ptrSpinner.classList.remove('ptr-spinning', 'ptr-home-building');
        ptrSpinner.style.setProperty('animation', 'none', 'important');
        ptrSpinner.style.setProperty('animation-name', 'none', 'important');
        ptrSpinner.style.setProperty('-webkit-animation', 'none', 'important');
        ptrSpinner.style.setProperty('-webkit-animation-name', 'none', 'important');
        ptrSpinner.style.setProperty('fill', 'var(--primary, #FF1744)', 'important');
        ptrSpinner.style.setProperty('stroke', 'var(--primary, #FF1744)', 'important');
        ptrSpinner.style.setProperty('transform', 'none', 'important');
        ptrSpinner.style.setProperty('transition', 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)', 'important');
    });

    setTimeout(() => {
        document.querySelectorAll('#ptr-indicator').forEach((ptrIndicator) => {
            ptrIndicator.style.setProperty('visibility', 'hidden', 'important');
            ptrIndicator.style.setProperty('display', 'none', 'important');
            ptrIndicator.style.setProperty('opacity', '0', 'important');
            ptrIndicator.style.setProperty('transform', 'translate3d(-50%, -90px, 0) scale(0.72)', 'important');
        });
    }, 340);
}
function initPullToRefresh() {
    if (window.__flaynityPTRInitialized) return;

    const ensuredPTR = ensurePTRIndicator();
    let ptrIndicator = ensuredPTR.ptrIndicator;
    let ptrSpinner = ensuredPTR.ptrSpinner;

    // Home is mounted asynchronously by the modular page loader. If the
    // indicator is not mounted yet, wait for flaynity-dom-ready and retry.
    if (!ptrIndicator || !ptrSpinner) return;

    window.__flaynityPTRInitialized = true;

    // The modular page loader mounts Home inside #app-screen. Move the
    // fixed PTR overlay to <body> so it is never hidden by a page stacking context.
    if (ptrIndicator && ptrIndicator.parentElement !== document.body) {
        document.body.appendChild(ptrIndicator);
    }

    if (ptrIndicator) {
        ptrIndicator.style.setProperty('position', 'fixed', 'important');
        ptrIndicator.style.setProperty('top', '58px', 'important');
        ptrIndicator.style.setProperty('left', '50%', 'important');
        ptrIndicator.style.setProperty('width', '42px', 'important');
        ptrIndicator.style.setProperty('height', '42px', 'important');
        ptrIndicator.style.setProperty('display', 'flex', 'important');
        ptrIndicator.style.setProperty('visibility', 'hidden', 'important');
        ptrIndicator.style.setProperty('opacity', '0', 'important');
        ptrIndicator.style.setProperty('display', 'none', 'important');
        ptrIndicator.style.setProperty('z-index', '2147483647', 'important');
    }

    const PTR_TRIGGER_DISTANCE = 110;

    // Safety net: if the user is not on Home, the indicator must never be visible.
    setInterval(() => {
        if (!isRefreshingNow && !isPTRActive && !isPTRAllowedOnCurrentView()) forceHidePTRIndicator();
    }, 400);

    document.addEventListener('touchstart', (e) => {
        if (isRefreshingNow || !e.touches || !e.touches.length) return;
        ptrStartAtTop = isPTRAllowedOnCurrentView();
        isPTRActive = ptrStartAtTop;
        if (!ptrStartAtTop) return;
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        touchMoveY = touchStartY;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isPTRActive || isRefreshingNow || !e.touches || !e.touches.length) return;

        // The gesture is valid only if the page is still exactly at the top.
        if (!ptrStartAtTop || getMainScrollTop() > 2 || !isPTRAllowedOnCurrentView()) {
            isPTRActive = false;
            resetPTRIndicator();
            return;
        }

        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const deltaY = currentY - touchStartY;
        const deltaX = Math.abs(currentX - touchStartX);

        if (deltaY > 8 && deltaY > deltaX * 1.35) {
            touchMoveY = currentY;
            // Damped movement prevents a tiny scroll from looking like a pull.
            const pullDistance = Math.min(140, deltaY * 0.58);
            if (e.cancelable) e.preventDefault();

            if (ptrIndicator) {
                ptrIndicator.style.setProperty('display', 'flex', 'important');
                ptrIndicator.style.setProperty('visibility', 'visible', 'important');
                ptrIndicator.style.setProperty('opacity', String(Math.min(1, pullDistance / 52)), 'important');
                ptrIndicator.style.setProperty('transform', `translate3d(-50%, ${Math.min(115, pullDistance)}px, 0)`, 'important');
            }
            if (ptrSpinner) {
                ptrSpinner.style.transform = 'none';
                ptrSpinner.style.setProperty('fill', pullDistance >= PTR_TRIGGER_DISTANCE * 0.42 ? 'var(--primary, #FF1744)' : 'var(--text-muted, #888)', 'important');
                ptrSpinner.style.setProperty('stroke', 'none', 'important');
            }
        } else if (deltaY <= 0 || deltaX >= Math.abs(deltaY) * 1.35) {
            isPTRActive = false;
            resetPTRIndicator();
        }
    }, { passive: false });

    document.addEventListener('touchend', () => {
        if (!isPTRActive || isRefreshingNow) {
            isPTRActive = false;
            return;
        }

        const deltaY = touchMoveY - touchStartY;
        isPTRActive = false;

        if (deltaY >= PTR_TRIGGER_DISTANCE && getMainScrollTop() <= 2 && isPTRAllowedOnCurrentView()) {
            isRefreshingNow = true;
            if (ptrIndicator) {
                ptrIndicator.style.setProperty('display', 'flex', 'important');
                ptrIndicator.style.setProperty('visibility', 'visible', 'important');
                ptrIndicator.style.setProperty('transform', 'translate3d(-50%, 55px, 0)', 'important');
                ptrIndicator.style.setProperty('opacity', '1', 'important');
            }
            if (ptrSpinner) {
                ptrSpinner.style.setProperty('fill', 'var(--primary, #FF1744)', 'important');
                ptrSpinner.style.setProperty('stroke', 'none', 'important');
                ptrSpinner.style.transform = 'none';
                ptrSpinner.classList.add('ptr-home-building');
            }

            triggerUniversalPullToRefresh().finally(() => {
                setTimeout(() => {
                    resetPTRIndicator();
                    isRefreshingNow = false;
                }, 350);
            });
        } else {
            resetPTRIndicator();
        }

        touchStartY = 0;
        touchMoveY = 0;
        ptrStartAtTop = false;
    }, { passive: true });
}

async function triggerUniversalPullToRefresh() {
    playUI('click');
    const isLive = typeof window.flCheckLiveInternet === 'function'
        ? await window.flCheckLiveInternet(4000)
        : navigator.onLine;
    if (!isLive) {
        window.__flaynityLiveOnline = false;
        showNotification("No internet connection", "error");
        return;
    }

    window.__flaynityLiveOnline = true;
    window.__flaynityOfflineSessionActive = false;
    try { firebase.database().goOnline(); } catch (e) {}
    try { if (typeof attachAdminControlListener === 'function') attachAdminControlListener(); } catch (e) {}

    try {
        let ok = false;
        await hfRunHomeRefresh(async () => {
            ok = await SyncManager.refreshEverything({ force: true });
        });
        if (ok) {
            try { syncOfflineLikes(); } catch (e) {}
            showNotification("Feed Updated!", "success");
        } else {
            showNotification("Could not load data. Pull to try again.", "error");
        }
    } catch (e) {
        console.error("PTR Refresh Exception:", e);
        showNotification("Refresh failed: " + e.message, "error");
    }
}

// =========================================
// UI SOUND ENGINE
// =========================================
const soundClick = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
const soundSuccess = new Audio('https://assets.mixkit.co/active_storage/sfx/1114/1114-preview.mp3');
soundClick.volume = 0.3; soundSuccess.volume = 0.4;
function playUI(type) { 
    try { 
        if(type === 'click' && soundClick) { soundClick.currentTime = 0; soundClick.play(); } 
        if(type === 'success' && soundSuccess) { soundSuccess.currentTime = 0; soundSuccess.play(); } 
    } catch(e) {} 
}

// =========================================================
// IN-APP NOTIFICATION ENGINE
// =========================================================
let notificationTimer = null;
function showNotification(message, type = 'error', duration = 2000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    container.innerHTML = ''; 
    if(notificationTimer) clearTimeout(notificationTimer);

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '<i class="fas fa-check-circle" style="color: var(--success); font-size:1.2rem;"></i>' : '<i class="fas fa-exclamation-circle" style="color: var(--primary); font-size:1.2rem;"></i>';
    toast.innerHTML = `${icon} <span>${message}</span>`;
    
    container.appendChild(toast);
    if(type === 'success') playUI('success');

    notificationTimer = setTimeout(() => {
        toast.style.animation = "slideOutUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// =========================================
// FIREBASE SETUP
// =========================================
// Firebase initialization is provided by js/firebase-config.js.
// Shared globals: firebase, auth, db

const API_KEY = '15d2ea6d0dc1d476efbca3eba2b9bbfb'; 
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/w500';
const BG_URL = 'https://image.tmdb.org/t/p/original';

let allAdminMovies = []; 
let currentActiveMovie = null; 
let currentGenre = null;

let activeStatsRef = null;
let activeCommentsRef = null;

// =========================================================
// HOME FEED RANDOMIZER (YouTube-style personal random feed)
// - One random seed per user per app launch, re-rolled on every Home pull-to-refresh.
// - Same seed => same order, so realtime rebuilds / Back navigation never reshuffle the feed.
// - Smart mix: random + fresh-upload boost; already-watched items sink to the bottom.
// =========================================================
var _hfSeed = 0;
var _hfNow = 0;
var _hfSeenSnap = null;
var _hfAnimateNext = false;
var _hfHoldRender = false;
var HF_SEEN_KEY = 'flaynity_home_seen_v1';
var HF_SEEN_TTL = 14 * 24 * 3600 * 1000;

function _hfHash(str) {
    str = String(str);
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
}

function hfNewSeed() {
    var uid = '', r;
    try { uid = (auth && auth.currentUser && auth.currentUser.uid) || ''; } catch (e) {}
    try { var a = new Uint32Array(2); crypto.getRandomValues(a); r = a[0] + '-' + a[1]; }
    catch (e) { r = Math.random() + '-' + Math.random(); }
    _hfNow = Date.now();
    _hfSeed = _hfHash(uid + '|' + _hfNow + '|' + r);
    _hfSeenSnap = null;   // re-read watched list for the new feed
    return _hfSeed;
}

function _hfReadSeen() {
    try { return JSON.parse(localStorage.getItem(HF_SEEN_KEY) || '{}') || {}; } catch (e) { return {}; }
}

function hfMarkSeen(id) {
    if (id === undefined || id === null || id === '') return;
    try {
        var m = _hfReadSeen();
        m[String(id)] = Date.now();
        var keys = Object.keys(m);
        if (keys.length > 1500) {
            keys.sort(function (a, b) { return m[a] - m[b]; })
                .slice(0, keys.length - 1000)
                .forEach(function (k) { delete m[k]; });
        }
        localStorage.setItem(HF_SEEN_KEY, JSON.stringify(m));
    } catch (e) {}
}

// Order a list for Home: seeded random + fresh boost - watched penalty, capped to `max` candidates.
function hfOrder(list, max) {
    if (!_hfSeed) hfNewSeed();
    if (!_hfSeenSnap) _hfSeenSnap = _hfReadSeen();
    var seen = _hfSeenSnap, seed = _hfSeed, now = _hfNow;
    var scored = list.map(function (it) {
        var id = String(it && it.id);
        var r = _hfHash(seed + '|' + id) / 4294967296;
        var ageDays = Math.max(0, (now - (it.createdAt || 0)) / 86400000);
        var fresh = it.createdAt ? Math.exp(-ageDays / 10) : 0;
        var t = seen[id];
        var watched = t && (now - t) < HF_SEEN_TTL;
        return { it: it, s: r * 0.62 + fresh * 0.38 - (watched ? 0.9 : 0) };
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    var out = scored.map(function (x) { return x.it; });
    if (max && out.length > max) out = out.slice(0, max);

    // Avoid the same channel appearing back-to-back (look ahead a few slots).
    for (var i = 1; i < out.length; i++) {
        var u = out[i].userId;
        if (u && out[i - 1].userId === u) {
            for (var j = i + 1; j < Math.min(out.length, i + 6); j++) {
                if (out[j].userId !== u) { var tmp = out[i]; out[i] = out[j]; out[j] = tmp; break; }
            }
        }
    }
    return out;
}

// Small seeded random generator (mulberry32): same seed => same sequence.
function hfMakeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// =========================================================
// LONG VIDEO PLAY PAGE: random "up next" feed (new seed every time a video is opened)
// =========================================================
var _wpRelSeed = 0;
var _wpRelNow = 0;
var _wpRelSeen = null;
var _wpRelatedIds = [];

function wpNewRelatedSeed() {
    var uid = '', r;
    try { uid = (auth && auth.currentUser && auth.currentUser.uid) || ''; } catch (e) {}
    try { var a = new Uint32Array(2); crypto.getRandomValues(a); r = a[0] + '-' + a[1]; }
    catch (e) { r = Math.random() + '-' + Math.random(); }
    _wpRelNow = Date.now();
    _wpRelSeed = _hfHash('wp|' + uid + '|' + _wpRelNow + '|' + r);
    _wpRelSeen = _hfReadSeen();
    return _wpRelSeed;
}

function wpOrderRelated(list) {
    if (!_wpRelSeed) wpNewRelatedSeed();
    var seen = _wpRelSeen || _hfReadSeen(), seed = _wpRelSeed, now = _wpRelNow;
    var scored = list.map(function (it) {
        var id = String(it && it.id);
        var r = _hfHash(seed + '|' + id) / 4294967296;
        var ageDays = Math.max(0, (now - (it.createdAt || 0)) / 86400000);
        var fresh = it.createdAt ? Math.exp(-ageDays / 10) : 0;
        var t = seen[id];
        var watched = t && (now - t) < HF_SEEN_TTL;
        return { it: it, s: r * 0.7 + fresh * 0.3 - (watched ? 0.9 : 0) };
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    var out = scored.map(function (x) { return x.it; });
    // Avoid the same channel appearing back-to-back.
    for (var i = 1; i < out.length; i++) {
        var u = out[i].userId;
        if (u && out[i - 1].userId === u) {
            for (var j = i + 1; j < Math.min(out.length, i + 6); j++) {
                if (out[j].userId !== u) { var tmp = out[i]; out[i] = out[j]; out[j] = tmp; break; }
            }
        }
    }
    return out;
}

// Write the feed HTML. Skips the write when nothing changed (no flicker on realtime rebuilds)
// and plays the staggered fade/slide-up once for a freshly refreshed feed.
function hfCommit(container, html) {
    var same = container.__hfSig === html && container.__hfNode &&
               container.__hfNode === container.firstElementChild && container.childElementCount > 0;
    if (same) return;
    var animate = _hfAnimateNext && !!html;
    container.innerHTML = html;
    container.__hfSig = html;
    container.__hfNode = container.firstElementChild;
    if (animate) {
        _hfAnimateNext = false;
        hfPlayEnter(container);
    }
}

function hfPlayEnter(container) {
    try {
        var targets = Array.prototype.slice.call(container.children);
        if (targets.length <= 2) {
            var cards = container.querySelectorAll('.short-home-card-2col');
            if (cards.length) targets = Array.prototype.slice.call(cards);
        }
        targets = targets.slice(0, 8);
        targets.forEach(function (el, i) {
            el.style.setProperty('--hf-i', i);
            el.classList.add('hf-enter');
        });
        setTimeout(function () {
            targets.forEach(function (el) { el.classList.remove('hf-enter'); el.style.removeProperty('--hf-i'); });
        }, 1200);
    } catch (e) {}
}

// Home pull-to-refresh: new seed -> old feed stays visible while data reloads (NO skeleton / shimmer)
// -> the new random feed replaces it and fades/slides in.
async function hfRunHomeRefresh(doRefresh) {
    var home = document.getElementById('home-feed-container');
    var activeNav = document.querySelector('.nav-item.active');
    var onHome = !!home && !!activeNav && activeNav.id === 'nav-home' &&
                 isAdminFeatureEnabled('homeFeedEnabled');
    if (!onHome) { await doRefresh(); return; }

    hfNewSeed();
    _hfAnimateNext = true;
    _hfHoldRender = true;
    var safety = setTimeout(function () { _hfHoldRender = false; }, 20000);
    try {
        await doRefresh();
    } finally {
        clearTimeout(safety);
        _hfHoldRender = false;
        home.classList.remove('hf-leaving');
        home.classList.remove('hf-skel-in');
        try { buildHomeFeed(); } catch (e) {}
        _hfAnimateNext = false;
    }
}

// =========================================
// DYNAMIC FEED DATA VARIABLES
// =========================================
let allFeels = [];
let allLongVideos = [];
let allCommunityPosts = [];
let activeHomeCategory = "All";
let watchRecommendedLimit = 10;
let postRenderLimit = 30;

// =========================================================
// CLOUDFLARE R2 OBJECT STORAGE
// =========================================================
// R2 configuration/client/helpers are provided by js/cloudflare-r2.js.
// Shared globals: R2_CONFIG, s3, PUBLIC_R2_DOMAIN_PREFIX, uploadImageToR2, dataURLtoBlob

// =========================================
// AUTHENTICATION & SESSION MANAGEMENT
// =========================================
let currentChannelData = null; 
let tempCreateAvatarUrl = "";
let tempEditAvatarUrl = "";
let tempEditBannerUrl = "";
let currentPostImages = [];
let currentDetailItem = null;

function getSavedAccounts() {
    try { return JSON.parse(localStorage.getItem('flaynity_saved_accounts')) || []; } catch(e) { return []; }
}

function saveAccountToList(user) {
    if (!user) return;
    try {
        let accounts = getSavedAccounts();
        const exists = accounts.find(acc => acc.uid === user.uid);
        if (!exists) {
            accounts.push({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                photoURL: user.photoURL || ""
            });
            localStorage.setItem('flaynity_saved_accounts', JSON.stringify(accounts));
        } else {
            exists.displayName = user.displayName || user.email.split('@')[0];
            exists.photoURL = user.photoURL || "";
            localStorage.setItem('flaynity_saved_accounts', JSON.stringify(accounts));
        }
    } catch (e) {}
}

function cleanupUserSessionData() {
    window.__flaynityYouLoadToken = (window.__flaynityYouLoadToken || 0) + 1;
    try {
        ['flaynity_cached_channel_avatar','flaynity_cached_channel_avatar_url',
         'flaynity_cached_channel_banner','flaynity_cached_channel_banner_url']
            .forEach(key => localStorage.removeItem(key));
    } catch (e) {}

    // Remove every account-scoped in-memory and visible UI value before another UID is rendered.
    window.__flaynityActiveDataUid = null;
    try { if (window.AppNavigation && typeof AppNavigation.popToRoot === 'function') AppNavigation.popToRoot(); } catch (e) {}
    try { if (window.currentUserUnsubscribe) window.currentUserUnsubscribe(); } catch (e) {}
    try { if (window.__flaynityUserListeners) window.__flaynityUserListeners.forEach(fn => { try { fn(); } catch (e) {} }); } catch (e) {}
    try { window.__flaynityUserListeners = []; } catch (e) {}
    try { ['flaynity_user_session_cache','flaynity_upload_queue_v2','flaynity_channel_cache','flaynity_profile_cache','flaynity_user_cache'].forEach(k => localStorage.removeItem(k)); } catch (e) {}

    Object.keys(liveChannelDataCache).forEach(uid => delete liveChannelDataCache[uid]);
    currentChannelData = null;
    tempCreateAvatarUrl = "";
    tempEditAvatarUrl = "";
    tempEditBannerUrl = "";
    currentPostImages = [];
    currentDetailItem = null;

    allAdminMovies = [];
    allFeels = [];
    allLongVideos = [];
    allCommunityPosts = [];
    uploadQueue = [];
    localStorage.removeItem('flaynity_upload_queue_v2'); 
    localStorage.removeItem('flaynity_user_session_cache');

    const homeFeed = document.getElementById('home-feed-container');
    if (homeFeed) homeFeed.innerHTML = '';
    
    const feelsSwiper = document.getElementById('feels-swiper-container');
    if (feelsSwiper) feelsSwiper.innerHTML = '';
    try { feelsResetSessions(); } catch (e) {}

    const searchResults = document.getElementById('search-results');
    if (searchResults) searchResults.innerHTML = '<p style="color:var(--text-muted); grid-column:1/-1; text-align:center; padding: 60px 0; font-weight: 500;">Search or use the mic to find movies.</p>';

    const youName = document.getElementById('you-fullname-txt');
    if (youName) youName.innerText = "Logged Out";

    const youEmail = document.getElementById('you-email-txt');
    if (youEmail) youEmail.innerText = "";

    const youAvatar = document.getElementById('you-avatar-large');
    if (youAvatar) youAvatar.innerHTML = 'U';

    // Remove the previous account's visible channel imagery immediately.
    ['view-channel-banner','view-channel-avatar'].forEach(id => {
        const image = document.getElementById(id);
        if (image) {
            image.removeAttribute('src');
            image.style.visibility = 'hidden';
        }
    });
    ['view-appbar-title','view-channel-name-txt','view-channel-handle-txt','view-channel-desc','view-sub-count']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '';
        });

    const actionBox = document.getElementById('channel-action-box');
    if (actionBox) actionBox.innerHTML = '';

    const managerList = document.getElementById('manager-items-list');
    if (managerList) managerList.innerHTML = '';

    if (activeStatsRef) { try { activeStatsRef.off(); } catch(e) {} activeStatsRef = null; }
    if (activeCommentsRef) { try { activeCommentsRef.off(); } catch(e) {} activeCommentsRef = null; }
    if (activeChannelVideosListener) { try { activeChannelVideosListener.off(); } catch(e) {} activeChannelVideosListener = null; }
    if (activeChannelFeelsListener) { try { activeChannelFeelsListener.off(); } catch(e) {} activeChannelFeelsListener = null; }
    if (activeChannelPostsListener) { try { activeChannelPostsListener.off(); } catch(e) {} activeChannelPostsListener = null; }

    _detachAllGlobalFeedListeners();
    try { clearFeelsSubscriptionListeners(); } catch(e) {}
    _feedListenersAttached = false;

    // Clear additional account-owned surfaces so stale profile/feed data cannot flash.
    ['you-bio-txt','you-username-txt','you-phone-txt','you-country-txt','you-channel-name','you-channel-username',
     'channel-profile-name','channel-profile-bio','channel-profile-username','channel-banner','channel-avatar',
     'profile-fullname','profile-username','profile-bio','profile-email','profile-phone','profile-country',
     'profile-avatar','profile-banner','you-channel-banner','you-channel-avatar'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if ('value' in el) el.value = '';
        else if (el.tagName === 'IMG') el.removeAttribute('src');
        else el.textContent = '';
        if (el.style && (id.includes('banner') || id.includes('avatar'))) el.style.backgroundImage = '';
    });
    ['home-feed-container','posts-feed-container','posts-feels-strip','feels-swiper-container','search-results','you-posts-container',
     'you-videos-container','you-feels-container','channel-posts-container','channel-videos-container',
     'channel-feels-container','notifications-list','inbox-list','manager-items-list'].forEach(id => {
        const el = document.getElementById(id); if (el) el.innerHTML = '';
    });
    // Remove all account-scoped cached data, including per-UID image/banner caches.
    // Keep only non-account preferences and the saved-account selector.
    try {
        const keepKeys = /^(theme|language|locale|flaynity_saved_accounts|savedAccounts|account_list)$/i;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i) || '';
            if (!keepKeys.test(key) && (/^(flaynity_|fx_hidden_|channel_|profile_|you_|feed_|user_|account_)/i.test(key))) {
                localStorage.removeItem(key);
            }
        }
    } catch (e) {}
    try {
        // Reset visible You page immediately, including inline banner/avatar backgrounds.
        const youWrap = document.getElementById('channel-action-box');
        if (youWrap) youWrap.innerHTML = '';
        document.querySelectorAll('[id*="banner"],[id*="avatar"],[id*="channel-image"],[id*="channel-image"]').forEach(el => {
            if (el.tagName === 'IMG') el.removeAttribute('src');
            if (el.style) { el.style.backgroundImage = 'none'; el.style.background = ''; }
        });
        document.querySelectorAll('[data-account-uid]').forEach(el => el.remove());
    } catch (e) {}

    SyncManager.isRefreshing = false;
}


// =========================================================
// ADMIN CONTROL + ACCOUNT BAN ENFORCEMENT
// =========================================================
let adminControlFeatures = {};
let bannedUserIds = new Set();
let adminControlListener = null;
let userStatusListener = null;
let banPopupVisible = false;

function isAdminFeatureEnabled(flag, defaultValue = true) {
    return Object.prototype.hasOwnProperty.call(adminControlFeatures, flag)
        ? adminControlFeatures[flag] !== false
        : defaultValue;
}

function showAccountBannedPopup(reason) {
    if (banPopupVisible) return;
    banPopupVisible = true;
    const old = document.getElementById('flaynity-ban-popup');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'flaynity-ban-popup';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.78);backdrop-filter:blur(10px);font-family:inherit;';
    overlay.innerHTML = `
      <div style="width:min(420px,100%);background:var(--card-bg,#151515);color:var(--text-main,#fff);border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:28px 22px;box-shadow:0 25px 80px rgba(0,0,0,.55);text-align:center;">
        <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center;background:rgba(220,53,69,.14);color:#ff5364;font-size:28px;">⚠</div>
        <h2 style="margin:0 0 10px;font-size:22px;">Account Banned</h2>
        <p style="margin:0 0 10px;opacity:.78;line-height:1.55;">Your Flaynity account has been banned by an administrator. You cannot access the app while this ban is active.</p>
        ${reason ? `<div style="margin:14px 0;padding:12px;border-radius:14px;background:rgba(255,255,255,.06);font-size:13px;text-align:left;"><b>Reason:</b><br>${escapeHTML(String(reason))}</div>` : ''}
        <button id="flaynity-ban-close" style="width:100%;border:0;border-radius:14px;padding:13px 16px;background:#ff5364;color:#fff;font-weight:800;font-size:14px;">Sign out</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('flaynity-ban-close').onclick = async () => {
        banPopupVisible = false;
        overlay.remove();
        try { await auth.signOut(); } catch(e) {}
    };
}

function clearUserStatusListener() {
    if (userStatusListener) {
        try { userStatusListener.off(); } catch(e) {}
        userStatusListener = null;
    }
}

function attachAdminControlListener() {
    if (adminControlListener) return;
    adminControlListener = db.ref('admin_control/features');
    adminControlListener.on('value', snap => {
        adminControlFeatures = snap.val() || {};
        applyAdminControls();
    });
}

function detachAdminControlListener() {
    if (adminControlListener) {
        try { adminControlListener.off(); } catch(e) {}
        adminControlListener = null;
    }
    adminControlFeatures = {};
}

function applyAdminControls() {
    const home = document.getElementById('home-feed-container');
    if (home && !isAdminFeatureEnabled('homeFeedEnabled')) {
        home.innerHTML = '<div style="padding:48px 20px;text-align:center;opacity:.7;font-weight:700;">Home Feed is currently disabled by the administrator.</div>';
    } else if (home) {
        buildHomeFeed();
    }
    const uploadTab = document.getElementById('nav-upload');
    if (uploadTab) uploadTab.style.display = isAdminFeatureEnabled('uploadSystemEnabled') ? '' : 'none';
    const discoverTab = document.getElementById('nav-discover');
    if (discoverTab) discoverTab.style.display = isAdminFeatureEnabled('discoverEnabled') ? '' : 'none';
    const searchButtons = document.querySelectorAll('[onclick*="switchTab(\'search\')"]');
    searchButtons.forEach(b => b.style.display = isAdminFeatureEnabled('searchEnabled') ? '' : 'none');
    document.querySelectorAll('.mode-item').forEach(item => {
        const mode = item.dataset.mode;
        const enabled = mode === 'video' ? isAdminFeatureEnabled('uploadVideoEnabled') : mode === 'short' ? isAdminFeatureEnabled('uploadFeelsEnabled') : mode === 'post' ? isAdminFeatureEnabled('uploadPostsEnabled') : true;
        item.style.display = enabled ? '' : 'none';
    });
    document.querySelectorAll('[onclick*="download"], [data-download]').forEach(b => {
        b.style.display = isAdminFeatureEnabled('downloadEnabled') ? '' : 'none';
    });
}


/* Create your Channel page lives in pages/home.html */

function enforceContentAdminStatus(items, type) {
    const allowed = items.filter(item => {
        const status = String(item?.status || item?.visibility || 'published').toLowerCase();
        if (status === 'hidden' || status === 'deleted' || status === 'disabled' || status === 'banned') return false;
        if (item?.userId && bannedUserIds.has(String(item.userId))) return false;
        if (type === 'video' && !isAdminFeatureEnabled('homeVideosEnabled')) return false;
        if (type === 'short' && !isAdminFeatureEnabled('homeFeelsEnabled')) return false;
        if (type === 'post' && !isAdminFeatureEnabled('homePostsEnabled')) return false;
        return true;
    });
    return allowed;
}

// =========================================================
// PREMIUM AUTH SUCCESS / WELCOME POPUP ANIMATION CONTROLLER
// =========================================================
window.__flPendingWelcome = null;
let __flWelcomeTimer = null;

window.showAuthWelcomePopup = function (user, mode, onDone) {
    try {
        if (!user) { if (typeof onDone === 'function') onDone(); return; }
        let ov = document.getElementById('fl-auth-welcome-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'fl-auth-welcome-overlay';
            ov.setAttribute('role', 'dialog');
            ov.setAttribute('aria-modal', 'true');
            ov.innerHTML = '<div class="fl-aw-orb o1"></div><div class="fl-aw-orb o2"></div><div class="fl-aw-orb o3"></div><div class="fl-aw-card" id="fl-aw-card"></div>';
            document.body.appendChild(ov);
        } else if (ov.parentElement !== document.body) {
            document.body.appendChild(ov);
        }

        const card = document.getElementById('fl-aw-card') || ov.querySelector('.fl-aw-card');
        if (!card) { if (typeof onDone === 'function') onDone(); return; }

        const isSignup = mode === 'signup';
        const displayName = (user.displayName && user.displayName.trim())
            ? user.displayName.trim()
            : ((user.email || 'Flaynity User').split('@')[0]);
        const emailText = user.email || '';
        const photoURL = user.photoURL || '';
        const initial = (displayName || 'F').charAt(0).toUpperCase();

        const cols = ['#FF2E74', '#10B981', '#F59E0B', '#8B5CF6', '#3B82F6', '#EC4899', '#34D399'];
        const confettiHtml = Array.from({ length: 22 }, (_, i) => {
            const angle = (i / 22) * Math.PI * 2;
            const dist = 76 + (i % 3) * 32;
            const tx = Math.round(Math.cos(angle) * dist);
            const ty = Math.round(Math.sin(angle) * dist);
            return `<i style="background:${cols[i % cols.length]};--tx:${tx}px;--ty:${ty}px;--r:${i * 49}deg;animation-delay:${(i % 4) * 35}ms"></i>`;
        }).join('');

        const safeName = escapeHTML(displayName);
        const safeEmail = escapeHTML(emailText);
        const avatarHtml = photoURL
            ? `<img src="${escapeHTML(photoURL)}" alt="" onerror="this.remove()">`
            : escapeHTML(initial);

        card.innerHTML = `
            <div class="fl-aw-confetti">${confettiHtml}</div>
            <div class="fl-aw-badge-wrap">
                <div class="fl-aw-ring"></div>
                <div class="fl-aw-ring r2"></div>
                <div class="fl-aw-circle">
                    <svg viewBox="0 0 24 24"><path d="M5 12.8l4.6 4.6L19 7.2"/></svg>
                </div>
            </div>
            <div class="fl-aw-pill">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.3 6.3L21 10.5l-6.7 2.2L12 19l-2.3-6.3L3 10.5l6.7-2.2L12 2z"/></svg>
                <span>Success!</span>
            </div>
            <h2 class="fl-aw-title">${isSignup ? 'Welcome to Flaynity!' : 'Welcome Back!'}</h2>
            <p class="fl-aw-sub">${isSignup ? 'Your account has been created successfully. Let’s get started!' : 'You are securely signed in. Enjoy watching, sharing & creating.'}</p>
            <div class="fl-aw-user">
                <div class="fl-aw-av">${avatarHtml}</div>
                <div class="fl-aw-umeta">
                    <div class="fl-aw-uname">${safeName}</div>
                    ${safeEmail ? `<div class="fl-aw-uemail">${safeEmail}</div>` : ''}
                </div>
            </div>
            <button type="button" class="fl-aw-btn" id="fl-aw-continue-btn">
                <span>Continue</span>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>
            <div class="fl-aw-prog"><div class="fl-aw-prog-fill"></div></div>
        `;

        if (__flWelcomeTimer) { clearTimeout(__flWelcomeTimer); __flWelcomeTimer = null; }
        ov.classList.remove('closing', 'show');
        ov.style.display = 'flex';
        void ov.offsetWidth;
        requestAnimationFrame(() => ov.classList.add('show'));

        try { playUI('success'); } catch (e) {}
        try { if (navigator.vibrate) navigator.vibrate([15, 30, 15]); } catch (e) {}

        let closed = false;
        const dismiss = () => {
            if (closed) return;
            closed = true;
            if (__flWelcomeTimer) { clearTimeout(__flWelcomeTimer); __flWelcomeTimer = null; }
            ov.classList.add('closing');
            setTimeout(() => {
                ov.classList.remove('show', 'closing');
                ov.style.display = 'none';
                if (typeof onDone === 'function') onDone();
            }, 280);
        };

        const btn = document.getElementById('fl-aw-continue-btn');
        if (btn) btn.onclick = dismiss;
        __flWelcomeTimer = setTimeout(dismiss, 2300);
    } catch (e) {
        if (typeof onDone === 'function') onDone();
    }
};

function __flTriggerPostAuthTransition(user, mode) {
    if (!user) return;
    try { localStorage.removeItem('flaynity-verify-pending'); } catch (e) {}
    window.__flJustSignedIn = true;
    window.__flPendingWelcome = { uid: user.uid, mode: mode || 'login', shown: false };
    // Show the Premium Success / Welcome Popup right away so the user never feels stuck.
    window.__flPendingWelcome.shown = true;
    window.showAuthWelcomePopup(user, mode || 'login');
    // Immediately ensure the auth handler runs (guards against Firebase not re-emitting or racing).
    if (typeof window.__flaynityAuthHandler === 'function') {
        window.__flaynityAuthHandler(user);
    }
}

let __flAuthRunSeq = 0;

auth.onAuthStateChanged(window.__flaynityAuthHandler = async (user) => {
    const runId = ++__flAuthRunSeq;
    const isStale = () => runId !== __flAuthRunSeq;

    try {
        clearUserStatusListener();
        detachAdminControlListener();

        // Wait for Home DOM (#auth-screen / #app-screen) to mount before toggling visibility.
        if (!document.getElementById('auth-screen') || !document.getElementById('app-screen')) {
            if (window.__flHomeScriptsReady) {
                try { await window.__flWithTimeout(window.__flHomeScriptsReady, 5000); } catch (e) {}
            }
        }
        if (isStale()) return;

        // New email sign-ups must finish the 4-digit code step before entering the app.
        if (user && window.vfGate && window.vfGate(user)) { window.__flBootDone && window.__flBootDone(); return; }
        if (user && typeof flaynityResumePendingHlsJobs === 'function') { try { flaynityResumePendingHlsJobs(user.uid); } catch (e) {} }
        if (!user) {
            window.__flJustSignedIn = false;
            cleanupUserSessionData();
            document.body.classList.add('auth-active');
            const appScr = document.getElementById('app-screen');
            const authScr = document.getElementById('auth-screen');
            if (appScr) appScr.style.display = 'none';
            // Account switching must open the auth Welcome choices directly, not replay onboarding.
            if (window.__flaynityDirectWelcomeAfterSwitch) {
                window.__flaynityDirectWelcomeAfterSwitch = false;
                if (authScr) authScr.style.display = 'flex';
                if (typeof window.authShowView === 'function') window.authShowView('welcome', true);
                window.__flBootDone && window.__flBootDone();
                return;
            }
            // First launch / ordinary signed-out launch keeps the existing onboarding flow.
            if (authScr) authScr.style.display = 'none';
            if (typeof window.__flaynityShowOnboarding === 'function') {
                window.__flaynityShowOnboarding();
            }
            window.__flBootDone && window.__flBootDone();
            return;
        }

        // Firebase may switch accounts without a page reload. Reset stale data when UID changes.
        if (window.__flaynityActiveDataUid && window.__flaynityActiveDataUid !== user.uid) {
            cleanupUserSessionData();
        }
        window.__flaynityActiveDataUid = user.uid;

        // If the user just actively signed in/up, they are online; do not reuse a stale offline boot promise.
        const justSignedIn = !!window.__flJustSignedIn;
        const isLiveOnline = justSignedIn
            ? true
            : (typeof window.flCheckLiveInternet === 'function'
                ? await (window.__flaynityLiveCheckPromise || window.flCheckLiveInternet(3500))
                : navigator.onLine);
        if (isStale()) return;

        if (!isLiveOnline) {
            let knownOffline = false;
            try {
                knownOffline = !!(
                    localStorage.getItem('flaynity_user_session_cache') ||
                    localStorage.getItem('flaynity_channel_created:' + user.uid) ||
                    localStorage.getItem('flaynity_channel_cache:' + user.uid)
                );
            } catch (x) {}
            if (knownOffline) {
                const a = document.getElementById('auth-screen'), s = document.getElementById('app-screen');
                if (a) a.style.display = 'none';
                if (s) s.style.display = 'block';
                document.body.classList.remove('auth-active');
                window.__flaynityOfflineSessionActive = true;
                try { window.__flaynityHideOnboarding && window.__flaynityHideOnboarding(); } catch (x) {}
                try { firebase.database().goOffline(); } catch (x) {}
                window.__flaynityHomeReady = true;
                window.__flBootDone && window.__flBootDone();
                try { renderAllSkeletons(); } catch (x) {}
                try { if (typeof initYouTabUI === 'function') initYouTabUI(); } catch (x) {}
                return;
            }
        }

        window.__flaynityLiveOnline = true;
        window.__flaynityOfflineSessionActive = false;
        try { firebase.database().goOnline(); } catch (e) {}

        // Resiliently verify account status from Firebase without letting a slow/denied read trap the user on Login/Sign-Up.
        const userRef = db.ref(`users/${user.uid}`);
        let firstData = {};
        try {
            const firstSnap = await window.__flWithTimeout(userRef.once('value'), 5000);
            firstData = firstSnap.val() || {};
        } catch (userReadErr) {
            console.warn('User profile read skipped during auth transition:', userReadErr);
        }
        if (isStale() || !auth.currentUser || auth.currentUser.uid !== user.uid) return;

        const firstStatus = String(firstData.userStatus || firstData.accountStatus || '').toLowerCase();
        if (firstStatus === 'banned') {
            window.__flJustSignedIn = false;
            document.body.classList.add('auth-active');
            const appScr = document.getElementById('app-screen');
            const authScr = document.getElementById('auth-screen');
            if (appScr) appScr.style.display = 'none';
            if (authScr) authScr.style.display = 'none';
            const ov = document.getElementById('fl-auth-welcome-overlay');
            if (ov) { ov.classList.remove('show', 'closing'); ov.style.display = 'none'; }
            window.__flBootDone && window.__flBootDone();
            showAccountBannedPopup(firstData.banReason);
            try { await auth.signOut(); } catch(e) {}
            return;
        }

        // Keep basic user metadata synced in background (non-blocking).
        try {
            const baseUpdate = {
                email: user.email || firstData.email || '',
                displayName: user.displayName || firstData.displayName || (user.email ? user.email.split('@')[0] : 'Flaynity User'),
                lastLoginAt: Date.now()
            };
            if (user.photoURL && !firstData.photoURL) baseUpdate.photoURL = user.photoURL;
            userRef.update(baseUpdate).catch(() => {});
        } catch (e) {}

        // Users without a channel must create one BEFORE the app is shown (Home never opens first).
        let needsChannel = false;
        try {
            let hasChannel = firstData.channelCreated === true || window.__flaynityChannelCreatedUid === user.uid;
            try {
                if (localStorage.getItem('flaynity_channel_created:' + user.uid) === '1' || localStorage.getItem('flaynity_channel_cache:' + user.uid)) hasChannel = true;
            } catch (e) {}

            let channelCheckConfirmedMissing = false;
            if (!hasChannel) {
                for (let i = 0; i < 2 && !hasChannel; i++) {
                    try {
                        const channelSnap = await window.__flWithTimeout(db.ref('channels/' + user.uid).once('value'), 5000);
                        if (channelSnap.exists()) { hasChannel = true; break; }
                        channelCheckConfirmedMissing = true;
                    } catch (chErr) {
                        console.warn('Channel lookup attempt failed:', chErr);
                        channelCheckConfirmedMissing = false;
                    }
                    if (i === 0 && !hasChannel) await new Promise(r => setTimeout(r, 400));
                }
            }
            if (hasChannel) { try { localStorage.setItem('flaynity_channel_created:' + user.uid, '1'); } catch (e) {} }
            if (!hasChannel && channelCheckConfirmedMissing && typeof window.showCreateChannelPage !== 'function' && window.__flHomeScriptsReady) {
                try { await window.__flWithTimeout(window.__flHomeScriptsReady, 4000); } catch (e) {}
            }
            needsChannel = !hasChannel && channelCheckConfirmedMissing && typeof window.showCreateChannelPage === 'function';
        } catch (channelCheckError) { console.warn('Create Channel check failed:', channelCheckError); }
        if (isStale() || !auth.currentUser || auth.currentUser.uid !== user.uid) return;

        // Always hide auth screen & onboarding now that authentication is confirmed.
        document.body.classList.remove('auth-active');
        if (typeof window.__flaynityHideOnboarding === 'function') {
            window.__flaynityHideOnboarding();
        }
        const authScr = document.getElementById('auth-screen');
        const appScr = document.getElementById('app-screen');
        if (authScr) authScr.style.display = 'none';

        if (window.__flPendingWelcome && window.__flPendingWelcome.uid === user.uid && !window.__flPendingWelcome.shown) {
            window.__flPendingWelcome.shown = true;
            window.showAuthWelcomePopup(user, window.__flPendingWelcome.mode);
        }
        window.__flJustSignedIn = false;

        if (needsChannel) {
            // Keep the app hidden only if Create Channel actually opened.
            if (appScr) appScr.style.display = 'none';
            window.__flaynityNeedsChannelBoot = true;
            window.__flBootDone && window.__flBootDone();
            const openedCreate = await window.showCreateChannelPage();
            if (openedCreate) return;
            // Fallback: if Create Channel did not open (e.g. channel exists), proceed to #app-screen.
        }

        window.__flaynityNeedsChannelBoot = false;
        if (appScr) appScr.style.display = 'block';
        window.__flBootDone && window.__flBootDone();
        window.__flAuthRetry = 0;

        saveAccountToList(user);
        attachAdminControlListener();

        // Keep the ban state live. If Admin bans this user while the app is open,
        // the current session is immediately closed and the ban popup is shown.
        userStatusListener = userRef;
        userStatusListener.on('value', (snapshot) => {
            const data = snapshot.val() || {};
            const status = String(data.userStatus || data.accountStatus || '').toLowerCase();
            if (status === 'banned') {
                showAccountBannedPopup(data.banReason);
                setTimeout(() => auth.signOut().catch(()=>{}), 0);
                return;
            }
            const photoURL = data.photoURL || user.photoURL || '';
            renderUserAvatar(photoURL, user.email);
        });

        _feedListenersAttached = false;
        // Start fresh listeners + direct parallel feed fetch so Home is populated before splash closes.
        startRealtimeFeedsListener();
        try { SyncManager.refreshEverything({ force: true }); } catch (e) {}
        try { window.__flWatchHomeReady && window.__flWatchHomeReady(); } catch (e) {}
        try { prefetchYouPageData(user.uid); } catch (e) {}
        restoreQueueFromLocalStorage();
        try { if (typeof initYouTabUI === 'function') initYouTabUI(); } catch (e) { console.warn('You page refresh failed:', e); }
        try {
            if (typeof window.refreshCurrentUserData === 'function') await window.refreshCurrentUserData(user.uid);
        } catch (e) { console.warn('Current account refresh failed:', e); }
        applyAdminControls();

        const activeNav = document.querySelector('.nav-item.active');
        if (activeNav) adjustHeaderForActiveTab(activeNav.id.replace('nav-', ''));

        if (window.__flaynityReturnToYouAfterAccountSwitch) {
            window.__flaynityReturnToYouAfterAccountSwitch = false;
            try {
                if (window.AppNavigation) {
                    AppNavigation.stack = [{ type: 'tab', id: 'you' }];
                    AppNavigation._fresh = true;
                    AppNavigation.syncUI();
                }

                currentChannelData = null;
                const switchedChannelSnap = await db.ref('channels/' + user.uid).once('value');
                if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;

                currentChannelData = switchedChannelSnap.val() || null;
                try {
                    if (currentChannelData) {
                        localStorage.setItem('flaynity_channel_cache:' + user.uid, JSON.stringify(currentChannelData));
                    } else {
                        localStorage.removeItem('flaynity_channel_cache:' + user.uid);
                    }
                } catch (e) {}

                window.__flaynityYouLoadToken = (window.__flaynityYouLoadToken || 0) + 1;
                const youWrap = document.getElementById('channel-action-box');
                if (youWrap) renderYouTabWithData(currentChannelData, user, youWrap);

                if (currentChannelData) {
                    openViewChannelPage();
                } else {
                    if (youWrap) renderYouTabWithData(null, user, youWrap);
                }
            } catch (switchRefreshError) {
                console.error('New account You page refresh failed:', switchRefreshError);
                try {
                    if (window.AppNavigation) {
                        AppNavigation.stack = [{ type: 'tab', id: 'you' }];
                        AppNavigation.syncUI();
                    }
                } catch (e) {}
                try { initYouTabUI(); } catch (e) {}
            }
        }

        if (window.__flaynityAccountSwitchShouldOpenChannel) {
            window.__flaynityAccountSwitchShouldOpenChannel = false;
            currentChannelData = null;
            try {
                const channelSnapshot = await db.ref(`channels/${user.uid}`).once('value');
                currentChannelData = channelSnapshot.val();
                if (currentChannelData) {
                    try { localStorage.setItem('flaynity_channel_cache:' + user.uid, JSON.stringify(currentChannelData)); } catch (e) {}
                    openViewChannelPage();
                } else {
                    try { localStorage.removeItem('flaynity_channel_cache:' + user.uid); } catch (e) {}
                    const current = AppNavigation.current();
                    if (current && current.type === 'page' && current.id === 'view-channel-page') AppNavigation.pop();
                    AppNavigation.pushTab('you');
                }
            } catch (channelError) {
                console.error('Unable to resolve selected account channel:', channelError);
                if (navigator.onLine) showNotification('Unable to load this account Channel.', 'error');
            }
        }
    } catch (e) {
        console.error('Auth status sync error:', e);
        const code = String((e && e.code) || '');
        const realAuthProblem = /^auth\/(user-disabled|user-not-found|user-token-expired|invalid-user-token|requires-recent-login)$/.test(code);
        const cu = auth.currentUser;
        if (cu && !realAuthProblem) {
            // Never trap an authenticated user on the Login / Sign-Up screen.
            const a = document.getElementById('auth-screen'), s = document.getElementById('app-screen');
            if (a) a.style.display = 'none';
            if (s) s.style.display = 'block';
            document.body.classList.remove('auth-active');
            try { window.__flaynityHideOnboarding && window.__flaynityHideOnboarding(); } catch (x) {}
            window.__flBootDone && window.__flBootDone();
            try { startRealtimeFeedsListener(); } catch (x) {}
            try { if (window.__flaynityLiveOnline !== false) SyncManager.refreshEverything({ force: true }); } catch (x) {}
            try { window.__flWatchHomeReady && window.__flWatchHomeReady(); } catch (x) {}
        } else {
            window.__flBootDone && window.__flBootDone();
            try { await auth.signOut(); } catch (err) {}
        }
    }
});
function renderUserAvatar(photoURL, email) {
    const avatarNav = document.getElementById('nav-avatar-img');
    if (avatarNav) {
        const _chUrl = flNavChannelAvatarUrl();
        if (_chUrl || photoURL) {
            flSetNavAvatar(_chUrl || photoURL);
        } else {
            const initial = email ? email.charAt(0).toUpperCase() : 'U';
            avatarNav.innerHTML = `<div style="background: linear-gradient(135deg, var(--primary), #FF7A00); color: white; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.75rem;">${initial}</div>`;
        }
    }
}

function handleAvatarClick() {
    playUI('click');
    const choice = confirm("Profile Options:\n\n[OK] - Upload Profile Picture\n[Cancel] - Log Out");
    if (choice) {
        if (typeof window.openMediaPicker === 'function' && mpBridge() && mpEl('media-picker')) {
            window.openMediaPicker('user-avatar', function(file) { uploadUserAvatarToR2Engine({ files: [file] }); });
            return;
        }
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = function() { uploadUserAvatarToR2Engine(fileInput); };
        fileInput.click();
    } else {
        logout();
    }
}

async function uploadUserAvatarToR2Engine(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    showNotification("Uploading profile picture...", "success");
    try {
        const secureUrl = await uploadImageToR2(file, "avatars");
        const currentUser = auth.currentUser;
        if (currentUser) {
            await currentUser.updateProfile({ photoURL: secureUrl });
            await db.ref(`users/${currentUser.uid}`).update({ photoURL: secureUrl });
            showNotification("Profile picture updated successfully!", "success");
        }
    } catch (err) {
        showNotification("Upload failed.", "error");
    }
}

async function signInWithGoogle() {
    playUI('click');
    try { localStorage.removeItem('flaynity-verify-pending'); } catch (e) {}
    if (window.AndroidBridge && typeof window.AndroidBridge.triggerGoogleSignIn === 'function') {
        window.AndroidBridge.triggerGoogleSignIn();
    } else {
        try {
            await authApplyPersistence();
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await auth.signInWithPopup(provider);
            saveAccountToList(result.user);
            const isNew = !!(result.additionalUserInfo && result.additionalUserInfo.isNewUser);
            __flTriggerPostAuthTransition(result.user, isNew ? 'signup' : 'login');
        } catch (err) {
            showNotification(authFriendlyError(err), "error");
        }
    }
}

window.handleNativeGoogleSignIn = async function(idToken) {
    if (!idToken) {
        showNotification("Google Sign-In cancelled.", "error");
        return;
    }
    try { localStorage.removeItem('flaynity-verify-pending'); } catch (e) {}
    try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
        const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
        const result = await auth.signInWithCredential(credential);
        saveAccountToList(result.user);
        const isNew = !!(result.additionalUserInfo && result.additionalUserInfo.isNewUser);
        __flTriggerPostAuthTransition(result.user, isNew ? 'signup' : 'login');
    } catch (err) {
        showNotification("Native Auth Error: " + authFriendlyError(err), "error");
    }
};

// =========================================================
// AUTH SCREEN (Welcome / Log In / Create Account)
// =========================================================
window.authShowView = function (name, back) {
    const views = { welcome: 'au-welcome', login: 'au-login', signup: 'au-signup' };
    const target = document.getElementById(views[name] || 'au-welcome');
    if (!target) return;
    try { playUI('click'); } catch (e) {}
    Object.values(views).forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('active'); el.classList.remove('back-anim'); }
    });
    if (back) target.classList.add('back-anim');
    target.classList.add('active');
    try { const a = document.activeElement; if (a && a.blur) a.blur(); } catch (e) {}
};

window.authTogglePass = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    if (btn) btn.style.color = show ? '#4B1FD0' : '#8B8B93';
};

function authFriendlyError(err) {
    const code = (err && err.code) || '';
    const map = {
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/invalid-login-credentials': 'Incorrect email or password.',
        'auth/email-already-in-use': 'This email is already registered. Please log in.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/network-request-failed': 'No internet connection.',
        'auth/popup-closed-by-user': 'Sign-in was cancelled.',
        'auth/operation-not-allowed': 'This sign-in method is not enabled yet.',
        'auth/account-exists-with-different-credential': 'An account already exists with this email using another sign-in method.'
    };
    return map[code] || (err && err.message) || 'Something went wrong.';
}

function authSetBusy(btnId, busy, idleText) {
    const b = document.getElementById(btnId);
    if (!b) return;
    b.disabled = !!busy;
    b.textContent = busy ? 'Please wait...' : idleText;
}

async function authApplyPersistence() {
    // "Remember me" is checked by default, so the user signs in only once.
    const box = document.getElementById('au-remember');
    const keep = !box || box.checked;
    try {
        await auth.setPersistence(keep ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
    } catch (e) {}
}

window.authEmailLogin = async function () {
    playUI('click');
    const email = (document.getElementById('au-login-email').value || '').trim();
    const pass = document.getElementById('au-login-pass').value || '';
    if (!email || !pass) { showNotification('Please enter your email and password.', 'error'); return; }
    authSetBusy('au-login-btn', true, 'Log In');
    try {
        try { localStorage.removeItem('flaynity-verify-pending'); } catch (e) {}
        await authApplyPersistence();
        const result = await auth.signInWithEmailAndPassword(email, pass);
        saveAccountToList(result.user);
        __flTriggerPostAuthTransition(result.user, 'login');
    } catch (err) {
        showNotification(authFriendlyError(err), 'error');
    } finally {
        authSetBusy('au-login-btn', false, 'Log In');
    }
};

window.authEmailSignup = async function () {
    playUI('click');
    const name = (document.getElementById('au-signup-name').value || '').trim();
    const email = (document.getElementById('au-signup-email').value || '').trim();
    const pass = document.getElementById('au-signup-pass').value || '';
    if (!name) { showNotification('Please enter your full name.', 'error'); return; }
    if (!email) { showNotification('Please enter your email.', 'error'); return; }
    if (pass.length < 6) { showNotification('Password must be at least 6 characters.', 'error'); return; }
    authSetBusy('au-signup-btn', true, 'Get Started');
    try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
        // Hold the app back: the verification page opens instead of the home screen.
        try { localStorage.setItem('flaynity-verify-pending', 'pending'); localStorage.removeItem('flaynity-verify-sent'); localStorage.removeItem('flaynity-verify-token'); } catch (e) {}
        const result = await auth.createUserWithEmailAndPassword(email, pass);
        try { await result.user.updateProfile({ displayName: name }); } catch (e) {}
        saveAccountToList(result.user);
        window.vfBegin(result.user);
    } catch (err) {
        try { localStorage.removeItem('flaynity-verify-pending'); } catch (e) {}
        showNotification(authFriendlyError(err), 'error');
    } finally {
        authSetBusy('au-signup-btn', false, 'Get Started');
    }
};


// =========================================================
// EMAIL VERIFICATION — 4-digit code (valid 60s, resend cooldown 60s)
// Backend: Firebase Cloud Functions `sendEmailCode` + `verifyEmailCode`
// =========================================================
(function () {
    const KEY = 'flaynity-verify-pending';
    const SENT_KEY = 'flaynity-verify-sent';
    const TOKEN_KEY = 'flaynity-verify-token';
    const COOLDOWN = 60; // seconds
    let timer = null, busy = false, retryMode = false, done = false;

    const $ = (id) => document.getElementById(id);
    const boxes = () => Array.from(document.querySelectorAll('#vf-boxes .vf-box'));
    const ls = {
        get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
        del: (k) => { try { localStorage.removeItem(k); } catch (e) {} }
    };
    // Use only the custom authorization domain for email verification.
    const VF_API = 'https://authorization.flaynity-app.indevs.in';
    const fn = (name) => async (data) => {
        const user = auth.currentUser;
        if (!user) { const e = new Error('Please sign in first.'); e.code = 'functions/unauthenticated'; throw e; }
        const token = await user.getIdToken();
        let res, j = {};
        try {
            res = await fetch(VF_API + '/' + name, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(data || {})
            });
            j = await res.json().catch(() => ({}));
        } catch (netErr) {
            const e = new Error('Unable to reach the verification server. Please check your connection and try again.');
            e.code = 'functions/unavailable';
            throw e;
        }
        if (!res.ok || j.ok === false) {
            const e = new Error(j.error || ('Verification server returned HTTP ' + res.status));
            e.code = 'functions/' + (j.code || 'error');
            throw e;
        }
        return j;
    };

    function setError(msg) {
        $('vf-error').textContent = msg || '';
        $('vf-boxes').classList.toggle('err', !!msg);
    }
    function setRetry(on) {
        retryMode = on;
        $('vf-submit').textContent = on ? 'Try Again' : 'Submit code';
    }
    function clearBoxes(focus) {
        boxes().forEach(b => { b.value = ''; });
        if (focus) { const f = boxes()[0]; if (f) f.focus(); }
    }
    function readCode() { return boxes().map(b => b.value).join(''); }

    function remaining() {
        const t = parseInt(ls.get(SENT_KEY) || '0', 10);
        if (!t) return 0;
        return Math.max(0, COOLDOWN - Math.floor((Date.now() - t) / 1000));
    }
    function paintResend() {
        const btn = $('vf-resend');
        if (!btn) return;
        const r = remaining();
        if (r > 0) {
            btn.disabled = true;
            btn.textContent = 'Resend code in ' + Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0');
        } else {
            btn.disabled = false;
            btn.textContent = 'Resend code';
            if (timer) { clearInterval(timer); timer = null; }
        }
    }
    function startTimer() {
        if (timer) clearInterval(timer);
        paintResend();
        if (remaining() > 0) timer = setInterval(paintResend, 500);
    }

    function showCard(which) {
        $('vf-card-code').style.display = which === 'code' ? 'flex' : 'none';
        $('vf-card-success').style.display = which === 'success' ? 'flex' : 'none';
        $('au-verify').querySelector('.vf-back').style.display = which === 'code' ? 'flex' : 'none';
    }

    function showView(user) {
        document.body.classList.add('auth-active');
        const appScr = $('app-screen'); if (appScr) appScr.style.display = 'none';
        try { if (typeof window.__flaynityHideOnboarding === 'function') window.__flaynityHideOnboarding(); } catch (e) {}
        const authScr = $('auth-screen'); if (authScr) authScr.style.display = 'flex';
        ['au-welcome', 'au-login', 'au-signup'].forEach(id => { const el = $(id); if (el) el.classList.remove('active'); });
        const v = $('au-verify');
        if (!v.classList.contains('active')) v.classList.add('active');
        $('vf-email').textContent = (user && user.email) || '';
        if (!done) {
            showCard('code');
            startTimer();
            setTimeout(() => { const f = boxes()[0]; if (f && !readCode()) f.focus(); }, 380);
        }
    }

    // Called by onAuthStateChanged: true => hold the app back and show the code page.
    window.vfGate = function (user) {
        let v = ls.get(KEY);
        if (v === 'pending') { ls.set(KEY, user.uid); v = user.uid; }
        if (!v || v !== user.uid) return false;
        showView(user);
        return true;
    };

    async function sendCode(isResend) {
        try {
            const sent = await fn('sendEmailCode')({ prev: ls.get(TOKEN_KEY) || '' });
            ls.set(TOKEN_KEY, sent.token || '');
            ls.set(SENT_KEY, String(Date.now()));
            startTimer();
            if (isResend) showNotification('A new code has been sent.', 'success');
        } catch (err) {
            const m = (err && err.message) || 'Could not send the code.';
            if (err && err.code === 'functions/resource-exhausted') {
                ls.set(SENT_KEY, String(Date.now()));
                startTimer();
            }
            showNotification(m, 'error', 3500);
            if (!(err && err.code === 'functions/resource-exhausted')) $('vf-error').textContent = m;
        }
    }

    window.vfBegin = async function (user) {
        done = false; setError(''); setRetry(false); clearBoxes(false);
        if (ls.get(KEY) === 'pending') ls.set(KEY, user.uid);
        showView(user);
        await sendCode(false);
    };

    window.vfResend = async function () {
        if (remaining() > 0 || busy) return;
        try { playUI('click'); } catch (e) {}
        setError(''); setRetry(false); clearBoxes(true);
        busy = true;
        await sendCode(true);
        busy = false;
    };

    window.vfSubmit = async function () {
        try { playUI('click'); } catch (e) {}
        if (retryMode) { setError(''); setRetry(false); clearBoxes(true); return; }
        if (busy) return;
        const code = readCode();
        if (code.length < 4) { setError('Please enter the 4-digit code.'); setRetry(true); return; }
        busy = true;
        const btn = $('vf-submit'); btn.disabled = true; btn.textContent = 'Please wait...';
        try {
            await fn('verifyEmailCode')({ code, token: ls.get(TOKEN_KEY) || '' });
            done = true;
            ls.del(KEY); ls.del(SENT_KEY); ls.del(TOKEN_KEY);
            if (timer) { clearInterval(timer); timer = null; }
            try { if (auth.currentUser) await auth.currentUser.reload(); } catch (e) {}
            if (auth.currentUser && typeof window.showAuthWelcomePopup === 'function') {
                window.__flJustSignedIn = true;
                window.showAuthWelcomePopup(auth.currentUser, 'signup', () => window.vfContinue());
            } else {
                showCard('success');
            }
        } catch (err) {
            setError((err && err.message) || 'The code you entered is incorrect. Please try again.');
            setRetry(true);
        } finally {
            busy = false; btn.disabled = false;
            btn.textContent = retryMode ? 'Try Again' : 'Submit code';
        }
    };

    window.vfContinue = function () {
        try { playUI('click'); } catch (e) {}
        done = false;
        const hideVerify = () => { const v = $('au-verify'); if (v) v.classList.remove('active'); };
        if (typeof window.__flaynityAuthHandler === 'function' && auth.currentUser) {
            // Keep the verify page until the next page (Create your Channel) is on screen.
            Promise.resolve(window.__flaynityAuthHandler(auth.currentUser)).then(hideVerify, hideVerify);
            setTimeout(hideVerify, 6000);
        } else { hideVerify(); location.reload(); }
    };

    // Back arrow: cancel sign-up (the unverified account is removed so the email can be reused).
    window.vfBack = async function () {
        try { playUI('click'); } catch (e) {}
        const user = auth.currentUser;
        ls.del(KEY); ls.del(SENT_KEY); ls.del(TOKEN_KEY);
        if (timer) { clearInterval(timer); timer = null; }
        try { if (user) await user.delete(); } catch (e) { try { await auth.signOut(); } catch (e2) {} }
        $('au-verify').classList.remove('active');
        setError(''); setRetry(false); clearBoxes(false);
        if (typeof window.authShowView === 'function') window.authShowView('signup', true);
    };

    // Terms / Privacy — open in external browser without navigating/refreshing the WebView
    const FL_TERMS_URL = 'https://flaynity.com/terms-of-service';
    const FL_PRIVACY_URL = 'https://flaynity.com/privacy-policy';
    let legalUrl = '';

    function resolveLegalUrl(url, title) {
        const u = String(url || '').toLowerCase();
        const t = String(title || '').toLowerCase();
        if (u.includes('privacy') || t.includes('privacy')) return FL_PRIVACY_URL;
        if (u.includes('terms') || t.includes('terms')) return FL_TERMS_URL;
        return url || FL_TERMS_URL;
    }

    function openViaAndroidBridge(targetUrl) {
        try {
            const b = window.AndroidBridge;
            if (!b) return false;
            const methods = ['openExternalUrl', 'openExternalBrowser', 'openInBrowser', 'openBrowser', 'openUrl'];
            for (let i = 0; i < methods.length; i++) {
                if (typeof b[methods[i]] === 'function') {
                    b[methods[i]](targetUrl);
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function openLegalOverlay(targetUrl, title) {
        const page = $('vf-legal-page');
        const frame = $('vf-legal-frame');
        const heading = $('vf-legal-title');
        if (!page || !frame) return false;
        if (page.parentElement !== document.body) document.body.appendChild(page);
        if (heading) heading.textContent = title || (targetUrl.includes('privacy') ? 'Privacy Policy' : 'Terms of Service');
        frame.src = targetUrl;
        page.classList.add('open');
        try {
            if (window.AndroidBridge && typeof window.AndroidBridge.setBackStackStatus === 'function') {
                window.AndroidBridge.setBackStackStatus(true);
            }
        } catch (e) {}
        return true;
    }

    function openInBrowser(targetUrl, title) {
        if (!targetUrl) return;
        // 1. Native Android external browser bridge (never touches WebView history)
        if (openViaAndroidBridge(targetUrl)) return;

        // 2. Inside Android WebView without a native openExternalUrl bridge:
        //    Do NOT call window.location.href or top-frame <a> click (which unloads the app and refreshes on Back).
        //    Open inside the non-destructive overlay so Back returns cleanly without refreshing the app.
        const isWebView = !!window.AndroidBridge || /; wv\)/i.test(navigator.userAgent || '');
        if (isWebView) {
            if (openLegalOverlay(targetUrl, title)) return;
        }

        // 3. Normal mobile/desktop browser: open in a new tab (app tab stays untouched)
        try {
            const win = window.open(targetUrl, '_blank');
            if (win) { try { win.opener = null; } catch (e) {} return; }
        } catch (e) {}
        try {
            const a = document.createElement('a');
            a.href = targetUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) {}
    }

    window.vfOpenLegal = function (url, title) {
        legalUrl = resolveLegalUrl(url, title);
        openInBrowser(legalUrl, title);
    };
    window.vfCloseLegal = function () {
        const p = $('vf-legal-page'); if (p) p.classList.remove('open');
        const f = $('vf-legal-frame'); if (f) f.src = 'about:blank';
        try { if (window.AppNavigation && typeof AppNavigation.updateBridge === 'function') AppNavigation.updateBridge(); } catch (e) {}
    };
    window.vfLegalExternal = function () {
        const target = legalUrl || FL_TERMS_URL;
        if (openViaAndroidBridge(target)) { window.vfCloseLegal(); return; }
        try {
            const win = window.open(target, '_blank');
            if (win) { try { win.opener = null; } catch (e) {} }
        } catch (e) {}
    };

    // Global capture: intercept any Terms of Service / Privacy Policy tap so WebView never navigates away
    document.addEventListener('click', function (e) {
        const el = e.target && e.target.closest ? e.target.closest('a, button, [role="button"], .you-menu-item, .setting-item, .sheet-option-item') : null;
        if (!el) return;
        if (el.closest && el.closest('#vf-legal-page')) return;
        const href = String(el.getAttribute('href') || '');
        const txt = String(el.textContent || '').replace(/\s+/g, ' ').trim();
        const isTerms = /terms[-_ ]?of[-_ ]?service/i.test(href) || /^terms of service$/i.test(txt) || txt === 'সেবার শর্তাবলি';
        const isPrivacy = /privacy[-_ ]?policy/i.test(href) || /^privacy policy$/i.test(txt) || txt === 'গোপনীয়তা নীতি';
        if (!isTerms && !isPrivacy) return;
        e.preventDefault();
        e.stopPropagation();
        const targetUrl = isPrivacy ? FL_PRIVACY_URL : FL_TERMS_URL;
        const targetTitle = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
        window.vfOpenLegal(targetUrl, targetTitle);
    }, true);

    // Digit boxes: type, backspace, paste
    document.addEventListener('input', function (e) {
        const t = e.target;
        if (!t || !t.classList || !t.classList.contains('vf-box')) return;
        t.value = (t.value || '').replace(/\D/g, '').slice(-1);
        if ($('vf-boxes').classList.contains('err') && !retryMode) setError('');
        const list = boxes(), i = list.indexOf(t);
        if (t.value && i < list.length - 1) list[i + 1].focus();
    });
    document.addEventListener('keydown', function (e) {
        const t = e.target;
        if (!t || !t.classList || !t.classList.contains('vf-box')) return;
        const list = boxes(), i = list.indexOf(t);
        if (e.key === 'Backspace' && !t.value && i > 0) { list[i - 1].focus(); list[i - 1].value = ''; }
        if (e.key === 'Enter') window.vfSubmit();
    });
    document.addEventListener('paste', function (e) {
        const t = e.target;
        if (!t || !t.classList || !t.classList.contains('vf-box')) return;
        const text = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '').slice(0, 4);
        if (!text) return;
        e.preventDefault();
        const list = boxes();
        text.split('').forEach((d, k) => { if (list[k]) list[k].value = d; });
        list[Math.min(text.length, list.length - 1)].focus();
    });
})();

window.authForgotPassword = async function () {
    playUI('click');
    const loginEmail = document.getElementById('au-login-email');
    const signupEmail = document.getElementById('au-signup-email');
    const email = ((loginEmail && loginEmail.value) || (signupEmail && signupEmail.value) || '').trim();
    if (!email) { showNotification('Enter your email first, then tap Forgot password.', 'error'); return; }
    try {
        await auth.sendPasswordResetEmail(email);
        showNotification('Password reset email sent. Check your inbox.', 'success', 3500);
    } catch (err) {
        showNotification(authFriendlyError(err), 'error');
    }
};

window.authSocialSignIn = async function (kind) {
    playUI('click');
    try {
        let provider;
        if (kind === 'facebook') provider = new firebase.auth.FacebookAuthProvider();
        else if (kind === 'apple') provider = new firebase.auth.OAuthProvider('apple.com');
        else return signInWithGoogle();
        try { localStorage.removeItem('flaynity-verify-pending'); } catch (e) {}
        await authApplyPersistence();
        const result = await auth.signInWithPopup(provider);
        saveAccountToList(result.user);
        const isNew = !!(result.additionalUserInfo && result.additionalUserInfo.isNewUser);
        __flTriggerPostAuthTransition(result.user, isNew ? 'signup' : 'login');
    } catch (err) {
        showNotification(authFriendlyError(err), 'error');
    }
};

function logout() { 
    cleanupUserSessionData();
    auth.signOut(); 
}

// =========================================================
// FAST PARALLEL UPLOAD ENGINE & WATCHDOG
// =========================================================
let uploadQueue = [];
let activeUploadsCount = 0;
const MAX_CONCURRENT_UPLOADS = 3;

setInterval(() => {
    if (!navigator.onLine) return;
    const hasWaiting = uploadQueue.some(item => item.status === 'waiting');
    if (hasWaiting && activeUploadsCount < MAX_CONCURRENT_UPLOADS) {
        console.log("[Watchdog] Triggering queued uploads...");
        triggerNextActiveUpload();
    }
}, 3000);

async function triggerNextActiveUpload() {
    if (!navigator.onLine) return;

    for (let i = 0; i < uploadQueue.length; i++) {
        if (activeUploadsCount >= MAX_CONCURRENT_UPLOADS) break;
        
        const item = uploadQueue[i];
        if (item.status === 'waiting') {
            activeUploadsCount++;
            startS3DirectUpload(item);
        }
    }
}

async function startS3DirectUpload(item) {
    if (!navigator.onLine) {
        item.status = "paused"; updateManagerUI();
        showNotification("Offline: Upload paused.", "error");
        activeUploadsCount = Math.max(0, activeUploadsCount - 1);
        return;
    }
    item.status = "uploading"; item.progress = item.progress || 0; ensureLiveUploadStyles(); updateManagerUI();
    const startTime = Date.now();
    try {
        if (item.file && item.file.isLazyNativeFile && item.file.sourceUrl) {
            item.processingMsg = "Preparing video file...";
            updateManagerUI();
            const fRes = await fetch(item.file.sourceUrl);
            if (!fRes.ok) throw new Error('Failed to read local video (' + fRes.status + ')');
            const fBlob = await fRes.blob();
            if (!fBlob.size) throw new Error('Selected video file is empty');
            item.file = new File([fBlob], item.file.name || (`video_${Date.now()}.mp4`), {
                type: item.file.type || fBlob.type || 'video/mp4',
                lastModified: Date.now()
            });
            item.processingMsg = "";
            updateManagerUI();
        }
        const uploadFolder = item.type === 'video-short' ? 'feels' : 'videos';
        const upload = item.upload || await uploadMediaToFlaynity(item.file, uploadFolder, (loaded, total) => {
            if (item.status !== 'uploading') return;
            item.progress = Math.round((loaded / total) * 100);
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0) { item.speed = loaded / elapsed; item.eta = (total - loaded) / item.speed; }
            updateManagerUI();
        }, item.control);

        item.upload = upload;
        if (item.status === 'cancelled') return;
        item.key = upload.key;
        if (item.status === 'cancelled') return;

        // Original MP4 uploaded to R2 — publish immediately, then transcode HLS (360p–1080p) in background
        const rawMp4Url = normalizeFlaynityMediaUrl(upload.publicUrl || flaynityMediaUrl(upload.key));
        item.mp4FallbackUrl = rawMp4Url;
        item.sourceKey = upload.key;
        item.videoProvider = "r2";
        item.videoUrl = rawMp4Url;
        item.videoLink = rawMp4Url;
        item.hlsStatus = "idle";
        item.hlsJobId = "";

        item.status = "processing";
        item.retryCount = 0;
        item.processingMsg = "Publishing Feed...";
        item.progress = 100;
        updateManagerUI();

        // Fire quick non-blocking queue request (<1s) so Modal starts encoding while we publish right away
        try {
            const queued = await flaynityQueueHlsTranscode(item, upload.key, rawMp4Url);
            if (queued && queued.jobId) {
                item.hlsJobId = queued.jobId;
                item.hlsStatus = "processing";
                item.hlsPendingApiBase = queued.apiBase;
            }
        } catch (hlsErr) {
            console.warn("Modal HLS background queue skipped (MP4 active):", hlsErr);
        }

        if (item.status === 'cancelled') return;
        await runPostUploadProcessingSequence(item);
    } catch (err) {
        if (item.status === 'cancelled') return;
        if (err.encodingFailed) { item.status = 'failed'; updateManagerUI(); showNotification(err.message, 'error'); }
        else if (item.status === 'paused') { console.log("Upload paused safely."); }
        else if (!navigator.onLine) {
            item.status = "paused"; updateManagerUI();
            showNotification("Connection lost. Upload paused.", "error");
        } else {
            console.error("Upload error: ", err);
            item.retryCount = (item.retryCount || 0) + 1;
            if (item.retryCount <= 5) {
                item.status = "waiting"; updateManagerUI();
                showNotification(`Network hiccup. Retrying (${item.retryCount}/5)...`, "error");
            } else {
                item.status = "failed"; updateManagerUI();
                showNotification(`Upload failed: ${err.message}`, "error");
            }
        }
    } finally {
        activeUploadsCount = Math.max(0, activeUploadsCount - 1);
        triggerNextActiveUpload();
    }
}

async function runPostUploadProcessingSequence(item) {
    item.status = "processing";
    item.progress = 0;
    updateManagerUI();

    try {
        let finalThumbBlob = item.thumbBlob;
        if (!finalThumbBlob && item.thumbDataUrl && item.thumbDataUrl.startsWith('data:')) {
            try { finalThumbBlob = dataURLtoBlob(item.thumbDataUrl); } catch (e) {}
        }

        if (finalThumbBlob) {
            const thumbFile = new File([finalThumbBlob], `thumb_${item.id}.jpg`, { type: "image/jpeg" });
            const thumbUpload = await uploadMediaToFlaynity(thumbFile, "thumbnails");
            item.thumbKey = thumbUpload.key;
            item.thumbUrl = thumbUpload.publicUrl;
        } else {
            item.thumbUrl = item.thumbDataUrl || item.streamThumbnail || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=500&auto=format&fit=crop";
        }

        item.processingMsg = "Publishing Feed...";
        item.progress = 100;
        updateManagerUI();

        if (item.status === 'cancelled') return;
        await pushVideoMetadataToDatabase(item);

        // Firebase publication is complete once the direct MP4 metadata write succeeds.
        item.status = "completed";
        updateManagerUI();
        saveQueueStateToLocalStorage();
        showNotification(`"${item.title}" published successfully.`, "success");

    } catch (err) {
        item.status = "failed";
        updateManagerUI();
        showNotification("Post-processing error: " + err.message, "error");
    }
}

function extractHashtags(text) {
    const regex = /#\w+/g;
    const match = text.match(regex);
    return match ? match.join(' ') : "";
}

async function pushVideoMetadataToDatabase(item) {
    const user = auth.currentUser;
    if (!user || user.uid !== item.ownerId) throw new Error('Sign in with the uploading account to publish.');

    const userSnap = await db.ref(`users/${user.uid}`).once('value');
    const uData = userSnap.val() || {};
    const username = uData.username || user.email.split('@')[0];

    const resolution = item.resolution || '';
    const hashtags = extractHashtags(item.description);

    const isScheduled = item.scheduledTime && item.scheduledTime > Date.now();

    const moviePayload = {
        id: item.id,
        userId: user.uid,
        channelId: user.uid,
        title: item.title,
        description: item.description,
        tags: hashtags,
        category: currentChannelData?.category || "Entertainment",
        duration: formatDuration(item.duration),
        resolution: resolution,
        sourceWidth: 0,
        sourceHeight: 0,
        aspectRatio: 0,
        poster: item.thumbUrl || item.thumbDataUrl || "",
        banner: item.thumbUrl || item.thumbDataUrl || "",
        videoLink: item.videoUrl,
        hlsUrl: item.hlsUrl || '',
        mp4FallbackUrl: item.mp4FallbackUrl || item.videoUrl,
        hlsRenditions: item.hlsRenditions || [],
        hlsJobId: item.hlsJobId || '',
        hlsStatus: item.hlsStatus || (item.videoProvider === 'r2-hls' ? 'ready' : 'idle'),
        videoProvider: item.videoProvider || 'r2',
        streamUid: '',
        sourceKey: item.sourceKey || item.key || '',
        uploadTime: Date.now(),
        updateTime: Date.now(),
        visibility: item.visibility,
        status: isScheduled ? "scheduled" : "published",
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        subscribers: currentChannelData?.subscribersCount || 0,
        isShort: item.type === 'video-short',
        isPost: false,
        language: "English",
        location: "Global",
        rating: "8.5",
        releaseDate: new Date().getFullYear().toString(),
        allowComments: item.allowComments,
        showLikes: item.showLikes,
        username: username,
        channelAvatar: currentChannelData?.avatarUrl || user.photoURL || "",
        createdAt: Date.now(),
        scheduledTime: item.scheduledTime || 0
    };

    const targetPath = item.type === 'video-short' 
        ? `admin_panel/movies/feels/${item.id}` 
        : `admin_panel/movies/user_uploads/${item.id}`;
        
    await db.ref(targetPath).set(moviePayload);

    if (item.hlsJobId && item.hlsStatus === 'processing') {
        flaynityTrackBackgroundHlsJob({
            jobId: item.hlsJobId,
            itemId: item.id,
            targetPath,
            isShort: item.type === 'video-short',
            ownerId: user.uid,
            apiBase: item.hlsPendingApiBase || flaynityApiOriginFromMedia(item.mp4FallbackUrl || item.videoUrl),
            createdAt: Date.now()
        });
    }

    if (!isScheduled) {
        if (item.type === 'video-short') {
            const idx = allFeels.findIndex(s => s.id === item.id);
            if (idx !== -1) allFeels[idx] = moviePayload;
            else allFeels.unshift(moviePayload);
            
            buildFeelsPage();
        } else {
            const idx = allLongVideos.findIndex(v => v.id === item.id);
            if (idx !== -1) allLongVideos[idx] = moviePayload;
            else allLongVideos.unshift(moviePayload);
        }

        buildHomeFeed();

        const activePage = AppNavigation.current();
        if (activePage && activePage.id === 'view-channel-page') {
            if (item.type === 'video-short') renderChannelFeels(user.uid);
            else renderChannelVideos(user.uid);
        }
    }
}

// Queue Helper Functions
function escapeUploadTitle(value) { return escapeHTML(String(value || "Upload")); }

function uploadQueueTypeForChannel(item) { return item.type === 'video-short' ? 'feels' : 'videos'; }

function uploadStatusText(item) {
    if (item.status === 'uploading') return `${Math.max(0, item.progress || 0)}% uploading`;
    if (item.status === 'paused') return `${Math.max(0, item.progress || 0)}% paused`;
    if (item.status === 'waiting') return 'Waiting to upload';
    if (item.status === 'processing') return item.processingMsg || 'Processing…';
    if (item.status === 'failed') return 'Upload failed';
    if (item.status === 'completed') return 'Published';
    return item.status || 'Preparing…';
}

function buildLiveUploadCard(item) {
    const pct = Math.max(0, Math.min(100, Number(item.progress) || 0));
    const paused = item.status === 'paused';
    const failed = item.status === 'failed';
    const done = item.status === 'completed';
    const busy = item.status === 'uploading' || item.status === 'processing';
    const action = busy ? `pauseUploadItem('${item.id}')` : (paused || item.status === 'waiting' ? `resumeUploadItem('${item.id}')` : `retryUploadItem('${item.id}')`);
    const actionIcon = busy ? 'pause' : 'play';
    const thumb = item.thumbDataUrl || item.streamThumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=500&auto=format&fit=crop';
    return `<div class="fl-live-upload-card" id="live-upload-${item.id}">
        <div class="fl-live-upload-head">
            <img src="${thumb}" class="fl-live-upload-thumb">
            <div class="fl-live-upload-info">
                <div class="fl-live-upload-title">${escapeUploadTitle(item.title)}</div>
                <div class="fl-live-upload-status">${escapeHTML(uploadStatusText(item))}</div>
            </div>
            <button class="fl-upload-more" onclick="renameUploadItem('${item.id}')"><i class="fas fa-pen"></i></button>
        </div>
        <div class="fl-live-progress"><div style="width:${pct}%"></div></div>
        <div class="fl-live-upload-actions">
            ${done ? '<span class="fl-upload-published"><i class="fas fa-check-circle"></i> Published</span>' : `
            <button onclick="${action}"><i class="fas fa-${actionIcon}"></i> ${busy ? 'Pause' : 'Resume'}</button>
            <button onclick="retryUploadItem('${item.id}')"><i class="fas fa-rotate-right"></i> Retry</button>
            <button class="danger" onclick="cancelUploadItem('${item.id}')"><i class="fas fa-xmark"></i> Cancel</button>`}
        </div>
    </div>`;
}

function renderChannelUploadQueue(type) {
    const grid = document.getElementById(type === 'feels' ? 'channel-feels-grid' : 'channel-videos-grid');
    if (!grid || typeof uploadQueue === 'undefined') return;
    const items = uploadQueue.filter(i => uploadQueueTypeForChannel(i) === type && i.status !== 'completed' && i.status !== 'cancelled');
    grid.querySelectorAll('.fl-live-upload-card').forEach(el => el.remove());
    if (!items.length) return;
    const html = items.map(buildLiveUploadCard).join('');
    grid.insertAdjacentHTML('afterbegin', html);
}

function findUploadItem(id) { return uploadQueue.find(i => i.id === id); }

function pauseUploadItem(id) {
    const item = findUploadItem(id); if (!item || item.status !== 'uploading') return;
    item.status = 'paused';
    try { if (item.control && item.control.xhr) item.control.xhr.abort(); } catch(e) {}
    updateManagerUI(); saveQueueStateToLocalStorage();
}

function resumeUploadItem(id) {
    const item = findUploadItem(id); if (!item || !['paused', 'failed', 'waiting'].includes(item.status)) return;
    item.status = 'waiting'; item.retryCount = 0;
    updateManagerUI(); saveQueueStateToLocalStorage(); triggerNextActiveUpload();
}

function retryUploadItem(id) {
    const item = findUploadItem(id); if (!item || !['paused', 'failed', 'waiting'].includes(item.status)) return;
    item.status = 'waiting'; item.retryCount = 0; item.progress = 0;
    item.control = { xhr: null, uploadUrl: "" };
    updateManagerUI(); saveQueueStateToLocalStorage(); triggerNextActiveUpload();
}

function cancelUploadItem(id) {
    const item = findUploadItem(id); if (!item) return;
    try { if (item.control && item.control.xhr) item.control.xhr.abort(); } catch(e) {}
    item.status = 'cancelled';
    uploadQueue = uploadQueue.filter(i => i.id !== id);
    updateManagerUI(); saveQueueStateToLocalStorage();
    showNotification('Upload cancelled', 'success');
}

function renameUploadItem(id) {
    const item = findUploadItem(id); if (!item) return;
    const next = prompt('Rename upload', item.title || 'Upload');
    if (next && next.trim()) { item.title = next.trim().slice(0, 100); updateManagerUI(); saveQueueStateToLocalStorage(); }
}

function updateManagerUI() {
    const activeCount = uploadQueue.filter(i => i.status !== 'completed' && i.status !== 'failed').length;
    const draftsCount = uploadQueue.filter(i => i.status === 'failed').length;
    const activeEl = document.getElementById('man-count-active'); if (activeEl) activeEl.innerText = activeCount;
    const draftsEl = document.getElementById('man-count-drafts'); if (draftsEl) draftsEl.innerText = draftsCount;
    renderChannelUploadQueue('videos');
    renderChannelUploadQueue('feels');
}

function saveQueueStateToLocalStorage() {
    try {
        const queueToSave = uploadQueue.map(item => ({
            id: item.id,
            key: item.key,
            type: item.type,
            title: item.title,
            description: item.description,
            visibility: item.visibility,
            allowComments: item.allowComments,
            showLikes: item.showLikes,
            status: item.status === 'uploading' ? 'paused' : item.status, // save as paused if active
            progress: item.progress,
            duration: item.duration,
            thumbDataUrl: item.thumbDataUrl,
            thumbKey: item.thumbKey,
            thumbUrl: item.thumbUrl,
            videoUrl: item.videoUrl,
            retryCount: item.retryCount,
            createdAt: item.createdAt,
            scheduledTime: item.scheduledTime
        }));
        localStorage.setItem('flaynity_upload_queue_v2', JSON.stringify(queueToSave));
    } catch(e) {}
}

function restoreQueueFromLocalStorage() {
    try {
        const saved = JSON.parse(localStorage.getItem('flaynity_upload_queue_v2') || '[]');
        saved.forEach(item => {
            if(item.status !== 'completed') {
                // Ignore File blobs as they can't be restored from local storage. Require user re-selection if paused.
                // In a true PWA we'd use IndexedDB.
            }
        });
    } catch(e) {}
}

// =========================================================
// REALTIME LISTENERS FOR ZERO-REFRESH FEED PROPAGATION
// =========================================================
let previousFeelsCount = -1;
let previousLongsCount = -1;
let previousPostsCount = -1;
let _feedListenersAttached = false; 

function startRealtimeFeedsListener() {
    if (_feedListenersAttached) {
        try { db.ref('admin_panel/movies/user_uploads').off(); } catch(e) {}
        try { db.ref('admin_panel/movies/feels').off(); } catch(e) {}
        try { db.ref('admin_panel/movies/shorts').off(); } catch(e) {}
        try { db.ref('admin_panel/posts').off(); } catch(e) {}
        _feedListenersAttached = false;
    }

    try {
        _feedListenersAttached = true;
        const now = Date.now();

        db.ref('users').on('value', (snap) => {
            const users = snap.val() || {};
            bannedUserIds = new Set(Object.entries(users).filter(([uid,u]) => String(u?.userStatus || u?.accountStatus || '').toLowerCase() === 'banned').map(([uid]) => String(uid)));
            allLongVideos = enforceContentAdminStatus(allLongVideos, 'video');
            allFeels = enforceContentAdminStatus(allFeels, 'short');
            allCommunityPosts = enforceContentAdminStatus(allCommunityPosts, 'post');
            if ((allLongVideos && allLongVideos.length) || (allFeels && allFeels.length) || (allCommunityPosts && allCommunityPosts.length) || window.__flInitialFeedFetched) {
                buildHomeFeed();
            }
        });

        db.ref('admin_panel/movies/user_uploads').on('value', (snap) => {
            try {
                const data = snap.val();
                allLongVideos = data ? enforceContentAdminStatus(Object.values(data).filter(m => !m.scheduledTime || m.scheduledTime <= now), 'video') : [];
                allLongVideos.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
                refreshPublishedSources(allLongVideos);
                
                allLongVideos.forEach(m => {
                    if (m && m.id && !allAdminMovies.find(x => x.id === m.id)) {
                        allAdminMovies.push(m);
                    }
                });

                if(allLongVideos.length !== previousLongsCount) {
                    previousLongsCount = allLongVideos.length;
                    buildHomeFeed();
                } else {
                    allLongVideos.forEach(v => {
                        const titleEl = document.querySelector(`.long-video-feed-card[onclick*="${v.id}"] .long-video-title`);
                        if (titleEl) titleEl.textContent = (v.title || '') + (v.description ? '\n' + v.description : '');
                    });
                }
            } catch (e) {}
        });

        db.ref('admin_panel/movies/feels').on('value', (snap) => {
            try {
                const data = snap.val();
                allFeels = data ? enforceContentAdminStatus(Object.values(data).filter(m => !m.scheduledTime || m.scheduledTime <= now), 'short') : [];
                allFeels.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
                refreshPublishedSources(allFeels);
                
                if(allFeels.length !== previousFeelsCount) {
                    previousFeelsCount = allFeels.length;
                    buildHomeFeed();
                    const feelsTab = document.getElementById('feels-tab');
                    if (feelsTab && feelsTab.classList.contains('active')) {
                        const activeShortId = document.querySelector('.short-slide video[src]')?.closest('.short-slide')?.getAttribute('data-shortid');
                        buildFeelsPage();
                        if(activeShortId) {
                             setTimeout(() => {
                                 const targetSlide = document.getElementById(`slide-short-${activeShortId}`);
                                 if (targetSlide) targetSlide.scrollIntoView({block: 'start'});
                             }, 50);
                        }
                    }
                } else {
                    allFeels.forEach(s => {
                        const titleEl = document.querySelector(`#slide-short-${s.id} #short-title-val`);
                        if(titleEl) titleEl.innerHTML = `${escapeHTML(s.title)}`;
                        const thumbEl = document.querySelector(`.short-home-card-2col[onclick*="${s.id}"] img`);
                        if (thumbEl) thumbEl.src = s.poster;
                    });
                }
            } catch (e) {}
        });

        // Keep existing Home Page Feels/Shorts cards compatible with the original Firebase path.
        // The UI is named Feels, but older content is stored under /shorts.
        db.ref('admin_panel/movies/shorts').on('value', (snap) => {
            try {
                const legacyData = snap.val() ? Object.values(snap.val()).filter(m => !m.scheduledTime || m.scheduledTime <= now) : [];
                db.ref('admin_panel/movies/feels').once('value', (feelsSnap) => {
                    const feelsData = feelsSnap.val() ? Object.values(feelsSnap.val()).filter(m => !m.scheduledTime || m.scheduledTime <= now) : [];
                    const merged = [...feelsData, ...legacyData];
                    const seenIds = new Set();
                    allFeels = enforceContentAdminStatus(merged.filter(m => {
                        if (!m || !m.id || seenIds.has(String(m.id))) return false;
                        seenIds.add(String(m.id));
                        return true;
                    }), 'short');
                    allFeels.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
                    previousFeelsCount = allFeels.length;
                    buildHomeFeed();
                });
            } catch (e) {}
        });

        db.ref('admin_panel/posts').on('value', (snap) => {
            try {
                const data = snap.val();
                allCommunityPosts = data ? enforceContentAdminStatus(Object.values(data).filter(p => !p.scheduledTime || p.scheduledTime <= now), 'post') : [];
                allCommunityPosts.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
                
                if (allCommunityPosts.length !== previousPostsCount) {
                    previousPostsCount = allCommunityPosts.length;
                    buildHomeFeed();
                }
            } catch (e) {}
        });

        const currentUser = auth.currentUser;
        if (currentUser) {
            db.ref(`channels/${currentUser.uid}`).on('value', (snapshot) => {
                try {
                    currentChannelData = snapshot.val();
                    if (currentChannelData) {
                        localStorage.setItem('flaynity_user_session_cache', JSON.stringify(currentChannelData));
                    }
                    if (currentChannelData) prefetchYouPageData(currentUser.uid, currentChannelData);
                    const activeNav = document.querySelector('.nav-item.active');
                    if (activeNav && activeNav.id === 'nav-you') {
                        initYouTabUI();
                    }
                    updateBottomNavAvatar();
                } catch (e) {}
            });

            db.ref(`users/${currentUser.uid}`).on('value', (snapshot) => {
                try {
                    const userData = snapshot.val();
                    const photoURL = userData?.photoURL || currentUser.photoURL || '';
                    renderUserAvatar(photoURL, currentUser.email);
                } catch (e) {}
            });
        }
    } catch (err) {
        console.error("Global database binding exception:", err);
    }
}

const boundChannelListeners = {};
const liveChannelDataCache = {};
function bindLiveChannelUI(userId) {
    if (!userId) return;
    if (!navigator.onLine) return;

    // A channel can already have a listener because Home and Feels share the
    // same live channel engine. Always apply the cached Firebase data to newly
    // created Feels DOM instead of waiting for another database event.
    if (liveChannelDataCache[userId]) {
        updateChannelDOM(userId, liveChannelDataCache[userId]);
    }

    if (boundChannelListeners[userId]) return;
    boundChannelListeners[userId] = true;
    db.ref(`channels/${userId}`).on('value', (snap) => {
        updateChannelDOM(userId, snap.val());
    });
}

function updateChannelDOM(userId, data) {
    if (!data) return;
    liveChannelDataCache[userId] = data;
    const name = data.channelName || "Flaynity User";
    const handle = data.handle || "handle";
    const avatar = data.avatarUrl || "";

    document.querySelectorAll(`.live-username-${userId}`).forEach(el => {
        el.innerText = name;
    });
    document.querySelectorAll(`.live-handle-${userId}`).forEach(el => {
        el.innerText = "@" + handle;
    });
    document.querySelectorAll(`.live-avatar-${userId}`).forEach(el => {
        if (avatar) {
            el.innerHTML = `<img src="${avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        } else {
            const initial = name.charAt(0).toUpperCase();
            el.innerHTML = `<div style="width: 100%; height: 100%; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--primary), #FF7A00); color: #fff; font-weight: 800; font-size: 0.9rem;">${initial}</div>`;
        }
    });
    document.querySelectorAll(`.live-disc-avatar-${userId}`).forEach(el => {
        if (avatar) {
            el.innerHTML = `<img src="${avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
    });
}

// =========================================================
// COMMUNITY POST IMPLEMENTATION
// =========================================================
function appendPostHashtag(tag) {
    playUI('click');
    const input = document.getElementById('post-caption-input');
    if (input) {
        input.value += " " + tag;
        input.focus();
    }
}

function selectCategoryChip(category, el) {
    playUI('click');
    document.querySelectorAll('.chip-item').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    activeHomeCategory = category;

    const homeTab = document.getElementById('home-tab');
    if (homeTab && !homeTab.classList.contains('active')) {
        switchTab('home');
    }

    buildHomeFeed();
}

// =========================================================
// UNIFIED REAL-TIME FEED ENGINE FOR HOME PAGE
// =========================================================
function buildHomeFeed() {
    const container = document.getElementById('home-feed-container');
    if (!container) return;

    if (_hfHoldRender) return;   // pull-to-refresh in progress: it rebuilds once data is ready

    if (!navigator.onLine || window.__flaynityLiveOnline === false) {
        renderAllSkeletons();
        return;
    }

    container.classList.remove('offline-skeleton-active');
    container.style.minHeight = '';
    container.style.overflow = '';

    let html = '';

    if (!isAdminFeatureEnabled('homeFeedEnabled')) { container.innerHTML = '<div style="padding:48px 20px;text-align:center;opacity:.7;font-weight:700;">Home Feed is currently disabled by the administrator.</div>'; return; }

    let feels = isAdminFeatureEnabled('homeFeelsEnabled') ? [...allFeels] : [];
    let longs = isAdminFeatureEnabled('homeVideosEnabled') ? [...allLongVideos] : [];
    let posts = isAdminFeatureEnabled('homePostsEnabled') ? [...allCommunityPosts] : [];

    // "Not interested" / "Don't recommend channel" apply to the Home Feed only (per account).
    longs = longs.filter(x => !_fxHiddenVideos.has(String(x.id)) && !(x.userId && _fxHiddenChannels.has(String(x.userId))));
    feels = feels.filter(x => !(x.userId && _fxHiddenChannels.has(String(x.userId))));
    posts = posts.filter(x => !(x.userId && _fxHiddenChannels.has(String(x.userId))));

    // Personal random feed (new seed per user / per refresh). Posts tab stays newest-first.
    feels = hfOrder(feels, 300);
    longs = hfOrder(longs, 300);
    posts = (activeHomeCategory === "Posts")
        ? posts.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0))
        : hfOrder(posts, 100);

    const uniqueUserIds = new Set();

    if (activeHomeCategory === "Feels") {
        if (feels.length === 0) {
            container.innerHTML = getHomeSkeletonHTML();
            return;
        }
        html += `
            <div class="feels-section-container" style="margin-top: 10px;">
                <div class="feels-home-grid-2col">
        `;
        feels.forEach(s => {
            if (s.userId) uniqueUserIds.add(s.userId);
            html += `
                <div class="short-home-card-2col" onclick="openShortFromHome('${s.id}')">
                    <img src="${s.poster}" loading="lazy" decoding="async">
                    <div class="short-home-meta">
                        <h4 style="font-size: 0.85rem; font-weight: 800; margin: 0 0 2px 0; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(s.title)}</h4>
                        <p style="font-size: 0.7rem; font-weight: 700; margin: 0; opacity: 0.9;"><i class="fas fa-play"></i> <span id="home-short-views-${s.id}">0</span></p>
                    </div>
                </div>
            `;
            
            db.ref(`movie_stats/${s.id}/views`).once('value', (vSnap) => {
                const viewsObj = vSnap.val() || {};
                const count = Object.keys(viewsObj).length;
                const label = document.getElementById(`home-short-views-${s.id}`);
                if (label) label.innerText = formatCount(count);
            });
        });
        html += `</div></div>`;
        hfCommit(container, html);
        
        uniqueUserIds.forEach(uid => bindLiveChannelUI(uid));
        return;
    }

    if (activeHomeCategory === "Posts") {
        if (posts.length === 0) {
            container.innerHTML = getHomeSkeletonHTML();
            return;
        }
        posts.slice(0, postRenderLimit).forEach(p => {
            if (p.userId) uniqueUserIds.add(p.userId);
            html += renderSinglePostSegmentUI(p);
        });
        container.innerHTML = html;
        container.__hfSig = null;
        ensureHomePostScrollFlow();
        posts.slice(0, postRenderLimit).forEach(p => {
            registerPostReactionsListener(p.id);
        });

        uniqueUserIds.forEach(uid => bindLiveChannelUI(uid));
        return;
    }

    // Community Posts are hidden from the Home feed (they stay in the Posts tab).
    posts = [];

    let shortIdx = 0;
    let longIdx = 0;
    let postIdx = 0;

    if (feels.length === 0 && longs.length === 0 && posts.length === 0) {
        if (window.__flInitialFeedFetched) {
            container.innerHTML = '<div style="padding:56px 20px;text-align:center;color:var(--text-muted);font-weight:700;">No content available yet. Pull down to refresh.</div>';
        }
        return;
    }

    let postsToBind = [];

    // YouTube-style RANDOM grid pattern.
    // The pattern (which block comes first, how many Feels / Long Videos / Posts in each block)
    // is drawn from the same seed as the feed order: a new Pull-to-Refresh => a new seed => a new
    // pattern, while realtime rebuilds / Back navigation keep the exact same layout.
    const patRng = hfMakeRng(_hfSeed ^ 0x9E3779B9);
    let lastBlock = '';
    let safetyLoop = 0;

    const pushPosts = (count) => {
        for (let k = 0; k < count && postIdx < posts.length; k++) {
            const singlePost = posts[postIdx++];
            if (singlePost.userId) uniqueUserIds.add(singlePost.userId);
            html += renderSinglePostSegmentUI(singlePost);
            postsToBind.push(singlePost.id);
        }
    };

    while ((longIdx < longs.length || shortIdx < feels.length) && safetyLoop++ < 1000) {
        const feelsLeft = feels.length - shortIdx;
        const longsLeft = longs.length - longIdx;

        // Blocks alternate Feels <-> Long Videos; the very first block is random.
        let block;
        if (!lastBlock) block = (patRng() < 0.42) ? 'feels' : 'long';
        else block = (lastBlock === 'feels') ? 'long' : 'feels';
        if (block === 'feels' && feelsLeft <= 0) block = 'long';
        if (block === 'long' && longsLeft <= 0) block = 'feels';
        // Never show a Feels grid directly under another Feels grid (e.g. when Long Videos run out).
        // Leftover Feels stay available in the Feels tab.
        if (block === 'feels' && lastBlock === 'feels') break;

        if (block === 'feels') {
            // 2-column grid: 2 / 4 / 6 / 8 cards per Feels shelf
            const r = patRng();
            const size = r < 0.12 ? 2 : (r < 0.52 ? 4 : (r < 0.90 ? 6 : 8));
            const segmentFeels = feels.slice(shortIdx, shortIdx + size);
            shortIdx += size;
            segmentFeels.forEach(s => { if (s.userId) uniqueUserIds.add(s.userId); });
            html += renderFeelsSegmentUI(segmentFeels, html !== '');   // gap above the title when it follows a card
        } else {
            // 2 to 10 Long Videos in a row
            const size = 2 + Math.floor(patRng() * 9);
            const segmentLongs = longs.slice(longIdx, longIdx + size);
            longIdx += size;
            segmentLongs.forEach(l => { if (l.userId) uniqueUserIds.add(l.userId); });
            html += renderLongVideosSegmentUI(segmentLongs);
        }
        lastBlock = block;

        // Community posts are sprinkled randomly between the blocks (0, 1 or 2 posts).
        const pr = patRng();
        pushPosts(pr < 0.25 ? 0 : (pr < 0.85 ? 1 : 2));
    }

    // Anything left over (only posts can be left) is appended at the end.
    pushPosts(posts.length - postIdx);

    hfCommit(container, html);
    ensureHomePostScrollFlow();
    postsToBind.forEach(postId => registerPostReactionsListener(postId));
    uniqueUserIds.forEach(uid => bindLiveChannelUI(uid));
}

function renderFeelsSegmentUI(segmentFeels, hasPrev) {
    if (segmentFeels.length === 0) return '';
    
    const limitedFeels = segmentFeels.slice(0, 8);
    
    let html = `
        <div class="feels-section-container" style="margin-bottom: 24px;${hasPrev ? ' padding-top: 12px;' : ''}">
            <div class="section-title">
                <svg class="nav-icon-svg" width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" style="color:var(--primary) !important;">
                    <rect x="5" y="4" width="22" height="24" rx="6"></rect>
                    <path d="M12 4v4h8V4"></path>
                    <path d="M13 13l7 4-7 4z" fill="currentColor" stroke="none"></path>
                </svg>
                Feels
            </div>
            <div class="feels-home-grid-2col">
    `;

    limitedFeels.forEach(s => {
        html += `
            <div class="short-home-card-2col" onclick="openShortFromHome('${s.id}')">
                <img src="${s.poster}" loading="lazy" decoding="async">
                <div class="short-home-meta">
                    <h4 style="font-size: 0.85rem; font-weight: 800; margin: 0 0 2px 0; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(s.title)}</h4>
                    <p style="font-size: 0.7rem; font-weight: 700; margin: 0; opacity: 0.9;"><i class="fas fa-play"></i> <span id="home-short-views-${s.id}">0</span></p>
                </div>
            </div>
        `;
        
        db.ref(`movie_stats/${s.id}/views`).once('value', (vSnap) => {
            const viewsObj = vSnap.val() || {};
            const count = Object.keys(viewsObj).length;
            const label = document.getElementById(`home-short-views-${s.id}`);
            if (label) label.innerText = formatCount(count);
        });
    });

    html += `
            </div>
        </div>
    `;
    return html;
}


// =========================================================
// PREMIUM LONG VIDEO CARD (shared by Home feed + Watch page related list)
// =========================================================
const FX_ICON = {
    eye:   '<svg viewBox="0 0 24 24"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20.5s-8-4.9-8-11A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8 2.9c0 6.1-8 11-8 11z"/></svg>',
    chat:  '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 8.7 3.9 8.4 8.4 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.7l7.4-4.3M8.3 13.3l7.4 4.3"/></svg>',
    dots:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="4.5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19.5" r="2"/></svg>',
    play:  '<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.2-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>'
};

// =========================================================
// DISLIKE FEEDBACK SHEET ("Why did you dislike this video?")
// Opens from the Home long-video card AND the Long Video Play Page dislike button.
// =========================================================
const FXD_REASONS = [
    { k: 'inappropriate', t: 'Inappropriate', i: '<svg viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>' },
    { k: 'misleading', t: 'Misleading', i: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/></svg>' },
    { k: 'not_channel', t: 'Not interested in this channel', i: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M17 9l5 5M22 9l-5 5"/></svg>' },
    { k: 'not_topic', t: 'Not interested in this topic', i: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1A10.9 10.9 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6A16.6 16.6 0 0 0 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>' },
    { k: 'ai', t: 'AI-generated', i: '<svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/></svg>' },
    { k: 'other', t: 'Other', i: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>' }
];
const FXD_DOWN_SVG = '<svg viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H6.7a2 2 0 0 0-2 1.7l-1.4 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.7A2.3 2.3 0 0 1 22 4.3v7.4A2.3 2.3 0 0 1 19.7 14H17"/></svg>';
let _fxdVideoId = null;
let _fxdBusy = false;

function fxdEnsureSheet() {
    let root = document.getElementById('fx-dislike-sheet');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'fx-dislike-sheet';
    root.className = 'fxd-root';
    root.innerHTML = `
        <div class="fxd-sheet" id="fxd-sheet">
            <div class="fxd-grab" id="fxd-grab"><span></span></div>
            <div class="fxd-main" id="fxd-main">
                <div class="fxd-head">
                    <div class="fxd-badge">${FXD_DOWN_SVG}</div>
                    <div class="fxd-htxt">
                        <h3>Why did you dislike this video?</h3>
                        <p>Help us improve your feed</p>
                    </div>
                </div>
                <div class="fxd-chips" id="fxd-chips">
                    ${FXD_REASONS.map(r => `
                        <button type="button" class="fxd-chip" data-k="${r.k}">
                            <span class="fxd-ci">${r.i}</span>
                            <span class="fxd-ct">${r.t}</span>
                            <span class="fxd-tick"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
                        </button>`).join('')}
                </div>
                <textarea id="fxd-note" class="fxd-note" rows="3" maxlength="300" placeholder="Tell us more (optional)"></textarea>
                <div class="fxd-actions">
                    <button type="button" class="fxd-skip" id="fxd-skip">Not now</button>
                    <button type="button" class="fxd-send" id="fxd-send" disabled>Send feedback</button>
                </div>
            </div>
            <div class="fxd-done" id="fxd-done">
                <div class="fxd-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
                <h3>Thanks for your feedback</h3>
                <p>We will use it to improve your feed.</p>
            </div>
        </div>`;
    document.body.appendChild(root);

    root.addEventListener('click', (e) => { if (e.target === root) fxCloseDislikeSheet(); });
    root.querySelector('#fxd-chips').addEventListener('click', (e) => {
        const chip = e.target.closest('.fxd-chip');
        if (!chip) return;
        if (typeof playUI === 'function') playUI('click');
        chip.classList.toggle('on');
        fxdSync();
    });
    root.querySelector('#fxd-skip').addEventListener('click', () => fxCloseDislikeSheet());
    root.querySelector('#fxd-send').addEventListener('click', () => fxSubmitDislikeFeedback());

    // swipe down to close
    const sheet = root.querySelector('#fxd-sheet');
    const grab = root.querySelector('#fxd-grab');
    let sy = 0, dy = 0, drag = false;
    grab.addEventListener('touchstart', (e) => { drag = true; sy = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; }, { passive: true });
    grab.addEventListener('touchmove', (e) => {
        if (!drag) return;
        dy = Math.max(0, e.touches[0].clientY - sy);
        sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    const end = () => {
        if (!drag) return;
        drag = false; sheet.style.transition = '';
        if (dy > 90) fxCloseDislikeSheet(); else sheet.style.transform = '';
    };
    grab.addEventListener('touchend', end);
    grab.addEventListener('touchcancel', end);
    return root;
}

function fxdSync() {
    const root = document.getElementById('fx-dislike-sheet');
    if (!root) return;
    const chosen = root.querySelectorAll('.fxd-chip.on');
    const other = root.querySelector('.fxd-chip[data-k="other"]');
    root.querySelector('#fxd-send').disabled = chosen.length === 0;
    root.querySelector('#fxd-note').classList.toggle('show', !!(other && other.classList.contains('on')));
}

function fxOpenDislikeSheet(videoId) {
    const root = fxdEnsureSheet();
    _fxdVideoId = String(videoId);
    _fxdBusy = false;
    root.querySelectorAll('.fxd-chip').forEach(c => c.classList.remove('on'));
    root.querySelector('#fxd-note').value = '';
    root.querySelector('#fxd-main').style.display = '';
    root.querySelector('#fxd-done').classList.remove('show');
    root.classList.remove('open', 'closing');
    root.querySelector('#fxd-sheet').style.transform = '';
    const send = root.querySelector('#fxd-send');
    send.textContent = 'Send feedback';
    fxdSync();
    AppNavigation.pushModal('fx-dislike-sheet');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
}

function fxCloseDislikeSheet() {
    const root = document.getElementById('fx-dislike-sheet');
    if (!root || root.classList.contains('closing')) return;
    root.classList.add('closing');
    root.classList.remove('open');
    setTimeout(() => {
        const c = AppNavigation.current();
        if (c && c.type === 'modal' && c.id === 'fx-dislike-sheet') AppNavigation.pop();
        else root.style.display = 'none';
        root.classList.remove('closing');
    }, 240);
}

function fxSubmitDislikeFeedback() {
    if (_fxdBusy) return;
    const root = document.getElementById('fx-dislike-sheet');
    if (!root || !_fxdVideoId) return;
    const reasons = Array.from(root.querySelectorAll('.fxd-chip.on')).map(c => c.dataset.k);
    if (!reasons.length) return;
    _fxdBusy = true;
    const note = reasons.includes('other') ? root.querySelector('#fxd-note').value.trim().slice(0, 300) : '';
    const send = root.querySelector('#fxd-send');
    send.textContent = 'Sending...'; send.disabled = true;

    const finish = (ok) => {
        if (ok) {
            root.querySelector('#fxd-main').style.display = 'none';
            root.querySelector('#fxd-done').classList.add('show');
            setTimeout(fxCloseDislikeSheet, 1300);
        } else {
            if (typeof showNotification === 'function') showNotification('Could not send feedback. Please try again.', 'error');
            _fxdBusy = false; send.textContent = 'Send feedback'; send.disabled = false;
        }
    };
    if (typeof auth === 'undefined' || !auth.currentUser || !navigator.onLine) { finish(false); return; }
    db.ref(`video_dislike_feedback/${_fxdVideoId}/${auth.currentUser.uid}`)
        .set({ reasons, note, timestamp: Date.now() })
        .then(() => finish(true))
        .catch(() => finish(false));
}

function fxClearDislikeFeedback(videoId, uid) {
    try { db.ref(`video_dislike_feedback/${videoId}/${uid}`).remove().catch(() => {}); } catch (e) {}
}

// =========================================================
// VIDEO CARD 3-DOT MENU (Download / Share / Not interested / Don't recommend channel / Report)
// =========================================================
const FXM_IC = {
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.3 10.8l7.4-4.1M8.3 13.2l7.4 4.1"/></svg>',
    report: '<svg viewBox="0 0 24 24"><path d="M5 22V3"/><path d="M5 4.2c3.3-1.8 6 1.8 9.3 0 1.8-1 3.2-1 4.7-.5v9.1c-1.5-.5-2.9-.5-4.7.5C11 15.1 8.3 11.5 5 13.3"/></svg>',
    copyright: '<svg viewBox="0 0 24 24"><path d="M6.5 3h7.6L19 7.9V19a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M8.5 12.5h7M8.5 16h7"/></svg>',
    subscribe: '<svg viewBox="0 0 24 24"><circle cx="14.5" cy="8.5" r="4"/><path d="M6.5 21c.5-4 3.5-6 8-6s7.5 2 8 6z"/><path d="M4.5 5.5v5M2 8h5"/></svg>',
    no_channel: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M5.3 5.3l13.4 13.4"/></svg>',
    not_interested: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 3.5l16 17"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 3v11M8 10.5l4 4 4-4"/><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/></svg>',
    dislike: '<svg viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>'
};
const FXR_REASONS = [
    { k: 'sexual', t: 'Sexual content' },
    { k: 'violent', t: 'Violent or repulsive content' },
    { k: 'hateful', t: 'Hateful or abusive content' },
    { k: 'harmful', t: 'Harmful or dangerous acts' },
    { k: 'spam', t: 'Spam or misleading' }
];
let _fxmVideoId = null;
let _fxrVideoId = null;
let _fxrKind = 'video';
let _fxrBusy = false;

// ---- hidden videos / channels: stored PER ACCOUNT (never shared with other accounts) ----
const _fxHiddenVideos = new Set();
const _fxHiddenChannels = new Set();
function fxHideKey(kind) {
    const uid = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.uid : 'guest';
    return `fx_hidden_${kind}:${uid}`;
}
function fxReloadHidden() {
    _fxHiddenVideos.clear(); _fxHiddenChannels.clear();
    try { JSON.parse(localStorage.getItem(fxHideKey('videos')) || '[]').forEach(x => _fxHiddenVideos.add(String(x))); } catch (e) {}
    try { JSON.parse(localStorage.getItem(fxHideKey('channels')) || '[]').forEach(x => _fxHiddenChannels.add(String(x))); } catch (e) {}
}
function fxPersistHidden() {
    try {
        localStorage.setItem(fxHideKey('videos'), JSON.stringify(Array.from(_fxHiddenVideos)));
        localStorage.setItem(fxHideKey('channels'), JSON.stringify(Array.from(_fxHiddenChannels)));
    } catch (e) {}
}
try { localStorage.removeItem('fx_hidden_videos'); localStorage.removeItem('fx_hidden_channels'); } catch (e) {}
fxReloadHidden();
try {
    // Account switched / logged in: load THAT account's hidden list, then refresh the Home feed if it differs.
    auth.onAuthStateChanged(() => {
        const snapshot = () => JSON.stringify([Array.from(_fxHiddenVideos).sort(), Array.from(_fxHiddenChannels).sort()]);
        const before = snapshot();
        fxReloadHidden();
        if (snapshot() !== before) { try { buildHomeFeed(); } catch (e) {} }
    });
} catch (e) {}

function fxRemoveCards(selector) {
    document.querySelectorAll(selector).forEach(el => {
        el.style.height = el.offsetHeight + 'px';
        el.style.overflow = 'hidden';
        el.style.transition = 'height .32s ease, opacity .25s ease, margin .32s ease';
        requestAnimationFrame(() => { el.style.opacity = '0'; el.style.height = '0px'; el.style.marginBottom = '0px'; });
        setTimeout(() => el.remove(), 350);
    });
}

// ---------------------------------------------------------
// "More options" BOTTOM SHEET (Long Video + Post cards + Watch page)
// ---------------------------------------------------------
let _fxmCtx = null;

function fxEnsureMenu() {
    let root = document.getElementById('fx-video-menu');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'fx-video-menu';
    root.className = 'fxm-root';
    root.innerHTML = `
        <div class="fxm-sheet" id="fxm-sheet" role="dialog" aria-label="More options">
            <div class="fxm-grab" id="fxm-grab"><span></span></div>
            <div class="fxm-title" id="fxm-title">More options</div>
            <div class="fxm-list" id="fxm-list"></div>
        </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
        const btn = e.target.closest('.fxm-row');
        if (btn) { fxMenuAction(btn.dataset.a); return; }
        if (e.target === root) fxCloseVideoMenu();
    });
    // drag down to dismiss
    const sheet = root.querySelector('#fxm-sheet');
    let sy = 0, dy = 0, drag = false;
    ['fxm-grab', 'fxm-title'].forEach(id => {
        const el = root.querySelector('#' + id);
        el.addEventListener('touchstart', (e) => { drag = true; sy = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; }, { passive: true });
        el.addEventListener('touchmove', (e) => {
            if (!drag) return;
            dy = Math.max(0, e.touches[0].clientY - sy);
            sheet.style.transform = `translateY(${dy}px)`;
        }, { passive: true });
        const end = () => {
            if (!drag) return;
            drag = false; sheet.style.transition = '';
            if (dy > 80) fxCloseVideoMenu(); else sheet.style.transform = '';
        };
        el.addEventListener('touchend', end);
        el.addEventListener('touchcancel', end);
    });
    return root;
}

function fxmFindItem(ctx) {
    const id = String(ctx.id);
    if (ctx.kind === 'post') {
        return (typeof allCommunityPosts !== 'undefined') ? (allCommunityPosts.find(x => String(x.id) === id) || null) : null;
    }
    let v = (typeof allLongVideos !== 'undefined') ? allLongVideos.find(x => String(x.id) === id) : null;
    if (!v && typeof currentActiveMovie !== 'undefined' && currentActiveMovie && String(currentActiveMovie.id) === id) v = currentActiveMovie;
    return v || null;
}

function fxmRows(ctx) {
    const rows = [];
    const isPost = ctx.kind === 'post';
    const it = ctx.item || {};
    rows.push({ a: 'share', t: isPost ? 'Share post' : 'Share video', i: FXM_IC.share });
    if (!ctx.own) {
        rows.push({ a: 'report', t: 'Report', i: FXM_IC.report });
        rows.push({ a: 'copyright', t: 'Copyright claim', i: FXM_IC.copyright });
        rows.push({ a: 'subscribe', t: ctx.subbed ? 'Subscribed' : 'Subscribe', i: FXM_IC.subscribe });
        rows.push({ a: 'no_channel', t: "Don't recommend channel", i: FXM_IC.no_channel });
        rows.push({ a: 'not_interested', t: 'Not interested', i: FXM_IC.not_interested });
    }
    if (ctx.watch) rows.push({ a: 'dislike', t: 'Dislike', i: FXM_IC.dislike });
    if (!isPost) rows.push({ a: 'download', t: 'Download video', i: FXM_IC.download });
    else if (it.images && it.images.length) rows.push({ a: 'download', t: it.images.length > 1 ? 'Download images' : 'Download image', i: FXM_IC.download });
    return rows;
}

function fxmRenderRows(ctx) {
    const list = document.querySelector('#fx-video-menu #fxm-list');
    if (!list) return;
    list.innerHTML = fxmRows(ctx).map(r => `
        <button type="button" class="fxm-row" data-a="${r.a}">
            <span class="fxm-ic">${r.i}</span><span class="fxm-tx">${r.t}</span><span class="fxm-chev">${FXM_IC.chev}</span>
        </button>`).join('');
}

function fxmOpen(ctx) {
    if (!ctx.silent && typeof playUI === 'function') playUI('click');
    const root = fxEnsureMenu();
    ctx.item = fxmFindItem(ctx);
    ctx.uid = (ctx.item && ctx.item.userId) ? String(ctx.item.userId) : '';
    const me = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.uid : '';
    ctx.own = !!(me && ctx.uid && me === ctx.uid);
    ctx.subbed = false;
    _fxmCtx = ctx;
    _fxmVideoId = ctx.id;
    fxmRenderRows(ctx);

    const sheet = root.querySelector('#fxm-sheet');
    sheet.style.transform = '';
    root.querySelector('#fxm-list').scrollTop = 0;
    root.classList.remove('open', 'closing');
    AppNavigation.pushModal('fx-video-menu');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));

    // live Subscribe / Subscribed state
    if (ctx.uid && !ctx.own && me && navigator.onLine && typeof db !== 'undefined') {
        db.ref(`subscribers/${ctx.uid}/${me}`).once('value').then(snap => {
            if (_fxmCtx !== ctx) return;
            ctx.subbed = snap.exists();
            const tx = root.querySelector('.fxm-row[data-a="subscribe"] .fxm-tx');
            if (tx) tx.textContent = ctx.subbed ? 'Subscribed' : 'Subscribe';
        }).catch(() => {});
    }
}

// Long Video card + Watch page 3-dot
function fxOpenVideoMenu(videoId, anchor) {
    const watch = !!(anchor && anchor.closest && anchor.closest('#full-movie-page'));
    fxmOpen({ kind: 'video', id: String(videoId), watch });
}
// Post card 3-dot
function fbOpenPostMenu(postId) {
    fxmOpen({ kind: 'post', id: String(postId), watch: false });
}

function fxCloseVideoMenu(done) {
    const root = document.getElementById('fx-video-menu');
    if (!root || root.classList.contains('closing')) { if (done) done(); return; }
    root.classList.add('closing');
    root.classList.remove('open');
    setTimeout(() => {
        const c = AppNavigation.current();
        if (c && c.type === 'modal' && c.id === 'fx-video-menu') AppNavigation.pop();
        else root.style.display = 'none';
        root.classList.remove('closing');
        const sh = root.querySelector('#fxm-sheet'); if (sh) sh.style.transform = '';
        if (done) done();
    }, 240);
}

function fxMenuAction(action) {
    const ctx = _fxmCtx;
    if (!ctx) { fxCloseVideoMenu(); return; }
    const v = ctx.item;
    const isPost = ctx.kind === 'post';
    fxCloseVideoMenu(() => {
        if (action === 'dislike') { try { toggleMovieDislike(); } catch (e) {} return; }
        if (!v) { showNotification('Content not available.', 'error'); return; }

        if (action === 'share') {
            const title = v.title || v.caption || 'Flaynity';
            const data = { title: title, text: v.caption || title, url: location.href };
            if (navigator.share) navigator.share(data).catch(() => {});
            else if (navigator.clipboard) { navigator.clipboard.writeText(location.href); showNotification('Link copied', 'success'); }
            else showNotification('Sharing is not supported on this device.', 'error');

        } else if (action === 'report') {
            if (ctx.own) { showNotification('You cannot report your own content.', 'error'); return; }
            fxOpenReportPage(v.id, ctx.kind);

        } else if (action === 'copyright') {
            if (ctx.own) { showNotification('You cannot claim copyright on your own content.', 'error'); return; }
            fxOpenCopyrightPage(v.id, ctx.kind);

        } else if (action === 'subscribe') {
            if (!v.userId) { showNotification('Channel not found.', 'error'); return; }
            toggleClipSubscribe(String(v.userId));

        } else if (action === 'no_channel') {
            if (!v.userId) { showNotification('Channel not found.', 'error'); return; }
            if (ctx.own) { showNotification('You cannot hide your own channel.', 'error'); return; }
            _fxHiddenChannels.add(String(v.userId)); fxPersistHidden();
            fxRemoveCards(`#home-feed-container .fx-card[data-fx-uid="${v.userId}"]`);
            fxRemoveCards(`.post-card[data-fb-uid="${v.userId}"]`);
            setTimeout(() => { try { if (AppNavigation.current() && AppNavigation.current().type === 'tab') buildHomeFeed(); } catch (e) {} }, 400);
            showNotification("Okay, we won't recommend this channel.", 'success', 2400);

        } else if (action === 'not_interested') {
            if (isPost) {
                fbHidePost(String(v.id), true);
                showNotification("Post hidden. We'll show fewer posts like this.", 'success', 2400);
            } else {
                _fxHiddenVideos.add(String(v.id)); fxPersistHidden();
                fxRemoveCards(`#home-feed-container .fx-card[data-fx-id="${v.id}"]`);
                showNotification("Video hidden. We'll show fewer videos like this.", 'success', 2400);
            }

        } else if (action === 'download') {
            if (isPost) {
                const imgs = (v.images || []).filter(Boolean);
                if (!imgs.length) { showNotification('No image found to download.', 'error'); return; }
                imgs.forEach((u, i) => setTimeout(() => {
                    const url = (typeof normalizeFlaynityMediaUrl === 'function') ? normalizeFlaynityMediaUrl(u) : u;
                    triggerFileDownload(url, `flaynity_post_${v.id}_${i + 1}.jpg`);
                }, i * 600));
            } else {
                const raw = v.videoLink || v.videoUrl;
                const name = `${String(v.title || 'video').replace(/\s+/g, '_')}_video-720.mp4`;
                const url = (typeof normalizeFlaynityMediaUrl === 'function' && raw) ? normalizeFlaynityMediaUrl(raw) : raw;
                if (!url) { showNotification('No valid download link found.', 'error'); return; }
                triggerFileDownload(url, name);
            }
        }
    });
}

// ---- Report dialog ----
function fxEnsureReport() {
    let root = document.getElementById('fx-report-dialog');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'fx-report-dialog';
    root.className = 'fxr-root';
    root.innerHTML = `
        <div class="fxr-card" id="fxr-card">
            <div class="fxr-head">
                <div class="fxr-flag"><svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg></div>
                <div><h3 id="fxr-title">Report video</h3><p>Select the issue you want to report</p></div>
            </div>
            <div class="fxr-list" id="fxr-list">${FXR_REASONS.map(r => `
                <button type="button" class="fxr-opt" data-k="${r.k}">
                    <span class="fxr-radio"><i></i></span><span class="fxr-label">${r.t}</span>
                </button>`).join('')}</div>
            <div class="fxr-actions">
                <button type="button" class="fxr-cancel" id="fxr-cancel">Cancel</button>
                <button type="button" class="fxr-send" id="fxr-send" disabled>Report</button>
            </div>
        </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => { if (e.target === root) fxCloseReportDialog(); });
    root.querySelector('#fxr-list').addEventListener('click', (e) => {
        const opt = e.target.closest('.fxr-opt');
        if (!opt) return;
        if (typeof playUI === 'function') playUI('click');
        root.querySelectorAll('.fxr-opt').forEach(o => o.classList.toggle('on', o === opt));
        root.querySelector('#fxr-send').disabled = false;
    });
    root.querySelector('#fxr-cancel').addEventListener('click', () => fxCloseReportDialog());
    root.querySelector('#fxr-send').addEventListener('click', () => fxSubmitReport());
    return root;
}

function fxOpenReportDialog(videoId, kind) {
    const root = fxEnsureReport();
    _fxrVideoId = String(videoId); _fxrBusy = false;
    _fxrKind = kind === 'post' ? 'post' : 'video';
    const _t = root.querySelector('#fxr-title'); if (_t) _t.textContent = _fxrKind === 'post' ? 'Report post' : 'Report video';
    root.querySelectorAll('.fxr-opt').forEach(o => o.classList.remove('on'));
    const send = root.querySelector('#fxr-send');
    send.disabled = true; send.textContent = 'Report';
    root.classList.remove('open', 'closing');
    AppNavigation.pushModal('fx-report-dialog');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
}

function fxCloseReportDialog() {
    const root = document.getElementById('fx-report-dialog');
    if (!root || root.classList.contains('closing')) return;
    root.classList.add('closing');
    root.classList.remove('open');
    setTimeout(() => {
        const c = AppNavigation.current();
        if (c && c.type === 'modal' && c.id === 'fx-report-dialog') AppNavigation.pop();
        else root.style.display = 'none';
        root.classList.remove('closing');
    }, 200);
}

function fxSubmitReport() {
    if (_fxrBusy) return;
    const root = document.getElementById('fx-report-dialog');
    const sel = root && root.querySelector('.fxr-opt.on');
    if (!sel || !_fxrVideoId) return;
    if (typeof auth === 'undefined' || !auth.currentUser) { showNotification('Please sign in to report', 'error'); return; }
    if (!navigator.onLine) { showNotification('Cannot report while offline.', 'error'); return; }
    _fxrBusy = true;
    const send = root.querySelector('#fxr-send');
    send.textContent = 'Sending...'; send.disabled = true;
    db.ref(`video_reports/${_fxrVideoId}/${auth.currentUser.uid}`)
        .set({ reason: sel.dataset.k, kind: _fxrKind, timestamp: Date.now() })
        .then(() => { showNotification('Report submitted. Thank you!', 'success', 2400); fxCloseReportDialog(); })
        .catch(() => { showNotification('Could not send report. Please try again.', 'error'); _fxrBusy = false; send.textContent = 'Report'; send.disabled = false; });
}

// =========================================================
// REPORT / COPYRIGHT FULL PAGES (TikTok-style flow)
// Why are you reporting this? -> Thanks for reporting -> Reports list
// =========================================================
// Report page texts — এক জায়গা থেকেই বদলানো যায়
const RP_T = { notForMe: "Not for me", moreBtn: "See more reasons", moreTitle: "More reasons", ipr: "Fake products or copyright" };
const RP_REASONS = [
    ['sexual', 'Nudity or sexual material'], ['hate', 'Hate speech or bullying'], ['violence', 'Violence or harm'],
    ['child_safety', 'Risk to children'], ['misleading', 'Fake or misleading info'],
    ['ai_content', 'Harmful AI-generated content'], ['self_harm', 'Self-harm or suicide'], ['branded', 'Hidden paid promotion']
];
const RP_MORE = [
    ['spam', 'Spam or scams'], ['dangerous', 'Risky challenges or stunts'],
    ['illegal', 'Illegal or restricted items'], ['gambling', 'Gambling content'], ['other', 'Something else']
];
const RP_COPY = [
    ['copies_work', 'It copies my original work'], ['unauthorized_media', 'Uses my video or music without permission'],
    ['photo_art', 'Uses my photo or artwork without permission'], ['counterfeit', 'Counterfeit or fake brand products'],
    ['other_copyright', 'Other copyright issue']
];
const RP_CHEV = '<svg class="rp-chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';
const RP_BACK = '<svg viewBox="0 0 24 24"><path d="M20 12H4M10.5 5.5L4 12l6.5 6.5"/></svg>';
const RP_X = '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg>';
const RP_SHIELD = '<svg class="rp-shield" viewBox="0 0 24 24"><path d="M12 2L4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" fill="#2C5CC5"/><rect x="11" y="7" width="2" height="6" rx="1" fill="#fff"/><circle cx="12" cy="16.2" r="1.2" fill="#fff"/></svg>';
let _rp = { id: '', kind: 'video', uid: '', name: '', thumb: '', stack: [], mode: 'report', reason: '', busy: false, copyKey: '', copyLabel: '' };

// DEMO: সব ডাটা শুধু মেমোরিতে থাকে (Firebase / localStorage এ সেভ হয় না) — App Refresh করলে চলে যায়।
const RP_MEM = { reports: [], muted: new Set(), blocked: new Set(), restricted: false };
function rpLoadReports() { return RP_MEM.reports; }
function rpSaveReport(rec) { RP_MEM.reports.unshift(rec); }
function rpIsBlocked(uid) { return RP_MEM.blocked.has(String(uid)); }
function rpSetBlocked(uid, on) { if (on) RP_MEM.blocked.add(String(uid)); else RP_MEM.blocked.delete(String(uid)); }
function rpHideChannelNow(uid) {
    fxRemoveCards(`#home-feed-container .fx-card[data-fx-uid="${uid}"]`);
    fxRemoveCards(`.post-card[data-fb-uid="${uid}"]`);
}

function rpEnsure() {
    let root = document.getElementById('fx-report-page');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'fx-report-page';
    root.className = 'rp-root';
    root.innerHTML = `
        <div class="rp-head" id="rp-head"></div>
        <div class="rp-body" id="rp-body"></div>`;
    document.body.appendChild(root);
    root.querySelector('#rp-body').addEventListener('scroll', (e) => {
        root.querySelector('#rp-head').classList.toggle('rp-line', e.target.scrollTop > 6);
    }, { passive: true });
    root.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act]');
        if (!t) return;
        rpAct(t.dataset.act, t);
    });
    root.addEventListener('input', () => rpSyncForm());
    return root;
}

function rpOpen(mode, id, kind) {
    const root = rpEnsure();
    const menu = _fxmCtx ? { kind: _fxmCtx.kind, id: _fxmCtx.id, watch: !!_fxmCtx.watch } : null;
    const item = fxmFindItem({ kind: kind, id: id }) || {};
    _rp = {
        id: String(id), kind: kind === 'post' ? 'post' : 'video', mode: mode,
        uid: item.userId ? String(item.userId) : '',
        name: item.username || item.channelName || 'Flaynity User',
        thumb: item.poster || (item.images && item.images[0]) || '',
        stack: [], reason: '', busy: false, copyKey: '', copyLabel: '', menu: menu
    };
    root.classList.remove('open', 'closing');
    AppNavigation.pushModal('fx-report-page');
    rpShow(mode === 'copyright' ? 'copyright' : 'report', false);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
}
function fxOpenReportPage(id, kind) { rpOpen('report', id, kind); }
function fxOpenCopyrightPage(id, kind) { rpOpen('copyright', id, kind); }

function rpClose(reopenMenu) {
    const root = document.getElementById('fx-report-page');
    if (!root || root.classList.contains('closing')) return;
    const menu = reopenMenu ? _rp.menu : null;
    root.classList.add('closing'); root.classList.remove('open');
    setTimeout(() => {
        const c = AppNavigation.current();
        if (c && c.type === 'modal' && c.id === 'fx-report-page') AppNavigation.pop();
        else root.style.display = 'none';
        root.classList.remove('closing');
        if (menu) { try { fxmOpen({ kind: menu.kind, id: menu.id, watch: menu.watch, silent: true }); } catch (e) {} }
    }, 230);
}

// Back: আগের Page এ ফিরে যায়। প্রথম Page এ হলে "More options" এ ফিরে যায়।
function rpBack() {
    if (_rp.stack.length > 1) { _rp.stack.pop(); rpShow(_rp.stack.pop(), true); }
    else rpClose(true);
}

function rpRows(list, act) {
    return list.map(r => `<button type="button" class="rp-row" data-act="${act}" data-k="${r[0]}" data-t="${escapeHTML(r[1])}"><span>${escapeHTML(r[1])}</span>${RP_CHEV}</button>`).join('');
}

function rpShow(screen, isBack) {
    const root = rpEnsure();
    const head = root.querySelector('#rp-head');
    const body = root.querySelector('#rp-body');
    _rp.stack.push(screen);
    root.classList.toggle('rp-gray', screen === 'reports');
    let headHtml = `<button type="button" class="rp-hbtn" data-act="back" aria-label="Back">${RP_BACK}</button>`;
    let html = '';
    const nm = escapeHTML(_rp.name);
    const isP = _rp.kind === 'post';

    if (screen === 'report') {
        html = `<h1 class="rp-h1">Why are you reporting this?</h1>
            <div class="rp-info">${RP_SHIELD}<span>Your report remains anonymous to others, and we review all reports against our guidelines.</span></div>
            <div class="rp-card rp-single"><button type="button" class="rp-row" data-act="reason" data-k="dislike" data-t="${RP_T.notForMe}"><span>${RP_T.notForMe}</span>${RP_CHEV}</button></div>
            <div class="rp-card rp-list">${rpRows(RP_REASONS, 'reason')}<button type="button" class="rp-row" data-act="more"><span>${RP_T.moreBtn}</span>${RP_CHEV}</button></div>
            <div class="rp-card rp-single"><button type="button" class="rp-row" data-act="ipr"><span>${RP_T.ipr}</span>${RP_CHEV}</button></div>
            <div class="rp-bottom-gap"></div>`;
    } else if (screen === 'more') {
        html = `<h1 class="rp-h1">${RP_T.moreTitle}</h1>
            <div class="rp-card rp-list">${rpRows(RP_MORE, 'reason')}</div><div class="rp-bottom-gap"></div>`;
    } else if (screen === 'copyright') {
        html = `<h1 class="rp-h1">What is the copyright issue?</h1>
            <div class="rp-info">${RP_SHIELD}<span>Copyright claims are reviewed against our copyright policy. Only the copyright owner or an authorized person should submit a claim.</span></div>
            <div class="rp-card rp-list">${rpRows(RP_COPY, 'copyreason')}</div><div class="rp-bottom-gap"></div>`;
    } else if (screen === 'copyform') {
        html = `<h1 class="rp-h1 rp-h1-sm">Tell us more</h1>
            <div class="rp-info">${RP_SHIELD}<span>${escapeHTML(_rp.copyLabel)}</span></div>
            <div class="rp-label">Channel name</div>
            <div class="rp-input rp-ro">${escapeHTML(rpChannelName())}</div>
            <textarea id="rp-details" class="rp-input rp-area" maxlength="200" rows="5" placeholder="Link or details of your original work (what was copied?)"></textarea>
            <div class="rp-count" id="rp-count"><span>Minimum 10 characters</span><b id="rp-cnt">0/200</b></div>
            <button type="button" class="rp-check" id="rp-agree" data-act="agree"><span class="rp-box"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span>I am the copyright owner or authorized to act on their behalf.</span></button>
            <div class="rp-foot"><button type="button" class="rp-primary" id="rp-submit" data-act="submitcopy" disabled>Submit</button></div>`;
    } else if (screen === 'thanks') {
        headHtml = `<span class="rp-hspacer"></span><button type="button" class="rp-hbtn" data-act="close" aria-label="Close">${RP_X}</button>`;
        const mute = RP_MEM.muted.has(_rp.uid), blk = rpIsBlocked(_rp.uid), restricted = RP_MEM.restricted;
        const ic = {
            mute: '<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 9.5-4.9M18 9c0 4 1.5 5.5 2 6.5H8M10 19a2 2 0 0 0 4 0M3 3l18 18"/></svg>',
            block: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
            shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9.5 12l2 2 3.5-4"/></svg>',
            family: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5M15.5 14.4c2.6-.3 4.4 1 5 3.6"/></svg>'
        };
        const reasonTxt = escapeHTML(_rp.lastLabel || '');
        html = `<div class="rp-thanks2">
            <div class="rp-tk-top">
                <div class="rp-tk-check"><span class="rp-ring"></span><span class="rp-ring r2"></span><div class="rp-tk-c"><svg viewBox="0 0 24 24"><path d="M5.5 12.6l4.3 4.3L18.6 8"/></svg></div></div>
                <h1 class="rp-tk-h">Report received</h1>
                <p class="rp-tk-p">Thanks for helping keep Flaynity safe. Our team will review it, and the creator won't know it was you.</p>
                ${reasonTxt ? `<div class="rp-tk-pill">${reasonTxt}</div>` : ''}
            </div>
            <div class="rp-tk-card">
                ${_rp.uid ? `<div class="rp-tk-row"><span class="rp-tk-ic c1">${ic.mute}</span><div class="rp-tk-tx"><b>Mute ${nm}</b><em>Hide their posts from your feed</em></div><button type="button" class="rp-sw${mute ? ' on' : ''}" data-act="mute" aria-label="Mute"><i></i></button></div>
                <div class="rp-tk-row"><span class="rp-tk-ic c2">${ic.block}</span><div class="rp-tk-tx"><b>Block ${nm}</b><em>They won't show up for you</em></div><button type="button" class="rp-sw${blk ? ' on' : ''}" data-act="block" aria-label="Block"><i></i></button></div>` : ''}
                <div class="rp-tk-row"><span class="rp-tk-ic c3">${ic.shield}</span><div class="rp-tk-tx"><b>Restricted Mode</b><em>Limit content that may be sensitive</em></div><button type="button" class="rp-sw${restricted ? ' on' : ''}" data-act="restricted" aria-label="Restricted Mode"><i></i></button></div>
                <button type="button" class="rp-tk-row rp-tk-btn" data-act="parent"><span class="rp-tk-ic c4">${ic.family}</span><div class="rp-tk-tx"><b>Tell a parent or guardian</b><em>Post and account details stay private</em></div>${RP_CHEV}</button>
            </div>
            <div class="rp-tk-actions">
                <button type="button" class="rp-secondary" data-act="viewreports">View your reports</button>
                <button type="button" class="rp-primary" data-act="close">Done</button>
            </div>
        </div>`;
    } else if (screen === 'reports') {
        headHtml = `<button type="button" class="rp-hbtn" data-act="back" aria-label="Back">${RP_BACK}</button><div class="rp-htitle">Reports</div><span class="rp-hspacer"></span>`;
        const list = rpLoadReports();
        html = `<div class="rp-rs-top"><div class="rp-rs-t">Turn on Restricted Mode</div><div class="rp-rs-d">Limit content that may not be comfortable for all audiences. <a data-act="restricted">Learn more about Restricted Mode</a></div></div>` +
            (list.length ? list.map((r, i) => `<div class="rp-rcard">
                <div class="rp-rmain"><div class="rp-rtx"><div class="rp-rt">${escapeHTML(r.name || 'Flaynity User')}'s ${r.kind === 'post' ? 'post' : 'video'}</div>
                <div class="rp-rs">Status: Under review</div><div class="rp-rd">We'll review and take action if there is a violation of our Community Guidelines.</div></div>
                <div class="rp-rth">${r.thumb ? `<img src="${escapeHTML(r.thumb)}" alt="" onerror="this.remove()">` : ''}</div></div>
                <button type="button" class="rp-rmore" data-act="viewmore" data-i="${i}"><span>View more</span>${RP_CHEV}</button></div>`).join('')
                : '<div class="rp-empty">You have not reported anything yet.</div>');
    }
    head.innerHTML = headHtml;
    head.classList.remove('rp-line');
    body.classList.toggle('rp-noscroll', screen === 'thanks');
    body.innerHTML = `<div class="rp-wrap">${html}</div>`;
    body.scrollTop = 0;
}

function rpChannelName() {
    try {
        if (typeof currentChannelData !== 'undefined' && currentChannelData && currentChannelData.channelName) return currentChannelData.channelName;
        const c = JSON.parse(localStorage.getItem('flaynity_user_session_cache') || 'null');
        if (c && c.channelName) return c.channelName;
    } catch (e) {}
    return (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.displayName) ? auth.currentUser.displayName : 'Your channel';
}

function rpSyncForm() {
    const root = document.getElementById('fx-report-page'); if (!root) return;
    const d = root.querySelector('#rp-details'), a = root.querySelector('#rp-agree'), b = root.querySelector('#rp-submit');
    if (!d || !a || !b) return;
    const len = d.value.length, ok = d.value.trim().length >= 10;
    const cnt = root.querySelector('#rp-cnt'); if (cnt) cnt.textContent = len + '/200';
    const box = root.querySelector('#rp-count'); if (box) box.classList.toggle('ok', ok);
    b.disabled = !(ok && a.classList.contains('on'));
}

function rpFinish(label, type) {
    _rp.lastLabel = String(label || '').replace(/^Copyright: /, '');
    rpSaveReport({ id: _rp.id, kind: _rp.kind, name: _rp.name, thumb: _rp.thumb, reason: label, type: type, ts: Date.now() });
    rpShow('thanks', false);
}

function rpSubmitReport(key, label) {
    rpFinish(label, 'report');   // DEMO: কোথাও সেভ হয় না
}

function rpSubmitCopyright() {
    const root = document.getElementById('fx-report-page');
    const details = root.querySelector('#rp-details').value.trim();
    if (details.length < 10) return;
    rpFinish('Copyright: ' + _rp.copyLabel, 'copyright');   // DEMO: কোথাও সেভ হয় না
}

function rpAct(act, el) {
    if (act === 'back') return rpBack();
    if (act === 'close') return rpClose();
    if (act === 'reason') return rpSubmitReport(el.dataset.k, el.dataset.t);
    if (act === 'more') return rpShow('more');
    if (act === 'ipr') return rpShow('copyright');
    if (act === 'copyreason') { _rp.copyKey = el.dataset.k; _rp.copyLabel = el.dataset.t; return rpShow('copyform'); }
    if (act === 'agree') { el.classList.toggle('on'); return rpSyncForm(); }
    if (act === 'submitcopy') return rpSubmitCopyright();
    if (act === 'viewreports') return rpShow('reports');
    if (act === 'mute') {
        const on = !el.classList.contains('on'); el.classList.toggle('on', on);
        if (on) { RP_MEM.muted.add(_rp.uid); rpHideChannelNow(_rp.uid); } else RP_MEM.muted.delete(_rp.uid);
        return;
    }
    if (act === 'block') {
        const on = !el.classList.contains('on'); el.classList.toggle('on', on);
        rpSetBlocked(_rp.uid, on);
        if (on) rpHideChannelNow(_rp.uid);
        return;
    }
    if (act === 'restricted') {
        RP_MEM.restricted = !RP_MEM.restricted;
        document.querySelectorAll('#fx-report-page .rp-sw[data-act="restricted"]').forEach(x => x.classList.toggle('on', RP_MEM.restricted));
        return;
    }
    if (act === 'parent') return;
    if (act === 'viewmore') {
        const r = rpLoadReports()[parseInt(el.dataset.i, 10)];
        if (!r || r.kind === 'post') return;
        rpClose();
        setTimeout(() => { try { openMoviePage(String(r.id), false); } catch (e) {} }, 300);
    }
}

// ---- Copyright claim dialog ----
let _fxcId = null, _fxcKind = 'video', _fxcOwner = '', _fxcBusy = false;

function fxEnsureCopyright() {
    let root = document.getElementById('fx-copyright-dialog');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'fx-copyright-dialog';
    root.className = 'fxr-root';
    root.innerHTML = `
        <div class="fxr-card" id="fxc-card">
            <div class="fxr-head">
                <div class="fxr-flag"><svg viewBox="0 0 24 24"><path d="M6.5 3h7.6L19 7.9V19a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M8.5 12.5h7M8.5 16h7"/></svg></div>
                <div><h3>Copyright claim</h3><p>Tell us about your original work</p></div>
            </div>
            <input type="text" id="fxc-name" class="fxc-input" maxlength="80" placeholder="Your full name" autocomplete="off">
            <textarea id="fxc-details" class="fxc-input fxc-area" maxlength="600" rows="4" placeholder="Link or details of your original work (what was copied?)"></textarea>
            <button type="button" class="fxc-check" id="fxc-agree"><span class="fxc-box"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span>I am the copyright owner or authorized to act on their behalf.</span></button>
            <div class="fxr-actions">
                <button type="button" class="fxr-cancel" id="fxc-cancel">Cancel</button>
                <button type="button" class="fxr-send" id="fxc-send" disabled>Submit</button>
            </div>
        </div>`;
    document.body.appendChild(root);
    const sync = () => {
        const ok = root.querySelector('#fxc-name').value.trim().length >= 2 &&
                   root.querySelector('#fxc-details').value.trim().length >= 10 &&
                   root.querySelector('#fxc-agree').classList.contains('on');
        root.querySelector('#fxc-send').disabled = !ok || _fxcBusy;
    };
    root.addEventListener('click', (e) => { if (e.target === root) fxCloseCopyrightDialog(); });
    root.querySelector('#fxc-name').addEventListener('input', sync);
    root.querySelector('#fxc-details').addEventListener('input', sync);
    root.querySelector('#fxc-agree').addEventListener('click', (e) => { e.currentTarget.classList.toggle('on'); sync(); });
    root.querySelector('#fxc-cancel').addEventListener('click', () => fxCloseCopyrightDialog());
    root.querySelector('#fxc-send').addEventListener('click', () => fxSubmitCopyright());
    root._sync = sync;
    return root;
}

function fxOpenCopyrightDialog(contentId, kind, ownerId) {
    const root = fxEnsureCopyright();
    _fxcId = String(contentId); _fxcKind = kind === 'post' ? 'post' : 'video'; _fxcOwner = String(ownerId || ''); _fxcBusy = false;
    root.querySelector('#fxc-name').value = '';
    root.querySelector('#fxc-details').value = '';
    root.querySelector('#fxc-agree').classList.remove('on');
    const send = root.querySelector('#fxc-send'); send.textContent = 'Submit'; send.disabled = true;
    root.classList.remove('open', 'closing');
    AppNavigation.pushModal('fx-copyright-dialog');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
}

function fxCloseCopyrightDialog() {
    const root = document.getElementById('fx-copyright-dialog');
    if (!root || root.classList.contains('closing')) return;
    root.classList.add('closing');
    root.classList.remove('open');
    setTimeout(() => {
        const c = AppNavigation.current();
        if (c && c.type === 'modal' && c.id === 'fx-copyright-dialog') AppNavigation.pop();
        else root.style.display = 'none';
        root.classList.remove('closing');
    }, 200);
}

function fxSubmitCopyright() {
    if (_fxcBusy) return;
    const root = document.getElementById('fx-copyright-dialog');
    if (!root || !_fxcId) return;
    if (typeof auth === 'undefined' || !auth.currentUser) { showNotification('Please sign in to submit a claim', 'error'); return; }
    if (!navigator.onLine) { showNotification('Cannot submit a claim while offline.', 'error'); return; }
    const name = root.querySelector('#fxc-name').value.trim();
    const details = root.querySelector('#fxc-details').value.trim();
    if (name.length < 2 || details.length < 10) return;
    _fxcBusy = true;
    const send = root.querySelector('#fxc-send');
    send.textContent = 'Sending...'; send.disabled = true;
    db.ref(`copyright_claims/${_fxcId}/${auth.currentUser.uid}`)
        .set({ kind: _fxcKind, contentOwnerId: _fxcOwner, claimantName: name, details: details, claimantEmail: auth.currentUser.email || '', timestamp: Date.now() })
        .then(() => { showNotification('Copyright claim submitted. We will review it.', 'success', 2800); fxCloseCopyrightDialog(); })
        .catch(() => { showNotification('Could not submit the claim. Please try again.', 'error'); _fxcBusy = false; send.textContent = 'Submit'; send.disabled = false; });
}

// Title: 25 characters per line, max 2 lines ("…" at the end if longer).
function fxTitleTwoLines(title) {
    const W = 25;
    const t = Array.from(String(title || '').replace(/\s+/g, ' ').trim());
    if (t.length <= W) return t.join('');
    let cut = t.slice(0, W + 1).lastIndexOf(' ');
    if (cut < Math.floor(W * 0.5)) cut = W;
    const line1 = t.slice(0, cut).join('').trim();
    let rest = t.slice(cut);
    while (rest.length && rest[0] === ' ') rest.shift();
    if (rest.length > W) rest = rest.slice(0, W - 1).concat(['…']);
    return line1 + '\n' + rest.join('').trim();
}

// Dislike (per video). Live state is shared by every card of the same video (Home + Watch page).
const _fxDislikeCache = {};
const _fxDislikeBound = {};
const _fxMovieLikes = {};      // movie_stats/{id}/likes cache (same video, Home card + Play Page)
const _fxPlayLikeInit = {};

function fxIsVideoId(id) {
    return typeof allLongVideos !== 'undefined' && allLongVideos.some(v => String(v.id) === String(id));
}

// One like OR one dislike per user per video, shown identically on the Home card and on the Play Page.
function fxToggleVideoLike(id, silent) {
    if (typeof auth === 'undefined' || !auth.currentUser) { showNotification('Please sign in to Like', 'error'); return; }
    if (!navigator.onLine) { showNotification('Cannot react while offline.', 'error'); return; }
    const uid = auth.currentUser.uid;
    const rRef = db.ref(`post_reactions/${id}/${uid}`);
    const lRef = db.ref(`movie_stats/${id}/likes/${uid}`);
    Promise.all([rRef.once('value'), lRef.once('value')]).then(([r, l]) => {
        if (r.exists() || l.exists()) {
            rRef.remove().catch(() => {});
            lRef.remove().catch(() => {});
        } else {
            submitPostReaction(id, 'like', !!silent);
        }
    }).catch(() => showNotification('Like update failed. Please try again.', 'error'));
}

function fxPaintPlayLikes(id) {
    if (typeof currentActiveMovie === 'undefined' || !currentActiveMovie || String(currentActiveMovie.id) !== String(id)) return;
    const cache = _postReactionCache[id];
    if (!_fxMovieLikes[id] || !cache || !cache.reactions) return;
    const set = new Set(Object.keys(cache.reactions).concat(Object.keys(_fxMovieLikes[id])));
    const n = formatCount(set.size);
    const likesEl = document.getElementById('movie-detail-likes');
    const countEl = document.getElementById('movie-like-count');
    if (likesEl) likesEl.innerText = n + ' likes';
    if (countEl) countEl.innerText = n;
    const uid = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.uid : null;
    const silent = !_fxPlayLikeInit[id];
    _fxPlayLikeInit[id] = true;
    wpApplyReaction('movie-like-btn', !!(uid && set.has(uid)), silent);

    // Show my chosen reaction emoji (Love, Haha, ...) on the like button, like Posts do.
    let myType = null;
    if (uid) {
        const mine = cache.reactions[uid];
        if (mine && mine.type) myType = mine.type;
        else if (_fxMovieLikes[id][uid]) myType = 'like';
    }
    const btn = document.getElementById('movie-like-btn');
    if (btn) {
        const svg = (myType && myType !== 'like') ? fbRxSvg(myType) : '';
        if (svg) {
            let rx = btn.querySelector('.wp-rx-ico');
            if (!rx) { rx = document.createElement('span'); rx.className = 'wp-rx-ico'; btn.appendChild(rx); }
            rx.innerHTML = svg;
            btn.classList.add('wp-rx-on');
        } else {
            btn.classList.remove('wp-rx-on');
        }
    }
}
function fxPaintDislike(id) {
    const mine = !!(typeof auth !== 'undefined' && auth.currentUser && _fxDislikeCache[id] && _fxDislikeCache[id][auth.currentUser.uid]);
    document.querySelectorAll(`[data-fx-dislike="${id}"]`).forEach(b => b.classList.toggle('fx-on', mine));
}
function fxListenDislike(id) {
    if (_fxDislikeBound[id]) { fxPaintDislike(id); return; }
    if (typeof db === 'undefined') return;
    _fxDislikeBound[id] = true;
    db.ref(`movie_stats/${id}/dislikes`).on('value', snap => {
        _fxDislikeCache[id] = snap.val() || {};
        fxPaintDislike(id);
    });
    db.ref(`movie_stats/${id}/likes`).on('value', snap => {
        _fxMovieLikes[id] = snap.val() || {};
        try { paintPostReactions(id); } catch (e) {}
    });
}
try { auth.onAuthStateChanged(() => Object.keys(_fxDislikeCache).forEach(fxPaintDislike)); } catch (e) {}

function fxToggleDislike(id) {
    if (typeof playUI === 'function') playUI('click');
    if (typeof auth === 'undefined' || !auth.currentUser) { showNotification('Please sign in to Dislike', 'error'); return; }
    if (!navigator.onLine) { showNotification('Cannot dislike while offline.', 'error'); return; }
    const uid = auth.currentUser.uid;
    const dRef = db.ref(`movie_stats/${id}/dislikes/${uid}`);
    dRef.once('value', snap => {
        if (snap.exists()) {
            dRef.remove();
            fxClearDislikeFeedback(id, uid);
        } else {
            dRef.set(true).then(() => Promise.all([db.ref(`post_reactions/${id}/${uid}`).remove(), db.ref(`movie_stats/${id}/likes/${uid}`).remove()])).catch(() => {});
            fxOpenDislikeSheet(id);
        }
    });
}

// =========================================================
// HOME FEED AUTO PREVIEW: stay 2 seconds on a Long Video card => it plays (muted) inside the card.
// Scroll away => video stops and the banner comes back.
// =========================================================
const FX_PREVIEW_DELAY = 2000;
const FX_VOL_ON  = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
const FX_VOL_OFF = '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.5 2.5V12zM19 12c0 .9-.2 1.8-.5 2.6l1.5 1.5A8.8 8.8 0 0 0 21 12c0-4.3-3-7.9-7-8.8v2.1c2.9.9 5 3.5 5 6.7zM4.3 3L3 4.3 7.7 9H3v6h4l5 5v-6.7l4.2 4.2c-.7.5-1.4.9-2.2 1.1v2.1c1.4-.3 2.6-1 3.7-1.9l2 2 1.3-1.3L4.3 3zM12 4L9.9 6.1 12 8.2V4z"/></svg>';
const _fxPrev = { thumb: null, video: null, pending: null, timer: null };
let _fxPreviewMuted = true;

function fxThumbMetrics(thumb) {
    const r = thumb.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    return { r, vh, ratio: r.height ? visible / r.height : 0, cy: (r.top + r.bottom) / 2 };
}

// true when nothing (watch page, modal, other tab) covers the thumb
function fxThumbOnTop(thumb, r, vh) {
    const x = r.left + r.width / 2;
    const y = Math.min(Math.max((r.top + r.bottom) / 2, 1), vh - 1);
    const el = document.elementFromPoint(x, y);
    return !!el && thumb.contains(el);
}

function fxPickPreviewCandidate() {
    let best = null, bestDist = Infinity;
    document.querySelectorAll('#home-feed-container .fx-card .fx-thumb').forEach(t => {
        const m = fxThumbMetrics(t);
        if (!m.r.width || m.ratio < 0.75) return;
        if (m.cy < m.vh * 0.12 || m.cy > m.vh * 0.88) return;
        if (!fxThumbOnTop(t, m.r, m.vh)) return;
        const d = Math.abs(m.cy - m.vh * 0.45);
        if (d < bestDist) { best = t; bestDist = d; }
    });
    return best;
}

function fxStopPreview() {
    clearTimeout(_fxPrev.timer);
    _fxPrev.timer = null; _fxPrev.pending = null;
    const { thumb, video } = _fxPrev;
    _fxPrev.thumb = null; _fxPrev.video = null;
    if (video) {
        try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {}
        video.remove();
    }
    if (thumb) thumb.querySelectorAll('.fx-vol, .fx-prog').forEach(n => n.remove());
}

function fxStartPreview(thumb) {
    _fxPrev.timer = null; _fxPrev.pending = null;
    if (!thumb || !thumb.isConnected || document.hidden || !navigator.onLine) return;
    if (navigator.connection && navigator.connection.saveData) return;
    const m = fxThumbMetrics(thumb);
    if (m.ratio < 0.6 || !fxThumbOnTop(thumb, m.r, m.vh)) return;
    const card = thumb.closest('.fx-card');
    const id = card && card.dataset.fxId;
    const v = (typeof allLongVideos !== 'undefined') ? allLongVideos.find(x => String(x.id) === String(id)) : null;
    const raw = v && (v.videoLink || v.videoUrl);
    if (!raw || /youtube\.com|youtu\.be/i.test(raw)) return;
    const url = (typeof normalizeFlaynityMediaUrl === 'function') ? normalizeFlaynityMediaUrl(raw) : raw;
    if (!/^https?:\/\//i.test(url)) return;

    fxStopPreview();
    const vid = document.createElement('video');
    vid.className = 'fx-pv';
    vid.muted = _fxPreviewMuted; vid.defaultMuted = _fxPreviewMuted;
    vid.loop = true; vid.playsInline = true; vid.preload = 'auto';
    vid.setAttribute('playsinline', ''); vid.setAttribute('webkit-playsinline', '');
    vid.disablePictureInPicture = true;
    vid.setAttribute('controlslist', 'nodownload noremoteplayback');
    vid.src = url;

    const vol = document.createElement('button');
    vol.className = 'fx-vol'; vol.setAttribute('aria-label', 'Sound');
    vol.innerHTML = _fxPreviewMuted ? FX_VOL_OFF : FX_VOL_ON;
    vol.onclick = (e) => {
        e.stopPropagation();
        _fxPreviewMuted = !_fxPreviewMuted;
        vid.muted = _fxPreviewMuted;
        vol.innerHTML = _fxPreviewMuted ? FX_VOL_OFF : FX_VOL_ON;
        if (vid.paused) vid.play().catch(() => {});
    };
    const prog = document.createElement('div');
    prog.className = 'fx-prog'; prog.innerHTML = '<i></i>';
    const bar = prog.firstChild;

    vid.addEventListener('playing', () => { vid.style.opacity = '1'; });
    vid.addEventListener('timeupdate', () => { if (vid.duration) bar.style.width = (vid.currentTime / vid.duration * 100) + '%'; });
    vid.addEventListener('error', () => { if (_fxPrev.video === vid) fxStopPreview(); });

    const first = thumb.querySelector('img');
    if (first && first.nextSibling) thumb.insertBefore(vid, first.nextSibling); else thumb.appendChild(vid);
    thumb.appendChild(vol); thumb.appendChild(prog);
    _fxPrev.thumb = thumb; _fxPrev.video = vid;

    vid.play().catch(() => {
        if (!vid.muted) {
            _fxPreviewMuted = true; vid.muted = true; vol.innerHTML = FX_VOL_OFF;
            vid.play().catch(() => { if (_fxPrev.video === vid) fxStopPreview(); });
        } else if (_fxPrev.video === vid) fxStopPreview();
    });
}

function fxPreviewTick() {
    if (document.hidden) { if (_fxPrev.thumb || _fxPrev.pending) fxStopPreview(); return; }
    const cur = _fxPrev.thumb;
    if (cur) {
        let ok = cur.isConnected;
        if (ok) {
            const m = fxThumbMetrics(cur);
            ok = m.r.width > 0 && m.ratio >= 0.5 && m.cy > m.vh * 0.05 && m.cy < m.vh * 0.95 && fxThumbOnTop(cur, m.r, m.vh);
        }
        if (ok) return;
        fxStopPreview(); // scrolled away / covered => banner comes back
    }
    const cand = fxPickPreviewCandidate();
    if (cand !== _fxPrev.pending) {
        clearTimeout(_fxPrev.timer);
        _fxPrev.pending = cand;
        _fxPrev.timer = cand ? setTimeout(() => fxStartPreview(cand), FX_PREVIEW_DELAY) : null;
    }
}

(function fxInitPreview() {
    let raf = 0;
    document.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; fxPreviewTick(); });
    }, { capture: true, passive: true });
    document.addEventListener('visibilitychange', fxPreviewTick);
    setInterval(() => { fxPreviewTick(); fxFitCaptions(); }, 400);
})();

// ---- Facebook-style card helpers ----
const FX_HEART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';

// Subscribe pill (same as the Community Post header). One live listener per channel.
const _fxSubBound = {};
function fxBindSub(uid) {
    if (!uid || typeof auth === 'undefined' || !auth.currentUser || !navigator.onLine) return;
    const key = uid + '_' + auth.currentUser.uid;
    if (_fxSubBound[key]) return;
    _fxSubBound[key] = true;
    db.ref(`subscribers/${uid}/${auth.currentUser.uid}`).on('value', snap => {
        document.querySelectorAll(`.fx-sub-${CSS.escape(uid)}`).forEach(btn => {
            btn.innerText = snap.exists() ? 'Subscribed' : 'Subscribe';
            btn.classList.toggle('subbed', snap.exists());
        });
    });
}
try { auth.onAuthStateChanged(() => { document.querySelectorAll('.fb-subbtn[data-fx-uid]').forEach(b => fxBindSub(b.dataset.fxUid)); }); } catch (e) {}

// "… more" appears only when the caption really needs more than 2 lines.
function fxFitCaptions() {
    document.querySelectorAll('.fx-cap:not([data-fit])').forEach(c => {
        const t = c.querySelector('.fx-cap-t');
        if (!t || !t.clientWidth) return;
        c.dataset.fit = '1';
        if (t.scrollHeight > t.clientHeight + 2) c.classList.add('fx-over');
    });
}
function fxExpandCaption(btn) {
    const c = btn.closest('.fx-cap');
    if (c) c.classList.add('fx-open');
}
function fxShareVideo(id) {
    if (typeof playUI === 'function') playUI('click');
    const v = (typeof allLongVideos !== 'undefined') ? allLongVideos.find(x => String(x.id) === String(id)) : null;
    const data = { title: (v && v.title) || 'Flaynity', text: (v && v.title) || 'Flaynity', url: location.href };
    if (navigator.share) { navigator.share(data).catch(() => {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(location.href); if (typeof showNotification === 'function') showNotification('Link copied', 'success'); }
}
// Comment icon on a card: open the video, then its comments.
async function fxOpenVideoComments(id) {
    try { await openMoviePage(id, false); } catch (e) { return; }
    setTimeout(() => { try { openCommentModal(); } catch (e) {} }, 350);
}

function fxBuildLongVideoCard(v) {
    const id = String(v.id);
    const uid = v.userId || '';
    const isOwn = !!(typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid === uid);
    // Same reaction system as Community Posts (hold the like button => emoji picker).
    setTimeout(() => { try { registerPostReactionsListener(id); fxListenDislike(id); fxBindSub(uid); fxFitCaptions(); } catch (e) {} }, 0);
    setTimeout(fxFitCaptions, 250);
    const desc = (v.description || '').trim();
    const caption = escapeHTML(String(v.title || '').trim()) + (desc ? '\n' + escapeHTML(desc) : '');
    return `
        <div class="fx-card long-video-feed-card" data-fx-id="${id}" data-fx-uid="${uid}" onclick="openMoviePage('${id}', false)">
            <div class="fx-body">
                <div class="fx-head">
                    <div class="fx-ring"><div class="fx-ring-in"><div class="fx-av live-avatar-${uid}"></div></div></div>
                    <div class="fx-txt">
                        <div class="fx-channel live-username-${uid}">${escapeHTML(v.username || 'Flaynity User')}</div>
                        <div class="fx-sub"><span>${fbTimeShort(v.createdAt)}</span><span class="fb-dot">·</span><i class="fas fa-globe-americas"></i></div>
                    </div>
                    ${isOwn ? '' : `<button class="fb-subbtn fx-sub-${uid}" data-fx-uid="${uid}" onclick="event.stopPropagation(); toggleClipSubscribe('${uid}', this)">Subscribe</button>`}
                    <button class="fx-more" aria-label="More" onclick="event.stopPropagation(); fxOpenVideoMenu('${id}', this);">${FB_DOTS_SVG}</button>
                </div>
                <div class="fx-cap">
                    <div class="fx-cap-t long-video-title">${caption}</div>
                    <button class="fx-cap-more" onclick="event.stopPropagation(); fxExpandCaption(this)">… more</button>
                </div>
                <div class="fx-thumb long-video-thumb-container">
                    <img src="${v.poster || ''}" loading="lazy" decoding="async" alt="" draggable="false">
                    <span class="fx-dur long-video-duration">${v.duration || '10:00'}</span>
                </div>
                <div class="fx-foot">
                    <div class="fx-act">
                        <button id="post-love-btn-${id}" class="fx-ico post-action-btn-fb"
                                onmousedown="startReactionTimer('${id}', event)"
                                ontouchstart="startReactionTimer('${id}', event)"
                                onmouseup="clearReactionTimer('${id}', event)"
                                ontouchend="clearReactionTimer('${id}', event)"
                                onclick="event.stopPropagation(); handleLoveSingleClick('${id}')" aria-label="React">
                            <span class="love-icon-element" id="love-icon-${id}" data-fx-heart="1">${FX_HEART_SVG}</span>
                        </button>
                        <span id="love-text-${id}" style="display:none">Love</span>
                        <span id="post-total-reactions-${id}" class="fx-count" onclick="event.stopPropagation(); openReactedPeoplePage('${id}')">0</span>
                    </div>
                    <div class="fx-act" onclick="event.stopPropagation(); fxOpenVideoComments('${id}')">
                        <span class="fx-ico">${FB_COMMENT_SVG}</span>
                        <span id="post-total-comments-${id}" class="fx-count">0</span>
                    </div>
                    <div class="fx-act fx-share" onclick="event.stopPropagation(); fxShareVideo('${id}')">
                        <span class="fx-ico">${FB_SHARE_SVG}</span>
                    </div>
                    <div class="fx-spacer"></div>
                    <div class="fx-act fx-views">
                        <span class="fx-ico">${FX_ICON.eye}</span>
                        <span class="fx-count" data-fx-views="${id}">0</span>
                    </div>
                    <span id="post-top-emojis-${id}" class="fx-badges" onclick="event.stopPropagation(); openReactedPeoplePage('${id}')"></span>
                </div>
            </div>
        </div>`;
}

function fxLoadCardStats(id) {
    if (!navigator.onLine || typeof db === 'undefined') return;
    db.ref(`movie_stats/${id}/views`).once('value', s => {
        const txt = String(formatCount(Object.keys(s.val() || {}).length));
        document.querySelectorAll(`[data-fx-views="${id}"]`).forEach(el => { el.textContent = txt; });
    });
}

function renderLongVideosSegmentUI(segmentLongs) {
    if (!segmentLongs || segmentLongs.length === 0) return '';
    let html = '';
    segmentLongs.forEach(v => {
        html += fxBuildLongVideoCard(v);
        setTimeout(() => fxLoadCardStats(String(v.id)), 0);
    });
    return html;
}

function ensureHomePostScrollFlow() {
    try {
        const homeFeed = document.getElementById('home-feed-container');
        const homeTab = document.getElementById('home-tab');
        if (homeFeed) {
            homeFeed.style.overflow = 'visible';
            homeFeed.style.height = 'auto';
            homeFeed.style.maxHeight = 'none';
            homeFeed.style.touchAction = 'pan-y';
        }
        if (homeTab) {
            homeTab.style.overflow = 'visible';
            homeTab.style.height = 'auto';
            homeTab.style.maxHeight = 'none';
            homeTab.style.touchAction = 'pan-y';
        }
        document.body.style.touchAction = 'pan-y';
        document.documentElement.style.overflowY = 'auto';
    } catch (e) {}
}

const FB_LIKE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11H3v10h4h1h9.43c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z M7,20H4v-8h3V20z M19.98,13.17l-1.34,6C18.54,19.65,18.03,20,17.43,20H8v-8.61l5.6-6.06C13.79,5.12,14.08,5,14.38,5c0.26,0,0.5,0.11,0.63,0.3c0.07,0.1,0.15,0.26,0.09,0.47l-1.52,4.94L13.18,12h1.35h4.23c0.41,0,0.8,0.17,1.03,0.46C19.92,12.61,20.05,12.86,19.98,13.17z"/></svg>';
const FB_COMMENT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
const FB_SHARE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15,5.63L20.66,12L15,18.37V14h-1c-3.96,0-7.14,1-9.75,3.09c1.84-4.07,5.11-6.4,9.89-7.1L15,9.86V5.63 M14,3v6C6.22,10.13,3.11,15.33,2,21c2.78-3.97,6.44-6,12-6v6l9-9L14,3L14,3z"/></svg>';
const FB_DOTS_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="4.5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19.5" cy="12" r="2"/></svg>';
const FB_X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l16 16M20 4L4 20"/></svg>';
const _fbHiddenPosts = new Set();
function fbHiddenPostsKey() {
    const uid = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.uid : 'guest';
    return `fx_hidden_posts:${uid}`;
}
function fbReloadHiddenPosts() {
    _fbHiddenPosts.clear();
    try { JSON.parse(localStorage.getItem(fbHiddenPostsKey()) || '[]').forEach(x => _fbHiddenPosts.add(String(x))); } catch (e) {}
}
function fbPersistHiddenPosts() {
    try { localStorage.setItem(fbHiddenPostsKey(), JSON.stringify(Array.from(_fbHiddenPosts))); } catch (e) {}
}
fbReloadHiddenPosts();
try { auth.onAuthStateChanged(() => { fbReloadHiddenPosts(); }); } catch (e) {}

function fbTimeShort(ts) {
    if (!ts) return 'Just now';
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h';
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd';
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    return d.getFullYear() === new Date().getFullYear() ? `${mon} ${d.getDate()}` : `${mon} ${d.getDate()}, ${d.getFullYear()}`;
}

function fbCaptionHTML(text) {
    return String(text).split(/(#[^\s#]+)/g).map((p, i) => i % 2 ? `<span class="fb-tag">${escapeHTML(p)}</span>` : escapeHTML(p)).join('');
}

function fbReactionBadgesHTML(types) {
    return types.map((t, i) => `<span class="fb-badge" style="z-index:${10 - i}; ${i ? 'margin-left:-5px;' : ''}">${fbRxSvg(t)}</span>`).join('');
}

function renderSinglePostSegmentUI(post) {
    ensureHomePostScrollFlow();
    if (!post) return '';
    if (_fbHiddenPosts.has(String(post.id))) return '';
    if (post.userId && typeof _fxHiddenChannels !== 'undefined' && _fxHiddenChannels.has(String(post.userId))) return '';

    const titleText = post.title || post.caption || '';
    const plainCaption = post.caption || '';
    const combinedText = (titleText === plainCaption ? plainCaption : `${titleText}\n\n${plainCaption}`).trim();
    const isLong = combinedText.length > 150 || combinedText.split('\n').length > 4;

    const subBtnId = `post-sub-btn-${post.id}`;
    const isOwn = !!(auth.currentUser && auth.currentUser.uid === post.userId);

    if (auth.currentUser && navigator.onLine && !isOwn) {
        db.ref(`subscribers/${post.userId}/${auth.currentUser.uid}`).on('value', (snapshot) => {
            document.querySelectorAll(`[id="${subBtnId}"]`).forEach(btn => {
                if (snapshot.exists()) {
                    btn.innerText = "Subscribed";
                    btn.classList.add('subbed');
                } else {
                    btn.innerText = "Subscribe";
                    btn.classList.remove('subbed');
                }
            });
        });
    }

    const captionHtml = combinedText ? `
        <div class="fb-caption-wrap">
            <div id="post-caption-${post.id}" class="fb-caption ${isLong ? 'fb-clamp' : ''}">${fbCaptionHTML(combinedText)}</div>
            ${isLong ? `<button id="post-more-${post.id}" class="fb-seemore" onclick="togglePostTitleExpand('${post.id}')">See more</button>` : ''}
        </div>` : '';

    const mediaHtml = (post.images && post.images.length > 0) ? `
        <div class="fb-media">
            <img src="${post.images[0]}" onclick="openFullScreenImagePreview('${post.images[0]}')" loading="lazy" alt="">
            ${post.images.length > 1 ? `<div class="fb-more-badge">+${post.images.length - 1} More</div>` : ''}
        </div>` : '';

    const totalReactionsId = `post-total-reactions-${post.id}`;
    const totalCommentsId = `post-total-comments-${post.id}`;
    const topEmojisId = `post-top-emojis-${post.id}`;
    const loveBtnId = `post-love-btn-${post.id}`;

    // Whatever inserts this HTML, make sure its reaction/comment data gets bound and painted.
    setTimeout(() => registerPostReactionsListener(post.id), 0);

    return `
        <div class="post-card fb-post" id="post-card-${post.id}" data-fb-uid="${post.userId || ''}">
            <div class="fb-head">
                <div class="fb-ring"><div class="fb-av live-avatar-${post.userId}"></div></div>
                <div class="fb-who">
                    <div class="fb-name">
                        <span class="fb-uname live-username-${post.userId}">${escapeHTML(post.username || 'Flaynity User')}</span>
                        
                    </div>
                    <div class="fb-sub"><span>${fbTimeShort(post.createdAt)}</span><span class="fb-dot">·</span><i class="fas fa-globe-americas"></i></div>
                </div>
                ${isOwn ? '' : `<button id="${subBtnId}" class="fb-subbtn" onclick="toggleClipSubscribe('${post.userId}', this)">Subscribe</button>`}
                <button class="fb-hbtn" onclick="event.stopPropagation(); fbOpenPostMenu('${post.id}')" aria-label="More options">${FB_DOTS_SVG}</button>
                <button class="fb-hbtn fb-x" onclick="fbHidePost('${post.id}')" aria-label="Hide">${FB_X_SVG}</button>
            </div>
            ${captionHtml}
            ${mediaHtml}
            <div class="fb-foot">
                <div class="fb-act">
                    <button id="${loveBtnId}" class="fb-ico post-action-btn-fb"
                            onmousedown="startReactionTimer('${post.id}', event)"
                            ontouchstart="startReactionTimer('${post.id}', event)"
                            onmouseup="clearReactionTimer('${post.id}', event)"
                            ontouchend="clearReactionTimer('${post.id}', event)"
                            onclick="handleLoveSingleClick('${post.id}')" aria-label="React">
                        <span class="love-icon-element" id="love-icon-${post.id}">${FB_LIKE_SVG}</span>
                    </button>
                    <span id="love-text-${post.id}" style="display:none">Love</span>
                    <span id="${totalReactionsId}" class="fb-count" onclick="openReactedPeoplePage('${post.id}')">0</span>
                </div>
                <div class="fb-act" onclick="openCommentsForPost('${post.id}')">
                    <span class="fb-ico">${FB_COMMENT_SVG}</span>
                    <span id="${totalCommentsId}" class="fb-count">0</span>
                </div>
                <div class="fb-act" onclick="fbSharePost('${post.id}')">
                    <span class="fb-ico">${FB_SHARE_SVG}</span>
                </div>
                <div class="fb-spacer"></div>
                <span id="${topEmojisId}" class="fb-badges" onclick="openReactedPeoplePage('${post.id}')"></span>
            </div>
        </div>
    `;
}

// A post card can exist on Home and on the Posts page at once (same ids):
// act on the copy the user can actually see.
function fbPickVisible(id) {
    const all = document.querySelectorAll(`[id="${id}"]`);
    for (const el of all) { if (el.getClientRects().length) return el; }
    return all[0] || null;
}

function togglePostTitleExpand(postId) {
    playUI('click');
    const el = fbPickVisible(`post-caption-${postId}`);
    const btn = fbPickVisible(`post-more-${postId}`);
    if (!el) return;
    const clamped = el.classList.toggle('fb-clamp');
    if (btn) btn.style.display = clamped ? 'inline' : 'none';
}

function fbHidePost(postId, persist) {
    playUI('click');
    const el = fbPickVisible(`post-card-${postId}`);
    _fbHiddenPosts.add(String(postId));
    if (persist) fbPersistHiddenPosts();
    document.querySelectorAll(`[id="post-card-${postId}"]`).forEach(c => { if (c !== el) c.remove(); });
    if (!el) return;
    el.style.height = el.offsetHeight + 'px';
    el.style.overflow = 'hidden';
    el.style.transition = 'height .32s ease, opacity .25s ease, margin .32s ease';
    requestAnimationFrame(() => { el.style.opacity = '0'; el.style.height = '0px'; el.style.marginBottom = '0px'; });
    setTimeout(() => el.remove(), 350);
}

function fbSharePost(postId) {
    playUI('click');
    const p = (typeof allCommunityPosts !== 'undefined') ? allCommunityPosts.find(x => String(x.id) === String(postId)) : null;
    const data = { title: (p && (p.title || p.caption)) || 'Flaynity', text: (p && (p.caption || p.title)) || 'Flaynity', url: location.href };
    if (navigator.share) { navigator.share(data).catch(() => {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(location.href); if (typeof showNotification === 'function') showNotification('Link copied', 'success'); }
}

function playFeelsSlide(shortId, resetTime = true) {
    const targetSlide = document.getElementById(`slide-short-${shortId}`);
    if (!targetSlide) return false;

    const swiper = targetSlide.closest('.feels-swiper');
    // Only scroll the Feels feed itself. scrollIntoView() can move the whole
    // app/document, which makes a Feels selected from Home jump unexpectedly.
    if (swiper) scrollFeelsToSlide(swiper, targetSlide, 'auto');

    const slides = Array.from(document.querySelectorAll('#feels-swiper-container .short-slide'));
    currentActiveFeelsIdx = slides.indexOf(targetSlide);
    feelsLastPlayedId = shortId;
    feelsLastPlayedByMode[feelsFeedMode] = shortId;

    const video = targetSlide.querySelector('video');
    if (video) {
        if (resetTime) video.currentTime = 0;
        video.muted = false;
        const play = () => video.play().catch(() => {
            video.muted = true;
            video.play().catch(() => {});
        });
        if (video.readyState >= 2) play();
        else video.addEventListener('canplay', play, { once: true });
    }

    optimizeFeelsMemoryAndPreload(currentActiveFeelsIdx);
    return true;
}

function openShortFromHome(shortId) {
    hfMarkSeen(shortId);   // watched Feels sink in the next random Home feed
    AppNavigation.rememberHome();   // save Home scroll BEFORE the Feels tab is shown
    const targetId = String(shortId);
    // New random Feels session: the tapped Feels is the FIRST one (nothing above it, so the user can
    // only scroll DOWN; Feels played after it stay above as previews). Pull-to-Refresh works on it.
    if (feelsFeedMode !== 'for-you') { feelsFeedMode = 'for-you'; try { updateFeelsModeButtons(); } catch (e) {} }
    feelsStartSession('for-you', targetId);
    const feelsDomExisted = !!document.querySelector('#feels-swiper-container .short-slide');
    currentActiveFeelsIdx = -1;
    // Lock the exact Home Feels before navigation so the first slide cannot
    // become active while the Feels tab is being shown/rebuilt.
    feelsProgrammaticTargetId = targetId;
    feelsProgrammaticTargetUntil = Date.now() + 1500;
    switchTab('feels');
    // The Feels DOM already existed (built earlier): rebuild it with the new session order.
    if (feelsDomExisted) buildFeelsPage();

    // AppNavigation.syncUI() builds the Feels DOM synchronously when the tab
    // is opened. Activate the exact tapped Feels SYNCHRONOUSLY, before the
    // IntersectionObserver gets its first callback. Waiting for a frame lets
    // the observer see A/B/C/D first, which makes those Feels briefly play
    // while the swiper moves to the user's tapped Feels (for example E).
    // Never animate through the intermediate Feels on a Home-card open.
    if (!playFeelsSlide(targetId, true)) {
        feelsProgrammaticTargetUntil = Date.now() + 3000;
    }
}

function triggerHapticFeedback() {
    if (navigator.vibrate) {
        navigator.vibrate(15); 
    }
}

function spawnDoubleTapHeart(e, slideElement) {
    const rect = slideElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const heart = document.createElement('i');
    heart.className = 'fa-solid fa-heart double-tap-heart';
    heart.style.left = `${x}px`;
    heart.style.top = `${y}px`;
    
    slideElement.appendChild(heart);
    triggerHapticFeedback();
    
    setTimeout(() => { heart.remove(); }, 800);
}

// =========================================================
// HIGH PERFORMANCE FEELS BUILDER
// =========================================================


let feelsFeedMode = 'for-you';
const feelsSubscribedChannels = {};
const feelsSubscriptionListeners = {};
const feelsLikedByUser = {};
const feelsSavedByUser = {};
const feelsCommentsCache = {};
let feelsLastPlayedId = null;
let feelsPendingRestoreId = null;
// Locks the exact Feels being opened/restored so IntersectionObserver cannot
// temporarily select the first slide during a DOM rebuild.
let feelsProgrammaticTargetId = null;
let feelsProgrammaticTargetUntil = 0;
const feelsLastPlayedByMode = { 'for-you': null, 'subscribe': null };

// =========================================================
// FEELS RANDOM SESSION ENGINE
// - Every Feels feed (For You / Subscribe) is a random "session": one random order that stays STABLE
//   (realtime updates / tab switches never reshuffle it).
// - A new session starts: on the first open of the app, when a Feels is opened from Home/Posts/Channel
//   (that Feels becomes the FIRST one, nothing above it) and on Pull-to-Refresh at the first Feels.
// - Feels that were already played stay above the current one, so the user can scroll UP only to
//   previews of Feels they have already seen, and DOWN to new ones. Nothing unseen exists above.
// =========================================================
const feelsSessionOrder = { 'for-you': [], 'subscribe': [] };

function feelsApplyDarkNav(on) {
    if (!document.getElementById('feels-dark-nav-style')) {
        const st = document.createElement('style');
        st.id = 'feels-dark-nav-style';
        st.textContent = 'body.feels-nav-dark .bottom-nav { --surface:#0F0F0F; --bg-color:#0F0F0F; --card-bg:#0F0F0F; --border-color:#222222; --text-main:#FFFFFF; --text-muted:#AAAAAA; background:#0F0F0F !important; border-top-color:#222222 !important; }';
        document.head.appendChild(st);
    }
    document.body.classList.toggle('feels-nav-dark', !!on);
}
const FEELS_SEEN_KEY = 'flaynity_feels_seen_v1';
const FEELS_SEEN_TTL = 14 * 24 * 3600 * 1000;

function feelsReadSeen() {
    try { return JSON.parse(localStorage.getItem(FEELS_SEEN_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function feelsMarkSeen(id) {
    if (id === undefined || id === null || id === '') return;
    try {
        const m = feelsReadSeen();
        m[String(id)] = Date.now();
        const keys = Object.keys(m);
        if (keys.length > 1500) {
            keys.sort((a, b) => m[a] - m[b]).slice(0, keys.length - 1000).forEach(k => { delete m[k]; });
        }
        localStorage.setItem(FEELS_SEEN_KEY, JSON.stringify(m));
    } catch (e) {}
}

function feelsListForMode(mode) {
    if (mode === 'subscribe') {
        return allFeels.filter(s => { const channelId = s.userId || s.channelId; return channelId && channelId !== auth.currentUser?.uid && !!feelsSubscribedChannels[channelId]; });
    }
    return allFeels;
}

// Random order (ids). Fresh uploads get a small boost, already watched Feels sink. `firstId` is forced to position 0.
function feelsBuildOrder(list, firstId) {
    let rnd;
    try { const a = new Uint32Array(2); crypto.getRandomValues(a); rnd = a[0] + '-' + a[1]; }
    catch (e) { rnd = Math.random() + '-' + Math.random(); }
    const now = Date.now();
    const seed = _hfHash(now + '|' + rnd);
    const seen = feelsReadSeen();
    const scored = list.map(it => {
        const id = String(it && it.id);
        const r = _hfHash(seed + '|' + id) / 4294967296;
        const ageDays = Math.max(0, (now - (it.createdAt || 0)) / 86400000);
        const fresh = it.createdAt ? Math.exp(-ageDays / 10) : 0;
        const t = seen[id];
        const watched = t && (now - t) < FEELS_SEEN_TTL;
        return { it, s: r * 0.75 + fresh * 0.25 - (watched ? 0.9 : 0) };
    });
    scored.sort((a, b) => b.s - a.s);
    const out = scored.map(x => x.it);
    // avoid the same channel back-to-back
    for (let i = 1; i < out.length; i++) {
        const u = out[i].userId || out[i].channelId;
        if (u && (out[i - 1].userId || out[i - 1].channelId) === u) {
            for (let j = i + 1; j < Math.min(out.length, i + 6); j++) {
                if ((out[j].userId || out[j].channelId) !== u) { const tmp = out[i]; out[i] = out[j]; out[j] = tmp; break; }
            }
        }
    }
    const ids = out.map(x => String(x.id));
    if (firstId !== undefined && firstId !== null) {
        const f = String(firstId);
        const idx = ids.indexOf(f);
        if (idx > -1) { ids.splice(idx, 1); ids.unshift(f); }
    }
    return ids;
}

// Start a brand-new random session for a mode. `firstId` (optional) becomes the first Feels.
function feelsStartSession(mode, firstId) {
    const m = mode === 'subscribe' ? 'subscribe' : 'for-you';
    feelsSessionOrder[m] = feelsBuildOrder(feelsListForMode(m), firstId);
    const first = (firstId !== undefined && firstId !== null) ? String(firstId) : (feelsSessionOrder[m][0] || null);
    feelsLastPlayedByMode[m] = first;
    feelsLastPlayedId = first;
    return feelsSessionOrder[m];
}

// Order a list by the stable session order. Unknown (new) Feels are appended at the end.
function feelsApplySessionOrder(mode, list) {
    if (!list || !list.length) return [];
    const m = mode === 'subscribe' ? 'subscribe' : 'for-you';
    let order = feelsSessionOrder[m] || [];
    if (!order.length) {
        order = feelsBuildOrder(list, null);
    } else {
        const inList = new Set(list.map(s => String(s.id)));
        const kept = order.filter(id => inList.has(id));
        const have = new Set(kept);
        const added = list.filter(s => !have.has(String(s.id)));
        order = kept.concat(added.length ? feelsBuildOrder(added, null) : []);
    }
    feelsSessionOrder[m] = order;
    const byId = new Map(list.map(s => [String(s.id), s]));
    return order.map(id => byId.get(id)).filter(Boolean);
}

function feelsResetSessions() {
    feelsSessionOrder['for-you'] = [];
    feelsSessionOrder['subscribe'] = [];
    feelsLastPlayedByMode['for-you'] = null;
    feelsLastPlayedId = null;
    try { feelsDetachListeners(); } catch (e) {}
}

// Firebase listeners created by buildFeelsPage(): detached before every rebuild so that
// Pull-to-Refresh / mode switches never stack duplicate listeners.
const feelsListenerRegistry = [];
function feelsTrackListener(ref, cb) {
    ref.on('value', cb);
    feelsListenerRegistry.push([ref, cb]);
}
function feelsDetachListeners() {
    while (feelsListenerRegistry.length) {
        const pair = feelsListenerRegistry.pop();
        try { pair[0].off('value', pair[1]); } catch (e) {}
    }
}

// =========================================================
// FEELS PULL-TO-REFRESH (TikTok style)
// Works ONLY while the very first Feels of the feed is on screen (scrollTop = 0).
// Pull down -> new random session -> the feed is rebuilt and the new first Feels plays.
// From the 2nd Feels onwards a downward drag only scrolls back to the previous (watched) Feels.
// =========================================================
const FEELS_PTR_TRIGGER = 70;   // damped px needed to refresh
const FEELS_PTR_MAX = 120;
const FEELS_PTR_HOLD = 60;
const feelsPtr = { tracking: false, pulling: false, refreshing: false, startY: 0, startX: 0, dist: 0, swiper: null };

function feelsPtrIndicator() {
    const tab = document.getElementById('feels-tab');
    if (!tab) return null;
    let el = document.getElementById('feels-ptr');
    if (!el) {
        el = document.createElement('div');
        el.id = 'feels-ptr';
        el.className = 'feels-ptr';
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="4" width="22" height="24" rx="6"></rect><path d="M12 4v4h8V4"></path><path class="fp-play" d="M13 13l7 4-7 4z"></path></svg>';
        tab.appendChild(el);
    }
    return el;
}

function feelsPtrAllowed(sw, target) {
    if (document.body.classList.contains('auth-active')) return false;
    const tab = document.getElementById('feels-tab');
    if (!tab || !tab.classList.contains('active') || tab.classList.contains('fds-open')) return false;
    if (typeof feelsAdShowing !== 'undefined' && feelsAdShowing) return false;
    let cur = null;
    try { cur = AppNavigation.current(); } catch (e) {}
    if (!cur || cur.type !== 'tab' || cur.id !== 'feels') return false;   // no page / modal / sheet on top
    const hasOfflineSkel = !!(sw.querySelector && sw.querySelector('.offline-feels-screen'));
    if (!hasOfflineSkel && !sw.querySelector('.short-slide')) return false;
    if ((sw.scrollTop || 0) > 2) return false;                             // first Feels only
    if (sw.classList.contains('feels-switching')) return false;
    if (sw.querySelector('.short-slide.scrubbing')) return false;
    if (target && target.closest && target.closest('.short-progress-container')) return false;
    return true;
}

function feelsPtrRender(dist, animate) {
    // The Feels video stays exactly where it is. Only the Home-style indicator appears.
    const ind = feelsPtrIndicator();
    if (!ind) return;
    const p = Math.max(0, Math.min(1, (dist - 10) / 40));
    const y = -20 + Math.min(dist, FEELS_PTR_MAX) * 0.5;
    ind.style.transition = animate ? 'opacity .2s ease, transform .28s cubic-bezier(.22,1,.36,1)' : 'none';
    ind.style.opacity = String(p);
    ind.style.transform = 'translate3d(-50%,' + y.toFixed(1) + 'px,0) scale(' + (0.7 + 0.3 * p).toFixed(2) + ')';
}

function feelsPtrReset(animate) {
    const ind = feelsPtrIndicator();
    if (ind) ind.classList.remove('spinning');
    feelsPtrRender(0, animate);
}

// Feels bottom-nav button tapped while Feels is open: same refresh as Pull-to-Refresh.
function feelsRefreshFromNav() {
    if (feelsPtr.refreshing) return;
    const sw = document.querySelector('#feels-swiper-container .feels-swiper');
    if (!sw) return;
    const first = sw.querySelector('.short-slide');
    if (first) scrollFeelsToSlide(sw, first, 'auto');   // jump to the top of the feed
    feelsPtr.swiper = sw;
    feelsRunPullRefresh();
}

async function feelsRunPullRefresh() {
    const p = feelsPtr;
    if (p.refreshing) return;
    const sw = p.swiper;
    const container = document.getElementById('feels-swiper-container');
    if (!sw || !container) { feelsPtrReset(true); return; }

    p.refreshing = true;
    const ind = feelsPtrIndicator();
    feelsPtrRender(FEELS_PTR_HOLD, true);
    if (ind) { ind.style.opacity = '1'; ind.classList.add('spinning'); }
    try { triggerFeelsHaptic(14); } catch (e) {}
    try { playUI('click'); } catch (e) {}

    try {
        const isLive = typeof window.flCheckLiveInternet === 'function'
            ? await window.flCheckLiveInternet(4000)
            : navigator.onLine;
        if (!isLive) {
            window.__flaynityLiveOnline = false;
            try { showNotification('No internet connection', 'error'); } catch (e) {}
            return;
        }

        window.__flaynityLiveOnline = true;
        window.__flaynityOfflineSessionActive = false;
        try { firebase.database().goOnline(); } catch (e) {}

        const t0 = Date.now();
        container.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (e) {} });

        await SyncManager.refreshEverything({ force: true });

        // New random session for the CURRENT mode (For You or Subscribe)
        feelsStartSession(feelsFeedMode, null);

        const wait = Math.max(0, 500 - (Date.now() - t0));
        await new Promise(r => setTimeout(r, wait));

        // Old feed fades out, new random feed replaces it and starts from its first Feels
        if (sw.classList) sw.classList.add('feels-switching');
        await new Promise(r => setTimeout(r, 190));

        feelsProgrammaticTargetId = null;
        feelsProgrammaticTargetUntil = 0;
        feelsPendingRestoreId = null;
        currentActiveFeelsIdx = -1;
        buildFeelsPage();
    } catch (e) {
        console.error('Feels PTR error:', e);
    } finally {
        feelsPtr.swiper = null;
        const ind2 = feelsPtrIndicator();
        if (ind2) {
            ind2.classList.remove('spinning');
            ind2.style.transition = 'opacity .2s ease';
            ind2.style.opacity = '0';
        }
        p.refreshing = false;
        p.tracking = false;
        p.pulling = false;
    }
}

(function initFeelsPullToRefresh() {
    if (window.__flaynityFeelsPTR) return;
    window.__flaynityFeelsPTR = true;
    const p = feelsPtr;

    document.addEventListener('touchstart', (e) => {
        p.tracking = false;
        p.pulling = false;
        if (p.refreshing || !e.touches || e.touches.length !== 1) return;
        const t = e.target;
        const sw = t && t.closest ? (t.closest('#feels-swiper-container .feels-swiper') || t.closest('#feels-swiper-container')) : null;
        if (!sw || !feelsPtrAllowed(sw, t)) return;
        p.tracking = true;
        p.swiper = sw;
        p.startY = e.touches[0].clientY;
        p.startX = e.touches[0].clientX;
        p.dist = 0;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!p.tracking || p.refreshing) return;
        if (!e.touches || e.touches.length !== 1) { p.tracking = false; if (p.pulling) { p.pulling = false; feelsPtrReset(true); } return; }
        const sw = p.swiper;
        if (!sw || !sw.isConnected) { p.tracking = false; p.pulling = false; return; }
        const dy = e.touches[0].clientY - p.startY;
        const dx = Math.abs(e.touches[0].clientX - p.startX);

        if (!p.pulling) {
            // Finger moving up (or the feed already left the first Feels) = normal Feels scrolling.
            if (dy < -4 || sw.scrollTop > 2) { p.tracking = false; return; }
            if (dy > 6 && dy > dx * 1.2) p.pulling = true;
            else { if (dx > 14 && dx > Math.abs(dy)) p.tracking = false; return; }
        }

        if (e.cancelable) e.preventDefault();
        p.dist = Math.min(FEELS_PTR_MAX, Math.max(0, (dy - 6) * 0.55));
        feelsPtrRender(p.dist, false);
    }, { passive: false });

    const end = () => {
        if (!p.tracking && !p.pulling) return;
        const wasPulling = p.pulling;
        p.tracking = false;
        p.pulling = false;
        if (!wasPulling || p.refreshing) return;
        if (p.dist >= FEELS_PTR_TRIGGER) feelsRunPullRefresh();
        else feelsPtrReset(true);
        p.dist = 0;
    };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
})();

function triggerFeelsHaptic(pattern = 12) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }
function getCurrentVisibleFeelsId(mode = feelsFeedMode) {
    const swiper = document.querySelector('#feels-swiper-container .feels-swiper');
    if (!swiper) return feelsLastPlayedByMode[mode] || feelsLastPlayedId;
    const slides = Array.from(swiper.querySelectorAll('.short-slide'));
    if (!slides.length) return feelsLastPlayedByMode[mode] || feelsLastPlayedId;

    let best = null;
    let bestDistance = Infinity;
    const swiperRect = swiper.getBoundingClientRect();
    slides.forEach(slide => {
        const rect = slide.getBoundingClientRect();
        const distance = Math.abs(rect.top - swiperRect.top);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = slide;
        }
    });
    if (best && bestDistance < swiper.clientHeight * 0.55) {
        return best.getAttribute('data-shortid') || feelsLastPlayedByMode[mode] || feelsLastPlayedId;
    }
    return feelsLastPlayedByMode[mode] || feelsLastPlayedId;
}

function scrollFeelsToSlide(swiper, slide, behavior = 'auto') {
    if (!swiper || !slide) return;
    // Never use scrollIntoView here. It can scroll the page/window itself.
    // Home-card opens must be an instant jump to the tapped Feels, not a
    // smooth traversal through every Feels before it.
    const top = slide.offsetTop;
    try {
        if (behavior === 'auto') {
            const previousBehavior = swiper.style.scrollBehavior;
            swiper.style.scrollBehavior = 'auto';
            swiper.scrollTop = top;
            swiper.style.scrollBehavior = previousBehavior;
        } else {
            swiper.scrollTo({ top, behavior });
        }
    } catch (e) {
        swiper.scrollTop = top;
    }
}

function setFeelsFeedMode(mode) {
    const nextMode = mode === 'subscribe' ? 'subscribe' : 'for-you';
    if (feelsFeedMode === nextMode) {
        triggerFeelsHaptic(8);
        updateFeelsModeButtons();
        return;
    }

    // Remember the last Feels independently for each feed. Switching to
    // Subscribe must not replace the For You position, and switching back
    // must restore the last Feels from For You (and vice versa).
    const visibleId = getCurrentVisibleFeelsId(feelsFeedMode);
    if (visibleId) {
        feelsLastPlayedByMode[feelsFeedMode] = visibleId;
        feelsLastPlayedId = visibleId;
    }
    // Freeze the exact Feels being switched away from. During the rebuild,
    // IntersectionObserver may briefly see the first slide and must not
    // overwrite this selection before it is restored in the new feed.
    feelsPendingRestoreId = feelsLastPlayedByMode[nextMode] || null;

    feelsFeedMode = nextMode;
    triggerFeelsHaptic(12);
    updateFeelsModeButtons();

    const oldSwiper = document.querySelector('#feels-swiper-container .feels-swiper');
    if (oldSwiper) oldSwiper.classList.add('feels-switching');

    // Lock the exact Feels to restore before rebuilding. This blocks the
    // transient first-slide IntersectionObserver event during the switch.
    const restoreId = feelsPendingRestoreId || feelsLastPlayedByMode[nextMode] || null;
    feelsProgrammaticTargetId = restoreId ? String(restoreId) : null;
    feelsProgrammaticTargetUntil = Date.now() + 1500;

    requestAnimationFrame(() => {
        buildFeelsPage();

        requestAnimationFrame(() => {
            const swiper = document.querySelector('#feels-swiper-container .feels-swiper');
            if (!swiper) {
                feelsPendingRestoreId = null;
                return;
            }
            const target = restoreId ? document.getElementById(`slide-short-${restoreId}`) : null;
            const targetSlide = target || swiper.querySelector('.short-slide');
            if (targetSlide) {
                const targetId = targetSlide.getAttribute('data-shortid');
                if (targetId) {
                    feelsProgrammaticTargetId = String(targetId);
                    feelsProgrammaticTargetUntil = Date.now() + 1500;
                    playFeelsSlide(targetId, false);
                }
                feelsPendingRestoreId = null;
            }
            requestAnimationFrame(() => swiper.classList.remove('feels-switching'));
        });
    });
}

function updateFeelsModeButtons() {
    document.querySelectorAll('.feels-mode-btn').forEach(btn => {
        const active = btn.dataset.mode === feelsFeedMode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
}
function ensureFeelsSubscriptionListeners() {
    if (!auth.currentUser || !navigator.onLine) return;
    const uid = auth.currentUser.uid;
    const ids = new Set(allFeels.map(s => s.userId || s.channelId).filter(Boolean));
    ids.forEach(channelId => {
        if (feelsSubscriptionListeners[channelId]) return;
        const ref = db.ref(`subscribers/${channelId}/${uid}`);
        feelsSubscriptionListeners[channelId] = ref;
        ref.on('value', snap => {
            const next = snap.exists();
            const changed = feelsSubscribedChannels[channelId] !== next;
            feelsSubscribedChannels[channelId] = next;
            if (changed && feelsFeedMode === 'subscribe') buildFeelsPage();
        });
    });
}
function clearFeelsSubscriptionListeners() {
    Object.keys(feelsSubscriptionListeners).forEach(id => { try { feelsSubscriptionListeners[id].off(); } catch(e) {} delete feelsSubscriptionListeners[id]; });
    Object.keys(feelsSubscribedChannels).forEach(id => delete feelsSubscribedChannels[id]);
}
function openFeelsDescription(shortId, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    triggerFeelsHaptic(10);
    const s = allFeels.find(item => String(item.id) === String(shortId));
    if (!s) return;
    currentActiveMovie = s;
    openShortDescBottomSheet(s.id);
}
function openFeelsComments(shortId, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    triggerFeelsHaptic(10);
    const s = allFeels.find(item => String(item.id) === String(shortId));
    if (!s) return;
    currentActiveMovie = s;
    keepFeelsVideoActive(s.id);
    openShortComments(s.id);
}

function fitFeelsTitles(attempt = 0) {
    const titles = document.querySelectorAll('#feels-swiper-container .short-title-text');
    let waiting = false;
    titles.forEach(h => {
        const full = h.dataset.full != null ? h.dataset.full : (h.dataset.full = h.textContent);
        if (!h.clientWidth) { waiting = true; return; }          // tab not visible yet
        if (h.dataset.fitW === String(h.clientWidth)) return;    // already fitted for this width
        h.dataset.fitW = String(h.clientWidth);
        h.classList.add('measure');
        const lh = parseFloat(getComputedStyle(h).lineHeight) || 20;
        const maxH = lh * 2 + 1;
        const paint = (n) => {
            h.textContent = '';
            h.appendChild(document.createTextNode(full.slice(0, n).replace(/\s+$/, '') + '... '));
            const m = document.createElement('span');
            m.className = 'short-more'; m.textContent = 'more';
            h.appendChild(m);
        };
        h.textContent = full;
        if (h.scrollHeight <= maxH) { h.classList.remove('measure'); return; }
        let lo = 0, hi = full.length;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            paint(mid);
            if (h.scrollHeight <= maxH) lo = mid; else hi = mid - 1;
        }
        paint(lo);
        h.classList.remove('measure');
    });
    if (waiting && attempt < 8) setTimeout(() => fitFeelsTitles(attempt + 1), 200);
}
window.addEventListener('resize', () => { try { fitFeelsTitles(); } catch (e) {} });

// =========================================================
// FEELS ADS (AdMob Interstitial via AndroidBridge) - an ad slide every 2-3 Feels.
// While the ad slide is active ALL Feels videos are paused (nothing plays under the ad).
// =========================================================
const FEELS_AD_MIN_GAP = 2;   // ad after at least 2 Feels
const FEELS_AD_MAX_GAP = 3;   // ad after at most 3 Feels
let feelsAdObserver = null;
let feelsAdShowing = false;
let feelsAdCurrentSlide = null;
let feelsAdEnterDir = 'down';

function feelsAdsAvailable() {
    return !!(window.AndroidBridge && typeof window.AndroidBridge.showFeelsAd === 'function');
}
function feelsNextAdGap() {
    return FEELS_AD_MIN_GAP + Math.floor(Math.random() * (FEELS_AD_MAX_GAP - FEELS_AD_MIN_GAP + 1));
}
function feelsAdSlideHTML(n) {
    // Empty black slide: the real ad is drawn by the app (native overlay) while this slide is active
    return `<div class="feels-ad-slide" id="feels-ad-${n}" style="height:100%;width:100%;scroll-snap-align:start;scroll-snap-stop:always;position:relative;background:#000;"></div>`;
}
// 'down' = user arrived from the Feels above (continue to the next one), 'up' = arrived from below
function feelsAdEnterDirection(slide) {
    const swiper = slide.closest('.feels-swiper');
    return (swiper && slide.offsetTop < swiper.scrollTop) ? 'up' : 'down';
}
function initFeelsAdObserver() {
    if (feelsAdObserver) { feelsAdObserver.disconnect(); feelsAdObserver = null; }
    const adSlides = document.querySelectorAll('#feels-swiper-container .feels-ad-slide');
    if (!adSlides.length || !feelsAdsAvailable()) return;
    feelsAdObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting || feelsAdShowing) return;
            const feelsTab = document.getElementById('feels-tab');
            if (feelsTab && !feelsTab.classList.contains('active')) return;
            feelsAdShowing = true;
            feelsAdCurrentSlide = entry.target;
            feelsAdEnterDir = feelsAdEnterDirection(entry.target);
            // Nothing from Feels may play while the ad is on screen
            document.querySelectorAll('#feels-swiper-container video').forEach(v => { try { v.pause(); } catch (e) {} });
            // Lets the previous/next Feels start again normally after the ad
            currentActiveFeelsIdx = -1;
            try {
                // the slide id is passed so this slide always gets the SAME ad (and it replays from the start)
                if (typeof window.AndroidBridge.showFeelsAdSlot === 'function') window.AndroidBridge.showFeelsAdSlot(feelsFeedMode, entry.target.id);
                else window.AndroidBridge.showFeelsAd(feelsFeedMode);
            } catch (e) { window.onFeelsAdFinished('error'); }
        });
    }, { threshold: 0.6 });
    adSlides.forEach(s => feelsAdObserver.observe(s));
}
// --- Ad swipe follows the finger (like normal Feels) ---
// MainActivity.java moves the native ad overlay with the finger and calls these, so the Feels feed under the ad
// is scrolled by the SAME distance: the next/previous Feels slides in together with the ad and starts playing.
let feelsAdDragSwiper = null, feelsAdDragBase = 0, feelsAdDragPrevSnap = '', feelsAdDragPrevBehavior = '', feelsAdDragRaf = 0;

function feelsAdDragEnd() {
    if (feelsAdDragRaf) { cancelAnimationFrame(feelsAdDragRaf); feelsAdDragRaf = 0; }
    const sw = feelsAdDragSwiper;
    feelsAdDragSwiper = null;
    if (!sw) return;
    sw.style.scrollSnapType = feelsAdDragPrevSnap;
    sw.style.scrollBehavior = feelsAdDragPrevBehavior;
}
function feelsAdAnimateScroll(sw, to, ms, done) {
    if (feelsAdDragRaf) { cancelAnimationFrame(feelsAdDragRaf); feelsAdDragRaf = 0; }
    const from = sw.scrollTop, t0 = performance.now();
    function step(now) {
        const p = Math.min(1, Math.max(0, (now - t0) / ms));
        const e = 1 - Math.pow(1 - p, 3);              // easeOutCubic = Android DecelerateInterpolator(1.5)
        sw.scrollTop = from + (to - from) * e;
        if (p < 1) feelsAdDragRaf = requestAnimationFrame(step);
        else { feelsAdDragRaf = 0; if (done) done(); }
    }
    feelsAdDragRaf = requestAnimationFrame(step);
}
window.feelsAdDragStart = function () {
    const slide = feelsAdCurrentSlide;
    const sw = slide && slide.closest('.feels-swiper');
    if (!sw) return;
    feelsAdDragEnd();
    feelsAdDragSwiper = sw;
    feelsAdDragBase = slide.offsetTop;
    feelsAdDragPrevSnap = sw.style.scrollSnapType;
    feelsAdDragPrevBehavior = sw.style.scrollBehavior;
    sw.style.scrollSnapType = 'none';       // no snapping while the finger is down
    sw.style.scrollBehavior = 'auto';       // no CSS smooth-scroll lag
};
window.feelsAdDragMove = function (dy) {
    if (!feelsAdDragSwiper) return;
    feelsAdDragSwiper.scrollTop = feelsAdDragBase - dy;   // finger up (dy < 0) -> next Feels comes in
};
window.feelsAdDragCancel = function (ms) {
    const sw = feelsAdDragSwiper;
    if (!sw) return;
    feelsAdAnimateScroll(sw, feelsAdDragBase, ms || 160, feelsAdDragEnd);   // short swipe: spring back to the ad
};

// Called by MainActivity.java: 'swiped_up' -> next Feels, 'swiped_down' -> previous Feels,
// anything else (back / not ready / failed) -> keep going the way the user was already scrolling.
// The ad slide stays in the feed, so scrolling back to it plays an ad again.
window.onFeelsAdFinished = function (result) {
    feelsAdShowing = false;
    const slide = feelsAdCurrentSlide;
    feelsAdCurrentSlide = null;
    if (!slide || result === 'abort') { feelsAdDragEnd(); return; } // 'abort' = user changed tab / feed mode while the ad was open
    let goNext;
    if (result === 'swiped_up') goNext = true;
    else if (result === 'swiped_down') goNext = false;
    else goNext = (feelsAdEnterDir !== 'up');
    const swiper = slide.closest('.feels-swiper');
    const target = goNext ? slide.nextElementSibling : slide.previousElementSibling;
    const validTarget = swiper && target && target.classList.contains('short-slide');
    if (feelsAdDragSwiper && feelsAdDragSwiper === swiper) {
        // finger-driven swipe: finish the move with the same time/curve as the ad flying out (no black gap)
        if (validTarget && (result === 'swiped_up' || result === 'swiped_down')) {
            feelsAdAnimateScroll(swiper, target.offsetTop, 220, feelsAdDragEnd);
        } else {
            feelsAdAnimateScroll(swiper, slide.offsetTop, 160, feelsAdDragEnd);
        }
        return;
    }
    feelsAdDragEnd();
    if (validTarget) scrollFeelsToSlide(swiper, target, 'smooth');
};

function buildFeelsPage() {
    const container = document.getElementById('feels-swiper-container');
    if (!container) return;
    feelsDetachListeners();
    
    if (!navigator.onLine) {
        container.innerHTML = getFeelsSkeletonHTML();
        return;
    }

    ensureFeelsSubscriptionListeners();
    updateFeelsModeButtons();
    let activeFeelsList = feelsApplySessionOrder(feelsFeedMode, feelsListForMode(feelsFeedMode));

    if (activeFeelsList.length === 0) {
        container.innerHTML = getFeelsSkeletonHTML();
        return;
    }

    let html = '';
    const feelsAdsOn = feelsAdsAvailable();
    let feelsAdCountdown = feelsNextAdGap();
    let feelsAdSeq = 0;
    activeFeelsList.forEach((s, feelIdx) => {
        const isLikedId = `short-like-btn-${s.id}`;
        const likesCountId = `short-likes-count-${s.id}`;
        const commentsCountId = `short-comments-count-${s.id}`;
        const statsCacheKey = `flaynity_stats_cache_${s.id}`;

        let cachedStats = { likes: 0, comments: 0, saves: 0 };
        let offlineLikes = JSON.parse(localStorage.getItem('flaynity_offline_likes') || '{}');
        let isLocallyLiked = !!offlineLikes[s.id] || !!feelsLikedByUser[s.id];
        try {
            cachedStats = JSON.parse(localStorage.getItem(statsCacheKey) || '{"likes": 0, "comments": 0}');
        } catch(e) {}

        if(isLocallyLiked && cachedStats.likes === 0) cachedStats.likes = 1;

        html += `
            <div class="short-slide" id="slide-short-${s.id}" data-shortid="${s.id}">
                <div class="short-buffer-spinner" id="short-spinner-${s.id}"></div>
                <div class="short-play-pause-overlay" id="short-pp-overlay-${s.id}"></div>

                <video class="short-video-el" style="object-fit:contain!important;object-position:center!important;transform:none!important;" loop playsinline webkit-playsinline poster="${s.poster || ''}" preload="metadata"></video>

                <div class="short-progress-container">
                    <div class="short-progress-bar" id="short-progress-bar-${s.id}"></div>
                </div>


                <div class="short-right-actions">
                    <div class="short-channel-action">
                        <div class="short-channel-ring">
                            <div class="short-channel-action-avatar live-avatar-${s.userId || s.channelId}">
                                <img src="${s.channelAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=100'}" alt="Channel">
                            </div>
                        </div>
                        <button class="short-channel-subscribe-btn" id="short-sub-btn-${s.id}" aria-label="Subscribe" onclick="toggleClipSubscribe('${s.userId || s.channelId}', this)">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>

                    <div class="short-action-container">
                        <button class="short-action-btn-tiktok" id="${isLikedId}" onclick="toggleShortLike('${s.id}')">
                            <i class="fx-ic${isLocallyLiked ? ' liked' : ''}">${window.FEELS_ICONS.heart}</i>
                        </button>
                        <div class="short-action-label-tiktok" id="${likesCountId}">${formatCount(cachedStats.likes)}</div>
                    </div>

                    <div class="short-action-container">
                        <button class="short-action-btn-tiktok-other" onclick="openFeelsComments('${s.id}', event)">
                            <i class="fx-ic">${window.FEELS_ICONS.comment}</i>
                        </button>
                        <div class="short-action-label-tiktok" id="${commentsCountId}">${formatCount(cachedStats.comments)}</div>
                    </div>

                    <div class="short-action-container">
                        <button class="short-action-btn-tiktok-other" id="short-save-btn-${s.id}" aria-label="Save" onclick="toggleShortSave('${s.id}', event)">
                            <i class="fx-ic${(feelsSavedByUser[s.id] ? ' saved' : '')}">${window.FEELS_ICONS.save}</i>
                        </button>
                        <div class="short-action-label-tiktok" id="short-saves-count-${s.id}">${formatCount(cachedStats.saves || 0)}</div>
                    </div>

                    <div class="short-action-container">
                        <button class="short-action-btn-tiktok-other" aria-label="Share" onclick="shareFeels('${s.id}', event)">
                            <i class="fx-ic">${window.FEELS_ICONS.share}</i>
                        </button>
                        <div class="short-action-label-tiktok" id="short-shares-count-${s.id}">Share</div>
                    </div>

                    <div class="music-disc-container">
                        <div class="music-disc-inner live-disc-avatar-${s.userId || s.channelId}" id="music-disc-${s.id}">
                            <img src="${s.channelAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=100'}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
                        </div>
                    </div>
                </div>

                <div class="short-bottom-info">
                    <div class="short-channel-name live-username-${s.userId || s.channelId}" style="color:#fff; text-shadow:0 1px 3px rgba(0,0,0,0.8); margin-bottom:6px;">${escapeHTML(String(s.channelName || s.username || 'Flaynity').slice(0, 25))}</div>
                    <div class="short-title-wrap" style="cursor:pointer;" onclick="openFeelsDescription('${s.id}', event)">
                        <h2 id="short-title-val-${s.id}" class="short-title-text">${escapeHTML(s.title)}</h2>
                    </div>
                </div>
            </div>
        `;

        // Ad slide after every 2-3 Feels (never after the last one)
        feelsAdCountdown--;
        if (feelsAdsOn && feelsAdCountdown <= 0 && feelIdx < activeFeelsList.length - 1) {
            html += feelsAdSlideHTML(++feelsAdSeq);
            feelsAdCountdown = feelsNextAdGap();
        }

        feelsTrackListener(db.ref(`movie_stats/${s.id}`), (snapshot) => {
            const stats = snapshot.val() || {};
            const viewsObj = stats.views || {};
            const likesObj = stats.likes || {};
            const likesCount = Object.keys(likesObj).length;
            const savesObj = stats.saves || {};
            const savesCount = Object.keys(savesObj).length;
            if (auth.currentUser) {
                feelsLikedByUser[s.id] = !!likesObj[auth.currentUser.uid];
                feelsSavedByUser[s.id] = !!savesObj[auth.currentUser.uid];
            }
            try {
                let sc = JSON.parse(localStorage.getItem(statsCacheKey) || '{"likes": 0, "comments": 0}');
                sc.saves = savesCount;
                localStorage.setItem(statsCacheKey, JSON.stringify(sc));
            } catch(e) {}
            const lblSaves = document.getElementById(`short-saves-count-${s.id}`);
            if (lblSaves) lblSaves.innerText = formatCount(savesCount);
            const saveBtn = document.getElementById(`short-save-btn-${s.id}`);
            if (saveBtn) {
                const saved = !!(auth.currentUser && savesObj[auth.currentUser.uid]);
                const sic = saveBtn.querySelector('i');
                if (sic) sic.classList.toggle('saved', saved);
                else saveBtn.innerHTML = `<i class="fx-ic${saved ? ' saved' : ''}">${window.FEELS_ICONS.save}</i>`;
            }

            try {
                let currCache = JSON.parse(localStorage.getItem(statsCacheKey) || '{"likes": 0, "comments": 0}');
                currCache.likes = likesCount;
                localStorage.setItem(statsCacheKey, JSON.stringify(currCache));
            } catch(e) {}

            const lblLikes = document.getElementById(likesCountId);
            if (lblLikes) lblLikes.innerText = formatCount(likesCount);

            const likeBtn = document.getElementById(isLikedId);
            if (likeBtn && auth.currentUser) {
                // Toggle the class only. Rewriting innerHTML replayed the pop animation
                // every time ANY stat (like a Save) changed.
                const liked = !!likesObj[auth.currentUser.uid];
                const ic = likeBtn.querySelector('i');
                if (ic) ic.classList.toggle('liked', liked);
                else likeBtn.innerHTML = `<i class="fx-ic${liked ? ' liked' : ''}">${window.FEELS_ICONS.heart}</i>`;
            }
        });

        feelsTrackListener(db.ref(`movie_comments/${s.id}`), (snapshot) => {
            const commentsObj = snapshot.val() || {};
            const count = Object.keys(commentsObj).length;
            feelsCommentsCache[s.id] = commentsObj;

            try {
                let currCache = JSON.parse(localStorage.getItem(statsCacheKey) || '{"likes": 0, "comments": 0}');
                currCache.comments = count;
                localStorage.setItem(statsCacheKey, JSON.stringify(currCache));
            } catch(e) {}

            const lblComments = document.getElementById(commentsCountId);
            if (lblComments) lblComments.innerText = formatCount(count);
            if (currentActiveMovie && String(currentActiveMovie.id) === String(s.id)) {
                renderCommentList(commentsObj);
                const modalCount = document.getElementById('modal-comment-count');
                if (modalCount) modalCount.innerText = formatCount(count);
            }
        });

    });

    container.innerHTML = `<div class="feels-swiper">${html}</div>`;

    // Bind subscription state AFTER the Feels DOM exists. This is required
    // because the buttons are created by the template above.
    if (auth.currentUser) {
        activeFeelsList.forEach(s => {
            const channelId = s.userId || s.channelId;
            if (!channelId) return;
            const subBtn = document.getElementById(`short-sub-btn-${s.id}`);
            if (!subBtn) return;
            feelsTrackListener(db.ref(`subscribers/${channelId}/${auth.currentUser.uid}`), (snapshot) => {
                const btn = document.getElementById(`short-sub-btn-${s.id}`);
                if (!btn) return;
                // Already subscribed: hide BOTH + and tick; keep only avatar visible.
                if (snapshot.exists()) {
                    btn.classList.add('subscribed');
                    btn.innerHTML = '';
                    btn.style.display = 'none';
                    btn.setAttribute('aria-hidden', 'true');
                } else {
                    btn.classList.remove('subscribed');
                    btn.innerHTML = '<i class="fas fa-plus"></i>';
                    btn.style.display = 'flex';
                    btn.removeAttribute('aria-hidden');
                }
            });
        });
    }

    initFeelsObserver();
    initFeelsAdObserver();
    setupDoubleTapListeners();
    bindFeelsVideoEvents();
    requestAnimationFrame(() => fitFeelsTitles());

    // Immediately activate an explicitly requested Home/mode-switch target.
    // This avoids the initial observer pass picking another Feels first.
    if (feelsProgrammaticTargetId) {
        const targetId = String(feelsProgrammaticTargetId);
        if (document.getElementById(`slide-short-${targetId}`)) {
            playFeelsSlide(targetId, true);
        }
    } else if (currentActiveFeelsIdx < 0) {
        const firstSlide = container.querySelector('.short-slide');
        if (firstSlide) {
            const firstId = firstSlide.getAttribute('data-shortid');
            if (firstId) playFeelsSlide(firstId, true);
        }
    }

    const uniqueUserIds = new Set();
    activeFeelsList.forEach(s => { if (s.userId) uniqueUserIds.add(s.userId); });
    uniqueUserIds.forEach(uid => bindLiveChannelUI(uid));
}

function triggerPlayPauseIndicator(slide, actionType) {
    const overlay = slide.querySelector('.short-play-pause-overlay');
    if (!overlay) return;
    
    if (actionType === 'pause') {
        overlay.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        overlay.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
    
    overlay.classList.remove('animate-pop');
    void overlay.offsetWidth; 
    overlay.classList.add('animate-pop');
}

let lastTap = 0;
function setupDoubleTapListeners() {
    let clickTimer = null;
    document.querySelectorAll('.short-slide').forEach(slide => {
        slide.addEventListener('click', (e) => {
            if (e.target.closest('.short-right-actions') || e.target.closest('.short-quality-pill') || e.target.closest('.short-bottom-info') || e.target.closest('.short-progress-container')) {
                return;
            }
            const video = slide.querySelector('video');
            if (!video) return;

            const now = Date.now();
            const shortId = slide.getAttribute('data-shortid');
            
            if (now - lastTap < 300) {
                clearTimeout(clickTimer);
                spawnDoubleTapHeart(e, slide);
                toggleShortLike(shortId, true); 
            } else {
                clickTimer = setTimeout(() => {
                    if (video.paused) {
                        video.play().catch(() => {});
                        triggerPlayPauseIndicator(slide, 'play');
                    } else {
                        video.pause();
                        triggerPlayPauseIndicator(slide, 'pause');
                    }
                }, 250);
            }
            lastTap = now;
        });
    });
}

// ---------------- Premium video-quality sheet ----------------
function feelsQualityPref() {
    try {
        const v = String(localStorage.getItem('feels_quality_pref') || 'auto').toLowerCase();
        if (['720', '480', '360', '1080', 'original'].includes(v)) {
            return (v === 'original' || v === '1080') ? '720' : v;
        }
        return 'auto';
    } catch (e) { return 'auto'; }
}
function feelsQualityLabel() {
    const p = feelsQualityPref();
    return p === 'auto' ? 'Auto' : `${p}p`;
}

function ttqEnsure() {
    let el = document.getElementById('feels-quality-sheet');
    if (el) return el;
    const st = document.createElement('style');
    st.textContent = `
    #feels-quality-sheet{position:fixed;inset:0;z-index:3000;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);animation:ttFade .2s ease}
    #feels-quality-sheet .fq-sheet{width:100%;max-height:82vh;overflow-y:auto;box-sizing:border-box;background:var(--surface,#fff);color:var(--text-main,#161823);border-radius:26px 26px 0 0;padding:10px 18px calc(24px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.28);animation:ttUp .32s cubic-bezier(.22,1,.36,1)}
    .fq-grab{width:42px;height:5px;border-radius:3px;background:rgba(128,128,128,.4);margin:0 auto 14px}
    .fq-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
    .fq-title{font-size:20px;font-weight:800;letter-spacing:-.2px}
    .fq-x{width:36px;height:36px;border:0;border-radius:50%;background:rgba(128,128,128,.16);color:inherit;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .fq-x svg{width:16px;height:16px;stroke:currentColor;stroke-width:2.8;stroke-linecap:round;fill:none}
    .fq-sub{font-size:13px;color:var(--text-muted,#8a8b91);margin:0 0 16px}
    .fq-opt{position:relative;display:flex;align-items:center;gap:14px;width:100%;box-sizing:border-box;border:1.5px solid rgba(128,128,128,.22);background:rgba(128,128,128,.07);color:inherit;border-radius:20px;padding:14px 16px;margin-bottom:12px;text-align:left;font-family:inherit;cursor:pointer;transition:transform .15s,border-color .2s,background .2s;-webkit-tap-highlight-color:transparent}
    .fq-opt:active{transform:scale(.98)}
    .fq-opt.sel{border-color:#fe2c55;background:linear-gradient(135deg,rgba(254,44,85,.13),rgba(254,44,85,.04))}
    .fq-ic{flex:0 0 auto;width:46px;height:46px;border-radius:15px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#8a8d99,#5d606c);color:#fff}
    .fq-opt.sel .fq-ic{background:linear-gradient(135deg,#fe2c55,#ff7a5c);box-shadow:0 6px 16px rgba(254,44,85,.35)}
    .fq-ic svg{width:24px;height:24px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .fq-txt{flex:1 1 auto;min-width:0}
    .fq-name{font-size:16.5px;font-weight:800;display:flex;align-items:center;gap:8px}
    .fq-badge{font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#fff;background:linear-gradient(135deg,#fe2c55,#ff7a5c);padding:3px 7px;border-radius:8px}
    .fq-desc{font-size:12.5px;color:var(--text-muted,#8a8b91);margin-top:3px}
    .fq-check{flex:0 0 auto;width:26px;height:26px;border-radius:50%;border:2px solid rgba(128,128,128,.4);display:flex;align-items:center;justify-content:center;transition:all .2s}
    .fq-check svg{width:14px;height:14px;stroke:#fff;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;fill:none;opacity:0;transform:scale(.4);transition:all .2s}
    .fq-opt.sel .fq-check{background:#fe2c55;border-color:#fe2c55}
    .fq-opt.sel .fq-check svg{opacity:1;transform:scale(1)}
    `;
    document.head.appendChild(st);
    el = document.createElement('div');
    el.id = 'feels-quality-sheet';
    el.className = 'premium-download-modal';
    el.addEventListener('click', (e) => { if (e.target === el) closeFeelsQualitySheet(); });
    document.body.appendChild(el);
    return el;
}
function ttqRender() {
    const el = ttqEnsure();
    const cur = feelsQualityPref();
    const opt = (k, name, desc, icon, badge) => `<button type="button" class="fq-opt${cur === k ? ' sel' : ''}" data-q="${k}"><span class="fq-ic">${icon}</span><span class="fq-txt"><span class="fq-name">${name}${badge ? `<span class="fq-badge">${badge}</span>` : ''}</span><div class="fq-desc">${desc}</div></span><span class="fq-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></button>`;
    el.innerHTML = `<div class="fq-sheet"><div class="fq-grab"></div>
        <div class="fq-head"><div class="fq-title">Video quality</div><button type="button" class="fq-x" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>
        <p class="fq-sub">Choose how Feels videos play</p>
        ${opt('auto', 'Auto', 'Adjusts to your connection for smooth playback', '<svg viewBox="0 0 24 24"><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/></svg>', 'Recommended')}
        ${opt('720', '720p', 'High definition — clear & balanced', '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 9h6v6H9z"/></svg>', '')}
        ${opt('480', '480p', 'Standard quality — smooth on average networks', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M10 9l5 3-5 3z"/></svg>', '')}
        ${opt('360', '360p', 'Data saver — fastest load & least buffering', '<svg viewBox="0 0 24 24"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/></svg>', 'Fast')}
    </div>`;
    el.querySelector('.fq-x').addEventListener('click', closeFeelsQualitySheet);
    el.querySelectorAll('.fq-opt').forEach(b => b.addEventListener('click', () => {
        const q = b.dataset.q;
        try { localStorage.setItem('feels_quality_pref', q); } catch (e) {}
        document.querySelectorAll('#feels-swiper-container .short-video-el').forEach(v => flaynityApplyFeelsQualityPref(v));
        triggerFeelsHaptic(10);
        document.querySelectorAll('.short-quality-label').forEach(n => { n.textContent = feelsQualityLabel(); });
        el.querySelectorAll('.fq-opt').forEach(o => o.classList.toggle('sel', o.dataset.q === q));
        setTimeout(closeFeelsQualitySheet, 220);
    }));
}
function openFeelsQualitySheet(shortId, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    playUI('click');
    keepFeelsVideoActive(shortId);
    ttqRender();
    AppNavigation.pushModal('feels-quality-sheet');
}
function closeFeelsQualitySheet() {
    const cur = AppNavigation.current();
    if (cur && cur.id === 'feels-quality-sheet') AppNavigation.pop();
    else { const el = document.getElementById('feels-quality-sheet'); if (el) el.style.display = 'none'; }
}

function bindFeelsScrub(slide, video) {
    const box = slide.querySelector('.short-progress-container');
    if (!box || box._scrubBound) return;
    box._scrubBound = true;
    const bar = box.querySelector('.short-progress-bar');
    const thumb = document.createElement('div');
    thumb.className = 'short-scrub-thumb';
    box.appendChild(thumb);
    const tip = document.createElement('div');
    tip.className = 'short-scrub-time';
    slide.appendChild(tip);
    const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    let pid = null, active = false, wasPlaying = false, sx = 0, sy = 0, down = false;

    const apply = (x) => {
        if (!video.duration || !isFinite(video.duration)) return;
        const r = box.getBoundingClientRect();
        if (!r.width) return;
        const p = Math.min(1, Math.max(0, (x - r.left) / r.width));
        video.currentTime = p * video.duration;
        // bar end and thumb centre use the same position, and the thumb never leaves the screen
        const pos = `calc(6px + (100% - 12px) * ${p})`;
        if (bar) bar.style.width = pos;
        thumb.style.left = pos;
        tip.textContent = `${fmt(p * video.duration)} / ${fmt(video.duration)}`;
    };
    const begin = (x) => {
        active = true;
        wasPlaying = !video.paused;
        slide._scrubbing = true;
        slide.classList.add('scrubbing');
        if (wasPlaying) video.pause();
        triggerFeelsHaptic(6);
        apply(x);
    };
    const finish = () => {
        down = false;
        if (pid != null) { try { box.releasePointerCapture(pid); } catch (x) {} }
        pid = null;
        if (!active) return;
        active = false;
        slide._scrubbing = false;
        slide.classList.remove('scrubbing');
        if (wasPlaying) video.play().catch(() => {});
    };

    // A plain touch / tap does nothing. Only holding the finger and dragging left/right seeks.
    box.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.stopPropagation();
        // A stale gesture (missed pointerup) must never block the next one.
        if (active) finish();
        down = true;
        pid = e.pointerId; sx = e.clientX; sy = e.clientY; active = false;
        try { box.setPointerCapture(pid); } catch (x) {}
    });
    box.addEventListener('pointermove', (e) => {
        if (!down || pid !== e.pointerId) return;
        if (e.cancelable) e.preventDefault();
        if (!active) {
            const dx = Math.abs(e.clientX - sx), dy = Math.abs(e.clientY - sy);
            // Slightly diagonal drags must still start the scrub (was: dx had to beat dy exactly).
            if (dx > 5 && dx >= dy * 0.6) begin(e.clientX);
            return;
        }
        apply(e.clientX);
    });
    const end = (e) => { if (pid != null && e && e.pointerId != null && e.pointerId !== pid) return; finish(); };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('lostpointercapture', end);
    box.addEventListener('click', (e) => e.stopPropagation());

    // The feed is a scroll-snap scroller. If it grabs the touch, the browser fires
    // pointercancel and the scrub randomly "doesn't come". Claiming the touch here
    // (non-passive) keeps the gesture on the progress bar, and keeps the global
    // swipe / pull-to-refresh / nav handlers out of it.
    box.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
    box.addEventListener('touchmove', (e) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
    }, { passive: false });
    box.addEventListener('touchend', (e) => { e.stopPropagation(); }, { passive: true });
    box.addEventListener('contextmenu', (e) => e.preventDefault());
}

function bindFeelsVideoEvents() {
    document.querySelectorAll('.short-slide').forEach(slide => {
        const video = slide.querySelector('video');
        if (!video) return;
        const shortId = slide.getAttribute('data-shortid');

        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.style.background = 'transparent';
        bindFeelsScrub(slide, video);

        video.onplay = () => {
            // Playback is the authoritative selection: switching feeds must
            // restore the exact Feels the user was watching, not merely the
            // first slide that happened to intersect during the rebuild.
            if (!feelsPendingRestoreId) {
                feelsLastPlayedId = shortId;
                feelsLastPlayedByMode[feelsFeedMode] = shortId;
            }
            const disc = document.getElementById(`music-disc-${shortId}`);
            if (disc) disc.style.animationPlayState = 'running';
        };
        video.onpause = () => {
            const disc = document.getElementById(`music-disc-${shortId}`);
            if (disc) disc.style.animationPlayState = 'paused';
        };
        video.onwaiting = () => {
            const spinner = document.getElementById(`short-spinner-${shortId}`);
            if (spinner) spinner.style.display = 'block';
        };
        video.onplaying = () => {
            const spinner = document.getElementById(`short-spinner-${shortId}`);
            if (spinner) spinner.style.display = 'none';
            const disc = document.getElementById(`music-disc-${shortId}`);
            if (disc) disc.style.animationPlayState = 'running';
        };
        video.oncanplay = () => {
            const spinner = document.getElementById(`short-spinner-${shortId}`);
            if (spinner) spinner.style.display = 'none';
        };
    });
}

function openShortDescBottomSheet(shortId) {
    playUI('click');
    const s = allFeels.find(item => String(item.id) === String(shortId));
    if (!s) return;
    currentActiveMovie = s;
    openFeelsDescSheet(s.id);            // YouTube-style Feels description (no jump, video keeps playing)
}

function openShortDescBottomSheetLegacy(shortId) {
    playUI('click');
    const s = allFeels.find(item => item.id === shortId);
    if (!s) return;

    currentActiveMovie = s;
    keepFeelsVideoActive(s.id);
    const titleEl = document.getElementById('short-sheet-full-title');
    if (titleEl) titleEl.innerText = s.title || 'Feels';
    
    const description = String(s.description || '');
    const hashtagRegex = /#\w+/g;
    const matches = description.match(hashtagRegex) || [];
    const hashtags = matches.length ? matches.join(' ') : '#feels #flaynity';
    const plainDescription = description.replace(hashtagRegex, '').trim();
    
    document.getElementById('short-sheet-hashtags').innerText = hashtags;
    document.getElementById('short-sheet-description').innerText = plainDescription || "No description provided.";
    document.getElementById('short-sheet-uploaded').innerText = getRelativeTime(s.createdAt);

    if(navigator.onLine) {
        db.ref(`movie_stats/${shortId}`).once('value', (snapshot) => {
            const stats = snapshot.val() || {};
            const viewsObj = stats.views || {};
            const likesObj = stats.likes || {};
            
            document.getElementById('short-sheet-views').innerText = formatCount(Object.keys(viewsObj).length);
            document.getElementById('short-sheet-likes').innerText = formatCount(Object.keys(likesObj).length);
        });
    }

    AppNavigation.pushModal('short-desc-bottom-sheet');
    
    setTimeout(() => {
        const sheet = document.getElementById('short-desc-bottom-sheet');
        if (sheet) {
            setupSwipeToClose(sheet, 'short-desc-drag-handle', closeShortDescBottomSheet);
        }
    }, 100);
}

function closeShortDescBottomSheet() {
    AppNavigation.pop();
}

function setupSwipeToClose(element, handleId, closeCallback) {
    const handle = document.getElementById(handleId);
    if (!handle) return;
    
    let startY = 0;
    let currentY = 0;
    const content = element.querySelector('.premium-download-content');
    
    handle.ontouchstart = (e) => {
        startY = e.touches[0].clientY;
        if (content) content.style.transition = 'none';
    };
    
    handle.ontouchmove = (e) => {
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        if (deltaY > 0 && content) {
            content.style.transform = `translateY(${deltaY}px)`;
        }
    };
    
    handle.ontouchend = () => {
        if (content) {
            content.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.15)';
            const deltaY = currentY - startY;
            if (deltaY > 120) {
                closeCallback();
            }
            content.style.transform = 'translateY(0)';
        }
        startY = 0;
        currentY = 0;
    };
}

function toggleShortSave(shortId, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    playUI('click');
    triggerHapticFeedback();
    if (!auth.currentUser) { showNotification("Please sign in to Save", "error"); return; }
    if (!navigator.onLine) { showNotification("You're offline", "error"); return; }
    // One account = one save. Click again to remove it (count goes back down).
    const ref = db.ref(`movie_stats/${shortId}/saves/${auth.currentUser.uid}`);
    ref.once('value', (snap) => {
        if (snap.exists()) ref.remove(); else ref.set(true);
    });
}

function shareFeels(shortId, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    playUI('click');
    triggerHapticFeedback();
    const s = allFeels.find(item => String(item.id) === String(shortId));
    if (!s) return;
    const text = String(s.title || 'Flaynity');
    const url = (s.shareUrl || location.href);
    if (navigator.share) {
        navigator.share({ title: text, text: text, url: url }).catch(() => {});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => showNotification("Link copied", "success")).catch(() => {});
    }
}

function toggleShortLike(shortId, forceLike = false) {
    playUI('click');
    triggerHapticFeedback();
    if (!auth.currentUser) { showNotification("Please sign in to Like", "error"); return; }
    const userId = auth.currentUser.uid;
    
    if (!navigator.onLine) {
        handleOfflineLike(shortId, userId, forceLike);
        return;
    }

    const ref = db.ref(`movie_stats/${shortId}/likes/${userId}`);
    ref.once('value', (snap) => {
        if (snap.exists()) {
            if (!forceLike) ref.remove(); 
        } else {
            ref.set(true);
        }
    });
}

function handleOfflineLike(shortId, userId, forceLike) {
    try {
        let offlineLikes = JSON.parse(localStorage.getItem('flaynity_offline_likes') || '{}');
        const isLiked = !!offlineLikes[shortId];
        
        if (isLiked) {
            if (!forceLike) {
                delete offlineLikes[shortId];
                showNotification("Unliked (offline)", "success");
            }
        } else {
            offlineLikes[shortId] = { userId: userId, timestamp: Date.now() };
        }
        
        localStorage.setItem('flaynity_offline_likes', JSON.stringify(offlineLikes));
        updateLikesDOMOffline(shortId);
    } catch (e) {}
}

function updateLikesDOMOffline(shortId) {
    try {
        let offlineLikes = JSON.parse(localStorage.getItem('flaynity_offline_likes') || '{}');
        let isLocallyLiked = !!offlineLikes[shortId];
        
        const likesCountId = `short-likes-count-${shortId}`;
        const lblLikes = document.getElementById(likesCountId);
        const likeBtn = document.getElementById(`short-like-btn-${shortId}`);
        
        if (lblLikes) {
            let currentVal = parseInt(lblLikes.innerText) || 0;
            if (isLocallyLiked) {
                lblLikes.innerText = formatCount(currentVal + 1);
            } else {
                lblLikes.innerText = formatCount(Math.max(0, currentVal - 1));
            }
        }
        
        if (likeBtn) {
            if (isLocallyLiked) {
                likeBtn.innerHTML = `<i class="fx-ic liked">${window.FEELS_ICONS.heart}</i>`;
            } else {
                likeBtn.innerHTML = `<i class="fx-ic">${window.FEELS_ICONS.heart}</i>`;
            }
        }
    } catch (e) {}
}

async function syncOfflineLikes() {
    if (!navigator.onLine || !auth.currentUser) return;
    try {
        let offlineLikes = JSON.parse(localStorage.getItem('flaynity_offline_likes') || '{}');
        const entries = Object.entries(offlineLikes);
        if (entries.length === 0) return;
        
        for (const [shortId, data] of entries) {
            await db.ref(`movie_stats/${shortId}/likes/${data.userId}`).set(true);
        }
        
        localStorage.removeItem('flaynity_offline_likes');
    } catch (e) {}
}

function keepFeelsVideoActive(shortId) {
    const slide = document.getElementById(`slide-short-${shortId}`);
    if (!slide) return;
    const swiper = slide.closest('.feels-swiper');
    if (swiper) {
        const rect = slide.getBoundingClientRect();
        const parentRect = swiper.getBoundingClientRect();
        if (Math.abs(rect.top - parentRect.top) > 8) {
            scrollFeelsToSlide(swiper, slide, 'auto');
        }
    }
    const video = slide.querySelector('video');
    if (video) {
        video.muted = false;
        const play = () => video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
        if (video.readyState >= 2) play();
        else video.addEventListener('canplay', play, { once: true });
    }
    currentActiveFeelsIdx = Array.from(document.querySelectorAll('.short-slide')).indexOf(slide);
    feelsLastPlayedId = shortId;
}

function handleFeelsInfoClick(event, shortId, action) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    playUI('click');
    triggerHapticFeedback();
    // Lock the interaction to the Feels the user actually tapped. Never
    // navigate the swiper to another/next Feels because of a title/comment tap.
    keepFeelsVideoActive(shortId);

    if (action === 'title') {
        // Title tap opens the description sheet while keeping this Feels active.
        openShortDescBottomSheet(shortId);
    } else if (action === 'comment') {
        openShortComments(shortId);
    }
}

// =========================================================
// TIKTOK-STYLE COMMENT SHEET (Feels)
// Data path (same as before): movie_comments/{feelsId}/{key}
//   { uid, username, avatar, text, timestamp, likes:{uid:true}, parentId?, replyToName? }
// =========================================================
let _ttRef = null, _ttCb = null, _ttId = null, _ttData = {};
let _ttReply = null;               // { parent, name, mention }
const _ttPinned = [];                 // keys the user posted while this sheet is open (stay on top, newest first)
let _ttSeed = '';                    // random order seed, new on every open of the sheet
const _ttOpen = new Set();         // parent keys whose replies are expanded
const _ttShown = {};               // parent key -> how many replies are visible
let _ttScroll = 0;
const TT_EMOJIS = ['😁','🥰','😂','😳','😏','😅'];
const TT_REPLY_PAGE = 3;

function ttEsc(v) { return escapeHTML(String(v == null ? '' : v)); }
function ttShortAgo(ts) {
    if (!ts) return '';
    const d = Math.max(0, Date.now() - new Date(ts).getTime());
    const m = Math.floor(d / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    const dd = Math.floor(h / 24);
    if (dd < 7) return dd + 'd';
    if (dd < 53) return Math.floor(dd / 7) + 'w';
    return Math.floor(dd / 30) + 'mo';
}
function ttLikeUids(c) {
    const s = new Set(Object.keys(c.likes || {}));
    Object.keys(c.reacts || {}).forEach(u => { if (c.reacts[u]) s.add(u); });
    return s;
}
function ttAvatar(c, size) {
    const initial = ((c.username || 'U').trim().charAt(0).toUpperCase() || 'U').replace(/[^\p{L}\p{N}]/gu, 'U');
    if (c.avatar) return `<img class="tt-av" style="width:${size}px;height:${size}px" src="${ttEsc(c.avatar)}" alt="" onerror="this.outerHTML='<div class=&quot;tt-av tt-av-fb&quot; style=&quot;width:${size}px;height:${size}px&quot;>${initial}</div>'">`;
    return `<div class="tt-av tt-av-fb" style="width:${size}px;height:${size}px">${ttEsc(initial)}</div>`;
}

function ttEnsureSheet() {
    let el = document.getElementById('tt-comment-modal');
    if (el) return el;
    const st = document.createElement('style');
    st.id = 'tt-comment-style';
    st.textContent = `
    #tt-comment-modal{position:fixed;inset:0;z-index:3000;display:none;align-items:flex-end;justify-content:center;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;animation:none}
    #tt-comment-modal .tt-sheet{position:relative;width:100%;height:72%;max-height:calc(100% - 120px);background:var(--surface,#fff);color:var(--text-main,#161823);border-radius:14px 14px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -4px 24px rgba(0,0,0,.18);animation:ttUp .3s cubic-bezier(.22,1,.36,1)}
    @keyframes ttUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
    .tt-head{position:relative;flex:0 0 auto;height:48px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;border-bottom:1px solid rgba(128,128,128,.18)}
    .tt-close{position:absolute;right:6px;top:4px;width:40px;height:40px;border:0;background:transparent;color:inherit;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .tt-close svg{width:22px;height:22px;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;fill:none}
    .tt-list{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;padding:12px 14px 8px;-webkit-overflow-scrolling:touch}
    .tt-empty{text-align:center;color:var(--text-muted,#8a8b91);font-size:14px;margin-top:60px}
    .tt-row{display:flex;gap:10px;align-items:flex-start;margin-bottom:16px;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
    .tt-editbar{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600;color:var(--text-muted,#75767a);padding:0 4px 8px}
    .tt-editbar button{border:0;background:transparent;color:#fe2c55;font:inherit;cursor:pointer}
    .tt-row.tt-reply{margin-left:46px;margin-bottom:14px}
    .tt-av{border-radius:50%;object-fit:cover;flex:0 0 auto;display:block}
    .tt-av-fb{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fe2c55,#ff7a00);color:#fff;font-weight:800;font-size:14px}
    .tt-body{flex:1 1 auto;min-width:0}
    .tt-name{font-size:13px;font-weight:600;color:var(--text-muted,#75767a);display:flex;align-items:center;gap:4px;flex-wrap:wrap}
    .tt-name .tt-to{display:inline-flex;align-items:center;gap:4px}
    .tt-name .tt-to:before{content:"";border-left:6px solid currentColor;border-top:4px solid transparent;border-bottom:4px solid transparent}
    .tt-text{font-size:15px;line-height:1.35;margin:2px 0 0;word-break:break-word;white-space:pre-wrap}
    .tt-meta{display:flex;gap:18px;font-size:13px;color:var(--text-muted,#8a8b91);margin-top:6px;font-weight:500}
    .tt-meta button{border:0;background:transparent;color:inherit;font:inherit;padding:0;cursor:pointer}
    .tt-like{flex:0 0 auto;width:44px;display:flex;flex-direction:column;align-items:center;padding-top:6px;color:var(--text-muted,#8a8b91);font-size:13px;border:0;background:transparent;cursor:pointer}
    .tt-like svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linejoin:round}
    .tt-like.on{color:#fe2c55}.tt-like.on svg{fill:#fe2c55;stroke:#fe2c55;animation:ttPop .3s cubic-bezier(.175,.885,.32,1.5)}
    @keyframes ttPop{0%{transform:scale(.5)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
    .tt-more{margin:-4px 0 14px 46px;display:flex;align-items:center;gap:18px;font-size:13px;font-weight:600;color:var(--text-muted,#75767a)}
    .tt-more button{border:0;background:transparent;color:inherit;font:inherit;padding:0;display:flex;align-items:center;gap:6px;cursor:pointer}
    .tt-more .tt-dash{width:24px;height:1px;background:rgba(128,128,128,.5)}
    .tt-more svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
    .tt-foot{flex:0 0 auto;border-top:1px solid rgba(128,128,128,.18);padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));background:var(--surface,#fff)}
    .tt-foot.open{border-radius:20px 20px 0 0;border-top-color:transparent}
    .tt-foot.kb{padding-bottom:8px;box-shadow:0 -4px 16px rgba(0,0,0,.18);position:relative;z-index:4}
    .tt-foot.open .tt-pill{background:rgba(128,128,128,.26)}
    .tt-inrow #tt-me{margin-top:4px}
    .tt-inrow{display:flex;align-items:flex-start;gap:10px}
    .tt-pill{flex:1 1 auto;min-width:0;background:rgba(128,128,128,.14);border-radius:22px;padding:0 16px;min-height:44px;display:flex;align-items:center}
    .tt-pill textarea{display:block;width:100%;height:22px;margin:11px 0;padding:0;border:0;outline:0;resize:none;overflow-y:hidden;background:transparent;color:inherit;font-size:16px;line-height:22px;font-family:inherit;-webkit-user-select:text;user-select:text}
    .tt-pill textarea::placeholder{color:var(--text-muted,#8a8b91)}
    .tt-actions{display:none;align-items:center;justify-content:space-between;margin-top:8px}
    .tt-tools{display:flex;align-items:center;margin-left:-2px}
    .tt-tool{width:44px;height:32px;border:0;background:transparent;color:inherit;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .tt-tool svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
    .tt-foot.open .tt-actions{display:flex}
    .tt-send{width:52px;height:32px;border:0;border-radius:16px;background:#fe2c55;color:#fff;display:flex;align-items:center;justify-content:center;opacity:.42;transition:opacity .15s;cursor:pointer;padding:0}
    .tt-send.ready{opacity:1}
    .tt-send svg{width:20px;height:20px;stroke:#fff;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;fill:none}
    .tt-emojis{display:none;justify-content:space-between;padding:0 4px;margin-bottom:6px}
    .tt-foot.open .tt-emojis{display:flex}
    .tt-emojis button{border:0;background:transparent;font-size:24px;line-height:1;padding:6px;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .tt-menu{position:absolute;left:0;right:0;bottom:0;background:var(--surface,#fff);border-radius:14px 14px 0 0;box-shadow:0 -4px 24px rgba(0,0,0,.25);padding:6px 0 calc(8px + env(safe-area-inset-bottom,0px));z-index:5;animation:ttUp .22s ease}
    .tt-menu button{display:block;width:100%;border:0;background:transparent;color:inherit;font-size:16px;font-weight:600;padding:15px 20px;text-align:center;cursor:pointer;border-bottom:1px solid rgba(128,128,128,.14)}
    .tt-menu button.danger{color:#fe2c55}
    .tt-sk{display:flex;gap:10px;margin-bottom:18px;align-items:center}
    .tt-sk i{width:36px;height:36px;border-radius:50%;background:rgba(128,128,128,.18)}
    .tt-sk b{height:14px;border-radius:7px;background:rgba(128,128,128,.18)}
    #tt-comment-modal .tt-menu-wrap{position:absolute;inset:0;z-index:10;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;animation:ttFade .2s ease}
    @keyframes ttFade{from{opacity:0}to{opacity:1}}
    .tt-menu2{width:100%;box-sizing:border-box;background:#f6f6f6;background:color-mix(in srgb,var(--surface,#fff) 94%,#808080);border-radius:20px 20px 0 0;padding:16px 14px calc(22px + env(safe-area-inset-bottom,0px));animation:ttUp .26s cubic-bezier(.22,1,.36,1)}
    .tt-mi{display:flex;align-items:center;gap:16px;width:100%;height:58px;box-sizing:border-box;border:0;outline:0;background:var(--surface,#fff);color:var(--text-main,#161823);border-radius:18px;padding:0 20px;margin:0 0 12px;font-size:17px;font-weight:700;font-family:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .tt-mi:last-child{margin-bottom:0}
    .tt-mi:active{opacity:.7}
    .tt-mi-ic{width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
    .tt-mi-ic svg{display:block}
    `;
    document.head.appendChild(st);

    el = document.createElement('div');
    el.id = 'tt-comment-modal';
    el.className = 'premium-download-modal';
    el.innerHTML = `
      <div style="position:absolute;inset:0" onclick="closeTikTokComments()"></div>
      <div class="tt-sheet" id="tt-sheet">
        <div class="tt-head"><span id="tt-count">Comments</span>
          <button class="tt-close" aria-label="Close" onclick="closeTikTokComments()"><svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
        </div>
        <div class="tt-list" id="tt-list"></div>
        <div class="tt-foot" id="tt-foot">
          <div class="tt-editbar" id="tt-editbar" style="display:none"><span>Editing comment</span><button type="button" onclick="ttCancelEdit()">Cancel</button></div>
          <div class="tt-emojis">${TT_EMOJIS.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
          <div class="tt-inrow">
            <div id="tt-me" style="flex:0 0 auto"></div>
            <div class="tt-pill"><textarea id="tt-input" rows="1" autocomplete="off" autocapitalize="sentences" enterkeyhint="enter" placeholder="Add comment..." maxlength="500"></textarea></div>
          </div>
          <div class="tt-actions">
            <div class="tt-tools">
              <button type="button" class="tt-tool" id="tt-t-img" aria-label="Photo"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M3.5 16.5l5-5 4.5 4.5 3-3 4.5 4.5"/></svg></button>
              <button type="button" class="tt-tool" id="tt-t-stk" aria-label="Sticker"><svg viewBox="0 0 24 24"><path d="M21 12A9 9 0 1 0 12 21"/><path d="M12 21c0-5 4-9 9-9"/><path d="M12 21c5 0 9-4 9-9"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M8.5 14.3c1 1.3 2.2 1.9 3.5 1.9"/></svg></button>
              <button type="button" class="tt-tool" id="tt-t-at" aria-label="Mention"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg></button>
            </div>
            <button class="tt-send" id="tt-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M12 20V5M5.5 11.5L12 5l6.5 6.5"/></svg></button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);

    const input = el.querySelector('#tt-input');
    const foot = el.querySelector('#tt-foot');
    input.addEventListener('focus', () => {
        foot.classList.add('open'); ttAutoGrow();
        // Keep the sheet itself from being scrolled by the browser's "reveal focused field" behaviour
        const sh = document.getElementById('tt-sheet'); if (sh) sh.scrollTop = 0;
        setTimeout(ttFitKeyboard, 50); setTimeout(ttFitKeyboard, 250);
    });
    input.addEventListener('blur', () => { setTimeout(ttFitKeyboard, 50); });
    el.querySelector('#tt-sheet').addEventListener('scroll', (e) => { e.currentTarget.scrollTop = 0; }, { passive: true });
    input.addEventListener('input', ttSyncSend);
    el.querySelector('#tt-send').addEventListener('click', submitTikTokComment);
    el.querySelectorAll('.tt-emojis button, .tt-tool, .tt-send').forEach(b => b.addEventListener('mousedown', (e) => e.preventDefault()));
    el.querySelector('#tt-t-at').addEventListener('click', () => ttInsertEmoji('@'));
    el.querySelector('#tt-t-img').addEventListener('click', () => showNotification('Photo in comments is coming soon', 'error'));
    el.querySelector('#tt-t-stk').addEventListener('click', () => showNotification('Stickers are coming soon', 'error'));
    // Tap anywhere outside the card -> the card goes back to its normal (collapsed) size
    el.addEventListener('pointerdown', (e) => {
        const f = document.getElementById('tt-foot');
        if (!f || !f.classList.contains('open') || f.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.tt-menu-wrap')) return;
        _ttCollapseAt = Date.now();
        ttCollapse();
    }, true);
    el.addEventListener('click', (e) => {
        const f = document.getElementById('tt-foot');
        if (_ttCollapseAt && Date.now() - _ttCollapseAt < 600 && f && !f.contains(e.target)) { _ttCollapseAt = 0; e.stopPropagation(); e.preventDefault(); }
    }, true);
    el.querySelectorAll('.tt-emojis button').forEach(b => b.addEventListener('click', () => ttInsertEmoji(b.dataset.e)));
    const list = el.querySelector('#tt-list');
    list.addEventListener('scroll', () => { _ttScroll = list.scrollTop; }, { passive: true });
    list.addEventListener('click', ttListClick);
    ttBindLongPress(list);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', ttFitKeyboard);
        window.visualViewport.addEventListener('scroll', ttFitKeyboard);
    }
    window.addEventListener('resize', ttFitKeyboard);
    return el;
}

// Keyboard handling: the comment sheet stays exactly where it is; only the "Add comment..." card
// (the footer) is lifted to sit right above the keyboard. Works for both resize modes
// (visual-viewport overlay keyboard and Android adjustResize).
let _ttBaseH = 0, _ttBaseW = 0, _ttKbWas = false, _ttCollapseAt = 0;
function ttCollapse() {
    const i = document.getElementById('tt-input'), f = document.getElementById('tt-foot');
    _ttKbWas = false;
    if (i) i.blur();
    if (f) { f.classList.remove('open', 'kb'); f.style.transform = ''; }
    ttAutoGrow();
    ttFitKeyboard();
}
function ttFitKeyboard() {
    const m = document.getElementById('tt-comment-modal');
    const sheet = document.getElementById('tt-sheet');
    const foot = document.getElementById('tt-foot');
    const input = document.getElementById('tt-input');
    if (!m || !sheet || !foot || m.style.display === 'none' || !m.clientHeight) return;
    const vv = window.visualViewport;
    const vvH = vv ? vv.height + vv.offsetTop : window.innerHeight;
    if (_ttBaseW !== window.innerWidth) { _ttBaseW = window.innerWidth; _ttBaseH = 0; }
    _ttBaseH = Math.max(_ttBaseH, window.innerHeight, vvH);      // full screen height (no keyboard)
    const base = _ttBaseH;
    const kb = Math.max(0, Math.round(base - vvH));
    const kbVisible = kb > 80;
    // Keyboard was closed (system Back / hide button) -> card returns to normal
    if (_ttKbWas && !kbVisible && document.activeElement === input) { ttCollapse(); return; }
    _ttKbWas = kbVisible;
    const shrink = Math.max(0, Math.round(base - m.clientHeight));   // >0 only when the webview itself resized
    sheet.style.height = Math.round(Math.min(base * 0.72, base - 120)) + 'px';
    sheet.style.maxHeight = 'none';
    sheet.style.marginBottom = (-shrink) + 'px';
    m.style.paddingBottom = '0px';
    const up = kbVisible && document.activeElement === input;
    foot.classList.toggle('kb', up);
    foot.style.transform = up ? 'translateY(' + (-kb) + 'px)' : '';
    sheet.scrollTop = 0;
}

// The comment box starts at 2 lines when the card opens, grows with the text up to 6 lines, then scrolls inside.
function ttAutoGrow() {
    const i = document.getElementById('tt-input'); if (!i) return;
    const foot = document.getElementById('tt-foot');
    const LINE = 22, MAX = LINE * 6;
    const MIN = (foot && foot.classList.contains('open')) ? LINE * 2 : LINE;
    i.style.height = MIN + 'px';
    const h = Math.max(MIN, Math.min(i.scrollHeight, MAX));
    i.style.height = h + 'px';
    i.style.overflowY = i.scrollHeight > MAX ? 'auto' : 'hidden';
}
function ttSyncSend() {
    const i = document.getElementById('tt-input'), b = document.getElementById('tt-send');
    if (b) b.classList.toggle('ready', !!(i && i.value.trim()));
    ttAutoGrow();
}
function ttInsertEmoji(e) {
    const i = document.getElementById('tt-input'); if (!i) return;
    const s = i.selectionStart == null ? i.value.length : i.selectionStart;
    const t = i.selectionEnd == null ? i.value.length : i.selectionEnd;
    i.value = i.value.slice(0, s) + e + i.value.slice(t);
    const p = s + e.length;
    try { i.setSelectionRange(p, p); } catch (x) {}
    i.focus(); ttSyncSend();
}

function openTikTokComments(shortId) {
    playUI('click');
    triggerHapticFeedback();
    const s = allFeels.find(x => String(x.id) === String(shortId));
    if (!s) return;
    currentActiveMovie = s;
    keepFeelsVideoActive(s.id);
    const el = ttEnsureSheet();
    ttDetach();
    _ttId = String(s.id); _ttData = {}; _ttReply = null; _ttScroll = 0;
    _ttPinned.length = 0; _ttSeed = Math.random() + '|' + Date.now();
    _ttOpen.clear(); Object.keys(_ttShown).forEach(k => delete _ttShown[k]);

    const input = el.querySelector('#tt-input');
    input.value = ''; input.placeholder = 'Add comment...';
    el.querySelector('#tt-foot').classList.remove('open', 'kb');
    el.querySelector('#tt-foot').style.transform = '';
    _ttBaseH = 0;
    ttSyncSend();
    const cached = feelsCommentsCache[s.id];
    const list = el.querySelector('#tt-list');
    if (cached && Object.keys(cached).length) { _ttData = cached; ttRender(); }
    else list.innerHTML = [55, 34, 45, 45, 34, 55].map(w => `<div class="tt-sk"><i></i><b style="width:${w}%"></b></div>`).join('');
    ttPaintMe();

    ttAttach(s.id);
    AppNavigation.pushModal('tt-comment-modal');
    requestAnimationFrame(() => { keepFeelsVideoActive(shortId); ttFitKeyboard(); });
}

let _ttGot = false, _ttEdit = null, _ttMe = null;
function ttAttach(id) {
    ttDetach();
    _ttRef = db.ref(`movie_comments/${id}`);
    _ttCb = (snap) => {
        _ttGot = true;
        const m = document.getElementById('tt-comment-modal');
        if (!m || m.style.display === 'none') { ttDetach(); return; }   // closed with the Android back button
        if (String(_ttId) !== String(id)) return;
        _ttData = snap.val() || {};
        feelsCommentsCache[id] = _ttData;
        ttRender();
    };
    _ttRef.on('value', _ttCb);
}
// Safety net: after a write, if the realtime listener stayed silent, re-attach it.
function ttWatch() {
    _ttGot = false;
    setTimeout(() => {
        const m = document.getElementById('tt-comment-modal');
        if (!_ttGot && _ttId && m && m.style.display !== 'none') ttAttach(_ttId);
    }, 900);
}

function ttDetach() {
    if (_ttRef && _ttCb) { try { _ttRef.off('value', _ttCb); } catch (e) {} }
    _ttRef = null; _ttCb = null;
}
function closeTikTokComments() {
    playUI('click');
    ttCloseMenu();
    const i = document.getElementById('tt-input'); if (i) i.blur();
    const m = document.getElementById('tt-comment-modal'); if (m) m.style.paddingBottom = '0px';
    const ft = document.getElementById('tt-foot'); if (ft) { ft.style.transform = ''; ft.classList.remove('kb', 'open'); }
    const shx = document.getElementById('tt-sheet'); if (shx) shx.style.marginBottom = '0px';
    ttDetach();
    const cur = AppNavigation.current();
    if (cur && cur.id === 'tt-comment-modal') AppNavigation.pop();
    else if (m) m.style.display = 'none';
}

function ttPaintMe() {
    const box = document.getElementById('tt-me'); if (!box) return;
    const u = auth.currentUser;
    const fb = ((u && u.email) || 'U').charAt(0).toUpperCase();
    let shown = null;
    const paint = (photo) => { if (photo === shown) return; shown = photo; box.innerHTML = ttAvatar({ avatar: photo, username: fb }, 36); };
    const chImg = (c) => (c && (c.avatarUrl || c.photoURL)) || '';
    let first = chImg(typeof currentChannelData !== 'undefined' ? currentChannelData : null);
    if (!first && u) { try { first = chImg(JSON.parse(localStorage.getItem('flaynity_channel_cache:' + u.uid) || 'null')); } catch (e) {} }
    paint(first || (u && u.photoURL) || '');
    if (!u || !navigator.onLine) return;
    // The user's own channel image is the source of truth
    db.ref(`channels/${u.uid}`).once('value', (cs) => {
        const channelImg = chImg(cs.val());
        if (channelImg) paint(channelImg);
        db.ref(`users/${u.uid}`).once('value', (snap) => {
            const d = snap.val() || {};
            const img = channelImg || chImg(typeof currentChannelData !== 'undefined' ? currentChannelData : null) || d.photoURL || u.photoURL || '';
            _ttMe = { uid: u.uid, username: d.username || (u.email || 'user').split('@')[0], avatar: img };
            if (!channelImg && d.photoURL) paint(d.photoURL);
        });
    });
}

function ttRender() {
    const list = document.getElementById('tt-list'); if (!list) return;
    const entries = Object.entries(_ttData || {}).filter(([k, c]) => c && typeof c === 'object').map(([k, c]) => ({ k, c }));
    const total = entries.length;
    const head = document.getElementById('tt-count');
    if (head) head.textContent = total === 0 ? 'Comments' : `${formatCount(total)} comment${total === 1 ? '' : 's'}`;

    const keys = new Set(entries.map(e => e.k));
    const top = entries.filter(e => !e.c.parentId || !keys.has(e.c.parentId));
    const kids = {};
    entries.filter(e => e.c.parentId && keys.has(e.c.parentId)).forEach(e => { (kids[e.c.parentId] = kids[e.c.parentId] || []).push(e); });
    const uid = auth.currentUser && auth.currentUser.uid;
    const now = Date.now();
    // Random order (TikTok style). The order depends only on the seed + comment id, so a Like (or any
    // realtime update) never moves a comment. Comments the user just posted stay on top.
    const pin = e => { const i = _ttPinned.indexOf(e.k); return i === -1 ? 0 : (_ttPinned.length - i); };
    const rnd = e => _hfHash(_ttSeed + '|' + e.k);
    top.sort((a, b) => (pin(b) - pin(a)) || (rnd(a) - rnd(b)));

    if (!top.length) { list.innerHTML = '<div class="tt-empty">No comments yet. Be the first to comment!</div>'; return; }

    const heart = '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.5 4.8 6.8 4.6c2-.1 3.7 1 5.2 3 1.5-2 3.2-3.1 5.2-3 3.3.2 5.1 3.4 4 6.6-1.7 4.7-9.2 9.3-9.2 9.3z"/></svg>';
    const chev = d => `<svg viewBox="0 0 24 24"><path d="${d ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg>`;
    const row = (e, isReply) => {
        const c = e.c, likes = ttLikeUids(e.c), on = !!(uid && likes.has(uid)), n = likes.size;
        const to = isReply && c.replyToName ? `<span class="tt-to">${ttEsc(c.replyToName)}</span>` : '';
        return `<div class="tt-row${isReply ? ' tt-reply' : ''}" data-k="${ttEsc(e.k)}">
            ${ttAvatar(c, isReply ? 30 : 36)}
            <div class="tt-body">
              <div class="tt-name"><span>${ttEsc(c.username || 'user')}</span>${to}</div>
              <div class="tt-text">${ttEsc(c.text)}</div>
              <div class="tt-meta"><span>${ttShortAgo(c.timestamp)}</span><button type="button" data-act="reply">Reply</button>${c.edited ? '<span>Edited</span>' : ''}</div>
            </div>
            <button type="button" class="tt-like${on ? ' on' : ''}" data-act="like" aria-label="Like">${heart}<span>${n > 0 ? formatCount(n) : ''}</span></button>
          </div>`;
    };

    let html = '';
    top.forEach(p => {
        html += row(p, false);
        const rs = (kids[p.k] || []).slice().sort((a, b) => (a.c.timestamp || 0) - (b.c.timestamp || 0));
        if (!rs.length) return;
        if (!_ttOpen.has(p.k)) {
            html += `<div class="tt-more"><button type="button" data-act="open" data-p="${ttEsc(p.k)}"><span class="tt-dash"></span>View ${formatCount(rs.length)} ${rs.length === 1 ? 'reply' : 'replies'}${chev(false)}</button></div>`;
            return;
        }
        const shown = Math.min(rs.length, _ttShown[p.k] || TT_REPLY_PAGE);
        rs.slice(0, shown).forEach(r => { html += row(r, true); });
        const left = rs.length - shown;
        html += `<div class="tt-more">${left > 0 ? `<button type="button" data-act="more" data-p="${ttEsc(p.k)}"><span class="tt-dash"></span>View ${formatCount(left)} more${chev(false)}</button>` : ''}<button type="button" data-act="hide" data-p="${ttEsc(p.k)}">Hide${chev(true)}</button></div>`;
    });
    const prev = _ttScroll;
    list.innerHTML = html;
    list.scrollTop = prev;
}

function ttListClick(e) {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const act = btn.dataset.act;
    const rowEl = btn.closest('.tt-row');
    const key = rowEl ? rowEl.dataset.k : null;
    const p = btn.dataset.p;
    if (act === 'like') return ttToggleLike(key);
    if (act === 'reply') return ttStartReply(key);
    if (act === 'open') { _ttOpen.add(p); _ttShown[p] = TT_REPLY_PAGE; return ttRender(); }
    if (act === 'more') { _ttShown[p] = (_ttShown[p] || TT_REPLY_PAGE) + 5; return ttRender(); }
    if (act === 'hide') { _ttOpen.delete(p); return ttRender(); }
}

function ttToggleLike(key) {
    playUI('click'); triggerHapticFeedback();
    if (!auth.currentUser) { showNotification('Please log in to Like', 'error'); return; }
    const c = _ttData[key]; if (!c) return;
    const uid = auth.currentUser.uid;
    const base = `movie_comments/${_ttId}/${key}`;
    const had = ttLikeUids(c).has(uid);
    // show it instantly, Firebase then confirms
    if (had) { if (c.likes) delete c.likes[uid]; if (c.reacts) delete c.reacts[uid]; }
    else { c.likes = c.likes || {}; c.likes[uid] = true; }
    ttRender(); ttWatch();
    if (had) {
        const upd = {}; upd[`likes/${uid}`] = null; upd[`reacts/${uid}`] = null;
        db.ref(base).update(upd).catch(() => showNotification('Failed to update like', 'error'));
    } else {
        db.ref(`${base}/likes/${uid}`).set(true).catch(() => showNotification('Failed to update like', 'error'));
    }
}

function ttStartReply(key) {
    playUI('click');
    const c = _ttData[key]; if (!c) return;
    if (_ttEdit) ttCancelEdit();
    const parent = (c.parentId && _ttData[c.parentId]) ? c.parentId : key;
    _ttReply = { parent, name: c.username || 'user', mention: !!(c.parentId && _ttData[c.parentId]) };
    _ttOpen.add(parent);
    if (!_ttShown[parent]) _ttShown[parent] = TT_REPLY_PAGE;
    const i = document.getElementById('tt-input');
    if (i) { i.placeholder = `Reply to ${_ttReply.name}:`; i.focus(); }
    document.getElementById('tt-foot').classList.add('open');
}

function ttStartEdit(key) {
    const c = _ttData[key];
    if (!c || !auth.currentUser || c.uid !== auth.currentUser.uid) return;
    _ttReply = null; _ttEdit = key;
    const i = document.getElementById('tt-input');
    document.getElementById('tt-editbar').style.display = 'flex';
    document.getElementById('tt-foot').classList.add('open');
    if (i) { i.value = c.text || ''; i.placeholder = 'Edit comment...'; i.focus(); }
    ttSyncSend();
}
function ttCancelEdit() {
    _ttEdit = null;
    const bar = document.getElementById('tt-editbar'); if (bar) bar.style.display = 'none';
    const i = document.getElementById('tt-input');
    if (i) { i.value = ''; i.placeholder = _ttReply ? `Reply to ${_ttReply.name}:` : 'Add comment...'; }
    ttSyncSend();
}
function ttResetInput() {
    const input = document.getElementById('tt-input');
    if (input) { input.value = ''; input.placeholder = 'Add comment...'; input.blur(); }
    _ttReply = null; _ttEdit = null;
    const bar = document.getElementById('tt-editbar'); if (bar) bar.style.display = 'none';
    const ft2 = document.getElementById('tt-foot'); ft2.classList.remove('open', 'kb'); ft2.style.transform = '';
    ttSyncSend();
}

function submitTikTokComment() {
    playUI('click');
    if (!auth.currentUser) { showNotification('Please log in to Comment', 'error'); return; }
    if (!navigator.onLine) { showNotification("You're offline", 'error'); return; }
    const input = document.getElementById('tt-input');
    const text = input ? input.value.trim() : '';
    if (!text || !_ttId) return;
    const userId = auth.currentUser.uid, movieId = _ttId;
    if (!_ttData || typeof _ttData !== 'object') _ttData = {};

    // ---- edit an existing comment ----
    if (_ttEdit) {
        const key = _ttEdit, old = _ttData[key];
        if (!old || old.uid !== userId || text === old.text) { ttResetInput(); return; }
        old.text = text; old.edited = true; old.editedAt = Date.now();
        ttResetInput(); ttRender(); ttWatch();
        db.ref(`movie_comments/${movieId}/${key}`).update({ text, edited: true, editedAt: old.editedAt })
            .catch(() => showNotification('Failed to edit comment', 'error'));
        return;
    }

    // ---- new comment / reply: appears on screen immediately ----
    const reply = _ttReply;
    const post = (me) => {
        const data = { uid: userId, username: me.username, avatar: me.avatar || '', text, timestamp: Date.now() };
        if (reply) { data.parentId = reply.parent; if (reply.mention) data.replyToName = reply.name; _ttOpen.add(reply.parent); _ttShown[reply.parent] = 9999; }
        const ref = db.ref(`movie_comments/${movieId}`).push();
        _ttData[ref.key] = data;
        if (!reply) _ttPinned.push(ref.key);
        feelsCommentsCache[movieId] = _ttData;
        ttResetInput();
        if (!reply) _ttScroll = 0;
        ttRender();
        if (!reply) { const l = document.getElementById('tt-list'); if (l) l.scrollTop = 0; }
        const cnt = document.getElementById(`short-comments-count-${movieId}`);
        if (cnt) cnt.innerText = formatCount(Object.keys(_ttData).length);
        ttWatch();
        ref.set(data).catch(() => { delete _ttData[ref.key]; ttRender(); showNotification('Failed to post comment', 'error'); });
    };
    if (_ttMe && _ttMe.uid === userId) post(_ttMe);
    else db.ref(`users/${userId}`).once('value', (snap) => {
        const u = snap.val() || {};
        post({ username: u.username || (auth.currentUser.email || 'user').split('@')[0],
               avatar: (typeof currentChannelData !== 'undefined' && currentChannelData && (currentChannelData.avatarUrl || currentChannelData.photoURL)) || u.photoURL || auth.currentUser.photoURL || '' });
    });
}

// Long-press a comment: Copy / Delete (own comments only)
function ttBindLongPress(list) {
    let timer = null, sx = 0, sy = 0;
    const clear = () => { clearTimeout(timer); timer = null; };
    list.addEventListener('touchstart', (e) => {
        const r = e.target.closest('.tt-row'); if (!r || e.target.closest('[data-act]')) return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
        timer = setTimeout(() => { timer = null; triggerHapticFeedback(); ttOpenMenu(r.dataset.k); }, 520);
    }, { passive: true });
    list.addEventListener('touchmove', (e) => { if (timer && (Math.abs(e.touches[0].clientX - sx) > 8 || Math.abs(e.touches[0].clientY - sy) > 8)) clear(); }, { passive: true });
    list.addEventListener('touchend', clear); list.addEventListener('touchcancel', clear);
    list.addEventListener('contextmenu', (e) => { const r = e.target.closest('.tt-row'); if (r) { e.preventDefault(); ttOpenMenu(r.dataset.k); } });
}
const TT_IC = {
    del: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.2A2 2 0 0 0 9 21h6a2 2 0 0 0 2-1.8L18 7M9 7V4h6v3"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="12" height="12" rx="3"/><path d="M9 6V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="12" height="12" rx="3"/><path d="M9 6V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1"/></svg>',
    cancel: '<svg viewBox="0 0 28 28" width="32" height="32"><path d="M14 3.5 26 24.5H2z" fill="#fe2c55" stroke="#fe2c55" stroke-width="3" stroke-linejoin="round"/><path d="M14 11v6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="14" cy="20.6" r="1.4" fill="#fff"/></svg>'
};
function ttOpenMenu(key) {
    const c = _ttData[key]; if (!c) return;
    ttCloseMenu();
    const mine = !!(auth.currentUser && c.uid === auth.currentUser.uid);
    const item = (k, label) => `<button type="button" class="tt-mi" data-m="${k}"><span class="tt-mi-ic">${TT_IC[k]}</span>${label}</button>`;
    const wrap = document.createElement('div');
    wrap.className = 'tt-menu-wrap'; wrap.id = 'tt-menu';
    wrap._t = Date.now();
    wrap.innerHTML = `<div class="tt-menu2">${mine ? item('del', 'Delete') + item('edit', 'Edit') : ''}${item('copy', 'Copy')}${item('cancel', 'Cancel')}</div>`;
    wrap.addEventListener('click', (e) => {
        if (Date.now() - wrap._t < 350) return;          // ignore the finger-lift of the long press
        const b = e.target.closest('button');
        if (!b) { if (e.target === wrap) ttCloseMenu(); return; }
        const m = b.dataset.m;
        ttCloseMenu();
        if (m === 'copy') {
            const t = c.text || '';
            try { navigator.clipboard.writeText(t).then(() => showNotification('Copied', 'success')).catch(() => {}); }
            catch (x) { try { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showNotification('Copied', 'success'); } catch (y) {} }
        } else if (m === 'edit') ttStartEdit(key);
        else if (m === 'del') ttDelete(key);
    });
    document.getElementById('tt-comment-modal').appendChild(wrap);
}
function ttCloseMenu() { const m = document.getElementById('tt-menu'); if (m) m.remove(); }
function ttDelete(key) {
    const c = _ttData[key];
    if (!c || !auth.currentUser || c.uid !== auth.currentUser.uid) return;
    const upd = {}; upd[key] = null;
    if (!c.parentId) Object.entries(_ttData).forEach(([k, v]) => { if (v && v.parentId === key) upd[k] = null; });   // replies go with their comment
    Object.keys(upd).forEach(k => delete _ttData[k]);
    ttRender(); ttWatch();
    const cnt = document.getElementById(`short-comments-count-${_ttId}`);
    if (cnt) cnt.innerText = formatCount(Object.keys(_ttData).length);
    db.ref(`movie_comments/${_ttId}`).update(upd).then(() => showNotification('Comment deleted', 'success')).catch(() => showNotification('Failed to delete', 'error'));
}

function openShortComments(shortId) { openTikTokComments(shortId); }

function openShortCommentsLegacy(shortId) {
    playUI('click');
    triggerHapticFeedback();
    currentActiveMovie = allFeels.find(s => String(s.id) === String(shortId));
    if (!currentActiveMovie) return;
    keepFeelsVideoActive(shortId);
    if (activeCommentsRef) { try { activeCommentsRef.off(); } catch(e) {} }
    activeCommentsRef = db.ref(`movie_comments/${currentActiveMovie.id}`);
    const initialComments = feelsCommentsCache[currentActiveMovie.id] || {};
    renderCommentList(initialComments);
    const initialCount = Object.keys(initialComments).length;
    const initialCountEl = document.getElementById(`short-comments-count-${currentActiveMovie.id}`);
    if (initialCountEl) initialCountEl.innerText = formatCount(initialCount);
    const initialModalCount = document.getElementById('modal-comment-count');
    if (initialModalCount) initialModalCount.innerText = formatCount(initialCount);

    activeCommentsRef.on('value', snapshot => {
        const commentsObj = snapshot.val() || {};
        const count = Object.keys(commentsObj).length;
        feelsCommentsCache[currentActiveMovie.id] = commentsObj;
        const countEl = document.getElementById(`short-comments-count-${currentActiveMovie.id}`);
        if (countEl) countEl.innerText = formatCount(count);
        const modalCount = document.getElementById('modal-comment-count');
        if (modalCount) modalCount.innerText = formatCount(count);
        renderCommentList(commentsObj);
    });
    openCommentModal();
    requestAnimationFrame(() => keepFeelsVideoActive(shortId));
}

// =========================================================
// SECURE DOWNLOAD SYSTEM IMPLEMENTATION
// =========================================================
async function triggerFileDownload(url, filename) {
    if (!isAdminFeatureEnabled('downloadEnabled')) {
        showNotification('Downloads are currently disabled by the administrator.', 'error');
        return;
    }
    if (!url) {
        showNotification("Invalid download link.", "error");
        return;
    }

    if (window.AndroidBridge && typeof window.AndroidBridge.downloadVideo === 'function') {
        const posterUrl = currentActiveMovie ? (currentActiveMovie.poster || "") : "";
        window.AndroidBridge.downloadVideo(url, filename, posterUrl);
        showNotification("Download started in system background.", "success");
        return;
    }

    showNotification("Preparing web download transfer...", "success");
    try {
        const response = await fetch(url, { method: 'GET', mode: 'cors' });
        if (!response.ok) throw new Error("CORS verification mismatch");
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename || "flaynity_video.mp4";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        
        showNotification("Download completed successfully!", "success");
    } catch (err) {
        const a = document.createElement('a');
        a.href = url;
        a.target = "_blank";
        a.download = filename || "flaynity_video.mp4";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showNotification("Redirecting direct download link...", "success");
    }
}

function triggerShortDownload(shortId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    playUI('click');
    triggerHapticFeedback();
    const s = allFeels.find(item => item.id === shortId);
    if (!s) {
        showNotification("No valid Feels found.", "error");
        return;
    }

    // Keep the exact Feels the user tapped active. Do not navigate the swiper.
    currentActiveMovie = s;
    keepFeelsVideoActive(shortId);
    openDownloadModal();
}

function toggleClipSubscribe(channelId, buttonEl) {
    playUI('click');
    try {
        if (navigator.vibrate) navigator.vibrate(12);
    } catch (e) {}
    if (!auth.currentUser) { showNotification("Please sign in to Subscribe", "error"); return; }
    if (channelId === auth.currentUser.uid) { showNotification("You cannot subscribe to your own channel!", "error"); return; }

    const userSubRef = db.ref(`subscribers/${channelId}/${auth.currentUser.uid}`);
    const channelSubCountRef = db.ref(`channels/${channelId}/subscribersCount`);
    
    userSubRef.once('value', (snap) => {
        if (snap.exists()) {
            userSubRef.remove();
            channelSubCountRef.transaction((currentCount) => {
                return (currentCount || 1) - 1;
            });
            showNotification("Unsubscribed from channel.", "success");
        } else {
            userSubRef.set(firebase.database.ServerValue.TIMESTAMP);
            channelSubCountRef.transaction((currentCount) => {
                return (currentCount || 0) + 1;
            });
            showNotification("Subscribed to channel!", "success");
        }
    });
}

// =========================================================
// FEELS MEMORY OPTIMIZATION & INTERSECTION OBSERVER
// =========================================================
let currentActiveFeelsIdx = -1;

const FLAYNITY_STREAM_PREFERRED_QUALITY_LADDER = [360, 480, 720, 1080];
const FLAYNITY_STREAM_START_HEIGHT = 360;

function preserveVideoFrame(video) {
    video.style.setProperty('object-fit', 'contain', 'important');
    video.style.setProperty('object-position', 'center', 'important');
    video.style.setProperty('transform', 'none', 'important');
}

function flaynityApiOriginFromMedia(mediaUrl) {
    try {
        if (typeof R2_CONFIG !== 'undefined' && R2_CONFIG.workerBaseUrl) {
            return String(R2_CONFIG.workerBaseUrl).replace(/\/+$/, '');
        }
        if (mediaUrl && /^https?:\/\//i.test(mediaUrl)) {
            return new URL(mediaUrl).origin;
        }
    } catch (e) {}
    return 'https://api.flaynity-app.indevs.in';
}

const FLAYNITY_PENDING_HLS_STORAGE_KEY = 'flaynity_pending_hls_jobs_v1';
const __flaynityActiveHlsWatchers = new Set();

function flaynityReadPendingHlsJobs() {
    try {
        const raw = localStorage.getItem(FLAYNITY_PENDING_HLS_STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) return [];
        const cutoff = Date.now() - (6 * 60 * 60 * 1000);
        return list.filter(j => j && j.jobId && j.targetPath && (!j.createdAt || j.createdAt > cutoff));
    } catch (e) {
        return [];
    }
}

function flaynityWritePendingHlsJobs(jobs) {
    try {
        localStorage.setItem(FLAYNITY_PENDING_HLS_STORAGE_KEY, JSON.stringify(jobs || []));
    } catch (e) {}
}

function flaynitySavePendingHlsJob(job) {
    const list = flaynityReadPendingHlsJobs().filter(j => j.jobId !== job.jobId);
    list.push(job);
    flaynityWritePendingHlsJobs(list);
}

function flaynityRemovePendingHlsJob(jobId) {
    const list = flaynityReadPendingHlsJobs().filter(j => j.jobId !== jobId);
    flaynityWritePendingHlsJobs(list);
}

async function flaynityQueueHlsTranscode(item, inputKey, fallbackMp4Url) {
    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!user) return null;
    const idToken = await user.getIdToken();
    const apiBase = flaynityApiOriginFromMedia(fallbackMp4Url);

    const startRes = await fetch(`${apiBase}/api/v1/transcode/hls`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
            jobId: item.id,
            inputKey,
            qualities: ['360p', '480p', '720p'],
            deleteOriginal: true
        })
    });
    const startData = await startRes.json().catch(() => ({}));
    if (!startRes.ok || !startData.ok) {
        throw new Error(startData.error || `Transcode queue failed (${startRes.status})`);
    }
    return {
        jobId: startData.jobId || item.id,
        masterUrl: startData.masterUrl || '',
        statusUrl: startData.statusUrl || '',
        apiBase
    };
}

function flaynityApplyHlsUpgradeInMemory(itemId, isShort, patch) {
    try {
        const list = isShort ? (typeof allFeels !== 'undefined' ? allFeels : null) : (typeof allLongVideos !== 'undefined' ? allLongVideos : null);
        if (Array.isArray(list)) {
            const idx = list.findIndex(v => v && v.id === itemId);
            if (idx !== -1) Object.assign(list[idx], patch);
        }
    } catch (e) {}
}

function flaynityTrackBackgroundHlsJob(job) {
    if (!job || !job.jobId || !job.targetPath) return;
    flaynitySavePendingHlsJob(job);
    if (__flaynityActiveHlsWatchers.has(job.jobId)) return;
    __flaynityActiveHlsWatchers.add(job.jobId);

    (async () => {
        const apiBase = job.apiBase || 'https://api.flaynity-app.indevs.in';
        const maxPolls = 225; // ~15 minutes at 4s interval in background
        try {
            for (let i = 0; i < maxPolls; i++) {
                await new Promise(r => setTimeout(r, i === 0 ? 3000 : 4000));
                const stRes = await fetch(`${apiBase}/api/v1/transcode/status/${encodeURIComponent(job.jobId)}`, {
                    cache: 'no-store'
                }).catch(() => null);
                if (!stRes || !stRes.ok) continue;
                const st = await stRes.json().catch(() => null);
                if (!st) continue;

                if (st.status === 'ready' && st.masterUrl) {
                    const masterUrl = normalizeFlaynityMediaUrl(st.masterUrl);
                    const patch = {
                        videoLink: masterUrl,
                        hlsUrl: masterUrl,
                        hlsRenditions: Array.isArray(st.renditions) ? st.renditions : [],
                        videoProvider: 'r2-hls',
                        hlsStatus: 'ready',
                        updateTime: Date.now()
                    };
                    const curUser = (typeof auth !== 'undefined') ? auth.currentUser : null;
                    if (curUser && (!job.ownerId || curUser.uid === job.ownerId)) {
                        try {
                            await db.ref(job.targetPath).update(patch);
                            flaynityApplyHlsUpgradeInMemory(job.itemId, job.isShort, patch);
                            flaynityRemovePendingHlsJob(job.jobId);
                        } catch (dbErr) {
                            console.warn("Background HLS Firebase update retry needed:", dbErr);
                        }
                    }
                    return;
                } else if (st.status === 'failed') {
                    const curUser = (typeof auth !== 'undefined') ? auth.currentUser : null;
                    if (curUser && (!job.ownerId || curUser.uid === job.ownerId)) {
                        try {
                            await db.ref(job.targetPath).update({
                                hlsStatus: 'failed',
                                updateTime: Date.now()
                            });
                        } catch (e) {}
                    }
                    flaynityRemovePendingHlsJob(job.jobId);
                    return;
                }
            }
        } finally {
            __flaynityActiveHlsWatchers.delete(job.jobId);
        }
    })();
}

function flaynityResumePendingHlsJobs(uid) {
    if (!uid) return;
    const jobs = flaynityReadPendingHlsJobs();
    jobs.forEach(job => {
        if (!job.ownerId || job.ownerId === uid) {
            flaynityTrackBackgroundHlsJob(job);
        }
    });
}

function flaynityDestroyHls(videoElement) {
    if (!videoElement) return;
    if (videoElement._flaynityHls) {
        try { videoElement._flaynityHls.destroy(); } catch (e) {}
        videoElement._flaynityHls = null;
    }
    videoElement._flaynityHlsUrl = '';
}

function flaynityFind360pLevelIndex(levels) {
    if (!Array.isArray(levels) || !levels.length) return 0;
    let bestIdx = 0;
    let bestDiff = Infinity;
    levels.forEach((lvl, idx) => {
        const shortSide = Math.min(lvl.width || 0, lvl.height || 0) || (lvl.height || 0);
        const diff = Math.abs(shortSide - FLAYNITY_STREAM_START_HEIGHT);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = idx;
        }
    });
    return bestIdx;
}

function flaynityApplyFeelsQualityPref(videoElement) {
    const hls = videoElement && videoElement._flaynityHls;
    if (!hls || !Array.isArray(hls.levels) || !hls.levels.length) return;
    const pref = (typeof feelsQualityPref === 'function') ? feelsQualityPref() : 'auto';
    if (pref === 'auto') {
        hls.currentLevel = -1; // Auto ABR: fast network rises 360p->480p->720p->1080p, slow stays low
        return;
    }
    const targetQ = parseInt(pref, 10);
    if (!isFinite(targetQ)) {
        hls.currentLevel = -1;
        return;
    }
    let bestIdx = 0;
    let bestDiff = Infinity;
    hls.levels.forEach((lvl, idx) => {
        const q = Math.min(lvl.width || 0, lvl.height || 0) || lvl.height || 360;
        const diff = Math.abs(q - targetQ);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = idx;
        }
    });
    hls.currentLevel = bestIdx;
}

function refreshFeelsQualityMenu(shortId, video) {
    const select = document.getElementById(`short-quality-${shortId}`);
    if (!select) return;
    const hls = video && video._flaynityHls;
    if (hls && Array.isArray(hls.levels) && hls.levels.length) {
        let html = '<option value="-1">Auto</option>';
        hls.levels.forEach((lvl, idx) => {
            const q = Math.min(lvl.width || 0, lvl.height || 0) || lvl.height || 360;
            html += `<option value="${idx}">${q}p</option>`;
        });
        select.innerHTML = html;
        select.value = String(hls.autoLevelEnabled ? -1 : hls.currentLevel);
        return;
    }
    select.innerHTML = '<option value="0">Original</option>';
    select.value = '0';
}

function setFeelsQuality(shortId, value) {
    const video = document.getElementById(`slide-short-${shortId}`)?.querySelector('video');
    if (!video) return;
    if (video._flaynityHls) {
        const idx = parseInt(value, 10);
        video._flaynityHls.currentLevel = isNaN(idx) ? -1 : idx;
    }
    refreshFeelsQualityMenu(shortId, video);
}

function refreshPublishedSources(items) {
    const byId = new Map(items.map(item => [String(item.id), item]));
    if (currentActiveMovie && byId.has(String(currentActiveMovie.id))) Object.assign(currentActiveMovie, byId.get(String(currentActiveMovie.id)));
    document.querySelectorAll('.short-video-el, #fly-video').forEach(video => {
        const item = byId.get(video._flaynityContentId);
        const preferred = item && (item.hlsUrl || item.videoLink || item.videoUrl);
        if (!preferred) return;
        video._flaynityItem = { ...item };
        const nextUrl = normalizeFlaynityMediaUrl(preferred);
        const curUrl = video._flaynityHlsUrl || video.src;
        if (curUrl !== nextUrl) {
            attachSmartAdaptiveSource(video, nextUrl, video.id === 'fly-video' ? 'fly_main' : video._flaynityContentId);
        }
    });
}

function attachSmartAdaptiveSource(videoElement, url, shortId) {
    if (!videoElement || !url) return;
    const item = shortId === 'fly_main' ? currentActiveMovie : allFeels.find(s => String(s.id) === String(shortId));
    videoElement._flaynityContentId = item ? String(item.id) : '';
    videoElement._flaynityItem = item ? { ...item } : null;
    preserveVideoFrame(videoElement);

    const rawPreferred = (item && item.hlsUrl) ? item.hlsUrl : (item && item.videoLink ? item.videoLink : url);
    const normalizedUrl = normalizeFlaynityMediaUrl(rawPreferred);
    const fallbackMp4 = item && item.mp4FallbackUrl ? normalizeFlaynityMediaUrl(item.mp4FallbackUrl) : '';
    const isHls = /\.m3u8(\?|$)/i.test(normalizedUrl);
    const isMainPlayer = shortId === 'fly_main';

    if (videoElement._flaynityHlsUrl === normalizedUrl && videoElement._flaynityHls) {
        return;
    }

    flaynityDestroyHls(videoElement);
    videoElement.preload = isMainPlayer ? 'auto' : 'metadata';

    if (isHls && window.Hls && window.Hls.isSupported()) {
        // Fast-start 360p ABR configuration:
        // - Always starts at 360p (level 0) for instant playback
        // - Fast network rises rapidly: 360p -> 480p -> 720p -> 1080p
        // - Slow network stays on lower quality to prevent buffering
        const hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: false,
            startLevel: 0,
            startFragPrefetch: true,
            abrEwmaDefaultEstimate: 850000,   // ~850 kbps initial -> instant 360p start
            abrEwmaFastVoD: 2.0,              // quick upshift when network is fast
            abrEwmaSlowVoD: 5.0,              // steady downshift protection on slow network
            abrBandWidthUpFactor: 0.78,       // allows quick step-up 360p->480p->720p->1080p
            abrBandWidthFactor: 0.90,         // stays conservative on weak network to avoid stalls
            maxBufferLength: isMainPlayer ? 20 : 12,
            maxMaxBufferLength: 35,
            maxBufferHole: 0.5,
            capLevelOnFPSDrop: true,
            capLevelToPlayerSize: false
        });

        videoElement._flaynityHls = hls;
        videoElement._flaynityHlsUrl = normalizedUrl;

        hls.loadSource(normalizedUrl);
        hls.attachMedia(videoElement);

        hls.on(window.Hls.Events.MANIFEST_PARSED, (_evt, data) => {
            const idx360 = flaynityFind360pLevelIndex(data.levels);
            hls.startLevel = idx360;
            hls.nextLoadLevel = idx360;
            if (isMainPlayer) {
                hls.currentLevel = -1; // Auto ABR starting from 360p
                try { flyBuildQualityMenu(); } catch (e) {}
            } else {
                flaynityApplyFeelsQualityPref(videoElement);
                try { refreshFeelsQualityMenu(shortId, videoElement); } catch (e) {}
            }
        });

        hls.on(window.Hls.Events.LEVEL_SWITCHED, () => {
            if (isMainPlayer) {
                try { flyUpdateQualityLabel(); } catch (e) {}
            }
        });

        let mediaRecoveries = 0;
        hls.on(window.Hls.Events.ERROR, (_evt, data) => {
            if (!data || !data.fatal) return;
            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                // Step down to 360p on network stall and resume
                hls.nextLoadLevel = 0;
                hls.startLoad();
            } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
                mediaRecoveries++;
                hls.recoverMediaError();
            } else {
                flaynityDestroyHls(videoElement);
                if (fallbackMp4 && fallbackMp4 !== normalizedUrl) {
                    videoElement.src = fallbackMp4;
                    videoElement.load();
                }
            }
        });
        return;
    }

    if (isHls && videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement._flaynityHlsUrl = normalizedUrl;
        videoElement.src = normalizedUrl;
        videoElement.load();
        return;
    }

    videoElement.src = normalizedUrl;
    videoElement.load();
}

const FEELS_FULL_PRELOAD_AHEAD = 2;
const FEELS_WARM_AHEAD = 20;
let feelsWarmGeneration = 0;
const feelsWarmCache = new Map();

function warmFeelRange(url, key, generation) {
    if (!url || generation !== feelsWarmGeneration || feelsWarmCache.has(key)) return;
    if (!/^https?:\/\//i.test(url)) return;
    feelsWarmCache.set(key, 'pending');
    fetch(normalizeFlaynityMediaUrl(url), {
        method: 'GET',
        headers: { Range: 'bytes=0-262143' },
        cache: 'force-cache',
        credentials: 'omit'
    }).then(r => {
        if (generation === feelsWarmGeneration && r.ok) feelsWarmCache.set(key, 'warm');
        else feelsWarmCache.delete(key);
    }).catch(() => feelsWarmCache.delete(key));
}

function warmNextFeels(activeIndex) {
    const generation = ++feelsWarmGeneration;
    // Follow the order that is really on screen (random session order).
    const slides = Array.from(document.querySelectorAll('.short-slide'));
    if (!slides.length) return;
    let launched = 0;
    let cursor = activeIndex;
    const pump = () => {
        if (generation !== feelsWarmGeneration || launched >= FEELS_WARM_AHEAD) return;
        let s = null;
        while (!s && ++cursor < slides.length) {
            const id = slides[cursor].getAttribute('data-shortid');
            if (id) s = allFeels.find(item => String(item.id) === String(id)) || null;
        }
        if (!s) return;
        launched++;
        if (s.videoLink) warmFeelRange(s.videoLink, s.id, generation);
        if (launched < FEELS_WARM_AHEAD) setTimeout(pump, 70);
    };
    pump();
}

function optimizeFeelsMemoryAndPreload(activeIndex) {
    const slides = document.querySelectorAll('.short-slide');
    slides.forEach((slide, idx) => {
        const video = slide.querySelector('video');
        if (!video) return;
        const shortId = slide.getAttribute('data-shortid');
        const s = allFeels.find(item => item.id === shortId);
        if (!s) return;

        const distance = idx - activeIndex;
        if (idx === activeIndex || (distance > 0 && distance <= FEELS_FULL_PRELOAD_AHEAD)) {
            if (video.getAttribute('poster') !== s.poster) video.setAttribute('poster', s.poster);

            video.preload = 'auto';
            if (!video.getAttribute('src') && !video._flaynityHls) {
                attachSmartAdaptiveSource(video, s.hlsUrl || s.videoLink, shortId);
            }

            if (idx === activeIndex) {
                video.muted = false;
                const playPromise = video.play();
                if (playPromise?.catch) {
                    playPromise.catch(() => {
                        video.muted = true;
                        video.play().catch(() => {});
                    });
                }
            } else {
                video.muted = true;
                video.pause();
                try { if (video.currentTime > 0) video.currentTime = 0; } catch (e) {}
            }
        } else {
            video.pause();
            flaynityDestroyHls(video);
            video.removeAttribute('src');
            video.preload = 'none';
            video.load();
        }
    });
    // Warm the next 20 with a small initial byte-range request. This avoids
    // keeping 20 full decoders/buffers alive while still reducing edge/origin
    // latency when the user rapidly scrolls through Feels.
    warmNextFeels(activeIndex);
}

let feelsObserver;
function initFeelsObserver() {
    if (feelsObserver) feelsObserver.disconnect();
    
    feelsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video');
            const shortId = entry.target.id.replace('slide-short-', '');
            const progressBar = entry.target.querySelector(`#short-progress-bar-${shortId}`);

            if (video) {
                if (entry.isIntersecting) {
                    // Ignore transient intersections from other slides while a
                    // specific Feels is being opened/restored.
                    if (feelsProgrammaticTargetId) {
                        if (Date.now() <= feelsProgrammaticTargetUntil && String(shortId) !== String(feelsProgrammaticTargetId)) {
                            return;
                        }
                        if (String(shortId) === String(feelsProgrammaticTargetId) || Date.now() > feelsProgrammaticTargetUntil) {
                            feelsProgrammaticTargetId = null;
                            feelsProgrammaticTargetUntil = 0;
                        }
                    }

                    try { feelsMarkSeen(shortId); } catch (e) {}
                    const slides = Array.from(document.querySelectorAll('.short-slide'));
                    const activeIdx = slides.indexOf(entry.target);
                    if (activeIdx !== -1 && activeIdx !== currentActiveFeelsIdx) {
                        currentActiveFeelsIdx = activeIdx;
                        if (!feelsPendingRestoreId) {
                            feelsLastPlayedId = shortId;
                            feelsLastPlayedByMode[feelsFeedMode] = shortId;
                        }
                        optimizeFeelsMemoryAndPreload(activeIdx);
                    }

                    const userId = auth.currentUser ? auth.currentUser.uid : 'anonymous';
                    if (userId !== 'anonymous' && navigator.onLine) {
                        flayTrackView(shortId, userId, 'feels');
                    }

                    video.ontimeupdate = () => {
                        if (entry.target._scrubbing) return;
                        if (video.duration) {
                            const percentage = (video.currentTime / video.duration) * 100;
                            if (progressBar) progressBar.style.width = `${percentage}%`;
                        }
                    };
                } else {
                    video.pause();
                    video.ontimeupdate = null;
                }
            }
        });
    }, { threshold: 0.6 });

    document.querySelectorAll('.short-slide').forEach(slide => { feelsObserver.observe(slide); });
}

// =========================================================
// INTERNAL PREMIUM SERVICE NAVIGATION (SPA + OFFLINE CACHE)
// =========================================================
const PREMIUM_SERVICE_FILES = {
    'upgrade-pro': 'service/upgrade-pro.html',
    'flay-verified-badge': 'service/flay-verified-badge.html',
    'flay-ads': 'service/flay-ads.html',
    'boost-content': 'service/boost-content.html',
    'flay-pay': 'service/flay-pay.html',
    'flay-payout': 'service/flay-payout.html',
    'report-a-problem': 'support/report-a-problem.html'
};
const PREMIUM_SERVICE_CACHE_PREFIX = 'flaynity-premium-service-cache-v1:';
const premiumServiceLoads = {};

async function __flaynityLoadPremiumService(serviceId) {
    const url = PREMIUM_SERVICE_FILES[serviceId];
    if (!url) throw new Error('Unknown premium service: ' + serviceId);
    const pageId = serviceId + '-page';
    if (document.getElementById(pageId)) return document.getElementById(pageId);
    if (premiumServiceLoads[serviceId]) return premiumServiceLoads[serviceId];

    premiumServiceLoads[serviceId] = (async () => {
        let html = null;
        let lastLoadError = null;
        // WebView may have a non-root base URL; retry payout from the site's absolute URL.
        const pageUrls = serviceId === 'flay-payout'
            ? [url, 'https://flaynity.indevs.in/service/flay-payout.html']
            : [url];
        for (const pageUrl of [...new Set(pageUrls)]) {
            try {
                const response = await fetch(pageUrl, { cache: 'no-store' });
                if (!response.ok) throw new Error('HTTP ' + response.status + ' loading ' + pageUrl);
                const source = await response.text();
                if (!source || !/<html[\s>]/i.test(source)) throw new Error('Invalid HTML response from ' + pageUrl);
                html = source;
                break;
            } catch (error) {
                lastLoadError = error;
                console.warn('Premium page source failed:', serviceId, pageUrl, error);
            }
        }
        if (html) {
            try { localStorage.setItem(PREMIUM_SERVICE_CACHE_PREFIX + serviceId, html); } catch (e) {}
        } else {
            try { html = localStorage.getItem(PREMIUM_SERVICE_CACHE_PREFIX + serviceId); } catch (err) {}
            if (!html) throw (lastLoadError || new Error('Page source unavailable: ' + serviceId));
        }

        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('style').forEach((style, index) => {
            const styleId = 'flaynity-premium-style-' + serviceId + '-' + index;
            if (!document.getElementById(styleId)) {
                const css = document.createElement('style');
                css.id = styleId;
                css.textContent = style.textContent || '';
                document.head.appendChild(css);
            }
        });

        const page = document.createElement('div');
        page.id = pageId;
        page.className = 'fullscreen-page premium-service-page';
        page.setAttribute('data-premium-service', serviceId);
        page.style.display = 'none';
        page.style.paddingTop = 'env(safe-area-inset-top, 0px)';
        page.style.boxSizing = 'border-box';
        page.style.overflowY = 'auto';
        page.style.webkitOverflowScrolling = 'touch';

        Array.from(doc.body.children).forEach(node => {
            if (node.tagName && node.tagName.toLowerCase() !== 'script') page.appendChild(node.cloneNode(true));
        });
        document.getElementById('app-screen')?.appendChild(page);

        // Firebase/font libraries are already loaded by index.html; only execute the page's own inline logic.
        if (serviceId !== 'flay-pay') window.__flaynityPremiumPayService = null;
        doc.querySelectorAll('script').forEach(sourceScript => {
            if (sourceScript.src) return;
            const script = document.createElement('script');
            script.textContent = sourceScript.textContent || '';
            page.appendChild(script);
        });
        return page;
    })();

    try { return await premiumServiceLoads[serviceId]; }
    finally { delete premiumServiceLoads[serviceId]; }
}

function __flaynityOpenPremiumService(serviceId) {
    return __flaynityLoadPremiumService(serviceId).then(() => {
        AppNavigation.syncUI();
        return document.getElementById(serviceId + '-page');
    }).catch(error => {
        console.error('Premium service load failed:', serviceId, error);
        const reason = error && error.message ? error.message : 'Unknown loading error';
        showNotification(serviceId === 'flay-payout'
            ? 'Flay Payout could not load. Check connection or hosting path.'
            : 'This page is unavailable offline. Open it once while online to save it for offline use.', 'error', 4000);
        console.error('Premium page source details:', reason);
        return null;
    });
}

// =========================================================
// HIGH PERFORMANCE UNIVERSAL BACK NAVIGATION ENGINE
// =========================================================
const AppNavigation = {
    stack: [{ type: 'tab', id: 'home' }],
    _mem: {},
    _view: 'home|',
    _viewTab: 'home',
    _viewPage: null,
    _fresh: false,
    _homeY: 0,
    _restoring: false,
    _restoreToken: 0,
    _mvTimer: null,

    // element id of a stack page (the upload studio has no "-page" suffix)
    _pid: function(id) {
        return (id === 'full-movie-page' || id === 'premium-upload-studio') ? id : (id.endsWith('-page') ? id : id + '-page');
    },

    // Close the whole upload flow at once (after publish) so Back never lands on an old upload page
    popUploadFlow: function() {
        const ids = ['premium-upload-studio', 'video-preview-page', 'short-preview-page', 'post-preview-page',
                     'video-details-page', 'short-details-page', 'post-details-page', 'short-editor-page'];
        window.__uploadStudioResume = null;
        while (this.stack.length > 1) {
            const top = this.stack[this.stack.length - 1];
            if (top.type === 'page' && ids.indexOf(top.id) > -1) this.stack.pop(); else break;
        }
        this.syncUI();
        this.updateBridge();
    },

    // Remember every scroll position of the view that is on screen right now.
    _collectScroll: function(root, out) {
        if (!root || !root.getClientRects().length) return;
        const nodes = [root];
        root.querySelectorAll('*').forEach(n => nodes.push(n));
        nodes.forEach(n => { if (n.scrollTop > 0) out.push([n, n.scrollTop]); });
    },
    _homeVisible: function() {
        const t = document.getElementById('home-tab');
        return !!(t && t.getClientRects().length);
    },
    // Save Home's scroll position BEFORE a video / Feels is opened (the page may collapse right after).
    rememberHome: function() {
        try { if (this._view === 'home|' && this._homeVisible()) this._saveScroll(); } catch (e) {}
    },
    // Multi-step restore: now, next frames, then a few timed retries (the feed may still be laying out).
    // Stops as soon as the user scrolls by hand.
    _restoreRec: function(rec, activePage, viewKey) {
        const self = this;
        const token = ++this._restoreToken;
        this._restoring = true;
        let done = false, ro = null;
        const evs = ['touchmove', 'wheel', 'keydown'];
        const finish = () => {
            if (done) return;
            done = true;
            if (token === self._restoreToken) self._restoring = false;
            evs.forEach(e => window.removeEventListener(e, finish, true));
            if (ro) { try { ro.disconnect(); } catch (e) {} }
        };
        evs.forEach(e => window.addEventListener(e, finish, { capture: true, passive: true }));
        const apply = () => {
            if (done || token !== self._restoreToken || self._view !== viewKey) { finish(); return; }
            if (!activePage && rec.win != null) {
                const cur = window.pageYOffset || document.documentElement.scrollTop || 0;
                if (Math.abs(cur - rec.win) > 1) {
                    try { window.scrollTo({ top: rec.win, left: 0, behavior: 'instant' }); }
                    catch (e) { try { window.scrollTo(0, rec.win); } catch (e2) {} }
                }
            }
            rec.els.forEach(([el, top]) => {
                if (el.isConnected && el.getClientRects().length && Math.abs(el.scrollTop - top) > 1) el.scrollTop = top;
            });
        };
        apply();
        requestAnimationFrame(() => { apply(); requestAnimationFrame(apply); });
        [30, 80, 160, 300, 500, 800, 1200].forEach(ms => setTimeout(apply, ms));
        try {
            const feed = document.getElementById('home-feed-container');
            if (!activePage && feed && window.ResizeObserver) { ro = new ResizeObserver(apply); ro.observe(feed); }
        } catch (e) {}
        setTimeout(finish, 1350);
    },
    _saveScroll: function() {
        const rec = { win: null, els: [] };
        if (!this._viewPage) {
            let y = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
            if (this._viewTab === 'home') {
                if (this._homeVisible()) this._homeY = y;            // live value
                else if (!y && this._homeY > 0) y = this._homeY;     // page already collapsed -> last known value
            }
            rec.win = y;
            if (this._viewTab !== 'feels') this._collectScroll(document.getElementById(this._viewTab + '-tab'), rec.els);
        } else {
            const pid = this._pid(this._viewPage);
            this._collectScroll(document.getElementById(pid), rec.els);
        }
        this._mem[this._view] = rec;
    },

    pushTab: function(tabId) {
        const current = this.current();
        if (current && current.type === 'tab' && current.id === tabId) {
            return;
        }
        this.rememberHome();
        this.stack.push({ type: 'tab', id: tabId });
        this.syncUI();
        this.updateBridge();
    },

    pushPage: function(pageId) {
        const current = this.current();
        if (current && current.type === 'page' && current.id === pageId) {
            return;
        }
        this.rememberHome();
        this.stack.push({ type: 'page', id: pageId });
        this._fresh = true;
        this.syncUI();
        this.updateBridge();
    },

    pushPremiumService: function(serviceId, paymentService) {
        const self = this;
        const pageId = serviceId + '-page';
        const isTop = () => {
            const c = self.current();
            return !!(c && c.type === 'page' && c.id === pageId);
        };
        const doPush = () => {
            if (isTop()) { self.syncUI(); return document.getElementById(pageId); }
            self.stack.push({ type: 'page', id: pageId, premiumService: serviceId, paymentService: paymentService || null });
            self._fresh = true;
            if (serviceId === 'flay-pay') window.__flaynityPremiumPayService = paymentService || null;
            self.syncUI();
            self.updateBridge();
            return document.getElementById(pageId);
        };
        if (isTop()) return Promise.resolve(doPush());
        // Already loaded (or preloaded): open instantly with no intermediate screen.
        if (document.getElementById(pageId)) return Promise.resolve(doPush());
        // Not loaded yet: keep the current page on screen, load the service page first,
        // and only then navigate. The empty "You" screen is never shown in between.
        if (serviceId === 'flay-pay') window.__flaynityPremiumPayService = paymentService || null;
        return __flaynityLoadPremiumService(serviceId).then(() => doPush()).catch(error => {
            console.error('Premium service load failed:', serviceId, error);
            showNotification(serviceId === 'flay-payout'
                ? 'Flay Payout could not load. Check connection or hosting path.'
                : 'This page is unavailable offline. Open it once while online to save it for offline use.', 'error', 4000);
            return null;
        });
    },

    pushModal: function(modalId) {
        const current = this.current();
        if (current && current.type === 'modal' && current.id === modalId) {
            return;
        }
        this.stack.push({ type: 'modal', id: modalId });
        this.syncUI();
        this.updateBridge();
    },

    current: function() {
        return this.stack[this.stack.length - 1];
    },

    pop: function() {
        if (this.stack.length > 1) {
            const popped = this.stack.pop();
            // "Your Channel" (view-channel-page) IS the You page. The old You profile
            // card (Switch Account / name / @handle) must never be shown on Back, so the
            // 'you' tab entry beneath the channel page is dropped together with it.
            // Back therefore returns to the page the user came from.
            if (popped && popped.type === 'page' && popped.id === 'view-channel-page') {
                const below = this.stack[this.stack.length - 1];
                if (below && below.type === 'tab' && below.id === 'you') {
                    if (this.stack.length > 1) this.stack.pop();
                    else this.stack = [{ type: 'tab', id: 'home' }];
                }
            }
            this.syncUI();
            this.updateBridge();
            return popped;
        }
        return null;
    },

    syncUI: function() {
        // You page navigation opens sub-pages directly without the default
        // right-to-left slide animation. Other app pages keep their existing animation.
        if (!document.getElementById('flaynity-you-direct-page-style')) {
            const style = document.createElement('style');
            style.id = 'flaynity-you-direct-page-style';
            style.textContent = [
                '.fullscreen-page.you-direct-page { animation: none !important; transform: none !important; }',
                '.fullscreen-page#view-channel-page { animation: none !important; transform: none !important; bottom: 48px !important; height: calc(100vh - 48px) !important; }',
                '.bottom-nav.view-channel-visible { z-index: 1520 !important; transform: translate3d(0,0,0) !important; -webkit-transform: translate3d(0,0,0) !important; }'
            ].join(' ');
            document.head.appendChild(style);
        }
        // Work out the target view first, so the page that stays open is never hidden and re-shown
        // (that replayed its slide-up animation and reset its scroll = the "jump").
        let activeTab = 'home';
        let activePage = null;
        let activeModals = [];

        this.stack.forEach(item => {
            if (item.type === 'tab') {
                activeTab = item.id;
                activePage = null;
                activeModals = [];
            } else if (item.type === 'page') {
                activePage = item.id;
                activeModals = [];
            } else if (item.type === 'modal') {
                activeModals.push(item.id);
            }
        });
        const newViewKey = activeTab + '|' + (activePage || '');
        try { this._saveScroll(); } catch (e) {}
        const keepIds = new Set(activeModals);
        if (activePage) keepIds.add(this._pid(activePage));

        document.querySelectorAll('.fullscreen-page').forEach(el => {
            el.classList.remove('you-direct-page');
        });
        const globalBottomNav = document.querySelector('#app-screen .bottom-nav, .bottom-nav');
        if (globalBottomNav) globalBottomNav.classList.remove('view-channel-visible');
        document.querySelectorAll('.fullscreen-page, .premium-download-modal').forEach(el => {
            if (!keepIds.has(el.id)) el.style.display = 'none';
        });
        const moviePage = document.getElementById('full-movie-page');
        if (moviePage && !keepIds.has('full-movie-page')) {
            if (moviePage.classList.contains('wp-closing')) {
                // already sliding down
            } else if (!activePage && getComputedStyle(moviePage).display !== 'none') {
                // Back to a tab: slide the Play Page down (Home is already visible underneath)
                moviePage.classList.add('wp-closing');
                clearTimeout(this._mvTimer);
                this._mvTimer = setTimeout(() => { moviePage.style.display = 'none'; moviePage.classList.remove('wp-closing'); }, 230);
            } else {
                moviePage.style.display = 'none';
            }
        }
        
        const themeMenu = document.getElementById('theme-popup-menu');
        if (themeMenu) themeMenu.style.display = 'none';

        const imagePreview = document.getElementById('full-image-preview-overlay');
        if (imagePreview) imagePreview.style.display = 'none';

        const reactionPicker = document.getElementById('fb-reaction-picker');
        if (reactionPicker) reactionPicker.style.display = 'none';

        const fxdSheetEl = document.getElementById('fx-dislike-sheet');
        if (fxdSheetEl) fxdSheetEl.style.display = 'none';
        ['fx-video-menu', 'fx-report-dialog', 'fx-copyright-dialog', 'fx-report-page'].forEach(mid => { const el = document.getElementById(mid); if (el) el.style.display = 'none'; });

        // Pages opened from You, including View Channel, appear directly without sliding.
        if ((activeTab === 'you' && activePage) || activePage === 'view-channel-page') {
            const directPage = document.getElementById(activePage);
            if (directPage) directPage.classList.add('you-direct-page');
        }

        // Keep the global bottom navigation visible and tappable only on View Channel.
        if (activePage === 'view-channel-page' && globalBottomNav) {
            globalBottomNav.classList.add('view-channel-visible');
        }

        document.querySelectorAll('.tab-content, .nav-item').forEach(el => el.classList.remove('active'));
        const tabEl = document.getElementById(`${activeTab}-tab`);
        const navEl = document.getElementById(`nav-${activeTab}`);
        // A fullscreen sub-page must cover the active tab immediately, even
        // while a premium service page is being fetched/created asynchronously.
        // Otherwise the previous You page briefly shows behind the destination.
        const _keepTabUnder = (activePage === 'full-movie-page' && activeTab !== 'feels');
        if (tabEl && (!activePage || _keepTabUnder)) {
            // Coming back from the Play Page / Feels: show the tab without replaying its fade-in
            if (!activePage && (this._viewPage === 'full-movie-page' || this._viewTab === 'feels') && this._mem[newViewKey]) {
                tabEl.style.animationDuration = '0s';
                setTimeout(() => { tabEl.style.animationDuration = ''; }, 480);
            }
            tabEl.classList.add('active');
        }
        if (navEl) navEl.classList.add('active');

        // Feels is always dark: the bottom navigation turns dark there (even in Light theme)
        // and returns to the selected theme as soon as the user leaves Feels / presses Back.
        feelsApplyDarkNav(activeTab === 'feels');

        adjustHeaderForActiveTab(activeTab);

        // The bottom navigation may follow scroll only on Home. Notify the
        // scroll controller immediately when the active tab changes.
        window.dispatchEvent(new Event('flaynity-tab-changed'));

        if (activeTab === 'you') initYouTabUI();
        // Opening/closing a Comment or Download modal must never rebuild the
        // Feels swiper. Rebuilding replaces the DOM and makes the current Feels
        // disappear or jump to another item. Build only when the Feels DOM is
        // actually missing (for example, the first time the tab is opened).
        if (activeTab === 'feels') {
            const feelsContainer = document.getElementById('feels-swiper-container');
            if (feelsContainer && !feelsContainer.querySelector('.short-slide')) {
                buildFeelsPage();
            }
        }

        if (activePage) {
            if (activePage === 'full-movie-page') {
                clearTimeout(this._mvTimer);
                if (moviePage) { moviePage.classList.remove('wp-closing'); moviePage.style.display = 'block'; }
                document.body.style.overflow = 'hidden';
            } else {
                const targetId = this._pid(activePage);
                const pageEl = document.getElementById(targetId);
                if (pageEl) pageEl.style.display = 'flex';
                else {
                    const premiumId = Object.keys(PREMIUM_SERVICE_FILES).find(id => id + '-page' === targetId);
                    if (premiumId) __flaynityOpenPremiumService(premiumId);
                }
            }
        } else {
            document.body.style.overflow = 'auto';
            try { lvCancelAd(); } catch (e) {}
            try { if (flyLandscape) flySetLandscape(false); } catch (e) {}
            const container = document.getElementById('video-player-container');
            if (container) {
                const oldFlyVid = container.querySelector('#fly-video');
                if (oldFlyVid) flaynityDestroyHls(oldFlyVid);
                container.innerHTML = '';
            }
            if (!activeModals.includes('comment-modal')) {
                if (activeStatsRef) { activeStatsRef.off(); activeStatsRef = null; }
                if (activeCommentsRef) { activeCommentsRef.off(); activeCommentsRef = null; }
            }
        }

        activeModals.forEach(modalId => {
            const el = document.getElementById(modalId);
            if (el) {
                if (modalId === 'theme-popup-menu') {
                    el.style.display = 'flex';
                } else if (modalId === 'full-image-preview-overlay') {
                    el.style.display = 'flex';
                    document.body.style.overflow = 'hidden';
                } else {
                    el.style.display = 'flex';
                }
            }
        });
        if (typeof fbcmRestoreScroll === 'function') fbcmRestoreScroll();

        // Upload studio lives in the back stack: stop the camera when it is covered / closed,
        // and bring the previous screen (camera / media picker) back when it is shown again.
        try {
            if (activePage === 'premium-upload-studio') { if (typeof window.__uploadStudioShown === 'function') window.__uploadStudioShown(); }
            else if (typeof window.__uploadStudioHidden === 'function') window.__uploadStudioHidden();
        } catch (e) {}

        // Come back to exactly where the user was (Home feed, Play Page, any page).
        this._view = newViewKey; this._viewTab = activeTab; this._viewPage = activePage;
        if (this._fresh) { delete this._mem[newViewKey]; this._fresh = false; }
        const rec = this._mem[newViewKey];
        if (rec) this._restoreRec(rec, activePage, newViewKey);
    },

    updateBridge: function() {
        const hasHistory = this.stack.length > 1;
        if (window.AndroidBridge && typeof window.AndroidBridge.setBackStackStatus === 'function') {
            window.AndroidBridge.setBackStackStatus(hasHistory);
        }
    }
};

// Keep the last real Home scroll position (used if the page collapses before we can read it).
window.addEventListener('scroll', function () {
    try {
        if (AppNavigation._restoring || AppNavigation._view !== 'home|' || !AppNavigation._homeVisible()) return;
        AppNavigation._homeY = window.pageYOffset || document.documentElement.scrollTop || 0;
    } catch (e) {}
}, { passive: true });

function executeBackAction() {
    { const _lp = document.getElementById('vf-legal-page'); if (_lp && _lp.classList.contains('open') && typeof window.vfCloseLegal === 'function') { window.vfCloseLegal(); return; } }
    { const _c = AppNavigation.current(); if (_c && _c.type === 'modal' && _c.id === 'fx-report-page' && typeof rpBack === 'function') { rpBack(); return; } }
    const ttF = document.getElementById('tt-foot'), ttM = document.getElementById('tt-comment-modal');
    if (ttF && ttM && ttM.style.display !== 'none' && ttF.classList.contains('open')) { ttCollapse(); return; }
    AppNavigation.pop();
}

// =========================================================
// MOVIE DETAILS, STATISTICS & COMMENTS
// =========================================================
async function openMoviePage(id, isTMDB = false) {
    hfMarkSeen(id);   // watched videos sink in the next random Home feed
    AppNavigation.rememberHome();   // save Home scroll BEFORE anything else happens
    playUI('click');
    if (!navigator.onLine) {
         showNotification("Offline. Cannot play Long Videos.", "error");
         return;
    }

    if (window.AndroidBridge && typeof window.AndroidBridge.showMovieClickInterstitial === 'function') {
        window.AndroidBridge.showMovieClickInterstitial(); 
    }

    if (activeStatsRef) { activeStatsRef.off(); activeStatsRef = null; }
    if (activeCommentsRef) { activeCommentsRef.off(); activeCommentsRef = null; }

    const playerContainer = document.getElementById('video-player-container');
    const skeleton = document.getElementById('video-player-skeleton');

    if (playerContainer) {
        playerContainer.style.display = 'none';
        playerContainer.innerHTML = '';
    }
    if (skeleton) skeleton.style.display = 'flex';
    const banner = document.getElementById('movie-detail-banner');
    if (banner) banner.style.display = 'block';

    if (isTMDB) {
        const res = await fetch(`${BASE_URL}/movie/${id}?append_to_response=videos&api_key=${API_KEY}`);
        const data = await res.json();
        let trailerKey = data.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key;
        currentActiveMovie = { 
            id: data.id, 
            title: data.title, 
            rating: data.vote_average?.toFixed(1) || "N/A", 
            releaseDate: data.release_date?.split('-')[0] || "N/A", 
            poster: IMG_URL + data.poster_path, 
            banner: BG_URL + (data.backdrop_path || data.poster_path), 
            videoLink: trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : null, 
            isTMDB: true 
        };
    } else {
        currentActiveMovie = allLongVideos.find(m => String(m.id) === String(id));
    }

    if(!currentActiveMovie) return;
    const bannerImg = document.getElementById('movie-detail-banner');
    const titleEl = document.getElementById('movie-detail-title');
    const handleEl = document.getElementById('movie-detail-channel-handle');

    if (bannerImg) bannerImg.src = currentActiveMovie.banner;
    if (titleEl) titleEl.innerText = currentActiveMovie.title;
    if (handleEl) handleEl.innerText = currentActiveMovie.username ? "@" + currentActiveMovie.username : "@flaynity";
    const _vb = document.getElementById('movie-verified-badge'); if (_vb) _vb.style.display = 'none';

    // Show the watch page before starting playback. Android WebView can reject
    // autoplay/play() when the video element is still inside a display:none page.
    wpNewRelatedSeed();   // fresh random 'up next' feed for every opened video
    delete _fxPlayLikeInit[currentActiveMovie.id];
    wpResetDetailsCard(currentActiveMovie);
    AppNavigation.pushPage('full-movie-page');
    const _mvPage = document.getElementById('full-movie-page');
    if (_mvPage) _mvPage.scrollTop = 0; // a new video always starts at the top

    // Let the first frames of the slide-up animation paint before the heavy player / data work starts,
    // so the page glides in smoothly (no jump / stutter).
    const _mv = currentActiveMovie;
    const _boot = () => {
        if (currentActiveMovie !== _mv) return;
        if (!AppNavigation.stack.some(i => i.id === 'full-movie-page')) return; // user already went back
        startVideoPlayer();
        registerViewAndListen(_mv.id);
        try { registerPostReactionsListener(String(_mv.id)); fxListenDislike(String(_mv.id)); } catch (e) {}
        loadChannelMetaForWatchPage(_mv.userId || _mv.channelId);
    };
    requestAnimationFrame(() => requestAnimationFrame(_boot));
}

// Clear the previous video's numbers so the details card never flashes old data.
function wpResetDetailsCard(m) {
    try {
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
        set('movie-like-count', '0');
        set('movie-comment-count', '0');
        set('movie-detail-views', '0');
        set('movie-detail-upload-time', (m && m.createdAt) ? wpShortTime(m.createdAt) : 'just now');
        const av = document.getElementById('movie-channel-avatar');
        if (av) av.removeAttribute('src');
        const sb = document.getElementById('movie-subscribe-btn');
        if (sb) { sb.innerText = 'Subscribe'; sb.style.background = ''; sb.style.color = ''; }
        const wb = document.querySelector('#full-movie-page .wp-badges');
        if (wb) { wb.innerHTML = ''; wb.id = 'post-top-emojis-' + String(m.id); } // painted by paintPostReactions()
        const lb = document.getElementById('movie-like-btn');
        if (lb) lb.classList.remove('active', 'wp-rx-on');
    } catch (e) {}
}
function wpOpenMenu(btn) {
    if (!currentActiveMovie) return;
    fxOpenVideoMenu(String(currentActiveMovie.id), btn);
}
function wpOpenReacted() {
    if (currentActiveMovie) openReactedPeoplePage(String(currentActiveMovie.id));
}

function startVideoPlayer() {
    if (!currentActiveMovie || !currentActiveMovie.videoLink) { showNotification("No playable links found.", "error"); return; }
    const link = currentActiveMovie.videoLink;
    const container = document.getElementById('video-player-container');
    const skeleton = document.getElementById('video-player-skeleton');
    const banner = document.getElementById('movie-detail-banner');

    if (banner) banner.style.display = 'none';
    if (skeleton) skeleton.style.display = 'none';
    if (!container) return;

    // Sticky player: status bar-এর ঠিক নিচে top-এ fixed থাকবে, নিচের অংশ scroll হবে
    const stage = container.parentElement;
    if (stage) { stage.style.position = 'sticky'; stage.style.top = '0'; stage.style.zIndex = '60'; }

    container.style.display = 'block';

    // Long-video ads: pre-roll first, the video starts only after the ad is finished / skipped
    const lvSessionId = lvBeginVideo();
    const beginPlayback = () => {
        if (lvSessionId !== lvSession) return;

        // YouTube/TMDB trailers → iframe (আগের মতোই, unchanged)
        if (link.includes('youtube.com') || link.includes('youtu.be')) {
            const ytId = extractVideoID(link);
            container.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1&modestbranding=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
            return;
        }

        // Flaynity CDN direct MP4 → custom YouTube-style player
        container.innerHTML = flyBuildPlayerHTML();
        flyInitPlayer(link);
    };
    lvRunPreroll(lvSessionId, beginPlayback);
}

function playNextRecommendedVideo() {
    const currentId = currentActiveMovie ? String(currentActiveMovie.id) : null;
    const availableVids = allLongVideos.filter(m => String(m.id) !== currentId);
    if (availableVids.length > 0) {
        // Play the first video of the random "up next" list that the watch page shows.
        let nextVid = null;
        for (const rid of _wpRelatedIds) {
            nextVid = availableVids.find(m => String(m.id) === rid);
            if (nextVid) break;
        }
        if (!nextVid) nextVid = wpOrderRelated(availableVids)[0];
        openMoviePage(nextVid.id, false);
        showNotification(`Autoplay: Playing ${nextVid.title}`, "success");
    }
}

function getRelativeTime(timestamp) {
    if (!timestamp) return "2 Days Ago";
    const now = Date.now();
    const diff = now - new Date(timestamp).getTime();
    
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just Now";
    if (mins < 60) return `${mins} Minutes Ago`;
    
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} Hour${hours > 1 ? 's' : ''} Ago`;
    
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} Day${days > 1 ? 's' : ''} Ago`;
    
    const months = Math.floor(days / 30);
    return `${months} Month${months > 1 ? 's' : ''} Ago`;
}

function formatCount(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
}

function extractVideoID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Short YouTube-style relative time for the watch page ("5h ago", "6mo ago").
function wpShortTime(timestamp) {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (!(mins >= 1)) return "just now";
    if (mins < 60) return mins + "m ago";
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + "h ago";
    const days = Math.floor(hours / 24);
    if (days < 7) return days + "d ago";
    if (days < 30) return Math.floor(days / 7) + "w ago";
    if (days < 365) return Math.floor(days / 30) + "mo ago";
    return Math.floor(days / 365) + "y ago";
}

// Records a view (one per viewer per content) + WHEN and FROM WHERE it happened (used by pages/analytics.html).
function flayViewSource(forced) {
    try {
        if (forced) return forced;
        if (window.__flaynityViewSource) { const x = window.__flaynityViewSource; window.__flaynityViewSource = null; return x; }
        const st = AppNavigation.stack, below = st[st.length - 2];
        if (!below) return 'other';
        if (below.type === 'page' && below.id === 'view-channel-page') return 'channel';
        if (below.type === 'tab') return below.id === 'you' ? 'channel' : (['home', 'discover', 'posts', 'feels'].includes(below.id) ? below.id : 'other');
    } catch (e) {}
    return 'other';
}
function flayTrackView(contentId, userId, forcedSource) {
    try {
        const base = db.ref(`movie_stats/${contentId}`);
        base.child(`views/${userId}`).set(true);
        base.child(`viewTimes/${userId}`).once('value', (snap) => {
            if (snap.exists()) return;
            base.child(`viewTimes/${userId}`).set(firebase.database.ServerValue.TIMESTAMP);
            base.child(`viewSources/${userId}`).set(flayViewSource(forcedSource));
        });
    } catch (e) {}
}

function registerViewAndListen(movieId) {
    const userId = auth.currentUser ? auth.currentUser.uid : 'anonymous';
    
    if (userId !== 'anonymous' && navigator.onLine) {
        flayTrackView(movieId, userId);
    }

    let uploadTimeText = "just now"; 
    if (currentActiveMovie && currentActiveMovie.createdAt) {
        uploadTimeText = wpShortTime(currentActiveMovie.createdAt);
    }
    const timeEl = document.getElementById('movie-detail-upload-time');
    if (timeEl) timeEl.innerText = uploadTimeText;

    if(!navigator.onLine) return;

    activeStatsRef = db.ref(`movie_stats/${movieId}`);
    let wpFirstStats = true;
    activeStatsRef.on('value', (snapshot) => {
        const stats = snapshot.val() || {};
        const viewsObj = stats.views || {};
        const likesObj = stats.likes || {};
        const dislikesObj = stats.dislikes || {};

        const totalViews = Object.keys(viewsObj).length;
        const totalLikes = Object.keys(likesObj).length;

        const viewsEl = document.getElementById('movie-detail-views');

        if (viewsEl) viewsEl.innerText = formatCount(totalViews);

        const uidNow = auth.currentUser ? auth.currentUser.uid : null;
        _fxMovieLikes[movieId] = likesObj;
        fxPaintPlayLikes(movieId);
        wpApplyReaction('movie-dislike-btn', !!(uidNow && dislikesObj[uidNow]), wpFirstStats);
        wpFirstStats = false;
    });

    activeCommentsRef = db.ref(`movie_comments/${movieId}`);
    activeCommentsRef.on('value', (snapshot) => {
        const commentsObj = snapshot.val() || {};
        const totalComments = Object.keys(commentsObj).length;
        
        const modalCommentCount = document.getElementById('modal-comment-count');
        if (modalCommentCount) modalCommentCount.innerText = totalComments;

        renderCommentList(commentsObj);
        updateCommentPreviewCard(commentsObj);
    });

    renderMovieWatchRecommendedFeed();
}

function loadChannelMetaForWatchPage(channelId) {
    if (!channelId || !navigator.onLine) return;
    const avatarImg = document.getElementById('movie-channel-avatar');
    const handleEl = document.getElementById('movie-detail-channel-handle');
    const fallbackAvatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=100&auto=format&fit=crop";

    db.ref(`channels/${channelId}`).on('value', (snap) => {
        const data = snap.val() || {};
        const apply = (profile) => {
            const p = profile || {};
            if (avatarImg) avatarImg.src = p.avatarUrl || p.photoURL || p.photoUrl || fallbackAvatar;
            if (handleEl && p.username) handleEl.innerText = "@" + String(p.username).replace(/^@/, "");
            const vb = document.getElementById('movie-verified-badge');
            if (vb && (p.verified || p.isVerified)) vb.style.display = 'inline-block';
        };
        apply(data);
        if (!data.avatarUrl && !data.photoURL && !data.photoUrl) {
            db.ref(`users/${channelId}`).once('value').then(s => apply(s.val() || {})).catch(()=>{});
        }
    });

    if (auth.currentUser) {
        db.ref(`subscribers/${channelId}/${auth.currentUser.uid}`).on('value', (snap) => {
            const btn = document.getElementById('movie-subscribe-btn');
            if (btn) {
                if (snap.exists()) {
                    btn.innerText = "Subscribed";
                    btn.style.background = "var(--border-color)";
                    btn.style.color = "var(--text-main)";
                } else {
                    btn.innerText = "Subscribe";
                    btn.style.background = "var(--text-main)";
                    btn.style.color = "var(--surface)";
                }
            }
        });
    }
}

async function toggleMovieChannelSubscribe() {
    playUI('click');
    if (!auth.currentUser) { showNotification("Please sign in to Subscribe", "error"); return; }
    if (!currentActiveMovie) return;
    const channelId = currentActiveMovie.userId || currentActiveMovie.channelId;
    if (channelId === auth.currentUser.uid) { showNotification("You cannot subscribe to your own channel!", "error"); return; }

    const userSubRef = db.ref(`subscribers/${channelId}/${auth.currentUser.uid}`);
    const channelSubCountRef = db.ref(`channels/${channelId}/subscribersCount`);

    userSubRef.once('value', async (snap) => {
        if (snap.exists()) {
            await userSubRef.remove();
            channelSubCountRef.transaction((currentCount) => {
                return (currentCount || 1) - 1;
            });
            showNotification("Unsubscribed from channel.", "success");
        } else {
            await userSubRef.set(firebase.database.ServerValue.TIMESTAMP);
            channelSubCountRef.transaction((currentCount) => {
                return (currentCount || 0) + 1;
            });
            showNotification("Subscribed to channel!", "success");
        }
    });
}

// Hold the Play Page like button => same emoji reaction picker as Community Posts.
function wpLikeRxStart(e) {
    if (!currentActiveMovie) return;
    startReactionTimer(String(currentActiveMovie.id), e);
}

function toggleMovieLike() {
    if (Date.now() < _rxSuppressClickUntil) return; // a long-press just picked a reaction
    playUI('click');
    if (!auth.currentUser) { showNotification("Please sign in to Like", "error"); return; }
    if (!currentActiveMovie) return;
    fxToggleVideoLike(currentActiveMovie.id, true);
}

function toggleMovieDislike() {
    playUI('click');
    if (!auth.currentUser) { showNotification("Please sign in to Dislike", "error"); return; }
    if (!currentActiveMovie) return;
    const userId = auth.currentUser.uid;
    const movieId = currentActiveMovie.id;
    
    const likeRef = db.ref(`movie_stats/${movieId}/likes/${userId}`);
    const dislikeRef = db.ref(`movie_stats/${movieId}/dislikes/${userId}`);
    
    dislikeRef.once('value', (snap) => {
        const had = snap.exists();
        const op = had
            ? dislikeRef.remove()
            : Promise.all([dislikeRef.set(true), likeRef.remove(), db.ref(`post_reactions/${movieId}/${userId}`).remove()]);
        op.catch(() => showNotification("Dislike update failed. Please try again.", "error"));
        if (had) fxClearDislikeFeedback(movieId, userId);
        else fxOpenDislikeSheet(movieId);
    });
}

function openCommentModal() {
    playUI('click');
    const _fbm = document.getElementById('comment-modal');
    const _fbOn = fbcmIsPostActive();
    if (_fbm) {
        _fbm.classList.toggle('fb-cm', _fbOn);
        if (_fbOn) {
            _fbm.classList.remove('opening');
            void _fbm.offsetWidth;
            _fbm.classList.add('opening');
            setTimeout(() => _fbm.classList.remove('opening'), 450);
        } else {
            _fbm.classList.remove('opening');
        }
    }
    if (_fbOn) fbcmInit();
    const currentU = auth.currentUser;
    const avatarEl = document.getElementById('comment-user-avatar');
    if (currentU && avatarEl && navigator.onLine) {
        db.ref(`users/${currentU.uid}`).once('value', (snap) => {
            const uData = snap.val();
            const photo = uData?.photoURL || currentU.photoURL || '';
            if (photo) {
                avatarEl.innerHTML = `<img src="${photo}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            } else {
                avatarEl.innerHTML = (currentU.email || 'U').charAt(0).toUpperCase();
            }
        });
    }
    AppNavigation.pushModal('comment-modal');
}

function closeCommentModal() {
    const _pid = currentActiveMovie && currentActiveMovie.id;
    const _wasPost = fbcmIsPostActive();
    fbcmDetach();
    if (activeCommentsRef) { try { activeCommentsRef.off(); } catch(e) {} activeCommentsRef = null; }
    if (_wasPost) fbcmRestoreCountListener(_pid);
    AppNavigation.pop();
}

function submitComment() {
    playUI('click');
    if (!auth.currentUser) { showNotification("Please log in to Comment", "error"); return; }
    const input = document.getElementById('comment-input');
    const text = input ? input.value.trim() : "";
    if (!text) return;

    const userId = auth.currentUser.uid;
    const movieId = currentActiveMovie.id;

    db.ref(`users/${userId}`).once('value', (snap) => {
        const uData = snap.val() || {};
        const username = uData.username || auth.currentUser.email.split('@')[0];
        const avatar = currentChannelData?.avatarUrl || currentChannelData?.photoURL || auth.currentUser.photoURL || "";

        const commentData = {
            uid: userId,
            username: username,
            avatar: avatar,
            text: text,
            timestamp: Date.now()
        };

        db.ref(`movie_comments/${movieId}`).push(commentData)
            .then(() => {
                if (input) input.value = "";

                // Update the open Feels comment UI immediately. The realtime
                // listener will reconcile this with Firebase as well.
                const cached = feelsCommentsCache[movieId] || {};
                const optimisticKey = `__pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                cached[optimisticKey] = commentData;
                feelsCommentsCache[movieId] = cached;
                renderCommentList(cached);
                const count = Object.keys(cached).length;
                const countEl = document.getElementById(`short-comments-count-${movieId}`);
                if (countEl) countEl.innerText = formatCount(count);
                const modalCount = document.getElementById('modal-comment-count');
                if (modalCount) modalCount.innerText = formatCount(count);
                showNotification("Comment posted!", "success");
            })
            .catch(err => { showNotification("Failed to post comment", "error"); });
    });
}


// =========================================================
// FACEBOOK-STYLE COMMENT SHEET (used for community posts)
// =========================================================
let _fbcmRef = null;
let _fbcmCb = null;

function fbcmDetach() {
    if (_fbcmRef && _fbcmCb) { try { _fbcmRef.off('value', _fbcmCb); } catch (e) {} }
    _fbcmRef = null; _fbcmCb = null;
}

// Always-on realtime listener for the comment sheet: every add / reply / edit / delete
// in Firebase Realtime Database is reflected here instantly (local writes fire immediately too).
function fbcmAttach(postId) {
    fbcmDetach();
    if (!postId || typeof db === 'undefined') return;
    _fbcmRef = db.ref(`movie_comments/${postId}`);
    _fbcmCb = (snap) => {
        if (!currentActiveMovie || String(currentActiveMovie.id) !== String(postId)) return;
        _fbcmData = snap.val() || {};
        _fbcmLoaded = true;
        const n = Object.keys(_fbcmData).length;
        const mc = document.getElementById('modal-comment-count'); if (mc) mc.innerText = n;
        fbcmRender();
    };
    _fbcmRef.on('value', _fbcmCb);
}

function fbcmRestoreCountListener(postId) {
    // closing the sheet calls ref.off() on this path, which also removes the feed's comment-count listener
    if (!postId || typeof _postReactionCache === 'undefined' || !_postReactionCache[postId]) return;
    db.ref(`movie_comments/${postId}`).on('value', (snapshot) => {
        _postReactionCache[postId].commentCount = Object.keys(snapshot.val() || {}).length;
        if (typeof paintPostReactions === 'function') paintPostReactions(postId);
    });
}

let _fbcmData = {};
let _fbcmLoaded = false;
let _fbcmOpen = new Set();
let _fbcmScrollTop = 0;
let _fbcmSort = 'relevant';
let _fbcmReply = null;
const _FBCM_LABELS = { relevant: 'Most relevant', newest: 'Newest', all: 'All comments' };
function fbcmReactMap(c) {
    const m = {};
    Object.keys(c.likes || {}).forEach(u => { m[u] = 'like'; });
    Object.keys(c.reacts || {}).forEach(u => { if (c.reacts[u]) m[u] = c.reacts[u]; });
    return m;
}
let _fbcmHidden = new Set((() => { try { return JSON.parse(localStorage.getItem('fbcm_hidden') || '[]'); } catch (e) { return []; } })());
const FBCM_UP = (on) => `<svg viewBox="0 0 24 24"><path d="${on ? 'M3,11h3v10H3V11z M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11v10h10.43c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z' : 'M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11H3v10h4h1h9.43c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z M7,20H4v-8h3V20z M19.98,13.17l-1.34,6C18.54,19.65,18.03,20,17.43,20H8v-8.61l5.6-6.06C13.79,5.12,14.08,5,14.38,5c0.26,0,0.5,0.11,0.63,0.3c0.07,0.1,0.15,0.26,0.09,0.47l-1.52,4.94L13.18,12h1.35h4.23c0.41,0,0.8,0.17,1.03,0.46C19.92,12.61,20.05,12.86,19.98,13.17z'}"/></svg>`;
const FBCM_DOWN = (on) => `<svg viewBox="0 0 24 24"><g transform="rotate(180 12 12)"><path d="${on ? 'M3,11h3v10H3V11z M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11v10h10.43c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z' : 'M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11H3v10h4h1h9.43c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z M7,20H4v-8h3V20z M19.98,13.17l-1.34,6C18.54,19.65,18.03,20,17.43,20H8v-8.61l5.6-6.06C13.79,5.12,14.08,5,14.38,5c0.26,0,0.5,0.11,0.63,0.3c0.07,0.1,0.15,0.26,0.09,0.47l-1.52,4.94L13.18,12h1.35h4.23c0.41,0,0.8,0.17,1.03,0.46C19.92,12.61,20.05,12.86,19.98,13.17z'}"/></g></svg>`;

function fbcmSkeletonHTML() {
    const w = [55, 34, 45, 45, 34, 34, 45, 55];
    return w.map(x => `<div class="fbcm-sk"><i></i><b style="width:${x}%"></b></div>`).join('');
}

function fbcmIsPostActive() {
    return !!(currentActiveMovie && typeof allCommunityPosts !== 'undefined' &&
        allCommunityPosts.some(p => String(p.id) === String(currentActiveMovie.id)));
}

function fbcmInit() {
    _fbcmReply = null;
    _fbcmEdit = null;
    { const eb = document.getElementById('fbcm-editbar'); if (eb) eb.style.display = 'none'; }
    _fbcmData = {};
    _fbcmLoaded = false;
    _fbcmOpen = new Set();
    _fbcmScrollTop = 0;
    const _lc = document.getElementById('comment-list-container');
    if (_lc) {
        _lc.innerHTML = fbcmSkeletonHTML();
        if (!_lc._fbLP) { _lc._fbLP = true; fbcmBindLongPress(_lc); }
        if (!_lc._fbScroll) { _lc._fbScroll = true; _lc.addEventListener('scroll', () => { _fbcmScrollTop = _lc.scrollTop; }, { passive: true }); }
    }
    const rb = document.getElementById('fbcm-replybar'); if (rb) rb.style.display = 'none';
    const mn = document.getElementById('fbcm-mention'); if (mn) mn.style.display = 'none';
    const inp = document.getElementById('fbcm-input'); if (inp) inp.value = '';
    fbcmOnInput();
    const lbl = document.getElementById('fbcm-sort-label'); if (lbl) lbl.innerText = _FBCM_LABELS[_fbcmSort];
    fbcmPaintHead(currentActiveMovie && currentActiveMovie.id);
    if (inp) {
        inp.placeholder = 'Comment';
        const u = auth.currentUser;
        if (u) {
            const fallback = (u.email || '').split('@')[0] || 'User';
            inp.placeholder = 'Comment as ' + fallback;
            if (navigator.onLine) db.ref(`users/${u.uid}`).once('value', (snap) => {
                const d = snap.val() || {};
                const el = document.getElementById('fbcm-input');
                if (el) el.placeholder = 'Comment as ' + (d.username || d.displayName || fallback);
            });
        }
    }
    if (currentActiveMovie) fbcmAttach(currentActiveMovie.id);
    const modal = document.getElementById('comment-modal');
    if (modal && !modal._fbSwipe) {
        modal._fbSwipe = true;
        setTimeout(() => setupSwipeToClose(modal, 'fbcm-drag-handle', closeCommentModal), 50);
    }
}

function fbcmPaintHead(postId) {
    if (!postId || !currentActiveMovie || String(currentActiveMovie.id) !== String(postId)) return;
    const badges = document.getElementById('fbcm-badges');
    const cnt = document.getElementById('fbcm-react-count');
    if (!badges || !cnt) return;
    const reactions = (typeof _postReactionCache !== 'undefined' && _postReactionCache[postId] && _postReactionCache[postId].reactions) || {};
    const counts = {};
    Object.values(reactions).forEach(r => { if (r && r.type) counts[r.type] = (counts[r.type] || 0) + 1; });
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
    badges.innerHTML = fbReactionBadgesHTML(top);
    cnt.innerText = Object.keys(reactions).length ? formatCount(Object.keys(reactions).length) : '';
}

function fbcmOpenReacted() {
    if (!currentActiveMovie) return;
    const reactions = (typeof _postReactionCache !== 'undefined' && _postReactionCache[currentActiveMovie.id] && _postReactionCache[currentActiveMovie.id].reactions) || {};
    if (!Object.keys(reactions).length) return;
    openReactedPeoplePage(currentActiveMovie.id);
}

function fbcmOnInput() {
    const inp = document.getElementById('fbcm-input');
    const pill = document.getElementById('fbcm-pill');
    if (pill) pill.classList.toggle('has-text', !!(inp && inp.value.trim()));
}

function fbcmAddEmoji(em) {
    playUI('click');
    const inp = document.getElementById('fbcm-input');
    if (!inp) return;
    inp.value += em;
    fbcmOnInput();
}

function fbcmRender(popKey, popType) {
    const container = document.getElementById('comment-list-container');
    if (!container) return;
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    const entries = Object.keys(_fbcmData || {}).map(k => Object.assign({ _k: k }, _fbcmData[k])).filter(c => c && c.text !== undefined && !_fbcmHidden.has(c._k));

    const countEl = document.getElementById('fbcm-comment-count');
    if (countEl) countEl.innerText = entries.length + (entries.length === 1 ? ' comment' : ' comments');

    if (!_fbcmLoaded) { container.innerHTML = fbcmSkeletonHTML(); return; }

    if (entries.length === 0) {
        container.innerHTML = `<div class="fbcm-empty">No comments yet. Be the first to comment!</div>`;
        return;
    }

    const keys = new Set(entries.map(c => c._k));
    const top = entries.filter(c => !c.parentId || !keys.has(c.parentId));
    const kids = {};
    entries.filter(c => c.parentId && keys.has(c.parentId)).forEach(c => { (kids[c.parentId] = kids[c.parentId] || []).push(c); });
    Object.values(kids).forEach(a => a.sort((x, y) => (x.timestamp || 0) - (y.timestamp || 0)));

    const likesOf = c => Object.keys(fbcmReactMap(c)).length;
    if (_fbcmSort === 'newest') top.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    else if (_fbcmSort === 'all') top.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    else top.sort((a, b) => ((likesOf(b) * 3 + (kids[b._k] || []).length) - (likesOf(a) * 3 + (kids[a._k] || []).length)) || ((b.timestamp || 0) - (a.timestamp || 0)));

    const row = (c, isReply) => {
        const initial = (c.username || 'U').charAt(0).toUpperCase();
        const av = c.avatar ? `<img class="fbcm-av" src="${escapeHTML(c.avatar)}" alt="">` : `<div class="fbcm-av" style="background:linear-gradient(135deg,var(--primary),#FF7A00)">${escapeHTML(initial)}</div>`;
        const rm = fbcmReactMap(c);
        const lc = Object.keys(rm).length;
        const myR = uid ? (rm[uid] || null) : null;
        const tcount = {};
        Object.values(rm).forEach(t => { tcount[t] = (tcount[t] || 0) + 1; });
        const topT = Object.keys(tcount).sort((a, b) => tcount[b] - tcount[a]).slice(0, 3);
        const likeIcon = !myR ? FBCM_UP(false) : (myR === 'like' ? FBCM_UP(true) : `<span class="rx-ico">${fbRxSvg(myR)}</span>`);
        const nk = isReply ? 0 : (kids[c._k] || []).length;
        const isOpen = _fbcmOpen.has(c._k);
        const liked = !!myR;
        const disliked = !!(uid && c.dislikes && c.dislikes[uid]);
        const hl = _fbcmReply && _fbcmReply.target === c._k ? ' hl' : '';
        const mention = c.replyToName ? `<span class="fbcm-m">${escapeHTML(c.replyToName)}</span> ` : '';
        return `
        <div class="fbcm-c${isReply ? ' reply' : ''}${hl}" data-k="${c._k}">
            ${av}
            <div class="fbcm-body">
                <div class="fbcm-meta"><b>${escapeHTML(c.username || 'User')}</b><span>·</span><span>${fbTimeShort(c.timestamp)}</span>${c.edited ? '<span>· Edited</span>' : ''}</div>
                <div class="fbcm-text">${mention}${escapeHTML(c.text)}</div>
                <div class="fbcm-acts">
                    <button class="fbcm-reply" onclick="fbcmReply('${c._k}')">Reply</button>
                    ${lc > 0 ? `<span class="fbcm-chip"><span class="fbcm-cb">${topT.map((t, ix) => `<i style="z-index:${5 - ix}">${fbRxSvg(t)}</i>`).join('')}</span>${lc}</span>` : ''}
                    <span class="fbcm-sp"></span>
                    <button class="fbcm-ic fbcm-like post-action-btn-fb${liked ? ' on' : ''}" ontouchstart="startReactionTimer('${c._k}', event, 'comment')" onmousedown="startReactionTimer('${c._k}', event, 'comment')" ontouchend="clearReactionTimer()" onmouseup="clearReactionTimer()" oncontextmenu="return false" onclick="fbcmLikeTap('${c._k}')" aria-label="React">${likeIcon}</button>
                    <button class="fbcm-ic fbcm-dis${disliked ? ' on' : ''}" onclick="fbcmDislike('${c._k}')" aria-label="Dislike">${FBCM_DOWN(disliked)}</button>
                </div>
                ${nk ? `<button class="fbcm-vr" onclick="fbcmToggleReplies('${c._k}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="${isOpen ? 'up' : ''}"><path d="M5 9l7 7 7-7"/></svg>${isOpen ? 'Hide replies' : `View ${nk} ${nk === 1 ? 'reply' : 'replies'}`}</button>` : ''}
            </div>
        </div>`;
    };

    const prevScroll = container.scrollTop;
    container.innerHTML = top.map(c => row(c, false) + (_fbcmOpen.has(c._k) ? (kids[c._k] || []).map(r => row(r, true)).join('') : '')).join('');
    container.scrollTop = prevScroll;

    if (popKey) {
        const b = container.querySelector(`[data-k="${popKey}"] .${popType === 'likes' ? 'fbcm-like' : 'fbcm-dis'}`);
        if (b) { b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 500); }
    }
}

function fbcmToggleReplies(key) {
    playUI('click');
    if (_fbcmOpen.has(key)) _fbcmOpen.delete(key); else _fbcmOpen.add(key);
    fbcmRender();
}

function fbcmSetReaction(key, type) {
    if (!auth.currentUser) { showNotification('Please sign in to react', 'error'); return; }
    if (!currentActiveMovie) return;
    const uid = auth.currentUser.uid;
    const c = _fbcmData[key];
    if (!c) return;
    c.reacts = c.reacts || {};
    if (c.likes) delete c.likes[uid];
    if (c.dislikes) delete c.dislikes[uid];
    if (type) c.reacts[uid] = type; else delete c.reacts[uid];
    fbcmRender(type ? key : null, 'likes');
    const upd = {};
    upd[`reacts/${uid}`] = type || null;
    upd[`likes/${uid}`] = null;
    if (type) upd[`dislikes/${uid}`] = null;
    db.ref(`movie_comments/${currentActiveMovie.id}/${key}`).update(upd)
        .catch(() => showNotification('Could not update reaction', 'error'));
}

function fbcmLikeTap(key) {
    if (Date.now() < _rxSuppressClickUntil) return;
    playUI('click');
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
    const c = _fbcmData[key];
    if (!c || !auth.currentUser) { if (!auth.currentUser) showNotification('Please sign in to react', 'error'); return; }
    const mine = fbcmReactMap(c)[auth.currentUser.uid];
    fbcmSetReaction(key, mine ? null : 'like');
}

function fbcmDislike(key) {
    playUI('click');
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
    if (!auth.currentUser) { showNotification('Please sign in to react', 'error'); return; }
    if (!currentActiveMovie) return;
    const uid = auth.currentUser.uid;
    const c = _fbcmData[key];
    if (!c) return;
    const had = !!(c.dislikes && c.dislikes[uid]);
    c.dislikes = c.dislikes || {};
    const upd = {};
    if (had) { delete c.dislikes[uid]; upd[`dislikes/${uid}`] = null; }
    else {
        c.dislikes[uid] = true;
        if (c.reacts) delete c.reacts[uid];
        if (c.likes) delete c.likes[uid];
        upd[`dislikes/${uid}`] = true; upd[`reacts/${uid}`] = null; upd[`likes/${uid}`] = null;
    }
    fbcmRender(had ? null : key, 'dislikes');
    db.ref(`movie_comments/${currentActiveMovie.id}/${key}`).update(upd)
        .catch(() => showNotification('Could not update reaction', 'error'));
}

// ---------- long-press actions sheet ----------
let _fbcmActKey = null;
let _fbcmLPUntil = 0;
const FBCM_ICONS = {
    report: '<svg viewBox="0 0 24 24"><path d="M5 3h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4.5V5a2 2 0 0 1 1-2z"/><path d="M12 7v4"/><path d="M12 13.4v.1"/></svg>',
    reply: '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><path d="M9 3h7l4 4v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M16 3v4h4"/><path d="M4.5 8v11a2 2 0 0 0 2 2H15"/></svg>',
    hide: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3.5"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17l-1 3z"/><path d="M14.5 7.5l3 3"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>'
};

function fbcmBindLongPress(container) {
    let timer = null, sx = 0, sy = 0, key = null, lastOpen = 0;
    const cancel = () => { clearTimeout(timer); timer = null; };
    const open = (k) => {
        if (!k || Date.now() - lastOpen < 800) return;
        lastOpen = Date.now();
        cancel();
        fbcmOpenActions(k);
    };
    container.addEventListener('touchstart', (e) => {
        const row = e.target.closest && e.target.closest('.fbcm-c');
        if (!row || e.target.closest('button') || (e.touches && e.touches.length > 1)) return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; key = row.dataset.k;
        cancel();
        timer = setTimeout(() => { timer = null; open(key); }, 400);
    }, { passive: true });
    container.addEventListener('touchmove', (e) => {
        if (!timer) return;
        const t = e.touches[0];
        if (Math.hypot(t.clientX - sx, t.clientY - sy) > 12) cancel();
    }, { passive: true });
    container.addEventListener('touchend', cancel, { passive: true });
    // Android WebView fires touchcancel when its native long-press starts, so it must not cancel the timer.
    // Real scrolls are already handled by touchmove above.
    container.addEventListener('scroll', cancel, { passive: true });
    // Fallback: native long-press / right-click opens the same sheet.
    container.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const row = e.target.closest && e.target.closest('.fbcm-c');
        if (row && !e.target.closest('button')) open(row.dataset.k);
    });
    // Desktop: mouse hold
    container.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const row = e.target.closest && e.target.closest('.fbcm-c');
        if (!row || e.target.closest('button')) return;
        const k = row.dataset.k;
        cancel();
        timer = setTimeout(() => { timer = null; open(k); }, 450);
    });
    container.addEventListener('mouseup', cancel);
    container.addEventListener('mouseleave', cancel);
}

function fbcmOpenActions(key) {
    const c = _fbcmData[key];
    if (!c) return;
    try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) {}
    _fbcmActKey = key;
    _fbcmLPUntil = Date.now() + 500;
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    const mine = uid ? fbcmReactMap(c)[uid] : null;
    const order = ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'];
    const em = document.getElementById('fbcm-act-emojis');
    if (em) em.innerHTML = order.map((t, i) => `<div class="fbcm-aem${mine === t ? ' cur' : ''}" style="--i:${i}" onclick="fbcmActReact('${t}')">${fbRxSvg(t)}</div>`).join('');
    const isOwn = !!(uid && c.uid === uid);
    const items = isOwn ? [
        ['reply', 'Reply', 'fbcmActReply()'],
        ['copy', 'Copy', 'fbcmActCopy()'],
        ['del', 'Delete', 'fbcmActDelete()'],
        ['edit', 'Edit', 'fbcmActEdit()']
    ] : [
        ['report', 'Report comment', 'fbcmActReport()'],
        ['reply', 'Reply', 'fbcmActReply()'],
        ['copy', 'Copy', 'fbcmActCopy()'],
        ['hide', 'Hide comment', 'fbcmActHide()']
    ];
    const list = document.getElementById('fbcm-act-list');
    if (list) list.innerHTML = items.map(it => `<div class="fbcm-ai" onclick="${it[2]}">${FBCM_ICONS[it[0]]}<span>${it[1]}</span></div>`).join('');
    AppNavigation.pushModal('fbcm-actions-sheet');
}

function fbcmCloseActions() {
    if (Date.now() < _fbcmLPUntil) return;
    const c = AppNavigation.current();
    if (c && c.type === 'modal' && c.id === 'fbcm-actions-sheet') AppNavigation.pop();
}

function fbcmActDone() {
    _fbcmLPUntil = 0;
    fbcmCloseActions();
}

function fbcmActReact(type) {
    playUI('click');
    const k = _fbcmActKey;
    fbcmActDone();
    if (k) fbcmSetReaction(k, type);
}

function fbcmActReply() {
    const k = _fbcmActKey;
    fbcmActDone();
    if (k) setTimeout(() => fbcmReply(k), 30);
}

function fbcmActCopy() {
    const c = _fbcmData[_fbcmActKey];
    fbcmActDone();
    if (!c) return;
    const text = String(c.text || '');
    const done = () => showNotification('Copied', 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => { fbcmLegacyCopy(text); done(); });
    } else { fbcmLegacyCopy(text); done(); }
}

function fbcmLegacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
}

function fbcmActHide() {
    const k = _fbcmActKey;
    fbcmActDone();
    if (!k) return;
    _fbcmHidden.add(k);
    try { localStorage.setItem('fbcm_hidden', JSON.stringify(Array.from(_fbcmHidden))); } catch (e) {}
    fbcmRender();
    showNotification('Comment hidden', 'success');
}

function fbcmActDelete() {
    const k = _fbcmActKey;
    fbcmActDone();
    if (!k || !currentActiveMovie) return;
    db.ref(`movie_comments/${currentActiveMovie.id}/${k}`).remove()
        .then(() => showNotification('Comment deleted', 'success'))
        .catch(() => showNotification('Could not delete comment', 'error'));
}

let _fbcmEdit = null;

function fbcmActEdit() {
    const k = _fbcmActKey;
    fbcmActDone();
    const c = _fbcmData[k];
    if (!k || !c || !auth.currentUser || c.uid !== auth.currentUser.uid) return;
    setTimeout(() => {
        if (_fbcmReply) fbcmCancelReply();
        _fbcmEdit = { key: k };
        const eb = document.getElementById('fbcm-editbar'); if (eb) eb.style.display = 'block';
        const inp = document.getElementById('fbcm-input');
        if (inp) { inp.value = c.text || ''; inp.focus(); }
        fbcmOnInput();
    }, 30);
}

function fbcmCancelEdit() {
    playUI('click');
    _fbcmEdit = null;
    const eb = document.getElementById('fbcm-editbar'); if (eb) eb.style.display = 'none';
    const inp = document.getElementById('fbcm-input'); if (inp) inp.value = '';
    fbcmOnInput();
}

function fbcmActReport() {
    const k = _fbcmActKey;
    fbcmActDone();
    if (!k || !currentActiveMovie) return;
    if (auth.currentUser) {
        db.ref(`comment_reports/${currentActiveMovie.id}/${k}/${auth.currentUser.uid}`).set(Date.now()).catch(() => {});
    }
    showNotification("Thanks for letting us know", 'success');
}

function fbcmReply(key) {
    playUI('click');
    const c = _fbcmData[key];
    if (!c) return;
    if (_fbcmEdit) { _fbcmEdit = null; const eb = document.getElementById('fbcm-editbar'); if (eb) eb.style.display = 'none'; const i0 = document.getElementById('fbcm-input'); if (i0) i0.value = ''; fbcmOnInput(); }
    const parent = c.parentId && _fbcmData[c.parentId] ? c.parentId : key;
    _fbcmReply = { target: key, parent, name: c.username || 'User', mention: true };
    _fbcmOpen.add(parent);
    const rb = document.getElementById('fbcm-replybar'); if (rb) rb.style.display = 'block';
    const rn = document.getElementById('fbcm-reply-name'); if (rn) rn.innerText = _fbcmReply.name;
    const mn = document.getElementById('fbcm-mention'); if (mn) { mn.innerHTML = escapeHTML(_fbcmReply.name) + '<i class="fbcm-x">✕</i>'; mn.style.display = 'inline-flex'; }
    fbcmRender();
    const inp = document.getElementById('fbcm-input'); if (inp) inp.focus();
}

function fbcmRemoveMention() {
    if (!_fbcmReply || !_fbcmReply.mention) return;
    playUI('click');
    _fbcmReply.mention = false;
    const mn = document.getElementById('fbcm-mention'); if (mn) mn.style.display = 'none';
    const inp = document.getElementById('fbcm-input'); if (inp) inp.focus();
}

function fbcmKey(e) {
    if (e.key === 'Backspace' && !e.target.value && _fbcmReply && _fbcmReply.mention) { e.preventDefault(); fbcmRemoveMention(); }
}

function fbcmBefore(e) {
    if (e.inputType === 'deleteContentBackward' && !e.target.value && _fbcmReply && _fbcmReply.mention) { e.preventDefault(); fbcmRemoveMention(); }
}

function fbcmCancelReply() {
    playUI('click');
    _fbcmReply = null;
    const rb = document.getElementById('fbcm-replybar'); if (rb) rb.style.display = 'none';
    const mn = document.getElementById('fbcm-mention'); if (mn) mn.style.display = 'none';
    fbcmRender();
}

function fbcmSubmit() {
    playUI('click');
    if (!auth.currentUser) { showNotification('Please log in to Comment', 'error'); return; }
    if (!currentActiveMovie) return;
    const inp = document.getElementById('fbcm-input');
    const text = inp ? inp.value.trim() : '';
    if (!text) return;
    const userId = auth.currentUser.uid;
    const postId = currentActiveMovie.id;
    const reply = _fbcmReply;

    if (_fbcmEdit) {
        const ek = _fbcmEdit.key;
        const old = _fbcmData[ek];
        if (!old || old.uid !== userId) { fbcmCancelEdit(); return; }
        if (text === old.text) { fbcmCancelEdit(); return; }
        db.ref(`movie_comments/${postId}/${ek}`).update({ text, edited: true, editedAt: Date.now() })
            .then(() => {
                _fbcmEdit = null;
                const eb = document.getElementById('fbcm-editbar'); if (eb) eb.style.display = 'none';
                const el = document.getElementById('fbcm-input'); if (el) el.value = '';
                fbcmOnInput();
            })
            .catch(() => showNotification('Failed to edit comment', 'error'));
        return;
    }

    db.ref(`users/${userId}`).once('value', (snap) => {
        const uData = snap.val() || {};
        const username = uData.username || (auth.currentUser.email || 'user').split('@')[0];
        const avatar = (typeof currentChannelData !== 'undefined' && currentChannelData && (currentChannelData.avatarUrl || currentChannelData.photoURL)) || uData.photoURL || auth.currentUser.photoURL || '';
        const data = { uid: userId, username, avatar, text, timestamp: Date.now() };
        if (reply) { data.parentId = reply.parent; if (reply.mention) data.replyToName = reply.name; _fbcmOpen.add(reply.parent); }
        db.ref(`movie_comments/${postId}`).push(data)
            .then(() => {
                const el = document.getElementById('fbcm-input');
                if (el) el.value = '';
                fbcmOnInput();
                fbcmCancelReply();
            })
            .catch(() => showNotification('Failed to post comment', 'error'));
    });
}

function fbcmOpenSort() {
    playUI('click');
    document.querySelectorAll('#fbcm-sort-sheet .fbcm-opt').forEach(o => o.classList.toggle('sel', o.dataset.k === _fbcmSort));
    AppNavigation.pushModal('fbcm-sort-sheet');
    fbcmRestoreScroll();
}

function fbcmRestoreScroll() {
    const lc = document.getElementById('comment-list-container');
    const cm = document.getElementById('comment-modal');
    if (!lc || !cm || !cm.classList.contains('fb-cm') || cm.style.display !== 'flex') return;
    const y = _fbcmScrollTop;
    requestAnimationFrame(() => { lc.scrollTop = y; });
    setTimeout(() => { lc.scrollTop = y; }, 60);
}

function fbcmCloseSort() {
    const c = AppNavigation.current();
    if (c && c.type === 'modal' && c.id === 'fbcm-sort-sheet') AppNavigation.pop();
    fbcmRestoreScroll();
}

function fbcmSetSort(k) {
    playUI('click');
    _fbcmSort = k;
    const lbl = document.getElementById('fbcm-sort-label'); if (lbl) lbl.innerText = _FBCM_LABELS[k];
    document.querySelectorAll('#fbcm-sort-sheet .fbcm-opt').forEach(o => o.classList.toggle('sel', o.dataset.k === k));
    fbcmRender();
    setTimeout(fbcmCloseSort, 160);
}

function renderCommentList(commentsObj) {
    if (fbcmIsPostActive()) { _fbcmData = commentsObj || {}; _fbcmLoaded = true; fbcmRender(); return; }
    const container = document.getElementById('comment-list-container');
    if (!container) return;

    const comments = Object.values(commentsObj || {}).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (comments.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted); margin-top:40px;">No comments yet. Be the first to comment!</p>`;
        return;
    }

    container.innerHTML = comments.map(c => {
        const initial = c.username ? c.username.charAt(0).toUpperCase() : 'U';
        const avatarHTML = c.avatar 
            ? `<img src="${c.avatar}" style="width:34px; height:34px; border-radius:50%; object-fit:cover; flex-shrink: 0;">` 
            : `<div class="header-avatar" style="width:34px; height:34px; font-size:0.8rem; background:linear-gradient(135deg, var(--primary), #FF7A00); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink: 0;">${initial}</div>`;
        
        return `
            <div style="display:flex; gap:12px; margin-bottom:16px; align-items:flex-start;">
                ${avatarHTML}
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:0.85rem; font-weight:700; color:var(--text-main);">@${c.username}</span>
                        <span style="font-size:0.75rem; color:var(--text-muted);">${getRelativeTime(c.timestamp)}</span>
                    </div>
                    <p style="font-size:0.9rem; color:var(--text-main); margin:4px 0 0 0; line-height:1.4;">${escapeHTML(c.text)}</p>
                </div>
            </div>
        `;
    }).join('');
}

function updateCommentPreviewCard(commentsObj) {
    const countEl = document.getElementById('comment-preview-count');
    const avatarEl = document.getElementById('comment-preview-avatar');
    const textEl = document.getElementById('comment-preview-text');

    const comments = Object.values(commentsObj).sort((a,b) => b.timestamp - a.timestamp);
    
    if (countEl) countEl.innerText = formatCount(comments.length);
    const _mcc = document.getElementById('movie-comment-count');
    if (_mcc) _mcc.innerText = formatCount(comments.length);

    if (comments.length === 0) {
        if (avatarEl) avatarEl.innerHTML = '<i class="far fa-comment" style="color: var(--text-muted);"></i>';
        if (textEl) textEl.innerText = "No comments yet. Tap to start the conversation!";
        return;
    }

    const lastComment = comments[0];
    if (avatarEl) {
        if (lastComment.avatar) {
            avatarEl.innerHTML = `<img src="${lastComment.avatar}" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            avatarEl.innerHTML = (lastComment.username || 'U').charAt(0).toUpperCase();
            avatarEl.style.color = '#ffffff';
            avatarEl.style.background = 'linear-gradient(135deg, var(--primary), #FF7A00)';
        }
    }
    if (textEl) textEl.innerText = lastComment.text || "";
}

function openMoreDescriptionSheet() {
    if (!currentActiveMovie) return;
    const sheetTitle = document.getElementById('more-sheet-video-title');
    const sheetDesc = document.getElementById('more-sheet-desc-text');
    if (sheetTitle) sheetTitle.innerText = currentActiveMovie.title;
    if (sheetDesc) sheetDesc.innerText = currentActiveMovie.description || "No description provided.";
    
    if(navigator.onLine) {
        const movieId = currentActiveMovie.id;
        db.ref(`movie_stats/${movieId}`).once('value', (snap) => {
            const stats = snap.val() || {};
            const likesCount = Object.keys(stats.likes || {}).length;
            const viewsCount = Object.keys(stats.views || {}).length;
            
            const likesVal = document.getElementById('more-sheet-likes-val');
            const viewsVal = document.getElementById('more-sheet-views-val');
            if (likesVal) likesVal.innerText = formatCount(likesCount);
            if (viewsVal) viewsVal.innerText = formatCount(viewsCount);
        });
    }

    const uploadTime = currentActiveMovie.createdAt ? getRelativeTime(currentActiveMovie.createdAt) : "Just Now";
    const timeVal = document.getElementById('more-sheet-time-val');
    if (timeVal) timeVal.innerText = uploadTime;

    AppNavigation.pushModal('more-desc-sheet');
    
    setTimeout(() => {
        const sheet = document.getElementById('more-desc-sheet');
        if (sheet) {
            setupSwipeToClose(sheet, 'more-desc-drag-handle', closeMoreDescriptionSheet);
        }
    }, 100);
}

function closeMoreDescriptionSheet() {
    AppNavigation.pop();
}

// Long Video Play Page "up next": random order + INFINITE SCROLL.
// The first batch is rendered at once; more batches are appended whenever the bottom sentinel
// gets close to the screen (YouTube / Facebook style).
var _wpRelOrdered = [];
var _wpRelShown = 0;
var _wpRelObserver = null;
var _wpRelScrollHandler = null;

function wpRelatedCleanup() {
    try { if (_wpRelObserver) _wpRelObserver.disconnect(); } catch (e) {}
    _wpRelObserver = null;
    try {
        if (_wpRelScrollHandler) {
            const pg = document.getElementById('full-movie-page');
            if (pg) pg.removeEventListener('scroll', _wpRelScrollHandler);
        }
    } catch (e) {}
    _wpRelScrollHandler = null;
}

function wpAppendRelatedBatch() {
    const container = document.getElementById('yt-related-list');
    if (!container) return;
    if (_wpRelShown >= _wpRelOrdered.length) { wpRelatedCleanup(); return; }

    const batchSize = Math.max(1, watchRecommendedLimit);
    const batch = _wpRelOrdered.slice(_wpRelShown, _wpRelShown + batchSize);
    _wpRelShown += batch.length;

    const oldSentinel = document.getElementById('yt-related-sentinel');
    if (oldSentinel) oldSentinel.remove();

    const uniqueUserIds = new Set();
    let html = '';
    batch.forEach(v => {
        if (v.userId) uniqueUserIds.add(v.userId);
        html += fxBuildLongVideoCard(v);
    });
    container.insertAdjacentHTML('beforeend', html);
    batch.forEach(v => fxLoadCardStats(String(v.id)));
    uniqueUserIds.forEach(uid => bindLiveChannelUI(uid));

    if (_wpRelShown < _wpRelOrdered.length) {
        const sentinel = document.createElement('div');
        sentinel.id = 'yt-related-sentinel';
        sentinel.style.cssText = 'height:1px;width:100%;pointer-events:none;';
        container.appendChild(sentinel);
        // Re-observe so the callback fires again if the sentinel is still on screen after this batch.
        if (_wpRelObserver) { try { _wpRelObserver.observe(sentinel); } catch (e) {} }
    } else {
        wpRelatedCleanup();
    }
}

function renderMovieWatchRecommendedFeed() {
    const container = document.getElementById('yt-related-list');
    if (!container) return;

    wpRelatedCleanup();

    const currentId = currentActiveMovie ? String(currentActiveMovie.id) : null;
    const longvids = allLongVideos.filter(m => String(m.id) !== currentId);

    if (longvids.length === 0) {
        _wpRelOrdered = []; _wpRelShown = 0; _wpRelatedIds = [];
        container.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 20px 0;">No recommendations found.</p>`;
        return;
    }

    _wpRelOrdered = wpOrderRelated(longvids);
    _wpRelatedIds = _wpRelOrdered.map(v => String(v.id));
    _wpRelShown = 0;
    container.innerHTML = '';
    wpAppendRelatedBatch();   // first batch

    if (_wpRelShown >= _wpRelOrdered.length) return;   // everything already shown

    const pageEl = document.getElementById('full-movie-page');
    if ('IntersectionObserver' in window) {
        _wpRelObserver = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) wpAppendRelatedBatch();
        }, { root: pageEl || null, rootMargin: '0px 0px 900px 0px', threshold: 0 });
        const sentinel = document.getElementById('yt-related-sentinel');
        if (sentinel) _wpRelObserver.observe(sentinel);
    } else if (pageEl) {
        // Fallback for very old WebViews: load more when scrolled near the bottom.
        _wpRelScrollHandler = () => {
            if (pageEl.scrollTop + pageEl.clientHeight >= pageEl.scrollHeight - 900) wpAppendRelatedBatch();
        };
        pageEl.addEventListener('scroll', _wpRelScrollHandler, { passive: true });
    }
}

function wpApplyReaction(btnId, isOn, silent) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const was = btn.classList.contains('active');
    btn.classList.toggle('active', isOn);
    if (!silent && was !== isOn) {
        btn.classList.remove('wp-anim');
        void btn.offsetWidth;
        btn.classList.add('wp-anim');
        setTimeout(() => btn.classList.remove('wp-anim'), 650);
    }
}

function wpShare() {
    const m = currentActiveMovie;
    if (!m) return;
    const data = { title: m.title || 'Flaynity', text: m.title || 'Flaynity', url: location.href };
    if (navigator.share) { navigator.share(data).catch(() => {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(location.href); if (typeof showNotification === 'function') showNotification('Link copied', 'success'); }
}

function escapeHTML(str) {
    if(!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// =========================================
// NAVIGATION & DISCOVER TAB
// =========================================
async function switchTab(tabId) {
    // The Feels ad overlay is drawn by the app: close it when the user taps another bottom-nav tab
    if (typeof feelsAdShowing !== 'undefined' && feelsAdShowing) {
        feelsAdShowing = false; feelsAdCurrentSlide = null;
        try { window.AndroidBridge.hideFeelsAd(); } catch (e) {}
    }
    try { if (lvAdShowing) lvCancelAd(); } catch (e) {}
    try { if (flyLandscape) flySetLandscape(false); } catch (e) {}

    // Already on Feels and the Feels button is tapped again: refresh Feels (new random feed).
    if (tabId === 'feels') {
        let curNav = null;
        try { curNav = AppNavigation.current(); } catch (e) {}
        if (curNav && curNav.type === 'tab' && curNav.id === 'feels' && document.querySelector('#feels-swiper-container .feels-swiper')) {
            feelsRefreshFromNav();
            return;
        }
    }

    playUI('click');
    document.querySelectorAll('.short-video-el').forEach(vid => vid.pause());

    // Already on Your Channel and the You icon is tapped again: stay here.
    // (Pushing another 'you' entry would make Back reveal the same page twice.)
    if (tabId === 'you') {
        const cur = AppNavigation.current();
        if (cur && cur.type === 'page' && cur.id === 'view-channel-page') return;
    }

    // Update the selected bottom-navigation item immediately. Do this before
    // any Firebase request or page navigation so the previous tab cannot stay pink.
    AppNavigation.pushTab(tabId);

    if (tabId === 'you') {
        const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        if (!user) return;

        // 1) Cache first: open the You/Channel page instantly (no waiting, no image reload).
        let channel = null;
        try {
            const cached = localStorage.getItem('flaynity_channel_cache:' + user.uid);
            if (cached) channel = JSON.parse(cached);
        } catch (e) {}

        if (channel) {
            currentChannelData = channel;
            openViewChannelPage();
            // 2) Silent background refresh: updates cache + downloads only CHANGED images.
            if (navigator.onLine) {
                db.ref('channels/' + user.uid).once('value').then(snapshot => {
                    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
                    const fresh = snapshot.val();
                    if (fresh) { currentChannelData = fresh; prefetchYouPageData(user.uid, fresh); }
                    else { try { localStorage.removeItem('flaynity_channel_cache:' + user.uid); } catch (e) {} }
                }).catch(() => {});
            }
            return;
        }

        // No cache yet (first ever open): fetch once.
        if (navigator.onLine) {
            try {
                const snapshot = await db.ref('channels/' + user.uid).once('value');
                if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
                channel = snapshot.val() || null;
                if (channel) prefetchYouPageData(user.uid, channel);
            } catch (e) {}
        }

        if (channel) {
            currentChannelData = channel;
            openViewChannelPage();
        } else if (!navigator.onLine) {
            AppNavigation.pushPage('view-channel-page');
            renderOfflineChannelPageSkeletons();
        } else {
            currentChannelData = null;
            initYouTabUI();
        }
    }
}

function adjustHeaderForActiveTab(tabId) {
    const header = document.querySelector('header');
    if (!header) return;

    const brand = header.querySelector('.brand');
    const actions = header.querySelector('.header-actions');
    const chips = document.getElementById('global-category-chips');

    // Discover page uses its own search UI, so remove the global app top bar
    // (Logo, Flaynity name, header search button and theme switch) from Discover.
    if (tabId === 'search') {
        header.style.display = 'none';
        document.body.style.paddingTop = '0px';
        document.body.style.paddingBottom = '50px';
        if (chips) chips.style.display = 'none';
        const searchTab = document.getElementById('search-tab');
        if (searchTab) {
            searchTab.style.marginTop = '0px';
            searchTab.style.paddingTop = '12px';
        }
        return;
    }

    if (tabId === 'feels') {
        header.style.display = 'none';
        document.body.style.paddingTop = '0px';
        document.body.style.paddingBottom = '0px';
        if (chips) chips.style.display = 'none';
        return;
    } else {
        header.style.display = 'flex';
        document.body.style.paddingBottom = '50px';
    }

    // Posts page: same top bar as Home (it scrolls away with the feed). The
    // category chips belong to Home only; #posts-tab keeps its own 82px offset.
    if (tabId === 'posts') {
        document.body.style.paddingTop = '0px';
        header.style.position = 'absolute';
        header.style.top = '0px';
        if (chips) chips.style.display = 'none';
        const homeTabForPosts = document.getElementById('home-tab');
        if (homeTabForPosts) homeTabForPosts.style.paddingTop = '0px';
    } else if (tabId === 'home') {
        // Home feed: keep the header/category bar at their original on-screen
        // coordinates, but make them normal document-flow elements so native
        // scrolling moves them with the feed at exactly the user's scroll speed.
        document.body.style.paddingTop = '0px';
        header.style.position = 'absolute';
        header.style.top = '0px';
        if (chips) {
            chips.style.display = 'grid';
            chips.style.position = 'absolute';
            chips.style.top = '82px';
        }
        const homeTab = document.getElementById('home-tab');
        if (homeTab) homeTab.style.paddingTop = '82px';
    } else {
        document.body.style.paddingTop = '82px';
        const homeTab = document.getElementById('home-tab');
        if (homeTab) homeTab.style.paddingTop = '0px';
        header.style.position = 'fixed';
        header.style.top = '0px';
        if (chips) {
            chips.style.position = 'fixed';
            chips.style.top = '82px';
            chips.style.display = 'none';
        }
    }

    if (tabId === 'you') {
        // The old You page (blank screen with Switch Account button) is removed.
        // "Your Channel" is the You page; Switch Account stays in its menu.
        header.style.display = 'none';
        document.body.style.paddingTop = '0px';
        if (chips) chips.style.display = 'none';
        applyTheme();
        return;
    } else {
        if (brand) brand.style.display = 'flex';
        if (actions) {
            actions.innerHTML = `
                <button id="appbar-create-btn" onclick="openCreateBottomSheet(); playUI('click')" aria-label="Upload" title="Upload" style="background: none; border: none; color: var(--text-main); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%;">
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="5.5"></rect>
                        <path d="M12 7.8v8.4M7.8 12h8.4"></path>
                    </svg>
                </button>
                <button onclick="switchTab('search')" style="background: none; border: none; font-size: 1.25rem; color: var(--text-main); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%;">
                    <i class="fas fa-search"></i>
                </button>
                <button id="theme-toggle-btn" class="appbar-theme-btn" onclick="openThemePopupMenu()" title="Switch Theme" style="background: none; border: none; font-size: 1.25rem; color: var(--text-main); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%;">
                </button>
            `;
        }
    }
    applyTheme();
}

function startVoiceSearch() {
    showUpcomingModal();
}

function applyFilter(genreId, chipEl) {
    document.querySelectorAll('.filter-chip').forEach(el => el.classList.remove('active'));
    chipEl.classList.add('active');
    showUpcomingModal();
}

// =========================================
// YOU & CHANNEL WORKFLOW
// =========================================
function initYouTabUI() {
    const wrap = document.getElementById('channel-action-box');
    if (!wrap) return;

    const user = auth.currentUser;
    if (!user) {
        currentChannelData = null;
        wrap.innerHTML = '';
        return;
    }

    // Every request belongs to one UID and one render generation. A late Firebase
    // response from a previous account is never allowed to repaint the You page.
    const uid = user.uid;
    const loadToken = (window.__flaynityYouLoadToken || 0) + 1;
    window.__flaynityYouLoadToken = loadToken;
    const isCurrent = () => !!auth.currentUser &&
        auth.currentUser.uid === uid &&
        window.__flaynityYouLoadToken === loadToken;

    if (!navigator.onLine) {
        try {
            const cached = localStorage.getItem('flaynity_channel_cache:' + uid);
            currentChannelData = cached ? JSON.parse(cached) : null;
        } catch (e) { currentChannelData = null; }
        if (isCurrent()) {
            if (currentChannelData) {
                renderYouTabWithData(currentChannelData, user, wrap);
            } else {
                wrap.innerHTML = '<div class="skel-box" style="width:100%;height:48px;border-radius:20px;"></div>';
            }
        }
        return;
    }

    // Do not leave the previous account's identity visible while the new
    // account's channel record is being fetched.
    currentChannelData = null;
    const nameEl = document.getElementById('you-fullname-txt');
    const handleEl = document.getElementById('you-email-txt');
    const avatarEl = document.getElementById('you-avatar-large');
    if (nameEl) nameEl.innerText = user.displayName || (user.email || '').split('@')[0] || 'User';
    if (handleEl) handleEl.innerText = user.email || '';
    if (avatarEl) {
        avatarEl.innerHTML = user.photoURL
            ? '<img src="' + user.photoURL + '" style="width:100%;height:100%;object-fit:cover;">'
            : ((user.displayName || user.email || 'U').charAt(0).toUpperCase());
    }
    wrap.innerHTML = '<div class="skel-box" style="width:100%;height:48px;border-radius:20px;"></div>';

    db.ref('channels/' + uid).once('value')
        .then(snapshot => {
            if (!isCurrent()) return;
            const data = snapshot.val() || null;
            currentChannelData = data;
            try {
                if (data) localStorage.setItem('flaynity_channel_cache:' + uid, JSON.stringify(data));
                else localStorage.removeItem('flaynity_channel_cache:' + uid);
            } catch (e) {}
            renderYouTabWithData(data, user, wrap);
        })
        .catch(() => {
            if (!isCurrent()) return;
            let cached = null;
            try {
                const value = localStorage.getItem('flaynity_channel_cache:' + uid);
                if (value) cached = JSON.parse(value);
            } catch (e) {}
            currentChannelData = cached;
            renderYouTabWithData(cached, user, wrap);
        });
}

// ============================================================
// YOU PAGE BACKGROUND PREFETCH (Channel Banner + Avatar)
// App খোলার পর Home Page এ থাকা অবস্থাতেই Firebase থেকে Channel Data আনা হয়,
// Banner/Avatar ডাউনলোড হয়ে localStorage এ সেভ হয়। You Page খুললে আর নতুন করে
// লোড হয় না, Offline এও সরাসরি দেখায়। শুধু ছবির URL বদলালে আবার ডাউনলোড হবে।
// ============================================================
const __flImgInflight = {};

function __flBlobToScaledDataUrl(blob, maxW, mime) {
    return new Promise((resolve, reject) => {
        const objUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            try {
                const w = img.naturalWidth, h = img.naturalHeight;
                if (!w || !h) throw new Error('Bad image size');
                const scale = Math.min(1, maxW / w);
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(w * scale));
                c.height = Math.max(1, Math.round(h * scale));
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                const out = c.toDataURL(mime, 0.85);
                URL.revokeObjectURL(objUrl);
                resolve(out);
            } catch (e) { URL.revokeObjectURL(objUrl); reject(e); }
        };
        img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Decode failed')); };
        img.src = objUrl;
    });
}

function cacheChannelImageOffline(url, storageKey, maxWidth) {
    if (!url || typeof url !== 'string') return;
    const srcKey = storageKey + '_src';

    // Already-embedded image data: just store it.
    if (/^data:image\//i.test(url)) {
        try { localStorage.setItem(storageKey, url); localStorage.setItem(srcKey, url.length + ':' + url.slice(-32)); } catch (e) {}
        return;
    }
    if (!navigator.onLine) return;

    // Same URL already downloaded -> do NOTHING (no re-download on every You open).
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved && saved.startsWith('data:image/') && localStorage.getItem(srcKey) === url) return;
    } catch (e) {}

    if (__flImgInflight[storageKey] === url) return;
    __flImgInflight[storageKey] = url;

    // Warm the HTTP cache too (works even if the host has no CORS headers).
    try { const warm = new Image(); warm.decoding = 'async'; warm.src = url; } catch (e) {}

    const isAvatar = /avatar/i.test(storageKey);
    const limitW = maxWidth || (isAvatar ? 400 : 1280);

    fetch(url, { method: 'GET', mode: 'cors', cache: 'force-cache' })
        .then(response => {
            if (!response.ok) throw new Error('Image download failed');
            return response.blob();
        })
        .then(blob => {
            if (!blob || !blob.type || !blob.type.startsWith('image/')) throw new Error('Invalid image response');
            const mime = (isAvatar && blob.type === 'image/png') ? 'image/png' : 'image/jpeg';
            return __flBlobToScaledDataUrl(blob, limitW, mime);
        })
        .then(dataUrl => {
            if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return;
            try {
                localStorage.setItem(storageKey, dataUrl);
                localStorage.setItem(srcKey, url);
            } catch (e) {
                // Storage full: drop this entry so a half-saved state never remains.
                try { localStorage.removeItem(storageKey); localStorage.removeItem(srcKey); } catch (e2) {}
            }
        })
        .catch(() => {
            // Host denies CORS: the HTTP-cache warm-up above is the best fallback.
        })
        .finally(() => { if (__flImgInflight[storageKey] === url) delete __flImgInflight[storageKey]; });
}

function getCachedChannelImage(uid, kind, fallbackUrl) {
    try {
        const v = localStorage.getItem('flaynity_cached_channel_' + kind + ':' + uid);
        if (v && v.startsWith('data:image/')) return v;
    } catch (e) {}
    return fallbackUrl || '';
}

function prefetchYouPageData(uid, channelData) {
    if (!uid) return;
    const apply = (data) => {
        if (!data) return;
        try { localStorage.setItem('flaynity_channel_cache:' + uid, JSON.stringify(data)); } catch (e) {}
        const avatar = data.avatarUrl || data.channelImageUrl || data.profileImageUrl || data.photoURL || '';
        const banner = data.bannerUrl || data.channelBannerUrl || data.banner || data.channelBanner || '';
        if (avatar) { try { localStorage.setItem('flaynity_cached_channel_avatar_url:' + uid, avatar); } catch (e) {} }
        if (banner) { try { localStorage.setItem('flaynity_cached_channel_banner_url:' + uid, banner); } catch (e) {} }
        cacheChannelImageOffline(avatar, 'flaynity_cached_channel_avatar:' + uid, 400);
        cacheChannelImageOffline(banner, 'flaynity_cached_channel_banner:' + uid, 1280);
    };
    if (channelData) { apply(channelData); return; }
    if (!navigator.onLine || typeof db === 'undefined') return;
    db.ref('channels/' + uid).once('value')
        .then(snap => {
            if (!auth.currentUser || auth.currentUser.uid !== uid) return;
            apply(snap.val());
        })
        .catch(() => {});
}

window.addEventListener('online', () => {
    try { if (auth && auth.currentUser) prefetchYouPageData(auth.currentUser.uid); } catch (e) {}
});

function renderYouTabWithData(data, user, wrap) {
    const youAvatarLarge = document.getElementById('you-avatar-large');
    const youFullNameTxt = document.getElementById('you-fullname-txt');
    const youEmailTxt = document.getElementById('you-email-txt');

    if (data) {
        const channelName = data.channelName;
        const channelHandle = "@" + data.handle;
        const channelAvatar = data.avatarUrl || data.channelImageUrl || data.profileImageUrl || data.photoURL || (user && user.photoURL) || '';
        const channelBanner = data.bannerUrl || data.channelBannerUrl || data.banner || data.channelBanner || '';

        // Preserve channel image URLs separately so they survive offline sessions
        // even if the session object is incomplete or auth.currentUser is not restored.
        try {
            if (channelAvatar) {
                localStorage.setItem('flaynity_cached_channel_avatar_url:' + user.uid, channelAvatar);
                if (/^data:image\//i.test(channelAvatar)) localStorage.setItem('flaynity_cached_channel_avatar:' + user.uid, channelAvatar);
            }
            if (channelBanner) {
                localStorage.setItem('flaynity_cached_channel_banner_url:' + user.uid, channelBanner);
                if (/^data:image\//i.test(channelBanner)) localStorage.setItem('flaynity_cached_channel_banner:' + user.uid, channelBanner);
            }
        } catch (e) {}
        cacheChannelImageOffline(channelAvatar, 'flaynity_cached_channel_avatar:' + user.uid, 400);
        cacheChannelImageOffline(channelBanner, 'flaynity_cached_channel_banner:' + user.uid, 1280);

        if (youFullNameTxt) youFullNameTxt.innerText = channelName;
        if (youEmailTxt) {
            youEmailTxt.innerText = channelHandle;
            youEmailTxt.style.color = "var(--primary)";
            youEmailTxt.style.fontWeight = "800";
        }

        if (youAvatarLarge) {
            if (channelAvatar) {
                const shownAvatar = getCachedChannelImage(user.uid, 'avatar', channelAvatar);
                youAvatarLarge.innerHTML = `<img src="${shownAvatar}" style="width:100%; height:100%; object-fit:cover;">`;
            } else {
                youAvatarLarge.innerHTML = channelName.charAt(0).toUpperCase();
            }
        }

        // Existing channels are opened directly from the You bottom navigation.
        // Do not render the obsolete View Channel card inside the You profile.
        wrap.innerHTML = '';
    } else {
        const displayName = user.displayName || user.email.split('@')[0];
        if (youFullNameTxt) youFullNameTxt.innerText = displayName;
        if (youEmailTxt) {
            youEmailTxt.innerText = user.email;
            youEmailTxt.style.color = "var(--text-muted)";
            youEmailTxt.style.fontWeight = "600";
        }

        if (youAvatarLarge) {
            const photoURL = user.photoURL || '';
            if (photoURL) {
                youAvatarLarge.innerHTML = `<img src="${photoURL}" style="width:100%; height:100%; object-fit:cover;">`;
            } else {
                youAvatarLarge.innerHTML = displayName.charAt(0).toUpperCase();
            }
        }

        wrap.innerHTML = `
            <button class="btn-create-channel" onclick="openCreateChannelPage()">
                <i class="fas fa-plus"></i> Create a Channel
            </button>
        `;
    }
    updateBottomNavAvatar();
}

function handleFlayVerifiedBadgeFromYou() {
    playUI('click');

    // Never create, cache, or inject channel/demo data here.
    // Only use the existing Firebase channel record for the signed-in user.
    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;

    if (!user) {
        // Keep the existing app flow: open Create Channel first. The channel
        // creation form itself will require an authenticated account when saved.
        openCreateChannelPage();
        return;
    }

    if (currentChannelData) {
        AppNavigation.pushPremiumService('flay-verified-badge');
        return;
    }

    db.ref(`channels/${user.uid}`).once('value').then((snapshot) => {
        const channel = snapshot.val();
        if (channel) {
            currentChannelData = channel;
            AppNavigation.pushPremiumService('flay-verified-badge');
        } else {
            // Remember only this navigation intent; no Firebase/local channel data is created.
            window.__flaynityOpenVerifiedAfterChannelCreate = true;
            openCreateChannelPage();
        }
    }).catch((error) => {
        console.error('Failed to check channel before Flay Verified Badge:', error);
        showNotification('Unable to check your Channel. Please try again.', 'error');
    });
}

function handleViewChannelMenu() {
    playUI('click');
    if (currentChannelData) {
        openViewChannelPage();
    } else {
        const confirmCreate = confirm("You do not have a channel yet.\n\nWould you like to create one now?");
        if (confirmCreate) {
            openCreateChannelPage();
        }
    }
}

function openCreateChannelPage() {
    playUI('click');
    const _u = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (_u && (currentChannelData || window.__flaynityChannelCreatedUid === _u.uid)) {
        // Channel already exists: never show Create your Channel again.
        try { if (typeof initYouTabUI === 'function') initYouTabUI(); } catch (e) {}
        return;
    }
    // Use the standalone first-run Create Channel flow, not the legacy
    // "Enter Your Information" page embedded in pages/you.html.
    if (typeof window.showCreateChannelPage === 'function') {
        window.showCreateChannelPage(true);
    } else {
        showNotification('Create Channel is loading. Please try again.', 'error');
    }
}

function triggerAvatarSelection(mode) {
    playUI('click');
    const pickMode = mode === 'create' ? 'create-avatar' : 'edit-avatar';
    if (typeof window.openMediaPicker === 'function') {
        window.openMediaPicker(pickMode, function(file) { handleChannelAvatarSelect({ target: { files: [file] } }, mode); });
        return;
    }
    const id = mode === 'create' ? 'create-avatar-input' : 'edit-avatar-input';
    const input = document.getElementById(id);
    if (input) input.click();
}

function triggerBannerSelection() {
    playUI('click');
    if (typeof window.openChannelCoverPicker === 'function') {
        window.openChannelCoverPicker({
            currentUrl: tempEditBannerUrl || (currentChannelData && currentChannelData.bannerUrl) || '',
            channelName: (document.getElementById('edit-channel-name') && document.getElementById('edit-channel-name').value) || (currentChannelData && currentChannelData.channelName) || 'Your Channel',
            avatarUrl: tempEditAvatarUrl || (currentChannelData && currentChannelData.avatarUrl) || '',
            onApply: async function(file, previewUrl) {
                const banner = document.getElementById('edit-channel-banner-img');
                if (banner && previewUrl) banner.src = previewUrl;
                const viewBanner = document.getElementById('view-channel-banner');
                if (viewBanner && previewUrl) viewBanner.src = previewUrl;
                await handleChannelBannerSelect({ target: { files: [file] } }, true);
            }
        });
        return;
    }
    if (typeof window.openMediaPicker === 'function') {
        window.openMediaPicker('edit-banner', function(file) { handleChannelBannerSelect({ target: { files: [file] } }); });
        return;
    }
    const input = document.getElementById('edit-banner-input');
    if (input) input.click();
}

async function handleChannelAvatarSelect(e, mode, _skipCrop) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (!file) return;
    if (!_skipCrop && typeof window.openProfilePhotoCropper === 'function') {
        window.openProfilePhotoCropper(file, function(croppedFile, previewUrl) {
            if (previewUrl) {
                const pId = mode === 'create' ? 'create-avatar-img' : 'edit-avatar-img';
                const pEl = document.getElementById(pId);
                if (pEl) { pEl.src = previewUrl; pEl.style.display = 'block'; }
            }
            handleChannelAvatarSelect({ target: { files: [croppedFile] } }, mode, true);
        });
        return;
    }

    showNotification("Uploading profile image...", "success");
    try {
        const secureUrl = await uploadImageToR2(file, "avatars");
        if (mode === 'create') {
            tempCreateAvatarUrl = secureUrl;
            const preview = document.getElementById('create-avatar-img');
            if (preview) {
                preview.src = secureUrl;
                preview.style.display = 'block';
            }
            const placeholder = document.getElementById('create-avatar-placeholder');
            if (placeholder) placeholder.style.display = 'none';
        } else {
            tempEditAvatarUrl = secureUrl;
            const preview = document.getElementById('edit-avatar-img');
            if (preview) preview.src = secureUrl;
        }
        showNotification("Image loaded successfully!", "success");
    } catch(err) {
        showNotification("Failed to upload image. Please try again.", "error");
    }
}

async function handleChannelBannerSelect(e, saveDirectly) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (!file) return;

    showNotification("Saving channel cover...", "success");
    try {
        const secureUrl = await uploadImageToR2(file, "banners");
        tempEditBannerUrl = secureUrl;
        const banner = document.getElementById('edit-channel-banner-img');
        if (banner) banner.src = secureUrl;
        const viewBanner = document.getElementById('view-channel-banner');
        if (viewBanner) viewBanner.src = secureUrl;
        if (saveDirectly && typeof auth !== 'undefined' && auth.currentUser && typeof db !== 'undefined') {
            const uid = auth.currentUser.uid;
            const upd = {};
            upd[`channels/${uid}/bannerUrl`] = secureUrl;
            upd[`channels/${uid}/channelBannerUrl`] = secureUrl;
            upd[`channels/${uid}/updatedDate`] = Date.now();
            await db.ref().update(upd);
            if (typeof currentChannelData !== 'undefined' && currentChannelData) {
                currentChannelData.bannerUrl = secureUrl;
                currentChannelData.channelBannerUrl = secureUrl;
                try {
                    localStorage.setItem('flaynity_user_session_cache', JSON.stringify(currentChannelData));
                    localStorage.setItem('flaynity_channel_cache:' + uid, JSON.stringify(currentChannelData));
                    localStorage.setItem('flaynity_cached_channel_banner_url:' + uid, secureUrl);
                    localStorage.removeItem('flaynity_cached_channel_banner:' + uid);
                } catch (err2) {}
            }
        }
        showNotification("Cover saved successfully!", "success");
    } catch(err) {
        showNotification("Failed to save cover.", "error");
        throw err;
    }
}

let handleCheckTimeout;
function checkHandleAvailability(inputVal, feedbackElId, submitBtnId, originalHandle = "") {
    const feedback = document.getElementById(feedbackElId);
    const btn = document.getElementById(submitBtnId);
    if (!feedback || !btn) return;

    clearTimeout(handleCheckTimeout);
    
    let handle = inputVal.trim().toLowerCase().replace('@', '');
    if (!handle) {
        feedback.innerHTML = "";
        btn.disabled = true;
        return;
    }
    
    const regex = /^[a-z0-9_]+$/;
    if (!regex.test(handle) || inputVal.includes(' ')) {
        feedback.innerHTML = `<span style="color:#EF4444; font-weight: 700;"><i class="fas fa-times-circle"></i> Invalid Handle</span>`;
        btn.disabled = true;
        return;
    }

    if (handle === originalHandle) {
        feedback.innerHTML = `<span style="color:#34C759; font-weight: 700;"><i class="fas fa-check-circle"></i> Current Handle</span>`;
        btn.disabled = false;
        return;
    }

    feedback.innerHTML = `<span style="color:var(--text-muted); font-weight: 700;"><i class="fas fa-spinner fa-spin"></i> Checking availability...</span>`;
    
    handleCheckTimeout = setTimeout(() => {
        db.ref(`handles/${handle}`).once('value', (snapshot) => {
            if (snapshot.exists()) {
                feedback.innerHTML = `<span style="color:#EF4444; font-weight: 700;"><i class="fas fa-times-circle"></i> Handle Already Taken</span>`;
                btn.disabled = true;
            } else {
                feedback.innerHTML = `<span style="color:#34C759; font-weight: 700;"><i class="fas fa-check-circle"></i> Handle Available</span>`;
                btn.disabled = false;
            }
        });
    }, 500);
}

async function submitCreateChannel() {
    playUI('click');
    const nameInput = document.getElementById('create-channel-name');
    const handleInput = document.getElementById('create-channel-handle');
    const categorySelect = document.getElementById('create-channel-category');
    const submitBtn = document.getElementById('btn-submit-create');

    const name = nameInput ? nameInput.value.trim() : "";
    const handle = handleInput ? handleInput.value.trim().toLowerCase().replace('@', '') : "";
    const category = categorySelect ? categorySelect.value : "Others";
    const user = auth.currentUser;
    
    if (!name || !handle) {
        showNotification("Please enter all required fields", "error");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Creating...`;
    }

    try {
        const snap = await db.ref(`handles/${handle}`).once('value');
        if (snap.exists()) {
            showNotification("Handle already taken. Choose another.", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = "Create Channel";
            }
            return;
        }

        const channelData = {
            channelId: user.uid,
            userId: user.uid,
            googleUid: user.uid,
            gmailName: user.displayName || user.email.split('@')[0],
            gmailEmail: user.email,
            channelName: name,
            handle: handle,
            avatarUrl: tempCreateAvatarUrl || user.photoURL || "",
            bannerUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2000&auto=format&fit=crop", 
            description: "Welcome to " + name + "!",
            category: category,
            subscribersCount: 1, 
            videosCount: 0,
            feelsCount: 0,
            postsCount: 0,
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            watchTime: 0.0,
            createdDate: Date.now(),
            updatedDate: Date.now()
        };

        await db.ref(`channels/${user.uid}`).set(channelData);
        await db.ref(`handles/${handle}`).set(user.uid);

        currentChannelData = channelData;
        showNotification("Channel created successfully!", "success");

        AppNavigation.pop();
        if (window.__flaynityOpenVerifiedAfterChannelCreate === true) {
            window.__flaynityOpenVerifiedAfterChannelCreate = false;
            AppNavigation.pushPremiumService('flay-verified-badge');
        } else {
            openViewChannelPage();
        }
    } catch(err) {
        showNotification("Error creating channel: " + err.message, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = "Create Channel";
        }
    }
}

/* You-page quick menu handlers.
   Page HTML is mounted by the modular loader, which intentionally does not execute
   inline scripts from pages/you.html. Keep these handlers in this main app script. */
function openYouQuickMenu() {
    const overlay = document.getElementById('you-quick-menu-overlay');
    if (!overlay) {
        console.warn('You quick menu overlay is missing.');
        return;
    }
    if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
    // Restore the original menu items when the connection returns.
    if (navigator.onLine) {
        overlay.querySelectorAll('.you-quick-menu-list').forEach(list => {
            if (list.dataset.originalMenuHTML) {
                list.innerHTML = list.dataset.originalMenuHTML;
                delete list.dataset.originalMenuHTML;
            }
        });
        const panel = overlay.querySelector('.you-quick-menu-panel');
        if (panel) delete panel.dataset.offlineSkeletonApplied;
    } else {
        overlay.querySelectorAll('.you-quick-menu-list').forEach(list => {
            if (!list.dataset.originalMenuHTML) list.dataset.originalMenuHTML = list.innerHTML;
            list.innerHTML = Array.from({length: 3}, () =>
                '<div class="channel-offline-skeleton" style="height:48px;border-radius:14px;margin:8px 0;"><div class="skel-box" style="width:100%;height:100%;border-radius:14px;"></div></div>'
            ).join('');
        });
        const panel = overlay.querySelector('.you-quick-menu-panel');
        if (panel) panel.dataset.offlineSkeletonApplied = '1';
    }
    overlay.style.setProperty('display', 'block', 'important');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    overlay.classList.remove('active');
    void overlay.offsetWidth;
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            overlay.classList.add('active');
        });
    });
}

function closeYouQuickMenu() {
    const overlay = document.getElementById('you-quick-menu-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(function () {
        if (!overlay.classList.contains('active')) {
            overlay.style.setProperty('display', 'none', 'important');
        }
    }, 330);
}

function handleYouQuickMenuOverlay(event) {
    if (event.target && event.target.id === 'you-quick-menu-overlay') {
        closeYouQuickMenu();
    }
}

function runYouQuickMenuAction(action) {
    closeYouQuickMenu();
    setTimeout(function () {
        if (typeof action === 'function') action();
    }, 100);
}

function openSupportLink(type) {
    closeYouQuickMenu();
    if (type === 'help-center') {
        if (typeof showNotification === 'function') {
            showNotification('Help Center is coming soon.', 'info', 2500);
        }
        return;
    }
    if (type === 'report-problem') {
        AppNavigation.pushPremiumService('report-a-problem');
        return;
    }
    console.warn('Unknown support page:', type);
}

/* Settings bottom-sheet handlers for dynamically loaded You page. */
function openBottomSheet(sheetId) {
    const overlay = document.getElementById(sheetId);
    if (!overlay) return;
    if (sheetId === 'sheet-private-account' && typeof window.syncChannelPrivacyUI === 'function') {
        window.syncChannelPrivacyUI(currentChannelData);
    }
    overlay.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('active')));
}

function closeBottomSheet(sheetId) {
    const overlay = document.getElementById(sheetId);
    if (!overlay) return;
    overlay.classList.remove('active');
    setTimeout(() => {
        if (!overlay.classList.contains('active')) overlay.style.display = 'none';
    }, 260);
}

function handleOverlayClick(event, sheetId) {
    if (event.target && event.target.classList.contains('bottom-sheet-overlay')) {
        closeBottomSheet(sheetId);
    }
}

function selectGenericOption(element, sheetId) {
    if (!element) return;
    const parentList = element.parentElement;
    if (parentList) {
        parentList.querySelectorAll('.sheet-option-item').forEach(el => el.classList.remove('selected'));
    }
    element.classList.add('selected');
    if (sheetId === 'sheet-language' && typeof window.setFlaynityLanguage === 'function') {
        const label = element.querySelector('.sheet-option-label');
        window.setFlaynityLanguage(label ? label.textContent : element.textContent);
    }
    if (sheetId === 'sheet-private-account' && typeof window.saveChannelPrivacySetting === 'function') {
        const rawVal = element.getAttribute('data-value') || ((element.textContent || '').trim().toLowerCase().includes('private') ? 'private' : 'public');
        window.saveChannelPrivacySetting(rawVal);
    }
    setTimeout(() => closeBottomSheet(sheetId), 220);
}

function selectThemeOption(element, sheetId) {
    const theme = element ? element.getAttribute('data-value') : null;
    const pref = (theme === 'dark') ? 'dark' : 'light';
    try { localStorage.setItem('flaynity-theme-pref', pref); } catch (e) {}
    if (typeof applyTheme === 'function') {
        applyTheme();
    } else {
        document.documentElement.setAttribute('data-theme', pref);
    }
    selectGenericOption(element, sheetId);
}

function openChannelSettingsPage() {
    playUI('click');
    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!user) return;
    if (!currentChannelData) {
        db.ref(`channels/${user.uid}`).once('value').then((snap) => {
            currentChannelData = snap.val();
            if (currentChannelData) AppNavigation.pushPage('channel-settings-page');
        }).catch((error) => console.error('Failed to load channel settings:', error));
        return;
    }
    AppNavigation.pushPage('channel-settings-page');
}


// ---------------------------------------------------------------------------
// Channel page: Subscriber / Videos numbers + description "More" button.
// pages/you.html's inline script never runs (page scripts are not executed for
// "you"), so the big numbers stayed at 0. The logic now lives here.
// ---------------------------------------------------------------------------
function flaynitySyncChannelStats() {
    [['view-sub-count', 'view-sub-count-val'], ['view-vid-count', 'view-vid-count-val']].forEach(function (pair) {
        const src = document.getElementById(pair[0]);
        const dst = document.getElementById(pair[1]);
        if (!src || !dst) return;
        const m = (src.textContent || '').trim().match(/^([^\s\u2022]+)/);
        if (m && m[1] && dst.textContent !== m[1]) dst.textContent = m[1];
    });
}

function flaynityInitChannelStatsSync() {
    ['view-sub-count', 'view-vid-count'].forEach(function (id) {
        const el = document.getElementById(id);
        if (!el || el.__flStatsObserved || !window.MutationObserver) return;
        el.__flStatsObserved = true;
        new MutationObserver(flaynitySyncChannelStats).observe(el, { childList: true, characterData: true, subtree: true });
    });
}

// Show "More" only when the description is longer than 3 lines; a short
// description takes only the space it needs (no empty gap before "More").
function flaynityUpdateDescMore(attempt) {
    attempt = attempt || 0;
    const el = document.getElementById('view-channel-desc');
    const btn = document.getElementById('view-channel-desc-btn');
    if (!el || !btn) return;
    const box = el.closest('.channel-description-box');
    const hidden = !el.getClientRects().length || !el.clientWidth;
    if (hidden) {
        if (attempt < 12) setTimeout(function () { flaynityUpdateDescMore(attempt + 1); }, 120);
        return;
    }
    const imp = function (node, prop, val) { node.style.setProperty(prop, val, 'important'); };
    // Measure the natural height.
    imp(el, 'height', 'auto'); imp(el, 'min-height', '0'); imp(el, 'max-height', 'none');
    const cs = getComputedStyle(el);
    let lh = parseFloat(cs.lineHeight);
    if (!lh || isNaN(lh)) lh = (parseFloat(cs.fontSize) || 14) * 1.65;
    const needsMore = el.scrollHeight > lh * 3 + 2;
    if (needsMore) {
        // Back to the normal 3-line clamp from the stylesheet.
        ['height', 'min-height', 'max-height'].forEach(function (p) { el.style.removeProperty(p); });
        btn.style.removeProperty('display');
        imp(btn, 'display', 'flex');
    } else {
        imp(btn, 'display', 'none');
        if (box) imp(box, 'padding-bottom', '0px');
    }
    if (needsMore && box) box.style.removeProperty('padding-bottom');
    if (attempt === 0) [200, 600, 1400].forEach(function (ms) { setTimeout(function () { flaynityUpdateDescMore(1); }, ms); });
}

function openViewChannelPage() {
    ensureLiveUploadStyles();
    playUI('click');
    const activeUid = auth.currentUser && auth.currentUser.uid;
    let data = currentChannelData;
    if (!activeUid) return;
    // Never render a channel object belonging to a different signed-in account.
    if (data && ((data.uid && data.uid !== activeUid) || (data.userId && data.userId !== activeUid))) data = null;
    if (!data && !navigator.onLine) {
        try {
            const cached = localStorage.getItem('flaynity_channel_cache:' + activeUid);
            if (cached) data = JSON.parse(cached);
        } catch (e) {}
        if (data) currentChannelData = data;
    }
    if (!data) return;

    const viewTitle = document.getElementById('view-appbar-title');
    const viewBanner = document.getElementById('view-channel-banner');
    const viewAvatar = document.getElementById('view-channel-avatar');
    const viewName = document.getElementById('view-channel-name-txt');
    const viewHandle = document.getElementById('view-channel-handle-txt');
    const viewDesc = document.getElementById('view-channel-desc');
    const viewSub = document.getElementById('view-sub-count');

    if (viewTitle) viewTitle.innerText = data.channelName;
    // Read image URLs from the cached channel record, including older field names.
    let cachedBannerUrl = data.bannerUrl || data.channelBannerUrl || data.banner || data.channelBanner || '';
    let cachedAvatarUrl = data.avatarUrl || data.channelImageUrl || data.profileImageUrl || data.photoURL || '';
    try {
        // Prefer downloaded image data for reliable offline rendering.
        cachedBannerUrl = localStorage.getItem('flaynity_cached_channel_banner:' + auth.currentUser.uid) || cachedBannerUrl || localStorage.getItem('flaynity_cached_channel_banner_url:' + auth.currentUser.uid) || '';
        cachedAvatarUrl = localStorage.getItem('flaynity_cached_channel_avatar:' + auth.currentUser.uid) || cachedAvatarUrl || localStorage.getItem('flaynity_cached_channel_avatar_url:' + auth.currentUser.uid) || '';
    } catch (e) {}
    // Background prefetch already downloaded the images. This is a no-op when the
    // saved copy matches the current URL, so opening You never re-downloads.
    if (navigator.onLine) prefetchYouPageData(activeUid, data);
    if (viewBanner) {
        const bannerSrc = cachedBannerUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2000&auto=format&fit=crop";
        if (viewBanner.getAttribute('src') !== bannerSrc) viewBanner.src = bannerSrc;
        viewBanner.style.visibility = 'visible';
    }
    if (viewAvatar) {
        const avatarSrc = cachedAvatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=300&auto=format&fit=crop";
        if (viewAvatar.getAttribute('src') !== avatarSrc) viewAvatar.src = avatarSrc;
        viewAvatar.style.visibility = 'visible';
    }
    window.__activeViewedChannel = data;
    if (viewName) viewName.innerText = data.channelName;
    if (viewHandle) viewHandle.innerText = "@" + data.handle;
    if (typeof window.syncChannelPrivacyUI === 'function') window.syncChannelPrivacyUI(data);
    if (viewDesc) viewDesc.innerText = data.description || "No description provided yet.";
    if (viewSub) viewSub.innerText = formatCount(data.subscribersCount) + " Subscriber" + (data.subscribersCount === 1 ? "" : "s");

    // Keep the user's cached banner and avatar visible offline; only action buttons
    // use skeleton placeholders until the connection returns.
    const analyticsButton = document.querySelector('#view-channel-page .btn-analytics');
    const editChannelButton = document.querySelector('#view-channel-page .btn-edit-channel');
    if (!navigator.onLine) {
        [analyticsButton, editChannelButton].forEach(button => {
            if (!button) return;
            if (!button.dataset.originalButtonHTML) button.dataset.originalButtonHTML = button.innerHTML;
            button.disabled = true;
            button.setAttribute('aria-label', button.dataset.offlineLabel || button.textContent.trim());
            button.style.setProperty('color', 'transparent', 'important');
            button.style.setProperty('pointer-events', 'none', 'important');
            button.innerHTML = '<span class="skel-box" style="display:block;width:76px;height:14px;border-radius:7px;"></span>';
        });
    } else {
        [analyticsButton, editChannelButton].forEach((button, index) => {
            if (!button) return;
            button.disabled = false;
            button.style.removeProperty('color');
            button.style.removeProperty('pointer-events');
            if (button.dataset.originalButtonHTML) button.innerHTML = button.dataset.originalButtonHTML;
            else button.textContent = index === 0 ? 'Analytics' : 'Edit Channel';
        });
    }

    switchChannelTab('videos');
    AppNavigation.pushPage('view-channel-page');
    try { flaynityInitChannelStatsSync(); flaynitySyncChannelStats(); flaynityUpdateDescMore(); } catch (e) {}
    startLiveChannelUploadRefresh();
    setTimeout(() => renderChannelUploadQueue('videos'), 120);
    setTimeout(() => renderChannelUploadQueue('feels'), 120);
}

function renderOfflineChannelPageSkeletons(activeType) {
    if (navigator.onLine) return;
    const types = activeType ? [activeType] : ['videos', 'feels', 'posts'];
    types.forEach(type => {
        const gridId = type === 'videos' ? 'channel-videos-grid' : (type === 'feels' ? 'channel-feels-grid' : 'channel-posts-feed');
        const grid = document.getElementById(gridId);
        if (!grid) return;
        chShowOffline(type);
    });
    const menuPanel = document.querySelector('#you-quick-menu-overlay .you-quick-menu-panel');
    if (menuPanel && !menuPanel.dataset.offlineSkeletonApplied) {
        menuPanel.dataset.offlineSkeletonApplied = '1';
        menuPanel.querySelectorAll('.you-quick-menu-list').forEach(list => {
            if (!list.dataset.originalMenuHTML) list.dataset.originalMenuHTML = list.innerHTML;
            list.innerHTML = Array.from({length: 3}, () =>
                '<div class="channel-offline-skeleton" style="height:48px;border-radius:14px;margin:8px 0;"><div class="skel-box" style="width:100%;height:100%;border-radius:14px;"></div></div>'
            ).join('');
        });
    }
}

let activeChannelVideosListener = null;
let activeChannelFeelsListener = null;
let activeChannelPostsListener = null;

let liveChannelUploadRefreshTimer = null;
function startLiveChannelUploadRefresh(){
    if (liveChannelUploadRefreshTimer) clearInterval(liveChannelUploadRefreshTimer);
    liveChannelUploadRefreshTimer = setInterval(() => {
        const page = document.getElementById('view-channel-page');
        if (!page || page.style.display === 'none' || page.hidden) return;
        if (typeof renderChannelUploadQueue === 'function') {
            renderChannelUploadQueue('videos');
            renderChannelUploadQueue('feels');
        }
    }, 600);
}

let activeChannelTab = 'videos';
function switchChannelTab(type) {
    playUI('click');
    activeChannelTab = type;
    document.querySelectorAll('.channel-tab-item, .channel-tab-content').forEach(el => el.classList.remove('active'));

    const tabEl = document.getElementById(`tab-channel-${type}`);
    const contentEl = document.getElementById(`channel-content-${type}`);
    if (tabEl) tabEl.classList.add('active');
    if (contentEl) contentEl.classList.add('active');

    if (!navigator.onLine) {
        // Offline: show the "No internet connection. Tap to retry." state.
        chShowOffline(type);
        renderOfflineChannelPageSkeletons(type);
        return;
    }

    // Back online: swap a leftover retry screen for skeletons while data loads.
    chLeaveOffline(type);

    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!user) return;
    const targetId = user.uid;
    if (type === 'videos') renderChannelVideos(targetId);
    else if (type === 'feels') renderChannelFeels(targetId);
    else if (type === 'posts') renderChannelPosts(targetId);
}

// ============================================================
// CHANNEL PAGE: Videos / Feels / Posts  (YouTube-style design)
// ============================================================
const __chState = {
    sort: { videos: 'latest', feels: 'latest', posts: 'latest' },
    data: { videos: [], feels: [], posts: [] },
    views: {}
};
const __CH_DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>';

function chRelTime(ts) {
    const t = Number(ts) || (ts ? new Date(ts).getTime() : 0);
    if (!t) return '';
    const mins = Math.floor((Date.now() - t) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min ago';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    const months = Math.floor(days / 30);
    if (months < 12) return months + 'mo ago';
    return Math.floor(days / 365) + 'y ago';
}

function chSkeletonHTML(type) {
    if (type === 'feels') {
        return Array.from({length: 9}, () => '<div class="skel-box ch-skel-f"></div>').join('');
    }
    if (type === 'posts') {
        return Array.from({length: 3}, () =>
            '<div class="channel-offline-skeleton"><div class="skel-box" style="width:100%;height:150px;border-radius:12px;"></div><div class="skel-box" style="width:72%;height:12px;margin-top:10px;border-radius:6px;"></div></div>'
        ).join('');
    }
    return Array.from({length: 4}, () =>
        '<div class="ch-skel-v"><div class="skel-box" style="flex:0 0 44%;aspect-ratio:16/9;border-radius:14px;"></div>' +
        '<div style="flex:1;min-width:0;"><div class="skel-box" style="width:92%;height:13px;border-radius:7px;"></div>' +
        '<div class="skel-box" style="width:70%;height:13px;margin-top:8px;border-radius:7px;"></div>' +
        '<div class="skel-box" style="width:46%;height:11px;margin-top:10px;border-radius:6px;"></div></div></div>'
    ).join('');
}

// ---------- Offline "No internet connection. Tap to retry." state ----------
const __CH_RETRY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';

function chGridId(type) {
    return type === 'videos' ? 'channel-videos-grid' : (type === 'feels' ? 'channel-feels-grid' : 'channel-posts-feed');
}

function chOfflineHTML(type) {
    return '<div class="ch-offline-state">' +
        '<h3 class="ch-off-title">No internet connection. Tap to retry.</h3>' +
        '<p class="ch-off-sub">Connect to the internet and try again.</p>' +
        '<button type="button" class="ch-off-retry" onclick="chRetryTab(\'' + type + '\', this)">' + __CH_RETRY_ICON + '<span>Retry</span></button>' +
        '</div>';
}

function chShowOffline(type) {
    const grid = document.getElementById(chGridId(type));
    const content = document.getElementById('channel-content-' + type);
    if (!grid) return;
    // Already-loaded items from this session stay visible; otherwise show Retry.
    if (__chState.data[type] && __chState.data[type].length) {
        if (content) content.classList.remove('ch-offline');
        chPaint(type);
        return;
    }
    grid.innerHTML = chOfflineHTML(type);
    if (content) content.classList.add('ch-offline');
}

function chLeaveOffline(type) {
    const grid = document.getElementById(chGridId(type));
    const content = document.getElementById('channel-content-' + type);
    if (content) content.classList.remove('ch-offline');
    if (grid && grid.querySelector('.ch-offline-state')) grid.innerHTML = chSkeletonHTML(type);
}

function chRetryTab(type, btn) {
    if (typeof playUI === 'function') playUI('click');
    if (!navigator.onLine) {
        if (btn) { btn.classList.remove('ch-shake'); void btn.offsetWidth; btn.classList.add('ch-shake'); }
        if (typeof showNotification === 'function') showNotification('No internet connection', 'error');
        return;
    }
    if (btn) btn.classList.add('ch-loading');
    switchChannelTab(type);
    try { if (auth && auth.currentUser) prefetchYouPageData(auth.currentUser.uid); } catch (e) {}
}

// Connection came back while a retry screen is showing: reload that tab automatically.
window.addEventListener('online', () => {
    try {
        if (document.querySelector('#view-channel-page .channel-tab-content.active .ch-offline-state')) {
            switchChannelTab(activeChannelTab);
        }
    } catch (e) {}
});

function chSortedList(type) {
    const mode = __chState.sort[type] || 'latest';
    const arr = (__chState.data[type] || []).slice();
    const ts = x => Number(x.createdAt) || 0;
    const score = x => type === 'posts'
        ? (Number(x.likes) || 0)
        : (Number(__chState.views[x.id] != null ? __chState.views[x.id] : x.views) || 0);
    if (mode === 'oldest') arr.sort((a, b) => ts(a) - ts(b));
    else if (mode === 'popular') arr.sort((a, b) => (score(b) - score(a)) || (ts(b) - ts(a)));
    else arr.sort((a, b) => ts(b) - ts(a));
    return arr;
}

function setChannelSort(type, mode, btn) {
    if (typeof playUI === 'function') playUI('click');
    __chState.sort[type] = mode;
    const row = btn && btn.closest ? btn.closest('.ch-sort-row') : document.querySelector('.ch-sort-row[data-type="' + type + '"]');
    if (row) row.querySelectorAll('.ch-chip').forEach(c => c.classList.toggle('active', c.dataset.sort === mode));
    chPaint(type);
}

function chPaint(type) {
    if (type === 'videos') paintChannelVideos();
    else if (type === 'feels') paintChannelFeels();
    else if (type === 'posts') paintChannelPosts();
}

let __chRepaintTimer = null;
function chScheduleRepaint(type) {
    if (__chState.sort[type] !== 'popular') return;
    clearTimeout(__chRepaintTimer);
    __chRepaintTimer = setTimeout(() => chPaint(type), 220);
}

function chFetchViews(list, labelPrefix, type, suffix) {
    if (!navigator.onLine) return;
    list.forEach(m => {
        db.ref(`movie_stats/${m.id}/views`).once('value', (vSnap) => {
            const count = Object.keys(vSnap.val() || {}).length;
            __chState.views[m.id] = count;
            const label = document.getElementById(labelPrefix + m.id);
            if (label) label.innerText = formatCount(count) + suffix;
            chScheduleRepaint(type);
        });
    });
}

function buildChannelVideoCard(v) {
    const views = formatCount(v.views || 0);
    const when = chRelTime(v.createdAt);
    return `
        <div class="ch-vcard" onclick="openMoviePage('${v.id}', false)">
            <div class="ch-vthumb">
                <img src="${v.poster || ''}" alt="" loading="lazy">
                <span class="ch-vdur">${escapeHTML(String(v.duration || '10:00'))}</span>
            </div>
            <div class="ch-vinfo">
                <h4 class="ch-vtitle">${escapeHTML(v.title || '')}</h4>
                <p class="ch-vmeta"><span id="chan-vid-views-${v.id}">${views}</span>${when ? ' · ' + when : ''}</p>
            </div>
            <button type="button" class="ch-more" aria-label="More" onclick="chOpenItemMenu(event,'${v.id}','video')">${__CH_DOTS}</button>
        </div>
    `;
}

function buildChannelShortCard(s) {
    return `
        <div class="ch-fcard" onclick="openMoviePage('${s.id}', false)">
            <img src="${s.poster || ''}" alt="" loading="lazy">
            <span class="ch-fviews"><span id="chan-short-views-${s.id}">${formatCount(s.views || 0)}</span> views</span>
            <button type="button" class="ch-fmore" aria-label="More" onclick="chOpenItemMenu(event,'${s.id}','feel')">${__CH_DOTS}</button>
        </div>
    `;
}

function buildChannelPostCard(p, username) {
    const gridClass = p.images && p.images.length === 1 ? 'grid-1' : p.images && p.images.length === 2 ? 'grid-2' : 'grid-3';
    const imagesHtml = p.images && p.images.length > 0 
        ? `<div class="post-image-grid ${gridClass}">${p.images.map(img => `<img src="${img}" style="border-radius:12px;">`).join('')}</div>`
        : '';
    return `
        <div class="post-card" style="margin-bottom:12px;">
            <div class="post-header">
                <div class="post-author-name">@${username}</div>
                <div class="post-time">${getRelativeTime(p.createdAt)}</div>
            </div>
            <div class="post-caption" style="margin-top: 8px;">${escapeHTML(p.caption)}</div>
            ${imagesHtml}
            <div style="display:flex; gap:16px; margin-top:12px; font-size:0.82rem; color:var(--text-muted); font-weight:700;">
                <span><i class="far fa-thumbs-up"></i> ${formatCount(p.likes || 0)}</span>
                <span><i class="far fa-comment"></i> ${formatCount(p.comments || 0)}</span>
            </div>
        </div>
    `;
}


function paintChannelVideos() {
    { const c = document.getElementById('channel-content-videos'); if (c) c.classList.remove('ch-offline'); }
    const grid = document.getElementById('channel-videos-grid');
    if (!grid) return;
    const list = chSortedList('videos');
    if (!list.length) {
        grid.innerHTML = '<p class="ch-empty">No uploaded videos yet.</p>';
    } else {
        grid.innerHTML = list.map(m => buildChannelVideoCard({
            id: m.id, title: m.title, duration: m.duration || '10:00',
            views: __chState.views[m.id] != null ? __chState.views[m.id] : (m.views || 0),
            poster: m.poster, createdAt: m.createdAt
        })).join('');
    }
    renderChannelUploadQueue('videos');
}

function paintChannelFeels() {
    { const c = document.getElementById('channel-content-feels'); if (c) c.classList.remove('ch-offline'); }
    const grid = document.getElementById('channel-feels-grid');
    if (!grid) return;
    const list = chSortedList('feels');
    if (!list.length) {
        grid.innerHTML = '<p class="ch-empty">No feels uploaded yet.</p>';
    } else {
        grid.innerHTML = list.map(m => buildChannelShortCard({
            id: m.id, poster: m.poster,
            views: __chState.views[m.id] != null ? __chState.views[m.id] : (m.views || 0)
        })).join('');
    }
    renderChannelUploadQueue('feels');
}

function paintChannelPosts() {
    { const c = document.getElementById('channel-content-posts'); if (c) c.classList.remove('ch-offline'); }
    const grid = document.getElementById('channel-posts-feed');
    if (!grid) return;
    const list = chSortedList('posts');
    if (!list.length) {
        grid.innerHTML = '<p class="ch-empty">No posts yet.</p>';
        return;
    }
    // Merge channel posts into allCommunityPosts so share/menu/reactions work identically to Home Page
    if (typeof allCommunityPosts !== 'undefined' && Array.isArray(allCommunityPosts)) {
        list.forEach(p => {
            if (p && p.id && !allCommunityPosts.some(x => x && String(x.id) === String(p.id))) {
                allCommunityPosts.push(p);
            }
        });
    }
    const uids = new Set();
    grid.innerHTML = list.map(p => {
        if (!p) return '';
        if (p.userId) uids.add(p.userId);
        if (typeof renderSinglePostSegmentUI === 'function') {
            return renderSinglePostSegmentUI(p);
        }
        return buildChannelPostCard({
            id: p.id, caption: p.caption, images: p.images || [],
            likes: p.likes || 0, comments: p.comments || 0, createdAt: p.createdAt
        }, p.username);
    }).join('');
    if (typeof bindLiveChannelUI === 'function') {
        uids.forEach(uid => bindLiveChannelUI(uid));
    }
}

function renderChannelVideos(userId) {
    const grid = document.getElementById('channel-videos-grid');
    if (!grid) return;
    if (activeChannelVideosListener) { activeChannelVideosListener.off(); }

    activeChannelVideosListener = db.ref('admin_panel/movies/user_uploads');
    activeChannelVideosListener.on('value', (snap) => {
        const data = snap.val();
        const list = data ? Object.values(data).filter(m => m && m.userId === userId && !m.isShort) : [];
        __chState.data.videos = list;
        const vidCount = document.getElementById('view-vid-count');
        if (vidCount) vidCount.innerText = list.length + " Video" + (list.length === 1 ? "" : "s");
        paintChannelVideos();
        chFetchViews(list, 'chan-vid-views-', 'videos', '');
    });
}

function renderChannelFeels(userId) {
    const grid = document.getElementById('channel-feels-grid');
    if (!grid) return;
    if (activeChannelFeelsListener) { activeChannelFeelsListener.off(); }

    activeChannelFeelsListener = db.ref('admin_panel/movies/feels');
    activeChannelFeelsListener.on('value', (snap) => {
        const data = snap.val();
        __chState.data.feels = data ? Object.values(data).filter(m => m && m.userId === userId) : [];
        paintChannelFeels();
        chFetchViews(__chState.data.feels, 'chan-short-views-', 'feels', '');
    });
}

function renderChannelPosts(userId) {
    const grid = document.getElementById('channel-posts-feed');
    if (!grid) return;
    if (activeChannelPostsListener) { activeChannelPostsListener.off(); }

    activeChannelPostsListener = db.ref('admin_panel/posts');
    activeChannelPostsListener.on('value', (snap) => {
        const data = snap.val();
        __chState.data.posts = data ? Object.values(data).filter(p => p && p.userId === userId) : [];
        paintChannelPosts();
    });
}

// ---- ••• popup for channel items (Play / Share / Copy link) ----
function chCloseItemMenu() {
    const m = document.getElementById('ch-item-menu');
    if (m) m.remove();
    document.removeEventListener('click', chCloseItemMenu, true);
}

function chOpenItemMenu(ev, id, kind) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    if (typeof playUI === 'function') playUI('click');
    chCloseItemMenu();
    const anchor = ev && ev.currentTarget ? ev.currentTarget : null;
    const r = anchor ? anchor.getBoundingClientRect() : { top: 80, bottom: 110, right: window.innerWidth - 12 };
    const menu = document.createElement('div');
    menu.id = 'ch-item-menu';
    menu.className = 'ch-menu';
    menu.innerHTML = '<button type="button" data-a="play">Play</button><button type="button" data-a="share">Share</button><button type="button" data-a="copy">Copy link</button>';
    document.body.appendChild(menu);
    const w = menu.offsetWidth, ph = menu.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.min(Math.max(12, r.right - w), vw - w - 12);
    let top = r.bottom + 6;
    if (top + ph > vh - 12) top = Math.max(12, r.top - ph - 6);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    requestAnimationFrame(() => menu.classList.add('open'));
    menu.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        e.stopPropagation();
        const act = btn.dataset.a;
        chCloseItemMenu();
        if (act === 'play') { openMoviePage(String(id), false); return; }
        const pool = (__chState.data.videos || []).concat(__chState.data.feels || []);
        const item = pool.find(x => String(x.id) === String(id)) || {};
        if (act === 'share') {
            const data = { title: item.title || 'Flaynity', text: item.title || 'Flaynity', url: location.href };
            if (navigator.share) navigator.share(data).catch(() => {});
            else if (navigator.clipboard) { navigator.clipboard.writeText(location.href); showNotification('Link copied', 'success'); }
        } else if (act === 'copy') {
            if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(() => showNotification('Link copied', 'success')).catch(() => {});
        }
    });
    setTimeout(() => document.addEventListener('click', chCloseItemMenu, true), 0);
}

function toggleFullDescription() {
    playUI('click');
    let data = currentChannelData;
    if (!data) return;

    const descText = document.getElementById('full-desc-text');
    const metaCategory = document.getElementById('desc-meta-category');
    const metaJoined = document.getElementById('desc-meta-joined');

    if (descText) descText.innerText = data.description || "No description provided yet.";
    if (metaCategory) metaCategory.innerText = data.category || "Gaming";
    
    const joinedDate = data.createdDate ? new Date(data.createdDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : "Unknown";
    if (metaJoined) metaJoined.innerText = joinedDate;

    AppNavigation.pushModal('desc-bottom-sheet');
}

function closeDescBottomSheet() {
    AppNavigation.pop();
}

function openAccountSwitcher() {
    playUI('click');
    // Switching accounts returns to the Welcome screen so the user can choose
    // Create Account or Log In, rather than remaining inside the current session.
    (async function openWelcomeForAccountSwitch() {
        // Set the flag before signOut so onAuthStateChanged bypasses the onboarding carousel.
        window.__flaynityDirectWelcomeAfterSwitch = true;
        // After the next successful sign-in, automatically return to this account's You page.
        window.__flaynityReturnToYouAfterAccountSwitch = true;
        try {
            if (auth && auth.currentUser) await auth.signOut();
        } catch (e) {
            window.__flaynityDirectWelcomeAfterSwitch = false;
            console.error('Unable to sign out before account switch:', e);
            showNotification('Could not switch account. Please try again.', 'error');
            return;
        }
        try {
            if (window.AppNavigation && typeof AppNavigation.popToRoot === 'function') AppNavigation.popToRoot();
        } catch (e) {}
        const appScreen = document.getElementById('app-screen');
        const authScreen = document.getElementById('auth-screen');
        if (appScreen) appScreen.style.display = 'none';
        if (authScreen) authScreen.style.display = 'flex';
        document.body.classList.add('auth-active');
        if (typeof window.authShowView === 'function') window.authShowView('welcome', true);
        else window.__flaynityDirectWelcomeAfterSwitch = false;
    })();
}

function closeAccountSwitcher() {
    AppNavigation.pop();
}

function renderAccountSwitcherList() {
    const container = document.getElementById('account-switcher-list-container');
    if (!container) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const savedAccounts = getSavedAccounts();
    let html = '';
    
    const activeEmail = currentUser.email;
    const activePhoto = currentUser.photoURL || '';
    const activeName = currentUser.displayName || currentUser.email.split('@')[0];
    const activeInitial = activeName.charAt(0).toUpperCase();

    html += `
        <div class="account-row active">
            <div class="account-avatar">
                ${activePhoto ? `<img src="${activePhoto}">` : activeInitial}
            </div>
            <div class="account-meta">
                <h4>${activeName} (Current)</h4>
                <p>${activeEmail}</p>
            </div>
            <i class="fas fa-check-circle check-active" style="display: block;"></i>
        </div>
    `;

    savedAccounts.forEach(acc => {
        if (acc.email !== activeEmail) {
            const initial = acc.displayName.charAt(0).toUpperCase();
            html += `
                <div class="account-row" onclick="switchSession('${acc.email}')">
                    <div class="account-avatar">
                        ${acc.photoURL ? `<img src="${acc.photoURL}">` : initial}
                    </div>
                    <div class="account-meta">
                        <h4>${acc.displayName}</h4>
                        <p>${acc.email}</p>
                    </div>
                    <i class="fas fa-check-circle check-active"></i>
                </div>
            `;
        }
    });

    html += `
        <div class="account-row add-acc" onclick="handleAddAccountGoogle()">
            <div class="account-avatar-add"><i class="fas fa-plus"></i></div>
            <div class="account-meta">
                <h4 style="color: var(--primary);">Add Account</h4>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

async function switchSession(email) {
    playUI('click');
    showNotification("Switching account...", "success");

    // Both Android Google Sign-In and browser popup sign-in must trigger the
    // same automatic You-page refresh after Firebase confirms the new UID.
    window.__flaynityReturnToYouAfterAccountSwitch = true;

    if (window.AndroidBridge && typeof window.AndroidBridge.triggerGoogleSignIn === 'function') {
        window.__flaynityAccountSwitchShouldOpenChannel = false;
        window.AndroidBridge.triggerGoogleSignIn();
        AppNavigation.pop();
    } else {
        try {
            await auth.signOut();
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({
                prompt: 'select_account',
                login_hint: email
            });
            const result = await auth.signInWithPopup(provider);
            saveAccountToList(result.user);
            AppNavigation.pop();
            showNotification("Switched successfully!", "success");
            SyncManager.refreshEverything();
            // The auth-state handler owns the UID-safe You page/channel refresh.
            // Do not render here as well: that creates competing page transitions.
        } catch (err) {
            window.__flaynityReturnToYouAfterAccountSwitch = false;
            window.__flaynityAccountSwitchShouldOpenChannel = false;
            showNotification("Failed to switch: " + err.message, "error");
        }
    }
}

async function handleAddAccountGoogle() {
    playUI('click');
    try { localStorage.removeItem('flaynity-verify-pending'); } catch (e) {}
    if (window.AndroidBridge && typeof window.AndroidBridge.triggerGoogleSignIn === 'function') {
        window.AndroidBridge.triggerGoogleSignIn();
        AppNavigation.pop();
    } else {
        try {
            await authApplyPersistence();
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await auth.signInWithPopup(provider);
            saveAccountToList(result.user);
            const isNew = !!(result.additionalUserInfo && result.additionalUserInfo.isNewUser);
            __flTriggerPostAuthTransition(result.user, isNew ? 'signup' : 'login');
        } catch (err) {
            showNotification(authFriendlyError(err), "error");
        }
    }
}

function updateBottomNavAvatar() {
    const navAvatarContainer = document.getElementById('nav-avatar-img');
    if (!navAvatarContainer) return;
    const currentUser = auth.currentUser;
    if (currentUser) {
        const photoURL = flNavChannelAvatarUrl() || currentUser.photoURL || '';
        if (photoURL) {
            flSetNavAvatar(photoURL);
        } else {
            navAvatarContainer.innerHTML = `<div style="background: linear-gradient(135deg, var(--primary), #FF7A00); color: white; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.75rem;">${currentUser.email ? currentUser.email.charAt(0).toUpperCase() : 'U'}</div>`;
        }
    } else {
        // Offline / auth এখনও restore হয়নি: cached avatar, না থাকলে default You আইকন।
        flSetNavAvatar(flNavChannelAvatarUrl());
    }
}

function openAnalyticsPage() {
    playUI('click');
    // Analytics is a self-contained page (pages/analytics.html) that listens to Firebase in realtime while open.
    AppNavigation.pushPage('analytics-page');
}

// =========================================================
// PARTNER MONETIZATION MATH ENGINE & STATS
// =========================================================
async function calculateChannelAnalytics() {
    const userId = auth.currentUser.uid;
    let tViews = 0, tLikes = 0, tComments = 0;
    let vCount = 0, sCount = 0, pCount = 0;
    let longViews = 0, feelsViews = 0;

    if(navigator.onLine) {
        const vSnap = await db.ref('admin_panel/movies/user_uploads').once('value');
        if (vSnap.exists()) {
            const vData = Object.values(vSnap.val()).filter(m => m.userId === userId && !m.isShort);
            vCount = vData.length;
            for (let m of vData) {
                const statSnap = await db.ref(`movie_stats/${m.id}`).once('value');
                const stat = statSnap.val() || {};
                const viewsCount = Object.keys(stat.views || {}).length;
                tViews += viewsCount;
                longViews += viewsCount;
                tLikes += Object.keys(stat.likes || {}).length;

                const commSnap = await db.ref(`movie_comments/${m.id}`).once('value');
                tComments += commSnap.exists() ? Object.keys(commSnap.val()).length : 0;
            }
        }

        const sSnap = await db.ref('admin_panel/movies/feels').once('value');
        if (sSnap.exists()) {
            const sData = Object.values(sSnap.val()).filter(m => m.userId === userId);
            sCount = sData.length;
            for (let m of sData) {
                const statSnap = await db.ref(`movie_stats/${m.id}`).once('value');
                const stat = statSnap.val() || {};
                const viewsCount = Object.keys(stat.views || {}).length;
                tViews += viewsCount;
                feelsViews += viewsCount;
                tLikes += Object.keys(stat.likes || {}).length;

                const commSnap = await db.ref(`movie_comments/${m.id}`).once('value');
                tComments += commSnap.exists() ? Object.keys(commSnap.val()).length : 0;
            }
        }

        const pSnap = await db.ref('admin_panel/posts').once('value');
        if (pSnap.exists()) {
            pCount = Object.values(pSnap.val()).filter(p => p.userId === userId).length;
        }
    }

    const calculatedRevenue = ((longViews / 1000) * 0.30) + ((feelsViews / 1000) * 0.15);
    const estRevenueElement = document.getElementById('estimated-revenue-val');
    if (estRevenueElement) {
        estRevenueElement.innerText = '$' + calculatedRevenue.toFixed(2) + ' USDT';
    }

    const watchHours = parseFloat(((longViews * 3.5) / 60).toFixed(1)) || 0;
    const totalViews = longViews + feelsViews;
    const subsCount = currentChannelData ? (currentChannelData.subscribersCount || 0) : 0;

    const viewsVal = document.getElementById('anal-views');
    const subsVal = document.getElementById('anal-subs');
    const watchVal = document.getElementById('anal-watchtime');
    const likesVal = document.getElementById('anal-likes');
    const commentsVal = document.getElementById('anal-comments');
    const contentVal = document.getElementById('anal-content');

    if (viewsVal) viewsVal.innerText = formatCount(tViews);
    if (subsVal) subsVal.innerText = formatCount(subsCount);
    if (watchVal) watchVal.innerText = watchHours; 
    if (likesVal) likesVal.innerText = formatCount(tLikes);
    if (commentsVal) commentsVal.innerText = formatCount(tComments);
    if (contentVal) contentVal.innerText = (vCount + sCount + pCount);

    const avatarEl = document.getElementById('analytics-channel-avatar');
    const nameEl = document.getElementById('analytics-channel-name');
    const infoEl = document.getElementById('analytics-channel-subscribers');

    if (avatarEl) avatarEl.src = currentChannelData ? (currentChannelData.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=300&auto=format&fit=crop") : "";
    if (nameEl) nameEl.innerText = currentChannelData ? currentChannelData.channelName : "Channel";
    if (infoEl) infoEl.innerText = formatCount(subsCount) + " Subscribers";

    updateMonetizationEligibility(subsCount, watchHours, totalViews);
    renderChart(tViews);

    if (navigator.onLine) {
        const analyticsPayload = {
            totalSubscribers: subsCount,
            totalViews: tViews,
            publicWatchHours: watchHours,
            publicFeelsViews: feelsViews,
            publicLongVideoViews: longViews,
            totalLikes: tLikes,
            totalComments: tComments,
            totalVideos: vCount,
            totalFeels: sCount,
            totalPosts: pCount,
            totalRevenue: calculatedRevenue.toFixed(2),
            updatedAt: Date.now()
        };
        await db.ref(`channel_analytics/${userId}`).set(analyticsPayload);
    }
}

// =========================================================
// MONETIZATION WORKFLOW ENGINE
// =========================================================
function openMonetizationPage() {
    playUI('click');
    const dateSpan = document.getElementById('eligibility-date-val');
    if (dateSpan) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        dateSpan.innerText = new Date().toLocaleDateString('en-US', options);
    }
    AppNavigation.pushPage('monetization-page');
}

function updateMonetizationEligibility(subs, hours, views) {
    const targetSubs = 500;
    const subPct = Math.min(100, (subs / targetSubs) * 100);
    const reqSubsTxt = document.getElementById('req-subs-txt');
    const reqSubsBar = document.getElementById('req-subs-bar');
    if (reqSubsTxt) reqSubsTxt.innerText = `${subs} / ${targetSubs}`;
    if (reqSubsBar) reqSubsBar.style.width = `${subPct}%`;

    const targetHours = 50;
    const hourPct = Math.min(100, (hours / targetHours) * 100);
    const reqHoursTxt = document.getElementById('req-hours-txt');
    const reqHoursBar = document.getElementById('req-hours-bar');
    if (reqHoursTxt) reqHoursTxt.innerText = `${hours} / ${targetHours} Hours`;
    if (reqHoursBar) reqHoursBar.style.width = `${hourPct}%`;

    const targetViews = 10000;
    const viewPct = Math.min(100, (views / targetViews) * 100);
    const reqViewsTxt = document.getElementById('req-views-txt');
    const reqViewsBar = document.getElementById('req-views-bar');
    if (reqViewsTxt) reqViewsTxt.innerText = `${formatCount(views)} / 10K`;
    if (reqViewsBar) reqViewsBar.style.width = `${viewPct}%`;

    const applyBtn = document.getElementById('btn-monetization-apply');
    if (applyBtn) {
        if (subs >= targetSubs && hours >= targetHours && views >= targetViews) {
            applyBtn.disabled = false;
            applyBtn.style.background = "var(--primary)";
            applyBtn.style.cursor = "pointer";
        } else {
            applyBtn.disabled = true;
            applyBtn.style.background = "#CBD5E1";
            applyBtn.style.cursor = "not-allowed";
        }
    }
}

function handleMonetizationApply() {
    playUI('success');
    const modal = document.getElementById('eligibility-success-modal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.style.display = 'none';
            executeBackAction();
        }, 3000);
    }
}

function renderChart(totalViews) {
    const bars = document.querySelectorAll('.chart-bar');
    const distribution = [0.05, 0.1, 0.15, 0.25, 0.45, 1.0];
    bars.forEach((bar, index) => {
        const factor = distribution[index];
        const currentVal = Math.round(totalViews * factor);
        bar.setAttribute('data-lbl', bar.getAttribute('data-lbl').split(' ')[0]); 
        const valEl = bar.querySelector('.bar-val');
        if (valEl) valEl.innerText = formatCount(currentVal);
        
        const heightPct = Math.max(15, Math.round(factor * 100));
        bar.style.height = heightPct + "%";
    });
}

function openEditChannelPage() {
    playUI('click');
    let data = currentChannelData;
    if (!data) return;

    tempEditAvatarUrl = data.avatarUrl;
    tempEditBannerUrl = data.bannerUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2000&auto=format&fit=crop";

    const previewBanner = document.getElementById('edit-channel-banner-img');
    const previewAvatar = document.getElementById('edit-avatar-img');
    const inputName = document.getElementById('edit-channel-name');
    const inputHandle = document.getElementById('edit-channel-handle');
    const inputDesc = document.getElementById('edit-channel-desc');
    const inputCategory = document.getElementById('edit-channel-category');
    const descCounter = document.getElementById('edit-desc-counter');
    const handleFeedback = document.getElementById('edit-handle-feedback');
    const saveBtn = document.getElementById('btn-save-edit');

    if (previewBanner) previewBanner.src = tempEditBannerUrl;
    if (previewAvatar) previewAvatar.src = tempEditAvatarUrl;
    if (inputName) inputName.value = data.channelName;
    if (inputHandle) inputHandle.value = data.handle;
    if (inputDesc) inputDesc.value = data.description || "";
    if (inputCategory) inputCategory.value = data.category || "Gaming";
    if (typeof window.setEditChannelPrivacy === 'function') {
        window.setEditChannelPrivacy((data.privacy === 'private' || data.isPrivate === true) ? 'private' : 'public');
    }
    if (descCounter) descCounter.innerText = (data.description || "").length;
    if (handleFeedback) handleFeedback.innerHTML = "";
    if (saveBtn) saveBtn.disabled = false;

    AppNavigation.pushPage('edit-channel-page');
}

function updateDescCounter(val) {
    const counter = document.getElementById('edit-desc-counter');
    if (counter) counter.innerText = val.length;
}

async function saveChannelEdits() {
    playUI('click');
    const inputName = document.getElementById('edit-channel-name');
    const inputHandle = document.getElementById('edit-channel-handle');
    const inputDesc = document.getElementById('edit-channel-desc');
    const inputCategory = document.getElementById('edit-channel-category');
    const btn = document.getElementById('btn-save-edit');

    const name = inputName ? inputName.value.trim() : "";
    const handle = inputHandle ? inputHandle.value.trim().toLowerCase().replace('@', '') : "";
    const desc = inputDesc ? inputDesc.value.trim() : "";
    const category = inputCategory ? inputCategory.value : "Others";

    if (!name || !handle) {
        showNotification("Please enter name and handle", "error");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    }

    try {
        if (handle !== currentChannelData.handle) {
            const snap = await db.ref(`handles/${handle}`).once('value');
            if (snap.exists()) {
                showNotification("Handle already taken. Choose another.", "error");
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = "Save Changes";
                }
                return;
            }
            await db.ref(`handles/${currentChannelData.handle}`).remove();
            await db.ref(`handles/${handle}`).set(auth.currentUser.uid);
        }

        const privacyInput = document.getElementById('edit-channel-privacy');
        const privacyVal = (privacyInput && privacyInput.value === 'private') ? 'private' : 'public';
        const updatedData = {
            ...currentChannelData,
            channelName: name,
            handle: handle,
            description: desc,
            category: category,
            privacy: privacyVal,
            isPrivate: privacyVal === 'private',
            avatarUrl: tempEditAvatarUrl,
            bannerUrl: tempEditBannerUrl,
            updatedDate: Date.now()
        };

        await db.ref(`channels/${auth.currentUser.uid}`).set(updatedData);
        currentChannelData = updatedData;
        try { localStorage.setItem('flaynity_user_session_cache', JSON.stringify(updatedData)); flSetNavAvatar(flAvatarFromChannel(updatedData)); flCacheNavAvatar(flAvatarFromChannel(updatedData)); } catch (e) {}

        showNotification("Channel Successfully Updated!", "success");
        AppNavigation.pop(); 
        openViewChannelPage();
        initYouTabUI();
    } catch(err) {
        showNotification("Update Failed: " + err.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = "Save Changes";
        }
    }
}

// =========================================
// FULL SCREEN IMAGE PREVIEW LIGHTBOX
// =========================================
function openFullScreenImagePreview(src) {
    playUI('click');
    const img = document.getElementById('full-image-preview-el');
    if (img) {
        img.src = src;
    }
    AppNavigation.pushModal('full-image-preview-overlay');
}

function closeFullScreenImagePreview() {
    AppNavigation.pop();
}

// =========================================================
// FACEBOOK REACTION EVENT CONTROLLERS
// =========================================================
const FB_RX = {"like": "<svg viewBox=\"0 0 100 100\"><g class=\"rx-all\"><circle cx=\"50\" cy=\"50\" r=\"50\" fill=\"url(#rxBlue)\"/><g class=\"rx-thumb\"><g transform=\"translate(24.5 23.5) scale(2.1)\"><path fill=\"#fff\" d=\"M3,11h3v10H3V11z M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11v10h10.43c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z\"/></g></g></g></svg>", "love": "<svg viewBox=\"0 0 100 100\"><g class=\"rx-all\"><circle cx=\"50\" cy=\"50\" r=\"50\" fill=\"url(#rxRed)\"/><g class=\"rx-heart\"><path fill=\"#fff\" d=\"M50 73C27 58 22 44 27 35C32 27 44 27 50 36C56 27 68 27 73 35C78 44 73 58 50 73Z\"/></g></g></svg>", "care": "<svg viewBox=\"0 0 100 100\"><g class=\"rx-all\"><circle cx=\"50\" cy=\"50\" r=\"50\" fill=\"url(#rxFace)\"/><path class=\"rx-brow\" d=\"M24 29Q33 22 42 28M58 28Q67 22 76 29\" fill=\"none\" stroke=\"#D9721A\" stroke-width=\"4\" stroke-linecap=\"round\"/><g class=\"rx-eye\" style=\"transform-origin:35px 42px\"><ellipse cx=\"35\" cy=\"42\" rx=\"6.3\" ry=\"6\" fill=\"#2B3050\"/><circle cx=\"36.8\" cy=\"39.3\" r=\"2.3\" fill=\"#fff\"/></g><g class=\"rx-eye\" style=\"transform-origin:65px 42px\"><ellipse cx=\"65\" cy=\"42\" rx=\"6.3\" ry=\"6\" fill=\"#2B3050\"/><circle cx=\"66.8\" cy=\"39.3\" r=\"2.3\" fill=\"#fff\"/></g><path d=\"M43 52Q50 57 57 52\" fill=\"none\" stroke=\"#5B2A1A\" stroke-width=\"3.2\" stroke-linecap=\"round\"/><g class=\"rx-hug\"><ellipse cx=\"13\" cy=\"71\" rx=\"9\" ry=\"7\" fill=\"#FDC14A\" stroke=\"#E79A22\" stroke-width=\"1.5\"/><path fill=\"url(#rxHeart)\" d=\"M34 92C16 80 13 68 17 62C21 56 30 57 34 63C38 57 47 56 51 62C55 68 52 80 34 92Z\"/><ellipse cx=\"55\" cy=\"73\" rx=\"9\" ry=\"7\" fill=\"#FDC14A\" stroke=\"#E79A22\" stroke-width=\"1.5\"/></g></g></svg>", "haha": "<svg viewBox=\"0 0 100 100\"><g class=\"rx-all\"><circle cx=\"50\" cy=\"50\" r=\"50\" fill=\"url(#rxFace)\"/><path d=\"M24 41Q33 30 42 41M58 41Q67 30 76 41\" fill=\"none\" stroke=\"#2B3050\" stroke-width=\"4.8\" stroke-linecap=\"round\"/><g class=\"rx-mouth-l\"><path d=\"M23 54Q50 50 77 54Q75 83 50 85Q25 83 23 54Z\" fill=\"url(#rxMouth)\"/><path d=\"M33 74Q50 66 67 74Q60 84 50 84Q40 84 33 74Z\" fill=\"#FF7A8A\"/></g></g></svg>", "wow": "<svg viewBox=\"0 0 100 100\"><g class=\"rx-all\"><circle cx=\"50\" cy=\"50\" r=\"50\" fill=\"url(#rxFace)\"/><path class=\"rx-brow\" d=\"M24 29Q33 21 42 28M58 28Q67 21 76 29\" fill=\"none\" stroke=\"#D9721A\" stroke-width=\"4\" stroke-linecap=\"round\"/><g class=\"rx-eye\" style=\"transform-origin:35px 46px\"><ellipse cx=\"35\" cy=\"46\" rx=\"6.3\" ry=\"8\" fill=\"#2B3050\"/><circle cx=\"36.8\" cy=\"42.4\" r=\"2.3\" fill=\"#fff\"/></g><g class=\"rx-eye\" style=\"transform-origin:65px 46px\"><ellipse cx=\"65\" cy=\"46\" rx=\"6.3\" ry=\"8\" fill=\"#2B3050\"/><circle cx=\"66.8\" cy=\"42.4\" r=\"2.3\" fill=\"#fff\"/></g><ellipse class=\"rx-mouth-o\" cx=\"50\" cy=\"71\" rx=\"8\" ry=\"11\" fill=\"url(#rxMouth)\"/></g></svg>", "sad": "<svg viewBox=\"0 0 100 100\"><g class=\"rx-all\"><circle cx=\"50\" cy=\"50\" r=\"50\" fill=\"url(#rxFace)\"/><path class=\"rx-brow\" d=\"M23 37Q33 33 42 26M58 26Q67 33 77 37\" fill=\"none\" stroke=\"#D9721A\" stroke-width=\"4\" stroke-linecap=\"round\"/><g class=\"rx-eye\" style=\"transform-origin:35px 49px\"><ellipse cx=\"35\" cy=\"49\" rx=\"6.3\" ry=\"6.6\" fill=\"#2B3050\"/><circle cx=\"36.8\" cy=\"46.0\" r=\"2.3\" fill=\"#fff\"/></g><g class=\"rx-eye\" style=\"transform-origin:65px 49px\"><ellipse cx=\"65\" cy=\"49\" rx=\"6.3\" ry=\"6.6\" fill=\"#2B3050\"/><circle cx=\"66.8\" cy=\"46.0\" r=\"2.3\" fill=\"#fff\"/></g><path d=\"M40 70Q50 61 60 70\" fill=\"none\" stroke=\"#5B2A1A\" stroke-width=\"3.6\" stroke-linecap=\"round\"/><path class=\"rx-tear\" d=\"M74 54C74 54 67 62 67 67A7 7 0 0 0 81 67C81 62 74 54 74 54Z\" fill=\"#6EC3FF\"/></g></svg>", "angry": "<svg viewBox=\"0 0 100 100\"><g class=\"rx-all\"><circle cx=\"50\" cy=\"50\" r=\"50\" fill=\"url(#rxAng)\"/><path class=\"rx-brow\" d=\"M21 31L44 41M79 31L56 41\" fill=\"none\" stroke=\"#B2380F\" stroke-width=\"5.5\" stroke-linecap=\"round\"/><g class=\"rx-eye\" style=\"transform-origin:36px 52px\"><ellipse cx=\"36\" cy=\"52\" rx=\"6.3\" ry=\"5.8\" fill=\"#2B3050\"/><circle cx=\"37.8\" cy=\"49.4\" r=\"2.3\" fill=\"#fff\"/></g><g class=\"rx-eye\" style=\"transform-origin:64px 52px\"><ellipse cx=\"64\" cy=\"52\" rx=\"6.3\" ry=\"5.8\" fill=\"#2B3050\"/><circle cx=\"65.8\" cy=\"49.4\" r=\"2.3\" fill=\"#fff\"/></g><path d=\"M38 72Q50 64 62 72\" fill=\"none\" stroke=\"#5B2A1A\" stroke-width=\"4\" stroke-linecap=\"round\"/></g></svg>"};
function fbRxSvg(t){ return FB_RX[t] || ""; }
const FB_RX_ORDER = ["like","love","care","haha","wow","sad","angry"];

let reactionActivePostId = null;
let _rx = null;
let _rxLastTouchAt = 0;
let _rxSuppressClickUntil = 0;

function fbRxFill() {
    const picker = document.getElementById('fb-reaction-picker');
    if (!picker) return;
    picker.querySelectorAll('.fb-rx').forEach(c => { if (!c.firstChild) c.innerHTML = fbRxSvg(c.dataset.type); });
}

function fbRxPoint(e) {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
}

function fbRxCleanup() {
    if (!_rx) return;
    clearTimeout(_rx.timer);
    document.removeEventListener('touchmove', _rx.onMove, { passive: false });
    document.removeEventListener('mousemove', _rx.onMove);
    document.removeEventListener('touchend', _rx.onEnd);
    document.removeEventListener('touchcancel', _rx.onEnd);
    document.removeEventListener('mouseup', _rx.onEnd);
    _rx = null;
}

function startReactionTimer(postId, e, ctx) {
    const isTouch = e.type === 'touchstart';
    if (isTouch) _rxLastTouchAt = Date.now();
    else if (Date.now() - _rxLastTouchAt < 900) return;
    if (isTouch && e.touches && e.touches.length > 1) return;
    fbRxCleanup();
    const pt = fbRxPoint(e);
    const btn = e.target && e.target.closest ? e.target.closest('.post-action-btn-fb') : null;
    reactionActivePostId = postId;
    const st = { postId, ctx: ctx || '', btn, sx: pt.x, sy: pt.y, open: false, moved: false, hover: null, ox: 0, oy: 0 };
    st.onMove = (ev) => {
        const p = fbRxPoint(ev);
        if (!st.open) {
            if (Math.hypot(p.x - st.sx, p.y - st.sy) > 10) fbRxCleanup();
            return;
        }
        if (ev.cancelable) ev.preventDefault();
        if (Math.hypot(p.x - st.ox, p.y - st.oy) > 8) st.moved = true;
        if (st.moved) fbRxHover(p);
    };
    st.onEnd = (ev) => {
        if (!st.open) { fbRxCleanup(); return; }
        if (ev.cancelable) ev.preventDefault();
        _rxSuppressClickUntil = Date.now() + 600;
        const hover = st.hover, moved = st.moved;
        fbRxCleanup();
        if (hover) selectPostReaction(hover);
        else if (moved) { const c = AppNavigation.current(); if (c && c.type === 'modal' && c.id === 'fb-reaction-picker') AppNavigation.pop(); }
    };
    st.timer = setTimeout(() => fbRxOpen(st), 380);
    _rx = st;
    document.addEventListener('touchmove', st.onMove, { passive: false });
    document.addEventListener('mousemove', st.onMove);
    document.addEventListener('touchend', st.onEnd);
    document.addEventListener('touchcancel', st.onEnd);
    document.addEventListener('mouseup', st.onEnd);
}

function clearReactionTimer() { /* handled by document-level listeners */ }

function fbRxOpen(st) {
    const picker = document.getElementById('fb-reaction-picker');
    if (!picker || _rx !== st) return;
    fbRxFill();
    st.open = true; st.ox = st.sx; st.oy = st.sy;
    picker.dataset.postId = st.postId;
    picker.dataset.ctx = st.ctx || '';
    picker.classList.remove('open', 'picking', 'has-hover');
    picker.querySelectorAll('.fb-rx').forEach(c => c.classList.remove('on', 'picked'));
    picker.style.visibility = 'hidden';
    try { triggerHapticFeedback(); } catch (e) {}
    AppNavigation.pushModal('fb-reaction-picker');
    requestAnimationFrame(() => {
        const rect = st.btn ? st.btn.getBoundingClientRect() : { top: st.sy - 20, bottom: st.sy + 20 };
        const ph = picker.offsetHeight;
        let top = rect.top - ph - 14;
        if (top < window.innerWidth * 0.12) top = rect.bottom + 12;
        picker.style.top = top + 'px';
        picker.style.visibility = 'visible';
        void picker.offsetWidth;
        picker.classList.add('open');
    });
}

function fbRxHover(p) {
    const picker = document.getElementById('fb-reaction-picker');
    if (!picker || !_rx) return;
    const r = picker.getBoundingClientRect();
    const pad = r.width * 0.0176;
    let idx = null;
    if (p.x >= r.left && p.x <= r.right && p.y > r.top - 140 && p.y < r.bottom + 70) {
        idx = Math.max(0, Math.min(6, Math.floor((p.x - r.left - pad) / ((r.width - pad * 2) / 7))));
    }
    const type = idx === null ? null : FB_RX_ORDER[idx];
    if (type === _rx.hover) return;
    _rx.hover = type;
    picker.classList.toggle('has-hover', type !== null);
    picker.querySelectorAll('.fb-rx').forEach(c => c.classList.toggle('on', c.dataset.type === type));
    if (type) { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }
}

document.addEventListener('click', (e) => {
    const picker = document.getElementById('fb-reaction-picker');
    if (picker && picker.style.display === 'flex') {
        if (!picker.contains(e.target) && !e.target.closest('.post-action-btn-fb')) {
            const current = AppNavigation.current();
            if (current && current.type === 'modal' && current.id === 'fb-reaction-picker') {
                AppNavigation.pop();
            }
        }
    }
});

const reactionEmojis = {
    'love': '❤️', 'like': '👍', 'care': '🥰', 'haha': '😆', 'wow': '😮', 'sad': '😭', 'angry': '😡'
};
const reactionLabels = {
    'love': 'Love', 'like': 'Like', 'care': 'Care', 'haha': 'Haha', 'wow': 'Wow', 'sad': 'Sad', 'angry': 'Angry'
};
const reactionColors = {
    'love': '#FF2E55', 'like': '#007AFF', 'care': '#FF9500', 'haha': '#FFCC00', 'wow': '#FFCC00', 'sad': '#FF9500', 'angry': '#FF3B30'
};

function selectPostReaction(type) {
    const picker = document.getElementById('fb-reaction-picker');
    if (!picker) return;
    const postId = picker.dataset.postId;
    if (!postId || picker.classList.contains('picking')) return;
    const cell = picker.querySelector(`.fb-rx[data-type="${type}"]`);
    picker.classList.add('picking');
    if (cell) cell.classList.add('picked');
    if (picker.dataset.ctx === 'comment') fbcmSetReaction(postId, type); else submitPostReaction(postId, type);
    setTimeout(() => {
        const c = AppNavigation.current();
        if (c && c.type === 'modal' && c.id === 'fb-reaction-picker') AppNavigation.pop();
        picker.classList.remove('picking', 'has-hover', 'open');
        if (cell) cell.classList.remove('picked');
    }, 280);
}

function handleLoveSingleClick(postId) {
    if (Date.now() < _rxSuppressClickUntil) return;
    if (!auth.currentUser) {
        showNotification("Please sign in to react", "error");
        return;
    }
    if(!navigator.onLine) {
        showNotification("Cannot react to posts while offline.", "error");
        return;
    }
    const userId = auth.currentUser.uid;
    if (fxIsVideoId(postId)) { fxToggleVideoLike(postId, false); return; }
    db.ref(`post_reactions/${postId}/${userId}`).once('value', (snap) => {
        if (snap.exists()) {
            db.ref(`post_reactions/${postId}/${userId}`).remove();
        } else {
            submitPostReaction(postId, 'like');
        }
    });
}

async function submitPostReaction(postId, type, silent) {
    if (!auth.currentUser) {
        showNotification("Please sign in to react", "error");
        return;
    }
    const userId = auth.currentUser.uid;
    const userSnap = await db.ref(`users/${userId}`).once('value');
    const uData = userSnap.val() || {};
    const username = uData.username || auth.currentUser.email.split('@')[0];
    const avatar = currentChannelData?.avatarUrl || auth.currentUser.photoURL || "";

    await db.ref(`post_reactions/${postId}/${userId}`).set({
        type: type,
        username: username,
        avatar: avatar,
        timestamp: Date.now()
    });
    try { db.ref(`movie_stats/${postId}/dislikes/${userId}`).remove().catch(() => {}); } catch (e) {}
    if (fxIsVideoId(postId)) { try { db.ref(`movie_stats/${postId}/likes/${userId}`).set(true).catch(() => {}); } catch (e) {} }

    if (!silent) triggerFloatingReaction(type);
}

function triggerFloatingReaction(type) {
    if (!fbRxSvg(type)) return;

    const floatEl = document.createElement('div');
    floatEl.className = 'floating-emoji rx-float';
    floatEl.innerHTML = fbRxSvg(type);
    floatEl.style.left = `${window.innerWidth / 2 - 32}px`;
    floatEl.style.top = `${window.innerHeight - 150}px`;

    document.body.appendChild(floatEl);
    triggerHapticFeedback();

    setTimeout(() => { floatEl.remove(); }, 1200);
}

// Latest Firebase data per post. The feed DOM is rebuilt often (refresh, new data,
// entering the page again), so every rebuild repaints from this cache instead of
// waiting for Firebase to fire again.
const _postReactionCache = {};

function paintPostReactions(postId) {
    const c = _postReactionCache[postId];
    if (!c) return;
    // Paint EVERY element carrying these ids (a video can be on Home and on the Watch page at once).
    const all = (id) => document.querySelectorAll(`[id="${id}"]`);

    let reactionsAll = c.reactions;
    if (_fxMovieLikes[postId]) {
        const merged = {};
        Object.keys(_fxMovieLikes[postId]).forEach(u => { merged[u] = { type: 'like' }; });
        reactionsAll = Object.assign(merged, reactionsAll || {});
    }
    if (reactionsAll) {
        const reactions = reactionsAll;
        const totalReactions = Object.keys(reactions).length;

        const reactionCounts = { love: 0, like: 0, care: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
        Object.values(reactions).forEach(r => {
            if (r && r.type && reactionCounts[r.type] !== undefined) reactionCounts[r.type]++;
        });
        const sortedTypes = Object.keys(reactionCounts)
            .filter(t => reactionCounts[t] > 0)
            .sort((a, b) => reactionCounts[b] - reactionCounts[a])
            .slice(0, 3);

        const badgesHtml = fbReactionBadgesHTML(sortedTypes);
        all(`post-top-emojis-${postId}`).forEach(el => { el.innerHTML = badgesHtml; });
        all(`post-total-reactions-${postId}`).forEach(el => { el.innerText = formatCount(totalReactions); });

        const myReact = (auth.currentUser && reactions[auth.currentUser.uid]) || null;
        const hasMine = !!(myReact && myReact.type && fbRxSvg(myReact.type));
        all(`love-icon-${postId}`).forEach(loveIcon => {
            loveIcon.className = 'love-icon-element';
            if (hasMine) {
                loveIcon.innerHTML = fbRxSvg(myReact.type);
                loveIcon.style.fontSize = '1.25rem';
            } else {
                loveIcon.innerHTML = loveIcon.dataset.fxHeart ? FX_HEART_SVG : FB_LIKE_SVG;
                loveIcon.style.fontSize = '';
            }
        });
        all(`love-text-${postId}`).forEach(loveText => {
            if (hasMine) {
                loveText.innerText = reactionLabels[myReact.type];
                loveText.style.color = reactionColors[myReact.type];
            } else {
                loveText.innerText = 'Love';
                loveText.style.color = '';
            }
        });
    }

    if (typeof fbcmPaintHead === 'function') fbcmPaintHead(postId);

    if (c.commentCount !== undefined) {
        all(`post-total-comments-${postId}`).forEach(el => { el.innerText = formatCount(c.commentCount); });
    }
    try { fxPaintPlayLikes(postId); } catch (e) {}
}

function registerPostReactionsListener(postId) {
    // Already listening: just repaint the (possibly new) DOM from the cache.
    if (_boundPostReactionListeners[postId]) {
        paintPostReactions(postId);
        return;
    }
    _boundPostReactionListeners[postId] = true;
    if (!_postReactionCache[postId]) _postReactionCache[postId] = {};

    db.ref(`post_reactions/${postId}`).on('value', (snapshot) => {
        _postReactionCache[postId].reactions = snapshot.val() || {};
        paintPostReactions(postId);
    });

    db.ref(`movie_comments/${postId}`).on('value', (snapshot) => {
        _postReactionCache[postId].commentCount = Object.keys(snapshot.val() || {}).length;
        paintPostReactions(postId);
    });
}

// Auth is often restored AFTER the feed renders (page refresh): repaint so "my reaction" shows up.
try {
    auth.onAuthStateChanged(() => {
        Object.keys(_postReactionCache).forEach(paintPostReactions);
    });
} catch (e) {}

function openCommentsForPost(postId) {
    playUI('click');
    const postObj = allCommunityPosts.find(p => p.id === postId);
    if (!postObj) return;
    currentActiveMovie = postObj;
    openCommentModal();
    registerViewAndListen(postId);
}

// =========================================
// ALL PEOPLE REACTED PAGE IMPLEMENTATION
// =========================================
let activeReactedPostId = null;
let activeReactedFilter = 'all';

function openReactedPeoplePage(postId) {
    playUI('click');
    activeReactedPostId = postId;
    activeReactedFilter = 'all';
    loadReactedPeopleData();
    AppNavigation.pushPage('reacted-people-page');
}

function selectReactedFilter(type) {
    playUI('click');
    activeReactedFilter = type;
    loadReactedPeopleData();
}

function loadReactedPeopleData() {
    const postId = activeReactedPostId;
    if (!postId) return;

    db.ref(`post_reactions/${postId}`).once('value', (snapshot) => {
        const reactions = snapshot.val() || {};
        
        const reactionCounts = { all: 0, love: 0, like: 0, care: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
        const groupedUsers = { all: [], love: [], like: [], care: [], haha: [], wow: [], sad: [], angry: [] };

        Object.entries(reactions).forEach(([uid, r]) => {
            const item = { uid, ...r };
            groupedUsers.all.push(item);
            reactionCounts.all++;
            
            if (r.type && reactionCounts[r.type] !== undefined) {
                groupedUsers[r.type].push(item);
                reactionCounts[r.type]++;
            }
        });

        const chipsContainer = document.getElementById('reacted-chips-container');
        if (chipsContainer) {
            let html = '';
            const types = ['all', 'love', 'like', 'care', 'haha', 'wow', 'sad', 'angry'];
            types.forEach(t => {
                const count = reactionCounts[t];
                const emoji = t === 'all' ? '✨' : reactionEmojis[t];
                const label = t === 'all' ? 'All' : reactionLabels[t];
                const isActive = activeReactedFilter === t;

                html += `
                    <div class="filter-chip" 
                         onclick="selectReactedFilter('${t}')" 
                         style="padding: 8px 16px; border-radius: 20px; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; border: 1.5px solid var(--glass-border); transition: all 0.2s;
                                background: ${isActive ? 'var(--text-main)' : 'var(--border-color)'};
                                color: ${isActive ? 'var(--surface)' : 'var(--text-main)'};">
                        <span>${emoji}</span>
                        <span>${label} (${count})</span>
                    </div>
                `;
            });
            chipsContainer.innerHTML = html;
        }

        const listContainer = document.getElementById('reacted-users-list');
        if (listContainer) {
            const currentFilterList = groupedUsers[activeReactedFilter] || [];
            if (currentFilterList.length === 0) {
                listContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 40px 0; font-weight: 700;">No reactions in this category</p>`;
                return;
            }

            listContainer.innerHTML = currentFilterList.map(u => {
                const avatarHtml = u.avatar 
                    ? `<img src="${u.avatar}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover;" loading="lazy">`
                    : `<div style="width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--primary), #FF7A00); color: white; font-weight: 800; font-size: 1rem;">${u.username ? u.username.charAt(0).toUpperCase() : 'U'}</div>`;

                return `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1.5px solid var(--border-color);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            ${avatarHtml}
                            <div>
                                <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--text-main); margin: 0;">@${escapeHTML(u.username)}</h4>
                                <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 500;">Reacted ${getRelativeTime(u.timestamp)}</span>
                            </div>
                        </div>
                        <span style="font-size: 1.8rem; display: inline-flex; align-items: center; justify-content: center; font-style: normal !important; transform: none !important;">${reactionEmojis[u.type]}</span>
                    </div>
                `;
            }).join('');
        }
    });
}

// =========================================
// DOWNLOAD POP-UP CONTROLLERS
// =========================================
function requestDownloadWithAd() {
    playUI('click');
    if (!currentActiveMovie) return;
    openDownloadModal();
}

function openDownloadModal() {
    AppNavigation.pushModal('premium-download-modal');
}

function closeDownloadModal() {
    AppNavigation.pop();
}

function startDownloadAdRequest() {
    playUI('click');
    AppNavigation.pop(); 
    if (!currentActiveMovie || !currentActiveMovie.videoLink) {
        showNotification("No valid download link found.", "error");
        return;
    }
    const format = document.querySelector('input[name="download-format"]:checked')?.value || "video-720";
    const filename = `${currentActiveMovie.title.replace(/\s+/g, '_')}_${format}.mp4`;
    triggerFileDownload(currentActiveMovie.videoLink, filename);
}

// =========================================
// UPCOMING FEATURE POPUP HELPERS
// =========================================
function showUpcomingModal() {
    playUI('click');
    AppNavigation.pushModal('upcoming-modal');
}

function hideUpcomingModal() {
    AppNavigation.pop();
}

// =========================================================
// NEW PREMIUM UPLOAD STUDIO FUNCTIONS (Replaced Block)
// =========================================================

let currentUploadFile = null;
let currentUploadFrameMeta = null;

let shortCameraStream = null;
let shortMediaRecorder = null;
let shortChunks = [];
let isFrontCamera = true;
let isFlashOn = false;
let isShortFromCamera = false; 

// Camera settings state
let recordDurationLimit = 15;
let recordTimerCountdown = 0;
let currentRecordSpeed = 1;
let recordTimerInterval = null;
let recordCountdownInterval = null;
let currentRecordSeconds = 0;
let isCameraRecording = false;
let isRecordButtonBound = false;
let currentRecorderMimeType = 'video/webm';

let uploadSliderStartX = 0;
let uploadSliderCurrentX = 0;
let currentUploadMode = 'short';
let currentVisibilityTarget = null;

window.openCreateBottomSheet = openPremiumUploadStudio;
window.closeCreateBottomSheet = closePremiumUploadStudio;

let studioIsShown = false;

// The studio is a real page in the back stack, so Back from Preview / Details returns to it.
window.__uploadStudioShown = function() {
    studioIsShown = true;
    const r = window.__uploadStudioResume;
    if (!r) return;
    window.__uploadStudioResume = null;
    // Returning from a preview page: restore the screen the user came from
    setTimeout(() => {
        try {
            switchUploadMode(r.mode);                                   // Feels = camera, Video / Post = media picker
            if (r.mode === 'short' && r.picker) openMediaPicker('short'); // Feels picked from the gallery
        } catch (e) {}
    }, 0);
};
window.__uploadStudioHidden = function() {
    if (!studioIsShown) return;
    studioIsShown = false;
    // Closing the studio while recording must discard the clip, not open a preview
    try { if (shortMediaRecorder) shortMediaRecorder.onstop = () => {}; } catch (e) {}
    try { stopCameraRecording(); } catch (e) {}
    try { stopShortCamera(); } catch (e) {}
};

function openPremiumUploadStudio() {
    playUI('click');
    if (!currentChannelData) {
        const promptChan = confirm("You need to create a Channel first before uploading content.\n\nWould you like to create a Channel now?");
        if (promptChan) {
            switchTab('you');
            openCreateChannelPage();
        }
        return;
    }
    const studio = document.getElementById('premium-upload-studio');
    if (studio) {
        studio.style.opacity = 1;
        window.__uploadStudioResume = null;
        AppNavigation.pushPage('premium-upload-studio');
        studio.style.display = 'flex';
        setupModeSliderSwipe();
        switchUploadMode('short');
    }
}

function closePremiumUploadStudio() {
    playUI('click');
    document.querySelectorAll('#video-preview-el, #short-preview-el').forEach(v => v.pause()); // Background play fix
    const cur = AppNavigation.current();
    if (cur && cur.type === 'page' && cur.id === 'premium-upload-studio') {
        AppNavigation.pop();           // hides the studio and stops the camera (see __uploadStudioHidden)
        return;
    }
    const studio = document.getElementById('premium-upload-studio');
    if (studio) {
        studio.style.display = 'none';
        stopCameraRecording();
        stopShortCamera();
    }
}

// Background Playback Fix for Preview Pages
window.closeAndPausePreview = function() {
    playUI('click');
    document.querySelectorAll('#video-preview-el, #short-preview-el').forEach(v => v.pause());
    AppNavigation.pop();
};

// Fixed Centered Mode Slider
function switchUploadMode(mode) {
    const flag = mode === 'video' ? 'uploadVideoEnabled' : mode === 'short' ? 'uploadFeelsEnabled' : mode === 'post' ? 'uploadPostsEnabled' : null;
    if (flag && !isAdminFeatureEnabled(flag)) { showNotification('This upload type is currently disabled by the administrator.', 'error'); return; }
    if (!isAdminFeatureEnabled('uploadSystemEnabled')) { showNotification('Uploading is currently disabled by the administrator.', 'error'); return; }
    currentUploadMode = mode;
    const slider = document.getElementById('mode-slider');
    const items = document.querySelectorAll('.mode-item');
    
    items.forEach(item => {
        if (item.dataset.mode === mode) item.classList.add('active');
        else item.classList.remove('active');
    });

    const activeItem = document.querySelector(`.mode-item[data-mode="${mode}"]`);
    if (slider && activeItem) {
        const wrapWidth = document.getElementById('upload-mode-slider-wrap').offsetWidth;
        const itemCenter = activeItem.offsetLeft + (activeItem.offsetWidth / 2);
        const offset = (wrapWidth / 2) - itemCenter;
        slider.style.transform = `translateX(${offset}px)`;
    }
    
    // Video / Post tab: the media picker opens directly (the old Browse Device / Pick Image boxes are only a fallback outside the app)
    const hasNativePicker = !!(window.AndroidBridge && typeof window.AndroidBridge.getMediaList === 'function');
    document.getElementById('upload-video-view').style.display = (mode === 'video' && !hasNativePicker) ? 'flex' : 'none';
    document.getElementById('upload-short-view').style.display = mode === 'short' ? 'flex' : 'none';
    document.getElementById('upload-post-view').style.display = (mode === 'post' && !hasNativePicker) ? 'flex' : 'none';

    if (mode === 'short') startShortCamera();
    else stopShortCamera();

    if (hasNativePicker && (mode === 'video' || mode === 'post')) openMediaPicker(mode);
}

function setupModeSliderSwipe() {
    const sliderWrap = document.getElementById('upload-mode-slider-wrap');
    if (!sliderWrap) return;
    sliderWrap.ontouchstart = (e) => { uploadSliderStartX = e.touches[0].clientX; };
    sliderWrap.ontouchmove = (e) => { uploadSliderCurrentX = e.touches[0].clientX; };
    sliderWrap.ontouchend = () => {
        const diff = uploadSliderStartX - uploadSliderCurrentX;
        if (Math.abs(diff) > 50 && uploadSliderCurrentX !== 0) {
            if (diff > 0) {
                if (currentUploadMode === 'video') switchUploadMode('short');
                else if (currentUploadMode === 'short') switchUploadMode('post');
            } else {
                if (currentUploadMode === 'post') switchUploadMode('short');
                else if (currentUploadMode === 'short') switchUploadMode('video');
            }
        }
        uploadSliderStartX = 0; uploadSliderCurrentX = 0;
    };
    document.querySelectorAll('.mode-item').forEach(item => {
        item.onclick = () => switchUploadMode(item.dataset.mode);
    });
}

// ---------------------------------------------------------
// CUSTOM THUMBNAIL UPLOAD (Fix)
// ---------------------------------------------------------
window.handleCustomThumbSelected = function(e) {
    const file = e.target.files[0];
    if(!file) return;
    const url = URL.createObjectURL(file);
    if(currentUploadFrameMeta) {
        currentUploadFrameMeta.dataUrl = url;
        currentUploadFrameMeta.blob = file;
    } else {
        currentUploadFrameMeta = { dataUrl: url, blob: file, duration: 15 };
    }
    const vdThumb = document.getElementById('vd-thumb');
    const sdThumb = document.getElementById('sd-thumb');
    if(vdThumb) vdThumb.src = url;
    if(sdThumb) sdThumb.src = url;
    showNotification("Custom thumbnail applied!", "success");
}

// ---------------------------------------------------------
// CAMERA LOGICS & POPUPS (Timer, Duration, Speed)
// ---------------------------------------------------------
let shortCameraStartInProgress = false;
let shortCameraRetryTimer = null;
let shortCameraRetryCount = 0;

async function startShortCamera(retryAttempt = 0) {
    const video = document.getElementById('short-camera-preview');
    if (video && video.srcObject) return;
    if (shortCameraStartInProgress) return;

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        showNotification("Camera is not supported in this WebView.", "error");
        return;
    }

    shortCameraStartInProgress = true;
    shortCameraRetryCount = retryAttempt;

    try {
        const constraints = {
            video: { facingMode: isFrontCamera ? 'user' : 'environment' },
            audio: true
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        shortCameraStream = stream;

        if (video) {
            video.srcObject = stream;
            video.muted = true;
            video.setAttribute('playsinline', '');
            try {
                await video.play();
            } catch (_) {
                // Android WebView may need one more event cycle after permission is granted.
            }
        }

        shortCameraStartInProgress = false;
        shortCameraRetryCount = 0;
        if (shortCameraRetryTimer) {
            clearTimeout(shortCameraRetryTimer);
            shortCameraRetryTimer = null;
        }
    } catch (err) {
        shortCameraStartInProgress = false;

        // Android WebView can finish the runtime permission grant just after
        // the first getUserMedia() call fails. Retry automatically so the user
        // does not need to restart Flaynity.
        const retryable = retryAttempt < 5;
        if (retryable) {
            const delay = 350 + (retryAttempt * 500);
            shortCameraRetryTimer = setTimeout(() => {
                shortCameraRetryTimer = null;
                startShortCamera(retryAttempt + 1);
            }, delay);
        } else {
            showNotification("Camera permission required", "error");
        }
    }
}

function stopShortCamera() {
    if (shortCameraStream) {
        shortCameraStream.getTracks().forEach(t => t.stop());
        shortCameraStream = null;
    }
    const video = document.getElementById('short-camera-preview');
    if (video) video.srcObject = null;
}

function toggleShortCamera() {
    playUI('click');
    isFrontCamera = !isFrontCamera;
    isFlashOn = false; 
    const btnFlash = document.getElementById('btn-cam-flash');
    if(btnFlash) btnFlash.classList.remove('active-state');
    stopShortCamera();
    startShortCamera();
}

function toggleShortFlash() {
    playUI('click');
    if(!shortCameraStream) return;
    const track = shortCameraStream.getVideoTracks()[0];
    if(!track || typeof track.applyConstraints !== 'function') {
        showNotification("Flash not supported on this device", "error");
        return;
    }
    isFlashOn = !isFlashOn;
    track.applyConstraints({ advanced: [{ torch: isFlashOn }] }).then(() => {
        const btn = document.getElementById('btn-cam-flash');
        if(btn) {
            if(isFlashOn) btn.classList.add('active-state');
            else btn.classList.remove('active-state');
        }
    }).catch(e => {
        showNotification("Flash not supported", "error");
        isFlashOn = false;
    });
}

// Studio Popups
function openStudioPopup(type) {
    playUI('click');
    const modal = document.getElementById(type + '-modal');
    const content = document.getElementById(type + '-content');
    if(modal && content) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
            content.style.transform = 'translateY(0)';
        });
    }
}

function setCameraSetting(type, val) {
    playUI('click');
    const modal = document.getElementById(type + '-popup-modal');
    const content = document.getElementById(type + '-popup-content');
    
    if(content) {
        content.querySelectorAll('.studio-popup-option').forEach(opt => {
            if (opt.innerText.includes(val) || (val===0 && opt.innerText.includes('Off'))) {
                opt.classList.add('selected');
                opt.querySelector('.fa-check').style.display = 'block';
            } else {
                opt.classList.remove('selected');
                opt.querySelector('.fa-check').style.display = 'none';
            }
        });
    }

    if(type === 'duration') {
        recordDurationLimit = val;
        document.getElementById('cam-duration-val').innerText = (val >= 60) ? (val/60)+'m' : val+'s';
    } else if (type === 'timer') {
        recordTimerCountdown = val;
    } else if (type === 'speed') {
        currentRecordSpeed = val;
        document.getElementById('cam-speed-val').innerText = val+'x';
        showNotification(`Preview will play at ${val}x`, "success");
    }

    if(content) {
        content.style.transform = 'translateY(100%)';
        setTimeout(() => {
            if(modal) modal.style.display = 'none';
        }, 300);
    }
}

document.querySelectorAll('.studio-popup-modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if(e.target === modal) {
            const content = modal.querySelector('.studio-popup-content');
            if(content) content.style.transform = 'translateY(100%)';
            setTimeout(() => { modal.style.display = 'none'; }, 300);
        }
    });
});

// ---------------------------------------------------------
// PERFECT TAP & HOLD TO RECORD LOGIC (Fixed)
// ---------------------------------------------------------
function setupHoldToRecord() {
    const recOuter = document.getElementById('record-btn-outer');
    if (!recOuter || isRecordButtonBound) return;

    isRecordButtonBound = true;
    recOuter.setAttribute('role', 'button');
    recOuter.setAttribute('aria-label', 'Record short video');
    recOuter.setAttribute('tabindex', '0');

    let pressStart = 0;
    let longPressTimer = null;
    let pointerId = null;
    let holdTriggered = false;

    const cancelPress = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    const startPress = (e) => {
        if (e && e.pointerType === 'mouse' && e.button !== 0) return;
        if (pointerId !== null) return;
        pointerId = e?.pointerId ?? null;
        pressStart = Date.now();
        holdTriggered = false;

        if (!shortCameraStream) {
            showNotification('Camera is not ready. Please allow camera and microphone access.', 'error');
            pointerId = null;
            return;
        }

        // If already recording, a tap stops the recording.
        if (isCameraRecording) {
            stopCameraRecording();
            pointerId = null;
            return;
        }

        // Start recording immediately. A short tap keeps recording (tap-to-toggle),
        // while a long press is stopped on release.
        initiateRecordingSequence();

        longPressTimer = setTimeout(() => {
            holdTriggered = true;
        }, 500);
    };

    const endPress = (e) => {
        if (pointerId !== null && e?.pointerId != null && e.pointerId !== pointerId) return;
        cancelPress();

        const heldFor = Date.now() - pressStart;
        // Only stop on release for a genuine long-press. A quick tap is toggle mode.
        if (isCameraRecording && (holdTriggered || heldFor >= 500)) {
            stopCameraRecording();
        }
        pointerId = null;
    };

    recOuter.addEventListener('pointerdown', startPress, { passive: true });
    recOuter.addEventListener('pointerup', endPress, { passive: true });
    recOuter.addEventListener('pointercancel', endPress, { passive: true });

    // Do not use pointerleave here. Android WebView can emit pointerleave during
    // a normal touch gesture, which previously caused recordings to stop instantly.
    recOuter.addEventListener('lostpointercapture', endPress, { passive: true });

    recOuter.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isCameraRecording) stopCameraRecording();
            else initiateRecordingSequence();
        }
    });
}

function initiateRecordingSequence() {
    if (isCameraRecording) return;
    if (!shortCameraStream) {
        showNotification('Camera is not ready. Please allow camera and microphone access.', 'error');
        return;
    }

    cancelRecordCountdown();

    if (recordTimerCountdown > 0) {
        const bigCount = document.getElementById('big-countdown');
        const ctrls = document.getElementById('short-right-controls');
        const bottom = document.getElementById('camera-bottom-bar');
        const slider = document.getElementById('upload-mode-slider-wrap');
        const closeBtn = document.getElementById('camera-top-bar');

        if (ctrls) ctrls.style.display = 'none';
        if (bottom) bottom.style.display = 'none';
        if (slider) slider.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'none';

        if (!bigCount) {
            startCameraRecording();
            return;
        }

        bigCount.style.display = 'block';
        let remaining = recordTimerCountdown;
        bigCount.innerText = remaining;

        recordCountdownInterval = setInterval(() => {
            if (!shortCameraStream) {
                cancelRecordCountdown();
                restoreCameraControls();
                return;
            }
            remaining--;
            if (remaining > 0) {
                bigCount.innerText = remaining;
                playUI('click');
            } else {
                cancelRecordCountdown();
                bigCount.style.display = 'none';
                startCameraRecording();
            }
        }, 1000);
    } else {
        startCameraRecording();
    }
}

function cancelRecordCountdown() {
    if (recordCountdownInterval) {
        clearInterval(recordCountdownInterval);
        recordCountdownInterval = null;
    }
    const bigCount = document.getElementById('big-countdown');
    if (bigCount) bigCount.style.display = 'none';
}

function restoreCameraControls() {
    const ctrls = document.getElementById('short-right-controls');
    const gal = document.getElementById('btn-cam-gallery');
    const slider = document.getElementById('upload-mode-slider-wrap');
    const topBar = document.getElementById('camera-top-bar');
    const closeBtn = document.getElementById('btn-close-studio');
    if (ctrls) ctrls.style.display = 'flex';
    if (gal) gal.style.display = 'block';
    if (slider) slider.style.display = 'flex';
    if (topBar) topBar.style.display = 'flex';
    if (closeBtn) closeBtn.style.display = 'block';
}

function getSupportedRecorderMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm',
        'video/mp4'
    ];
    return candidates.find(type => {
        try { return MediaRecorder.isTypeSupported(type); } catch (e) { return false; }
    }) || '';
}

function startCameraRecording() {
    if (isCameraRecording) return;
    if (!shortCameraStream) {
        showNotification('Camera is not ready. Please allow camera and microphone access.', 'error');
        return;
    }
    if (typeof MediaRecorder === 'undefined') {
        showNotification('Video recording is not supported by this Android WebView.', 'error');
        return;
    }

    const mimeType = getSupportedRecorderMimeType();
    if (!mimeType) {
        showNotification('This device does not support camera video recording.', 'error');
        return;
    }

    playUI('click');
    isCameraRecording = true;
    currentRecorderMimeType = mimeType;

    const innerBtn = document.getElementById('record-btn-inner');
    if (innerBtn) {
        innerBtn.style.transform = 'scale(0.5)';
        innerBtn.style.borderRadius = '8px';
    }

    const ctrls = document.getElementById('short-right-controls');
    const gal = document.getElementById('btn-cam-gallery');
    const slider = document.getElementById('upload-mode-slider-wrap');
    const closeBtn = document.getElementById('btn-close-studio');
    if (ctrls) ctrls.style.display = 'none';
    if (gal) gal.style.display = 'none';
    if (slider) slider.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'none';

    const bottomBar = document.getElementById('camera-bottom-bar');
    if (bottomBar) bottomBar.style.display = 'flex';

    const timerEl = document.getElementById('recording-timer');
    if (timerEl) {
        timerEl.style.display = 'block';
        timerEl.innerText = '00:00';
    }
    currentRecordSeconds = 0;
    shortChunks = [];

    try {
        const options = mimeType ? { mimeType } : undefined;
        shortMediaRecorder = new MediaRecorder(shortCameraStream, options);
    } catch (err) {
        isCameraRecording = false;
        restoreCameraControls();
        if (innerBtn) {
            innerBtn.style.transform = 'scale(1)';
            innerBtn.style.borderRadius = '50%';
        }
        showNotification('Unable to start video recorder: ' + (err.message || 'unsupported format'), 'error');
        return;
    }

    shortMediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) shortChunks.push(e.data);
    };

    shortMediaRecorder.onerror = () => {
        isCameraRecording = false;
        clearInterval(recordTimerInterval);
        showNotification('Recording failed. Please try again.', 'error');
        restoreCameraControls();
    };

    shortMediaRecorder.onstop = () => {
        isCameraRecording = false;
        clearInterval(recordTimerInterval);
        if (!shortChunks.length) {
            restoreCameraControls();
            showNotification('No video was captured. Please try again.', 'error');
            return;
        }

        const actualType = shortChunks[0]?.type || currentRecorderMimeType || 'video/webm';
        const extension = actualType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(shortChunks, { type: actualType });
        const file = new File([blob], `short_${Date.now()}.${extension}`, { type: actualType });
        isShortFromCamera = true;
        handlePremiumFileSelected({ target: { files: [file] } }, 'video-short');
    };

    // A small timeslice makes the recording more reliable on Android WebView and
    // prevents the entire recording from being held in one large memory chunk.
    shortMediaRecorder.start(250);

    recordTimerInterval = setInterval(() => {
        currentRecordSeconds++;
        if (timerEl) {
            const mins = Math.floor(currentRecordSeconds / 60);
            const secs = currentRecordSeconds % 60;
            timerEl.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        if (currentRecordSeconds >= recordDurationLimit) stopCameraRecording();
    }, 1000);
}

function stopCameraRecording() {
    cancelRecordCountdown();
    clearInterval(recordTimerInterval);
    recordTimerInterval = null;

    const recorder = shortMediaRecorder;
    shortMediaRecorder = null;
    isCameraRecording = false;

    if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch (e) {}
    }

    const innerBtn = document.getElementById('record-btn-inner');
    if (innerBtn) {
        innerBtn.style.transform = 'scale(1)';
        innerBtn.style.borderRadius = '50%';
    }

    restoreCameraControls();

    const timerEl = document.getElementById('recording-timer');
    if (timerEl) timerEl.style.display = 'none';
}

function triggerShortDownloadLocal() {
    playUI('click');
    if(!currentUploadFile) return;
    
    const url = (currentUploadFile.isLazyNativeFile && currentUploadFile.sourceUrl) ? currentUploadFile.sourceUrl : URL.createObjectURL(currentUploadFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flaynity_recorded_${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification("Saved to device!", "success");
}

// ---------------------------------------------------------
// VALIDATION & CORE PROCESSING (Auto Short Rule)
// ---------------------------------------------------------
async function handlePremiumFileSelected(e, type) {
    let file = e.target && e.target.files ? e.target.files[0] : (e.files ? e.files[0] : null);
    if (!file) return;

    if (!isShortFromCamera && type === 'video-short') {
        isShortFromCamera = false;
    }

    // Android MediaRecorder may return a MIME type with codec parameters,
    // e.g. "video/webm;codecs=vp8,opus". Validate the base MIME type instead
    // of requiring an exact string match.
    const rawMimeType = String(file.type || "").toLowerCase().trim();
    const baseMimeType = rawMimeType.split(";")[0].trim();
    const fileName = String(file.name || "").toLowerCase();
    const extension = fileName.includes(".") ? fileName.split(".").pop() : "";

    const allowedFormats = {
        "mp4": ["video/mp4"],
        "mov": ["video/quicktime", "video/x-m4v"],
        "mkv": ["video/x-matroska", "video/matroska"],
        "webm": ["video/webm"]
    };

    const extensionAllowed = ["mp4", "mov", "mkv", "webm"].includes(extension);
    const mimeAllowed = Object.values(allowedFormats).some(types => types.includes(baseMimeType));

    // Camera recordings are generated by MediaRecorder. Some Android WebViews
    // expose a codec-qualified or even empty MIME type, so do not reject a
    // recorder-generated video solely because of that browser MIME variation.
    const cameraRecording = isShortFromCamera === true && type === "video-short";
    const looksLikeRecordedVideo =
        cameraRecording &&
        (baseMimeType.startsWith("video/") || extension === "webm" || extension === "mp4");

    if (!mimeAllowed && !extensionAllowed && !looksLikeRecordedVideo) {
        showNotification("Invalid format! Supported: MP4, MOV, MKV, WEBM", "error");
        return;
    }

    // Normalize codec-qualified recorder MIME types so downstream video
    // elements and upload logic receive a standard MIME type.
    if (cameraRecording && file.type && file.type.includes(";")) {
        try {
            const normalizedBlob = new Blob([file], { type: baseMimeType || "video/webm" });
            file = new File(
                [normalizedBlob],
                file.name || `short_${Date.now()}.webm`,
                { type: baseMimeType || "video/webm", lastModified: Date.now() }
            );
        } catch (e) {
            // Keep the original File if the WebView does not allow re-wrapping it.
        }
    }

    currentUploadFile = file;
    const previewSrc = (file && file.isLazyNativeFile && file.sourceUrl)
        ? file.sourceUrl
        : URL.createObjectURL(file);

    // Thumbnail + duration are prepared in the background; the preview opens immediately.
    currentUploadFrameMeta = null;
    if (file && file.isLazyNativeFile) {
        window.__uploadMetaPromise = (async () => {
            let thumbBlob = null;
            let dataUrl = "";
            if (file.thumbUrl) {
                try {
                    const tr = await fetch(file.thumbUrl);
                    if (tr.ok) {
                        thumbBlob = await tr.blob();
                        dataUrl = await new Promise(res => {
                            const fr = new FileReader();
                            fr.onload = () => res(fr.result || "");
                            fr.onerror = () => res("");
                            fr.readAsDataURL(thumbBlob);
                        });
                    }
                } catch (e) {}
            }
            const dur = (file.durationSec && isFinite(file.durationSec) && file.durationSec > 0) ? file.durationSec : 60;
            const meta = { duration: dur, dataUrl, blob: thumbBlob };
            if (currentUploadFile === file) currentUploadFrameMeta = meta;
            return meta;
        })();
    } else {
        window.__uploadMetaPromise = Promise.race([
            captureFrameAndDuration(file),
            new Promise(res => setTimeout(() => res(null), 10000))
        ]).catch(() => null).then(m => {
            const meta = m || { duration: 60, dataUrl: "", blob: null };
            if (currentUploadFile === file) currentUploadFrameMeta = meta;
            return meta;
        });
    }

    // Check duration instantly from native metadata when available, or quick metadata probe (capped at 1.2s so preview never stalls)
    if (type === 'video-long') {
        let d = (file && file.isLazyNativeFile && file.durationSec > 0) ? file.durationSec : NaN;
        if (!isFinite(d)) {
            d = await Promise.race([
                quickVideoDuration(file),
                new Promise(res => setTimeout(() => res(NaN), 1200))
            ]);
        }
        if (isFinite(d) && d > 0 && d < 180) {
            showNotification("Video < 3 min! Automatically switching to Short format.", "success");
            type = 'video-short';
            isShortFromCamera = false;
        }
    }

    // Remember where the user came from so Back returns to the camera / media picker
    window.__uploadStudioResume = { mode: currentUploadMode, picker: !!mpBridge() && !isShortFromCamera };

    const startPreviewPlay = (vidEl, iconId) => {
        if (!vidEl) return;
        const icon = document.getElementById(iconId);
        if (icon) {
            icon.innerHTML = '<i class="fas fa-play"></i>';
            icon.classList.remove('show');
        }
        vidEl.preload = 'auto';
        if (file && file.thumbUrl) vidEl.poster = file.thumbUrl;
        else vidEl.removeAttribute('poster');
        vidEl.muted = false;
        vidEl.src = previewSrc;
        vidEl.load();
        vidEl.onplaying = () => { if (icon) icon.classList.remove('show'); };
        const p = vidEl.play();
        if (p && typeof p.catch === 'function') {
            p.catch(() => {
                // Retry muted if WebView blocks unmuted autoplay, or show play button
                vidEl.muted = true;
                const p2 = vidEl.play();
                if (p2 && typeof p2.catch === 'function') {
                    p2.catch(() => { if (icon) icon.classList.add('show'); });
                }
            });
        }
    };

    if (type === 'video-short') {
        const vidEl = document.getElementById('short-preview-el');
        if (vidEl) {
            vidEl.playbackRate = currentRecordSpeed;
            startPreviewPlay(vidEl, 'sp-play-icon');
        }
        
        const dlBtn = document.getElementById('short-preview-download-btn');
        if(dlBtn) dlBtn.style.display = isShortFromCamera ? 'flex' : 'none';
        
        // Full interactive trimmer for feels
        initShortTrimmer(vidEl, 'sp-trimmer-container', 'sp-trim-start', 'sp-trim-end', 'sp-trim-playhead', 'sp-time-display');
        AppNavigation.pushPage('short-preview-page');
    } else {
        const vidEl = document.getElementById('video-preview-el');
        startPreviewPlay(vidEl, 'vp-play-icon');
        
        // Timeline removed for video preview as requested
        AppNavigation.pushPage('video-preview-page');
    }
}

function quickVideoDuration(file) {
    return new Promise(resolve => {
        const v = document.createElement('video');
        const url = URL.createObjectURL(file);
        let done = false;
        const fin = (d) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            v.removeAttribute('src');
            try { URL.revokeObjectURL(url); } catch (e) {}
            resolve(d);
        };
        const timer = setTimeout(() => fin(NaN), 4000);
        v.preload = 'metadata';
        v.onloadedmetadata = () => fin(v.duration);
        v.onerror = () => fin(NaN);
        v.src = url;
    });
}

function handlePremiumImagesSelected(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    currentUploadFile = files[0];
    window.__uploadStudioResume = { mode: currentUploadMode, picker: !!mpBridge() };
    
    const imgEl = document.getElementById('post-preview-img');
    if (imgEl) imgEl.src = URL.createObjectURL(currentUploadFile);
    
    AppNavigation.pushPage('post-preview-page');
}

// =====================================================================
// CUSTOM MEDIA PICKER (Android WebView app)
// The device gallery is read natively (MainActivity -> MediaStore).
// Video / Feels tab = videos only, Post tab = images only. Light / Dark follows the app theme.
// In a normal browser it falls back to <input type="file">.
// =====================================================================
const MP = { mode: 'post', only: 'videos', tab: 'videos', album: 'all', albumName: 'Recents', view: 'grid',
             offset: 0, loading: false, end: false, count: 0, token: '', open: false, picking: false,
             awaitingPerm: false, inited: false, hideTimer: null };
const MP_PAGE = 60;
const MP_HOST = 'https://flaynity-media.local';

function mpBridge() {
    return (window.AndroidBridge && typeof window.AndroidBridge.getMediaList === 'function') ? window.AndroidBridge : null;
}
function mpEl(id) { return document.getElementById(id); }
function mpU() { return window.innerWidth / 1080; }      // 1 screenshot pixel in CSS px

// status bar strip of the picker is black -> white status bar icons while it is open
function mpStatusBar(open) {
    try {
        if (open) { const b = window.AndroidBridge; if (b && b.setStatusBarTheme) b.setStatusBarTheme('dark'); }
        else if (typeof window.__flaynityUpdateStatusBar === 'function') {
            window.__flaynityUpdateStatusBar(); setTimeout(window.__flaynityUpdateStatusBar, 300);
        }
    } catch (e) {}
}

// listeners are attached the first time the picker opens (the DOM is surely ready then)
function mpInit() {
    if (MP.inited) return;
    const grid = mpEl('mp-grid');
    if (!grid) return;
    MP.inited = true;
    grid.addEventListener('scroll', mpOnScroll, { passive: true });
    grid.addEventListener('click', (e) => {
        const cell = e.target.closest ? e.target.closest('.mp-cell') : null;
        if (cell) mpPick(cell);
    });
    mpEl('mp-albums').addEventListener('click', (e) => {
        const r = e.target.closest ? e.target.closest('.mp-arow') : null;
        if (r) mpSelectAlbum(r.dataset.id, r.dataset.name);
    });
    mpEl('mp-tabs').addEventListener('click', (e) => {
        const t = e.target.closest ? e.target.closest('.mp-tab') : null;
        if (!t || t.dataset.t === MP.tab) return;
        MP.tab = t.dataset.t; mpRenderTabs(); mpLoad(true);
    });
}

// mode: 'video' | 'short' | 'post'  (upload tabs)
//       'thumb'                     (Custom Thumbnail on the Add Details pages, photos)
//       'ed-video' | 'ed-rpl'       (Feels editor: add clip / replace clip, videos)
//       'ed-image'                  (Feels editor: overlay image, photos)
const MP_PHOTO_MODES = ['post', 'thumb', 'ed-image', 'flcc-banner', 'flcc-avatar', 'user-avatar', 'create-avatar', 'edit-avatar', 'edit-banner', 'photos'];
const MP_INPUT_IDS = { video: 'video-file-input', short: 'short-file-input', post: 'post-image-input',
                       thumb: 'custom-thumb-input', 'ed-video': 'ce-in-video', 'ed-rpl': 'ce-in-rpl', 'ed-image': 'ce-in-image',
                       'flcc-banner': 'flcc-banner-file', 'flcc-avatar': 'flcc-avatar-file',
                       'create-avatar': 'create-avatar-input', 'edit-avatar': 'edit-avatar-input', 'edit-banner': 'edit-banner-input' };
function openMediaPicker(mode, onPick) {
    const b = mpBridge();
    const el = mpEl('media-picker');
    if (!b || !el) {                       // normal browser or picker DOM not mounted yet: fallback to file input
        const inp = mpEl(MP_INPUT_IDS[mode] || 'post-image-input'); if (inp) inp.click();
        return;
    }
    if (MP.open) return;
    // Always mount on <body> above #fl-create-channel so it works even when #app-screen is hidden
    if (el.parentElement !== document.body) document.body.appendChild(el);
    el.style.zIndex = '2147483250';
    mpInit();
    MP.mode = mode;
    MP.onPick = typeof onPick === 'function' ? onPick : null;
    MP.only = MP_PHOTO_MODES.indexOf(mode) > -1 ? 'photos' : 'videos';   // Video / Feels = videos only, Post / Home photos / thumbnail / overlay = images only
    MP.tab = MP.only;
    MP.album = 'all'; MP.albumName = 'Recents'; MP.view = 'grid';
    mpEl('mp-album-name').textContent = 'Recents';
    mpEl('mp-box').classList.remove('albums');
    mpEl('mp-albums').classList.remove('show');
    mpEl('mp-busy').classList.remove('show');
    mpRenderTabs();
    mpEl('mp-grid').innerHTML = '';

    el.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    MP.open = true;
    mpStatusBar(true);
    try { b.setMediaPickerOpen(true); } catch (e) {}

    if (b.hasMediaPermission()) mpLoad(true);
    else mpAskPermission();
}
window.openMediaPicker = openMediaPicker;

function closeMediaPicker(silent) {
    if (!MP.open) return false;
    if (!silent && MP.view === 'albums') { mpHideAlbums(); return true; }     // Back inside the album list
    MP.open = false;
    if (!silent) MP.onPick = null;
    try { const b = mpBridge(); if (b) b.setMediaPickerOpen(false); } catch (e) {}
    const el = mpEl('media-picker');
    el.classList.remove('show');
    setTimeout(() => { if (!MP.open) el.style.display = 'none'; }, 260);
    mpStatusBar(false);
    // user pressed X / Back in the Video or Post tab: go back to the Feels camera instead of an empty page
    if (!silent && (MP.mode === 'video' || MP.mode === 'post') && typeof currentUploadMode !== 'undefined' && currentUploadMode === MP.mode) {
        try { switchUploadMode('short'); } catch (e) {}
    }
    return true;
}
window.closeMediaPicker = closeMediaPicker;

// ---------- permission ----------
function mpState(msg, btnText, btnFn) {
    const st = mpEl('mp-state'), btn = mpEl('mp-state-btn');
    if (!msg) { st.classList.remove('show'); return; }
    mpEl('mp-state-msg').textContent = msg;
    if (btnText) { btn.textContent = btnText; btn.onclick = btnFn; btn.style.display = ''; }
    else btn.style.display = 'none';
    st.classList.add('show');
}
function mpAskPermission() {
    MP.awaitingPerm = true;
    mpState('Allow access to your photos and videos to choose from your gallery.', 'Allow access', () => {
        const b = mpBridge(); if (b) b.requestMediaPermission();
    });
}
window.onMediaPermissionResult = function (granted) {
    if (!MP.open) return;
    if (granted) { MP.awaitingPerm = false; mpLoad(true); }
    else {
        mpState('Permission denied. Turn on Photos and videos access in the app settings.', 'Open settings', () => {
            const b = mpBridge(); if (b) b.openAppSettings();
        });
    }
};
document.addEventListener('visibilitychange', () => {      // coming back from the settings screen
    const b = mpBridge();
    if (!document.hidden && MP.open && MP.awaitingPerm && b && b.hasMediaPermission()) {
        MP.awaitingPerm = false; mpLoad(true);
    }
});

// ---------- tab / albums ----------
function mpRenderTabs() {
    mpEl('mp-tabs').innerHTML = '<button class="mp-tab" data-t="' + MP.only + '">' + (MP.only === 'videos' ? 'Videos' : 'Photos') + '</button>';
}

function mpToggleAlbums() { if (MP.view === 'albums') mpHideAlbums(); else mpShowAlbums(); }

function mpShowAlbums() {
    const b = mpBridge(); if (!b || !MP.token) return;
    let list = [];
    try { list = JSON.parse(b.getMediaAlbums(MP.only)); } catch (e) {}
    const total = list.reduce((s, a) => s + a.count, 0);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const thumb = (id, v) => MP_HOST + '/thumb/' + id + '?k=' + (v ? 'v' : 'i') + '&t=' + MP.token;
    const rows = [];
    if (list.length) rows.push({ id: 'all', name: 'Recents', count: total, cover: list[0].cover, cv: list[0].cv });
    list.forEach(a => rows.push(a));
    mpEl('mp-albums').innerHTML = rows.map(a =>
        '<button class="mp-arow" data-id="' + esc(a.id) + '" data-name="' + esc(a.name) + '">' +
        '<img class="mp-athumb" decoding="async" alt="" src="' + thumb(a.cover, a.cv) + '" onerror="this.style.visibility=\'hidden\'">' +
        '<div class="mp-atxt"><div class="mp-aname">' + esc(a.name) + '</div><div class="mp-acount">' + a.count + '</div></div></button>').join('');
    mpEl('mp-albums').scrollTop = 0;
    mpEl('mp-albums').classList.add('show');
    mpEl('mp-box').classList.add('albums');
    MP.view = 'albums';
}
function mpHideAlbums() {
    mpEl('mp-albums').classList.remove('show');
    mpEl('mp-box').classList.remove('albums');
    MP.view = 'grid';
}
function mpSelectAlbum(id, name) {
    mpHideAlbums();
    if (id === MP.album) return;
    MP.album = id; MP.albumName = name;
    mpEl('mp-album-name').textContent = name;
    mpLoad(true);
}

// ---------- grid ----------
function mpDur(ms) {
    let s = Math.round((ms || 0) / 1000);
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    const p = n => String(n).padStart(2, '0');
    return h ? h + ':' + p(m) + ':' + p(s) : p(m) + ':' + p(s);
}
function mpDateLabel(sec) {
    const d = new Date(sec * 1000), n = new Date();
    const sod = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((sod(n) - sod(d)) / 86400000);
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    const o = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== n.getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString('en-US', o);
}

// scroll indicator + date chip ("Today") while scrolling, and endless loading
function mpOnScroll() {
    const g = mpEl('mp-grid');
    if (g.scrollTop + g.clientHeight > g.scrollHeight - 1500) mpLoad(false);
    mpIndicator();
}
function mpIndicator() {
    const g = mpEl('mp-grid'), sb = mpEl('mp-sb'), chip = mpEl('mp-chip');
    const sh = g.scrollHeight, ch = g.clientHeight;
    if (sh <= ch + 10 || !g.children.length) return;
    const th = Math.max(100 * mpU(), ch * ch / sh);
    const top = (g.scrollTop / (sh - ch)) * (ch - th);
    sb.style.height = th + 'px'; sb.style.transform = 'translateY(' + top + 'px)'; sb.style.opacity = 1;
    const first = g.children[0];
    const rowH = g.children[3] ? g.children[3].offsetTop - first.offsetTop : first.offsetHeight;
    const idx = Math.min(g.children.length - 1, Math.max(0, Math.floor(g.scrollTop / (rowH || 1))) * 3);
    const t = +g.children[idx].dataset.t;
    if (t) chip.textContent = mpDateLabel(t);
    chip.style.transform = 'translateY(' + top + 'px)'; chip.style.opacity = t ? 1 : 0;
    clearTimeout(MP.hideTimer);
    MP.hideTimer = setTimeout(() => { sb.style.opacity = 0; chip.style.opacity = 0; }, 1000);
}

function mpLoad(reset) {
    const b = mpBridge(); if (!b) return;
    const grid = mpEl('mp-grid');
    if (reset) {
        MP.offset = 0; MP.end = false; MP.count = 0; MP.loading = false;
        grid.innerHTML = ''; grid.scrollTop = 0;
        mpState('');
    }
    if (MP.loading || MP.end) return;
    MP.loading = true;
    const myTab = MP.tab, myAlbum = MP.album;
    setTimeout(() => {                       // let the UI paint first, the native query is synchronous
        let res = null;
        try { res = JSON.parse(b.getMediaList(myTab, myAlbum, MP.offset, MP_PAGE)); } catch (e) {}
        MP.loading = false;
        if (!MP.open || myTab !== MP.tab || myAlbum !== MP.album) return;   // user changed tab / album meanwhile
        if (!res) { MP.end = true; if (!MP.count) mpState('Could not load your gallery.'); return; }
        MP.token = res.token;
        const first = MP.count === 0;
        const frag = document.createDocumentFragment();
        res.items.forEach(it => {
            const cell = document.createElement('div');
            cell.className = 'mp-cell';
            cell.dataset.id = it.id; cell.dataset.k = it.v ? 'v' : 'i';
            cell.dataset.n = it.n || ''; cell.dataset.m = it.m || ''; cell.dataset.t = it.t || ''; cell.dataset.d = it.d || '';
            const img = new Image();
            img.decoding = 'async'; img.loading = 'lazy'; img.alt = ''; img.draggable = false;
            img.onerror = () => { img.style.visibility = 'hidden'; };
            img.src = MP_HOST + '/thumb/' + it.id + '?k=' + (it.v ? 'v' : 'i') + '&t=' + MP.token;
            cell.appendChild(img);
            if (it.v) {
                const d = document.createElement('span');
                d.className = 'mp-dur'; d.textContent = mpDur(it.d);
                cell.appendChild(d);
            }
            frag.appendChild(cell);
        });
        grid.appendChild(frag);
        MP.count += res.items.length;
        MP.offset += res.items.length;
        MP.end = !!res.end;
        if (!MP.count) mpState(MP.only === 'videos' ? 'No videos found' : 'No photos found');
        else if (!MP.end && grid.scrollHeight <= grid.clientHeight + 300) mpLoad(false);   // screen not full yet
        else if (first) mpIndicator();
    }, 0);
}

// ---------- pick: native file -> File object -> existing preview pages ----------
async function mpPick(cell) {
    if (MP.picking) return;
    MP.picking = true;
    const isVideo = cell.dataset.k === 'v';
    const pickMode = MP.mode;
    const onPickCb = MP.onPick;
    const fileUrl = MP_HOST + '/file/' + cell.dataset.id + '?k=' + cell.dataset.k + '&t=' + MP.token;
    const thumbUrl = MP_HOST + '/thumb/' + cell.dataset.id + '?k=' + cell.dataset.k + '&t=' + MP.token;
    const name = cell.dataset.n || ((isVideo ? 'video_' : 'image_') + Date.now() + (isVideo ? '.mp4' : '.jpg'));
    const type = cell.dataset.m || (isVideo ? 'video/mp4' : 'image/jpeg');
    const durationMs = Number(cell.dataset.d || 0);

    // Fast path for Upload Video / Feels: stream directly into preview without reading GBs into RAM first!
    if (isVideo && !onPickCb && (pickMode === 'video' || pickMode === 'short')) {
        try {
            MP.onPick = null;
            closeMediaPicker(true);
            isShortFromCamera = false;
            const lazyFile = {
                name,
                type,
                size: 0,
                isLazyNativeFile: true,
                sourceUrl: fileUrl,
                thumbUrl,
                durationSec: durationMs > 0 ? (durationMs / 1000) : 0
            };
            handlePremiumFileSelected({ target: { files: [lazyFile] } }, pickMode === 'short' ? 'video-short' : 'video-long');
        } finally {
            MP.picking = false;
            mpEl('mp-busy').classList.remove('show');
        }
        return;
    }

    mpEl('mp-busy').classList.add('show');
    try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        if (!blob.size) throw new Error('empty file');
        const mimeType = type || blob.type || (isVideo ? 'video/mp4' : 'image/jpeg');
        const file = new File([blob], name, { type: mimeType, lastModified: Date.now() });
        MP.onPick = null;
        closeMediaPicker(true);
        if (typeof onPickCb === 'function') {
            onPickCb(file);
        } else if (pickMode === 'thumb') {
            handleCustomThumbSelected({ target: { files: [file] } });
        } else if (pickMode === 'user-avatar') {
            uploadUserAvatarToR2Engine({ files: [file] });
        } else if (pickMode === 'ed-video' || pickMode === 'ed-rpl' || pickMode === 'ed-image' || pickMode === 'flcc-banner' || pickMode === 'flcc-avatar') {
            const inp = mpEl(MP_INPUT_IDS[pickMode]);          // the page's own handler
            if (inp && typeof inp.onchange === 'function') inp.onchange({ target: { files: [file], value: '' } });
        } else if (isVideo) {
            isShortFromCamera = false;     // picked from the gallery, not recorded
            handlePremiumFileSelected({ target: { files: [file] } }, pickMode === 'short' ? 'video-short' : 'video-long');
        } else {
            handlePremiumImagesSelected({ target: { files: [file] } });
        }
    } catch (err) {
        console.error('MediaPicker pick failed', err);
        if (typeof showNotification === 'function') showNotification('Could not open this file (' + ((err && err.message) || err) + ')', 'error');
    } finally {
        MP.picking = false;
        mpEl('mp-busy').classList.remove('show');
    }
}

function captureFrameAndDuration(file) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = URL.createObjectURL(file);
        video.onloadedmetadata = () => {
            video.currentTime = Math.min(1, video.duration / 2);
        };
        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(video.src);
                resolve({ duration: video.duration, dataUrl: dataUrl, blob: blob });
            }, 'image/jpeg', 0.8);
        };
        video.onerror = (e) => reject(e);
    });
}

// ---------------------------------------------------------
// SHORT TRIMMER / TIMELINE LOGIC (Width Fixed)
// ---------------------------------------------------------
let activeTrimStart = 0; // percentage 0 to 1
let activeTrimEnd = 1;   // percentage 0 to 1

function initShortTrimmer(videoEl, containerId, startId, endId, playheadId, timeDisplayId) {
    const container = document.getElementById(containerId);
    const startHandle = document.getElementById(startId);
    const endHandle = document.getElementById(endId);
    const playhead = document.getElementById(playheadId);
    const timeDisplay = document.getElementById(timeDisplayId);
    if (!videoEl || !container || !startHandle || !endHandle || !playhead) return;

    activeTrimStart = 0;
    activeTrimEnd = 1;
    startHandle.style.left = '0%';
    endHandle.style.left = '100%';

    videoEl.ontimeupdate = () => {
        if (videoEl.duration) {
            const duration = videoEl.duration;
            let current = videoEl.currentTime;
            
            // Loop within bounds
            if (current >= activeTrimEnd * duration) {
                videoEl.currentTime = activeTrimStart * duration;
                current = videoEl.currentTime;
            } else if (current < activeTrimStart * duration) {
                videoEl.currentTime = activeTrimStart * duration;
                current = videoEl.currentTime;
            }

            const percentage = (current / duration) * 100;
            playhead.style.left = `${percentage}%`;
            
            const selectedDuration = (activeTrimEnd - activeTrimStart) * duration;
            if (timeDisplay) timeDisplay.innerText = `${formatDuration(current)} / ${formatDuration(selectedDuration)}`;
        }
    };

    let activeDrag = null; // 'start' or 'end'

    const handleMove = (e) => {
        if(!activeDrag) return;
        const rect = container.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let x = clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const pct = x / rect.width;

        if (activeDrag === 'start') {
            if(pct >= activeTrimEnd - 0.05) return; // Min gap
            activeTrimStart = pct;
            startHandle.style.left = `${pct * 100}%`;
            if(videoEl.duration) videoEl.currentTime = pct * videoEl.duration;
        } else if (activeDrag === 'end') {
            if(pct <= activeTrimStart + 0.05) return; // Min gap
            activeTrimEnd = pct;
            endHandle.style.left = `${pct * 100}%`;
            if(videoEl.duration) videoEl.currentTime = activeTrimStart * videoEl.duration; // Reset to start
        }
    };

    const attachDrag = (element, type) => {
        const startDrag = (e) => {
            e.stopPropagation();
            activeDrag = type;
            videoEl.pause(); // Pause while dragging
            
            const onMove = (evt) => handleMove(evt);
            const onEnd = () => {
                activeDrag = null;
                videoEl.play().catch(()=>{});
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onEnd);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
            };
            
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, {passive: false});
            document.addEventListener('touchend', onEnd);
        };
        element.addEventListener('mousedown', startDrag);
        element.addEventListener('touchstart', startDrag, {passive: false});
    };

    attachDrag(startHandle, 'start');
    attachDrag(endHandle, 'end');
}

function togglePremiumPreviewPlay(vidId, iconId) {
    const vid = document.getElementById(vidId);
    const icon = document.getElementById(iconId);
    if (vid) {
        if (vid.paused) {
            vid.play().catch(()=>{});
            if (icon) {
                icon.innerHTML = '<i class="fas fa-play"></i>';
                icon.classList.remove('show');
            }
        } else {
            vid.pause();
            if (icon) {
                icon.innerHTML = '<i class="fas fa-pause"></i>';
                icon.classList.add('show');
            }
        }
    }
}

async function gotoPremiumUploadDetails(type) {
    playUI('click');
    document.querySelectorAll('#video-preview-el, #short-preview-el').forEach(v => v.pause()); // Background play fix
    // thumbnail / duration are prepared in the background after the preview opens
    if (type !== 'post' && window.__uploadMetaPromise) { try { await window.__uploadMetaPromise; } catch (e) {} }
    // The preview page stays in the back stack, so Back from Details returns to it
    
    if (type === 'video') {
        const thumb = document.getElementById('vd-thumb');
        if (thumb && currentUploadFrameMeta) thumb.src = currentUploadFrameMeta.dataUrl;
        const titleInput = document.getElementById('vd-title');
        if(titleInput) titleInput.value = currentUploadFile.name.split('.')[0];
        const descInput = document.getElementById('vd-desc');
        if(descInput) descInput.value = "";
        AppNavigation.pushPage('video-details-page');
    } else if (type === 'short') {
        const thumb = document.getElementById('sd-thumb');
        if (thumb && currentUploadFrameMeta) thumb.src = currentUploadFrameMeta.dataUrl;
        const titleInput = document.getElementById('sd-title');
        if(titleInput) titleInput.value = "";
        const descInput = document.getElementById('sd-desc');
        if(descInput) descInput.value = "";
        AppNavigation.pushPage('short-details-page');
    } else if (type === 'post') {
        const titleInput = document.getElementById('pd-title');
        if(titleInput) titleInput.value = "";
        AppNavigation.pushPage('post-details-page');
    }
}

function openVisibilityPicker(targetId) {
    playUI('click');
    currentVisibilityTarget = targetId;
    const modal = document.getElementById('visibility-picker-modal');
    const content = document.getElementById('visibility-picker-content');
    
    const currVal = document.getElementById(targetId).value;
    document.querySelectorAll('.studio-popup-option').forEach(opt => {
        if (opt.innerText.includes(currVal) || (currVal==='Public' && opt.innerText.includes('Publish'))) opt.classList.add('selected');
        else opt.classList.remove('selected');
    });

    if(modal && content) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
            content.style.transform = 'translateY(0)';
        });
    }
}

function selectVisibilityOption(val, text, iconClass) {
    playUI('click');
    if(currentVisibilityTarget) {
        document.getElementById(currentVisibilityTarget).value = val;
        document.getElementById(currentVisibilityTarget + '-display').innerHTML = `<i class="fas ${iconClass}"></i> ${text}`;
        
        const schedId = currentVisibilityTarget.replace('-visibility', '-schedule-container');
        const schedCont = document.getElementById(schedId);
        if(schedCont) {
            schedCont.style.display = val === 'Schedule' ? 'block' : 'none';
        }
    }
    
    const content = document.getElementById('visibility-picker-content');
    if(content) {
        content.style.transform = 'translateY(100%)';
        setTimeout(() => {
            const modal = document.getElementById('visibility-picker-modal');
            if(modal) modal.style.display = 'none';
        }, 300);
    }
}

function updatePremiumCharCount(el, countId) {
    const countEl = document.getElementById(countId);
    if (countEl) countEl.innerText = `${el.value.length}/${el.maxLength}`;
}

function formatDuration(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min < 10 ? '0' : ''}${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// ---------------------------------------------------------
// FAST PUBLISH LOGIC (R2 -> RTDB -> Feed Sync)
// ---------------------------------------------------------
async function publishPremiumVideoOrShort(modeType) {
    playUI('click');
    const isShort = modeType === 'video-short';
    const prefix = isShort ? 'sd' : 'vd';
    
    const titleEl = document.getElementById(`${prefix}-title`);
    const title = titleEl ? titleEl.value.trim() : "";
    
    const descEl = document.getElementById(`${prefix}-desc`);
    const desc = descEl ? descEl.value.trim() : "";
    
    const visEl = document.getElementById(`${prefix}-visibility`);
    const visibility = visEl ? visEl.value : "Public";
    
    const schedEl = document.getElementById(`${prefix}-schedule-date`);
    const scheduleDate = schedEl ? schedEl.value : "";
    
    if (!title) {
        showNotification("Caption / Title is required!", "error");
        return;
    }

    const uniqueId = "st_" + Date.now() + "_" + Math.floor(Math.random()*1000);
    const fileKey = `uploads/${uniqueId}/${currentUploadFile.name.replace(/\s+/g, '_')}`;
    
    const safeMeta = currentUploadFrameMeta || {
        duration: (currentUploadFile && currentUploadFile.durationSec > 0) ? currentUploadFile.durationSec : 60,
        dataUrl: "",
        blob: null
    };
    // Convert active trim percentage to actual duration if trimmed
    let finalDuration = safeMeta.duration;
    if (isShort && activeTrimEnd !== undefined && activeTrimStart !== undefined) {
        finalDuration = (activeTrimEnd - activeTrimStart) * safeMeta.duration;
    }

    const queueItem = {
        id: uniqueId,
        ownerId: auth.currentUser.uid,
        file: currentUploadFile,
        key: fileKey,
        type: modeType,
        title: title,
        description: desc,
        visibility: visibility,
        allowComments: true,
        showLikes: true,
        status: "waiting", 
        progress: 0,
        duration: finalDuration,
        thumbDataUrl: safeMeta.dataUrl,
        thumbBlob: safeMeta.blob, 
        thumbKey: `uploads/${uniqueId}/thumbnail.jpg`,
        createdAt: Date.now(),
        scheduledTime: visibility === 'Schedule' && scheduleDate ? new Date(scheduleDate).getTime() : 0,
        control: { xhr: null, uploadUrl: "" }
    };

    uploadQueue.push(queueItem);
    saveQueueStateToLocalStorage(); 
    
    AppNavigation.popUploadFlow();
    showNotification("Upload started", "success");
    openViewChannelPage();
    setTimeout(() => {
        switchChannelTab(isShort ? 'feels' : 'videos');
        renderChannelUploadQueue(isShort ? 'feels' : 'videos');
        triggerNextActiveUpload();
    }, 80);
}

async function publishPremiumPostAction() {
    playUI('click');
    const titleEl = document.getElementById('pd-title');
    const title = titleEl ? titleEl.value.trim() : "";
    
    const visEl = document.getElementById('pd-visibility');
    const visibility = visEl ? visEl.value : "Public";
    
    const schedEl = document.getElementById('pd-schedule-date');
    const scheduleDate = schedEl ? schedEl.value : "";
    
    if (!title) {
        showNotification("Title/Caption is required!", "error");
        return;
    }
    
    showNotification("Publishing post...", "success");
    const pubBtn = document.getElementById('premium-post-publish-btn');
    if (pubBtn) pubBtn.disabled = true;

    try {
        const user = auth.currentUser;
        const userSnap = await db.ref(`users/${user.uid}`).once('value');
        const uData = userSnap.val() || {};
        const username = uData.username || user.email.split('@')[0];
        const avatar = currentChannelData?.avatarUrl || user.photoURL || "";

        const imgUrl = await uploadImageToR2(currentUploadFile, "posts");
        
        const postPayload = {
            id: "post_" + Date.now(),
            userId: user.uid,
            channelId: user.uid,
            title: title.split('\n')[0].substring(0, 50) || "Community Post",
            imageUrl: imgUrl || "",
            caption: title,
            uploadTime: Date.now(),
            visibility: visibility,
            status: (visibility === 'Schedule' && scheduleDate) ? "scheduled" : "published",
            isShort: false,
            isPost: true,
            username: username,
            avatar: avatar,
            images: [imgUrl],
            hideLikes: false,
            createdAt: Date.now(),
            reaction: {},
            totalLikes: 0,
            totalReaction: 0,
            totalComments: 0,
            scheduledTime: visibility === 'Schedule' && scheduleDate ? new Date(scheduleDate).getTime() : 0
        };

        await db.ref(`admin_panel/posts/${postPayload.id}`).set(postPayload);
        
        showNotification("Community Post published successfully!", "success");
        AppNavigation.popUploadFlow(); 
        buildHomeFeed();
    } catch (err) {
        showNotification("Failed to publish: " + err.message, "error");
    } finally {
        if (pubBtn) pubBtn.disabled = false;
    }
}

// upload.html is injected asynchronously by the modular page loader.
// Bind the recording button only after all page DOM nodes exist.
window.addEventListener('flaynity-dom-ready', setupHoldToRecord, { once: true });
__flaynityReady(function() { setupHoldToRecord(); });

function ensureLiveUploadStyles() {
    if (document.getElementById('fl-live-upload-styles')) return;
    const st = document.createElement('style'); st.id = 'fl-live-upload-styles';
    st.textContent = `
    .fl-live-upload-card{background:var(--surface,#fff);border:1px solid var(--glass-border,#e8e8e8);border-radius:16px;padding:12px;margin:0 0 12px;box-shadow:0 5px 18px rgba(0,0,0,.06);position:relative;z-index:3}
    .channel-feels-container > .fl-live-upload-card{grid-column:1 / -1;width:100%;box-sizing:border-box}
    .fl-live-upload-head{display:flex;align-items:center;gap:10px}.fl-live-upload-thumb{width:82px;height:52px;border-radius:10px;object-fit:cover;background:#111;flex-shrink:0}.fl-live-upload-info{min-width:0;flex:1}.fl-live-upload-title{font-weight:800;font-size:.93rem;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fl-live-upload-status{font-size:.76rem;color:var(--text-muted);margin-top:4px}.fl-upload-more{background:none;border:0;color:var(--text-muted);padding:8px}.fl-live-progress{height:6px;background:var(--border-color,#eee);border-radius:99px;overflow:hidden;margin:11px 0}.fl-live-progress>div{height:100%;background:var(--primary,#ff2e55);border-radius:99px;transition:width .25s ease}.fl-live-upload-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.fl-live-upload-actions button{border:1px solid var(--glass-border,#ddd);background:var(--bg-color,#f7f7f7);color:var(--text-main);border-radius:9px;padding:7px 9px;font-size:.72rem;font-weight:800}.fl-live-upload-actions button.danger{color:#e53935}.fl-upload-published{font-size:.75rem;font-weight:800;color:#18a558}
    `; document.head.appendChild(st);
}

function openUploadManager() {
    updateManagerUI();
    AppNavigation.pushModal('upload-manager-screen');
}

function closeUploadManager() {
    AppNavigation.pop();
}



// =========================================================
// LONG VIDEO ADS (AdMob native video via AndroidBridge)
// Pre-roll : before every 2nd-3rd video (LV_AD_MIN_GAP..LV_AD_MAX_GAP)
// Mid-roll : videos >= 8 min, every 5 min, max 3 per video
// The ad is drawn by the app exactly over the 16:9 player. Video starts / resumes after it.
// =========================================================
const LV_AD_MIN_GAP = 2;          // set both to 1 => pre-roll before EVERY video
const LV_AD_MAX_GAP = 3;
const LV_MID_MIN_DURATION = 480;  // seconds (8 min)
const LV_MID_INTERVAL = 300;      // seconds (5 min)
const LV_MID_MAX = 3;

let lvAdShowing = false;
let lvAdCallback = null;
let lvSession = 0;
let lvPlayCount = 0;
let lvPrerollGap = LV_AD_MIN_GAP + Math.floor(Math.random() * (LV_AD_MAX_GAP - LV_AD_MIN_GAP + 1));
let lvMidCues = [];
let lvMidDone = {};

function lvRandGap() {
    return LV_AD_MIN_GAP + Math.floor(Math.random() * (LV_AD_MAX_GAP - LV_AD_MIN_GAP + 1));
}
function lvAdsAvailable() {
    return !!(window.AndroidBridge && typeof window.AndroidBridge.showLongVideoAd === 'function');
}
function lvAdWasShown(res) { return res === 'completed' || res === 'skipped'; }

function lvRequestAd(kind, done) {
    if (!lvAdsAvailable() || lvAdShowing) { done('unavailable'); return; }
    const c = document.getElementById('video-player-container');
    const top = c ? c.getBoundingClientRect().top : 0;
    lvAdShowing = true;
    lvAdCallback = done;
    try { window.AndroidBridge.showLongVideoAd(kind, top); }
    catch (e) { window.onLongVideoAdFinished('error'); }
}

// Called by MainActivity.java: completed | skipped | back | not_ready | failed
window.onLongVideoAdFinished = function (result) {
    lvAdShowing = false;
    const cb = lvAdCallback;
    lvAdCallback = null;
    if (cb) cb(result);
};

// Drops any pending / visible ad (page closed, tab changed, new video opened)
function lvCancelAd() {
    lvSession++;
    lvAdCallback = null;
    if (lvAdShowing) {
        lvAdShowing = false;
        try { window.AndroidBridge.hideLongVideoAd(); } catch (e) {}
    }
}

function lvBeginVideo() {
    lvCancelAd();
    lvMidCues = [];
    lvMidDone = {};
    return lvSession;
}

function lvRunPreroll(session, startFn) {
    lvPlayCount++;
    if (!lvAdsAvailable() || lvPlayCount < lvPrerollGap) { startFn(); return; }
    // wait for the watch-page slide-up animation so the ad lines up exactly with the 16:9 player
    setTimeout(() => {
        if (session !== lvSession) return;
        lvRequestAd('preroll', (res) => {
            if (session !== lvSession) return;
            if (lvAdWasShown(res)) { lvPlayCount = 0; lvPrerollGap = lvRandGap(); }
            if (res === 'back') { executeBackAction(); return; }
            startFn();
        });
    }, 450);
}

function lvSetupMidRoll(v) {
    if (v.dataset.lvMid === '1') return;
    v.dataset.lvMid = '1';
    lvMidCues = [];
    lvMidDone = {};
    const dur = v.duration;
    if (!lvAdsAvailable() || !dur || !isFinite(dur) || dur < LV_MID_MIN_DURATION) return;
    for (let t = LV_MID_INTERVAL; t < dur - 60 && lvMidCues.length < LV_MID_MAX; t += LV_MID_INTERVAL) lvMidCues.push(t);
}

function lvCheckMidRoll(v) {
    if (lvAdShowing || !lvMidCues.length || v.paused || v.seeking) return;
    const t = v.currentTime;
    let cue = null;
    lvMidCues.forEach(c => { if (!lvMidDone[c] && t >= c) cue = c; });
    if (cue === null) return;
    lvMidCues.forEach(c => { if (c <= cue) lvMidDone[c] = true; });

    const session = lvSession;
    try { v.pause(); } catch (e) {}
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    const go = () => {
        if (session !== lvSession) return;
        lvRequestAd('midroll', (res) => {
            if (session !== lvSession) return;
            if (res === 'back') { executeBackAction(); return; }
            try { v.play().catch(() => {}); } catch (e) {}
        });
    };
    if (fs) {
        try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {}
        setTimeout(go, 350);
    } else {
        go();
    }
}

// =========================================================
// FLAYNITY YOUTUBE-STYLE LONG VIDEO PLAYER ENGINE
// =========================================================
let flyControlsTimer=null, flySingleTapTimer=null, flySeekResetTimer=null;
let flyLastTapTime=0, flyLastTapSide=null;
let flySeekAccumRight=0, flySeekAccumLeft=0;
let flyCurrentSpeed=1;

function flyGetMaxHeight(){
    let h=1080;
    try{ if(currentActiveMovie && currentActiveMovie.resolution && currentActiveMovie.resolution.includes('x')){ h=parseInt(currentActiveMovie.resolution.split('x')[1])||1080; } }catch(e){}
    return h;
}
function flyFmt(s){ s=Math.floor(s||0); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
    if(h>0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }

function flyBuildPlayerHTML(){
    return `
    <div class="fly-player-wrap" id="fly-player-wrap">
        <video id="fly-video" class="fly-video" playsinline webkit-playsinline preload="metadata"></video>
        <img id="fly-poster" class="fly-poster" src="" onerror="this.style.display='none'">

        <div class="fly-buffering" id="fly-buffering"><div class="fly-spinner"></div></div>

        <div class="fly-seek-ripple left" id="fly-ripple-left"><i class="fas fa-backward"></i><span id="fly-ripple-left-txt">10s</span></div>
        <div class="fly-seek-ripple right" id="fly-ripple-right"><i class="fas fa-forward"></i><span id="fly-ripple-right-txt">10s</span></div>

        <div class="fly-gesture" id="fly-gesture"></div>

        <div class="fly-controls" id="fly-controls">
            <div class="fly-top-bar">
                <button class="fly-settings-btn fly-btn" onclick="flyToggleSettings(event)"><i class="fas fa-gear"></i></button>
            </div>
            <div class="fly-center">
                <button class="fly-btn" onclick="flyCenterSeek(-10)"><i class="fas fa-backward"></i></button>
                <button class="fly-btn" id="fly-play-btn" onclick="flyTogglePlay()"><i class="fas fa-play"></i></button>
                <button class="fly-btn" onclick="flyCenterSeek(10)"><i class="fas fa-forward"></i></button>
            </div>
            <div class="fly-bottom-bar">
                <span id="fly-time">00:00 / 00:00</span>
                <div class="fly-progress" id="fly-progress">
                    <div class="fly-progress-buffered" id="fly-progress-buffered"></div>
                    <div class="fly-progress-filled" id="fly-progress-filled"></div>
                </div>
                <button class="fly-fs-btn fly-btn" onclick="flyToggleFullscreen()"><i class="fas fa-expand" id="fly-fs-icon"></i></button>
            </div>

            <div class="fly-menu" id="fly-settings-menu">
                <div class="fly-menu-item" onclick="flyOpenSpeed(event)"><span><i class="fas fa-gauge-high" style="width:20px;"></i> Playback Speed</span><span style="opacity:.6;font-size:.8rem;" id="fly-speed-label">1x</span></div>
                <div class="fly-menu-item" onclick="flyOpenQuality(event)"><span><i class="fas fa-sliders" style="width:20px;"></i> Quality</span><span style="opacity:.6;font-size:.8rem;" id="fly-quality-label">Auto</span></div>
            </div>

            <div class="fly-menu" id="fly-speed-menu">
                <div class="fly-menu-back" onclick="flyBackToSettings(event)"><i class="fas fa-chevron-left"></i> Playback Speed</div>
                <div id="fly-speed-list"></div>
            </div>

            <div class="fly-menu" id="fly-quality-menu">
                <div class="fly-menu-back" onclick="flyBackToSettings(event)"><i class="fas fa-chevron-left"></i> Quality</div>
                <div id="fly-quality-list"></div>
            </div>
        </div>
        <div class="fly-mini" id="fly-mini"><div class="fly-mini-buf" id="fly-mini-buf"></div><div class="fly-mini-fill" id="fly-mini-fill"></div></div>
    </div>`;
}

function flyInitPlayer(link){
    const v=document.getElementById('fly-video');
    const poster=document.getElementById('fly-poster');
    if(!v) return;
    flyCurrentSpeed=1; flySeekAccumRight=0; flySeekAccumLeft=0;
    flyApplyLandscapeUI(flyLandscape); // next video keeps landscape

    if(poster && currentActiveMovie){ poster.src=currentActiveMovie.poster||currentActiveMovie.banner||''; poster.style.display='block'; poster.style.objectFit='contain'; }

    attachSmartAdaptiveSource(v, link, 'fly_main');
    v.playbackRate=flyCurrentSpeed;

    flyBuildSpeedMenu();

    // Use property handlers so reopening the player never stacks duplicate
    // waiting/playing/progress listeners.
    v.onwaiting=()=>flyShowBuffering(true);
    v.onstalled=()=>flyShowBuffering(true);
    v.onplaying=()=>{flyShowBuffering(false); if(poster) poster.style.display='none'; flyUpdatePlayIcon();};
    v.oncanplay=()=>flyShowBuffering(false);
    v.onplay=flyUpdatePlayIcon;
    v.onpause=()=>{flyUpdatePlayIcon(); flyShowControls();};
    v.ontimeupdate=()=>{ flyUpdateProgress(); lvCheckMidRoll(v); };
    v.onloadedmetadata=()=>{ flyUpdateProgress(); flyBuildQualityMenu(); lvSetupMidRoll(v); };
    v.onprogress=flyUpdateProgress;
    v.onended=()=>playNextRecommendedVideo();

    // Progressive R2 recovery: one lightweight seek/reload retry if the browser
    // stalls after the initial range request. HLS has its own recovery logic.
    v.dataset.r2RecoveryCount='0';
    const recoverR2=()=>{
            if(v._flaynityHls) return;
            if(v.dataset.r2RecoveryCount==='1') return;
        const pos=v.currentTime||0;
        v.dataset.r2RecoveryCount='1';
        setTimeout(()=>{
            if(!v.paused && v.readyState < 3){
                try{ v.load(); v.currentTime=pos; v.play().catch(()=>{}); }catch(e){}
            }
        },900);
    };
    v.onstalled=recoverR2;
    v.onwaiting=()=>{flyShowBuffering(true); recoverR2();};

    const gesture=document.getElementById('fly-gesture');
    if(gesture) gesture.onclick=flyOnTap;
    flyBindProgressDrag();

    document.addEventListener('fullscreenchange',flyOnFsChange);
    document.addEventListener('webkitfullscreenchange',flyOnFsChange);

    flyShowBuffering(true);
    { const p=v.play();
        if(p!==undefined){ p.catch(()=>{ v.muted=true; v.play().catch(()=>{}); }); }
    }
    flyShowControls();
}

/* ---------- Buffering ---------- */
function flyShowBuffering(on){ const b=document.getElementById('fly-buffering'); if(b) b.classList.toggle('show',!!on); }

/* ---------- Play / Pause / Seek ---------- */
function flyTogglePlay(){ const v=document.getElementById('fly-video'); if(!v) return; if(v.paused){ v.play().catch(()=>{}); } else { v.pause(); } flyResetHideTimer(); }
function flyUpdatePlayIcon(){ const v=document.getElementById('fly-video'); const b=document.getElementById('fly-play-btn'); if(!v||!b) return; b.innerHTML=v.paused?'<i class="fas fa-play"></i>':'<i class="fas fa-pause"></i>'; }
function flyCenterSeek(sec){ const v=document.getElementById('fly-video'); if(!v) return; v.currentTime=Math.max(0,Math.min(v.duration||0,v.currentTime+sec)); flyResetHideTimer(); }

/* ---------- Progress ---------- */
function flyUpdateProgress(){
    const v=document.getElementById('fly-video'); if(!v||!v.duration) return;
    const pct=(v.currentTime/v.duration)*100;
    const f=document.getElementById('fly-progress-filled'); if(f) f.style.width=pct+'%';
    const mf=document.getElementById('fly-mini-fill'); if(mf) mf.style.width=pct+'%';
    try{ if(v.buffered.length){ const b=(v.buffered.end(v.buffered.length-1)/v.duration)*100; const be=document.getElementById('fly-progress-buffered'); if(be) be.style.width=b+'%'; const mb=document.getElementById('fly-mini-buf'); if(mb) mb.style.width=b+'%'; } }catch(e){}
    const t=document.getElementById('fly-time'); if(t) t.innerText=flyFmt(v.currentTime)+' / '+flyFmt(v.duration);
}
function flyBindProgressDrag(){
    const bar=document.getElementById('fly-progress'); const v=document.getElementById('fly-video'); if(!bar||!v) return;
    const seekTo=(clientX)=>{ const r=bar.getBoundingClientRect(); let x=clientX-r.left; x=Math.max(0,Math.min(x,r.width)); if(v.duration) v.currentTime=(x/r.width)*v.duration; flyUpdateProgress(); };
    let dragging=false;
    const down=(e)=>{ dragging=true; flyResetHideTimer(); seekTo(e.touches?e.touches[0].clientX:e.clientX); e.stopPropagation(); };
    const move=(e)=>{ if(!dragging) return; seekTo(e.touches?e.touches[0].clientX:e.clientX); };
    const up=()=>{ dragging=false; flyResetHideTimer(); };
    bar.addEventListener('mousedown',down); bar.addEventListener('touchstart',down,{passive:true});
    document.addEventListener('mousemove',move); document.addEventListener('touchmove',move,{passive:true});
    document.addEventListener('mouseup',up); document.addEventListener('touchend',up);
}

/* ---------- Tap gestures (single=controls, double=seek) ---------- */
function flyOnTap(e){
    const wrap=document.getElementById('fly-player-wrap'); if(!wrap) return;
    const r=wrap.getBoundingClientRect();
    const cx=(e.clientX!==undefined?e.clientX:(e.changedTouches&&e.changedTouches[0].clientX))||0;
    const side=(cx-r.left)<r.width/2?'left':'right';
    const now=Date.now();
    if(now-flyLastTapTime<300 && side===flyLastTapSide){
        clearTimeout(flySingleTapTimer);
        flyDoubleSeek(side);
        flyLastTapTime=0; flyLastTapSide=null;
    }else{
        flyLastTapTime=now; flyLastTapSide=side;
        clearTimeout(flySingleTapTimer);
        flySingleTapTimer=setTimeout(()=>{ flyToggleControls(); },260);
    }
}
function flyDoubleSeek(side){
    const v=document.getElementById('fly-video'); if(!v) return;
    flyHideControls();
    if(side==='right'){ v.currentTime=Math.min(v.duration||0,v.currentTime+10); flySeekAccumRight+=10; flyShowRipple('right',flySeekAccumRight); }
    else{ v.currentTime=Math.max(0,v.currentTime-10); flySeekAccumLeft+=10; flyShowRipple('left',flySeekAccumLeft); }
    clearTimeout(flySeekResetTimer);
    flySeekResetTimer=setTimeout(()=>{ flySeekAccumRight=0; flySeekAccumLeft=0; },1500);
}
function flyShowRipple(side,total){
    const el=document.getElementById('fly-ripple-'+side);
    const txt=document.getElementById('fly-ripple-'+side+'-txt');
    if(txt) txt.innerText=total+'s';
    if(!el) return;
    el.classList.remove('animate'); void el.offsetWidth; el.classList.add('animate');
    if(navigator.vibrate) navigator.vibrate(12);
}

/* ---------- Controls show/hide + auto-hide 2s ---------- */
function flyShowControls(){ const c=document.getElementById('fly-controls'); if(c) c.classList.add('show'); flyResetHideTimer(); }
function flyHideControls(){ const c=document.getElementById('fly-controls'); if(c) c.classList.remove('show'); clearTimeout(flyControlsTimer); flyCloseAllMenus(); }
function flyToggleControls(){ const c=document.getElementById('fly-controls'); if(!c) return; c.classList.contains('show')?flyHideControls():flyShowControls(); }
function flyResetHideTimer(){ clearTimeout(flyControlsTimer); flyControlsTimer=setTimeout(()=>{ const v=document.getElementById('fly-video'); if(v&&!v.paused) flyHideControls(); },2000); }

/* ---------- Settings / Speed / Quality menus ---------- */
function flyCloseMenu(id){ const m=document.getElementById(id); if(m) m.classList.remove('show'); }
function flyCloseAllMenus(){ ['fly-settings-menu','fly-speed-menu','fly-quality-menu'].forEach(flyCloseMenu); }
function flyToggleSettings(e){ if(e) e.stopPropagation(); flyResetHideTimer(); const m=document.getElementById('fly-settings-menu'); const open=m.classList.contains('show'); flyCloseAllMenus(); if(!open) m.classList.add('show'); }
function flyOpenSpeed(e){ if(e) e.stopPropagation(); flyCloseAllMenus(); document.getElementById('fly-speed-menu').classList.add('show'); flyResetHideTimer(); }
function flyOpenQuality(e){ if(e) e.stopPropagation(); flyCloseAllMenus(); document.getElementById('fly-quality-menu').classList.add('show'); flyResetHideTimer(); }
function flyBackToSettings(e){ if(e) e.stopPropagation(); flyCloseAllMenus(); document.getElementById('fly-settings-menu').classList.add('show'); flyResetHideTimer(); }

function flyBuildSpeedMenu(){
    const list=document.getElementById('fly-speed-list'); if(!list) return;
    const speeds=[0.25,0.5,0.75,1,1.25,1.5,1.75,2];
    list.innerHTML=speeds.map(s=>`<div class="fly-menu-item ${s===flyCurrentSpeed?'active':''}" onclick="flySetSpeed(${s},event)"><span>${s===1?'Normal (1x)':s+'x'}</span>${s===flyCurrentSpeed?'<i class="fas fa-check"></i>':''}</div>`).join('');
}
function flySetSpeed(val,e){ if(e) e.stopPropagation(); const v=document.getElementById('fly-video'); if(v) v.playbackRate=val; flyCurrentSpeed=val;
    const lbl=document.getElementById('fly-speed-label'); if(lbl) lbl.innerText=val+'x';
    flyBuildSpeedMenu(); flyCloseAllMenus(); flyResetHideTimer(); }

function flyUpdateQualityLabel(){
    const v=document.getElementById('fly-video');
    const lbl=document.getElementById('fly-quality-label');
    if(!v||!lbl) return;
    const hls=v._flaynityHls;
    if(!hls||!Array.isArray(hls.levels)||!hls.levels.length){ lbl.innerText='Original'; return; }
    const activeLvl=hls.levels[hls.currentLevel];
    const activeH=activeLvl?(Math.min(activeLvl.width||0,activeLvl.height||0)||activeLvl.height||360):360;
    lbl.innerText=hls.autoLevelEnabled?`Auto (${activeH}p)`:`${activeH}p`;
}

function flyBuildQualityMenu(){
    const list=document.getElementById('fly-quality-list');
    const v=document.getElementById('fly-video');
    if(!list) return;
    const hls=v&&v._flaynityHls;
    if(!hls||!Array.isArray(hls.levels)||!hls.levels.length){
        list.innerHTML='<div class="fly-menu-item active"><span>Original</span><i class="fas fa-check"></i></div>';
        flyUpdateQualityLabel();
        return;
    }
    const isAuto=hls.autoLevelEnabled;
    const curIdx=hls.currentLevel;
    let html=`<div class="fly-menu-item ${isAuto?'active':''}" onclick="flySetQuality(-1,'Auto',event)"><span>Auto (Fast 360p–1080p)</span>${isAuto?'<i class="fas fa-check"></i>':''}</div>`;
    hls.levels.forEach((lvl,idx)=>{
        const q=Math.min(lvl.width||0,lvl.height||0)||lvl.height||360;
        const active=!isAuto && curIdx===idx;
        html+=`<div class="fly-menu-item ${active?'active':''}" onclick="flySetQuality(${idx},'${q}p',event)"><span>${q}p</span>${active?'<i class="fas fa-check"></i>':''}</div>`;
    });
    list.innerHTML=html;
    flyUpdateQualityLabel();
}

function flySetQuality(levelIndex,label,e){
    if(e) e.stopPropagation();
    const v=document.getElementById('fly-video');
    const hls=v&&v._flaynityHls;
    if(hls){
        hls.currentLevel=Number(levelIndex);
    }
    flyBuildQualityMenu();
    flyCloseAllMenus(); flyResetHideTimer();
}

/* ---------- Fullscreen (শুধু player landscape) ---------- */
let flyLandscape=false;
function flyApplyLandscapeUI(on){
    const wrap=document.getElementById('fly-player-wrap');
    if(wrap) wrap.classList.toggle('fly-landscape-on',!!on);
    document.body.classList.toggle('fly-landscape',!!on);
    const icon=document.getElementById('fly-fs-icon'); if(icon) icon.className=on?'fas fa-compress':'fas fa-expand';
}
function flySetLandscape(on){
    flyLandscape=!!on;
    flyApplyLandscapeUI(flyLandscape);
    try{ window.AndroidBridge.setPlayerLandscape(flyLandscape); }catch(e){}
    flyResetHideTimer();
}
// Called by MainActivity.java when Back is pressed while the player is landscape
window.flyOnLandscapeChanged=function(on){ flyLandscape=!!on; flyApplyLandscapeUI(flyLandscape); };
function flyToggleFullscreen(){
    if(window.AndroidBridge && typeof window.AndroidBridge.setPlayerLandscape==='function'){ flySetLandscape(!flyLandscape); return; }
    flyToggleFullscreenLegacy();
}
function flyToggleFullscreenLegacy(){
    const wrap=document.getElementById('fly-player-wrap'); if(!wrap) return;
    const fsEl=document.fullscreenElement||document.webkitFullscreenElement;
    if(!fsEl){
        const req=wrap.requestFullscreen||wrap.webkitRequestFullscreen; if(req) req.call(wrap);
        try{ if(screen.orientation&&screen.orientation.lock) screen.orientation.lock('landscape'); }catch(e){}
    }else{
        const ex=document.exitFullscreen||document.webkitExitFullscreen; if(ex) ex.call(document);
        try{ if(screen.orientation&&screen.orientation.unlock) screen.orientation.unlock(); }catch(e){}
    }
    flyResetHideTimer();
}
function flyOnFsChange(){
    const icon=document.getElementById('fly-fs-icon'); if(!icon) return;
    const fsEl=document.fullscreenElement||document.webkitFullscreenElement;
    icon.className=fsEl?'fas fa-compress':'fas fa-expand';
    if(!fsEl){ try{ if(screen.orientation&&screen.orientation.unlock) screen.orientation.unlock(); }catch(e){} }
}


/* ========================================================================
   FLAYNITY DISCOVER & FULLSCREEN REALTIME SEARCH ENGINE
   ======================================================================== */
let dbSearchCache = {
    videos: [],
    feels: [],
    channels: [],
    loaded: false
};
let searchDebounce = null;

function initSearchEvents() {
    const triggerBar = document.getElementById('discover-search-trigger');
    if (triggerBar && !triggerBar.dataset.searchBound) {
        triggerBar.dataset.searchBound = '1';
        triggerBar.addEventListener('click', () => {
            if (typeof playUI === 'function') playUI('click');
            openFullscreenSearch();
        });
    }

    const micPill = document.querySelector('.discover-mic-pill');
    if (micPill && !micPill.dataset.searchBound) {
        micPill.dataset.searchBound = '1';
        micPill.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof playUI === 'function') playUI('click');
            openFullscreenSearch(true);
        });
    }

    const backBtn = document.getElementById('search-back-btn');
    if (backBtn && !backBtn.dataset.searchBound) {
        backBtn.dataset.searchBound = '1';
        backBtn.addEventListener('click', () => {
            if (typeof playUI === 'function') playUI('click');
            closeFullscreenSearch();
        });
    }

    const searchInput = document.getElementById('search-active-input');
    if (searchInput && !searchInput.dataset.searchBound) {
        searchInput.dataset.searchBound = '1';
        searchInput.addEventListener('input', (e) => handleSearchInput(e.target.value));
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeFinalSearch(e.target.value);
            }
        });
    }

    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn && !clearBtn.dataset.searchBound) {
        clearBtn.dataset.searchBound = '1';
        clearBtn.addEventListener('click', () => {
            if (typeof playUI === 'function') playUI('click');
            clearSearchInput();
        });
    }

    document.querySelectorAll('#search-tabs .search-tab-btn').forEach(tb => {
        if (tb.dataset.searchBound) return;
        tb.dataset.searchBound = '1';
        tb.addEventListener('click', () => {
            if (typeof playUI === 'function') playUI('click');
            setSearchTab(tb.dataset.tab);
        });
    });
    const moreBtn = document.getElementById('search-more-btn');
    if (moreBtn && !moreBtn.dataset.searchBound) {
        moreBtn.dataset.searchBound = '1';
        moreBtn.addEventListener('click', () => {
            if (typeof playUI === 'function') playUI('click');
            if (typeof onSearchMoreClick === 'function') onSearchMoreClick();
        });
    }

    const goBtn = document.getElementById('search-go-btn');
    if (goBtn && !goBtn.dataset.searchBound) {
        goBtn.dataset.searchBound = '1';
        goBtn.addEventListener('click', () => {
            if (typeof playUI === 'function') playUI('click');
            const inp = document.getElementById('search-active-input');
            if (inp) executeFinalSearch(inp.value);
        });
    }

    const micBtn = document.getElementById('search-mic-btn');
    if (micBtn && !micBtn.dataset.searchBound) {
        micBtn.dataset.searchBound = '1';
        micBtn.addEventListener('click', () => {
            if (typeof playUI === 'function') playUI('click');
            startVoiceRecognition();
        });
    }

    document.querySelectorAll('.discover-tag-chip').forEach(chip => {
        if (chip.dataset.searchBound) return;
        chip.dataset.searchBound = '1';
        chip.addEventListener('click', () => {
            if (typeof playUI === 'function') playUI('click');
            const keyword = chip.innerText.trim();
            if (!keyword || keyword.toLowerCase() === 'all') return;
            openFullscreenSearch();
            const input = document.getElementById('search-active-input');
            if (input) input.value = keyword;
            handleSearchInput(keyword);
            executeFinalSearch(keyword);
        });
    });
}

function preloadFirebaseSearchData() {
    if (typeof firebase === 'undefined' || !firebase.database) return;
    const db = firebase.database();

    // Keep compatibility with the current Flaynity Firebase structure.
    const videoPaths = ['videos', 'admin_panel/movies/user_uploads'];
    const feelPaths = ['feels', 'admin_panel/movies/feels'];

    function bindMerged(paths, target) {
        paths.forEach(path => {
            db.ref(path).on('value', (snap) => {
                const val = snap.val() || {};
                const incoming = Object.keys(val).map(key => ({ id: key, ...(val[key] || {}) }));
                const merged = [...dbSearchCache[target].filter(item => !incoming.some(x => String(x.id) === String(item.id))), ...incoming];
                dbSearchCache[target] = merged;
                dbSearchCache.loaded = true;
            });
        });
    }

    db.ref('channels').on('value', (snap) => {
        const val = snap.val() || {};
        dbSearchCache.channels = Object.keys(val).map(key => ({ id: key, ...(val[key] || {}) }));
    });
    bindMerged(videoPaths, 'videos');
    bindMerged(feelPaths, 'feels');
}

/* ---------- Recent searches (stored on device) ---------- */
const RECENT_SEARCH_KEY = 'flaynity_recent_searches';
const SEARCH_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.8"/><path d="m15.8 15.8 5 5"/></svg>';
const CLOCK_ICON_SVG = '<svg class="recent-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 6.8V12l3.4 2.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const X_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19"/></svg>';

function getRecentSearches() {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
}
function saveRecentSearches(list) {
    try { localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(list.slice(0, 20))); } catch (e) {}
}
function addRecentSearch(keyword) {
    const k = String(keyword || '').trim();
    if (!k) return;
    const list = getRecentSearches().filter(x => x.toLowerCase() !== k.toLowerCase());
    list.unshift(k);
    saveRecentSearches(list);
}
function removeRecentSearch(index) {
    const list = getRecentSearches();
    list.splice(index, 1);
    saveRecentSearches(list);
    renderRecentSearches();
}
function clearAllRecentSearches() {
    saveRecentSearches([]);
    renderRecentSearches();
}
function selectRecentSearch(index) {
    const k = getRecentSearches()[index];
    if (k) selectSuggestedKeyword(k);
}
function renderRecentSearches() {
    const box = document.getElementById('search-recent-container');
    if (!box) return;
    const list = getRecentSearches();
    if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    box.innerHTML = `
        <div class="recent-head">
            <span class="recent-title">Recent searches</span>
            <button class="recent-clear" onclick="clearAllRecentSearches()">Clear all</button>
        </div>
        ${list.map((k, i) => `
            <div class="recent-item" onclick="selectRecentSearch(${i})">
                ${CLOCK_ICON_SVG}
                <span class="recent-text">${escapeHtml(k)}</span>
                <button class="recent-x" aria-label="Remove" onclick="event.stopPropagation(); removeRecentSearch(${i})">${X_ICON_SVG}</button>
            </div>`).join('')}
    `;
}

function showSearchToast(msg) {
    const old = document.querySelector('.dc-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'dc-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
}

function setSearchPanels(mode) { // 'recent' | 'suggest' | 'results'
    const pageEl = document.getElementById('fullscreen-search-page');
    if (pageEl) pageEl.classList.toggle('is-results', mode === 'results');
    const recent = document.getElementById('search-recent-container');
    const sugWrap = document.getElementById('search-suggestions-wrap');
    const sug = document.getElementById('search-suggestions-container');
    const res = document.getElementById('search-results-container');
    if (mode === 'recent') {
        renderRecentSearches();
        if (sugWrap) sugWrap.style.display = 'none';
        if (sug) sug.innerHTML = '';
        if (res) res.style.display = 'none';
    } else if (mode === 'suggest') {
        if (recent) recent.style.display = 'none';
        if (sugWrap) sugWrap.style.display = 'block';
        if (res) res.style.display = 'none';
    } else {
        if (recent) recent.style.display = 'none';
        if (sugWrap) sugWrap.style.display = 'none';
        if (sug) sug.innerHTML = '';
    }
}

function openFullscreenSearch(withVoice = false) {
    const page = document.getElementById('fullscreen-search-page');
    const input = document.getElementById('search-active-input');
    if (!page) return;
    page.style.display = 'flex';
    setSearchPanels('recent');
    if (input) input.focus();
    if (withVoice) startVoiceRecognition();
}

function closeFullscreenSearch() {
    const page = document.getElementById('fullscreen-search-page');
    if (!page) return;
    page.style.display = 'none';
    clearSearchInput(false);
    setSearchPanels('recent');
    const recent = document.getElementById('search-recent-container');
    if (recent) recent.style.display = 'none';
}

function handleSearchInput(query) {
    const clearBtn = document.getElementById('search-clear-btn');
    const trimmed = query.trim();

    if (trimmed.length > 0) {
        if (clearBtn) clearBtn.style.display = 'flex';
        setSearchPanels('suggest');
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => generateFirebaseSuggestions(trimmed), 120);
    } else {
        if (clearBtn) clearBtn.style.display = 'none';
        clearTimeout(searchDebounce);
        setSearchPanels('recent');
    }
}

function clearSearchInput(refocus = true) {
    const input = document.getElementById('search-active-input');
    if (input) {
        input.value = '';
        handleSearchInput('');
        if (refocus) input.focus();
    }
}

function highlightSuggestion(keyword, query) {
    const idx = keyword.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return escapeHtml(keyword);
    return escapeHtml(keyword.slice(0, idx)) +
        '<span class="hl">' + escapeHtml(keyword.slice(idx, idx + query.length)) + '</span>' +
        escapeHtml(keyword.slice(idx + query.length));
}

function generateFirebaseSuggestions(query) {
    const container = document.getElementById('search-suggestions-container');
    if (!container) return;
    const lowerQuery = query.toLowerCase();
    const suggestionsSet = new Set();
    const allItems = [...dbSearchCache.videos, ...dbSearchCache.feels, ...(typeof allCommunityPosts !== 'undefined' ? allCommunityPosts : [])];

    // Starts-with matches first (like TikTok), then "contains" matches
    const starts = [], contains = [];
    allItems.forEach(item => {
        const title = String(item.title || '').trim();
        const desc = String(item.description || '').trim();
        if (!title) return;
        if (title.toLowerCase().startsWith(lowerQuery)) starts.push(title);
        else if (`${title} ${desc}`.toLowerCase().includes(lowerQuery)) contains.push(title);
    });
    [...starts, ...contains].forEach(t => suggestionsSet.add(t));

    if (suggestionsSet.size < 6) {
        [`${query} video`, `${query} song`, `${query} feels`, `${query} viral`, `${query} new`]
            .forEach(s => { if (suggestionsSet.size < 10) suggestionsSet.add(s); });
    }

    const finalList = Array.from(suggestionsSet).slice(0, 10);
    container.innerHTML = finalList.map(keyword => `
        <div class="suggestion-item" data-kw="${escapeHtml(keyword)}">
            <span class="suggestion-ic">${SEARCH_ICON_SVG}</span>
            <span class="suggestion-text">${highlightSuggestion(keyword, query)}</span>
        </div>
    `).join('');

    // tap = search, long-press = report (hides the suggestion)
    container.querySelectorAll('.suggestion-item').forEach(el => {
        let timer = null, longPressed = false;
        const start = () => {
            longPressed = false;
            timer = setTimeout(() => {
                longPressed = true;
                el.remove();
                showSearchToast('Thanks for your report');
            }, 550);
        };
        const cancel = () => clearTimeout(timer);
        el.addEventListener('touchstart', start, { passive: true });
        el.addEventListener('touchend', cancel);
        el.addEventListener('touchmove', cancel, { passive: true });
        el.addEventListener('touchcancel', cancel);
        el.addEventListener('contextmenu', e => e.preventDefault());
        el.addEventListener('click', () => {
            if (longPressed) { longPressed = false; return; }
            selectSuggestedKeyword(el.getAttribute('data-kw'));
        });
    });
}

function selectSuggestedKeyword(keyword) {
    if (typeof playUI === 'function') playUI('click');
    const input = document.getElementById('search-active-input');
    if (input) { input.value = keyword; input.blur(); }
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'flex';
    executeFinalSearch(keyword);
}

function executeFinalSearch(keyword) {
    const query = String(keyword || '').trim().toLowerCase();
    if (!query) return;
    addRecentSearch(String(keyword).trim());
    setSearchPanels('results');
    const resultsWrap = document.getElementById('search-results-container');
    if (resultsWrap) resultsWrap.style.display = 'flex';
    bindSearchResultNav();

    const noResult = document.getElementById('search-no-result');
    if (!noResult) return;
    noResult.style.display = 'none';

    // Same data + same admin switches as the Home feed
    const src = getSearchSources();
    const on = (k) => (typeof isAdminFeatureEnabled !== 'function') || isAdminFeatureEnabled(k);
    const newest = (a, b) => (b.createdAt || b.uploadTime || 0) - (a.createdAt || a.uploadTime || 0);
    const hit = (item, fields) => {
        const text = fields.map(f => String(item[f] || '')).join(' ').toLowerCase();
        return text.includes(query) || text.replace(/\s+/g, '').includes(query.replace(/\s+/g, ''));
    };

    const videos = on('homeVideosEnabled') ? src.videos.filter(v => hit(v, ['title', 'description', 'username'])).sort(newest) : [];
    const posts  = on('homePostsEnabled')  ? src.posts.filter(p => hit(p, ['title', 'caption', 'username'])).sort(newest) : [];
    const feels  = on('homeFeelsEnabled')  ? src.feels.filter(f => hit(f, ['title', 'description', 'username'])).sort(newest) : [];

    // "Top" tab: Videos + Photos(Posts) + Feels mixed in RANDOM order (shuffled once per search)
    const mixed = shuffleArray([
        ...videos.map(d => ({ k: 'v', d })),
        ...posts.map(d => ({ k: 'p', d })),
        ...feels.map(d => ({ k: 'f', d }))
    ]);
    const topBlocks = [];
    let feelBuf = [];
    mixed.forEach(m => {
        if (m.k === 'f') {
            feelBuf.push(m.d);
            if (feelBuf.length === 2) { topBlocks.push({ t: 'f', d: feelBuf }); feelBuf = []; }
        } else {
            topBlocks.push({ t: m.k, d: m.d });
        }
    });
    if (feelBuf.length) topBlocks.push({ t: 'f', d: feelBuf });

    searchData = { videos, posts, feels, topBlocks };
    const matchedUsers = renderUserResults(query);
    searchCounts = { users: matchedUsers, videos: videos.length, photos: posts.length, feels: feels.length };
    setSearchTab('top');
}

/* ---------- Results tabs + Home-style cards ---------- */
let searchCounts = { users: 0, videos: 0, photos: 0, feels: 0 };
let searchData = { videos: [], posts: [], feels: [], topBlocks: [] };
let searchSubRefs = [];
let searchFeedState = { blocks: [], idx: 0, io: null };
const SEARCH_CHUNK = 6;

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function getSearchSources() {
    const homeLoaded = typeof allLongVideos !== 'undefined' &&
        (allLongVideos.length || allFeels.length || allCommunityPosts.length);
    if (homeLoaded) return { videos: allLongVideos, feels: allFeels, posts: allCommunityPosts };
    // Fallback if the Home feed has not loaded yet
    const norm = (it) => ({ ...it, poster: it.poster || it.thumbnail || it.banner || '', createdAt: it.createdAt || it.uploadTime || 0 });
    return {
        videos: dbSearchCache.videos.filter(v => !v.isShort && !v.isPost).map(norm),
        feels: dbSearchCache.feels.map(norm),
        posts: []
    };
}

function searchFeelCard(s) {
    const id = escapeHtml(String(s.id));
    return `
        <div class="short-home-card-2col" onclick="openSearchedFeel('${id}')">
            <img src="${escapeHtml(s.poster || s.thumbnail || '')}" loading="lazy" alt="">
            <div class="short-home-meta">
                <h4 style="font-size:0.85rem;font-weight:800;margin:0 0 2px 0;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.title || 'Untitled')}</h4>
                <p style="font-size:0.7rem;font-weight:700;margin:0;opacity:0.9;"><i class="fas fa-play"></i> <span data-sr-views="${id}">0</span></p>
            </div>
        </div>`;
}

function renderSearchBlock(b) {
    if (b.t === 'v') return fxBuildLongVideoCard(b.d);
    if (b.t === 'p') return renderSinglePostSegmentUI(b.d);
    return `<div class="feels-home-grid-2col sr-feels-grid">${b.d.map(searchFeelCard).join('')}</div>`;
}

function renderSearchFeedChunk() {
    const feed = document.getElementById('search-feed-results');
    const st = searchFeedState;
    if (!feed || st.idx >= st.blocks.length) return;
    const slice = st.blocks.slice(st.idx, st.idx + SEARCH_CHUNK);
    st.idx += SEARCH_CHUNK;

    const uids = new Set();
    const feelIds = [];
    let html = '';
    slice.forEach(b => {
        if (b.t === 'f') b.d.forEach(s => { if (s.userId) uids.add(s.userId); feelIds.push(String(s.id)); });
        else if (b.d.userId) uids.add(b.d.userId);
        if (b.t === 'v') setTimeout(() => fxLoadCardStats(String(b.d.id)), 0);
        html += renderSearchBlock(b);
    });
    feed.insertAdjacentHTML('beforeend', html);

    uids.forEach(uid => { try { bindLiveChannelUI(uid); } catch (e) {} });
    if (typeof db !== 'undefined' && navigator.onLine) {
        feelIds.forEach(id => {
            db.ref(`movie_stats/${id}/views`).once('value', (snap) => {
                const n = Object.keys(snap.val() || {}).length;
                feed.querySelectorAll(`[data-sr-views="${id}"]`).forEach(el => { el.textContent = formatCount(n); });
            });
        });
    }

    // re-arm the observer so the next chunk loads if the end is still on screen
    const sentinel = document.getElementById('search-feed-sentinel');
    if (st.io && sentinel && st.idx < st.blocks.length) { st.io.unobserve(sentinel); st.io.observe(sentinel); }
}

function setSearchTab(tab) {
    const wrap = document.getElementById('search-results-container');
    if (!wrap) return;
    wrap.setAttribute('data-tab', tab);
    document.querySelectorAll('#search-tabs .search-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    const c = searchCounts;
    const usersSec = document.getElementById('search-users-section');
    if (usersSec) usersSec.style.display = ((tab === 'top' || tab === 'users') && c.users > 0) ? 'block' : 'none';

    // Pick what the feed shows for this tab
    let blocks = [];
    if (tab === 'top') blocks = searchData.topBlocks;
    else if (tab === 'videos') blocks = searchData.videos.map(d => ({ t: 'v', d }));
    else if (tab === 'photos') blocks = searchData.posts.map(d => ({ t: 'p', d }));
    else if (tab === 'feels') {
        for (let i = 0; i < searchData.feels.length; i += 2) blocks.push({ t: 'f', d: searchData.feels.slice(i, i + 2) });
    }

    const feed = document.getElementById('search-feed-results');
    if (feed) feed.innerHTML = '';
    const st = searchFeelsReset(blocks);

    const total = tab === 'top' ? c.users + c.videos + c.photos + c.feels : tab === 'users' ? c.users : c[tab];
    const nr = document.getElementById('search-no-result');
    if (nr) {
        nr.style.display = total === 0 ? 'block' : 'none';
        const p = nr.querySelector('p');
        const labels = { videos: 'No videos found', photos: 'No photos found', feels: 'No feels found', users: 'No users found' };
        if (p) p.textContent = labels[tab] || 'No results found';
    }

    if (st.blocks.length) renderSearchFeedChunk();
    const page = document.getElementById('fullscreen-search-page');
    if (page) page.scrollTop = 0;
}

function searchFeelsReset(blocks) {
    const st = searchFeedState;
    st.blocks = blocks;
    st.idx = 0;
    if (!st.io && 'IntersectionObserver' in window) {
        const sentinel = document.getElementById('search-feed-sentinel');
        const root = document.getElementById('fullscreen-search-page');
        if (sentinel && root) {
            st.io = new IntersectionObserver((entries) => {
                if (entries.some(e => e.isIntersecting)) renderSearchFeedChunk();
            }, { root, rootMargin: '700px 0px' });
            st.io.observe(sentinel);
        }
    }
    return st;
}

function openSearchedFeel(feelId) {
    if (typeof playUI === 'function') playUI('click');
    closeFullscreenSearch();
    if (typeof openShortFromHome === 'function') openShortFromHome(feelId);
    else handleOpenFeel(feelId);
}

// Tapping a Video / Post card opens it ON TOP of the app, so close the search overlay first.
// Like / subscribe / hide / menu / share buttons keep working in place.
function bindSearchResultNav() {
    const wrap = document.getElementById('search-results-container');
    if (!wrap || wrap.dataset.navBound) return;
    wrap.dataset.navBound = '1';
    wrap.addEventListener('click', (e) => {
        const t = e.target;
        if (t.closest('.user-row, .short-home-card-2col')) return;
        if (t.closest('.post-action-btn-fb, .fx-dislike, .fb-subbtn, .fb-x, .fb-hbtn, .fx-more, .fx-cap-more, .fx-share, .fb-seemore, [onclick*="fbSharePost"]')) return;
        if (t.closest('.fx-card, .post-card')) closeFullscreenSearch();
    }, true);
}

function userAvatarFallback() {
    return '<svg viewBox="0 0 56 56"><rect width="56" height="56" fill="#e4e4e7"/><circle cx="28" cy="22" r="9" fill="#fff"/><path d="M10 56c0-11 8-17 18-17s18 6 18 17z" fill="#fff"/></svg>';
}

function renderUserResults(query) {
    const list = document.getElementById('search-users-results');
    searchSubRefs.forEach(r => { try { r.off(); } catch (e) {} });
    searchSubRefs = [];
    if (!list) return 0;
    const q = query.toLowerCase();
    const qCompact = q.replace(/\s+/g, '');
    const matched = dbSearchCache.channels.filter(c => {
        const handle = String(c.handle || '').toLowerCase();
        const name = String(c.channelName || '').toLowerCase();
        return handle.includes(q) || name.includes(q) ||
               handle.includes(qCompact) || name.replace(/\s+/g, '').includes(qCompact);
    }).sort((a, b) => (Number(b.subscribersCount) || 0) - (Number(a.subscribersCount) || 0)).slice(0, 30);

    const myUid = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.uid : null;
    list.innerHTML = matched.map(c => {
        const id = String(c.channelId || c.id);
        const subs = Number(c.subscribersCount) || 0;
        const avatarUrl = c.avatarUrl || c.channelImageUrl || c.profileImageUrl || c.photoURL || c.photoUrl || c.imageUrl || '';
        const avatar = avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="" loading="eager" onerror="this.remove()">` : '';
        return `
        <div class="user-row" onclick="openSearchedChannel('${escapeHtml(id)}')">
            <div class="user-avatar">${userAvatarFallback()}${avatar}</div>
            <div class="user-info">
                <div class="user-handle">${escapeHtml(c.handle || c.channelName || 'user')}</div>
                <div class="user-name">${escapeHtml(c.channelName || c.handle || '')}</div>
                <div class="user-subs">${escapeHtml(String(formatCount(subs)))} subscribers</div>
            </div>
            ${id === myUid ? '' : `<button class="user-sub-btn" id="user-sub-${escapeHtml(id)}" onclick="event.stopPropagation(); toggleClipSubscribe('${escapeHtml(id)}', this)">Subscribe</button>`}
        </div>`;
    }).join('');

    if (myUid && typeof db !== 'undefined') {
        matched.forEach(c => {
            const id = String(c.channelId || c.id);
            if (id === myUid) return;
            const ref = db.ref(`subscribers/${id}/${myUid}`);
            ref.on('value', (snap) => {
                const btn = document.getElementById('user-sub-' + id);
                if (!btn) return;
                const on = snap.exists();
                btn.textContent = on ? 'Subscribed' : 'Subscribe';
                btn.classList.toggle('subscribed', on);
            });
            searchSubRefs.push(ref);
        });
    }
    return matched.length;
}

function openSearchedChannel(channelId) {
    if (typeof playUI === 'function') playUI('click');
    // Hook: define window.openChannelProfile(channelId) in your app to open the public channel page.
    if (typeof window.openChannelProfile === 'function') {
        closeFullscreenSearch();
        window.openChannelProfile(channelId);
    }
}

function startVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Voice recognition is not supported on this browser.');
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = function() {
        const micBtn = document.getElementById('search-mic-btn');
        if (micBtn) micBtn.style.color = 'var(--primary)';
    };
    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        const input = document.getElementById('search-active-input');
        if (input) {
            input.value = transcript;
            handleSearchInput(transcript);
            executeFinalSearch(transcript);
        }
    };
    recognition.onspeechend = function() { recognition.stop(); };
    recognition.onend = function() {
        const micBtn = document.getElementById('search-mic-btn');
        if (micBtn) micBtn.style.color = 'var(--text-muted)';
    };
    recognition.onerror = function() {
        const micBtn = document.getElementById('search-mic-btn');
        if (micBtn) micBtn.style.color = 'var(--text-muted)';
    };
    try { recognition.start(); } catch (e) {}
}

function handleOpenVideo(videoId) {
    if (typeof playUI === 'function') playUI('click');
    closeFullscreenSearch();
    if (typeof openMoviePage === 'function') openMoviePage(videoId, false);
    else if (typeof playVideoById === 'function') playVideoById(videoId);
    else if (typeof openFullMoviePage === 'function') openFullMoviePage(videoId);
}

function handleOpenFeel(feelId) {
    if (typeof playUI === 'function') playUI('click');
    closeFullscreenSearch();
    if (typeof openMoviePage === 'function') openMoviePage(feelId, false);
    else if (typeof switchTab === 'function') {
        switchTab('feels');
        if (typeof feelsProgrammaticTargetId !== 'undefined') {
            feelsProgrammaticTargetId = String(feelId);
            feelsProgrammaticTargetUntil = Date.now() + 3000;
        }
    }
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function initFlaynityDiscoverSearch() {
    initSearchEvents();
    preloadFirebaseSearchData();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFlaynityDiscoverSearch, { once: true });
} else {
    initFlaynityDiscoverSearch();
}
// Discover markup is injected asynchronously by the modular page loader.
window.addEventListener('flaynity-dom-ready', initFlaynityDiscoverSearch);
window.addEventListener('flaynity-pages-ready', initFlaynityDiscoverSearch);
window.addEventListener('flaynity-tab-changed', initFlaynityDiscoverSearch);


/* FLAYNITY_APP_LANGUAGE_SYSTEM_V1
   App-wide UI localization kept in this file (no separate language files).
   Only interface text is translated; user-generated content and Firebase data remain untouched. */
(function () {
    'use strict';

    const LANG_KEY = 'flaynity-app-language';
    const LANGUAGES = {
        bn: {
            name: 'বাংলা', dir: 'ltr',
            map: {
                'Home':'হোম','Feels':'ফিলস','Shorts':'ফিলস','Upload':'আপলোড','Discover':'আবিষ্কার','You':'আপনি',
                'Setting':'সেটিংস','Settings':'সেটিংস','App Language':'অ্যাপের ভাষা','Switch Theme':'থিম পরিবর্তন',
                'Light Theme':'লাইট থিম','Dark Theme':'ডার্ক থিম','Data Saver':'ডেটা সেভার','Account':'অ্যাকাউন্ট',
                'Appearance':'চেহারা','Privacy':'গোপনীয়তা','Support':'সহায়তা','Content & Playback':'কনটেন্ট ও প্লেব্যাক',
                'Flaynity Features':'Flaynity ফিচার','Edit Profile':'প্রোফাইল সম্পাদনা','Switch Account':'অ্যাকাউন্ট পরিবর্তন',
                'Create a Channel':'চ্যানেল তৈরি করুন','View Channel':'চ্যানেল দেখুন','Create Channel':'চ্যানেল তৈরি করুন',
                'Upgrade Pro':'প্রো আপগ্রেড','Flay Verified Badge':'Flay ভেরিফায়েড ব্যাজ','Boost Content':'কনটেন্ট বুস্ট',
                'Flay Pay':'Flay Pay','Private Account':'প্রাইভেট অ্যাকাউন্ট','Who Can See My Content':'আমার কনটেন্ট কে দেখতে পারবে',
                'Who Can Comment':'কে মন্তব্য করতে পারবে','Who Can Subscribe Me':'কে সাবস্ক্রাইব করতে পারবে',
                'Who Can Like Me':'কে লাইক দিতে পারবে','Download Settings':'ডাউনলোড সেটিংস',
                'Content Quality':'কনটেন্টের মান','Autoplay':'স্বয়ংক্রিয় প্লে','Help Center':'সহায়তা কেন্দ্র',
                'Report a Problem':'সমস্যা জানান','Terms of Service':'সেবার শর্তাবলি','Privacy Policy':'গোপনীয়তা নীতি',
                'Cookie Policy':'কুকি নীতি','Copyright & DMCA':'কপিরাইট ও DMCA','About Flaynity':'Flaynity সম্পর্কে',
                'Cancel':'বাতিল','Save':'সংরক্ষণ','Done':'সম্পন্ন','Next':'পরবর্তী','Back':'ফিরে যান',
                'Search':'খুঁজুন','For You':'আপনার জন্য','Subscribe':'সাবস্ক্রাইব','Subscribed':'সাবস্ক্রাইব করা হয়েছে',
                'Like':'লাইক','Comment':'মন্তব্য','Download':'ডাউনলোড','Share':'শেয়ার','Views':'ভিউ',
                'Video quality':'ভিডিওর মান','Manage your default video quality':'আপনার ডিফল্ট ভিডিওর মান নির্ধারণ করুন',
                'No description provided yet.':'এখনও কোনো বিবরণ দেওয়া হয়নি।','Loading...':'লোড হচ্ছে...',
                'Retry':'আবার চেষ্টা করুন','Continue':'চালিয়ে যান','Create':'তৈরি করুন','Edit':'সম্পাদনা',
                'Profile':'প্রোফাইল','Channel':'চ্যানেল','Posts':'পোস্ট','Videos':'ভিডিও','Comments':'মন্তব্য',
                'Notifications':'নোটিফিকেশন','Wallet':'ওয়ালেট','Earning':'আয়','Flay Earning':'Flay আয়',
                'Who can see your content?':'আপনার কনটেন্ট কে দেখতে পারবে?','Everyone':'সবাই','No one':'কেউ না',
                'Public':'পাবলিক','Private':'প্রাইভেট','Language changed':'ভাষা পরিবর্তন হয়েছে'
            }
        },
        en: { name:'English', dir:'ltr', map:{} },
        hi: {
            name:'हिन्दी', dir:'ltr',
            map: {
                'Home':'होम','Feels':'फील्स','Shorts':'फील्स','Upload':'अपलोड','Discover':'खोजें','You':'आप',
                'Setting':'सेटिंग','Settings':'सेटिंग्स','App Language':'ऐप की भाषा','Switch Theme':'थीम बदलें',
                'Light Theme':'लाइट थीम','Dark Theme':'डार्क थीम','Data Saver':'डेटा सेवर','Account':'खाता',
                'Appearance':'दिखावट','Privacy':'गोपनीयता','Support':'सहायता','Content & Playback':'कंटेंट और प्लेबैक',
                'Flaynity Features':'Flaynity सुविधाएँ','Edit Profile':'प्रोफ़ाइल संपादित करें','Switch Account':'खाता बदलें',
                'Create a Channel':'चैनल बनाएँ','View Channel':'चैनल देखें','Create Channel':'चैनल बनाएँ',
                'Upgrade Pro':'प्रो अपग्रेड','Private Account':'निजी खाता','Download Settings':'डाउनलोड सेटिंग्स',
                'Content Quality':'कंटेंट गुणवत्ता','Autoplay':'ऑटो प्ले','Help Center':'सहायता केंद्र',
                'Report a Problem':'समस्या रिपोर्ट करें','Terms of Service':'सेवा की शर्तें','Privacy Policy':'गोपनीयता नीति',
                'Cookie Policy':'कुकी नीति','Cancel':'रद्द करें','Save':'सेव करें','Done':'हो गया','Next':'अगला',
                'Back':'वापस','Search':'खोजें','For You':'आपके लिए','Subscribe':'सब्सक्राइब','Subscribed':'सब्सक्राइब किया गया',
                'Like':'लाइक','Comment':'टिप्पणी','Download':'डाउनलोड','Share':'शेयर','Views':'व्यूज़',
                'Video quality':'वीडियो गुणवत्ता','Loading...':'लोड हो रहा है','Retry':'फिर कोशिश करें',
                'Continue':'जारी रखें','Create':'बनाएँ','Edit':'संपादित करें','Profile':'प्रोफ़ाइल','Channel':'चैनल',
                'Posts':'पोस्ट','Videos':'वीडियो','Comments':'टिप्पणियाँ','Notifications':'सूचनाएँ','Wallet':'वॉलेट'
            }
        },
        es: {
            name:'Español', dir:'ltr',
            map: {
                'Home':'Inicio','Feels':'Feels','Shorts':'Feels','Upload':'Subir','Discover':'Descubrir','You':'Tú',
                'Setting':'Ajustes','Settings':'Ajustes','App Language':'Idioma de la app','Switch Theme':'Cambiar tema',
                'Light Theme':'Tema claro','Dark Theme':'Tema oscuro','Data Saver':'Ahorro de datos','Account':'Cuenta',
                'Appearance':'Apariencia','Privacy':'Privacidad','Support':'Ayuda','Content & Playback':'Contenido y reproducción',
                'Flaynity Features':'Funciones de Flaynity','Edit Profile':'Editar perfil','Switch Account':'Cambiar cuenta',
                'Create a Channel':'Crear un canal','View Channel':'Ver canal','Create Channel':'Crear canal',
                'Upgrade Pro':'Mejorar a Pro','Private Account':'Cuenta privada','Download Settings':'Ajustes de descarga',
                'Content Quality':'Calidad del contenido','Autoplay':'Reproducción automática','Help Center':'Centro de ayuda',
                'Report a Problem':'Informar de un problema','Terms of Service':'Términos del servicio','Privacy Policy':'Política de privacidad',
                'Cookie Policy':'Política de cookies','Cancel':'Cancelar','Save':'Guardar','Done':'Listo','Next':'Siguiente',
                'Back':'Atrás','Search':'Buscar','For You':'Para ti','Subscribe':'Suscribirse','Subscribed':'Suscrito',
                'Like':'Me gusta','Comment':'Comentar','Download':'Descargar','Share':'Compartir','Views':'Visualizaciones',
                'Video quality':'Calidad del video','Loading...':'Cargando...','Retry':'Reintentar','Continue':'Continuar',
                'Create':'Crear','Edit':'Editar','Profile':'Perfil','Channel':'Canal','Posts':'Publicaciones',
                'Videos':'Videos','Comments':'Comentarios','Notifications':'Notificaciones','Wallet':'Cartera'
            }
        },
        fr: {
            name:'Français', dir:'ltr',
            map: {
                'Home':'Accueil','Feels':'Feels','Shorts':'Feels','Upload':'Publier','Discover':'Découvrir','You':'Vous',
                'Setting':'Paramètres','Settings':'Paramètres','App Language':'Langue de l’application','Switch Theme':'Changer de thème',
                'Light Theme':'Thème clair','Dark Theme':'Thème sombre','Data Saver':'Économiseur de données','Account':'Compte',
                'Appearance':'Apparence','Privacy':'Confidentialité','Support':'Assistance','Content & Playback':'Contenu et lecture',
                'Flaynity Features':'Fonctionnalités Flaynity','Edit Profile':'Modifier le profil','Switch Account':'Changer de compte',
                'Create a Channel':'Créer une chaîne','View Channel':'Voir la chaîne','Create Channel':'Créer une chaîne',
                'Upgrade Pro':'Passer à Pro','Private Account':'Compte privé','Download Settings':'Paramètres de téléchargement',
                'Content Quality':'Qualité du contenu','Autoplay':'Lecture automatique','Help Center':'Centre d’aide',
                'Report a Problem':'Signaler un problème','Terms of Service':'Conditions d’utilisation','Privacy Policy':'Politique de confidentialité',
                'Cookie Policy':'Politique relative aux cookies','Cancel':'Annuler','Save':'Enregistrer','Done':'Terminé',
                'Next':'Suivant','Back':'Retour','Search':'Rechercher','For You':'Pour vous','Subscribe':'S’abonner',
                'Subscribed':'Abonné','Like':'J’aime','Comment':'Commenter','Download':'Télécharger','Share':'Partager',
                'Views':'Vues','Video quality':'Qualité vidéo','Loading...':'Chargement…','Retry':'Réessayer',
                'Continue':'Continuer','Create':'Créer','Edit':'Modifier','Profile':'Profil','Channel':'Chaîne',
                'Posts':'Publications','Videos':'Vidéos','Comments':'Commentaires','Notifications':'Notifications','Wallet':'Portefeuille'
            }
        },
        ar: {
            name:'العربية', dir:'rtl',
            map: {
                'Home':'الرئيسية','Feels':'فيلز','Shorts':'فيلز','Upload':'رفع','Discover':'اكتشف','You':'أنت',
                'Setting':'الإعدادات','Settings':'الإعدادات','App Language':'لغة التطبيق','Switch Theme':'تغيير المظهر',
                'Light Theme':'المظهر الفاتح','Dark Theme':'المظهر الداكن','Data Saver':'توفير البيانات','Account':'الحساب',
                'Appearance':'المظهر','Privacy':'الخصوصية','Support':'الدعم','Content & Playback':'المحتوى والتشغيل',
                'Flaynity Features':'ميزات Flaynity','Edit Profile':'تعديل الملف الشخصي','Switch Account':'تبديل الحساب',
                'Create a Channel':'إنشاء قناة','View Channel':'عرض القناة','Create Channel':'إنشاء قناة',
                'Upgrade Pro':'الترقية إلى Pro','Private Account':'حساب خاص','Download Settings':'إعدادات التنزيل',
                'Content Quality':'جودة المحتوى','Autoplay':'التشغيل التلقائي','Help Center':'مركز المساعدة',
                'Report a Problem':'الإبلاغ عن مشكلة','Terms of Service':'شروط الخدمة','Privacy Policy':'سياسة الخصوصية',
                'Cookie Policy':'سياسة ملفات تعريف الارتباط','Cancel':'إلغاء','Save':'حفظ','Done':'تم','Next':'التالي',
                'Back':'رجوع','Search':'بحث','For You':'لك','Subscribe':'اشتراك','Subscribed':'مشترك',
                'Like':'إعجاب','Comment':'تعليق','Download':'تنزيل','Share':'مشاركة','Views':'مشاهدات',
                'Video quality':'جودة الفيديو','Loading...':'جارٍ التحميل…','Retry':'إعادة المحاولة',
                'Continue':'متابعة','Create':'إنشاء','Edit':'تعديل','Profile':'الملف الشخصي','Channel':'القناة',
                'Posts':'المنشورات','Videos':'الفيديوهات','Comments':'التعليقات','Notifications':'الإشعارات','Wallet':'المحفظة'
            }
        },
        ur: {
            name:'اردو', dir:'rtl',
            map: {
                'Home':'ہوم','Feels':'فیلز','Shorts':'فیلز','Upload':'اپ لوڈ','Discover':'دریافت کریں','You':'آپ',
                'Setting':'ترتیبات','Settings':'ترتیبات','App Language':'ایپ کی زبان','Switch Theme':'تھیم تبدیل کریں',
                'Light Theme':'لائٹ تھیم','Dark Theme':'ڈارک تھیم','Data Saver':'ڈیٹا سیور','Account':'اکاؤنٹ',
                'Appearance':'ظاہری شکل','Privacy':'رازداری','Support':'مدد','Content & Playback':'مواد اور پلے بیک',
                'Flaynity Features':'Flaynity خصوصیات','Edit Profile':'پروفائل میں ترمیم','Switch Account':'اکاؤنٹ تبدیل کریں',
                'Create a Channel':'چینل بنائیں','View Channel':'چینل دیکھیں','Create Channel':'چینل بنائیں',
                'Upgrade Pro':'پرو اپ گریڈ','Private Account':'نجی اکاؤنٹ','Download Settings':'ڈاؤن لوڈ ترتیبات',
                'Content Quality':'مواد کا معیار','Autoplay':'خودکار پلے','Help Center':'مدد مرکز',
                'Report a Problem':'مسئلہ رپورٹ کریں','Terms of Service':'سروس کی شرائط','Privacy Policy':'رازداری کی پالیسی',
                'Cookie Policy':'کوکی پالیسی','Cancel':'منسوخ','Save':'محفوظ کریں','Done':'مکمل','Next':'اگلا',
                'Back':'واپس','Search':'تلاش','For You':'آپ کے لیے','Subscribe':'سبسکرائب','Subscribed':'سبسکرائب شدہ',
                'Like':'پسند','Comment':'تبصرہ','Download':'ڈاؤن لوڈ','Share':'شیئر','Views':'ویوز',
                'Video quality':'ویڈیو کا معیار','Loading...':'لوڈ ہو رہا ہے','Retry':'دوبارہ کوشش کریں',
                'Continue':'جاری رکھیں','Create':'بنائیں','Edit':'ترمیم','Profile':'پروفائل','Channel':'چینل',
                'Posts':'پوسٹس','Videos':'ویڈیوز','Comments':'تبصرے','Notifications':'اطلاعات','Wallet':'والٹ'
            }
        }
    };

    // Additional Setting-page labels missing from the first translation pass.
    const EXTRA_TRANSLATIONS = {
        "bn": {
                "Flay Verified Badge": "Flay ভেরিফায়েড ব্যাজ",
                "Flay Ads": "Flay বিজ্ঞাপন",
                "Boost Content": "কনটেন্ট বুস্ট করুন",
                "Flay Pay": "Flay Pay",
                "Flay Earning": "Flay আয়",
                "Edit Channel": "চ্যানেল সম্পাদনা",
                "Switch Account": "অ্যাকাউন্ট পরিবর্তন",
                "Account": "অ্যাকাউন্ট",
                "Appearance": "চেহারা",
                "Flaynity Features": "Flaynity ফিচার",
                "Content & Playback": "কনটেন্ট ও প্লেব্যাক",
                "Support": "সহায়তা",
                "Who Can See My Content": "আমার কনটেন্ট কে দেখতে পারবে",
                "Who Can Comment": "কে মন্তব্য করতে পারবে",
                "Who Can Subscribe Me": "কে আমাকে সাবস্ক্রাইব করতে পারবে",
                "Who Can Like Me": "কে আমাকে লাইক দিতে পারবে",
                "Download Settings": "ডাউনলোড সেটিংস",
                "Content Quality": "কনটেন্টের মান",
                "Autoplay": "স্বয়ংক্রিয় প্লে",
                "Private Account": "প্রাইভেট অ্যাকাউন্ট",
                "Only me": "শুধু আমি",
                "Public": "সবার জন্য",
                "Auto": "স্বয়ংক্রিয়",
                "Video quality": "ভিডিওর মান",
                "Manage your default video quality and the amount of cellular data you use with the following options.": "নিচের অপশন থেকে ডিফল্ট ভিডিওর মান ও মোবাইল ডেটা ব্যবহার নিয়ন্ত্রণ করুন।",
                "Save": "সংরক্ষণ",
                "Cancel": "বাতিল",
                "ON": "চালু",
                "OF": "বন্ধ",
                "Off": "বন্ধ",
                "On": "চালু",
                "About Flaynity": "Flaynity সম্পর্কে",
                "Community Guidelines": "কমিউনিটি নির্দেশিকা",
                "Creator Policy": "ক্রিয়েটর নীতি",
                "Monetization Policy": "আয় সংক্রান্ত নীতি",
                "Third-Party Technologies": "তৃতীয় পক্ষের প্রযুক্তি",
                "Copyright & DMCA Policy": "কপিরাইট ও DMCA নীতি",
                "Logged Out": "লগ আউট করা হয়েছে",
                "Create a Channel": "চ্যানেল তৈরি করুন",
                "View Channel": "চ্যানেল দেখুন",
                "Setting": "সেটিংস",
                "Switch Theme": "থিম পরিবর্তন",
                "App Language": "অ্যাপের ভাষা",
                "Data Saver": "ডেটা সেভার"
        },
        "hi": {
                "Flay Verified Badge": "Flay सत्यापित बैज",
                "Flay Ads": "Flay विज्ञापन",
                "Boost Content": "कंटेंट बूस्ट करें",
                "Flay Pay": "Flay Pay",
                "Flay Earning": "Flay कमाई",
                "Edit Channel": "चैनल संपादित करें",
                "Account": "खाता",
                "Appearance": "दिखावट",
                "Flaynity Features": "Flaynity सुविधाएँ",
                "Content & Playback": "कंटेंट और प्लेबैक",
                "Support": "सहायता",
                "Who Can See My Content": "मेरा कंटेंट कौन देख सकता है",
                "Who Can Comment": "कौन टिप्पणी कर सकता है",
                "Who Can Subscribe Me": "कौन मुझे सब्सक्राइब कर सकता है",
                "Who Can Like Me": "कौन मुझे लाइक कर सकता है",
                "Download Settings": "डाउनलोड सेटिंग्स",
                "Content Quality": "कंटेंट गुणवत्ता",
                "Autoplay": "ऑटो प्ले",
                "Only me": "केवल मैं",
                "Public": "सभी",
                "Auto": "ऑटो",
                "Save": "सेव करें",
                "Cancel": "रद्द करें",
                "ON": "चालू",
                "OF": "बंद",
                "About Flaynity": "Flaynity के बारे में",
                "Community Guidelines": "कम्युनिटी दिशानिर्देश",
                "Creator Policy": "क्रिएटर नीति",
                "Monetization Policy": "मुद्रीकरण नीति",
                "Third-Party Technologies": "तृतीय-पक्ष तकनीक",
                "Copyright & DMCA Policy": "कॉपीराइट और DMCA नीति",
                "Setting": "सेटिंग",
                "Switch Theme": "थीम बदलें",
                "App Language": "ऐप की भाषा",
                "Data Saver": "डेटा सेवर"
        },
        "es": {
                "Flay Verified Badge": "Insignia verificada de Flay",
                "Flay Ads": "Anuncios de Flay",
                "Boost Content": "Impulsar contenido",
                "Flay Pay": "Flay Pay",
                "Flay Earning": "Ganancias de Flay",
                "Edit Channel": "Editar canal",
                "Account": "Cuenta",
                "Appearance": "Apariencia",
                "Flaynity Features": "Funciones de Flaynity",
                "Content & Playback": "Contenido y reproducción",
                "Support": "Ayuda",
                "Who Can See My Content": "Quién puede ver mi contenido",
                "Who Can Comment": "Quién puede comentar",
                "Who Can Subscribe Me": "Quién puede suscribirse a mí",
                "Who Can Like Me": "Quién puede darme Me gusta",
                "Download Settings": "Ajustes de descarga",
                "Content Quality": "Calidad del contenido",
                "Autoplay": "Reproducción automática",
                "Only me": "Solo yo",
                "Public": "Público",
                "Auto": "Automático",
                "Save": "Guardar",
                "Cancel": "Cancelar",
                "ON": "ACTIVADO",
                "OF": "DESACTIVADO",
                "About Flaynity": "Acerca de Flaynity",
                "Community Guidelines": "Normas de la comunidad",
                "Creator Policy": "Política para creadores",
                "Monetization Policy": "Política de monetización",
                "Third-Party Technologies": "Tecnologías de terceros",
                "Copyright & DMCA Policy": "Política de copyright y DMCA",
                "Setting": "Ajustes",
                "Switch Theme": "Cambiar tema",
                "App Language": "Idioma de la app",
                "Data Saver": "Ahorro de datos"
        },
        "fr": {
                "Flay Verified Badge": "Badge vérifié Flay",
                "Flay Ads": "Publicités Flay",
                "Boost Content": "Booster le contenu",
                "Flay Pay": "Flay Pay",
                "Flay Earning": "Revenus Flay",
                "Edit Channel": "Modifier la chaîne",
                "Account": "Compte",
                "Appearance": "Apparence",
                "Flaynity Features": "Fonctionnalités Flaynity",
                "Content & Playback": "Contenu et lecture",
                "Support": "Assistance",
                "Who Can See My Content": "Qui peut voir mon contenu",
                "Who Can Comment": "Qui peut commenter",
                "Who Can Subscribe Me": "Qui peut s’abonner à moi",
                "Who Can Like Me": "Qui peut aimer mon contenu",
                "Download Settings": "Paramètres de téléchargement",
                "Content Quality": "Qualité du contenu",
                "Autoplay": "Lecture automatique",
                "Only me": "Moi uniquement",
                "Public": "Public",
                "Auto": "Automatique",
                "Save": "Enregistrer",
                "Cancel": "Annuler",
                "ON": "ACTIVÉ",
                "OF": "DÉSACTIVÉ",
                "About Flaynity": "À propos de Flaynity",
                "Community Guidelines": "Règles de la communauté",
                "Creator Policy": "Politique des créateurs",
                "Monetization Policy": "Politique de monétisation",
                "Third-Party Technologies": "Technologies tierces",
                "Copyright & DMCA Policy": "Politique de copyright et DMCA",
                "Setting": "Paramètres",
                "Switch Theme": "Changer de thème",
                "App Language": "Langue de l’application",
                "Data Saver": "Économiseur de données"
        },
        "ar": {
                "Flay Verified Badge": "شارة Flay الموثقة",
                "Flay Ads": "إعلانات Flay",
                "Boost Content": "ترويج المحتوى",
                "Flay Pay": "Flay Pay",
                "Flay Earning": "أرباح Flay",
                "Edit Channel": "تعديل القناة",
                "Account": "الحساب",
                "Appearance": "المظهر",
                "Flaynity Features": "ميزات Flaynity",
                "Content & Playback": "المحتوى والتشغيل",
                "Support": "الدعم",
                "Who Can See My Content": "من يمكنه رؤية المحتوى",
                "Who Can Comment": "من يمكنه التعليق",
                "Who Can Subscribe Me": "من يمكنه الاشتراك بي",
                "Who Can Like Me": "من يمكنه الإعجاب بي",
                "Download Settings": "إعدادات التنزيل",
                "Content Quality": "جودة المحتوى",
                "Autoplay": "التشغيل التلقائي",
                "Only me": "أنا فقط",
                "Public": "عام",
                "Auto": "تلقائي",
                "Save": "حفظ",
                "Cancel": "إلغاء",
                "ON": "تشغيل",
                "OF": "إيقاف",
                "About Flaynity": "حول Flaynity",
                "Community Guidelines": "إرشادات المجتمع",
                "Creator Policy": "سياسة المنشئين",
                "Monetization Policy": "سياسة تحقيق الدخل",
                "Third-Party Technologies": "تقنيات الجهات الخارجية",
                "Copyright & DMCA Policy": "سياسة حقوق النشر وDMCA",
                "Setting": "الإعدادات",
                "Switch Theme": "تغيير المظهر",
                "App Language": "لغة التطبيق",
                "Data Saver": "توفير البيانات"
        },
        "ur": {
                "Flay Verified Badge": "Flay تصدیق شدہ بیج",
                "Flay Ads": "Flay اشتہارات",
                "Boost Content": "مواد کو فروغ دیں",
                "Flay Pay": "Flay Pay",
                "Flay Earning": "Flay آمدنی",
                "Edit Channel": "چینل میں ترمیم",
                "Account": "اکاؤنٹ",
                "Appearance": "ظاہری شکل",
                "Flaynity Features": "Flaynity خصوصیات",
                "Content & Playback": "مواد اور پلے بیک",
                "Support": "مدد",
                "Who Can See My Content": "میرا مواد کون دیکھ سکتا ہے",
                "Who Can Comment": "کون تبصرہ کر سکتا ہے",
                "Who Can Subscribe Me": "کون مجھے سبسکرائب کر سکتا ہے",
                "Who Can Like Me": "کون مجھے پسند کر سکتا ہے",
                "Download Settings": "ڈاؤن لوڈ ترتیبات",
                "Content Quality": "مواد کا معیار",
                "Autoplay": "خودکار پلے",
                "Only me": "صرف میں",
                "Public": "عوامی",
                "Auto": "خودکار",
                "Save": "محفوظ کریں",
                "Cancel": "منسوخ",
                "ON": "آن",
                "OF": "آف",
                "About Flaynity": "Flaynity کے بارے میں",
                "Community Guidelines": "کمیونٹی رہنما اصول",
                "Creator Policy": "کریئیٹر پالیسی",
                "Monetization Policy": "آمدنی کی پالیسی",
                "Third-Party Technologies": "تھرڈ پارٹی ٹیکنالوجیز",
                "Copyright & DMCA Policy": "کاپی رائٹ اور DMCA پالیسی",
                "Setting": "ترتیبات",
                "Switch Theme": "تھیم تبدیل کریں",
                "App Language": "ایپ کی زبان",
                "Data Saver": "ڈیٹا سیور"
        }
};

    // Additional UI translations for Home, Upload, Analytics, Monetization and Comments.
    const PAGE_TRANSLATIONS = {
        "bn": {
                "Recommended Feed": "প্রস্তাবিত ফিড",
                "No comments yet. Tap to start the conversation!": "এখনও কোনো মন্তব্য নেই। কথা শুরু করতে ট্যাপ করুন!",
                "No comments yet. Be the first to comment!": "এখনও কোনো মন্তব্য নেই। প্রথম মন্তব্য করুন!",
                "Comments (": "মন্তব্য (",
                "All People Reacted": "সবার প্রতিক্রিয়া",
                "Please log in to Comment": "মন্তব্য করতে লগ ইন করুন",
                "Comment posted!": "মন্তব্য পোস্ট হয়েছে!",
                "Failed to post comment": "মন্তব্য পোস্ট করা যায়নি",
                "Close": "বন্ধ করুন",
                "About": "সম্পর্কে",
                "Channel Category": "চ্যানেলের বিভাগ",
                "Joined": "যোগ দিয়েছেন",
                "Joined Date": "যোগদানের তারিখ",
                "Description": "বিবরণ",
                "Video Title": "ভিডিওর শিরোনাম",
                "Published": "প্রকাশিত",
                "Just Now": "এইমাত্র",
                "Upcoming Feature": "শীঘ্রই আসছে",
                "Our development team is actively building this experience. Stay tuned for future updates!": "আমাদের ডেভেলপমেন্ট টিম এই ফিচারটি তৈরি করছে। পরবর্তী আপডেটের জন্য অপেক্ষা করুন!",
                "Select a Long Video": "একটি লং ভিডিও নির্বাচন করুন",
                "Browse Device": "ডিভাইস থেকে বেছে নিন",
                "Create a Community Post": "কমিউনিটি পোস্ট তৈরি করুন",
                "Pick Image": "ছবি নির্বাচন করুন",
                "Next": "পরবর্তী",
                "Add Details": "বিস্তারিত যোগ করুন",
                "Custom Thumbnail": "কাস্টম থাম্বনেইল",
                "Title (required)": "শিরোনাম (আবশ্যক)",
                "Description (required)": "বিবরণ (আবশ্যক)",
                "Visibility": "দৃশ্যমানতা",
                "Publish": "প্রকাশ করুন",
                "Schedule Date & Time": "প্রকাশের তারিখ ও সময় নির্ধারণ করুন",
                "PUBLISH VIDEO": "ভিডিও প্রকাশ করুন",
                "Caption (required)": "ক্যাপশন (আবশ্যক)",
                "Description (optional)": "বিবরণ (ঐচ্ছিক)",
                "PUBLISH SHORT": "শর্ট প্রকাশ করুন",
                "Create Post": "পোস্ট তৈরি করুন",
                "Title / Caption (required)": "শিরোনাম / ক্যাপশন (আবশ্যক)",
                "PUBLISH POST": "পোস্ট প্রকাশ করুন",
                "Set Visibility": "দৃশ্যমানতা নির্ধারণ করুন",
                "Anyone can search for and view": "যে কেউ খুঁজে দেখতে পারবে",
                "Only you can view": "শুধু আপনি দেখতে পারবেন",
                "Schedule Publish": "প্রকাশের সময় নির্ধারণ করুন",
                "Select a date to make public": "সবার জন্য প্রকাশের তারিখ নির্বাচন করুন",
                "Countdown Timer": "কাউন্টডাউন টাইমার",
                "Recording Duration": "রেকর্ডিংয়ের সময়কাল",
                "Playback Speed": "প্লেব্যাকের গতি",
                "Analytics": "অ্যানালিটিক্স",
                "ESTIMATED REVENUE": "আনুমানিক আয়",
                "View": "দেখুন",
                "Performance (Last 28 Days)": "পারফরম্যান্স (গত ২৮ দিন)",
                "100% Growth": "১০০% বৃদ্ধি",
                "Subscribers": "সাবস্ক্রাইবার",
                "Watch Time (min)": "দেখার সময় (মিনিট)",
                "Created Items": "তৈরি করা কনটেন্ট",
                "Videos, Feels, Posts": "ভিডিও, ফিলস, পোস্ট",
                "Monthly Growth Channel": "চ্যানেলের মাসিক বৃদ্ধি",
                "Metrics distributed based on channel totals": "চ্যানেলের মোট পরিসংখ্যানের ভিত্তিতে মেট্রিক্স",
                "Monetization": "মনিটাইজেশন",
                "Become a Flaynity Partner": "Flaynity পার্টনার হন",
                "Next milestone": "পরবর্তী লক্ষ্য",
                "Flaynity your earning journey": "Flaynity-তে আপনার আয়ের যাত্রা",
                "Earn income by showing ads and connecting with your fans, and gain access to creator tools and support.": "विज्ञापन दिखाकर और अपने प्रशंसकों से जुड़कर कमाएँ, और क्रिएटर टूल व सहायता पाएँ।",
                "Watch Page Ads": "Watch Page বিজ্ঞাপন",
                "Earn from ads and premium subscribers on long videos.": "লং ভিডিওর বিজ্ঞাপন ও প্রিমিয়াম সাবস্ক্রাইবার থেকে আয় করুন।",
                "Feels Feed Ads": "Feels ফিড বিজ্ঞাপন",
                "Earn from ads shown in the Feels Feed.": "Feels Feed-এ দেখানো বিজ্ঞাপন থেকে আয় করুন।",
                "Memberships": "মেম্বারশিপ",
                "Create exclusive memberships for your biggest supporters.": "আপনার সবচেয়ে বড় সমর্থকদের জন্য বিশেষ মেম্বারশিপ তৈরি করুন।",
                "Supers": "সুপারস",
                "Receive fan support through one-time purchases.": "এককালীন কেনাকাটার মাধ্যমে ভক্তদের সহায়তা পান।",
                "Shopping": "শপিং",
                "Recommend products and earn from shopping.": "পণ্য সুপারিশ করে শপিং থেকে আয় করুন।",
                "Eligibility": "যোগ্যতা",
                "Showing data as of": "তথ্যের তারিখ",
                "Valid Public Watch Hours": "বৈধ পাবলিক ওয়াচ আওয়ার",
                "Last 365 Days": "গত ৩৬৫ দিন",
                "Public Views (Feels & Videos)": "পাবলিক ভিউ (Feels ও ভিডিও)",
                "Some monetization features may have additional eligibility requirements.": "কিছু মনিটাইজেশন ফিচারের জন্য অতিরিক্ত যোগ্যতার শর্ত থাকতে পারে।",
                "Next Steps": "পরবর্তী ধাপ",
                "Apply Now": "এখনই আবেদন করুন",
                "Application Submitted!": "আবেদন জমা হয়েছে!",
                "Congratulations! Your partner application is now under review. We will notify you soon.": "অভিনন্দন! আপনার পার্টনার আবেদন পর্যালোচনা করা হচ্ছে। শিগগিরই জানানো হবে।",
                "Hours": "ঘণ্টা",
                "Tap to start the conversation!": "কথা শুরু করতে ট্যাপ করুন!",
                "Uploading profile picture...": "প্রোফাইল ছবি আপলোড হচ্ছে...",
                "Uploading channel banner...": "চ্যানেল ব্যানার আপলোড হচ্ছে...",
                "Please enter all required fields": "সব আবশ্যক তথ্য পূরণ করুন",
                "Channel created successfully!": "চ্যানেল সফলভাবে তৈরি হয়েছে!",
                "Save Changes": "পরিবর্তন সংরক্ষণ করুন",
                "Channel Successfully Updated!": "চ্যানেল সফলভাবে আপডেট হয়েছে!",
                "No uploaded videos yet.": "এখনও কোনো ভিডিও আপলোড করা হয়নি।",
                "No feels uploaded yet.": "এখনও কোনো ফিলস আপলোড করা হয়নি।",
                "No posts yet.": "এখনও কোনো পোস্ট নেই।",
                "0 Subscribers": "০ সাবস্ক্রাইবার",
                "0 Videos": "০ ভিডিও",
                "Title/Caption is required!": "শিরোনাম/ক্যাপশন আবশ্যক!",
                "Caption / Title is required!": "ক্যাপশন / শিরোনাম আবশ্যক!",
                "Processing Video...": "ভিডিও প্রসেস হচ্ছে...",
                "Uploading is currently disabled by the administrator.": "অ্যাডমিনিস্ট্রেটর বর্তমানে আপলোড বন্ধ রেখেছেন।",
                "This upload type is currently disabled by the administrator.": "এই ধরনের আপলোড বর্তমানে অ্যাডমিনিস্ট্রেটর বন্ধ রেখেছেন।",
                "No description provided.": "কোনো বিবরণ দেওয়া হয়নি।",
                "Views": "ভিউ",
                "Likes": "লাইক",
                "Comments": "মন্তব্য",
                "Posts": "পোস্ট",
                "Video": "ভিডিও",
                "Private": "প্রাইভেট",
                "Schedule": "সময় নির্ধারণ",
                "Off": "বন্ধ",
                "On": "চালু",
                "No results found": "কোনো ফলাফল পাওয়া যায়নি",
                "Search or use the mic to find movies.": "মুভি খুঁজতে সার্চ করুন বা মাইক্রোফোন ব্যবহার করুন।"
        },
        "hi": {
                "Recommended Feed": "अनुशंसित फ़ीड",
                "No comments yet. Tap to start the conversation!": "अभी तक कोई टिप्पणी नहीं। बातचीत शुरू करने के लिए टैप करें!",
                "No comments yet. Be the first to comment!": "अभी तक कोई टिप्पणी नहीं। पहली टिप्पणी करें!",
                "Comments (": "टिप्पणियाँ (",
                "All People Reacted": "सभी लोगों की प्रतिक्रियाएँ",
                "Please log in to Comment": "टिप्पणी करने के लिए लॉग इन करें",
                "Comment posted!": "टिप्पणी पोस्ट हो गई!",
                "Failed to post comment": "टिप्पणी पोस्ट नहीं हो सकी",
                "Close": "बंद करें",
                "About": "के बारे में",
                "Channel Category": "चैनल श्रेणी",
                "Joined": "शामिल हुए",
                "Joined Date": "शामिल होने की तारीख",
                "Description": "विवरण",
                "Video Title": "वीडियो का शीर्षक",
                "Published": "प्रकाशित",
                "Just Now": "अभी-अभी",
                "Upcoming Feature": "आने वाली सुविधा",
                "Our development team is actively building this experience. Stay tuned for future updates!": "हमारी विकास टीम इस सुविधा पर काम कर रही है। आने वाले अपडेट के लिए जुड़े रहें!",
                "Select a Long Video": "लंबा वीडियो चुनें",
                "Browse Device": "डिवाइस ब्राउज़ करें",
                "Create a Community Post": "कम्युनिटी पोस्ट बनाएँ",
                "Pick Image": "छवि चुनें",
                "Next": "अगला",
                "Add Details": "विवरण जोड़ें",
                "Custom Thumbnail": "कस्टम थंबनेल",
                "Title (required)": "शीर्षक (आवश्यक)",
                "Description (required)": "विवरण (आवश्यक)",
                "Visibility": "दृश्यता",
                "Publish": "प्रकाशित करें",
                "Schedule Date & Time": "तारीख और समय निर्धारित करें",
                "PUBLISH VIDEO": "वीडियो प्रकाशित करें",
                "Caption (required)": "कैप्शन (आवश्यक)",
                "Description (optional)": "विवरण (वैकल्पिक)",
                "PUBLISH SHORT": "शॉर्ट प्रकाशित करें",
                "Create Post": "पोस्ट बनाएँ",
                "Title / Caption (required)": "शीर्षक / कैप्शन (आवश्यक)",
                "PUBLISH POST": "पोस्ट प्रकाशित करें",
                "Set Visibility": "दृश्यता सेट करें",
                "Anyone can search for and view": "कोई भी खोज और देख सकता है",
                "Only you can view": "केवल आप देख सकते हैं",
                "Schedule Publish": "प्रकाशन शेड्यूल करें",
                "Select a date to make public": "सार्वजनिक करने की तारीख चुनें",
                "Countdown Timer": "काउंटडाउन टाइमर",
                "Recording Duration": "रिकॉर्डिंग अवधि",
                "Playback Speed": "प्लेबैक गति",
                "Analytics": "विश्लेषण",
                "ESTIMATED REVENUE": "अनुमानित आय",
                "View": "देखें",
                "Performance (Last 28 Days)": "प्रदर्शन (पिछले 28 दिन)",
                "100% Growth": "100% वृद्धि",
                "Subscribers": "सब्सक्राइबर",
                "Watch Time (min)": "देखने का समय (मिनट)",
                "Created Items": "बनाई गई सामग्री",
                "Videos, Feels, Posts": "वीडियो, फील्स, पोस्ट",
                "Monthly Growth Channel": "चैनल की मासिक वृद्धि",
                "Metrics distributed based on channel totals": "चैनल के कुल आँकड़ों के आधार पर मेट्रिक्स",
                "Monetization": "मुद्रीकरण",
                "Become a Flaynity Partner": "Flaynity पार्टनर बनें",
                "Next milestone": "अगला लक्ष्य",
                "Flaynity your earning journey": "Flaynity पर आपकी कमाई की यात्रा",
                "Earn income by showing ads and connecting with your fans, and gain access to creator tools and support.": "विज्ञापन दिखाकर और अपने प्रशंसकों से जुड़कर कमाएँ, और क्रिएटर टूल व सहायता पाएँ।",
                "Watch Page Ads": "वॉच पेज विज्ञापन",
                "Earn from ads and premium subscribers on long videos.": "लंबे वीडियो के विज्ञापनों और प्रीमियम सब्सक्राइबर से कमाएँ।",
                "Feels Feed Ads": "फील्स फ़ीड विज्ञापन",
                "Earn from ads shown in the Feels Feed.": "Feels फ़ीड में दिखाए गए विज्ञापनों से कमाएँ।",
                "Memberships": "सदस्यताएँ",
                "Create exclusive memberships for your biggest supporters.": "अपने सबसे बड़े समर्थकों के लिए विशेष सदस्यताएँ बनाएँ।",
                "Supers": "सुपर",
                "Receive fan support through one-time purchases.": "एकमुश्त खरीदारी से प्रशंसकों का समर्थन पाएँ।",
                "Shopping": "शॉपिंग",
                "Recommend products and earn from shopping.": "उत्पाद सुझाकर खरीदारी से कमाएँ।",
                "Eligibility": "पात्रता",
                "Showing data as of": "डेटा की तारीख",
                "Valid Public Watch Hours": "मान्य सार्वजनिक वॉच घंटे",
                "Last 365 Days": "पिछले 365 दिन",
                "Public Views (Feels & Videos)": "सार्वजनिक व्यूज़ (Feels और वीडियो)",
                "Some monetization features may have additional eligibility requirements.": "कुछ मुद्रीकरण सुविधाओं के लिए अतिरिक्त पात्रता आवश्यकताएँ हो सकती हैं।",
                "Next Steps": "अगले चरण",
                "Apply Now": "अभी आवेदन करें",
                "Application Submitted!": "आवेदन जमा हो गया!",
                "Congratulations! Your partner application is now under review. We will notify you soon.": "बधाई हो! आपके पार्टनर आवेदन की समीक्षा हो रही है। हम जल्द सूचित करेंगे।",
                "Hours": "घंटे",
                "Tap to start the conversation!": "बातचीत शुरू करने के लिए टैप करें!",
                "Uploading profile picture...": "प्रोफ़ाइल तस्वीर अपलोड हो रही है...",
                "Uploading channel banner...": "चैनल बैनर अपलोड हो रहा है...",
                "Please enter all required fields": "कृपया सभी आवश्यक फ़ील्ड भरें",
                "Channel created successfully!": "चैनल सफलतापूर्वक बनाया गया!",
                "Save Changes": "बदलाव सेव करें",
                "Channel Successfully Updated!": "चैनल सफलतापूर्वक अपडेट हुआ!",
                "No uploaded videos yet.": "अभी तक कोई वीडियो अपलोड नहीं किया गया।",
                "No feels uploaded yet.": "अभी तक कोई फ़ील्स अपलोड नहीं किया गया।",
                "No posts yet.": "अभी तक कोई पोस्ट नहीं है।",
                "0 Subscribers": "0 सब्सक्राइबर",
                "0 Videos": "0 वीडियो",
                "Title/Caption is required!": "शीर्षक/कैप्शन आवश्यक है!",
                "Caption / Title is required!": "कैप्शन / शीर्षक आवश्यक है!",
                "Processing Video...": "वीडियो प्रोसेस हो रहा है...",
                "Uploading is currently disabled by the administrator.": "व्यवस्थापक ने अभी अपलोड बंद किया है।",
                "This upload type is currently disabled by the administrator.": "इस प्रकार का अपलोड अभी व्यवस्थापक द्वारा बंद है।",
                "No description provided.": "कोई विवरण नहीं दिया गया।",
                "Views": "व्यूज़",
                "Likes": "लाइक",
                "Comments": "टिप्पणियाँ",
                "Posts": "पोस्ट",
                "Video": "वीडियो",
                "Private": "निजी",
                "Schedule": "शेड्यूल",
                "Off": "बंद",
                "On": "चालू",
                "No results found": "कोई परिणाम नहीं मिला",
                "Search or use the mic to find movies.": "फ़िल्में खोजने के लिए खोजें या माइक्रोफ़ोन का उपयोग करें।"
        },
        "es": {
                "Recommended Feed": "Feed recomendado",
                "No comments yet. Tap to start the conversation!": "Aún no hay comentarios. ¡Toca para iniciar la conversación!",
                "No comments yet. Be the first to comment!": "Aún no hay comentarios. ¡Sé el primero en comentar!",
                "Comments (": "Comentarios (",
                "All People Reacted": "Reacciones de todos",
                "Please log in to Comment": "Inicia sesión para comentar",
                "Comment posted!": "¡Comentario publicado!",
                "Failed to post comment": "No se pudo publicar el comentario",
                "Close": "Cerrar",
                "About": "Acerca de",
                "Channel Category": "Categoría del canal",
                "Joined": "Se unió",
                "Joined Date": "Fecha de incorporación",
                "Description": "Descripción",
                "Video Title": "Título del video",
                "Published": "Publicado",
                "Just Now": "Justo ahora",
                "Upcoming Feature": "Próxima función",
                "Our development team is actively building this experience. Stay tuned for future updates!": "Nuestro equipo está desarrollando esta función. ¡Pronto habrá novedades!",
                "Select a Long Video": "Seleccionar un video largo",
                "Browse Device": "Explorar dispositivo",
                "Create a Community Post": "Crear una publicación de comunidad",
                "Pick Image": "Elegir imagen",
                "Next": "Siguiente",
                "Add Details": "Añadir detalles",
                "Custom Thumbnail": "Miniatura personalizada",
                "Title (required)": "Título (obligatorio)",
                "Description (required)": "Descripción (obligatoria)",
                "Visibility": "Visibilidad",
                "Publish": "Publicar",
                "Schedule Date & Time": "Programar fecha y hora",
                "PUBLISH VIDEO": "PUBLICAR VIDEO",
                "Caption (required)": "Texto (obligatorio)",
                "Description (optional)": "Descripción (opcional)",
                "PUBLISH SHORT": "PUBLICAR SHORT",
                "Create Post": "Crear publicación",
                "Title / Caption (required)": "Título / texto (obligatorio)",
                "PUBLISH POST": "PUBLICAR PUBLICACIÓN",
                "Set Visibility": "Establecer visibilidad",
                "Anyone can search for and view": "Cualquiera puede buscar y ver",
                "Only you can view": "Solo tú puedes verlo",
                "Schedule Publish": "Programar publicación",
                "Select a date to make public": "Selecciona una fecha para hacerlo público",
                "Countdown Timer": "Temporizador de cuenta atrás",
                "Recording Duration": "Duración de grabación",
                "Playback Speed": "Velocidad de reproducción",
                "Analytics": "Analíticas",
                "ESTIMATED REVENUE": "INGRESOS ESTIMADOS",
                "View": "Ver",
                "Performance (Last 28 Days)": "Rendimiento (últimos 28 días)",
                "100% Growth": "Crecimiento del 100%",
                "Subscribers": "Suscriptores",
                "Watch Time (min)": "Tiempo de reproducción (min)",
                "Created Items": "Contenido creado",
                "Videos, Feels, Posts": "Videos, Feels, publicaciones",
                "Monthly Growth Channel": "Crecimiento mensual del canal",
                "Metrics distributed based on channel totals": "Métricas basadas en los totales del canal",
                "Monetization": "Monetización",
                "Become a Flaynity Partner": "Conviértete en socio de Flaynity",
                "Next milestone": "Próximo objetivo",
                "Flaynity your earning journey": "Tu camino de ingresos en Flaynity",
                "Earn income by showing ads and connecting with your fans, and gain access to creator tools and support.": "Gana mostrando anuncios y conectando con tus fans; accede a herramientas y soporte para creadores.",
                "Watch Page Ads": "Anuncios en la página de reproducción",
                "Earn from ads and premium subscribers on long videos.": "Gana con anuncios y suscriptores prémium en videos largos.",
                "Feels Feed Ads": "Anuncios del feed Feels",
                "Earn from ads shown in the Feels Feed.": "Gana con anuncios del feed Feels.",
                "Memberships": "Membresías",
                "Create exclusive memberships for your biggest supporters.": "Crea membresías exclusivas para tus mayores seguidores.",
                "Supers": "Supers",
                "Receive fan support through one-time purchases.": "Recibe apoyo de tus fans mediante compras únicas.",
                "Shopping": "Compras",
                "Recommend products and earn from shopping.": "Recomienda productos y gana con las compras.",
                "Eligibility": "Elegibilidad",
                "Showing data as of": "Datos al",
                "Valid Public Watch Hours": "Horas de visualización públicas válidas",
                "Last 365 Days": "Últimos 365 días",
                "Public Views (Feels & Videos)": "Visualizaciones públicas (Feels y videos)",
                "Some monetization features may have additional eligibility requirements.": "Algunas funciones de monetización pueden requerir requisitos adicionales.",
                "Next Steps": "Próximos pasos",
                "Apply Now": "Solicitar ahora",
                "Application Submitted!": "¡Solicitud enviada!",
                "Congratulations! Your partner application is now under review. We will notify you soon.": "¡Felicidades! Tu solicitud de socio está en revisión. Te avisaremos pronto.",
                "Hours": "horas",
                "Tap to start the conversation!": "Toca para iniciar la conversación",
                "Uploading profile picture...": "Subiendo foto de perfil...",
                "Uploading channel banner...": "Subiendo banner del canal...",
                "Please enter all required fields": "Completa todos los campos obligatorios",
                "Channel created successfully!": "¡Canal creado correctamente!",
                "Save Changes": "Guardar cambios",
                "Channel Successfully Updated!": "¡Canal actualizado correctamente!",
                "No uploaded videos yet.": "Todavía no hay videos subidos.",
                "No feels uploaded yet.": "Todavía no hay Feels subidos.",
                "No posts yet.": "Todavía no hay publicaciones.",
                "0 Subscribers": "0 suscriptores",
                "0 Videos": "0 videos",
                "Title/Caption is required!": "¡El título/texto es obligatorio!",
                "Caption / Title is required!": "¡El texto/título es obligatorio!",
                "Processing Video...": "Procesando video...",
                "Uploading is currently disabled by the administrator.": "El administrador ha desactivado las subidas.",
                "This upload type is currently disabled by the administrator.": "El administrador ha desactivado este tipo de subida.",
                "No description provided.": "No se proporcionó descripción.",
                "Views": "Visualizaciones",
                "Likes": "Me gusta",
                "Comments": "Comentarios",
                "Posts": "Publicaciones",
                "Video": "Video",
                "Private": "Privado",
                "Schedule": "Programar",
                "Off": "Desactivado",
                "On": "Activado",
                "No results found": "No se encontraron resultados",
                "Search or use the mic to find movies.": "Busca o usa el micrófono para encontrar películas."
        },
        "fr": {
                "Recommended Feed": "Flux recommandé",
                "No comments yet. Tap to start the conversation!": "Aucun commentaire. Touchez pour commencer la conversation !",
                "No comments yet. Be the first to comment!": "Aucun commentaire. Soyez le premier à commenter !",
                "Comments (": "Commentaires (",
                "All People Reacted": "Réactions de tous",
                "Please log in to Comment": "Connectez-vous pour commenter",
                "Comment posted!": "Commentaire publié !",
                "Failed to post comment": "Échec de la publication du commentaire",
                "Close": "Fermer",
                "About": "À propos",
                "Channel Category": "Catégorie de la chaîne",
                "Joined": "A rejoint",
                "Joined Date": "Date d’inscription",
                "Description": "Description",
                "Video Title": "Titre de la vidéo",
                "Published": "Publié",
                "Just Now": "À l’instant",
                "Upcoming Feature": "Fonctionnalité à venir",
                "Our development team is actively building this experience. Stay tuned for future updates!": "Notre équipe développe cette fonctionnalité. Restez à l’écoute des prochaines mises à jour !",
                "Select a Long Video": "Sélectionner une longue vidéo",
                "Browse Device": "Parcourir l’appareil",
                "Create a Community Post": "Créer une publication communautaire",
                "Pick Image": "Choisir une image",
                "Next": "Suivant",
                "Add Details": "Ajouter des détails",
                "Custom Thumbnail": "Miniature personnalisée",
                "Title (required)": "Titre (obligatoire)",
                "Description (required)": "Description (obligatoire)",
                "Visibility": "Visibilité",
                "Publish": "Publier",
                "Schedule Date & Time": "Planifier la date et l’heure",
                "PUBLISH VIDEO": "PUBLIER LA VIDÉO",
                "Caption (required)": "Légende (obligatoire)",
                "Description (optional)": "Description (facultative)",
                "PUBLISH SHORT": "PUBLIER LE SHORT",
                "Create Post": "Créer une publication",
                "Title / Caption (required)": "Titre / légende (obligatoire)",
                "PUBLISH POST": "PUBLIER LA PUBLICATION",
                "Set Visibility": "Définir la visibilité",
                "Anyone can search for and view": "Tout le monde peut rechercher et voir",
                "Only you can view": "Vous seul pouvez voir",
                "Schedule Publish": "Programmer la publication",
                "Select a date to make public": "Sélectionnez une date de publication publique",
                "Countdown Timer": "Compte à rebours",
                "Recording Duration": "Durée d’enregistrement",
                "Playback Speed": "Vitesse de lecture",
                "Analytics": "Statistiques",
                "ESTIMATED REVENUE": "REVENUS ESTIMÉS",
                "View": "Voir",
                "Performance (Last 28 Days)": "Performances (28 derniers jours)",
                "100% Growth": "Croissance de 100 %",
                "Subscribers": "Abonnés",
                "Watch Time (min)": "Durée de visionnage (min)",
                "Created Items": "Contenus créés",
                "Videos, Feels, Posts": "Vidéos, Feels, publications",
                "Monthly Growth Channel": "Croissance mensuelle de la chaîne",
                "Metrics distributed based on channel totals": "Indicateurs basés sur les totaux de la chaîne",
                "Monetization": "Monétisation",
                "Become a Flaynity Partner": "Devenez partenaire Flaynity",
                "Next milestone": "Prochain objectif",
                "Flaynity your earning journey": "Votre parcours de revenus sur Flaynity",
                "Earn income by showing ads and connecting with your fans, and gain access to creator tools and support.": "Gagnez grâce aux publicités et à votre communauté, avec des outils et une assistance pour les créateurs.",
                "Watch Page Ads": "Publicités sur la page de lecture",
                "Earn from ads and premium subscribers on long videos.": "Gagnez grâce aux publicités et aux abonnés premium sur les longues vidéos.",
                "Feels Feed Ads": "Publicités du fil Feels",
                "Earn from ads shown in the Feels Feed.": "Gagnez grâce aux publicités du fil Feels.",
                "Memberships": "Abonnements",
                "Create exclusive memberships for your biggest supporters.": "Créez des abonnements exclusifs pour vos plus grands soutiens.",
                "Supers": "Supers",
                "Receive fan support through one-time purchases.": "Recevez le soutien de vos fans grâce à des achats ponctuels.",
                "Shopping": "Shopping",
                "Recommend products and earn from shopping.": "Recommandez des produits et gagnez grâce aux achats.",
                "Eligibility": "Éligibilité",
                "Showing data as of": "Données au",
                "Valid Public Watch Hours": "Heures de visionnage publiques valides",
                "Last 365 Days": "365 derniers jours",
                "Public Views (Feels & Videos)": "Vues publiques (Feels et vidéos)",
                "Some monetization features may have additional eligibility requirements.": "Certaines fonctionnalités de monétisation peuvent exiger des conditions supplémentaires.",
                "Next Steps": "Prochaines étapes",
                "Apply Now": "Postuler maintenant",
                "Application Submitted!": "Candidature envoyée !",
                "Congratulations! Your partner application is now under review. We will notify you soon.": "Félicitations ! Votre candidature partenaire est en cours d’examen. Nous vous informerons bientôt.",
                "Hours": "heures",
                "Tap to start the conversation!": "Touchez pour commencer la conversation",
                "Uploading profile picture...": "Téléchargement de la photo de profil...",
                "Uploading channel banner...": "Téléchargement de la bannière de la chaîne...",
                "Please enter all required fields": "Veuillez remplir tous les champs obligatoires",
                "Channel created successfully!": "Chaîne créée avec succès !",
                "Save Changes": "Enregistrer les modifications",
                "Channel Successfully Updated!": "Chaîne mise à jour avec succès !",
                "No uploaded videos yet.": "Aucune vidéo téléversée pour le moment.",
                "No feels uploaded yet.": "Aucun Feels publié pour le moment.",
                "No posts yet.": "Aucune publication pour le moment.",
                "0 Subscribers": "0 abonné",
                "0 Videos": "0 vidéo",
                "Title/Caption is required!": "Le titre/la légende est obligatoire !",
                "Caption / Title is required!": "La légende/le titre est obligatoire !",
                "Processing Video...": "Traitement de la vidéo...",
                "Uploading is currently disabled by the administrator.": "L’administrateur a désactivé les téléversements.",
                "This upload type is currently disabled by the administrator.": "Ce type de téléversement est désactivé par l’administrateur.",
                "No description provided.": "Aucune description fournie.",
                "Views": "Vues",
                "Likes": "J’aime",
                "Comments": "Commentaires",
                "Posts": "Publications",
                "Video": "Vidéo",
                "Private": "Privé",
                "Schedule": "Planifier",
                "Off": "Désactivé",
                "On": "Activé",
                "No results found": "Aucun résultat trouvé",
                "Search or use the mic to find movies.": "Recherchez ou utilisez le micro pour trouver des films."
        },
        "ar": {
                "Recommended Feed": "الخلاصة المقترحة",
                "No comments yet. Tap to start the conversation!": "لا توجد تعليقات بعد. اضغط لبدء المحادثة!",
                "No comments yet. Be the first to comment!": "لا توجد تعليقات بعد. كن أول من يعلّق!",
                "Comments (": "التعليقات (",
                "All People Reacted": "تفاعلات الجميع",
                "Please log in to Comment": "يرجى تسجيل الدخول للتعليق",
                "Comment posted!": "تم نشر التعليق!",
                "Failed to post comment": "فشل نشر التعليق",
                "Close": "إغلاق",
                "About": "حول",
                "Channel Category": "فئة القناة",
                "Joined": "انضم",
                "Joined Date": "تاريخ الانضمام",
                "Description": "الوصف",
                "Video Title": "عنوان الفيديو",
                "Published": "تم النشر",
                "Just Now": "الآن",
                "Upcoming Feature": "ميزة قادمة",
                "Our development team is actively building this experience. Stay tuned for future updates!": "يعمل فريق التطوير على هذه الميزة. ترقبوا التحديثات القادمة!",
                "Select a Long Video": "اختر فيديو طويلًا",
                "Browse Device": "تصفح الجهاز",
                "Create a Community Post": "إنشاء منشور للمجتمع",
                "Pick Image": "اختر صورة",
                "Next": "التالي",
                "Add Details": "إضافة التفاصيل",
                "Custom Thumbnail": "صورة مصغرة مخصصة",
                "Title (required)": "العنوان (مطلوب)",
                "Description (required)": "الوصف (مطلوب)",
                "Visibility": "إمكانية الظهور",
                "Publish": "نشر",
                "Schedule Date & Time": "جدولة التاريخ والوقت",
                "PUBLISH VIDEO": "نشر الفيديو",
                "Caption (required)": "التعليق (مطلوب)",
                "Description (optional)": "الوصف (اختياري)",
                "PUBLISH SHORT": "نشر المقطع القصير",
                "Create Post": "إنشاء منشور",
                "Title / Caption (required)": "العنوان / التعليق (مطلوب)",
                "PUBLISH POST": "نشر المنشور",
                "Set Visibility": "تحديد إمكانية الظهور",
                "Anyone can search for and view": "يمكن لأي شخص البحث والمشاهدة",
                "Only you can view": "يمكنك وحدك المشاهدة",
                "Schedule Publish": "جدولة النشر",
                "Select a date to make public": "حدد تاريخًا لجعله عامًا",
                "Countdown Timer": "مؤقت العد التنازلي",
                "Recording Duration": "مدة التسجيل",
                "Playback Speed": "سرعة التشغيل",
                "Analytics": "التحليلات",
                "ESTIMATED REVENUE": "الأرباح المقدرة",
                "View": "عرض",
                "Performance (Last 28 Days)": "الأداء (آخر 28 يومًا)",
                "100% Growth": "نمو بنسبة 100٪",
                "Subscribers": "المشتركون",
                "Watch Time (min)": "وقت المشاهدة (دقيقة)",
                "Created Items": "العناصر المنشأة",
                "Videos, Feels, Posts": "فيديوهات وFeels ومنشورات",
                "Monthly Growth Channel": "نمو القناة الشهري",
                "Metrics distributed based on channel totals": "المقاييس وفقًا لإجمالي القناة",
                "Monetization": "تحقيق الدخل",
                "Become a Flaynity Partner": "كن شريكًا في Flaynity",
                "Next milestone": "الهدف التالي",
                "Flaynity your earning journey": "رحلتك نحو الربح في Flaynity",
                "Earn income by showing ads and connecting with your fans, and gain access to creator tools and support.": "اربح من عرض الإعلانات والتواصل مع معجبيك، واحصل على أدوات ودعم المنشئين.",
                "Watch Page Ads": "إعلانات صفحة المشاهدة",
                "Earn from ads and premium subscribers on long videos.": "اربح من إعلانات الفيديوهات الطويلة والمشتركين المميزين.",
                "Feels Feed Ads": "إعلانات موجز Feels",
                "Earn from ads shown in the Feels Feed.": "اربح من الإعلانات المعروضة في موجز Feels.",
                "Memberships": "العضويات",
                "Create exclusive memberships for your biggest supporters.": "أنشئ عضويات حصرية لأكبر داعميك.",
                "Supers": "الدعم الفائق",
                "Receive fan support through one-time purchases.": "احصل على دعم المعجبين عبر عمليات شراء لمرة واحدة.",
                "Shopping": "التسوق",
                "Recommend products and earn from shopping.": "رشّح المنتجات واربح من التسوق.",
                "Eligibility": "الأهلية",
                "Showing data as of": "البيانات حتى",
                "Valid Public Watch Hours": "ساعات المشاهدة العامة الصالحة",
                "Last 365 Days": "آخر 365 يومًا",
                "Public Views (Feels & Videos)": "المشاهدات العامة (Feels والفيديوهات)",
                "Some monetization features may have additional eligibility requirements.": "قد تتطلب بعض ميزات تحقيق الدخل شروط أهلية إضافية.",
                "Next Steps": "الخطوات التالية",
                "Apply Now": "قدّم الآن",
                "Application Submitted!": "تم إرسال الطلب!",
                "Congratulations! Your partner application is now under review. We will notify you soon.": "تهانينا! طلب الشراكة قيد المراجعة وسنخطرك قريبًا.",
                "Hours": "ساعات",
                "Tap to start the conversation!": "اضغط لبدء المحادثة",
                "Uploading profile picture...": "جارٍ رفع صورة الملف الشخصي...",
                "Uploading channel banner...": "جارٍ رفع غلاف القناة...",
                "Please enter all required fields": "يرجى ملء جميع الحقول المطلوبة",
                "Channel created successfully!": "تم إنشاء القناة بنجاح!",
                "Save Changes": "حفظ التغييرات",
                "Channel Successfully Updated!": "تم تحديث القناة بنجاح!",
                "No uploaded videos yet.": "لم يتم تحميل أي فيديو بعد.",
                "No feels uploaded yet.": "لم يتم تحميل أي Feels بعد.",
                "No posts yet.": "لا توجد منشورات بعد.",
                "0 Subscribers": "0 مشترك",
                "0 Videos": "0 فيديو",
                "Title/Caption is required!": "العنوان/التعليق مطلوب!",
                "Caption / Title is required!": "التعليق/العنوان مطلوب!",
                "Processing Video...": "جارٍ معالجة الفيديو...",
                "Uploading is currently disabled by the administrator.": "رفع الملفات معطّل حاليًا بواسطة المسؤول.",
                "This upload type is currently disabled by the administrator.": "هذا النوع من الرفع معطّل حاليًا بواسطة المسؤول.",
                "No description provided.": "لم يتم تقديم وصف.",
                "Views": "المشاهدات",
                "Likes": "الإعجابات",
                "Comments": "التعليقات",
                "Posts": "المنشورات",
                "Video": "فيديو",
                "Private": "خاص",
                "Schedule": "جدولة",
                "Off": "إيقاف",
                "On": "تشغيل",
                "No results found": "لم يتم العثور على نتائج",
                "Search or use the mic to find movies.": "ابحث أو استخدم الميكروفون للعثور على الأفلام."
        },
        "ur": {
                "Recommended Feed": "تجویز کردہ فیڈ",
                "No comments yet. Tap to start the conversation!": "ابھی تک کوئی تبصرہ نہیں۔ گفتگو شروع کرنے کے لیے ٹیپ کریں!",
                "No comments yet. Be the first to comment!": "ابھی تک کوئی تبصرہ نہیں۔ پہلا تبصرہ کریں!",
                "Comments (": "تبصرے (",
                "All People Reacted": "سب لوگوں کے ردعمل",
                "Please log in to Comment": "تبصرہ کرنے کے لیے لاگ ان کریں",
                "Comment posted!": "تبصرہ شائع ہو گیا!",
                "Failed to post comment": "تبصرہ شائع نہیں ہو سکا",
                "Close": "بند کریں",
                "About": "متعلق",
                "Channel Category": "چینل کی قسم",
                "Joined": "شامل ہوئے",
                "Joined Date": "شمولیت کی تاریخ",
                "Description": "تفصیل",
                "Video Title": "ویڈیو کا عنوان",
                "Published": "شائع شدہ",
                "Just Now": "ابھی ابھی",
                "Upcoming Feature": "آنے والی خصوصیت",
                "Our development team is actively building this experience. Stay tuned for future updates!": "ہماری ڈیولپمنٹ ٹیم اس فیچر پر کام کر رہی ہے۔ اگلی اپ ڈیٹس کے لیے ساتھ رہیں!",
                "Select a Long Video": "ایک لمبی ویڈیو منتخب کریں",
                "Browse Device": "ڈیوائس سے منتخب کریں",
                "Create a Community Post": "کمیونٹی پوسٹ بنائیں",
                "Pick Image": "تصویر منتخب کریں",
                "Next": "اگلا",
                "Add Details": "تفصیلات شامل کریں",
                "Custom Thumbnail": "حسبِ ضرورت تھمب نیل",
                "Title (required)": "عنوان (ضروری)",
                "Description (required)": "تفصیل (ضروری)",
                "Visibility": "نمایاں ہونے کی ترتیب",
                "Publish": "شائع کریں",
                "Schedule Date & Time": "تاریخ اور وقت مقرر کریں",
                "PUBLISH VIDEO": "ویڈیو شائع کریں",
                "Caption (required)": "کیپشن (ضروری)",
                "Description (optional)": "تفصیل (اختیاری)",
                "PUBLISH SHORT": "شارٹ شائع کریں",
                "Create Post": "پوسٹ بنائیں",
                "Title / Caption (required)": "عنوان / کیپشن (ضروری)",
                "PUBLISH POST": "پوسٹ شائع کریں",
                "Set Visibility": "نمایاں ہونے کی ترتیب",
                "Anyone can search for and view": "کوئی بھی تلاش اور دیکھ سکتا ہے",
                "Only you can view": "صرف آپ دیکھ سکتے ہیں",
                "Schedule Publish": "اشاعت کا وقت مقرر کریں",
                "Select a date to make public": "عوامی کرنے کے لیے تاریخ منتخب کریں",
                "Countdown Timer": "کاؤنٹ ڈاؤن ٹائمر",
                "Recording Duration": "ریکارڈنگ کا دورانیہ",
                "Playback Speed": "پلے بیک کی رفتار",
                "Analytics": "تجزیات",
                "ESTIMATED REVENUE": "متوقع آمدنی",
                "View": "دیکھیں",
                "Performance (Last 28 Days)": "کارکردگی (گزشتہ 28 دن)",
                "100% Growth": "100% اضافہ",
                "Subscribers": "سبسکرائبرز",
                "Watch Time (min)": "دیکھنے کا وقت (منٹ)",
                "Created Items": "بنایا گیا مواد",
                "Videos, Feels, Posts": "ویڈیوز، فیلز، پوسٹس",
                "Monthly Growth Channel": "چینل کی ماہانہ ترقی",
                "Metrics distributed based on channel totals": "چینل کے مجموعی اعداد و شمار کی بنیاد پر پیمانے",
                "Monetization": "منیٹائزیشن",
                "Become a Flaynity Partner": "Flaynity پارٹنر بنیں",
                "Next milestone": "اگلا سنگِ میل",
                "Flaynity your earning journey": "Flaynity پر آپ کی آمدنی کا سفر",
                "Earn income by showing ads and connecting with your fans, and gain access to creator tools and support.": "اشتہارات دکھا کر اور مداحوں سے جڑ کر کمائیں، اور کریئیٹر ٹولز اور معاونت حاصل کریں۔",
                "Watch Page Ads": "واچ پیج اشتہارات",
                "Earn from ads and premium subscribers on long videos.": "لمبی ویڈیوز کے اشتہارات اور پریمیم سبسکرائبرز سے کمائیں۔",
                "Feels Feed Ads": "Feels فیڈ اشتہارات",
                "Earn from ads shown in the Feels Feed.": "Feels فیڈ میں دکھائے گئے اشتہارات سے کمائیں۔",
                "Memberships": "ممبرشپس",
                "Create exclusive memberships for your biggest supporters.": "اپنے بڑے حامیوں کے لیے خصوصی ممبرشپس بنائیں۔",
                "Supers": "سپرز",
                "Receive fan support through one-time purchases.": "ایک بار کی خریداری کے ذریعے مداحوں کی مدد حاصل کریں۔",
                "Shopping": "شاپنگ",
                "Recommend products and earn from shopping.": "مصنوعات تجویز کریں اور خریداری سے کمائیں۔",
                "Eligibility": "اہلیت",
                "Showing data as of": "ڈیٹا کی تاریخ",
                "Valid Public Watch Hours": "درست عوامی واچ آورز",
                "Last 365 Days": "گزشتہ 365 دن",
                "Public Views (Feels & Videos)": "عوامی ویوز (Feels اور ویڈیوز)",
                "Some monetization features may have additional eligibility requirements.": "کچھ منیٹائزیشن فیچرز کے لیے اضافی اہلیت درکار ہو سکتی ہے۔",
                "Next Steps": "اگلے مراحل",
                "Apply Now": "ابھی درخواست دیں",
                "Application Submitted!": "درخواست جمع ہو گئی!",
                "Congratulations! Your partner application is now under review. We will notify you soon.": "مبارک ہو! آپ کی پارٹنر درخواست کا جائزہ لیا جا رہا ہے۔ جلد مطلع کریں گے۔",
                "Hours": "گھنٹے",
                "Tap to start the conversation!": "گفتگو شروع کرنے کے لیے ٹیپ کریں",
                "Uploading profile picture...": "پروفائل تصویر اپ لوڈ ہو رہی ہے...",
                "Uploading channel banner...": "چینل بینر اپ لوڈ ہو رہا ہے...",
                "Please enter all required fields": "تمام ضروری خانے پُر کریں",
                "Channel created successfully!": "چینل کامیابی سے بن گیا!",
                "Save Changes": "تبدیلیاں محفوظ کریں",
                "Channel Successfully Updated!": "چینل کامیابی سے اپ ڈیٹ ہو گیا!",
                "No uploaded videos yet.": "ابھی تک کوئی ویڈیو اپ لوڈ نہیں ہوئی۔",
                "No feels uploaded yet.": "ابھی تک کوئی فیل اپ لوڈ نہیں ہوئی۔",
                "No posts yet.": "ابھی تک کوئی پوسٹ نہیں۔",
                "0 Subscribers": "0 سبسکرائبرز",
                "0 Videos": "0 ویڈیوز",
                "Title/Caption is required!": "عنوان/کیپشن ضروری ہے!",
                "Caption / Title is required!": "کیپشن / عنوان ضروری ہے!",
                "Processing Video...": "ویڈیو پراسیس ہو رہی ہے...",
                "Uploading is currently disabled by the administrator.": "ایڈمن نے فی الحال اپ لوڈ بند کیا ہوا ہے۔",
                "This upload type is currently disabled by the administrator.": "اس قسم کا اپ لوڈ ایڈمن نے بند کیا ہوا ہے۔",
                "No description provided.": "کوئی تفصیل فراہم نہیں کی گئی۔",
                "Views": "ویوز",
                "Likes": "لائکس",
                "Comments": "تبصرے",
                "Posts": "پوسٹس",
                "Video": "ویڈیو",
                "Private": "نجی",
                "Schedule": "شیڈول",
                "Off": "بند",
                "On": "آن",
                "No results found": "کوئی نتیجہ نہیں ملا",
                "Search or use the mic to find movies.": "فلمیں تلاش کرنے کے لیے سرچ یا مائیک استعمال کریں۔"
        }
};
    Object.keys(PAGE_TRANSLATIONS).forEach(code => {
        if (LANGUAGES[code]) Object.assign(LANGUAGES[code].map, PAGE_TRANSLATIONS[code]);
    });


    // Premium service page localization: Upgrade Pro, Verified Badge, Boost Content and Flay Pay.
    const PREMIUM_PAGE_TRANSLATIONS = {
        "bn": {
                "Choose Your Plan": "আপনার পরিকল্পনা বেছে নিন",
                "Experience Flaynity with limitless creativity.": "সীমাহীন সৃজনশীলতার সঙ্গে Flaynity উপভোগ করুন।",
                "Unlock exclusive creator privileges, verified badges, and ad-free browsing.": "বিশেষ ক্রিয়েটর সুবিধা, ভেরিফায়েড ব্যাজ এবং বিজ্ঞাপনমুক্ত ব্রাউজিং পান।",
                "CURRENT STATUS": "বর্তমান অবস্থা",
                "Upgrade to unlock Pro or Max features": "Pro বা Max ফিচার পেতে আপগ্রেড করুন",
                "Membership Active For": "সদস্যতার মেয়াদ",
                "Membership Benefits": "সদস্যতার সুবিধা",
                "Ad-Free Experience": "বিজ্ঞাপনমুক্ত অভিজ্ঞতা",
                "Enjoy a cleaner, distraction-free Flaynity experience with zero ad interruptions.": "বিজ্ঞাপন ছাড়াই পরিচ্ছন্ন Flaynity অভিজ্ঞতা উপভোগ করুন।",
                "Premium Creator Tools": "প্রিমিয়াম ক্রিয়েটর টুলস",
                "Exclusive Pro Badge": "এক্সক্লুসিভ Pro ব্যাজ",
                "Priority Features": "অগ্রাধিকারমূলক ফিচার",
                "Select Membership Plan": "সদস্যতার পরিকল্পনা নির্বাচন করুন",
                "MONTHLY": "মাসিক",
                "1 Month Access": "১ মাসের অ্যাক্সেস",
                "BEST VALUE": "সেরা মূল্য",
                "1 Year (12 Months)": "১ বছর (১২ মাস)",
                "All 4 Premium Features Included": "৪টি প্রিমিয়াম ফিচারই অন্তর্ভুক্ত",
                "Instant secure checkout via Flay Pay": "Flay Pay-এর মাধ্যমে তাৎক্ষণিক নিরাপদ পেমেন্ট",
                "Free vs Membership": "ফ্রি বনাম সদস্যতা",
                "Standard feed": "সাধারণ ফিড",
                "Regular tools": "সাধারণ টুলস",
                "Standard profile": "সাধারণ প্রোফাইল",
                "100% Ad-free feed": "সম্পূর্ণ বিজ্ঞাপনমুক্ত ফিড",
                "Advanced creator suite": "উন্নত ক্রিয়েটর টুলস",
                "Frequently Asked Questions": "সাধারণ জিজ্ঞাসা",
                "What is the difference between Pro and Max?": "Pro ও Max-এর মধ্যে পার্থক্য কী?",
                "Can I upgrade while my plan is active?": "প্ল্যান চালু থাকা অবস্থায় কি আপগ্রেড করতে পারি?",
                "How quickly is membership activated?": "সদস্যতা কত দ্রুত সক্রিয় হয়?",
                "Immediately! Once Flay Pay confirms the payment, your crown badge and all VIP features activate in real-time.": "সঙ্গে সঙ্গে! Flay Pay পেমেন্ট নিশ্চিত করলেই আপনার ক্রাউন ব্যাজ ও VIP ফিচার সক্রিয় হবে।",
                "Flay Verified": "Flay Verified",
                "Stand Out With": "نمایক হয়ে উঠুন",
                "Build trust, stand out in Flaynity, and show your audience that your profile is verified.": "আস্থা তৈরি করুন, Flaynity-তে আলাদা হয়ে উঠুন এবং দর্শকদের দেখান আপনার প্রোফাইল যাচাইকৃত।",
                "Verified profiles stand out across feeds, comments, search and messages.": "যাচাইকৃত প্রোফাইল ফিড, মন্তব্য, সার্চ ও মেসেজে আলাদা করে দেখা যায়।",
                "Verified Badge Active": "ভেরিফায়েড ব্যাজ সক্রিয়",
                "Your profile is currently verified and enjoys all premium benefits across Flaynity.": "আপনার প্রোফাইল যাচাইকৃত এবং Flaynity-এর সব প্রিমিয়াম সুবিধা পাচ্ছে।",
                "Why Get Verified?": "ভেরিফায়েড হবেন কেন?",
                "Verified Identity": "যাচাইকৃত পরিচয়",
                "Show a trusted verified identity.": "বিশ্বস্ত যাচাইকৃত পরিচয় দেখান।",
                "Profile Visibility": "প্রোফাইলের দৃশ্যমানতা",
                "Get noticed across Flaynity.": "Flaynity জুড়ে নজরে আসুন।",
                "Premium Badge": "প্রিমিয়াম ব্যাজ",
                "Choose Your Badge Plan": "আপনার ব্যাজ প্ল্যান বেছে নিন",
                "Select the plan that works best for you.": "আপনার জন্য উপযুক্ত প্ল্যান নির্বাচন করুন।",
                "billed every month": "প্রতি মাসে বিল",
                "billed every year": "প্রতি বছর বিল",
                "Flexible starter plan": "নমনীয় প্রাথমিক প্ল্যান",
                "Save 17%": "১৭% সাশ্রয়",
                "Best value for long-term creators": "দীর্ঘমেয়াদি ক্রিয়েটরদের জন্য সেরা মূল্য",
                "Your Verified Badge Includes": "আপনার ভেরিফায়েড ব্যাজের সুবিধা",
                "Badge visible in posts": "পোস্টে ব্যাজ দেখা যাবে",
                "Badge visible in videos": "ভিডিওতে ব্যাজ দেখা যাবে",
                "Badge visible in Feels": "Feels-এ ব্যাজ দেখা যাবে",
                "Badge visible in comments": "মন্তব্যে ব্যাজ দেখা যাবে",
                "Amount will be deducted from your Flay Pay balance securely.": "আপনার Flay Pay ব্যালেন্স থেকে নিরাপদে অর্থ কাটা হবে।",
                "Verification activates immediately upon successful payment.": "کامیاب পেমেন্টের সঙ্গে সঙ্গে ভেরিফিকেশন সক্রিয় হবে।",
                "Continue to Flay Pay": "Flay Pay-এ এগিয়ে যান",
                "Secure payment • Flay Pay": "নিরাপদ পেমেন্ট • Flay Pay",
                "Promote eligible Flaynity content with a premium boost flow.": "প্রিমিয়াম বুস্টের মাধ্যমে যোগ্য Flaynity কনটেন্ট প্রচার করুন।",
                "Connecting to your Flaynity account…": "آپ کے Flaynity اکاؤنٹ سے رابطہ ہو رہا ہے…",
                "Select boost package": "বুস্ট প্যাকেজ নির্বাচন করুন",
                "Content promotion": "কনটেন্ট প্রচার",
                "Dedicated content boost purchase flow.": "কনটেন্ট বুস্ট কেনার জন্য নির্দিষ্ট প্রক্রিয়া।",
                "Realtime status": "রিয়েল-টাইম অবস্থা",
                "Firebase listener can reflect current boost state.": "Firebase listener বর্তমান বুস্টের অবস্থা দেখাতে পারে।",
                "Separate payment page": "আলাদা পেমেন্ট পেজ",
                "Checkout is handled by Flay Pay only.": "চেকআউট শুধু Flay Pay-এর মাধ্যমে হয়।",
                "Payment success is never faked here. Final status must come from the payment system/Firebase.": "এখানে পেমেন্ট সফল বলে ভুয়া দেখানো হয় না। চূড়ান্ত অবস্থা পেমেন্ট সিস্টেম/Firebase থেকে আসতে হবে।",
                "Total available balance": "মোট উপলব্ধ ব্যালেন্স",
                "Recharged": "রিচার্জ",
                "Spent": "খরচ",
                "Choose your preferred payment method": "আপনার পছন্দের পেমেন্ট পদ্ধতি বেছে নিন",
                "Payment Method": "পেমেন্ট পদ্ধতি",
                "Select how you want to pay": "আপনি কীভাবে পেমেন্ট করতে চান তা নির্বাচন করুন",
                "Crypto Payment": "ক্রিপ্টো পেমেন্ট",
                "Pay securely via crypto wallet": "ক্রিপ্টো ওয়ালেটের মাধ্যমে নিরাপদে পেমেন্ট করুন",
                "Local Payment": "স্থানীয় পেমেন্ট",
                "Pay using bKash, Nagad or Rocket": "bKash, Nagad বা Rocket দিয়ে পেমেন্ট করুন",
                "Buy Google Play": "Google Play থেকে কিনুন",
                "Quick purchase through Play Store": "Play Store-এর মাধ্যমে দ্রুত কিনুন",
                "Secure Encrypted": "নিরাপদ এনক্রিপশন",
                "Your payment information is handled through the selected payment provider securely.": "আপনার পেমেন্টের তথ্য নির্বাচিত পেমেন্ট প্রদানকারীর মাধ্যমে নিরাপদে পরিচালিত হয়।",
                "Select Method": "পদ্ধতি নির্বাচন করুন",
                "Add Money": "টাকা যোগ করুন",
                "AMOUNT (USDT)": "পরিমাণ (USDT)",
                "Limits: ($1 - $1000)": "সীমা: ($1 - $1000)",
                "Continue": "চালিয়ে যান",
                "Processing...": "প্রক্রিয়াকরণ হচ্ছে...",
                "Generating a secure localized session.": "নিরাপদ স্থানীয় সেশন তৈরি হচ্ছে।",
                "TIME REMAINING": "অবশিষ্ট সময়",
                "Send money to the account below and fill in the required information": "নিচের অ্যাকাউন্টে টাকা পাঠিয়ে প্রয়োজনীয় তথ্য পূরণ করুন",
                "Transaction ID": "লেনদেন আইডি",
                "Send Money From": "যে নম্বর থেকে টাকা পাঠিয়েছেন",
                "Submit": "জমা দিন",
                "Order Confirmation": "অর্ডার নিশ্চিতকরণ",
                "Selected Plan": "নির্বাচিত প্ল্যান",
                "Cancel": "বাতিল",
                "Confirm Payment": "পেমেন্ট নিশ্চিত করুন",
                "Payment Successful!": "পেমেন্ট সফল হয়েছে!",
                "Your plan has been activated successfully. Enjoy the premium benefits across Flaynity.": "আপনার প্ল্যান সফলভাবে সক্রিয় হয়েছে। Flaynity-এর প্রিমিয়াম সুবিধা উপভোগ করুন।",
                "Done": "সম্পন্ন",
                "Request Submitted": "অনুরোধ জমা হয়েছে",
                "Admin will verify and approve your request shortly. Balance will be updated automatically.": "অ্যাডমিন শিগগিরই আপনার অনুরোধ যাচাই ও অনুমোদন করবেন। ব্যালেন্স স্বয়ংক্রিয়ভাবে আপডেট হবে।",
                "Submission Failed": "অনুরোধ জমা ব্যর্থ হয়েছে",
                "Sign in to continue with this premium service.": "এই প্রিমিয়াম পরিষেবা চালিয়ে যেতে সাইন ইন করুন।",
                "Signed in as": "সাইন ইন করা আছে",
                "This service is active on your account.": "এই পরিষেবাটি আপনার অ্যাকাউন্টে সক্রিয়।"
        },
        "hi": {
                "Choose Your Plan": "अपना प्लान चुनें",
                "Experience Flaynity with limitless creativity.": "असीम रचनात्मकता के साथ Flaynity का अनुभव करें।",
                "Unlock exclusive creator privileges, verified badges, and ad-free browsing.": "विशेष क्रिएटर सुविधाएँ, सत्यापित बैज और विज्ञापन-मुक्त ब्राउज़िंग पाएँ।",
                "CURRENT STATUS": "वर्तमान स्थिति",
                "Upgrade to unlock Pro or Max features": "Pro या Max सुविधाओं के लिए अपग्रेड करें",
                "Membership Active For": "सदस्यता सक्रिय अवधि",
                "Membership Benefits": "सदस्यता के लाभ",
                "Ad-Free Experience": "विज्ञापन-मुक्त अनुभव",
                "Enjoy a cleaner, distraction-free Flaynity experience with zero ad interruptions.": "बिना विज्ञापनों के साफ़ Flaynity अनुभव का आनंद लें।",
                "Premium Creator Tools": "प्रीमियम क्रिएटर टूल",
                "Exclusive Pro Badge": "विशेष Pro बैज",
                "Priority Features": "प्राथमिकता वाली सुविधाएँ",
                "Select Membership Plan": "सदस्यता प्लान चुनें",
                "MONTHLY": "मासिक",
                "1 Month Access": "1 महीने की पहुँच",
                "BEST VALUE": "सबसे अच्छा मूल्य",
                "1 Year (12 Months)": "1 वर्ष (12 महीने)",
                "All 4 Premium Features Included": "सभी 4 प्रीमियम सुविधाएँ शामिल",
                "Instant secure checkout via Flay Pay": "Flay Pay के ज़रिए तुरंत सुरक्षित भुगतान",
                "Free vs Membership": "मुफ़्त बनाम सदस्यता",
                "Standard feed": "मानक फ़ीड",
                "Regular tools": "नियमित टूल",
                "Standard profile": "मानक प्रोफ़ाइल",
                "100% Ad-free feed": "पूरी तरह विज्ञापन-मुक्त फ़ीड",
                "Advanced creator suite": "उन्नत क्रिएटर टूल",
                "Frequently Asked Questions": "अक्सर पूछे जाने वाले प्रश्न",
                "What is the difference between Pro and Max?": "Pro और Max में क्या अंतर है?",
                "Can I upgrade while my plan is active?": "क्या सक्रिय प्लान के दौरान अपग्रेड कर सकता हूँ?",
                "How quickly is membership activated?": "सदस्यता कितनी जल्दी सक्रिय होती है?",
                "Immediately! Once Flay Pay confirms the payment, your crown badge and all VIP features activate in real-time.": "तुरंत! Flay Pay द्वारा भुगतान की पुष्टि होते ही आपका क्राउन बैज और सभी VIP सुविधाएँ सक्रिय हो जाएँगी।",
                "Flay Verified": "Flay Verified",
                "Stand Out With": "अलग पहचान बनाएँ",
                "Build trust, stand out in Flaynity, and show your audience that your profile is verified.": "विश्वास बनाएँ, Flaynity पर अलग पहचान बनाएँ और दर्शकों को दिखाएँ कि आपकी प्रोफ़ाइल सत्यापित है।",
                "Verified profiles stand out across feeds, comments, search and messages.": "सत्यापित प्रोफ़ाइल फ़ीड, टिप्पणियों, खोज और संदेशों में अलग दिखती हैं।",
                "Verified Badge Active": "सत्यापित बैज सक्रिय",
                "Your profile is currently verified and enjoys all premium benefits across Flaynity.": "आपकी प्रोफ़ाइल सत्यापित है और Flaynity के सभी प्रीमियम लाभ मिल रहे हैं।",
                "Why Get Verified?": "सत्यापित क्यों हों?",
                "Verified Identity": "सत्यापित पहचान",
                "Show a trusted verified identity.": "विश्वसनीय सत्यापित पहचान दिखाएँ।",
                "Profile Visibility": "प्रोफ़ाइल दृश्यता",
                "Get noticed across Flaynity.": "Flaynity पर सबकी नज़र में आएँ।",
                "Premium Badge": "प्रीमियम बैज",
                "Choose Your Badge Plan": "अपना बैज प्लान चुनें",
                "Select the plan that works best for you.": "अपने लिए सबसे उपयुक्त प्लान चुनें।",
                "billed every month": "हर महीने बिल",
                "billed every year": "हर साल बिल",
                "Flexible starter plan": "लचीला शुरुआती प्लान",
                "Save 17%": "17% बचत",
                "Best value for long-term creators": "लंबे समय के क्रिएटर के लिए सर्वोत्तम मूल्य",
                "Your Verified Badge Includes": "आपके सत्यापित बैज में शामिल",
                "Badge visible in posts": "पोस्ट में बैज दिखेगा",
                "Badge visible in videos": "वीडियो में बैज दिखेगा",
                "Badge visible in Feels": "Feels में बैज दिखेगा",
                "Badge visible in comments": "टिप्पणियों में बैज दिखेगा",
                "Amount will be deducted from your Flay Pay balance securely.": "आपके Flay Pay बैलेंस से सुरक्षित रूप से राशि काटी जाएगी।",
                "Verification activates immediately upon successful payment.": "सफल भुगतान के तुरंत बाद सत्यापन सक्रिय हो जाएगा।",
                "Continue to Flay Pay": "Flay Pay पर आगे बढ़ें",
                "Secure payment • Flay Pay": "सुरक्षित भुगतान • Flay Pay",
                "Promote eligible Flaynity content with a premium boost flow.": "प्रीमियम बूस्ट के ज़रिए योग्य Flaynity सामग्री का प्रचार करें।",
                "Connecting to your Flaynity account…": "आपके Flaynity खाते से कनेक्ट हो रहा है…",
                "Select boost package": "बूस्ट पैकेज चुनें",
                "Content promotion": "सामग्री प्रचार",
                "Dedicated content boost purchase flow.": "सामग्री बूस्ट खरीदने की विशेष प्रक्रिया।",
                "Realtime status": "रीयल-टाइम स्थिति",
                "Firebase listener can reflect current boost state.": "Firebase listener वर्तमान बूस्ट स्थिति दिखा सकता है।",
                "Separate payment page": "अलग भुगतान पेज",
                "Checkout is handled by Flay Pay only.": "चेकआउट केवल Flay Pay के ज़रिए होता है।",
                "Payment success is never faked here. Final status must come from the payment system/Firebase.": "यहाँ भुगतान की सफलता नकली नहीं दिखाई जाती। अंतिम स्थिति भुगतान सिस्टम/Firebase से आनी चाहिए।",
                "Total available balance": "कुल उपलब्ध बैलेंस",
                "Recharged": "रीचार्ज",
                "Spent": "खर्च",
                "Choose your preferred payment method": "अपनी पसंदीदा भुगतान विधि चुनें",
                "Payment Method": "भुगतान विधि",
                "Select how you want to pay": "भुगतान का तरीका चुनें",
                "Crypto Payment": "क्रिप्टो भुगतान",
                "Pay securely via crypto wallet": "क्रिप्टो वॉलेट से सुरक्षित भुगतान करें",
                "Local Payment": "स्थानीय भुगतान",
                "Pay using bKash, Nagad or Rocket": "bKash, Nagad या Rocket से भुगतान करें",
                "Buy Google Play": "Google Play से खरीदें",
                "Quick purchase through Play Store": "Play Store के ज़रिए तुरंत खरीदें",
                "Secure Encrypted": "सुरक्षित एन्क्रिप्शन",
                "Your payment information is handled through the selected payment provider securely.": "आपकी भुगतान जानकारी चुने गए भुगतान प्रदाता के माध्यम से सुरक्षित रूप से संभाली जाती है।",
                "Select Method": "विधि चुनें",
                "Add Money": "पैसे जोड़ें",
                "AMOUNT (USDT)": "राशि (USDT)",
                "Limits: ($1 - $1000)": "सीमा: ($1 - $1000)",
                "Continue": "जारी रखें",
                "Processing...": "प्रक्रिया जारी है...",
                "Generating a secure localized session.": "सुरक्षित स्थानीय सत्र बनाया जा रहा है।",
                "TIME REMAINING": "शेष समय",
                "Send money to the account below and fill in the required information": "नीचे दिए गए खाते में पैसे भेजें और आवश्यक जानकारी भरें",
                "Transaction ID": "लेन-देन आईडी",
                "Send Money From": "पैसे भेजने वाला नंबर",
                "Submit": "जमा करें",
                "Order Confirmation": "ऑर्डर की पुष्टि",
                "Selected Plan": "चुना गया प्लान",
                "Cancel": "रद्द करें",
                "Confirm Payment": "भुगतान की पुष्टि करें",
                "Payment Successful!": "भुगतान सफल!",
                "Your plan has been activated successfully. Enjoy the premium benefits across Flaynity.": "आपका प्लान सफलतापूर्वक सक्रिय हो गया है। Flaynity के प्रीमियम लाभों का आनंद लें।",
                "Done": "हो गया",
                "Request Submitted": "अनुरोध सबमिट किया गया",
                "Admin will verify and approve your request shortly. Balance will be updated automatically.": "व्यवस्थापक जल्द ही आपके अनुरोध की जाँच और मंज़ूरी देंगे। बैलेंस अपने आप अपडेट होगा।",
                "Submission Failed": "सबमिशन विफल",
                "Sign in to continue with this premium service.": "इस प्रीमियम सेवा को जारी रखने के लिए साइन इन करें।",
                "Signed in as": "इस रूप में साइन इन",
                "This service is active on your account.": "यह सेवा आपके खाते पर सक्रिय है।"
        },
        "es": {
                "Choose Your Plan": "Elige tu plan",
                "Experience Flaynity with limitless creativity.": "Disfruta Flaynity con creatividad ilimitada.",
                "Unlock exclusive creator privileges, verified badges, and ad-free browsing.": "Desbloquea ventajas exclusivas, insignias verificadas y navegación sin anuncios.",
                "CURRENT STATUS": "ESTADO ACTUAL",
                "Upgrade to unlock Pro or Max features": "Actualiza para desbloquear las funciones Pro o Max",
                "Membership Active For": "Membresía activa durante",
                "Membership Benefits": "Ventajas de la membresía",
                "Ad-Free Experience": "Experiencia sin anuncios",
                "Enjoy a cleaner, distraction-free Flaynity experience with zero ad interruptions.": "Disfruta Flaynity sin interrupciones publicitarias.",
                "Premium Creator Tools": "Herramientas prémium para creadores",
                "Exclusive Pro Badge": "Insignia Pro exclusiva",
                "Priority Features": "Funciones prioritarias",
                "Select Membership Plan": "Selecciona un plan de membresía",
                "MONTHLY": "MENSUAL",
                "1 Month Access": "Acceso por 1 mes",
                "BEST VALUE": "MEJOR VALOR",
                "1 Year (12 Months)": "1 año (12 meses)",
                "All 4 Premium Features Included": "Incluye las 4 funciones prémium",
                "Instant secure checkout via Flay Pay": "Pago seguro instantáneo con Flay Pay",
                "Free vs Membership": "Gratis vs membresía",
                "Standard feed": "Feed estándar",
                "Regular tools": "Herramientas habituales",
                "Standard profile": "Perfil estándar",
                "100% Ad-free feed": "Feed 100 % sin anuncios",
                "Advanced creator suite": "Suite avanzada para creadores",
                "Frequently Asked Questions": "Preguntas frecuentes",
                "What is the difference between Pro and Max?": "¿Cuál es la diferencia entre Pro y Max?",
                "Can I upgrade while my plan is active?": "¿Puedo actualizar mientras mi plan está activo?",
                "How quickly is membership activated?": "¿Qué tan rápido se activa la membresía?",
                "Immediately! Once Flay Pay confirms the payment, your crown badge and all VIP features activate in real-time.": "¡De inmediato! Al confirmar Flay Pay el pago, se activan tu insignia y las funciones VIP.",
                "Flay Verified": "Flay Verified",
                "Stand Out With": "Destaca con",
                "Build trust, stand out in Flaynity, and show your audience that your profile is verified.": "Genera confianza y demuestra que tu perfil está verificado en Flaynity.",
                "Verified profiles stand out across feeds, comments, search and messages.": "Los perfiles verificados destacan en feeds, comentarios, búsquedas y mensajes.",
                "Verified Badge Active": "Insignia verificada activa",
                "Your profile is currently verified and enjoys all premium benefits across Flaynity.": "Tu perfil está verificado y disfruta de todas las ventajas prémium de Flaynity.",
                "Why Get Verified?": "¿Por qué verificarte?",
                "Verified Identity": "Identidad verificada",
                "Show a trusted verified identity.": "Muestra una identidad verificada y confiable.",
                "Profile Visibility": "Visibilidad del perfil",
                "Get noticed across Flaynity.": "Hazte notar en Flaynity.",
                "Premium Badge": "Insignia prémium",
                "Choose Your Badge Plan": "Elige tu plan de insignia",
                "Select the plan that works best for you.": "Selecciona el plan que mejor se adapte a ti.",
                "billed every month": "facturado cada mes",
                "billed every year": "facturado cada año",
                "Flexible starter plan": "Plan inicial flexible",
                "Save 17%": "Ahorra un 17 %",
                "Best value for long-term creators": "Mejor valor para creadores a largo plazo",
                "Your Verified Badge Includes": "Tu insignia verificada incluye",
                "Badge visible in posts": "Insignia visible en publicaciones",
                "Badge visible in videos": "Insignia visible en videos",
                "Badge visible in Feels": "Insignia visible en Feels",
                "Badge visible in comments": "Insignia visible en comentarios",
                "Amount will be deducted from your Flay Pay balance securely.": "El importe se descontará de forma segura de tu saldo de Flay Pay.",
                "Verification activates immediately upon successful payment.": "La verificación se activa inmediatamente tras el pago.",
                "Continue to Flay Pay": "Continuar a Flay Pay",
                "Secure payment • Flay Pay": "Pago seguro • Flay Pay",
                "Promote eligible Flaynity content with a premium boost flow.": "Promociona contenido apto de Flaynity con un impulso prémium.",
                "Connecting to your Flaynity account…": "Conectando con tu cuenta de Flaynity…",
                "Select boost package": "Selecciona un paquete de impulso",
                "Content promotion": "Promoción de contenido",
                "Dedicated content boost purchase flow.": "Proceso específico para comprar un impulso de contenido.",
                "Realtime status": "Estado en tiempo real",
                "Firebase listener can reflect current boost state.": "El listener de Firebase puede reflejar el estado actual del impulso.",
                "Separate payment page": "Página de pago independiente",
                "Checkout is handled by Flay Pay only.": "El pago se gestiona únicamente mediante Flay Pay.",
                "Payment success is never faked here. Final status must come from the payment system/Firebase.": "El éxito del pago nunca se simula; el estado final debe venir del sistema de pago/Firebase.",
                "Total available balance": "Saldo total disponible",
                "Recharged": "Recargado",
                "Spent": "Gastado",
                "Choose your preferred payment method": "Elige tu método de pago preferido",
                "Payment Method": "Método de pago",
                "Select how you want to pay": "Selecciona cómo quieres pagar",
                "Crypto Payment": "Pago con criptomonedas",
                "Pay securely via crypto wallet": "Paga de forma segura con una billetera cripto",
                "Local Payment": "Pago local",
                "Pay using bKash, Nagad or Rocket": "Paga con bKash, Nagad o Rocket",
                "Buy Google Play": "Comprar en Google Play",
                "Quick purchase through Play Store": "Compra rápida mediante Play Store",
                "Secure Encrypted": "Cifrado seguro",
                "Your payment information is handled through the selected payment provider securely.": "Tu información de pago se gestiona de forma segura mediante el proveedor elegido.",
                "Select Method": "Seleccionar método",
                "Add Money": "Añadir dinero",
                "AMOUNT (USDT)": "IMPORTE (USDT)",
                "Limits: ($1 - $1000)": "Límites: ($1 - $1000)",
                "Continue": "Continuar",
                "Processing...": "Procesando...",
                "Generating a secure localized session.": "Generando una sesión local segura.",
                "TIME REMAINING": "TIEMPO RESTANTE",
                "Send money to the account below and fill in the required information": "Envía dinero a la cuenta indicada y completa la información requerida",
                "Transaction ID": "ID de transacción",
                "Send Money From": "Enviar dinero desde",
                "Submit": "Enviar",
                "Order Confirmation": "Confirmación del pedido",
                "Selected Plan": "Plan seleccionado",
                "Cancel": "Cancelar",
                "Confirm Payment": "Confirmar pago",
                "Payment Successful!": "¡Pago realizado correctamente!",
                "Your plan has been activated successfully. Enjoy the premium benefits across Flaynity.": "Tu plan se ha activado correctamente. Disfruta de las ventajas prémium de Flaynity.",
                "Done": "Listo",
                "Request Submitted": "Solicitud enviada",
                "Admin will verify and approve your request shortly. Balance will be updated automatically.": "El administrador verificará y aprobará tu solicitud pronto. El saldo se actualizará automáticamente.",
                "Submission Failed": "Error al enviar",
                "Sign in to continue with this premium service.": "Inicia sesión para continuar con este servicio prémium.",
                "Signed in as": "Sesión iniciada como",
                "This service is active on your account.": "Este servicio está activo en tu cuenta."
        },
        "fr": {
                "Choose Your Plan": "Choisissez votre offre",
                "Experience Flaynity with limitless creativity.": "Découvrez Flaynity avec une créativité sans limites.",
                "Unlock exclusive creator privileges, verified badges, and ad-free browsing.": "Débloquez des avantages exclusifs, des badges vérifiés et une navigation sans publicité.",
                "CURRENT STATUS": "STATUT ACTUEL",
                "Upgrade to unlock Pro or Max features": "Passez à l’offre supérieure pour débloquer Pro ou Max",
                "Membership Active For": "Abonnement actif pendant",
                "Membership Benefits": "Avantages de l’abonnement",
                "Ad-Free Experience": "Expérience sans publicité",
                "Enjoy a cleaner, distraction-free Flaynity experience with zero ad interruptions.": "Profitez de Flaynity sans interruption publicitaire.",
                "Premium Creator Tools": "Outils premium pour créateurs",
                "Exclusive Pro Badge": "Badge Pro exclusif",
                "Priority Features": "Fonctionnalités prioritaires",
                "Select Membership Plan": "Choisissez une formule d’abonnement",
                "MONTHLY": "MENSUEL",
                "1 Month Access": "Accès pendant 1 mois",
                "BEST VALUE": "MEILLEUR RAPPORT QUALITÉ-PRIX",
                "1 Year (12 Months)": "1 an (12 mois)",
                "All 4 Premium Features Included": "Les 4 fonctionnalités premium incluses",
                "Instant secure checkout via Flay Pay": "Paiement sécurisé instantané via Flay Pay",
                "Free vs Membership": "Gratuit vs abonnement",
                "Standard feed": "Fil standard",
                "Regular tools": "Outils standards",
                "Standard profile": "Profil standard",
                "100% Ad-free feed": "Fil 100 % sans publicité",
                "Advanced creator suite": "Suite avancée pour créateurs",
                "Frequently Asked Questions": "Questions fréquentes",
                "What is the difference between Pro and Max?": "Quelle est la différence entre Pro et Max ?",
                "Can I upgrade while my plan is active?": "Puis-je passer à une autre offre pendant mon abonnement ?",
                "How quickly is membership activated?": "À quelle vitesse l’abonnement est-il activé ?",
                "Immediately! Once Flay Pay confirms the payment, your crown badge and all VIP features activate in real-time.": "Immédiatement ! Dès que Flay Pay confirme le paiement, votre badge et les fonctions VIP sont activés.",
                "Flay Verified": "Flay Verified",
                "Stand Out With": "Démarquez-vous avec",
                "Build trust, stand out in Flaynity, and show your audience that your profile is verified.": "Inspirez confiance et montrez que votre profil est vérifié sur Flaynity.",
                "Verified profiles stand out across feeds, comments, search and messages.": "Les profils vérifiés se distinguent dans les fils, commentaires, recherches et messages.",
                "Verified Badge Active": "Badge vérifié actif",
                "Your profile is currently verified and enjoys all premium benefits across Flaynity.": "Votre profil est vérifié et bénéficie de tous les avantages premium de Flaynity.",
                "Why Get Verified?": "Pourquoi se faire vérifier ?",
                "Verified Identity": "Identité vérifiée",
                "Show a trusted verified identity.": "Affichez une identité vérifiée et fiable.",
                "Profile Visibility": "Visibilité du profil",
                "Get noticed across Flaynity.": "Faites-vous remarquer sur Flaynity.",
                "Premium Badge": "Badge premium",
                "Choose Your Badge Plan": "Choisissez votre formule de badge",
                "Select the plan that works best for you.": "Choisissez la formule qui vous convient le mieux.",
                "billed every month": "facturé chaque mois",
                "billed every year": "facturé chaque année",
                "Flexible starter plan": "Formule de départ flexible",
                "Save 17%": "Économisez 17 %",
                "Best value for long-term creators": "Meilleur rapport qualité-prix pour les créateurs sur le long terme",
                "Your Verified Badge Includes": "Votre badge vérifié comprend",
                "Badge visible in posts": "Badge visible dans les publications",
                "Badge visible in videos": "Badge visible dans les vidéos",
                "Badge visible in Feels": "Badge visible dans les Feels",
                "Badge visible in comments": "Badge visible dans les commentaires",
                "Amount will be deducted from your Flay Pay balance securely.": "Le montant sera déduit en toute sécurité de votre solde Flay Pay.",
                "Verification activates immediately upon successful payment.": "La vérification est activée immédiatement après le paiement.",
                "Continue to Flay Pay": "Continuer vers Flay Pay",
                "Secure payment • Flay Pay": "Paiement sécurisé • Flay Pay",
                "Promote eligible Flaynity content with a premium boost flow.": "Faites la promotion du contenu éligible de Flaynity avec une mise en avant premium.",
                "Connecting to your Flaynity account…": "Connexion à votre compte Flaynity…",
                "Select boost package": "Choisissez un forfait de mise en avant",
                "Content promotion": "Promotion de contenu",
                "Dedicated content boost purchase flow.": "Parcours dédié à l’achat d’une mise en avant.",
                "Realtime status": "État en temps réel",
                "Firebase listener can reflect current boost state.": "L’écouteur Firebase peut refléter l’état actuel de la mise en avant.",
                "Separate payment page": "Page de paiement distincte",
                "Checkout is handled by Flay Pay only.": "Le paiement est géré uniquement par Flay Pay.",
                "Payment success is never faked here. Final status must come from the payment system/Firebase.": "La réussite du paiement n’est jamais simulée ; le statut final doit provenir du système de paiement/Firebase.",
                "Total available balance": "Solde total disponible",
                "Recharged": "Rechargé",
                "Spent": "Dépensé",
                "Choose your preferred payment method": "Choisissez votre moyen de paiement préféré",
                "Payment Method": "Moyen de paiement",
                "Select how you want to pay": "Choisissez comment payer",
                "Crypto Payment": "Paiement crypto",
                "Pay securely via crypto wallet": "Payez en toute sécurité via un portefeuille crypto",
                "Local Payment": "Paiement local",
                "Pay using bKash, Nagad or Rocket": "Payez avec bKash, Nagad ou Rocket",
                "Buy Google Play": "Acheter sur Google Play",
                "Quick purchase through Play Store": "Achat rapide via Play Store",
                "Secure Encrypted": "Chiffrement sécurisé",
                "Your payment information is handled through the selected payment provider securely.": "Vos informations de paiement sont traitées en toute sécurité par le prestataire choisi.",
                "Select Method": "Choisir la méthode",
                "Add Money": "Ajouter de l’argent",
                "AMOUNT (USDT)": "MONTANT (USDT)",
                "Limits: ($1 - $1000)": "Limites : ($1 - $1000)",
                "Continue": "Continuer",
                "Processing...": "Traitement en cours...",
                "Generating a secure localized session.": "Création d’une session locale sécurisée.",
                "TIME REMAINING": "TEMPS RESTANT",
                "Send money to the account below and fill in the required information": "Envoyez l’argent au compte ci-dessous et remplissez les informations requises",
                "Transaction ID": "ID de transaction",
                "Send Money From": "Envoyer l’argent depuis",
                "Submit": "Soumettre",
                "Order Confirmation": "Confirmation de commande",
                "Selected Plan": "Offre sélectionnée",
                "Cancel": "Annuler",
                "Confirm Payment": "Confirmer le paiement",
                "Payment Successful!": "Paiement réussi !",
                "Your plan has been activated successfully. Enjoy the premium benefits across Flaynity.": "Votre offre a été activée. Profitez des avantages premium de Flaynity.",
                "Done": "Terminé",
                "Request Submitted": "Demande envoyée",
                "Admin will verify and approve your request shortly. Balance will be updated automatically.": "L’administrateur vérifiera et approuvera bientôt votre demande. Le solde sera mis à jour automatiquement.",
                "Submission Failed": "Échec de l’envoi",
                "Sign in to continue with this premium service.": "Connectez-vous pour continuer avec ce service premium.",
                "Signed in as": "Connecté en tant que",
                "This service is active on your account.": "Ce service est actif sur votre compte."
        },
        "ar": {
                "Choose Your Plan": "اختر خطتك",
                "Experience Flaynity with limitless creativity.": "استمتع بـ Flaynity بإبداع بلا حدود.",
                "Unlock exclusive creator privileges, verified badges, and ad-free browsing.": "افتح مزايا المنشئين الحصرية والشارات الموثقة والتصفح بلا إعلانات.",
                "CURRENT STATUS": "الحالة الحالية",
                "Upgrade to unlock Pro or Max features": "قم بالترقية لفتح ميزات Pro أو Max",
                "Membership Active For": "مدة العضوية النشطة",
                "Membership Benefits": "مزايا العضوية",
                "Ad-Free Experience": "تجربة بلا إعلانات",
                "Enjoy a cleaner, distraction-free Flaynity experience with zero ad interruptions.": "استمتع بتجربة Flaynity دون انقطاع الإعلانات.",
                "Premium Creator Tools": "أدوات مميزة للمنشئين",
                "Exclusive Pro Badge": "شارة Pro حصرية",
                "Priority Features": "ميزات ذات أولوية",
                "Select Membership Plan": "اختر خطة العضوية",
                "MONTHLY": "شهري",
                "1 Month Access": "إمكانية الوصول لمدة شهر",
                "BEST VALUE": "أفضل قيمة",
                "1 Year (12 Months)": "سنة واحدة (12 شهرًا)",
                "All 4 Premium Features Included": "تشمل جميع الميزات المميزة الأربع",
                "Instant secure checkout via Flay Pay": "دفع آمن وفوري عبر Flay Pay",
                "Free vs Membership": "مجاني مقابل العضوية",
                "Standard feed": "موجز عادي",
                "Regular tools": "أدوات عادية",
                "Standard profile": "ملف شخصي عادي",
                "100% Ad-free feed": "موجز بلا إعلانات تمامًا",
                "Advanced creator suite": "مجموعة أدوات متقدمة للمنشئين",
                "Frequently Asked Questions": "الأسئلة الشائعة",
                "What is the difference between Pro and Max?": "ما الفرق بين Pro وMax؟",
                "Can I upgrade while my plan is active?": "هل يمكنني الترقية أثناء نشاط خطتي؟",
                "How quickly is membership activated?": "ما سرعة تفعيل العضوية؟",
                "Immediately! Once Flay Pay confirms the payment, your crown badge and all VIP features activate in real-time.": "فورًا! بمجرد تأكيد Flay Pay للدفع، يتم تفعيل الشارة وميزات VIP.",
                "Flay Verified": "Flay Verified",
                "Stand Out With": "تميّز مع",
                "Build trust, stand out in Flaynity, and show your audience that your profile is verified.": "عزّز الثقة وأظهر لجمهورك أن ملفك موثّق على Flaynity.",
                "Verified profiles stand out across feeds, comments, search and messages.": "تتميّز الملفات الموثقة في الموجز والتعليقات والبحث والرسائل.",
                "Verified Badge Active": "شارة التوثيق نشطة",
                "Your profile is currently verified and enjoys all premium benefits across Flaynity.": "ملفك موثّق ويتمتع بجميع مزايا Flaynity المميزة.",
                "Why Get Verified?": "لماذا توثّق حسابك؟",
                "Verified Identity": "هوية موثقة",
                "Show a trusted verified identity.": "أظهر هوية موثوقة وموثقة.",
                "Profile Visibility": "ظهور الملف الشخصي",
                "Get noticed across Flaynity.": "كن ملحوظًا عبر Flaynity.",
                "Premium Badge": "شارة مميزة",
                "Choose Your Badge Plan": "اختر خطة الشارة",
                "Select the plan that works best for you.": "اختر الخطة الأنسب لك.",
                "billed every month": "تُدفع شهريًا",
                "billed every year": "تُدفع سنويًا",
                "Flexible starter plan": "خطة بداية مرنة",
                "Save 17%": "وفّر 17٪",
                "Best value for long-term creators": "أفضل قيمة للمنشئين على المدى الطويل",
                "Your Verified Badge Includes": "تشمل شارة التوثيق",
                "Badge visible in posts": "تظهر الشارة في المنشورات",
                "Badge visible in videos": "تظهر الشارة في الفيديوهات",
                "Badge visible in Feels": "تظهر الشارة في Feels",
                "Badge visible in comments": "تظهر الشارة في التعليقات",
                "Amount will be deducted from your Flay Pay balance securely.": "سيتم خصم المبلغ بأمان من رصيد Flay Pay.",
                "Verification activates immediately upon successful payment.": "يتم تفعيل التوثيق فور نجاح الدفع.",
                "Continue to Flay Pay": "المتابعة إلى Flay Pay",
                "Secure payment • Flay Pay": "دفع آمن • Flay Pay",
                "Promote eligible Flaynity content with a premium boost flow.": "روّج لمحتوى Flaynity المؤهل عبر تعزيز مميز.",
                "Connecting to your Flaynity account…": "جارٍ الاتصال بحساب Flaynity…",
                "Select boost package": "اختر باقة التعزيز",
                "Content promotion": "الترويج للمحتوى",
                "Dedicated content boost purchase flow.": "مسار مخصص لشراء تعزيز المحتوى.",
                "Realtime status": "الحالة في الوقت الفعلي",
                "Firebase listener can reflect current boost state.": "يمكن لمستمع Firebase عرض حالة التعزيز الحالية.",
                "Separate payment page": "صفحة دفع منفصلة",
                "Checkout is handled by Flay Pay only.": "تتم عملية الدفع عبر Flay Pay فقط.",
                "Payment success is never faked here. Final status must come from the payment system/Firebase.": "لا يتم تزوير نجاح الدفع؛ يجب أن تأتي الحالة النهائية من نظام الدفع/Firebase.",
                "Total available balance": "إجمالي الرصيد المتاح",
                "Recharged": "تم الشحن",
                "Spent": "المصروف",
                "Choose your preferred payment method": "اختر طريقة الدفع المفضلة لديك",
                "Payment Method": "طريقة الدفع",
                "Select how you want to pay": "حدد طريقة الدفع",
                "Crypto Payment": "الدفع بالعملات الرقمية",
                "Pay securely via crypto wallet": "ادفع بأمان عبر محفظة العملات الرقمية",
                "Local Payment": "الدفع المحلي",
                "Pay using bKash, Nagad or Rocket": "ادفع باستخدام bKash أو Nagad أو Rocket",
                "Buy Google Play": "الشراء عبر Google Play",
                "Quick purchase through Play Store": "شراء سريع عبر Play Store",
                "Secure Encrypted": "تشفير آمن",
                "Your payment information is handled through the selected payment provider securely.": "تتم معالجة معلومات الدفع بأمان عبر مزود الدفع المحدد.",
                "Select Method": "اختر الطريقة",
                "Add Money": "إضافة أموال",
                "AMOUNT (USDT)": "المبلغ (USDT)",
                "Limits: ($1 - $1000)": "الحدود: ($1 - $1000)",
                "Continue": "متابعة",
                "Processing...": "جارٍ المعالجة...",
                "Generating a secure localized session.": "جارٍ إنشاء جلسة محلية آمنة.",
                "TIME REMAINING": "الوقت المتبقي",
                "Send money to the account below and fill in the required information": "أرسل المال إلى الحساب أدناه واملأ المعلومات المطلوبة",
                "Transaction ID": "معرّف المعاملة",
                "Send Money From": "إرسال المال من",
                "Submit": "إرسال",
                "Order Confirmation": "تأكيد الطلب",
                "Selected Plan": "الخطة المحددة",
                "Cancel": "إلغاء",
                "Confirm Payment": "تأكيد الدفع",
                "Payment Successful!": "تم الدفع بنجاح!",
                "Your plan has been activated successfully. Enjoy the premium benefits across Flaynity.": "تم تفعيل خطتك بنجاح. استمتع بمزايا Flaynity المميزة.",
                "Done": "تم",
                "Request Submitted": "تم إرسال الطلب",
                "Admin will verify and approve your request shortly. Balance will be updated automatically.": "سيتحقق المسؤول من طلبك ويوافق عليه قريبًا. سيتم تحديث الرصيد تلقائيًا.",
                "Submission Failed": "فشل الإرسال",
                "Sign in to continue with this premium service.": "سجّل الدخول للمتابعة إلى هذه الخدمة المميزة.",
                "Signed in as": "تم تسجيل الدخول باسم",
                "This service is active on your account.": "هذه الخدمة نشطة في حسابك."
        },
        "ur": {
                "Choose Your Plan": "اپنا پلان منتخب کریں",
                "Experience Flaynity with limitless creativity.": "لامحدود تخلیقی صلاحیت کے ساتھ Flaynity کا تجربہ کریں۔",
                "Unlock exclusive creator privileges, verified badges, and ad-free browsing.": "خصوصی کریئیٹر سہولیات، تصدیق شدہ بیج اور اشتہارات سے پاک براؤزنگ حاصل کریں۔",
                "CURRENT STATUS": "موجودہ حیثیت",
                "Upgrade to unlock Pro or Max features": "Pro یا Max فیچرز کھولنے کے لیے اپ گریڈ کریں",
                "Membership Active For": "ممبرشپ فعال رہنے کی مدت",
                "Membership Benefits": "ممبرشپ کے فوائد",
                "Ad-Free Experience": "اشتہارات سے پاک تجربہ",
                "Enjoy a cleaner, distraction-free Flaynity experience with zero ad interruptions.": "بغیر اشتہارات کے صاف Flaynity تجربے سے لطف اٹھائیں۔",
                "Premium Creator Tools": "پریمیم کریئیٹر ٹولز",
                "Exclusive Pro Badge": "خصوصی Pro بیج",
                "Priority Features": "ترجیحی فیچرز",
                "Select Membership Plan": "ممبرشپ پلان منتخب کریں",
                "MONTHLY": "ماہانہ",
                "1 Month Access": "1 ماہ تک رسائی",
                "BEST VALUE": "بہترین قیمت",
                "1 Year (12 Months)": "1 سال (12 ماہ)",
                "All 4 Premium Features Included": "تمام 4 پریمیم فیچرز شامل",
                "Instant secure checkout via Flay Pay": "Flay Pay کے ذریعے فوری محفوظ ادائیگی",
                "Free vs Membership": "مفت بمقابلہ ممبرشپ",
                "Standard feed": "معیاری فیڈ",
                "Regular tools": "عام ٹولز",
                "Standard profile": "معیاری پروفائل",
                "100% Ad-free feed": "مکمل اشتہارات سے پاک فیڈ",
                "Advanced creator suite": "جدید کریئیٹر سوئٹ",
                "Frequently Asked Questions": "اکثر پوچھے گئے سوالات",
                "What is the difference between Pro and Max?": "Pro اور Max میں کیا فرق ہے؟",
                "Can I upgrade while my plan is active?": "کیا فعال پلان کے دوران اپ گریڈ کر سکتا ہوں؟",
                "How quickly is membership activated?": "ممبرشپ کتنی جلدی فعال ہوتی ہے؟",
                "Immediately! Once Flay Pay confirms the payment, your crown badge and all VIP features activate in real-time.": "فوراً! Flay Pay کی ادائیگی کی تصدیق کے بعد کراؤن بیج اور تمام VIP فیچرز فعال ہو جائیں گے۔",
                "Flay Verified": "Flay Verified",
                "Stand Out With": "نمایاں ہوں",
                "Build trust, stand out in Flaynity, and show your audience that your profile is verified.": "اعتماد پیدا کریں اور اپنے ناظرین کو دکھائیں کہ آپ کا پروفائل تصدیق شدہ ہے۔",
                "Verified profiles stand out across feeds, comments, search and messages.": "تصدیق شدہ پروفائل فیڈ، تبصروں، تلاش اور پیغامات میں نمایاں ہوتے ہیں۔",
                "Verified Badge Active": "تصدیقی بیج فعال",
                "Your profile is currently verified and enjoys all premium benefits across Flaynity.": "آپ کا پروفائل تصدیق شدہ ہے اور Flaynity کے تمام پریمیم فوائد حاصل کر رہا ہے۔",
                "Why Get Verified?": "تصدیق کیوں حاصل کریں؟",
                "Verified Identity": "تصدیق شدہ شناخت",
                "Show a trusted verified identity.": "قابلِ اعتماد تصدیق شدہ شناخت دکھائیں۔",
                "Profile Visibility": "پروفائل کی نمایاں حیثیت",
                "Get noticed across Flaynity.": "Flaynity پر نمایاں ہوں۔",
                "Premium Badge": "پریمیم بیج",
                "Choose Your Badge Plan": "اپنا بیج پلان منتخب کریں",
                "Select the plan that works best for you.": "اپنے لیے موزوں ترین پلان منتخب کریں۔",
                "billed every month": "ہر ماہ بل",
                "billed every year": "ہر سال بل",
                "Flexible starter plan": "لچکدار ابتدائی پلان",
                "Save 17%": "17% بچت",
                "Best value for long-term creators": "طویل مدتی کریئیٹرز کے لیے بہترین قیمت",
                "Your Verified Badge Includes": "آپ کے تصدیقی بیج میں شامل",
                "Badge visible in posts": "پوسٹس میں بیج نظر آئے گا",
                "Badge visible in videos": "ویڈیوز میں بیج نظر آئے گا",
                "Badge visible in Feels": "Feels میں بیج نظر آئے گا",
                "Badge visible in comments": "تبصروں میں بیج نظر آئے گا",
                "Amount will be deducted from your Flay Pay balance securely.": "رقم Flay Pay بیلنس سے محفوظ طریقے سے کاٹا جائے گا۔",
                "Verification activates immediately upon successful payment.": "کامیاب ادائیگی کے فوراً بعد تصدیق فعال ہو جائے گی۔",
                "Continue to Flay Pay": "Flay Pay پر جاری رکھیں",
                "Secure payment • Flay Pay": "محفوظ ادائیگی • Flay Pay",
                "Promote eligible Flaynity content with a premium boost flow.": "پریمیم بوسٹ کے ذریعے اہل Flaynity مواد کو فروغ دیں۔",
                "Connecting to your Flaynity account…": "آپ کے Flaynity اکاؤنٹ سے منسلک ہو رہا ہے…",
                "Select boost package": "بوسٹ پیکیج منتخب کریں",
                "Content promotion": "مواد کی تشہیر",
                "Dedicated content boost purchase flow.": "مواد بوسٹ خریدنے کا مخصوص طریقہ۔",
                "Realtime status": "ریئل ٹائم حیثیت",
                "Firebase listener can reflect current boost state.": "Firebase listener موجودہ بوسٹ کی حالت دکھا سکتا ہے۔",
                "Separate payment page": "الگ ادائیگی صفحہ",
                "Checkout is handled by Flay Pay only.": "چیک آؤٹ صرف Flay Pay کے ذریعے ہوتا ہے۔",
                "Payment success is never faked here. Final status must come from the payment system/Firebase.": "یہاں ادائیگی کی کامیابی جعلی نہیں دکھائی جاتی؛ حتمی حیثیت ادائیگی سسٹم/Firebase سے آنی چاہیے۔",
                "Total available balance": "کل دستیاب بیلنس",
                "Recharged": "ریچارج",
                "Spent": "خرچ",
                "Choose your preferred payment method": "اپنا پسندیدہ ادائیگی طریقہ منتخب کریں",
                "Payment Method": "ادائیگی کا طریقہ",
                "Select how you want to pay": "ادائیگی کا طریقہ منتخب کریں",
                "Crypto Payment": "کرپٹو ادائیگی",
                "Pay securely via crypto wallet": "کرپٹو والیٹ کے ذریعے محفوظ ادائیگی کریں",
                "Local Payment": "مقامی ادائیگی",
                "Pay using bKash, Nagad or Rocket": "bKash، Nagad یا Rocket کے ذریعے ادائیگی کریں",
                "Buy Google Play": "Google Play سے خریدیں",
                "Quick purchase through Play Store": "Play Store کے ذریعے فوری خریداری",
                "Secure Encrypted": "محفوظ انکرپشن",
                "Your payment information is handled through the selected payment provider securely.": "آپ کی ادائیگی کی معلومات منتخب ادائیگی فراہم کنندہ کے ذریعے محفوظ طریقے سے سنبھالی جاتی ہیں۔",
                "Select Method": "طریقہ منتخب کریں",
                "Add Money": "رقم شامل کریں",
                "AMOUNT (USDT)": "رقم (USDT)",
                "Limits: ($1 - $1000)": "حد: ($1 - $1000)",
                "Continue": "جاری رکھیں",
                "Processing...": "پروسیسنگ جاری ہے...",
                "Generating a secure localized session.": "محفوظ مقامی سیشن بنایا جا رہا ہے۔",
                "TIME REMAINING": "باقی وقت",
                "Send money to the account below and fill in the required information": "نیچے دیے گئے اکاؤنٹ میں رقم بھیجیں اور ضروری معلومات پُر کریں",
                "Transaction ID": "ٹرانزیکشن آئی ڈی",
                "Send Money From": "رقم بھیجنے والا نمبر",
                "Submit": "جمع کریں",
                "Order Confirmation": "آرڈر کی تصدیق",
                "Selected Plan": "منتخب پلان",
                "Cancel": "منسوخ کریں",
                "Confirm Payment": "ادائیگی کی تصدیق کریں",
                "Payment Successful!": "ادائیگی کامیاب!",
                "Your plan has been activated successfully. Enjoy the premium benefits across Flaynity.": "آپ کا پلان کامیابی سے فعال ہو گیا ہے۔ Flaynity کے پریمیم فوائد سے لطف اٹھائیں۔",
                "Done": "مکمل",
                "Request Submitted": "درخواست جمع ہو گئی",
                "Admin will verify and approve your request shortly. Balance will be updated automatically.": "ایڈمن جلد آپ کی درخواست کی تصدیق اور منظوری دے گا۔ بیلنس خود بخود اپ ڈیٹ ہوگا۔",
                "Submission Failed": "درخواست جمع نہیں ہو سکی",
                "Sign in to continue with this premium service.": "اس پریمیم سروس کو جاری رکھنے کے لیے سائن ان کریں۔",
                "Signed in as": "اس اکاؤنٹ سے سائن ان",
                "This service is active on your account.": "یہ سروس آپ کے اکاؤنٹ پر فعال ہے۔"
        }
};
    Object.keys(PREMIUM_PAGE_TRANSLATIONS).forEach(code => {
        if (LANGUAGES[code]) Object.assign(LANGUAGES[code].map, PREMIUM_PAGE_TRANSLATIONS[code]);
    });

    Object.keys(EXTRA_TRANSLATIONS).forEach(code => {
        if (LANGUAGES[code]) Object.assign(LANGUAGES[code].map, EXTRA_TRANSLATIONS[code]);
    });

    const originals = new WeakMap();
    const lastRendered = new WeakMap();
    let currentLanguage = 'en';
    let translating = false;

    function normalize(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function resolveLanguage(label) {
        const value = normalize(label);
        if (/বাংলা|Bangla|Bengali/i.test(value)) return 'bn';
        if (/English/i.test(value)) return 'en';
        if (/العربية|Arabic/i.test(value)) return 'ar';
        if (/Español|Spanish/i.test(value)) return 'es';
        if (/Français|French/i.test(value)) return 'fr';
        if (/हिन्दी|Hindi/i.test(value)) return 'hi';
        if (/اردو|Urdu/i.test(value)) return 'ur';
        return 'en';
    }

    function rememberTextNode(node) {
        if (!node || node.nodeType !== 3) return;
        if (!originals.has(node)) originals.set(node, node.nodeValue);
    }

    function translateTextNode(node) {
        if (!node || node.nodeType !== 3) return;
        const parent = node.parentElement;
        if (!parent || parent.closest('script,style,textarea,input,code,pre,[contenteditable="true"]')) return;
        rememberTextNode(node);
        const original = originals.get(node);
        const key = normalize(original);
        if (!key) return;
        const lang = LANGUAGES[currentLanguage] || LANGUAGES.en;
        let translated = lang.map[key];
        // Keep numeric counters dynamic while translating their UI labels.
        if (!translated) {
            const counter = key.match(/^(\\d[\\d,.]*)(\\s+)(Likes|Views|Comments|Subscribers|Videos|Posts)$/i);
            if (counter && lang.map[counter[3]]) translated = counter[1] + counter[2] + lang.map[counter[3]];
        }
        const leading = (original.match(/^\s*/) || [''])[0];
        const trailing = (original.match(/\s*$/) || [''])[0];
        const nextValue = translated ? leading + translated + trailing : original;
        lastRendered.set(node, nextValue);
        if (node.nodeValue !== nextValue) node.nodeValue = nextValue;
    }

    function translateAttributes(root) {
        if (!root || root.nodeType !== 1) return;
        const lang = LANGUAGES[currentLanguage] || LANGUAGES.en;
        const attrs = ['placeholder','title','aria-label','alt'];
        const elements = [root].concat(Array.from(root.querySelectorAll ? root.querySelectorAll('*') : []));
        elements.forEach(el => {
            attrs.forEach(attr => {
                const value = el.getAttribute && el.getAttribute(attr);
                if (!value) return;
                if (!el.hasAttribute('data-flaynity-original-' + attr)) {
                    el.setAttribute('data-flaynity-original-' + attr, value);
                }
                const original = el.getAttribute('data-flaynity-original-' + attr);
                if (lang.map[normalize(original)]) el.setAttribute(attr, lang.map[normalize(original)]);
                else if (currentLanguage === 'en') el.setAttribute(attr, original);
            });
        });
    }

    function translateTree(root) {
        if (!root) return;
        translating = true;
        try {
            if (root.nodeType === 3) translateTextNode(root);
            else {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) translateTextNode(node);
                if (root.nodeType === 1) translateAttributes(root);
            }
        } finally {
            translating = false;
        }
    }

    function applyLanguage(code) {
        currentLanguage = LANGUAGES[code] ? code : 'en';
        try { localStorage.setItem(LANG_KEY, currentLanguage); } catch (e) {}
        document.documentElement.setAttribute('lang', currentLanguage);
        // Keep the existing layout direction and styling unchanged.
        translateTree(document.body);
        const languageSheet = document.getElementById('sheet-language');
        if (languageSheet) {
            languageSheet.querySelectorAll('.sheet-option-item').forEach(item => {
                const label = item.querySelector('.sheet-option-label');
                if (label && resolveLanguage(label.textContent) === currentLanguage) item.classList.add('selected');
                else item.classList.remove('selected');
            });
        }
        window.dispatchEvent(new CustomEvent('flaynity-language-changed', { detail: { language: currentLanguage } }));
    }

    window.setFlaynityLanguage = function (labelOrCode) {
        const code = LANGUAGES[labelOrCode] ? labelOrCode : resolveLanguage(labelOrCode);
        applyLanguage(code);
    };
    window.getFlaynityLanguage = function () { return currentLanguage; };

    function init() {
        let saved = '';
        try { saved = localStorage.getItem(LANG_KEY) || ''; } catch (e) {}
        const sheet = document.getElementById('sheet-language');
        if (!saved && sheet) {
            const selected = sheet.querySelector('.sheet-option-item.selected .sheet-option-label');
            if (selected) saved = resolveLanguage(selected.textContent);
        }
        applyLanguage(saved || 'en');

        const observer = new MutationObserver(mutations => {
            if (translating) return;
            mutations.forEach(mutation => {
                if (mutation.type === 'characterData') {
                    const node = mutation.target;
                    // Detect text updated by app logic, but ignore our own translation writes.
                    if (lastRendered.has(node) && node.nodeValue === lastRendered.get(node)) return;
                    originals.set(node, node.nodeValue);
                    translateTextNode(node);
                }
                mutation.addedNodes && mutation.addedNodes.forEach(node => translateTree(node));
            });
        });
        if (document.body) observer.observe(document.body, { childList: true, characterData: true, subtree: true });
        window.addEventListener('flaynity-dom-ready', () => translateTree(document.body));
        window.addEventListener('flaynity-pages-ready', () => translateTree(document.body));
        window.addEventListener('flaynity-tab-changed', () => translateTree(document.body));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();


/* Discover (Explore) feed — 2-column masonry cards, live from Firebase. */
(function () {
    "use strict";
    var FEELS_PATH = "admin_panel/movies/feels";
    var listenerRef = null;
    var boundGrid = null;
    var retryCount = 0;
    var observer = null;
    var likeCache = {};
    var RATIOS = [3 / 4, 3 / 4, 1 / 1.05, 3 / 4.1, 1 / 1.2];

    var HEART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.4s-7.6-4.6-9.2-9.5C1.7 7.5 3.7 4.4 7 4.4c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.3 0 5.3 3.1 4.2 6.5-1.6 4.9-9.2 9.5-9.2 9.5z"/></svg>';
    var IMAGE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v8.6l3.4-3.4a1 1 0 0 1 1.4 0l3 3 2.2-2.2a1 1 0 0 1 1.4 0L19 14.6V6zm10.2 3.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z"/></svg>';

    function pickText(item) {
        return String(item.caption || item.title || item.name || item.description || "").trim();
    }
    function pickImage(item) {
        return item.thumbnailUrl || item.thumbnailURL || item.thumbnail || item.posterUrl ||
               item.poster || item.imageUrl || item.imageURL || item.coverUrl || item.cover ||
               item.image || item.thumbnail_url || item.poster_url || item.previewUrl || item.preview || "";
    }
    function pickVideo(item) {
        return item.videoUrl || item.videoURL || item.video || item.mediaUrl ||
               item.mediaURL || item.fileUrl || item.fileURL || item.downloadUrl || item.downloadURL ||
               item.url || item.video_url || "";
    }
    function pickName(item) {
        return String(item.username || item.channelName || item.uploaderName || item.author || item.creator || "").trim();
    }
    function pickAvatar(item) {
        return item.channelAvatar || item.avatarUrl || item.avatar || item.channelImageUrl || item.profileImage || "";
    }
    function fmt(n) {
        n = Number(n) || 0;
        if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
        if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
        return String(n);
    }
    function ratioFor(id) {
        var sum = 0, str = String(id || "");
        for (var i = 0; i < str.length; i++) sum += str.charCodeAt(i);
        return RATIOS[sum % RATIOS.length];
    }
    function showState(grid, message) {
        if (!grid) return;
        grid.dataset.state = "message";
        grid.innerHTML = "";
        var box = document.createElement("div");
        box.className = "discover-feels-empty";
        box.textContent = message;
        grid.appendChild(box);
    }
    function loadLikes(id, label, fallback) {
        label.textContent = fmt(fallback);
        if (likeCache[id] !== undefined) { label.textContent = fmt(likeCache[id]); return; }
        try {
            window.firebase.database().ref("movie_stats/" + id + "/likes").once("value", function (snap) {
                var v = snap.val();
                var count = v && typeof v === "object" ? Object.keys(v).length : (Number(v) || Number(fallback) || 0);
                likeCache[id] = count;
                label.textContent = fmt(count);
            });
        } catch (e) {}
    }
    function buildCard(id, item, ratio) {
        var card = document.createElement("div");
        card.className = "discover-feels-card";
        card.dataset.id = id;

        var thumb = document.createElement("div");
        thumb.className = "dc-thumb";
        thumb.style.aspectRatio = String(ratio);
        card.appendChild(thumb);

        var caption = pickText(item);
        var image = pickImage(item);
        var video = pickVideo(item);

        function addVideo() {
            var v = document.createElement("video");
            v.src = video; v.muted = true; v.playsInline = true; v.preload = "metadata";
            thumb.insertBefore(v, thumb.firstChild);
        }
        if (image) {
            var img = document.createElement("img");
            img.src = image;
            img.alt = caption || "Feel";
            img.loading = "lazy";
            img.decoding = "async";
            img.onerror = function () {
                img.style.display = "none";
                if (video) addVideo();
            };
            thumb.appendChild(img);
        } else if (video) {
            addVideo();
        } else {
            var ph = document.createElement("div");
            ph.className = "dc-thumb-ph";
            ph.textContent = caption || "Feel";
            thumb.appendChild(ph);
        }
        if (!video) {
            var badge = document.createElement("span");
            badge.className = "dc-badge";
            badge.innerHTML = IMAGE_SVG;
            thumb.appendChild(badge);
        }

        if (caption) {
            var title = document.createElement("div");
            title.className = "discover-feels-caption";
            title.textContent = caption;
            card.appendChild(title);
        }

        var meta = document.createElement("div");
        meta.className = "dc-meta";
        var av = pickAvatar(item);
        if (av) {
            var avImg = document.createElement("img");
            avImg.className = "dc-av";
            avImg.src = av;
            avImg.alt = "";
            avImg.loading = "lazy";
            avImg.onerror = function () { avImg.style.visibility = "hidden"; };
            meta.appendChild(avImg);
        } else {
            var avPh = document.createElement("span");
            avPh.className = "dc-av";
            meta.appendChild(avPh);
        }
        var name = document.createElement("span");
        name.className = "dc-name";
        name.textContent = pickName(item) || "Flaynity";
        meta.appendChild(name);

        var like = document.createElement("span");
        like.className = "dc-like";
        like.innerHTML = HEART_SVG;
        var count = document.createElement("b");
        count.style.fontWeight = "500";
        like.appendChild(count);
        meta.appendChild(like);
        card.appendChild(meta);
        loadLikes(id, count, item.likes);

        card.addEventListener("click", function () {
            if (typeof playUI === "function") playUI("click");
            if (typeof openShortFromHome === "function") openShortFromHome(id);
        });
        return card;
    }
    function renderFeels(snapshot) {
        var grid = document.getElementById("discover-feels-grid");
        if (!grid) return;
        var raw = snapshot && snapshot.val ? snapshot.val() : null;
        var data = raw && typeof raw === "object" ? raw : {};
        var entries = Object.entries(data).filter(function (entry) {
            var item = entry[1] || {};
            var status = String(item.status || item.visibility || "published").toLowerCase();
            return status !== "hidden" && status !== "deleted" && status !== "draft" && status !== "scheduled" &&
                   status !== "private" && item.published !== false && item.isPublished !== false;
        }).sort(function (a, b) {
            var av = Number((a[1] || {}).createdAt || (a[1] || {}).uploadTime || (a[1] || {}).timestamp || 0);
            var bv = Number((b[1] || {}).createdAt || (b[1] || {}).uploadTime || (b[1] || {}).timestamp || 0);
            return bv - av;
        });
        if (!entries.length) {
            showState(grid, "No Feels available yet");
            return;
        }
        grid.dataset.state = "ready";
        grid.innerHTML = "";
        var cols = [document.createElement("div"), document.createElement("div")];
        cols[0].className = cols[1].className = "dc-col";
        var heights = [0, 0];
        entries.forEach(function (entry) {
            var item = entry[1] || {};
            var id = item.id || entry[0];
            var ratio = ratioFor(id);
            var target = heights[0] <= heights[1] ? 0 : 1;
            cols[target].appendChild(buildCard(id, item, ratio));
            heights[target] += 1 / ratio + 0.5; // thumbnail height + text block (relative to column width)
        });
        grid.appendChild(cols[0]);
        grid.appendChild(cols[1]);
    }
    function connectFeels() {
        var grid = document.getElementById("discover-feels-grid");
        if (!grid) return;
        if (boundGrid === grid && listenerRef) return;
        boundGrid = grid;
        if (!window.firebase || typeof window.firebase.database !== "function") {
            if (retryCount++ < 20) {
                setTimeout(connectFeels, 400);
                return;
            }
            showState(grid, "Unable to connect to Feels");
            return;
        }
        try {
            if (listenerRef) {
                try { listenerRef.off("value", renderFeels); } catch (e) {}
            }
            listenerRef = window.firebase.database().ref(FEELS_PATH);
            listenerRef.on("value", renderFeels, function (error) {
                console.error("Discover Feels Firebase error:", error);
                showState(document.getElementById("discover-feels-grid"), "Unable to load Feels. Check Firebase access.");
            });
            // Avoid an endless skeleton if Firebase never answers (permission/network error).
            setTimeout(function () {
                var g = document.getElementById("discover-feels-grid");
                if (g && g.dataset.state === "loading") showState(g, "Connecting to Feels…");
            }, 8000);
        } catch (error) {
            console.error("Discover Feels initialization error:", error);
            showState(grid, "Unable to load Feels");
        }
    }
    function initAfterInjection() {
        connectFeels();
        if (typeof initSearchEvents === "function") initSearchEvents();
    }
    window.addEventListener("flaynity-pages-ready", initAfterInjection);
    window.addEventListener("flaynity-dom-ready", initAfterInjection);
    window.addEventListener("flaynity-tab-changed", initAfterInjection);
    document.addEventListener("DOMContentLoaded", initAfterInjection);
    if (document.getElementById("discover-feels-grid")) initAfterInjection();
    if (document.body && typeof MutationObserver !== "undefined") {
        observer = new MutationObserver(function () {
            if (document.getElementById("discover-feels-grid")) initAfterInjection();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
    setTimeout(initAfterInjection, 0);
})();


// =========================================================
// Feels: Settings icon (fixed) -> opens the current Feels' quality page
// =========================================================
function feelsCurrentSlideId() {
    const sw = document.querySelector('#feels-swiper-container .feels-swiper');
    if (!sw) return null;
    const top = sw.getBoundingClientRect().top;
    let best = null, bd = Infinity;
    sw.querySelectorAll('.short-slide').forEach(sl => {
        const d = Math.abs(sl.getBoundingClientRect().top - top);
        if (d < bd) { bd = d; best = sl; }
    });
    return best ? (best.dataset.shortid || null) : null;
}
function openFeelsSettingsTop(event) {
    openFeelsQualitySheet(feelsCurrentSlideId(), event);
}

// =========================================================
// Feels: every video keeps its original aspect ratio (9:16 fills status-bar-bottom -> bottom navigation)
// =========================================================
function feelsApplyVideoFit(v) {
    if (!v) return;
    v.style.setProperty('object-fit', 'contain', 'important');   // original aspect ratio, never cropped / stretched
    v.style.setProperty('object-position', 'center', 'important');
    const slide = v.closest('.short-slide');
    if (slide && v.videoWidth && v.videoHeight) {
        const r = v.videoWidth / v.videoHeight;
        slide.classList.toggle('short-vertical', r >= 0.5 && r <= 0.6);   // 9:16 -> small gap above bottom navigation
    }
}
['loadedmetadata', 'loadeddata', 'resize'].forEach(ev => {
    document.addEventListener(ev, e => {
        if (e.target && e.target.classList && e.target.classList.contains('short-video-el')) feelsApplyVideoFit(e.target);
    }, true);
});
setInterval(() => {                                       // covers videos that were ready before the listener
    document.querySelectorAll('.short-video-el').forEach(v => { if (v.readyState >= 1 && !v._fitDone) { v._fitDone = true; feelsApplyVideoFit(v); } });
}, 1200);

// =========================================================
// Feels description sheet (YouTube Shorts style)
// =========================================================
let _fdsSlideId = null;
function fdsEnsure() {
    let el = document.getElementById('feels-desc-sheet');
    if (el) return el;
    const st = document.createElement('style');
    st.textContent = `
    #feels-desc-sheet{position:fixed;inset:0;z-index:3000;display:none;align-items:flex-end;justify-content:center;background:transparent}
    #feels-desc-sheet .fds-catch{position:absolute;left:0;right:0;top:0;height:38vh}
    #feels-desc-sheet .fds-sheet{position:relative;width:100%;height:62vh;box-sizing:border-box;color:#fff;border-radius:26px 26px 0 0;display:flex;flex-direction:column;overflow:hidden;
      background:radial-gradient(120% 60% at 50% 0%,rgba(255,45,111,.16) 0%,rgba(255,45,111,0) 60%),linear-gradient(180deg,#1a1417 0%,#0f0f11 45%,#0c0c0e 100%);
      border-top:1px solid rgba(255,90,140,.35);box-shadow:0 -10px 40px rgba(0,0,0,.55);animation:fdsUp .4s cubic-bezier(.22,1,.36,1);touch-action:none}
    #feels-desc-sheet .fds-sheet.closing{animation:fdsDown .24s ease-in forwards}
    @keyframes fdsUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
    @keyframes fdsDown{from{transform:translateY(0)}to{transform:translateY(100%)}}
    .fds-grab{flex:0 0 auto;padding:12px 0 8px;display:flex;justify-content:center;cursor:grab}
    .fds-grab span{width:42px;height:5px;border-radius:3px;background:rgba(255,255,255,.28)}
    .fds-scroll{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:2px 18px calc(30px + env(safe-area-inset-bottom,0px));touch-action:pan-y}
    .fds-head{display:flex;align-items:flex-start;gap:10px}
    .fds-title{flex:1 1 auto;margin:0;font-size:20px;line-height:1.42;font-weight:800;letter-spacing:-.2px;word-break:break-word;color:#fff}
    .fds-tag{color:#D80E45;font-weight:700}
    .fds-x{flex:0 0 auto;width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.09);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .fds-x:active{background:rgba(255,255,255,.2)}
    .fds-x svg{width:20px;height:20px;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;fill:none}
    .fds-head{align-items:center !important;margin:2px 0 16px}
    .fds-chan{flex:1 1 auto;display:flex;align-items:center;gap:12px;min-width:0;padding:8px 12px;border-radius:18px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.07)}
    .fds-av{width:40px;height:40px;border-radius:50%;object-fit:cover;background:#222;flex:0 0 auto;box-shadow:0 0 0 2px #0f0f11,0 0 0 4px #D80E45}
    .fds-cname{font-size:16.5px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fds-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:0 0 20px}
    .fds-stat{text-align:center;padding:12px 6px;border-radius:16px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.07);min-width:0}
    .fds-stat b{display:block;font-size:19px;font-weight:800;line-height:1.2;color:#fff}
    .fds-stat span{display:block;font-size:12.5px;letter-spacing:.3px;color:rgba(255,255,255,.58);margin-top:3px}
    .fds-card{background:#2b201c;border-radius:20px;padding:16px 18px;font-size:16px;line-height:1.45;color:#fff;word-break:break-word;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .fds-ctitle{font-size:18px;font-weight:800;line-height:1.45;letter-spacing:-.1px}
    .fds-div{height:1px;background:rgba(255,255,255,.14);margin:12px 0}
    .fds-line{white-space:pre-wrap;word-break:break-word;font-size:15.5px;line-height:1.6;color:rgba(255,255,255,.92)}
    .fds-gap{height:11px}
    .fds-card .fds-body{display:block}
    .fds-card.collapsed .fds-body{max-height:200px;overflow:hidden}
    .fds-card .fds-more{display:none;font-weight:700;margin-top:2px}
    .fds-card.has-more .fds-more{display:block}
    .fds-empty{color:rgba(255,255,255,.5);font-style:italic}
    `;
    document.head.appendChild(st);
    el = document.createElement('div');
    el.id = 'feels-desc-sheet';
    el.className = 'premium-download-modal';
    document.body.appendChild(el);
    // clean up whenever the page is hidden (also by the Android Back button)
    new MutationObserver(() => { if (el.style.display === 'none') fdsCleanup(); }).observe(el, { attributes: true, attributeFilter: ['style'] });
    return el;
}
function fdsTagify(text) {
    return escapeHTML(String(text || '')).replace(/(?<!&)#[\p{L}\p{N}_]+/gu,
        m => `<span class="fds-tag app-hashtag" style="color:#D80E45 !important;-webkit-text-fill-color:#D80E45;font-weight:700">${m}</span>`);
}
function fdsFormatDesc(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    let out = '', gap = false;
    lines.forEach(l => {
        if (!l.trim()) { gap = true; return; }
        if (gap && out) out += '<div class="fds-gap"></div>';
        gap = false;
        out += `<div class="fds-line">${fdsTagify(l.replace(/\s+$/, ''))}</div>`;
    });
    return out;
}
function fdsVideoFit(slide, on) {
    const v = slide && slide.querySelector('.short-video-el');
    if (!v) return;
    if (!on) { v.style.setProperty('transform', 'none', 'important'); return; }
    const H = slide.clientHeight || 1;
    const P = parseFloat(getComputedStyle(slide).paddingTop) || 0;   // status bar gap
    const Pb = parseFloat(getComputedStyle(slide).paddingBottom) || 0; // gap above bottom navigation
    const Hc = Math.max(1, H - P - Pb);                              // video box height
    const top = window.innerHeight * 0.38;                           // top edge of the sheet
    const sc = Math.min(1, (top - P - 10) / Hc);
    const ty = (top - H + Pb) / 2;                                   // centre of free area (P..top)
    v.style.setProperty('transform', `translate3d(0,${ty}px,0) scale(${sc})`, 'important');
}
function fdsCleanup() {
    const tab = document.getElementById('feels-tab');
    if (tab) tab.classList.remove('fds-open');
    document.querySelectorAll('.short-slide.fds-open').forEach(sl => { sl.classList.remove('fds-open'); fdsVideoFit(sl, false); });
    _fdsSlideId = null;
}
function openFeelsDescSheet(shortId) {
    const s = allFeels.find(item => String(item.id) === String(shortId));
    if (!s) return;
    const slide = document.getElementById(`slide-short-${shortId}`);
    const el = fdsEnsure();
    _fdsSlideId = String(shortId);

    const disc = document.querySelector(`#music-disc-${shortId} img`);
    const avatar = (disc && disc.getAttribute('src')) || s.channelAvatar || '';
    const cname = s.channelName || s.username || 'Flaynity';
    const ts = s.createdAt ? new Date(s.createdAt) : new Date();
    const dMain = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dYear = String(ts.getFullYear());
    const likeEl = document.getElementById(`short-likes-count-${shortId}`);
    const desc = String(s.description || '').trim();

    el.innerHTML = `<div class="fds-catch"></div>
      <div class="fds-sheet">
        <div class="fds-grab"><span></span></div>
        <div class="fds-scroll">
          <div class="fds-head">
            <div class="fds-chan">${avatar ? `<img class="fds-av" src="${escapeHTML(avatar)}" alt="">` : '<span class="fds-av"></span>'}<span class="fds-cname">${escapeHTML(String(cname))}</span></div>
            <button type="button" class="fds-x" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>
          <div class="fds-stats">
            <div class="fds-stat"><b id="fds-likes">${likeEl ? likeEl.textContent : '0'}</b><span>Likes</span></div>
            <div class="fds-stat"><b id="fds-views">—</b><span>Views</span></div>
            <div class="fds-stat"><b>${dMain}</b><span>${dYear}</span></div>
          </div>
          <div class="fds-card collapsed" id="fds-card">
            <div class="fds-ctitle">${fdsTagify(String(s.title || 'Feels').replace(/\s*\n\s*/g, ' '))}</div>
            <div class="fds-div"></div>
            <div class="fds-body${desc ? '' : ' fds-empty'}">${desc ? fdsFormatDesc(desc) : 'No description provided.'}</div>
            <span class="fds-more">...more</span></div>
        </div>
      </div>`;

    const sheet = el.querySelector('.fds-sheet');
    const close = () => closeFeelsDescSheet();
    el.querySelector('.fds-catch').addEventListener('click', close);
    el.querySelector('.fds-x').addEventListener('click', close);
    const card = el.querySelector('#fds-card');
    const moreEl = card.querySelector('.fds-more');
    card.addEventListener('click', () => {
        if (!card.classList.contains('has-more')) return;
        const open = card.classList.toggle('collapsed') === false;
        moreEl.textContent = open ? 'Show less' : '...more';
    });

    // drag the handle / header down to close
    let sy = 0, dy = 0, drag = false;
    const grab = el.querySelector('.fds-grab');
    grab.addEventListener('touchstart', e => { sy = e.touches[0].clientY; dy = 0; drag = true; sheet.style.animation = 'none'; sheet.style.transition = 'none'; }, { passive: true });
    grab.addEventListener('touchmove', e => { if (!drag) return; dy = Math.max(0, e.touches[0].clientY - sy); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
    grab.addEventListener('touchend', () => {
        if (!drag) return; drag = false;
        if (dy > 90) { sheet.style.transform = ''; close(); }
        else { sheet.style.transition = 'transform .2s ease'; sheet.style.transform = 'translateY(0)'; }
    });

    // video shrinks to the top while it keeps playing; overlays fade out
    const tab = document.getElementById('feels-tab');
    if (tab) tab.classList.add('fds-open');
    if (slide) {
        slide.classList.add('fds-open');
        fdsVideoFit(slide, true);
        const v = slide.querySelector('video');
        if (v && v.paused) v.play().catch(() => {});
    }
    AppNavigation.pushModal('feels-desc-sheet');

    // "...more" only when the text is really longer than the collapsed box
    requestAnimationFrame(() => {
        const body = card.querySelector('.fds-body');
        if (body && body.scrollHeight > body.clientHeight + 2) card.classList.add('has-more');
        else { card.classList.remove('collapsed'); card.style.cursor = 'default'; }
    });

    if (navigator.onLine) {
        db.ref(`movie_stats/${shortId}`).once('value', snap => {
            const st = snap.val() || {};
            const v = document.getElementById('fds-views'); const l = document.getElementById('fds-likes');
            if (v) v.textContent = formatCount(Object.keys(st.views || {}).length);
            if (l) l.textContent = formatCount(Object.keys(st.likes || {}).length);
        });
    }
}
function closeFeelsDescSheet() {
    const el = document.getElementById('feels-desc-sheet');
    if (!el) return;
    const sheet = el.querySelector('.fds-sheet');
    const slide = _fdsSlideId ? document.getElementById(`slide-short-${_fdsSlideId}`) : null;
    if (slide) { slide.classList.remove('fds-open'); fdsVideoFit(slide, false); }
    const tab = document.getElementById('feels-tab');
    if (tab) tab.classList.remove('fds-open');
    if (sheet) { sheet.style.transform = ''; sheet.style.animation = ''; sheet.classList.add('closing'); }
    setTimeout(() => {
        const cur = AppNavigation.current();
        if (cur && cur.id === 'feels-desc-sheet') AppNavigation.pop();
        else el.style.display = 'none';
    }, 230);
}


// =========================================================
// App-wide hashtags: any #tag the user writes (titles, descriptions, posts, comments...) is shown in #D80E45
// =========================================================
(function appHashtagColor() {
    const COLOR = '#D80E45';
    const st = document.createElement('style');
    st.textContent = `.app-hashtag{color:${COLOR} !important;-webkit-text-fill-color:${COLOR} !important;}`;
    (document.head || document.documentElement).appendChild(st);

    const RE = /(?<![&#\/=])#[\p{L}_][\p{L}\p{N}_]*/gu;
    const SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION|SELECT|TITLE|NOSCRIPT|CODE)$/;

    function processText(node) {
        const t = node.nodeValue;
        if (!t || t.indexOf('#') < 0) return;
        const p = node.parentElement;
        if (!p || SKIP.test(p.tagName) || p instanceof SVGElement) return;
        if (p.closest('.app-hashtag,[contenteditable="true"],[data-no-hashtag]')) return;
        RE.lastIndex = 0;
        let last = 0, m, frag = null;
        while ((m = RE.exec(t)) !== null) {
            if (!frag) frag = document.createDocumentFragment();
            if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
            const sp = document.createElement('span');
            sp.className = 'app-hashtag';
            sp.textContent = m[0];
            frag.appendChild(sp);
            last = m.index + m[0].length;
        }
        if (!frag) return;
        if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
        node.parentNode.replaceChild(frag, node);
    }
    function processTree(root) {
        if (root.nodeType === 3) { processText(root); return; }
        if (root.nodeType !== 1 || SKIP.test(root.tagName)) return;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const list = []; let n;
        while ((n = w.nextNode())) { if (n.nodeValue && n.nodeValue.indexOf('#') >= 0) list.push(n); }
        list.forEach(processText);
    }

    let queue = new Set(), scheduled = false;
    function flush() {
        scheduled = false;
        const items = Array.from(queue); queue = new Set();
        items.forEach(n => { if (n.isConnected) processTree(n); });
    }
    function start() {
        processTree(document.body);
        new MutationObserver(recs => {
            for (const r of recs) {
                if (r.type === 'characterData') queue.add(r.target);
                else r.addedNodes.forEach(n => queue.add(n));
            }
            if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

/* =====================================================================
   FLAYNITY CHANNEL STUDIO MODULE v2
   1. Profile Photo Crop & Zoom (White clean studio background)
   2. Channel Cover Studio: Photo + Ready-made Templates + Gradients + Exact 1.8:1 Live Preview + Direct Save
   3. Pure-JS ISO/IEC 18004 QR Code Generator + Branded Gradient QR Card (matching design)
   4. Full-Screen QR Code Scan System Page (Live Camera + Torch + Gallery Decode)
   5. Public/Private Channel Profile Opener + Scan Deep-Link Routing
   ===================================================================== */
(function () {
    'use strict';
    if (window.__flaynityChannelStudioLoaded) return;
    window.__flaynityChannelStudioLoaded = true;

    function ensureStudioStyles() {
        const old = document.getElementById('fl-studio-styles');
        if (old) old.remove();
        const st = document.createElement('style');
        st.id = 'fl-studio-styles';
        st.textContent = `
/* --- 1. Profile Photo Crop & Zoom Modal (Clean White Background) --- */
#fl-cropper-modal {
    position: fixed; inset: 0; z-index: 2147483260;
    background: #ffffff; color: #0f172a;
    display: none; flex-direction: column;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    touch-action: none; user-select: none; -webkit-user-select: none;
}
#fl-cropper-modal.open { display: flex; }
.flcr-top {
    display: flex; align-items: center; justify-content: space-between;
    padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 12px;
    background: #ffffff; border-bottom: 1px solid rgba(15,23,42,.08);
}
.flcr-top h3 { margin: 0; font-size: 1.04rem; font-weight: 850; letter-spacing: -.2px; color: #0f172a; }
.flcr-tbtn {
    border: 1px solid rgba(15,23,42,.12); background: #f8fafc; color: #0f172a;
    border-radius: 999px; height: 36px; padding: 0 14px;
    font: inherit; font-size: .85rem; font-weight: 750; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.flcr-tbtn:active { background: #e2e8f0; }
.flcr-stage-wrap {
    flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;
    padding: 20px; position: relative; overflow: hidden; background: #ffffff;
}
.flcr-stage {
    position: relative; width: min(86vw, 340px); height: min(86vw, 340px);
    border-radius: 24px; overflow: hidden; background: #f1f5f9;
    box-shadow: 0 14px 36px rgba(15,23,42,.12); border: 1px solid rgba(15,23,42,.08);
    cursor: grab; touch-action: none;
}
.flcr-stage:active { cursor: grabbing; }
.flcr-stage canvas { width: 100%; height: 100%; display: block; }
.flcr-controls {
    padding: 16px 20px calc(22px + env(safe-area-inset-bottom, 0px));
    background: #ffffff; border-top: 1px solid rgba(15,23,42,.08);
    display: flex; flex-direction: column; gap: 14px;
}
.flcr-zoom-row { display: flex; align-items: center; gap: 10px; }
.flcr-zbtn {
    width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(15,23,42,.14);
    background: #f8fafc; color: #0f172a; font-size: 1.05rem; font-weight: 800;
    cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
}
.flcr-zbtn:active { background: #e2e8f0; }
.flcr-slider { flex: 1; accent-color: #D80E45; height: 6px; cursor: pointer; }
.flcr-zpct { min-width: 46px; text-align: right; font-size: .82rem; font-weight: 800; color: #334155; }
.flcr-actions { display: flex; gap: 10px; }
.flcr-act-sec {
    height: 48px; padding: 0 18px; border-radius: 14px;
    border: 1px solid rgba(15,23,42,.14); background: #f8fafc;
    color: #0f172a; font: inherit; font-size: .9rem; font-weight: 750; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
}
.flcr-act-pri {
    flex: 1; height: 48px; border-radius: 14px; border: 0;
    background: #D80E45; color: #fff; font: inherit; font-size: .95rem; font-weight: 800;
    cursor: pointer; box-shadow: 0 8px 20px rgba(216,14,69,.32);
}
.flcr-act-pri:active, .flcr-act-sec:active { transform: scale(.98); }

/* --- 2. Channel Background / Cover Studio Modal (Exact 1.8:1 Live Preview) --- */
#fl-cover-modal {
    position: fixed; inset: 0; z-index: 2147483210;
    background: rgba(10,11,15,.58); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
    display: none; align-items: flex-end; justify-content: center;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
}
#fl-cover-modal.open { display: flex; }
.flcv-sheet {
    width: 100%; max-width: 520px; max-height: 92dvh;
    background: var(--surface, #ffffff); color: var(--text-main, #0f172a);
    border-radius: 26px 26px 0 0; overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 -16px 48px rgba(0,0,0,.28);
}
[data-theme="dark"] .flcv-sheet { background: #14151a; color: #fff; }
.flcv-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px 10px; border-bottom: 1px solid rgba(127,127,127,.16);
}
.flcv-head h3 { margin: 0; font-size: 1.05rem; font-weight: 850; }
.flcv-close {
    width: 34px; height: 34px; border-radius: 50%; border: 0;
    background: rgba(127,127,127,.14); color: inherit; font-size: 1.15rem;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.flcv-preview-wrap { padding: 14px 16px 10px; }
.flcv-preview-card {
    position: relative; width: 100%; aspect-ratio: 1.8 / 1;
    border-radius: 16px; overflow: hidden; background: #1e293b;
    box-shadow: 0 8px 24px rgba(0,0,0,.16);
}
.flcv-preview-card img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
.flcv-preview-fade {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,.55) 100%);
    pointer-events: none;
}
.flcv-preview-meta {
    position: absolute; left: 12px; right: 12px; bottom: 10px;
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
}
.flcv-preview-badge {
    background: rgba(0,0,0,.48); backdrop-filter: blur(6px); color: #fff;
    font-size: .7rem; font-weight: 800; padding: 4px 9px; border-radius: 999px;
    letter-spacing: .3px; text-transform: uppercase;
}
.flcv-preview-ch {
    display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 800; font-size: .88rem;
    text-shadow: 0 1px 4px rgba(0,0,0,.6);
}
.flcv-preview-av {
    width: 32px; height: 32px; border-radius: 50%; object-fit: cover;
    border: 2px solid #fff; background: #D80E45;
}
.flcv-tabs { display: flex; gap: 6px; padding: 0 16px 10px; }
.flcv-tab {
    flex: 1; height: 38px; border-radius: 12px; border: 1px solid rgba(127,127,127,.2);
    background: transparent; color: inherit; font: inherit; font-size: .84rem; font-weight: 800;
    cursor: pointer; transition: all .15s ease;
}
.flcv-tab.active {
    background: #D80E45; color: #fff; border-color: #D80E45;
    box-shadow: 0 4px 12px rgba(216,14,69,.28);
}
.flcv-body {
    flex: 1; min-height: 170px; max-height: 36vh; overflow-y: auto;
    padding: 4px 16px 14px; -webkit-overflow-scrolling: touch;
}
.flcv-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.flcv-tile {
    position: relative; aspect-ratio: 1.8 / 1; border-radius: 13px; overflow: hidden;
    border: 2.5px solid transparent; cursor: pointer; background: #1e293b;
    padding: 0; transition: transform .12s ease, border-color .15s ease;
}
.flcv-tile:active { transform: scale(.97); }
.flcv-tile.selected { border-color: #D80E45; box-shadow: 0 0 0 2px rgba(216,14,69,.25); }
.flcv-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.flcv-tile-lbl {
    position: absolute; left: 6px; bottom: 5px;
    background: rgba(0,0,0,.55); color: #fff; font-size: .68rem; font-weight: 700;
    padding: 2px 7px; border-radius: 999px;
}
.flcv-custom-grad {
    margin-top: 12px; padding: 12px; border-radius: 14px;
    border: 1px solid rgba(127,127,127,.2); background: rgba(127,127,127,.06);
}
.flcv-cg-title { font-size: .8rem; font-weight: 800; margin: 0 0 8px; }
.flcv-cg-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.flcv-color-pill {
    display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px;
    border-radius: 10px; border: 1px solid rgba(127,127,127,.24);
    font-size: .78rem; font-weight: 700;
}
.flcv-color-pill input[type="color"] { width: 24px; height: 24px; border: 0; background: none; padding: 0; cursor: pointer; }
.flcv-angles { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.flcv-ang {
    padding: 5px 10px; border-radius: 8px; border: 1px solid rgba(127,127,127,.25);
    background: transparent; color: inherit; font: inherit; font-size: .75rem; font-weight: 700; cursor: pointer;
}
.flcv-ang.active { background: #D80E45; color: #fff; border-color: #D80E45; }
.flcv-photo-box {
    border: 2px dashed rgba(216,14,69,.38); border-radius: 16px;
    padding: 26px 16px; text-align: center; cursor: pointer;
    background: rgba(216,14,69,.04);
}
.flcv-photo-box i { font-size: 1.8rem; color: #D80E45; margin-bottom: 8px; display: block; }
.flcv-photo-box p { margin: 0; font-size: .92rem; font-weight: 800; }
.flcv-photo-box span { display: block; margin-top: 4px; font-size: .76rem; opacity: .7; font-weight: 600; }
.flcv-foot {
    padding: 12px 16px calc(18px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid rgba(127,127,127,.14); display: flex; gap: 10px;
}
.flcv-apply {
    flex: 1; height: 48px; border: 0; border-radius: 14px;
    background: #D80E45; color: #fff; font: inherit; font-size: .95rem; font-weight: 800;
    cursor: pointer; box-shadow: 0 8px 20px rgba(216,14,69,.3);
}
.flcv-apply:disabled { opacity: .65; }
.flcv-apply:active { transform: scale(.98); }

/* --- 3. Channel QR Code Modal (Premium White + Pink/Purple Gradient Design) --- */
#fl-qr-modal {
    position: fixed; inset: 0; z-index: 2147483200;
    background: rgba(15,16,24,.64); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    display: none; align-items: center; justify-content: center; padding: 16px;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
}
#fl-qr-modal.open { display: flex; }
.flqr-card {
    width: 100%; max-width: 364px; border-radius: 30px; overflow: hidden;
    background: #ffffff; color: #0f172a;
    box-shadow: 0 24px 64px rgba(0,0,0,.38), 0 0 0 1.5px rgba(217,70,239,.28);
    text-align: center; padding: 18px 18px 26px; position: relative;
}
.flqr-wave-top {
    position: absolute; top: 0; left: 0; width: 135px; height: 95px;
    pointer-events: none; z-index: 0;
}
.flqr-wave-bot {
    position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 42px;
    pointer-events: none; z-index: 0;
}
.flqr-close {
    position: absolute; top: 14px; right: 14px; z-index: 4;
    width: 34px; height: 34px; border-radius: 50%;
    border: 1px solid rgba(15,23,42,.08); background: #f8fafc;
    color: #0f172a; font-size: 1.2rem; font-weight: 700; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(15,23,42,.08);
}
.flqr-close:active { transform: scale(.92); }
.flqr-inner { position: relative; z-index: 2; }
.flqr-av-row {
    display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px;
}
.flqr-sparks { width: 22px; height: 34px; flex: 0 0 auto; }
.flqr-av-ring {
    width: 74px; height: 74px; border-radius: 50%; padding: 3px;
    background: linear-gradient(135deg, #FF007A 0%, #B814C9 52%, #5B21FF 100%);
    box-shadow: 0 0 18px rgba(216,14,105,.35), 0 0 24px rgba(124,58,237,.22);
    display: flex; align-items: center; justify-content: center;
}
.flqr-av {
    width: 100%; height: 100%; border-radius: 50%; object-fit: cover;
    display: block; background: #1e293b; border: 2px solid #fff;
}
.flqr-name-row {
    display: flex; align-items: center; justify-content: center; gap: 10px; margin: 2px 6px 2px;
}
.flqr-line-l, .flqr-line-r {
    flex: 1; height: 2px; border-radius: 2px; max-width: 68px;
}
.flqr-line-l { background: linear-gradient(90deg, rgba(255,0,122,0) 0%, #FF007A 55%, #6D28D9 100%); }
.flqr-line-r { background: linear-gradient(90deg, #FF007A 0%, #6D28D9 55%, rgba(109,40,217,0) 100%); }
.flqr-name {
    margin: 0; font-size: 1.22rem; font-weight: 900; letter-spacing: -.3px; color: #0b0f19;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 195px;
}
.flqr-handle { margin: 0 0 14px; font-size: .86rem; font-weight: 700; color: #64748b; }
.flqr-frame-wrap {
    position: relative; display: inline-block; margin: 0 auto 14px;
}
.flqr-scan-badge {
    position: absolute; top: -11px; left: -11px; z-index: 4;
    width: 44px; height: 44px; border-radius: 50%;
    background: linear-gradient(135deg, #F40F7A 0%, #7C14E8 55%, #4F14FF 100%);
    box-shadow: 0 6px 16px rgba(124,20,232,.42);
    border: 2.5px solid #ffffff;
    display: flex; align-items: center; justify-content: center; color: #fff;
}
.flqr-scan-badge svg { width: 20px; height: 20px; display: block; }
.flqr-frame {
    position: relative; padding: 3px; border-radius: 22px;
    background: linear-gradient(135deg, #FF007A 0%, #C026D3 50%, #5B21FF 100%);
    box-shadow: 0 10px 28px rgba(168,85,247,.2), 0 0 18px rgba(255,0,122,.14);
}
.flqr-box {
    position: relative; background: #ffffff; border-radius: 19.5px; padding: 14px;
    display: flex; align-items: center; justify-content: center;
}
.flqr-box canvas { width: 188px; height: 188px; display: block; border-radius: 6px; }
.flqr-corner {
    position: absolute; width: 18px; height: 18px; pointer-events: none;
}
.flqr-c-tr { top: 8px; right: 8px; border-top: 2.8px solid #D946EF; border-right: 2.8px solid #7C3AED; border-radius: 0 6px 0 0; }
.flqr-c-bl { bottom: 8px; left: 8px; border-bottom: 2.8px solid #FF007A; border-left: 2.8px solid #FF007A; border-radius: 0 0 0 6px; }
.flqr-c-br { bottom: 8px; right: 8px; border-bottom: 2.8px solid #5B21FF; border-right: 2.8px solid #5B21FF; border-radius: 0 0 6px 0; }

.flqr-scan-cta-row {
    display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0 0 12px;
}
.flqr-scan-cta {
    flex: 1; height: 48px; border-radius: 999px; border: 0; padding: 0 12px 0 16px;
    background: linear-gradient(90deg, #F40F52 0%, #B814C9 52%, #4F14FF 100%);
    color: #ffffff; font: inherit; font-size: .96rem; font-weight: 850;
    cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 10px;
    box-shadow: 0 8px 22px rgba(184,20,201,.34), inset 0 1px 1px rgba(255,255,255,.35);
}
.flqr-scan-cta:active { transform: scale(.98); }
.flqr-scan-cta-l { display: inline-flex; align-items: center; gap: 10px; }
.flqr-scan-div { width: 1.5px; height: 20px; background: rgba(255,255,255,.42); border-radius: 2px; }
.flqr-scan-chev {
    width: 28px; height: 28px; border-radius: 50%;
    border: 1.5px solid rgba(255,255,255,.55); background: rgba(255,255,255,.14);
    display: inline-flex; align-items: center; justify-content: center; font-size: .78rem;
}

.flqr-info-pill {
    display: flex; align-items: center; gap: 10px; text-align: left;
    padding: 10px 12px; border-radius: 16px; margin: 0 0 14px;
    background: #f5f6fb; border: 1px solid rgba(124,58,237,.14);
}
.flqr-info-ico {
    width: 22px; height: 22px; border-radius: 50%; flex: 0 0 22px;
    background: linear-gradient(135deg, #7C3AED, #4F14FF); color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: .72rem; font-weight: 900;
}
.flqr-info-txt {
    margin: 0; font-size: .76rem; font-weight: 700; color: #1e293b; line-height: 1.38;
}
.flqr-info-txt b { color: #E11D74; font-weight: 850; }

.flqr-btns { display: grid; grid-template-columns: 1.08fr 1fr 1fr; gap: 9px; position: relative; z-index: 2; }
.flqr-btn {
    height: 44px; border-radius: 999px; border: 1px solid rgba(15,23,42,.12);
    background: #ffffff; color: #0f172a;
    font: inherit; font-size: .84rem; font-weight: 800; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    box-shadow: 0 4px 12px rgba(15,23,42,.06);
}
.flqr-btn.pri {
    border: 0; color: #ffffff;
    background: linear-gradient(90deg, #F40F52 0%, #8B14E8 100%);
    box-shadow: 0 6px 16px rgba(244,15,82,.32);
}
.flqr-btn:active { transform: scale(.96); }

/* --- 4. Full-Screen QR Code Scan System Page (matching 1000163074.jpg) --- */
#fl-qr-scanner-modal {
    position: fixed; inset: 0; z-index: 2147483240;
    background: #000000; color: #ffffff;
    display: none; flex-direction: column;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
}
#fl-qr-scanner-modal.open { display: flex; }
.flsc-video {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; background: #000; z-index: 0;
}
.flsc-scrim {
    position: absolute; inset: 0; z-index: 1;
    background: radial-gradient(circle at 50% 44%, rgba(0,0,0,.05) 0%, rgba(0,0,0,.58) 72%, rgba(0,0,0,.85) 100%);
    pointer-events: none;
}
.flsc-top {
    position: relative; z-index: 3;
    display: flex; align-items: center; justify-content: center;
    height: 56px; padding-top: env(safe-area-inset-top, 0px);
}
.flsc-back {
    position: absolute; left: 10px; top: calc(6px + env(safe-area-inset-top, 0px));
    width: 44px; height: 44px; border: 0; background: transparent; color: #fff;
    font-size: 1.35rem; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.flsc-title { margin: 0; font-size: 1.15rem; font-weight: 800; letter-spacing: -.1px; }
.flsc-center {
    position: relative; z-index: 3; flex: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 0 24px;
}
.flsc-frame {
    position: relative; width: min(74vw, 260px); height: min(74vw, 260px);
    overflow: hidden;
}
.flsc-br {
    position: absolute; width: 26px; height: 26px; border-color: #ffffff; border-style: solid; border-width: 0;
}
.flsc-tl { top: 0; left: 0; border-top-width: 3.5px; border-left-width: 3.5px; border-top-left-radius: 6px; }
.flsc-tr { top: 0; right: 0; border-top-width: 3.5px; border-right-width: 3.5px; border-top-right-radius: 6px; }
.flsc-bl { bottom: 0; left: 0; border-bottom-width: 3.5px; border-left-width: 3.5px; border-bottom-left-radius: 6px; }
.flsc-br2 { bottom: 0; right: 0; border-bottom-width: 3.5px; border-right-width: 3.5px; border-bottom-right-radius: 6px; }
.flsc-laser {
    position: absolute; left: 6px; right: 6px; height: 56px;
    background:
        repeating-linear-gradient(90deg, rgba(255,255,255,.22) 0 1px, transparent 1px 8px),
        repeating-linear-gradient(0deg, rgba(255,255,255,.22) 0 1px, transparent 1px 8px),
        linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.32) 88%, rgba(255,255,255,.95) 100%);
    border-bottom: 2px solid #ffffff;
    box-shadow: 0 4px 18px rgba(255,255,255,.45);
    animation: flscSweep 2.4s ease-in-out infinite;
    pointer-events: none;
}
@keyframes flscSweep {
    0%   { top: 4px; opacity: .9; }
    50%  { top: calc(100% - 60px); opacity: 1; }
    100% { top: 4px; opacity: .9; }
}
.flsc-torch {
    margin-top: 22px; border: 0; background: transparent; color: #ffffff;
    font: inherit; font-size: .95rem; font-weight: 700; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px;
}
.flsc-torch.on { color: #fde047; }
.flsc-sub {
    margin: 10px 0 0; font-size: .88rem; font-weight: 600; color: rgba(255,255,255,.78);
    text-align: center;
}
.flsc-status {
    margin: 8px 0 0; min-height: 18px; font-size: .78rem; font-weight: 700; color: #fb7185;
    text-align: center;
}
.flsc-bottom {
    position: relative; z-index: 3;
    display: flex; align-items: center; justify-content: space-around;
    padding: 16px 32px calc(30px + env(safe-area-inset-bottom, 0px));
}
.flsc-act {
    border: 0; background: transparent; color: #ffffff; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 8px; font: inherit;
}
.flsc-act-circle {
    width: 56px; height: 56px; border-radius: 50%;
    background: rgba(255,255,255,.16); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
}
.flsc-act:active .flsc-act-circle { transform: scale(.93); background: rgba(255,255,255,.26); }
.flsc-act-circle svg { width: 26px; height: 26px; display: block; }
.flsc-act span { font-size: .82rem; font-weight: 700; color: rgba(255,255,255,.88); }
`;
        document.head.appendChild(st);
    }

    function dataUrlToFile(dataUrl, filename) {
        const arr = dataUrl.split(',');
        const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8 = new Uint8Array(n);
        while (n--) u8[n] = bstr.charCodeAt(n);
        try { return new File([u8], filename, { type: mime }); } catch (e) { return new Blob([u8], { type: mime }); }
    }

    function canvasToJpegFileSync(canvas, filename, quality) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality || 0.92);
        return { file: dataUrlToFile(dataUrl, filename), dataUrl };
    }

    function drawImageCover(ctx, img, W, H) {
        const ir = (img.width || 1) / (img.height || 1);
        const cr = W / H;
        let dw = W, dh = H, dx = 0, dy = 0;
        if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; }
        else { dw = W; dh = W / ir; dy = (H - dh) / 2; }
        ctx.drawImage(img, dx, dy, dw, dh);
    }

    /* =================================================================
       1. PROFILE PHOTO CROP & ZOOM (WHITE STUDIO)
       ================================================================= */
    window.openProfilePhotoCropper = function (file, onDone) {
        if (!file) return;
        ensureStudioStyles();
        let modal = document.getElementById('fl-cropper-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'fl-cropper-modal';
            modal.innerHTML = `
                <div class="flcr-top">
                    <button type="button" class="flcr-tbtn" id="flcr-cancel">Cancel</button>
                    <h3>Crop &amp; Zoom Photo</h3>
                    <button type="button" class="flcr-tbtn" id="flcr-reset">Reset</button>
                </div>
                <div class="flcr-stage-wrap">
                    <div class="flcr-stage" id="flcr-stage">
                        <canvas id="flcr-canvas" width="640" height="640"></canvas>
                    </div>
                </div>
                <div class="flcr-controls">
                    <div class="flcr-zoom-row">
                        <button type="button" class="flcr-zbtn" id="flcr-zout" aria-label="Zoom out">&minus;</button>
                        <input type="range" class="flcr-slider" id="flcr-slider" min="1" max="3.5" step="0.01" value="1">
                        <button type="button" class="flcr-zbtn" id="flcr-zin" aria-label="Zoom in">+</button>
                        <span class="flcr-zpct" id="flcr-zpct">100%</span>
                    </div>
                    <div class="flcr-actions">
                        <button type="button" class="flcr-act-sec" id="flcr-rotate"><i class="fas fa-rotate-right"></i> Rotate</button>
                        <button type="button" class="flcr-act-pri" id="flcr-apply">Apply Photo</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        }

        const canvas = document.getElementById('flcr-canvas');
        const ctx = canvas.getContext('2d');
        const stage = document.getElementById('flcr-stage');
        const slider = document.getElementById('flcr-slider');
        const zpct = document.getElementById('flcr-zpct');

        const state = { img: null, zoom: 1, x: 0, y: 0, rot: 0, baseScale: 1 };

        function clampPan() {
            if (!state.img) return;
            const W = canvas.width, H = canvas.height;
            const swap = (state.rot % 180) !== 0;
            const iw = (swap ? state.img.height : state.img.width) * state.baseScale * state.zoom;
            const ih = (swap ? state.img.width : state.img.height) * state.baseScale * state.zoom;
            const maxX = Math.max(0, (iw - W) / 2);
            const maxY = Math.max(0, (ih - H) / 2);
            state.x = Math.max(-maxX, Math.min(maxX, state.x));
            state.y = Math.max(-maxY, Math.min(maxY, state.y));
        }

        function draw(withOverlay) {
            const W = canvas.width, H = canvas.height;
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            if (!state.img) return;
            clampPan();
            ctx.save();
            ctx.translate(W / 2 + state.x, H / 2 + state.y);
            ctx.rotate(state.rot * Math.PI / 180);
            const sc = state.baseScale * state.zoom;
            ctx.scale(sc, sc);
            ctx.drawImage(state.img, -state.img.width / 2, -state.img.height / 2);
            ctx.restore();

            if (withOverlay) {
                const r = W * 0.46;
                ctx.save();
                ctx.fillStyle = 'rgba(255,255,255,0.68)';
                ctx.beginPath();
                ctx.rect(0, 0, W, H);
                ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2, true);
                ctx.fill('evenodd');

                ctx.strokeStyle = '#D80E45';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
                ctx.stroke();

                ctx.save();
                ctx.beginPath();
                ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
                ctx.clip();
                ctx.strokeStyle = 'rgba(255,255,255,0.45)';
                ctx.lineWidth = 1.5;
                for (let i = 1; i <= 2; i++) {
                    const p = W / 2 - r + (2 * r * i) / 3;
                    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
                }
                ctx.restore();
                ctx.restore();
            }
        }

        function setZoom(z) {
            state.zoom = Math.max(1, Math.min(3.5, z));
            slider.value = state.zoom.toFixed(2);
            zpct.textContent = Math.round(state.zoom * 100) + '%';
            draw(true);
        }

        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            state.img = img;
            const minDim = Math.min(img.width, img.height) || 1;
            state.baseScale = canvas.width / minDim;
            state.zoom = 1; state.x = 0; state.y = 0; state.rot = 0;
            setZoom(1);
            modal.classList.add('open');
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            if (typeof onDone === 'function') onDone(file);
        };
        img.src = objectUrl;

        let dragging = false, lx = 0, ly = 0, pinchDist = 0, pinchStartZoom = 1;
        function toCanvasScale(dx) {
            const rect = stage.getBoundingClientRect();
            return dx * (canvas.width / Math.max(1, rect.width));
        }

        const onDown = (e) => {
            if (e.touches && e.touches.length === 2) {
                dragging = false;
                pinchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                pinchStartZoom = state.zoom;
                return;
            }
            const pt = e.touches ? e.touches[0] : e;
            dragging = true; lx = pt.clientX; ly = pt.clientY;
        };
        const onMove = (e) => {
            if (e.touches && e.touches.length === 2 && pinchDist > 0) {
                if (e.cancelable) e.preventDefault();
                const d = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                setZoom(pinchStartZoom * (d / pinchDist));
                return;
            }
            if (!dragging) return;
            if (e.cancelable) e.preventDefault();
            const pt = e.touches ? e.touches[0] : e;
            state.x += toCanvasScale(pt.clientX - lx);
            state.y += toCanvasScale(pt.clientY - ly);
            lx = pt.clientX; ly = pt.clientY;
            draw(true);
        };
        const onUp = () => { dragging = false; pinchDist = 0; };
        const onWheel = (e) => { e.preventDefault(); setZoom(state.zoom + (e.deltaY < 0 ? 0.12 : -0.12)); };

        stage.onmousedown = onDown;
        stage.ontouchstart = onDown;
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
        stage.onwheel = onWheel;

        function cleanup() {
            modal.classList.remove('open');
            URL.revokeObjectURL(objectUrl);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchend', onUp);
        }

        slider.oninput = () => setZoom(parseFloat(slider.value));
        document.getElementById('flcr-zout').onclick = () => setZoom(state.zoom - 0.15);
        document.getElementById('flcr-zin').onclick = () => setZoom(state.zoom + 0.15);
        document.getElementById('flcr-rotate').onclick = () => { state.rot = (state.rot + 90) % 360; draw(true); };
        document.getElementById('flcr-reset').onclick = () => { state.x = 0; state.y = 0; state.rot = 0; setZoom(1); };
        document.getElementById('flcr-cancel').onclick = () => cleanup();
        document.getElementById('flcr-apply').onclick = () => {
            const out = document.createElement('canvas');
            out.width = 640; out.height = 640;
            const octx = out.getContext('2d');
            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, 640, 640);
            octx.save();
            const boost = 1 / 0.92;
            octx.translate(320 + state.x * boost, 320 + state.y * boost);
            octx.rotate(state.rot * Math.PI / 180);
            const sc = state.baseScale * state.zoom * boost;
            octx.scale(sc, sc);
            octx.drawImage(state.img, -state.img.width / 2, -state.img.height / 2);
            octx.restore();
            const res = canvasToJpegFileSync(out, 'avatar_cropped.jpg', 0.92);
            cleanup();
            if (typeof onDone === 'function') onDone(res.file, res.dataUrl);
        };
    };

    /* =================================================================
       2. CHANNEL BACKGROUND / COVER STUDIO (EXACT 1.8:1 RATIO + DIRECT SAVE)
       ================================================================= */
    const COVER_TEMPLATES = [
        { id: 'aurora', name: 'Aurora Mesh', draw(ctx, W, H) {
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e1b4b');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
            [[W*.22, H*.35, W*.42, 'rgba(216,14,69,.58)'], [W*.78, H*.3, W*.45, 'rgba(56,189,248,.52)'], [W*.52, H*.85, W*.4, 'rgba(168,85,247,.5)']].forEach(([x,y,r,c]) => {
                const g = ctx.createRadialGradient(x,y,0,x,y,r);
                g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
            });
        }},
        { id: 'flaynity-pulse', name: 'Flaynity Pulse', draw(ctx, W, H) {
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#D80E45'); bg.addColorStop(.55, '#ff3366'); bg.addColorStop(1, '#ff7a45');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(255,255,255,.12)';
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(0, H * (.35 + i * .15));
                ctx.bezierCurveTo(W*.33, H*(.15 + i*.12), W*.66, H*(.75 + i*.08), W, H*(.3 + i*.14));
                ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
            }
        }},
        { id: 'midnight-grid', name: 'Midnight Grid', draw(ctx, W, H) {
            const bg = ctx.createLinearGradient(0, 0, 0, H);
            bg.addColorStop(0, '#090d16'); bg.addColorStop(1, '#111827');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
            ctx.strokeStyle = 'rgba(56,189,248,.22)'; ctx.lineWidth = 2;
            const step = Math.round(W / 20);
            for (let x = 0; x <= W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
            for (let y = 0; y <= H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
            const g = ctx.createRadialGradient(W*.5, H*.4, 0, W*.5, H*.4, W*.55);
            g.addColorStop(0, 'rgba(14,165,233,.34)'); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }},
        { id: 'golden-luxury', name: 'Golden Luxury', draw(ctx, W, H) {
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#141414'); bg.addColorStop(1, '#262118');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
            const gold = ctx.createLinearGradient(0, 0, W, H);
            gold.addColorStop(0, 'rgba(245,158,11,.08)'); gold.addColorStop(.5, 'rgba(251,191,36,.35)'); gold.addColorStop(1, 'rgba(217,119,6,.1)');
            ctx.fillStyle = gold;
            ctx.beginPath(); ctx.moveTo(W*.15, 0); ctx.lineTo(W*.55, 0); ctx.lineTo(W*.25, H); ctx.lineTo(-W*.1, H); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(W*.68, 0); ctx.lineTo(W*.9, 0); ctx.lineTo(W*.6, H); ctx.lineTo(W*.38, H); ctx.closePath(); ctx.fill();
        }},
        { id: 'ocean-waves', name: 'Oceanic Waves', draw(ctx, W, H) {
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#0284c7'); bg.addColorStop(.5, '#0d9488'); bg.addColorStop(1, '#0f766e');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
            [0.25, 0.45, 0.65].forEach((k, i) => {
                ctx.fillStyle = `rgba(255,255,255,${0.09 + i*0.05})`;
                ctx.beginPath();
                ctx.moveTo(0, H*k);
                ctx.quadraticCurveTo(W*.25, H*(k-.18), W*.5, H*k);
                ctx.quadraticCurveTo(W*.75, H*(k+.18), W, H*(k-.05));
                ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
            });
        }},
        { id: 'sunset-bokeh', name: 'Sunset Bokeh', draw(ctx, W, H) {
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#4c1d95'); bg.addColorStop(.5, '#be185d'); bg.addColorStop(1, '#f97316');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
            [[.15,.25,.14],[.38,.65,.18],[.65,.3,.16],[.85,.7,.2],[.5,.18,.1]].forEach(([x,y,r]) => {
                ctx.fillStyle = 'rgba(255,255,255,.14)';
                ctx.beginPath(); ctx.arc(W*x, H*y, W*r, 0, Math.PI*2); ctx.fill();
            });
        }},
        { id: 'minimal-zen', name: 'Minimalist Zen', draw(ctx, W, H) {
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#f8fafc'); bg.addColorStop(1, '#e2e8f0');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
            ctx.strokeStyle = 'rgba(216,14,69,.22)'; ctx.lineWidth = Math.max(4, W * .006);
            [0.22, 0.36, 0.5].forEach(r => { ctx.beginPath(); ctx.arc(W*.82, H*.5, W*r, 0, Math.PI*2); ctx.stroke(); });
            ctx.fillStyle = 'rgba(216,14,69,.14)';
            ctx.beginPath(); ctx.arc(W*.16, H*.78, W*.16, 0, Math.PI*2); ctx.fill();
        }},
        { id: 'cyber-neon', name: 'Cyber Neon', draw(ctx, W, H) {
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#09090b'); bg.addColorStop(1, '#1e1b4b');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(236,72,153,.35)';
            ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W*.45, 0); ctx.lineTo(W*.65, 0); ctx.lineTo(W*.2, H); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(34,211,238,.32)';
            ctx.beginPath(); ctx.moveTo(W*.48, H); ctx.lineTo(W*.92, 0); ctx.lineTo(W, 0); ctx.lineTo(W*.68, H); ctx.closePath(); ctx.fill();
        }}
    ];

    const COVER_GRADIENTS = [
        { id: 'rose',     name: 'Flaynity Rose',  c1: '#D80E45', c2: '#FF6B6B', ang: 135 },
        { id: 'sunset',   name: 'Sunset Glow',    c1: '#F97316', c2: '#EC4899', ang: 135 },
        { id: 'ocean',    name: 'Ocean Blue',     c1: '#0284C7', c2: '#2DD4BF', ang: 135 },
        { id: 'violet',   name: 'Royal Violet',   c1: '#4F46E5', c2: '#C026D3', ang: 135 },
        { id: 'emerald',  name: 'Emerald Mint',   c1: '#059669', c2: '#34D399', ang: 135 },
        { id: 'midnight', name: 'Midnight Slate', c1: '#0F172A', c2: '#334155', ang: 135 },
        { id: 'peach',    name: 'Peach Sorbet',   c1: '#FB7185', c2: '#FBBF24', ang: 135 },
        { id: 'crimson',  name: 'Crimson Night',  c1: '#18181B', c2: '#BE123C', ang: 135 },
        { id: 'sky',      name: 'Electric Sky',   c1: '#2563EB', c2: '#38BDF8', ang: 90  },
        { id: 'cotton',   name: 'Cotton Candy',   c1: '#8B5CF6', c2: '#F472B6', ang: 45  }
    ];

    function renderGradientCanvas(c1, c2, angleDeg, W, H) {
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        const rad = (angleDeg - 90) * Math.PI / 180;
        const cx = W / 2, cy = H / 2;
        const len = Math.hypot(W, H) / 2;
        const g = ctx.createLinearGradient(
            cx - Math.cos(rad) * len, cy - Math.sin(rad) * len,
            cx + Math.cos(rad) * len, cy + Math.sin(rad) * len
        );
        g.addColorStop(0, c1);
        g.addColorStop(1, c2);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        return cv;
    }

    function renderTemplateCanvas(tpl, W, H) {
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        tpl.draw(cv.getContext('2d'), W, H);
        return cv;
    }

    function normalizePhotoCoverFile(file) {
        return new Promise((resolve) => {
            const img = new Image();
            const objUrl = URL.createObjectURL(file);
            img.onload = () => {
                try {
                    const cv = document.createElement('canvas');
                    cv.width = 1620; cv.height = 900; // Exact 1.8:1 ratio
                    drawImageCover(cv.getContext('2d'), img, 1620, 900);
                    const res = canvasToJpegFileSync(cv, 'channel_cover_photo.jpg', 0.92);
                    URL.revokeObjectURL(objUrl);
                    resolve(res);
                } catch (e) {
                    URL.revokeObjectURL(objUrl);
                    const fr = new FileReader();
                    fr.onload = () => resolve({ file, dataUrl: fr.result });
                    fr.readAsDataURL(file);
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(objUrl);
                const fr = new FileReader();
                fr.onload = () => resolve({ file, dataUrl: fr.result });
                fr.readAsDataURL(file);
            };
            img.src = objUrl;
        });
    }

    window.openChannelCoverPicker = function (opts) {
        opts = opts || {};
        ensureStudioStyles();
        let modal = document.getElementById('fl-cover-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'fl-cover-modal';
            modal.innerHTML = `
                <div class="flcv-sheet" onclick="event.stopPropagation()">
                    <div class="flcv-head">
                        <h3>Channel Background / Cover</h3>
                        <button type="button" class="flcv-close" id="flcv-close">&times;</button>
                    </div>
                    <div class="flcv-preview-wrap">
                        <div class="flcv-preview-card">
                            <img id="flcv-prev-img" alt="Cover preview" src="">
                            <div class="flcv-preview-fade"></div>
                            <div class="flcv-preview-meta">
                                <div class="flcv-preview-ch">
                                    <img class="flcv-preview-av" id="flcv-prev-av" alt="" src="">
                                    <span id="flcv-prev-name">Your Channel</span>
                                </div>
                                <span class="flcv-preview-badge">Live Preview</span>
                            </div>
                        </div>
                    </div>
                    <div class="flcv-tabs">
                        <button type="button" class="flcv-tab active" data-ctab="templates">Templates</button>
                        <button type="button" class="flcv-tab" data-ctab="gradients">Gradients</button>
                        <button type="button" class="flcv-tab" data-ctab="photo">Photo</button>
                    </div>
                    <div class="flcv-body" id="flcv-body"></div>
                    <div class="flcv-foot">
                        <button type="button" class="flcv-apply" id="flcv-apply">Apply Cover</button>
                    </div>
                </div>`;
            modal.onclick = () => modal.classList.remove('open');
            document.body.appendChild(modal);
        }

        const prevImg = document.getElementById('flcv-prev-img');
        const prevAv = document.getElementById('flcv-prev-av');
        const prevName = document.getElementById('flcv-prev-name');
        const body = document.getElementById('flcv-body');
        const applyBtn = document.getElementById('flcv-apply');

        prevName.textContent = opts.channelName || (typeof currentChannelData !== 'undefined' && currentChannelData && currentChannelData.channelName) || 'Your Channel';
        const avSrc = opts.avatarUrl || (typeof currentChannelData !== 'undefined' && currentChannelData && currentChannelData.avatarUrl) || '';
        if (avSrc) { prevAv.src = avSrc; prevAv.style.display = 'block'; }
        else { prevAv.style.display = 'none'; }

        let activeTab = 'templates';
        let selection = { kind: 'template', id: COVER_TEMPLATES[0].id, c1: '#D80E45', c2: '#4F46E5', ang: 135, file: null, previewUrl: '' };

        function updateLivePreview() {
            if (selection.kind === 'photo' && selection.previewUrl) {
                prevImg.src = selection.previewUrl;
                return;
            }
            if (selection.kind === 'template') {
                const tpl = COVER_TEMPLATES.find(t => t.id === selection.id) || COVER_TEMPLATES[0];
                prevImg.src = renderTemplateCanvas(tpl, 648, 360).toDataURL('image/jpeg', 0.88);
                return;
            }
            if (selection.kind === 'gradient') {
                prevImg.src = renderGradientCanvas(selection.c1, selection.c2, selection.ang, 648, 360).toDataURL('image/jpeg', 0.88);
            }
        }

        if (opts.currentUrl) prevImg.src = opts.currentUrl;
        else updateLivePreview();

        function renderTab() {
            modal.querySelectorAll('.flcv-tab').forEach(b => b.classList.toggle('active', b.dataset.ctab === activeTab));
            if (activeTab === 'templates') {
                body.innerHTML = `<div class="flcv-grid">${COVER_TEMPLATES.map(t => {
                    const thumb = renderTemplateCanvas(t, 324, 180).toDataURL('image/jpeg', 0.82);
                    const on = selection.kind === 'template' && selection.id === t.id;
                    return `<button type="button" class="flcv-tile${on ? ' selected' : ''}" data-tpl="${t.id}"><img src="${thumb}" alt="${t.name}"><span class="flcv-tile-lbl">${t.name}</span></button>`;
                }).join('')}</div>`;
                body.querySelectorAll('[data-tpl]').forEach(btn => {
                    btn.onclick = () => {
                        selection = { ...selection, kind: 'template', id: btn.dataset.tpl };
                        body.querySelectorAll('.flcv-tile').forEach(x => x.classList.remove('selected'));
                        btn.classList.add('selected');
                        updateLivePreview();
                    };
                });
            } else if (activeTab === 'gradients') {
                body.innerHTML = `
                    <div class="flcv-grid">${COVER_GRADIENTS.map(g => {
                        const on = selection.kind === 'gradient' && selection.id === g.id;
                        return `<button type="button" class="flcv-tile${on ? ' selected' : ''}" data-grad="${g.id}" style="background:linear-gradient(${g.ang}deg,${g.c1},${g.c2});"><span class="flcv-tile-lbl">${g.name}</span></button>`;
                    }).join('')}</div>
                    <div class="flcv-custom-grad">
                        <div class="flcv-cg-title">Custom Gradient</div>
                        <div class="flcv-cg-row">
                            <label class="flcv-color-pill">Color 1 <input type="color" id="flcv-c1" value="${selection.c1}"></label>
                            <label class="flcv-color-pill">Color 2 <input type="color" id="flcv-c2" value="${selection.c2}"></label>
                        </div>
                        <div class="flcv-angles">
                            ${[0, 45, 90, 135, 180].map(a => `<button type="button" class="flcv-ang${selection.ang === a ? ' active' : ''}" data-ang="${a}">${a}&deg;</button>`).join('')}
                        </div>
                    </div>`;
                body.querySelectorAll('[data-grad]').forEach(btn => {
                    btn.onclick = () => {
                        const g = COVER_GRADIENTS.find(x => x.id === btn.dataset.grad);
                        if (!g) return;
                        selection = { ...selection, kind: 'gradient', id: g.id, c1: g.c1, c2: g.c2, ang: g.ang };
                        document.getElementById('flcv-c1').value = g.c1;
                        document.getElementById('flcv-c2').value = g.c2;
                        body.querySelectorAll('.flcv-tile').forEach(x => x.classList.remove('selected'));
                        btn.classList.add('selected');
                        body.querySelectorAll('.flcv-ang').forEach(x => x.classList.toggle('active', Number(x.dataset.ang) === g.ang));
                        updateLivePreview();
                    };
                });
                const syncCustom = () => {
                    selection = { ...selection, kind: 'gradient', id: 'custom', c1: document.getElementById('flcv-c1').value, c2: document.getElementById('flcv-c2').value };
                    body.querySelectorAll('.flcv-tile').forEach(x => x.classList.remove('selected'));
                    updateLivePreview();
                };
                document.getElementById('flcv-c1').oninput = syncCustom;
                document.getElementById('flcv-c2').oninput = syncCustom;
                body.querySelectorAll('.flcv-ang').forEach(btn => {
                    btn.onclick = () => {
                        selection.ang = Number(btn.dataset.ang);
                        selection.kind = 'gradient';
                        body.querySelectorAll('.flcv-ang').forEach(x => x.classList.toggle('active', x === btn));
                        updateLivePreview();
                    };
                });
            } else {
                body.innerHTML = `
                    <div class="flcv-photo-box" id="flcv-pick-photo">
                        <i class="fas fa-images"></i>
                        <p>Choose Photo from Gallery</p>
                        <span>Opens Custom Media Picker with exact 1.8:1 live preview</span>
                    </div>
                    <input type="file" id="flcv-photo-fallback" accept="image/*" style="display:none;">`;
                const onPhotoPicked = async (f) => {
                    if (!f) return;
                    const res = await normalizePhotoCoverFile(f);
                    selection = { ...selection, kind: 'photo', file: res.file, previewUrl: res.dataUrl };
                    updateLivePreview();
                };
                document.getElementById('flcv-pick-photo').onclick = () => {
                    if (typeof window.openMediaPicker === 'function') {
                        window.openMediaPicker('edit-banner', onPhotoPicked);
                    } else {
                        document.getElementById('flcv-photo-fallback').click();
                    }
                };
                document.getElementById('flcv-photo-fallback').onchange = (e) => onPhotoPicked(e.target.files && e.target.files[0]);
            }
        }

        modal.querySelectorAll('.flcv-tab').forEach(btn => {
            btn.onclick = () => { activeTab = btn.dataset.ctab; renderTab(); };
        });
        document.getElementById('flcv-close').onclick = () => modal.classList.remove('open');
        applyBtn.textContent = 'Apply Cover';
        applyBtn.disabled = false;
        applyBtn.onclick = async () => {
            if (applyBtn.disabled) return;
            applyBtn.disabled = true;
            applyBtn.textContent = 'Saving Cover...';
            try {
                let res;
                if (selection.kind === 'photo' && selection.file) {
                    res = { file: selection.file, dataUrl: selection.previewUrl };
                } else if (selection.kind === 'gradient') {
                    const cv = renderGradientCanvas(selection.c1, selection.c2, selection.ang, 1620, 900);
                    res = canvasToJpegFileSync(cv, `channel_cover_${selection.id || 'custom'}.jpg`, 0.92);
                } else {
                    const tpl = COVER_TEMPLATES.find(t => t.id === selection.id) || COVER_TEMPLATES[0];
                    const cv = renderTemplateCanvas(tpl, 1620, 900);
                    res = canvasToJpegFileSync(cv, `channel_cover_${tpl.id}.jpg`, 0.92);
                }
                if (typeof opts.onApply === 'function') {
                    await Promise.resolve(opts.onApply(res.file, res.dataUrl));
                }
                modal.classList.remove('open');
            } catch (err) {
                console.error('Apply cover failed:', err);
                if (typeof showNotification === 'function') showNotification('Failed to save cover. Please try again.', 'error');
            } finally {
                applyBtn.disabled = false;
                applyBtn.textContent = 'Apply Cover';
            }
        };

        renderTab();
        modal.classList.add('open');
    };

    /* =================================================================
       3. PURE-JS ISO/IEC 18004 QR CODE ENCODER (Byte mode, EC Level M, V1-V10)
       ================================================================= */
    const QR = (function () {
        const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
        let x = 1;
        for (let i = 0; i < 255; i++) {
            EXP[i] = x; LOG[x] = i;
            x <<= 1; if (x & 256) x ^= 285;
        }
        for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

        function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }
        function rsGenPoly(deg) {
            let p = [1];
            for (let i = 0; i < deg; i++) {
                const next = new Array(p.length + 1).fill(0);
                for (let j = 0; j < p.length; j++) {
                    next[j] ^= p[j];
                    next[j + 1] ^= gfMul(p[j], EXP[i]);
                }
                p = next;
            }
            return p;
        }
        function rsEncode(data, ecLen) {
            const gen = rsGenPoly(ecLen);
            const res = new Uint8Array(ecLen);
            for (let i = 0; i < data.length; i++) {
                const factor = data[i] ^ res[0];
                for (let j = 0; j < ecLen - 1; j++) res[j] = res[j + 1];
                res[ecLen - 1] = 0;
                if (factor !== 0) {
                    for (let j = 0; j < ecLen; j++) res[j] ^= gfMul(gen[j + 1], factor);
                }
            }
            return res;
        }

        const VER_M = [
            null,
            [26,  10, 1, 16, 0, 0, []],
            [44,  16, 1, 28, 0, 0, [6, 18]],
            [70,  26, 1, 44, 0, 0, [6, 22]],
            [100, 18, 2, 32, 0, 0, [6, 26]],
            [134, 24, 2, 43, 0, 0, [6, 30]],
            [172, 16, 4, 27, 0, 0, [6, 34]],
            [196, 18, 4, 31, 0, 0, [6, 22, 38]],
            [242, 22, 2, 38, 2, 39, [6, 24, 42]],
            [292, 22, 3, 36, 2, 37, [6, 26, 46]],
            [346, 26, 4, 43, 1, 44, [6, 28, 50]]
        ];

        function bchFormat(mask) {
            const data = (0b00 << 3) | mask;
            let rem = data << 10;
            for (let i = 4; i >= 0; i--) {
                if ((rem >>> (i + 10)) & 1) rem ^= (0x537 << i);
            }
            return ((data << 10) | rem) ^ 0x5412;
        }
        function bchVersion(ver) {
            let rem = ver << 12;
            for (let i = 5; i >= 0; i--) {
                if ((rem >>> (i + 12)) & 1) rem ^= (0x1F25 << i);
            }
            return (ver << 12) | rem;
        }

        function encode(text) {
            const bytes = new TextEncoder().encode(String(text));
            let ver = 0;
            for (let v = 1; v < VER_M.length; v++) {
                const cap = VER_M[v][2] * VER_M[v][3] + VER_M[v][4] * VER_M[v][5];
                const hdrBytes = (v <= 9) ? 2 : 3;
                if (bytes.length + hdrBytes <= cap) { ver = v; break; }
            }
            if (!ver) ver = VER_M.length - 1;
            const [totalCW, ecPerBlk, b1, d1, b2, d2, aligns] = VER_M[ver];
            const dataCap = b1 * d1 + b2 * d2;

            const bits = [];
            const pushBits = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
            pushBits(0b0100, 4);
            pushBits(bytes.length, ver <= 9 ? 8 : 16);
            for (let i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);
            const maxBits = dataCap * 8;
            for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
            while (bits.length % 8 !== 0) bits.push(0);
            const pads = [0xEC, 0x11];
            let pi = 0;
            while (bits.length < maxBits) { pushBits(pads[pi++ & 1], 8); }

            const dataCW = new Uint8Array(dataCap);
            for (let i = 0; i < dataCap; i++) {
                let b = 0;
                for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
                dataCW[i] = b;
            }

            const blocks = [], ecs = [];
            let off = 0;
            for (let i = 0; i < b1; i++) {
                const blk = dataCW.slice(off, off + d1); off += d1;
                blocks.push(blk); ecs.push(rsEncode(blk, ecPerBlk));
            }
            for (let i = 0; i < b2; i++) {
                const blk = dataCW.slice(off, off + d2); off += d2;
                blocks.push(blk); ecs.push(rsEncode(blk, ecPerBlk));
            }

            const stream = [];
            const maxD = Math.max(d1, d2);
            for (let i = 0; i < maxD; i++) {
                for (let b = 0; b < blocks.length; b++) if (i < blocks[b].length) stream.push(blocks[b][i]);
            }
            for (let i = 0; i < ecPerBlk; i++) {
                for (let b = 0; b < ecs.length; b++) stream.push(ecs[b][i]);
            }

            const N = ver * 4 + 17;
            const mod = Array.from({ length: N }, () => new Int8Array(N));
            const fn = Array.from({ length: N }, () => new Uint8Array(N));

            function setFn(r, c, v) {
                if (r < 0 || c < 0 || r >= N || c >= N) return;
                mod[r][c] = v ? 1 : 0; fn[r][c] = 1;
            }
            function drawFinder(r, c) {
                for (let dr = -1; dr <= 7; dr++) {
                    for (let dc = -1; dc <= 7; dc++) {
                        const rr = r + dr, cc = c + dc;
                        if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
                        const on = (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) &&
                            (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
                        setFn(rr, cc, on);
                    }
                }
            }
            drawFinder(0, 0); drawFinder(0, N - 7); drawFinder(N - 7, 0);

            for (let i = 8; i < N - 8; i++) {
                setFn(6, i, (i & 1) === 0);
                setFn(i, 6, (i & 1) === 0);
            }
            setFn(N - 8, 8, 1);

            for (let i = 0; i < aligns.length; i++) {
                for (let j = 0; j < aligns.length; j++) {
                    const r = aligns[i], c = aligns[j];
                    if (fn[r][c]) continue;
                    for (let dr = -2; dr <= 2; dr++) {
                        for (let dc = -2; dc <= 2; dc++) {
                            const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
                            setFn(r + dr, c + dc, on);
                        }
                    }
                }
            }

            for (let i = 0; i < 9; i++) {
                if (i !== 6) { fn[8][i] = 1; fn[i][8] = 1; }
            }
            for (let i = N - 8; i < N; i++) { fn[8][i] = 1; fn[i][8] = 1; }

            if (ver >= 7) {
                const vbits = bchVersion(ver);
                for (let i = 0; i < 18; i++) {
                    const b = (vbits >>> i) & 1;
                    const a = Math.floor(i / 3), k = N - 11 + (i % 3);
                    setFn(a, k, b); setFn(k, a, b);
                }
            }

            let bitIdx = 0;
            const totalBits = stream.length * 8;
            for (let col = N - 1; col >= 1; col -= 2) {
                if (col === 6) col--;
                const up = (((N - 1 - col) >> 1) & 1) === 0;
                for (let step = 0; step < N; step++) {
                    const r = up ? (N - 1 - step) : step;
                    for (let dc = 0; dc < 2; dc++) {
                        const c = col - dc;
                        if (fn[r][c]) continue;
                        let bit = 0;
                        if (bitIdx < totalBits) bit = (stream[bitIdx >> 3] >>> (7 - (bitIdx & 7))) & 1;
                        bitIdx++;
                        mod[r][c] = bit;
                    }
                }
            }

            const maskFn = [
                (r, c) => ((r + c) & 1) === 0,
                (r, c) => (r & 1) === 0,
                (r, c) => (c % 3) === 0,
                (r, c) => ((r + c) % 3) === 0,
                (r, c) => (((r >> 1) + Math.floor(c / 3)) & 1) === 0,
                (r, c) => ((r * c) & 1) + ((r * c) % 3) === 0,
                (r, c) => ((((r * c) & 1) + ((r * c) % 3)) & 1) === 0,
                (r, c) => ((((r + c) & 1) + ((r * c) % 3)) & 1) === 0
            ];

            let bestPen = Infinity, bestMat = null;
            for (let m = 0; m < 8; m++) {
                const mat = Array.from({ length: N }, (_, r) => {
                    const row = new Uint8Array(N);
                    for (let c = 0; c < N; c++) row[c] = fn[r][c] ? mod[r][c] : (mod[r][c] ^ (maskFn[m](r, c) ? 1 : 0));
                    return row;
                });
                const fmt = bchFormat(m);
                const coords1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
                const coords2 = [[N-1,8],[N-2,8],[N-3,8],[N-4,8],[N-5,8],[N-6,8],[N-7,8],[8,N-8],[8,N-7],[8,N-6],[8,N-5],[8,N-4],[8,N-3],[8,N-2],[8,N-1]];
                for (let i = 0; i < 15; i++) {
                    const b = (fmt >>> (14 - i)) & 1;
                    mat[coords1[i][0]][coords1[i][1]] = b;
                    mat[coords2[i][0]][coords2[i][1]] = b;
                }
                let pen = 0, dark = 0;
                for (let r = 0; r < N; r++) {
                    let runR = 1, runC = 1;
                    for (let c = 0; c < N; c++) {
                        dark += mat[r][c];
                        if (c > 0) {
                            if (mat[r][c] === mat[r][c - 1]) { runR++; if (runR === 5) pen += 3; else if (runR > 5) pen++; } else runR = 1;
                            if (mat[c][r] === mat[c - 1][r]) { runC++; if (runC === 5) pen += 3; else if (runC > 5) pen++; } else runC = 1;
                        }
                        if (r > 0 && c > 0 && mat[r][c] === mat[r-1][c] && mat[r][c] === mat[r][c-1] && mat[r][c] === mat[r-1][c-1]) pen += 3;
                    }
                }
                pen += Math.floor(Math.abs(dark * 100 / (N * N) - 50) / 5) * 10;
                if (pen < bestPen) { bestPen = pen; bestMat = mat; }
            }
            return bestMat;
        }

        return { encode };
    })();

    window.flaynityGenerateQRMatrix = QR.encode;

    function drawQRToCanvas(canvas, text) {
        const mat = QR.encode(text);
        const N = mat.length;
        const quiet = 2;
        const total = N + quiet * 2;
        const size = canvas.width;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        const cell = size / total;
        ctx.fillStyle = '#09090b';
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                if (mat[r][c]) {
                    const x = Math.floor((c + quiet) * cell);
                    const y = Math.floor((r + quiet) * cell);
                    const w = Math.ceil((c + quiet + 1) * cell) - x;
                    const h = Math.ceil((r + quiet + 1) * cell) - y;
                    ctx.fillRect(x, y, w, h);
                }
            }
        }
    }

    window.getChannelShareUrl = function (ch) {
        const uid = (ch && (ch.uid || ch.userId)) || (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid) || '';
        const handle = (ch && ch.handle) ? String(ch.handle).replace(/^@/, '') : '';
        const params = [];
        if (uid) params.push('channel=' + encodeURIComponent(uid));
        if (handle) params.push('handle=' + encodeURIComponent(handle));
        return 'https://flaynity.com/' + (params.length ? '?' + params.join('&') : '');
    };

    const SPARKS_L = `<svg class="flqr-sparks" viewBox="0 0 24 36" fill="none"><line x1="18" y1="6" x2="8" y2="3" stroke="#EC4899" stroke-width="2.6" stroke-linecap="round"/><line x1="17" y1="18" x2="5" y2="18" stroke="#A855F7" stroke-width="2.6" stroke-linecap="round"/><line x1="18" y1="30" x2="8" y2="33" stroke="#7C3AED" stroke-width="2.6" stroke-linecap="round"/></svg>`;
    const SPARKS_R = `<svg class="flqr-sparks" viewBox="0 0 24 36" fill="none"><line x1="6" y1="6" x2="16" y2="3" stroke="#EC4899" stroke-width="2.6" stroke-linecap="round"/><line x1="7" y1="18" x2="19" y2="18" stroke="#A855F7" stroke-width="2.6" stroke-linecap="round"/><line x1="6" y1="30" x2="16" y2="33" stroke="#7C3AED" stroke-width="2.6" stroke-linecap="round"/></svg>`;

    window.openChannelQRModal = function (targetChannel) {
        ensureStudioStyles();
        if (typeof playUI === 'function') playUI('click');
        const ch = targetChannel || window.__activeViewedChannel || (typeof currentChannelData !== 'undefined' ? currentChannelData : null);
        if (!ch) {
            if (typeof showNotification === 'function') showNotification('Channel info not loaded yet.', 'error');
            return;
        }
        let modal = document.getElementById('fl-qr-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'fl-qr-modal';
            modal.innerHTML = `
                <div class="flqr-card" onclick="event.stopPropagation()">
                    <svg class="flqr-wave-top" viewBox="0 0 140 100" preserveAspectRatio="none"><defs><linearGradient id="flqrWT" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FF007A"/><stop offset="100%" stop-color="#7C14E8"/></linearGradient></defs><path d="M0,0 L125,0 C75,18 32,48 0,92 Z" fill="url(#flqrWT)" opacity=".92"/></svg>
                    <svg class="flqr-wave-bot" viewBox="0 0 360 44" preserveAspectRatio="none"><defs><linearGradient id="flqrWB" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#FF007A"/><stop offset="52%" stop-color="#A21CAF"/><stop offset="100%" stop-color="#3B00FF"/></linearGradient></defs><path d="M0,12 C95,44 215,-2 360,22 L360,44 L0,44 Z" fill="url(#flqrWB)"/></svg>
                    <button type="button" class="flqr-close" id="flqr-close" aria-label="Close">&times;</button>
                    <div class="flqr-inner">
                        <div class="flqr-av-row">
                            ${SPARKS_L}
                            <div class="flqr-av-ring"><img class="flqr-av" id="flqr-av" alt="Avatar" src=""></div>
                            ${SPARKS_R}
                        </div>
                        <div class="flqr-name-row">
                            <span class="flqr-line-l"></span>
                            <h3 class="flqr-name" id="flqr-name">Channel</h3>
                            <span class="flqr-line-r"></span>
                        </div>
                        <p class="flqr-handle" id="flqr-handle">@handle</p>

                        <div class="flqr-frame-wrap">
                            <div class="flqr-scan-badge" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none"/></svg>
                            </div>
                            <div class="flqr-frame">
                                <div class="flqr-box">
                                    <span class="flqr-corner flqr-c-tr"></span>
                                    <span class="flqr-corner flqr-c-bl"></span>
                                    <span class="flqr-corner flqr-c-br"></span>
                                    <canvas id="flqr-canvas" width="420" height="420"></canvas>
                                </div>
                            </div>
                        </div>

                        <div class="flqr-scan-cta-row">
                            ${SPARKS_L}
                            <button type="button" class="flqr-scan-cta" id="flqr-open-scanner">
                                <span class="flqr-scan-cta-l">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
                                    <span class="flqr-scan-div"></span>
                                </span>
                                <span>QR Scan System</span>
                                <span class="flqr-scan-chev"><i class="fas fa-chevron-right"></i></span>
                            </button>
                            ${SPARKS_R}
                        </div>

                        <div class="flqr-info-pill">
                            <span class="flqr-info-ico">i</span>
                            <p class="flqr-info-txt">Scan this unique QR code with any camera to open this <b>Flaynity</b> channel instantly.</p>
                        </div>

                        <div class="flqr-btns">
                            <button type="button" class="flqr-btn pri" id="flqr-download"><i class="fas fa-download"></i> Save</button>
                            <button type="button" class="flqr-btn" id="flqr-share"><i class="fas fa-share-nodes"></i> Share</button>
                            <button type="button" class="flqr-btn" id="flqr-copy"><i class="fas fa-link"></i> Copy</button>
                        </div>
                    </div>
                </div>`;
            modal.onclick = () => modal.classList.remove('open');
            document.body.appendChild(modal);
        }

        const url = window.getChannelShareUrl(ch);
        const av = document.getElementById('flqr-av');
        av.src = ch.avatarUrl || ch.channelImageUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=300&auto=format&fit=crop';
        document.getElementById('flqr-name').textContent = ch.channelName || 'Flaynity Channel';
        document.getElementById('flqr-handle').textContent = '@' + String(ch.handle || 'channel').replace(/^@/, '');

        const qrCanvas = document.getElementById('flqr-canvas');
        drawQRToCanvas(qrCanvas, url);

        document.getElementById('flqr-close').onclick = () => modal.classList.remove('open');
        document.getElementById('flqr-open-scanner').onclick = () => {
            modal.classList.remove('open');
            window.openQRScannerPage();
        };
        document.getElementById('flqr-copy').onclick = () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(() => {
                    if (typeof showNotification === 'function') showNotification('Channel link copied!', 'success');
                }).catch(() => {});
            } else {
                const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select();
                try { document.execCommand('copy'); } catch (e) {}
                ta.remove();
                if (typeof showNotification === 'function') showNotification('Channel link copied!', 'success');
            }
        };
        document.getElementById('flqr-share').onclick = () => {
            const shareData = { title: (ch.channelName || 'Flaynity') + ' on Flaynity', text: `Check out ${ch.channelName || 'this channel'} on Flaynity!`, url };
            if (navigator.share) navigator.share(shareData).catch(() => {});
            else document.getElementById('flqr-copy').click();
        };
        document.getElementById('flqr-download').onclick = () => {
            const card = document.createElement('canvas');
            card.width = 720; card.height = 920;
            const ctx = card.getContext('2d');
            const bg = ctx.createLinearGradient(0, 0, 720, 920);
            bg.addColorStop(0, '#FF007A'); bg.addColorStop(.5, '#7C14E8'); bg.addColorStop(1, '#3B00FF');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, 720, 920);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.roundRect(52, 60, 616, 800, 48); ctx.fill();
            ctx.fillStyle = '#D80E45';
            ctx.font = '900 34px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('FLAYNITY', 360, 138);
            ctx.fillStyle = '#0f172a';
            ctx.font = '800 36px sans-serif';
            ctx.fillText(String(ch.channelName || 'Flaynity Channel').slice(0, 26), 360, 204);
            ctx.fillStyle = '#64748b';
            ctx.font = '700 24px sans-serif';
            ctx.fillText('@' + String(ch.handle || 'channel').replace(/^@/, ''), 360, 246);
            ctx.drawImage(qrCanvas, 150, 286, 420, 420);
            ctx.fillStyle = '#64748b';
            ctx.font = '600 21px sans-serif';
            ctx.fillText('Scan to open channel on Flaynity', 360, 774);
            const a = document.createElement('a');
            a.href = card.toDataURL('image/png');
            a.download = `flaynity_qr_${String(ch.handle || 'channel').replace(/[^a-z0-9._-]/gi, '')}.png`;
            document.body.appendChild(a); a.click(); a.remove();
            if (typeof showNotification === 'function') showNotification('QR Code saved!', 'success');
        };

        modal.classList.add('open');
    };

    /* =================================================================
       4. FULL-SCREEN QR CODE SCAN SYSTEM PAGE (matching 1000163074.jpg)
       ================================================================= */
    function parseChannelTargetFromQR(rawText) {
        const txt = String(rawText || '').trim();
        if (!txt) return null;
        try {
            const u = new URL(txt);
            const ch = u.searchParams.get('channel') || u.searchParams.get('ch') || u.searchParams.get('handle');
            if (ch) return ch;
            if (/^\/@[A-Za-z0-9._-]+/.test(u.pathname)) return u.pathname.slice(1).split('/')[0];
            if (u.hash && /^#(?:channel=|@)([A-Za-z0-9._-]+)/.test(u.hash)) {
                const m = u.hash.match(/^#(?:channel=|@)([A-Za-z0-9._-]+)/);
                return u.hash.startsWith('#@') ? '@' + m[1] : m[1];
            }
        } catch (e) {}
        if (/^@[A-Za-z0-9._-]{3,30}$/.test(txt)) return txt;
        return null;
    }

    window.openQRScannerPage = function () {
        ensureStudioStyles();
        if (typeof playUI === 'function') playUI('click');
        let modal = document.getElementById('fl-qr-scanner-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'fl-qr-scanner-modal';
            modal.innerHTML = `
                <video class="flsc-video" id="flsc-video" autoplay playsinline muted></video>
                <div class="flsc-scrim"></div>
                <header class="flsc-top">
                    <button type="button" class="flsc-back" id="flsc-back" aria-label="Back"><i class="fas fa-arrow-left"></i></button>
                    <h3 class="flsc-title">Scan</h3>
                </header>
                <div class="flsc-center">
                    <div class="flsc-frame">
                        <span class="flsc-br flsc-tl"></span>
                        <span class="flsc-br flsc-tr"></span>
                        <span class="flsc-br flsc-bl"></span>
                        <span class="flsc-br flsc-br2"></span>
                        <div class="flsc-laser"></div>
                    </div>
                    <button type="button" class="flsc-torch" id="flsc-torch">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z"/><line x1="6" y1="6" x2="18" y2="6"/><line x1="12" y1="12" x2="12" y2="12.01"/></svg>
                        <span id="flsc-torch-txt">Tap to turn light on</span>
                    </button>
                    <p class="flsc-sub">Scan your friend's QR code to connect</p>
                    <p class="flsc-status" id="flsc-status"></p>
                </div>
                <div class="flsc-bottom">
                    <button type="button" class="flsc-act" id="flsc-my-qr">
                        <span class="flsc-act-circle">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2v2M14 19h2v2M19 19h2v2"/></svg>
                        </span>
                        <span>My QR code</span>
                    </button>
                    <button type="button" class="flsc-act" id="flsc-gallery">
                        <span class="flsc-act-circle">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L7 20"/></svg>
                        </span>
                        <span>Gallery</span>
                    </button>
                </div>
                <input type="file" id="flsc-file" accept="image/*" style="display:none;">`;
            document.body.appendChild(modal);
        }

        const video = document.getElementById('flsc-video');
        const statusEl = document.getElementById('flsc-status');
        const torchBtn = document.getElementById('flsc-torch');
        const torchTxt = document.getElementById('flsc-torch-txt');
        let stream = null, track = null, rafId = 0, active = true, torchOn = false;
        const detector = (typeof window.BarcodeDetector === 'function') ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;

        function stopScanner() {
            active = false;
            if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
            if (stream) {
                stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
                stream = null; track = null;
            }
            video.srcObject = null;
            torchOn = false;
            torchBtn.classList.remove('on');
            torchTxt.textContent = 'Tap to turn light on';
            modal.classList.remove('open');
        }

        function handleScannedText(raw) {
            const target = parseChannelTargetFromQR(raw);
            if (!target) {
                statusEl.textContent = 'Invalid Flaynity QR code.';
                return false;
            }
            stopScanner();
            if (typeof showNotification === 'function') showNotification('Opening channel...', 'success');
            window.openChannelProfile(target);
            return true;
        }

        async function scanLoop() {
            if (!active) return;
            if (detector && video.readyState >= 2) {
                try {
                    const codes = await detector.detect(video);
                    if (codes && codes.length && codes[0].rawValue) {
                        if (handleScannedText(codes[0].rawValue)) return;
                    }
                } catch (e) {}
            }
            rafId = requestAnimationFrame(() => setTimeout(scanLoop, 180));
        }

        statusEl.textContent = '';
        modal.classList.add('open');

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            }).then((s) => {
                if (!active) { s.getTracks().forEach(t => t.stop()); return; }
                stream = s;
                track = s.getVideoTracks()[0] || null;
                video.srcObject = s;
                video.play().catch(() => {});
                scanLoop();
            }).catch(() => {
                statusEl.textContent = 'Camera unavailable — tap Gallery to scan a saved QR image.';
            });
        } else {
            statusEl.textContent = 'Camera unavailable — tap Gallery to scan a saved QR image.';
        }

        torchBtn.onclick = async () => {
            if (!track || !track.applyConstraints) {
                if (typeof showNotification === 'function') showNotification('Flashlight not supported on this device.', 'error');
                return;
            }
            try {
                torchOn = !torchOn;
                await track.applyConstraints({ advanced: [{ torch: torchOn }] });
                torchBtn.classList.toggle('on', torchOn);
                torchTxt.textContent = torchOn ? 'Tap to turn light off' : 'Tap to turn light on';
            } catch (e) {
                torchOn = false;
                if (typeof showNotification === 'function') showNotification('Flashlight not available.', 'error');
            }
        };

        async function decodeGalleryFile(file) {
            if (!file) return;
            statusEl.textContent = 'Scanning image...';
            try {
                const bmp = await createImageBitmap(file);
                if (detector) {
                    const codes = await detector.detect(bmp);
                    if (codes && codes.length && codes[0].rawValue) {
                        if (handleScannedText(codes[0].rawValue)) return;
                    }
                    statusEl.textContent = 'No Flaynity QR code found in this image.';
                } else {
                    statusEl.textContent = 'QR decoding is not supported on this browser.';
                }
            } catch (e) {
                statusEl.textContent = 'Could not read QR code from this image.';
            }
        }

        document.getElementById('flsc-back').onclick = stopScanner;
        document.getElementById('flsc-my-qr').onclick = () => {
            stopScanner();
            window.openChannelQRModal();
        };
        document.getElementById('flsc-gallery').onclick = () => {
            if (typeof window.openMediaPicker === 'function') {
                window.openMediaPicker('photos', decodeGalleryFile);
            } else {
                document.getElementById('flsc-file').click();
            }
        };
        document.getElementById('flsc-file').onchange = (e) => decodeGalleryFile(e.target.files && e.target.files[0]);
    };

    /* =================================================================
       5. PRIVACY HELPERS & SCAN-TO-OPEN CHANNEL PROFILE DEEP LINK
       ================================================================= */
    window.setEditChannelPrivacy = function (val) {
        const clean = val === 'private' ? 'private' : 'public';
        const inp = document.getElementById('edit-channel-privacy');
        if (inp) inp.value = clean;
        document.querySelectorAll('#edit-privacy-grid .edit-privacy-card').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.privacy === clean);
        });
    };

    window.syncChannelPrivacyUI = function (data) {
        const isPriv = !!(data && (data.privacy === 'private' || data.isPrivate === true));
        const badge = document.getElementById('view-channel-privacy-badge');
        if (badge) badge.style.display = isPriv ? 'inline-flex' : 'none';
        const sheet = document.getElementById('sheet-private-account');
        if (sheet) {
            sheet.querySelectorAll('.sheet-option-item').forEach(el => {
                const v = el.getAttribute('data-value') || ((el.textContent || '').trim().toLowerCase().includes('private') ? 'private' : 'public');
                el.classList.toggle('selected', isPriv ? v === 'private' : v === 'public');
            });
        }
    };

    window.saveChannelPrivacySetting = async function (privacyVal) {
        const clean = privacyVal === 'private' ? 'private' : 'public';
        const isPriv = clean === 'private';
        const u = (typeof auth !== 'undefined') ? auth.currentUser : null;
        if (typeof currentChannelData !== 'undefined' && currentChannelData) {
            currentChannelData.privacy = clean;
            currentChannelData.isPrivate = isPriv;
            try { localStorage.setItem('flaynity_user_session_cache', JSON.stringify(currentChannelData)); } catch (e) {}
            window.syncChannelPrivacyUI(currentChannelData);
        }
        if (u && typeof db !== 'undefined') {
            try {
                const upd = {};
                upd[`channels/${u.uid}/privacy`] = clean;
                upd[`channels/${u.uid}/isPrivate`] = isPriv;
                upd[`users/${u.uid}/channelPrivacy`] = clean;
                await db.ref().update(upd);
                if (typeof showNotification === 'function') {
                    showNotification(isPriv ? 'Channel set to Private' : 'Channel set to Public', 'success');
                }
            } catch (e) {
                if (typeof showNotification === 'function') showNotification('Failed to update privacy setting.', 'error');
            }
        }
    };

    window.openChannelProfile = async function (channelIdOrHandle) {
        if (!channelIdOrHandle || typeof db === 'undefined') return;
        let uid = String(channelIdOrHandle).trim();
        try {
            if (uid.startsWith('@')) {
                const h = uid.slice(1).toLowerCase();
                let snap = await db.ref('channelHandles/' + h).once('value');
                if (!snap.exists()) snap = await db.ref('handles/' + h).once('value');
                if (snap.exists()) uid = snap.val();
            }
            let snap = await db.ref('channels/' + uid).once('value');
            if (!snap.exists()) {
                const h = uid.toLowerCase();
                let hSnap = await db.ref('channelHandles/' + h).once('value');
                if (!hSnap.exists()) hSnap = await db.ref('handles/' + h).once('value');
                if (hSnap.exists()) {
                    uid = hSnap.val();
                    snap = await db.ref('channels/' + uid).once('value');
                }
            }
            if (!snap.exists()) {
                if (typeof showNotification === 'function') showNotification('Channel not found.', 'error');
                return;
            }
            const data = snap.val();
            data.uid = data.uid || uid;
            const myUid = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.uid : null;
            if (myUid && uid === myUid && typeof openViewChannelPage === 'function') {
                window.__activeViewedChannel = currentChannelData || data;
                openViewChannelPage();
                return;
            }
            window.__activeViewedChannel = data;
            if (typeof ensureYouPageLoaded === 'function') await ensureYouPageLoaded();
            const viewBanner = document.getElementById('view-channel-banner');
            const viewAvatar = document.getElementById('view-channel-avatar');
            const viewName = document.getElementById('view-channel-name-txt');
            const viewHandle = document.getElementById('view-channel-handle-txt');
            const viewDesc = document.getElementById('view-channel-desc');
            const viewSub = document.getElementById('view-sub-count');
            const isPriv = data.privacy === 'private' || data.isPrivate === true;

            if (viewBanner) viewBanner.src = data.bannerUrl || data.channelBannerUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2000&auto=format&fit=crop';
            if (viewAvatar) viewAvatar.src = data.avatarUrl || data.channelImageUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=300&auto=format&fit=crop';
            if (viewName) viewName.innerText = data.channelName || 'Flaynity Channel';
            if (viewHandle) viewHandle.innerText = '@' + String(data.handle || '').replace(/^@/, '');
            if (viewDesc) viewDesc.innerText = isPriv ? 'This channel is private.' : (data.description || 'No description provided yet.');
            if (viewSub && typeof formatCount === 'function') viewSub.innerText = formatCount(data.subscribersCount || 0) + ' Subscribers';
            window.syncChannelPrivacyUI(data);

            if (isPriv) {
                ['channel-videos-grid', 'channel-feels-grid', 'channel-posts-feed'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = '<div class="ch-empty" style="padding:36px 16px;"><i class="fas fa-lock" style="font-size:1.8rem;margin-bottom:10px;display:block;color:#D80E45;"></i>This channel is private.</div>';
                });
            } else {
                if (typeof renderChannelVideos === 'function') renderChannelVideos(uid);
                if (typeof renderChannelFeels === 'function') renderChannelFeels(uid);
                if (typeof renderChannelPosts === 'function') renderChannelPosts(uid);
            }
            if (typeof switchChannelTab === 'function') switchChannelTab('videos');
            if (typeof AppNavigation !== 'undefined' && AppNavigation.pushPage) AppNavigation.pushPage('view-channel-page');
        } catch (e) {
            console.error('openChannelProfile error:', e);
        }
    };

    function checkIncomingChannelDeepLink() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            let target = params.get('channel') || params.get('ch') || params.get('handle');
            if (!target && window.location.hash) {
                const m = window.location.hash.match(/^#(?:channel=|@)([A-Za-z0-9._-]+)/);
                if (m) target = window.location.hash.startsWith('#@') ? '@' + m[1] : m[1];
            }
            if (!target && window.location.pathname && /^\/@[A-Za-z0-9._-]+$/.test(window.location.pathname)) {
                target = window.location.pathname.slice(1);
            }
            if (target) {
                setTimeout(() => { window.openChannelProfile(target); }, 900);
            }
        } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkIncomingChannelDeepLink);
    } else {
        checkIncomingChannelDeepLink();
    }
})();
