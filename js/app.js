// ========================================== // 1. CONFIGURATION & STATE //
========================================== const CONFIG = { firebase: { apiKey:
"AIzaSyCiUTQp_QDSbBIOGJXKI7jJmzQHPu8L14I", authDomain:
"flaynity-app.firebaseapp.com", databaseURL:
"https://flaynity-app-default-rtdb.firebaseio.com", projectId: "flaynity-app",
storageBucket: "flaynity-app.firebasestorage.app", messagingSenderId:
"587469287255", appId: "1:587469287255:web:6ec177b0c1c802efc95812",
measurementId: "G-HPMF5TPJB2" }, r2: { bucket: "flaynity-storage", accessKey:
"c4d26ef58f7d0818695c8710af083fb6", secretKey:
"97bc62a7b0c961001611489e28f9dbd41d2b30cda3e8348bb32d12a7c1d319a8", endpoint:
"https://b3741135bd1f3e96b6744f11e6a06600.r2.cloudflarestorage.com", publicUrl:
"https://pub-92694602f8ec4e0fbbcbf4a91b194f69.r2.dev" } };

const State = { user: null, channel: null, currentTab: 'home', online:
navigator.onLine, cache: { videos: [], shorts: [], posts: [], channels: {},
subscriptions: {}, userReactions: {}, comments: {} }, activeListeners: {},
currentPlayingVideo: null, isBootstrapped: false };

// ========================================== // 2. HIGH-PRECISION UTILITIES &
THUMBNAIL ENGINE // ========================================== const Utils = {
el: (id) => document.getElementById(id),

show: (id) => {
    const target = Utils.el(id);
    if (target) target.classList.remove('flaynity-hidden');
},

hide: (id) => {
    const target = Utils.el(id);
    if (target) target.classList.add('flaynity-hidden');
},

timeAgo: (timestamp) => {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (seconds < 30) return 'Just now';
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        day: 86400,
        hour: 3600,
        minute: 60
    };

    for (const [unit, value] of Object.entries(intervals)) {
        const count = Math.floor(seconds / value);
        if (count >= 1) {
            return `${count} ${unit}${count > 1 ? 's' : ''} ago`;
        }
    }
    return `${seconds} seconds ago`;
},

formatViews: (num) => {
    if (!num || isNaN(num)) return '0';
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
},

formatDuration: (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
},

vibrate: (ms = 40) => {
    try {
        if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {
        console.warn("Haptic feedback unavailable");
    }
},

secureText: (str) => {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
},

generateVideoThumbnail: (fileOrUrl, filterCss = '') => {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
        video.muted = true;
        video.playsInline = true;

        video.onloadeddata = () => {
            video.currentTime = Math.min(1, (video.duration / 2) || 0);
        };

        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 360;
            const ctx = canvas.getContext('2d');
            if (filterCss) ctx.filter = filterCss;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob((blob) => {
                const duration = video.duration || 0;
                if (typeof fileOrUrl !== 'string') URL.revokeObjectURL(video.src);
                resolve({ blob, duration });
            }, 'image/jpeg', 0.85);
        };

        video.onerror = () => {
            if (typeof fileOrUrl !== 'string') URL.revokeObjectURL(video.src);
            resolve({ blob: null, duration: 0 });
        };
    });
}

};

const UI = { toast: (msg, duration = 3000) => { const existingToast =
document.querySelector('.flaynity-toast'); if (existingToast)
existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'flaynity-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: calc(var(--bottom-nav-height) + 24px + var(--safe-area-bottom));
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: #1e1e1e;
        color: #ffffff;
        padding: 12px 24px;
        border-radius: 28px;
        z-index: 99999;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        pointer-events: none;
        white-space: nowrap;
    `;
    toast.innerText = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

};

const onClick = (id, callback) => { const el = Utils.el(id); if (el) {
el.onclick = callback; } else { console.warn([SafeBinder] Element #${id} not
found.); } };

// ========================================== // 3. CLOUDFLARE R2 OBJECT STORAGE
ENGINE // ========================================== let auth, db, s3Client;

const Services = { init: () => { if (!window.firebase) { throw new
Error("Firebase Core SDK is not loaded."); } if (!firebase.apps.length) {
firebase.initializeApp(CONFIG.firebase); } auth = firebase.auth(); db =
firebase.database();

    if (typeof AWS !== 'undefined') {
        s3Client = new AWS.S3({
            accessKeyId: CONFIG.r2.accessKey,
            secretAccessKey: CONFIG.r2.secretKey,
            endpoint: new AWS.Endpoint(CONFIG.r2.endpoint),
            s3ForcePathStyle: true,
            signatureVersion: 'v4',
            region: 'auto'
        });
    }
},

uploadFile: (fileOrBlob, folderPath, customExt = null) => {
    return new Promise((resolve, reject) => {
        if (!s3Client) return reject(new Error("Cloudflare R2 Client is uninitialized."));

        let extension = customExt;
        if (!extension) {
            if (fileOrBlob.name) extension = fileOrBlob.name.split('.').pop();
            else if (fileOrBlob.type) extension = fileOrBlob.type.split('/')[1] || 'bin';
            else extension = 'bin';
        }

        const uniqueKey = `${folderPath}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

        const uploadParams = {
            Bucket: CONFIG.r2.bucket,
            Key: uniqueKey,
            Body: fileOrBlob,
            ContentType: fileOrBlob.type || 'application/octet-stream'
        };

        const uploadRequest = s3Client.upload(uploadParams);

        uploadRequest.on('httpUploadProgress', (event) => {
            if (event.total) {
                const percentage = (event.loaded / event.total) * 100;
                UploadManager.updateProgress(percentage, event.loaded, event.total);
            }
        });

        UploadManager.currentUploadTask = uploadRequest;

        uploadRequest.send((err, data) => {
            UploadManager.currentUploadTask = null;
            if (err) {
                if (err.code === 'RequestAbortedError') resolve('CANCELLED');
                else {
                    console.error("Cloudflare R2 Upload Error:", err);
                    reject(err);
                }
            } else {
                resolve(`${CONFIG.r2.publicUrl}/${uniqueKey}`);
            }
        });
    });
},

addListener: (key, path, callback) => {
    if (State.activeListeners[key]) return;
    const targetRef = db.ref(path);
    const listenerCallback = (snapshot) => callback(snapshot);
    targetRef.on('value', listenerCallback);
    State.activeListeners[key] = { ref: targetRef, cb: listenerCallback };
},

removeListener: (key) => {
    const entry = State.activeListeners[key];
    if (entry) {
        entry.ref.off('value', entry.cb);
        delete State.activeListeners[key];
    }
}

};

