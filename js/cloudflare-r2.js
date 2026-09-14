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

function flaynityPutWithProgress(uploadUrl, file, onProgress, control) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        if (control) control.xhr = xhr;
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

async function uploadMediaToFlaynity(file, folder = "videos", onProgress, control) {
    const upload = await flaynityCreateUpload(file, folder, { contentType: file.type || "video/mp4" });
    if (control) control.uploadUrl = upload.uploadUrl;
    await flaynityPutWithProgress(upload.uploadUrl, file, onProgress, control);
    return upload;
}

// =========================================================
// FLAYNITY SERVER: R2 -> FFmpeg -> HLS
// =========================================================
async function flaynityTranscodeToHls(sourceKey, contentType = "video/mp4", onStatus, options = {}) {
    if (!sourceKey) throw new Error("Missing uploaded video key.");
    const user = (typeof auth !== "undefined" && auth.currentUser) ? auth.currentUser : null;
    if (!user) throw new Error("Please sign in first.");

    const token = await user.getIdToken(true);
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };
    const response = await fetch(`${FLAYNITY_API_BASE}/v1/media/transcode`, {
        method: "POST", headers, cache: "no-store",
        body: JSON.stringify({ sourceKey, contentType: contentType.split(";")[0] || "video/mp4", contentId: options.contentId, type: options.type })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `FFmpeg transcode request failed (${response.status}).`);

    const jobId = data.jobId;
    if (!jobId) throw new Error("FFmpeg did not return a job ID.");
    const hls = data.hlsUrl || data.videoUrl || data.videoLink;
    if (!hls || !/\.m3u8(?:$|[?#])/i.test(String(hls))) {
        throw new Error("FFmpeg did not return a valid HLS master playlist.");
    }

    // Publication barrier: queued/processing is NEVER a playable result.
    const deadline = Date.now() + 60 * 60 * 1000;
    let statusData = data, failures = 0;
    while (Date.now() < deadline) {
        if (options.isCancelled?.()) throw new Error("Upload cancelled.");
        if (auth.currentUser?.uid !== user.uid) throw new Error("The uploading account has signed out.");
        if (typeof onStatus === "function") onStatus(statusData);
        if (statusData.status === "failed") { const error = new Error(statusData.error || "360p encoding failed."); error.encodingFailed = true; throw error; }
        if (Array.isArray(statusData.available) && statusData.available.includes("360p")) {
            return { ...statusData, jobId, provider: "r2-hls", videoProvider: "r2-hls", videoUrl: hls, videoLink: hls, hlsUrl: hls, sourceKey };
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
            statusData = await flaynityJobRequest(`/${encodeURIComponent(jobId)}`);
            failures = 0;
        } catch (error) {
            if ([400, 401, 403, 404].includes(error.status) || ++failures >= 90) throw error;
        }
    }
    throw new Error("360p is still processing. Retry to resume without uploading the source again.");
}

async function flaynityJobRequest(route, body) {
    const user = typeof auth !== "undefined" ? auth.currentUser : null;
    if (!user) throw new Error("Please sign in first.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
        const response = await fetch(`${FLAYNITY_API_BASE}/v1/media/transcode${route}`, {
            method: body ? "POST" : "GET",
            headers: { "Authorization": `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
            cache: "no-store", signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { const error = new Error(data.error || `Transcode request failed (${response.status}).`); error.status = response.status; throw error; }
        return data;
    } finally { clearTimeout(timeout); }
}

async function flaynityConfirmHlsPublished(jobId) {
    let lastError;
    for (let attempt = 0; attempt < 4; attempt++) {
        try { return await flaynityJobRequest(`/${encodeURIComponent(jobId)}/published`, {}); }
        catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1))); }
    }
    // Worker cron retries this confirmation even if the app closes.
    throw lastError;
}

// =========================================================
// CLOUDFLARE STREAM: ADAPTIVE VIDEO UPLOAD / HLS PLAYBACK
// =========================================================
const FLAYNITY_STREAM_ENABLED = false;
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

function flaynityXhrPostForm(uploadUrl, file, onProgress, control) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl, true);
        if (control) control.xhr = xhr;
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
        if (options.control) options.control.uploadUrl = data.uploadUrl;
        await flaynityXhrPostForm(data.uploadUrl, file, onProgress, options.control);
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
