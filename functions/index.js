/* ─────────────────────────────────────────────
   CLOUD FUNCTIONS - IMEI VERIFICATION VIA 14422 (httpsms)

   Two endpoints:

   1. sendImeiCheck - a Firebase callable (authenticated staff only).
      Writes a pending Firestore doc at imeiChecks/<imei>, then calls
      httpsms POST /v1/messages/send to make the shop's registered Android
      phone send "KYM <imei>" to 14422.

   2. httpsmsWebhook - a public HTTPS endpoint that httpsms calls when it
      receives an SMS on the shop phone. Verifies the JWT bearer token
      (HS256, signing key configured in httpsms), filters for messages
      from 14422, parses the reply, and updates imeiChecks/<imei>.

   Secrets (set with `firebase functions:secrets:set <NAME>`):
     HTTPSMS_API_KEY          account-level httpsms API key
     HTTPSMS_FROM_NUMBER      shop phone number registered with httpsms,
                              in international format, e.g. "+919876543210"
     HTTPSMS_WEBHOOK_SIGNING_KEY  signing key configured in the httpsms webhook
────────────────────────────────────────────── */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';
import { parseImeiReply } from './parseReply.js';

admin.initializeApp();
const db = admin.firestore();

const HTTPSMS_API_KEY = defineSecret('HTTPSMS_API_KEY');
const HTTPSMS_FROM_NUMBER = defineSecret('HTTPSMS_FROM_NUMBER');
const HTTPSMS_WEBHOOK_SIGNING_KEY = defineSecret('HTTPSMS_WEBHOOK_SIGNING_KEY');

/* Allowlist of DoT/KYM sender header suffixes - what remains after the
   two-letter operator-circle prefix (AX-, TM-, VK-...) is stripped.
   The user's screenshot shows "AX-ISATHI-S" so "ISATHI-S" is the default.
   Add more via `firebase deploy` with a comma-separated override if a
   different circle lands the SIM on a different header. */
const IMEI_SENDER_ALLOWLIST = defineString('IMEI_SENDER_ALLOWLIST', {
  default: 'ISATHI,ISATHI-S,DOTCEIR',
});

/* How old a pending request can be before an inbound "reply" is refused.
   An ancient pending doc that silently waited past this window is treated
   like it timed out - a new verification click would overwrite it with a
   fresh requestedAt, so this does not strand real IMEIs. */
const REPLY_WINDOW_MS = 15 * 60 * 1000;

const SHORT_CODE = '14422';
const HTTPSMS_SEND_URL = 'https://api.httpsms.com/v1/messages/send';

const isValidImei = (imei) => /^\d{15}$/.test(String(imei || '').trim());

/* ─────────────────────────────────────────────
   sendImeiCheck
   Called from the SecondHandForm when a worker clicks "Verify IMEI".
────────────────────────────────────────────── */
export const sendImeiCheck = onCall(
  { secrets: [HTTPSMS_API_KEY, HTTPSMS_FROM_NUMBER], region: 'asia-south1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before verifying an IMEI.');
    }
    const imei = String(request.data?.imei || '').trim();
    if (!isValidImei(imei)) {
      throw new HttpsError('invalid-argument', 'IMEI must be 15 digits.');
    }

    const ref = db.collection('imeiChecks').doc(imei);
    await ref.set({
      status: 'pending',
      imei,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      repliedAt: null,
      requestedBy: request.auth.uid,
      device: null,
      rawReply: null,
      errorMessage: null,
    }, { merge: true });

    try {
      const response = await fetch(HTTPSMS_SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': HTTPSMS_API_KEY.value(),
        },
        body: JSON.stringify({
          from: HTTPSMS_FROM_NUMBER.value(),
          to: SHORT_CODE,
          content: `KYM ${imei}`,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('httpsms send failed', { status: response.status, body: errorBody });
        await ref.set({
          status: 'error',
          errorMessage: `httpsms returned ${response.status}`,
        }, { merge: true });
        throw new HttpsError('internal', 'Could not reach the SMS gateway. Try again.');
      }

      return { imei, status: 'pending' };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('sendImeiCheck error', err);
      await ref.set({
        status: 'error',
        errorMessage: String(err?.message || err),
      }, { merge: true });
      throw new HttpsError('internal', 'Could not send the verification SMS.');
    }
  }
);