// ========================================== // 4. AUTHENTICATION & PROFILE
SYSTEM // ========================================== const AuthSystem = { init:
() => { auth.onAuthStateChanged(async (user) => { Utils.hide('flaynity-splash');

        if (user) {
            State.user = user;
            Utils.hide('flaynity-auth');
            Utils.show('flaynity-home-ui');
            await AuthSystem.syncUserProfile();
            App.startRealtimeListeners();
        } else {
            State.user = null;
            Utils.show('flaynity-auth');
            Utils.hide('flaynity-home-ui');
        }
    });

    onClick('btn-google-signin', async () => {
        if (window.AndroidBridge && typeof AndroidBridge.triggerGoogleSignIn === 'function') {
            AndroidBridge.triggerGoogleSignIn();
        } else {
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                await auth.signInWithRedirect(provider);
            } catch (error) {
                UI.toast("Google Login Failed: " + error.message);
            }
        }
    });
},

syncUserProfile: async () => {
    if (!State.user) return;
    
    const userRef = db.ref(`users/${State.user.uid}`);
    await userRef.update({
        uid: State.user.uid,
        displayName: State.user.displayName || 'Flaynity User',
        email: State.user.email || '',
        photoURL: State.user.photoURL || '',
        lastLogin: firebase.database.ServerValue.TIMESTAMP
    });

    const youNavTab = document.querySelector('.nav-item[data-tab="you"]');
    if (youNavTab && State.user.photoURL) {
        youNavTab.innerHTML = `
            <img src="${State.user.photoURL}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:1.5px solid currentColor;">
            <span class="label">You</span>
        `;
    }

    const channelQuery = db.ref('channels').orderByChild('uid').equalTo(State.user.uid);
    channelQuery.on('value', (snapshot) => {
        if (snapshot.exists()) {
            const records = snapshot.val();
            const channelId = Object.keys(records)[0];
            State.channel = { id: channelId, ...records[channelId] };
        } else {
            State.channel = null;
        }
        YouPage.updateProfileUI();
    });
},

signOut: async () => {
    try {
        await auth.signOut();
        window.location.reload();
    } catch (e) {
        UI.toast("Error signing out");
    }
}

};

