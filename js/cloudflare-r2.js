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
const PUBLIC_R2_DOMAIN_PREFIX = "https://pub-92694602f8ec4e0fbbcbf4a91b194f69.r2.dev";

// Public Cloudflare CDN/custom domain used by Flaynity for all newly published media.
const FLAYNITY_CDN_DOMAIN = "https://cnd.flaynity.indevs.in";

function getMediaExtension(file, fallback = "bin") {
    const name = (file && file.name) ? file.name : "";
    const match = name.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : fallback;
}

function getMediaFileName(file, fallback = "bin") {
    const ext = getMediaExtension(file, fallback);
    const random = Math.random().toString(36).slice(2, 8);
    return `${Date.now()}_${random}.${ext}`;
}

function getCurrentUserId() {
    const user = (typeof auth !== "undefined" && auth) ? auth.currentUser : null;
    if (!user || !user.uid) throw new Error("You must be signed in before uploading media.");
    return user.uid;
}

// =========================================================
// S3 R2 OBJECT STORAGE MEDIA UPLOAD MODULE
// =========================================================
async function uploadImageToR2(file, folder = "images", retries = 3) {
    if (!s3) throw new Error("R2 Client storage unit is not configured.");
    const uid = getCurrentUserId();
    const fileKey = `${folder}/${uid}/${getMediaFileName(file, "jpg")}`;
    const params = {
        Key: fileKey,
        Body: file,
        ContentType: file.type || "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable"
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await s3.putObject(params).promise();
            return `${FLAYNITY_CDN_DOMAIN}/${fileKey}`;
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
