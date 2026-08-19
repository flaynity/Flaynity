// ==========================================
// 1. CONFIGURATION & GLOBAL APP STATE
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
        if (target) {
            target.classList.remove('flaynity-hidden', 'f-hidden-input');
            target.style.display = '';
        }
    },

    hide: (id) => {
        const target = Utils.el(id);
        if (target) {
            target.classList.add('flaynity-hidden');
            target.style.display = 'none';
        }
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

    generateVideoThumbnailFrames: (file, outputWidth = 640, canvasTrackId = null) => {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;

            let duration = 0;

            video.onloadeddata = async () => {
                duration = video.duration || 0;
                
                if (canvasTrackId && duration > 0) {
                    const track = Utils.el(canvasTrackId);
                    if (track) {
                        track.innerHTML = '';
                        const frameCount = 8;
                        for (let i = 0; i < frameCount; i++) {
                            const seekTime = (duration / frameCount) * i;
                            video.currentTime = seekTime;
                            await new Promise((r) => { video.onseeked = r; });

                            const canvas = document.createElement('canvas');
                            canvas.height = 64;
                            canvas.width = (video.videoWidth / video.videoHeight) * 64 || 64;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            track.appendChild(canvas);
                        }
                    }
                }

                video.currentTime = Math.min(1, duration / 2 || 0);
            };

            video.onseeked = () => {
                const canvas = document.createElement('canvas');
                canvas.width = outputWidth;
                canvas.height = (video.videoHeight / video.videoWidth) * outputWidth || (outputWidth * 9 / 16);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    const thumbUrl = blob ? URL.createObjectURL(blob) : '';
                    URL.revokeObjectURL(video.src);
                    resolve({ blob, dur: duration, url: thumbUrl });
                }, 'image/jpeg', 0.85);
            };

            video.onerror = () => {
                URL.revokeObjectURL(video.src);
                resolve({ blob: null, dur: 0, url: '' });
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
            bottom: calc(var(--bottom-nav-height, 60px) + 24px + var(--safe-area-bottom, 16px));
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
    }
};

// ==========================================
// 3. CLOUDFLARE R2 OBJECT STORAGE ENGINE
// ==========================================
let auth, db, s3Client;

