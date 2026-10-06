/* ─────────────────────────────────────────────
   WHAT STATE A SERVICE ORDER IS IN

   An order carries a status, but the status alone is not what staff need to
   know. "Parts Awaiting" tells you nothing about whether it was promised to the
   customer yesterday. The list has to answer one question at a glance - what do
   I have to do about this phone - and that has three answers:

     overdue  it was promised and the time has passed
     open     it is in the shop, and there is still time
     closed   it has been handed back, and is history

   Closed beats overdue on purpose. A job completed last month is not an alarm,
   and leaving those red filled the list with warnings about work already done.

   The date arrives as a Firestore Timestamp on some orders and an ISO string on
   others, depending on which build wrote them, so every read goes through
   normalizeDate.

   `now` is passed in rather than read here, so the behaviour can be stated
   exactly in a test instead of depending on the day it runs.
────────────────────────────────────────────── */

export const STATUSES = [
  'Received',
  'In Progress',
  'Parts Awaiting',
  'Awaiting Customer Approval',
  'Completed',
  'Returned',
];

/** A date from either shape, or null when there isn't a usable one. */
export const normalizeDate = (value) => {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Handed back, one way or the other. Nothing more is owed on it. */
export const isClosed = (status) => status === 'Completed' || status === 'Returned';

export const isOverdue = (order, now = new Date()) => {
  if (isClosed(order?.status)) return false;
  const expected = normalizeDate(order?.expectedCompletionAt);
  return Boolean(expected && expected < now);
};

export const isDueToday = (order, now = new Date()) => {
  if (isClosed(order?.status)) return false;
  const expected = normalizeDate(order?.expectedCompletionAt);
  if (!expected) return false;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return expected >= start && expected < end;
};

/* Red is an alarm, not decoration: it means a customer is already waiting past
   the time they were given. Grey recedes, the way a sold device does on the
   stock list, so what is left is what still needs doing. */
export const STATE_META = {
  overdue: { key: 'overdue', label: 'Overdue',     spine: '#ED2939', chip: 'bg-red-100 text-[#ED2939]' },
  open:    { key: 'open',    label: 'In the shop', spine: '#002395', chip: 'bg-blue-100 text-blue-700' },
  closed:  { key: 'closed',  label: 'Finished',    spine: '#CBD5E1', chip: 'bg-gray-100 text-[#64748b]' },
};

export const stateOf = (order, now = new Date()) => {
  if (isClosed(order?.status)) return 'closed';
  return isOverdue(order, now) ? 'overdue' : 'open';
};

export const stateMetaOf = (order, now = new Date()) =>
  STATE_META[stateOf(order, now)] || STATE_META.open;

/* Open leads, because the work still in the shop is the reason anyone opens
   this page. The rest are there for looking something up. */
export const TABS = [
  'Open',
  'Due Today',
  'Overdue',
  'In Progress',
  'Parts Awaiting',
  'Awaiting Customer Approval',
  'Completed',
  'Returned',
  'All',
];

export const matchesTab = (order, tab, now = new Date()) => {
  switch (tab) {
    case 'All': return true;
    case 'Open': return !isClosed(order?.status);
    case 'Overdue': return isOverdue(order, now);
    case 'Due Today': return isDueToday(order, now);
    default: return order?.status === tab;
  }
};

/* ─────────────────────────────────────────────
   The two dates an order cannot be saved without.

   This lived inline in the intake form, in the Create Order path only. Save &
   Print built its own copy of the payload and skipped the check, so the two
   buttons disagreed about what a valid order was: one refused an unparseable
   date and the other wrote it to Firestore as an Invalid Date, where it then
   read as neither overdue nor due nor anything else.

   It throws rather than returning a flag, so a caller cannot forget to look.
────────────────────────────────────────────── */
export const DATE_ERROR =
  'Please provide valid datetime values for received and expected completion';

export const requireOrderDates = (receivedAt, expectedCompletionAt) => {
  const received = normalizeDate(receivedAt);
  const expected = normalizeDate(expectedCompletionAt);
  if (!received || !expected) throw new Error(DATE_ERROR);
  return { received, expected };
};
