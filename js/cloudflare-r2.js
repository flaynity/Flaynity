// Flaynity Cloudflare R2 media helpers.
// IMPORTANT: no R2 access keys or secrets are stored in the app.
const FLAYNITY_API_BASE = 'https://flaynity-api.flaynity.workers.dev';
const PUBLIC_R2_DOMAIN_PREFIX = 'https://cdn.flaynity.indevs.in';
const LEGACY_R2_DOMAIN_PREFIX = 'https://pub-92694602f8ec4e0fbbcbf4a91b194f69.r2.dev';

const FLAYNITY_CDN_CONFIG = {
    origin: PUBLIC_R2_DOMAIN_PREFIX.replace(/\/$/, ''),
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

async function uploadImageToR2(file, folder = 'images') {
    if (!file) throw new Error('No file selected.');
    const form = new FormData();
    form.append('file', file, file.name || 'upload.jpg');
    form.append('folder', String(folder || 'images'));

    const response = await fetch(FLAYNITY_API_BASE + '/upload', {
        method: 'POST',
        body: form
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || `Upload failed (${response.status})`);
    return data.url;
}

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], {type:mime});
}
