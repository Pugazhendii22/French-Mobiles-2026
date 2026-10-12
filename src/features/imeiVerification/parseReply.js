/* ─────────────────────────────────────────────
   PARSE IMEI VERIFICATION REPLY FROM 14422

   The India CEIR / Department of Telecom short code 14422 answers KYM
   requests ("KYM <imei>" sent as SMS) with one of two shaped messages:

   Known device, usable:
     IMEI: 353994102005045
     MarketingName: Apple iPhone 11 (A2221)
     Brand: Apple
     Model: iPhone 11 (A2221)
     Manufacturer: Apple Inc
     DeviceType: Smartphone
     -Department of Telecom

   Known device, blacklisted:
     IMEI: 359750560742238
     Status: IMEI is blacklisted
     -Department of Telecom

   The reply always echoes the IMEI, which is what we match against the
   intake record. Everything else is key/value lines separated by newlines.
   Anything that does not fit either shape is returned as 'unrecognized' with
   the raw text, so staff can see what came back instead of being told it
   failed. The regex is forgiving on whitespace and case because the SMS
   gets forwarded through httpsms and we have no guarantee of exact bytes.
────────────────────────────────────────────── */

const IMEI_LINE = /IMEI\s*:\s*(\d{14,16})/i;
const STATUS_LINE = /Status\s*:\s*(.+?)(?:\n|$)/i;

const FIELDS = [
  ['marketingName', /MarketingName\s*:\s*(.+?)(?:\n|$)/i],
  ['brand',         /Brand\s*:\s*(.+?)(?:\n|$)/i],
  ['model',         /Model\s*:\s*(.+?)(?:\n|$)/i],
  ['manufacturer',  /Manufacturer\s*:\s*(.+?)(?:\n|$)/i],
  ['deviceType',    /DeviceType\s*:\s*(.+?)(?:\n|$)/i],
];

const BLACKLISTED = /blacklist/i;

/* 14422 caps how many KYM lookups a single number may make per day (observed:
   roughly two). Past that it answers "Status:KYM limit reached Try tomorrow"
   instead of device data, which is not a verdict on the IMEI at all - the
   shop has to ask again the next day or from another registered number. */
const RATE_LIMITED = /limit\s*reached|try\s*tomorrow/i;

/**
 * Parse a reply SMS received from 14422.
 *
 * Returns an object with:
 *   status: 'valid' | 'blacklisted' | 'rate_limited' | 'unrecognized'
 *   imei:   echoed IMEI if the reply contained one, else ''
 *   device: { marketingName, brand, model, manufacturer, deviceType } when 'valid'
 *   raw:    the original text, for display when unrecognized or for the record
 */
export const parseImeiReply = (text) => {
  const raw = String(text || '').trim();
  if (!raw) {
    return { status: 'unrecognized', imei: '', raw: '' };
  }

  const imeiMatch = raw.match(IMEI_LINE);
  const imei = imeiMatch ? imeiMatch[1] : '';

  const statusMatch = raw.match(STATUS_LINE);
  if (statusMatch && BLACKLISTED.test(statusMatch[1])) {
    return { status: 'blacklisted', imei, raw };
  }
  if (statusMatch && RATE_LIMITED.test(statusMatch[1])) {
    return { status: 'rate_limited', imei, raw };
  }

  const device = {};
  for (const [key, re] of FIELDS) {
    const m = raw.match(re);
    if (m) device[key] = m[1].trim();
  }

  if (device.brand && device.model) {
    return { status: 'valid', imei, device, raw };
  }

  return { status: 'unrecognized', imei, raw };
};
