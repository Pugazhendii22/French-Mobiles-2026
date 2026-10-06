/* ─────────────────────────────────────────────
   THE PRE-DELIVERY CHECKLIST

   The labels come from settings, where anyone can type anything; the ticks are
   stored on the order as a map, which needs keys. Turning a label into a key
   throws away case and punctuation, and that is how two labels a person reads
   as different - "Display OK" and "Display: OK!" - ended up sharing one
   checkbox. Ticking the second visibly un-ticked the first, and the order could
   be saved claiming a check nobody had carried out. On a list whose whole job is
   making sure a device is tested before it goes back, that is the worst thing it
   could quietly do.

   Keys are made once for the whole list here, so a collision is resolved rather
   than discovered. The first label to claim a key keeps it, which leaves ticks
   already stored against that key still readable.
────────────────────────────────────────────── */

/** A storable key for one label. Never empty: a blank key collides with itself. */
export const checklistKey = (label) => {
  const slug = String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return slug || 'item';
};

/**
 * The labels paired with keys that are unique across the list.
 * Order is preserved, and so is every label exactly as it was written.
 */
export const checklistEntries = (items = []) => {
  const taken = new Set();
  return (items || []).map(item => {
    const base = checklistKey(item);
    let key = base;
    let n = 2;
    while (taken.has(key)) key = `${base}_${n++}`;
    taken.add(key);
    return { item, key };
  });
};

export const blankChecklist = (items = []) =>
  checklistEntries(items).reduce((acc, { key }) => { acc[key] = false; return acc; }, {});

/** The same list, keeping whatever was already ticked. */
export const carryOver = (items = [], previous = {}) =>
  checklistEntries(items).reduce((acc, { key }) => {
    acc[key] = Boolean(previous?.[key]);
    return acc;
  }, {});

/**
 * Whether every item on the list is ticked.
 *
 * Asked about the list, not about the stored object. Reading the object's own
 * values meant a leftover tick from a since-removed item could carry the vote,
 * and a key that was never written at all counted as agreement.
 *
 * A shop with no checklist configured has nothing to verify, so an empty list
 * passes. Failing it instead would stop every order in the shop being completed
 * until somebody went and built a checklist, which is a rule nobody asked for.
 */
export const allChecked = (items = [], state = {}) =>
  checklistEntries(items).every(({ key }) => state?.[key] === true);
