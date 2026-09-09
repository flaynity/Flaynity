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
    const token = await user.getIdToken();
    return { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
}

async function flaynityCreateUpload(file, folder = "images", options = {}) {
    if (!file) throw new Error("No file selected.");
    const safeFolder = String(folder || "images").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "images";
    const safeName = String(file.name || "file.bin").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140);
    const id = `${Date.now()}_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
    const key = `uploads/${safeFolder}/${id}_${safeName}`;
    const headers = await flaynityAuthHeaders();
    let response;
    try {
        response = await fetch(`${FLAYNITY_API_BASE}/v1/media/upload-url`, {
            method: "POST",
            mode: "cors",
            cache: "no-store",
            credentials: "omit",
            headers,
            body: JSON.stringify({
                key,
                contentType: file.type || options.contentType || "application/octet-stream",
                expiresIn: 900
            })
        });
    } catch (e) {
        throw new Error("Upload authorization network error. Please check the app WebView internet/CORS access.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.uploadUrl) throw new Error(data.error || `Could not create secure upload URL (HTTP ${response.status}).`);
    return { key: data.key || key, uploadUrl: data.uploadUrl, publicUrl: data.publicUrl || flaynityMediaUrl(data.key || key) };
}

function flaynityPutWithProgress(uploadUrl, file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let settled = false;
        const finishError = (message) => {
            if (settled) return;
            settled = true;
            reject(new Error(message));
        };
        xhr.open("PUT", uploadUrl, true);
        xhr.timeout = 10 * 60 * 1000;
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && typeof onProgress === "function") onProgress(e.loaded, e.total);
        };
        xhr.onload = () => {
            if (settled) return;
            if (xhr.status >= 200 && xhr.status < 300) {
                settled = true;
                resolve();
            } else {
                finishError(`Upload failed (HTTP ${xhr.status}).`);
            }
        };
        xhr.onerror = () => finishError("Network error while uploading media. Check R2 CORS and the WebView Origin.");
        xhr.ontimeout = () => finishError("Upload timed out. Please retry on a stable connection.");
        xhr.onabort = () => finishError("Upload aborted.");
        try {
            xhr.send(file);
        } catch (e) {
            finishError(e?.message || "Could not start media upload.");
        }
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

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], {type:mime});
}
