/* ─────────────────────────────────────────────
   WHAT STATE A SECOND-HAND DEVICE IS IN

   The stock list answers one question about every row: can I sell this. It had
   two answers, and the shop's actual work needs three.

   A device bought damaged and repaired before resale is a normal week here - the
   purchase form has costed repairs since it was written, and the profit is
   right. What was missing was the fortnight in between. With only available and
   sold, a phone in pieces on the bench showed a green bar meaning "yes, sell
   this" and offered itself in the new-sale picker. The honest answer in that
   fortnight is "not yet", and that is what `repairing` is for.

   This is also why staff reached for a service order instead: it has a status to
   work through. A service order is the wrong instrument - it assumes a customer
   owns the device and owes money, so it lands in Due Payments as a debt and in
   Reports as revenue nobody paid. The device never leaves stock; only its state
   changes.

   Sold always wins. A device that has gone out of the shop cannot be put back
   into repair by someone editing the record.
────────────────────────────────────────────── */

export const AVAILABLE = 'available';
export const REPAIRING = 'repairing';
export const SOLD = 'sold';

/* The spine down the left of each row, and the words for it. Three colours, one
   question: green go, amber wait, grey gone. */
export const STOCK_META = {
  [AVAILABLE]: { key: AVAILABLE, label: 'In stock',      spine: '#16a34a', chip: 'bg-green-100 text-green-700' },
  [REPAIRING]: { key: REPAIRING, label: 'Being repaired', spine: '#f59e0b', chip: 'bg-amber-100 text-amber-700' },
  [SOLD]:      { key: SOLD,      label: 'Sold',          spine: '#CBD5E1', chip: 'bg-gray-200 text-gray-600' },
};

/** The state of a device, treating anything unrecognised as plain stock. */
export const stockStateOf = (mobile) => {
  const status = mobile?.status || AVAILABLE;
  if (status === SOLD) return SOLD;
  if (status === REPAIRING) return REPAIRING;
  return AVAILABLE;
};

export const stockMetaOf = (mobile) => STOCK_META[stockStateOf(mobile)];

/** Whether it can go on a bill today. */
export const isSellable = (mobile) => stockStateOf(mobile) === AVAILABLE;

/** Whether the shop is still working on it. */
export const isBeingRepaired = (mobile) => stockStateOf(mobile) === REPAIRING;

/**
 * The status to store when a purchase is saved.
 *
 * `stillBeingRepaired` is the form's own answer to "is this ready to sell". A
 * sold device ignores it: editing the record of something already out of the
 * shop must not put it back on the shelf, or into repair.
 */
export const statusForSave = ({ current, stillBeingRepaired = false } = {}) => {
  if (current === SOLD) return SOLD;
  return stillBeingRepaired ? REPAIRING : AVAILABLE;
};