/* ─────────────────────────────────────────────
   httpsmsWebhook
   httpsms POSTs here on every inbound SMS to the shop phone. We care only
   about replies from 14422; anything else is logged and ignored.

   httpsms signs the Authorization header with HS256 using the key configured
   on the webhook. Reject anything else - this endpoint is public and would
   otherwise accept forged "replies".
────────────────────────────────────────────── */
export const httpsmsWebhook = onRequest(
  { secrets: [HTTPSMS_WEBHOOK_SIGNING_KEY], region: 'asia-south1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      res.status(401).send('Missing bearer token');
      return;
    }

    try {
      jwt.verify(token, HTTPSMS_WEBHOOK_SIGNING_KEY.value(), { algorithms: ['HS256'] });
    } catch (err) {
      logger.warn('httpsmsWebhook rejected request with bad JWT', err?.message);
      res.status(401).send('Invalid signature');
      return;
    }

    /* CloudEvents envelope: the httpsms payload nests the message under data.
       Only message.phone.received matters for IMEI verification; everything
       else (delivery reports, outbound confirmations) is acknowledged and
       ignored so httpsms stops retrying. */
    const body = req.body || {};
    const type = body.type || body['ce-type'];
    if (type !== 'message.phone.received') {
      res.status(200).send('ignored');
      return;
    }

    const message = body.data || {};
    const from = String(message.from || message.contact || '').trim();
    const content = String(message.content || message.body || '').trim();

    /* Allowlist senders. Indian telecom rules route KYM replies through an
       alphanumeric sender header shaped like "<CIRCLE>-<HEADER>" (the user's
       screenshot shows "AX-ISATHI-S"), where CIRCLE is a two-letter operator
       prefix that varies by SIM circle. Strip the prefix and compare the
       suffix against IMEI_SENDER_ALLOWLIST so a different circle only means
       updating one env var, not the code - and anyone texting the shop phone
       from a plain mobile number is rejected before reaching the parser. */
    const senderCompact = from.replace(/\s+/g, '').toUpperCase();
    const match = senderCompact.match(/^(?:[A-Z]{2}-)?([A-Z0-9-]+)$/);
    const allowlist = IMEI_SENDER_ALLOWLIST.value()
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
    const headerSuffix = match ? match[1] : '';
    if (!match || !allowlist.includes(headerSuffix)) {
      logger.warn('httpsmsWebhook rejecting reply from untrusted sender', {
        from,
        suffix: headerSuffix,
        allowlist,
      });
      res.status(200).send('ignored');
      return;
    }

    const parsed = parseImeiReply(content);
    if (!parsed.imei) {
      logger.info('httpsmsWebhook ignoring message that is not a 14422 reply', { from });
      res.status(200).send('ignored');
      return;
    }

    /* Only overwrite a doc the shop itself asked for. Without this check an
       inbound reply (genuine or forged) could create an imeiChecks entry for
       an IMEI the shop never requested, or overturn a result the user is
       already looking at. The transaction keeps the pending→reply flip
       atomic so two near-simultaneous replies cannot race. */
    const ref = db.collection('imeiChecks').doc(parsed.imei);
    const now = Date.now();
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 'no-doc';
      const data = snap.data();
      if (data.status !== 'pending') return 'not-pending';
      const requestedAt = data.requestedAt?.toMillis?.();
      if (!requestedAt || now - requestedAt > REPLY_WINDOW_MS) return 'stale';
      tx.update(ref, {
        status: parsed.status,
        repliedAt: admin.firestore.FieldValue.serverTimestamp(),
        rawReply: parsed.raw,
        replyFrom: from,
        device: parsed.status === 'valid' ? parsed.device : null,
      });
      return 'applied';
    });

    if (outcome !== 'applied') {
      logger.info('httpsmsWebhook ignoring reply', { imei: parsed.imei, outcome });
    }
    res.status(200).send('ok');
  }
);
