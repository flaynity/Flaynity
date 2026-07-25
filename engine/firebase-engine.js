/**
 * ============================================================
 * FLAYNITY FIREBASE ENGINE  v3.0
 * ============================================================
 * Responsibilities:
 *   - Initialize Firebase exactly ONCE (duplicate-init guard)
 *   - Expose `FlaynityDB` (Realtime Database ref) and `FlaynityAuth`
 *   - Auth Manager: single onAuthStateChanged listener, no duplicates
 *   - Listener Manager: centralized registry; every listener is
 *     removable; always detaches previous before attaching a new one;
 *     zero duplicate listeners ever
 *
 * NEVER call firebase.initializeApp() anywhere else in the codebase.
 * NEVER call auth.onAuthStateChanged() anywhere else.
 * ============================================================
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   1.  FIREBASE INIT GUARD
   ───────────────────────────────────────────────────────────── */
const _FIREBASE_CONFIG = {
    apiKey:            "AIzaSyBqXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // replaced at runtime from index.html
    authDomain:        "flaynity-app.firebaseapp.com",
    databaseURL:       "https://flaynity-app-default-rtdb.firebaseio.com",
    projectId:         "flaynity-app",
    storageBucket:     "flaynity-app.firebasestorage.app",
    messagingSenderId: "587469287255",
    appId:             "1:587469287255:web:6ec177b0c1c802efc95812",
    measurementId:     "G-HPMF5TPJB2"
};

(function _initFirebaseOnce() {
    // firebase.apps is the canonical guard provided by the compat SDK
    if (typeof firebase === 'undefined') {
        console.error('[FirebaseEngine] Firebase SDK not loaded before engine.');
        return;
    }
    if (firebase.apps && firebase.apps.length > 0) {
        console.log('[FirebaseEngine] Firebase already initialized – skipping duplicate init.');
        return;
    }
    try {
        // Merge runtime config injected by index.html (apiKey etc.) if present
        const runtimeCfg = (typeof FLAYNITY_FIREBASE_CONFIG !== 'undefined')
            ? FLAYNITY_FIREBASE_CONFIG
            : _FIREBASE_CONFIG;

        firebase.initializeApp(runtimeCfg);

        // Enable offline persistence (best-effort; silently ignore errors)
        firebase.database().enablePersistence({ synchronizeTabs: false }).catch(err => {
            console.warn('[FirebaseEngine] Persistence skipped:', err.code);
        });

        console.log('[FirebaseEngine] Firebase initialized successfully.');
    } catch (e) {
        console.error('[FirebaseEngine] Init error:', e);
    }
})();

/** Canonical database and auth references used everywhere in the app */
const FlaynityDB   = firebase.database();
const FlaynityAuth = firebase.auth();

/* ─────────────────────────────────────────────────────────────
   2.  LISTENER MANAGER
   ─────────────────────────────────────────────────────────────
   Central registry for every Firebase Realtime Database listener.
   Rules:
     • Each listener is stored under a unique string key.
     • Attaching a new listener for an existing key automatically
       detaches the previous one first.
     • ListenerManager.detachAll() removes every registered listener.
     • No listener is ever attached twice.
   ───────────────────────────────────────────────────────────── */
const ListenerManager = (() => {
    // Map<key, { ref: DatabaseReference, event: string, callback: Function }>
    const _registry = new Map();

    /**
     * Attach a Firebase listener.
     * @param {string}            key      Unique identifier for this listener slot
     * @param {DatabaseReference} ref      Firebase DB reference
     * @param {string}            event    'value' | 'child_added' | etc.
     * @param {Function}          callback Snapshot handler
     */
    function attach(key, ref, event, callback) {
        // Always detach any existing listener for this key first
        if (_registry.has(key)) {
            const old = _registry.get(key);
            try { old.ref.off(old.event, old.callback); } catch (_) {}
            _registry.delete(key);
        }
        ref.on(event, callback);
        _registry.set(key, { ref, event, callback });
    }

    /**
     * Detach a single listener by key.
     * @param {string} key
     */
    function detach(key) {
        if (!_registry.has(key)) return;
        const entry = _registry.get(key);
        try { entry.ref.off(entry.event, entry.callback); } catch (_) {}
        _registry.delete(key);
    }

    /**
     * Detach all listeners whose keys start with a given prefix.
     * Useful for cleaning up a whole subsystem (e.g. 'feed/', 'channel/').
     * @param {string} prefix
     */
    function detachByPrefix(prefix) {
        for (const key of _registry.keys()) {
            if (key.startsWith(prefix)) detach(key);
        }
    }

    /** Detach every registered listener. */
    function detachAll() {
        for (const key of [..._registry.keys()]) detach(key);
    }

    /** Return a snapshot of currently registered keys (for debugging). */
    function listKeys() {
        return [..._registry.keys()];
    }

    return { attach, detach, detachByPrefix, detachAll, listKeys };
})();

