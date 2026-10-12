/* ─────────────────────────────────────────────
   CLIENT-SIDE WIRING FOR IMEI VERIFICATION

   Three pieces of plumbing between the SecondHandForm UI and the backend:

   1. requestVerification(imei): triggers the sendImeiCheck callable function,
      which sends "KYM <imei>" via httpsms to 14422. The function also writes
      the pending Firestore doc, so we do not duplicate that here - we only
      kick the SMS off.

   2. watchVerification(imei, onChange): subscribes to the imeiChecks/<imei>
      document and calls onChange whenever its status flips (pending → valid
      / blacklisted / unrecognized / timeout). Returns an unsubscribe fn.

   3. isValidImeiFormat(imei): a cheap client-side gate so we do not fire
      SMS requests for input that could not possibly be a real IMEI.

   The Firestore doc shape (written by the Cloud Functions):
     imeiChecks/{imei}
       status:        'pending' | 'valid' | 'blacklisted' | 'unrecognized' | 'timeout' | 'error'
       requestedAt:   Timestamp
       repliedAt:     Timestamp | null
       requestedBy:   uid of the staff member who clicked verify
       device:        { marketingName, brand, model, manufacturer, deviceType } when valid
       rawReply:      string, the body of the 14422 SMS (for unrecognized / audit)
       errorMessage:  string, when status === 'error' (e.g. httpsms call failed)
────────────────────────────────────────────── */

import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/shared/firebase/firebase';

/**
 * A real IMEI is 14 or 15 digits (14422 accepts 15; some test IMEIs are 16 but
 * 14422 rejected those in the user's own screenshots). Keep it tight so we
 * do not spam the gateway with values that will never return device data.
 */
export const isValidImeiFormat = (imei) => /^\d{15}$/.test(String(imei || '').trim());

/**
 * Fire the Cloud Function that queues the KYM SMS. Returns the function's
 * result data (useful for logging) or throws on failure so the caller can
 * surface the message to the worker instead of silently doing nothing.
 */
export const requestVerification = async (imei) => {
  if (!isValidImeiFormat(imei)) {
    throw new Error('IMEI must be 15 digits before it can be verified.');
  }
  const sendImeiCheck = httpsCallable(functions, 'sendImeiCheck');
  const { data } = await sendImeiCheck({ imei: String(imei).trim() });
  return data;
};

/**
 * Live-subscribe to the verification result for an IMEI. onChange receives
 * null until a doc exists, then the parsed { status, device, rawReply, ... }.
 * Returns an unsubscribe function; the UI should call it on unmount or when
 * the IMEI being watched changes.
 */
export const watchVerification = (imei, onChange) => {
  if (!isValidImeiFormat(imei)) {
    onChange(null);
    return () => {};
  }
  const ref = doc(db, 'imeiChecks', String(imei).trim());
  return onSnapshot(ref, (snap) => {
    onChange(snap.exists() ? snap.data() : null);
  }, (err) => {
    console.error('imeiChecks snapshot error:', err);
  });
};
