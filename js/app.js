/*
 * ==============================================================================
 * FLAYNITY - MASTER APPLICATION LOGIC (Sketchware WebView Optimized)
 * ==============================================================================
 * 1. Configuration & State
 * 2. Utility Systems
 * 3. Services (Firebase Compat, S3, Android Bridge)
 * 4. Auth System (Native Google Sign-In Support)
 * 5. Page Controllers (Home, Watch, Shorts, Upload, Discover, You)
 * 6. Router & Bootstrap (Back Button Integration)
 * ==============================================================================
 */

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
    cache: { videos: [], shorts: [], posts: [], channels: {}, subscriptions: {} },
    activeListeners: {},
    currentPlayingVideo: null
};

// --- UTILITIES ---
const Utils = {
    el: (id) => document.getElementById(id),
    show: (id) => { const e = Utils.el(id); if (e) e.classList.remove('flaynity-hidden'); },
    hide: (id) => { const e = Utils.el(id); if (e) e.classList.add('flaynity-hidden'); },
    timeAgo: (timestamp) => {
        if (!timestamp) return 'Just now';
        const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " days ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        return Math.floor(seconds) + " seconds ago";
    },
    formatViews: (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num || 0;
    },
    vibrate: () => {
        if (navigator.vibrate) navigator.vibrate(50);
    },
    secureText: (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

const UI = {
    toast: (msg) => {
        const t = document.createElement('div');
        t.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:12px 24px;border-radius:24px;z-index:9999;font-size:14px;font-weight:600;transition:opacity 0.3s;`;
        t.innerText = msg;
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
    },
    showUploadProgress: () => Utils.show('upload-progress-engine'),
    hideUploadProgress: () => Utils.hide('upload-progress-engine'),
    updateUploadProgress: (pct) => {
        const txt = Utils.el('upload-progress-percentage');
        if (txt) txt.innerText = `${pct}%`;
    }
};

// --- SERVICES (Compat SDK) ---
let auth, db, s3Client;

const Services = {
    init: () => {
        if (!firebase.apps.length) {
            firebase.initializeApp(CONFIG.firebase);
        }
        auth = firebase.auth();
        db = firebase.database();

        if (typeof AWS !== 'undefined') {
            AWS.config.update({
                accessKeyId: CONFIG.r2.accessKey,
                secretAccessKey: CONFIG.r2.secretKey,
                region: 'auto',
                endpoint: CONFIG.r2.endpoint,
                s3ForcePathStyle: true,
                signatureVersion: 'v4'
            });
            s3Client = new AWS.S3();
        }
    },
    uploadFile: (file, folder) => {
        return new Promise((resolve, reject) => {
            if (!s3Client) return reject("R2 Engine Not Initialized");
            const ext = file.name.split('.').pop();
            const key = `uploads/${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            
            const req = s3Client.upload({
                Bucket: CONFIG.r2.bucket,
                Key: key,
                Body: file,
                ContentType: file.type,
                ACL: 'public-read'
            });

            req.on('httpUploadProgress', (evt) => {
                let pct = Math.round((evt.loaded * 100) / evt.total);
                UI.updateUploadProgress(pct);
            });

            req.send((err, data) => {
                if (err) reject(err);
                else resolve(`${CONFIG.r2.publicUrl}/${key}`);
            });
        });
    },
    addListener: (id, path, callback) => {
        if (State.activeListeners[id]) return;
        const dbRef = db.ref(path);
        const wrapper = (snapshot) => callback(snapshot);
        dbRef.on('value', wrapper);
        State.activeListeners[id] = { ref: dbRef, cb: wrapper };
    },
    removeListener: (id) => {
        const listener = State.activeListeners[id];
        if (listener) {
            listener.ref.off('value', listener.cb);
            delete State.activeListeners[id];
        }
    }
};

// --- AUTHENTICATION ---
const AuthSystem = {
    init: () => {
        auth.onAuthStateChanged(async (user) => {
            Utils.hide('flaynity-splash');
            if (user) {
                State.user = user;
                Utils.hide('flaynity-auth');
                await AuthSystem.loadUserProfile();
                App.startRealtimeListeners();
            } else {
                State.user = null;
                Utils.show('flaynity-auth');
            }
        });

        const btnGoogle = Utils.el('btn-google-signin');
        if (btnGoogle) {
            btnGoogle.onclick = async () => {
                // If Sketchware AndroidBridge is present, use Native Google Login
                if (window.AndroidBridge && typeof AndroidBridge.triggerGoogleSignIn === 'function') {
                    AndroidBridge.triggerGoogleSignIn();
                } else {
                    // Fallback to Web Google Login
                    try {
                        const provider = new firebase.auth.GoogleAuthProvider();
                        await auth.signInWithRedirect(provider);
                    } catch (error) {
                        UI.toast("Authentication failed.");
                    }
                }
            };
        }
    },
    loadUserProfile: async () => {
        const userRef = db.ref(`users/${State.user.uid}`);
        await userRef.update({
            displayName: State.user.displayName,
            email: State.user.email,
            photoURL: State.user.photoURL,
            lastLogin: firebase.database.ServerValue.TIMESTAMP
        });

        const chQuery = db.ref('channels').orderByChild('uid').equalTo(State.user.uid);
        chQuery.on('value', (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                State.channel = data[Object.keys(data)[0]];
                State.channel.id = Object.keys(data)[0];
            } else {
                State.channel = null;
            }
            YouPage.updateProfileUI();
        });
    },
    signOut: async () => {
        await auth.signOut();
        window.location.reload();
    }
};