/* ─────────────────────────────────────────────────────────────
   3.  AUTH MANAGER
   ─────────────────────────────────────────────────────────────
   Single onAuthStateChanged listener.  All other modules register
   callbacks here instead of calling auth.onAuthStateChanged() directly.
   ───────────────────────────────────────────────────────────── */
const AuthManager = (() => {
    const _signInCallbacks  = new Set();
    const _signOutCallbacks = new Set();
    let   _authListenerAttached = false;
    let   _currentUser = null;

    function _attachAuthListener() {
        if (_authListenerAttached) return;
        _authListenerAttached = true;

        FlaynityAuth.onAuthStateChanged(user => {
            _currentUser = user;
            if (user) {
                _signInCallbacks.forEach(cb => { try { cb(user); } catch (e) { console.error('[AuthManager] signIn cb error:', e); } });
            } else {
                _signOutCallbacks.forEach(cb => { try { cb(); } catch (e) { console.error('[AuthManager] signOut cb error:', e); } });
            }
        });
    }

    /**
     * Register a callback to run when a user signs in.
     * If a user is already signed in the callback fires immediately.
     * @param {Function} cb  Receives the Firebase User object
     */
    function onSignIn(cb) {
        _signInCallbacks.add(cb);
        _attachAuthListener();
        // Fire immediately if already signed in
        if (_currentUser) { try { cb(_currentUser); } catch (e) {} }
    }

    /**
     * Register a callback to run when the user signs out.
     * @param {Function} cb
     */
    function onSignOut(cb) {
        _signOutCallbacks.add(cb);
        _attachAuthListener();
    }

    /** Remove a previously registered sign-in callback. */
    function offSignIn(cb)  { _signInCallbacks.delete(cb); }

    /** Remove a previously registered sign-out callback. */
    function offSignOut(cb) { _signOutCallbacks.delete(cb); }

    /** Returns the current Firebase User or null. */
    function currentUser() { return _currentUser; }

    // Kick off the single listener immediately
    _attachAuthListener();

    return { onSignIn, onSignOut, offSignIn, offSignOut, currentUser };
})();

/* ─────────────────────────────────────────────────────────────
   4.  FIREBASE .info/connected MONITOR
   ─────────────────────────────────────────────────────────────
   Exposes FlaynityFirebaseConnected (boolean) and lets other
   modules subscribe to connection-state changes.
   ───────────────────────────────────────────────────────────── */
const FirebaseConnectionMonitor = (() => {
    let _connected = false;
    const _callbacks = new Set();

    ListenerManager.attach(
        'sys/firebase-connected',
        FlaynityDB.ref('.info/connected'),
        'value',
        snap => {
            const wasConnected = _connected;
            _connected = !!snap.val();
            if (_connected !== wasConnected) {
                _callbacks.forEach(cb => { try { cb(_connected); } catch (_) {} });
            }
        }
    );

    function onChange(cb) { _callbacks.add(cb); }
    function offChange(cb) { _callbacks.delete(cb); }
    function isConnected() { return _connected; }

    return { onChange, offChange, isConnected };
})();

/* ─────────────────────────────────────────────────────────────
   5.  EXPORTS  (attached to window for cross-script access)
   ───────────────────────────────────────────────────────────── */
window.FlaynityDB                = FlaynityDB;
window.FlaynityAuth              = FlaynityAuth;
window.ListenerManager           = ListenerManager;
window.AuthManager               = AuthManager;
window.FirebaseConnectionMonitor = FirebaseConnectionMonitor;

console.log('[FirebaseEngine] Engine ready. Listeners:', ListenerManager.listKeys());
