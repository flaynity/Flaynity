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
// CLOUDFLARE STREAM: ADAPTIVE VIDEO UPLOAD / HLS PLAYBACK
// =========================================================
const FLAYNITY_STREAM_ENABLED = true;
const FLAYNITY_STREAM_CAPABILITY_TTL = 5 * 60 * 1000;
let flaynityStreamCapabilityCache = { checkedAt: 0, enabled: false };

async function flaynityStreamAvailable(force = false) {
    if (!force && Date.now() - flaynityStreamCapabilityCache.checkedAt < FLAYNITY_STREAM_CAPABILITY_TTL) {
        return flaynityStreamCapabilityCache.enabled;
    }
    try {
        const response = await fetch(`${FLAYNITY_API_BASE}/v1/stream/capability`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        const enabled = !!(response.ok && data && data.enabled);
        flaynityStreamCapabilityCache = { checkedAt: Date.now(), enabled };
        return enabled;
    } catch (e) {
        flaynityStreamCapabilityCache = { checkedAt: Date.now(), enabled: false };
        return false;
    }
}
const FLAYNITY_STREAM_STATUS_TIMEOUT = 300000;
const FLAYNITY_TUS_CHUNK_SIZE = 50 * 1024 * 1024;

async function flaynityStreamAuthToken() {
    const user = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    if (!user) throw new Error("Please sign in first.");
    return user.getIdToken(true);
}

async function flaynityStreamRequest(path, options = {}) {
    const token = await flaynityStreamAuthToken();
    const headers = { ...(options.headers || {}), "Authorization": `Bearer ${token}` };
    if (!headers["Content-Type"] && options.body && typeof options.body === "string") headers["Content-Type"] = "application/json";
    const response = await fetch(`${FLAYNITY_API_BASE}${path}`, { ...options, headers, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Stream request failed (${response.status}).`);
    return data;
}

function flaynityXhrPostForm(uploadUrl, file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl, true);
        xhr.upload.onprogress = e => {
            if (e.lengthComputable && typeof onProgress === "function") onProgress(e.loaded, e.total);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Stream upload failed (${xhr.status}).`));
        };
        xhr.onerror = () => reject(new Error("Network error while uploading video to Stream."));
        xhr.onabort = () => reject(new Error("Stream upload aborted."));
        const form = new FormData();
        form.append("file", file, file.name || "video.mp4");
        xhr.send(form);
    });
}

function flaynityTusPatch(uploadUrl, chunk, offset, onLoaded) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PATCH", uploadUrl, true);
        xhr.setRequestHeader("Tus-Resumable", "1.0.0");
        xhr.setRequestHeader("Upload-Offset", String(offset));
        xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
        xhr.upload.onprogress = e => {
            if (e.lengthComputable && typeof onLoaded === "function") onLoaded(e.loaded);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const next = Number(xhr.getResponseHeader("Upload-Offset"));
                resolve(Number.isFinite(next) ? next : offset + chunk.size);
            } else reject(new Error(`Stream chunk upload failed (${xhr.status}).`));
        };
        xhr.onerror = () => reject(new Error("Network error during resumable Stream upload."));
        xhr.onabort = () => reject(new Error("Stream chunk upload aborted."));
        xhr.send(chunk);
    });
}

async function flaynityTusUpload(uploadUrl, file, onProgress) {
    let offset = 0;
    const total = file.size;
    while (offset < total) {
        const end = Math.min(offset + FLAYNITY_TUS_CHUNK_SIZE, total);
        const chunk = file.slice(offset, end);
        let ok = false;
        let lastError;
        for (let attempt = 0; attempt < 4 && !ok; attempt++) {
            try {
                const base = offset;
                const next = await flaynityTusPatch(uploadUrl, chunk, offset, loaded => {
                    if (typeof onProgress === "function") onProgress(base + loaded, total);
                });
                offset = next;
                ok = true;
                if (typeof onProgress === "function") onProgress(offset, total);
            } catch (e) {
                lastError = e;
                await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
            }
        }
        if (!ok) throw lastError || new Error("Resumable Stream upload failed.");
    }
}

