/* ─────────────────────────────────────────────
   PAYMENT METHODS

   Finance (EMI) sales work differently from the others: the customer pays a
   down payment at the counter and the finance company pays the rest, so the
   CUSTOMER owes nothing once the sale is done. That is why a financed sale is
   recorded as fully paid - it must not appear in Due Payments, which chases
   customers. What is still outstanding is the financier's settlement to the
   shop, which is a different ledger.
────────────────────────────────────────────── */

export const FINANCE_PROVIDERS = [
  'Bajaj Finance',
  'IDFC Finance',
  'Samsung Finance',
  'Poonawalla',
  'TVS Credit',
];

export const DIRECT_PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Split'];

export const PAYMENT_METHODS = [...DIRECT_PAYMENT_METHODS, ...FINANCE_PROVIDERS];

export const isFinanceMethod = (method) => FINANCE_PROVIDERS.includes(method);

/** Tailwind classes for the payment chip, shared by list and detail views. */
export const paymentChipClass = (method) => {
  if (isFinanceMethod(method)) return 'bg-indigo-100 text-indigo-700';
  if (method === 'Cash') return 'bg-green-100 text-green-700';
  if (method === 'UPI') return 'bg-blue-100 text-blue-700';
  if (method === 'Card') return 'bg-purple-100 text-purple-700';
  return 'bg-orange-100 text-orange-700';
};
