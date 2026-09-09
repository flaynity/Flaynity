// =========================================================
// FLAYNITY MEDIA UPLOAD MODULE
// Client never contains R2 access keys/secrets.
// All uploads use short-lived presigned URLs from the Flaynity API.
// =========================================================
const FLAYNITY_VIDEO_API = "https://api.flaynity.indevs.in";
const PUBLIC_R2_DOMAIN_PREFIX = "https://cdn.flaynity.indevs.in";

// Kept for backward compatibility with existing app code.
const R2_CONFIG = Object.freeze({});
const s3 = null;

function getReadableUploadError(value, fallback) {
    if (!value) return fallback;
    if (typeof value === "string") return value;
    if (value.message) return value.message;
    if (value.error) {
        if (typeof value.error === "string") return value.error;
        if (value.error.message) return value.error.message;
        try { return JSON.stringify(value.error); } catch (_) {}
    }
    try { return JSON.stringify(value); } catch (_) { return fallback; }
}

async function getFlaynityAuthHeaders() {
    const user = (typeof auth !== "undefined" && auth) ? auth.currentUser : null;
    if (!user) throw new Error("Please sign in to Flaynity before uploading.");
    const token = await user.getIdToken(true);
    return { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
}

async function apiJson(path, options) {
    const response = await fetch(`${FLAYNITY_VIDEO_API}${path}`, options);
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {
        throw new Error(`Server returned invalid response (HTTP ${response.status}).`);
    }
    if (!response.ok || data.ok === false) {
        throw new Error(getReadableUploadError(data, `Request failed (HTTP ${response.status}).`));
    }
    return data;
}

async function createMediaUploadSession(file, kind = "image") {
    if (!file) throw new Error("No file selected.");
    const headers = await getFlaynityAuthHeaders();
    const data = await apiJson(`/v1/${kind}/upload-url`, {
        method: "POST", headers,
        body: JSON.stringify({ fileName: file.name, contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"), size: file.size })
    });
    if (!data.uploadUrl || !data.objectKey) throw new Error("Upload authorization response is incomplete.");
    return data;
}

function uploadFileToPresignedUrl(file, session, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(session.uploadMethod || "PUT", session.uploadUrl, true);
        Object.entries(session.uploadHeaders || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
        xhr.upload.onprogress = event => {
            if (event.lengthComputable && typeof onProgress === "function") onProgress(event.loaded, event.total);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`CDN storage upload failed (HTTP ${xhr.status}).`));
        };
        xhr.onerror = () => reject(new Error("Network error while uploading file."));
        xhr.onabort = () => reject(new Error("Upload was aborted."));
        xhr.send(file);
    });
}

async function verifyMediaUpload(objectKey, kind = "image") {
    const headers = await getFlaynityAuthHeaders();
    return apiJson(`/v1/${kind}/verify-upload`, {
        method: "POST", headers, body: JSON.stringify({ objectKey })
    });
}

async function uploadImageToR2(file, folder = "images", retries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const session = await createMediaUploadSession(file, "image");
            await uploadFileToPresignedUrl(file, session);
            const verified = await verifyMediaUpload(session.objectKey, "image");
            return verified.playbackUrl || session.playbackUrl || `${PUBLIC_R2_DOMAIN_PREFIX}/${session.objectKey}`;
        } catch (err) {
            lastError = err;
            console.warn(`Flaynity image upload attempt ${attempt} failed:`, err);
            if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 800 * attempt));
        }
    }
    throw lastError || new Error("Image upload failed.");
}

async function createVideoUploadSession(file) { return createMediaUploadSession(file, "video"); }
async function verifyVideoUpload(objectKey) { return verifyMediaUpload(objectKey, "video"); }

function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    return new Blob([u8arr], { type: mime });
}
