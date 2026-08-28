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

// =========================================================
// S3 R2 OBJECT STORAGE MEDIA UPLOAD MODULE
// =========================================================
async function uploadImageToR2(file, folder = "images", retries = 3) {
    if (!s3) throw new Error("R2 Client storage unit is not configured.");
    const uniqueId = "img_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const fileKey = `uploads/${folder}/${uniqueId}_${file.name.replace(/\s+/g, '_')}`;
    const params = {
        Key: fileKey,
        Body: file,
        ContentType: file.type || "image/jpeg"
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await s3.putObject(params).promise();
            return `${PUBLIC_R2_DOMAIN_PREFIX}/${fileKey}`;
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

