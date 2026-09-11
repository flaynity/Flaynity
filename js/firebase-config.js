/* Flaynity Shared Firebase Configuration
 * Single shared Firebase initialization for the application and service pages.
 */
const firebaseConfig = {
    apiKey: "AIzaSyCiUTQp_QDSbBIOGJXKI7jJmzQHPu8L14I",
    authDomain: "flaynity-app.firebaseapp.com",
    databaseURL: "https://flaynity-app-default-rtdb.firebaseio.com",
    projectId: "flaynity-app",
    storageBucket: "flaynity-app.firebasestorage.app",
    messagingSenderId: "587469287255",
    appId: "1:587469287255:web:6ec177b0c1c802efc95812",
    measurementId: "G-HPMF5TPJB2"
};

try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    firebase.database().enablePersistence().catch(err => {
        console.warn("Offline persistence activation bypassed: ", err.code);
    });
} catch (e) {
    console.error("Firebase config crash prevented:", e);
}

const auth = firebase.auth();
const db = firebase.database();

// =========================================================
// MEDIA METADATA GUARD — R2 HLS ONLY
// =========================================================
(function installFlaynityMediaMetadataGuard() {
    if (window.__flaynityMediaMetadataGuardInstalled) return;
    window.__flaynityMediaMetadataGuardInstalled = true;
    const MEDIA_BASE = "https://cdn.flaynity.indevs.in/media";

    function isMediaRecord(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        return Object.prototype.hasOwnProperty.call(value, 'videoProvider') ||
            Object.prototype.hasOwnProperty.call(value, 'videoLink') ||
            Object.prototype.hasOwnProperty.call(value, 'videoUrl') ||
            Object.prototype.hasOwnProperty.call(value, 'hlsUrl') ||
            Object.prototype.hasOwnProperty.call(value, 'transcodeJobId');
    }
    function normalizeMediaValue(value) {
        if (Array.isArray(value)) return value.map(normalizeMediaValue);
        if (!value || typeof value !== 'object') return value;
        const out = {};
        Object.keys(value).forEach(key => { out[key] = normalizeMediaValue(value[key]); });
        if (!isMediaRecord(out)) return out;
        let hls = String(out.hlsUrl || '').trim();
        const candidates = [out.videoLink, out.videoUrl];
        if (!hls) hls = candidates.map(v => String(v || '').trim()).find(v => /\.m3u8(?:$|[?#])/i.test(v)) || '';
        const jobId = String(out.transcodeJobId || '').trim();
        if (jobId && /^[a-zA-Z0-9_-]+$/.test(jobId)) hls = `${MEDIA_BASE}/uploads/hls/${encodeURIComponent(jobId)}/master.m3u8`;
        if (hls) {
            out.videoProvider = 'r2-hls'; out.videoLink = hls; out.videoUrl = hls; out.hlsUrl = hls; out.dashUrl = '';
            return out;
        }
        const hasLegacyProvider = String(out.videoProvider || '').toLowerCase() === 'r2';
        const hasMp4Link = candidates.some(v => /\.mp4(?:$|[?#])/i.test(String(v || '').trim()));
        if (hasLegacyProvider || hasMp4Link) throw new Error('R2-HLS master.m3u8 is required before publishing Video or Feels.');
        return out;
    }
    function guardRef(ref) {
        if (!ref || ref.__flaynityMediaGuarded) return ref;
        try { Object.defineProperty(ref, '__flaynityMediaGuarded', { value: true, configurable: true }); } catch (e) {}
        const originalSet = typeof ref.set === 'function' ? ref.set.bind(ref) : null;
        const originalUpdate = typeof ref.update === 'function' ? ref.update.bind(ref) : null;
        const originalSetWithPriority = typeof ref.setWithPriority === 'function' ? ref.setWithPriority.bind(ref) : null;
        const originalPush = typeof ref.push === 'function' ? ref.push.bind(ref) : null;
        if (originalSet) ref.set = function(value, onComplete) { return originalSet(normalizeMediaValue(value), onComplete); };
        if (originalUpdate) ref.update = function(values, onComplete) { return originalUpdate(normalizeMediaValue(values), onComplete); };
        if (originalSetWithPriority) ref.setWithPriority = function(value, priority, onComplete) { return originalSetWithPriority(normalizeMediaValue(value), priority, onComplete); };
        if (originalPush) ref.push = function(value, onComplete) {
            if (arguments.length === 0) return originalPush();
            return guardRef(originalPush(normalizeMediaValue(value), onComplete));
        };
        return ref;
    }
    const originalRef = db.ref.bind(db);
    db.ref = function(path) { return guardRef(originalRef(path)); };
})();

// Load the fast multipart uploader after cloudflare-r2.js has initialized.
// This keeps the existing secure R2/HLS functions available and replaces only
// the Video/Feels upload entry point with adaptive multipart upload.
setTimeout(function () {
    if (document.querySelector('script[data-flaynity-fast-uploader]')) return;
    const script = document.createElement('script');
    script.src = 'js/r2-hls-fast-upload.js?v=1';
    script.async = true;
    script.dataset.flaynityFastUploader = '1';
    document.head.appendChild(script);
}, 0);
