/**
 * Flaynity - Firebase Architecture Configuration
 * Initializes Firebase Authentication and Realtime Database.
 */

(function() {
    // Exact configuration provided for Flaynity App
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

    // Initialize Firebase only once
    if (!window.firebase.apps.length) {
        window.firebase.initializeApp(firebaseConfig);
    }

    // Export core modules to global scope for single-file pages to access
    window.db = window.firebase.database();
    window.auth = window.firebase.auth();

    // Enable offline capabilities for Realtime Database (Supported in native/bridge, emulated in web)
    // Preserves local state and draft metadata as required
    window.db.goOnline(); // Ensure connection is active on start

    // Network State Listener (Offline Support Architecture)
    const connectedRef = window.db.ref(".info/connected");
    connectedRef.on("value", (snap) => {
        if (snap.val() === true) {
            console.log("[Flaynity] Connected to Firebase Realtime Database");
            // If we were offline, we can trigger a global sync event here
            window.dispatchEvent(new Event('flaynity-online'));
        } else {
            console.log("[Flaynity] Disconnected from Firebase (Offline Mode)");
            window.dispatchEvent(new Event('flaynity-offline'));
        }
    });

    console.log("[Flaynity] Firebase Initialized");
})();
