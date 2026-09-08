// =========================================================
// CLOUDFLARE R2 OBJECT STORAGE MODULE
// =========================================================
const PUBLIC_R2_DOMAIN_PREFIX = "https://cdn.flaynity.indevs.in";
const LEGACY_R2_DOMAIN_PREFIX = "https://pub-92694602f8ec4e0fbbcbf4a91b194f69.r2.dev";

// =========================================================
// FLAYNITY ULTRA-FAST MEDIA DELIVERY
// =========================================================
const FLAYNITY_CDN_CONFIG = {
    origin: PUBLIC_R2_DOMAIN_PREFIX.replace(/\/$/, ''),
    preloadFeels: 20,
    aggressiveFeelsWindow: 3,
    rangeWarmupBytes: 262144,
    cacheVersion: 'v3'
};

function getFastMediaUrl(urlOrKey) {
    if (!urlOrKey) return '';
    let value = String(urlOrKey).trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) {
        if (value.startsWith(LEGACY_R2_DOMAIN_PREFIX)) {
            value = FLAYNITY_CDN_CONFIG.origin + value.slice(LEGACY_R2_DOMAIN_PREFIX.length);
        }
        return value;
    }
    return FLAYNITY_CDN_CONFIG.origin + '/' + value.replace(/^\/+/, '');
}

function getMediaSources(media) {
    const item = media || {};
    const source = item.videoLink || item.videoUrl || item.streamUrl || item.url || '';
    const quality = item.qualityUrls || item.videoQualities || item.sources || {};
    const out = {};
    Object.keys(quality || {}).forEach(k => {
        const key = String(k).toLowerCase().replace(/p$/, '');
        if (/^(144|360|480|720|1080)$/.test(key) && quality[k]) out[key] = getFastMediaUrl(quality[k]);
    });
    if (item.hlsUrl || item.m3u8) out.hls = getFastMediaUrl(item.hlsUrl || item.m3u8);
    if (item.dashUrl || item.mpd) out.dash = getFastMediaUrl(item.dashUrl || item.mpd);
    out.original = getFastMediaUrl(source);
    return out;
}

function getPreferredMediaUrl(media, quality) {
    const sources = getMediaSources(media);
    const q = String(quality || 'auto').toLowerCase().replace(/p$/, '');
    // Auto prefers an adaptive manifest when one is available; otherwise direct CDN MP4.
    if (q === 'auto') return sources.hls || sources.dash || sources.original || '';
    return sources[q] || sources.hls || sources.dash || sources.original || '';
}

function setFastMediaAttributes(video, options) {
    if (!video) return;
    video.preload = options?.preload || 'auto';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('x-webkit-airplay', 'allow');
    video.setAttribute('disablepictureinpicture', '');
    video.setAttribute('controlslist', 'nodownload noplaybackrate');
    video.setAttribute('fetchpriority', options?.fetchPriority || 'high');
}

function warmMediaRange(url, bytes = FLAYNITY_CDN_CONFIG.rangeWarmupBytes) {
    if (!url || !/^https?:\/\//i.test(url) || typeof fetch !== 'function') return;
    try {
        fetch(url, {
            method: 'GET',
            headers: { Range: `bytes=0-${Math.max(65535, bytes - 1)}` },
            mode: 'cors',
            credentials: 'omit',
            cache: 'force-cache'
        }).then(r => { if (r.body && r.body.cancel) r.body.cancel(); }).catch(() => {});
    } catch (e) {}
}

// =========================================================
// SECURE FLAYNITY MEDIA UPLOAD API
// Browser NEVER receives R2 access/secret keys.
// =========================================================
const FLAYNITY_API_ORIGIN = (window.FLAYNITY_API_ORIGIN || 'https://api.flaynity.indevs.in').replace(/\/$/, '');

async function flaynityAuthHeaders() {
    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!user) throw new Error('Please sign in before uploading.');
    const token = await user.getIdToken(true);
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function flaynityUploadPut(url, file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        xhr.timeout = 30 * 60 * 1000;
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('Cache-Control', 'public,max-age=31536000,immutable');
        xhr.setRequestHeader('Content-Disposition', 'inline');
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && typeof onProgress === 'function') onProgress(e.loaded, e.total);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`R2 upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error while uploading to storage.'));
        xhr.ontimeout = () => reject(new Error('Upload timed out.'));
        xhr.onabort = () => reject(new Error('Upload cancelled.'));
        xhr.send(file);
    });
}

async function createSecureUpload(file, type, mediaKind, onProgress) {
    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!user) throw new Error('Please sign in before uploading.');
    if (!file) throw new Error('No file selected.');

    const createRes = await fetch(`${FLAYNITY_API_ORIGIN}/v1/media/create-upload`, {
        method: 'POST',
        headers: await flaynityAuthHeaders(),
        body: JSON.stringify({
            uid: user.uid,
            type,
            mediaKind,
            fileName: file.name || `upload_${Date.now()}`,
            contentType: file.type || (mediaKind === 'image' ? 'image/jpeg' : 'video/mp4'),
            size: file.size || 0
        })
    });
    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok) throw new Error(createData.message || createData.error || `Upload setup failed (${createRes.status})`);

    await flaynityUploadPut(createData.uploadUrl, file, onProgress);
    return createData;
}

async function completeSecureUpload(data) {
    const res = await fetch(`${FLAYNITY_API_ORIGIN}/v1/media/complete-upload`, {
        method: 'POST',
        headers: await flaynityAuthHeaders(),
        body: JSON.stringify(data)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.message || result.error || `Upload completion failed (${res.status})`);
    return result;
}

async function waitForMediaReady(id, onProgress, timeoutMs = 30 * 60 * 1000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const res = await fetch(`${FLAYNITY_API_ORIGIN}/v1/media/${encodeURIComponent(id)}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (data.status === 'ready') return data;
        if (data.status === 'failed') throw new Error(data.error || 'Media processing failed.');
        if (typeof onProgress === 'function') onProgress(data);
        await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error('Media processing timed out.');
}

async function uploadImageToR2(file, folder = 'images', retries = 3) {
    const typeMap = {
        avatars: 'images', banners: 'images', posts: 'post', images: 'images', thumbnails: 'thumbnails'
    };
    const mediaType = typeMap[String(folder)] || 'images';
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const created = await createSecureUpload(file, mediaType, 'image');
            const done = await completeSecureUpload({
                id: created.id,
                sourceKey: created.sourceKey,
                uid: auth.currentUser.uid,
                type: mediaType,
                mediaKind: 'image'
            });
            return done.imageUrl || getFastMediaUrl(done.sourceKey || created.sourceKey);
        } catch (err) {
            lastError = err;
            if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    throw lastError || new Error('Image upload failed.');
}

async function uploadVideoToFlaynity(file, type = 'feels', options = {}) {
    const created = await createSecureUpload(file, type, 'video', options.onProgress);
    return completeSecureUpload({
        id: created.id,
        sourceKey: created.sourceKey,
        uid: auth.currentUser.uid,
        type,
        title: options.title || '',
        description: options.description || '',
        visibility: options.visibility || 'Public',
        duration: Number(options.duration || 0),
        thumbKey: options.thumbKey || '',
        mediaKind: 'video'
    });
}

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], {type:mime});
}