// ========================================== // 5. HOME FEED ENGINE //
========================================== const HomeFeed = { init: () => {
onClick('btn-home-search', () => Router.switchTab('discover'));

    const chips = document.querySelectorAll('.category-chips-container .chip');
    chips.forEach((chip) => {
        chip.onclick = () => {
            chips.forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
            HomeFeed.filterCategory(chip.innerText.trim());
        };
    });
},

filterCategory: (type) => {
    const container = Utils.el('home-feed-container');
    if (!container) return;
    container.innerHTML = '';

    if (type === 'Shorts') {
        container.appendChild(HomeFeed.buildShortsGrid(State.cache.shorts));
    } else if (type === 'Posts') {
        State.cache.posts.forEach((post) => {
            container.appendChild(HomeFeed.buildPostCard(post));
        });
    } else {
        HomeFeed.render();
    }
},

render: () => {
    const container = Utils.el('home-feed-container');
    if (!container) return;
    container.innerHTML = '';

    const { videos, shorts, posts } = State.cache;

    if (videos.length === 0 && shorts.length === 0 && posts.length === 0) {
        container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center; color: var(--flaynity-text-secondary);">
                <span class="material-symbols-outlined" style="font-size: 56px; margin-bottom: 12px;">video_library</span>
                <h3 style="font-size: 18px; margin-bottom: 6px;">No Content Yet</h3>
                <p style="font-size: 13px;">Publish your first video, short or community post!</p>
            </div>
        `;
        return;
    }

    let videoIdx = 0, shortsIdx = 0, postIdx = 0, active = true;

    while (active) {
        let chunkAdded = false;

        if (shortsIdx < shorts.length) {
            const batch = shorts.slice(shortsIdx, shortsIdx + 6);
            shortsIdx += 6;
            container.appendChild(HomeFeed.buildShortsGrid(batch));
            chunkAdded = true;
        }

        if (videoIdx < videos.length) {
            const batch = videos.slice(videoIdx, videoIdx + 10);
            videoIdx += 10;
            batch.forEach((video) => {
                container.appendChild(HomeFeed.buildVideoCard(video));
            });
            chunkAdded = true;
        }

        if (postIdx < posts.length) {
            container.appendChild(HomeFeed.buildPostCard(posts[postIdx]));
            postIdx++;
            chunkAdded = true;
        }

        if (!chunkAdded) active = false;
    }
},

buildVideoCard: (data) => {
    const card = document.createElement('div');
    card.className = 'long-video-card';
    card.innerHTML = `
        <div class="lv-thumbnail-box" style="filter: ${data.filters || 'none'}">
            <img src="${data.thumbnailUrl || data.cdnVideoUrl}" loading="lazy" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
            <div class="lv-duration">${data.duration || '0:00'}</div>
        </div>
        <div class="lv-info-row">
            <img class="lv-avatar" src="${data.channelAvatar || 'https://via.placeholder.com/40'}" alt="">
            <div class="lv-text">
                <div class="lv-title">${Utils.secureText(data.title)}</div>
                <div class="lv-meta">${Utils.secureText(data.channelName)} • ${Utils.formatViews(data.views || 0)} views • ${Utils.timeAgo(data.createdAt)}</div>
            </div>
        </div>
    `;
    card.onclick = () => Player.open(data);
    return card;
},

buildShortsGrid: (shortsBatch) => {
    const section = document.createElement('div');
    section.className = 'shorts-grid-section';
    let html = `
        <div class="shorts-grid-header">
            <span class="material-symbols-outlined">app_shortcut</span> Shorts
        </div>
        <div class="s-grid">
    `;

    shortsBatch.forEach((item) => {
        html += `
            <div class="s-card" data-id="${item.id}">
                <img src="${item.thumbnailUrl || item.cdnVideoUrl}" loading="lazy" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0; filter: ${item.filters || 'none'};">
                <div class="s-card-title">${Utils.secureText(item.title)}</div>
            </div>
        `;
    });

    html += `</div>`;
    section.innerHTML = html;

    section.querySelectorAll('.s-card').forEach((card) => {
        card.onclick = () => {
            Router.switchTab('shorts');
            ShortsPlayer.scrollTo(card.dataset.id);
        };
    });

    return section;
},

buildPostCard: (data) => {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.id = `post-${data.id}`;

    const isLiked = State.cache.userReactions[data.id] !== undefined;

    card.innerHTML = `
        <div class="post-header">
            <img class="post-avatar" src="${data.channelAvatar || 'https://via.placeholder.com/40'}">
            <div>
                <div class="post-user">${Utils.secureText(data.channelName)}</div>
                <div class="post-time">${Utils.timeAgo(data.createdAt)}</div>
            </div>
            <div class="post-subscribe" data-channel="${data.channelId}">Subscribe</div>
        </div>
        <div class="post-text">${Utils.secureText(data.text || '')}</div>
        ${data.imageUrl ? `<div class="post-image-grid count-1"><img src="${data.imageUrl}" loading="lazy"></div>` : ''}
        <div class="post-stats">
            <div class="post-reactions-icons">
                <span class="reaction-preview">❤️ 👍 🥰</span> <span class="reaction-count">${Utils.formatViews(data.likes || 0)}</span>
            </div>
            <div>${Utils.formatViews(data.comments || 0)} comments</div>
        </div>
        <div class="post-actions">
            <div class="p-action-btn like-action-btn ${isLiked ? 'active' : ''}">
                <span class="material-symbols-outlined">${isLiked ? 'favorite' : 'thumb_up'}</span> Like
            </div>
            <div class="p-action-btn comment-action-btn">
                <span class="material-symbols-outlined">chat_bubble</span> Comment
            </div>
            <div class="p-action-btn share-action-btn">
                <span class="material-symbols-outlined">share</span> Share
            </div>
        </div>
    `;

    const likeBtn = card.querySelector('.like-action-btn');
    likeBtn.onclick = () => PostReactions.toggleLike(data.id);

    return card;
}

};

// ========================================== // 6. POST REACTION ENGINE //
========================================== const PostReactions = { toggleLike:
async (postId) => { if (!State.user) return UI.toast("Please log in to like.");
Utils.vibrate();

    const postRef = db.ref(`posts/${postId}/likes`);
    const userReactionRef = db.ref(`post_reactions/${postId}/${State.user.uid}`);

    const snapshot = await userReactionRef.once('value');
    if (snapshot.exists()) {
        await userReactionRef.remove();
        await postRef.transaction((current) => Math.max((current || 1) - 1, 0));
        delete State.cache.userReactions[postId];
    } else {
        await userReactionRef.set('like');
        await postRef.transaction((current) => (current || 0) + 1);
        State.cache.userReactions[postId] = 'like';
    }
}

};

// ========================================== // 7. CINEMA VIDEO PLAYER //
========================================== const Player = { currentVideoData:
null,

init: () => {
    onClick('btn-close-watch', Player.close);
    onClick('wp-subscribe-btn', Player.toggleSubscribe);
},

open: (videoData) => {
    Player.currentVideoData = videoData;
    const layer = Utils.el('flaynity-watch-page');
    const videoEl = Utils.el('main-video-player');

    if (!layer || !videoEl) return;

    Utils.el('wp-title').innerText = videoData.title;
    Utils.el('wp-stats').innerText = `${Utils.formatViews(videoData.views || 0)} views • ${Utils.timeAgo(videoData.createdAt)}`;
    Utils.el('wp-channel-handle').innerText = videoData.channelName;
    Utils.el('wp-like-count').innerText = Utils.formatViews(videoData.likes || 0);
    Utils.el('wp-channel-avatar').src = videoData.channelAvatar || 'https://via.placeholder.com/36';
    Utils.show('wp-channel-avatar');

    videoEl.style.filter = videoData.filters || 'none';
    videoEl.src = videoData.cdnVideoUrl;
    videoEl.play().catch(() => console.warn("Autoplay blocked by WebView"));

    layer.classList.add('active');
    State.currentPlayingVideo = videoEl;
    Router.addBackState('watch-page');

    if (videoData.id) {
        db.ref(`videos/${videoData.id}/views`).transaction((count) => (count || 0) + 1);
    }

    Player.loadRecommended(videoData.id);
},

close: () => {
    const layer = Utils.el('flaynity-watch-page');
    const videoEl = Utils.el('main-video-player');
    if (videoEl) {
        videoEl.pause();
        videoEl.src = '';
        videoEl.style.filter = 'none';
    }
    if (layer) layer.classList.remove('active');
    State.currentPlayingVideo = null;
    Player.currentVideoData = null;
},

toggleSubscribe: async () => {
    if (!State.user || !Player.currentVideoData) return UI.toast("Log in to subscribe.");
    Utils.vibrate();
    const targetChannelId = Player.currentVideoData.channelId;
    const subRef = db.ref(`subscriptions/${targetChannelId}/${State.user.uid}`);
    const channelSubsCountRef = db.ref(`channels/${targetChannelId}/subscribersCount`);

    const snapshot = await subRef.once('value');
    const btn = Utils.el('wp-subscribe-btn');

    if (snapshot.exists()) {
        await subRef.remove();
        await channelSubsCountRef.transaction((count) => Math.max((count || 1) - 1, 0));
        btn.innerText = "Subscribe";
        btn.style.background = "var(--flaynity-text)";
        btn.style.color = "var(--flaynity-bg)";
        UI.toast("Unsubscribed");
    } else {
        await subRef.set(true);
        await channelSubsCountRef.transaction((count) => (count || 0) + 1);
        btn.innerText = "Subscribed";
        btn.style.background = "var(--flaynity-skeleton)";
        btn.style.color = "var(--flaynity-text)";
        UI.toast("Subscribed!");
    }
},

loadRecommended: (excludeId) => {
    const recArea = Utils.el('wp-recommended-feed');
    if (!recArea) return;
    recArea.innerHTML = '';

    const list = State.cache.videos.filter((v) => v.id !== excludeId);
    list.slice(0, 8).forEach((item) => {
        recArea.appendChild(HomeFeed.buildVideoCard(item));
    });
}

};

// ========================================== // 8. SHORTS VERTICAL STREAM //
========================================== const ShortsPlayer = { observer:
null,

init: () => {
    const container = Utils.el('shorts-feed-container');
    if (!container) return;

    ShortsPlayer.observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const video = entry.target.querySelector('.short-video-element');
            const disc = entry.target.querySelector('.music-disc-wrapper');
            if (!video) return;

            if (entry.isIntersecting) {
                video.play().catch(() => {});
                State.currentPlayingVideo = video;
                if (disc) disc.classList.add('disc-spin');
            } else {
                video.pause();
                video.currentTime = 0;
                if (disc) disc.classList.remove('disc-spin');
            }
        });
    }, { threshold: 0.65 });
},

render: () => {
    const container = Utils.el('shorts-feed-container');
    if (!container) return;
    container.innerHTML = '';

    const shorts = State.cache.shorts;

    if (shorts.length === 0) {
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#fff;text-align:center;padding:24px;">
                <span class="material-symbols-outlined" style="font-size:64px;margin-bottom:12px;">app_shortcut</span>
                <h3>No Shorts Available</h3>
                <p style="color:#aaa;font-size:13px;">Create and share your first 60-second video!</p>
            </div>
        `;
        return;
    }

    shorts.forEach((s) => {
        const card = document.createElement('div');
        card.className = 'short-view-container';
        card.id = `short-view-${s.id}`;
        card.innerHTML = `
            <video class="short-video-element" src="${s.cdnVideoUrl}" loop playsinline preload="auto" style="filter: ${s.filters || 'none'}"></video>
            <div class="short-ui-overlay">
                <div class="short-actions-sidebar">
                    <div class="s-action-btn like-btn">
                        <span class="material-symbols-outlined">favorite</span>
                        <span class="count">${Utils.formatViews(s.likes || 0)}</span>
                    </div>
                    <div class="s-action-btn comment-btn">
                        <span class="material-symbols-outlined">chat</span>
                        <span class="count">${Utils.formatViews(s.comments || 0)}</span>
                    </div>
                    <div class="s-action-btn share-btn">
                        <span class="material-symbols-outlined">share</span>
                        <span class="count">Share</span>
                    </div>
                    <div class="music-disc-wrapper disc-spin">
                        <span class="material-symbols-outlined">music_note</span>
                    </div>
                </div>
                <div class="short-bottom-details">
                    <div class="short-channel-row">
                        <img src="${s.channelAvatar || 'https://via.placeholder.com/36'}">
                        <span class="short-handle">${Utils.secureText(s.channelName)}</span>
                        <button class="short-sub-btn">Subscribe</button>
                    </div>
                    <div class="short-title-text">${Utils.secureText(s.title)}</div>
                </div>
                <div class="short-center-play-indicator">
                    <span class="material-symbols-outlined">play_arrow</span>
                </div>
            </div>
        `;

        let lastTap = 0;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.short-actions-sidebar') || e.target.closest('.short-sub-btn')) return;

            const now = new Date().getTime();
            const delta = now - lastTap;

            if (delta < 300 && delta > 0) {
                Utils.vibrate(60);
                const heartIcon = card.querySelector('.like-btn .material-symbols-outlined');
                heartIcon.style.color = 'var(--flaynity-accent)';
                heartIcon.style.transform = 'scale(1.4)';
                setTimeout(() => heartIcon.style.transform = 'scale(1)', 250);

                db.ref(`shorts/${s.id}/likes`).transaction((count) => (count || 0) + 1);
            } else {
                const video = card.querySelector('video');
                const indicator = card.querySelector('.short-center-play-indicator');
                const disc = card.querySelector('.music-disc-wrapper');

                if (video.paused) {
                    video.play();
                    indicator.querySelector('span').innerText = 'play_arrow';
                    if (disc) disc.classList.add('disc-spin');
                } else {
                    video.pause();
                    indicator.querySelector('span').innerText = 'pause';
                    if (disc) disc.classList.remove('disc-spin');
                }
                indicator.classList.add('indicator-flash');
                setTimeout(() => indicator.classList.remove('indicator-flash'), 400);
            }
            lastTap = now;
        });

        container.appendChild(card);
        ShortsPlayer.observer.observe(card);
    });
},

