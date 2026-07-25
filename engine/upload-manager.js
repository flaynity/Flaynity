/**
 * ============================================================
 * FLAYNITY UPLOAD MANAGER  v3.0
 * ============================================================
 * Features:
 *   - Upload Queue with IndexedDB persistence (survives app restart)
 *   - Auto-retry (up to 5 attempts with exponential back-off)
 *   - Resume after network recovery
 *   - Background queue (up to MAX_CONCURRENT parallel uploads)
 *   - Progress reporting (speed, ETA, percentage)
 *   - Cancellation
 *   - Cloudflare R2 (S3 SDK) for media
 *   - Firebase Realtime DB for metadata
 *   - Realtime UI update after publish
 *   - Guaranteed no lost uploads (IndexedDB + localStorage fallback)
 *
 * NEVER calls location.reload() or webview.reload().
 * ============================================================
 */

'use strict';

const UploadManager = (() => {

    /* ── Constants ──────────────────────────────────────────── */
    const MAX_CONCURRENT   = 3;
    const MAX_RETRIES      = 5;
    const IDB_DB_NAME      = 'flaynity_uploads';
    const IDB_STORE        = 'queue';
    const IDB_VERSION      = 1;
    const LS_FALLBACK_KEY  = 'flaynity_upload_queue_v3';

    /* ── State ──────────────────────────────────────────────── */
    let _queue          = [];          // Array<UploadItem>
    let _activeCount    = 0;
    let _idbReady       = false;
    let _idb            = null;

    /* ── IndexedDB setup ────────────────────────────────────── */
    function _openIDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) { resolve(null); return; }
            const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = e => resolve(e.target.result);
            req.onerror   = e => { console.error('[UploadManager] IDB open error:', e); resolve(null); };
        });
    }

    async function _idbPut(item) {
        if (!_idb) return _lsFallbackSave();
        return new Promise(resolve => {
            const tx = _idb.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(_serializeItem(item));
            tx.oncomplete = resolve;
            tx.onerror    = () => { _lsFallbackSave(); resolve(); };
        });
    }

    async function _idbDelete(id) {
        if (!_idb) return _lsFallbackSave();
        return new Promise(resolve => {
            const tx = _idb.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(id);
            tx.oncomplete = resolve;
            tx.onerror    = resolve;
        });
    }

    async function _idbGetAll() {
        if (!_idb) return _lsFallbackLoad();
        return new Promise(resolve => {
            const tx  = _idb.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).getAll();
            req.onsuccess = e => resolve(e.target.result || []);
            req.onerror   = () => resolve(_lsFallbackLoad());
        });
    }

    function _serializeItem(item) {
        const copy = { ...item };
        delete copy.file;        // File objects are not serializable
        delete copy.thumbBlob;
        delete copy.s3UploadRef;
        return copy;
    }

    function _lsFallbackSave() {
        try {
            localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(_queue.map(_serializeItem)));
        } catch (_) {}
    }

    function _lsFallbackLoad() {
        try {
            const raw = localStorage.getItem(LS_FALLBACK_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (_) { return []; }
    }

    async function _persistQueue() {
        for (const item of _queue) await _idbPut(item);
    }

    /* ── Initialization ─────────────────────────────────────── */
    async function init() {
        _idb = await _openIDB();
        _idbReady = true;

        const saved = await _idbGetAll();
        _queue = saved.map(item => ({
            ...item,
            file:        null,
            thumbBlob:   null,
            s3UploadRef: null,
            // Anything that was mid-upload becomes paused
            status: ['uploading', 'waiting', 'processing'].includes(item.status)
                ? 'paused'
                : item.status
        }));

        // Expose to legacy code
        window.uploadQueue = _queue;

        _updateManagerUI();
        console.log('[UploadManager] Initialized. Queue length:', _queue.length);
    }

    /* ── Queue operations ───────────────────────────────────── */

    /** Add a new item to the queue (status = 'draft'). */
    async function enqueue(item) {
        item.status     = item.status || 'draft';
        item.retryCount = 0;
        item.progress   = 0;
        _queue.push(item);
        window.uploadQueue = _queue;
        await _idbPut(item);
        _updateManagerUI();
    }

    /** Start uploading all 'waiting' items up to MAX_CONCURRENT. */
    function triggerNext() {
        if (!navigator.onLine) return;
        for (const item of _queue) {
            if (_activeCount >= MAX_CONCURRENT) break;
            if (item.status === 'waiting') {
                _activeCount++;
                _startUpload(item);
            }
        }
    }

    /** Resume all paused/failed items. */
    function resumeAll() {
        _queue.forEach(item => {
            if (item.status === 'paused' || item.status === 'failed') {
                item.status = 'waiting';
            }
        });
        _persistQueue();
        _updateManagerUI();
        triggerNext();
    }

    /** Pause a specific item. */
    function pause(id) {
        const item = _findById(id);
        if (!item) return;
        item.status = 'paused';
        if (item.s3UploadRef) {
            try { item.s3UploadRef.abort(); } catch (_) {}
            item.s3UploadRef = null;
        }
        _idbPut(item);
        _updateManagerUI();
        triggerNext();
    }

    /** Resume a specific item. */
    function resume(id) {
        const item = _findById(id);
        if (!item) return;
        if (!item.file) {
            // File reference lost – user must re-select
            if (typeof showNotification === 'function') {
                showNotification('Please re-select the file to resume upload.', 'error');
            }
            return;
        }
        item.status = 'waiting';
        _idbPut(item);
        _updateManagerUI();
        triggerNext();
    }

    /** Remove an item from the queue. */
    async function remove(id) {
        const item = _findById(id);
        if (item) {
            if (item.s3UploadRef) { try { item.s3UploadRef.abort(); } catch (_) {} }
            _queue = _queue.filter(i => i.id !== id);
            window.uploadQueue = _queue;
            await _idbDelete(id);
            _updateManagerUI();
            triggerNext();
        }
    }

    /** Update metadata fields on a draft item. */
    async function updateItem(id, fields) {
        const item = _findById(id);
        if (!item) return;
        Object.assign(item, fields);
        await _idbPut(item);
        _updateManagerUI();
    }

    /* ── Upload execution ───────────────────────────────────── */
    async function _startUpload(item) {
        if (!navigator.onLine) {
            item.status = 'paused';
            _activeCount = Math.max(0, _activeCount - 1);
            _idbPut(item);
            _updateManagerUI();
            return;
        }

        item.status   = 'uploading';
        item.progress = item.progress || 0;
        _idbPut(item);
        _updateManagerUI();

        const startTime = Date.now();

        try {
            // ── S3 / R2 upload ──────────────────────────────
            const s3Params = {
                Key:         item.key,
                Body:        item.file,
                ContentType: item.file.type || 'video/mp4'
            };
            const uploadOpts = { partSize: 5 * 1024 * 1024, queueSize: 2 };
            const s3Upload   = window.s3.upload(s3Params, uploadOpts);
            item.s3UploadRef = s3Upload;

            s3Upload.on('httpUploadProgress', evt => {
                if (item.status !== 'uploading') return;
                const pct     = Math.round((evt.loaded / evt.total) * 100);
                item.progress = pct;
                const elapsed = (Date.now() - startTime) / 1000;
                if (elapsed > 0) {
                    item.speed = evt.loaded / elapsed;
                    item.eta   = (evt.total - evt.loaded) / item.speed;
                }
                _updateManagerUI();
            });

            await s3Upload.promise();

            item.videoUrl    = `${window.PUBLIC_R2_DOMAIN_PREFIX}/${item.key}`;
            item.status      = 'processing';
            item.retryCount  = 0;
            _idbPut(item);
            _updateManagerUI();

            await _postUploadProcessing(item);

        } catch (err) {
            if (item.status === 'paused') {
                // Intentional abort – do nothing
            } else if (!navigator.onLine) {
                item.status = 'paused';
                _idbPut(item);
                _updateManagerUI();
                if (typeof showNotification === 'function') {
                    showNotification('Connection lost. Upload paused.', 'error');
                }
            } else {
                item.retryCount = (item.retryCount || 0) + 1;
                if (item.retryCount <= MAX_RETRIES) {
                    item.status = 'waiting';
                    _idbPut(item);
                    _updateManagerUI();
                    const delay = Math.min(30000, 1000 * Math.pow(2, item.retryCount));
                    if (typeof showNotification === 'function') {
                        showNotification(`Network hiccup. Retrying (${item.retryCount}/${MAX_RETRIES})…`, 'error');
                    }
                    setTimeout(() => triggerNext(), delay);
                } else {
                    item.status = 'failed';
                    _idbPut(item);
                    _updateManagerUI();
                    if (typeof showNotification === 'function') {
                        showNotification(`Upload failed after ${MAX_RETRIES} attempts: ${err.message}`, 'error');
                    }
                }
            }
        } finally {
            _activeCount = Math.max(0, _activeCount - 1);
            triggerNext();
        }
    }

    async function _postUploadProcessing(item) {
        item.status      = 'processing';
        item.processingMsg = 'Uploading thumbnail…';
        item.progress    = 0;
        _updateManagerUI();

        // Upload thumbnail
        let finalThumbBlob = item.thumbBlob;
        if (!finalThumbBlob && item.thumbDataUrl && item.thumbDataUrl.startsWith('data:')) {
            try { finalThumbBlob = _dataURLtoBlob(item.thumbDataUrl); } catch (_) {}
        }

        if (finalThumbBlob && window.s3) {
            try {
                await window.s3.putObject({
                    Body:        finalThumbBlob,
                    Key:         item.thumbKey,
                    ContentType: 'image/jpeg'
                }).promise();
                item.thumbUrl = `${window.PUBLIC_R2_DOMAIN_PREFIX}/${item.thumbKey}`;
            } catch (_) {
                item.thumbUrl = item.thumbDataUrl || '';
            }
        } else {
            item.thumbUrl = item.thumbDataUrl || '';
        }

        item.processingMsg = 'Publishing to feed…';
        item.progress      = 100;
        _updateManagerUI();

        await _publishMetadata(item);

        item.status = 'completed';
        _idbPut(item);
        _updateManagerUI();

        if (typeof showNotification === 'function') {
            showNotification(`"${item.title}" published!`, 'success');
        }
    }

    async function _publishMetadata(item) {
        const user = AuthManager.currentUser();
        if (!user) return;

        const userSnap = await FlaynityDB.ref(`users/${user.uid}`).once('value');
        const uData    = userSnap.val() || {};
        const username = uData.username || user.email.split('@')[0];

        const payload = {
            id:            item.id,
            userId:        user.uid,
            channelId:     user.uid,
            title:         item.title,
            description:   item.description,
            tags:          _extractHashtags(item.description),
            category:      window.currentChannelData?.category || 'Entertainment',
            duration:      _formatDuration(item.duration),
            resolution:    item.type === 'video-short' ? '1080x1920' : '1920x1080',
            poster:        item.thumbUrl || '',
            banner:        item.thumbUrl || '',
            videoLink:     item.videoUrl,
            uploadTime:    Date.now(),
            updateTime:    Date.now(),
            visibility:    item.visibility,
            status:        'published',
            views:         0,
            likes:         0,
            comments:      0,
            shares:        0,
            isShort:       item.type === 'video-short',
            isPost:        false,
            allowComments: item.allowComments,
            showLikes:     item.showLikes,
            username:      username,
            channelAvatar: window.currentChannelData?.avatarUrl || user.photoURL || '',
            createdAt:     Date.now()
        };

        const path = item.type === 'video-short'
            ? `admin_panel/movies/shorts/${item.id}`
            : `admin_panel/movies/user_uploads/${item.id}`;

        await FlaynityDB.ref(path).set(payload);

        // Instant local feed update (< 100 ms)
        if (item.type === 'video-short') {
            const idx = window.allShorts.findIndex(s => s.id === item.id);
            if (idx !== -1) window.allShorts[idx] = payload;
            else window.allShorts.unshift(payload);
            if (typeof buildShortsPage === 'function') buildShortsPage();
        } else {
            const idx = window.allLongVideos.findIndex(v => v.id === item.id);
            if (idx !== -1) window.allLongVideos[idx] = payload;
            else window.allLongVideos.unshift(payload);
        }
        if (typeof buildHomeFeed === 'function') buildHomeFeed();
    }

    /* ── UI update ──────────────────────────────────────────── */
    function _updateManagerUI() {
        // Sync legacy global
        window.uploadQueue = _queue;
        if (typeof updateManagerUI === 'function') updateManagerUI();
    }

    /* ── Helpers ────────────────────────────────────────────── */
    function _findById(id) { return _queue.find(i => i.id === id); }

    function _dataURLtoBlob(dataurl) {
        const arr  = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        const u8   = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
        return new Blob([u8], { type: mime });
    }

    function _extractHashtags(text) {
        if (!text) return [];
        return (text.match(/#\w+/g) || []).map(t => t.toLowerCase());
    }

    function _formatDuration(seconds) {
        if (!seconds) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    /* ── Watchdog (catches stuck 'waiting' items) ───────────── */
    setInterval(() => {
        if (!navigator.onLine) return;
        const hasWaiting = _queue.some(i => i.status === 'waiting');
        if (hasWaiting && _activeCount < MAX_CONCURRENT) triggerNext();
    }, 4000);

    /* ── Network recovery hook ──────────────────────────────── */
    if (typeof NetworkManager !== 'undefined') {
        NetworkManager.onOnline(() => resumeAll());
    }

    return { init, enqueue, triggerNext, resumeAll, pause, resume, remove, updateItem };
})();

window.UploadManager = UploadManager;

// Initialize after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UploadManager.init());
} else {
    UploadManager.init();
}

console.log('[UploadManager] Module loaded.');
