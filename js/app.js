// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================
const CONFIG = {
    firebase: {
        apiKey: "AIzaSyCiUTQp_QDSbBIOGJXKI7jJmzQHPu8L14I",
        authDomain: "flaynity-app.firebaseapp.com",
        databaseURL: "https://flaynity-app-default-rtdb.firebaseio.com",
        projectId: "flaynity-app",
        storageBucket: "flaynity-app.firebasestorage.app",
        messagingSenderId: "587469287255",
        appId: "1:587469287255:web:6ec177b0c1c802efc95812",
        measurementId: "G-HPMF5TPJB2"
    },
    r2: {
        bucket: "flaynity-storage",
        accessKey: "c4d26ef58f7d0818695c8710af083fb6",
        secretKey: "97bc62a7b0c961001611489e28f9dbd41d2b30cda3e8348bb32d12a7c1d319a8",
        endpoint: "https://b3741135bd1f3e96b6744f11e6a06600.r2.cloudflarestorage.com",
        publicUrl: "https://pub-92694602f8ec4e0fbbcbf4a91b194f69.r2.dev"
    }
};

const State = {
    user: null,
    channel: null,
    currentTab: 'home',
    online: navigator.onLine,
    cache: {
        videos: [],
        shorts: [],
        posts: [],
        channels: {},
        subscriptions: {},
        userReactions: {},
        comments: {}
    },
    activeListeners: {},
    currentPlayingVideo: null,
    isBootstrapped: false
};

