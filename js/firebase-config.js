/**
 * FLAYNITY — FIREBASE CONFIGURATION & SERVICE LAYER
 * Realtime Database listeners, Auth state persistence, Offline cache & Atomic transactions.
 */

(function() {
  'use strict';

  // 1. Firebase Project Credentials
  // Replace these placeholders with your actual Firebase Project Configuration
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

  // 2. Initialize Firebase App
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // 3. Expose Core Instances Globally
  window.FlaynityAuth = firebase.auth();
  window.FlaynityDB = firebase.database();

  // 4. Offline / Online Connection Detection via Realtime Database
  const connectedRef = window.FlaynityDB.ref('.info/connected');
  connectedRef.on('value', (snap) => {
    const isConnected = snap.val() === true;
    const banner = document.getElementById('fl-offline-banner');
    
    if (isConnected) {
      if (banner) banner.classList.add('hidden');
      console.log('[Flaynity] Connected to Firebase Realtime Database.');
    } else {
      if (banner) banner.classList.remove('hidden');
      console.warn('[Flaynity] Disconnected from Firebase. Working in offline mode.');
    }
  });

  // 5. Global Authentication State Observer
  window.FlaynityAuth.onAuthStateChanged((user) => {
    if (user) {
      console.log('[Flaynity] Active session:', user.displayName || user.email);
      // Ensure user record exists in Realtime DB
      window.FlaynityDB.ref(`users/${user.uid}`).update({
        displayName: user.displayName || 'Flaynity User',
        email: user.email,
        photoURL: user.photoURL || 'https://via.placeholder.com/72',
        lastActive: firebase.database.ServerValue.TIMESTAMP
      });

      // Update UI if on Profile/You page
      if (window.FlaynityYou && typeof window.FlaynityYou.init === 'function') {
        window.FlaynityYou.init();
      }
    } else {
      console.log('[Flaynity] Guest/Anonymous user state.');
    }
  });

  // 6. Flaynity Data Service Helper Methods
  window.FlaynityService = {
    /**
     * User Registration with Email & Password
     */
    async register(name, email, password) {
      try {
        const cred = await window.FlaynityAuth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({
          displayName: name,
          photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`
        });
        
        await window.FlaynityDB.ref(`users/${cred.user.uid}`).set({
          displayName: name,
          email: email,
          photoURL: cred.user.photoURL,
          subscribersCount: 0,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        });

        return cred.user;
      } catch (error) {
        console.error('[Flaynity] Registration error:', error);
        throw error;
      }
    },

    /**
     * User Login with Email & Password
     */
    async login(email, password) {
      try {
        const cred = await window.FlaynityAuth.signInWithEmailAndPassword(email, password);
        return cred.user;
      } catch (error) {
        console.error('[Flaynity] Login error:', error);
        throw error;
      }
    },

    /**
     * Sign Out
     */
    async logout() {
      return window.FlaynityAuth.signOut();
    },

    /**
     * Subscribe / Unsubscribe Channel with Atomic Transaction
     */
    async toggleSubscribe(targetChannelUid) {
      const currentUser = window.FlaynityAuth.currentUser;
      if (!currentUser) throw new Error("Authentication required");
      if (currentUser.uid === targetChannelUid) throw new Error("Cannot subscribe to yourself");

      const subRef = window.FlaynityDB.ref(`subscriptions/${currentUser.uid}/${targetChannelUid}`);
      const channelRef = window.FlaynityDB.ref(`users/${targetChannelUid}/subscribersCount`);

      const snap = await subRef.once('value');
      const isSubscribed = snap.exists();

      if (isSubscribed) {
        await subRef.remove();
        await channelRef.transaction(c => Math.max(0, (c || 1) - 1));
        return false;
      } else {
        await subRef.set(firebase.database.ServerValue.TIMESTAMP);
        await channelRef.transaction(c => (c || 0) + 1);
        return true;
      }
    },

    /**
     * Video / Short Unique View Increment
     */
    async recordUniqueView(type, contentId) {
      if (!contentId) return;
      const userKey = window.FlaynityAuth.currentUser 
        ? window.FlaynityAuth.currentUser.uid 
        : (localStorage.getItem('fl_anon_device_id') || Math.random().toString(36).substring(2));
      
      localStorage.setItem('fl_anon_device_id', userKey);

      const viewRecordRef = window.FlaynityDB.ref(`views_log/${contentId}/${userKey}`);
      const snap = await viewRecordRef.once('value');
      
      // If not viewed in the last 6 hours, increment count
      const now = Date.now();
      const lastViewed = snap.val();

      if (!lastViewed || (now - lastViewed > 6 * 60 * 60 * 1000)) {
        await viewRecordRef.set(now);
        await window.FlaynityDB.ref(`${type}/${contentId}/views`).transaction(v => (v || 0) + 1);
      }
    },

    /**
     * Video Like / Dislike Atomic Synchronization
     */
    async toggleVideoLike(videoId, isLikeAction) {
      const user = window.FlaynityAuth.currentUser;
      if (!user) throw new Error("Authentication required");

      const uid = user.uid;
      const likeRef = window.FlaynityDB.ref(`video_interactions/${videoId}/${uid}`);
      const videoStatsRef = window.FlaynityDB.ref(`videos/${videoId}`);

      const snap = await likeRef.once('value');
      const currentState = snap.val(); // 'like', 'dislike', or null

      let newState = null;
      let likeDelta = 0;

      if (isLikeAction) {
        if (currentState === 'like') {
          newState = null;
          likeDelta = -1;
        } else {
          newState = 'like';
          likeDelta = currentState === 'dislike' ? 1 : 1;
        }
      } else {
        if (currentState === 'dislike') {
          newState = null;
        } else {
          newState = 'dislike';
          if (currentState === 'like') likeDelta = -1;
        }
      }

      if (newState) {
        await likeRef.set(newState);
      } else {
        await likeRef.remove();
      }

      if (likeDelta !== 0) {
        await videoStatsRef.child('likes').transaction(l => Math.max(0, (l || 0) + likeDelta));
      }

      return newState;
    }
  };
})();
