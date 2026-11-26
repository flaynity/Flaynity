/* Flaynity Shared Firebase Configuration
 * Single shared Firebase initialization for the application and service pages.
 * Includes WebView-resilient RTDB connection monitoring, automatic WebSocket recovery,
 * and HTTPS REST fallback when Android WebView stalls Firebase WebSockets.
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

// Direct HTTPS REST fallback for Firebase RTDB when Android WebView WebSocket hangs.
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
                new Promise(function (resolve) { setTimeout(function () { resolve(''); }, 2500); })
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

// Resilient single-path RTDB reader: uses SDK .once('value') first, automatically falls back to
// HTTPS REST if WebSocket hangs or times out, and nudges the WebSocket to reconnect.
window.flReadRtdbPath = async function (path, timeoutMs) {
    var ms = timeoutMs || 6500;
    var wrapVal = function (val) {
        return {
            val: function () { return val; },
            exists: function () { return val !== null && val !== undefined; }
        };
    };

    try {
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
            try { db.goOnline(); } catch (e) {}
        }
        var sdkTimeout = window.__flFirebaseConnected ? ms : Math.min(ms, 4500);
        var snap = await new Promise(function (resolve, reject) {
            var done = false;
            var t = setTimeout(function () {
                if (done) return;
                done = true;
                var err = new Error('rtdb_timeout');
                err.__flTimeout = true;
                reject(err);
            }, sdkTimeout);
            db.ref(path).once('value').then(function (s) {
                if (done) return;
                done = true;
                clearTimeout(t);
                resolve(s);
            }, function (e) {
                if (done) return;
                done = true;
                clearTimeout(t);
                reject(e);
            });
        });
        return snap;
    } catch (sdkErr) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            throw sdkErr;
        }
        // WebSocket stalled or failed while online: kick WebSocket and read immediately via HTTPS REST.
        try { window.flKickFirebaseConnection(false); } catch (e) {}
        var restData = await window.flRtdbFetchJson(path, Math.max(ms, 8000));
        return wrapVal(restData);
    }
};
