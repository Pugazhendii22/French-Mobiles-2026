# IMEI Verification — setup

This Cloud Functions package implements the "Verify IMEI with 14422" button in
the second-hand intake form. It calls the India CEIR / Department of Telecom
short code via httpsms (your Android phone acts as the gateway) and writes the
reply to Firestore so the UI updates live.

## What runs where

| Piece | Where it runs | Why |
| --- | --- | --- |
| `sendImeiCheck` | Firebase Cloud Function (callable) | Keeps the httpsms API key off the browser |
| `httpsmsWebhook` | Firebase Cloud Function (public HTTPS) | Receives the 14422 reply from httpsms |
| `imeiChecks/{imei}` doc | Firestore | Client subscribes to this for the live status |

## One-time setup

### 1. Firebase project (console)

- [ ] Blaze (pay-as-you-go) plan **already enabled** on `fren-75087` (required for Cloud Functions).
- [ ] In the Firebase console, **enable the following APIs** (console will prompt on first deploy, but can be done up front):
  - Cloud Functions API
  - Cloud Build API
  - Artifact Registry API
  - Cloud Firestore API (already on if the app is already running)
- [ ] In **Authentication**, confirm the sign-in method the shop uses is enabled — the callable function rejects unauthenticated callers.

### 2. httpsms account

- [ ] Sign up at https://httpsms.com with one shop account (not one per worker).
- [ ] Generate the **account API key** at https://httpsms.com/settings → copy it.
- [ ] Install the **httpsms Android app** on the designated shop phone (not an iPhone — httpsms is Android-only).
- [ ] In the app, sign in with the same shop account and let it register the phone's SIM number. That number is the `from` number for every KYM SMS.
- [ ] In the httpsms dashboard, **configure a webhook**:
  - URL: the deployed `httpsmsWebhook` URL (printed after `firebase deploy`)
  - Events: `message.phone.received`
  - Signing key: generate a strong random string, copy it — it goes into the Firebase secret below.

### 3. The shop phone (physical)

- [ ] Android 7+ with a working SIM and SMS permission granted to the httpsms app.
- [ ] Battery optimisation **disabled** for httpsms (settings → battery → unrestricted), otherwise Android kills the app in the background and SMS stops being sent.
- [ ] Confirm you can send `KYM <imei>` to `14422` manually from that phone's SMS app and get a reply — if that doesn't work from the phone itself, no gateway can fix it.
- [ ] Keep the phone on Wi-Fi or data at all times. The httpsms app needs an internet connection to receive the "send this SMS" push from the server.

### 4. Deploy the functions

```bash
# From the project root. First time only:
npm --prefix functions install
firebase login
firebase use fren-75087

# Store the three secrets (prompts for each value; nothing lands in git):
firebase functions:secrets:set HTTPSMS_API_KEY
firebase functions:secrets:set HTTPSMS_FROM_NUMBER        # e.g. +919876543210
firebase functions:secrets:set HTTPSMS_WEBHOOK_SIGNING_KEY

firebase deploy --only functions
```

> **Do not** add `firestore:rules` to that deploy. This project's security rules
> are managed in the Firebase console, not in this repo — deploying rules from
> here would replace the console's rules with whatever is in the repo and lock
> the app out of every collection. The rule needed for this feature is in
> "Firestore rule" below; add it in the console by hand.

### 4a. Firestore rule (add by hand in the console)

In the Firebase console → Firestore → Rules, add this block **alongside your
existing rules** (do not replace them):

```
match /imeiChecks/{imei} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

Staff need read access for the live badge; only the Cloud Functions write
(they run as the service account and bypass rules).

### 4b. Optional: sender allowlist

The webhook only accepts replies whose sender header suffix is in `IMEI_SENDER_ALLOWLIST` (default: `ISATHI,ISATHI-S,DOTCEIR`). If the shop phone's circle delivers 14422 replies under a different header, the badge will show "14422 reply not understood" with the actual sender printed below it — add that header to the allowlist and redeploy:

```bash
firebase deploy --only functions \
  --set-env IMEI_SENDER_ALLOWLIST=ISATHI,ISATHI-S,DOTCEIR,YOUR-HEADER
```

Note the URL printed for `httpsmsWebhook` — paste it into the httpsms webhook settings alongside the signing key.

### 5. First real test

- Open the second-hand intake form, enter a known-good 15-digit IMEI, tap **Verify with 14422**.
- You should see "Waiting for 14422 reply…" within a second, then the device name within ~10–30 seconds.
- If it sits on "Waiting" past ~90 s and then shows "No reply from 14422", check:
  1. The shop phone has signal and data.
  2. The httpsms Android app shows as **connected** at the top.
  3. The outbound SMS actually left the phone (visible in the phone's SMS app).

## What this feature does not do

- It does **not** block saving a record if 14422 says the IMEI is blacklisted — the shop may still accept the phone and this is informational.
- It does **not** retry automatically on timeout; a worker can tap "Try again".
- It does **not** parse replies in languages/formats other than the two shown
  in the user's reference screenshots. Unknown shapes are stored as
  `unrecognized` with the raw text so staff can read what came back.
