/* ─────────────────────────────────────────────
   COLLECTION CACHE

   Firestore charges a read per document returned, so a list page that fetches
   its whole collection costs that many reads every single time it is opened.
   Staff move between Sales, Products and Second-Hand constantly, and each trip
   back was paying full price for data that had not changed.

   The list is fetched once and shared for a short window. The window is
   deliberately short - a minute - so anything that slips past an invalidate
   still corrects itself quickly, rather than leaving someone staring at a stale
   screen. Every write path should still call invalidateCollection so the change
   shows up immediately.

   Failures are never cached: the promise rejects and the next call retries, so
   the error banners on the list pages still fire.
────────────────────────────────────────────── */
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const DEFAULT_TTL_MS = 60 * 1000;

const cache = new Map();     // name -> { at, list }
const inflight = new Map();  // name -> Promise, de-duplicates concurrent callers

/**
 * Read a whole collection, reusing a recent copy when there is one.
 * Always resolves to a fresh array, so callers may sort it in place.
 */
export const loadCollection = async (name, { force = false, ttlMs = DEFAULT_TTL_MS } = {}) => {
  if (!force) {
    const hit = cache.get(name);
    if (hit && Date.now() - hit.at < ttlMs) return hit.list.slice();

    const pending = inflight.get(name);
    if (pending) return (await pending).slice();
  }

  const request = (async () => {
    try {
      const snap = await getDocs(collection(db, name));
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      cache.set(name, { at: Date.now(), list });
      return list;
    } finally {
      inflight.delete(name);
    }
  })();

  inflight.set(name, request);
  return (await request).slice();
};

/** Call after adding, changing or removing a document so the next read is fresh. */
export const invalidateCollection = (name) => {
  cache.delete(name);
  inflight.delete(name);
};
