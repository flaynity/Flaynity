// ==========================================
// CLOUDFLARE R2 (AWS SDK S3 COMPATIBLE) SETUP
// ==========================================

/* 
  Security Note:
  For a Sketchware WebView app without a backend server, we initialize the SDK directly here.
  In a strictly secure production environment, presigned URLs from a backend should be used.
*/

AWS.config.update({
    accessKeyId: "76b902c42a3697ad5011ef1c72438306",
    secretAccessKey: "33902a8ed31914daf36aa6d6f7a715d93ab1cad856cb7eb286edb05e0fe87763",
    region: "auto",
    signatureVersion: "v4"
});

const s3 = new AWS.S3({
    endpoint: "https://b3741135bd1f3e96b6744f11e6a06600.r2.cloudflarestorage.com",
    s3ForcePathStyle: true,
    signatureVersion: 'v4'
});

const R2_BUCKET = "flaynity-storage";
const R2_PUBLIC_DOMAIN = "https://pub-bcff9c709dbe44d7a50c78e9a0f9bd59.r2.dev";

// Global Upload Manager
window.FlaynityUploadManager = {
    
    /**
     * Uploads a file to Cloudflare R2
     * @param {File} file - The file to upload
     * @param {String} folder - E.g., 'videos', 'shorts', 'posts'
     * @param {Function} onProgress - Progress callback (0-100)
     * @returns {Promise<String>} - Public URL of the uploaded file
     */
    uploadFile: function(file, folder, onProgress) {
        return new Promise((resolve, reject) => {
            // Clean filename and generate unique key
            const cleanName = file.name.replace(/[^a-zA-Z0-9.\-]/g, '_');
            const fileKey = `${folder}/${Date.now()}_${cleanName}`;

            const params = {
                Bucket: R2_BUCKET,
                Key: fileKey,
                Body: file,
                ContentType: file.type
            };

            const uploadRequest = s3.upload(params);

            // Progress tracking
            uploadRequest.on('httpUploadProgress', (progressEvent) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                if (onProgress) onProgress(percentCompleted);
            });

            // Execute upload
            uploadRequest.send((err, data) => {
                if (err) {
                    console.error("R2 Upload Error:", err);
                    reject(err);
                } else {
                    const publicUrl = `${R2_PUBLIC_DOMAIN}/${fileKey}`;
                    console.log("Upload Success! URL:", publicUrl);
                    resolve(publicUrl);
                }
            });
        });
    }
};
