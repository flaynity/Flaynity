// =========================================================
// FLAYNITY SECURE MEDIA CLIENT
// R2 credentials NEVER belong in the WebView/frontend.
// Upload authorization is issued by Flaynity-Server.
// =========================================================
const FLAYNITY_API_BASE = "https://api.flaynity.indevs.in/api";
const FLAYNITY_MEDIA_BASE = "https://cdn.flaynity.indevs.in/media";
const LEGACY_R2_PUBLIC_PREFIX = "https://pub-92694602f8ec4e0fbbcbf4a91b194f69.r2.dev";

function normalizeFlaynityMediaUrl(url) {
    if (!url) return url;
    const value = String(url);
    if (value.startsWith(LEGACY_R2_PUBLIC_PREFIX + "/")) {
        const key = value.slice((LEGACY_R2_PUBLIC_PREFIX + "/").length).split(/[?#]/)[0];
        return flaynityMediaUrl(key) + (value.includes("?") ? value.slice(value.indexOf("?")) : "");
    }
    const cdnPrefix = "https://cdn.flaynity.indevs.in/";
    if (value.startsWith(cdnPrefix)) {
        const rest = value.slice(cdnPrefix.length);
        if (rest.startsWith("media/")) return value;
        return `${FLAYNITY_MEDIA_BASE}/${rest}`;
    }
    const oldWorkerMediaPrefix = "https://flaynity.indevs.in/media/";
    if (value.startsWith(oldWorkerMediaPrefix)) return value;
    return value;
}

function flaynityMediaUrl(key) {
    if (!key) return "";
    return `${FLAYNITY_MEDIA_BASE}/${String(key).split('/').map(encodeURIComponent).join('/')}`;
}

async function flaynityAuthHeaders() {
    const user = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    if (!user) throw new Error("Please sign in first.");
    // Force refresh so the server never receives a stale Firebase ID token.
    const token = await user.getIdToken(true);
    return { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
}

async function flaynityCreateUpload(file, folder = "images", options = {}) {
    if (!file) throw new Error("No file selected.");
    const safeFolder = String(folder || "images").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "images";
    const safeName = String(file.name || "file.bin").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140);
    const id = `${Date.now()}_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
    const key = `uploads/${safeFolder}/${id}_${safeName}`;

    async function requestUploadUrl(forceFreshToken) {
        const user = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
        if (!user) throw new Error("Please sign in first.");
        const token = await user.getIdToken(!!forceFreshToken);
        const response = await fetch(`${FLAYNITY_API_BASE}/v1/media/upload-url`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ key, contentType: file.type || options.contentType || "application/octet-stream", expiresIn: 900 }),
            cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
        return { response, data };
    }

    // First request uses the currently cached Firebase ID token. If the server
    // rejects it, immediately refresh Firebase auth and retry once.
    let result = await requestUploadUrl(false);
    if (result.response.status === 401) {
        result = await requestUploadUrl(true);
    }

    const { response, data } = result;
    if (!response.ok || !data.uploadUrl) {
        const serverError = data && (data.error || data.message);
        if (response.status === 401) {
            throw new Error(serverError || "Authentication token rejected. Please sign in again and retry.");
        }
        throw new Error(serverError || `Could not create secure upload URL (HTTP ${response.status}).`);
    }
    return { key: data.key || key, uploadUrl: data.uploadUrl, publicUrl: data.publicUrl || flaynityMediaUrl(data.key || key) };
}

function flaynityPutWithProgress(uploadUrl, file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && typeof onProgress === "function") onProgress(e.loaded, e.total);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed (${xhr.status}).`));
        };
        xhr.onerror = () => reject(new Error("Network error while uploading media."));
        xhr.onabort = () => reject(new Error("Upload aborted."));
        xhr.send(file);
    });
}

async function uploadImageToR2(file, folder = "images", retries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const upload = await flaynityCreateUpload(file, folder, { contentType: file.type || "image/jpeg" });
            await flaynityPutWithProgress(upload.uploadUrl, file);
            return upload.publicUrl;
        } catch (err) {
            lastError = err;
            if (attempt < retries) await new Promise(r => setTimeout(r, 600 * attempt));
        }
    }
    throw lastError || new Error("Image upload failed.");
}

