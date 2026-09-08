// Flaynity Cloudflare media upload API
const FLAYNITY_API_BASE = 'https://flaynity-api.flaynity.workers.dev';

function uploadFileToFlaynityAPI(file, folder = 'uploads', onProgress) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected'));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', FLAYNITY_API_BASE + '/upload', true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') onProgress(Math.round(e.loaded / e.total * 100), e.loaded, e.total);
    };
    xhr.onload = () => {
      let data;
      try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) { return reject(new Error('Invalid server response')); }
      if (xhr.status >= 200 && xhr.status < 300 && data.success) return resolve(data);
      reject(new Error(data.error || ('Upload failed (' + xhr.status + ')')));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(file);
  });
}

async function uploadVideoToR2(file, folder = 'videos', onProgress) {
  const data = await uploadFileToFlaynityAPI(file, folder, onProgress);
  return data.url;
}

async function uploadImageToR2(file, folder = 'images', retries = 3, onProgress) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const data = await uploadFileToFlaynityAPI(file, folder, onProgress);
      return data.url;
    } catch (e) {
      lastError = e;
      if (i + 1 < retries) await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastError || new Error('Image upload failed');
}

window.FLaynityMediaAPI = { uploadFileToFlaynityAPI, uploadVideoToR2, uploadImageToR2 };