// ==========================================
// 2. HIGH-PRECISION UTILITIES & THUMBNAIL ENGINE
// ==========================================
const Utils = {
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

const UI = {
    toast: (msg, duration = 3000) => {
        const existingToast = document.querySelector('.flaynity-toast');
        if (existingToast) existingToast.remove();

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

const onClick = (id, callback) => {
    const el = Utils.el(id);
    if (el) {
        el.onclick = callback;
    } else {
        console.warn(`[SafeBinder] Element #${id} not found.`);
    }
};

// ==========================================
// 3. CLOUDFLARE R2 OBJECT STORAGE ENGINE
// ==========================================
let auth, db, s3Client;

const Services = {
    init: () => {
        if (!window.firebase) {
            throw new Error("Firebase Core SDK is not loaded.");
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(CONFIG.firebase);
        }
        auth = firebase.auth();
        db = firebase.database();

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
            if(extension.includes(';')) extension = extension.split(';')[0]; // Clean mime types

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

// ==========================================
// 4. AUTHENTICATION & PROFILE SYSTEM
// ==========================================
const AuthSystem = {
    init: () => {
        auth.onAuthStateChanged(async (user) => {
            Utils.hide('flaynity-splash');

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
                    await auth.signInWithPopup(provider);
                } catch (error) {
                    UI.toast("Google Login Failed: " + error.message);
                }
            }
        });
    },

    syncUserProfile: async () => {
        if (!State.user) return;
        
        try {
            const userRef = db.ref(`users/${State.user.uid}`);
            await userRef.update({
                uid: State.user.uid,
                displayName: State.user.displayName || 'Flaynity User',
                email: State.user.email || '',
                photoURL: State.user.photoURL || '',
                lastLogin: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (e) { console.warn("Sync error (rules might restrict if offline)."); }

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
            if (typeof YouPage !== 'undefined' && YouPage.updateProfileUI) YouPage.updateProfileUI();
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

// ==========================================
// 5. HOME FEED ENGINE
// ==========================================
const HomeFeed = {
    init: () => {
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

// ==========================================
// 6. POST REACTION ENGINE
// ==========================================
const PostReactions = {
    toggleLike: async (postId) => {
        if (!State.user) return UI.toast("Please log in to like.");
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

// ==========================================
// 7. CINEMA VIDEO PLAYER
// ==========================================
const Player = {
    currentVideoData: null,

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

// ==========================================
// 8. SHORTS VERTICAL STREAM
// ==========================================
const ShortsPlayer = {
    observer: null,

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

// ==========================================
// 9. PREMIUM UPLOAD STUDIO (REBUILT + FIXED)
// ==========================================
const UploadManager = {
    currentUploadTask: null,
    updateProgress: (pct) => {
        const pt = Utils.el('up-prog-pct');
        if (pt) pt.innerText = `${Math.round(pct)}%`;
    },
    showManager: () => {
        const el = Utils.el('up-manager');
        if (el) el.classList.add('active');
    },
    hideManager: () => {
        const el = Utils.el('up-manager');
        if (el) el.classList.remove('active');
        setTimeout(() => UploadManager.updateProgress(0), 400);
    }
};

const UploadPage = {
    activeType: 'video',
    activeFile: null,
    activeBlob: null,
    activeThumbBlob: null,
    durationMs: 0,
    mediaRecorder: null,
    recordedChunks: [],
    cameraStream: null,

    init: () => {
        // Modal Actions
        onClick('btn-up-close', UploadPage.closeSheet);
        onClick('up-backdrop', (e) => { if(e.target.id === 'up-backdrop') UploadPage.closeSheet(); });

        // Layer Back Bindings
        onClick('btn-edit-back', UploadPage.closeAll);
        onClick('btn-cam-close', () => { UploadPage.stopCamera(); UploadPage.closeAll(); });
        onClick('btn-details-back', () => { const l = Utils.el('up-layer-details'); if(l) l.classList.remove('active'); });
        onClick('btn-post-back', UploadPage.closeAll);

        // Native Picker Triggers
        onClick('btn-pick-post-image', () => { const i = Utils.el('up-native-post-picker'); if(i) i.click(); });
        onClick('btn-pick-custom-thumb', () => { const i = Utils.el('up-native-thumb-picker'); if(i) i.click(); });
        
        // Setup File Handlers
        const npVideo = Utils.el('up-native-video-picker');
        const npPost = Utils.el('up-native-post-picker');
        const npThumb = Utils.el('up-native-thumb-picker');

        if (npVideo) npVideo.onchange = (e) => UploadPage.handleVideoSelect(e.target.files[0]);
        if (npPost) npPost.onchange = (e) => UploadPage.handlePostImageSelect(e.target.files[0]);
        if (npThumb) npThumb.onchange = (e) => UploadPage.handleCustomThumb(e.target.files[0]);

        // Camera Bindings
        const recBtn = Utils.el('btn-cam-record');
        if (recBtn) {
            recBtn.onmousedown = recBtn.ontouchstart = (e) => { e.preventDefault(); UploadPage.startRecording(); };
            recBtn.onmouseup = recBtn.ontouchend = (e) => { e.preventDefault(); UploadPage.stopRecording(); };
        }
        
        onClick('btn-cam-next', () => {
            UploadPage.stopCamera();
            const lc = Utils.el('up-layer-camera'), le = Utils.el('up-layer-edit');
            if(lc) lc.classList.remove('active'); if(le) le.classList.add('active');
        });

        onClick('btn-edit-next', () => {
            const ut = Utils.el('up-details-title'), ud = Utils.el('up-layer-details');
            if(ut) ut.innerText = UploadPage.activeType === 'short' ? 'Upload Short' : 'Upload Video';
            
            // Adjust categories for Short vs Video
            const uc = Utils.el('up-cat-container');
            if(uc) uc.style.display = UploadPage.activeType === 'short' ? 'none' : 'flex';
            
            if(ud) ud.classList.add('active');
        });

        // Publish Actions
        onClick('btn-publish-final', UploadPage.publishVideoOrShort);
        onClick('btn-publish-post', UploadPage.publishPost);

        // Expose trigger globally for the HTML Grid UI
        window.app = window.app || {};
        window.app.triggerUploadType = UploadPage.triggerUploadType;
    },

    openSheet: () => {
        const root = Utils.el('upload-root'), bd = Utils.el('up-backdrop');
        if (!root || !bd) return;
        
        root.style.pointerEvents = 'auto';
        bd.classList.add('active');
        Router.addBackState('upload-sheet');
    },

    closeSheet: () => {
        const bd = Utils.el('up-backdrop'), root = Utils.el('upload-root');
        if(bd) bd.classList.remove('active');
        setTimeout(() => { if (root && !document.querySelector('.up-flow-layer.active')) root.style.pointerEvents = 'none'; }, 400);
    },

    closeAll: () => {
        UploadPage.stopCamera();
        document.querySelectorAll('.up-flow-layer').forEach(l => l.classList.remove('active'));
        
        const vid = Utils.el('up-main-video'), root = Utils.el('upload-root');
        if(vid) { vid.pause(); vid.src = ''; }
        if(root) setTimeout(() => { root.style.pointerEvents = 'none'; }, 400);
        
        UploadPage.activeFile = null; UploadPage.activeBlob = null; UploadPage.activeThumbBlob = null;
        
        const it = Utils.el('up-input-title'), id = Utils.el('up-input-desc'), pt = Utils.el('up-post-text'), pp = Utils.el('up-post-preview'), ft = Utils.el('up-final-thumb');
        if(it) it.value = ''; if(id) id.value = ''; if(pt) pt.value = ''; 
        if(pp) { pp.src = ''; pp.classList.add('flaynity-hidden'); }
        if(ft) ft.src = '';
    },

    triggerUploadType: (type) => {
        UploadPage.activeType = type;
        UploadPage.closeSheet();
        
        setTimeout(() => {
            if (type === 'video') { const i=Utils.el('up-native-video-picker'); if(i) i.click(); }
            else if (type === 'short') { const l=Utils.el('up-layer-camera'); if(l) l.classList.add('active'); UploadPage.startCamera(); }
            else if (type === 'post') { const l=Utils.el('up-layer-post'); if(l) l.classList.add('active'); }
            Router.addBackState('upload-flow');
        }, 350);
    },

    handleVideoSelect: (file) => {
        if (!file) return;
        UploadPage.activeFile = file;
        const vid = Utils.el('up-main-video');
        if(vid) {
            vid.src = URL.createObjectURL(file);
            vid.onloadedmetadata = async () => {
                UploadPage.durationMs = vid.duration;
                const tRes = await Utils.generateVideoThumbnail(file);
                if (tRes && tRes.blob) {
                    UploadPage.activeThumbBlob = tRes.blob;
                    const ft = Utils.el('up-final-thumb');
                    if(ft) ft.src = URL.createObjectURL(tRes.blob);
                }
            };
        }
        const l = Utils.el('up-layer-edit'); if(l) l.classList.add('active');
    },

    handlePostImageSelect: (file) => {
        if (!file) return;
        UploadPage.activeFile = file;
        const img = Utils.el('up-post-preview');
        if(img) { img.src = URL.createObjectURL(file); img.classList.remove('flaynity-hidden'); }
    },

    handleCustomThumb: (file) => {
        if (!file) return;
        UploadPage.activeThumbBlob = file;
        const ft = Utils.el('up-final-thumb'); if(ft) ft.src = URL.createObjectURL(file);
    },

    startCamera: async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
            UploadPage.cameraStream = stream;
            const cam = Utils.el('up-live-cam'); if(cam) { cam.srcObject = stream; cam.play(); }
        } catch (e) { UI.toast("Camera permission denied or not available."); }
    },

    stopCamera: () => {
        if (UploadPage.cameraStream) { UploadPage.cameraStream.getTracks().forEach(t => t.stop()); UploadPage.cameraStream = null; }
    },

    startRecording: () => {
        if (!UploadPage.cameraStream) return;
        UploadPage.recordedChunks = [];
        
        // MimeType Fallback for Mobile Devices (fixes "recording not opening" issue)
        let mimeType = 'video/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = ''; 
        
        try {
            UploadPage.mediaRecorder = new MediaRecorder(UploadPage.cameraStream, mimeType ? { mimeType } : undefined);
            UploadPage.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) UploadPage.recordedChunks.push(e.data); };
            UploadPage.mediaRecorder.onstop = () => {
                const blob = new Blob(UploadPage.recordedChunks, { type: mimeType || 'video/mp4' });
                UploadPage.activeBlob = blob; UploadPage.activeFile = blob; 
                
                const vidUrl = URL.createObjectURL(blob);
                const vid = Utils.el('up-main-video'); if(vid) vid.src = vidUrl;
                
                const nextBtn = Utils.el('btn-cam-next'); if(nextBtn) nextBtn.classList.add('show');
                
                Utils.generateVideoThumbnail(vidUrl).then(res => { 
                    if (res && res.blob) {
                        UploadPage.activeThumbBlob = res.blob; 
                        const ft = Utils.el('up-final-thumb'); if(ft) ft.src = URL.createObjectURL(res.blob);
                        UploadPage.durationMs = res.duration;
                    }
                });
            };
            
            const rw = Utils.el('up-cam-record-wrap'), rb = Utils.el('btn-cam-record');
            if(rw) rw.classList.add('recording'); if(rb) rb.classList.add('recording');
            UploadPage.mediaRecorder.start(); Utils.vibrate();
        } catch(e) { UI.toast("Recording not supported on this device."); }
    },

    stopRecording: () => {
        if (UploadPage.mediaRecorder && UploadPage.mediaRecorder.state !== 'inactive') {
            UploadPage.mediaRecorder.stop();
            const rw = Utils.el('up-cam-record-wrap'), rb = Utils.el('btn-cam-record');
            if(rw) rw.classList.remove('recording'); if(rb) rb.classList.remove('recording');
            Utils.vibrate();
        }
    },

    publishVideoOrShort: async () => {
        if (!State.channel) { UI.toast("Create a channel first."); UploadPage.closeAll(); Router.switchTab('you'); return; }

        const titleInput = Utils.el('up-input-title');
        const title = titleInput ? titleInput.value.trim() : '';
        if (!title || (!UploadPage.activeFile && !UploadPage.activeBlob)) return UI.toast("Video and Title are required.");

        try {
            UploadPage.closeAll(); UploadManager.showManager();
            const ps = Utils.el('up-prog-status'); if(ps) ps.innerText = `Uploading ${UploadPage.activeType}...`;

            const folder = `${UploadPage.activeType}s/${State.user.uid}`;
            const mediaToUpload = UploadPage.activeFile || UploadPage.activeBlob;
            
            const cdnVideoUrl = await Services.uploadFile(mediaToUpload, folder);
            if (cdnVideoUrl === 'CANCELLED') return;

            let thumbnailUrl = cdnVideoUrl; // Fallback to video URL
            if (UploadPage.activeThumbBlob) {
                thumbnailUrl = await Services.uploadFile(UploadPage.activeThumbBlob, `thumbnails/${State.user.uid}`, 'jpg');
            }

            const descInput = Utils.el('up-input-desc');
            const catInput = Utils.el('up-input-cat');
            const visInput = Utils.el('up-input-vis');

            const metadata = {
                uid: State.user.uid, 
                channelId: State.channel.id, 
                channelName: State.channel.channelName, 
                channelAvatar: State.channel.avatarUrl || '',
                cdnVideoUrl: cdnVideoUrl, 
                thumbnailUrl: thumbnailUrl, 
                title: title,
                description: descInput ? descInput.value.trim() : '', 
                category: catInput ? catInput.value : 'Entertainment',
                visibility: visInput ? visInput.value : 'public', 
                duration: Utils.formatDuration(UploadPage.durationMs), 
                views: 0, likes: 0, comments: 0,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };

            await db.ref(`${UploadPage.activeType}s`).push().set(metadata);
            
            UploadManager.updateProgress(100);
            if(ps) ps.innerText = "Upload Complete!";
            setTimeout(() => { 
                UploadManager.hideManager(); 
                UI.toast("Published successfully!"); 
                Router.switchTab(UploadPage.activeType === 'short' ? 'shorts' : 'home'); 
            }, 1000);
        } catch (e) { 
            UploadManager.hideManager(); UI.toast("Upload failed: " + e.message); console.error(e); 
        }
    },

    publishPost: async () => {
        if (!State.channel) { UI.toast("Create a channel first."); UploadPage.closeAll(); Router.switchTab('you'); return; }
        
        const pt = Utils.el('up-post-text');
        const textVal = pt ? pt.value.trim() : '';
        if (!textVal && !UploadPage.activeFile) return UI.toast("Write something or add an image.");

        try {
            UploadPage.closeAll(); UploadManager.showManager();
            const ps = Utils.el('up-prog-status'); if(ps) ps.innerText = "Posting...";

            let imageUrl = '';
            // Added explicit "jpg" extension so AWS R2 recognizes the image correctly
            if (UploadPage.activeFile) {
                imageUrl = await Services.uploadFile(UploadPage.activeFile, `posts/${State.user.uid}`, 'jpg');
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

            UploadManager.updateProgress(100);
            if(ps) ps.innerText = "Post Created!";
            setTimeout(() => { 
                UploadManager.hideManager(); 
                UI.toast("Successfully Posted!"); 
                Router.switchTab('home'); 
            }, 1000);
        } catch (e) { 
            UploadManager.hideManager(); UI.toast("Failed to post: " + e.message); 
        }
    }
};

// ==========================================
// 10. DISCOVER & SEARCH ENGINE
// ==========================================
const DiscoverPage = {
    init: () => {
        const chips = document.querySelectorAll('.discover-categories-scroll .d-chip');
        chips.forEach((c) => {
            c.onclick = () => {
                chips.forEach((x) => x.classList.remove('active'));
                c.classList.add('active');
            };
        });
    }
};

// ==========================================
// 11. YOU / CHANNEL STUDIO & ANALYTICS
// ==========================================
const YouPage = {
    init: () => {
        onClick('btn-sign-out', AuthSystem.signOut);
        onClick('btn-create-channel', () => {
            const layer = Utils.el('layer-create-channel');
            if (layer) { layer.classList.add('active'); Router.addBackState('layer'); }
        });

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
                if (avatarFile) {
                    const preview = Utils.el('preview-create-avatar');
                    if (preview) preview.src = URL.createObjectURL(avatarFile);
                }
            };
        }

        onClick('btn-submit-create-channel', async () => {
            const ni = Utils.el('input-create-name');
            const hi = Utils.el('input-create-handle');
            const name = ni ? ni.value.trim() : '';
            const handle = hi ? hi.value.trim().toLowerCase() : '';

            if (!name || !handle) return UI.toast("Name and handle are required.");

            try {
                UI.toast("Creating channel...");
                let avatarUrl = State.user.photoURL || '';

                if (avatarFile) {
                    avatarUrl = await Services.uploadFile(avatarFile, `avatars/${State.user.uid}`);
                }

                const ci = Utils.el('input-create-category');
                await db.ref('channels').push().set({
                    uid: State.user.uid,
                    channelName: name,
                    handle: `@${handle.replace('@', '')}`,
                    avatarUrl: avatarUrl,
                    category: ci ? ci.value : 'Entertainment',
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    subscribersCount: 0, totalViews: 0
                });

                UI.toast("Channel created successfully!");
                const layer = Utils.el('layer-create-channel');
                if (layer) layer.classList.remove('active');
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
        const av = Utils.el('vc-avatar-img');
        const bn = Utils.el('vc-banner-img');
        const nt = Utils.el('vc-name-text');
        const ht = Utils.el('vc-handle-text');
        const st = Utils.el('vc-subs-text');

        if(av) av.src = ch.avatarUrl || State.user.photoURL;
        if(bn && ch.bannerUrl) { bn.src = ch.bannerUrl; Utils.show('vc-banner-img'); }
        if(nt) nt.innerText = ch.channelName;
        if(ht) ht.innerText = ch.handle;
        if(st) st.innerText = Utils.formatViews(ch.subscribersCount || 0);

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

        const sv = Utils.el('stat-views');
        const sl = Utils.el('stat-likes');
        const ss = Utils.el('stat-subs');

        if (sv) sv.innerText = Utils.formatViews(totalViews);
        if (sl) sl.innerText = Utils.formatViews(totalLikes);
        if (ss) ss.innerText = Utils.formatViews(State.channel ? State.channel.subscribersCount : 0);
    },

    openEditChannel: () => {
        const ch = State.channel;
        if (!ch) return;
        const layer = Utils.el('layer-edit-channel');
        if (layer) layer.classList.add('active');

        const ni = Utils.el('input-edit-name');
        const hi = Utils.el('input-edit-handle');
        const di = Utils.el('input-edit-desc');

        if (ni) ni.value = ch.channelName || '';
        if (hi) hi.value = ch.handle || '';
        if (di) di.value = ch.description || '';
    }
};

// ==========================================
// 12. ROUTER & GLOBAL PERSISTENT NAVIGATION
// ==========================================
const Router = {
    pages: ['home', 'shorts', 'upload', 'discover', 'you'],
    history: ['home'],

    fetchPages: async () => {
        const appRoot = document.getElementById('app');
        if (!appRoot) {
            console.warn("App root #app not found, assuming single file structure. Skipping fetch.");
            return;
        }

        for (const page of Router.pages) {
            try {
                const response = await fetch(`pages/${page}.html`);
                if (!response.ok) throw new Error(`Status: ${response.status}`);
                const html = await response.text();
                if (html.includes('<title>Flaynity</title>')) throw new Error(`Server returned index.html for ${page}`);

                const container = document.createElement('div');
                container.id = `page-container-${page}`;
                
                // Keep upload page always display:block, pointer-events controlled via CSS
                let isOverlay = (page === 'upload');
                container.style.cssText = `
                    width: 100%; height: 100%; position: absolute; top: 0; left: 0;
                    display: ${isOverlay || page === 'home' ? 'block' : 'none'}; 
                    pointer-events: ${isOverlay ? 'none' : 'auto'};
                `;
                
                container.innerHTML = html;
                appRoot.appendChild(container);
            } catch (err) {
                console.warn(`Failed to fetch pages/${page}.html:`, err.message);
            }
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
            // NEVER hide the upload container as it manages its own visibility
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

window.app = {
    ...window.app,
    executeBackAction: () => {
        const watchPage = Utils.el('flaynity-watch-page');
        const uploadSheet = Utils.el('up-sheet');
        const activeUploadLayer = document.querySelector('.up-flow-layer.active');

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

        if (uploadSheet && uploadSheet.parentElement.classList.contains('active')) {
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

// ==========================================
// 13. LIFECYCLE BOOTSTRAP & REALTIME SYNC HUB
// ==========================================
const App = {
    waitForFirebase: () => new Promise(resolve => {
        if (window.firebase) return resolve(true);
        let checks = 0;
        const interval = setInterval(() => {
            checks++;
            if (window.firebase) {
                clearInterval(interval);
                resolve(true);
            } else if (checks > 50) {
                clearInterval(interval);
                resolve(false);
            }
        }, 100);
    }),

    bootstrap: async () => {
        if (State.isBootstrapped) return;
        State.isBootstrapped = true;

        const splashFailsafe = setTimeout(() => {
            const splash = Utils.el('flaynity-splash');
            if (splash && !splash.classList.contains('flaynity-hidden')) {
                console.warn("[Failsafe] Dismissing splash screen automatically.");
                Utils.hide('flaynity-splash');
                
                if (!State.user) Utils.show('flaynity-auth');
                else {
                    Utils.show('flaynity-home-ui');
                    Router.switchTab('home');
                }
            }
        }, 3500);

        try {
            const fbReady = await App.waitForFirebase();
            if (!fbReady) throw new Error("Firebase SDK failed to load. Please check your internet connection.");

            await Router.fetchPages().catch(e => console.warn("Pages fetch skipped/failed (Single-file fallback):", e));
            
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
                if (window.AndroidBridge && typeof AndroidBridge.retryConnection === 'function') {
                    AndroidBridge.retryConnection();
                } else if (navigator.onLine) {
                    State.online = true;
                    Utils.hide('flaynity-offline');
                }
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
        try {
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
        } catch(e) {
            console.warn("Error setting up listeners:", e);
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.bootstrap());
} else {
    App.bootstrap();
}
