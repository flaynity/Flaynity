// Flaynity secure media API bridge.
// Replaces browser-side S3/R2 credentials with the Cloudflare Worker upload API.
(function () {
    const API_BASE = 'https://flaynity-api.flaynity.workers.dev';

    function uploadWithProgress(file, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', API_BASE + '/upload', true);
            xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
            xhr.upload.onprogress = function (evt) {
                if (evt.lengthComputable && typeof onProgress === 'function') {
                    onProgress(evt.loaded, evt.total);
                }
            };
            xhr.onload = function () {
                let data = {};
                try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
                if (xhr.status >= 200 && xhr.status < 300 && data.success) resolve(data);
                else reject(new Error(data.error || `Upload failed (${xhr.status})`));
            };
            xhr.onerror = function () { reject(new Error('Network error during upload.')); };
            xhr.onabort = function () { reject(new Error('Upload cancelled.')); };
            xhr.send(file);
        });
    }

    window.startS3DirectUpload = async function (item) {
        if (!navigator.onLine) {
            item.status = 'paused';
            if (typeof updateManagerUI === 'function') updateManagerUI();
            if (typeof showNotification === 'function') showNotification('Offline: Upload paused.', 'error');
            activeUploadsCount = Math.max(0, activeUploadsCount - 1);
            return;
        }

        item.status = 'uploading';
        item.progress = item.progress || 0;
        if (typeof updateManagerUI === 'function') updateManagerUI();
        const startTime = Date.now();

        try {
            const data = await uploadWithProgress(item.file, function (loaded, total) {
                if (item.status !== 'uploading') return;
                item.progress = total ? Math.round((loaded / total) * 100) : 0;
                const elapsed = Math.max(0.001, (Date.now() - startTime) / 1000);
                item.speed = loaded / elapsed;
                item.eta = item.speed > 0 ? (total - loaded) / item.speed : 0;
                if (typeof updateManagerUI === 'function') updateManagerUI();
            });

            item.key = data.key || item.key;
            item.videoUrl = data.url || getFastMediaUrl(data.key || item.key);
            item.progress = 100;
            item.status = 'processing';
            item.retryCount = 0;
            if (typeof updateManagerUI === 'function') updateManagerUI();

            if (typeof runPostUploadProcessingSequence === 'function') {
                await runPostUploadProcessingSequence(item);
            }
        } catch (err) {
            if (item.status === 'paused') {
                console.log('Upload paused safely.');
            } else if (!navigator.onLine) {
                item.status = 'paused';
                if (typeof updateManagerUI === 'function') updateManagerUI();
                if (typeof showNotification === 'function') showNotification('Connection lost. Upload paused.', 'error');
            } else {
                console.error('Upload error:', err);
                item.retryCount = (item.retryCount || 0) + 1;
                if (item.retryCount <= 5) {
                    item.status = 'waiting';
                    if (typeof updateManagerUI === 'function') updateManagerUI();
                    if (typeof showNotification === 'function') showNotification(`Network hiccup. Retrying (${item.retryCount}/5)...`, 'error');
                } else {
                    item.status = 'failed';
                    if (typeof updateManagerUI === 'function') updateManagerUI();
                    if (typeof showNotification === 'function') showNotification(`Upload failed: ${err.message}`, 'error');
                }
            }
        } finally {
            activeUploadsCount = Math.max(0, activeUploadsCount - 1);
            if (typeof triggerNextActiveUpload === 'function') triggerNextActiveUpload();
        }
    };
})();
