/*
 * ==============================================================================
 * FLAYNITY - MASTER APPLICATION LOGIC (Crash-Proof WebView Optimized)
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
    user: null, channel: null, currentTab: 'home',
    online: navigator.onLine,
    cache: { videos: [], shorts: [], posts: [], channels: {}, subscriptions: {} },
    activeListeners: {}, currentPlayingVideo: null
};

// --- UTILITIES ---
const Utils = {
    el: (id) => document.getElementById(id),
    show: (id) => { const e = Utils.el(id); if (e) e.classList.remove('flaynity-hidden'); },
    hide: (id) => { const e = Utils.el(id); if (e) e.classList.add('flaynity-hidden'); },
    timeAgo: (timestamp) => {
        if (!timestamp) return 'Just now';
        const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
        let interval = seconds / 31536000; if (interval > 1) return Math.floor(interval) + " yrs ago";
        interval = seconds / 2592000; if (interval > 1) return Math.floor(interval) + " mos ago";
        interval = seconds / 86400; if (interval > 1) return Math.floor(interval) + " days ago";
        interval = seconds / 3600; if (interval > 1) return Math.floor(interval) + " hrs ago";
        interval = seconds / 60; if (interval > 1) return Math.floor(interval) + " mins ago";
        return Math.floor(seconds) + " sec ago";
    },
    formatViews: (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num || 0;
    },
    vibrate: () => { if (navigator.vibrate) navigator.vibrate(50); },
    secureText: (str) => { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
};

// Safe onClick Binder (Prevent Null Errors)
const onClick = (id, fn) => {
    const element = Utils.el(id);
    if (element) element.onclick = fn;
    else console.warn("Element missing for click binding:", id);
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

// --- SERVICES ---
let auth, db, s3Client;
const Services = {
    init: () => {
        if (!firebase.apps.length) firebase.initializeApp(CONFIG.firebase);
        auth = firebase.auth();
        db = firebase.database();
        if (typeof AWS !== 'undefined') {
            AWS.config.update({
                accessKeyId: CONFIG.r2.accessKey, secretAccessKey: CONFIG.r2.secretKey,
                region: 'auto', endpoint: CONFIG.r2.endpoint,
                s3ForcePathStyle: true, signatureVersion: 'v4'
            });
            s3Client = new AWS.S3();
        }
    },
    uploadFile: (file, folder) => {
        return new Promise((resolve, reject) => {
            if (!s3Client) return reject("R2 Engine Not Initialized");
            const ext = file.name.split('.').pop();
            const key = `uploads/${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const req = s3Client.upload({ Bucket: CONFIG.r2.bucket, Key: key, Body: file, ContentType: file.type, ACL: 'public-read' });
            req.on('httpUploadProgress', (evt) => UI.updateUploadProgress(Math.round((evt.loaded * 100) / evt.total)));
            req.send((err, data) => { if (err) reject(err); else resolve(`${CONFIG.r2.publicUrl}/${key}`); });
        });
    },
    addListener: (id, path, callback) => {
        if (State.activeListeners[id]) return;
        const dbRef = db.ref(path);
        const wrapper = (snapshot) => callback(snapshot);
        dbRef.on('value', wrapper);
        State.activeListeners[id] = { ref: dbRef, cb: wrapper };
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

        onClick('btn-google-signin', async () => {
            if (window.AndroidBridge && typeof AndroidBridge.triggerGoogleSignIn === 'function') {
                AndroidBridge.triggerGoogleSignIn();
            } else {
                try {
                    const provider = new firebase.auth.GoogleAuthProvider();
                    await auth.signInWithRedirect(provider);
                } catch (error) { UI.toast("Auth failed."); }
            }
        });
    },
    loadUserProfile: async () => {
        await db.ref(`users/${State.user.uid}`).update({
            displayName: State.user.displayName, email: State.user.email,
            photoURL: State.user.photoURL, lastLogin: firebase.database.ServerValue.TIMESTAMP
        });
        db.ref('channels').orderByChild('uid').equalTo(State.user.uid).on('value', (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                State.channel = data[Object.keys(data)[0]];
                State.channel.id = Object.keys(data)[0];
            } else State.channel = null;
            YouPage.updateProfileUI();
        });
    },
    signOut: async () => { await auth.signOut(); window.location.reload(); }
};

window.handleNativeGoogleSignIn = (idToken) => {
    const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
    auth.signInWithCredential(credential).catch(err => UI.toast("Google Error: " + err.message));
};

// --- CONTROLLERS ---
const HomeFeed = {
    init: () => onClick('btn-home-search', () => Router.switchTab('discover')),
    render: () => {
        const c = Utils.el('home-feed-container');
        if (!c) return; c.innerHTML = '';
        const { videos: v, shorts: s, posts: p } = State.cache;
        if (!v.length && !s.length && !p.length) {
            c.innerHTML = `<div style="padding:40px;text-align:center;color:var(--flaynity-text-secondary);">No content available.</div>`;
            return;
        }
        let vIdx = 0, sIdx = 0, pIdx = 0, isRunning = true;
        while(isRunning) {
            let added = false;
            if (sIdx < s.length) { c.appendChild(HomeFeed.buildShortsGrid(s.slice(sIdx, sIdx + 6))); sIdx += 6; added = true; }
            if (vIdx < v.length) { v.slice(vIdx, vIdx + 10).forEach(video => c.appendChild(HomeFeed.buildVideoCard(video))); vIdx += 10; added = true; }
            if (pIdx < p.length) { c.appendChild(HomeFeed.buildPostCard(p[pIdx])); pIdx++; added = true; }
            if (!added) isRunning = false;
        }
    },
    buildVideoCard: (data) => {
        const div = document.createElement('div'); div.className = 'long-video-card';
        div.innerHTML = `<div class="lv-thumbnail-box"><img src="${data.thumbnailUrl || ''}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;"><div class="lv-duration">${data.duration || '0:00'}</div></div>
            <div class="lv-info-row"><img class="lv-avatar" src="${data.channelAvatar || ''}" alt=""><div class="lv-text"><div class="lv-title">${Utils.secureText(data.title)}</div><div class="lv-meta">${Utils.secureText(data.channelName)} • ${Utils.formatViews(data.views || 0)} views • ${Utils.timeAgo(data.createdAt)}</div></div></div>`;
        div.onclick = () => Player.open(data); return div;
    },
    buildShortsGrid: (data) => {
        const sec = document.createElement('div'); sec.className = 'shorts-grid-section';
        let html = `<div class="shorts-grid-header"><span class="material-symbols-outlined">app_shortcut</span> Shorts</div><div class="s-grid">`;
        data.forEach(s => { html += `<div class="s-card" data-id="${s.id}"><img src="${s.thumbnailUrl || s.cdnVideoUrl}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;"><div class="s-card-title">${Utils.secureText(s.title)}</div></div>`; });
        html += `</div>`; sec.innerHTML = html;
        sec.querySelectorAll('.s-card').forEach(card => card.onclick = () => { Router.switchTab('shorts'); ShortsPlayer.scrollTo(card.dataset.id); });
        return sec;
    },
    buildPostCard: (data) => {
        const div = document.createElement('div'); div.className = 'post-card';
        div.innerHTML = `<div class="post-header"><img class="post-avatar" src="${data.channelAvatar || ''}"><div><div class="post-user">${Utils.secureText(data.channelName)}</div><div class="post-time">${Utils.timeAgo(data.createdAt)}</div></div><div class="post-subscribe">Subscribe</div></div>
            <div class="post-text">${Utils.secureText(data.text || '')}</div>${data.imageUrl ? `<div class="post-image-grid count-1"><img src="${data.imageUrl}"></div>` : ''}
            <div class="post-stats"><div class="post-reactions-icons">👍 ❤️ ${data.likes || 0}</div><div>${data.comments || 0} comments</div></div>
            <div class="post-actions"><div class="p-action-btn"><span class="material-symbols-outlined">thumb_up</span> Like</div><div class="p-action-btn"><span class="material-symbols-outlined">chat_bubble</span> Comment</div><div class="p-action-btn"><span class="material-symbols-outlined">share</span> Share</div></div>`;
        return div;
    }
};

const Player = {
    init: () => onClick('btn-close-watch', Player.close),
    open: (videoData) => {
        const layer = Utils.el('flaynity-watch-page'); const videoEl = Utils.el('main-video-player');
        if(!layer || !videoEl) return;
        Utils.el('wp-title').innerText = videoData.title;
        Utils.el('wp-stats').innerText = `${Utils.formatViews(videoData.views || 0)} views • ${Utils.timeAgo(videoData.createdAt)}`;
        Utils.el('wp-channel-handle').innerText = videoData.channelName;
        Utils.el('wp-like-count').innerText = Utils.formatViews(videoData.likes || 0);
        Utils.el('wp-channel-avatar').src = videoData.channelAvatar || ''; Utils.show('wp-channel-avatar');
        videoEl.src = videoData.cdnVideoUrl; videoEl.play().catch(e => console.log("Autoplay prevented"));
        layer.classList.add('active'); State.currentPlayingVideo = videoEl; Router.addBackState('player');
        if (videoData.id) db.ref(`videos/${videoData.id}/views`).transaction(c => (c || 0) + 1);
    },
    close: () => {
        const layer = Utils.el('flaynity-watch-page'); const videoEl = Utils.el('main-video-player');
        if(videoEl) { videoEl.pause(); videoEl.src = ''; }
        if(layer) layer.classList.remove('active');
        State.currentPlayingVideo = null;
    }
};

const ShortsPlayer = {
    observer: null,
    init: () => {
        const c = Utils.el('shorts-feed-container'); if (!c) return;
        ShortsPlayer.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const v = entry.target.querySelector('video'); if (!v) return;
                if (entry.isIntersecting) { v.play().catch(e=>{}); State.currentPlayingVideo = v; }
                else { v.pause(); v.currentTime = 0; }
            });
        }, { threshold: 0.6 });
    },
    render: () => {
        const c = Utils.el('shorts-feed-container'); if (!c) return; c.innerHTML = '';
        if (!State.cache.shorts.length) { c.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;">No Shorts available.</div>`; return; }
        State.cache.shorts.forEach(s => {
            const div = document.createElement('div'); div.className = 'short-view-container'; div.id = `short-view-${s.id}`;
            div.innerHTML = `<video class="short-video-element" src="${s.cdnVideoUrl}" loop playsinline preload="auto"></video>
                <div class="short-ui-overlay"><div class="short-actions-sidebar"><div class="s-action-btn like-btn"><span class="material-symbols-outlined">favorite</span><span class="count">${Utils.formatViews(s.likes || 0)}</span></div><div class="s-action-btn"><span class="material-symbols-outlined">chat</span><span class="count">${Utils.formatViews(s.comments || 0)}</span></div><div class="music-disc-wrapper disc-spin"><span class="material-symbols-outlined">music_note</span></div></div>
                <div class="short-bottom-details"><div class="short-channel-row"><img src="${s.channelAvatar || ''}"><span class="short-handle">${Utils.secureText(s.channelName)}</span><button class="short-sub-btn">Subscribe</button></div><div class="short-title-text">${Utils.secureText(s.title)}</div></div><div class="short-center-play-indicator"><span class="material-symbols-outlined">play_arrow</span></div></div>`;
            
            let lastTap = 0;
            div.addEventListener('click', (e) => {
                const now = new Date().getTime(); const ts = now - lastTap;
                if (ts < 300 && ts > 0) {
                    Utils.vibrate(); const i = div.querySelector('.like-btn .material-symbols-outlined');
                    i.style.color = 'var(--flaynity-accent)'; i.style.transform = 'scale(1.3)'; setTimeout(() => i.style.transform = 'scale(1)', 200);
                } else {
                    const v = div.querySelector('video'), ind = div.querySelector('.short-center-play-indicator');
                    if (v.paused) { v.play(); ind.querySelector('span').innerText = 'play_arrow'; } else { v.pause(); ind.querySelector('span').innerText = 'pause'; }
                    ind.classList.add('indicator-flash'); setTimeout(() => ind.classList.remove('indicator-flash'), 400);
                }
                lastTap = now;
            });
            c.appendChild(div); ShortsPlayer.observer.observe(div);
        });
    },
    scrollTo: (id) => { const e = Utils.el(`short-view-${id}`); if(e) e.scrollIntoView({behavior: 'smooth'}); }
};

const UploadPage = {
    activeFile: null,
    init: () => {
        onClick('btn-close-upload-sheet', UploadPage.closeSheet);
        onClick('upload-backdrop', (e) => { if(e.target.id === 'upload-backdrop') UploadPage.closeSheet(); });
        onClick('btn-create-video', () => UploadPage.openFlow('flow-video'));
        onClick('btn-create-short', () => UploadPage.openFlow('flow-short'));
        onClick('btn-create-post', () => UploadPage.openFlow('flow-post'));
        onClick('btn-close-video-flow', UploadPage.closeAll);
        onClick('btn-close-short-flow', UploadPage.closeAll);
        onClick('btn-close-post-flow', UploadPage.closeAll);
        onClick('btn-back-short-details', () => Utils.hide('short-details-ui'));

        onClick('video-file-picker-trigger', () => { const f=Utils.el('input-video-file'); if(f) f.click(); });
        const vInput = Utils.el('input-video-file');
        if (vInput) vInput.onchange = (e) => {
            const file = e.target.files[0];
            if(file) { UploadPage.activeFile = file; Utils.el('video-preview-element').src = URL.createObjectURL(file); Utils.show('video-preview-element'); }
        };

        onClick('post-image-picker-trigger', () => { const f=Utils.el('input-post-file'); if(f) f.click(); });
        const pInput = Utils.el('input-post-file');
        if (pInput) pInput.onchange = (e) => {
            const file = e.target.files[0];
            if(file) { UploadPage.activeFile = file; Utils.el('post-image-preview').src = URL.createObjectURL(file); Utils.show('post-image-preview'); }
        };

        onClick('btn-publish-video', () => UploadPage.publish('video'));
        onClick('btn-publish-post', () => UploadPage.publish('post'));
        onClick('btn-publish-short', () => UploadPage.publish('short'));
        
        onClick('btn-short-next', () => Utils.show('short-details-ui'));
        onClick('btn-short-gallery', () => { const f=Utils.el('input-short-file'); if(f) f.click(); });
        const sInput = Utils.el('input-short-file');
        if(sInput) sInput.onchange = (e) => { if(e.target.files[0]) { UploadPage.activeFile = e.target.files[0]; Utils.show('short-details-ui'); } };
    },
    openSheet: () => {
        if (!State.channel) { UI.toast("Create a channel first."); Router.switchTab('you'); return; }
        const b = Utils.el('upload-backdrop'), s = Utils.el('upload-sheet');
        if(b && s) { b.style.display = 'flex'; void b.offsetWidth; b.classList.add('active'); s.classList.add('active'); Router.addBackState('upload-sheet'); }
    },
    closeSheet: () => {
        const b = Utils.el('upload-backdrop'), s = Utils.el('upload-sheet');
        if(b && s) { b.classList.remove('active'); s.classList.remove('active'); setTimeout(() => b.style.display = 'none', 300); }
    },
    openFlow: (id) => {
        UploadPage.closeSheet(); UploadPage.activeFile = null;
        Utils.hide('video-preview-element'); Utils.hide('post-image-preview');
        const f = Utils.el(id); if(f) { f.classList.remove('flaynity-hidden'); setTimeout(() => f.classList.add('active'), 10); Router.addBackState('upload-flow'); }
    },
    closeAll: () => {
        ['flow-video', 'flow-short', 'flow-post', 'short-details-ui'].forEach(id => {
            const el = Utils.el(id); if(el) { el.classList.remove('active'); setTimeout(() => el.classList.add('flaynity-hidden'), 300); }
        }); UploadPage.activeFile = null;
    },
    publish: async (type) => {
        if (!State.channel) return UI.toast("Channel required.");
        let meta = { uid: State.user.uid, channelId: State.channel.id, channelName: State.channel.channelName, channelAvatar: State.channel.avatarUrl || '', createdAt: firebase.database.ServerValue.TIMESTAMP, views: 0, likes: 0, comments: 0 };
        if (type === 'video') {
            meta.title = Utils.el('input-video-title').value.trim();
            if (!meta.title || !UploadPage.activeFile) return UI.toast("Title and Video are required.");
            meta.description = Utils.el('input-video-desc').value; meta.visibility = Utils.el('input-video-visibility').value; meta.category = Utils.el('input-video-category').value;
        } else if (type === 'short') {
            meta.title = Utils.el('input-short-title').value.trim();
            if (!meta.title || !UploadPage.activeFile) return UI.toast("Caption/Video required.");
            meta.visibility = Utils.el('input-short-visibility').value;
        } else if (type === 'post') {
            meta.text = Utils.el('input-post-text').value.trim();
            if (!meta.text && !UploadPage.activeFile) return UI.toast("Content required.");
        }
        try {
            UI.showUploadProgress();
            if (UploadPage.activeFile) {
                const r2Url = await Services.uploadFile(UploadPage.activeFile, `${type}s/${State.user.uid}`);
                if (type === 'post') meta.imageUrl = r2Url; else meta.cdnVideoUrl = r2Url;
            }
            await db.ref(`${type}s`).push().set(meta);
            UI.hideUploadProgress(); UI.toast("Published!"); UploadPage.closeAll(); Router.switchTab('home');
        } catch (e) { UI.hideUploadProgress(); UI.toast("Upload failed."); }
    }
};

const DiscoverPage = {
    init: () => {
        document.querySelectorAll('.discover-categories-scroll .d-chip').forEach(c => c.onclick = () => {
            document.querySelectorAll('.d-chip').forEach(x => x.classList.remove('active')); c.classList.add('active');
        });
    }
};

const YouPage = {
    init: () => {
        onClick('btn-sign-out', AuthSystem.signOut);
        onClick('btn-create-channel', () => { const l=Utils.el('layer-create-channel'); if(l){ l.classList.add('active'); Router.addBackState('layer'); } });
        onClick('btn-view-channel', () => { YouPage.openViewChannel(); Router.addBackState('layer'); });
        onClick('btn-open-edit-channel', () => { YouPage.openEditChannel(); Router.addBackState('layer'); });
        onClick('btn-open-analytics', () => { const l=Utils.el('layer-analytics'); if(l){ l.classList.add('active'); Router.addBackState('layer'); } });
        
        document.querySelectorAll('.btn-back-layer').forEach(btn => btn.onclick = (e) => e.target.closest('.you-sub-layer').classList.remove('active'));
        document.querySelectorAll('.vc-tab').forEach(tab => tab.onclick = (e) => {
            document.querySelectorAll('.vc-tab').forEach(t => t.classList.remove('active')); e.target.classList.add('active'); YouPage.renderChannelContent(e.target.dataset.tab);
        });

        onClick('picker-create-avatar', () => { const f=Utils.el('input-create-avatar'); if(f) f.click(); });
        let createAvFile = null; const avInp = Utils.el('input-create-avatar');
        if(avInp) avInp.onchange = (e) => { createAvFile = e.target.files[0]; if(createAvFile) Utils.el('preview-create-avatar').src = URL.createObjectURL(createAvFile); };

        onClick('btn-submit-create-channel', async () => {
            const name = Utils.el('input-create-name').value.trim(), handle = Utils.el('input-create-handle').value.trim();
            if(!name || !handle) return UI.toast("Name and handle required.");
            try {
                UI.showUploadProgress();
                let avatarUrl = State.user.photoURL; 
                if(createAvFile) avatarUrl = await Services.uploadFile(createAvFile, `avatars/${State.user.uid}`);
                await db.ref('channels').push().set({ uid: State.user.uid, channelName: name, handle: handle, avatarUrl: avatarUrl, category: Utils.el('input-create-category').value, createdAt: firebase.database.ServerValue.TIMESTAMP, subscribersCount: 0 });
                UI.hideUploadProgress(); UI.toast("Channel created!"); Utils.el('layer-create-channel').classList.remove('active');
            } catch(e) { UI.hideUploadProgress(); UI.toast("Error creating channel."); }
        });
    },
    updateProfileUI: () => {
        const a = Utils.el('you-google-avatar'), n = Utils.el('you-google-name'), e = Utils.el('you-google-email');
        if(a) a.src = State.user.photoURL || ''; if(n) n.innerText = State.user.displayName || 'User'; if(e) e.innerText = State.user.email || '';
        if (State.channel) { Utils.hide('btn-create-channel'); Utils.show('btn-view-channel'); } else { Utils.show('btn-create-channel'); Utils.hide('btn-view-channel'); }
    },
    openViewChannel: () => {
        if (!State.channel) return;
        const l = Utils.el('layer-view-channel'); if(l) l.classList.add('active');
        const ch = State.channel;
        Utils.el('vc-avatar-img').src = ch.avatarUrl || State.user.photoURL;
        if(ch.bannerUrl) { Utils.el('vc-banner-img').src = ch.bannerUrl; Utils.show('vc-banner-img'); }
        Utils.el('vc-name-text').innerText = ch.channelName; Utils.el('vc-handle-text').innerText = ch.handle;
        Utils.el('vc-subs-text').innerText = Utils.formatViews(ch.subscribersCount || 0);
        YouPage.renderChannelContent('videos');
    },
    renderChannelContent: (tabName) => {
        const area = Utils.el('vc-content-area'); if(!area) return; area.innerHTML = '';
        let items = [];
        if (tabName === 'videos') items = State.cache.videos.filter(v => v.uid === State.user.uid);
        else if (tabName === 'shorts') items = State.cache.shorts.filter(s => s.uid === State.user.uid);
        else if (tabName === 'posts') items = State.cache.posts.filter(p => p.uid === State.user.uid);

        if (items.length === 0) { area.innerHTML = `<div style="text-align:center;padding:32px;color:var(--flaynity-text-secondary);">No ${tabName} found.</div>`; return; }
        items.forEach(item => { const div = document.createElement('div'); div.style.padding = '12px 0'; div.style.borderBottom = '1px solid var(--flaynity-divider)'; div.innerText = item.title || item.text || 'Untitled'; area.appendChild(div); });
    },
    openEditChannel: () => {
        const ch = State.channel; if(!ch) return;
        const l = Utils.el('layer-edit-channel'); if(l) l.classList.add('active');
        Utils.el('input-edit-name').value = ch.channelName || ''; Utils.el('input-edit-handle').value = ch.handle || ''; Utils.el('input-edit-desc').value = ch.description || '';
    }
};

// --- ROUTER & NAVIGATION ---
const Router = {
    pages: ['home', 'shorts', 'upload', 'discover', 'you'], history: ['home'],
    fetchPages: async () => {
        const appRoot = document.getElementById('app');
        for (const p of Router.pages) {
            const res = await fetch(`pages/${p}.html`);
            if (!res.ok) throw new Error(`Could not find 'pages/${p}.html' on server.`);
            const html = await res.text();
            if (html.includes('<title>Flaynity</title>')) throw new Error(`Folder Error: Cloudflare returned index.html instead of ${p}.html. Ensure 'pages' folder exists!`);
            const c = document.createElement('div'); c.id = `page-container-${p}`;
            c.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;display:' + (p === 'home' ? 'block' : 'none');
            c.innerHTML = html; appRoot.appendChild(c);
        }
    },
    bindGlobalNavigation: () => {
        document.querySelectorAll('.nav-item').forEach(el => el.addEventListener('click', () => {
            const tab = el.dataset.tab; if (tab === 'upload') UploadPage.openSheet(); else Router.switchTab(tab);
        }));
    },
    switchTab: (tabName) => {
        if(tabName === 'upload') return;
        if (State.currentPlayingVideo && tabName !== 'shorts') State.currentPlayingVideo.pause();
        Router.pages.forEach(p => { if (p !== 'upload') { const el = document.getElementById(`page-container-${p}`); if (el) el.style.display = 'none'; } });
        const target = document.getElementById(`page-container-${tabName}`); if (target) target.style.display = 'block';
        document.querySelectorAll('.nav-item').forEach(el => { if (el.dataset.tab !== 'upload') el.classList.toggle('active', el.dataset.tab === tabName); });
        State.currentTab = tabName;
        if (Router.history[Router.history.length - 1] !== tabName) { Router.history.push(tabName); Router.updateAndroidBackStack(); }
        if (tabName === 'shorts') ShortsPlayer.render();
    },
    updateAndroidBackStack: () => { if (window.AndroidBridge && typeof AndroidBridge.setBackStackStatus === 'function') AndroidBridge.setBackStackStatus(Router.history.length > 1); },
    addBackState: (stateType) => { Router.history.push(stateType); Router.updateAndroidBackStack(); }
};

window.app = {
    executeBackAction: () => {
        const wPage = Utils.el('flaynity-watch-page'), uSheet = Utils.el('upload-sheet');
        if (wPage && wPage.classList.contains('active')) { Player.close(); Router.history.pop(); Router.updateAndroidBackStack(); return; }
        if (uSheet && uSheet.classList.contains('active')) { UploadPage.closeSheet(); Router.history.pop(); Router.updateAndroidBackStack(); return; }
        if ((Utils.el('flow-video') && Utils.el('flow-video').classList.contains('active')) || (Utils.el('flow-short') && Utils.el('flow-short').classList.contains('active')) || (Utils.el('flow-post') && Utils.el('flow-post').classList.contains('active'))) { UploadPage.closeAll(); Router.history.pop(); Router.updateAndroidBackStack(); return; }
        
        const subLayers = document.querySelectorAll('.you-sub-layer.active');
        if (subLayers.length > 0) { subLayers.forEach(l => l.classList.remove('active')); Router.history.pop(); Router.updateAndroidBackStack(); return; }

        if (Router.history.length > 1) { Router.history.pop(); Router.switchTab(Router.history.pop()); }
    }
};

// --- BOOTSTRAP ENGINE ---
const App = {
    bootstrap: async () => {
        try {
            if (typeof firebase === 'undefined') throw new Error("Firebase SDK failed to load. Check your internet connection.");
            
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

        } catch (error) {
            console.error("Bootstrap Error:", error);
            const splash = document.getElementById('flaynity-splash');
            if (splash) {
                splash.innerHTML = `
                    <div style="padding: 20px; color: #ff4444; text-align: center; background: #fff; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center;">
                        <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 10px;">error</span>
                        <h2 style="margin-bottom: 10px;">App Loading Failed</h2>
                        <p style="font-size: 14px; font-weight: bold;">${error.message}</p>
                        <p style="font-size: 13px; color: #666; margin-top: 20px; line-height: 1.5;">
                            <b>Solutions:</b><br>
                            1. Go to Android Settings > Apps > Clear Data & Cache for this app.<br>
                            2. Ensure the 'pages' folder is properly uploaded to Cloudflare.
                        </p>
                    </div>`;
            } else {
                alert("Error Loading App: " + error.message);
            }
        }
    },
    startRealtimeListeners: () => {
        Services.addListener('videos', 'videos', (s) => { State.cache.videos = Object.keys(s.val()||{}).map(k=>({id:k,...s.val()[k]})).sort((a,b)=>b.createdAt-a.createdAt); if(State.currentTab==='home') HomeFeed.render(); });
        Services.addListener('shorts', 'shorts', (s) => { State.cache.shorts = Object.keys(s.val()||{}).map(k=>({id:k,...s.val()[k]})).sort((a,b)=>b.createdAt-a.createdAt); if(State.currentTab==='home') HomeFeed.render(); if(State.currentTab==='shorts') ShortsPlayer.render(); });
        Services.addListener('posts', 'posts', (s) => { State.cache.posts = Object.keys(s.val()||{}).map(k=>({id:k,...s.val()[k]})).sort((a,b)=>b.createdAt-a.createdAt); if(State.currentTab==='home') HomeFeed.render(); });
    }
};

window.addEventListener('DOMContentLoaded', () => App.bootstrap());
