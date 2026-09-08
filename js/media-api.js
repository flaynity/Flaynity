// Flaynity secure media API client
// Uploads go directly to Cloudflare R2 using short-lived presigned URLs issued by the Render API.
const FLAYNITY_API_BASE = 'https://api.flaynity.indevs.in';

async function flaynityAuthHeaders() {
  const current = (typeof auth !== 'undefined' && auth && auth.currentUser) ? auth.currentUser : null;
  if (!current) throw new Error('Please sign in before uploading.');
  const token = await current.getIdToken(false);
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

async function flaynityApi(path, body) {
  const headers = await flaynityAuthHeaders();
  const res = await fetch(FLAYNITY_API_BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data.message || data.error || ('API request failed (' + res.status + ')'));
  return data;
}

function flaynityUploadPut(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && typeof onProgress === 'function') onProgress(Math.round(e.loaded / e.total * 100), e.loaded, e.total);
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('R2 upload failed (' + xhr.status + ')'));
    xhr.onerror = () => reject(new Error('Network error during R2 upload'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(file);
  });
}

async function flaynityWaitForMedia(id, timeoutMs = 10 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(FLAYNITY_API_BASE + '/v1/media/' + encodeURIComponent(id), { cache: 'no-store' });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (data.status === 'ready') return data;
    if (data.status === 'failed') throw new Error(data.error || 'Media processing failed');
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('Media processing timed out');
}

async function uploadFileToFlaynityAPI(file, folder = 'uploads', onProgress) {
  if (!file) throw new Error('No file selected');
  const current = (typeof auth !== 'undefined' && auth && auth.currentUser) ? auth.currentUser : null;
  if (!current) throw new Error('Please sign in before uploading.');
  const isImage = String(file.type || '').startsWith('image/');
  const type = folder === 'feels' ? 'feels' : (folder === 'videos' ? 'video' : (isImage ? 'images' : 'post'));
  const create = await flaynityApi('/v1/media/create-upload', {
    uid: current.uid, type, fileName: file.name || 'upload.bin', contentType: file.type || 'application/octet-stream',
    size: file.size || 0, mediaKind: isImage ? 'image' : 'video'
  });
  await flaynityUploadPut(create.uploadUrl, file, onProgress);
  const complete = await flaynityApi('/v1/media/complete-upload', {
    id: create.id, sourceKey: create.sourceKey, uid: current.uid, type,
    mediaKind: isImage ? 'image' : 'video'
  });
  if (isImage) return complete.imageUrl;
  const ready = await flaynityWaitForMedia(create.id);
  return ready;
}

async function uploadVideoToR2(file, folder = 'videos', onProgress) {
  const result = await uploadFileToFlaynityAPI(file, folder, onProgress);
  if (typeof result === 'string') return result;
  return result.masterUrl || result.hlsUrl || result.cdnUrl || result.videoUrl || '';
}

async function uploadImageToR2(file, folder = 'images', retries = 3, onProgress) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try { return await uploadFileToFlaynityAPI(file, folder, onProgress); }
    catch (e) { lastError = e; if (i + 1 < retries) await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
  throw lastError || new Error('Image upload failed');
}

window.FLaynityMediaAPI = { uploadFileToFlaynityAPI, uploadVideoToR2, uploadImageToR2 };
