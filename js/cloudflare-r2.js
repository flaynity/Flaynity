/**
 * Flaynity - Cloudflare R2 Media Storage Architecture (Secure Client)
 * ---------------------------------------------------------------------
 * SECURITY (Rule 111): This file NEVER holds R2/AWS access or secret keys.
 * All signing happens on a small backend/Cloudflare Worker that owns the
 * credentials. This client only ever receives short-lived presigned URLs.
 *
 * Backend contract required (implement as a Cloudflare Worker or any
 * authenticated server endpoint):
 *
 *   POST {API_BASE}/init
 *     body: { fileName, fileType, fileSize, folder }
 *     -> Large files (multipart):
 *        { multipart: true, uploadId, objectKey, publicUrl, partSize, totalParts }
 *     -> Small files (single PUT):
 *        { multipart: false, uploadUrl, objectKey, publicUrl }
 *
 *   POST {API_BASE}/sign-part
 *     body: { uploadId, objectKey, partNumber }
 *     -> { url }
 *
 *   POST {API_BASE}/complete
 *     body: { uploadId, objectKey, parts: [{ partNumber, etag }] }
 *     -> { cdnUrl }
 *
 *   POST {API_BASE}/abort
 *     body: { uploadId, objectKey }
 *
 * The backend is the only place that ever touches R2_ACCESS_KEY_ID /
 * R2_SECRET_ACCESS_KEY. It should authenticate the caller (Firebase ID
 * token) before issuing any signed URL.
 */

