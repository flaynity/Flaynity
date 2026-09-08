// =========================================================
// FLAYNITY MEDIA / CLOUDFLARE R2 HELPERS
// Browser NEVER receives R2 credentials. Uploads use server-issued presigned URLs.
// =========================================================
const FLAYNITY_API_ORIGIN = (window.FLAYNITY_API_ORIGIN || 'https://api.flaynity.indevs.in').replace(/\/$/, '');
const PUBLIC_R2_DOMAIN_PREFIX = 'https://cdn.flaynity.indevs.in';
const LEGACY_R2_DOMAIN_PREFIX = 'https://pub-92694602f8ec4e0fbbcbf4a91b194f69.r2.dev';
const FLAYNITY_CDN_CONFIG = {
    origin: PUBLIC_R2_DOMAIN_PREFIX,
    preloadFeels: 20,
    aggressiveFeelsWindow: 3,
    rangeWarmupBytes: 262144,
    cacheVersion: 'v4'
};

function getFastMediaUrl(urlOrKey) {
    if (!urlOrKey) return '';
    let value = String(urlOrKey).trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) {
        if (value.startsWith(LEGACY_R2_DOMAIN_PREFIX)) value = FLAYNITY_CDN_CONFIG.origin + value.slice(LEGACY_R2_DOMAIN_PREFIX.length);
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
    fetch(url, { method: 'GET', headers: { Range: `bytes=0-${Math.max(65535, bytes - 1)}` }, mode: 'cors', credentials: 'omit', cache: 'force-cache' })
        .then(r => { if (r.body?.cancel) r.body.cancel(); }).catch(() => {});
}

async function flaynityApiFetch(path, options = {}) {
    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!user) throw new Error('Please sign in before uploading.');
    const token = await user.getIdToken(true);
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type') && !(options.body instanceof Blob) && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${FLAYNITY_API_ORIGIN}${path}`, { ...options, headers, credentials: 'omit' });
    let data = null;
    const text = await response.text();
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
    if (!response.ok) throw new Error(data?.message || data?.error || `API request failed (${response.status})`);
    return data;
}

async function createUploadSession(file, type, mediaKind = 'image') {
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in before uploading.');
    return flaynityApiFetch('/v1/media/create-upload', {
        method: 'POST',
        body: JSON.stringify({ uid: user.uid, type, fileName: file.name || 'upload', contentType: file.type || (mediaKind === 'image' ? 'image/jpeg' : 'video/mp4'), size: file.size || 0, mediaKind })
    });
}

async function uploadToPresignedUrl(uploadUrl, file, onProgress) {
    // fetch() cannot expose upload progress, so XMLHttpRequest is used only for progress UI.
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total); };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error('Network error while uploading to storage.'));
        xhr.onabort = () => reject(new Error('Upload cancelled.'));
        xhr.send(file);
    });
}

async function uploadImageToR2(file, folder = 'images') {
    const allowed = ['avatars','banners','posts','images','thumbnails'];
    const type = allowed.includes(folder) ? folder : 'images';
    const session = await createUploadSession(file, type, 'image');
    await uploadToPresignedUrl(session.uploadUrl, file);
    const completed = await flaynityApiFetch('/v1/media/complete-upload', {
        method: 'POST',
        body: JSON.stringify({ id: session.id, sourceKey: session.sourceKey, uid: auth.currentUser.uid, type, mediaKind: 'image' })
    });
    return completed.imageUrl || getFastMediaUrl(session.sourceKey);
}

function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]);
    let n = bstr.length; const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], {type:mime});
}
