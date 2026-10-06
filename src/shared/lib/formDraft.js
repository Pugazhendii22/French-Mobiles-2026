/* ─────────────────────────────────────────────
   FORM DRAFTS

   The purchase form asks for a lot: device, IMEI, pricing, a condition
   checklist, photos, the seller and their signature. Closing it by accident
   threw all of that away and the only way back was to type it again, with the
   customer still standing at the counter.

   What is typed is now kept on the phone until the form is saved or the person
   deliberately closes it. Nothing here ever throws: a draft is a convenience,
   and a locked-down WebView or a full disk must not take the form down with it.
────────────────────────────────────────────── */

const PREFIX = 'fm:draft:';

/* Long enough to survive a dropped call or a phone that locked itself, short
   enough that a half-filled purchase from a fortnight ago never resurfaces. */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const storage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Whether a form holds anything worth keeping. */
const hasContent = (value) => {
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(v => {
    if (v == null || v === false) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  });
};

/** The draft for this form, or null when there is nothing usable to restore. */
export const readDraft = (key) => {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Anything not in the { at, value } shape is from an older build.
    if (!parsed || typeof parsed.at !== 'number' || !('value' in parsed)) return null;
    if (Date.now() - parsed.at > DRAFT_MAX_AGE_MS) return null;
    return parsed.value;
  } catch {
    return null;
  }
};

/** Keep what has been typed. An empty form clears rather than stores. */
export const writeDraft = (key, value) => {
  const store = storage();
  if (!store) return;
  try {
    if (!hasContent(value)) {
      store.removeItem(PREFIX + key);
      return;
    }
    store.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* No room, or storage is blocked. The form itself is unaffected. */
  }
};

export const clearDraft = (key) => {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
};