scrollTo: (shortId) => {
    const target = Utils.el(`short-view-${shortId}`);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
}

};

// ========================================== // 9. PREMIUM UPLOAD STUDIO
(REBUILT) // ========================================== const UploadManager = {
currentUploadTask: null, isPaused: false,

updateProgress: (pct, loaded, total) => {
    const ring = Utils.el('up-prog-ring');
    const pctText = Utils.el('up-prog-pct');
    const detail = Utils.el('up-prog-detail');
    if (ring) {
        const offset = 339.292 - (339.292 * (pct / 100));
        ring.style.strokeDashoffset = offset;
    }
    if (pctText) pctText.innerText = `${Math.round(pct)}%`;
    if (detail && total) {
        const mbLoaded = (loaded / 1048576).toFixed(1);
        const mbTotal = (total / 1048576).toFixed(1);
        detail.innerText = `${mbLoaded} MB of ${mbTotal} MB uploaded`;
    }
},

showManager: () => {
    const el = Utils.el('up-manager');
    if (el) el.classList.add('active');
},

hideManager: () => {
    const el = Utils.el('up-manager');
    if (el) el.classList.remove('active');
    setTimeout(() => UploadManager.updateProgress(0, 0, 0), 400);
},

pause: () => {
    if (UploadManager.currentUploadTask) {
        UploadManager.currentUploadTask.abort();
        UploadManager.isPaused = true;
        Utils.el('up-prog-status').innerText = "Upload Paused";
        Utils.el('btn-manager-pause').innerHTML = '<span class="material-symbols-outlined">play_arrow</span> Resume';
    }
},

cancel: () => {
    if (UploadManager.currentUploadTask) {
        UploadManager.currentUploadTask.abort();
        UploadManager.hideManager();
        UI.toast("Upload Cancelled");
    }
}

};

