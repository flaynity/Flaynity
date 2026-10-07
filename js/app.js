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

// Home is loaded dynamically, so initialize Pull-to-Refresh again immediately
// after the Home DOM is mounted if the first DOM-ready attempt ran too early.
window.addEventListener('flaynity-dom-ready', initPullToRefresh);

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
    return activeTabId === 'home' && getMainScrollTop() <= 0;
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
    if (ptrIndicator) {
        ptrIndicator.style.setProperty('position', 'fixed', 'important');
        ptrIndicator.style.setProperty('top', '58px', 'important');
        ptrIndicator.style.setProperty('left', '50%', 'important');
        ptrIndicator.style.setProperty('width', '42px', 'important');
        ptrIndicator.style.setProperty('height', '42px', 'important');
        ptrIndicator.style.setProperty('display', 'flex', 'important');
        ptrIndicator.style.setProperty('align-items', 'center', 'important');
        ptrIndicator.style.setProperty('justify-content', 'center', 'important');
        ptrIndicator.style.setProperty('visibility', 'visible', 'important');
        ptrIndicator.style.setProperty('pointer-events', 'none', 'important');
        ptrIndicator.style.setProperty('background', 'var(--surface, #0F0F0F)', 'important');
        ptrIndicator.style.setProperty('border', '2px solid var(--primary, #FF1744)', 'important');
        ptrIndicator.style.setProperty('border-radius', '50%', 'important');
        ptrIndicator.style.setProperty('box-shadow', '0 4px 16px rgba(0,0,0,0.35)', 'important');
        ptrIndicator.style.setProperty('z-index', '2147483647', 'important');
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

        if (deltaY >= PTR_TRIGGER_DISTANCE && getMainScrollTop() <= 0 && isPTRAllowedOnCurrentView()) {
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
            <div class="long-video-feed-card" onclick="openMoviePage('${v.id}', false)" style="margin:0 -16px 12px -16px;width:calc(100% + 32px);cursor:pointer;background:var(--surface);border-radius:12px;overflow:hidden;">
                <div class="long-video-thumb-container" style="position:relative;width:100%;aspect-ratio:16/9;background:#0F0F0F;overflow:hidden;border-radius:12px;">
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