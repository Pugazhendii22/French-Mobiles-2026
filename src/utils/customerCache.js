/* ─────────────────────────────────────────────
   CUSTOMER CACHE

   The sale, service and second-hand forms each loaded the whole customers
   collection on open, for the autocomplete. With thousands of customers that
   is thousands of document reads - and megabytes of mobile data - every time a
   form is opened.

   The list is fetched once and shared for a few minutes. Search stays exactly
   as it was (substring match on name and phone), because Firestore can only
   match prefixes and moving it server-side would quietly break "kumar"
   finding "Ravi Kumar".
────────────────────────────────────────────── */
import { loadCollection, invalidateCollection } from './collectionCache';

// Customers change far less often than stock or sales, so this one is held
// longer than the shared default.
const TTL_MS = 5 * 60 * 1000;

export const loadCustomers = (options = {}) =>
  loadCollection('customers', { ttlMs: TTL_MS, ...options });

/** Call after adding or changing a customer so the next read is fresh. */
export const invalidateCustomers = () => invalidateCollection('customers');