// Native App Calls this function when Google Sign-In is successful
window.handleNativeGoogleSignIn = (idToken) => {
    const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
    auth.signInWithCredential(credential).catch(error => {
        UI.toast("Google Sign-In Error: " + error.message);
    });
};

// --- PAGE CONTROLLERS ---
const HomeFeed = {
    init: () => {
        const searchBtn = Utils.el('btn-home-search');
        if(searchBtn) searchBtn.onclick = () => Router.switchTab('discover');
    },
    render: () => {
        const container = Utils.el('home-feed-container');
        if (!container) return;
        container.innerHTML = ''; 
        
        let vIdx = 0, sIdx = 0, pIdx = 0;
        const v = State.cache.videos;
        const s = State.cache.shorts;
        const p = State.cache.posts;

        const maxItems = Math.max(v.length, s.length, p.length);
        if (maxItems === 0) {
            container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--flaynity-text-secondary);">No content available. Be the first to upload!</div>`;
            return;
        }

        let isRunning = true;
        while(isRunning) {
            let addedAny = false;
            
            if (sIdx < s.length) {
                const sBlock = s.slice(sIdx, sIdx + 6);
                sIdx += 6;
                container.appendChild(HomeFeed.buildShortsGrid(sBlock));
                addedAny = true;
            }

            if (vIdx < v.length) {
                const vBlock = v.slice(vIdx, vIdx + 10);
                vIdx += 10;
                vBlock.forEach(video => {
                    container.appendChild(HomeFeed.buildVideoCard(video));
                });
                addedAny = true;
            }

            if (pIdx < p.length) {
                container.appendChild(HomeFeed.buildPostCard(p[pIdx]));
                pIdx++;
                addedAny = true;
            }

            if (!addedAny) isRunning = false;
        }
    },
    buildVideoCard: (data) => {
        const div = document.createElement('div');
        div.className = 'long-video-card';
        div.innerHTML = `
            <div class="lv-thumbnail-box">
                <img src="${data.thumbnailUrl || ''}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
                <div class="lv-duration">${data.duration || '0:00'}</div>
            </div>
            <div class="lv-info-row">
                <img class="lv-avatar" src="${data.channelAvatar || ''}" alt="">
                <div class="lv-text">
                    <div class="lv-title">${Utils.secureText(data.title)}</div>
                    <div class="lv-meta">${Utils.secureText(data.channelName)} • ${Utils.formatViews(data.views || 0)} views • ${Utils.timeAgo(data.createdAt)}</div>
                </div>
            </div>
        `;
        div.onclick = () => Player.open(data);
        return div;
    },
    buildShortsGrid: (shortsData) => {
        const section = document.createElement('div');
        section.className = 'shorts-grid-section';
        let innerHTML = `<div class="shorts-grid-header"><span class="material-symbols-outlined">app_shortcut</span> Shorts</div><div class="s-grid">`;
        
        shortsData.forEach(s => {
            innerHTML += `
                <div class="s-card" data-id="${s.id}">
                    <img src="${s.thumbnailUrl || s.cdnVideoUrl}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
                    <div class="s-card-title">${Utils.secureText(s.title)}</div>
                </div>
            `;
        });
        innerHTML += `</div>`;
        section.innerHTML = innerHTML;
        
        section.querySelectorAll('.s-card').forEach(card => {
            card.onclick = () => {
                Router.switchTab('shorts');
                ShortsPlayer.scrollTo(card.dataset.id);
            };
        });
        return section;
    },
    buildPostCard: (data) => {
        const div = document.createElement('div');
        div.className = 'post-card';
        div.innerHTML = `
            <div class="post-header">
                <img class="post-avatar" src="${data.channelAvatar || ''}">
                <div>
                    <div class="post-user">${Utils.secureText(data.channelName)}</div>
                    <div class="post-time">${Utils.timeAgo(data.createdAt)}</div>
                </div>
                <div class="post-subscribe">Subscribe</div>
            </div>
            <div class="post-text">${Utils.secureText(data.text || '')}</div>
            ${data.imageUrl ? `<div class="post-image-grid count-1"><img src="${data.imageUrl}"></div>` : ''}
            <div class="post-stats">
                <div class="post-reactions-icons">👍 ❤️ ${data.likes || 0}</div>
                <div>${data.comments || 0} comments</div>
            </div>
            <div class="post-actions">
                <div class="p-action-btn"><span class="material-symbols-outlined">thumb_up</span> Like</div>
                <div class="p-action-btn"><span class="material-symbols-outlined">chat_bubble</span> Comment</div>
                <div class="p-action-btn"><span class="material-symbols-outlined">share</span> Share</div>
            </div>
        `;
        return div;
    }
};