async function waitForFlaynityStreamReady(uid, onStatus) {
    const started = Date.now();
    while (Date.now() - started < FLAYNITY_STREAM_STATUS_TIMEOUT) {
        const data = await flaynityStreamRequest(`/v1/stream/status/${encodeURIComponent(uid)}`);
        if (typeof onStatus === "function") onStatus(data);
        // Cloudflare can mark a video ready while some quality levels are still
        // encoding. Wait for the full encode before publishing so the first
        // playback session has a complete ABR ladder instead of a stuck
        // "Loading quality..." state.
        const pct = Number(data.pctComplete);
        const fullyEncoded = !Number.isFinite(pct) || pct >= 100;
        if (data.readyToStream && data.hls && fullyEncoded) return data;
        await new Promise(r => setTimeout(r, 1800));
    }
    throw new Error("Video upload finished, but Stream encoding is still processing. Please try again shortly.");
}

async function uploadVideoToFlaynityStream(file, options = {}, onProgress) {
    if (!FLAYNITY_STREAM_ENABLED) throw new Error("Stream upload is disabled.");
    const maxDurationSeconds = Math.min(Math.max(Number(options.maxDurationSeconds) || 3600, 1), 36000);
    const name = String(file.name || "video.mp4");

    if (file.size <= 200 * 1024 * 1024) {
        const data = await flaynityStreamRequest("/v1/stream/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ maxDurationSeconds, name })
        });
        await flaynityXhrPostForm(data.uploadUrl, file, onProgress);
        const ready = await waitForFlaynityStreamReady(data.uid, options.onStatus);
        return {
            uid: data.uid,
            videoUrl: ready.hls,
            hlsUrl: ready.hls,
            dashUrl: ready.dash || "",
            thumbnail: ready.thumbnail || "",
            duration: ready.duration || null,
            width: ready.width || null,
            height: ready.height || null,
            provider: "cloudflare-stream"
        };
    }

    const token = await flaynityStreamAuthToken();
    const tusResponse = await fetch(`${FLAYNITY_API_BASE}/v1/stream/tus-url`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Upload-Length": String(file.size),
            "X-Flaynity-Filename": name
        },
        cache: "no-store"
    });
    const tusData = await tusResponse.json().catch(() => ({}));
    if (!tusResponse.ok || !tusData.uploadUrl) throw new Error(tusData.error || "Could not create resumable Stream upload.");
    await flaynityTusUpload(tusData.uploadUrl, file, onProgress);
    if (!tusData.uid) throw new Error("Stream did not return a video ID for the resumable upload.");
    const ready = await waitForFlaynityStreamReady(tusData.uid, options.onStatus);
    return {
        uid: tusData.uid,
        videoUrl: ready.hls,
        hlsUrl: ready.hls,
        dashUrl: ready.dash || "",
        thumbnail: ready.thumbnail || "",
        duration: ready.duration || null,
        width: ready.width || null,
        height: ready.height || null,
        provider: "cloudflare-stream"
    };
}

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], {type:mime});
}


// =========================================================
// FLAYNITY R2 -> SELF-HOSTED FFMPEG -> HLS
// No Cloudflare Stream dependency.
// =========================================================
const FLAYNITY_HLS_STATUS_TIMEOUT = 30 * 60 * 1000;
const FLAYNITY_HLS_INITIAL_TIMEOUT = 10 * 60 * 1000;
const FLAYNITY_HLS_POLL_MS = 1800;

