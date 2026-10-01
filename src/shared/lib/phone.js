/* ─────────────────────────────────────────────
   PHONE NUMBERS / WHATSAPP LINKS

   Phones reach us in every shape a shop counter can produce:
   "9876543210", "+91 98765 43210", "098765 43210", "91-9876543210".
   wa.me needs the opposite - digits only, always with the country code and
   never a second one. Building those links by hand is what produced errors
   like "+9876543210 is not a valid phone number" (country code missing) and
   "91+91 98765 43210" (country code added to a number that already had one).

   Every WhatsApp link in the app goes through this file.
────────────────────────────────────────────── */

const DEFAULT_COUNTRY_CODE = '91';

/**
 * Reduce a raw phone value to a 10-digit Indian number, or null if it is not
 * one. Handles +91 / 91 / 0 prefixes and strips spaces, dashes and brackets.
 */
export const normalizeIndianPhone = (raw) => {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) {
    if (!digits.startsWith('+91')) return null;   // foreign number
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  digits = digits.replace(/\D/g, '');

  // Indian mobile numbers are 10 digits and begin 6-9. Landlines, short codes
  // and service numbers are deliberately left out of the customer list.
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};

/**
 * The number wa.me wants: country code + national number, digits only.
 * Returns null when the value cannot be messaged on WhatsApp.
 */
export const toWhatsAppNumber = (raw) => {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^\d+]/g, '');
  if (!cleaned) return null;

  // A number typed with an explicit foreign country code is already complete.
  if (cleaned.startsWith('+') && !cleaned.startsWith('+91')) {
    const digits = cleaned.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  const national = normalizeIndianPhone(cleaned);
  return national ? `${DEFAULT_COUNTRY_CODE}${national}` : null;
};

/** Build a wa.me link, or null when the number is unusable. */
export const whatsAppLink = (raw, message = '') => {
  const number = toWhatsAppNumber(raw);
  if (!number) return null;
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
};

/** True when WhatsApp will accept this number - use it to warn before sending. */
export const isWhatsAppReady = (raw) => Boolean(toWhatsAppNumber(raw));

export const invalidPhoneMessage = (raw) => {
  const shown = String(raw || '').trim();
  return `WhatsApp cannot be opened${shown ? ` for "${shown}"` : ''} - the number is not valid.\n\nPlease edit the record and save a 10-digit mobile number (or include the country code, e.g. +971 50 123 4567).`;
};

/**
 * Open WhatsApp for a number. Returns false (and explains why, in our own
 * words instead of WhatsApp's) when the number is not usable.
 */
export const openWhatsApp = (raw, message = '') => {
  const url = whatsAppLink(raw, message);
  if (!url) {
    alert(invalidPhoneMessage(raw));
    return false;
  }
  window.open(url, '_blank', 'noopener');
  return true;
};
