/* ─────────────────────────────────────────────
   DATETIME FIELDS

   An <input type="datetime-local"> holds a wall-clock reading with no timezone
   on it, and the browser reads it as the clock on the wall where the person is
   standing. So the value put into one has to be built from local getters.

   Building it with toISOString().slice(0, 16) instead - which is what the
   service intake form did - puts UTC in the box. In Puducherry that showed a
   device taken in at 7:03pm as 13:33, and because saving parses the box back as
   local time, every edit-and-save moved the stored time another 5h30m earlier.
   Three edits turned a Monday evening into Sunday night. expectedCompletionAt
   went the same way, which is what decides whether an order is overdue.

   Nothing here touches UTC. toDateTimeLocal and fromDateTimeLocal are exact
   inverses in whatever timezone the device is set to.
────────────────────────────────────────────── */

const pad = (n) => String(n).padStart(2, '0');

/**
 * A Date, Firestore Timestamp or ISO string as 'YYYY-MM-DDTHH:mm' in local
 * time - the only shape a datetime-local input accepts. '' when there is no
 * usable date, which clears the field rather than showing "Invalid Date".
 */
export const toDateTimeLocal = (value) => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Now, ready to drop into a datetime-local input. */
export const nowDateTimeLocal = () => toDateTimeLocal(new Date());

/**
 * What a datetime-local field holds, as a Date. A value with no offset on it is
 * parsed as local time by the platform, which is what the field meant - this
 * exists to say so at the call site, and to reject junk rather than return an
 * Invalid Date that Firestore will happily store.
 */
export const fromDateTimeLocal = (value) => {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
