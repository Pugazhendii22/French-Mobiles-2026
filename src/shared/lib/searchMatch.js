/* ─────────────────────────────────────────────
   SEARCHING A LIST

   What someone types into a search box and what is stored in Firestore never
   look the same. A phone number is saved as "+91 98765 43210" and typed as
   "9876543210"; a name is saved "Ravi Kumar" and half-typed as "ravi". None of
   that punctuation or casing carries meaning, so none of it should stop a
   match.

   Each word of the query is matched on its own, against every field. Joining
   the query into one string - which is what the stock list used to do - meant
   "apple 13" found nothing, because no single field holds both words.
────────────────────────────────────────────── */

/** Lowercase, and strip everything that is only there for readability. */
export const normalizeForSearch = (value) =>
  String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Whether a record matches the query.
 * `fields` is whatever is worth searching on that record; blanks are ignored.
 * Every word must be found somewhere, but not all in the same field.
 */
export const matchesQuery = (query, fields = []) => {
  const terms = String(query ?? '').trim().split(/\s+/)
    .map(normalizeForSearch)
    .filter(Boolean);
  if (!terms.length) return true;

  const haystack = fields.map(normalizeForSearch).filter(Boolean);
  if (!haystack.length) return false;

  return terms.every(term => haystack.some(field => field.includes(term)));
};