const UploadPage = { activeType: 'short', // default activeFile: null,
activeBlob: null, activeThumbBlob: null, durationMs: 0, mediaRecorder: null,
recordedChunks: [], cameraStream: null, currentFilter: 'none',

filters: [
    { name: 'Normal', css: 'none' },
    { name: 'Vivid', css: 'contrast(1.2) saturate(1.5)' },
    { name: 'Mono', css: 'grayscale(100%) contrast(1.1)' },
    { name: 'Warm', css: 'sepia(30%) saturate(1.2)' },
    { name: 'Cool', css: 'hue-rotate(180deg) saturate(1.2)' }
],

init: () => {
    // Bottom Sheet Bindings
    onClick('btn-up-close', UploadPage.closeSheet);
    onClick('up-backdrop', (e) => { if(e.target.id === 'up-backdrop') UploadPage.closeSheet(); });

    const carousel = Utils.el('up-carousel');
    const options = document.querySelectorAll('.up-option');
    if (carousel && options) {
        carousel.addEventListener('scroll', () => {
            const center = carousel.scrollLeft + (carousel.clientWidth / 2);
            let closest = null, minDiff = Infinity;
            options.forEach(opt => {
                const diff = Math.abs(opt.offsetLeft + (opt.offsetWidth / 2) - center);
                if (diff < minDiff) { minDiff = diff; closest = opt; }
            });
            options.forEach(o => o.classList.remove('selected'));
            if (closest) {
                closest.classList.add('selected');
                UploadPage.activeType = closest.dataset.type;
            }
        });
        options.forEach(opt => {
            opt.onclick = () => {
                carousel.scrollTo({ left: opt.offsetLeft - (carousel.clientWidth/2) + (opt.offsetWidth/2), behavior: 'smooth' });
            };
        });
    }

    onClick('btn-up-continue', () => {
        UploadPage.closeSheet();
        UploadPage.openFlow(UploadPage.activeType);
    });

    // Layer Back Bindings
    onClick('btn-edit-back', UploadPage.closeAll);
    onClick('btn-cam-close', () => { UploadPage.stopCamera(); UploadPage.closeAll(); });
    onClick('btn-details-back', () => { Utils.el('up-layer-details').classList.remove('active'); });
    onClick('btn-post-back', UploadPage.closeAll);

    // Native Picker Triggers
    onClick('btn-pick-post-image', () => Utils.el('up-native-post-picker').click());
    onClick('btn-pick-custom-thumb', () => Utils.el('up-native-thumb-picker').click());

    // Setup File Handlers
    Utils.el('up-native-video-picker').onchange = (e) => UploadPage.handleVideoSelect(e.target.files[0]);
    Utils.el('up-native-post-picker').onchange = (e) => UploadPage.handlePostImageSelect(e.target.files[0]);
    Utils.el('up-native-thumb-picker').onchange = (e) => UploadPage.handleCustomThumb(e.target.files[0]);

    // Editor Bindings
    onClick('up-preview-clicker', () => {
        const vid = Utils.el('up-main-video');
        const icon = Utils.el('up-play-anim');
        if(vid.paused) { vid.play(); icon.innerText = 'play_arrow'; }
        else { vid.pause(); icon.innerText = 'pause'; }
        icon.classList.add('flash');
        setTimeout(() => icon.classList.remove('flash'), 300);
    });

    onClick('btn-tool-filter', () => Utils.el('up-panel-filter').classList.add('active'));
    onClick('btn-close-filter', () => Utils.el('up-panel-filter').classList.remove('active'));
    onClick('btn-tool-speed', () => Utils.el('up-panel-speed').classList.add('active'));
    onClick('btn-close-speed', () => Utils.el('up-panel-speed').classList.remove('active'));

    UploadPage.renderFilters();
    
    document.querySelectorAll('.speed-opt').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.speed-opt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            Utils.el('up-main-video').playbackRate = parseFloat(btn.dataset.val);
        };
    });

    // Camera Bindings
    const recBtn = Utils.el('btn-cam-record');
    if (recBtn) {
        recBtn.onmousedown = recBtn.ontouchstart = (e) => { e.preventDefault(); UploadPage.startRecording(); };
        recBtn.onmouseup = recBtn.ontouchend = (e) => { e.preventDefault(); UploadPage.stopRecording(); };
    }
    onClick('btn-cam-next', () => {
        UploadPage.stopCamera();
        Utils.el('up-layer-camera').classList.remove('active');
        Utils.el('up-layer-edit').classList.add('active');
    });

    onClick('btn-edit-next', () => {
        Utils.el('up-details-title').innerText = UploadPage.activeType === 'short' ? 'Add details (Short)' : 'Add details (Video)';
        Utils.el('up-cat-container').style.display = UploadPage.activeType === 'short' ? 'none' : 'flex';
        Utils.el('up-layer-details').classList.add('active');
    });

    // Details bindings
    const titleInput = Utils.el('up-input-title');
    titleInput.oninput = () => { Utils.el('up-title-count').innerText = titleInput.value.length; };
    Utils.el('up-input-vis').onchange = (e) => { Utils.el('up-vis-label').innerText = e.target.options[e.target.selectedIndex].text; };
    Utils.el('up-input-cat').onchange = (e) => { Utils.el('up-cat-label').innerText = e.target.options[e.target.selectedIndex].text; };

    // Publish Actions
    onClick('btn-publish-final', UploadPage.publishVideoOrShort);
    onClick('btn-publish-post', UploadPage.publishPost);

    // Manager Actions
    onClick('btn-manager-pause', () => {
        if (UploadManager.isPaused) {
            // To properly resume AWS SDK, we need the exact multipart context, but for simplicity in UI wrapper:
            UI.toast("Resuming not fully supported in pure JS AWS without state recreation. Restarting chunk...");
        } else {
            UploadManager.pause();
        }
    });
    onClick('btn-manager-cancel', UploadManager.cancel);
    onClick('btn-manager-minimize', UploadManager.hideManager);
},

openSheet: () => {
    const root = Utils.el('upload-root');
    root.style.pointerEvents = 'auto';
    
    const bd = Utils.el('up-backdrop');
    const sheet = Utils.el('up-sheet');
    bd.classList.add('active');
    sheet.classList.add('active');
    Router.addBackState('upload-sheet');
},

closeSheet: () => {
    Utils.el('up-backdrop').classList.remove('active');
    Utils.el('up-sheet').classList.remove('active');
    setTimeout(() => {
        if (!document.querySelector('.up-flow-layer.active')) {
            Utils.el('upload-root').style.pointerEvents = 'none';
        }
    }, 400);
},

closeAll: () => {
    UploadPage.stopCamera();
    document.querySelectorAll('.up-flow-layer').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.up-sub-panel').forEach(p => p.classList.remove('active'));
    Utils.el('up-main-video').pause();
    Utils.el('up-main-video').src = '';
    UploadPage.activeFile = null;
    UploadPage.activeBlob = null;
    UploadPage.activeThumbBlob = null;
    Utils.el('upload-root').style.pointerEvents = 'none';
    
    // reset forms
    Utils.el('up-input-title').value = '';
    Utils.el('up-input-desc').value = '';
    Utils.el('up-post-text').value = '';
    Utils.el('up-final-thumb').src = '';
},

openFlow: (type) => {
    if (type === 'video') {
        Utils.el('up-native-video-picker').click();
    } else if (type === 'short') {
        Utils.el('up-layer-camera').classList.add('active');
        UploadPage.startCamera();
    } else if (type === 'post') {
        Utils.el('up-layer-post').classList.add('active');
    }
    Router.addBackState('upload-flow');
},

handleVideoSelect: (file) => {
    if (!file) return;
    UploadPage.activeFile = file;
    UploadPage.activeType = 'video';
    
    const vid = Utils.el('up-main-video');
    vid.src = URL.createObjectURL(file);
    
    vid.onloadedmetadata = async () => {
        UploadPage.durationMs = vid.duration;
        Utils.el('up-trim-end-time').innerText = Utils.formatDuration(vid.duration);
        // Gen thumb
        const tRes = await Utils.generateVideoThumbnail(file, UploadPage.currentFilter);
        if (tRes && tRes.blob) {
            UploadPage.activeThumbBlob = tRes.blob;
            Utils.el('up-final-thumb').src = URL.createObjectURL(tRes.blob);
        }
    };

    Utils.el('up-layer-edit').classList.add('active');
},

handlePostImageSelect: (file) => {
    if (!file) return;
    UploadPage.activeFile = file;
    const img = Utils.el('up-post-preview');
    img.src = URL.createObjectURL(file);
    Utils.show('up-post-preview');
},

handleCustomThumb: (file) => {
    if (!file) return;
    UploadPage.activeThumbBlob = file;
    Utils.el('up-final-thumb').src = URL.createObjectURL(file);
},