const Player = {
    init: () => {
        const closeBtn = Utils.el('btn-close-watch');
        if (closeBtn) closeBtn.onclick = Player.close;
    },
    open: (videoData) => {
        const layer = Utils.el('flaynity-watch-page');
        const videoEl = Utils.el('main-video-player');
        
        Utils.el('wp-title').innerText = videoData.title;
        Utils.el('wp-stats').innerText = `${Utils.formatViews(videoData.views || 0)} views • ${Utils.timeAgo(videoData.createdAt)}`;
        Utils.el('wp-channel-handle').innerText = videoData.channelName;
        Utils.el('wp-like-count').innerText = Utils.formatViews(videoData.likes || 0);
        
        const avatar = Utils.el('wp-channel-avatar');
        avatar.src = videoData.channelAvatar || '';
        avatar.style.display = 'block';

        videoEl.src = videoData.cdnVideoUrl;
        videoEl.play().catch(e => console.log("Autoplay prevented"));
        
        layer.classList.add('active');
        State.currentPlayingVideo = videoEl;
        Router.addBackState('player');

        // Update Views via Compat Firebase
        if (videoData.id) {
            db.ref(`videos/${videoData.id}/views`).transaction((current) => (current || 0) + 1);
        }
    },
    close: () => {
        const layer = Utils.el('flaynity-watch-page');
        const videoEl = Utils.el('main-video-player');
        videoEl.pause();
        videoEl.src = '';
        layer.classList.remove('active');
        State.currentPlayingVideo = null;
    }
};

