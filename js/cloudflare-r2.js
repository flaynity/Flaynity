/**
 * Flaynity - Cloudflare R2 Media Storage Architecture
 * Handles secure direct-to-R2 uploads and CDN URL generation.
 * 
 * NOTE: For full production security (Rule 111), these AWS keys should ideally be kept 
 * on a server generating presigned URLs. As per exact prompt requirements, they are 
 * implemented here to ensure functional app testing and immediate uploads.
 */

(function() {
    // Initialize AWS SDK configured for Cloudflare R2
    AWS.config.update({
        accessKeyId: 'd2a85101c7abf7c81c2497b790d47d4c',
        secretAccessKey: '8f05ee42698a0349b1c3be34adef6f0f116878c7ec7b6805d5c6f102d4b94e2d',
        region: 'auto',
        signatureVersion: 'v4'
    });

    const s3 = new AWS.S3({
        endpoint: 'https://b3741135bd1f3e96b6744f11e6a06600.r2.cloudflarestorage.com',
        s3ForcePathStyle: true // Needed for R2 compatibility
    });

    const BUCKET_NAME = 'flaynity-storage';
    const CDN_DOMAIN = 'https://pub-bcff9c709dbe44d7a50c78e9a0f9bd59.r2.dev';

    /**
     * Uploads a file to Cloudflare R2 and returns the CDN delivery URL.
     * @param {File} file - The media file (Video, Image)
     * @param {Function} onProgress - Callback for upload percentage (0-100)
     * @returns {Promise<string>} - Resolves with the public CDN URL
     */
    window.uploadToR2 = function(file, onProgress) {
        return new Promise((resolve, reject) => {
            if (!file) return reject("No file provided");

            // Generate unique, collision-resistant upload ID
            const extension = file.name.split('.').pop();
            const uniqueFilename = `media_${Date.now()}_${Math.random().toString(36).substring(2)}.${extension}`;
            
            // Organize path by media type
            let folder = 'others';
            if (file.type.startsWith('video/')) folder = 'videos';
            if (file.type.startsWith('image/')) folder = 'images';
            const objectKey = `${folder}/${uniqueFilename}`;

            const params = {
                Bucket: BUCKET_NAME,
                Key: objectKey,
                Body: file,
                ContentType: file.type
            };

            console.log(`[Flaynity] Starting R2 upload: ${objectKey}`);

            // S3 Managed Upload with tracking
            const request = s3.putObject(params);

            request.on('httpUploadProgress', (progress) => {
                const percentage = Math.round((progress.loaded / progress.total) * 100);
                if (onProgress) onProgress(percentage);
            });

            request.send((err, data) => {
                if (err) {
                    console.error("[Flaynity] R2 Upload Failed:", err);
                    reject(err);
                } else {
                    // Success! Generate CDN URL
                    const cdnUrl = `${CDN_DOMAIN}/${objectKey}`;
                    console.log("[Flaynity] Upload Complete. CDN URL:", cdnUrl);
                    resolve(cdnUrl);
                }
            });
        });
    };
})();