const Services = {
    init: () => {
        if (!window.firebase) {
            throw new Error("Firebase SDK is not available.");
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

    uploadResilientFile: (fileOrBlob, folderPath, statusCb) => {
        return new Promise((resolve, reject) => {
            if (!s3Client) {
                return reject(new Error("Cloudflare R2 Client is uninitialized."));
            }

            let extension = 'mp4';
            if (fileOrBlob.name) {
                extension = fileOrBlob.name.split('.').pop();
            } else if (fileOrBlob.type) {
                extension = fileOrBlob.type.split('/')[1] || 'bin';
            }

            const uniqueKey = `${folderPath}/${Date.now()}_${Math.random().toString(36).substring(5)}.${extension}`;

            const uploadParams = {
                Bucket: CONFIG.r2.bucket,
                Key: uniqueKey,
                Body: fileOrBlob,
                ContentType: fileOrBlob.type || 'application/octet-stream'
            };

            const uploadRequest = s3Client.upload(uploadParams, { partSize: 5 * 1024 * 1024, queueSize: 1 });

            uploadRequest.on('httpUploadProgress', (event) => {
                if (event.total && statusCb) {
                    const percentage = (event.loaded / event.total) * 100;
                    statusCb(percentage, event.loaded, event.total);
                }
            });

            uploadRequest.send((err, data) => {
                if (err) {
                    console.error("Cloudflare R2 Upload Error:", err);
                    reject(err);
                } else {
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
                <div style="padding: 60px 20px; text-align: center; color: var(--flaynity-text-secondary, #888);">
                    <span class="material-symbols-outlined" style="font-size: 56px; margin-bottom: 12px;">video_library</span>
                    <h3 style="font-size: 18px; margin-bottom: 6px; color: var(--flaynity-text, #111);">No Content Yet</h3>
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
            <div class="lv-thumbnail-box" style="position:relative; width:100%; aspect-ratio:16/9; background:#000; overflow:hidden;">
                <img src="${data.thumbnailUrl || data.cdnVideoUrl}" loading="lazy" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
                <div class="lv-duration" style="position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.8); color:#fff; padding:2px 6px; border-radius:4px; font-size:12px; font-weight:600;">${data.duration || '0:00'}</div>
            </div>
            <div class="lv-info-row" style="display:flex; gap:12px; padding:12px 16px;">
                <img class="lv-avatar" src="${data.channelAvatar || 'https://via.placeholder.com/40'}" style="width:38px; height:38px; border-radius:50%; object-fit:cover;">
                <div class="lv-text" style="flex:1; overflow:hidden;">
                    <div class="lv-title" style="font-size:15px; font-weight:600; line-height:1.3; margin-bottom:4px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${Utils.secureText(data.title)}</div>
                    <div class="lv-meta" style="font-size:12px; color:var(--flaynity-text-secondary, #606060);">${Utils.secureText(data.channelName)} • ${Utils.formatViews(data.views || 0)} views • ${Utils.timeAgo(data.createdAt)}</div>
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
            <div class="shorts-grid-header" style="display:flex; align-items:center; gap:8px; padding:16px; font-size:18px; font-weight:700;">
                <span class="material-symbols-outlined" style="color:var(--flaynity-accent, #0556F3);">app_shortcut</span> Shorts
            </div>
            <div class="s-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; padding:0 16px 16px;">
        `;

        shortsBatch.forEach((item) => {
            html += `
                <div class="s-card" data-id="${item.id}" style="position:relative; aspect-ratio:9/16; border-radius:12px; overflow:hidden; background:#000; cursor:pointer;">
                    <img src="${item.thumbnailUrl || item.cdnVideoUrl}" loading="lazy" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
                    <div class="s-card-title" style="position:absolute; bottom:8px; left:8px; right:8px; color:#fff; font-size:12px; font-weight:600; text-shadow:0 1px 3px rgba(0,0,0,0.8); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${Utils.secureText(item.title)}</div>
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
        card.style.cssText = `padding:16px; border-bottom:1px solid var(--flaynity-divider, #e5e5e5);`;

        const isLiked = State.cache.userReactions[data.id] !== undefined;

        card.innerHTML = `
            <div class="post-header" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                <img class="post-avatar" src="${data.channelAvatar || 'https://via.placeholder.com/40'}" style="width:38px; height:38px; border-radius:50%; object-fit:cover;">
                <div style="flex:1;">
                    <div class="post-user" style="font-weight:600; font-size:14px;">${Utils.secureText(data.channelName)}</div>
                    <div class="post-time" style="font-size:12px; color:var(--flaynity-text-secondary, #606060);">${Utils.timeAgo(data.createdAt)}</div>
                </div>
            </div>
            <div class="post-text" style="font-size:14px; line-height:1.4; margin-bottom:12px; white-space:pre-line;">${Utils.secureText(data.text || '')}</div>
            ${data.imageUrl ? `<div class="post-image-grid" style="border-radius:12px; overflow:hidden; margin-bottom:12px; aspect-ratio:4/5;"><img src="${data.imageUrl}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"></div>` : ''}
            <div class="post-stats" style="display:flex; justify-content:space-between; font-size:12px; color:var(--flaynity-text-secondary, #606060); margin-bottom:12px;">
                <div class="post-reactions-icons">
                    <span class="reaction-preview">❤️ 👍</span> <span class="reaction-count">${Utils.formatViews(data.likes || 0)}</span>
                </div>
                <div>${Utils.formatViews(data.comments || 0)} comments</div>
            </div>
            <div class="post-actions" style="display:flex; border-top:1px solid var(--flaynity-divider, #e5e5e5); padding-top:8px;">
                <div class="p-action-btn like-action-btn ${isLiked ? 'active' : ''}" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; font-size:13px; font-weight:600; cursor:pointer; padding:8px 0; color:${isLiked ? 'var(--flaynity-accent, #0556F3)' : 'inherit'};">
                    <span class="material-symbols-outlined" style="font-size:18px;">${isLiked ? 'favorite' : 'thumb_up'}</span> Like
                </div>
                <div class="p-action-btn comment-action-btn" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; font-size:13px; font-weight:600; cursor:pointer; padding:8px 0;">
                    <span class="material-symbols-outlined" style="font-size:18px;">chat_bubble</span> Comment
                </div>
                <div class="p-action-btn share-action-btn" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; font-size:13px; font-weight:600; cursor:pointer; padding:8px 0;">
                    <span class="material-symbols-outlined" style="font-size:18px;">share</span> Share
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

        if (Utils.el('wp-title')) Utils.el('wp-title').innerText = videoData.title;
        if (Utils.el('wp-stats')) Utils.el('wp-stats').innerText = `${Utils.formatViews(videoData.views || 0)} views • ${Utils.timeAgo(videoData.createdAt)}`;
        if (Utils.el('wp-channel-handle')) Utils.el('wp-channel-handle').innerText = videoData.channelName;
        if (Utils.el('wp-like-count')) Utils.el('wp-like-count').innerText = Utils.formatViews(videoData.likes || 0);
        if (Utils.el('wp-channel-avatar')) {
            Utils.el('wp-channel-avatar').src = videoData.channelAvatar || 'https://via.placeholder.com/36';
            Utils.show('wp-channel-avatar');
        }

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
            if (btn) {
                btn.innerText = "Subscribe";
                btn.style.background = "var(--flaynity-text, #111)";
                btn.style.color = "var(--flaynity-bg, #fff)";
            }
            UI.toast("Unsubscribed");
        } else {
            await subRef.set(true);
            await channelSubsCountRef.transaction((count) => (count || 0) + 1);
            if (btn) {
                btn.innerText = "Subscribed";
                btn.style.background = "var(--flaynity-skeleton, #eee)";
                btn.style.color = "var(--flaynity-text, #111)";
            }
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
            card.style.cssText = `position:relative; width:100%; height:100%; scroll-snap-align:start; background:#000; overflow:hidden;`;

            card.innerHTML = `
                <video class="short-video-element" src="${s.cdnVideoUrl}" loop playsinline preload="auto" style="width:100%;height:100%;object-fit:cover;"></video>
                <div class="short-ui-overlay" style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:space-between; padding:16px; padding-bottom:calc(70px + var(--safe-area-bottom, 16px)); pointer-events:none;">
                    <div style="height:40px;"></div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; pointer-events:auto;">
                        <div class="short-bottom-details" style="flex:1; margin-right:16px; color:#fff;">
                            <div class="short-channel-row" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                <img src="${s.channelAvatar || 'https://via.placeholder.com/36'}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                                <span class="short-handle" style="font-weight:700;font-size:14px;">${Utils.secureText(s.channelName)}</span>
                            </div>
                            <div class="short-title-text" style="font-size:14px; text-shadow:0 1px 3px rgba(0,0,0,0.8);">${Utils.secureText(s.title)}</div>
                        </div>
                        <div class="short-actions-sidebar" style="display:flex; flex-direction:column; gap:20px; align-items:center; color:#fff;">
                            <div class="s-action-btn like-btn" style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                                <span class="material-symbols-outlined" style="font-size:28px;">favorite</span>
                                <span class="count" style="font-size:12px; font-weight:600;">${Utils.formatViews(s.likes || 0)}</span>
                            </div>
                            <div class="s-action-btn comment-btn" style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                                <span class="material-symbols-outlined" style="font-size:28px;">chat</span>
                                <span class="count" style="font-size:12px; font-weight:600;">${Utils.formatViews(s.comments || 0)}</span>
                            </div>
                            <div class="s-action-btn share-btn" style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                                <span class="material-symbols-outlined" style="font-size:28px;">share</span>
                                <span class="count" style="font-size:12px; font-weight:600;">Share</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            let lastTap = 0;
            card.addEventListener('click', (e) => {
                if (e.target.closest('.short-actions-sidebar')) return;

                const now = new Date().getTime();
                const delta = now - lastTap;

                if (delta < 300 && delta > 0) {
                    Utils.vibrate(60);
                    const heartIcon = card.querySelector('.like-btn .material-symbols-outlined');
                    heartIcon.style.color = 'var(--flaynity-accent, #0556F3)';
                    heartIcon.style.transform = 'scale(1.4)';
                    setTimeout(() => heartIcon.style.transform = 'scale(1)', 250);

                    db.ref(`shorts/${s.id}/likes`).transaction((count) => (count || 0) + 1);
                } else {
                    const video = card.querySelector('video');
                    if (video.paused) {
                        video.play();
                    } else {
                        video.pause();
                    }
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
// 9. PREMIUM M3 STUDIO & UPLOAD ENGINE
// ==========================================
let studioActiveData = { type: null, sourceFile: null, finalThumbBlob: null, durationMeta: "0:00", activeFilters: 0 };

const UploadEngineUI = {
    openSelectorSheet: () => {
        const container = Utils.el('page-container-upload');
        if (container) {
            container.style.display = 'block';
        }
        const root = Utils.el('f-upload-system-root');
        if (root) root.style.pointerEvents = 'auto';

        const backdrop = Utils.el('f-sheet-backdrop');
        if (backdrop) {
            backdrop.classList.add('active');
            Router.addBackState('f-sheet-backdrop');
        }
    },

    closeAllLayers: () => {
        const backdrop = Utils.el('f-sheet-backdrop');
        if (backdrop) backdrop.classList.remove('active');
        document.querySelectorAll('.f-up-flow-layer').forEach((l) => l.classList.remove('active'));
        
        setTimeout(() => {
            const root = Utils.el('f-upload-system-root');
            if (root) root.style.pointerEvents = 'none';
            const anyFlowActive = document.querySelector('.f-up-flow-layer.active');
            if (!anyFlowActive) {
                const container = Utils.el('page-container-upload');
                if (container && State.currentTab !== 'upload') {
                    // keep mounted transparently for next click
                }
            }
        }, 300);

        CameraStudio.shutdown();
        studioActiveData = { type: null, sourceFile: null, finalThumbBlob: null, durationMeta: "0:00", activeFilters: 0 };
        const vidNode = Utils.el('f-video-element');
        if (vidNode) {
            vidNode.pause();
            vidNode.src = '';
        }
    },

    goto: (id) => {
        const container = Utils.el('page-container-upload');
        if (container) container.style.display = 'block';
        const root = Utils.el('f-upload-system-root');
        if (root) root.style.pointerEvents = 'auto';

        document.querySelectorAll('.f-up-flow-layer').forEach((l) => l.classList.remove('active'));
        const target = Utils.el(id);
        if (target) {
            target.classList.add('active');
            Router.addBackState(id);
        }
    },

    handleVideoSelection: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        studioActiveData.type = 'video';
        studioActiveData.sourceFile = file;

        const url = URL.createObjectURL(file);
        const vidNode = Utils.el('f-video-element');
        if (vidNode) {
            vidNode.src = url;
            vidNode.load();
        }

        UploadEngineUI.goto('flow-layer-video-preview');
        const backdrop = Utils.el('f-sheet-backdrop');
        if (backdrop) backdrop.classList.remove('active');

        const metadata = await Utils.generateVideoThumbnailFrames(file, 640, 'f-canvas-frames');
        studioActiveData.finalThumbBlob = metadata.blob;
        studioActiveData.durationMeta = Utils.formatDuration(metadata.dur);

        if (Utils.el('f-video-details-filename')) Utils.el('f-video-details-filename').innerText = file.name || "Upload Video";
        if (Utils.el('f-thumb-duration')) Utils.el('f-thumb-duration').innerText = studioActiveData.durationMeta;
        if (metadata.url && Utils.el('f-detail-thumb-preview')) Utils.el('f-detail-thumb-preview').src = metadata.url;

        if (vidNode) vidNode.play().catch(() => {});
    },

    toggleVideoPlay: () => {
        const v = Utils.el('f-video-element');
        const btn = Utils.el('f-vid-play-pause');
        if (!v) return;
        if (v.paused) {
            v.play();
            if (btn) btn.innerHTML = `<span class="material-symbols-outlined">pause</span>`;
        } else {
            v.pause();
            if (btn) btn.innerHTML = `<span class="material-symbols-outlined">play_arrow</span>`;
        }
    },

    goToDetails: (typeFlow) => {
        if (typeFlow === 'video') {
            const vid = Utils.el('f-video-element');
            if (vid) vid.pause();
            UploadEngineUI.goto('flow-layer-video-details');
        } else if (typeFlow === 'short') {
            UploadEngineUI.goto('flow-layer-short-details');
        }
    },

    openShortCamera: async () => {
        const backdrop = Utils.el('f-sheet-backdrop');
        if (backdrop) backdrop.classList.remove('active');
        studioActiveData.type = 'short';
        UploadEngineUI.goto('flow-layer-short-camera');
        
        const success = await CameraStudio.init();
        if (!success) {
            const picker = Utils.el('f-native-short-picker');
            if (picker) picker.click();
            UploadEngineUI.closeAllLayers();
        }
    },

    handleShortGallery: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        studioActiveData.type = 'short';
        studioActiveData.sourceFile = file;

        const metadata = await Utils.generateVideoThumbnailFrames(file, 320);
        studioActiveData.finalThumbBlob = metadata.blob;
        studioActiveData.durationMeta = Utils.formatDuration(metadata.dur);
        if (metadata.url && Utils.el('f-short-detail-preview')) Utils.el('f-short-detail-preview').src = metadata.url;

        CameraStudio.shutdown();
        UploadEngineUI.goto('flow-layer-short-details');
    },

    applyNextFilter: () => {
        studioActiveData.activeFilters++;
        const filters = ['none', 'grayscale(1)', 'sepia(0.8)', 'contrast(1.5) saturate(1.5)', 'invert(0.1) hue-rotate(180deg)'];
        const vid = Utils.el('f-video-element');
        if (vid) vid.style.filter = filters[studioActiveData.activeFilters % filters.length];
        Utils.vibrate();
    },

    applyNextFilterCamera: () => {
        studioActiveData.activeFilters++;
        const filters = ['none', 'contrast(1.2)', 'sepia(1)', 'hue-rotate(45deg) saturate(2)', 'saturate(0.5)'];
        const cam = Utils.el('f-camera-feed');
        if (cam) cam.style.filter = filters[studioActiveData.activeFilters % filters.length];
        Utils.vibrate();
    },

    toggleVolume: () => {
        const v = Utils.el('f-video-element');
        if (v) {
            v.muted = !v.muted;
            Utils.vibrate();
        }
    },

    setCustomThumb: (e, idTarget = 'f-detail-thumb-preview') => {
        const file = e.target.files[0];
        if (file) {
            studioActiveData.finalThumbBlob = file;
            const preview = Utils.el(idTarget);
            if (preview) preview.src = URL.createObjectURL(file);
        }
    },

    updateCharCount: (elem, max, idLabel) => {
        const len = elem.value.length;
        if (len > max) {
            elem.value = elem.value.substring(0, max);
        }
        const label = Utils.el(idLabel);
        if (label) label.innerText = `${Math.min(len, max)} / ${max}`;
    },

    openPostSystem: () => {
        const backdrop = Utils.el('f-sheet-backdrop');
        if (backdrop) backdrop.classList.remove('active');
        UploadEngineUI.goto('flow-layer-post');
    },

    handlePostImage: (e) => {
        const file = e.target.files[0];
        if (file) {
            studioActiveData.type = 'post';
            studioActiveData.sourceFile = file;
            const preview = Utils.el('f-post-image-preview');
            if (preview) {
                preview.src = URL.createObjectURL(file);
                preview.style.display = 'block';
            }
        }
    }
};

// ==========================================
// 10. WEBRTC CAMERA STUDIO (SHORTS RECORDER)
// ==========================================
const CameraStudio = {
    stream: null,
    mediaRecorder: null,
    recordedChunks: [],
    recording: false,
    faceMode: 'user',
    flashEnabled: false,

    init: async () => {
        try {
            if (CameraStudio.stream) {
                CameraStudio.stream.getTracks().forEach((t) => t.stop());
            }
            const videoOptions = { facingMode: CameraStudio.faceMode };
            if (CameraStudio.faceMode === 'environment') {
                videoOptions.advanced = [{ torch: CameraStudio.flashEnabled }];
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: videoOptions, audio: true });
            CameraStudio.stream = stream;
            const feed = Utils.el('f-camera-feed');
            if (feed) feed.srcObject = stream;
            return true;
        } catch (e) {
            console.error("Camera access failed:", e);
            UI.toast("Camera permission required.");
            return false;
        }
    },

    flipCamera: async () => {
        CameraStudio.faceMode = CameraStudio.faceMode === 'user' ? 'environment' : 'user';
        Utils.vibrate();
        await CameraStudio.init();
    },

    toggleFlash: async () => {
        CameraStudio.flashEnabled = !CameraStudio.flashEnabled;
        Utils.vibrate();
        const flashBtn = Utils.el('f-cam-flash');
        if (flashBtn) flashBtn.classList.toggle('active');
        await CameraStudio.init();
    },

    startHoldRecording: () => {
        if (!CameraStudio.stream) return;
        Utils.vibrate(60);
        CameraStudio.recording = true;
        CameraStudio.recordedChunks = [];

        const recBtn = Utils.el('f-btn-record');
        const ring = Utils.el('f-record-ring');
        if (recBtn) recBtn.classList.add('recording');
        if (ring) ring.classList.add('f-cam-progress-active');

        try {
            CameraStudio.mediaRecorder = new MediaRecorder(CameraStudio.stream, { mimeType: 'video/mp4' });
        } catch (e) {
            CameraStudio.mediaRecorder = new MediaRecorder(CameraStudio.stream);
        }

        CameraStudio.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) CameraStudio.recordedChunks.push(e.data);
        };
        CameraStudio.mediaRecorder.start();
    },

    stopHoldRecording: () => {
        if (!CameraStudio.recording || !CameraStudio.mediaRecorder) return;
        CameraStudio.recording = false;
        Utils.vibrate(30);

        const recBtn = Utils.el('f-btn-record');
        const ring = Utils.el('f-record-ring');
        if (recBtn) recBtn.classList.remove('recording');
        if (ring) ring.classList.remove('f-cam-progress-active');

        CameraStudio.mediaRecorder.stop();
        const nextTrig = Utils.el('f-short-next-trigger');
        if (nextTrig) {
            nextTrig.style.opacity = '1';
            nextTrig.style.pointerEvents = 'auto';
        }
    },

    finishRecording: async () => {
        const blob = new Blob(CameraStudio.recordedChunks, { type: 'video/mp4' });
        studioActiveData.sourceFile = blob;

        const metadata = await Utils.generateVideoThumbnailFrames(blob, 320);
        studioActiveData.finalThumbBlob = metadata.blob;
        studioActiveData.durationMeta = Utils.formatDuration(metadata.dur);
        if (metadata.url && Utils.el('f-short-detail-preview')) Utils.el('f-short-detail-preview').src = metadata.url;

        CameraStudio.shutdown();
        UploadEngineUI.goto('flow-layer-short-details');
    },

    shutdown: () => {
        if (CameraStudio.stream) {
            CameraStudio.stream.getTracks().forEach((t) => t.stop());
            CameraStudio.stream = null;
            const feed = Utils.el('f-camera-feed');
            if (feed) feed.srcObject = null;
        }
    }
};

// ==========================================
// 11. PUBLISHING ENGINE (R2 + REALTIME DB)
// ==========================================
const UploadManager = {
    toggleStatusPanel: (state, title, desc, spinning = false) => {
        const panel = Utils.el('f-engine-status');
        if (!panel) return;
        if (!state) {
            panel.classList.remove('show');
            return;
        }
        if (Utils.el('f-eng-ttl')) Utils.el('f-eng-ttl').innerText = title;
        if (Utils.el('f-eng-sub')) Utils.el('f-eng-sub').innerText = desc;
        panel.classList.add('show');
    },

    triggerPublish: async (ctxMode) => {
        if (!State.user) {
            UI.toast("Please log in first.");
            return;
        }
        if (!State.channel) {
            UI.toast("Please create a channel first under 'You' tab.");
            Router.switchTab('you');
            UploadEngineUI.closeAllLayers();
            return;
        }

        let fdTitle = '';
        let fdDesc = '';
        let fdCat = 'Entertainment';
        let fdVis = 'public';

        if (ctxMode === 'video') {
            fdTitle = Utils.el('f-inp-video-title').value.trim();
            fdDesc = Utils.el('f-inp-video-desc').value.trim();
            fdCat = Utils.el('f-inp-video-cat').value;
            fdVis = Utils.el('f-inp-video-vis').value;
            if (!fdTitle || !studioActiveData.sourceFile) {
                return UI.toast("Title and video file are required.");
            }
        } else if (ctxMode === 'short') {
            fdTitle = Utils.el('f-inp-short-title').value.trim();
            fdVis = Utils.el('f-inp-short-vis').value;
            if (!fdTitle || !studioActiveData.sourceFile) {
                return UI.toast("Caption and video are required.");
            }
        } else if (ctxMode === 'post') {
            fdDesc = Utils.el('f-post-text-area').value.trim();
            if (!fdDesc && !studioActiveData.sourceFile) {
                return UI.toast("Text or image is required to post.");
            }
        }

        UploadEngineUI.closeAllLayers();
        UploadManager.toggleStatusPanel(true, "Preparing...", "Connecting to Cloudflare R2", true);

        try {
            let r2ThumbUrl = '';
            let r2MediaUrl = '';

            if (studioActiveData.finalThumbBlob) {
                UploadManager.toggleStatusPanel(true, "Uploading Thumbnail...", "Cloudflare Object Storage", true);
                r2ThumbUrl = await Services.uploadResilientFile(studioActiveData.finalThumbBlob, `thumbnails/${State.user.uid}`);
            }

            if (studioActiveData.sourceFile) {
                UploadManager.toggleStatusPanel(true, `Uploading ${ctxMode.toUpperCase()}...`, "Streaming chunks to R2", true);
                r2MediaUrl = await Services.uploadResilientFile(studioActiveData.sourceFile, `${ctxMode}s/${State.user.uid}`, (pct, loaded, total) => {
                    UploadManager.toggleStatusPanel(true, `Uploading ${Math.round(pct)}%`, `${(loaded / (1024 * 1024)).toFixed(1)}MB / ${(total / (1024 * 1024)).toFixed(1)}MB`, true);
                });
            }

            UploadManager.toggleStatusPanel(true, "Saving Details...", "Syncing Firebase Database", true);

            const metadataBlock = {
                uid: State.user.uid,
                channelId: State.channel.id,
                channelName: State.channel.channelName,
                channelAvatar: State.channel.avatarUrl || '',
                cdnVideoUrl: ctxMode === 'post' ? null : r2MediaUrl,
                imageUrl: ctxMode === 'post' ? r2MediaUrl : null,
                thumbnailUrl: r2ThumbUrl || r2MediaUrl,
                title: ctxMode !== 'post' ? fdTitle : null,
                description: fdDesc || '',
                text: fdDesc || '',
                category: fdCat || 'Entertainment',
                visibility: fdVis || 'public',
                duration: studioActiveData.durationMeta || "0:00",
                views: 0,
                likes: 0,
                comments: 0,
                status: 'published',
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };

            const targetRef = db.ref(`${ctxMode}s`).push();
            await targetRef.set(metadataBlock);

            UploadManager.toggleStatusPanel(true, "Published Successfully! 🚀", "Visible across all feeds", false);
            setTimeout(() => UploadManager.toggleStatusPanel(false), 3000);

            Router.switchTab(ctxMode === 'short' ? 'shorts' : 'home');
        } catch (error) {
            console.error("Publish Error:", error);
            UploadManager.toggleStatusPanel(false);
            UI.toast("Upload failed: " + (error.message || "Network Error"));
        }

        studioActiveData = { type: null, sourceFile: null, finalThumbBlob: null, durationMeta: "0:00", activeFilters: 0 };
    }
};

// ==========================================
// 12. DISCOVER & SEARCH ENGINE
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
// 13. YOU / CHANNEL STUDIO & ANALYTICS
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
                let avatarUrl = State.user.photoURL || '';

                if (avatarFile) {
                    avatarUrl = await Services.uploadResilientFile(avatarFile, `avatars/${State.user.uid}`);
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
        if (Utils.el('vc-avatar-img')) Utils.el('vc-avatar-img').src = ch.avatarUrl || State.user.photoURL;
        if (ch.bannerUrl && Utils.el('vc-banner-img')) {
            Utils.el('vc-banner-img').src = ch.bannerUrl;
            Utils.show('vc-banner-img');
        }
        if (Utils.el('vc-name-text')) Utils.el('vc-name-text').innerText = ch.channelName;
        if (Utils.el('vc-handle-text')) Utils.el('vc-handle-text').innerText = ch.handle;
        if (Utils.el('vc-subs-text')) Utils.el('vc-subs-text').innerText = Utils.formatViews(ch.subscribersCount || 0);

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
            area.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--flaynity-text-secondary, #888);">No ${tabName} published yet.</div>`;
            return;
        }

        items.forEach((item) => {
            if (tabName === 'videos') area.appendChild(HomeFeed.buildVideoCard(item));
            else if (tabName === 'posts') area.appendChild(HomeFeed.buildPostCard(item));
            else {
                const div = document.createElement('div');
                div.style.padding = '12px 16px';
                div.style.borderBottom = '1px solid var(--flaynity-divider, #eee)';
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

        if (Utils.el('input-edit-name')) Utils.el('input-edit-name').value = ch.channelName || '';
        if (Utils.el('input-edit-handle')) Utils.el('input-edit-handle').value = ch.handle || '';
        if (Utils.el('input-edit-desc')) Utils.el('input-edit-desc').value = ch.description || '';
    }
};

// ==========================================
// 14. ROUTER & GLOBAL APP NAVIGATION
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

            const container = document.createElement('div');
            container.id = `page-container-${page}`;
            
            if (page === 'upload') {
                container.style.cssText = `width:100%;height:100%;position:absolute;top:0;left:0;z-index:3000;pointer-events:none;display:block;`;
            } else {
                container.style.cssText = `width:100%;height:100%;position:absolute;top:0;left:0;display:${page === 'home' ? 'block' : 'none'};`;
            }
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
        document.querySelectorAll('.nav-item, #btn-nav-upload, [data-tab="upload"]').forEach((el) => {
            el.addEventListener('click', (e) => {
                const targetNav = e.currentTarget;
                const tab = targetNav.dataset.tab || (targetNav.id === 'btn-nav-upload' ? 'upload' : null);
                if (tab === 'upload') {
                    UploadEngineUI.openSelectorSheet();
                } else if (tab) {
                    Router.switchTab(tab);
                }
            });
        });
    },

    switchTab: (tabName) => {
        if (tabName === 'upload') {
            UploadEngineUI.openSelectorSheet();
            return;
        }

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

// Android Native Back Button Interceptor
window.app = {
    executeBackAction: () => {
        const watchPage = Utils.el('flaynity-watch-page');
        const uploadSheet = Utils.el('f-sheet-backdrop');

        if (watchPage && watchPage.classList.contains('active')) {
            Player.close();
            Router.history.pop();
            Router.updateAndroidBackStack();
            return;
        }

        if (uploadSheet && uploadSheet.classList.contains('active')) {
            UploadEngineUI.closeAllLayers();
            Router.history.pop();
            Router.updateAndroidBackStack();
            return;
        }

        const activeLayers = document.querySelectorAll('.f-up-flow-layer.active, .you-sub-layer.active');
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
// 15. LIFECYCLE BOOTSTRAP & REALTIME HUB
// ==========================================
const App = {
    bootstrap: async () => {
        if (State.isBootstrapped) return;
        State.isBootstrapped = true;

        const splashFailsafe = setTimeout(() => {
            const splash = Utils.el('flaynity-splash');
            if (splash && !splash.classList.contains('flaynity-hidden')) {
                Utils.hide('flaynity-splash');
                if (!State.user) Utils.show('flaynity-auth');
            }
        }, 2500);

        try {
            if (typeof firebase === 'undefined') {
                throw new Error("Firebase SDK is not available.");
            }

            // 1. Fetch & Mount Page Templates
            await Router.fetchPages();

            // 2. Initialize Backend Services
            Services.init();

            // 3. Initialize Controller Hubs
            HomeFeed.init();
            Player.init();
            ShortsPlayer.init();
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

            // 5. Auth State Initialization
            AuthSystem.init();

            clearTimeout(splashFailsafe);
        } catch (error) {
            clearTimeout(splashFailsafe);
            console.error("App Bootstrap Failed:", error);

            const splash = document.getElementById('flaynity-splash');
            if (splash) {
                splash.innerHTML = `
                    <div style="padding: 24px; color: #ff3b30; text-align: center; background: #ffffff; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;">
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
        // Realtime Long Videos Listener
        Services.addListener('videos', 'videos', (snap) => {
            const data = snap.val() || {};
            State.cache.videos = Object.keys(data).map((k) => ({ id: k, ...data[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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
// 16. MULTI-PLATFORM DOM BOOTSTRAP TRIGGER
// ==========================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.bootstrap());
} else {
    App.bootstrap();
}
