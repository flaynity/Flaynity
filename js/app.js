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
    ['home-feed-container','feels-swiper-container','search-results','you-posts-container',
     'you-videos-container','you-feels-container','channel-posts-container','channel-videos-container',
     'channel-feels-container','notifications-list','inbox-list','manager-items-list'].forEach(id => {
        const el = document.getElementById(id); if (el) el.innerHTML = '';
    });
    // Drop account-specific keys only; keep theme, language and the saved-account picker.
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i) || '';
            if (/^(flaynity_(user|profile|channel|feed|hidden|saved_posts|saved_videos|likes|follows|notifications|inbox|drafts|watch_history|recent_searches)_cache(?::|$)|^fx_hidden_(videos|channels)$)/i.test(key)) localStorage.removeItem(key);
        }
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


/* First-run Create Channel screen — mounted inside the Home app shell. */
(function installCreateChannelPage(){
    if (window.__flaynityCreateChannelInstalled) return;
    window.__flaynityCreateChannelInstalled = true;
    const esc = (s) => String(s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    window.showCreateChannelPage = async function(force){
        const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        if (!user) return;
        let channel = null;
        try { const snap = await db.ref('channels/' + user.uid).once('value'); channel = snap.val(); } catch(e) {}
        if (channel && !force) return;
        let root = document.getElementById('fl-create-channel');
        if (!root) {
            root = document.createElement('section');
            root.id = 'fl-create-channel';
            root.innerHTML = `
              <style>
                #fl-create-channel{position:fixed;inset:0;z-index:2147483000;background:#f7f7f9;color:#17171b;font-family:'Plus Jakarta Sans',sans-serif;overflow-y:auto;overscroll-behavior:contain;animation:flccIn .32s ease both}
                #fl-create-channel *{box-sizing:border-box}
                #fl-create-channel .flcc-banner{position:relative;width:100%;aspect-ratio:2.35/1;min-height:150px;max-height:260px;background:linear-gradient(135deg,#f9b5cf,#e8d9ff 55%,#ffd7c5);background-size:cover;background-position:center}
                #fl-create-channel .flcc-banner:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.28));pointer-events:none}
                #fl-create-channel .flcc-top{position:absolute;z-index:2;left:18px;right:18px;top:calc(env(safe-area-inset-top,0px) + 14px);display:flex;align-items:center;justify-content:space-between;gap:12px}
                #fl-create-channel .flcc-back,#fl-create-channel .flcc-change{border:1px solid rgba(255,255,255,.24);background:rgba(20,20,24,.56);color:#fff;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);height:42px;border-radius:24px;padding:0 15px;font:700 13px inherit;display:flex;align-items:center;gap:8px}
                #fl-create-channel .flcc-change{font-size:13px}
                #fl-create-channel .flcc-sheet{position:relative;margin-top:-22px;background:#f7f7f9;border-radius:25px 25px 0 0;padding:0 20px calc(26px + env(safe-area-inset-bottom,0px));min-height:calc(100% - 150px)}
                #fl-create-channel .flcc-avatar-wrap{height:116px;display:flex;justify-content:center;position:relative;margin-bottom:8px}
                #fl-create-channel .flcc-avatar{position:relative;margin-top:-54px;width:124px;height:124px;border:4px solid #f7f7f9;border-radius:50%;background:linear-gradient(145deg,#ff2c86,#c30049);display:grid;place-items:center;overflow:hidden;box-shadow:0 8px 22px rgba(25,10,20,.12)}
                #fl-create-channel .flcc-avatar img{width:100%;height:100%;object-fit:cover}
                #fl-create-channel .flcc-avatar button{position:absolute;inset:auto 0 0;height:38px;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:12px;font-weight:800}
                #fl-create-channel .flcc-title{text-align:center;margin:2px 0 5px;font-size:23px;letter-spacing:-.7px;font-weight:900}
                #fl-create-channel .flcc-sub{text-align:center;margin:0 auto 22px;color:#777781;font-size:12.5px;line-height:1.5;max-width:280px}
                #fl-create-channel .flcc-card{background:#fff;border:1px solid rgba(20,20,30,.045);border-radius:20px;padding:5px 16px;margin:0 0 14px;box-shadow:0 3px 15px rgba(20,20,30,.025)}
                #fl-create-channel .flcc-field{display:grid;grid-template-columns:88px minmax(0,1fr);gap:10px;align-items:start;padding:14px 0}
                #fl-create-channel .flcc-field+.flcc-field{border-top:1px solid #f0f0f3}
                #fl-create-channel label{font-size:13px;color:#6e6e77;padding-top:10px;font-weight:600}
                #fl-create-channel input,#fl-create-channel textarea,#fl-create-channel select{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#18181c;font:600 14px 'Plus Jakarta Sans',sans-serif;padding:8px 0;resize:vertical}
                #fl-create-channel input::placeholder,#fl-create-channel textarea::placeholder{color:#aaaab2;font-weight:500}
                #fl-create-channel .flcc-section{font-size:13px;color:#81818a;margin:23px 4px 10px;font-weight:800}
                #fl-create-channel .flcc-info{display:flex;align-items:center;gap:13px;padding:13px 12px;min-height:65px}
                #fl-create-channel .flcc-ico{width:38px;height:38px;border-radius:13px;display:grid;place-items:center;background:#fff0f6;color:#e81768;font-size:19px;flex:0 0 auto}
                #fl-create-channel .flcc-info label{display:block;padding:0;color:#202027;font-size:13px;font-weight:800}
                #fl-create-channel .flcc-info select,#fl-create-channel .flcc-info input{padding:5px 0 0;font-size:12.5px;color:#777}
                #fl-create-channel .flcc-submit{width:100%;height:57px;border:0;border-radius:30px;background:linear-gradient(100deg,#ff2b83,#f0004f);color:#fff;font:800 16px 'Plus Jakarta Sans',sans-serif;margin:12px 0 0;box-shadow:0 8px 20px rgba(240,0,79,.18);transition:transform .16s,opacity .16s}
                #fl-create-channel .flcc-submit:active{transform:scale(.985)} #fl-create-channel .flcc-submit:disabled{opacity:.55}
                #fl-create-channel .flcc-terms{text-align:center;color:#777781;font-size:10.5px;line-height:1.6;margin:12px 12px 0}
                #fl-create-channel .flcc-status{font-size:12px;text-align:center;color:#777;margin:8px 0;min-height:16px}
                @keyframes flccIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
                @media(prefers-reduced-motion:reduce){#fl-create-channel{animation:none}}
              </style>
              <div class="flcc-banner" id="flcc-banner">
                <div class="flcc-top"><button class="flcc-back" type="button" id="flcc-back" aria-label="Back">‹</button><button class="flcc-change" type="button" id="flcc-change">Change background</button></div>
              </div>
              <div class="flcc-sheet">
                <div class="flcc-avatar-wrap"><div class="flcc-avatar" id="flcc-avatar"><span style="font-size:36px;color:#fff"><i class="fa-solid fa-camera"></i></span><button type="button" id="flcc-avatar-pick">Add photo</button></div></div>
                <h1 class="flcc-title">Create your Channel</h1><p class="flcc-sub">Make your space yours. Add a name, image and a little information to get started.</p>
                <div class="flcc-card">
                  <div class="flcc-field"><label for="flcc-name">Name</label><input id="flcc-name" maxlength="50" placeholder="Your channel name" autocomplete="nickname"></div>
                  <div class="flcc-field"><label for="flcc-handle">Username</label><input id="flcc-handle" maxlength="24" placeholder="yourusername" autocapitalize="none" autocomplete="off"></div>
                </div>
                <div class="flcc-card"><div class="flcc-field"><label for="flcc-bio">Bio</label><textarea id="flcc-bio" maxlength="180" rows="3" placeholder="Write a short description about who you are or what your account is about"></textarea></div></div>
                <div class="flcc-section">Basic info</div>
                <div class="flcc-card">
                  <div class="flcc-info"><span class="flcc-ico"><i class="fa-solid fa-shapes"></i></span><div style="flex:1;min-width:0"><label for="flcc-category">Category</label><select id="flcc-category"><option value="">Select category</option><option>Creator</option><option>Entertainment</option><option>Education</option><option>Gaming</option><option>Music</option><option>Technology</option><option>Business</option><option>Personal</option><option>Other</option></select></div></div>
                  <div class="flcc-info"><span class="flcc-ico"><i class="fa-regular fa-envelope"></i></span><div style="flex:1;min-width:0"><label>Email</label><input id="flcc-email" type="email" readonly></div></div>
                  <div class="flcc-info"><span class="flcc-ico"><i class="fa-solid fa-globe"></i></span><div style="flex:1;min-width:0"><label for="flcc-country">Country</label><input id="flcc-country" maxlength="60" placeholder="Select country"></div></div>
                  <div class="flcc-info"><span class="flcc-ico"><i class="fa-regular fa-calendar"></i></span><div style="flex:1;min-width:0"><label for="flcc-dob">Date of Birth</label><input id="flcc-dob" type="date"></div></div>
                  <div class="flcc-info"><span class="flcc-ico"><i class="fa-solid fa-venus-mars"></i></span><div style="flex:1;min-width:0"><label for="flcc-gender">Gender</label><select id="flcc-gender"><option value="">Select gender</option><option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option></select></div></div>
                </div>
                <p class="flcc-status" id="flcc-status" role="status"></p>
                <button class="flcc-submit" id="flcc-submit" type="button">Create Channel <span style="float:right;margin-right:10px">›</span></button>
                <p class="flcc-terms">By creating a channel, you agree to our Terms of Service and Privacy Policy.</p>
              </div>
              <input id="flcc-banner-file" type="file" accept="image/*" hidden>
              <input id="flcc-avatar-file" type="file" accept="image/*" hidden>
            `;
            document.body.appendChild(root);
            const bannerInput=root.querySelector('#flcc-banner-file'), avatarInput=root.querySelector('#flcc-avatar-file');
            const status=root.querySelector('#flcc-status');
            let bannerFile=null, avatarFile=null;
            root.querySelector('#flcc-change').addEventListener('click',()=>bannerInput.click());
            root.querySelector('#flcc-avatar-pick').addEventListener('click',()=>avatarInput.click());
            root.querySelector('#flcc-avatar').addEventListener('click',e=>{if(e.target.closest('button'))return;avatarInput.click();});
            bannerInput.addEventListener('change',()=>{
                const file=bannerInput.files&&bannerInput.files[0]; if(!file)return;
                if(!file.type.startsWith('image/')){status.textContent='Please choose an image file.';return;}
                bannerFile=file;
                const reader=new FileReader(); reader.onload=()=>{root.querySelector('#flcc-banner').style.backgroundImage='url("'+String(reader.result).replace(/"/g,'%22')+'")';};reader.readAsDataURL(file);
                status.textContent='Banner selected · 2.35:1 display ratio';
            });
            avatarInput.addEventListener('change',()=>{
                const file=avatarInput.files&&avatarInput.files[0];if(!file)return;
                if(!file.type.startsWith('image/')){status.textContent='Please choose an image file.';return;}
                avatarFile=file;
                const reader=new FileReader();reader.onload=()=>{root.querySelector('#flcc-avatar').innerHTML='<img alt="Channel image preview" src="'+reader.result+'"><button type="button" id="flcc-avatar-pick">Change photo</button>';root.querySelector('#flcc-avatar-pick').addEventListener('click',()=>avatarInput.click());};reader.readAsDataURL(file);
                status.textContent='Channel image selected';
            });

            // Dedicated, animated editor pages for the fields shown on the setup form.
            const openEditor=(key,title,description,value,kind,save)=>{
                let page=root.querySelector('#flcc-editor'); if(page)page.remove();
                page=document.createElement('div');page.id='flcc-editor';
                page.style.cssText='position:fixed;inset:0;z-index:20;background:#fff;padding:calc(env(safe-area-inset-top,0px) + 22px) 24px 28px;display:flex;flex-direction:column;animation:flccIn .22s ease both;color:#17171b';
                const input=kind==='textarea'?document.createElement('textarea'):document.createElement('input');
                input.style.cssText='width:100%;margin-top:28px;border:0;border-radius:16px;background:#f2f2f4;padding:18px;font:500 17px inherit;outline:none;min-height:'+(kind==='textarea'?'180px':'58px');
                if(kind==='textarea')input.rows=5;else input.type=kind==='date'?'date':'text';
                input.value=value||'';input.placeholder=description;
                page.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;font-size:16px"><button type="button" data-cancel style="border:0;background:none;font:inherit">Cancel</button><button type="button" data-save style="border:0;background:none;color:#e81768;font-weight:800;font:inherit">Save</button></div><h1 style="font-size:30px;margin:52px 0 10px;font-weight:900">'+esc(title)+'</h1><p style="font-size:16px;color:#777;line-height:1.5">'+esc(description)+'</p>';
                page.appendChild(input);const count=document.createElement('div');count.style.cssText='text-align:right;color:#888;margin-top:8px;font-size:13px';page.appendChild(count);
                const updateCount=()=>{count.textContent=input.value.length+'/'+(key==='bio'?160:key==='name'?30:24);};input.addEventListener('input',updateCount);updateCount();
                page.querySelector('[data-cancel]').onclick=()=>page.remove();
                page.querySelector('[data-save]').onclick=async()=>{const val=input.value.trim();if(!val){count.textContent='Please enter a value';return;}await save(val,page.querySelector('[data-save]'),count);};
                root.appendChild(page);input.focus();
            };
            const persistField=async(field,value,button,count,page)=>{
                button.disabled=true;button.textContent='Saving…';
                try{const patch={};patch[field]=value;patch.updatedAt=firebase.database.ServerValue.TIMESTAMP;await db.ref('channels/'+user.uid).update(patch);await db.ref('users/'+user.uid+'/'+field).set(value);page.remove();const el=root.querySelector('#flcc-'+field);if(el)el.value=value;status.textContent='Saved successfully';}
                catch(e){count.textContent=e.message||'Could not save. Try again.';button.disabled=false;button.textContent='Save';}
            };
            root.querySelector('#flcc-name').readOnly=true;root.querySelector('#flcc-handle').readOnly=true;
            const nameField=root.querySelector('#flcc-name'),handleField=root.querySelector('#flcc-handle'),bioField=root.querySelector('#flcc-bio');
            nameField.addEventListener('click',()=>openEditor('name','Name','Your name can only be changed once every 7 days.',nameField.value,'text',(v,b,ct,p)=>persistField('channelName',v,b,ct,p)));
            handleField.addEventListener('click',()=>openEditor('handle','Username','Use 3–24 letters, numbers, dots or underscores.',handleField.value,'text',async(v,b,ct,p)=>{
                const h=v.replace(/^@/,'').toLowerCase();if(!/^[a-z0-9._]{3,24}$/.test(h)){ct.textContent='Use 3–24 letters, numbers, dots or underscores.';return;}
                b.disabled=true;b.textContent='Checking…';
                try{const snap=await db.ref('channelHandles/'+h).once('value');if(snap.val()&&snap.val()!==user.uid){ct.textContent='Username is already taken.';b.disabled=false;b.textContent='Save';return;}
                    const old=handleField.value;const updates={};updates['channelHandles/'+old]=null;updates['channelHandles/'+h]=user.uid;updates['channels/'+user.uid+'/handle']=h;updates['channels/'+user.uid+'/updatedAt']=firebase.database.ServerValue.TIMESTAMP;updates['users/'+user.uid+'/handle']=h;await db.ref().update(updates);handleField.value=h;p.remove();
                }catch(e){ct.textContent=e.message||'Username check failed.';b.disabled=false;b.textContent='Save';}
            }));
            bioField.readOnly=true;bioField.addEventListener('click',()=>openEditor('bio','Bio','You can edit your bio any time.',bioField.value,'textarea',(v,b,ct,p)=>persistField('bio',v,b,ct,p)));
            const country=root.querySelector('#flcc-country');country.readOnly=true;country.addEventListener('click',()=>{
                const countries=['Afghanistan','Albania','Algeria','Argentina','Australia','Bangladesh','Brazil','Canada','China','France','Germany','India','Indonesia','Japan','Malaysia','Nepal','Pakistan','Saudi Arabia','Singapore','South Korea','Sri Lanka','United Kingdom','United States'];
                openEditor('country','Select country or region','Search or enter your country.',country.value,'text',async(v,b,ct,p)=>{await persistField('country',v,b,ct,p);});
            });
            root.querySelector('#flcc-category').addEventListener('change',async e=>{try{await db.ref('channels/'+user.uid+'/category').set(e.target.value);}catch(err){status.textContent='Could not save category';}});
            root.querySelector('#flcc-dob').addEventListener('change',async e=>{try{await db.ref('channels/'+user.uid+'/dateOfBirth').set(e.target.value);}catch(err){status.textContent='Could not save date of birth';}});
            root.querySelector('#flcc-gender').addEventListener('change',async e=>{try{await db.ref('channels/'+user.uid+'/gender').set(e.target.value);}catch(err){status.textContent='Could not save gender';}});
            root.querySelector('#flcc-back').addEventListener('click',()=>{status.textContent='Complete channel setup to continue.';});

            root.querySelector('#flcc-submit').addEventListener('click',async()=>{
                const name=root.querySelector('#flcc-name').value.trim();
                const handle=root.querySelector('#flcc-handle').value.trim().replace(/^@/,'').toLowerCase();
                if(name.length<2){status.textContent='Enter a channel name (at least 2 characters).';return;}
                if(!/^[a-z0-9._]{3,24}$/.test(handle)){status.textContent='Username must be 3–24 characters: letters, numbers, dot or underscore.';return;}
                const btn=root.querySelector('#flcc-submit');btn.disabled=true;status.textContent='Saving your channel…';
                try{
                    let bannerUrl='',avatarUrl='';
                    if(bannerFile){if(typeof uploadImageToR2!=='function')throw new Error('Image upload service is unavailable.');bannerUrl=await uploadImageToR2(bannerFile,'channel-banners');}
                    if(avatarFile){if(typeof uploadImageToR2!=='function')throw new Error('Image upload service is unavailable.');avatarUrl=await uploadImageToR2(avatarFile,'channel-images');}
                    const handleSnap=await db.ref('channelHandles/'+handle).once('value');
                    const claimed=handleSnap.val();
                    if(claimed&&claimed!==user.uid)throw new Error('This username is already taken. Try another one.');
                    const payload={uid:user.uid,userId:user.uid,channelName:name,handle:handle,bio:root.querySelector('#flcc-bio').value.trim(),category:root.querySelector('#flcc-category').value,email:user.email||'',country:root.querySelector('#flcc-country').value.trim(),dateOfBirth:root.querySelector('#flcc-dob').value,gender:root.querySelector('#flcc-gender').value,avatarUrl:avatarUrl||user.photoURL||'',channelImageUrl:avatarUrl||user.photoURL||'',bannerUrl:bannerUrl,channelBannerUrl:bannerUrl,createdAt:firebase.database.ServerValue.TIMESTAMP,updatedAt:firebase.database.ServerValue.TIMESTAMP};
                    const updates={};updates['channels/'+user.uid]=payload;updates['users/'+user.uid+'/channelName']=name;updates['users/'+user.uid+'/handle']=handle;updates['users/'+user.uid+'/channelCreated']=true;updates['channelHandles/'+handle]=user.uid;
                    await db.ref().update(updates);
                    currentChannelData=payload;
                    try{localStorage.setItem('flaynity_channel_cache:'+user.uid,JSON.stringify(payload));localStorage.setItem('flaynity_user_session_cache',JSON.stringify(payload));}catch(e){}
                    root.remove();
                    if(typeof showNotification==='function')showNotification('Your channel is ready!','success');
                    if(typeof initYouTabUI==='function')initYouTabUI();
                }catch(err){status.textContent=err.message||'Could not create channel. Please try again.';btn.disabled=false;}
            });
        }
        root.style.display='block';
        const email=root.querySelector('#flcc-email');if(email)email.value=user.email||'';
        const nameInput=root.querySelector('#flcc-name');if(nameInput&&!nameInput.value)nameInput.value=user.displayName||'';
        const handleInput=root.querySelector('#flcc-handle');
        if(handleInput&&!handleInput.value){handleInput.value=String(user.displayName||user.email?.split('@')[0]||'').toLowerCase().replace(/[^a-z0-9._]/g,'').slice(0,24);}
    };
})();

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

auth.onAuthStateChanged(window.__flaynityAuthHandler = async (user) => {
    try {
        clearUserStatusListener();
        detachAdminControlListener();
        // New email sign-ups must finish the 4-digit code step before entering the app.
        if (user && window.vfGate && window.vfGate(user)) return;
        if (!user) {
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
                return;
            }
            // First launch / ordinary signed-out launch keeps the existing onboarding flow.
            if (authScr) authScr.style.display = 'none';
            if (typeof window.__flaynityShowOnboarding === 'function') {
                window.__flaynityShowOnboarding();
            }
            return;
        }

        // Firebase may switch accounts without a page reload. Reset stale data when UID changes.
        if (window.__flaynityActiveDataUid && window.__flaynityActiveDataUid !== user.uid) {
            cleanupUserSessionData();
        }
        window.__flaynityActiveDataUid = user.uid;

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

        // First-time users must create a channel before continuing in the app.
        try {
            const channelSnap = await db.ref('channels/' + user.uid).once('value');
            if (!channelSnap.exists() && typeof window.showCreateChannelPage === 'function') {
                window.showCreateChannelPage();
            }
        } catch (channelCheckError) { console.warn('Create Channel check failed:', channelCheckError); }

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
        await authApplyPersistence();
        const result = await auth.signInWithEmailAndPassword(email, pass);
        saveAccountToList(result.user);
        showNotification('Welcome back!', 'success');
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
    // Cloudflare Worker URL (no trailing slash). Replace after deploying the worker.
    const VF_API = 'https://flaynity-verify.flaynity.workers.dev';
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
        } catch (netErr) { const e = new Error('No internet connection.'); e.code = 'functions/unavailable'; throw e; }
        if (!res.ok || j.ok === false) { const e = new Error(j.error || 'Something went wrong.'); e.code = 'functions/' + (j.code || 'error'); throw e; }
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
            showCard('success');
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
        const v = $('au-verify'); if (v) v.classList.remove('active');
        done = false;
        if (typeof window.__flaynityAuthHandler === 'function' && auth.currentUser) {
            window.__flaynityAuthHandler(auth.currentUser);
        } else { location.reload(); }
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

    // Terms / Privacy
    let legalUrl = '';
    window.vfOpenLegal = function (url, title) {
        legalUrl = url;
        $('vf-legal-title').textContent = title;
        $('vf-legal-frame').src = url;
        $('vf-legal-page').classList.add('open');
    };
    window.vfCloseLegal = function () {
        $('vf-legal-page').classList.remove('open');
        $('vf-legal-frame').src = 'about:blank';
    };
    window.vfLegalExternal = function () { try { window.open(legalUrl, '_blank'); } catch (e) { location.href = legalUrl; } };

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
        await authApplyPersistence();
        const result = await auth.signInWithPopup(provider);
        saveAccountToList(result.user);
        showNotification('Signed in successfully!', 'success');
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
                        if (titleEl) titleEl.textContent = fxTitleTwoLines(v.title);
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

    // "Not interested" / "Don't recommend channel" apply to the Home Feed only (per account).
    longs = longs.filter(x => !_fxHiddenVideos.has(String(x.id)) && !(x.userId && _fxHiddenChannels.has(String(x.userId))));
    feels = feels.filter(x => !(x.userId && _fxHiddenChannels.has(String(x.userId))));
    posts = posts.filter(x => !(x.userId && _fxHiddenChannels.has(String(x.userId))));

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
const FXM_ITEMS = [
    { a: 'download', t: 'Download', i: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10.5l5 5 5-5M4 20h16"/></svg>' },
    { a: 'share', t: 'Share', i: '<svg viewBox="0 0 24 24"><path d="M14 4l7 6.5-7 6.5v-4c-5 0-8.5 1.5-11 5 .8-5.5 4-9.5 11-10V4z"/></svg>' },
    { a: 'not_interested', t: 'Not interested', i: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>' },
    { a: 'no_channel', t: "Don't recommend channel", i: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5 1.2 0 2.3.2 3.2.7M16 14l6 6M22 14l-6 6"/></svg>' },
    { a: 'report', t: 'Report', danger: true, i: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>' }
];
const FXR_REASONS = [
    { k: 'sexual', t: 'Sexual content' },
    { k: 'violent', t: 'Violent or repulsive content' },
    { k: 'hateful', t: 'Hateful or abusive content' },
    { k: 'harmful', t: 'Harmful or dangerous acts' },
    { k: 'spam', t: 'Spam or misleading' }
];
let _fxmVideoId = null;
let _fxrVideoId = null;
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

function fxEnsureMenu() {
    let root = document.getElementById('fx-video-menu');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'fx-video-menu';
    root.className = 'fxm-root';
    root.innerHTML = `<div class="fxm-pop" id="fxm-pop">${FXM_ITEMS.map(it => `
        ${it.danger ? '<div class="fxm-sep"></div>' : ''}
        <button type="button" class="fxm-item${it.danger ? ' danger' : ''}" data-a="${it.a}">
            <span class="fxm-ic">${it.i}</span><span class="fxm-tx">${it.t}</span>
        </button>`).join('')}</div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
        const btn = e.target.closest('.fxm-item');
        if (btn) { fxMenuAction(btn.dataset.a); return; }
        if (e.target === root) fxCloseVideoMenu();
    });
    return root;
}

function fxOpenVideoMenu(videoId, anchor) {
    if (typeof playUI === 'function') playUI('click');
    const root = fxEnsureMenu();
    _fxmVideoId = String(videoId);
    const pop = root.querySelector('#fxm-pop');
    root.classList.remove('open', 'closing');
    AppNavigation.pushModal('fx-video-menu');
    pop.style.visibility = 'hidden';
    requestAnimationFrame(() => {
        const r = anchor ? anchor.getBoundingClientRect() : { top: 80, bottom: 110, right: window.innerWidth - 12 };
        const w = pop.offsetWidth, ph = pop.offsetHeight;
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = Math.min(Math.max(12, r.right - w), vw - w - 12);
        let top = r.bottom + 6, up = false;
        if (top + ph > vh - 12) { top = Math.max(12, r.top - ph - 6); up = true; }
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
        pop.style.transformOrigin = (up ? 'bottom' : 'top') + ' right';
        pop.style.visibility = 'visible';
        root.classList.add('open');
    });
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
        if (done) done();
    }, 170);
}

function fxMenuAction(action) {
    const id = _fxmVideoId;
    const v = (typeof allLongVideos !== 'undefined') ? allLongVideos.find(x => String(x.id) === String(id)) : null;
    fxCloseVideoMenu(() => {
        if (!v) return;
        if (action === 'download') {
            const raw = v.videoLink || v.videoUrl;
            const name = `${String(v.title || 'video').replace(/\s+/g, '_')}_video-720.mp4`;
            const url = (typeof normalizeFlaynityMediaUrl === 'function' && raw) ? normalizeFlaynityMediaUrl(raw) : raw;
            if (!url) { showNotification('No valid download link found.', 'error'); return; }
            triggerFileDownload(url, name);
        } else if (action === 'share') {
            const data = { title: v.title || 'Flaynity', text: v.title || 'Flaynity', url: location.href };
            if (navigator.share) navigator.share(data).catch(() => {});
            else if (navigator.clipboard) { navigator.clipboard.writeText(location.href); showNotification('Link copied', 'success'); }
        } else if (action === 'not_interested') {
            _fxHiddenVideos.add(String(v.id)); fxPersistHidden();
            fxRemoveCards(`#home-feed-container .fx-card[data-fx-id="${v.id}"]`);
            showNotification("Video hidden. We'll show fewer videos like this.", 'success', 2400);
        } else if (action === 'no_channel') {
            if (v.userId) {
                _fxHiddenChannels.add(String(v.userId)); fxPersistHidden();
                fxRemoveCards(`#home-feed-container .fx-card[data-fx-uid="${v.userId}"]`);
                setTimeout(() => { try { if (AppNavigation.current() && AppNavigation.current().type === 'tab') buildHomeFeed(); } catch (e) {} }, 400);
            }
            showNotification("Okay, we won't recommend this channel.", 'success', 2400);
        } else if (action === 'report') {
            fxOpenReportDialog(v.id);
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
                <div><h3>Report video</h3><p>Select the issue you want to report</p></div>
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

function fxOpenReportDialog(videoId) {
    const root = fxEnsureReport();
    _fxrVideoId = String(videoId); _fxrBusy = false;
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
        .set({ reason: sel.dataset.k, timestamp: Date.now() })
        .then(() => { showNotification('Report submitted. Thank you!', 'success', 2400); fxCloseReportDialog(); })
        .catch(() => { showNotification('Could not send report. Please try again.', 'error'); _fxrBusy = false; send.textContent = 'Report'; send.disabled = false; });
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
    setInterval(fxPreviewTick, 400);
})();

function fxBuildLongVideoCard(v) {
    const id = String(v.id);
    const uid = v.userId || '';
    // Same reaction system as Community Posts (hold the like button => emoji picker).
    setTimeout(() => { try { registerPostReactionsListener(id); fxListenDislike(id); } catch (e) {} }, 0);
    return `
        <div class="fx-card long-video-feed-card" data-fx-id="${id}" data-fx-uid="${uid}" onclick="openMoviePage('${id}', false)">
            <div class="fx-thumb long-video-thumb-container">
                <img src="${v.poster || ''}" loading="lazy" alt="" draggable="false">
                <span class="fx-dur long-video-duration">${v.duration || '10:00'}</span>
            </div>
            <div class="fx-body">
                <div class="fx-head">
                    <div class="fx-av live-avatar-${uid}"></div>
                    <div class="fx-txt">
                        <h4 class="fx-title long-video-title">${escapeHTML(fxTitleTwoLines(v.title))}</h4>
                        <div class="fx-channel live-username-${uid}">${escapeHTML(v.username || 'Flaynity User')}</div>
                    </div>
                    <button class="fx-more" aria-label="More" onclick="event.stopPropagation(); fxOpenVideoMenu('${id}', this);">${FX_ICON.dots}</button>
                </div>
                <div class="fx-stats">
                    <span class="fx-stat">${FX_ICON.eye}<span data-fx-views="${id}">0 Views</span></span>
                    <span class="fx-sep"></span>
                    <span class="fx-stat">${FX_ICON.clock}<span>${getRelativeTime(v.createdAt)}</span></span>
                </div>
                <div class="fx-actions">
                    <div class="fx-act">
                        <button id="post-love-btn-${id}" class="fx-ico post-action-btn-fb"
                                onmousedown="startReactionTimer('${id}', event)"
                                ontouchstart="startReactionTimer('${id}', event)"
                                onmouseup="clearReactionTimer('${id}', event)"
                                ontouchend="clearReactionTimer('${id}', event)"
                                onclick="event.stopPropagation(); handleLoveSingleClick('${id}')" aria-label="React">
                            <span class="love-icon-element" id="love-icon-${id}">${FB_LIKE_SVG}</span>
                        </button>
                        <span id="love-text-${id}" style="display:none">Love</span>
                        <span id="post-total-reactions-${id}" class="fx-count" onclick="event.stopPropagation(); openReactedPeoplePage('${id}')">0</span>
                    </div>
                    <div class="fx-act">
                        <button class="fx-ico fx-dislike" data-fx-dislike="${id}" aria-label="Dislike"
                                onclick="event.stopPropagation(); fxToggleDislike('${id}')">
                            <span class="love-icon-element">${FB_LIKE_SVG}</span>
                        </button>
                    </div>
                    <span id="post-top-emojis-${id}" class="fx-badges" onclick="event.stopPropagation(); openReactedPeoplePage('${id}')"></span>
                    <button class="fx-watch" onclick="event.stopPropagation(); openMoviePage('${id}', false)">${FX_ICON.play}<span>Watch Now</span></button>
                </div>
            </div>
        </div>`;
}

function fxLoadCardStats(id) {
    if (!navigator.onLine || typeof db === 'undefined') return;
    db.ref(`movie_stats/${id}/views`).once('value', s => {
        const txt = formatCount(Object.keys(s.val() || {}).length) + ' Views';
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

    const titleText = post.title || post.caption || '';
    const plainCaption = post.caption || '';
    const combinedText = (titleText === plainCaption ? plainCaption : `${titleText}\n\n${plainCaption}`).trim();
    const isLong = combinedText.length > 150 || combinedText.split('\n').length > 4;

    const subBtnId = `post-sub-btn-${post.id}`;
    const isOwn = !!(auth.currentUser && auth.currentUser.uid === post.userId);

    if (auth.currentUser && navigator.onLine && !isOwn) {
        db.ref(`subscribers/${post.userId}/${auth.currentUser.uid}`).on('value', (snapshot) => {
            const btn = document.getElementById(subBtnId);
            if (btn) {
                if (snapshot.exists()) {
                    btn.innerText = "Subscribed";
                    btn.classList.add('subbed');
                } else {
                    btn.innerText = "Subscribe";
                    btn.classList.remove('subbed');
                }
            }
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
        <div class="post-card fb-post" id="post-card-${post.id}">
            <div class="fb-head">
                <div class="fb-ring"><div class="fb-av live-avatar-${post.userId}"></div></div>
                <div class="fb-who">
                    <div class="fb-name">
                        <span class="fb-uname live-username-${post.userId}">${escapeHTML(post.username || 'Flaynity User')}</span>
                        
                    </div>
                    <div class="fb-sub"><span>${fbTimeShort(post.createdAt)}</span><span class="fb-dot">·</span><i class="fas fa-globe-americas"></i></div>
                </div>
                ${isOwn ? '' : `<button id="${subBtnId}" class="fb-subbtn" onclick="toggleClipSubscribe('${post.userId}', this)">Subscribe</button>`}
                <button class="fb-hbtn" onclick="typeof showUpcomingModal==='function' && showUpcomingModal()" aria-label="More">${FB_DOTS_SVG}</button>
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

function togglePostTitleExpand(postId) {
    playUI('click');
    const el = document.getElementById(`post-caption-${postId}`);
    const btn = document.getElementById(`post-more-${postId}`);
    if (!el) return;
    const clamped = el.classList.toggle('fb-clamp');
    if (btn) btn.style.display = clamped ? 'inline' : 'none';
}

function fbHidePost(postId) {
    playUI('click');
    const el = document.getElementById(`post-card-${postId}`);
    _fbHiddenPosts.add(String(postId));
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
const feelsSavedByUser = {};
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
                            <i class="fas fa-heart${isLocallyLiked ? ' liked' : ''}"></i>
                        </button>
                        <div class="short-action-label-tiktok" id="${likesCountId}">${formatCount(cachedStats.likes)}</div>
                    </div>

                    <div class="short-action-container">
                        <button class="short-action-btn-tiktok-other" onclick="openFeelsComments('${s.id}', event)">
                            <i class="fas fa-comment-dots"></i>
                        </button>
                        <div class="short-action-label-tiktok" id="${commentsCountId}">${formatCount(cachedStats.comments)}</div>
                    </div>

                    <div class="short-action-container">
                        <button class="short-action-btn-tiktok-other" id="short-save-btn-${s.id}" aria-label="Save" onclick="toggleShortSave('${s.id}', event)">
                            <i class="fas fa-bookmark${(feelsSavedByUser[s.id] ? ' saved' : '')}"></i>
                        </button>
                        <div class="short-action-label-tiktok" id="short-saves-count-${s.id}">${formatCount(cachedStats.saves || 0)}</div>
                    </div>

                    <div class="short-action-container">
                        <button class="short-action-btn-tiktok-other" aria-label="Share" onclick="shareFeels('${s.id}', event)">
                            <i class="fas fa-share"></i>
                        </button>
                        <div class="short-action-label-tiktok" id="short-shares-count-${s.id}">Share</div>
                    </div>

                    <div class="short-quality-pill">
                        <button type="button" class="short-quality-btn" aria-label="Video quality" onclick="openFeelsQualitySheet('${s.id}', event)"><span class="short-quality-label">${feelsQualityLabel()}</span><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
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

        db.ref(`movie_stats/${s.id}`).on('value', (snapshot) => {
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
                else saveBtn.innerHTML = `<i class="fas fa-bookmark${saved ? ' saved' : ''}"></i>`;
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
                else likeBtn.innerHTML = `<i class="fas fa-heart${liked ? ' liked' : ''}"></i>`;
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

// ---------------- Premium video-quality sheet ----------------
function feelsQualityPref() { try { return localStorage.getItem('feels_quality_pref') === 'original' ? 'original' : 'auto'; } catch (e) { return 'auto'; } }
function feelsQualityLabel() { return feelsQualityPref() === 'original' ? 'Original' : 'Auto'; }

function ttqEnsure() {
    let el = document.getElementById('feels-quality-sheet');
    if (el) return el;
    const st = document.createElement('style');
    st.textContent = `
    #feels-quality-sheet{position:fixed;inset:0;z-index:3000;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);animation:ttFade .2s ease}
    #feels-quality-sheet .fq-sheet{width:100%;box-sizing:border-box;background:var(--surface,#fff);color:var(--text-main,#161823);border-radius:26px 26px 0 0;padding:10px 18px calc(24px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.28);animation:ttUp .32s cubic-bezier(.22,1,.36,1)}
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
        ${opt('original', 'Original', 'Highest quality, uses more data', '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg>', '')}
    </div>`;
    el.querySelector('.fq-x').addEventListener('click', closeFeelsQualitySheet);
    el.querySelectorAll('.fq-opt').forEach(b => b.addEventListener('click', () => {
        const q = b.dataset.q;
        try { localStorage.setItem('feels_quality_pref', q); } catch (e) {}
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
    keepFeelsVideoActive(s.id);
    openMoreDescriptionSheet();          // same Description page as Long Video
    requestAnimationFrame(() => keepFeelsVideoActive(s.id));
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

// =========================================================
// TIKTOK-STYLE COMMENT SHEET (Feels)
// Data path (same as before): movie_comments/{feelsId}/{key}
//   { uid, username, avatar, text, timestamp, likes:{uid:true}, parentId?, replyToName? }
// =========================================================
let _ttRef = null, _ttCb = null, _ttId = null, _ttData = {};
let _ttReply = null;               // { parent, name, mention }
const _ttOpen = new Set();         // parent keys whose replies are expanded
const _ttShown = {};               // parent key -> how many replies are visible
let _ttScroll = 0;
const TT_EMOJIS = ['😃','😄','😁','😆','😅','😂','🤣','☺️','😊'];
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
    .tt-inrow{display:flex;align-items:center;gap:10px}
    .tt-pill{flex:1 1 auto;min-width:0;background:rgba(128,128,128,.14);border-radius:22px;padding:0 16px;height:44px;display:flex;align-items:center}
    .tt-pill input{width:100%;border:0;outline:0;background:transparent;color:inherit;font-size:16px;font-family:inherit}
    .tt-pill input::placeholder{color:var(--text-muted,#8a8b91)}
    .tt-actions{display:none;justify-content:flex-end;margin-top:10px}
    .tt-foot.open .tt-actions{display:flex}
    .tt-send{width:78px;height:46px;border:0;border-radius:23px;background:#fe2c55;color:#fff;display:flex;align-items:center;justify-content:center;opacity:.35;transition:opacity .15s;cursor:pointer}
    .tt-send.ready{opacity:1}
    .tt-send svg{width:24px;height:24px;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;fill:none}
    .tt-emojis{display:none;justify-content:space-between;margin-top:8px}
    .tt-foot.open .tt-emojis{display:flex}
    .tt-emojis button{border:0;background:transparent;font-size:30px;line-height:1;padding:4px;cursor:pointer}
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
          <div class="tt-inrow">
            <div id="tt-me" style="flex:0 0 auto"></div>
            <div class="tt-pill"><input id="tt-input" type="text" autocomplete="off" enterkeyhint="send" placeholder="Add comment..." maxlength="500"></div>
          </div>
          <div class="tt-actions"><button class="tt-send" id="tt-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M12 20V5M5.5 11.5L12 5l6.5 6.5"/></svg></button></div>
          <div class="tt-emojis">${TT_EMOJIS.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
        </div>
      </div>`;
    document.body.appendChild(el);

    const input = el.querySelector('#tt-input');
    const foot = el.querySelector('#tt-foot');
    input.addEventListener('focus', () => { foot.classList.add('open'); });
    input.addEventListener('input', ttSyncSend);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitTikTokComment(); } });
    el.querySelector('#tt-send').addEventListener('click', submitTikTokComment);
    el.querySelectorAll('.tt-emojis button').forEach(b => b.addEventListener('mousedown', (e) => e.preventDefault()));
    el.querySelectorAll('.tt-emojis button').forEach(b => b.addEventListener('click', () => ttInsertEmoji(b.dataset.e)));
    const list = el.querySelector('#tt-list');
    list.addEventListener('scroll', () => { _ttScroll = list.scrollTop; }, { passive: true });
    list.addEventListener('click', ttListClick);
    ttBindLongPress(list);
    if (window.visualViewport) {
        const fit = () => {
            const m = document.getElementById('tt-comment-modal');
            if (!m || m.style.display === 'none') return;
            const vv = window.visualViewport;
            const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
            m.style.paddingBottom = kb + 'px';
        };
        window.visualViewport.addEventListener('resize', fit);
        window.visualViewport.addEventListener('scroll', fit);
    }
    return el;
}

function ttSyncSend() {
    const i = document.getElementById('tt-input'), b = document.getElementById('tt-send');
    if (b) b.classList.toggle('ready', !!(i && i.value.trim()));
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
    _ttOpen.clear(); Object.keys(_ttShown).forEach(k => delete _ttShown[k]);

    const input = el.querySelector('#tt-input');
    input.value = ''; input.placeholder = 'Add comment...';
    el.querySelector('#tt-foot').classList.remove('open');
    ttSyncSend();
    const cached = feelsCommentsCache[s.id];
    const list = el.querySelector('#tt-list');
    if (cached && Object.keys(cached).length) { _ttData = cached; ttRender(); }
    else list.innerHTML = [55, 34, 45, 45, 34, 55].map(w => `<div class="tt-sk"><i></i><b style="width:${w}%"></b></div>`).join('');
    ttPaintMe();

    ttAttach(s.id);
    AppNavigation.pushModal('tt-comment-modal');
    requestAnimationFrame(() => keepFeelsVideoActive(shortId));
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
    ttDetach();
    const cur = AppNavigation.current();
    if (cur && cur.id === 'tt-comment-modal') AppNavigation.pop();
    else if (m) m.style.display = 'none';
}

function ttPaintMe() {
    const box = document.getElementById('tt-me'); if (!box) return;
    const u = auth.currentUser;
    const fb = ((u && u.email) || 'U').charAt(0).toUpperCase();
    const paint = (photo) => { box.innerHTML = ttAvatar({ avatar: photo, username: fb }, 36); };
    paint((u && (u.photoURL)) || (typeof currentChannelData !== 'undefined' && currentChannelData && (currentChannelData.avatarUrl || currentChannelData.photoURL)) || '');
    if (u && navigator.onLine) db.ref(`users/${u.uid}`).once('value', (snap) => { const d = snap.val() || {}; _ttMe = { uid: u.uid, username: d.username || (u.email || 'user').split('@')[0], avatar: (typeof currentChannelData !== 'undefined' && currentChannelData && (currentChannelData.avatarUrl || currentChannelData.photoURL)) || d.photoURL || u.photoURL || '' }; if (d.photoURL) paint(d.photoURL); });
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
    const likeN = e => ttLikeUids(e.c).size;
    const fresh = e => uid && e.c.uid === uid && now - (e.c.timestamp || 0) < 120000;
    top.sort((a, b) => (fresh(b) - fresh(a)) || (likeN(b) - likeN(a)) || ((b.c.timestamp || 0) - (a.c.timestamp || 0)));

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
    document.getElementById('tt-foot').classList.remove('open');
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
    'flay-payout': 'service/flay-payout.html'
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

    // Remember every scroll position of the view that is on screen right now.
    _collectScroll: function(root, out) {
        if (!root || !root.getClientRects().length) return;
        const nodes = [root];
        root.querySelectorAll('*').forEach(n => nodes.push(n));
        nodes.forEach(n => { if (n.scrollTop > 0) out.push([n, n.scrollTop]); });
    },
    _saveScroll: function() {
        const rec = { win: null, els: [] };
        if (!this._viewPage) {
            rec.win = window.pageYOffset || document.documentElement.scrollTop || 0;
            if (this._viewTab !== 'feels') this._collectScroll(document.getElementById(this._viewTab + '-tab'), rec.els);
        } else {
            const pid = this._viewPage === 'full-movie-page' ? 'full-movie-page' : (this._viewPage.endsWith('-page') ? this._viewPage : this._viewPage + '-page');
            this._collectScroll(document.getElementById(pid), rec.els);
        }
        this._mem[this._view] = rec;
    },

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
        this._fresh = true;
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
        this._fresh = true;
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
        if (activePage) keepIds.add(activePage === 'full-movie-page' ? 'full-movie-page' : (activePage.endsWith('-page') ? activePage : activePage + '-page'));

        document.querySelectorAll('.fullscreen-page').forEach(el => {
            el.classList.remove('you-direct-page');
        });
        const globalBottomNav = document.querySelector('#app-screen .bottom-nav, .bottom-nav');
        if (globalBottomNav) globalBottomNav.classList.remove('view-channel-visible');
        document.querySelectorAll('.fullscreen-page, .premium-download-modal').forEach(el => {
            if (!keepIds.has(el.id)) el.style.display = 'none';
        });
        const moviePage = document.getElementById('full-movie-page');
        if (moviePage && !keepIds.has('full-movie-page')) moviePage.style.display = 'none';
        
        const themeMenu = document.getElementById('theme-popup-menu');
        if (themeMenu) themeMenu.style.display = 'none';

        const imagePreview = document.getElementById('full-image-preview-overlay');
        if (imagePreview) imagePreview.style.display = 'none';

        const reactionPicker = document.getElementById('fb-reaction-picker');
        if (reactionPicker) reactionPicker.style.display = 'none';

        const fxdSheetEl = document.getElementById('fx-dislike-sheet');
        if (fxdSheetEl) fxdSheetEl.style.display = 'none';
        ['fx-video-menu', 'fx-report-dialog'].forEach(mid => { const el = document.getElementById(mid); if (el) el.style.display = 'none'; });

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
        if (tabEl && !activePage) tabEl.classList.add('active');
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

        // Come back to exactly where the user was (Home feed, Play Page, any page).
        this._view = newViewKey; this._viewTab = activeTab; this._viewPage = activePage;
        if (this._fresh) { delete this._mem[newViewKey]; this._fresh = false; }
        const rec = this._mem[newViewKey];
        if (rec) {
            const apply = () => {
                if (!activePage && rec.win != null) { try { window.scrollTo(0, rec.win); } catch (e) {} }
                rec.els.forEach(([el, top]) => {
                    if (el.isConnected && el.getClientRects().length && Math.abs(el.scrollTop - top) > 1) el.scrollTop = top;
                });
            };
            apply();
            requestAnimationFrame(apply);
            setTimeout(apply, 120);
        }
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
    const _vb = document.getElementById('movie-verified-badge'); if (_vb) _vb.style.display = 'none';

    // Show the watch page before starting playback. Android WebView can reject
    // autoplay/play() when the video element is still inside a display:none page.
    delete _fxPlayLikeInit[currentActiveMovie.id];
    AppNavigation.pushPage('full-movie-page');
    const _mvPage = document.getElementById('full-movie-page');
    if (_mvPage) _mvPage.scrollTop = 0; // a new video always starts at the top
    
    startVideoPlayer();
    registerViewAndListen(currentActiveMovie.id);
    try { registerPostReactionsListener(String(currentActiveMovie.id)); fxListenDislike(String(currentActiveMovie.id)); } catch (e) {}
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

function registerViewAndListen(movieId) {
    const userId = auth.currentUser ? auth.currentUser.uid : 'anonymous';
    
    if (userId !== 'anonymous' && navigator.onLine) {
        db.ref(`movie_stats/${movieId}/views/${userId}`).set(true);
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

        if (viewsEl) viewsEl.innerText = formatCount(totalViews) + " views";

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
            await userSubRef.set(true);
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

function renderMovieWatchRecommendedFeed() {
    const container = document.getElementById('yt-related-list');
    if (!container) return;

    const currentId = currentActiveMovie ? String(currentActiveMovie.id) : null;
    const longvids = allLongVideos.filter(m => String(m.id) !== currentId);

    if (longvids.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 20px 0;">No recommendations found.</p>`;
        return;
    }

    longvids.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const itemsToRender = longvids.slice(0, Math.min(longvids.length, watchRecommendedLimit));
    const uniqueUserIds = new Set();
    let html = '';

    itemsToRender.forEach(v => {
        if (v.userId) uniqueUserIds.add(v.userId);
        html += fxBuildLongVideoCard(v);
    });

    container.innerHTML = html;
    itemsToRender.forEach(v => fxLoadCardStats(String(v.id)));
    uniqueUserIds.forEach(uid => bindLiveChannelUI(uid));
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
    playUI('click');
    document.querySelectorAll('.short-video-el').forEach(vid => vid.pause());

    if (tabId === 'you') {
        const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        let channel = null;
        if (user && navigator.onLine) {
            try {
                const snapshot = await db.ref(`channels/${user.uid}`).once('value');
                channel = snapshot.val();
                try {
                    if (channel) {
                        localStorage.setItem('flaynity_channel_cache:' + user.uid, JSON.stringify(channel));
                        localStorage.setItem('flaynity_user_session_cache', JSON.stringify(channel));
                    } else localStorage.removeItem('flaynity_channel_cache:' + user.uid);
                } catch (e) {}
            } catch (e) {}
        }
        if (!channel && user) {
            try {
                const cached = localStorage.getItem('flaynity_channel_cache:' + user.uid);
                if (cached) channel = JSON.parse(cached);
            } catch (e) {}
        }
        if (!channel && !navigator.onLine) {
            try {
                const cachedSession = localStorage.getItem('flaynity_user_session_cache');
                if (cachedSession) channel = JSON.parse(cachedSession);
            } catch (e) {}
        }
        if (channel) {
            currentChannelData = channel;
            openViewChannelPage();
            return;
        }
        if (!navigator.onLine) {
            AppNavigation.pushPage('view-channel-page');
            renderOfflineChannelPageSkeletons();
            return;
        }
    }
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
    if (!navigator.onLine) {
        try {
            const cached = user ? localStorage.getItem('flaynity_channel_cache:' + user.uid) : null;
            const session = localStorage.getItem('flaynity_user_session_cache');
            currentChannelData = cached ? JSON.parse(cached) : (session ? JSON.parse(session) : null);
        } catch (e) { currentChannelData = null; }
        if (currentChannelData) {
            renderYouTabWithData(currentChannelData, user || { displayName: currentChannelData.channelName || 'Flaynity User', photoURL: currentChannelData.avatarUrl || '', email: '' }, wrap);
        } else {
            wrap.innerHTML = `<div class="skel-box" style="width: 100%; height: 48px; border-radius: 20px;"></div>`;
        }
        return;
    }
    if (!user) return;

    db.ref(`channels/${user.uid}`).once('value', (snapshot) => {
        currentChannelData = snapshot.val();
        try {
            if (currentChannelData) {
                localStorage.setItem('flaynity_channel_cache:' + user.uid, JSON.stringify(currentChannelData));
                localStorage.setItem('flaynity_user_session_cache', JSON.stringify(currentChannelData));
            } else {
                localStorage.removeItem('flaynity_channel_cache:' + user.uid);
            }
        } catch (e) {}
        renderYouTabWithData(currentChannelData, user, wrap);
    }).catch(() => {
        let cached = null;
        try {
            const value = localStorage.getItem('flaynity_channel_cache:' + user.uid);
            if (value) cached = JSON.parse(value);
        } catch (e) {}
        currentChannelData = cached;
        renderYouTabWithData(currentChannelData, user, wrap);
    });
}

function cacheChannelImageOffline(url, storageKey) {
    if (!url || typeof url !== 'string' || !navigator.onLine) return;
    // Keep already embedded image data untouched.
    if (/^data:image\//i.test(url)) {
        try { localStorage.setItem(storageKey, url); } catch (e) {}
        return;
    }
    try { localStorage.setItem(storageKey + '_url', url); } catch (e) {}
    fetch(url, { method: 'GET', mode: 'cors', cache: 'force-cache' })
        .then(response => {
            if (!response.ok) throw new Error('Image download failed');
            return response.blob();
        })
        .then(blob => new Promise((resolve, reject) => {
            if (!blob || !blob.type || !blob.type.startsWith('image/')) {
                reject(new Error('Invalid image response'));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        }))
        .then(dataUrl => {
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
                try { localStorage.setItem(storageKey, dataUrl); } catch (e) {}
            }
        })
        .catch(() => {
            // The normal URL remains cached; cross-origin hosts that deny fetch
            // cannot be converted to an offline data URL from this WebView.
        });
}

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
                localStorage.setItem('flaynity_cached_channel_avatar_url', channelAvatar);
                if (/^data:image\//i.test(channelAvatar)) localStorage.setItem('flaynity_cached_channel_avatar', channelAvatar);
            }
            if (channelBanner) {
                localStorage.setItem('flaynity_cached_channel_banner_url', channelBanner);
                if (/^data:image\//i.test(channelBanner)) localStorage.setItem('flaynity_cached_channel_banner', channelBanner);
            }
        } catch (e) {}
        cacheChannelImageOffline(channelAvatar, 'flaynity_cached_channel_avatar');
        cacheChannelImageOffline(channelBanner, 'flaynity_cached_channel_banner');

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
    console.warn('Unknown support page:', type);
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
    if (sheetId === 'sheet-language' && typeof window.setFlaynityLanguage === 'function') {
        const label = element.querySelector('.sheet-option-label');
        window.setFlaynityLanguage(label ? label.textContent : element.textContent);
    }
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
    if (!data && !navigator.onLine) {
        try {
            const cached = localStorage.getItem('flaynity_user_session_cache');
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
        cachedBannerUrl = localStorage.getItem('flaynity_cached_channel_banner') || cachedBannerUrl || localStorage.getItem('flaynity_cached_channel_banner_url') || '';
        cachedAvatarUrl = localStorage.getItem('flaynity_cached_channel_avatar') || cachedAvatarUrl || localStorage.getItem('flaynity_cached_channel_avatar_url') || '';
    } catch (e) {}
    if (navigator.onLine) {
        cacheChannelImageOffline(cachedBannerUrl, 'flaynity_cached_channel_banner');
        cacheChannelImageOffline(cachedAvatarUrl, 'flaynity_cached_channel_avatar');
    }
    if (viewBanner) {
        viewBanner.src = cachedBannerUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2000&auto=format&fit=crop";
        viewBanner.style.visibility = 'visible';
    }
    if (viewAvatar) {
        viewAvatar.src = cachedAvatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=300&auto=format&fit=crop";
        viewAvatar.style.visibility = 'visible';
    }
    if (viewName) viewName.innerText = data.channelName;
    if (viewHandle) viewHandle.innerText = "@" + data.handle;
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
        const count = type === 'videos' ? 4 : (type === 'feels' ? 6 : 3);
        grid.innerHTML = Array.from({length: count}, () =>
            '<div class="channel-offline-skeleton"><div class="skel-box" style="width:100%;height:150px;border-radius:12px;"></div><div class="skel-box" style="width:72%;height:12px;margin-top:10px;border-radius:6px;"></div><div class="skel-box" style="width:46%;height:10px;margin-top:7px;border-radius:6px;"></div></div>'
        ).join('');
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
        renderOfflineChannelPageSkeletons(type);
        const gridId = type === 'videos' ? 'channel-videos-grid' : (type === 'feels' ? 'channel-feels-grid' : 'channel-posts-feed');
        const grid = document.getElementById(gridId);
        if (grid) {
            const count = type === 'videos' ? 4 : (type === 'feels' ? 6 : 3);
            grid.innerHTML = Array.from({length: count}, () =>
                '<div class="channel-offline-skeleton"><div class="skel-box" style="width:100%;height:150px;border-radius:12px;"></div><div class="skel-box" style="width:72%;height:12px;margin-top:10px;border-radius:6px;"></div><div class="skel-box" style="width:46%;height:10px;margin-top:7px;border-radius:6px;"></div></div>'
            ).join('');
        }
        return;
    }

    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!user) return;
    const targetId = user.uid;
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
    // Switching accounts returns to the Welcome screen so the user can choose
    // Create Account or Log In, rather than remaining inside the current session.
    (async function openWelcomeForAccountSwitch() {
        // Set the flag before signOut so onAuthStateChanged bypasses the onboarding carousel.
        window.__flaynityDirectWelcomeAfterSwitch = true;
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
    if (window.AndroidBridge && typeof window.AndroidBridge.triggerGoogleSignIn === 'function') {
        window.__flaynityAccountSwitchShouldOpenChannel = true;
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
            currentChannelData = null;
            try {
                const channelSnapshot = await db.ref(`channels/${result.user.uid}`).once('value');
                currentChannelData = channelSnapshot.val();
                if (currentChannelData) {
                    try { localStorage.setItem('flaynity_channel_cache:' + result.user.uid, JSON.stringify(currentChannelData)); } catch (e) {}
                    openViewChannelPage();
                } else {
                    try { localStorage.removeItem('flaynity_channel_cache:' + result.user.uid); } catch (e) {}
                    const current = AppNavigation.current();
                    if (current && current.type === 'page' && current.id === 'view-channel-page') AppNavigation.pop();
                    AppNavigation.pushTab('you');
                }
            } catch (channelError) {
                console.error('Unable to resolve selected account channel:', channelError);
            }
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
                loveIcon.innerHTML = FB_LIKE_SVG;
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
        <div class="fly-mini" id="fly-mini"><div class="fly-mini-buf" id="fly-mini-buf"></div><div class="fly-mini-fill" id="fly-mini-fill"></div></div>
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


/* Discover Feels feed — robust initialization after modular page injection. */
(function () {
    "use strict";
    var FEELS_PATH = "admin_panel/movies/feels";
    var listenerRef = null;
    var boundGrid = null;
    var retryCount = 0;
    var observer = null;

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
    function showState(grid, message) {
        if (grid) grid.innerHTML = '<div class="discover-feels-empty">' + message + '</div>';
    }
    function renderFeels(snapshot) {
        var grid = document.getElementById("discover-feels-grid");
        if (!grid) return;
        var raw = snapshot && snapshot.val ? snapshot.val() : null;
        var data = raw && typeof raw === "object" ? raw : {};
        var entries = Object.entries(data).filter(function (entry) {
            var item = entry[1] || {};
            var status = String(item.status || item.visibility || "published").toLowerCase();
            return status !== "hidden" && status !== "deleted" && status !== "draft" &&
                   item.published !== false && item.isPublished !== false;
        }).sort(function (a, b) {
            var av = Number((a[1] || {}).createdAt || (a[1] || {}).uploadTime || (a[1] || {}).timestamp || 0);
            var bv = Number((b[1] || {}).createdAt || (b[1] || {}).uploadTime || (b[1] || {}).timestamp || 0);
            return bv - av;
        });
        if (!entries.length) {
            showState(grid, "No Feels available yet");
            return;
        }
        grid.innerHTML = "";
        entries.forEach(function (entry) {
            var item = entry[1] || {};
            var card = document.createElement("div");
            card.className = "discover-feels-card";
            var image = pickImage(item);
            var video = pickVideo(item);
            if (image) {
                var img = document.createElement("img");
                img.src = image;
                img.alt = pickText(item) || "Feel";
                img.loading = "lazy";
                img.onerror = function () {
                    if (video) {
                        var v = document.createElement("video");
                        v.src = video; v.muted = true; v.playsInline = true; v.preload = "metadata";
                        card.insertBefore(v, card.firstChild);
                    } else {
                        img.style.display = "none";
                    }
                };
                card.appendChild(img);
            } else if (video) {
                var vid = document.createElement("video");
                vid.src = video;
                vid.muted = true;
                vid.playsInline = true;
                vid.preload = "metadata";
                card.appendChild(vid);
            } else {
                var placeholder = document.createElement("div");
                placeholder.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;padding:8px;text-align:center";
                placeholder.textContent = pickText(item) || "Feel";
                card.appendChild(placeholder);
            }
            var caption = pickText(item);
            if (caption) {
                var label = document.createElement("div");
                label.className = "discover-feels-caption";
                label.textContent = caption;
                card.appendChild(label);
            }
            grid.appendChild(card);
        });
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
            // Avoid an endless spinner if Firebase never answers (for example, a permission/network error).
            setTimeout(function () {
                var currentGrid = document.getElementById("discover-feels-grid");
                if (currentGrid && currentGrid.querySelector(".discover-feels-empty") &&
                    currentGrid.textContent.indexOf("Loading Feels") !== -1) {
                    showState(currentGrid, "Connecting to Feels…");
                }
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
    // Covers the case where pages-ready fired before this module registered its listener.
    if (document.getElementById("discover-feels-grid")) initAfterInjection();
    if (document.body && typeof MutationObserver !== "undefined") {
        observer = new MutationObserver(function () {
            if (document.getElementById("discover-feels-grid")) initAfterInjection();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
    setTimeout(initAfterInjection, 0);
})();