renderFilters: () => {
    const list = Utils.el('up-filter-list');
    list.innerHTML = '';
    UploadPage.filters.forEach((f, i) => {
        const card = document.createElement('div');
        card.className = 'up-filter-card' + (i===0 ? ' active' : '');
        card.innerHTML = `<div class="up-filter-preview" style="filter: ${f.css}"></div><span style="font-size:11px;font-weight:600;">${f.name}</span>`;
        card.onclick = () => {
            document.querySelectorAll('.up-filter-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            UploadPage.currentFilter = f.css;
            Utils.el('up-main-video').style.filter = f.css;
        };
        list.appendChild(card);
    });
},

startCamera: async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
        UploadPage.cameraStream = stream;
        Utils.el('up-live-cam').srcObject = stream;
    } catch (e) {
        UI.toast("Camera permission denied.");
    }
},

stopCamera: () => {
    if (UploadPage.cameraStream) {
        UploadPage.cameraStream.getTracks().forEach(t => t.stop());
        UploadPage.cameraStream = null;
    }
},

startRecording: () => {
    if (!UploadPage.cameraStream) return;
    UploadPage.recordedChunks = [];
    UploadPage.mediaRecorder = new MediaRecorder(UploadPage.cameraStream, { mimeType: 'video/webm' });
    
    UploadPage.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) UploadPage.recordedChunks.push(e.data);
    };
    
    UploadPage.mediaRecorder.onstop = () => {
        const blob = new Blob(UploadPage.recordedChunks, { type: 'video/webm' });
        UploadPage.activeBlob = blob;
        UploadPage.activeFile = blob; // Treating as file
        
        const vidUrl = URL.createObjectURL(blob);
        Utils.el('up-main-video').src = vidUrl;
        
        Utils.el('btn-cam-next').classList.add('show');
        
        // Gen thumb
        Utils.generateVideoThumbnail(vidUrl, UploadPage.currentFilter).then(res => {
            if (res && res.blob) {
                UploadPage.activeThumbBlob = res.blob;
                Utils.el('up-final-thumb').src = URL.createObjectURL(res.blob);
                UploadPage.durationMs = res.duration;
            }
        });
    };
    
    Utils.el('up-cam-record-wrap').classList.add('recording');
    Utils.el('btn-cam-record').classList.add('recording');
    UploadPage.mediaRecorder.start();
    Utils.vibrate();
},

stopRecording: () => {
    if (UploadPage.mediaRecorder && UploadPage.mediaRecorder.state !== 'inactive') {
        UploadPage.mediaRecorder.stop();
        Utils.el('up-cam-record-wrap').classList.remove('recording');
        Utils.el('btn-cam-record').classList.remove('recording');
        Utils.vibrate();
    }
},

publishVideoOrShort: async () => {
    if (!State.channel) {
        UI.toast("Create a channel first.");
        UploadPage.closeAll();
        Router.switchTab('you');
        return;
    }

    const title = Utils.el('up-input-title').value.trim();
    if (!title || (!UploadPage.activeFile && !UploadPage.activeBlob)) return UI.toast("Title and media are required.");

    try {
        UploadPage.closeAll();
        UploadManager.showManager();
        Utils.el('up-prog-status').innerText = `Uploading ${UploadPage.activeType}...`;

        const folder = `${UploadPage.activeType}s/${State.user.uid}`;
        const mediaToUpload = UploadPage.activeFile || UploadPage.activeBlob;
        
        const cdnVideoUrl = await Services.uploadFile(mediaToUpload, folder);
        if (cdnVideoUrl === 'CANCELLED') return;

        let thumbnailUrl = cdnVideoUrl;
        if (UploadPage.activeThumbBlob) {
            thumbnailUrl = await Services.uploadFile(UploadPage.activeThumbBlob, `thumbnails/${State.user.uid}`, 'jpg');
        }

        const metadata = {
            uid: State.user.uid,
            channelId: State.channel.id,
            channelName: State.channel.channelName,
            channelAvatar: State.channel.avatarUrl || '',
            cdnVideoUrl: cdnVideoUrl,
            thumbnailUrl: thumbnailUrl,
            title: title,
            description: Utils.el('up-input-desc').value.trim(),
            category: Utils.el('up-input-cat').value,
            visibility: Utils.el('up-input-vis').value,
            duration: Utils.formatDuration(UploadPage.durationMs),
            filters: UploadPage.currentFilter,
            views: 0, likes: 0, comments: 0,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        await db.ref(`${UploadPage.activeType}s`).push().set(metadata);

        UploadManager.updateProgress(100, 1, 1);
        Utils.el('up-prog-status').innerText = "Upload Complete!";
        setTimeout(() => { UploadManager.hideManager(); UI.toast("Published successfully!"); }, 1000);

        Router.switchTab(UploadPage.activeType === 'short' ? 'shorts' : 'home');
    } catch (e) {
        UploadManager.hideManager();
        UI.toast("Upload failed: " + e.message);
    }
},

publishPost: async () => {
    if (!State.channel) return UI.toast("Create a channel first.");
    
    const textVal = Utils.el('up-post-text').value.trim();
    if (!textVal && !UploadPage.activeFile) return UI.toast("Post content required.");

    try {
        UploadPage.closeAll();
        UploadManager.showManager();
        Utils.el('up-prog-status').innerText = "Uploading Post...";

        let imageUrl = '';
        if (UploadPage.activeFile) {
            imageUrl = await Services.uploadFile(UploadPage.activeFile, `posts/${State.user.uid}`);
        }

        await db.ref('posts').push().set({
            uid: State.user.uid,
            channelId: State.channel.id,
            channelName: State.channel.channelName,
            channelAvatar: State.channel.avatarUrl || '',
            imageUrl: imageUrl,
            text: textVal,
            likes: 0, comments: 0,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });

        UploadManager.updateProgress(100, 1, 1);
        Utils.el('up-prog-status').innerText = "Post Created!";
        setTimeout(() => { UploadManager.hideManager(); UI.toast("Posted successfully!"); }, 1000);

        Router.switchTab('home');
    } catch (e) {
        UploadManager.hideManager();
        UI.toast("Failed: " + e.message);
    }
}

};

// ========================================== // 10. DISCOVER & SEARCH ENGINE //
========================================== const DiscoverPage = { init: () => {
const chips = document.querySelectorAll('.discover-categories-scroll .d-chip');
chips.forEach((c) => { c.onclick = () => { chips.forEach((x) =>
x.classList.remove('active')); c.classList.add('active'); }; }); } };

