// =========================================================
// FLAYNITY MEDIA API / CLOUDFLARE R2 MODULE
// Large media bytes are uploaded directly to R2 with a
// short-lived presigned URL issued by the Flaynity API.
// No R2 credentials are stored in the WebView.
// =========================================================

const FLAYNITY_API_ORIGIN = "https://api.flaynity.indevs.in";
const FLAYNITY_CDN_ORIGIN = "https://cdn.flaynity.indevs.in";

function mediaError(message, details) {
    const err = new Error(String(message || "Media upload failed"));
    if (details !== undefined) err.details = details;
    return err;
}

function parseApiError(response, body) {
    if (body && typeof body === "object") {
        return body.error || body.message || body.details || `API request failed (${response.status})`;
    }
    return body ? String(body).slice(0, 300) : `API request failed (${response.status})`;
}

async function getFirebaseIdToken(forceRefresh = false) {
    const firebaseAuth = (typeof auth !== "undefined" && auth) ? auth : (window.firebase?.auth ? firebase.auth() : null);
    const user = firebaseAuth?.currentUser;
    if (!user) throw mediaError("Please sign in to your Flaynity account first.");

    try {
        const token = await user.getIdToken(forceRefresh);
        if (!token) throw mediaError("Firebase ID token is unavailable. Please sign in again.");
        return token;
    } catch (e) {
        throw mediaError(e?.message || "Unable to get Firebase ID token.");
    }
}

async function apiJson(path, payload, retryAuth = true) {
    let token = await getFirebaseIdToken(false);
    let response;

    try {
        response = await fetch(`${FLAYNITY_API_ORIGIN}${path}`, {
            method: "POST",
            mode: "cors",
            credentials: "omit",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(payload),
            cache: "no-store"
        });
    } catch (e) {
        throw mediaError("Network error while connecting to Flaynity upload server. Check your internet connection or API domain.", e?.message || e);
    }

    let body = null;
    try { body = await response.json(); }
    catch (_) {
        try { body = await response.text(); } catch (_) { body = null; }
    }

    if (response.status === 401 && retryAuth) {
        token = await getFirebaseIdToken(true);
        try {
            response = await fetch(`${FLAYNITY_API_ORIGIN}${path}`, {
                method: "POST",
                mode: "cors",
                credentials: "omit",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(payload),
                cache: "no-store"
            });
        } catch (e) {
            throw mediaError("Network error while connecting to Flaynity upload server. Check your internet connection or API domain.", e?.message || e);
        }
        try { body = await response.json(); }
        catch (_) { try { body = await response.text(); } catch (_) { body = null; } }
    }

    if (!response.ok || !body?.ok) {
        throw mediaError(parseApiError(response, body), body);
    }
    return body;
}

function videoMimeFromName(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    return ({ mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska" })[ext] || "video/mp4";
}
function imageMimeFromName(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" })[ext] || "image/jpeg";
}

async function requestUploadUrl(file, kind, folder = "images") {
    if (!file) throw mediaError("No file selected.");
    if (!file.name) throw mediaError("Selected file has no valid file name.");

    const path = kind === "video" ? "/v1/video/upload-url" : "/v1/image/upload-url";
    return apiJson(path, {
        fileName: file.name,
        contentType: file.type || (kind === "video" ? videoMimeFromName(file.name) : imageMimeFromName(file.name)),
        size: Number(file.size || 0),
        ...(kind === "image" ? { folder } : {})
    });
}

function putToPresignedUrl(uploadUrl, file, headers, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.timeout = 0;

        Object.entries(headers || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null) xhr.setRequestHeader(key, value);
        });

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && typeof onProgress === "function") {
                onProgress(event.loaded, event.total);
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(mediaError(`R2 upload failed (HTTP ${xhr.status})`, xhr.responseText));
        };
        xhr.onerror = () => reject(mediaError("Network error while uploading the file to Cloudflare R2. Your WebView origin may be blocked by R2 CORS. Add Origin null to the R2 CORS policy or host the app from https://flaynity.indevs.in."));
        xhr.onabort = () => reject(mediaError("Upload was cancelled."));
        xhr.ontimeout = () => reject(mediaError("R2 upload timed out. Please try again."));
        xhr.send(file);
    });
}

async function uploadFileViaFlaynityAPI(file, kind, folder, onProgress) {
    const info = await requestUploadUrl(file, kind, folder);
    if (!info.uploadUrl) throw mediaError("Upload server did not return a presigned URL.");

    await putToPresignedUrl(info.uploadUrl, file, info.uploadHeaders || {
        "Content-Type": file.type || (kind === "video" ? "video/mp4" : "image/jpeg")
    }, onProgress);

    return {
        objectKey: info.objectKey,
        playbackUrl: info.playbackUrl || `${FLAYNITY_CDN_ORIGIN}/${info.objectKey}`
    };
}

async function uploadImageToR2(file, folder = "images", retries = 2, onProgress) {
    let lastError = null;
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
            const result = await uploadFileViaFlaynityAPI(file, "image", folder, onProgress);
            return result.playbackUrl;
        } catch (err) {
            lastError = err;
            if (attempt <= retries) await new Promise(r => setTimeout(r, 700 * attempt));
        }
    }
    throw lastError || mediaError("Image upload failed.");
}

async function uploadVideoToR2(file, onProgress) {
    const result = await uploadFileViaFlaynityAPI(file, "video", "videos", onProgress);
    return result;
}

async function verifyVideoUpload(objectKey) {
    if (!objectKey) throw mediaError("Missing uploaded video object key.");
    return apiJson("/v1/video/verify-upload", { objectKey });
}

function dataURLtoBlob(dataurl) {
    if (!dataurl || typeof dataurl !== "string" || !dataurl.includes(',')) {
        throw mediaError("Invalid image data.");
    }
    const arr = dataurl.split(','), mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let n = 0; n < bstr.length; n++) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
}

// Backward-compatible names used by existing Flaynity pages.
const R2_CONFIG = Object.freeze({ apiOrigin: FLAYNITY_API_ORIGIN, cdnOrigin: FLAYNITY_CDN_ORIGIN });
const PUBLIC_R2_DOMAIN_PREFIX = FLAYNITY_CDN_ORIGIN;
const s3 = null;