const ShortsPlayer = {
    observer: null,
    init: () => {
        const container = Utils.el('shorts-feed-container');
        if (!container) return;

        ShortsPlayer.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const videoEl = entry.target.querySelector('.short-video-element');
                if (!videoEl) return;
                
                if (entry.isIntersecting) {
                    videoEl.play().catch(e => console.log('Autoplay blocked'));
                    State.currentPlayingVideo = videoEl;
                } else {
                    videoEl.pause();
                    videoEl.currentTime = 0;
                }
            });
        }, { threshold: 0.6 });
    },
    render: () => {
        const container = Utils.el('shorts-feed-container');
        if (!container) return;
        
        container.innerHTML = '';
        const shorts = State.cache.shorts;

        if (shorts.length === 0) {
            container.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#fff;">No Shorts available.</div>`;
            return;
        }

        shorts.forEach(s => {
            const div = document.createElement('div');
            div.className = 'short-view-container';
            div.id = `short-view-${s.id}`;
            div.innerHTML = `
                <video class="short-video-element" src="${s.cdnVideoUrl}" loop playsinline preload="auto"></video>
                <div class="short-ui-overlay">
                    <div class="short-actions-sidebar">
                        <div class="s-action-btn like-btn">
                            <span class="material-symbols-outlined">favorite</span>
                            <span class="count">${Utils.formatViews(s.likes || 0)}</span>
                        </div>
                        <div class="s-action-btn">
                            <span class="material-symbols-outlined">chat</span>
                            <span class="count">${Utils.formatViews(s.comments || 0)}</span>
                        </div>
                        <div class="s-action-btn">
                            <span class="material-symbols-outlined">share</span>
                            <span class="count">Share</span>
                        </div>
                        <div class="music-disc-wrapper disc-spin"><span class="material-symbols-outlined">music_note</span></div>
                    </div>
                    <div class="short-bottom-details">
                        <div class="short-channel-row">
                            <img src="${s.channelAvatar || ''}">
                            <span class="short-handle">${Utils.secureText(s.channelName)}</span>
                            <button class="short-sub-btn">Subscribe</button>
                        </div>
                        <div class="short-title-text">${Utils.secureText(s.title)}</div>
                    </div>
                    <div class="short-center-play-indicator"><span class="material-symbols-outlined">play_arrow</span></div>
                </div>
            `;
            
            let lastTap = 0;
            div.addEventListener('click', (e) => {
                const now = new Date().getTime();
                const timesince = now - lastTap;
                if ((timesince < 300) && (timesince > 0)) {
                    Utils.vibrate();
                    const icon = div.querySelector('.like-btn .material-symbols-outlined');
                    icon.style.color = 'var(--flaynity-accent)';
                    icon.style.transform = 'scale(1.3)';
                    setTimeout(() => icon.style.transform = 'scale(1)', 200);
                } else {
                    const v = div.querySelector('.short-video-element');
                    const indicator = div.querySelector('.short-center-play-indicator');
                    if(v.paused) {
                        v.play();
                        indicator.querySelector('span').innerText = 'play_arrow';
                    } else {
                        v.pause();
                        indicator.querySelector('span').innerText = 'pause';
                    }
                    indicator.classList.add('indicator-flash');
                    setTimeout(() => indicator.classList.remove('indicator-flash'), 400);
                }
                lastTap = new Date().getTime();
            });

            container.appendChild(div);
            ShortsPlayer.observer.observe(div);
        });
    },
    scrollTo: (id) => {
        const el = Utils.el(`short-view-${id}`);
        if(el) el.scrollIntoView({behavior: 'smooth'});
    }
};

