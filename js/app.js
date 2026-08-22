/* Flaynity Modular Loader — serial page loading + offline cache */
(async function () {
    const pageFiles = [["home","pages/home.html"],["shorts","pages/shorts.html"],["upload","pages/upload.html"],["discover","pages/discover.html"],["you","pages/you.html"]];
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
        const loaded = [];
        for (const [name, url] of pageFiles) {
            loaded.push([name, await loadPage(name, url)]);
        }

        const appScreen = document.createElement("div");
        appScreen.id = "app-screen";
        const startupIds = new Set(["startupSound","splash-screen","toast-container","network-spinner-overlay","auth-screen"]);

        for (const node of loaded[0][1]) {
            if (node.id && startupIds.has(node.id)) app.appendChild(node);
            else appScreen.appendChild(node);
        }
        for (let i = 1; i < loaded.length; i++) {
            for (const node of loaded[i][1]) appScreen.appendChild(node);
        }
        app.appendChild(appScreen);
        document.querySelectorAll(".tab-content").forEach(el => el.classList.toggle("active", el.id === "home-tab"));
        const homeTab = document.getElementById("home-tab");
        if (homeTab) homeTab.classList.add("active");

        showOfflineCachedApp();
        window.dispatchEvent(new Event('flaynity-dom-ready'));
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
                <div style="display: flex; flex-direction: column; gap: 20px; margin-top: 10px;">
                    <!-- Long Video Card Skeleton -->
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div class="skel-box" style="width: 100%; aspect-ratio: 16/9; border-radius: 16px;"></div>
                        <div style="display: flex; gap: 12px; align-items: flex-start; padding: 0 4px;">
                            <div class="skel-box" style="width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;"></div>
                            <div style="display: flex; flex-direction: column; gap: 8px; flex: 1;">
                                <div class="skel-box" style="width: 85%; height: 16px; border-radius: 4px;"></div>
                                <div class="skel-box" style="width: 50%; height: 12px; border-radius: 4px;"></div>
                            </div>
                        </div>
                    </div>

                    <!-- 2-Column Shorts Section Skeleton -->
                    <div style="margin-top: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                            <div class="skel-box" style="width: 20px; height: 20px; border-radius: 4px;"></div>
                            <div class="skel-box" style="width: 80px; height: 18px; border-radius: 4px;"></div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <div class="skel-box" style="width: 100%; aspect-ratio: 2/3; border-radius: 12px;"></div>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <div class="skel-box" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;"></div>
                                    <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                                        <div class="skel-box" style="width: 90%; height: 12px; border-radius: 3px;"></div>
                                        <div class="skel-box" style="width: 50%; height: 10px; border-radius: 3px;"></div>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <div class="skel-box" style="width: 100%; aspect-ratio: 2/3; border-radius: 12px;"></div>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <div class="skel-box" style="width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;"></div>
                                    <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                                        <div class="skel-box" style="width: 90%; height: 12px; border-radius: 3px;"></div>
                                        <div class="skel-box" style="width: 50%; height: 10px; border-radius: 3px;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Another Long Video Card Skeleton -->
                    <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
                        <div class="skel-box" style="width: 100%; aspect-ratio: 16/9; border-radius: 16px;"></div>
                        <div style="display: flex; gap: 12px; align-items: flex-start; padding: 0 4px;">
                            <div class="skel-box" style="width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;"></div>
                            <div style="display: flex; flex-direction: column; gap: 8px; flex: 1;">
                                <div class="skel-box" style="width: 75%; height: 16px; border-radius: 4px;"></div>
                                <div class="skel-box" style="width: 45%; height: 12px; border-radius: 4px;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        function getShortsSkeletonHTML() {
            return `
                <div style="height: 100%; width: 100%; position: relative; background: #000; overflow: hidden;">
                    <div class="skel-box" style="width: 100%; height: 100%; border-radius: 0; opacity: 0.15;"></div>
                    <div style="position: absolute; right: 16px; bottom: 80px; display: flex; flex-direction: column; gap: 20px; align-items: center;">
                        <div class="skel-box" style="width: 44px; height: 44px; border-radius: 50%;"></div>
                        <div class="skel-box" style="width: 44px; height: 44px; border-radius: 50%;"></div>
                        <div class="skel-box" style="width: 44px; height: 44px; border-radius: 50%;"></div>
                        <div class="skel-box" style="width: 40px; height: 40px; border-radius: 50%;"></div>
                    </div>
                    <div style="position: absolute; bottom: 60px; left: 16px; right: 80px; display: flex; flex-direction: column; gap: 10px;">
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <div class="skel-box" style="width: 36px; height: 36px; border-radius: 50%;"></div>
                            <div class="skel-box" style="width: 110px; height: 14px; border-radius: 4px;"></div>
                        </div>
                        <div class="skel-box" style="width: 80%; height: 16px; border-radius: 4px;"></div>
                        <div class="skel-box" style="width: 50%; height: 12px; border-radius: 4px;"></div>
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
            const shorts = document.getElementById('shorts-swiper-container');
            const youBox = document.getElementById('channel-action-box');

            if (home) home.innerHTML = getHomeSkeletonHTML();
            if (shorts) shorts.innerHTML = getShortsSkeletonHTML();
            if (youBox) {
                youBox.innerHTML = `<div class="skel-box" style="width: 100%; height: 48px; border-radius: 20px;"></div>`;
            }
        }

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

            setTimeout(function() {
                const splash = document.getElementById('splash-screen');
                if (splash) {
                    splash.style.opacity = "0";
                    setTimeout(() => { splash.style.display = "none"; }, 600);
                }
            }, 3000); 

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
        // Debounce guard: prevent rapid online/offline flapping from firing multiple syncs
        let _networkOnlineDebounceTimer = null;

        window.addEventListener('online', () => { window.FlaynityNetworkOnline(); });
        window.addEventListener('offline', () => { window.FlaynityNetworkOffline(); });

        window.FlaynityNetworkOnline = function() {
            if (!navigator.onLine) return;

            // Debounce: ignore if another online event fires within 1.5 s
            if (_networkOnlineDebounceTimer) return;
            _networkOnlineDebounceTimer = setTimeout(() => {
                _networkOnlineDebounceTimer = null;
            }, 1500);

            const spinner = document.getElementById('network-spinner-overlay');
            if (spinner) spinner.style.display = 'none';

            try { firebase.database().goOnline(); } catch(e) {}
            showNotification("Network Restored! Syncing Live Data...", "success");

            // Automatically resume queued uploads (mark paused → waiting)
            const waitingUploads = uploadQueue.filter(i => i.status === 'paused' || i.status === 'waiting');
            if (waitingUploads.length > 0) {
                waitingUploads.forEach(item => { item.status = 'waiting'; });
                triggerNextActiveUpload();
            }

            // Sync offline cached likes to the cloud
            syncOfflineLikes();

            // Perform a secure background re-render without reloading WebView
            SyncManager.refreshEverything();

            // Resume any visible video
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

        // Called by MainActivity.onResume via AndroidBridge to trigger a background refresh
        // when the app returns to the foreground after being backgrounded.
        window.FlaynityNativeRefresh = function() {
            if (!navigator.onLine) return;
            // Only refresh if not already in progress
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
                    // ── Step 1: Tear down ALL existing global feed listeners ──────────
                    // This prevents duplicate .on() callbacks accumulating across calls.
                    _detachAllGlobalFeedListeners();

                    // Reset count sentinels so the re-attached listeners always rebuild
                    previousShortsCount = -1;
                    previousLongsCount  = -1;
                    previousPostsCount  = -1;

                    // ── Step 2: Refresh current user profile silently ─────────────────
                    await this.refreshProfile();

                    // ── Step 3: Fetch fresh data snapshots before rebuilding UI ───────
                    const [longsSnap, shortsSnap, postsSnap] = await Promise.all([
                        db.ref('admin_panel/movies/user_uploads').once('value'),
                        db.ref('admin_panel/movies/shorts').once('value'),
                        db.ref('admin_panel/posts').once('value')
                    ]);

                    allLongVideos      = longsSnap.val()  ? Object.values(longsSnap.val())  : [];
                    allShorts          = shortsSnap.val() ? Object.values(shortsSnap.val()) : [];
                    allCommunityPosts  = postsSnap.val()  ? Object.values(postsSnap.val())  : [];

                    // ── Step 4: Re-attach realtime listeners (after data is loaded) ───
                    startRealtimeFeedsListener();

                    // ── Step 5: Rebuild UI ────────────────────────────────────────────
                    buildHomeFeed();

                    const shortsTab = document.getElementById('shorts-tab');
                    if (shortsTab && shortsTab.classList.contains('active')) buildShortsPage();

                    this.refreshAnalytics();

                } catch (err) {
                    console.error("SyncManager Execution Error:", err);
                } finally {
                    // Always release the lock so future calls are not permanently blocked
                    this.isRefreshing = false;
                }
            },

            refreshProfile: async function() {
                const currentUser = auth.currentUser;
                if (currentUser) {
                    // Detach stale per-user listeners before re-fetching
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

        // ── Helper: detach every global feed listener in one place ────────────────
        // Called by SyncManager and cleanupUserSessionData to avoid duplication.
        function _detachAllGlobalFeedListeners() {
            try { db.ref('admin_panel/movies/user_uploads').off(); } catch(e) {}
            try { db.ref('admin_panel/movies/shorts').off(); } catch(e) {}
            try { db.ref('admin_panel/posts').off(); } catch(e) {}

            // Detach per-channel live-UI listeners
            Object.keys(boundChannelListeners).forEach(uid => {
                try { db.ref(`channels/${uid}`).off(); } catch(e) {}
            });
            for (let key in boundChannelListeners) delete boundChannelListeners[key];

            // Detach per-post reaction listeners
            _detachAllPostReactionListeners();
        }

        // Track which post-reaction listeners are active so we can clean them up
        const _boundPostReactionListeners = {};
        function _detachAllPostReactionListeners() {
            Object.keys(_boundPostReactionListeners).forEach(postId => {
                try { db.ref(`post_reactions/${postId}`).off(); } catch(e) {}
                try { db.ref(`movie_comments/${postId}`).off(); } catch(e) {}
            });
            for (let key in _boundPostReactionListeners) delete _boundPostReactionListeners[key];
        }

        // =========================================================
        // UNIVERSAL NATIVE YOUTUBE-STYLE PULL TO REFRESH ENGINE
        // =========================================================
        let touchStartY = 0;
        let touchStartX = 0;
        let touchMoveY = 0;
        let isPTRActive = false;
        let isRefreshingNow = false;

        function isPTRAllowedOnCurrentView() {
            const modalsOpen = document.querySelectorAll('.fullscreen-page[style*="display: flex"], .fullscreen-page[style*="display: block"], .premium-download-modal[style*="display: flex"], #full-movie-page[style*="display: block"], #theme-popup-menu[style*="display: flex"], #full-image-preview-overlay[style*="display: flex"]');
            if (modalsOpen.length > 0) {
                const viewChannel = document.getElementById('view-channel-page');
                if (viewChannel && (viewChannel.style.display === 'flex' || viewChannel.style.display === 'block')) {
                    return viewChannel.scrollTop <= 0;
                }
                return false;
            }

            const activeNav = document.querySelector('.nav-item.active');
            if (!activeNav) return false;
            const activeTabId = activeNav.id.replace('nav-', '');

            if (activeTabId === 'home') {
                return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
            } else if (activeTabId === 'search') {
                return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
            } else if (activeTabId === 'you') {
                return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
            }

            return false;
        }

        function initPullToRefresh() {
            const ptrIndicator = document.getElementById('ptr-indicator');
            const ptrSpinner = document.getElementById('ptr-spinner');

            document.addEventListener('touchstart', (e) => {
                if (isRefreshingNow) return;
                if (isPTRAllowedOnCurrentView()) {
                    touchStartY = e.touches[0].clientY;
                    touchStartX = e.touches[0].clientX;
                    touchMoveY = touchStartY;
                    isPTRActive = true;
                } else {
                    isPTRActive = false;
                }
            }, { passive: true });

            document.addEventListener('touchmove', (e) => {
                if (!isPTRActive || isRefreshingNow) return;
                
                if (!isPTRAllowedOnCurrentView()) {
                    isPTRActive = false;
                    if (ptrIndicator) {
                        ptrIndicator.style.transform = `translateX(-50%) translateY(-70px)`;
                        ptrIndicator.style.opacity = '0';
                    }
                    return;
                }

                const currentY = e.touches[0].clientY;
                const currentX = e.touches[0].clientX;
                const deltaY = currentY - touchStartY;
                const deltaX = Math.abs(currentX - touchStartX);

                // Require vertical dragging and discourage accidental side-swipes
                if (deltaY > 20 && deltaY > deltaX * 1.5) {
                    touchMoveY = currentY;
                    const pullDistance = (deltaY - 20) * 0.45;

                    if (ptrIndicator) {
                        ptrIndicator.style.opacity = Math.min(1, pullDistance / 40);
                        ptrIndicator.style.transform = `translateX(-50%) translateY(${pullDistance - 65}px)`;
                    }
                    if (ptrSpinner) {
                        ptrSpinner.style.transform = `rotate(${pullDistance * 3}deg)`;
                    }
                } else if (deltaY < 0) {
                    isPTRActive = false;
                    if (ptrIndicator) {
                        ptrIndicator.style.transform = `translateX(-50%) translateY(-70px)`;
                        ptrIndicator.style.opacity = '0';
                    }
                }
            }, { passive: true });

            document.addEventListener('touchend', () => {
                if (!isPTRActive || isRefreshingNow) {
                    isPTRActive = false;
                    return;
                }
                
                const deltaY = touchMoveY - touchStartY;
                isPTRActive = false;

                if (deltaY > 90) { // Intentional pull threshold reached
                    isRefreshingNow = true;
                    if (ptrIndicator) {
                        ptrIndicator.style.transform = `translateX(-50%) translateY(20px)`;
                        ptrIndicator.style.opacity = '1';
                    }
                    if (ptrSpinner) {
                        ptrSpinner.classList.add('ptr-spinning');
                    }

                    triggerUniversalPullToRefresh().finally(() => {
                        setTimeout(() => {
                            if (ptrIndicator) {
                                ptrIndicator.style.transform = `translateX(-50%) translateY(-70px)`;
                                ptrIndicator.style.opacity = '0';
                            }
                            if (ptrSpinner) {
                                ptrSpinner.classList.remove('ptr-spinning');
                            }
                            isRefreshingNow = false;
                        }, 400);
                    });
                } else {
                    if (ptrIndicator) {
                        ptrIndicator.style.transform = `translateX(-50%) translateY(-70px)`;
                        ptrIndicator.style.opacity = '0';
                    }
                }
                touchStartY = 0;
                touchMoveY = 0;
            });
        }

        async function triggerUniversalPullToRefresh() {
            playUI('click');
            if (!navigator.onLine) {
                showNotification("Offline - Cannot Refresh", "error");
                return;
            }

            try {
                // Trigger the core SyncManager to update entire app state silently
                await SyncManager.refreshEverything();
                showNotification("Feed Updated!", "success");
            } catch (e) {
                console.error("PTR Refresh Exception:", e);
                showNotification("Refresh failed: " + e.message, "error");
            }
            // Note: isRefreshingNow is reset in the touchend .finally() block,
            // so we do not reset it here to avoid a double-reset race.
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
        const firebaseConfig = {
            apiKey: "AIzaSyCiUTQp_QDSbBIOGJXKI7jJmzQHPu8L14I",
            authDomain: "flaynity-app.firebaseapp.com",
            databaseURL: "https://flaynity-app-default-rtdb.firebaseio.com",
            projectId: "flaynity-app",
            storageBucket: "flaynity-app.firebasestorage.app",
            messagingSenderId: "587469287255",
            appId: "1:587469287255:web:6ec177b0c1c802efc95812",
            measurementId: "G-HPMF5TPJB2"
        };
        
        try {
            firebase.initializeApp(firebaseConfig);
            firebase.database().enablePersistence().catch(err => {
                console.warn("Offline persistence activation bypassed: ", err.code);
            });
        } catch (e) {
            console.error("Firebase config crash prevented:", e);
        }
        
        const auth = firebase.auth();
        const db = firebase.database();
        const googleProvider = new firebase.auth.GoogleAuthProvider();

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
        let allShorts = [];
        let allLongVideos = [];
        let allCommunityPosts = [];
        let activeHomeCategory = "All";
        let watchRecommendedLimit = 10;
        let postRenderLimit = 30;

        // =========================================================
        // CLOUDFLARE R2 S3 SDK CONFIGURATIONS
        // =========================================================
        const R2_CONFIG = {
            accessKeyId: "76b902c42a3697ad5011ef1c72438306",
            secretAccessKey: "33902a8ed31914daf36aa6d6f7a715d93ab1cad856cb7eb286edb05e0fe87763",
            endpoint: "https://b3741135bd1f3e96b6744f11e6a0600.r2.cloudflarestorage.com",
            s3ForcePathStyle: true,
            signatureVersion: 'v4',
            region: 'auto',
            maxRetries: 5,
            httpOptions: {
                timeout: 300000, // 5 minute timeout per chunk
                connectTimeout: 30000
            }
        };
        
        AWS.config.update(R2_CONFIG);
        const s3 = new AWS.S3({ params: { Bucket: 'flaynity-storage' } });
        const PUBLIC_R2_DOMAIN_PREFIX = "https://pub-bcff9c709dbe44d7a50c78e9a0f9bd59.r2.dev";

        // =========================================================
        // S3 R2 OBJECT STORAGE MEDIA UPLOAD MODULE
        // =========================================================
        async function uploadImageToR2(file, folder = "images", retries = 3) {
            if (!s3) throw new Error("R2 Client storage unit is not configured.");
            const uniqueId = "img_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
            const fileKey = `uploads/${folder}/${uniqueId}_${file.name.replace(/\s+/g, '_')}`;
            const params = {
                Key: fileKey,
                Body: file,
                ContentType: file.type || "image/jpeg"
            };

            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    await s3.putObject(params).promise();
                    return `${PUBLIC_R2_DOMAIN_PREFIX}/${fileKey}`;
                } catch (err) {
                    console.warn(`R2 Image Upload attempt ${attempt} failed:`, err);
                    if (attempt === retries) throw err;
                    await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
                }
            }
        }

        function dataURLtoBlob(dataurl) {
            var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
                bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
            while(n--){
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new Blob([u8arr], {type:mime});
        }

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
            currentChannelData = null;
            tempCreateAvatarUrl = "";
            tempEditAvatarUrl = "";
            tempEditBannerUrl = "";
            currentPostImages = [];
            currentDetailItem = null;

            allAdminMovies = [];
            allShorts = [];
            allLongVideos = [];
            allCommunityPosts = [];
            uploadQueue = [];
            localStorage.removeItem('flaynity_upload_queue_v2'); 
            localStorage.removeItem('flaynity_user_session_cache');

            const homeFeed = document.getElementById('home-feed-container');
            if (homeFeed) homeFeed.innerHTML = '';
            
            const shortsSwiper = document.getElementById('shorts-swiper-container');
            if (shortsSwiper) shortsSwiper.innerHTML = '';

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
            if (activeChannelShortsListener) { try { activeChannelShortsListener.off(); } catch(e) {} activeChannelShortsListener = null; }
            if (activeChannelPostsListener) { try { activeChannelPostsListener.off(); } catch(e) {} activeChannelPostsListener = null; }

            // Use shared helper to detach all global feed + channel + post-reaction listeners
            _detachAllGlobalFeedListeners();
            _feedListenersAttached = false;

            // Reset SyncManager lock in case it was stuck
            SyncManager.isRefreshing = false;
        }

        auth.onAuthStateChanged((user) => {
            try {
                if (user) {
                    document.body.classList.remove('auth-active');
                    const authScr = document.getElementById('auth-screen');
                    const appScr = document.getElementById('app-screen');
                    if (authScr) authScr.style.display = 'none';
                    if (appScr) appScr.style.display = 'block';

                    saveAccountToList(user);

                    // Attach user-avatar listener (safe: only once per sign-in)
                    db.ref(`users/${user.uid}`).on('value', (snapshot) => {
                        try {
                            const userData = snapshot.val();
                            const photoURL = userData?.photoURL || user.photoURL || '';
                            renderUserAvatar(photoURL, user.email);
                        } catch (e) {}
                    });

                    // Reset feed-listener flag so startRealtimeFeedsListener
                    // cleanly re-attaches after a sign-out / sign-in cycle.
                    _feedListenersAttached = false;
                    startRealtimeFeedsListener();
                    restoreQueueFromLocalStorage();

                    const activeNav = document.querySelector('.nav-item.active');
                    if (activeNav) {
                        const activeTabId = activeNav.id.replace('nav-', '');
                        adjustHeaderForActiveTab(activeTabId);
                    }
                } else {
                    // Offline cached-session fallback: do not force the login screen when the user has a saved session.
                    if (!navigator.onLine && window.__flaynityOfflineSessionActive) {
                        document.body.classList.remove('auth-active');
                        const cachedAppScreen = document.getElementById('app-screen');
                        const cachedAuthScreen = document.getElementById('auth-screen');
                        if (cachedAppScreen) cachedAppScreen.style.display = 'block';
                        if (cachedAuthScreen) cachedAuthScreen.style.display = 'none';
                        return;
                    }
                    // cleanupUserSessionData already resets _feedListenersAttached
                    cleanupUserSessionData();
                    document.body.classList.add('auth-active');
                    const appScr = document.getElementById('app-screen');
                    const authScr = document.getElementById('auth-screen');
                    if (appScr) appScr.style.display = 'none';
                    if (authScr) authScr.style.display = 'flex';
                }
            } catch (e) {
                console.error("Auth status sync error:", e);
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
        // FAST PARALLEL UPLOAD ENGINE & WATCHDOG (WAITING ISSUE FIX)
        // =========================================================
        let uploadQueue = [];
        let activeUploadsCount = 0;
        const MAX_CONCURRENT_UPLOADS = 3; // প্যারালল ৩টি আপলোড সাপোর্ট

        // Queue Watchdog Engine: আটকে থাকা WAITING ফাইলগুলোকে সচল করার জন্য
        setInterval(() => {
            if (!navigator.onLine) return;
            const hasWaiting = uploadQueue.some(item => item.status === 'waiting');
            if (hasWaiting && activeUploadsCount < MAX_CONCURRENT_UPLOADS) {
                console.log("[Watchdog] Triggering queued uploads...");
                triggerNextActiveUpload();
            }
        }, 3000);

        function triggerFilePicker(type) {
            AppNavigation.pop(); 
            if (type === 'video-long' || type === 'video-short') {
                const picker = document.getElementById('video-file-input');
                if (picker) {
                    picker.dataset.uploadType = type;
                    picker.click();
                }
            } else if (type === 'post-image') {
                openPostSheet();
            }
        }

        async function handleFileSelected(e) {
            const file = e.target.files[0];
            const type = e.target.dataset.uploadType;
            if (!file) return;

            const allowedFormats = ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"];
            if (!allowedFormats.includes(file.type)) {
                showNotification("Invalid format! Supported: MP4, MOV, MKV, WEBM", "error");
                return;
            }
            if (file.size > 10 * 1024 * 1024 * 1024) { 
                showNotification("File size exceeds 10GB limit!", "error");
                return;
            }

            showNotification("Inspecting file frames...", "success");

            let frameMeta = { 
                duration: 60, 
                dataUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=500&auto=format&fit=crop", 
                blob: null 
            };

            try {
                frameMeta = await captureFrameAndDuration(file);
            } catch (err) {
                console.warn("Using metadata fallback safely.", err);
            }

            if (type === 'video-short' && frameMeta.duration > 180) {
                showNotification("This video exceeds Shorts limit (3 mins).", "error");
                return;
            }

            const uniqueId = "st_" + Date.now() + "_" + Math.floor(Math.random()*1000);
            const fileKey = `uploads/${uniqueId}/${file.name.replace(/\s+/g, '_')}`;
            
            const queueItem = {
                id: uniqueId,
                file: file,
                key: fileKey,
                type: type,
                title: file.name.split('.')[0],
                description: "",
                visibility: "Public",
                allowComments: true,
                showLikes: true,
                status: "draft", 
                progress: 0,
                speed: 0,
                eta: 0,
                duration: frameMeta.duration,
                thumbDataUrl: frameMeta.dataUrl,
                thumbBlob: frameMeta.blob, 
                thumbKey: `uploads/${uniqueId}/thumbnail.jpg`,
                thumbUrl: "",
                videoUrl: "",
                s3UploadRef: null,
                retryCount: 0,
                createdAt: Date.now()
            };

            uploadQueue.push(queueItem);
            saveQueueStateToLocalStorage(); 

            currentDetailItem = queueItem;
            openDetailsSheet(queueItem);
            e.target.value = ""; 
        }

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
                item.status = "paused";
                updateManagerUI();
                showNotification("Offline: Upload paused.", "error");
                activeUploadsCount = Math.max(0, activeUploadsCount - 1);
                return;
            }

            item.status = "uploading";
            item.progress = item.progress || 0;
            updateManagerUI();

            const startTime = Date.now();

            try {
                const params = {
                    Key: item.key,
                    Body: item.file,
                    ContentType: item.file.type || 'video/mp4'
                };
                
                // 5MB optimized multipart chunk size
                const uploadOpts = { partSize: 5 * 1024 * 1024, queueSize: 2 };

                const s3Upload = s3.upload(params, uploadOpts);
                item.s3UploadRef = s3Upload;

                s3Upload.on('httpUploadProgress', (evt) => {
                    if (item.status !== 'uploading') return; 
                    const pct = Math.round((evt.loaded / evt.total) * 100);
                    item.progress = pct;

                    const elapsed = (Date.now() - startTime) / 1000;
                    if (elapsed > 0) {
                        item.speed = evt.loaded / elapsed; 
                        item.eta = (evt.total - evt.loaded) / item.speed;
                    }
                    updateManagerUI();
                });

                await s3Upload.promise();
                
                item.videoUrl = `${PUBLIC_R2_DOMAIN_PREFIX}/${item.key}`;
                item.status = "processing";
                item.retryCount = 0;
                updateManagerUI();

                await runPostUploadProcessingSequence(item);

            } catch (err) {
                if (item.status === 'paused') {
                    console.log("Upload paused safely.");
                } else if (!navigator.onLine) {
                    item.status = "paused";
                    updateManagerUI();
                    showNotification("Connection lost. Upload paused.", "error");
                } else {
                    console.error("Upload error: ", err);
                    item.retryCount = (item.retryCount || 0) + 1;
                    
                    if (item.retryCount <= 5) {
                        item.status = "waiting";
                        updateManagerUI();
                        showNotification(`Network hiccup. Retrying (${item.retryCount}/5)...`, "error");
                    } else {
                        item.status = "failed";
                        updateManagerUI();
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

                if (finalThumbBlob && s3) {
                    const thumbParams = { Body: finalThumbBlob, Key: item.thumbKey, ContentType: "image/jpeg" };
                    await s3.putObject(thumbParams).promise();
                    item.thumbUrl = `${PUBLIC_R2_DOMAIN_PREFIX}/${item.thumbKey}`;
                } else {
                    item.thumbUrl = item.thumbDataUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=500&auto=format&fit=crop";
                }

                item.processingMsg = "Publishing Feed...";
                item.progress = 100;
                updateManagerUI();

                // ⚡ INSTANT PUBLISH ENGINE ⚡
                await pushVideoMetadataToDatabase(item);

                item.status = "completed";
                updateManagerUI();
                saveQueueStateToLocalStorage();
                showNotification(`"${item.title}" is published instantly!`, "success");

            } catch (err) {
                item.status = "failed";
                updateManagerUI();
                showNotification("Post-processing error: " + err.message, "error");
            }
        }

        async function pushVideoMetadataToDatabase(item) {
            const user = auth.currentUser;
            if (!user) return;

            const userSnap = await db.ref(`users/${user.uid}`).once('value');
            const uData = userSnap.val() || {};
            const username = uData.username || user.email.split('@')[0];

            const resolution = item.type === 'video-short' ? "1080x1920" : "1920x1080";
            const hashtags = extractHashtags(item.description);

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
                poster: item.thumbUrl || item.thumbDataUrl || "",
                banner: item.thumbUrl || item.thumbDataUrl || "",
                videoLink: item.videoUrl,
                uploadTime: Date.now(),
                updateTime: Date.now(),
                visibility: item.visibility,
                status: "published",
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
                createdAt: Date.now()
            };

            // Step 1: Save Metadata to Firebase Realtime Database
            const targetPath = item.type === 'video-short' 
                ? `admin_panel/movies/shorts/${item.id}` 
                : `admin_panel/movies/user_uploads/${item.id}`;
                
            await db.ref(targetPath).set(moviePayload);

            // Step 2: Zero-Delay Local Feed Update (< 0.1 Seconds)
            if (item.type === 'video-short') {
                const idx = allShorts.findIndex(s => s.id === item.id);
                if (idx !== -1) allShorts[idx] = moviePayload;
                else allShorts.unshift(moviePayload);
                
                buildShortsPage();
            } else {
                const idx = allLongVideos.findIndex(v => v.id === item.id);
                if (idx !== -1) allLongVideos[idx] = moviePayload;
                else allLongVideos.unshift(moviePayload);
            }

            // Step 3: Instant A-Z Screen Refresh
            buildHomeFeed();

            const activePage = AppNavigation.current();
            if (activePage && activePage.id === 'view-channel-page') {
                if (item.type === 'video-short') renderChannelShorts(user.uid);
                else renderChannelVideos(user.uid);
            }
        }

        // =========================================================
        // REALTIME LISTENERS FOR ZERO-REFRESH FEED PROPAGATION
        // =========================================================
        let previousShortsCount = -1;
        let previousLongsCount = -1;
        let previousPostsCount = -1;
        let _feedListenersAttached = false; // guard against duplicate attachment

        function startRealtimeFeedsListener() {
            // Detach any existing listeners before re-attaching to prevent duplicates
            if (_feedListenersAttached) {
                try { db.ref('admin_panel/movies/user_uploads').off(); } catch(e) {}
                try { db.ref('admin_panel/movies/shorts').off(); } catch(e) {}
                try { db.ref('admin_panel/posts').off(); } catch(e) {}
                _feedListenersAttached = false;
            }

            try {
                _feedListenersAttached = true;
                db.ref('admin_panel/movies/user_uploads').on('value', (snap) => {
                    try {
                        const data = snap.val();
                        allLongVideos = data ? Object.values(data) : [];
                        allLongVideos.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
                        
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

                db.ref('admin_panel/movies/shorts').on('value', (snap) => {
                    try {
                        const data = snap.val();
                        allShorts = data ? Object.values(data) : [];
                        allShorts.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
                        
                        if(allShorts.length !== previousShortsCount) {
                            previousShortsCount = allShorts.length;
                            buildHomeFeed();
                            const shortsTab = document.getElementById('shorts-tab');
                            if (shortsTab && shortsTab.classList.contains('active')) {
                                const activeShortId = document.querySelector('.short-slide video[src]')?.closest('.short-slide')?.getAttribute('data-shortid');
                                buildShortsPage();
                                if(activeShortId) {
                                     setTimeout(() => {
                                         const targetSlide = document.getElementById(`slide-short-${activeShortId}`);
                                         if (targetSlide) targetSlide.scrollIntoView({block: 'start'});
                                     }, 50);
                                }
                            }
                        } else {
                            allShorts.forEach(s => {
                                const titleEl = document.querySelector(`#slide-short-${s.id} #short-title-val`);
                                if(titleEl) titleEl.innerHTML = `${escapeHTML(s.title)} <span style="font-weight:400; font-size:0.8rem; color:#ccc; display:block;">Click to view description</span>`;
                                const thumbEl = document.querySelector(`.short-home-card-2col[onclick*="${s.id}"] img`);
                                if (thumbEl) thumbEl.src = s.poster;
                            });
                        }
                    } catch (e) {}
                });

                db.ref('admin_panel/posts').on('value', (snap) => {
                    try {
                        const data = snap.val();
                        allCommunityPosts = data ? Object.values(data) : [];
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
        function bindLiveChannelUI(userId) {
            if (!userId) return;

            // Already have a live listener for this user — skip to avoid duplicates
            if (boundChannelListeners[userId]) return;

            if (!navigator.onLine) return;

            boundChannelListeners[userId] = true;
            db.ref(`channels/${userId}`).on('value', (snap) => {
                updateChannelDOM(userId, snap.val());
            });
        }

        function updateChannelDOM(userId, data) {
            if (!data) return;
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
        function handleImagesSelected(e) {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            if (currentPostImages.length + files.length > 5) {
                showNotification("Maximum 5 images are allowed!", "error");
                return;
            }

            const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
            files.forEach(file => {
                if (!allowed.includes(file.type)) {
                    showNotification(`Skipped "${file.name}" - Unsupported format!`, "error");
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    currentPostImages.push({ file: file, dataUrl: event.target.result });
                    renderPostAttachedImagesUI();
                };
                reader.readAsDataURL(file);
            });
            e.target.value = "";
        }

        function renderPostAttachedImagesUI() {
            const container = document.getElementById('post-preview-grid');
            const countEl = document.getElementById('attached-images-count');
            if (!container || !countEl) return;
            
            countEl.innerText = currentPostImages.length;
            container.innerHTML = "";

            if (currentPostImages.length === 0) {
                container.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 0; cursor: pointer;" id="no-images-placeholder" onclick="document.getElementById('post-image-input').click()">
                        <i class="fas fa-cloud-upload-alt" style="font-size: 1.8rem; color: var(--primary); margin-bottom: 6px;"></i><br>
                        Click to attach photos (Max 5)
                    </div>
                `;
                return;
            }

            currentPostImages.forEach((img, idx) => {
                container.innerHTML += `
                    <div style="position: relative; width: 100%; aspect-ratio:1; border-radius: 8px; overflow: hidden; background: #e2e8f0;">
                        <img src="${img.dataUrl}" style="width: 100%; height:100%; object-fit: cover;">
                        <button onclick="removeAttachedPostImage(${idx})" style="position: absolute; top:4px; right:4px; width:22px; height:22px; border-radius:50%; background:rgba(0,0,0,0.6); color:white; border:none; display:flex; align-items:center; justify-content:center; font-size:0.65rem; cursor:pointer;"><i class="fas fa-times"></i></button>
                    </div>
                `;
            });
        }

        function removeAttachedPostImage(idx) {
            currentPostImages.splice(idx, 1);
            renderPostAttachedImagesUI();
        }

        function appendPostHashtag(tag) {
            playUI('click');
            const input = document.getElementById('post-caption-input');
            if (input) {
                input.value += " " + tag;
                input.focus();
            }
        }

        async function publishPostAction() {
            playUI('click');
            const captionInput = document.getElementById('post-caption-input');
            const caption = captionInput ? captionInput.value.trim() : "";
            const btn = document.getElementById('post-publish-btn');

            if (!caption && currentPostImages.length === 0) {
                showNotification("Post cannot be empty!", "error");
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';

            try {
                const user = auth.currentUser;
                const userSnap = await db.ref(`users/${user.uid}`).once('value');
                const uData = userSnap.val() || {};
                const username = uData.username || user.email.split('@')[0];
                const avatar = currentChannelData?.avatarUrl || user.photoURL || "";

                const uploadedUrls = [];

                for (let i = 0; i < currentPostImages.length; i++) {
                    const img = currentPostImages[i];
                    const imgUrl = await uploadImageToR2(img.file, "posts");
                    uploadedUrls.push(imgUrl);
                }

                const postPayload = {
                    id: "post_" + Date.now(),
                    userId: user.uid,
                    channelId: user.uid,
                    title: caption.split('\n')[0].substring(0, 50) || "Community Post",
                    imageUrl: uploadedUrls[0] || "",
                    caption: caption,
                    uploadTime: Date.now(),
                    visibility: "Public",
                    status: "published",
                    isShort: false,
                    isPost: true,
                    username: username,
                    avatar: avatar,
                    images: uploadedUrls,
                    hideLikes: document.getElementById('post-hide-likes').checked,
                    createdAt: Date.now(),
                    reaction: {},
                    totalLikes: 0,
                    totalReaction: 0,
                    totalComments: 0
                };

                await db.ref(`admin_panel/posts/${postPayload.id}`).set(postPayload);
                
                showNotification("Community Post published successfully!", "success");
                closePostSheet();

                if (captionInput) captionInput.value = "";
                currentPostImages = [];
                const hideLikesCb = document.getElementById('post-hide-likes');
                if (hideLikesCb) hideLikesCb.checked = false;

                buildHomeFeed();

            } catch (err) {
                showNotification("Failed to publish: " + err.message, "error");
            } finally {
                btn.disabled = false;
                btn.innerHTML = "Publish Post";
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
        // UNIFIED REAL-TIME FEED ENGINE FOR HOME PAGE (SKELETON ENFORCED)
        // =========================================================
        function buildHomeFeed() {
            const container = document.getElementById('home-feed-container');
            if (!container) return;

            // ⚠️ STRICT REQUIREMENT: If offline, show ONLY Animated Skeletons (NO cached text, images, or cards)
            if (!navigator.onLine) {
                container.innerHTML = getHomeSkeletonHTML();
                return;
            }

            let html = '';

            let shorts = [...allShorts];
            let longs = [...allLongVideos];
            let posts = [...allCommunityPosts];

            shorts.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
            longs.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
            posts.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));

            const uniqueUserIds = new Set();

            if (activeHomeCategory === "Shorts") {
                if (shorts.length === 0) {
                    container.innerHTML = getHomeSkeletonHTML();
                    return;
                }
                html += `
                    <div class="shorts-section-container" style="margin-top: 10px;">
                        <div class="shorts-home-grid-2col">
                `;
                shorts.forEach(s => {
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
                posts.slice(0, postRenderLimit).forEach(p => {
                    registerPostReactionsListener(p.id);
                });

                uniqueUserIds.forEach(uid => bindLiveChannelUI(uid));
                return;
            }

            let shortIdx = 0;
            let longIdx = 0;
            let postIdx = 0;

            if (shorts.length === 0 && longs.length === 0 && posts.length === 0) {
                container.innerHTML = getHomeSkeletonHTML();
                return;
            }

            let postsToBind = [];

            while (longIdx < longs.length || shortIdx < shorts.length || postIdx < posts.length) {
                if (shortIdx < shorts.length) {
                    const segmentShorts = shorts.slice(shortIdx, shortIdx + 6);
                    shortIdx += 6;
                    segmentShorts.forEach(s => { if (s.userId) uniqueUserIds.add(s.userId); });
                    html += renderShortsSegmentUI(segmentShorts);
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
            postsToBind.forEach(postId => registerPostReactionsListener(postId));
            uniqueUserIds.forEach(uid => bindLiveChannelUI(uid));
        }

        function renderShortsSegmentUI(segmentShorts) {
            if (segmentShorts.length === 0) return '';
            
            const limitedShorts = segmentShorts.slice(0, 6);
            
            let html = `
                <div class="shorts-section-container" style="margin-bottom: 24px;">
                    <div class="section-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:var(--primary);">
                            <path d="M17.77 10.32c-.77-.32-1.2-.5-1.2-.5L18 8.64a2.53 2.53 0 0 0-1.12-3.37 2.45 2.45 0 0 0-3.3.12L7 10.14a2.53 2.53 0 0 0-.27 3.54s1.2.5 1.2.5l-1.43 1.18a2.53 2.53 0 0 0 1.12 3.37 2.45 2.45 0 0 0 3.3-.12l6.57-4.75a2.53 2.53 0 0 0 .28-3.54z" fill="currentColor"/>
                        </svg>
                        Shorts
                    </div>
                    <div class="shorts-home-grid-2col">
            `;

            limitedShorts.forEach(s => {
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
            if (segmentLongs.length === 0) return '';
            
            let html = '';
            segmentLongs.forEach(v => {
                const viewsId = `home-long-views-${v.id}`;
                const relTime = getRelativeTime(v.createdAt);
                
                const avatarHtml = `<div class="live-avatar-${v.userId}" style="width:36px; height:36px; border-radius:50%; overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0;"></div>`;

                html += `
                    <div class="long-video-feed-card" onclick="openMoviePage('${v.id}', false)" style="margin-bottom: 24px; cursor: pointer; background: var(--surface); border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border); box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
                        <div class="long-video-thumb-container" style="position: relative; aspect-ratio: 16/9; background: #000; overflow: hidden;">
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

                db.ref(`movie_stats/${v.id}/views`).once('value', (vSnap) => {
                    const viewsObj = vSnap.val() || {};
                    const count = Object.keys(viewsObj).length;
                    const label = document.getElementById(viewsId);
                    if (label) label.innerText = formatCount(count) + " Views";
                });
            });

            return html;
        }

        function renderSinglePostSegmentUI(post) {
            if (!post) return '';

            const titleText = post.title || post.caption || '';
            const plainCaption = post.caption || '';
            const combinedText = titleText === plainCaption ? plainCaption : `${titleText}\n\n${plainCaption}`;
            
            const isLong = combinedText.length > 80; 
            
            let titleHtml = '';
            if (isLong) {
                titleHtml = `
                    <div id="title-collapsed-${post.id}" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; font-weight: 800;">
                        ${escapeHTML(combinedText)}
                    </div>
                    <div id="title-expanded-${post.id}" style="display: none; line-height: 1.4; max-height: 200px; overflow-y: auto; font-weight: 800;">
                        ${escapeHTML(combinedText)}
                    </div>
                `;
            } else {
                titleHtml = `<div style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; font-weight: 800;">${escapeHTML(combinedText)}</div>`;
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
                    <div style="margin-left: -16px; margin-right: -16px; margin-top: 12px; margin-bottom: 12px; width: calc(100% + 32px); aspect-ratio: 3/4; position: relative; background: #000; overflow: hidden; border-radius: 0 !important;">
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
                <div class="post-card" id="post-card-${post.id}" style="margin-bottom: 24px; background: transparent; border: none; border-radius: 0; padding: 12px 0; box-shadow: none; overflow: hidden; border-bottom: 1px solid var(--border-color);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 0 4px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            ${avatarHtml}
                            <div>
                                <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--text-main); margin: 0;" class="live-username-${post.userId}">@${escapeHTML(post.username)}</h4>
                                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">${getRelativeTime(post.createdAt)}</span>
                            </div>
                        </div>
                        <button id="${subBtnId}" onclick="toggleShortSubscribe('${post.userId}', this)" style="background: none; border: 1.5px solid var(--primary); color: var(--primary); padding: 4px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: 800; cursor: pointer; transition: all 0.2s;">Subscribe</button>
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

        function openShortFromHome(shortId) {
            switchTab('shorts');
            buildShortsPage();
            setTimeout(() => {
                const targetSlide = document.getElementById(`slide-short-${shortId}`);
                if (targetSlide) {
                    targetSlide.scrollIntoView({ block: 'start', behavior: 'auto' });
                    const video = targetSlide.querySelector('video');
                    if (video) {
                        video.currentTime = 0;
                        video.muted = false;
                        video.play().catch(() => {
                            video.muted = true;
                            video.play().catch(() => {});
                        });
                    }
                }
            }, 50);
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
        // HIGH PERFORMANCE SHORTS BUILDER (SKELETON ENFORCED)
        // =========================================================
        let hlsInstances = {}; 

        function buildShortsPage() {
            const container = document.getElementById('shorts-swiper-container');
            if (!container) return;
            
            // ⚠️ STRICT REQUIREMENT: If offline, show ONLY Animated Skeletons (NO cached items)
            if (!navigator.onLine) {
                container.innerHTML = getShortsSkeletonHTML();
                return;
            }

            let activeShortsList = allShorts;

            if (activeShortsList.length === 0) {
                container.innerHTML = getShortsSkeletonHTML();
                return;
            }

            let html = '';
            activeShortsList.forEach(s => {
                const isLikedId = `short-like-btn-${s.id}`;
                const likesCountId = `short-likes-count-${s.id}`;
                const commentsCountId = `short-comments-count-${s.id}`;
                const statsCacheKey = `flaynity_stats_cache_${s.id}`;

                let cachedStats = { likes: 0, comments: 0 };
                let offlineLikes = JSON.parse(localStorage.getItem('flaynity_offline_likes') || '{}');
                let isLocallyLiked = !!offlineLikes[s.id];
                try {
                    cachedStats = JSON.parse(localStorage.getItem(statsCacheKey) || '{"likes": 0, "comments": 0}');
                } catch(e) {}

                if(isLocallyLiked && cachedStats.likes === 0) cachedStats.likes = 1;

                html += `
                    <div class="short-slide" id="slide-short-${s.id}" data-shortid="${s.id}">
                        <div class="short-buffer-spinner" id="short-spinner-${s.id}"></div>
                        <div class="short-play-pause-overlay" id="short-pp-overlay-${s.id}"></div>

                        <video class="short-video-el" loop playsinline webkit-playsinline></video>

                        <div class="short-progress-container">
                            <div class="short-progress-bar" id="short-progress-bar-${s.id}"></div>
                        </div>

                        <div class="short-right-actions">
                            <div class="short-action-container">
                                <button class="short-action-btn-tiktok" id="${isLikedId}" onclick="toggleShortLike('${s.id}')">
                                    <i class="${isLocallyLiked ? 'fas fa-heart liked' : 'far fa-heart'}"></i>
                                </button>
                                <div class="short-action-label-tiktok" id="${likesCountId}">${formatCount(cachedStats.likes)}</div>
                            </div>

                            <div class="short-action-container">
                                <button class="short-action-btn-tiktok-other" onclick="openShortComments('${s.id}')">
                                    <i class="far fa-comment"></i>
                                </button>
                                <div class="short-action-label-tiktok" id="${commentsCountId}">${formatCount(cachedStats.comments)}</div>
                            </div>

                            <div class="short-action-container">
                                <button class="short-action-btn-tiktok-other" onclick="triggerShortDownload('${s.id}')">
                                    <i class="fas fa-download"></i>
                                </button>
                                <div class="short-action-label-tiktok">Save</div>
                            </div>

                            <div class="music-disc-container">
                                <div class="music-disc-inner live-disc-avatar-${s.userId}" id="music-disc-${s.id}">
                                    <img src="${s.channelAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=100'}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
                                </div>
                            </div>
                        </div>

                        <div class="short-bottom-info">
                            <div class="short-channel-row" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                                <div class="live-avatar-${s.userId}" style="width:32px; height:32px; border-radius:50%; border:2px solid #fff; overflow:hidden;"></div>
                                <span class="short-channel-handle live-handle-${s.userId}" style="font-size:0.9rem; font-weight:800; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,0.8);">@${s.username || 'flaynity'}</span>
                                <button class="short-subscribe-btn" id="short-sub-btn-${s.id}" onclick="toggleShortSubscribe('${s.userId}', this)">Subscribe</button>
                            </div>
                            
                            <div class="short-title-wrap" onclick="openShortDescBottomSheet('${s.id}')" style="cursor:pointer;">
                                <h2 id="short-title-val" style="font-size: 0.95rem; font-weight: 800; color: #ffffff; margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">
                                    ${escapeHTML(s.title)} <span style="font-weight:400; font-size:0.8rem; color:#ccc; display:block;">Click to view description</span>
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
                            likeBtn.innerHTML = `<i class="far fa-heart"></i>`;
                        }
                    }
                });

                db.ref(`movie_comments/${s.id}`).on('value', (snapshot) => {
                    const commentsObj = snapshot.val() || {};
                    const count = Object.keys(commentsObj).length;

                    try {
                        let currCache = JSON.parse(localStorage.getItem(statsCacheKey) || '{"likes": 0, "comments": 0}');
                        currCache.comments = count;
                        localStorage.setItem(statsCacheKey, JSON.stringify(currCache));
                    } catch(e) {}

                    const lblComments = document.getElementById(commentsCountId);
                    if (lblComments) lblComments.innerText = formatCount(count);
                });

                if (auth.currentUser) {
                    db.ref(`subscribers/${s.userId}/${auth.currentUser.uid}`).on('value', (snapshot) => {
                        const subBtn = document.getElementById(`short-sub-btn-${s.id}`);
                        if (subBtn) {
                            if (snapshot.exists()) {
                                subBtn.innerText = "Subscribed";
                                subBtn.style.background = "#4B5563";
                            } else {
                                subBtn.innerText = "Subscribe";
                                subBtn.style.background = "var(--primary)";
                            }
                        }
                    });
                }
            });

            container.innerHTML = `<div class="shorts-swiper">${html}</div>`;
            initShortsObserver();
            setupDoubleTapListeners();
            bindShortsVideoEvents();

            const uniqueUserIds = new Set();
            activeShortsList.forEach(s => { if (s.userId) uniqueUserIds.add(s.userId); });
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

        function bindShortsVideoEvents() {
            document.querySelectorAll('.short-slide').forEach(slide => {
                const video = slide.querySelector('video');
                if (!video) return;
                const shortId = slide.getAttribute('data-shortid');

                video.setAttribute('playsinline', '');
                video.setAttribute('webkit-playsinline', '');
                video.style.background = 'transparent';

                video.onplay = () => {
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
            const s = allShorts.find(item => item.id === shortId);
            if (!s) return;

            document.getElementById('short-sheet-full-title').innerText = s.title;
            
            const hashtagRegex = /#\w+/g;
            const hashtags = s.description.match(hashtagRegex) ? s.description.match(hashtagRegex).join(' ') : '#shorts #flaynity';
            const plainDescription = s.description.replace(hashtagRegex, '').trim();
            
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
            } catch (e) {
                console.error(e);
            }
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
                        likeBtn.innerHTML = `<i class="far fa-heart"></i>`;
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
            } catch (e) {
                console.error(e);
            }
        }

        function openShortComments(shortId) {
            playUI('click');
            currentActiveMovie = allShorts.find(s => s.id === shortId);
            if (!currentActiveMovie) return;
            openCommentModal();
            registerViewAndListen(shortId);
        }

        // =========================================================
        // SECURE DOWNLOAD SYSTEM IMPLEMENTATION
        // =========================================================
        async function triggerFileDownload(url, filename) {
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

        function triggerShortDownload(shortId) {
            playUI('click');
            const s = allShorts.find(item => item.id === shortId);
            if (!s) {
                showNotification("No valid short found.", "error");
                return;
            }
            currentActiveMovie = s;
            openDownloadModal();
        }

        function toggleShortSubscribe(channelId, buttonEl) {
            playUI('click');
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
        // SHORTS MEMORY OPTIMIZATION & INTERSECTION OBSERVER
        // =========================================================
        let currentActiveShortsIdx = -1;
        
        function attachSmartAdaptiveSource(videoElement, url, shortId) {
            if (url && url.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
                if(hlsInstances[shortId]) {
                    hlsInstances[shortId].destroy();
                }
                const hls = new Hls({
                    maxBufferLength: 30,
                    maxMaxBufferLength: 600,
                    enableWorker: true,
                    lowLatencyMode: true,
                    capLevelToPlayerSize: true
                });
                hls.loadSource(url);
                hls.attachMedia(videoElement);
                hlsInstances[shortId] = hls;
            } else {
                videoElement.src = url;
            }
        }

        function optimizeShortsMemoryAndPreload(activeIndex) {
            const slides = document.querySelectorAll('.short-slide');
            slides.forEach((slide, idx) => {
                const video = slide.querySelector('video');
                if (!video) return;
                const shortId = slide.getAttribute('data-shortid');
                const s = allShorts.find(item => item.id === shortId);
                if (!s) return;

                if (idx >= activeIndex - 1 && idx <= activeIndex + 2) {
                    if (video.getAttribute('poster') !== s.poster) {
                        video.setAttribute('poster', s.poster);
                    }

                    if (!video.getAttribute('src') && !hlsInstances[shortId]) {
                        attachSmartAdaptiveSource(video, s.videoLink, shortId);
                        video.preload = (idx === activeIndex) ? "auto" : "metadata";
                    }

                    if (idx === activeIndex) {
                        video.preload = "auto";
                        video.muted = false;
                        let playPromise = video.play();
                        if (playPromise !== undefined) {
                            playPromise.catch(() => {
                                video.muted = true;
                                video.play().catch(e => console.log(e));
                            });
                        }
                    } else {
                        video.preload = "metadata";
                        video.pause();
                        video.currentTime = 0;
                    }
                } else {
                    video.pause();
                    video.removeAttribute('src');
                    video.removeAttribute('preload');
                    if (hlsInstances[shortId]) {
                        hlsInstances[shortId].destroy();
                        delete hlsInstances[shortId];
                    }
                    video.load();
                }
            });
        }

        let shortsObserver;
        function initShortsObserver() {
            if (shortsObserver) shortsObserver.disconnect();
            
            shortsObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const video = entry.target.querySelector('video');
                    const shortId = entry.target.id.replace('slide-short-', '');
                    const progressBar = entry.target.querySelector(`#short-progress-bar-${shortId}`);

                    if (video) {
                        if (entry.isIntersecting) {
                            const slides = Array.from(document.querySelectorAll('.short-slide'));
                            const activeIdx = slides.indexOf(entry.target);
                            if (activeIdx !== -1 && activeIdx !== currentActiveShortsIdx) {
                                currentActiveShortsIdx = activeIdx;
                                optimizeShortsMemoryAndPreload(activeIdx);
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

            document.querySelectorAll('.short-slide').forEach(slide => { shortsObserver.observe(slide); });
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

                document.querySelectorAll('.tab-content, .nav-item').forEach(el => el.classList.remove('active'));
                const tabEl = document.getElementById(`${activeTab}-tab`);
                const navEl = document.getElementById(`nav-${activeTab}`);
                if (tabEl) tabEl.classList.add('active');
                if (navEl) navEl.classList.add('active');

                adjustHeaderForActiveTab(activeTab);

                if (activeTab === 'you') initYouTabUI();
                if (activeTab === 'shorts') buildShortsPage();

                if (activePage) {
                    if (activePage === 'full-movie-page') {
                        if (moviePage) moviePage.style.display = 'block';
                        document.body.style.overflow = 'hidden';
                    } else {
                        const targetId = activePage.endsWith('-page') ? activePage : (activePage + '-page');
                        const pageEl = document.getElementById(targetId);
                        if (pageEl) pageEl.style.display = 'flex';
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

            startVideoPlayer();
            registerViewAndListen(currentActiveMovie.id);
            loadChannelMetaForWatchPage(currentActiveMovie.userId || currentActiveMovie.channelId);
            
            AppNavigation.pushPage('full-movie-page');
        }

        function startVideoPlayer() {
            if(!currentActiveMovie || !currentActiveMovie.videoLink) { showNotification("No playable links found.", "error"); return; }
            const link = currentActiveMovie.videoLink;
            const container = document.getElementById('video-player-container');
            const skeleton = document.getElementById('video-player-skeleton');
            const banner = document.getElementById('movie-detail-banner');
            
            if (banner) banner.style.display = 'none'; 
            if (skeleton) skeleton.style.display = 'none';
            if (container) {
                container.style.display = 'block';

                if(link.includes('youtube.com') || link.includes('youtu.be')) {
                    const ytId = extractVideoID(link);
                    container.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1&modestbranding=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
                } else {
                    container.innerHTML = `<video id="premium-video-watch-el" controls playsinline style="width:100%; height:100%; object-fit:contain;"></video>`;
                    const videoEl = document.getElementById('premium-video-watch-el');
                    
                    if (videoEl) {
                        attachSmartAdaptiveSource(videoEl, link, 'long_video_main');
                        videoEl.play().catch(()=>{});
                        videoEl.onended = () => { playNextRecommendedVideo(); };
                    }
                }
            }
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
            db.ref(`channels/${channelId}`).on('value', (snap) => {
                const data = snap.val() || {};
                const avatarImg = document.getElementById('movie-channel-avatar');

                if (avatarImg) avatarImg.src = data.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=100&auto=format&fit=crop";
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
                if (snap.exists()) {
                    likeRef.remove();
                } else {
                    likeRef.set(true);
                    dislikeRef.remove();
                }
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
                if (snap.exists()) {
                    dislikeRef.remove();
                } else {
                    dislikeRef.set(true);
                    likeRef.remove();
                }
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
                const avatar = currentChannelData?.avatarUrl || auth.currentUser.photoURL || "";

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
                        showNotification("Comment posted!", "success");
                    })
                    .catch(err => { showNotification("Failed to post comment", "error"); });
            });
        }

        function renderCommentList(commentsObj) {
            const container = document.getElementById('comment-list-container');
            if (!container) return;

            const comments = Object.values(commentsObj).sort((a,b) => b.timestamp - a.timestamp);
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
                        <div class="long-video-thumb-container" style="position: relative; aspect-ratio: 16/9; background: #000; overflow: hidden;">
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

            if (tabId === 'shorts') {
                header.style.display = 'none';
                document.body.style.paddingTop = '0px';
                document.body.style.paddingBottom = '0px';
                if (chips) chips.style.display = 'none';
                return;
            } else {
                header.style.display = 'flex';
                document.body.style.paddingBottom = '50px';
            }

            document.body.style.paddingTop = '126px';

            if (tabId === 'home') {
                if (chips) chips.style.display = 'grid';
            } else {
                if (chips) chips.style.display = 'none';
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
                // Render from cache if available, otherwise show skeleton
                if (currentChannelData) {
                    renderYouTabWithData(currentChannelData, user, wrap);
                } else {
                    wrap.innerHTML = `<div class="skel-box" style="width: 100%; height: 48px; border-radius: 20px;"></div>`;
                }
                return;
            }

            // Use .once() to avoid stacking duplicate persistent listeners each time
            // the You tab is opened. The global startRealtimeFeedsListener already
            // maintains a live channel listener for the current user.
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
                    shortsCount: 0,
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
                openViewChannelPage();
            } catch(err) {
                showNotification("Error creating channel: " + err.message, "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = "Create Channel";
                }
            }
        }

        function openViewChannelPage() {
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
        }

        let activeChannelVideosListener = null;
        let activeChannelShortsListener = null;
        let activeChannelPostsListener = null;

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
            else if (type === 'shorts') renderChannelShorts(targetId);
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
                <div class="short-grid-card" onclick="openMoviePage('${s.id}', false)">
                    <img src="${s.poster}">
                    <div class="short-grid-views">
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
                    return;
                }

                const list = Object.values(data).filter(m => m.userId === userId && !m.isShort);
                const vidCount = document.getElementById('view-vid-count');
                if (vidCount) vidCount.innerText = list.length + " Video" + (list.length === 1 ? "" : "s");

                if (list.length === 0) {
                    grid.innerHTML = `<p style="text-align:center; color:var(--text-muted); margin-top:20px;">No uploaded videos yet.</p>`;
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

        function renderChannelShorts(userId) {
            const grid = document.getElementById('channel-shorts-grid');
            if (!grid) return;
            if (activeChannelShortsListener) { activeChannelShortsListener.off(); }

            activeChannelShortsListener = db.ref('admin_panel/movies/shorts');
            activeChannelShortsListener.on('value', (snap) => {
                const data = snap.val();
                if (!data) {
                    grid.innerHTML = `<p style="text-align:center; color:var(--text-muted); grid-column: 1/-1; margin-top:20px;">No shorts uploaded yet.</p>`;
                    return;
                }

                const list = Object.values(data).filter(m => m.userId === userId);
                if (list.length === 0) {
                    grid.innerHTML = `<p style="text-align:center; color:var(--text-muted); grid-column: 1/-1; margin-top:20px;">No shorts uploaded yet.</p>`;
                    return;
                }

                grid.innerHTML = list.map(m => buildChannelShortCard({
                    id: m.id,
                    poster: m.poster,
                    views: 0
                })).join('');

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

        function openCreateBottomSheet() {
            if (!currentChannelData) {
                const promptChan = confirm("You need to create a Channel first before uploading content.\n\nWould you like to create a Channel now?");
                if (promptChan) {
                    switchTab('you');
                    openCreateChannelPage();
                }
                return;
            }
            AppNavigation.pushModal('create-bottom-sheet');
        }

        function closeCreateBottomSheet() {
            AppNavigation.pop();
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
            let longViews = 0, shortsViews = 0;

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

                const sSnap = await db.ref('admin_panel/movies/shorts').once('value');
                if (sSnap.exists()) {
                    const sData = Object.values(sSnap.val()).filter(m => m.userId === userId);
                    sCount = sData.length;
                    for (let m of sData) {
                        const statSnap = await db.ref(`movie_stats/${m.id}`).once('value');
                        const stat = statSnap.val() || {};
                        const viewsCount = Object.keys(stat.views || {}).length;
                        tViews += viewsCount;
                        shortsViews += viewsCount;
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

            const calculatedRevenue = ((longViews / 1000) * 0.30) + ((shortsViews / 1000) * 0.15);
            const estRevenueElement = document.getElementById('estimated-revenue-val');
            if (estRevenueElement) {
                estRevenueElement.innerText = '$' + calculatedRevenue.toFixed(2) + ' USDT';
            }

            const watchHours = parseFloat(((longViews * 3.5) / 60).toFixed(1)) || 0;
            const totalViews = longViews + shortsViews;
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
                    publicShortsViews: shortsViews,
                    publicLongVideoViews: longViews,
                    totalLikes: tLikes,
                    totalComments: tComments,
                    totalVideos: vCount,
                    totalShorts: sCount,
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

        function openDetailsSheet(item) {
            const tLoading = document.getElementById('details-thumb-loading');
            const tImg = document.getElementById('details-thumb-img');
            const tInput = document.getElementById('details-title-input');
            const dInput = document.getElementById('details-desc-input');
            const visibilitySelect = document.getElementById('details-visibility');
            const commentsSwitch = document.getElementById('details-comments-switch');
            const likesSwitch = document.getElementById('details-likes-switch');
            const sheetTitle = document.getElementById('details-sheet-title');
            const hashtagSelector = document.getElementById('hashtags-selector-wrapper');

            if (tLoading) tLoading.style.display = 'none';
            if (tImg) tImg.src = item.thumbDataUrl || "";
            if (tInput) tInput.value = item.title || "";
            if (dInput) dInput.value = item.description || "";
            if (visibilitySelect) visibilitySelect.value = item.visibility || "Public";
            if (commentsSwitch) commentsSwitch.checked = item.allowComments;
            if (likesSwitch) likesSwitch.checked = item.showLikes;

            const isShort = item.type === 'video-short';
            if (sheetTitle) sheetTitle.innerText = isShort ? "Upload Short Clip" : "Upload Video";
            if (hashtagSelector) hashtagSelector.style.display = isShort ? "block" : "none";
            
            AppNavigation.pushModal('upload-details-sheet');
        }

        function closeDetailsSheet() {
            AppNavigation.pop();
        }

        function openPostSheet() {
            currentPostImages = [];
            renderPostAttachedImagesUI();
            AppNavigation.pushModal('create-post-sheet');
        }

        function closePostSheet() {
            AppNavigation.pop();
        }

        function openUploadManager() {
            updateManagerUI();
            AppNavigation.pushModal('upload-manager-screen');
        }

        function closeUploadManager() {
            AppNavigation.pop();
        }

        function appendHashtag(tag, el) {
            playUI('click');
            const title = document.getElementById('details-title-input');
            if (title) title.value += " " + tag;
            if (el) el.classList.add('selected');
        }

        function syncDetailsFormToState() {
            if (!currentDetailItem) return;
            const tInput = document.getElementById('details-title-input');
            const dInput = document.getElementById('details-desc-input');
            const vSelect = document.getElementById('details-visibility');
            const cSwitch = document.getElementById('details-comments-switch');
            const lSwitch = document.getElementById('details-likes-switch');

            currentDetailItem.title = tInput ? (tInput.value.trim() || currentDetailItem.file.name) : currentDetailItem.file.name;
            currentDetailItem.description = dInput ? dInput.value.trim() : "";
            currentDetailItem.visibility = vSelect ? vSelect.value : "Public";
            currentDetailItem.allowComments = cSwitch ? cSwitch.checked : true;
            currentDetailItem.showLikes = lSwitch ? lSwitch.checked : true;
        }

        function handleSaveDraftAction() {
            playUI('click');
            syncDetailsFormToState();
            currentDetailItem.status = "draft"; 
            saveQueueStateToLocalStorage();
            showNotification("Draft saved successfully!", "success");
            AppNavigation.pop(); 
            openUploadManager();
        }

        function handleDiscardDetailsSheet() {
            playUI('click');
            if (confirm("Are you sure you want to discard this upload?")) {
                AppNavigation.pop(); 
                const index = uploadQueue.findIndex(i => i.id === currentDetailItem.id);
                if (index !== -1) {
                    uploadQueue.splice(index, 1);
                    saveQueueStateToLocalStorage();
                    updateManagerUI();
                }
            }
        }

        function handlePublishAction() {
            playUI('click');
            syncDetailsFormToState();
            currentDetailItem.status = "waiting";
            saveQueueStateToLocalStorage();
            AppNavigation.pop(); 
            showNotification("Added to Upload Queue", "success");
            openUploadManager();
            triggerNextActiveUpload();
        }

        let currentManagerTab = "uploading";
        function switchManagerTab(type) {
            playUI('click');
            currentManagerTab = type;
            const uTab = document.getElementById('man-tab-uploading');
            const dTab = document.getElementById('man-tab-drafts');
            const cTab = document.getElementById('man-tab-completed');

            if (uTab) uTab.classList.toggle('active', type === 'uploading');
            if (dTab) dTab.classList.toggle('active', type === 'drafts');
            if (cTab) cTab.classList.toggle('active', type === 'completed');
            updateManagerUI();
        }

        function updateManagerUI() {
            const listContainer = document.getElementById('manager-items-list');
            if (!listContainer) return;

            const activeItems = uploadQueue.filter(i => i.status !== 'completed' && i.status !== 'draft');
            const draftItems = uploadQueue.filter(i => i.status === 'draft');
            const completedItems = uploadQueue.filter(i => i.status === 'completed');

            const activeCount = document.getElementById('man-count-active');
            const draftsCount = document.getElementById('man-count-drafts');
            if (activeCount) activeCount.innerText = activeItems.length;
            if (draftsCount) draftsCount.innerText = draftItems.length;

            let renderSet = [];
            if (currentManagerTab === "uploading") renderSet = activeItems;
            else if (currentManagerTab === "drafts") renderSet = draftItems;
            else renderSet = completedItems;

            if (renderSet.length === 0) {
                listContainer.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:40px 0;">No items found.</p>`;
                return;
            }

            listContainer.innerHTML = renderSet.map(item => {
                const isDraft = item.status === 'draft';
                const isFailed = item.status === 'failed';
                const isPaused = item.status === 'paused';
                const isUploading = item.status === 'uploading';
                const isProcessing = item.status === 'processing';

                let progressHtml = '';
                let statusTextHtml = '';

                if (isUploading) {
                    const speedFormatted = (item.speed / 1024 / 1024).toFixed(1) + " MB/s";
                    const etaFormatted = isNaN(item.eta) ? "Calculating..." : Math.ceil(item.eta) + "s remaining";
                    progressHtml = `<div class="queue-progress-container"><div class="queue-progress-fill" style="width: ${item.progress}%"></div></div>`;
                    statusTextHtml = `<span>Uploading: ${speedFormatted} • ETA: ${etaFormatted}</span>`;
                } else if (isProcessing) {
                    progressHtml = `<div class="queue-progress-container"><div class="queue-progress-fill" style="width: ${item.progress}%"></div></div>`;
                    statusTextHtml = `<span style="color:var(--primary); font-weight:800;">${item.processingMsg || "Processing..."}</span>`;
                } else if (isFailed) {
                    statusTextHtml = `<span style="color:#EF4444;">Upload Failed</span>`;
                } else if (isPaused) {
                    statusTextHtml = `<span style="color:var(--text-muted);">Paused</span>`;
                } else if (isDraft) {
                    statusTextHtml = `<span>Draft Layout Saved</span>`;
                } else {
                    statusTextHtml = `<span style="color:var(--success);">Completed</span>`;
                }

                let actionBtn = "";
                if (isUploading) {
                    actionBtn = `<button class="queue-btn" onclick="pauseQueueItem('${item.id}')" title="Pause"><i class="fas fa-pause"></i></button>`;
                } else if (isPaused || isFailed) {
                    actionBtn = `<button class="queue-btn" onclick="resumeQueueItem('${item.id}')" title="Resume"><i class="fas fa-play"></i></button>`;
                } else if (isDraft) {
                    actionBtn = `<button class="queue-btn" onclick="continueDraftQueueItem('${item.id}')" title="Edit details"><i class="fas fa-edit"></i></button>`;
                }

                const deleteBtn = `<button class="queue-btn" onclick="deleteQueueItem('${item.id}')" title="Remove"><i class="fas fa-trash"></i></button>`;

                return `
                    <div class="queue-item-card">
                        <img class="queue-thumb" src="${item.thumbDataUrl || ''}">
                        <div class="queue-details">
                            <h4 class="queue-title">${item.title}</h4>
                            <div class="queue-status-txt">
                                ${statusTextHtml}
                                <span>${item.progress}%</span>
                            </div>
                            ${progressHtml}
                        </div>
                        <div class="queue-actions-row">
                            ${actionBtn}
                            ${deleteBtn}
                        </div>
                    </div>
                `;
            }).join('');
        }

        function pauseQueueItem(id) {
            playUI('click');
            const item = uploadQueue.find(i => i.id === id);
            if (item) {
                item.status = "paused";
                if (item.s3UploadRef) {
                    try { item.s3UploadRef.abort(); } catch(e) {}
                    item.s3UploadRef = null;
                }
                saveQueueStateToLocalStorage();
                updateManagerUI();
                triggerNextActiveUpload();
            }
        }

        function resumeQueueItem(id) {
            playUI('click');
            const item = uploadQueue.find(i => i.id === id);
            if (!item) return;

            if (!item.file) {
                const picker = document.getElementById('video-file-input');
                if (picker) {
                    picker.dataset.uploadType = item.type;
                    picker.onchange = function(e) {
                        const file = e.target.files[0];
                        if (file) {
                            item.file = file;
                            item.status = "waiting";
                            saveQueueStateToLocalStorage();
                            updateManagerUI();
                            triggerNextActiveUpload();
                        }
                    };
                    picker.click();
                }
                showNotification("Please select the original file to resume upload", "success");
                return;
            }

            item.status = "waiting";
            saveQueueStateToLocalStorage();
            updateManagerUI();
            triggerNextActiveUpload();
        }

        function continueDraftQueueItem(id) {
            playUI('click');
            const item = uploadQueue.find(i => i.id === id);
            if (item) {
                currentDetailItem = item;
                openDetailsSheet(item);
            }
        }

        function deleteQueueItem(id) {
            playUI('click');
            if (confirm("Are you sure you want to remove this upload entry?")) {
                const item = uploadQueue.find(i => i.id === id);
                if (item && item.s3UploadRef) {
                    try { item.s3UploadRef.abort(); } catch(e) {}
                }
                uploadQueue = uploadQueue.filter(i => i.id !== id);
                saveQueueStateToLocalStorage();
                updateManagerUI();
                triggerNextActiveUpload();
            }
        }

        function saveQueueStateToLocalStorage() {
            try {
                const serializableQueue = uploadQueue.map(item => {
                    const copy = { ...item };
                    delete copy.file; 
                    delete copy.thumbBlob;
                    delete copy.s3UploadRef;
                    return copy;
                });
                localStorage.setItem('flaynity_upload_queue_v2', JSON.stringify(serializableQueue));
            } catch (e) {
                console.warn("Could not save upload queue state to LocalStorage:", e);
            }
        }

        function restoreQueueFromLocalStorage() {
            try {
                const data = localStorage.getItem('flaynity_upload_queue_v2');
                if (data) {
                    const saved = JSON.parse(data);
                    uploadQueue = saved.map(item => {
                        item.file = null; 
                        item.thumbBlob = null;
                        item.s3UploadRef = null;
                        if (item.status === 'uploading' || item.status === 'waiting' || item.status === 'processing') {
                            item.status = 'paused';
                        }
                        return item;
                    });
                    updateManagerUI();
                }
            } catch (e) {
                console.warn("Could not restore upload queue state:", e);
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
            // Guard: only attach once per postId to prevent duplicate listeners
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