// ========================================== // 11. YOU / CHANNEL STUDIO &
ANALYTICS // ========================================== const YouPage = { init:
() => { onClick('btn-sign-out', AuthSystem.signOut);
onClick('btn-create-channel', () => { const layer =
Utils.el('layer-create-channel'); if (layer) { layer.classList.add('active');
Router.addBackState('layer'); } });

    onClick('btn-view-channel', () => {
        YouPage.openViewChannel(); Router.addBackState('layer');
    });

    onClick('btn-open-edit-channel', () => {
        YouPage.openEditChannel(); Router.addBackState('layer');
    });

    onClick('btn-open-analytics', () => {
        YouPage.loadAnalytics();
        const layer = Utils.el('layer-analytics');
        if (layer) { layer.classList.add('active'); Router.addBackState('layer'); }
    });

    document.querySelectorAll('.btn-back-layer').forEach((btn) => {
        btn.onclick = (e) => e.target.closest('.you-sub-layer').classList.remove('active');
    });

    document.querySelectorAll('.vc-tab').forEach((tab) => {
        tab.onclick = (e) => {
            document.querySelectorAll('.vc-tab').forEach((t) => t.classList.remove('active'));
            e.target.classList.add('active');
            YouPage.renderChannelContent(e.target.dataset.tab);
        };
    });

    onClick('picker-create-avatar', () => {
        const input = Utils.el('input-create-avatar');
        if (input) input.click();
    });

    let avatarFile = null;
    const avatarInput = Utils.el('input-create-avatar');
    if (avatarInput) {
        avatarInput.onchange = (e) => {
            avatarFile = e.target.files[0];
            if (avatarFile) Utils.el('preview-create-avatar').src = URL.createObjectURL(avatarFile);
        };
    }

    onClick('btn-submit-create-channel', async () => {
        const name = Utils.el('input-create-name').value.trim();
        const handle = Utils.el('input-create-handle').value.trim().toLowerCase();

        if (!name || !handle) return UI.toast("Name and handle are required.");

        try {
            UI.toast("Creating channel...");
            let avatarUrl = State.user.photoURL || '';

            if (avatarFile) {
                avatarUrl = await Services.uploadFile(avatarFile, `avatars/${State.user.uid}`);
            }

            await db.ref('channels').push().set({
                uid: State.user.uid,
                channelName: name,
                handle: `@${handle.replace('@', '')}`,
                avatarUrl: avatarUrl,
                category: Utils.el('input-create-category').value,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                subscribersCount: 0, totalViews: 0
            });

            UI.toast("Channel created successfully!");
            Utils.el('layer-create-channel').classList.remove('active');
        } catch (e) {
            UI.toast("Failed to create channel: " + e.message);
        }
    });
},

updateProfileUI: () => {
    const avatar = Utils.el('you-google-avatar');
    const name = Utils.el('you-google-name');
    const email = Utils.el('you-google-email');

    if (avatar) avatar.src = State.user.photoURL || 'https://via.placeholder.com/80';
    if (name) name.innerText = State.user.displayName || 'Flaynity User';
    if (email) email.innerText = State.user.email || '';

    if (State.channel) {
        Utils.hide('btn-create-channel'); Utils.show('btn-view-channel');
    } else {
        Utils.show('btn-create-channel'); Utils.hide('btn-view-channel');
    }
},

openViewChannel: () => {
    if (!State.channel) return;
    const layer = Utils.el('layer-view-channel');
    if (layer) layer.classList.add('active');

    const ch = State.channel;
    Utils.el('vc-avatar-img').src = ch.avatarUrl || State.user.photoURL;
    if (ch.bannerUrl) { Utils.el('vc-banner-img').src = ch.bannerUrl; Utils.show('vc-banner-img'); }
    Utils.el('vc-name-text').innerText = ch.channelName;
    Utils.el('vc-handle-text').innerText = ch.handle;
    Utils.el('vc-subs-text').innerText = Utils.formatViews(ch.subscribersCount || 0);

    YouPage.renderChannelContent('videos');
},

renderChannelContent: (tabName) => {
    const area = Utils.el('vc-content-area');
    if (!area) return;
    area.innerHTML = '';

    let items = [];
    if (tabName === 'videos') items = State.cache.videos.filter((v) => v.uid === State.user.uid);
    else if (tabName === 'shorts') items = State.cache.shorts.filter((s) => s.uid === State.user.uid);
    else if (tabName === 'posts') items = State.cache.posts.filter((p) => p.uid === State.user.uid);

    if (items.length === 0) {
        area.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--flaynity-text-secondary);">No ${tabName} published yet.</div>`;
        return;
    }

    items.forEach((item) => {
        if (tabName === 'videos') area.appendChild(HomeFeed.buildVideoCard(item));
        else if (tabName === 'posts') area.appendChild(HomeFeed.buildPostCard(item));
        else {
            const div = document.createElement('div');
            div.style.padding = '12px 0'; div.style.borderBottom = '1px solid var(--flaynity-divider)';
            div.innerText = item.title || 'Untitled Short';
            area.appendChild(div);
        }
    });
},

loadAnalytics: () => {
    const userVideos = State.cache.videos.filter((v) => v.uid === State.user.uid);
    const totalViews = userVideos.reduce((acc, curr) => acc + (curr.views || 0), 0);
    const totalLikes = userVideos.reduce((acc, curr) => acc + (curr.likes || 0), 0);

    if (Utils.el('stat-views')) Utils.el('stat-views').innerText = Utils.formatViews(totalViews);
    if (Utils.el('stat-likes')) Utils.el('stat-likes').innerText = Utils.formatViews(totalLikes);
    if (Utils.el('stat-subs')) Utils.el('stat-subs').innerText = Utils.formatViews(State.channel ? State.channel.subscribersCount : 0);
},

openEditChannel: () => {
    const ch = State.channel;
    if (!ch) return;
    const layer = Utils.el('layer-edit-channel');
    if (layer) layer.classList.add('active');

    Utils.el('input-edit-name').value = ch.channelName || '';
    Utils.el('input-edit-handle').value = ch.handle || '';
    Utils.el('input-edit-desc').value = ch.description || '';
}

};

// ========================================== // 12. ROUTER & GLOBAL PERSISTENT
NAVIGATION // ========================================== const Router = { pages:
['home', 'shorts', 'upload', 'discover', 'you'], history: ['home'],

fetchPages: async () => {
    const appRoot = document.getElementById('app');
    for (const page of Router.pages) {
        const response = await fetch(`pages/${page}.html`);
        if (!response.ok) throw new Error(`Failed to load component: pages/${page}.html (Status: ${response.status})`);
        const html = await response.text();

        if (html.includes('<title>Flaynity</title>')) throw new Error(`Server returned index.html for pages/${page}.html.`);

        const container = document.createElement('div');
        container.id = `page-container-${page}`;
        container.style.cssText = `width:100%;height:100%;position:absolute;top:0;left:0;display:${page === 'home' ? 'block' : 'none'};`;
        container.innerHTML = html;
        appRoot.appendChild(container);
    }

    const bottomNav = Utils.el('flaynity-bottom-nav');
    if (bottomNav) {
        appRoot.appendChild(bottomNav);
        bottomNav.style.zIndex = '1000';
        bottomNav.style.display = 'flex';
    }
},

