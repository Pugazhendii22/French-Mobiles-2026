/* ─────────────────────────────────────────────
   vCARD IMPORT

   Parses a phone-exported .vcf (vCard 2.1 or 3.0) into customer records.
   Everything happens in the browser - the file is never uploaded anywhere.

   Only Indian numbers are kept. Phones are stored the way the rest of the app
   stores them: a bare 10-digit national number, so an entry saved as
   "+91 98765 43210" matches one typed as "9876543210".
────────────────────────────────────────────── */

import { normalizeIndianPhone } from '@/shared/lib/phone';

// Re-exported for the screens that already import it from here.
export { normalizeIndianPhone };

/** vCard 2.1 encodes non-ASCII names as quoted-printable bytes. */
const decodeQuotedPrintable = (input, charset = 'utf-8') => {
  const bytes = [];
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(input.substr(i + 1, 2))) {
      bytes.push(parseInt(input.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(input.charCodeAt(i) & 0xff);
    }
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return input;
  }
};

const unfold = (text) =>
  text
    .replace(/=\r?\n/g, '')        // quoted-printable soft breaks
    .replace(/\r?\n[ \t]/g, '');   // standard vCard line folding

const parseLine = (line) => {
  const sep = line.indexOf(':');
  if (sep === -1) return null;
  const head = line.slice(0, sep);
  const value = line.slice(sep + 1);
  const [name, ...params] = head.split(';');
  return { name: name.toUpperCase(), params, value };
};

const readValue = ({ params, value }) => {
  const isQP = params.some(p => /QUOTED-PRINTABLE/i.test(p));
  const charsetParam = params.find(p => /^CHARSET=/i.test(p));
  const charset = charsetParam ? charsetParam.split('=')[1] : 'utf-8';
  return isQP ? decodeQuotedPrintable(value, charset) : value;
};

/** Parse the file into { name, phones[] } entries, before any filtering. */
export const parseVCards = (text) => {
  const cards = unfold(String(text)).split(/BEGIN:VCARD/i).slice(1);
  const out = [];

  for (const card of cards) {
    const body = card.split(/END:VCARD/i)[0];
    let fn = '';
    let structured = '';
    let org = '';
    const phones = [];

    for (const rawLine of body.split(/\r?\n/)) {
      const line = parseLine(rawLine);
      if (!line) continue;
      if (line.name === 'FN') fn = readValue(line).trim();
      else if (line.name === 'N') structured = readValue(line).split(';').filter(Boolean).join(' ').trim();
      else if (line.name === 'ORG') org = readValue(line).replace(/;+$/, '').trim();
      else if (line.name === 'TEL') phones.push(readValue(line).trim());
    }

    const name = fn || structured || org || '';
    if (phones.length) out.push({ name, phones });
  }

  return out;
};

/**
 * Turn a .vcf into customers ready for the app, keeping only Indian numbers
 * and collapsing duplicates. Returns the records plus a breakdown of what was
 * dropped, so the import screen can explain itself.
 */
export const buildCustomerImport = (text, existingPhones = []) => {
  const entries = parseVCards(text);
  const already = new Set(existingPhones.map(p => normalizeIndianPhone(p)).filter(Boolean));
  const seen = new Map();
  // A number already in the app can also appear twice in the file; count the
  // first sighting as "already a customer" and the rest as duplicates, so the
  // figures add up to the number of cards.
  const countedExisting = new Set();

  const stats = {
    cards: entries.length,
    withoutIndianNumber: 0,
    duplicatesInFile: 0,
    alreadyInApp: 0,
    unnamed: 0,
  };

  for (const entry of entries) {
    const indian = [...new Set(entry.phones.map(normalizeIndianPhone).filter(Boolean))];
    if (!indian.length) {
      stats.withoutIndianNumber += 1;
      continue;
    }

    const [phone, ...rest] = indian;

    if (already.has(phone)) {
      if (countedExisting.has(phone)) stats.duplicatesInFile += 1;
      else { countedExisting.add(phone); stats.alreadyInApp += 1; }
      continue;
    }
    if (seen.has(phone)) {
      stats.duplicatesInFile += 1;
      // Keep the better name if the duplicate has one
      const prev = seen.get(phone);
      if (!prev.name && entry.name) prev.name = entry.name.trim();
      continue;
    }

    const name = (entry.name || '').trim();
    if (!name) stats.unnamed += 1;

    seen.set(phone, {
      name: name || phone,
      phone,
      alternatePhone: rest[0] || '',
    });
  }

  const customers = [...seen.values()];
  stats.ready = customers.length;
  return { customers, stats };
};

export default buildCustomerImport;
