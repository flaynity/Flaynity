/* Flaynity Modular Loader — serial page loading + offline cache */
(async function () {
    const pageFiles = [["home","pages/home.html"],["feels","pages/feels.html"],["upload","pages/upload.html"],["discover","pages/discover.html"],["you","pages/you.html"]];
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

    async function loadPage(name, url) {
        const text = await getPageSource(name, url);
        const doc = new DOMParser().parseFromString(text, "text/html");
        addPageStyle(doc, name);
        return Array.from(doc.body.children).map(el => el.cloneNode(true));
    }

    function showOfflineCachedApp() {
        if (navigator.onLine) return;
        let cachedSession = null;
        try { cachedSession = localStorage.getItem('flaynity_user_session_cache'); } catch (e) {}
        if (!cachedSession) return;
        const authScr = document.getElementById('auth-screen');
        const appScr = document.getElementById('app-screen');
        if (authScr) authScr.style.display = 'none';
        if (appScr) appScr.style.display = 'block';
        document.body.classList.remove('auth-active');
        window.__flaynityOfflineSessionActive = true;
        try { firebase.database().goOffline(); } catch (e) {}
    }

    try {
        const app = document.getElementById("app");
        if (!app) throw new Error("#app not found");

        // Load Home first so the first app screen becomes visible immediately.
        // The remaining pages are loaded in the background after Home is mounted.
        const homeNodes = await loadPage(pageFiles[0][0], pageFiles[0][1]);

        const appScreen = document.createElement("div");
        appScreen.id = "app-screen";
        const startupIds = new Set(["startupSound","toast-container","network-spinner-overlay","auth-screen"]);

        for (const node of homeNodes) {
            if (node.id && startupIds.has(node.id)) app.appendChild(node);
            else appScreen.appendChild(node);
        }
        app.appendChild(appScreen);

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
                for (const [, nodes] of remaining) {
                    for (const node of nodes) appScreen.appendChild(node);
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
        if (active && active.id) return active.id === "nav-home";
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

        // Only Home is allowed to move the bottom navigation. All other tabs
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
    } catch (e) {}
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
                if (avatarNav && data.avatarUrl) {
                    avatarNav.innerHTML = `<img src="${data.avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
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
        home.style.minHeight = 'calc(100vh - 126px)';
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
// AUTOMATIC & MANUAL THEME ENGINE
// =========================================
function applyTheme() {
    let pref = localStorage.getItem('flaynity-theme-pref') || 'light';
    document.documentElement.setAttribute('data-theme', pref);
    
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
    
    try {
        const sound = document.getElementById("startupSound");
        if (sound) {
            sound.volume = 0.3; 
            document.body.addEventListener('click', () => {
                sound.play().catch(e => console.log("Startup audio block:", e));
            }, { once: true });
            
            let playPromise = sound.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => { console.log("Auto-play blocked by client."); });
            }
        }
    } catch (e) {
        console.warn("Startup sound engine bypassed:", e);
    }

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

// =========================================================
// OFFLINE -> ONLINE AUTO SYNC & NETWORK MONITORING
// =========================================================
let _networkOnlineDebounceTimer = null;

window.addEventListener('online', () => { window.FlaynityNetworkOnline(); });
window.addEventListener('offline', () => { window.FlaynityNetworkOffline(); });

window.FlaynityNetworkOnline = function() {
    if (!navigator.onLine) return;
    if (_networkOnlineDebounceTimer) return;
    _networkOnlineDebounceTimer = setTimeout(() => {
        _networkOnlineDebounceTimer = null;
    }, 1500);

    const spinner = document.getElementById('network-spinner-overlay');
    if (spinner) spinner.style.display = 'none';

    try { firebase.database().goOnline(); } catch(e) {}
    showNotification("Network Restored! Syncing Live Data...", "success");

    const waitingUploads = uploadQueue.filter(i => i.status === 'paused' || i.status === 'waiting');
    if (waitingUploads.length > 0) {
        waitingUploads.forEach(item => { item.status = 'waiting'; });
        triggerNextActiveUpload();
    }

    syncOfflineLikes();
    SyncManager.refreshEverything();

    const activeVideo = document.querySelector('.short-slide video[src]');
    if (activeVideo && activeVideo.paused && activeVideo.readyState > 2) {
        activeVideo.play().catch(() => {});
    }
};

window.FlaynityNetworkOffline = function() {
    try { firebase.database().goOffline(); } catch(e) {}
    showNotification("Offline Mode. Showing Skeletons.", "error");

    renderAllSkeletons();

    const activeVideo = document.querySelector('.short-slide video[src]');
    if (activeVideo && !activeVideo.paused) {
        activeVideo.pause();
    }
};

window.FlaynityNativeRefresh = function() {
    if (!navigator.onLine) return;
    if (SyncManager.isRefreshing) return;
    SyncManager.refreshEverything();
};

// =========================================================
// GLOBAL SYNC MANAGER (No-Reload Synchronization Engine)
// =========================================================
const SyncManager = {
    isRefreshing: false,
    refreshEverything: async function() {
        if (this.isRefreshing || !navigator.onLine) return;
        this.isRefreshing = true;

        try {
            _detachAllGlobalFeedListeners();

            previousFeelsCount = -1;
            previousLongsCount  = -1;
            previousPostsCount  = -1;

            await this.refreshProfile();

            const [longsSnap, feelsSnap, legacyShortsSnap, postsSnap] = await Promise.all([
                db.ref('admin_panel/movies/user_uploads').once('value'),
                db.ref('admin_panel/movies/feels').once('value'),
                db.ref('admin_panel/movies/shorts').once('value'),
                db.ref('admin_panel/posts').once('value')
            ]);

            const now = Date.now();
            allLongVideos      = longsSnap.val()  ? Object.values(longsSnap.val()).filter(m => !m.scheduledTime || m.scheduledTime <= now)  : [];
            const feelsData = feelsSnap.val() ? Object.values(feelsSnap.val()) : [];
            const legacyShortsData = legacyShortsSnap.val() ? Object.values(legacyShortsSnap.val()) : [];
            const seenFeelIds = new Set();
            allFeels = [...feelsData, ...legacyShortsData].filter(m => {
                if (!m || (m.scheduledTime && m.scheduledTime > now) || !m.id || seenFeelIds.has(String(m.id))) return false;
                seenFeelIds.add(String(m.id));
                return true;
            });
            allCommunityPosts  = postsSnap.val()  ? Object.values(postsSnap.val()).filter(m => !m.scheduledTime || m.scheduledTime <= now)  : [];

            startRealtimeFeedsListener();

            buildHomeFeed();

            const feelsTab = document.getElementById('feels-tab');
            if (feelsTab && feelsTab.classList.contains('active')) buildFeelsPage();

            this.refreshAnalytics();

        } catch (err) {
            console.error("SyncManager Execution Error:", err);
        } finally {
            this.isRefreshing = false;
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
        const analyticsPage = document.getElementById('analytics-page');
        if (analyticsPage && (analyticsPage.style.display === 'flex' || analyticsPage.style.display === 'block')) {
            calculateChannelAnalytics();
        }
    }
};

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

function isPTRAllowedOnCurrentView() {
    const modalsOpen = document.querySelectorAll('.fullscreen-page[style*="display: flex"], .fullscreen-page[style*="display: block"], .premium-download-modal[style*="display: flex"], #full-movie-page[style*="display: block"], #theme-popup-menu[style*="display: flex"], #full-image-preview-overlay[style*="display: flex"]');
    if (modalsOpen.length > 0) return false;

    const activeNav = document.querySelector('.nav-item.active');
    if (!activeNav) return false;
    const activeTabId = activeNav.id.replace('nav-', '');

    // Feels has its own vertical scroller and must never trigger page PTR.
    if (activeTabId === 'feels') return false;
    return ['home', 'search', 'you'].includes(activeTabId) && getMainScrollTop() <= 0;
}

function resetPTRIndicator() {
    const ptrIndicator = document.getElementById('ptr-indicator');
    const ptrSpinner = document.getElementById('ptr-spinner');
    if (ptrIndicator) {
        ptrIndicator.style.transform = 'translate3d(-50%, -70px, 0)';
        ptrIndicator.style.opacity = '0';
    }
    if (ptrSpinner) ptrSpinner.classList.remove('ptr-spinning');
}

function initPullToRefresh() {
    if (window.__flaynityPTRInitialized) return;
    window.__flaynityPTRInitialized = true;

    const ptrIndicator = document.getElementById('ptr-indicator');
    const ptrSpinner = document.getElementById('ptr-spinner');
    const PTR_TRIGGER_DISTANCE = 110;

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
        if (!ptrStartAtTop || getMainScrollTop() > 0 || !isPTRAllowedOnCurrentView()) {
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
            const pullDistance = Math.min(100, deltaY * 0.42);
            if (e.cancelable) e.preventDefault();

            if (ptrIndicator) {
                ptrIndicator.style.opacity = String(Math.min(1, pullDistance / 52));
                ptrIndicator.style.transform = `translate3d(-50%, ${pullDistance - 70}px, 0)`;
            }
            if (ptrSpinner) {
                ptrSpinner.style.transform = `rotate(${pullDistance * 3.2}deg)`;
                ptrSpinner.style.stroke = pullDistance >= PTR_TRIGGER_DISTANCE * 0.42 ? 'var(--primary)' : 'var(--text-muted)';
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

        if (deltaY >= PTR_TRIGGER_DISTANCE && getMainScrollTop() <= 0 && isPTRAllowedOnCurrentView()) {
            isRefreshingNow = true;
            if (ptrIndicator) {
                ptrIndicator.style.transform = 'translate3d(-50%, 18px, 0)';
                ptrIndicator.style.opacity = '1';
            }
            if (ptrSpinner) {
                ptrSpinner.style.stroke = 'var(--primary)';
                ptrSpinner.style.transform = '';
                ptrSpinner.classList.add('ptr-spinning');
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
    if (!navigator.onLine) {
        showNotification("Offline - Cannot Refresh", "error");
        return;
    }

    try {
        await SyncManager.refreshEverything();
        showNotification("Feed Updated!", "success");
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

    const searchResults = document.getElementById('search-results');
    if (searchResults) searchResults.innerHTML = '<p style="color:var(--text-muted); grid-column:1/-1; text-align:center; padding: 60px 0; font-weight: 500;">Search or use the mic to find movies.</p>';

    const youName = document.getElementById('you-fullname-txt');
    if (youName) youName.innerText = "Logged Out";

    const youEmail = document.getElementById('you-email-txt');
    if (youEmail) youEmail.innerText = "";

    const youAvatar = document.getElementById('you-avatar-large');
    if (youAvatar) youAvatar.innerHTML = 'U';

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

auth.onAuthStateChanged(async (user) => {
    try {
        clearUserStatusListener();
        detachAdminControlListener();
        if (!user) {
            cleanupUserSessionData();
            document.body.classList.add('auth-active');
            const appScr = document.getElementById('app-screen');
            const authScr = document.getElementById('auth-screen');
            if (appScr) appScr.style.display = 'none';
            // First launch / every launch without a signed-in account: show onboarding first.
            // The existing Google auth screen is revealed only after Get Started.
            if (authScr) authScr.style.display = 'none';
            if (typeof window.__flaynityShowOnboarding === 'function') {
                // The onboarding controller waits for the startup splash and preloads
                // all images before revealing the screen, preventing late/flickering shows.
                window.__flaynityShowOnboarding();
            }
            return;
        }

        // Always verify the account status from Firebase before exposing the app.
        const userRef = db.ref(`users/${user.uid}`);
        const firstSnap = await userRef.once('value');
        const firstData = firstSnap.val() || {};
        const firstStatus = String(firstData.userStatus || firstData.accountStatus || '').toLowerCase();
        if (firstStatus === 'banned') {
            document.body.classList.add('auth-active');
            const appScr = document.getElementById('app-screen');
            const authScr = document.getElementById('auth-screen');
            if (appScr) appScr.style.display = 'none';
            if (authScr) authScr.style.display = 'none';
            showAccountBannedPopup(firstData.banReason);
            try { await auth.signOut(); } catch(e) {}
            return;
        }

        document.body.classList.remove('auth-active');
        if (typeof window.__flaynityHideOnboarding === 'function') {
            window.__flaynityHideOnboarding();
        }
        const authScr = document.getElementById('auth-screen');
        const appScr = document.getElementById('app-screen');
        if (authScr) authScr.style.display = 'none';
        if (appScr) appScr.style.display = 'block';

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
        startRealtimeFeedsListener();
        restoreQueueFromLocalStorage();
        applyAdminControls();

        const activeNav = document.querySelector('.nav-item.active');
        if (activeNav) adjustHeaderForActiveTab(activeNav.id.replace('nav-', ''));
    } catch (e) {
        console.error('Auth status sync error:', e);
        try { await auth.signOut(); } catch(err) {}
    }
});

function renderUserAvatar(photoURL, email) {
    const avatarNav = document.getElementById('nav-avatar-img');
    if (avatarNav) {
        if (photoURL) {
            avatarNav.innerHTML = `<img src="${photoURL}" style="width: 100%; height: 100%; object-fit: cover;">`;
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
    if (window.AndroidBridge && typeof window.AndroidBridge.triggerGoogleSignIn === 'function') {
        window.AndroidBridge.triggerGoogleSignIn(); 
    } else {
        try { 
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await auth.signInWithPopup(provider); 
            saveAccountToList(result.user);
            showNotification("Google Sign-In Successful!", "success"); 
        } catch (err) { 
            showNotification(err.message, "error"); 
        }
    }
}

window.handleNativeGoogleSignIn = function(idToken) {
    showNotification("Connecting secure session...", "success");
    const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
    auth.signInWithCredential(credential)
        .then((result) => { 
            saveAccountToList(result.user);
            showNotification("Google Sign-In Successful!", "success"); 
        })
        .catch(err => { showNotification("Native Auth Error: " + err.message, "error"); });
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

        // Direct R2 MP4: the object uploaded above is already the final playable
        // video. There is intentionally no FFmpeg/transcode/HLS step here.
        item.videoProvider = "r2";
        item.videoUrl = normalizeFlaynityMediaUrl(upload.publicUrl || flaynityMediaUrl(upload.key));
        item.videoLink = item.videoUrl;
        item.sourceKey = upload.key;

        item.status = "processing"; item.retryCount = 0; item.processingMsg = "Publishing Feed..."; item.progress = 100; updateManagerUI();
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
        videoProvider: 'r2',
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
            buildHomeFeed();
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
                        if (titleEl) titleEl.innerText = escapeHTML(v.title);
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

    if (!navigator.onLine) {
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

    feels.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
    longs.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
    posts.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));

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
                    <img src="${s.poster}" loading="lazy">
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
        container.innerHTML = html;
        
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
        ensureHomePostScrollFlow();
        posts.slice(0, postRenderLimit).forEach(p => {
            registerPostReactionsListener(p.id);
        });

        uniqueUserIds.forEach(uid => bindLiveChannelUI(uid));
        return;
    }

    let shortIdx = 0;
    let longIdx = 0;
    let postIdx = 0;

    if (feels.length === 0 && longs.length === 0 && posts.length === 0) {
        container.innerHTML = getHomeSkeletonHTML();
        return;
    }

    let postsToBind = [];

    while (longIdx < longs.length || shortIdx < feels.length || postIdx < posts.length) {
        if (shortIdx < feels.length) {
            const segmentFeels = feels.slice(shortIdx, shortIdx + 6);
            shortIdx += 6;
            segmentFeels.forEach(s => { if (s.userId) uniqueUserIds.add(s.userId); });
            html += renderFeelsSegmentUI(segmentFeels);
        }

        if (longIdx < longs.length) {
            const segmentLongs = longs.slice(longIdx, longIdx + 10);
            longIdx += 10;
            segmentLongs.forEach(l => { if (l.userId) uniqueUserIds.add(l.userId); });
            html += renderLongVideosSegmentUI(segmentLongs);
        }

        if (postIdx < posts.length) {
            const singlePost = posts[postIdx];
            postIdx++;
            if (singlePost.userId) uniqueUserIds.add(singlePost.userId);
            html += renderSinglePostSegmentUI(singlePost);
            postsToBind.push(singlePost.id);
        }
    }

    container.innerHTML = html;
    ensureHomePostScrollFlow();
    postsToBind.forEach(postId => registerPostReactionsListener(postId));
    uniqueUserIds.forEach(uid => bindLiveChannelUI(uid));
}

function renderFeelsSegmentUI(segmentFeels) {
    if (segmentFeels.length === 0) return '';
    
    const limitedFeels = segmentFeels.slice(0, 6);
    
    let html = `
        <div class="feels-section-container" style="margin-bottom: 24px;">
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
                <img src="${s.poster}" loading="lazy">
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

function renderLongVideosSegmentUI(segmentLongs) {
    if (!segmentLongs || segmentLongs.length === 0) return '';
    let html = '';
    segmentLongs.forEach(v => {
        const viewsId = `home-long-views-${v.id}`;
        const relTime = getRelativeTime(v.createdAt);
        const avatarHtml = `<div class="live-avatar-${v.userId}" style="width:36px;height:36px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;"></div>`;
        html += `
            <div class="long-video-feed-card" onclick="openMoviePage('${v.id}', false)" style="margin:0 -16px 24px -16px;width:calc(100% + 32px);cursor:pointer;background:var(--surface);">
                <div class="long-video-thumb-container" style="position:relative;width:100%;aspect-ratio:16/9;background:#0F0F0F;overflow:hidden;">
                    <img src="${v.poster}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">
                    <span style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.85);color:#fff;font-size:0.72rem;padding:2px 6px;border-radius:4px;font-weight:800;">${v.duration || '10:00'}</span>
                </div>
                <div style="padding:14px 16px;display:flex;gap:12px;">
                    ${avatarHtml}
                    <div style="flex-grow:1;min-width:0;">
                        <h4 class="long-video-title" style="font-size:0.95rem;font-weight:800;color:var(--text-main);margin:0 0 4px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(v.title)}</h4>
                        <div style="font-size:0.8rem;color:var(--text-muted);font-weight:600;display:flex;flex-wrap:wrap;align-items:center;gap:4px;">
                            <span class="live-username-${v.userId}">${escapeHTML(v.username || 'Flaynity User')}</span>
                            <span>•</span><span id="${viewsId}">0 Views</span>
                            <span>•</span><span>${relTime}</span>
                        </div>
                    </div>
                </div>
            </div>`;
        db.ref(`movie_stats/${v.id}/views`).once('value', (vSnap) => {
            const count = Object.keys(vSnap.val() || {}).length;
            const label = document.getElementById(viewsId);
            if (label) label.innerText = formatCount(count) + " Views";
        });
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

function renderSinglePostSegmentUI(post) {
    ensureHomePostScrollFlow();
    if (!post) return '';

    const titleText = post.title || post.caption || '';
    const plainCaption = post.caption || '';
    const combinedText = titleText === plainCaption ? plainCaption : `${titleText}\n\n${plainCaption}`;
    
    const isLong = combinedText.length > 80; 
    
    let titleHtml = '';
    if (isLong) {
        titleHtml = `
            <div id="title-collapsed-${post.id}" style="line-height: 1.4; font-weight: 800; white-space: pre-wrap; word-break: break-word;">
                ${escapeHTML(combinedText)}
            </div>
            <div id="title-expanded-${post.id}" style="display: none; line-height: 1.4; font-weight: 800; white-space: pre-wrap; word-break: break-word;">
                ${escapeHTML(combinedText)}
            </div>
        `;
    } else {
        titleHtml = `<div style="line-height: 1.4; font-weight: 800; white-space: pre-wrap; word-break: break-word;">${escapeHTML(combinedText)}</div>`;
    }

    const subBtnId = `post-sub-btn-${post.id}`;
    const subUserId = post.userId;
    
    if (auth.currentUser && navigator.onLine) {
        db.ref(`subscribers/${subUserId}/${auth.currentUser.uid}`).on('value', (snapshot) => {
            const btn = document.getElementById(subBtnId);
            if (btn) {
                if (snapshot.exists()) {
                    btn.innerText = "Subscribed";
                    btn.style.color = "var(--text-muted)";
                    btn.style.borderColor = "var(--border-color)";
                } else {
                    btn.innerText = "Subscribe";
                    btn.style.color = "var(--primary)";
                    btn.style.borderColor = "var(--primary)";
                }
            }
        });
    }

    const avatarHtml = `<div class="live-avatar-${post.userId}" style="width:40px; height:40px; border-radius:50%; overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0;"></div>`;

    let imagesHtml = '';
    if (post.images && post.images.length > 0) {
        imagesHtml = `
            <div style="margin-left: -16px; margin-right: -16px; margin-top: 12px; margin-bottom: 12px; width: calc(100% + 32px); aspect-ratio: 3/4; position: relative; background: #0F0F0F; overflow: visible; border-radius: 0 !important;">
                <img src="${post.images[0]}" onclick="openFullScreenImagePreview('${post.images[0]}')" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer; display: block; border-radius: 0 !important;" loading="lazy">
                
                <div style="position: absolute; top: 0; left: 0; right: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%); padding: 16px 20px; color: #FFFFFF; z-index: 10;">
                     <div id="title-container-${post.id}" onclick="event.stopPropagation(); togglePostTitleExpand('${post.id}')" style="cursor: pointer; font-size: 0.95rem; font-weight: 800; line-height: 1.4; text-shadow: 0 2px 8px rgba(0,0,0,0.95); font-family: 'Plus Jakarta Sans', sans-serif;">
                         ${titleHtml}
                     </div>
                </div>

                ${post.images.length > 1 ? `
                    <div style="position: absolute; bottom: 12px; right: 12px; background: rgba(0,0,0,0.6); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; z-index: 12;">
                        +${post.images.length - 1} More
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        imagesHtml = `
            <div style="margin-bottom: 12px; padding: 0 4px;">
                 <div id="title-container-${post.id}" onclick="togglePostTitleExpand('${post.id}')" style="cursor: pointer; font-size: 0.95rem; font-weight: 800; line-height: 1.4; color: var(--text-main); font-family: 'Plus Jakarta Sans', sans-serif;">
                     ${titleHtml}
                 </div>
            </div>
        `;
    }

    const totalReactionsId = `post-total-reactions-${post.id}`;
    const totalCommentsId = `post-total-comments-${post.id}`;
    const topEmojisId = `post-top-emojis-${post.id}`;
    const loveBtnId = `post-love-btn-${post.id}`;

    return `
        <div class="post-card" id="post-card-${post.id}" style="margin-bottom: 24px; background: transparent; border: none; border-radius: 0; padding: 12px 0; box-shadow: none; overflow: visible; border-bottom: 1px solid var(--border-color);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 0 4px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    ${avatarHtml}
                    <div>
                        <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--text-main); margin: 0;" class="live-username-${post.userId}">@${escapeHTML(post.username)}</h4>
                        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">${getRelativeTime(post.createdAt)}</span>
                    </div>
                </div>
                <button id="${subBtnId}" onclick="toggleClipSubscribe('${post.userId}', this)" style="background: none; border: 1.5px solid var(--primary); color: var(--primary); padding: 4px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: 800; cursor: pointer; transition: all 0.2s;">Subscribe</button>
            </div>

            ${imagesHtml}

            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-muted); font-weight: 600; margin-left: -16px; margin-right: -16px; background: transparent;">
                <div style="display: flex; align-items: center; gap: 6px; cursor: pointer;" onclick="openReactedPeoplePage('${post.id}')">
                    <span id="${topEmojisId}" style="display: flex; gap: -4px;"></span>
                    <span id="${totalReactionsId}" style="margin-left: 4px;">0 Reactions</span>
                </div>
                <div style="cursor: pointer;" onclick="openCommentsForPost('${post.id}')">
                    <span id="${totalCommentsId}">0 Comments</span>
                </div>
            </div>

            <div style="display: flex; gap: 8px; margin-top: 12px; padding: 0 4px;">
                <button id="${loveBtnId}" 
                        class="post-action-btn-fb ripple" 
                        style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--border-color); border: none; padding: 12px; border-radius: 12px; font-size: 0.9rem; font-weight: 800; color: var(--text-main); cursor: pointer; transition: all 0.2s;"
                        onmousedown="startReactionTimer('${post.id}', event)"
                        ontouchstart="startReactionTimer('${post.id}', event)"
                        onmouseup="clearReactionTimer('${post.id}', event)"
                        ontouchend="clearReactionTimer('${post.id}', event)"
                        onclick="handleLoveSingleClick('${post.id}')">
                    <i class="far fa-heart love-icon-element" id="love-icon-${post.id}"></i> <span id="love-text-${post.id}" style="display: inline-flex; align-items: center; line-height: 1;">Love</span>
                </button>
                
                <button class="post-action-btn-fb ripple" 
                        onclick="openCommentsForPost('${post.id}')"
                        style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--border-color); border: none; padding: 12px; border-radius: 12px; font-size: 0.9rem; font-weight: 800; color: var(--text-main); cursor: pointer; transition: all 0.2s;">
                    <i class="far fa-comment"></i> Comment
                </button>
            </div>
        </div>
    `;
}

function togglePostTitleExpand(postId) {
    playUI('click');
    const collapsed = document.getElementById(`title-collapsed-${postId}`);
    const expanded = document.getElementById(`title-expanded-${postId}`);
    if (collapsed && expanded) {
        if (collapsed.style.display === 'none') {
            expanded.style.display = 'none';
            collapsed.style.display = '-webkit-box';
        } else {
            collapsed.style.display = 'none';
            expanded.style.display = 'block';
        }
    }
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
    const targetId = String(shortId);
    // Lock the exact Home Feels before navigation so the first slide cannot
    // become active while the Feels tab is being shown/rebuilt.
    feelsProgrammaticTargetId = targetId;
    feelsProgrammaticTargetUntil = Date.now() + 1500;
    switchTab('feels');

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
const feelsCommentsCache = {};
let feelsLastPlayedId = null;
let feelsPendingRestoreId = null;
// Locks the exact Feels being opened/restored so IntersectionObserver cannot
// temporarily select the first slide during a DOM rebuild.
let feelsProgrammaticTargetId = null;
let feelsProgrammaticTargetUntil = 0;
const feelsLastPlayedByMode = { 'for-you': null, 'subscribe': null };

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
    keepFeelsVideoActive(s.id);
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

function buildFeelsPage() {
    const container = document.getElementById('feels-swiper-container');
    if (!container) return;
    
    if (!navigator.onLine) {
        container.innerHTML = getFeelsSkeletonHTML();
        return;
    }

    ensureFeelsSubscriptionListeners();
    updateFeelsModeButtons();
    let activeFeelsList = feelsFeedMode === 'subscribe' ? allFeels.filter(s => { const channelId = s.userId || s.channelId; return channelId && channelId !== auth.currentUser?.uid && !!feelsSubscribedChannels[channelId]; }) : allFeels;

    if (activeFeelsList.length === 0) {
        container.innerHTML = getFeelsSkeletonHTML();
        return;
    }

    let html = '';
    activeFeelsList.forEach(s => {
        const isLikedId = `short-like-btn-${s.id}`;
        const likesCountId = `short-likes-count-${s.id}`;
        const commentsCountId = `short-comments-count-${s.id}`;
        const statsCacheKey = `flaynity_stats_cache_${s.id}`;

        let cachedStats = { likes: 0, comments: 0 };
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
                        <div class="short-channel-action-avatar live-avatar-${s.userId || s.channelId}">
                            <img src="${s.channelAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=100'}" alt="Channel">
                        </div>
                        <button class="short-channel-subscribe-btn" id="short-sub-btn-${s.id}" aria-label="Subscribe" onclick="toggleClipSubscribe('${s.userId || s.channelId}', this)">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>

                    <div class="short-action-container">
                        <button class="short-action-btn-tiktok" id="${isLikedId}" onclick="toggleShortLike('${s.id}')">
                            <i class="fas fa-heart${isLocallyLiked ? ' liked' : ''}"></i>
                        </button>
                        <div class="short-action-label-tiktok" id="${likesCountId}">${formatCount(cachedStats.likes)}</div>
                    </div>

                    <div class="short-action-container">
                        <button class="short-action-btn-tiktok-other" onclick="openFeelsComments('${s.id}', event)">
                            <i class="fas fa-comment"></i>
                        </button>
                        <div class="short-action-label-tiktok" id="${commentsCountId}">${formatCount(cachedStats.comments)}</div>
                    </div>

                    <div class="short-action-container">
                        <button class="short-action-btn-tiktok-other" onclick="triggerShortDownload('${s.id}', event)">
                            <i class="fas fa-download"></i>
                        </button>
                        <div class="short-action-label-tiktok">Save</div>
                    </div>

                    <div class="short-action-container">
                        <select id="short-quality-${s.id}" aria-label="Video quality" onchange="setFeelsQuality('${s.id}', this.value)" style="max-width:72px;background:#111;color:white;border:1px solid #888;border-radius:8px;padding:6px;"><option value="0">Auto</option></select>
                        <div class="short-action-label-tiktok">Quality</div>
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
                        <h2 id="short-title-val-${s.id}" class="short-title-text" style="font-size:0.82rem; font-weight:700; color:#EBEBEB; margin:0; line-height:1.4; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis;">
                            ${escapeHTML(s.title)}
                        </h2>
                    </div>
                </div>
            </div>
        `;

        db.ref(`movie_stats/${s.id}`).on('value', (snapshot) => {
            const stats = snapshot.val() || {};
            const viewsObj = stats.views || {};
            const likesObj = stats.likes || {};
            const likesCount = Object.keys(likesObj).length;
            if (auth.currentUser) {
                feelsLikedByUser[s.id] = !!likesObj[auth.currentUser.uid];
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
                if (likesObj[auth.currentUser.uid]) {
                    likeBtn.innerHTML = `<i class="fas fa-heart liked"></i>`;
                } else {
                    likeBtn.innerHTML = `<i class="fas fa-heart"></i>`;
                }
            }
        });

        db.ref(`movie_comments/${s.id}`).on('value', (snapshot) => {
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
            db.ref(`subscribers/${channelId}/${auth.currentUser.uid}`).on('value', (snapshot) => {
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
    setupDoubleTapListeners();
    bindFeelsVideoEvents();

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
            if (e.target.closest('.short-right-actions') || e.target.closest('.short-bottom-info') || e.target.closest('.short-progress-container')) {
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

function bindFeelsVideoEvents() {
    document.querySelectorAll('.short-slide').forEach(slide => {
        const video = slide.querySelector('video');
        if (!video) return;
        const shortId = slide.getAttribute('data-shortid');

        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.style.background = 'transparent';

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
                likeBtn.innerHTML = `<i class="fas fa-heart liked"></i>`;
            } else {
                likeBtn.innerHTML = `<i class="fas fa-heart"></i>`;
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

function openShortComments(shortId) {
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
            userSubRef.set(true);
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

function refreshFeelsQualityMenu(shortId, video) {
    const select = document.getElementById(`short-quality-${shortId}`);
    if (!select) return;
    select.innerHTML = '<option value="0">Original</option>';
    select.value = '0';
}

function setFeelsQuality(shortId, value) {
    const video = document.getElementById(`slide-short-${shortId}`)?.querySelector('video');
    if (video) refreshFeelsQualityMenu(shortId, video);
}

function refreshPublishedSources(items) {
    const byId = new Map(items.map(item => [String(item.id), item]));
    if (currentActiveMovie && byId.has(String(currentActiveMovie.id))) Object.assign(currentActiveMovie, byId.get(String(currentActiveMovie.id)));
    document.querySelectorAll('.short-video-el, #fly-video').forEach(video => {
        const item = byId.get(video._flaynityContentId);
        if (!item || !item.videoUrl) return;
        video._flaynityItem = { ...item };
        const nextUrl = normalizeFlaynityMediaUrl(item.videoUrl);
        if (video.src !== nextUrl) { video.src = nextUrl; video.load(); }
    });
}

function attachSmartAdaptiveSource(videoElement, url, shortId) {
    if (!videoElement || !url) return;
    const item = shortId === 'fly_main' ? currentActiveMovie : allFeels.find(s => String(s.id) === String(shortId));
    videoElement._flaynityContentId = item ? String(item.id) : '';
    videoElement._flaynityItem = item ? { ...item } : null;
    preserveVideoFrame(videoElement);
    const normalizedUrl = normalizeFlaynityMediaUrl(item?.videoUrl || url);
    videoElement.preload = shortId === 'fly_main' ? 'auto' : 'metadata';
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
    const total = allFeels.length;
    if (!total) return;
    let launched = 0;
    const pump = () => {
        if (generation !== feelsWarmGeneration || launched >= FEELS_WARM_AHEAD) return;
        const idx = (activeIndex + 1 + launched) % total;
        const s = allFeels[idx];
        launched++;
        if (s?.videoLink) warmFeelRange(s.videoLink, s.id, generation);
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
            if (!video.getAttribute('src')) {
                attachSmartAdaptiveSource(video, s.videoLink, shortId);
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
                        db.ref(`movie_stats/${shortId}/views/${userId}`).set(true);
                    }

                    video.ontimeupdate = () => {
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
    'flay-pay': 'service/flay-pay.html'
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
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            html = await response.text();
            try { localStorage.setItem(PREMIUM_SERVICE_CACHE_PREFIX + serviceId, html); } catch (e) {}
        } catch (e) {
            try { html = localStorage.getItem(PREMIUM_SERVICE_CACHE_PREFIX + serviceId); } catch (err) {}
            if (!html) throw e;
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
        showNotification('This page is unavailable offline. Open it once while online to save it for offline use.', 'error', 3000);
        return null;
    });
}

// =========================================================
// HIGH PERFORMANCE UNIVERSAL BACK NAVIGATION ENGINE
// =========================================================
const AppNavigation = {
    stack: [{ type: 'tab', id: 'home' }],

    pushTab: function(tabId) {
        const current = this.current();
        if (current && current.type === 'tab' && current.id === tabId) {
            return;
        }
        this.stack.push({ type: 'tab', id: tabId });
        this.syncUI();
        this.updateBridge();
    },

    pushPage: function(pageId) {
        const current = this.current();
        if (current && current.type === 'page' && current.id === pageId) {
            return;
        }
        this.stack.push({ type: 'page', id: pageId });
        this.syncUI();
        this.updateBridge();
    },

    pushPremiumService: function(serviceId, paymentService) {
        const current = this.current();
        if (current && current.type === 'page' && current.id === serviceId + '-page') {
            this.syncUI();
            return Promise.resolve(document.getElementById(serviceId + '-page'));
        }
        this.stack.push({ type: 'page', id: serviceId + '-page', premiumService: serviceId, paymentService: paymentService || null });
        if (serviceId === 'flay-pay') window.__flaynityPremiumPayService = paymentService || null;
        this.syncUI();
        this.updateBridge();
        return __flaynityOpenPremiumService(serviceId);
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
            style.textContent = '.fullscreen-page.you-direct-page { animation: none !important; transform: none !important; }';
            document.head.appendChild(style);
        }
        document.querySelectorAll('.fullscreen-page').forEach(el => {
            el.classList.remove('you-direct-page');
        });
        document.querySelectorAll('.fullscreen-page, .premium-download-modal').forEach(el => {
            el.style.display = 'none';
        });
        const moviePage = document.getElementById('full-movie-page');
        if (moviePage) moviePage.style.display = 'none';
        
        const themeMenu = document.getElementById('theme-popup-menu');
        if (themeMenu) themeMenu.style.display = 'none';

        const imagePreview = document.getElementById('full-image-preview-overlay');
        if (imagePreview) imagePreview.style.display = 'none';

        const reactionPicker = document.getElementById('fb-reaction-picker');
        if (reactionPicker) reactionPicker.style.display = 'none';

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

        // Any page opened from You should appear instantly instead of sliding in.
        if (activeTab === 'you' && activePage) {
            const directPage = document.getElementById(activePage);
            if (directPage) directPage.classList.add('you-direct-page');
        }

        document.querySelectorAll('.tab-content, .nav-item').forEach(el => el.classList.remove('active'));
        const tabEl = document.getElementById(`${activeTab}-tab`);
        const navEl = document.getElementById(`nav-${activeTab}`);
        if (tabEl) tabEl.classList.add('active');
        if (navEl) navEl.classList.add('active');

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
                if (moviePage) moviePage.style.display = 'block';
                document.body.style.overflow = 'hidden';
            } else {
                const targetId = activePage.endsWith('-page') ? activePage : (activePage + '-page');
                const pageEl = document.getElementById(targetId);
                if (pageEl) pageEl.style.display = 'flex';
                else {
                    const premiumId = Object.keys(PREMIUM_SERVICE_FILES).find(id => id + '-page' === targetId);
                    if (premiumId) __flaynityOpenPremiumService(premiumId);
                }
            }
        } else {
            document.body.style.overflow = 'auto';
            const container = document.getElementById('video-player-container');
            if (container) container.innerHTML = '';
            if (activeStatsRef) { activeStatsRef.off(); activeStatsRef = null; }
            if (activeCommentsRef) { activeCommentsRef.off(); activeCommentsRef = null; }
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
    },

    updateBridge: function() {
        const hasHistory = this.stack.length > 1;
        if (window.AndroidBridge && typeof window.AndroidBridge.setBackStackStatus === 'function') {
            window.AndroidBridge.setBackStackStatus(hasHistory);
        }
    }
};

function executeBackAction() {
    AppNavigation.pop();
}

// =========================================================
// MOVIE DETAILS, STATISTICS & COMMENTS
// =========================================================
async function openMoviePage(id, isTMDB = false) {
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

    // Show the watch page before starting playback. Android WebView can reject
    // autoplay/play() when the video element is still inside a display:none page.
    AppNavigation.pushPage('full-movie-page');
    
    startVideoPlayer();
    registerViewAndListen(currentActiveMovie.id);
    loadChannelMetaForWatchPage(currentActiveMovie.userId || currentActiveMovie.channelId);
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

    // YouTube/TMDB trailers → iframe (আগের মতোই, unchanged)
    if (link.includes('youtube.com') || link.includes('youtu.be')) {
        const ytId = extractVideoID(link);
        container.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1&modestbranding=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
        return;
    }

    // Flaynity CDN direct MP4 → custom YouTube-style player
    container.innerHTML = flyBuildPlayerHTML();
    flyInitPlayer(link);
}

function playNextRecommendedVideo() {
    const currentId = currentActiveMovie ? String(currentActiveMovie.id) : null;
    const availableVids = allLongVideos.filter(m => String(m.id) !== currentId);
    if (availableVids.length > 0) {
        openMoviePage(availableVids[0].id, false);
        showNotification(`Autoplay: Playing ${availableVids[0].title}`, "success");
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

function registerViewAndListen(movieId) {
    const userId = auth.currentUser ? auth.currentUser.uid : 'anonymous';
    
    if (userId !== 'anonymous' && navigator.onLine) {
        db.ref(`movie_stats/${movieId}/views/${userId}`).set(true);
    }

    let uploadTimeText = "Just Now"; 
    if (currentActiveMovie && currentActiveMovie.createdAt) {
        uploadTimeText = getRelativeTime(currentActiveMovie.createdAt);
    }
    const timeEl = document.getElementById('movie-detail-upload-time');
    if (timeEl) timeEl.innerText = uploadTimeText;

    if(!navigator.onLine) return;

    activeStatsRef = db.ref(`movie_stats/${movieId}`);
    activeStatsRef.on('value', (snapshot) => {
        const stats = snapshot.val() || {};
        const viewsObj = stats.views || {};
        const likesObj = stats.likes || {};
        const dislikesObj = stats.dislikes || {};

        const totalViews = Object.keys(viewsObj).length;
        const totalLikes = Object.keys(likesObj).length;

        const viewsEl = document.getElementById('movie-detail-views');
        const likesEl = document.getElementById('movie-detail-likes');
        const countEl = document.getElementById('movie-like-count');

        if (viewsEl) viewsEl.innerText = formatCount(totalViews) + " Views";
        if (likesEl) likesEl.innerText = formatCount(totalLikes) + " Likes";
        if (countEl) countEl.innerText = formatCount(totalLikes);

        const likeIcon = document.getElementById('movie-like-icon');
        const dislikeIcon = document.getElementById('movie-dislike-icon');
        
        if (auth.currentUser && likesObj[auth.currentUser.uid]) {
            if (likeIcon) likeIcon.className = "fas fa-thumbs-up";
        } else {
            if (likeIcon) likeIcon.className = "far fa-thumbs-up";
        }

        if (auth.currentUser && dislikesObj[auth.currentUser.uid]) {
            if (dislikeIcon) dislikeIcon.className = "fas fa-thumbs-down";
        } else {
            if (dislikeIcon) dislikeIcon.className = "far fa-thumbs-down";
        }
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
            await userSubRef.set(true);
            channelSubCountRef.transaction((currentCount) => {
                return (currentCount || 0) + 1;
            });
            showNotification("Subscribed to channel!", "success");
        }
    });
}

function toggleMovieLike() {
    playUI('click');
    if (!auth.currentUser) { showNotification("Please sign in to Like", "error"); return; }
    if (!currentActiveMovie) return;
    const userId = auth.currentUser.uid;
    const movieId = currentActiveMovie.id;
    
    const likeRef = db.ref(`movie_stats/${movieId}/likes/${userId}`);
    const dislikeRef = db.ref(`movie_stats/${movieId}/dislikes/${userId}`);
    
    likeRef.once('value', (snap) => {
        const op = snap.exists()
            ? likeRef.remove()
            : Promise.all([likeRef.set(true), dislikeRef.remove()]);
        op.catch(() => showNotification("Like update failed. Please try again.", "error"));
    });
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
        const op = snap.exists()
            ? dislikeRef.remove()
            : Promise.all([dislikeRef.set(true), likeRef.remove()]);
        op.catch(() => showNotification("Dislike update failed. Please try again.", "error"));
    });
}

function openCommentModal() {
    playUI('click');
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
    if (activeCommentsRef) { try { activeCommentsRef.off(); } catch(e) {} activeCommentsRef = null; }
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

function renderCommentList(commentsObj) {
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
    if (textEl) textEl.innerText = `${lastComment.username}: ${lastComment.text}`;
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

function renderMovieWatchRecommendedFeed() {
    const container = document.getElementById('yt-related-list');
    if (!container) return;

    let html = '';
    const currentId = currentActiveMovie ? String(currentActiveMovie.id) : null;
    
    const longvids = allLongVideos.filter(m => String(m.id) !== currentId);

    if (longvids.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 20px 0;">No recommendations found.</p>`;
        return;
    }

    longvids.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const limit = Math.min(longvids.length, watchRecommendedLimit);
    const itemsToRender = longvids.slice(0, limit);

    const uniqueUserIds = new Set();

    itemsToRender.forEach(v => {
        const viewsId = `rec-long-views-${v.id}`;
        const relTime = getRelativeTime(v.createdAt);
        
        if (v.userId) uniqueUserIds.add(v.userId);
        
        const avatarHtml = `<div class="live-avatar-${v.userId}" style="width:36px; height:36px; border-radius:50%; overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0;"></div>`;

        html += `
            <div class="long-video-feed-card" onclick="openMoviePage('${v.id}', false)" style="margin-bottom: 24px; cursor: pointer; background: var(--surface); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border); box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
                <div class="long-video-thumb-container" style="position: relative; aspect-ratio: 16/9; background: #0F0F0F; overflow: hidden;">
                    <img src="${v.poster}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
                    <span class="long-video-duration" style="position: absolute; bottom: 8px; right: 8px; background: rgba(0, 0, 0, 0.85); color: #fff; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-weight: 800;">${v.duration || '10:00'}</span>
                </div>
                <div class="long-video-details" style="padding: 14px 16px; display: flex; gap: 12px;">
                    ${avatarHtml}
                    <div class="long-video-meta-text" style="flex-grow: 1; min-width: 0;">
                        <h4 class="long-video-title" style="font-size: 0.95rem; font-weight: 800; color: var(--text-main); margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(v.title)}</h4>
                        <div class="long-video-subtitle" style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; display: flex; flex-wrap: wrap; align-items: center; gap: 4px;">
                            <span class="live-username-${v.userId}">${escapeHTML(v.username || 'Flaynity User')}</span>
                            <span>•</span>
                            <span id="${viewsId}">0 Views</span>
                            <span>•</span>
                            <span>${relTime}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if(navigator.onLine) {
            db.ref(`movie_stats/${v.id}/views`).once('value', (vSnap) => {
                const viewsObj = vSnap.val() || {};
                const count = Object.keys(viewsObj).length;
                const label = document.getElementById(viewsId);
                if (label) label.innerText = formatCount(count) + " Views";
            });
        }
    });

    container.innerHTML = html;
    uniqueUserIds.forEach(uid => bindLiveChannelUI(uid));
}

function escapeHTML(str) {
    if(!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// =========================================
// NAVIGATION & DISCOVER TAB
// =========================================
function switchTab(tabId) {
    playUI('click');
    document.querySelectorAll('.short-video-el').forEach(vid => vid.pause());
    AppNavigation.pushTab(tabId);
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

    // Home feed: keep the header/category bar at their original on-screen
    // coordinates, but make them normal document-flow elements so native
    // scrolling moves them with the feed at exactly the user's scroll speed.
    if (tabId === 'home') {
        document.body.style.paddingTop = '0px';
        header.style.position = 'absolute';
        header.style.top = '0px';
        if (chips) {
            chips.style.display = 'grid';
            chips.style.position = 'absolute';
            chips.style.top = '82px';
        }
        const homeTab = document.getElementById('home-tab');
        if (homeTab) homeTab.style.paddingTop = '126px';
    } else {
        document.body.style.paddingTop = '126px';
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
        if (brand) brand.style.display = 'none';
        if (actions) {
            actions.innerHTML = `
                <button id="theme-toggle-btn" class="appbar-theme-btn" onclick="openThemePopupMenu()" title="Switch Theme" style="background: none; border: none; font-size: 1.25rem; color: var(--text-main); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%;">
                </button>
                <button class="btn-switch-account-header" onclick="openAccountSwitcher()" title="Switch Account">
                    <i class="fas fa-exchange-alt"></i> Switch Account
                </button>
            `;
        }
    } else {
        if (brand) brand.style.display = 'flex';
        if (actions) {
            actions.innerHTML = `
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
    if (!user) return;

    if (!navigator.onLine) {
        if (currentChannelData) {
            renderYouTabWithData(currentChannelData, user, wrap);
        } else {
            wrap.innerHTML = `<div class="skel-box" style="width: 100%; height: 48px; border-radius: 20px;"></div>`;
        }
        return;
    }

    db.ref(`channels/${user.uid}`).once('value', (snapshot) => {
        currentChannelData = snapshot.val();
        if (currentChannelData) {
            localStorage.setItem('flaynity_user_session_cache', JSON.stringify(currentChannelData));
        }
        renderYouTabWithData(currentChannelData, user, wrap);
    });
}

function renderYouTabWithData(data, user, wrap) {
    const youAvatarLarge = document.getElementById('you-avatar-large');
    const youFullNameTxt = document.getElementById('you-fullname-txt');
    const youEmailTxt = document.getElementById('you-email-txt');

    if (data) {
        const channelName = data.channelName;
        const channelHandle = "@" + data.handle;
        const channelAvatar = data.avatarUrl || user.photoURL || '';

        if (youFullNameTxt) youFullNameTxt.innerText = channelName;
        if (youEmailTxt) {
            youEmailTxt.innerText = channelHandle;
            youEmailTxt.style.color = "var(--primary)";
            youEmailTxt.style.fontWeight = "800";
        }

        if (youAvatarLarge) {
            if (channelAvatar) {
                youAvatarLarge.innerHTML = `<img src="${channelAvatar}" style="width:100%; height:100%; object-fit:cover;">`;
            } else {
                youAvatarLarge.innerHTML = channelName.charAt(0).toUpperCase();
            }
        }

        wrap.innerHTML = `
            <button class="btn-view-channel" onclick="openViewChannelPage()">
                <i class="fas fa-tv"></i> View Channel 
                <i class="fas fa-chevron-right" style="margin-left: auto;"></i>
            </button>
        `;
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
    tempCreateAvatarUrl = "";
    const avatarImg = document.getElementById('create-avatar-img');
    const placeholder = document.getElementById('create-avatar-placeholder');
    const chName = document.getElementById('create-channel-name');
    const chHandle = document.getElementById('create-channel-handle');
    const counter = document.getElementById('create-name-counter');
    const feedback = document.getElementById('create-handle-feedback');
    const submitBtn = document.getElementById('btn-submit-create');

    if (avatarImg) avatarImg.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (chName) chName.value = "";
    if (chHandle) chHandle.value = "";
    if (counter) counter.innerText = "0";
    if (feedback) feedback.innerHTML = "";
    if (submitBtn) submitBtn.disabled = true;

    AppNavigation.pushPage('create-channel-page');
}

function triggerAvatarSelection(mode) {
    playUI('click');
    const id = mode === 'create' ? 'create-avatar-input' : 'edit-avatar-input';
    const input = document.getElementById(id);
    if (input) input.click();
}

function triggerBannerSelection() {
    playUI('click');
    const input = document.getElementById('edit-banner-input');
    if (input) input.click();
}

async function handleChannelAvatarSelect(e, mode) {
    const file = e.target.files[0];
    if (!file) return;
    
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

async function handleChannelBannerSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    showNotification("Uploading channel banner...", "success");
    try {
        const secureUrl = await uploadImageToR2(file, "banners");
        tempEditBannerUrl = secureUrl;
        const banner = document.getElementById('edit-channel-banner-img');
        if (banner) banner.src = secureUrl;
        showNotification("Banner uploaded successfully!", "success");
    } catch(err) {
        showNotification("Failed to upload banner.", "error");
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

/* Settings bottom-sheet handlers for dynamically loaded You page. */
function openBottomSheet(sheetId) {
    const overlay = document.getElementById(sheetId);
    if (!overlay) return;
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
    setTimeout(() => closeBottomSheet(sheetId), 220);
}

function selectThemeOption(element, sheetId) {
    const theme = element ? element.getAttribute('data-value') : null;
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        try { localStorage.setItem('flaynity-theme', 'dark'); } catch (e) {}
    } else {
        document.documentElement.removeAttribute('data-theme');
        try { localStorage.setItem('flaynity-theme', 'light'); } catch (e) {}
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

function openViewChannelPage() {
    ensureLiveUploadStyles();
    playUI('click');
    let data = currentChannelData;
    if (!data) return;

    const viewTitle = document.getElementById('view-appbar-title');
    const viewBanner = document.getElementById('view-channel-banner');
    const viewAvatar = document.getElementById('view-channel-avatar');
    const viewName = document.getElementById('view-channel-name-txt');
    const viewHandle = document.getElementById('view-channel-handle-txt');
    const viewDesc = document.getElementById('view-channel-desc');
    const viewSub = document.getElementById('view-sub-count');

    if (viewTitle) viewTitle.innerText = data.channelName;
    if (viewBanner) viewBanner.src = data.bannerUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2000&auto=format&fit=crop";
    if (viewAvatar) viewAvatar.src = data.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=300&auto=format&fit=crop";
    if (viewName) viewName.innerText = data.channelName;
    if (viewHandle) viewHandle.innerText = "@" + data.handle;
    if (viewDesc) viewDesc.innerText = data.description || "No description provided yet.";
    if (viewSub) viewSub.innerText = formatCount(data.subscribersCount) + " Subscriber" + (data.subscribersCount === 1 ? "" : "s");

    switchChannelTab('videos');
    AppNavigation.pushPage('view-channel-page');
    startLiveChannelUploadRefresh();
    setTimeout(() => renderChannelUploadQueue('videos'), 120);
    setTimeout(() => renderChannelUploadQueue('feels'), 120);
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

    let targetId = auth.currentUser.uid;
    if (type === 'videos') renderChannelVideos(targetId);
    else if (type === 'feels') renderChannelFeels(targetId);
    else if (type === 'posts') renderChannelPosts(targetId);
}

function buildChannelVideoCard(v) {
    return `
        <div class="channel-video-card-long" onclick="openMoviePage('${v.id}', false)">
            <div class="video-card-thumb-wrap">
                <img src="${v.poster}">
                <span class="video-card-duration">${v.duration || '10:00'}</span>
            </div>
            <div class="video-card-meta-long">
                <h4>${escapeHTML(v.title)}</h4>
                <p>
                    <span id="chan-vid-views-${v.id}">${formatCount(v.views || 0)} Views</span>
                    <span class="dot-separator">•</span>
                    <span>${getRelativeTime(v.createdAt)}</span>
                </p>
            </div>
        </div>
    `;
}

function buildChannelShortCard(s) {
    return `
        <div class="feels-grid-card" onclick="openMoviePage('${s.id}', false)">
            <img src="${s.poster}">
            <div class="feels-grid-views">
                <i class="fas fa-play"></i>
                <span id="chan-short-views-${s.id}">${formatCount(s.views || 0)}</span>
            </div>
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

function renderChannelVideos(userId) {
    const grid = document.getElementById('channel-videos-grid');
    if (!grid) return;
    if (activeChannelVideosListener) { activeChannelVideosListener.off(); }
    
    activeChannelVideosListener = db.ref('admin_panel/movies/user_uploads');
    activeChannelVideosListener.on('value', (snap) => {
        const data = snap.val();
        if (!data) {
            grid.innerHTML = `<p style="text-align:center; color:var(--text-muted); margin-top:20px;">No uploaded videos yet.</p>`;
            const vidCount = document.getElementById('view-vid-count');
            if (vidCount) vidCount.innerText = "0 Videos";
            renderChannelUploadQueue('videos');
            return;
        }

        const list = Object.values(data).filter(m => m.userId === userId && !m.isShort);
        const vidCount = document.getElementById('view-vid-count');
        if (vidCount) vidCount.innerText = list.length + " Video" + (list.length === 1 ? "" : "s");

        if (list.length === 0) {
            grid.innerHTML = `<p style="text-align:center; color:var(--text-muted); margin-top:20px;">No uploaded videos yet.</p>`;
            renderChannelUploadQueue('videos');
            return;
        }

        grid.innerHTML = list.map(m => buildChannelVideoCard({
            id: m.id,
            title: m.title,
            duration: m.duration || "10:00", 
            views: 0, 
            poster: m.poster,
            createdAt: m.createdAt
        })).join('');

        renderChannelUploadQueue('videos');

        if(navigator.onLine) {
            list.forEach(m => {
                db.ref(`movie_stats/${m.id}/views`).once('value', (vSnap) => {
                    const viewsObj = vSnap.val() || {};
                    const count = Object.keys(viewsObj).length;
                    const label = document.getElementById(`chan-vid-views-${m.id}`);
                    if (label) label.innerText = formatCount(count) + " Views";
                });
            });
        }
    });
}

function renderChannelFeels(userId) {
    const grid = document.getElementById('channel-feels-grid');
    if (!grid) return;
    if (activeChannelFeelsListener) { activeChannelFeelsListener.off(); }

    activeChannelFeelsListener = db.ref('admin_panel/movies/feels');
    activeChannelFeelsListener.on('value', (snap) => {
        const data = snap.val();
        if (!data) {
            grid.innerHTML = `<p style="text-align:center; color:var(--text-muted); grid-column: 1/-1; margin-top:20px;">No feels uploaded yet.</p>`;
            renderChannelUploadQueue('feels');
            return;
        }

        const list = Object.values(data).filter(m => m.userId === userId);
        if (list.length === 0) {
            grid.innerHTML = `<p style="text-align:center; color:var(--text-muted); grid-column: 1/-1; margin-top:20px;">No feels uploaded yet.</p>`;
            renderChannelUploadQueue('feels');
            return;
        }

        grid.innerHTML = list.map(m => buildChannelShortCard({
            id: m.id,
            poster: m.poster,
            views: 0
        })).join('');

        renderChannelUploadQueue('feels');

        if(navigator.onLine) {
            list.forEach(m => {
                db.ref(`movie_stats/${m.id}/views`).once('value', (vSnap) => {
                    const viewsObj = vSnap.val() || {};
                    const count = Object.keys(viewsObj).length;
                    const label = document.getElementById(`chan-short-views-${m.id}`);
                    if (label) label.innerText = formatCount(count);
                });
            });
        }
    });
}

function renderChannelPosts(userId) {
    const grid = document.getElementById('channel-posts-feed');
    if (!grid) return;
    if (activeChannelPostsListener) { activeChannelPostsListener.off(); }

    activeChannelPostsListener = db.ref('admin_panel/posts');
    activeChannelPostsListener.on('value', (snap) => {
        const data = snap.val();
        if (!data) {
            grid.innerHTML = `<p style="text-align:center; color:var(--text-muted); margin-top:20px;">No posts yet.</p>`;
            return;
        }

        const list = Object.values(data).filter(p => p.userId === userId);
        if (list.length === 0) {
            grid.innerHTML = `<p style="text-align:center; color:var(--text-muted); margin-top:20px;">No posts yet.</p>`;
            return;
        }

        grid.innerHTML = list.map(p => buildChannelPostCard({
            id: p.id,
            caption: p.caption,
            images: p.images || [],
            likes: 0,
            comments: 0,
            createdAt: p.createdAt
        }, p.username)).join('');
    });
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
    AppNavigation.pushModal('account-switcher-modal');
    renderAccountSwitcherList();
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
    if (window.AndroidBridge && typeof window.AndroidBridge.triggerGoogleSignIn === 'function') {
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
        } catch (err) {
            showNotification("Failed to switch: " + err.message, "error");
        }
    }
}

async function handleAddAccountGoogle() {
    playUI('click');
    showNotification("Opening Google Sign-In...", "success");
    if (window.AndroidBridge && typeof window.AndroidBridge.triggerGoogleSignIn === 'function') {
        window.AndroidBridge.triggerGoogleSignIn();
        AppNavigation.pop();
    } else {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await auth.signInWithPopup(provider); 
            saveAccountToList(result.user);
            showNotification("Google Sign-In Successful!", "success"); 
        } catch (err) { 
            showNotification(err.message, "error"); 
        }
    }
}

function updateBottomNavAvatar() {
    const navAvatarContainer = document.getElementById('nav-avatar-img');
    if (!navAvatarContainer) return;
    const currentUser = auth.currentUser;
    if (currentUser) {
        const photoURL = currentUser.photoURL || '';
        if (photoURL) {
            navAvatarContainer.innerHTML = `<img src="${photoURL}" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            navAvatarContainer.innerHTML = `<div style="background: linear-gradient(135deg, var(--primary), #FF7A00); color: white; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.75rem;">${currentUser.email ? currentUser.email.charAt(0).toUpperCase() : 'U'}</div>`;
        }
    } else {
        navAvatarContainer.innerHTML = `
            <svg class="nav-icon-svg icon-unselected" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" fill="currentColor"/>
            </svg>
        `;
    }
}

function openAnalyticsPage() {
    playUI('click');
    calculateChannelAnalytics();
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

        const updatedData = {
            ...currentChannelData,
            channelName: name,
            handle: handle,
            description: desc,
            category: category,
            avatarUrl: tempEditAvatarUrl,
            bannerUrl: tempEditBannerUrl,
            updatedDate: Date.now()
        };

        await db.ref(`channels/${auth.currentUser.uid}`).set(updatedData);
        currentChannelData = updatedData;

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
let reactionActivePostId = null;
let reactionTimer = null;

function startReactionTimer(postId, e) {
    reactionActivePostId = postId;
    clearTimeout(reactionTimer);
    reactionTimer = setTimeout(() => {
        showReactionPicker(postId, e);
    }, 500); 
}

function clearReactionTimer(postId, e) {
    clearTimeout(reactionTimer);
}

function showReactionPicker(postId, e) {
    playUI('click');
    const picker = document.getElementById('fb-reaction-picker');
    if (!picker) return;

    let clientX = 0, clientY = 0;
    if (e.touches && e.touches[0]) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    picker.style.left = `${Math.max(16, Math.min(window.innerWidth - 320, clientX - 140))}px`; 
    picker.style.top = `${clientY - 75}px`;
    picker.dataset.postId = postId;
    
    picker.classList.remove('picker-pop-active');
    void picker.offsetWidth; 
    picker.classList.add('picker-pop-active');

    AppNavigation.pushModal('fb-reaction-picker');
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
    if (!postId) return;

    AppNavigation.pop(); 
    submitPostReaction(postId, type);
}

function handleLoveSingleClick(postId) {
    if (!auth.currentUser) {
        showNotification("Please sign in to react", "error");
        return;
    }
    if(!navigator.onLine) {
        showNotification("Cannot react to posts while offline.", "error");
        return;
    }
    const userId = auth.currentUser.uid;
    db.ref(`post_reactions/${postId}/${userId}`).once('value', (snap) => {
        if (snap.exists() && snap.val().type === 'love') {
            db.ref(`post_reactions/${postId}/${userId}`).remove();
        } else {
            submitPostReaction(postId, 'love');
        }
    });
}

async function submitPostReaction(postId, type) {
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

    triggerFloatingReaction(type);
}

function triggerFloatingReaction(type) {
    const emoji = reactionEmojis[type];
    if (!emoji) return;

    const floatEl = document.createElement('div');
    floatEl.className = 'floating-emoji';
    floatEl.innerText = emoji;
    floatEl.style.left = `${window.innerWidth / 2 - 20}px`;
    floatEl.style.top = `${window.innerHeight - 150}px`;

    document.body.appendChild(floatEl);
    triggerHapticFeedback();

    setTimeout(() => { floatEl.remove(); }, 1200);
}

function registerPostReactionsListener(postId) {
    if (_boundPostReactionListeners[postId]) return;
    _boundPostReactionListeners[postId] = true;

    db.ref(`post_reactions/${postId}`).on('value', (snapshot) => {
        const reactions = snapshot.val() || {};
        const totalReactions = Object.keys(reactions).length;
        
        const reactionCounts = { love: 0, like: 0, care: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
        Object.values(reactions).forEach(r => {
            if (r && r.type && reactionCounts[r.type] !== undefined) {
                reactionCounts[r.type]++;
            }
        });

        const sortedTypes = Object.keys(reactionCounts)
            .filter(t => reactionCounts[t] > 0)
            .sort((a,b) => reactionCounts[b] - reactionCounts[a])
            .slice(0, 3);

        const topEmojisEl = document.getElementById(`post-top-emojis-${postId}`);
        if (topEmojisEl) {
            topEmojisEl.innerHTML = sortedTypes.map(t => reactionEmojis[t]).join('');
        }

        const totalReactionsEl = document.getElementById(`post-total-reactions-${postId}`);
        if (totalReactionsEl) {
            totalReactionsEl.innerText = `${totalReactions} Reaction${totalReactions === 1 ? '' : 's'}`;
        }

        const loveBtn = document.getElementById(`post-love-btn-${postId}`);
        const loveIcon = document.getElementById(`love-icon-${postId}`);
        const loveText = document.getElementById(`love-text-${postId}`);

        if (loveBtn && auth.currentUser) {
            const myReact = reactions[auth.currentUser.uid];
            if (myReact) {
                const type = myReact.type;
                if (loveIcon) {
                    loveIcon.className = 'love-icon-element';
                    loveIcon.innerText = reactionEmojis[type];
                    loveIcon.style.fontSize = '1.25rem';
                }
                if (loveText) {
                    loveText.innerText = reactionLabels[type];
                    loveText.style.color = reactionColors[type];
                }
            } else {
                if (loveIcon) {
                    loveIcon.className = 'far fa-heart love-icon-element';
                    loveIcon.innerText = '';
                    loveIcon.style.fontSize = '';
                }
                if (loveText) {
                    loveText.innerText = 'Love';
                    loveText.style.color = '';
                }
            }
        }
    });

    db.ref(`movie_comments/${postId}`).on('value', (snapshot) => {
        const comments = snapshot.val() || {};
        const totalComments = Object.keys(comments).length;
        const totalCommentsEl = document.getElementById(`post-total-comments-${postId}`);
        if (totalCommentsEl) {
            totalCommentsEl.innerText = `${totalComments} Comment${totalComments === 1 ? '' : 's'}`;
        }
    });
}

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
        studio.style.display = 'flex';
        studio.style.opacity = 0;
        requestAnimationFrame(() => {
            studio.style.transition = 'opacity 0.3s ease';
            studio.style.opacity = 1;
        });
        setupModeSliderSwipe();
        switchUploadMode('short');
    }
}

function closePremiumUploadStudio() {
    playUI('click');
    document.querySelectorAll('#video-preview-el, #short-preview-el').forEach(v => v.pause()); // Background play fix
    const studio = document.getElementById('premium-upload-studio');
    if (studio) {
        studio.style.opacity = 0;
        setTimeout(() => {
            studio.style.display = 'none';
            stopCameraRecording(); // Stop if recording
            stopShortCamera();
        }, 300);
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
    
    document.getElementById('upload-video-view').style.display = mode === 'video' ? 'flex' : 'none';
    document.getElementById('upload-short-view').style.display = mode === 'short' ? 'flex' : 'none';
    document.getElementById('upload-post-view').style.display = mode === 'post' ? 'flex' : 'none';

    if (mode === 'short') startShortCamera();
    else stopShortCamera();
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
    
    const url = URL.createObjectURL(currentUploadFile);
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
    const file = e.target && e.target.files ? e.target.files[0] : (e.files ? e.files[0] : null);
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
    showNotification("Processing Video...", "success");

    try {
        currentUploadFrameMeta = await captureFrameAndDuration(file);
    } catch (err) {
        currentUploadFrameMeta = { duration: 60, dataUrl: "", blob: null };
    }

    // Auto switch to short if duration is less than 3 minutes (180s)
    if (type === 'video-long' && currentUploadFrameMeta.duration < 180) {
        showNotification("Video < 3 min! Automatically switching to Short format.", "success");
        type = 'video-short';
        isShortFromCamera = false;
    }

    closePremiumUploadStudio(); 
    
    if (type === 'video-short') {
        const vidEl = document.getElementById('short-preview-el');
        if (vidEl) {
            vidEl.src = URL.createObjectURL(file);
            vidEl.playbackRate = currentRecordSpeed; 
        }
        
        const dlBtn = document.getElementById('short-preview-download-btn');
        if(dlBtn) dlBtn.style.display = isShortFromCamera ? 'flex' : 'none';
        
        // Full interactive trimmer for feels
        initShortTrimmer(vidEl, 'sp-trimmer-container', 'sp-trim-start', 'sp-trim-end', 'sp-trim-playhead', 'sp-time-display');
        AppNavigation.pushPage('short-preview-page');
    } else {
        const vidEl = document.getElementById('video-preview-el');
        if (vidEl) vidEl.src = URL.createObjectURL(file);
        
        // Timeline removed for video preview as requested
        AppNavigation.pushPage('video-preview-page');
    }
}

function handlePremiumImagesSelected(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    currentUploadFile = files[0];
    closePremiumUploadStudio();
    
    const imgEl = document.getElementById('post-preview-img');
    if (imgEl) imgEl.src = URL.createObjectURL(currentUploadFile);
    
    AppNavigation.pushPage('post-preview-page');
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

function gotoPremiumUploadDetails(type) {
    playUI('click');
    document.querySelectorAll('#video-preview-el, #short-preview-el').forEach(v => v.pause()); // Background play fix
    AppNavigation.pop(); 
    
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
    
    // Convert active trim percentage to actual duration if trimmed
    let finalDuration = currentUploadFrameMeta.duration;
    if (isShort && activeTrimEnd !== undefined && activeTrimStart !== undefined) {
        finalDuration = (activeTrimEnd - activeTrimStart) * currentUploadFrameMeta.duration;
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
        thumbDataUrl: currentUploadFrameMeta.dataUrl,
        thumbBlob: currentUploadFrameMeta.blob, 
        thumbKey: `uploads/${uniqueId}/thumbnail.jpg`,
        createdAt: Date.now(),
        scheduledTime: visibility === 'Schedule' && scheduleDate ? new Date(scheduleDate).getTime() : 0,
        control: { xhr: null, uploadUrl: "" }
    };

    uploadQueue.push(queueItem);
    saveQueueStateToLocalStorage(); 
    
    AppNavigation.pop();
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
        AppNavigation.pop(); 
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
    </div>`;
}

function flyInitPlayer(link){
    const v=document.getElementById('fly-video');
    const poster=document.getElementById('fly-poster');
    if(!v) return;
    flyCurrentSpeed=1; flySeekAccumRight=0; flySeekAccumLeft=0;

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
    v.ontimeupdate=flyUpdateProgress;
    v.onloadedmetadata=()=>{ flyUpdateProgress(); flyBuildQualityMenu(); };
    v.onprogress=flyUpdateProgress;
    v.onended=()=>playNextRecommendedVideo();

    // Progressive R2 recovery: one lightweight seek/reload retry if the browser
    // stalls after the initial range request. HLS has its own recovery logic.
    v.dataset.r2RecoveryCount='0';
    const recoverR2=()=>{
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
    try{ if(v.buffered.length){ const b=(v.buffered.end(v.buffered.length-1)/v.duration)*100; const be=document.getElementById('fly-progress-buffered'); if(be) be.style.width=b+'%'; } }catch(e){}
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

function flyBuildQualityMenu(){
    const list=document.getElementById('fly-quality-list');
    if(!list) return;
    list.innerHTML='<div class="fly-menu-item active"><span>Original</span><i class="fas fa-check"></i></div>';
}

function flySetQuality(height,label,e){
    if(e) e.stopPropagation();
    const lbl=document.getElementById('fly-quality-label');
    if(lbl) lbl.innerText='Original';
    flyBuildQualityMenu();
    flyCloseAllMenus(); flyResetHideTimer();
}

/* ---------- Fullscreen (শুধু player landscape) ---------- */
function flyToggleFullscreen(){
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

    bindMerged(videoPaths, 'videos');
    bindMerged(feelPaths, 'feels');
}

function openFullscreenSearch(withVoice = false) {
    const page = document.getElementById('fullscreen-search-page');
    const input = document.getElementById('search-active-input');
    if (!page) return;
    page.style.display = 'flex';
    if (input) input.focus();
    if (withVoice) startVoiceRecognition();
}

function closeFullscreenSearch() {
    const page = document.getElementById('fullscreen-search-page');
    if (!page) return;
    page.style.display = 'none';
    clearSearchInput(false);
    const suggestionsWrap = document.getElementById('search-suggestions-container');
    const resultsWrap = document.getElementById('search-results-container');
    if (suggestionsWrap) suggestionsWrap.innerHTML = '';
    if (resultsWrap) resultsWrap.style.display = 'none';
}

function handleSearchInput(query) {
    const clearBtn = document.getElementById('search-clear-btn');
    const micBtn = document.getElementById('search-mic-btn');
    const suggestionsWrap = document.getElementById('search-suggestions-container');
    const resultsWrap = document.getElementById('search-results-container');
    const trimmed = query.trim();

    if (trimmed.length > 0) {
        if (clearBtn) clearBtn.style.display = 'flex';
        if (micBtn) micBtn.style.display = 'none';
        if (resultsWrap) resultsWrap.style.display = 'none';
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => generateFirebaseSuggestions(trimmed), 250);
    } else {
        if (clearBtn) clearBtn.style.display = 'none';
        if (micBtn) micBtn.style.display = 'flex';
        if (suggestionsWrap) suggestionsWrap.innerHTML = '';
        if (resultsWrap) resultsWrap.style.display = 'none';
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

function generateFirebaseSuggestions(query) {
    const container = document.getElementById('search-suggestions-container');
    if (!container) return;
    const lowerQuery = query.toLowerCase();
    const suggestionsSet = new Set();
    const allItems = [...dbSearchCache.videos, ...dbSearchCache.feels];

    allItems.forEach(item => {
        const title = String(item.title || '').trim();
        const desc = String(item.description || '').trim();
        const fullText = `${title} ${desc}`.toLowerCase();
        if (fullText.includes(lowerQuery)) {
            if (title) suggestionsSet.add(title);
            if (title.toLowerCase().startsWith(lowerQuery)) suggestionsSet.add(title);
            else {
                suggestionsSet.add(`${query} Video`);
                suggestionsSet.add(`${query} Feels`);
                suggestionsSet.add(`New ${query}`);
            }
        }
    });

    if (suggestionsSet.size === 0) {
        suggestionsSet.add(query);
        suggestionsSet.add(`${query} Video`);
        suggestionsSet.add(`${query} Song`);
        suggestionsSet.add(`${query} Feels`);
    }

    const finalList = Array.from(suggestionsSet).slice(0, 8);
    container.innerHTML = finalList.map(keyword => `
        <div class="suggestion-item" onclick="selectSuggestedKeyword('${escapeHtml(keyword)}')">
            <div class="suggestion-left"><i class="fas fa-search"></i><span>${escapeHtml(keyword)}</span></div>
            <i class="fas fa-arrow-up arrow-icon"></i>
        </div>
    `).join('');
}

function selectSuggestedKeyword(keyword) {
    if (typeof playUI === 'function') playUI('click');
    const input = document.getElementById('search-active-input');
    if (input) input.value = keyword;
    executeFinalSearch(keyword);
}

function executeFinalSearch(keyword) {
    const query = String(keyword || '').trim().toLowerCase();
    if (!query) return;
    const suggestionsWrap = document.getElementById('search-suggestions-container');
    const resultsWrap = document.getElementById('search-results-container');
    if (suggestionsWrap) suggestionsWrap.innerHTML = '';
    if (resultsWrap) resultsWrap.style.display = 'flex';

    const feelsSec = document.getElementById('search-feels-section');
    const feelsGrid = document.getElementById('search-feels-results');
    const videosSec = document.getElementById('search-videos-section');
    const videosList = document.getElementById('search-videos-results');
    const noResult = document.getElementById('search-no-result');
    if (!feelsSec || !feelsGrid || !videosSec || !videosList || !noResult) return;

    feelsGrid.innerHTML = '';
    videosList.innerHTML = '';
    feelsSec.style.display = 'none';
    videosSec.style.display = 'none';
    noResult.style.display = 'none';

    const matchedFeels = dbSearchCache.feels.filter(f => `${f.title || ''} ${f.description || ''}`.toLowerCase().includes(query));
    const matchedVideos = dbSearchCache.videos.filter(v => `${v.title || ''} ${v.description || ''}`.toLowerCase().includes(query));

    if (matchedFeels.length > 0) {
        feelsSec.style.display = 'block';
        feelsGrid.innerHTML = matchedFeels.map(item => `
            <div class="feels-card-9-16" onclick="handleOpenFeel('${escapeHtml(String(item.id))}')">
                <img src="${escapeHtml(item.thumbnail || item.poster || '')}" alt="" onerror="this.src='assets/placeholder-feel.jpg'">
                <div class="feels-card-overlay"><h4>${escapeHtml(item.title || 'Untitled Feel')}</h4></div>
            </div>
        `).join('');
    }

    if (matchedVideos.length > 0) {
        videosSec.style.display = 'block';
        videosList.innerHTML = matchedVideos.map(item => `
            <div class="video-card-16-9" onclick="handleOpenVideo('${escapeHtml(String(item.id))}')">
                <img class="video-thumb-16-9" src="${escapeHtml(item.thumbnail || item.banner || item.poster || '')}" alt="" onerror="this.src='assets/placeholder-banner.jpg'">
                <div class="video-info-box">
                    <div class="video-title-txt">${escapeHtml(item.title || 'Untitled Video')}</div>
                    <div class="video-meta-txt">${escapeHtml(item.channelName || item.username || 'Flaynity')} • ${escapeHtml(String(item.views || '0'))} views</div>
                </div>
            </div>
        `).join('');
    }

    if (matchedFeels.length === 0 && matchedVideos.length === 0) noResult.style.display = 'block';
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
window.addEventListener('flaynity-dom-ready', initFlaynityDiscoverSearch);
