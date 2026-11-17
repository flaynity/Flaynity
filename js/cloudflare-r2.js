// =========================================================
// FLAYNITY SECURE MEDIA CLIENT
// R2 credentials NEVER belong in the WebView/frontend.
// Upload authorization is issued by Flaynity-Server.
// =========================================================
const FLAYNITY_API_BASE = "https://api.flaynity-app.indevs.in/api";
const FLAYNITY_MEDIA_BASE = "https://cdn.flaynity-app.indevs.in/media";
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
    let safeName = String(file.name || "file.bin").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140);
    // The Worker requires the final path segment to start with an alphanumeric
    // character. Some Android/Sketchware file providers return names beginning
    // with punctuation (or a truncated punctuation prefix), so normalize it.
    safeName = safeName.replace(/^[^a-zA-Z0-9]+/, "");
    if (!safeName) safeName = "file.bin";
    const id = `${Date.now()}_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
    // Keep Feels objects in the documented per-user path accepted by the Worker.
    const currentUserId = (typeof auth !== "undefined" && auth.currentUser && auth.currentUser.uid)
        ? String(auth.currentUser.uid).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128)
        : "";
    let key = safeFolder === "feels"
        ? `uploads/feels/${currentUserId || "user"}/${id}_${safeName}`
        : `uploads/${safeFolder}/${id}_${safeName}`;

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

    // Some older/deployed Worker versions may validate Feels keys using the
    // shorter legacy path. If (and only if) the Worker rejects the key format,
    // retry once with a minimal ASCII-only Feels key that both accepted formats
    // can validate. Do not retry authentication, content-type, or network errors.
    if (safeFolder === "feels" &&
        result.response.status === 400 &&
        String(result.data?.error || result.data?.message || "").toLowerCase() === "invalid media key") {
        key = `uploads/feels/${Date.now()}_${Math.random().toString(36).slice(2, 12)}.mp4`;
        result = await requestUploadUrl(false);
        if (result.response.status === 401) {
            result = await requestUploadUrl(true);
        }
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
// FLAYNITY SERVER: R2 DIRECT MP4
// Uploaded videos are stored and played directly as R2 .mp4 objects.
// =========================================================
function flaynityDirectVideoMetadata(upload, sourceKey = "") {
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


// =========================================================
// FLAYNITY HLS PACKAGE UPLOADER
// Encoding happens on-device. This helper only uploads the
// generated playlists/segments to R2 using server-signed URLs.
// Expected files: [{ path: "360p/index.m3u8", blob, contentType }, ...]
// Upload master.m3u8 last so clients never receive an incomplete master.
// =========================================================
async function flaynityCreateUploadForKey(key, contentType) {
    const cleanKey = String(key || "");
    if (!/^uploads\/[a-zA-Z0-9._/-]+$/.test(cleanKey) || cleanKey.includes("..") || cleanKey.includes("//")) {
        throw new Error("Invalid HLS object key.");
    }
    const user = (typeof auth !== "undefined" && auth.currentUser) ? auth.currentUser : null;
    if (!user) throw new Error("Please sign in first.");

    async function request(forceRefresh) {
        const token = await user.getIdToken(!!forceRefresh);
        const response = await fetch(`${FLAYNITY_API_BASE}/v1/media/upload-url`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ key: cleanKey, contentType: contentType || "application/octet-stream", expiresIn: 900 }),
            cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
        return { response, data };
    }

    let result = await request(false);
    if (result.response.status === 401) result = await request(true);
    if (!result.response.ok || !result.data.uploadUrl) {
        throw new Error(result.data.error || `Could not create HLS upload URL (HTTP ${result.response.status}).`);
    }
    return { key: result.data.key || cleanKey, uploadUrl: result.data.uploadUrl, publicUrl: result.data.publicUrl || flaynityMediaUrl(cleanKey) };
}

async function uploadFlaynityHlsPackage(files, baseKey, onProgress) {
    if (!Array.isArray(files) || !files.length) throw new Error("HLS package is empty.");
    const base = String(baseKey || "").replace(/\/+$/, "");
    if (!/^uploads\/[a-zA-Z0-9._/-]+$/.test(base) || base.includes("..") || base.includes("//")) {
        throw new Error("Invalid HLS package path.");
    }

    const normalized = files.map(entry => {
        const path = String(entry.path || "").replace(/^\/+/, "");
        if (!path || path.split("/").some(part => !part || part === "." || part === "..") || !/^[a-zA-Z0-9._/-]+$/.test(path)) {
            throw new Error("Invalid HLS package file path.");
        }
        const blob = entry.blob || entry.file;
        if (!(blob instanceof Blob)) throw new Error(`Missing HLS file data: ${path}`);
        const ext = path.split(".").pop().toLowerCase();
        const inferred = ext === "m3u8" ? "application/vnd.apple.mpegurl" :
            ext === "ts" ? "video/mp2t" :
            ext === "m4s" ? "video/iso.segment" :
            ext === "mp4" ? "video/mp4" : "application/octet-stream";
        return { path, blob, contentType: entry.contentType || inferred };
    });

    // Playlists are uploaded after their referenced media objects.
    normalized.sort((a, b) => Number(/\.m3u8$/i.test(a.path)) - Number(/\.m3u8$/i.test(b.path)));
    let completed = 0;
    const uploaded = [];
    for (const entry of normalized) {
        const key = `${base}/${entry.path}`;
        const upload = await flaynityCreateUploadForKey(key, entry.contentType);
        await flaynityPutWithProgress(upload.uploadUrl, entry.blob, (loaded, total) => {
            if (typeof onProgress === "function") onProgress(completed, normalized.length, loaded, total, entry.path);
        });
        completed++;
        uploaded.push({ path: entry.path, key: upload.key, publicUrl: upload.publicUrl });
        if (typeof onProgress === "function") onProgress(completed, normalized.length, entry.blob.size || 0, entry.blob.size || 0, entry.path);
    }

    const master = uploaded.find(file => file.path === "master.m3u8");
    if (!master) throw new Error("HLS master.m3u8 is missing from the package.");
    return {
        provider: "r2-hls",
        videoProvider: "r2-hls",
        videoUrl: master.publicUrl,
        videoLink: master.publicUrl,
        sourceKey: base,
        hls: true,
        files: uploaded
    };
}

function flaynityHlsVideoMetadata(packageResult) {
    if (!packageResult || !packageResult.videoUrl || !packageResult.sourceKey) {
        throw new Error("A completed HLS package is required.");
    }
    return {
        provider: "r2-hls",
        videoProvider: "r2-hls",
        videoUrl: packageResult.videoUrl,
        videoLink: packageResult.videoUrl,
        sourceKey: packageResult.sourceKey,
        hls: true
    };
}
