# Flaynity Email Verification (Google Apps Script)

This folder contains the Google Apps Script backend used by the Flaynity WebView app.

## Deploy

1. Open https://script.google.com/ and create a new standalone project.
2. Replace the default contents of `Code.gs` with this repository file: `apps-script/Code.gs`.
3. In **Project Settings → Script properties**, add:
   - Property: `FIREBASE_WEB_API_KEY`
   - Value: the `apiKey` value from `js/firebase-config.js` in this repository.
4. Save the project.
5. Select **Deploy → New deployment → Web app**.
6. Set **Execute as** to **Me**.
7. Set **Who has access** to **Anyone**. Every request is authenticated by validating its Firebase ID token.
8. Deploy and approve the Google permissions for sending email and making external requests. Copy the Web App URL ending in `/exec`.

## Connect the app

Open `js/email-verification-config.js` and set:

```js
window.FLAYNITY_EMAIL_VERIFICATION_URL = 'YOUR_DEPLOYED_WEB_APP_EXEC_URL';
```

Commit that change and reload the app.

## Behaviour

- Six-digit one-time code sent with Google Apps Script MailApp.
- Code expires after 5 minutes.
- Resend cooldown: 60 seconds.
- Maximum 5 sends per account per hour.
- Maximum 5 incorrect attempts per code.
- Firebase ID token is validated server-side before sending or verifying.
- Successful verification updates Firebase Authentication's `emailVerified` flag.
- Password-based accounts with unverified email are held at the verification screen.

The Firebase Web API key is a public client identifier, not an Admin SDK secret. Never add Firebase service-account private keys or passwords to this repository.
