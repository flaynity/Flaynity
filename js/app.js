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

    // Client-side instant video frame extractor for R2 thumbnail upload
    generateVideoThumbnail: (file) => {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = URL.createObjectURL(file);
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
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    const duration = video.duration || 0;
                    URL.revokeObjectURL(video.src);
                    resolve({ blob, duration });
                }, 'image/jpeg', 0.85);
            };

            video.onerror = () => {
                URL.revokeObjectURL(video.src);
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
    },

    showUploadProgress: (titleText = "Uploading to Cloudflare R2...") => {
        const title = document.querySelector('#upload-progress-engine .progress-text');
        if (title) title.innerText = titleText;
        Utils.show('upload-progress-engine');
    },

    hideUploadProgress: () => {
        Utils.hide('upload-progress-engine');
        UI.updateUploadProgress(0);
    },

    updateUploadProgress: (pct) => {
        const txt = Utils.el('upload-progress-percentage');
        if (txt) txt.innerText = `${Math.round(pct)}%`;
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

        // Configure AWS S3 SDK for Cloudflare R2
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

    // Upload to Cloudflare R2 and return Fast CDN URL
    uploadFile: (fileOrBlob, folderPath, customExt = null) => {
        return new Promise((resolve, reject) => {
            if (!s3Client) {
                return reject(new Error("Cloudflare R2 Client is uninitialized."));
            }

            let extension = customExt;
            if (!extension) {
                if (fileOrBlob.name) {
                    extension = fileOrBlob.name.split('.').pop();
                } else if (fileOrBlob.type) {
                    extension = fileOrBlob.type.split('/')[1] || 'bin';
                } else {
                    extension = 'bin';
                }
            }

            const uniqueKey = `${folderPath}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

            // Note: Cloudflare R2 does NOT support 'ACL: public-read'. Omit ACL to prevent 400 Bad Request.
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
                    UI.updateUploadProgress(percentage);
                }
            });

            uploadRequest.send((err, data) => {
                if (err) {
                    console.error("Cloudflare R2 Upload Error:", err);
                    reject(err);
                } else {
                    // Direct Cloudflare CDN delivery URL
                    const finalCdnUrl = `${CONFIG.r2.publicUrl}/${uniqueKey}`;
                    resolve(finalCdnUrl);
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

window.handleNativeGoogleSignIn = (idToken) => {
    try {
        const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
        auth.signInWithCredential(credential).catch((error) => {
            UI.toast("Native Google Sign-In Failed: " + error.message);
        });
    } catch (e) {
        console.error("Token verification error:", e);
    }
};

// ==========================================
// 5. HOME FEED ENGINE (6 Shorts -> 10 Videos -> 1 Post)
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
            container.appendChild(HomeFeed.buildShortsGrid(Visibility.publicList(State.cache.shorts)));
        } else if (type === 'Posts') {
            Visibility.publicList(State.cache.posts).forEach((post) => {
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

        const videos = Visibility.publicList(State.cache.videos);
        const shorts = Visibility.publicList(State.cache.shorts);
        const posts = Visibility.publicList(State.cache.posts);

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

        let videoIdx = 0;
        let shortsIdx = 0;
        let postIdx = 0;
        let active = true;

        while (active) {
            let chunkAdded = false;

            // Pattern Step 1: 6 Shorts Grid
            if (shortsIdx < shorts.length) {
                const batch = shorts.slice(shortsIdx, shortsIdx + 6);
                shortsIdx += 6;
                container.appendChild(HomeFeed.buildShortsGrid(batch));
                chunkAdded = true;
            }

            // Pattern Step 2: 10 Long Videos
            if (videoIdx < videos.length) {
                const batch = videos.slice(videoIdx, videoIdx + 10);
                videoIdx += 10;
                batch.forEach((video) => {
                    container.appendChild(HomeFeed.buildVideoCard(video));
                });
                chunkAdded = true;
            }

            // Pattern Step 3: 1 Community Post
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
            <div class="lv-thumbnail-box">
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
                    <img src="${item.thumbnailUrl || item.cdnVideoUrl}" loading="lazy" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
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
        if (!State.user) {
            return UI.toast("Please log in to like.");
        }
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
// 7. CINEMA VIDEO PLAYER (CLOUDFLARE CDN)
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

        // Play directly via Cloudflare CDN URL
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
        }
        if (layer) layer.classList.remove('active');
        State.currentPlayingVideo = null;
        Player.currentVideoData = null;
    },

    toggleSubscribe: async () => {
        if (!State.user || !Player.currentVideoData) {
            return UI.toast("Log in to subscribe.");
        }
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

        const list = Visibility.publicList(State.cache.videos).filter((v) => v.id !== excludeId);
        list.slice(0, 8).forEach((item) => {
            recArea.appendChild(HomeFeed.buildVideoCard(item));
        });
    }
};

// ==========================================
// 8. SHORTS VERTICAL STREAM (CLOUDFLARE CDN)
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

        const shorts = Visibility.publicList(State.cache.shorts);

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
                <video class="short-video-element" src="${s.cdnVideoUrl}" loop playsinline preload="auto"></video>
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
// 9. VISIBILITY / SCHEDULING ENGINE
// ==========================================
const Visibility = {
    // Decide if an item should appear in PUBLIC feeds right now.
    isPublicNow: (item) => {
        if (!item) return false;
        if (item.visibility === 'public' || !item.visibility) return true;
        if (item.visibility === 'scheduled') {
            return !!item.scheduledAt && item.scheduledAt <= Date.now();
        }
        return false; // private
    },

    publicList: (arr) => (arr || []).filter(Visibility.isPublicNow),

    startAutoRevealTicker: () => {
        // Scheduled items become public purely by clock time (no new DB write),
        // so periodically re-render feeds to reveal anything whose time has arrived.
        setInterval(() => {
            if (State.currentTab === 'home') HomeFeed.render();
            if (State.currentTab === 'shorts') ShortsPlayer.render();
        }, 20000);
    }
};

// ==========================================
// 10. UPLOAD STUDIO — SHARED HELPERS (thumbnails / filmstrips)
// ==========================================
const StudioMedia = {
    // Grab a single JPEG frame from a video file/blob at a given time (seconds).
    grabFrame: (fileOrBlob, time = 0) => {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(fileOrBlob);
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            video.src = url;

            const cleanup = () => URL.revokeObjectURL(url);

            video.onloadedmetadata = () => {
                video.currentTime = Math.min(Math.max(time, 0), Math.max(video.duration - 0.05, 0));
            };
            video.onseeked = () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 360;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    cleanup();
                    resolve({ blob, dataUrl: canvas.toDataURL('image/jpeg', 0.82), duration: video.duration || 0 });
                }, 'image/jpeg', 0.85);
            };
            video.onerror = () => { cleanup(); resolve({ blob: null, dataUrl: null, duration: 0 }); };
        });
    },

    // Build an evenly-spaced filmstrip of N frames across the whole clip (for the trim timeline).
    generateFilmstrip: async (fileOrBlob, count = 10) => {
        const url = URL.createObjectURL(fileOrBlob);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.src = url;

        await new Promise((res) => { video.onloadedmetadata = res; video.onerror = res; });
        const duration = video.duration || 0;
        const canvas = document.createElement('canvas');
        canvas.width = 160; canvas.height = 160;
        const ctx = canvas.getContext('2d');
        const frames = [];

        const seekTo = (t) => new Promise((res) => {
            const handler = () => { video.removeEventListener('seeked', handler); res(); };
            video.addEventListener('seeked', handler);
            video.currentTime = Math.min(Math.max(t, 0), Math.max(duration - 0.05, 0));
        });

        for (let i = 0; i < count; i++) {
            const t = count > 1 ? (duration * i) / (count - 1) : 0;
            await seekTo(t);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL('image/jpeg', 0.7));
        }

        URL.revokeObjectURL(url);
        return { frames, duration };
    }
};

// ==========================================
// 11. CREATE SHEET — DRAGGABLE / SWIPEABLE CAROUSEL
// ==========================================
const CreateCarousel = {
    types: ['video', 'short', 'post'],
    selectedIndex: 0,
    optionWidth: 150,
    dragging: false,
    startX: 0,
    baseOffset: 0,

    init: () => {
        const track = Utils.el('uc-track');
        const viewport = Utils.el('uc-viewport');
        if (!track || !viewport) return;

        track.style.marginLeft = `-${CreateCarousel.optionWidth / 2}px`;

        const onDown = (clientX) => {
            CreateCarousel.dragging = true;
            CreateCarousel.startX = clientX;
            CreateCarousel.baseOffset = -CreateCarousel.selectedIndex * CreateCarousel.optionWidth;
            track.classList.add('dragging');
        };
        const onMove = (clientX) => {
            if (!CreateCarousel.dragging) return;
            const delta = clientX - CreateCarousel.startX;
            track.style.transform = `translateX(${CreateCarousel.baseOffset + delta}px)`;
        };
        const onUp = (clientX) => {
            if (!CreateCarousel.dragging) return;
            CreateCarousel.dragging = false;
            track.classList.remove('dragging');
            const delta = clientX - CreateCarousel.startX;

            if (Math.abs(delta) < 8) {
                // Treat as a tap — handled by option click handlers below.
                CreateCarousel.snapTo(CreateCarousel.selectedIndex);
                return;
            }
            const moveSteps = Math.round(-delta / CreateCarousel.optionWidth);
            let newIndex = CreateCarousel.selectedIndex + moveSteps;
            newIndex = Math.min(Math.max(newIndex, 0), CreateCarousel.types.length - 1);
            CreateCarousel.snapTo(newIndex);
        };

        viewport.addEventListener('pointerdown', (e) => { viewport.setPointerCapture(e.pointerId); onDown(e.clientX); });
        viewport.addEventListener('pointermove', (e) => onMove(e.clientX));
        viewport.addEventListener('pointerup', (e) => onUp(e.clientX));
        viewport.addEventListener('pointercancel', (e) => onUp(e.clientX));

        track.querySelectorAll('.uc-option').forEach((opt, idx) => {
            opt.addEventListener('click', () => {
                if (CreateCarousel.dragging) return;
                if (idx === CreateCarousel.selectedIndex) {
                    UploadPage.openFlow(CreateCarousel.types[idx]);
                } else {
                    CreateCarousel.snapTo(idx);
                }
            });
        });

        CreateCarousel.snapTo(0, true);
    },

    snapTo: (index, instant = false) => {
        const track = Utils.el('uc-track');
        if (!track) return;
        CreateCarousel.selectedIndex = index;
        if (instant) track.style.transition = 'none';
        track.style.transform = `translateX(${-index * CreateCarousel.optionWidth}px)`;
        if (instant) requestAnimationFrame(() => { track.style.transition = ''; });

        track.querySelectorAll('.uc-option').forEach((opt, i) => {
            opt.classList.toggle('uc-selected', i === index);
            opt.classList.toggle('uc-neighbor', i !== index);
        });
        document.querySelectorAll('.uc-dot').forEach((dot, i) => {
            dot.classList.toggle('uc-dot-active', i === index);
        });
        Utils.vibrate(15);
    }
};

// ==========================================
// 12. MEDIA GRID PICKER (device video / photo grid)
// ==========================================
const MediaGridPicker = {
    // Renders picked files as a tappable thumbnail grid inside `listId`,
    // keeping the "add tile" so the user can pick more.
    render: async (listId, addTileId, files, kind, onPick) => {
        const list = Utils.el(listId);
        const addTile = Utils.el(addTileId);
        if (!list) return;

        list.querySelectorAll('.gp-generated').forEach((n) => n.remove());

        for (const file of files) {
            const cell = document.createElement('div');
            cell.className = 'grid-picker-cell gp-generated';

            if (kind === 'video') {
                const { dataUrl, duration } = await StudioMedia.grabFrame(file, 0.3);
                cell.innerHTML = `
                    <img src="${dataUrl || ''}">
                    <div class="gp-duration">${Utils.formatDuration(duration)}</div>
                    <div class="gp-check"><span class="material-symbols-outlined" style="color:#fff;">play_circle</span></div>
                `;
            } else {
                cell.innerHTML = `
                    <img src="${URL.createObjectURL(file)}">
                    <div class="gp-check"><span class="material-symbols-outlined" style="color:#fff;">check_circle</span></div>
                `;
            }
            cell.onclick = () => onPick(file);
            list.insertBefore(cell, addTile);
        }
    }
};

// ==========================================
// 13. TRIM TIMELINE (video / short preview + trim selector)
// ==========================================
const Trimmer = {
    duration: 0,
    start: 0,
    end: 0,
    videoEl: null,
    trackId: null,
    dragTarget: null,
    playLoopHandle: null,

    setup: async (file, videoElId, ids) => {
        Trimmer.videoEl = Utils.el(videoElId);
        Trimmer.ids = ids; // { thumbs, track, maskLeft, maskRight, border, playhead, handleStart, handleEnd, current, selected, total }
        Trimmer.videoEl.src = URL.createObjectURL(file);
        Trimmer.videoEl.currentTime = 0;

        await new Promise((res) => {
            Trimmer.videoEl.onloadedmetadata = res;
        });

        Trimmer.duration = Trimmer.videoEl.duration || 0;
        Trimmer.start = 0;
        Trimmer.end = Trimmer.duration;

        Utils.el(ids.total).innerText = Utils.formatDuration(Trimmer.duration);
        Trimmer.updateSelectedLabel();

        const { frames } = await StudioMedia.generateFilmstrip(file, 10);
        const thumbsWrap = Utils.el(ids.thumbs);
        thumbsWrap.innerHTML = frames.map((f) => `<img src="${f}">`).join('');

        Trimmer.renderHandles();
        Trimmer.bindDrag();
        Trimmer.bindTapPlay();
        Trimmer.startPlayheadLoop();
    },

    pctFor: (t) => Trimmer.duration ? (t / Trimmer.duration) * 100 : 0,

    renderHandles: () => {
        const ids = Trimmer.ids;
        const startPct = Trimmer.pctFor(Trimmer.start);
        const endPct = Trimmer.pctFor(Trimmer.end);
        Utils.el(ids.maskLeft).style.cssText = `left:0;width:${startPct}%;`;
        Utils.el(ids.maskRight).style.cssText = `right:0;width:${100 - endPct}%;`;
        Utils.el(ids.border).style.cssText = `left:${startPct}%;width:${endPct - startPct}%;`;
        Utils.el(ids.handleStart).style.left = `calc(${startPct}% - 9px)`;
        Utils.el(ids.handleEnd).style.left = `calc(${endPct}% - 9px)`;
        Trimmer.updateSelectedLabel();
    },

    updateSelectedLabel: () => {
        Utils.el(Trimmer.ids.selected).innerText = `Selected ${Utils.formatDuration(Trimmer.end - Trimmer.start)}`;
    },

    bindDrag: () => {
        const ids = Trimmer.ids;
        const track = Utils.el(ids.track);

        const moveHandle = (which, clientX) => {
            const rect = track.getBoundingClientRect();
            let pct = ((clientX - rect.left) / rect.width) * 100;
            pct = Math.min(Math.max(pct, 0), 100);
            let t = (pct / 100) * Trimmer.duration;

            if (which === 'start') {
                t = Math.min(t, Trimmer.end - 0.5);
                Trimmer.start = Math.max(t, 0);
                Trimmer.videoEl.currentTime = Trimmer.start;
            } else {
                t = Math.max(t, Trimmer.start + 0.5);
                Trimmer.end = Math.min(t, Trimmer.duration);
                Trimmer.videoEl.currentTime = Trimmer.end;
            }
            Trimmer.renderHandles();
        };

        [['start', ids.handleStart], ['end', ids.handleEnd]].forEach(([which, id]) => {
            const handle = Utils.el(id);
            handle.addEventListener('pointerdown', (e) => {
                handle.setPointerCapture(e.pointerId);
                Trimmer.dragTarget = which;
            });
            handle.addEventListener('pointermove', (e) => {
                if (Trimmer.dragTarget === which) moveHandle(which, e.clientX);
            });
            handle.addEventListener('pointerup', () => { Trimmer.dragTarget = null; });
        });
    },

    bindTapPlay: () => {
        const tapLayerId = Trimmer.ids.tapLayer;
        const indicatorId = Trimmer.ids.indicator;
        const tapLayer = tapLayerId ? Utils.el(tapLayerId) : null;
        if (!tapLayer) return;

        tapLayer.onclick = () => {
            const indicator = Utils.el(indicatorId);
            if (Trimmer.videoEl.paused) {
                if (Trimmer.videoEl.currentTime < Trimmer.start || Trimmer.videoEl.currentTime >= Trimmer.end) {
                    Trimmer.videoEl.currentTime = Trimmer.start;
                }
                Trimmer.videoEl.play().catch(() => {});
                indicator.querySelector('span').innerText = 'pause';
            } else {
                Trimmer.videoEl.pause();
                indicator.querySelector('span').innerText = 'play_arrow';
            }
            if (indicator) {
                indicator.classList.add('flash');
                setTimeout(() => indicator.classList.remove('flash'), 400);
            }
        };
    },

    startPlayheadLoop: () => {
        if (Trimmer.playLoopHandle) cancelAnimationFrame(Trimmer.playLoopHandle);
        const tick = () => {
            if (Trimmer.videoEl && Trimmer.duration) {
                if (!Trimmer.videoEl.paused && Trimmer.videoEl.currentTime >= Trimmer.end) {
                    Trimmer.videoEl.pause();
                    Trimmer.videoEl.currentTime = Trimmer.start;
                }
                const pct = Trimmer.pctFor(Trimmer.videoEl.currentTime);
                const ph = Utils.el(Trimmer.ids.playhead);
                if (ph) ph.style.left = `${pct}%`;
                Utils.el(Trimmer.ids.current).innerText = Utils.formatDuration(Trimmer.videoEl.currentTime);
            }
            Trimmer.playLoopHandle = requestAnimationFrame(tick);
        };
        tick();
    },

    teardown: () => {
        if (Trimmer.playLoopHandle) cancelAnimationFrame(Trimmer.playLoopHandle);
        if (Trimmer.videoEl) {
            Trimmer.videoEl.pause();
            if (Trimmer.videoEl.src) URL.revokeObjectURL(Trimmer.videoEl.src);
        }
    }
};

// ==========================================
// 14. SHORT CAMERA CAPTURE ENGINE
// ==========================================
const ShortCamera = {
    stream: null,
    recorder: null,
    chunks: [],
    facing: 'user',
    timerSec: 0,
    durationCap: 30,
    speed: 1,
    filter: 'none',
    isRecording: false,
    recordStartAt: 0,
    recordCapTimeout: null,
    ringHandle: null,
    holdMode: false,

    init: () => {
        onClick('btn-request-camera-permission', ShortCamera.start);
        onClick('btn-flip-camera', () => {
            ShortCamera.facing = ShortCamera.facing === 'user' ? 'environment' : 'user';
            ShortCamera.start();
        });

        ShortCamera.bindPopover('btn-cam-flash', null, () => ShortCamera.toggleFlash());
        ShortCamera.bindPopover('btn-cam-speed', 'popover-speed', null, (el) => {
            ShortCamera.speed = parseFloat(el.dataset.speed);
        });
        ShortCamera.bindPopover('btn-cam-timer', 'popover-timer', null, (el) => {
            ShortCamera.timerSec = parseInt(el.dataset.timer, 10);
        });
        ShortCamera.bindPopover('btn-cam-duration', 'popover-duration', null, (el) => {
            ShortCamera.durationCap = parseInt(el.dataset.duration, 10);
        });
        ShortCamera.bindPopover('btn-cam-filters', 'popover-filters', null, (el) => {
            ShortCamera.filter = el.dataset.filter;
            ShortCamera.applyFilterPreview();
        });
        onClick('btn-cam-handsfree', () => UI.toast('Hands-free mode: tap record to start/stop without holding.'));

        const recordBtn = Utils.el('btn-record-short');
        let holdTimer = null;
        recordBtn.addEventListener('pointerdown', () => {
            holdTimer = setTimeout(() => {
                ShortCamera.holdMode = true;
                ShortCamera.beginCaptureSequence();
            }, 220);
        });
        recordBtn.addEventListener('pointerup', () => {
            clearTimeout(holdTimer);
            if (ShortCamera.holdMode) {
                ShortCamera.holdMode = false;
                if (ShortCamera.isRecording) ShortCamera.stopRecording();
            } else {
                // Quick tap => toggle persistent recording
                if (ShortCamera.isRecording) {
                    ShortCamera.stopRecording();
                } else {
                    ShortCamera.beginCaptureSequence();
                }
            }
        });

        onClick('btn-short-done', () => ShortCamera.finishToPreview());
    },

    bindPopover: (btnId, popoverId, directAction, onSelect) => {
        const btn = Utils.el(btnId);
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.cam-popover.show').forEach((p) => { if (p.id !== popoverId) p.classList.remove('show'); });
            if (directAction) { directAction(); return; }
            const pop = popoverId ? Utils.el(popoverId) : null;
            if (!pop) return;
            pop.classList.toggle('show');
            pop.querySelectorAll('.cam-popover-item').forEach((item) => {
                item.onclick = (ev) => {
                    ev.stopPropagation();
                    pop.querySelectorAll('.cam-popover-item').forEach((i) => i.classList.remove('active-opt'));
                    item.classList.add('active-opt');
                    onSelect(item);
                    pop.classList.remove('show');
                };
            });
        });
        document.addEventListener('click', () => {
            if (popoverId) { const p = Utils.el(popoverId); if (p) p.classList.remove('show'); }
        });
    },

    applyFilterPreview: () => {
        const video = Utils.el('short-camera-video');
        const map = { none: 'none', warm: 'saturate(1.3) sepia(.18)', cool: 'saturate(1.1) hue-rotate(-10deg) brightness(1.05)', bw: 'grayscale(1)', vivid: 'saturate(1.6) contrast(1.1)' };
        if (video) video.style.filter = map[ShortCamera.filter] || 'none';
    },

    start: async () => {
        Utils.hide('camera-permission-state');
        try {
            if (ShortCamera.stream) ShortCamera.stream.getTracks().forEach((t) => t.stop());
            ShortCamera.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: ShortCamera.facing },
                audio: true
            });
            const video = Utils.el('short-camera-video');
            video.srcObject = ShortCamera.stream;
            ShortCamera.applyFilterPreview();
        } catch (err) {
            console.warn('Camera permission error:', err);
            Utils.el('camera-permission-state').classList.add('show');
        }
    },

    toggleFlash: async () => {
        try {
            const track = ShortCamera.stream && ShortCamera.stream.getVideoTracks()[0];
            const capabilities = track && track.getCapabilities ? track.getCapabilities() : null;
            if (capabilities && capabilities.torch) {
                const btn = Utils.el('btn-cam-flash');
                const isOn = btn.classList.toggle('cam-tool-active');
                await track.applyConstraints({ advanced: [{ torch: isOn }] });
                btn.querySelector('span').innerText = isOn ? 'flash_on' : 'flash_off';
            } else {
                UI.toast('Flash/torch isn\u2019t supported on this device/browser.');
            }
        } catch (e) {
            UI.toast('Unable to toggle flash.');
        }
    },

    beginCaptureSequence: () => {
        if (!ShortCamera.stream) return UI.toast('Camera not ready yet.');
        if (ShortCamera.timerSec > 0) {
            ShortCamera.runCountdown(ShortCamera.timerSec, ShortCamera.startRecording);
        } else {
            ShortCamera.startRecording();
        }
    },

    runCountdown: (seconds, then) => {
        const overlay = Utils.el('camera-countdown-overlay');
        overlay.classList.add('show');
        let remaining = seconds;
        overlay.innerText = remaining;
        const iv = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(iv);
                overlay.classList.remove('show');
                then();
            } else {
                overlay.innerText = remaining;
            }
        }, 1000);
    },

    startRecording: () => {
        if (!ShortCamera.stream) return;
        ShortCamera.chunks = [];
        try {
            ShortCamera.recorder = new MediaRecorder(ShortCamera.stream, { mimeType: 'video/webm;codecs=vp9,opus' });
        } catch (e) {
            ShortCamera.recorder = new MediaRecorder(ShortCamera.stream);
        }
        ShortCamera.recorder.ondataavailable = (e) => { if (e.data.size > 0) ShortCamera.chunks.push(e.data); };
        ShortCamera.recorder.onstop = () => {
            const blob = new Blob(ShortCamera.chunks, { type: 'video/webm' });
            ShortCamera.recordedBlob = blob;
            Utils.el('btn-short-done').classList.add('show');
        };
        ShortCamera.recorder.start();
        ShortCamera.isRecording = true;
        ShortCamera.recordStartAt = Date.now();

        const btn = Utils.el('btn-record-short');
        btn.classList.add('is-recording');
        Utils.el('camera-rec-timer').classList.add('show');
        Utils.vibrate(30);

        const circle = Utils.el('cam-record-ring-circle');
        const circumference = 232.5;

        const tick = () => {
            if (!ShortCamera.isRecording) return;
            const elapsed = (Date.now() - ShortCamera.recordStartAt) / 1000;
            Utils.el('camera-rec-timer-text').innerText = Utils.formatDuration(elapsed);
            const pct = Math.min(elapsed / ShortCamera.durationCap, 1);
            circle.style.strokeDashoffset = `${circumference * (1 - pct)}`;
            if (elapsed >= ShortCamera.durationCap) {
                ShortCamera.stopRecording();
                return;
            }
            ShortCamera.ringHandle = requestAnimationFrame(tick);
        };
        tick();

        ShortCamera.recordCapTimeout = setTimeout(() => {
            if (ShortCamera.isRecording) ShortCamera.stopRecording();
        }, ShortCamera.durationCap * 1000 + 50);
    },

    stopRecording: () => {
        if (!ShortCamera.isRecording) return;
        ShortCamera.isRecording = false;
        clearTimeout(ShortCamera.recordCapTimeout);
        if (ShortCamera.ringHandle) cancelAnimationFrame(ShortCamera.ringHandle);
        Utils.el('btn-record-short').classList.remove('is-recording');
        Utils.el('camera-rec-timer').classList.remove('show');
        Utils.vibrate(30);
        if (ShortCamera.recorder && ShortCamera.recorder.state !== 'inactive') {
            ShortCamera.recorder.stop();
        }
    },

    stopStream: () => {
        if (ShortCamera.stream) {
            ShortCamera.stream.getTracks().forEach((t) => t.stop());
            ShortCamera.stream = null;
        }
    },

    finishToPreview: () => {
        if (!ShortCamera.recordedBlob) return;
        UploadPage.setActiveShortSource(ShortCamera.recordedBlob, ShortCamera.speed);
        ShortCamera.stopStream();
        Utils.el('btn-short-done').classList.remove('show');
    },

    reset: () => {
        ShortCamera.recordedBlob = null;
        ShortCamera.isRecording = false;
        ShortCamera.holdMode = false;
        const circle = Utils.el('cam-record-ring-circle');
        if (circle) circle.style.strokeDashoffset = '232.5';
        Utils.el('camera-rec-timer-text') && (Utils.el('camera-rec-timer-text').innerText = '0:00');
    }
};

// ==========================================
// 15. FORM HELPERS (counters / toggles / visibility groups)
// ==========================================
const FormKit = {
    bindCounter: (inputId, counterId, max) => {
        const input = Utils.el(inputId);
        const counter = Utils.el(counterId);
        if (!input || !counter) return;
        const update = () => {
            counter.innerText = `${input.value.length}/${max}`;
            counter.classList.toggle('over-limit', input.value.length >= max);
        };
        input.addEventListener('input', update);
        update();
    },

    bindToggle: (id) => {
        const el = Utils.el(id);
        if (!el) return;
        el.onclick = () => el.classList.toggle('on');
    },

    isToggleOn: (id) => {
        const el = Utils.el(id);
        return el ? el.classList.contains('on') : false;
    },

    bindVisibilityGroup: (groupId, scheduleBoxId) => {
        const group = Utils.el(groupId);
        const box = scheduleBoxId ? Utils.el(scheduleBoxId) : null;
        if (!group) return;
        group.querySelectorAll('.visibility-pill').forEach((pill) => {
            pill.onclick = () => {
                group.querySelectorAll('.visibility-pill').forEach((p) => p.classList.remove('selected'));
                pill.classList.add('selected');
                group.dataset.value = pill.dataset.val;
                if (box) box.classList.toggle('show', pill.dataset.val === 'scheduled');
            };
        });
    },

    getVisibility: (groupId) => {
        const group = Utils.el(groupId);
        return group ? group.dataset.value : 'public';
    },

    getScheduledAt: (dateId, timeId) => {
        const d = Utils.el(dateId).value;
        const t = Utils.el(timeId).value || '00:00';
        if (!d) return null;
        const ms = new Date(`${d}T${t}`).getTime();
        return isNaN(ms) ? null : ms;
    },

    validateRequired: (inputId, errorId) => {
        const input = Utils.el(inputId);
        const error = Utils.el(errorId);
        const valid = input.value.trim().length > 0;
        input.classList.toggle('field-invalid', !valid);
        if (error) error.classList.toggle('show', !valid);
        return valid;
    }
};

// ==========================================
// 16. CONTENT PUBLISH PIPELINE (R2 + REALTIME DB)
// ==========================================
const UploadPage = {
    type: null,
    videoFiles: [],
    postFiles: [],
    activeFile: null,
    customThumbFile: null,
    autoThumbDataUrl: null,
    shortCaptureSpeed: 1,

    init: () => {
        CreateCarousel.init();
        ShortCamera.init();

        onClick('btn-close-upload-sheet', UploadPage.closeSheet);
        onClick('upload-backdrop', (e) => { if (e.target.id === 'upload-backdrop') UploadPage.closeSheet(); });

        // ---- close buttons per flow ----
        onClick('btn-close-video-flow', UploadPage.closeAll);
        onClick('btn-close-short-flow', UploadPage.closeAll);
        onClick('btn-close-post-flow', UploadPage.closeAll);

        // ---- back buttons per step ----
        onClick('btn-back-video-preview', () => UploadPage.goStep('flow-video', 'step-video-grid'));
        onClick('btn-back-video-details', () => UploadPage.goStep('flow-video', 'step-video-preview'));
        onClick('btn-back-short-preview', () => { ShortCamera.reset(); UploadPage.goStep('flow-short', 'step-short-camera'); ShortCamera.start(); });
        onClick('btn-back-short-details', () => UploadPage.goStep('flow-short', 'step-short-preview'));
        onClick('btn-back-post-preview', () => UploadPage.goStep('flow-post', 'step-post-grid'));
        onClick('btn-back-post-details', () => UploadPage.goStep('flow-post', 'step-post-preview'));

        // ---- VIDEO: grid picker ----
        onClick('video-grid-add-tile', () => Utils.el('input-video-file').click());
        Utils.el('input-video-file').onchange = async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            UploadPage.videoFiles = UploadPage.videoFiles.concat(files);
            await MediaGridPicker.render('video-grid-list', 'video-grid-add-tile', files, 'video', UploadPage.pickVideo);
        };

        // ---- VIDEO: preview/trim next ----
        onClick('btn-video-preview-next', async () => {
            const { blob, dataUrl } = await StudioMedia.grabFrame(UploadPage.activeFile, Trimmer.start + 0.05);
            UploadPage.autoThumbDataUrl = dataUrl;
            UploadPage.autoThumbBlob = blob;
            Utils.el('video-thumb-auto-img').src = dataUrl || '';
            UploadPage.selectAutoThumb('video');
            UploadPage.goStep('flow-video', 'step-video-details');
        });

        onClick('video-thumb-auto', () => UploadPage.selectAutoThumb('video'));
        onClick('video-thumb-custom', () => Utils.el('input-video-thumb-custom').click());
        Utils.el('input-video-thumb-custom').onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            UploadPage.customThumbFile = file;
            Utils.el('video-thumb-custom-img').src = URL.createObjectURL(file);
            Utils.show('video-thumb-custom-img');
            Utils.hide('video-thumb-custom-icon');
            UploadPage.selectCustomThumb('video');
        };

        FormKit.bindCounter('input-video-title', 'video-title-counter', 100);
        FormKit.bindCounter('input-video-desc', 'video-desc-counter', 5000);
        FormKit.bindVisibilityGroup('video-visibility-group', 'video-schedule-box');
        FormKit.bindToggle('toggle-video-comments');
        FormKit.bindToggle('toggle-video-hidelikes');
        onClick('btn-publish-video', () => UploadPage.publish('video'));

        // ---- SHORT: gallery fallback ----
        onClick('btn-short-gallery', () => Utils.el('input-short-file').click());
        Utils.el('input-short-file').onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            ShortCamera.stopStream();
            UploadPage.setActiveShortSource(file, 1);
        };

        onClick('btn-short-preview-next', async () => {
            const { blob, dataUrl } = await StudioMedia.grabFrame(UploadPage.activeFile, 0.15);
            UploadPage.autoThumbDataUrl = dataUrl;
            UploadPage.autoThumbBlob = blob;
            Utils.el('short-thumb-auto-img').src = dataUrl || '';
            UploadPage.customThumbFile = null;
            UploadPage.goStep('flow-short', 'step-short-details');
        });

        onClick('btn-short-add-text', () => UI.toast('Tap the preview to place text overlays.'));
        onClick('btn-short-voiceover', () => UI.toast('Voice-over recording starts after you tap this again.'));
        onClick('btn-short-download', () => UploadPage.downloadActiveFile());
        onClick('short-thumb-custom-trigger', () => Utils.el('input-short-thumb-custom').click());
        Utils.el('input-short-thumb-custom').onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            UploadPage.customThumbFile = file;
            Utils.el('short-thumb-auto-img').src = URL.createObjectURL(file);
        };

        FormKit.bindCounter('input-short-title', 'short-title-counter', 150);
        FormKit.bindCounter('input-short-desc', 'short-desc-counter', 2000);
        FormKit.bindVisibilityGroup('short-visibility-group', 'short-schedule-box');
        FormKit.bindToggle('toggle-short-comments');
        FormKit.bindToggle('toggle-short-hidelikes');
        onClick('btn-publish-short', () => UploadPage.publish('short'));

        // ---- POST: grid picker ----
        onClick('post-grid-add-tile', () => Utils.el('input-post-file').click());
        Utils.el('input-post-file').onchange = async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            UploadPage.postFiles = UploadPage.postFiles.concat(files);
            await MediaGridPicker.render('post-grid-list', 'post-grid-add-tile', files, 'image', UploadPage.pickPostImage);
        };

        onClick('btn-post-preview-next', () => UploadPage.goStep('flow-post', 'step-post-details'));
        FormKit.bindCounter('input-post-text', 'post-title-counter', 280);
        FormKit.bindVisibilityGroup('post-visibility-group', 'post-schedule-box');
        FormKit.bindToggle('toggle-post-comments');
        FormKit.bindToggle('toggle-post-hidelikes');
        onClick('btn-publish-post', () => UploadPage.publish('post'));
    },

    // ---------- picking callbacks ----------
    pickVideo: async (file) => {
        UploadPage.activeFile = file;
        await Trimmer.setup(file, 'video-preview-element', {
            thumbs: 'video-trim-thumbs', track: 'video-trim-track',
            maskLeft: 'video-mask-left', maskRight: 'video-mask-right', border: 'video-selection-border',
            playhead: 'video-playhead', handleStart: 'video-handle-start', handleEnd: 'video-handle-end',
            current: 'video-trim-current', selected: 'video-trim-selected', total: 'video-trim-total',
            tapLayer: 'video-preview-tap', indicator: 'video-play-indicator'
        });
        UploadPage.goStep('flow-video', 'step-video-preview');
    },

    pickPostImage: (file) => {
        UploadPage.activeFile = file;
        Utils.el('post-image-preview').src = URL.createObjectURL(file);
        UploadPage.goStep('flow-post', 'step-post-preview');
    },

    setActiveShortSource: (fileOrBlob, speed) => {
        UploadPage.activeFile = fileOrBlob;
        UploadPage.shortCaptureSpeed = speed || 1;
        const el = Utils.el('short-preview-element');
        el.src = URL.createObjectURL(fileOrBlob);
        el.playbackRate = speed || 1;
        el.loop = true;
        el.play().catch(() => {});

        const tap = Utils.el('short-preview-tap');
        tap.onclick = () => {
            const indicator = Utils.el('short-play-indicator');
            if (el.paused) { el.play(); indicator.querySelector('span').innerText = 'pause'; }
            else { el.pause(); indicator.querySelector('span').innerText = 'play_arrow'; }
            indicator.classList.add('flash');
            setTimeout(() => indicator.classList.remove('flash'), 400);
        };

        UploadPage.goStep('flow-short', 'step-short-preview');
    },

    downloadActiveFile: () => {
        if (!UploadPage.activeFile) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(UploadPage.activeFile);
        a.download = `flaynity-short-${Date.now()}.webm`;
        a.click();
    },

    selectAutoThumb: (prefix) => {
        UploadPage.customThumbFile = null;
        const autoBox = Utils.el(`${prefix}-thumb-auto`);
        const customBox = Utils.el(`${prefix}-thumb-custom`);
        if (autoBox) autoBox.style.borderColor = 'var(--flaynity-text)';
        if (customBox) customBox.style.borderColor = 'transparent';
    },
    selectCustomThumb: (prefix) => {
        const autoBox = Utils.el(`${prefix}-thumb-auto`);
        const customBox = Utils.el(`${prefix}-thumb-custom`);
        if (autoBox) autoBox.style.borderColor = 'transparent';
        if (customBox) customBox.style.borderColor = 'var(--flaynity-text)';
    },

    // ---------- step / flow navigation ----------
    goStep: (flowId, stepId) => {
        const flow = Utils.el(flowId);
        if (!flow) return;
        flow.querySelectorAll('.flow-step').forEach((s) => s.classList.remove('step-active'));
        Utils.el(stepId).classList.add('step-active');
    },

    openSheet: () => {
        const uploadContainer = Utils.el('page-container-upload');
        if (uploadContainer) { uploadContainer.style.display = 'block'; uploadContainer.style.pointerEvents = 'auto'; }
        const backdrop = Utils.el('upload-backdrop');
        const sheet = Utils.el('upload-sheet');
        if (backdrop && sheet) {
            backdrop.style.display = 'flex';
            void backdrop.offsetWidth;
            backdrop.classList.add('active');
            sheet.classList.add('active');
            Router.addBackState('upload-sheet');
        }
    },

    closeSheet: () => {
        const backdrop = Utils.el('upload-backdrop');
        const sheet = Utils.el('upload-sheet');
        if (backdrop && sheet) {
            backdrop.classList.remove('active');
            sheet.classList.remove('active');
            setTimeout(() => {
                backdrop.style.display = 'none';
                const anyFlowActive = document.querySelector('.upload-flow-layer.active');
                if (!anyFlowActive) {
                    const uploadContainer = Utils.el('page-container-upload');
                    if (uploadContainer) uploadContainer.style.display = 'none';
                }
            }, 300);
        }
    },

    openFlow: (type) => {
        const uploadContainer = Utils.el('page-container-upload');
        if (uploadContainer) { uploadContainer.style.display = 'block'; uploadContainer.style.pointerEvents = 'auto'; }

        UploadPage.closeSheet();
        UploadPage.type = type;
        UploadPage.activeFile = null;
        UploadPage.customThumbFile = null;
        UploadPage.autoThumbDataUrl = null;

        const flowId = `flow-${type}`;
        const flow = Utils.el(flowId);
        if (!flow) return;
        flow.classList.remove('flaynity-hidden');
        setTimeout(() => flow.classList.add('active'), 10);
        Router.addBackState('upload-flow');

        if (type === 'video') UploadPage.goStep('flow-video', 'step-video-grid');
        if (type === 'post') UploadPage.goStep('flow-post', 'step-post-grid');
        if (type === 'short') {
            UploadPage.goStep('flow-short', 'step-short-camera');
            ShortCamera.reset();
            ShortCamera.start();
        }
    },

    closeAll: () => {
        ['flow-video', 'flow-short', 'flow-post'].forEach((id) => {
            const el = Utils.el(id);
            if (el) { el.classList.remove('active'); setTimeout(() => el.classList.add('flaynity-hidden'), 300); }
        });
        Trimmer.teardown();
        ShortCamera.stopStream();
        ShortCamera.reset();
        UploadPage.resetForms();

        setTimeout(() => {
            const uploadContainer = Utils.el('page-container-upload');
            if (uploadContainer) uploadContainer.style.display = 'none';
        }, 300);
    },

    resetForms: () => {
        ['input-video-title', 'input-video-desc', 'input-short-title', 'input-short-desc', 'input-post-text'].forEach((id) => {
            const el = Utils.el(id);
            if (el) el.value = '';
        });
        UploadPage.videoFiles = [];
        UploadPage.postFiles = [];
        UploadPage.activeFile = null;
        UploadPage.customThumbFile = null;
        ['video-grid-list', 'post-grid-list'].forEach((id) => {
            const list = Utils.el(id);
            if (list) list.querySelectorAll('.gp-generated').forEach((n) => n.remove());
        });
        Utils.hide('video-preview-element');
        Utils.hide('post-image-preview');
        Utils.hide('video-thumb-custom-img');
        Utils.show('video-thumb-custom-icon');
    },

    // ---------- publish pipeline ----------
    publish: async (type) => {
        if (!State.channel) {
            UI.toast("Please create a channel first under 'You' tab.");
            UploadPage.closeAll();
            Router.switchTab('you');
            return;
        }

        let titleVal = '', descVal = '', catVal = 'Entertainment', textVal = '';
        let visVal = 'public', scheduledAt = null;
        let allowComments = true, hideLikes = false;

        if (type === 'video') {
            titleVal = Utils.el('input-video-title').value.trim();
            const titleOk = FormKit.validateRequired('input-video-title', 'video-title-error');
            if (!titleOk || !UploadPage.activeFile) return UI.toast('Video title and file are required.');
            descVal = Utils.el('input-video-desc').value.trim();
            catVal = Utils.el('input-video-category').value;
            visVal = FormKit.getVisibility('video-visibility-group');
            scheduledAt = visVal === 'scheduled' ? FormKit.getScheduledAt('input-video-schedule-date', 'input-video-schedule-time') : null;
            if (visVal === 'scheduled' && !scheduledAt) return UI.toast('Pick a valid schedule date & time.');
            allowComments = FormKit.isToggleOn('toggle-video-comments');
            hideLikes = FormKit.isToggleOn('toggle-video-hidelikes');
        } else if (type === 'short') {
            titleVal = Utils.el('input-short-title').value.trim();
            const titleOk = FormKit.validateRequired('input-short-title', 'short-title-error');
            if (!titleOk || !UploadPage.activeFile) return UI.toast('Short caption and video are required.');
            descVal = Utils.el('input-short-desc').value.trim();
            visVal = FormKit.getVisibility('short-visibility-group');
            scheduledAt = visVal === 'scheduled' ? FormKit.getScheduledAt('input-short-schedule-date', 'input-short-schedule-time') : null;
            if (visVal === 'scheduled' && !scheduledAt) return UI.toast('Pick a valid schedule date & time.');
            allowComments = FormKit.isToggleOn('toggle-short-comments');
            hideLikes = FormKit.isToggleOn('toggle-short-hidelikes');
        } else if (type === 'post') {
            textVal = Utils.el('input-post-text').value.trim();
            const textOk = FormKit.validateRequired('input-post-text', 'post-title-error');
            if (!textOk && !UploadPage.activeFile) return UI.toast('Post title or image is required.');
            visVal = FormKit.getVisibility('post-visibility-group');
            scheduledAt = visVal === 'scheduled' ? FormKit.getScheduledAt('input-post-schedule-date', 'input-post-schedule-time') : null;
            if (visVal === 'scheduled' && !scheduledAt) return UI.toast('Pick a valid schedule date & time.');
            allowComments = FormKit.isToggleOn('toggle-post-comments');
            hideLikes = FormKit.isToggleOn('toggle-post-hidelikes');
        }

        try {
            UI.showUploadProgress('Uploading media to Cloudflare R2...');

            let cdnVideoUrl = '', thumbnailUrl = '', imageUrl = '', durationFormatted = '0:00';

            if (type === 'video' || type === 'short') {
                cdnVideoUrl = await Services.uploadFile(UploadPage.activeFile, `${type}s/${State.user.uid}`, type === 'short' ? 'webm' : null);

                UI.showUploadProgress('Uploading thumbnail...');
                const thumbSource = UploadPage.customThumbFile || UploadPage.autoThumbBlob;
                if (thumbSource) {
                    thumbnailUrl = await Services.uploadFile(thumbSource, `thumbnails/${State.user.uid}`, 'jpg');
                }
                const meta = await StudioMedia.grabFrame(UploadPage.activeFile, 0);
                durationFormatted = Utils.formatDuration(type === 'video' ? (Trimmer.end - Trimmer.start) : meta.duration);
            } else if (type === 'post' && UploadPage.activeFile) {
                imageUrl = await Services.uploadFile(UploadPage.activeFile, `posts/${State.user.uid}`);
            }

            UI.showUploadProgress('Saving metadata to Realtime Database...');
            const metadata = {
                uid: State.user.uid,
                channelId: State.channel.id,
                channelName: State.channel.channelName,
                channelAvatar: State.channel.avatarUrl || '',
                cdnVideoUrl, thumbnailUrl: thumbnailUrl || cdnVideoUrl, imageUrl,
                title: titleVal, description: descVal, category: catVal, text: textVal,
                visibility: visVal, scheduledAt: scheduledAt,
                allowComments, hideLikes,
                duration: durationFormatted,
                trimStart: type === 'video' ? Trimmer.start : 0,
                trimEnd: type === 'video' ? Trimmer.end : 0,
                captureSpeed: type === 'short' ? UploadPage.shortCaptureSpeed : 1,
                views: 0, likes: 0, comments: 0,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };

            const targetRef = db.ref(`${type}s`).push();
            await targetRef.set(metadata);

            UI.updateUploadProgress(100);
            UI.hideUploadProgress();
            UI.toast(visVal === 'scheduled' ? 'Scheduled! It will go live automatically. \ud83d\udcc5' : 'Published successfully! \ud83d\ude80');
            UploadPage.closeAll();
            Router.switchTab(type === 'short' ? 'shorts' : 'home');
        } catch (error) {
            console.error('Publish Failed:', error);
            UI.hideUploadProgress();
            UI.toast('Upload failed: ' + (error.message || 'Network Error'));
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
            if (layer) {
                layer.classList.add('active');
                Router.addBackState('layer');
            }
        });

        onClick('btn-view-channel', () => {
            YouPage.openViewChannel();
            Router.addBackState('layer');
        });

        onClick('btn-open-edit-channel', () => {
            YouPage.openEditChannel();
            Router.addBackState('layer');
        });

        onClick('btn-open-analytics', () => {
            YouPage.loadAnalytics();
            const layer = Utils.el('layer-analytics');
            if (layer) {
                layer.classList.add('active');
                Router.addBackState('layer');
            }
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
                    Utils.el('preview-create-avatar').src = URL.createObjectURL(avatarFile);
                }
            };
        }

        onClick('btn-submit-create-channel', async () => {
            const name = Utils.el('input-create-name').value.trim();
            const handle = Utils.el('input-create-handle').value.trim().toLowerCase();

            if (!name || !handle) return UI.toast("Name and handle are required.");

            try {
                UI.showUploadProgress("Uploading Channel Avatar to R2...");
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
                    subscribersCount: 0,
                    totalViews: 0
                });

                UI.hideUploadProgress();
                UI.toast("Channel created successfully!");
                Utils.el('layer-create-channel').classList.remove('active');
            } catch (e) {
                UI.hideUploadProgress();
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
            Utils.hide('btn-create-channel');
            Utils.show('btn-view-channel');
        } else {
            Utils.show('btn-create-channel');
            Utils.hide('btn-view-channel');
        }
    },

    openViewChannel: () => {
        if (!State.channel) return;
        const layer = Utils.el('layer-view-channel');
        if (layer) layer.classList.add('active');

        const ch = State.channel;
        Utils.el('vc-avatar-img').src = ch.avatarUrl || State.user.photoURL;
        if (ch.bannerUrl) {
            Utils.el('vc-banner-img').src = ch.bannerUrl;
            Utils.show('vc-banner-img');
        }
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
                div.style.padding = '12px 0';
                div.style.borderBottom = '1px solid var(--flaynity-divider)';
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

// ==========================================
// 12. ROUTER & GLOBAL PERSISTENT NAVIGATION
// ==========================================
const Router = {
    pages: ['home', 'shorts', 'upload', 'discover', 'you'],
    history: ['home'],

    fetchPages: async () => {
        const appRoot = document.getElementById('app');
        for (const page of Router.pages) {
            const response = await fetch(`pages/${page}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load component: pages/${page}.html (Status: ${response.status})`);
            }
            const html = await response.text();

            if (html.includes('<title>Flaynity</title>')) {
                throw new Error(`Server returned index.html for pages/${page}.html. Ensure the 'pages' directory is uploaded.`);
            }

            const container = document.createElement('div');
            container.id = `page-container-${page}`;
            container.style.cssText = `width:100%;height:100%;position:absolute;top:0;left:0;display:${page === 'home' ? 'block' : 'none'};`;
            container.innerHTML = html;
            appRoot.appendChild(container);
        }

        // Global Bottom Navigation mount
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

// Android Native Back Action Listener
window.app = {
    executeBackAction: () => {
        const watchPage = Utils.el('flaynity-watch-page');
        const uploadSheet = Utils.el('upload-sheet');

        if (watchPage && watchPage.classList.contains('active')) {
            Player.close();
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

        const activeLayers = document.querySelectorAll('.upload-flow-layer.active, .you-sub-layer.active');
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
    bootstrap: async () => {
        if (State.isBootstrapped) return;
        State.isBootstrapped = true;

        const splashFailsafe = setTimeout(() => {
            const splash = Utils.el('flaynity-splash');
            if (splash && !splash.classList.contains('flaynity-hidden')) {
                console.warn("[Failsafe] Dismissing splash screen automatically.");
                Utils.hide('flaynity-splash');
                if (!State.user) Utils.show('flaynity-auth');
            }
        }, 2500);

        try {
            if (typeof firebase === 'undefined') {
                throw new Error("Firebase SDK is not available. Please verify network connectivity.");
            }

            // 1. Fetch Page Templates & Mount Navigation
            await Router.fetchPages();

            // 2. Initialize R2 & Database Services
            Services.init();

            // 3. Initialize Controller Hubs
            HomeFeed.init();
            Player.init();
            ShortsPlayer.init();
            UploadPage.init();
            DiscoverPage.init();
            YouPage.init();
            Router.bindGlobalNavigation();

            // 4. Network Listeners
            window.addEventListener('offline', () => {
                State.online = false;
                Utils.show('flaynity-offline');
            });

            window.addEventListener('online', () => {
                State.online = true;
                Utils.hide('flaynity-offline');
            });

            onClick('btn-retry-network', () => {
                if (window.AndroidBridge && typeof AndroidBridge.retryConnection === 'function') {
                    AndroidBridge.retryConnection();
                } else if (navigator.onLine) {
                    State.online = true;
                    Utils.hide('flaynity-offline');
                }
            });

            // 5. Initialize Auth Engine
            AuthSystem.init();
            Visibility.startAutoRevealTicker();

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

    // ⚡ INSTANT REALTIME LISTENER PIPELINE (<2s auto refresh)
    startRealtimeListeners: () => {
        // Realtime Long Videos Listener
        Services.addListener('videos', 'videos', (snap) => {
            const data = snap.val() || {};
            State.cache.videos = Object.keys(data).map((k) => ({ id: k, ...data[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            
            // Automatic instant update across screens
            HomeFeed.render();
            if (State.currentTab === 'you' && State.channel) {
                YouPage.renderChannelContent('videos');
            }
            if (Player.currentVideoData) {
                Player.loadRecommended(Player.currentVideoData.id);
            }
        });

        // Realtime Shorts Listener
        Services.addListener('shorts', 'shorts', (snap) => {
            const data = snap.val() || {};
            State.cache.shorts = Object.keys(data).map((k) => ({ id: k, ...data[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            
            HomeFeed.render();
            ShortsPlayer.render();
            if (State.currentTab === 'you' && State.channel) {
                YouPage.renderChannelContent('shorts');
            }
        });

        // Realtime Community Posts Listener
        Services.addListener('posts', 'posts', (snap) => {
            const data = snap.val() || {};
            State.cache.posts = Object.keys(data).map((k) => ({ id: k, ...data[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            
            HomeFeed.render();
            if (State.currentTab === 'you' && State.channel) {
                YouPage.renderChannelContent('posts');
            }
        });
    }
};

// ==========================================
// 14. MULTI-PLATFORM DOM BOOTSTRAP TRIGGER
// ==========================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.bootstrap());
} else {
    App.bootstrap();
}
