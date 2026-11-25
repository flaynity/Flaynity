/* Flaynity Shared Firebase Configuration
 * Single shared Firebase initialization for the application and service pages.
 */
const firebaseConfig = {
    apiKey: "AIzaSyCGA5jzc3qb9QtXpkTW38DsrQUCXkPur9k",
  authDomain: "xflay-ai.firebaseapp.com",
  databaseURL: "https://xflay-ai-default-rtdb.firebaseio.com",
  projectId: "xflay-ai",
  storageBucket: "xflay-ai.firebasestorage.app",
  messagingSenderId: "745781159590",
  appId: "1:745781159590:web:d44cb876b45d0f58d37667",
  measurementId: "G-19SN58NC7H"
};
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    firebase.database().enablePersistence().catch(err => {
        console.warn("Offline persistence activation bypassed: ", err.code);
    });
} catch (e) {
    console.error("Firebase config crash prevented:", e);
}

const auth = firebase.auth();
const db = firebase.database();
