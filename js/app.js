// ==========================================
// 1. CONFIGURATION & GLOBAL STATE
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
// 2. HIGH-PRECISION UTILITIES & THUMBNAILS
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
            if (count >= 1) return `${count} ${unit}${count > 1 ? 's' : ''} ago`;
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
        } catch (e) {}
    },

    secureText: (str) => {
        if (!str) return '';
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    },

    generateVideoThumbnail: (fileOrUrl, atSecond = 1, customRatio = '16:9') => {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
            video.muted = true;
            video.playsInline = true;

            video.onloadedmetadata = () => {
                video.currentTime = Math.min(atSecond, video.duration || 1);
            };

            video.onseeked = () => {
                const canvas = document.createElement('canvas');
                let width = 1280;
                let height = 720;

                if (customRatio === '9:16') {
                    width = 720;
                    height = 1280;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    const duration = video.duration || 0;
                    if (typeof fileOrUrl !== 'string') URL.revokeObjectURL(video.src);
                    resolve({ blob, duration, dataUrl: canvas.toDataURL('image/jpeg', 0.85) });
                }, 'image/jpeg', 0.9);
            };

            video.onerror = () => {
                if (typeof fileOrUrl !== 'string') URL.revokeObjectURL(video.src);
                resolve({ blob: null, duration: 0, dataUrl: '' });
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
            background: #222222;
            color: #ffffff;
            padding: 12px 24px;
            border-radius: 28px;
            z-index: 9999999;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 8px 24px rgba(0,0,0,0.6);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
            pointer-events: none;
            white-space: nowrap;
            border: 1px solid rgba(255,255,255,0.1);
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
        const title = Utils.el('upload-progress-status-text');
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
    if (el) el.onclick = callback;
};

// ==========================================
// 3. CLOUDFLARE R2 & FIREBASE SERVICES
// ==========================================
let auth, db, s3Client;

