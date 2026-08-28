/* Flaynity Shared Firebase Configuration
 * Single Firebase initialization for the User App and dynamically loaded Service Pages.
 */
(function () {
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
        firebase.database().enablePersistence().catch(function (err) {
            console.warn("Offline persistence activation bypassed: ", err.code);
        });
    } catch (e) {
        console.error("Firebase config crash prevented:", e);
    }

    window.auth = firebase.auth();
    window.db = firebase.database();
})();
