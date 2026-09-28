/* ─────────────────────────────────────────────
   COLLECTION CACHE

   Firestore charges a read per document returned, so a list page that fetches
   its whole collection costs that many reads every single time it is opened.
   Staff move between Sales, Products and Second-Hand constantly, and each trip
   back was paying full price for data that had not changed.

   Two layers keep that bill down:

   1. An in-memory copy, shared by every caller in this page session.
   2. Firestore's own on-disk cache (enabled in firebase.js). A query answered
      from disk is not billed at all, so once a collection has been read from
      the server, reopening the app can serve the same list for free. That is
      what the freshness marker below is for: it records when a collection was
      last read from the server, and until that marker ages out, the list comes
      off the disk instead of the network. The marker is all that is stored -
      the documents stay in Firestore's cache, not in localStorage.

   The disk copy only answers for a collection this file has read from the
   server in full, so a page can never be handed a half-populated list built
   out of documents some other query happened to fetch.

   Freshness is per collection, chosen by how bad it is to be a few minutes
   behind: a service order's status changes all day and several people watch
   it, while the customer list barely moves. Nothing here learns about another
   device's writes before its window is up, which is the same trade the old
   one-minute window made - so every write path must still call
   invalidateCollection, which sends this device straight back to the server.

   Failures are never cached: the promise rejects and the next call retries, so
   the error banners on the list pages still fire.
────────────────────────────────────────────── */
import { collection, getDocs, getDocsFromCache } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const DEFAULT_TTL_MS = 2 * 60 * 1000;

/* How long a collection may be served without asking the server again. */
const TTL_BY_COLLECTION = {
  customers: 30 * 60 * 1000,        // names and numbers; edits invalidate it
  // Kept short on purpose: the new-sale form checks stock against this list,
  // and two phones selling the last unit must not both be told it is there.
  products: 2 * 60 * 1000,
  second_hand_mobiles: 5 * 60 * 1000,
  sales: 5 * 60 * 1000,
  enquiries: 5 * 60 * 1000,
  label_registry: 5 * 60 * 1000,
  service_orders: 2 * 60 * 1000,    // status moves all day, on several phones
};

export const ttlFor = (name) => TTL_BY_COLLECTION[name] ?? DEFAULT_TTL_MS;

const MARKER_PREFIX = 'fm:collection-synced:';

const cache = new Map();     // name -> { at, list }
const inflight = new Map();  // name -> Promise, de-duplicates concurrent callers

/* localStorage is absent or throws in some private modes and WebViews; a
   missing marker only means the next read goes to the server. */
const readMarker = (name) => {
  try {
    const at = Number(window.localStorage.getItem(MARKER_PREFIX + name));
    return Number.isFinite(at) && at > 0 ? at : 0;
  } catch {
    return 0;
  }
};

const writeMarker = (name, at) => {
  try {
    window.localStorage.setItem(MARKER_PREFIX + name, String(at));
  } catch {
    /* ignore - the collection is simply re-read from the server next time */
  }
};

const clearMarker = (name) => {
  try {
    window.localStorage.removeItem(MARKER_PREFIX + name);
  } catch {
    /* ignore */
  }
};

const toList = (snap) => {
  const list = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list;
};

/**
 * Read a whole collection, reusing a recent copy when there is one.
 * Always resolves to a fresh array, so callers may sort it in place.
 */
export const loadCollection = async (name, { force = false, ttlMs = ttlFor(name) } = {}) => {
  if (!force) {
    const hit = cache.get(name);
    if (hit && Date.now() - hit.at < ttlMs) return hit.list.slice();

    const pending = inflight.get(name);
    if (pending) return (await pending).slice();
  }

  const request = (async () => {
    try {
      const syncedAt = force ? 0 : readMarker(name);

      // Inside the window, Firestore's disk copy answers this for free.
      if (syncedAt && Date.now() - syncedAt < ttlMs) {
        try {
          const cached = await getDocsFromCache(collection(db, name));
          // An empty result here means the disk copy was cleared, not that the
          // shop has no products - go to the server for a real answer.
          if (!cached.empty) {
            const list = toList(cached);
            cache.set(name, { at: Date.now(), list });
            return list;
          }
        } catch {
          /* no disk cache on this device - fall through to the server */
        }
      }

      const snap = await getDocs(collection(db, name));
      const list = toList(snap);
      cache.set(name, { at: Date.now(), list });
      writeMarker(name, Date.now());
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
  clearMarker(name);
};