const Services = {
    init: () => {
        if (!window.firebase) throw new Error("Firebase SDK missing.");
        if (!firebase.apps.length) firebase.initializeApp(CONFIG.firebase);
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
            if (!s3Client) return reject(new Error("Cloudflare R2 is uninitialized."));

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
            uploadRequest.on('httpUploadProgress', (evt) => {
                if (evt.total) {
                    const percentage = (evt.loaded / evt.total) * 100;
                    UI.updateUploadProgress(percentage);
                }
            });

            uploadRequest.send((err) => {
                if (err) {
                    console.error("R2 Upload Error:", err);
                    reject(err);
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
    }
};

// ==========================================
// 4. AUTHENTICATION (FIXED BOTTOM NAV VISIBILITY)
// ==========================================
const AuthSystem = {
    init: () => {
        auth.onAuthStateChanged(async (user) => {
            Utils.hide('flaynity-splash');
            const bottomNav = Utils.el('flaynity-bottom-nav');

            if (user) {
                State.user = user;
                Utils.hide('flaynity-auth');
                Utils.show('flaynity-home-ui');
                if (bottomNav) bottomNav.style.display = 'flex'; // Show Bottom Nav for logged-in users
                await AuthSystem.syncUserProfile();
                App.startRealtimeListeners();
            } else {
                State.user = null;
                Utils.show('flaynity-auth');
                Utils.hide('flaynity-home-ui');
                if (bottomNav) bottomNav.style.display = 'none'; // Strictly Hide Bottom Nav on Sign-in screen
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
                    UI.toast("Sign in failed: " + error.message);
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
        auth.signInWithCredential(credential).catch((e) => UI.toast("Native Login Failed: " + e.message));
    } catch (e) {
        console.error(e);
    }
};

// ==========================================
// 5. HOME FEED ENGINE (COMPLETE & UNTOUCHED)
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
            State.cache.posts.forEach((post) => container.appendChild(HomeFeed.buildPostCard(post)));
        } else {
            HomeFeed.render();
        }
    },

    filterActivePublicItems: (list) => {
        const now = Date.now();
        return list.filter((item) => {
            if (item.visibility === 'private') {
                return State.user && item.uid === State.user.uid;
            }
            if (item.visibility === 'schedule') {
                if (item.scheduledAt && item.scheduledAt > now) {
                    return State.user && item.uid === State.user.uid;
                }
            }
            return true;
        });
    },

    render: () => {
        const container = Utils.el('home-feed-container');
        if (!container) return;
        container.innerHTML = '';

        const videos = HomeFeed.filterActivePublicItems(State.cache.videos);
        const shorts = HomeFeed.filterActivePublicItems(State.cache.shorts);
        const posts = HomeFeed.filterActivePublicItems(State.cache.posts);

        if (videos.length === 0 && shorts.length === 0 && posts.length === 0) {
            container.innerHTML = `
                <div style="padding: 60px 20px; text-align: center; color: var(--flaynity-text-secondary);">
                    <span class="material-symbols-outlined" style="font-size: 56px; margin-bottom: 12px;">video_library</span>
                    <h3 style="font-size: 18px; margin-bottom: 6px;">No Content Available</h3>
                    <p style="font-size: 13px;">Publish your first video, short or post!</p>
                </div>
            `;
            return;
        }

        let vIdx = 0, sIdx = 0, pIdx = 0, active = true;

        while (active) {
            let chunk = false;
            if (sIdx < shorts.length) {
                const batch = shorts.slice(sIdx, sIdx + 6);
                sIdx += 6;
                container.appendChild(HomeFeed.buildShortsGrid(batch));
                chunk = true;
            }
            if (vIdx < videos.length) {
                const batch = videos.slice(vIdx, vIdx + 10);
                vIdx += 10;
                batch.forEach((v) => container.appendChild(HomeFeed.buildVideoCard(v)));
                chunk = true;
            }
            if (pIdx < posts.length) {
                container.appendChild(HomeFeed.buildPostCard(posts[pIdx]));
                pIdx++;
                chunk = true;
            }
            if (!chunk) active = false;
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
            <div class="shorts-grid-header"><span class="material-symbols-outlined">app_shortcut</span> Shorts</div>
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
        section.querySelectorAll('.s-card').forEach((c) => {
            c.onclick = () => {
                Router.switchTab('shorts');
                ShortsPlayer.scrollTo(c.dataset.id);
            };
        });
        return section;
    },

    buildPostCard: (data) => {
        const card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = `
            <div class="post-header">
                <img class="post-avatar" src="${data.channelAvatar || 'https://via.placeholder.com/40'}">
                <div>
                    <div class="post-user">${Utils.secureText(data.channelName)}</div>
                    <div class="post-time">${Utils.timeAgo(data.createdAt)}</div>
                </div>
            </div>
            <div class="post-text">${Utils.secureText(data.text || data.title || '')}</div>
            ${data.imageUrl ? `<div class="post-image-grid count-1"><img src="${data.imageUrl}" loading="lazy" style="aspect-ratio:3/4;object-fit:cover;width:100%;border-radius:12px;"></div>` : ''}
            <div class="post-stats">
                <div>${Utils.formatViews(data.likes || 0)} likes</div>
                <div>${Utils.formatViews(data.comments || 0)} comments</div>
            </div>
        `;
        return card;
    }
};

// ==========================================
// 6. CINEMA VIDEO PLAYER & SHORTS STREAM
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

        videoEl.src = videoData.cdnVideoUrl;
        videoEl.play().catch(() => {});

        layer.classList.add('active');
        State.currentPlayingVideo = videoEl;
        Router.addBackState('watch-page');

        if (videoData.id) {
            db.ref(`videos/${videoData.id}/views`).transaction((count) => (count || 0) + 1);
        }
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
        if (!State.user || !Player.currentVideoData) return UI.toast("Log in to subscribe.");
        Utils.vibrate();
        const targetChannelId = Player.currentVideoData.channelId;
        const subRef = db.ref(`subscriptions/${targetChannelId}/${State.user.uid}`);
        const countRef = db.ref(`channels/${targetChannelId}/subscribersCount`);
        const snapshot = await subRef.once('value');

        if (snapshot.exists()) {
            await subRef.remove();
            await countRef.transaction((c) => Math.max((c || 1) - 1, 0));
            UI.toast("Unsubscribed");
        } else {
            await subRef.set(true);
            await countRef.transaction((c) => (c || 0) + 1);
            UI.toast("Subscribed!");
        }
    }
};

const ShortsPlayer = {
    observer: null,
    init: () => {
        const container = Utils.el('shorts-feed-container');
        if (!container) return;

        ShortsPlayer.observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const video = entry.target.querySelector('.short-video-element');
                if (!video) return;
                if (entry.isIntersecting) {
                    video.play().catch(() => {});
                    State.currentPlayingVideo = video;
                } else {
                    video.pause();
                    video.currentTime = 0;
                }
            });
        }, { threshold: 0.65 });
    },
    render: () => {
        const container = Utils.el('shorts-feed-container');
        if (!container) return;
        container.innerHTML = '';

        const shorts = HomeFeed.filterActivePublicItems(State.cache.shorts);
        shorts.forEach((s) => {
            const card = document.createElement('div');
            card.className = 'short-view-container';
            card.id = `short-view-${s.id}`;
            card.innerHTML = `
                <video class="short-video-element" src="${s.cdnVideoUrl}" loop playsinline preload="auto"></video>
                <div class="short-ui-overlay">
                    <div class="short-bottom-details">
                        <div class="short-channel-row">
                            <img src="${s.channelAvatar || 'https://via.placeholder.com/36'}">
                            <span class="short-handle">${Utils.secureText(s.channelName)}</span>
                        </div>
                        <div class="short-title-text">${Utils.secureText(s.title)}</div>
                    </div>
                </div>
            `;
            container.appendChild(card);
            ShortsPlayer.observer.observe(card);
        });
    },
    scrollTo: (id) => {
        const target = Utils.el(`short-view-${id}`);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    }
};

