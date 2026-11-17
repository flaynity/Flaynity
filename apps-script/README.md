# Flaynity Email Verification (Google Apps Script)

This folder contains the Google Apps Script backend used by the Flaynity WebView app.

## Required Script Properties

In **Project Settings → Script properties**, add these four properties:

| Property | Value |
|---|---|
| `FIREBASE_WEB_API_KEY` | The `apiKey` from `js/firebase-config.js` (used to validate the signed-in user's Firebase ID token). |
| `FIREBASE_PROJECT_ID` | `flaynity-app` (the Firebase project ID). |
| `FIREBASE_SERVICE_ACCOUNT_EMAIL` | The `client_email` from a service-account JSON key belonging to the Firebase project. |
| `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` | The full `private_key` from that JSON key, including the BEGIN/END lines. Preserve newlines, or store them as literal `\\n`; the script handles either format. |

### Create and authorize the service account

1. In Google Cloud Console, select the Firebase project **flaynity-app**.
2. Open **IAM & Admin → Service Accounts** and create a dedicated service account for this verification backend.
3. Create a JSON key for that service account and copy its `client_email` and `private_key` into the two Script Properties above.
4. In **IAM & Admin → IAM**, grant that service account the **Firebase Authentication Admin** role (`roles/firebaseauth.admin`) on the project. This role provides the permission needed to update Firebase Authentication users.
5. Keep the JSON key private. Never commit it, paste it into the app, or store it in GitHub.

## Deploy

1. Open https://script.google.com/ and create a new standalone project.
2. Replace the default contents of `Code.gs` with this repository file: `apps-script/Code.gs`.
3. Add all four Script Properties listed above.
4. Save the project.
5. Select **Deploy → Manage deployments**. Edit the existing Web App deployment (or create a new one if needed).
6. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Every request is authenticated by validating its Firebase ID token.
7. Deploy and approve the Google permissions for sending email and making external requests. Copy the Web App URL ending in `/exec`.

## Connect the app

The repository's `js/email-verification-config.js` already points to the supplied Web App URL. Keep that URL updated if you create a new deployment.

## Behaviour

- Six-digit one-time code sent with Google Apps Script MailApp.
- Code expires after 5 minutes.
- Resend cooldown: 60 seconds.
- Maximum 5 sends per account per hour.
- Maximum 5 incorrect attempts per code.
- Firebase ID token is validated server-side before sending or verifying.
- On successful OTP validation, the server obtains a Google OAuth 2.0 access token using the service account and updates the authenticated user's `emailVerified` flag through the Firebase Authentication Admin REST API.
- The existing app flow reloads the Firebase user and shows the success card after the backend confirms the update.

The Firebase Web API key is a public client identifier, not an Admin credential. The service-account private key is a server secret and must only be stored in Apps Script Script Properties.
