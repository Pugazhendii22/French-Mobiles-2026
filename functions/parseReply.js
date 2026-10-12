/* Mirror of src/features/imeiVerification/parseReply.js, duplicated here so
   Cloud Functions can import it without reaching into the Vite project root.
   Keep the two files in sync - if one changes, update the other and both test
   suites. The surface is small enough that this copy stays trivial to audit. */

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

/* 14422 caps KYM lookups per number per day (observed: roughly two). Past
   that it answers "Status:KYM limit reached Try tomorrow" - not a verdict on
   the IMEI, so it must not be recorded as one. */
const RATE_LIMITED = /limit\s*reached|try\s*tomorrow/i;

export const parseImeiReply = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return { status: 'unrecognized', imei: '', raw: '' };

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
