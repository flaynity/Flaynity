// =========================================================
// CLOUDFLARE R2 OBJECT STORAGE MODULE
// =========================================================
const R2_CONFIG = {
    accessKeyId: "c4d26ef58f7d0818695c8710af083fb6",
    secretAccessKey: "97bc62a7b0c961001611489e28f9dbd41d2b30cda3e8348bb32d12a7c1d319a8",
    endpoint: "https://b3741135bd1f3e96b6744f11e6a06600.r2.cloudflarestorage.com",
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
    region: 'auto',
    maxRetries: 5,
    httpOptions: {
        timeout: 300000, 
        connectTimeout: 30000
    }
};

AWS.config.update(R2_CONFIG);
const s3 = new AWS.S3({ params: { Bucket: 'flaynity-storage' } });
// Public delivery hostname. Keep all playback/media URLs on the Cloudflare CDN hostname.
const FLAYNITY_CDN_BASE = "https://cdn.flaynity.indevs.in";
const PUBLIC_R2_DOMAIN_PREFIX = FLAYNITY_CDN_BASE;

const FLAYNITY_MEDIA_FOLDERS = Object.freeze({
    video: "videos",
    feels: "feels",
    post: "posts",
    thumbnail: "thumbnails",
    avatar: "avatars"
});

function flaynityCdnUrl(path) {
    if (!path) return "";
    const value = String(path).trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) {
        try {
            const u = new URL(value);
            if (u.hostname === "pub-92694602f8ec4e0fbbcbf4a91b194f69.r2.dev" ||
                u.hostname === "b3741135bd1f3e96b6744f11e6a06600.r2.cloudflarestorage.com") {
                return FLAYNITY_CDN_BASE + u.pathname + u.search;
            }
            return value;
        } catch (e) { return value; }
    }
    return FLAYNITY_CDN_BASE + "/" + value.replace(/^\/+/, "");
}

function flaynityMediaKey(kind, ownerId, fileName, mediaId) {
    const folder = FLAYNITY_MEDIA_FOLDERS[kind] || kind || "media";
    const owner = String(ownerId || "global").replace(/[^A-Za-z0-9_-]/g, "_");
    const id = String(mediaId || (Date.now() + "_" + Math.random().toString(36).slice(2, 8))).replace(/[^A-Za-z0-9_-]/g, "_");
    const safeName = String(fileName || "media").replace(/[^A-Za-z0-9._-]/g, "_");
    return `${folder}/${owner}/${id}_${safeName}`;
}

function flaynityQualityKeyFromVideoUrl(url, quality) {
    if (!url || !quality) return "";
    const clean = String(url).split("?")[0];
    const marker = String(quality).toLowerCase().replace(/[^0-9a-z]/g, "");
    const slash = clean.lastIndexOf("/");
    const dir = slash >= 0 ? clean.slice(0, slash + 1) : "";
    const file = slash >= 0 ? clean.slice(slash + 1) : clean;
    const dot = file.lastIndexOf(".");
    if (dot < 0) return clean;
    return `${dir}${file.slice(0, dot)}_${marker}${file.slice(dot)}`;
}

// =========================================================
// S3 R2 OBJECT STORAGE MEDIA UPLOAD MODULE
// =========================================================
async function uploadImageToR2(file, folder = "images", retries = 3, ownerId = "global", mediaId = "") {
    if (!s3) throw new Error("R2 Client storage unit is not configured.");
    const uniqueId = mediaId || ("img_" + Date.now() + "_" + Math.floor(Math.random() * 1000));
    const kind = folder === "posts" ? "post" : folder === "thumbnails" ? "thumbnail" : folder === "avatars" ? "avatar" : folder;
    const fileKey = flaynityMediaKey(kind, ownerId, file.name, uniqueId);
    const params = {
        Key: fileKey,
        Body: file,
        ContentType: file.type || "image/jpeg"
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await s3.putObject(params).promise();
            return flaynityCdnUrl(fileKey);
        } catch (err) {
            console.warn(`R2 Image Upload attempt ${attempt} failed:`, err);
            if (attempt === retries) throw err;
            await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
        }
    }
}

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}
