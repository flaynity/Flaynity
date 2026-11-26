/* Flaynity Shared Firebase Configuration
 * Single shared Firebase initialization for the application and service pages.
 * Includes WebView-resilient RTDB connection monitoring, fast SDK-vs-REST race,
 * and t=0ms early feed prefetch during the startup Loading Screen.
 */
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
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
} catch (e) {
    console.error("Firebase config crash prevented:", e);
}

const auth = firebase.auth();
const db = firebase.database();

window.__flFirebaseConnected = false;
window.__flLastFirebaseKickAt = 0;

// Ensure RTDB starts online whenever the WebView reports network availability.
try {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        db.goOnline();
    }
} catch (e) {}

// Track live RTDB WebSocket connection state.
try {
    db.ref('.info/connected').on('value', function (snap) {
        var connected = !!snap.val();
        var wasConnected = window.__flFirebaseConnected;
        window.__flFirebaseConnected = connected;
        if (connected) {
            window.__flaynityLiveOnline = true;
            window.__flaynityOfflineSessionActive = false;
            if (!wasConnected) {
                try { window.dispatchEvent(new Event('flaynity-firebase-connected')); } catch (e) {}
            }
        }
    });
} catch (e) {}

// Gently cycle Firebase RTDB socket if WebView WebSocket is stuck in CONNECTING/stalled state.
window.flKickFirebaseConnection = function (force) {
    try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
        if (!force && window.__flFirebaseConnected) return false;
        var now = Date.now();
        if (!force && (now - (window.__flLastFirebaseKickAt || 0)) < 6000) return false;
        window.__flLastFirebaseKickAt = now;
        db.goOffline();
        setTimeout(function () {
            try {
                if (typeof navigator === 'undefined' || navigator.onLine !== false) {
                    db.goOnline();
                }
            } catch (e) {}
        }, 180);
        return true;
    } catch (e) {
        return false;
    }
};

// Direct HTTPS REST reader for Firebase RTDB (works immediately even when WebView WebSocket is still waking up).
window.flRtdbFetchJson = async function (path, timeoutMs) {
    var ms = timeoutMs || 8000;
    var cleanPath = String(path || '').replace(/^\/+|\/+$/g, '');
    var baseUrl = String(firebaseConfig.databaseURL || '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Missing databaseURL');

    var token = '';
    try {
        if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
            token = await Promise.race([
                auth.currentUser.getIdToken(),
                new Promise(function (resolve) { setTimeout(function () { resolve(''); }, 1800); })
            ]);
        }
    } catch (e) { token = ''; }

    var url = baseUrl + '/' + cleanPath + '.json' + (token ? ('?auth=' + encodeURIComponent(token)) : '');
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) try { ctrl.abort(); } catch (e) {} }, ms);
    try {
        var res = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            signal: ctrl ? ctrl.signal : undefined
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error('RTDB REST HTTP ' + res.status);
        var data = await res.json();
        window.__flaynityLiveOnline = true;
        window.__flaynityOfflineSessionActive = false;
        return data;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
};

// Resilient fast RTDB reader: starts SDK .once('value') immediately, and if WebSocket hasn't
// answered within 1.5s (cold start / stalled WebSocket), races HTTPS REST in parallel!
window.flReadRtdbPath = function (path, timeoutMs) {
    var ms = timeoutMs || 8000;
    var wrapVal = function (val) {
        return {
            val: function () { return val; },
            exists: function () { return val !== null && val !== undefined; }
        };
    };

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return Promise.reject(new Error('offline'));
    }

    try { db.goOnline(); } catch (e) {}

    return new Promise(function (resolve, reject) {
        var settled = false;
        var failures = 0;
        var restStarted = false;
        var lastErr = null;

        var finishOk = function (snap) {
            if (settled) return;
            settled = true;
            clearTimeout(restDelayTimer);
            clearTimeout(hardTimer);
            resolve(snap);
        };

        var finishFail = function (err) {
            lastErr = err;
            failures++;
            if (settled) return;
            if (!restStarted) {
                startRest();
                return;
            }
            if (failures >= 2) {
                settled = true;
                clearTimeout(restDelayTimer);
                clearTimeout(hardTimer);
                reject(lastErr || new Error('rtdb_read_failed'));
            }
        };

        var startRest = function () {
            if (settled || restStarted) return;
            restStarted = true;
            try { if (!window.__flFirebaseConnected) window.flKickFirebaseConnection(false); } catch (e) {}
            window.flRtdbFetchJson(path, Math.max(ms, 8000)).then(function (data) {
                finishOk(wrapVal(data));
            }, function (err) {
                finishFail(err);
            });
        };

        var hardTimer = setTimeout(function () {
            if (settled) return;
            settled = true;
            clearTimeout(restDelayTimer);
            var err = new Error('rtdb_timeout');
            err.__flTimeout = true;
            reject(err);
        }, ms);

        // If WebSocket isn't already connected, give SDK 1.2s head-start then race HTTPS REST in parallel.
        var restDelay = window.__flFirebaseConnected ? 2500 : 1200;
        var restDelayTimer = setTimeout(startRest, restDelay);

        try {
            db.ref(path).once('value').then(function (snap) {
                finishOk(snap);
            }, function (err) {
                finishFail(err);
            });
        } catch (err) {
            finishFail(err);
        }
    });
};

// =========================================================================
// EARLY FEED PREFETCH (Runs at t=0ms DURING the Loading Screen!)
// So live Firebase data is already in memory the moment Home Page opens.
// =========================================================================
window.__flEarlyFeedData = null;
window.__flEarlyFeedPrefetchPromise = null;

window.flStartEarlyFeedPrefetch = function () {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(null);
    var p = Promise.allSettled([
        window.flReadRtdbPath('admin_panel/movies/user_uploads', 9000),
        window.flReadRtdbPath('admin_panel/movies/feels', 9000),
        window.flReadRtdbPath('admin_panel/movies/shorts', 9000),
        window.flReadRtdbPath('admin_panel/posts', 9000)
    ]).then(function (results) {
        var longsSnap = results[0].status === 'fulfilled' ? results[0].value : null;
        var feelsSnap = results[1].status === 'fulfilled' ? results[1].value : null;
        var shortsSnap = results[2].status === 'fulfilled' ? results[2].value : null;
        var postsSnap = results[3].status === 'fulfilled' ? results[3].value : null;
        if (longsSnap || feelsSnap || shortsSnap || postsSnap) {
            window.__flEarlyFeedData = {
                longs: longsSnap ? longsSnap.val() : null,
                feels: feelsSnap ? feelsSnap.val() : null,
                shorts: shortsSnap ? shortsSnap.val() : null,
                posts: postsSnap ? postsSnap.val() : null,
                hasLongs: !!longsSnap,
                hasFeels: !!feelsSnap,
                hasShorts: !!shortsSnap,
                hasPosts: !!postsSnap,
                fetchedAt: Date.now()
            };
            try { window.dispatchEvent(new Event('flaynity-early-feed-ready')); } catch (e) {}
            return window.__flEarlyFeedData;
        }
        return null;
    }).catch(function () { return null; });
    window.__flEarlyFeedPrefetchPromise = p;
    return p;
};

// Kick off immediately while the Loading Screen animation is playing!
try {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        window.flStartEarlyFeedPrefetch();
    }
} catch (e) {}
