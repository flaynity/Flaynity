FLAYNITY R2 PRODUCTION UPLOAD PACK
==================================

1) APP
-----
Replace your existing:
    js/app.js
with:
    js/app.js

The app is configured to use:
    https://flaynity-r2-upload.flaynity.workers.dev

Public media domain:
    https://pub-92694602f8ec4e0fbbcbf4a91b194f69.r2.dev

2) CLOUDFLARE WORKER
--------------------
Open the Worker:
    flaynity-r2-upload

Replace its Hello World code with:
    worker/worker.js

3) R2 BINDING
-------------
Worker Settings -> Bindings -> Add binding -> R2 bucket

Variable name:
    BUCKET

R2 bucket:
    flaynity-storage

You already showed this binding as connected, so keep it.

4) DEPLOY
---------
Save and Deploy the Worker after replacing the code.

5) SECURITY
-----------
DO NOT put an R2 Access Key ID or Secret Access Key in app.js.
The browser authenticates with the logged-in Firebase user's ID token.
The Worker verifies that Firebase token before allowing uploads.

Because an R2 secret was previously pasted into chat/browser code, rotate/revoke
that old R2 secret in Cloudflare and create a new credential only if you need
server-side S3 API access elsewhere. This app does not need the secret.

6) UPLOAD ENGINE
----------------
Long videos and Shorts use R2 multipart upload through the Worker.
The browser uses adaptive part size/concurrency based on Network Information
when available and reports per-part upload progress.

Default profiles:
- 2G/save-data: 5 MB, 1 connection
- 3G: 8 MB, 2 connections
- medium: 16 MB, 2 connections
- fast: 32 MB, 3 connections
- very fast: 48 MB, 4 connections

Failed network requests retry through the existing upload queue. Pause/resume
keeps completed multipart parts for the current session.

7) FIREBASE
-----------
The Worker is locked to the Flaynity Firebase project:
    flaynity-app

No Firebase service-account secret is required in the Worker.
