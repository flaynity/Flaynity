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
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    firebase.database().enablePersistence().catch(err => {
        console.warn("Offline persistence activation bypassed: ", err.code);
    });
} catch (e) {
    console.error("Firebase config crash prevented:", e);
}

const auth = firebase.auth();
const db = firebase.database();

// =========================================================
// MEDIA METADATA GUARD
// =========================================================
// Video and Feels must never be persisted as the legacy `r2` MP4
// provider. New uploads use the self-hosted R2 -> FFmpeg -> HLS pipeline.
// When a write contains an HLS URL (or a transcode job id), normalize the
// media record so Firebase stores the HLS master playlist consistently.
(function installFlaynityMediaMetadataGuard() {
    if (window.__flaynityMediaMetadataGuardInstalled) return;
    window.__flaynityMediaMetadataGuardInstalled = true;

    const MEDIA_BASE = "https://cdn.flaynity.indevs.in/media";

    function normalizeMediaValue(value) {
        if (Array.isArray(value)) return value.map(normalizeMediaValue);
        if (!value || typeof value !== "object") return value;

        const out = {};
        Object.keys(value).forEach(key => {
            out[key] = normalizeMediaValue(value[key]);
        });

        const looksLikeVideo = Object.prototype.hasOwnProperty.call(out, 'videoProvider') ||
            Object.prototype.hasOwnProperty.call(out, 'videoLink') ||
            Object.prototype.hasOwnProperty.call(out, 'videoUrl') ||
            Object.prototype.hasOwnProperty.call(out, 'hlsUrl') ||
            Object.prototype.hasOwnProperty.call(out, 'transcodeJobId');

        if (!looksLikeVideo) return out;

        let hls = String(out.hlsUrl || '').trim();
        const candidates = [out.videoLink, out.videoUrl];
        if (!hls) {
            hls = candidates.map(v => String(v || '').trim()).find(v => /\.m3u8(?:$|[?#])/i.test(v)) || '';
        }

        const jobId = String(out.transcodeJobId || '').trim();
        if (!hls && jobId && /^[a-zA-Z0-9_-]+$/.test(jobId)) {
            hls = `${MEDIA_BASE}/uploads/hls/${encodeURIComponent(jobId)}/master.m3u8`;
        }

        if (hls) {
            out.videoProvider = 'r2-hls';
            out.videoLink = hls;
            out.videoUrl = hls;
            out.hlsUrl = hls;
            if (!out.dashUrl) out.dashUrl = '';
        }

        return out;
    }

    function guardRef(ref) {
        if (!ref || ref.__flaynityMediaGuarded) return ref;
        try {
            Object.defineProperty(ref, '__flaynityMediaGuarded', { value: true, configurable: true });
        } catch (e) {}

        const originalSet = typeof ref.set === 'function' ? ref.set.bind(ref) : null;
        const originalUpdate = typeof ref.update === 'function' ? ref.update.bind(ref) : null;
        const originalSetWithPriority = typeof ref.setWithPriority === 'function' ? ref.setWithPriority.bind(ref) : null;
        const originalPush = typeof ref.push === 'function' ? ref.push.bind(ref) : null;

        if (originalSet) ref.set = function(value, onComplete) {
            return originalSet(normalizeMediaValue(value), onComplete);
        };
        if (originalUpdate) ref.update = function(values, onComplete) {
            return originalUpdate(normalizeMediaValue(values), onComplete);
        };
        if (originalSetWithPriority) ref.setWithPriority = function(value, priority, onComplete) {
            return originalSetWithPriority(normalizeMediaValue(value), priority, onComplete);
        };
        if (originalPush) ref.push = function(value, onComplete) {
            if (arguments.length === 0) return originalPush();
            const pushed = originalPush(normalizeMediaValue(value), onComplete);
            return guardRef(pushed);
        };
        return ref;
    }

    const originalRef = db.ref.bind(db);
    db.ref = function(path) {
        return guardRef(originalRef(path));
    };

    // Firebase compat returns the same Database instance from firebase.database(),
    // so patching this shared instance also covers callers using firebase.database().ref().
})();