// ==========================================================================
// 7. PREMIUM UPLOAD STUDIO CONTROLLER (FIXED CAMERA TOOLS & OVERLAYS)
// ==========================================================================
const UploadStudio = {
    activeMode: 'video',
    activeFile: null,
    generatedThumbBlob: null,
    customThumbBlob: null,
    mediaDuration: 0,
    trimStartSec: 0,
    trimEndSec: 0,

    cameraStream: null,
    mediaRecorder: null,
    recordedChunks: [],
    facingMode: 'environment',
    recordTimerInterval: null,
    recordedTimeMs: 0,
    maxRecordTimeMs: 15000, // Default 15s
    isRecording: false,
    timerSeconds: 0,
    speedMultiplier: 1.0,
    filterIndex: 0,
    flashEnabled: false,

    filters: [
        { name: 'Normal', css: 'none' },
        { name: 'Vintage', css: 'sepia(0.6) contrast(1.15)' },
        { name: 'B&W', css: 'grayscale(1) contrast(1.2)' },
        { name: 'Vivid', css: 'saturate(1.8) contrast(1.15)' },
        { name: 'Warm', css: 'sepia(0.3) saturate(1.4)' },
        { name: 'Cyberpunk', css: 'hue-rotate(90deg) contrast(1.25)' }
    ],

    init: () => {
        // Mode Tabs
        const modeTabs = document.querySelectorAll('.mode-tab-item');
        modeTabs.forEach((tab) => {
            tab.onclick = () => {
                const targetMode = tab.dataset.mode;
                UploadStudio.switchMode(targetMode);
            };
        });

        // Close Buttons
        onClick('btn-close-studio-x', UploadStudio.close);
        onClick('btn-close-camera-x', UploadStudio.close);

        // Video Pick Triggers
        onClick('btn-browse-device-video', () => Utils.el('input-device-video-file').click());
        onClick('btn-trigger-picker-modal', () => Utils.el('input-device-video-file').click());

        const videoFileInput = Utils.el('input-device-video-file');
        if (videoFileInput) {
            videoFileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) UploadStudio.loadVideoFileForPreview(file);
            };
        }

        // Post Trigger
        onClick('btn-browse-post-image', () => Utils.el('input-device-post-file').click());
        const postFileInput = Utils.el('input-device-post-file');
        if (postFileInput) {
            postFileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) UploadStudio.loadPostImageForPreview(file);
            };
        }

        // Short Gallery Trigger
        onClick('btn-short-open-gallery', () => Utils.el('input-device-short-file').click());
        const shortFileInput = Utils.el('input-device-short-file');
        if (shortFileInput) {
            shortFileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) UploadStudio.loadShortVideoForPreview(file);
            };
        }

        // Custom Thumbnails
        onClick('btn-custom-thumb-video', () => Utils.el('input-custom-thumb-video').click());
        Utils.el('input-custom-thumb-video').onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                UploadStudio.customThumbBlob = file;
                Utils.el('video-details-thumb-preview').src = URL.createObjectURL(file);
            }
        };

        // Navigation Back/Next
        onClick('btn-back-video-preview', () => UploadStudio.hideSubLayer('layer-video-preview'));
        onClick('btn-next-video-details', () => {
            UploadStudio.hideSubLayer('layer-video-preview');
            UploadStudio.openSubLayer('layer-video-details');
        });
        onClick('btn-back-video-details', () => {
            UploadStudio.hideSubLayer('layer-video-details');
            UploadStudio.openSubLayer('layer-video-preview');
        });

        onClick('btn-back-short-preview', () => UploadStudio.hideSubLayer('layer-short-preview'));
        onClick('btn-next-short-details', () => {
            UploadStudio.hideSubLayer('layer-short-preview');
            UploadStudio.openSubLayer('layer-short-details');
        });
        onClick('btn-back-short-details', () => {
            UploadStudio.hideSubLayer('layer-short-details');
            UploadStudio.openSubLayer('layer-short-preview');
        });

        onClick('btn-back-post-preview', () => UploadStudio.hideSubLayer('layer-post-preview'));
        onClick('btn-next-post-details', () => {
            UploadStudio.hideSubLayer('layer-post-preview');
            UploadStudio.openSubLayer('layer-post-details');
        });
        onClick('btn-back-post-details', () => {
            UploadStudio.hideSubLayer('layer-post-details');
            UploadStudio.openSubLayer('layer-post-preview');
        });

        // Counters
        UploadStudio.bindCharacterCounter('input-v-title', 'video-title-counter', 100);
        UploadStudio.bindCharacterCounter('input-v-desc', 'video-desc-counter', 5000);
        UploadStudio.bindCharacterCounter('input-s-title', 'short-title-counter', 100);
        UploadStudio.bindCharacterCounter('input-p-title', 'post-title-counter', 1000);

        // Schedule Toggle
        Utils.el('select-v-visibility').onchange = (e) => {
            Utils.el('group-v-schedule').style.display = e.target.value === 'schedule' ? 'flex' : 'none';
        };
        Utils.el('select-s-visibility').onchange = (e) => {
            Utils.el('group-s-schedule').style.display = e.target.value === 'schedule' ? 'flex' : 'none';
        };
        Utils.el('select-p-visibility').onchange = (e) => {
            Utils.el('group-p-schedule').style.display = e.target.value === 'schedule' ? 'flex' : 'none';
        };

        // Publish Actions
        onClick('btn-submit-publish-video', () => UploadStudio.publishContent('video'));
        onClick('btn-submit-publish-short', () => UploadStudio.publishContent('short'));
        onClick('btn-submit-publish-post', () => UploadStudio.publishContent('post'));

        UploadStudio.bindCameraTools();
    },

    open: () => {
        if (!State.channel) {
            UI.toast("Please create a channel first under 'You' tab.");
            Router.switchTab('you');
            return;
        }

        const uploadContainer = Utils.el('page-container-upload');
        if (uploadContainer) {
            uploadContainer.style.display = 'block';
            uploadContainer.style.zIndex = '99999';
        }

        const studioRoot = Utils.el('flaynity-upload-studio');
        if (studioRoot) {
            studioRoot.style.display = 'flex';
            studioRoot.classList.add('open');
        }

        Router.addBackState('upload-studio');
        UploadStudio.switchMode('video');
    },

    close: () => {
        UploadStudio.stopCamera();
        const studioRoot = Utils.el('flaynity-upload-studio');
        if (studioRoot) {
            studioRoot.style.display = 'none';
            studioRoot.classList.remove('open');
        }
        document.querySelectorAll('.studio-sub-layer').forEach((l) => l.classList.remove('active'));

        const uploadContainer = Utils.el('page-container-upload');
        if (uploadContainer) uploadContainer.style.display = 'none';
    },

    switchMode: (mode) => {
        UploadStudio.activeMode = mode;
        Utils.vibrate(30);

        document.querySelectorAll('.mode-tab-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.mode === mode);
        });

        document.querySelectorAll('.mode-panel').forEach((panel) => panel.classList.remove('active'));

        const activePanel = Utils.el(`panel-mode-${mode}`);
        if (activePanel) activePanel.classList.add('active');

        if (mode === 'short') {
            UploadStudio.startCamera();
        } else {
            UploadStudio.stopCamera();
        }
    },

    openSubLayer: (layerId) => {
        const layer = Utils.el(layerId);
        if (layer) {
            layer.classList.add('active');
            Router.addBackState(layerId);
        }
    },

    hideSubLayer: (layerId) => {
        const layer = Utils.el(layerId);
        if (layer) layer.classList.remove('active');
    },

    bindCharacterCounter: (inputId, counterId, max) => {
        const input = Utils.el(inputId);
        const counter = Utils.el(counterId);
        if (input && counter) {
            input.oninput = () => counter.innerText = `${input.value.length}/${max}`;
        }
    },

    loadVideoFileForPreview: async (file) => {
        UploadStudio.activeFile = file;
        UploadStudio.customThumbBlob = null;

        const videoEl = Utils.el('main-video-preview-el');
        const fileUrl = URL.createObjectURL(file);
        videoEl.src = fileUrl;

        videoEl.onloadedmetadata = async () => {
            UploadStudio.mediaDuration = videoEl.duration || 0;
            UploadStudio.trimStartSec = 0;
            UploadStudio.trimEndSec = UploadStudio.mediaDuration;

            Utils.el('trimmer-time-display').innerText = `0:00 / ${Utils.formatDuration(UploadStudio.mediaDuration)}`;
            Utils.el('trimmer-selected-duration').innerText = `Selected: ${Utils.formatDuration(UploadStudio.mediaDuration)}`;

            const thumbResult = await Utils.generateVideoThumbnail(file, 1, '16:9');
            UploadStudio.generatedThumbBlob = thumbResult.blob;
            Utils.el('video-details-thumb-preview').src = thumbResult.dataUrl;

            UploadStudio.openSubLayer('layer-video-preview');
            videoEl.play().catch(() => {});
        };
    },

    // ----------------------------------------------------------------------
    // FIXED CAMERA TOOLS (FLIP, FLASH, TIMER, DURATION, SPEED, FILTERS)
    // ----------------------------------------------------------------------
    startCamera: async () => {
        try {
            if (UploadStudio.cameraStream) UploadStudio.stopCamera();

            const constraints = {
                video: { facingMode: UploadStudio.facingMode, width: { ideal: 720 }, height: { ideal: 1280 } },
                audio: true
            };
            UploadStudio.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            const streamEl = Utils.el('short-cam-stream');
            if (streamEl) {
                streamEl.srcObject = UploadStudio.cameraStream;
                streamEl.style.filter = UploadStudio.filters[UploadStudio.filterIndex].css;
            }
        } catch (err) {
            console.error("Camera Error:", err);
            UI.toast("Camera permission required.");
        }
    },

    stopCamera: () => {
        if (UploadStudio.cameraStream) {
            UploadStudio.cameraStream.getTracks().forEach((t) => t.stop());
            UploadStudio.cameraStream = null;
        }
    },

    bindCameraTools: () => {
        // 1. Shutter Record
        const shutter = Utils.el('btn-shutter-record');
        if (shutter) {
            shutter.onclick = () => {
                if (UploadStudio.isRecording) UploadStudio.stopShortRecording();
                else UploadStudio.startShortRecording();
            };
        }

        // 2. Switch Camera (Front <-> Rear)
        onClick('tool-flip-camera', () => {
            UploadStudio.facingMode = UploadStudio.facingMode === 'user' ? 'environment' : 'user';
            UploadStudio.startCamera();
            UI.toast(UploadStudio.facingMode === 'user' ? "Front Camera" : "Rear Camera");
        });

        // 3. Timer (Off, 3s, 10s, 20s)
        onClick('tool-camera-timer', () => {
            const timers = [0, 3, 10, 20];
            const currentIdx = timers.indexOf(UploadStudio.timerSeconds);
            UploadStudio.timerSeconds = timers[(currentIdx + 1) % timers.length];
            UI.toast(UploadStudio.timerSeconds === 0 ? "Timer: Off" : `Timer: ${UploadStudio.timerSeconds}s`);
        });

        // 4. Recording Duration (15s, 30s, 60s, 3m)
        onClick('tool-camera-duration', () => {
            const durations = [
                { label: '15s', ms: 15000 },
                { label: '30s', ms: 30000 },
                { label: '60s', ms: 60000 },
                { label: '3m', ms: 180000 }
            ];
            const curIdx = durations.findIndex((d) => d.ms === UploadStudio.maxRecordTimeMs);
            const nextObj = durations[(curIdx + 1) % durations.length];
            UploadStudio.maxRecordTimeMs = nextObj.ms;
            Utils.el('label-cam-duration').innerText = nextObj.label;
            UI.toast(`Max Duration: ${nextObj.label}`);
        });

        // 5. Speed (0.3x, 0.5x, 1x, 2x, 3x)
        onClick('tool-camera-speed', () => {
            const speeds = [0.3, 0.5, 1.0, 2.0, 3.0];
            const curIdx = speeds.indexOf(UploadStudio.speedMultiplier);
            UploadStudio.speedMultiplier = speeds[(curIdx + 1) % speeds.length];
            Utils.el('label-cam-speed').innerText = `${UploadStudio.speedMultiplier}x`;
            UI.toast(`Speed: ${UploadStudio.speedMultiplier}x`);
        });

        // 6. Filters (Normal, Vintage, B&W, Vivid, Warm, Cyberpunk)
        onClick('tool-camera-filters', () => {
            UploadStudio.filterIndex = (UploadStudio.filterIndex + 1) % UploadStudio.filters.length;
            const cur = UploadStudio.filters[UploadStudio.filterIndex];
            const streamEl = Utils.el('short-cam-stream');
            if (streamEl) streamEl.style.filter = cur.css;
            UI.toast(`Filter: ${cur.name}`);
        });

        // 7. Flash Torch Toggle
        onClick('tool-camera-flash', async () => {
            if (!UploadStudio.cameraStream) return;
            const videoTrack = UploadStudio.cameraStream.getVideoTracks()[0];
            if (!videoTrack) return;

            try {
                UploadStudio.flashEnabled = !UploadStudio.flashEnabled;
                await videoTrack.applyConstraints({
                    advanced: [{ torch: UploadStudio.flashEnabled }]
                });
                Utils.el('tool-camera-flash').innerHTML = `<span class="material-symbols-outlined">${UploadStudio.flashEnabled ? 'flash_on' : 'flash_off'}</span>`;
                UI.toast(UploadStudio.flashEnabled ? "Flash ON" : "Flash OFF");
            } catch (e) {
                UI.toast("Flash torch not supported on this lens");
            }
        });

        // 8. Done Action
        onClick('btn-short-camera-done', () => {
            if (UploadStudio.activeFile) UploadStudio.openShortPreviewLayer();
        });
    },

    startShortRecording: () => {
        if (!UploadStudio.cameraStream) return;

        const runRecording = () => {
            UploadStudio.isRecording = true;
            UploadStudio.recordedChunks = [];
            Utils.vibrate(60);

            Utils.el('btn-shutter-record').classList.add('recording');
            UploadStudio.mediaRecorder = new MediaRecorder(UploadStudio.cameraStream);

            UploadStudio.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) UploadStudio.recordedChunks.push(e.data);
            };

            UploadStudio.mediaRecorder.onstop = () => {
                const recordedBlob = new Blob(UploadStudio.recordedChunks, { type: 'video/mp4' });
                UploadStudio.activeFile = recordedBlob;
                UploadStudio.openShortPreviewLayer();
            };

            UploadStudio.mediaRecorder.start(100);
            UploadStudio.recordedTimeMs = 0;

            UploadStudio.recordTimerInterval = setInterval(() => {
                UploadStudio.recordedTimeMs += 100;
                if (UploadStudio.recordedTimeMs >= UploadStudio.maxRecordTimeMs) {
                    UploadStudio.stopShortRecording();
                }
            }, 100);
        };

        if (UploadStudio.timerSeconds > 0) {
            const display = Utils.el('cam-countdown-display');
            display.style.display = 'flex';
            let count = UploadStudio.timerSeconds;
            display.innerText = count;

            const countdownInt = setInterval(() => {
                count--;
                if (count > 0) {
                    display.innerText = count;
                } else {
                    clearInterval(countdownInt);
                    display.style.display = 'none';
                    runRecording();
                }
            }, 1000);
        } else {
            runRecording();
        }
    },

    stopShortRecording: () => {
        if (!UploadStudio.isRecording) return;
        UploadStudio.isRecording = false;
        Utils.vibrate(60);
        clearInterval(UploadStudio.recordTimerInterval);
        Utils.el('btn-shutter-record').classList.remove('recording');
        if (UploadStudio.mediaRecorder && UploadStudio.mediaRecorder.state !== 'inactive') {
            UploadStudio.mediaRecorder.stop();
        }
    },

    loadShortVideoForPreview: (fileOrBlob) => {
        UploadStudio.activeFile = fileOrBlob;
        UploadStudio.openShortPreviewLayer();
    },

    openShortPreviewLayer: async () => {
        UploadStudio.stopCamera();
        const shortPreviewEl = Utils.el('short-preview-video-el');
        shortPreviewEl.src = URL.createObjectURL(UploadStudio.activeFile);
        shortPreviewEl.playbackRate = UploadStudio.speedMultiplier;
        shortPreviewEl.style.filter = UploadStudio.filters[UploadStudio.filterIndex].css;

        UploadStudio.openSubLayer('layer-short-preview');
        shortPreviewEl.play().catch(() => {});

        const thumbResult = await Utils.generateVideoThumbnail(UploadStudio.activeFile, 0.5, '9:16');
        UploadStudio.generatedThumbBlob = thumbResult.blob;
        Utils.el('short-details-thumb-preview').src = thumbResult.dataUrl;
    },

    loadPostImageForPreview: (file) => {
        UploadStudio.activeFile = file;
        const imgEl = Utils.el('post-preview-img-el');
        imgEl.src = URL.createObjectURL(file);
        UploadStudio.openSubLayer('layer-post-preview');
    },

    publishContent: async (type) => {
        let titleVal = '';
        let descVal = '';
        let visVal = 'public';
        let catVal = 'Entertainment';
        let scheduledTimestamp = null;
        let allowComments = true;
        let showLikes = true;

        if (type === 'video') {
            titleVal = Utils.el('input-v-title').value.trim();
            descVal = Utils.el('input-v-desc').value.trim();
            visVal = Utils.el('select-v-visibility').value;
            allowComments = Utils.el('toggle-v-comments').checked;
            showLikes = Utils.el('toggle-v-likes').checked;

            if (!titleVal) return UI.toast("Title is required.");
            if (!descVal) return UI.toast("Description is required.");

            if (visVal === 'schedule') {
                const schedVal = Utils.el('input-v-schedule-time').value;
                if (!schedVal) return UI.toast("Please select schedule date & time.");
                scheduledTimestamp = new Date(schedVal).getTime();
            }
        } else if (type === 'short') {
            titleVal = Utils.el('input-s-title').value.trim();
            visVal = Utils.el('select-s-visibility').value;
            allowComments = Utils.el('toggle-s-comments').checked;

            if (!titleVal) return UI.toast("Caption is required.");
            if (visVal === 'schedule') {
                const schedVal = Utils.el('input-s-schedule-time').value;
                if (!schedVal) return UI.toast("Please select schedule date & time.");
                scheduledTimestamp = new Date(schedVal).getTime();
            }
        } else if (type === 'post') {
            titleVal = Utils.el('input-p-title').value.trim();
            visVal = Utils.el('select-p-visibility').value;

            if (!titleVal) return UI.toast("Post text is required.");
            if (visVal === 'schedule') {
                const schedVal = Utils.el('input-p-schedule-time').value;
                if (!schedVal) return UI.toast("Please select schedule date & time.");
                scheduledTimestamp = new Date(schedVal).getTime();
            }
        }

        try {
            UI.showUploadProgress("Uploading media to Cloudflare R2...");
            let cdnMediaUrl = '';
            let cdnThumbnailUrl = '';
            let durationFormatted = '0:00';

            if (type === 'video' || type === 'short') {
                cdnMediaUrl = await Services.uploadFile(UploadStudio.activeFile, `${type}s/${State.user.uid}`);
                const finalThumbBlob = UploadStudio.customThumbBlob || UploadStudio.generatedThumbBlob;

                if (finalThumbBlob) {
                    UI.showUploadProgress("Uploading thumbnail to R2...");
                    cdnThumbnailUrl = await Services.uploadFile(finalThumbBlob, `thumbnails/${State.user.uid}`, 'jpg');
                }
                durationFormatted = Utils.formatDuration(UploadStudio.mediaDuration || 15);
            } else if (type === 'post') {
                if (UploadStudio.activeFile) {
                    cdnMediaUrl = await Services.uploadFile(UploadStudio.activeFile, `posts/${State.user.uid}`);
                }
            }

            UI.showUploadProgress("Saving metadata...");
            const record = {
                uid: State.user.uid,
                channelId: State.channel.id,
                channelName: State.channel.channelName,
                channelAvatar: State.channel.avatarUrl || State.user.photoURL || '',
                cdnVideoUrl: cdnMediaUrl,
                imageUrl: type === 'post' ? cdnMediaUrl : '',
                thumbnailUrl: cdnThumbnailUrl || cdnMediaUrl,
                title: titleVal,
                description: descVal,
                category: catVal,
                visibility: visVal,
                scheduledAt: scheduledTimestamp,
                allowComments: allowComments,
                showLikes: showLikes,
                duration: durationFormatted,
                views: 0,
                likes: 0,
                comments: 0,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };

            await db.ref(`${type}s`).push().set(record);

            UI.updateUploadProgress(100);
            UI.hideUploadProgress();
            UI.toast("Published successfully! 🚀");
            UploadStudio.close();

            Router.switchTab(type === 'short' ? 'shorts' : 'home');
        } catch (err) {
            console.error("Publish Error:", err);
            UI.hideUploadProgress();
            UI.toast("Publish failed: " + (err.message || "Network Error"));
        }
    }
};

