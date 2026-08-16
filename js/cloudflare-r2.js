/**
 * FLAYNITY — CLOUDFLARE R2 OBJECT STORAGE MODULE
 * High-speed video, short & photo uploads powered by AWS SDK S3 API.
 */

(function() {
  'use strict';

  // 1. Cloudflare R2 Credentials & Configuration
  // Note: In strict production setups, upload tokens should be signed via backend worker.
  const R2_CONFIG = {
    accountId: "b3741135bd1f3e96b6744f11e6a06600",
    accessKeyId: "76b902c42a3697ad5011ef1c72438306",
    secretAccessKey: "33902a8ed31914daf36aa6d6f7a715d93ab1cad856cb7eb286edb05e0fe87763",
    bucketName: "flaynity-storage",
    // Public custom domain or Cloudflare R2 public dev bucket URL:
    publicDomainUrl: "https://pub-bcff9c709dbe44d7a50c78e9a0f9bd59.r2.dev"
  };

  // 2. Initialize S3 Client configured for Cloudflare R2 endpoint
  let s3Instance = null;

  function getS3Client() {
    if (!s3Instance && window.AWS) {
      s3Instance = new window.AWS.S3({
        endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
        accessKeyId: R2_CONFIG.accessKeyId,
        secretAccessKey: R2_CONFIG.secretAccessKey,
        signatureVersion: 'v4',
        region: 'auto',
        s3ForcePathStyle: true
      });
    }
    return s3Instance;
  }

  // 3. Flaynity R2 Upload API
  window.FlaynityR2 = {
    /**
     * Uploads any File (Video, Audio, Image) to Cloudflare R2
     * @param {File} file - Browser File object from input
     * @param {string} folder - 'videos', 'shorts', 'thumbnails', 'posts', 'avatars'
     * @param {Function} onProgress - Callback receiving percentage (0-100)
     * @returns {Promise<string>} - Resolves with the public media URL
     */
    async uploadFile(file, folder = 'uploads', onProgress = null) {
      if (!file) throw new Error("No file provided for upload.");

      const s3 = getS3Client();
      if (!s3) {
        throw new Error("AWS S3 Client is not initialized. Check AWS SDK script inclusion.");
      }

      // Generate Unique Key: folder/timestamp_random.extension
      const fileExt = file.name.split('.').pop().toLowerCase();
      const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const objectKey = `${folder}/${uniqueName}`;

      const params = {
        Bucket: R2_CONFIG.bucketName,
        Key: objectKey,
        Body: file,
        ContentType: file.type || 'application/octet-stream'
      };

      try {
        const upload = s3.upload(params);

        // Track real-time progress
        if (typeof onProgress === 'function') {
          upload.on('httpUploadProgress', (evt) => {
            if (evt.total) {
              const percent = Math.round((evt.loaded / evt.total) * 100);
              onProgress(percent);
            }
          });
        }

        // Execute upload promise
        await upload.promise();

        // Return direct public URL
        const finalUrl = `${R2_CONFIG.publicDomainUrl}/${objectKey}`;
        console.log('[Flaynity R2] Upload successful:', finalUrl);
        return finalUrl;
      } catch (err) {
        console.error('[Flaynity R2] Upload failure:', err);
        throw new Error(`Cloudflare R2 Upload Failed: ${err.message}`);
      }
    },

    /**
     * Delete an Object from Cloudflare R2
     */
    async deleteFile(objectKey) {
      const s3 = getS3Client();
      if (!s3) return;

      const params = {
        Bucket: R2_CONFIG.bucketName,
        Key: objectKey
      };

      return s3.deleteObject(params).promise();
    }
  };
})();