async function flaynityHlsRequest(path, options = {}) {
    const headers = await flaynityAuthHeaders();
    const response = await fetch(`${FLAYNITY_API_BASE}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) },
        cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || data.message || `HLS request failed (HTTP ${response.status})`);
    }
    return data;
}

async function flaynityStartHlsTranscode(sourceKey, options = {}) {
    if (!sourceKey) throw new Error("Missing uploaded video key.");
    return flaynityHlsRequest("/v1/media/transcode", {
        method: "POST",
        body: JSON.stringify({
            sourceKey,
            type: options.type || "video",
            ladder: [144, 360, 480, 720, 1080]
        })
    });
}

async function flaynityGetHlsStatus(jobId) {
    if (!jobId) throw new Error("Missing HLS transcode job ID.");
    return flaynityHlsRequest(`/v1/media/transcode/status/${encodeURIComponent(jobId)}`, { method: "GET" });
}

async function flaynityWaitForHlsInitial(jobId, onStatus) {
    const started = Date.now();
    let lastError = null;
    while (Date.now() - started < FLAYNITY_HLS_INITIAL_TIMEOUT) {
        try {
            const data = await flaynityGetHlsStatus(jobId);
            if (typeof onStatus === "function") onStatus(data);
            if ((data.status === "ready" || data.status === "processing") && data.initialReady && data.hlsUrl) return data;
            if (data.status === "failed") throw new Error(data.message || "HLS transcoding failed.");
            lastError = null;
        } catch (e) {
            if (String(e?.message || e).toLowerCase().includes("hls transcoding failed")) throw e;
            lastError = e;
        }
        await new Promise(r => setTimeout(r, FLAYNITY_HLS_POLL_MS));
    }
    throw lastError || new Error("Initial 144p HLS preparation timed out. Please retry shortly.");
}

async function flaynityWaitForHlsReady(jobId, onStatus) {
    const started = Date.now();
    let lastError = null;
    while (Date.now() - started < FLAYNITY_HLS_STATUS_TIMEOUT) {
        try {
            const data = await flaynityGetHlsStatus(jobId);
            if (typeof onStatus === "function") onStatus(data);
            if (data.status === "ready" && data.hlsUrl) return data;
            if (data.status === "failed") throw new Error(data.message || "HLS transcoding failed.");
            lastError = null;
        } catch (e) {
            if (String(e?.message || e).toLowerCase().includes("hls transcoding failed")) throw e;
            lastError = e;
            // A transient Render cold-start/network response should not instantly
            // fail an upload; keep polling for a short period.
        }
        await new Promise(r => setTimeout(r, FLAYNITY_HLS_POLL_MS));
    }
    throw lastError || new Error("HLS transcoding timed out. Please retry shortly.");
}

async function uploadVideoToFlaynityHls(file, options = {}, onProgress) {
    if (!file) throw new Error("No video selected.");
    const folder = options.folder === "feels" ? "feels" : "videos";

    // 1) Secure direct upload of the original MP4 to R2.
    const upload = await flaynityCreateUpload(file, folder, {
        contentType: file.type || "video/mp4"
    });
    await flaynityPutWithProgress(upload.uploadUrl, file, onProgress);

    // 2) Ask the Worker to enqueue FFmpeg transcoding on the Render service.
    let job;
    try {
        job = await flaynityStartHlsTranscode(upload.key, { type: folder });
    } catch (e) {
        throw new Error(`HLS transcoder is not connected: ${e.message || e}`);
    }

    // Do not wait for every rendition. The transcoder exposes the HLS master as soon
    // as 144p is available, while 360p/480p/720p/1080p continue in the background.
    const initial = await flaynityWaitForHlsInitial(job.jobId, options.onStatus);
    const hlsUrl = normalizeFlaynityMediaUrl(initial.hlsUrl);
    return {
        key: upload.key,
        videoUrl: hlsUrl,
        hlsUrl,
        hlsKey: initial.hlsKey || `uploads/hls/${job.jobId}/master.m3u8`,
        transcodeJobId: initial.jobId || job.jobId,
        initialReady: true,
        videoQualities: {
            auto: hlsUrl,
            hls: hlsUrl,
            preferred: [144, 360, 480, 720, 1080]
        },
        provider: "r2-hls"
    };
}