async function uploadMediaToFlaynity(file, folder = "videos", onProgress) {
    const upload = await flaynityCreateUpload(file, folder, { contentType: file.type || "video/mp4" });
    await flaynityPutWithProgress(upload.uploadUrl, file, onProgress);
    return upload;
}


// =========================================================
// FLAYNITY SELF-HOSTED HLS TRANSCODER (NO CLOUDFLARE STREAM)
// =========================================================
const FLAYNITY_HLS_TRANSCODE_TIMEOUT = 30 * 60 * 1000;

async function flaynityHlsAuthToken(forceRefresh = false) {
    const user = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    if (!user) throw new Error('Please sign in first.');
    return user.getIdToken(!!forceRefresh);
}

async function flaynityStartHlsTranscode(sourceKey, contentType = 'video/mp4') {
    if (!sourceKey) throw new Error('Video source key is missing.');
    async function request(force) {
        const token = await flaynityHlsAuthToken(force);
        return fetch(`${FLAYNITY_API_BASE}/v1/media/transcode`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: sourceKey, contentType }),
            cache: 'no-store'
        });
    }
    let response = await request(false);
    if (response.status === 401) response = await request(true);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.jobId) throw new Error(data.error || `Could not start HLS encoding (HTTP ${response.status}).`);
    return data;
}

async function flaynityWaitForHlsReady(jobId, onStatus) {
    const started = Date.now();
    while (Date.now() - started < FLAYNITY_HLS_TRANSCODE_TIMEOUT) {
        const token = await flaynityHlsAuthToken(false);
        const response = await fetch(`${FLAYNITY_API_BASE}/v1/media/transcode/status/${encodeURIComponent(jobId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store'
        });
        if (response.status === 401) {
            const fresh = await flaynityHlsAuthToken(true);
            const retry = await fetch(`${FLAYNITY_API_BASE}/v1/media/transcode/status/${encodeURIComponent(jobId)}`, {
                headers: { 'Authorization': `Bearer ${fresh}` }, cache: 'no-store'
            });
            const retryData = await retry.json().catch(() => ({}));
            if (!retry.ok) throw new Error(retryData.error || `HLS status failed (HTTP ${retry.status}).`);
            if (typeof onStatus === 'function') onStatus(retryData);
            if (retryData.status === 'ready' && retryData.hlsUrl) return retryData;
            if (retryData.status === 'failed') throw new Error(retryData.message || 'HLS transcoding failed.');
        } else {
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `HLS status failed (HTTP ${response.status}).`);
            if (typeof onStatus === 'function') onStatus(data);
            if (data.status === 'ready' && data.hlsUrl) return data;
            if (data.status === 'failed') throw new Error(data.message || 'HLS transcoding failed.');
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('HLS transcoding is taking longer than expected. The original upload is safe; retry processing later.');
}

async function uploadVideoToFlaynityHls(file, options = {}, onProgress) {
    const folder = options.folder === 'feels' ? 'feels' : 'videos';
    const upload = await uploadMediaToFlaynity(file, folder, onProgress);
    const job = await flaynityStartHlsTranscode(upload.key, file.type || 'video/mp4');
    if (typeof options.onStatus === 'function') options.onStatus({ status: 'queued', progress: 0, message: 'HLS encoding queued...' });
    const ready = await flaynityWaitForHlsReady(job.jobId, status => {
        if (typeof options.onStatus === 'function') options.onStatus(status);
    });
    return {
        ...upload,
        provider: 'r2-hls',
        videoUrl: ready.hlsUrl,
        hlsUrl: ready.hlsUrl,
        dashUrl: '',
        hlsKey: ready.hlsKey || '',
        transcodeJobId: job.jobId,
        videoQualities: { auto: ready.hlsUrl, hls: ready.hlsUrl, preferred: [144, 360, 480, 720, 1080] }
    };
}