const UploadPage = {
    activeFile: null,
    init: () => {
        Utils.el('btn-close-upload-sheet').onclick = UploadPage.closeSheet;
        Utils.el('upload-backdrop').onclick = (e) => {
            if(e.target.id === 'upload-backdrop') UploadPage.closeSheet();
        };

        Utils.el('btn-create-video').onclick = () => UploadPage.openFlow('flow-video');
        Utils.el('btn-create-short').onclick = () => UploadPage.openFlow('flow-short');
        Utils.el('btn-create-post').onclick = () => UploadPage.openFlow('flow-post');

        Utils.el('btn-close-video-flow').onclick = UploadPage.closeAll;
        Utils.el('btn-close-short-flow').onclick = UploadPage.closeAll;
        Utils.el('btn-close-post-flow').onclick = UploadPage.closeAll;
        Utils.el('btn-back-short-details').onclick = () => {
            Utils.hide('short-details-ui');
        };

        Utils.el('video-file-picker-trigger').onclick = () => Utils.el('input-video-file').click();
        Utils.el('input-video-file').onchange = (e) => {
            const file = e.target.files[0];
            if(file) {
                UploadPage.activeFile = file;
                const url = URL.createObjectURL(file);
                const vid = Utils.el('video-preview-element');
                vid.src = url;
                Utils.show('video-preview-element');
            }
        };

        Utils.el('post-image-picker-trigger').onclick = () => Utils.el('input-post-file').click();
        Utils.el('input-post-file').onchange = (e) => {
            const file = e.target.files[0];
            if(file) {
                UploadPage.activeFile = file;
                const url = URL.createObjectURL(file);
                const img = Utils.el('post-image-preview');
                img.src = url;
                Utils.show('post-image-preview');
            }
        };

        Utils.el('btn-publish-video').onclick = () => UploadPage.publish('video');
        Utils.el('btn-publish-post').onclick = () => UploadPage.publish('post');
        Utils.el('btn-publish-short').onclick = () => UploadPage.publish('short');

        Utils.el('btn-record-short').onmousedown = () => {
            Utils.el('btn-record-short').style.transform = 'scale(0.8)';
            UI.toast("Recording Simulator...");
        };
        Utils.el('btn-record-short').onmouseup = () => {
            Utils.el('btn-record-short').style.transform = 'scale(1)';
        };
        Utils.el('btn-short-next').onclick = () => {
            Utils.show('short-details-ui');
        };
        Utils.el('btn-short-gallery').onclick = () => {
            Utils.el('input-short-file').click();
        };
        Utils.el('input-short-file').onchange = (e) => {
            const file = e.target.files[0];
            if(file) {
                UploadPage.activeFile = file;
                Utils.show('short-details-ui');
            }
        };
    },
    openSheet: () => {
        if (!State.channel) {
            UI.toast("Please create a channel first.");
            Router.switchTab('you');
            return;
        }
        const b = Utils.el('upload-backdrop');
        const s = Utils.el('upload-sheet');
        b.style.display = 'flex';
        void b.offsetWidth;
        b.classList.add('active');
        s.classList.add('active');
        Router.addBackState('upload-sheet');
    },
    closeSheet: () => {
        const b = Utils.el('upload-backdrop');
        const s = Utils.el('upload-sheet');
        b.classList.remove('active');
        s.classList.remove('active');
        setTimeout(() => b.style.display = 'none', 300);
    },
    openFlow: (id) => {
        UploadPage.closeSheet();
        UploadPage.activeFile = null;
        Utils.hide('video-preview-element');
        Utils.hide('post-image-preview');
        const f = Utils.el(id);
        f.classList.remove('flaynity-hidden');
        setTimeout(() => f.classList.add('active'), 10);
        Router.addBackState('upload-flow');
    },
    closeAll: () => {
        ['flow-video', 'flow-short', 'flow-post', 'short-details-ui'].forEach(id => {
            const el = Utils.el(id);
            if(el) {
                el.classList.remove('active');
                setTimeout(() => el.classList.add('flaynity-hidden'), 300);
            }
        });
        UploadPage.activeFile = null;
    },
    publish: async (type) => {
        if (!State.channel) return UI.toast("Channel required.");
        
        let metadata = {
            uid: State.user.uid,
            channelId: State.channel.id,
            channelName: State.channel.channelName,
            channelAvatar: State.channel.avatarUrl || '',
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            views: 0, likes: 0, comments: 0
        };

        if (type === 'video') {
            const title = Utils.el('input-video-title').value.trim();
            if (!title || !UploadPage.activeFile) return UI.toast("Title and Video are required.");
            metadata.title = title;
            metadata.description = Utils.el('input-video-desc').value;
            metadata.visibility = Utils.el('input-video-visibility').value;
            metadata.category = Utils.el('input-video-category').value;
        } else if (type === 'short') {
            const title = Utils.el('input-short-title').value.trim();
            if (!title) return UI.toast("Caption is required.");
            metadata.title = title;
            metadata.visibility = Utils.el('input-short-visibility').value;
            if(!UploadPage.activeFile) return UI.toast("Record or pick a short first.");
        } else if (type === 'post') {
            const text = Utils.el('input-post-text').value.trim();
            if (!text && !UploadPage.activeFile) return UI.toast("Content or Image required.");
            metadata.text = text;
        }

        try {
            UI.showUploadProgress();
            if (UploadPage.activeFile) {
                const r2Url = await Services.uploadFile(UploadPage.activeFile, `${type}s/${State.user.uid}`);
                if (type === 'post') metadata.imageUrl = r2Url;
                else metadata.cdnVideoUrl = r2Url;
            }

            await db.ref(`${type}s`).push().set(metadata);

            UI.hideUploadProgress();
            UI.toast("Published successfully!");
            UploadPage.closeAll();
            Router.switchTab('home');

        } catch (error) {
            UI.hideUploadProgress();
            UI.toast("Upload failed.");
        }
    }
};

