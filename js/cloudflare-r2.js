// =========================================================
// CLOUDFLARE R2 OBJECT STORAGE MODULE
// =========================================================
const R2_CONFIG = {};
// R2 credentials are intentionally not stored in the app. Uploads use the secure Render API.
const PUBLIC_R2_DOMAIN_PREFIX = "https://cdn.flaynity.indevs.in";
const LEGACY_R2_DOMAIN_PREFIX = "https://pub-92694602f8ec4e0fbbcbf4a91b194f69.r2.dev";

// =========================================================
// FLAYNITY ULTRA-FAST MEDIA DELIVERY
// =========================================================
const FLAYNITY_CDN_CONFIG = {
    origin: PUBLIC_R2_DOMAIN_PREFIX.replace(/\/$/, ''),
    preloadFeels: 3,
    aggressiveFeelsWindow: 1,
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

function warmMediaRange(url) { return; }


// Upload functions are provided by js/media-api.js.
// No R2 access keys or secrets are stored in the app.
async function uploadImageToR2(file, folder = "images", retries = 3, onProgress) {
    if (typeof window.FLaynityMediaAPI?.uploadImageToR2 !== "function") throw new Error("Media API is not loaded");
    return window.FLaynityMediaAPI.uploadImageToR2(file, folder, retries, onProgress);
}
async function uploadVideoToR2(file, folder = "videos", onProgress) {
    if (typeof window.FLaynityMediaAPI?.uploadVideoToR2 !== "function") throw new Error("Media API is not loaded");
    return window.FLaynityMediaAPI.uploadVideoToR2(file, folder, onProgress);
}
function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], {type:mime});
}