(function () {
    const API_BASE = window.FLAYNITY_UPLOAD_API_BASE || '/api/uploads';
    const DEFAULT_PART_SIZE = 8 * 1024 * 1024; // 8MB
    const MAX_PART_RETRIES = 3;
    const RETRY_BACKOFF_MS = 1200;

    function authHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const user = window.firebase && window.firebase.auth ? window.firebase.auth().currentUser : null;
        if (user && user.getIdToken) {
            // Caller may already have a fresh token cached; init() awaits this.
            return user.getIdToken().then(token => {
                headers['Authorization'] = `Bearer ${token}`;
                return headers;
            });
        }
        return Promise.resolve(headers);
    }

    function apiPost(path, body) {
        return authHeaders().then(headers =>
            fetch(`${API_BASE}${path}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            })
        ).then(res => {
            if (!res.ok) {
                return res.json().catch(() => ({})).then(errBody => {
                    const err = new Error(errBody.message || `Upload API error (${res.status})`);
                    err.status = res.status;
                    throw err;
                });
            }
            return res.json();
        });
    }

    function objectKeyFolder(file) {
        if (file.type.startsWith('video/')) return 'videos';
        if (file.type.startsWith('image/')) return 'images';
        return 'others';
    }

    function xhrPutWithProgress(url, blob, contentType, onProgress, xhrRef) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhrRef.current = xhr;
            xhr.open('PUT', url, true);
            if (contentType) xhr.setRequestHeader('Content-Type', contentType);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) onProgress(e.loaded);
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const etag = xhr.getResponseHeader('ETag');
                    resolve(etag);
                } else {
                    reject(new Error(`Chunk upload failed (${xhr.status})`));
                }
            };

            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.onabort = () => {
                const abortErr = new Error('aborted');
                abortErr.aborted = true;
                reject(abortErr);
            };

            xhr.send(blob);
        });
    }

    /**
     * Uploads a file to Cloudflare R2 via presigned URLs.
     *
     * @param {File} file
     * @param {Function} onProgress - percentage 0-100
     * @returns {{
     *   promise: Promise<string>,   // resolves with CDN URL
     *   pause: Function,
     *   resume: Function,
     *   cancel: Function
     * }}
     */
    window.uploadToR2 = function (file, onProgress) {
        if (!file) {
            return { promise: Promise.reject(new Error('No file provided')), pause() {}, resume() {}, cancel() {} };
        }

        const state = {
            status: 'idle',       // idle | uploading | paused | cancelled | completed | failed
            uploadId: null,
            objectKey: null,
            multipart: false,
            partSize: DEFAULT_PART_SIZE,
            totalParts: 1,
            completedParts: [],   // [{ partNumber, etag }]
            partsLoaded: {},      // partNumber -> bytes loaded (for progress across resumes)
            singleUploadUrl: null,
            publicUrl: null,
            resolve: null,
            reject: null,
            currentXhrRef: { current: null }
        };

        const promise = new Promise((resolve, reject) => {
            state.resolve = resolve;
            state.reject = reject;
        });

        function reportProgress() {
            if (!onProgress) return;
            if (!state.multipart) return; // single-file progress handled inline
            const loaded = Object.values(state.partsLoaded).reduce((a, b) => a + b, 0);
            const pct = Math.min(100, Math.round((loaded / file.size) * 100));
            onProgress(pct);
        }

        function init() {
            state.status = 'uploading';
            return apiPost('/init', {
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                folder: objectKeyFolder(file)
            }).then(res => {
                state.objectKey = res.objectKey;
                state.publicUrl = res.publicUrl;

                if (res.multipart) {
                    state.multipart = true;
                    state.uploadId = res.uploadId;
                    state.partSize = res.partSize || DEFAULT_PART_SIZE;
                    state.totalParts = res.totalParts || Math.ceil(file.size / state.partSize);
                    return uploadNextPart(1);
                } else {
                    state.multipart = false;
                    state.singleUploadUrl = res.uploadUrl;
                    return uploadSingle();
                }
            }).catch(fail);
        }

        function uploadSingle() {
            return xhrPutWithProgress(
                state.singleUploadUrl,
                file,
                file.type,
                (loaded) => {
                    if (onProgress) onProgress(Math.min(100, Math.round((loaded / file.size) * 100)));
                },
                state.currentXhrRef
            ).then(() => {
                state.status = 'completed';
                state.resolve(state.publicUrl);
            }).catch(err => {
                if (err.aborted) return; // paused/cancelled - handled by pause()/cancel()
                fail(err);
            });
        }

        function uploadNextPart(partNumber, retryCount) {
            retryCount = retryCount || 0;
            if (state.status === 'cancelled') return;
            if (partNumber > state.totalParts) return completeMultipart();

            const start = (partNumber - 1) * state.partSize;
            const end = Math.min(start + state.partSize, file.size);
            const chunk = file.slice(start, end);

            return apiPost('/sign-part', {
                uploadId: state.uploadId,
                objectKey: state.objectKey,
                partNumber
            }).then(res => {
                if (state.status === 'paused' || state.status === 'cancelled') return;
                return xhrPutWithProgress(
                    res.url,
                    chunk,
                    file.type,
                    (loaded) => {
                        state.partsLoaded[partNumber] = loaded;
                        reportProgress();
                    },
                    state.currentXhrRef
                ).then(etag => {
                    state.partsLoaded[partNumber] = chunk.size;
                    state.completedParts.push({ partNumber, etag });
                    reportProgress();
                    return uploadNextPart(partNumber + 1);
                });
            }).catch(err => {
                if (err && err.aborted) return; // pause/cancel in progress, stop silently
                if (state.status === 'cancelled') return;
                if (retryCount < MAX_PART_RETRIES) {
                    return new Promise(res => setTimeout(res, RETRY_BACKOFF_MS * (retryCount + 1)))
                        .then(() => uploadNextPart(partNumber, retryCount + 1));
                }
                fail(err);
            });
        }

        function completeMultipart() {
            return apiPost('/complete', {
                uploadId: state.uploadId,
                objectKey: state.objectKey,
                parts: state.completedParts.sort((a, b) => a.partNumber - b.partNumber)
            }).then(res => {
                state.status = 'completed';
                state.resolve(res.cdnUrl || state.publicUrl);
            }).catch(fail);
        }

        function fail(err) {
            if (state.status === 'cancelled') return;
            state.status = 'failed';
            console.error('[Flaynity] Upload failed:', err);
            state.reject(err);
        }

        function nextUnfinishedPart() {
            for (let p = 1; p <= state.totalParts; p++) {
                if (!state.completedParts.find(cp => cp.partNumber === p)) return p;
            }
            return state.totalParts + 1;
        }

        // Kick off
        init();

        return {
            promise,
            pause() {
                if (state.status !== 'uploading') return;
                state.status = 'paused';
                if (state.currentXhrRef.current) state.currentXhrRef.current.abort();
            },
            resume() {
                if (state.status !== 'paused') return;
                state.status = 'uploading';
                if (state.multipart) {
                    uploadNextPart(nextUnfinishedPart());
                } else {
                    uploadSingle();
                }
            },
            cancel() {
                if (state.status === 'completed' || state.status === 'cancelled') return;
                state.status = 'cancelled';
                if (state.currentXhrRef.current) state.currentXhrRef.current.abort();
                if (state.multipart && state.uploadId) {
                    apiPost('/abort', { uploadId: state.uploadId, objectKey: state.objectKey }).catch(() => {});
                }
                const cancelErr = new Error('Upload cancelled');
                cancelErr.cancelled = true;
                state.reject(cancelErr);
            }
        };
    };

    /**
     * Client-side validation helper (does not replace server-side checks).
     * @param {File} file
     * @param {'video'|'short'|'image'} kind
     * @returns {{ valid: boolean, message?: string }}
     */
    window.validateMediaFile = function (file, kind) {
        if (!file) return { valid: false, message: 'No file selected.' };

        if (kind === 'video' || kind === 'short') {
            const allowed = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm'];
            if (!allowed.includes(file.type)) {
                return { valid: false, message: 'Unsupported format. Use MP4, MOV, MKV, or WEBM.' };
            }
            const maxBytes = 3 * 1024 * 1024 * 1024; // 3GB
            if (file.size > maxBytes) {
                return { valid: false, message: 'File exceeds the 3GB upload limit.' };
            }
        }

        if (kind === 'image') {
            const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!allowed.includes(file.type)) {
                return { valid: false, message: 'Unsupported format. Use JPG, PNG, WEBP, or GIF.' };
            }
        }

        return { valid: true };
    };

    /**
     * Reads a video file's duration in seconds without uploading it.
     * @param {File} file
     * @returns {Promise<number>}
     */
    window.getVideoDuration = function (file) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                URL.revokeObjectURL(video.src);
                resolve(video.duration);
            };
            video.onerror = () => {
                URL.revokeObjectURL(video.src);
                reject(new Error('Could not read video metadata'));
            };
            video.src = URL.createObjectURL(file);
        });
    };
})();
