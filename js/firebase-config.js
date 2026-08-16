// ==========================================
// 1. FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================
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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// Global App State
window.FlaynityApp = {
    user: null,
    isOnline: true,
    data: { videos: [], shorts: [], posts: [] }
};

// ==========================================
// 2. OFFLINE / ONLINE DETECTION
// ==========================================
const connectedRef = db.ref(".info/connected");
connectedRef.on("value", (snap) => {
    window.FlaynityApp.isOnline = snap.val() === true;
    if (window.FlaynityApp.isOnline) {
        console.log("Flaynity: Connected to Firebase Realtime DB");
        // Sync any cached actions here
    } else {
        console.warn("Flaynity: Running in Offline Mode");
    }
});

// ==========================================
// 3. AUTHENTICATION LOGIC (Bound to Home UI)
// ==========================================
auth.onAuthStateChanged((user) => {
    window.FlaynityApp.user = user;
    const splashScreen = document.getElementById('splash-screen');
    const authScreen = document.getElementById('auth-screen');
    
    if (splashScreen) splashScreen.style.opacity = '0';
    setTimeout(() => {
        if (splashScreen) splashScreen.style.display = 'none';
        
        if (user) {
            // User Logged In -> Show Home Feed
            if (authScreen) authScreen.style.display = 'none';
            loadHomeFeed();
            updateYouPageProfile(user);
        } else {
            // No User -> Show Login
            if (authScreen) authScreen.style.display = 'flex';
        }
    }, 500);
});

// Setup Auth UI Buttons (Called after HTML is loaded)
window.initAuthUI = function() {
    const authBtn = document.getElementById('auth-btn');
    if(authBtn) {
        authBtn.addEventListener('click', async () => {
            const email = document.getElementById('auth-email').value;
            const pass = document.getElementById('auth-pass').value;
            if(!email || !pass) return alert("Please fill all fields");
            
            try {
                authBtn.innerText = "Loading...";
                await auth.signInWithEmailAndPassword(email, pass);
            } catch(e) {
                // Try Register if user doesn't exist
                if(e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
                    try {
                        await auth.createUserWithEmailAndPassword(email, pass);
                    } catch(err) {
                        alert(err.message);
                    }
                } else {
                    alert(e.message);
                }
            } finally {
                authBtn.innerText = "Sign In / Register";
            }
        });
    }
};

// ==========================================
// 4. DATABASE FEED LOADERS
// ==========================================
function loadHomeFeed() {
    const feedContent = document.getElementById('feed-content');
    if(!feedContent) return;
    
    // Skeleton Shimmer Loading UI
    feedContent.innerHTML = `<div style="padding:16px;text-align:center;color:#666;">Loading personalized feed...</div>`;
    
    // Realtime listener for posts
    db.ref('feed/all').orderByChild('timestamp').limitToLast(20).on('value', (snapshot) => {
        feedContent.innerHTML = ''; 
        if(!snapshot.exists()) {
            feedContent.innerHTML = `<div style="padding:32px;text-align:center;">No posts yet!</div>`;
            return;
        }
        
        const data = [];
        snapshot.forEach(child => { data.push({ id: child.key, ...child.val() }); });
        data.reverse(); // Newest first
        
        data.forEach(item => {
            // Render logic based on item type (Video, Short, Post)
            // Example card for long video:
            const card = document.createElement('div');
            card.style.cssText = "margin-bottom: 16px; background: white;";
            card.innerHTML = `
                <div style="width:100%; aspect-ratio:16/9; background:#ddd;">
                    <img src="${item.thumbnailUrl || ''}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
                </div>
                <div style="padding:12px; display:flex; gap:12px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:#333;"></div>
                    <div>
                        <h3 style="font-size:15px;font-weight:600;margin-bottom:4px;">${item.title}</h3>
                        <p style="font-size:13px;color:#666;">@${item.authorHandle} • ${item.views || 0} views</p>
                    </div>
                </div>
            `;
            feedContent.appendChild(card);
        });
    });
}

function updateYouPageProfile(user) {
    const nameEl = document.getElementById('you-profile-name');
    const handleEl = document.getElementById('you-profile-handle');
    if(nameEl) nameEl.innerText = user.displayName || user.email.split('@')[0];
    if(handleEl) handleEl.innerText = "@" + user.email.split('@')[0];
}