// ==========================================
// 8. DISCOVER & YOU CHANNEL STUDIO
// ==========================================
const DiscoverPage = { init: () => {} };

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

        document.querySelectorAll('.btn-back-layer').forEach((btn) => {
            btn.onclick = (e) => e.target.closest('.you-sub-layer').classList.remove('active');
        });

        onClick('picker-create-avatar', () => Utils.el('input-create-avatar').click());

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
            if (!name || !handle) return UI.toast("Name and handle required.");

            try {
                UI.showUploadProgress("Creating channel...");
                let avatarUrl = State.user.photoURL || '';
                if (avatarFile) {
                    avatarUrl = await Services.uploadFile(avatarFile, `avatars/${State.user.uid}`);
                }

                await db.ref('channels').push().set({
                    uid: State.user.uid,
                    channelName: name,
                    handle: `@${handle.replace('@', '')}`,
                    avatarUrl: avatarUrl,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    subscribersCount: 0
                });

                UI.hideUploadProgress();
                UI.toast("Channel created!");
                Utils.el('layer-create-channel').classList.remove('active');
            } catch (e) {
                UI.hideUploadProgress();
                UI.toast("Channel creation failed: " + e.message);
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
        Utils.el('vc-name-text').innerText = ch.channelName;
        Utils.el('vc-handle-text').innerText = ch.handle;
        Utils.el('vc-subs-text').innerText = Utils.formatViews(ch.subscribersCount || 0);
    }
};

