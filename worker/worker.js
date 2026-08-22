const PROJECT_ID = 'flaynity-app';
const PUBLIC_R2_DOMAIN = 'https://pub-92694602f8ec4e0fbbcbf4a91b194f69.r2.dev';
const MAX_OBJECT_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB
const MAX_PART_SIZE = 100 * 1024 * 1024; // 100 MB

let jwkCache = null;
let jwkCacheExpiresAt = 0;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Requested-With',
    'Access-Control-Expose-Headers': 'ETag,Content-Length,Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin)
    }
  });
}

function base64UrlToBytes(value) {
  const pad = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

async function getGoogleKeys() {
  const now = Date.now();
  if (jwkCache && now < jwkCacheExpiresAt) return jwkCache;

  const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', {
    cf: { cacheTtl: 3600, cacheEverything: true }
  });
  if (!response.ok) throw new Error('Unable to load Firebase signing keys');
  const data = await response.json();
  jwkCache = data.keys || [];
  jwkCacheExpiresAt = now + 50 * 60 * 1000;
  return jwkCache;
}

async function verifyFirebaseToken(request) {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('Missing Firebase authorization');

  const token = authorization.slice(7).trim();
  const pieces = token.split('.');
  if (pieces.length !== 3) throw new Error('Invalid Firebase token');

  const header = decodeJsonPart(pieces[0]);
  const payload = decodeJsonPart(pieces[1]);
  if (!header.kid || header.alg !== 'RS256') throw new Error('Invalid Firebase token header');

  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || payload.sub.length > 128) throw new Error('Invalid Firebase subject');
  if (payload.aud !== PROJECT_ID) throw new Error('Invalid Firebase audience');
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error('Invalid Firebase issuer');
  if (!payload.exp || payload.exp <= now) throw new Error('Firebase token expired');
  if (payload.iat && payload.iat > now + 300) throw new Error('Firebase token issued in the future');

  const keys = await getGoogleKeys();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Firebase signing key not found');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const data = new TextEncoder().encode(`${pieces[0]}.${pieces[1]}`);
  const signature = base64UrlToBytes(pieces[2]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, data);
  if (!valid) throw new Error('Invalid Firebase token signature');

  return payload;
}

function sanitizeKey(key) {
  key = String(key || '').replace(/^\/+/, '');
  if (!key || key.length > 1024 || key.includes('..') || /[\x00-\x1F\x7F]/.test(key)) {
    throw new Error('Invalid object key');
  }
  return key;
}

function contentType(value) {
  const type = String(value || 'application/octet-stream').slice(0, 200);
  return type;
}

function publicUrl(key) {
  return `${PUBLIC_R2_DOMAIN}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'GET' && path === '/') {
      return json({ ok: true, service: 'Flaynity R2 Upload Worker' }, 200, origin);
    }

    let user;
    try {
      user = await verifyFirebaseToken(request);
    } catch (error) {
      return json({ ok: false, error: error.message || 'Unauthorized' }, 401, origin);
    }

    try {
      if (request.method === 'POST' && path === '/multipart/initiate') {
        const body = await request.json();
        const key = sanitizeKey(body.key);
        const type = contentType(body.contentType);
        const upload = await env.BUCKET.createMultipartUpload(key, {
          httpMetadata: { contentType: type }
        });

        return json({
          ok: true,
          key,
          uploadId: upload.uploadId,
          publicUrl: publicUrl(key),
          userId: user.user_id || user.sub
        }, 200, origin);
      }

      if (request.method === 'PUT' && path === '/multipart/part') {
        const key = sanitizeKey(url.searchParams.get('key'));
        const uploadId = String(url.searchParams.get('uploadId') || '');
        const partNumber = Number(url.searchParams.get('partNumber'));
        if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
          return json({ ok: false, error: 'Invalid multipart parameters' }, 400, origin);
        }

        const length = Number(request.headers.get('Content-Length') || 0);
        if (length > MAX_PART_SIZE) return json({ ok: false, error: 'Multipart part too large' }, 413, origin);

        const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
        const part = await upload.uploadPart(partNumber, request.body);
        return json({ ok: true, partNumber, etag: part.etag }, 200, origin);
      }

      if (request.method === 'POST' && path === '/multipart/complete') {
        const body = await request.json();
        const key = sanitizeKey(body.key);
        const uploadId = String(body.uploadId || '');
        const parts = Array.isArray(body.parts) ? body.parts : [];
        if (!uploadId || !parts.length) return json({ ok: false, error: 'Missing multipart parts' }, 400, origin);

        const normalized = parts.map(p => ({
          partNumber: Number(p.partNumber),
          etag: String(p.etag || '')
        })).filter(p => Number.isInteger(p.partNumber) && p.partNumber > 0 && p.etag);

        normalized.sort((a, b) => a.partNumber - b.partNumber);
        if (!normalized.length) return json({ ok: false, error: 'No valid parts' }, 400, origin);

        const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
        await upload.complete(normalized);
        return json({ ok: true, key, publicUrl: publicUrl(key) }, 200, origin);
      }

      if (request.method === 'POST' && path === '/multipart/abort') {
        const body = await request.json();
        const key = sanitizeKey(body.key);
        const uploadId = String(body.uploadId || '');
        if (!uploadId) return json({ ok: false, error: 'Missing uploadId' }, 400, origin);
        await env.BUCKET.resumeMultipartUpload(key, uploadId).abort();
        return json({ ok: true }, 200, origin);
      }

      if (request.method === 'PUT' && path === '/object') {
        const key = sanitizeKey(url.searchParams.get('key'));
        const length = Number(request.headers.get('Content-Length') || 0);
        if (length > MAX_OBJECT_SIZE) return json({ ok: false, error: 'Object too large' }, 413, origin);

        await env.BUCKET.put(key, request.body, {
          httpMetadata: { contentType: contentType(request.headers.get('Content-Type')) }
        });
        return json({ ok: true, key, publicUrl: publicUrl(key) }, 200, origin);
      }

      return json({ ok: false, error: 'Not found' }, 404, origin);
    } catch (error) {
      console.error('R2 worker error', error);
      return json({ ok: false, error: error.message || 'R2 operation failed' }, 500, origin);
    }
  }
};
