/* ─────────────────────────────────────────────
   IMEI VERIFY BADGE

   Sits under an IMEI field. When the IMEI is 15 digits, shows a "Verify
   with 14422" button; once clicked, the Cloud Function sends the SMS and
   this badge subscribes to imeiChecks/<imei> to show the live result.

   Deliberately informational, not blocking: a worker can save a record
   even if 14422 says the IMEI is blacklisted - the shop may still decide
   to accept the phone, this just makes the status visible.
────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import { isValidImeiFormat, requestVerification, watchVerification } from './client';

const BADGE_STYLE = {
  pending:      'bg-amber-50 text-amber-800 border-amber-200',
  valid:        'bg-emerald-50 text-emerald-800 border-emerald-200',
  blacklisted:  'bg-rose-50 text-rose-800 border-rose-200',
  rate_limited: 'bg-amber-50 text-amber-800 border-amber-200',
  unrecognized: 'bg-slate-50 text-slate-700 border-slate-200',
  timeout:      'bg-slate-50 text-slate-700 border-slate-200',
  error:        'bg-rose-50 text-rose-800 border-rose-200',
};

const BADGE_LABEL = {
  pending:      'Waiting for 14422 reply…',
  valid:        'Verified by DoT',
  blacklisted:  'Blacklisted by DoT',
  rate_limited: 'Daily KYM limit reached',
  unrecognized: '14422 reply not understood',
  timeout:      'No reply from 14422',
  error:        'SMS could not be sent',
};

/* How long we wait before marking a pending check as "no reply" in the UI.
   The Firestore doc itself is left pending so a late reply still updates it;
   this is a UI-only hint so the badge does not sit on "Waiting…" forever. */
const TIMEOUT_MS = 90_000;

const ImeiVerifyBadge = ({ imei }) => {
  // Keyed by imei so changing the field value starts a fresh subscription
  // without needing a setState-in-effect reset dance.
  const [recordByImei, setRecordByImei] = useState({});
  const [requesting, setRequesting] = useState(false);
  const [errorByImei, setErrorByImei] = useState({});
  const [timedOutAt, setTimedOutAt] = useState(null);

  const record = recordByImei[imei] || null;
  const requestError = errorByImei[imei] || '';

  // Subscribe to the Firestore doc for this exact IMEI. Only setState inside
  // the snapshot callback (the external-system case the rule allows).
  useEffect(() => {
    if (!isValidImeiFormat(imei)) return undefined;
    return watchVerification(imei, (data) => {
      setRecordByImei((prev) => ({ ...prev, [imei]: data }));
    });
  }, [imei]);

  // Local "no reply" fallback - the backend may still eventually record one.
  useEffect(() => {
    if (record?.status !== 'pending') return undefined;
    const timer = setTimeout(() => setTimedOutAt(imei), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [imei, record?.status, record?.requestedAt]);

  const onVerify = async () => {
    setRequesting(true);
    setErrorByImei((prev) => ({ ...prev, [imei]: '' }));
    try {
      await requestVerification(imei);
    } catch (err) {
      setErrorByImei((prev) => ({ ...prev, [imei]: err?.message || 'Could not send verification SMS.' }));
    } finally {
      setRequesting(false);
    }
  };

  if (!isValidImeiFormat(imei)) return null;

  // Nothing requested yet for this IMEI.
  if (!record) {
    return (
      <div className="mt-1.5">
        <button
          type="button"
          onClick={onVerify}
          disabled={requesting}
          className="text-xs font-semibold text-[#002395] hover:underline disabled:opacity-50"
        >
          {requesting ? 'Sending…' : 'Verify with 14422 (DoT)'}
        </button>
        {requestError && (
          <p className="text-xs text-rose-700 mt-1">{requestError}</p>
        )}
      </div>
    );
  }

  const effectiveStatus = (record.status === 'pending' && timedOutAt === imei) ? 'timeout' : record.status;
  const className = `inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border ${BADGE_STYLE[effectiveStatus] || BADGE_STYLE.unrecognized}`;

  return (
    <div className="mt-1.5 space-y-1.5">
      <span className={className}>
        {effectiveStatus === 'pending' && (
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
        )}
        {BADGE_LABEL[effectiveStatus] || effectiveStatus}
      </span>

      {effectiveStatus === 'valid' && record.device && (
        <p className="text-xs text-slate-600">
          {record.device.marketingName || `${record.device.brand} ${record.device.model}`}
        </p>
      )}

      {/* Not a verdict on the phone - say so, or staff will read the amber
          badge as "something is wrong with this IMEI". */}
      {effectiveStatus === 'rate_limited' && (
        <p className="text-xs text-slate-600">
          14422 allows only a couple of checks a day per number. This IMEI was
          not checked — try again tomorrow.
        </p>
      )}

      {(effectiveStatus === 'unrecognized' || effectiveStatus === 'error') && (
        <>
          {record.replyFrom && (
            <p className="text-[11px] text-slate-500">From: {record.replyFrom}</p>
          )}
          {record.rawReply && (
            <pre className="text-[11px] text-slate-500 whitespace-pre-wrap">{record.rawReply}</pre>
          )}
          {record.errorMessage && (
            <p className="text-xs text-rose-700">{record.errorMessage}</p>
          )}
          <button
            type="button"
            onClick={onVerify}
            disabled={requesting}
            className="text-xs font-semibold text-[#002395] hover:underline disabled:opacity-50"
          >
            {requesting ? 'Sending…' : 'Try again'}
          </button>
        </>
      )}

      {effectiveStatus === 'timeout' && (
        <button
          type="button"
          onClick={onVerify}
          disabled={requesting}
          className="text-xs font-semibold text-[#002395] hover:underline disabled:opacity-50"
        >
          {requesting ? 'Sending…' : 'Try again'}
        </button>
      )}
    </div>
  );
};

export default ImeiVerifyBadge;
