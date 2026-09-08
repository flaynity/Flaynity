// =========================================================
// Flaynity secure upload client
// Browser NEVER receives R2 credentials. All uploads use server-issued
// presigned URLs and the Firebase ID token.
// =========================================================
const PUBLIC_API_ORIGIN = (window.PUBLIC_API_ORIGIN || 'https://api.flaynity.indevs.in').replace(/\/$/, '');
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
    return q === 'auto' ? (sources.hls || sources.dash || sources.original || '') : (sources[q] || sources.hls || sources.dash || sources.original || '');
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
    try { fetch(url, { method:'GET', headers:{Range:`bytes=0-${Math.max(65535, bytes-1)}`}, mode:'cors', credentials:'omit', cache:'force-cache' }).then(r => r.body?.cancel?.()).catch(()=>{}); } catch (_) {}
}

async function flaynityAuthToken() {
    const user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!user) throw new Error('Please sign in before uploading.');
    return user.getIdToken(true);
}

async function apiJson(path, options = {}) {
    const token = await flaynityAuthToken();
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    let response;
    try { response = await fetch(`${PUBLIC_API_ORIGIN}${path}`, { ...options, headers, credentials:'omit' }); }
    catch (e) { throw new Error(`API connection failed (${PUBLIC_API_ORIGIN}). Check Render/API domain and CORS.`); }
    const text = await response.text();
    let data = {}; try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) throw new Error(data.message || data.error || `API request failed (${response.status})`);
    return data;
}

function putToPresignedUrl(url, file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('Cache-Control', 'public,max-age=31536000,immutable');
        xhr.setRequestHeader('Content-Disposition', 'inline');
        xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round(e.loaded/e.total*100), e.loaded, e.total); };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error('Storage upload failed. Check R2 CORS policy.'));
        xhr.onabort = () => reject(new Error('Upload cancelled.'));
        xhr.send(file);
    });
}

async function createAndUploadMedia(file, type, mediaKind = 'image', onProgress) {
    if (!file) throw new Error('No file selected.');
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in before uploading.');
    const created = await apiJson('/v1/media/create-upload', {
        method:'POST', body:JSON.stringify({ uid:user.uid, type, fileName:file.name, contentType:file.type || (mediaKind==='video'?'video/mp4':'image/jpeg'), size:file.size, mediaKind })
    });
    await putToPresignedUrl(created.uploadUrl, file, onProgress);
    return created;
}

async function completeMediaUpload(created, meta = {}) {
    const user = auth.currentUser;
    return apiJson('/v1/media/complete-upload', { method:'POST', body:JSON.stringify({
        id:created.id, sourceKey:created.sourceKey, uid:user.uid, type:meta.type || 'post', title:meta.title || '', description:meta.description || '', visibility:meta.visibility || 'Public', duration:Number(meta.duration || 0), thumbKey:meta.thumbKey || '', mediaKind:meta.mediaKind || 'image'
    })});
}

async function pollMediaUpload(id, timeoutMs = 1800000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const data = await fetch(`${PUBLIC_API_ORIGIN}/v1/media/${encodeURIComponent(id)}`, {cache:'no-store'}).then(async r => { const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.message||d.error||`Status failed (${r.status})`); return d; });
        if (data.status === 'ready') return data;
        if (data.status === 'failed') throw new Error(data.error || 'Media processing failed.');
        await new Promise(r=>setTimeout(r,3000));
    }
    throw new Error('Media processing timed out.');
}

async function uploadImageToR2(file, folder = 'images', retries = 3) {
    const typeMap = {avatars:'images',banners:'images',posts:'post',thumbnails:'thumbnails'};
    const type = typeMap[folder] || 'images';
    let last;
    for (let i=1;i<=retries;i++) {
        try {
            const created = await createAndUploadMedia(file, type, 'image');
            const completed = await completeMediaUpload(created, {type, mediaKind:'image'});
            return completed.imageUrl || getFastMediaUrl(created.sourceKey);
        } catch(e) { last=e; if(i<retries) await new Promise(r=>setTimeout(r,1000*i)); }
    }
    throw last;
}

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}
