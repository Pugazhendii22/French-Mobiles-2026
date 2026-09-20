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
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const TTL_MS = 5 * 60 * 1000;

let cache = null;      // { at, list }
let inflight = null;   // de-duplicates concurrent callers

export const loadCustomers = async ({ force = false } = {}) => {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.list;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const snap = await getDocs(collection(db, 'customers'));
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      cache = { at: Date.now(), list };
      return list;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
};

/** Call after adding or changing a customer so the next read is fresh. */
export const invalidateCustomers = () => {
  cache = null;
  inflight = null;
};