bindGlobalNavigation: () => {
    document.querySelectorAll('.nav-item').forEach((el) => {
        el.addEventListener('click', (e) => {
            const targetNav = e.currentTarget;
            const tab = targetNav.dataset.tab;
            if (tab === 'upload') {
                UploadPage.openSheet();
            } else {
                Router.switchTab(tab);
            }
        });
    });
},

switchTab: (tabName) => {
    if (tabName === 'upload') return;

    if (State.currentPlayingVideo && tabName !== 'shorts') {
        State.currentPlayingVideo.pause();
    }

    Router.pages.forEach((p) => {
        if (p !== 'upload') {
            const el = document.getElementById(`page-container-${p}`);
            if (el) el.style.display = 'none';
        }
    });

    const target = document.getElementById(`page-container-${tabName}`);
    if (target) target.style.display = 'block';

    const bottomNav = Utils.el('flaynity-bottom-nav');
    if (bottomNav) bottomNav.style.display = 'flex';

    document.querySelectorAll('.nav-item').forEach((el) => {
        if (el.dataset.tab !== 'upload') {
            el.classList.toggle('active', el.dataset.tab === tabName);
        }
    });

    State.currentTab = tabName;

    if (Router.history[Router.history.length - 1] !== tabName) {
        Router.history.push(tabName);
        Router.updateAndroidBackStack();
    }

    if (tabName === 'shorts') {
        ShortsPlayer.render();
    } else if (tabName === 'home') {
        HomeFeed.render();
    }
},

updateAndroidBackStack: () => {
    if (window.AndroidBridge && typeof AndroidBridge.setBackStackStatus === 'function') {
        AndroidBridge.setBackStackStatus(Router.history.length > 1);
    }
},

addBackState: (stateId) => {
    Router.history.push(stateId);
    Router.updateAndroidBackStack();
}

};

window.app = { executeBackAction: () => { const watchPage =
Utils.el('flaynity-watch-page'); const uploadSheet = Utils.el('up-sheet'); const
activeUploadLayer = document.querySelector('.up-flow-layer.active');

    if (watchPage && watchPage.classList.contains('active')) {
        Player.close();
        Router.history.pop();
        Router.updateAndroidBackStack();
        return;
    }

    if (activeUploadLayer) {
        UploadPage.closeAll();
        Router.history.pop();
        Router.updateAndroidBackStack();
        return;
    }

    if (uploadSheet && uploadSheet.classList.contains('active')) {
        UploadPage.closeSheet();
        Router.history.pop();
        Router.updateAndroidBackStack();
        return;
    }

    const activeLayers = document.querySelectorAll('.you-sub-layer.active');
    if (activeLayers.length > 0) {
        activeLayers.forEach((l) => l.classList.remove('active'));
        Router.history.pop();
        Router.updateAndroidBackStack();
        return;
    }

    if (Router.history.length > 1) {
        Router.history.pop();
        Router.switchTab(Router.history.pop());
    }
}

};

// ========================================== // 13. LIFECYCLE BOOTSTRAP &
REALTIME SYNC HUB // ========================================== const App = {
bootstrap: async () => { if (State.isBootstrapped) return; State.isBootstrapped
= true;

    const splashFailsafe = setTimeout(() => {
        const splash = Utils.el('flaynity-splash');
        if (splash && !splash.classList.contains('flaynity-hidden')) {
            console.warn("[Failsafe] Dismissing splash screen automatically.");
            Utils.hide('flaynity-splash');
            if (!State.user) Utils.show('flaynity-auth');
        }
    }, 2500);

    try {
        if (typeof firebase === 'undefined') throw new Error("Firebase SDK is not available.");

        await Router.fetchPages();
        Services.init();

        HomeFeed.init();
        Player.init();
        ShortsPlayer.init();
        UploadPage.init();
        DiscoverPage.init();
        YouPage.init();
        Router.bindGlobalNavigation();

        window.addEventListener('offline', () => { State.online = false; Utils.show('flaynity-offline'); });
        window.addEventListener('online', () => { State.online = true; Utils.hide('flaynity-offline'); });

        onClick('btn-retry-network', () => {
            if (window.AndroidBridge && typeof AndroidBridge.retryConnection === 'function') AndroidBridge.retryConnection();
            else if (navigator.onLine) { State.online = true; Utils.hide('flaynity-offline'); }
        });

        AuthSystem.init();

        clearTimeout(splashFailsafe);
    } catch (error) {
        clearTimeout(splashFailsafe);
        console.error("App Bootstrap Failed:", error);

        const splash = document.getElementById('flaynity-splash');
        if (splash) {
            splash.innerHTML = `
                <div style="padding: 24px; color: #ff3b30; text-align: center; background: #ffffff; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; box-sizing: border-box;">
                    <span class="material-symbols-outlined" style="font-size: 56px; margin-bottom: 12px;">error_outline</span>
                    <h2 style="font-size: 20px; font-weight: 700; color: #111; margin-bottom: 8px;">Initialization Failed</h2>
                    <p style="font-size: 14px; color: #666; margin-bottom: 20px; max-width: 320px;">${error.message}</p>
                    <button onclick="window.location.reload()" style="background:#111;color:#fff;border:none;padding:12px 24px;border-radius:24px;font-weight:600;cursor:pointer;">Retry</button>
                </div>
            `;
        }
    }
},

startRealtimeListeners: () => {
    Services.addListener('videos', 'videos', (snap) => {
        const data = snap.val() || {};
        State.cache.videos = Object.keys(data).map((k) => ({ id: k, ...data[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        HomeFeed.render();
        if (State.currentTab === 'you' && State.channel) YouPage.renderChannelContent('videos');
        if (Player.currentVideoData) Player.loadRecommended(Player.currentVideoData.id);
    });

    Services.addListener('shorts', 'shorts', (snap) => {
        const data = snap.val() || {};
        State.cache.shorts = Object.keys(data).map((k) => ({ id: k, ...data[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        HomeFeed.render();
        ShortsPlayer.render();
        if (State.currentTab === 'you' && State.channel) YouPage.renderChannelContent('shorts');
    });

    Services.addListener('posts', 'posts', (snap) => {
        const data = snap.val() || {};
        State.cache.posts = Object.keys(data).map((k) => ({ id: k, ...data[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        HomeFeed.render();
        if (State.currentTab === 'you' && State.channel) YouPage.renderChannelContent('posts');
    });
}

};

if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', () => App.bootstrap()); } else {
App.bootstrap(); }
