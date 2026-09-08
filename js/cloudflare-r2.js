// =========================================================
// CLOUDFLARE R2 OBJECT STORAGE MODULE
// =========================================================
const R2_CONFIG = {
    accessKeyId: "c4d26ef58f7d0818695c8710af083fb6",
    secretAccessKey: "97bc62a7b0c961001611489e28f9dbd41d2b30cda3e8348bb32d12a7c1d319a8",
    endpoint: "https://b3741135bd1f3e96b6744f11e6a06600.r2.cloudflarestorage.com",
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
    region: 'auto',
    maxRetries: 5,
    httpOptions: {
        timeout: 300000, 
        connectTimeout: 30000
    }
};

AWS.config.update(R2_CONFIG);
const s3 = new AWS.S3({ params: { Bucket: 'flaynity-storage' } });
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
// S3 R2 OBJECT STORAGE MEDIA UPLOAD MODULE
// =========================================================
async function uploadImageToR2(file, folder = "images", retries = 3) {
    if (!s3) throw new Error("R2 Client storage unit is not configured.");
    const uniqueId = "img_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const uid = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.uid : 'public';
    const safeFolder = String(folder || 'images').replace(/^\/+|\/+$/g, '');
    const fileKey = `${safeFolder}/${uid}/${Date.now()}_${uniqueId}_${file.name.replace(/\s+/g, '_')}`;
    const params = {
        Key: fileKey,
        Body: file,
        ContentType: file.type || "image/jpeg",
        CacheControl: "public,max-age=31536000,immutable"
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await s3.putObject(params).promise();
            return `${PUBLIC_R2_DOMAIN_PREFIX}/${fileKey}`;
        } catch (err) {
            console.warn(`R2 Image Upload attempt ${attempt} failed:`, err);
            if (attempt === retries) throw err;
            await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
        }
    }
}

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}
