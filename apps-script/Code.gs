/**
 * Flaynity Email OTP — Google Apps Script Web App
 *
 * Deploy as: Web app
 * Execute as: Me
 * Who has access: Anyone
 *
 * Required Script Property:
 *   FIREBASE_WEB_API_KEY = the Firebase project's Web API key
 *
 * Actions: sendEmailCode, verifyEmailCode
 * The app submits a form POST so Android WebView does not depend on CORS preflight.
 */

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;
const FIREBASE_LOOKUP = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=';
const FIREBASE_UPDATE = 'https://identitytoolkit.googleapis.com/v1/accounts:update?key=';

function doPost(e) {
  var requestId = '';
  var result;
  try {
    var raw = e && e.parameter && e.parameter.payload;
    if (!raw) throw appError('invalid-argument', 'Missing request payload.');
    var req = JSON.parse(raw);
    requestId = String(req.requestId || '');
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw appError('invalid-argument', 'Invalid request identifier.');
    var user = verifyFirebaseToken_(String(req.idToken || ''));
    var action = String(req.action || '');
    if (action === 'sendEmailCode') {
      result = sendEmailCode_(user, req.data || {});
    } else if (action === 'verifyEmailCode') {
      result = verifyEmailCode_(user, req.data || {});
    } else {
      throw appError('invalid-argument', 'Unknown verification action.');
    }
  } catch (err) {
    result = { ok: false, code: err.code || 'internal', error: safeMessage_(err) };
  }
  return htmlResponse_(requestId, result);
}

function sendEmailCode_(user, data) {
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var uid = user.localId;
    var email = String(user.email || '').trim().toLowerCase();
    if (!email || user.emailVerified === true) throw appError('failed-precondition', 'This email is already verified or unavailable.');
    var now = Date.now();
    var prefix = 'otp_' + uid + '_';
    var lastSent = Number(props.getProperty(prefix + 'sent') || 0);
    if (now - lastSent < RESEND_COOLDOWN_MS) throw appError('resource-exhausted', 'Please wait before requesting another code.');
    var history = JSON.parse(props.getProperty(prefix + 'history') || '[]').filter(function(t) { return now - t < 60 * 60 * 1000; });
    if (history.length >= MAX_SENDS_PER_HOUR) throw appError('resource-exhausted', 'Too many codes requested. Try again in an hour.');
    var code = String(Math.floor(100000 + Math.random() * 900000));
    var secret = getSecret_();
    var digest = hash_(uid + '|' + email + '|' + code + '|' + secret);
    props.setProperties({
      [prefix + 'hash']: digest,
      [prefix + 'expires']: String(now + OTP_TTL_MS),
      [prefix + 'attempts']: '0',
      [prefix + 'sent']: String(now),
      [prefix + 'history']: JSON.stringify(history.concat([now]))
    }, false);
    var subject = 'Your Flaynity verification code';
    var html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#111">' +
      '<h2 style="margin:0 0 12px">Verify your Flaynity email</h2>' +
      '<p>Use this one-time verification code to finish creating your Flaynity account:</p>' +
      '<div style="font-size:34px;font-weight:700;letter-spacing:10px;padding:18px 12px;background:#f5f5f5;border-radius:12px;text-align:center">' + code + '</div>' +
      '<p>This code expires in 5 minutes. Do not share it with anyone.</p><p style="color:#777;font-size:12px">If you did not request this code, you can ignore this email.</p></div>';
    MailApp.sendEmail({ to: email, subject: subject, body: 'Your Flaynity verification code is ' + code + '. It expires in 5 minutes.', htmlBody: html, name: 'Flaynity' });
    return { ok: true, message: 'Verification code sent.' };
  } finally {
    lock.releaseLock();
  }
}

function verifyEmailCode_(user, data) {
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var uid = user.localId;
    var email = String(user.email || '').trim().toLowerCase();
    var prefix = 'otp_' + uid + '_';
    var now = Date.now();
    var expected = props.getProperty(prefix + 'hash');
    var expires = Number(props.getProperty(prefix + 'expires') || 0);
    var attempts = Number(props.getProperty(prefix + 'attempts') || 0);
    var code = String(data.code || '').replace(/\D/g, '');
    if (!expected || !expires || now > expires) {
      clearOtp_(props, prefix);
      throw appError('deadline-exceeded', 'The code has expired. Request a new code.');
    }
    if (attempts >= MAX_ATTEMPTS) {
      clearOtp_(props, prefix);
      throw appError('resource-exhausted', 'Too many incorrect attempts. Request a new code.');
    }
    if (!/^\d{6}$/.test(code) || hash_(uid + '|' + email + '|' + code + '|' + getSecret_()) !== expected) {
      props.setProperty(prefix + 'attempts', String(attempts + 1));
      throw appError('invalid-code', 'The verification code is incorrect.');
    }
    var apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
    if (!apiKey) throw appError('failed-precondition', 'Server setup is incomplete: Firebase API key is missing.');
    var update = UrlFetchApp.fetch(FIREBASE_UPDATE + encodeURIComponent(apiKey), {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: currentIdToken_(), emailVerified: true, returnSecureToken: true }),
      muteHttpExceptions: true
    });
    var response = JSON.parse(update.getContentText() || '{}');
    if (update.getResponseCode() < 200 || update.getResponseCode() >= 300 || !response.emailVerified) {
      throw appError('internal', 'The code is correct, but Firebase could not update the email verification status.');
    }
    clearOtp_(props, prefix);
    return { ok: true, verified: true, email: email };
  } finally {
    lock.releaseLock();
  }
}

// Stores the ID token only for the current execution to avoid trusting client-supplied UID/email.
var CURRENT_ID_TOKEN_ = '';
function verifyFirebaseToken_(idToken) {
  if (!idToken) throw appError('unauthenticated', 'Please sign in and try again.');
  CURRENT_ID_TOKEN_ = idToken;
  var apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
  if (!apiKey) throw appError('failed-precondition', 'Server setup is incomplete: Firebase API key is missing.');
  var res = UrlFetchApp.fetch(FIREBASE_LOOKUP + encodeURIComponent(apiKey), {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true
  });
  var data = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300 || !data.users || !data.users.length) {
    throw appError('unauthenticated', 'Your sign-in session expired. Please sign in again.');
  }
  return data.users[0];
}

function currentIdToken_() { return CURRENT_ID_TOKEN_; }
function clearOtp_(props, prefix) {
  ['hash','expires','attempts','sent','history'].forEach(function(k) { props.deleteProperty(prefix + k); });
}
function getSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('OTP_HASH_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('OTP_HASH_SECRET', secret);
  }
  return secret;
}
function hash_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map(function(b) { var v = (b + 256) % 256; return ('0' + v.toString(16)).slice(-2); }).join('');
}
function appError(code, message) { var e = new Error(message); e.code = code; return e; }
function safeMessage_(err) { return String(err && err.message || 'Unable to process this request.').slice(0, 220); }

function htmlResponse_(requestId, result) {
  var payload = JSON.stringify({ type: 'flaynity-email-verification', requestId: requestId, result: result })
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  var html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' +
    '<script>try{window.top.postMessage(' + payload + ', "*");}catch(e){try{window.parent.postMessage(' + payload + ', "*");}catch(e2){}}</script>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
