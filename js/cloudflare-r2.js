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

async function flaynityStartVideoTranscode(sourceKey, jobId = "") {
    const user = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    if (!user) throw new Error("Please sign in first.");
    if (!/^uploads\\/(?:videos|feels)\\/(?:[a-zA-Z0-9_-]+\\/)?[a-zA-Z0-9][a-zA-Z0-9._-]*$/i.test(String(sourceKey || ""))) {
        throw new Error("Invalid video source key.");
    }

    const token = await user.getIdToken(true);
    const response = await fetch(`${FLAYNITY_API_BASE}/v1/media/transcode`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey, ...(jobId ? { jobId } : {}) }),
        cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || data?.message || `Could not start transcoding (HTTP ${response.status}).`);

    const callId = data?.gpu?.job?.callId;
    const returnedJobId = data?.gpu?.job?.jobId || jobId || "";
    if (!callId) throw new Error("GPU server did not return a transcoding call ID.");

    return { callId, jobId: returnedJobId, data };
}

async function flaynityWaitForVideoTranscode(callId, options = {}) {
    const user = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    if (!user) throw new Error("Please sign in first.");
    if (!callId) throw new Error("Transcoding call ID is missing.");

    const timeoutMs = Number(options.timeoutMs || 60 * 60 * 1000);
    const startedAt = Date.now();
    let delay = 1500;

    while (Date.now() - startedAt < timeoutMs) {
        const token = await user.getIdToken(false);
        const url = new URL(`${FLAYNITY_API_BASE}/v1/media/transcode-status`);
        url.searchParams.set("callId", callId);

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` },
            cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data?.error || data?.message || `Could not read transcoding status (HTTP ${response.status}).`);
        }

        if (data?.status === "completed" && data?.result?.videoLink) {
            return data.result;
        }
        if (data?.status === "failed") {
            throw new Error(data?.message || "Video transcoding failed.");
        }

        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(5000, delay + 500);
    }

    throw new Error("Video transcoding timed out.");
}

async function uploadMediaToFlaynity(file, folder = "videos", onProgress, control) {
    const upload = await flaynityCreateUpload(file, folder, { contentType: file.type || "video/mp4" });
    if (control) control.uploadUrl = upload.uploadUrl;
    await flaynityPutWithProgress(upload.uploadUrl, file, onProgress, control);

    if (folder === "videos" || folder === "feels") {
        if (control) control.transcodeStatus = "starting";
        const transcode = await flaynityStartVideoTranscode(upload.key);
        if (control) control.transcodeStatus = "processing";
        const hls = await flaynityWaitForVideoTranscode(transcode.callId);
        upload.videoProvider = hls.videoProvider || "r2-hls";
        upload.videoLink = hls.videoLink;
        upload.videoUrl = hls.videoUrl || "master.m3u8";
        upload.hlsUrl = hls.hlsUrl || "master.m3u8";
        upload.jobId = hls.jobId || transcode.jobId;
        upload.transcodeCallId = transcode.callId;
        if (control) control.transcodeStatus = "completed";
    }

    return upload;
}

// =========================================================
// FLAYNITY SERVER: R2-HLS
// Video/Feels playback uses the generated HLS master playlist.
// =========================================================
function flaynityDirectVideoMetadata(upload, sourceKey = "") {
    if (upload?.videoLink && upload?.videoProvider === "r2-hls") {
        return {
            provider: "r2-hls",
            videoProvider: "r2-hls",
            videoUrl: upload.videoUrl || "master.m3u8",
            videoLink: upload.videoLink,
            hlsUrl: upload.hlsUrl || "master.m3u8",
            sourceKey: sourceKey || upload?.key || "",
            jobId: upload.jobId || ""
        };
    }

    const videoUrl = normalizeFlaynityMediaUrl(upload?.publicUrl || flaynityMediaUrl(sourceKey || upload?.key || ""));
    if (!videoUrl) throw new Error("Uploaded video URL was not created.");
    return {
        provider: "r2",
        videoProvider: "r2",
        videoUrl,
        videoLink: videoUrl,
        sourceKey: sourceKey || upload?.key || ""
    };
}