const DiscoverPage = {
    init: () => {
        const chips = document.querySelectorAll('.discover-categories-scroll .d-chip');
        chips.forEach(c => {
            c.onclick = () => {
                chips.forEach(x => x.classList.remove('active'));
                c.classList.add('active');
            };
        });
    }
};

const YouPage = {
    init: () => {
        Utils.el('btn-sign-out').onclick = AuthSystem.signOut;
        Utils.el('btn-create-channel').onclick = () => {
            Utils.el('layer-create-channel').classList.add('active');
            Router.addBackState('layer');
        };
        Utils.el('btn-view-channel').onclick = () => {
            YouPage.openViewChannel();
            Router.addBackState('layer');
        };
        Utils.el('btn-open-edit-channel').onclick = () => {
            YouPage.openEditChannel();
            Router.addBackState('layer');
        };
        Utils.el('btn-open-analytics').onclick = () => {
            Utils.el('layer-analytics').classList.add('active');
            Router.addBackState('layer');
        };
        
        document.querySelectorAll('.btn-back-layer').forEach(btn => {
            btn.onclick = (e) => {
                e.target.closest('.you-sub-layer').classList.remove('active');
            };
        });

        document.querySelectorAll('.vc-tab').forEach(tab => {
            tab.onclick = (e) => {
                document.querySelectorAll('.vc-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                YouPage.renderChannelContent(e.target.dataset.tab);
            };
        });

        Utils.el('picker-create-avatar').onclick = () => Utils.el('input-create-avatar').click();
        let createAvatarFile = null;
        Utils.el('input-create-avatar').onchange = (e) => {
            createAvatarFile = e.target.files[0];
            if(createAvatarFile) Utils.el('preview-create-avatar').src = URL.createObjectURL(createAvatarFile);
        };

        Utils.el('btn-submit-create-channel').onclick = async () => {
            const name = Utils.el('input-create-name').value.trim();
            const handle = Utils.el('input-create-handle').value.trim();
            if(!name || !handle) return UI.toast("Name and handle required.");
            
            try {
                UI.showUploadProgress();
                let avatarUrl = State.user.photoURL; 
                if(createAvatarFile) {
                    avatarUrl = await Services.uploadFile(createAvatarFile, `avatars/${State.user.uid}`);
                }

                const chRef = db.ref('channels').push();
                const newChannel = {
                    uid: State.user.uid,
                    channelName: name,
                    handle: handle,
                    avatarUrl: avatarUrl,
                    category: Utils.el('input-create-category').value,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    subscribersCount: 0
                };
                await chRef.set(newChannel);
                
                UI.hideUploadProgress();
                UI.toast("Channel created!");
                Utils.el('layer-create-channel').classList.remove('active');
            } catch(e) {
                UI.hideUploadProgress();
                UI.toast("Error creating channel.");
            }
        };
    },
    updateProfileUI: () => {
        Utils.el('you-google-avatar').src = State.user.photoURL || '';
        Utils.el('you-google-name').innerText = State.user.displayName || 'User';
        Utils.el('you-google-email').innerText = State.user.email || '';
        
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
        Utils.el('layer-view-channel').classList.add('active');
        
        const ch = State.channel;
        Utils.el('vc-avatar-img').src = ch.avatarUrl || State.user.photoURL;
        if(ch.bannerUrl) {
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
        area.innerHTML = '';
        
        let items = [];
        if (tabName === 'videos') items = State.cache.videos.filter(v => v.uid === State.user.uid);
        else if (tabName === 'shorts') items = State.cache.shorts.filter(s => s.uid === State.user.uid);
        else if (tabName === 'posts') items = State.cache.posts.filter(p => p.uid === State.user.uid);

        if (items.length === 0) {
            area.innerHTML = `<div style="text-align:center;padding:32px;color:var(--flaynity-text-secondary);">No ${tabName} found.</div>`;
            return;
        }

        items.forEach(item => {
            const div = document.createElement('div');
            div.style.padding = '12px 0';
            div.style.borderBottom = '1px solid var(--flaynity-divider)';
            div.innerText = item.title || item.text || 'Untitled';
            area.appendChild(div);
        });
    },
    openEditChannel: () => {
        const ch = State.channel;
        if(!ch) return;
        Utils.el('layer-edit-channel').classList.add('active');
        Utils.el('input-edit-name').value = ch.channelName || '';
        Utils.el('input-edit-handle').value = ch.handle || '';
        Utils.el('input-edit-desc').value = ch.description || '';
    }
};

// --- ROUTER & BACK NAVIGATION ---
const Router = {
    pages: ['home', 'shorts', 'upload', 'discover', 'you'],
    loaded: new Set(),
    history: ['home'], // Store tab history for back button
    
    fetchPages: async () => {
        const appRoot = document.getElementById('app');
        for (const p of Router.pages) {
            try {
                const res = await fetch(`pages/${p}.html`);
                const html = await res.text();
                
                const container = document.createElement('div');
                container.id = `page-container-${p}`;
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.position = 'absolute';
                container.style.top = '0';
                container.style.left = '0';
                container.style.display = p === 'home' ? 'block' : 'none';
                
                container.innerHTML = html;
                appRoot.appendChild(container);
                Router.loaded.add(p);
            } catch (err) {
                console.error(`Failed to load ${p}.html`, err);
            }
        }
    },

    bindGlobalNavigation: () => {
        document.querySelectorAll('.nav-item').forEach(el => {
            el.addEventListener('click', () => {
                const tab = el.dataset.tab;
                if (tab === 'upload') {
                    UploadPage.openSheet();
                } else {
                    Router.switchTab(tab);
                }
            });
        });
    },

    switchTab: (tabName) => {
        if(tabName === 'upload') return;

        if (State.currentPlayingVideo && tabName !== 'shorts') {
            State.currentPlayingVideo.pause();
        }

        Router.pages.forEach(p => {
            if (p !== 'upload') {
                const el = document.getElementById(`page-container-${p}`);
                if (el) el.style.display = 'none';
            }
        });

        const target = document.getElementById(`page-container-${tabName}`);
        if (target) target.style.display = 'block';

        document.querySelectorAll('.nav-item').forEach(el => {
            if (el.dataset.tab !== 'upload') {
                el.classList.toggle('active', el.dataset.tab === tabName);
            }
        });

        State.currentTab = tabName;
        
        // Android Back Button Logic
        if (Router.history[Router.history.length - 1] !== tabName) {
            Router.history.push(tabName);
            Router.updateAndroidBackStack();
        }

        if (tabName === 'shorts') ShortsPlayer.render();
    },

    // Notifies Native Java code if there is anything to go back to
    updateAndroidBackStack: () => {
        if (window.AndroidBridge && typeof AndroidBridge.setBackStackStatus === 'function') {
            // True if history length > 1 or any modals/layers are open
            AndroidBridge.setBackStackStatus(Router.history.length > 1);
        }
    },
    
    addBackState: (stateType) => {
        Router.history.push(stateType);
        Router.updateAndroidBackStack();
    }
};

// Exposed to MainActivity.java for Handling Back Press
window.app = {
    executeBackAction: () => {
        // Close overlays first
        if (Utils.el('flaynity-watch-page').classList.contains('active')) {
            Player.close();
            Router.history.pop();
            Router.updateAndroidBackStack();
            return;
        }
        if (Utils.el('upload-sheet').classList.contains('active')) {
            UploadPage.closeSheet();
            Router.history.pop();
            Router.updateAndroidBackStack();
            return;
        }
        if (Utils.el('flow-video').classList.contains('active') || Utils.el('flow-short').classList.contains('active') || Utils.el('flow-post').classList.contains('active')) {
            UploadPage.closeAll();
            Router.history.pop();
            Router.updateAndroidBackStack();
            return;
        }
        
        // Close sub-layers (You Page channels, edit, etc)
        const activeSubLayers = document.querySelectorAll('.you-sub-layer.active');
        if (activeSubLayers.length > 0) {
            activeSubLayers.forEach(l => l.classList.remove('active'));
            Router.history.pop();
            Router.updateAndroidBackStack();
            return;
        }

        // Navigate previous tab
        if (Router.history.length > 1) {
            Router.history.pop(); // Remove current
            const prevTab = Router.history.pop(); // Get previous
            Router.switchTab(prevTab);
        }
    }
};

// Native Network Listeners from MainActivity.java
window['Devnix-aiNetworkOnline'] = function() {
    State.online = true;
    Utils.hide('flaynity-offline');
};
window['Devnix-aiNetworkOffline'] = function() {
    State.online = false;
    Utils.show('flaynity-offline');
};

// --- REALTIME ENGINE & BOOTSTRAP ---
const App = {
    bootstrap: async () => {
        await Router.fetchPages();

        Services.init();
        HomeFeed.init();
        Player.init();
        ShortsPlayer.init();
        UploadPage.init();
        DiscoverPage.init();
        YouPage.init();
        Router.bindGlobalNavigation();

        window.addEventListener('offline', () => window['Devnix-aiNetworkOffline']());
        window.addEventListener('online', () => window['Devnix-aiNetworkOnline']());
        Utils.el('btn-retry-network').onclick = () => {
            if (window.AndroidBridge && typeof AndroidBridge.retryConnection === 'function') {
                AndroidBridge.retryConnection();
            } else if (navigator.onLine) {
                window['Devnix-aiNetworkOnline']();
            }
        };

        AuthSystem.init();

        document.addEventListener('contextmenu', e => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
            }
        });
    },

    startRealtimeListeners: () => {
        Services.addListener('videos', 'videos', (snapshot) => {
            const data = snapshot.val() || {};
            State.cache.videos = Object.keys(data).map(k => ({id: k, ...data[k]})).sort((a,b) => b.createdAt - a.createdAt);
            if (State.currentTab === 'home') HomeFeed.render();
        });

        Services.addListener('shorts', 'shorts', (snapshot) => {
            const data = snapshot.val() || {};
            State.cache.shorts = Object.keys(data).map(k => ({id: k, ...data[k]})).sort((a,b) => b.createdAt - a.createdAt);
            if (State.currentTab === 'home') HomeFeed.render();
            if (State.currentTab === 'shorts') ShortsPlayer.render();
        });

        Services.addListener('posts', 'posts', (snapshot) => {
            const data = snapshot.val() || {};
            State.cache.posts = Object.keys(data).map(k => ({id: k, ...data[k]})).sort((a,b) => b.createdAt - a.createdAt);
            if (State.currentTab === 'home') HomeFeed.render();
        });
    }
};

window.addEventListener('DOMContentLoaded', () => {
    App.bootstrap();
});