// ==========================================
// 9. ROUTER & GLOBAL PERSISTENT NAVIGATION
// ==========================================
const Router = {
    pages: ['home', 'shorts', 'upload', 'discover', 'you'],
    history: ['home'],

    fetchPages: async () => {
        const appRoot = document.getElementById('app');
        for (const page of Router.pages) {
            const response = await fetch(`pages/${page}.html`);
            if (!response.ok) throw new Error(`Failed to load: pages/${page}.html`);
            const html = await response.text();

            const container = document.createElement('div');
            container.id = `page-container-${page}`;
            container.style.cssText = `width:100%;height:100%;position:absolute;top:0;left:0;display:${page === 'home' ? 'block' : 'none'};z-index:${page === 'upload' ? '99999' : '1'};`;
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
        document.addEventListener('click', (e) => {
            const navUploadBtn = e.target.closest('.nav-item[data-tab="upload"], [data-tab="create"], #btn-nav-upload, .nav-item-upload, .upload-btn');
            if (navUploadBtn) {
                e.preventDefault();
                e.stopPropagation();
                UploadStudio.open();
                return;
            }

            const navItem = e.target.closest('.nav-item');
            if (navItem && navItem.dataset.tab !== 'upload') {
                Router.switchTab(navItem.dataset.tab);
            }
        });
    },

    switchTab: (tabName) => {
        if (tabName === 'upload') {
            UploadStudio.open();
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

        if (tabName === 'shorts') ShortsPlayer.render();
        else if (tabName === 'home') HomeFeed.render();
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
    executeBackAction: () => {
        const studio = Utils.el('flaynity-upload-studio');
        if (studio && (studio.classList.contains('open') || studio.style.display === 'flex')) {
            const activeSubLayers = document.querySelectorAll('.studio-sub-layer.active');
            if (activeSubLayers.length > 0) {
                activeSubLayers.forEach((l) => l.classList.remove('active'));
            } else {
                UploadStudio.close();
            }
            Router.history.pop();
            Router.updateAndroidBackStack();
            return;
        }

        if (Player.currentVideoData) {
            Player.close();
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
// 10. LIFECYCLE BOOTSTRAP & REALTIME HUB
// ==========================================
const App = {
    bootstrap: async () => {
        if (State.isBootstrapped) return;
        State.isBootstrapped = true;

        try {
            await Router.fetchPages();
            Services.init();

            HomeFeed.init();
            Player.init();
            ShortsPlayer.init();
            UploadStudio.init();
            DiscoverPage.init();
            YouPage.init();
            Router.bindGlobalNavigation();

            AuthSystem.init();
        } catch (error) {
            console.error("Bootstrap Error:", error);
        }
    },

    startRealtimeListeners: () => {
        Services.addListener('videos', 'videos', (snap) => {
            const data = snap.val() || {};
            State.cache.videos = Object.keys(data).map((k) => ({ id: k, ...data[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            HomeFeed.render();
        });

        Services.addListener('shorts', 'shorts', (snap) => {
            const data = snap.val() || {};
            State.cache.shorts = Object.keys(data).map((k) => ({ id: k, ...data[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            HomeFeed.render();
            ShortsPlayer.render();
        });

        Services.addListener('posts', 'posts', (snap) => {
            const data = snap.val() || {};
            State.cache.posts = Object.keys(data).map((k) => ({ id: k, ...data[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            HomeFeed.render();
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.bootstrap());
} else {
    App.bootstrap();
}
