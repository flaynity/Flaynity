// Fast R2 multipart uploader for Flaynity Video + Feels.
(function () {
  const API = "https://api.flaynity.indevs.in/api";
  const MIN_MULTIPART = 20 * 1024 * 1024;
  const PART_SIZE = 16 * 1024 * 1024;
  const MAX_RETRIES = 4;
  async function authHeaders() {
    const user = (typeof auth !== "undefined" && auth.currentUser) ? auth.currentUser : null;
    if (!user) throw new Error("Please sign in first.");
    return { Authorization: `Bearer ${await user.getIdToken(true)}` };
  }
  function concurrencyForNetwork() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return 3;
    if (c.saveData) return 1;
    const type = String(c.effectiveType || "").toLowerCase();
    const downlink = Number(c.downlink);
    if (type === "slow-2g" || type === "2g" || (Number.isFinite(downlink) && downlink < 1.5)) return 1;
    if (type === "3g" || (Number.isFinite(downlink) && downlink < 5)) return 2;
    if (Number.isFinite(downlink) && downlink >= 15) return 4;
    return 3;
  }
  async function apiJson(path, options) {
    const headers = await authHeaders();
    const response = await fetch(API + path, { ...options, headers: { ...headers, ...(options.headers || {}) }, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Upload request failed (${response.status}).`);
    return data;
  }
  async function sendPart(key, uploadId, partNumber, blob) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const headers = await authHeaders();
        const response = await fetch(`${API}/v1/media/multipart/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`, { method: "POST", headers, body: blob, cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.etag) throw new Error(data.error || `Part ${partNumber} failed (${response.status}).`);
        return { partNumber, etag: data.etag };
      } catch (e) {
        lastError = e;
        await new Promise(r => setTimeout(r, Math.min(1200 * attempt, 5000)));
      }
    }
    throw lastError || new Error(`Part ${partNumber} upload failed.`);
  }
  async function multipartUpload(file, upload, onProgress) {
    const total = file.size;
    const count = Math.ceil(total / PART_SIZE);
    const concurrency = Math.min(concurrencyForNetwork(), count);
    const completed = new Array(count);
    let nextPart = 1;
    let uploaded = 0;
    const worker = async () => {
      while (true) {
        const partNumber = nextPart++;
        if (partNumber > count) return;
        const start = (partNumber - 1) * PART_SIZE;
        const blob = file.slice(start, Math.min(start + PART_SIZE, total));
        const result = await sendPart(upload.key, upload.uploadId, partNumber, blob);
        completed[partNumber - 1] = result;
        uploaded += blob.size;
        if (typeof onProgress === "function") onProgress(Math.min(uploaded, total), total);
      }
    };
    try {
      await Promise.all(Array.from({ length: concurrency }, worker));
      await apiJson("/v1/media/multipart/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: upload.key, uploadId: upload.uploadId, parts: completed }) });
      if (typeof onProgress === "function") onProgress(total, total);
    } catch (e) {
      try { await apiJson("/v1/media/multipart/abort", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: upload.key, uploadId: upload.uploadId }) }); } catch (_) {}
      throw e;
    }
  }
  async function fastUploadVideo(file, options = {}, onProgress) {
    if (!file) throw new Error("No video selected.");
    const folder = options.folder === "feels" ? "feels" : "videos";
    const baseUpload = await window.flaynityCreateUpload(file, folder, { contentType: file.type || "video/mp4" });
    if (file.size < MIN_MULTIPART) {
      await window.flaynityPutWithProgress(baseUpload.uploadUrl, file, onProgress);
    } else {
      const upload = await apiJson("/v1/media/multipart/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: baseUpload.key, contentType: file.type || "video/mp4", size: file.size }) });
      await multipartUpload(file, upload, onProgress);
    }
    let job;
    try { job = await window.flaynityStartHlsTranscode(baseUpload.key, { type: folder }); }
    catch (e) { throw new Error(`HLS transcoder is not connected: ${e.message || e}`); }
    const ready = await window.flaynityWaitForHlsReady(job.jobId, options.onStatus);
    const canonicalJobId = ready.jobId || job.jobId;
    const base = window.FLAYNITY_MEDIA_BASE || "https://cdn.flaynity.indevs.in/media";
    const canonical = `${base}/uploads/hls/${encodeURIComponent(canonicalJobId)}/master.m3u8`;
    const hlsUrl = ready.hlsUrl || canonical;
    return { key: baseUpload.key, videoUrl: hlsUrl, hlsUrl, hlsKey: ready.hlsKey || `uploads/hls/${canonicalJobId}/master.m3u8`, transcodeJobId: canonicalJobId, videoQualities: { auto: hlsUrl, hls: hlsUrl, preferred: [144, 360, 480, 720, 1080] }, provider: "r2-hls" };
  }
  window.uploadVideoToFlaynityHls = fastUploadVideo;
})();
