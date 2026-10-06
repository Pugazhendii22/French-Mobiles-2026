/* ─────────────────────────────────────────────
   CUSTOMER STORE

   Customers are the biggest collection in the shop and the one every screen
   wants: the sale, service and second-hand forms all need the autocomplete,
   and the customer list needs the lot. Re-reading the collection is a read per
   customer, so with a few thousand customers a single careless screen costs
   thousands of reads - and adding one customer used to throw the cached copy
   away, making the next form pay for all of them again.

   So the collection is pulled once and kept on the phone, in IndexedDB:

     - the first load pulls every customer and stores them;
     - after that, only documents changed since the last pull are asked for
       (updatedAt > watermark), which is normally nothing and bills one read;
     - our own adds, edits and deletes are written straight into the local copy,
       so saving a customer costs no reads at all;
     - once a day the whole collection is pulled again, which is what catches a
       customer deleted on another device.

   Because the watermark comes from updatedAt, EVERY write to a customer must
   set updatedAt, or that change will not reach the other phones until the
   daily pull. The watermark is also rewound a few minutes on each query, so a
   device whose clock runs slightly behind is not skipped.

   IndexedDB can be unavailable (private modes, old WebViews). Everything here
   degrades to an in-memory copy for the session, which is what the app did
   before this file existed.
────────────────────────────────────────────── */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/shared/firebase/firebase';

const DB_NAME = 'french-mobiles';
const DB_VERSION = 1;
const STORE = 'customers';
const META_STORE = 'meta';
const META_KEY = 'customers-sync';

/** How often to ask the server "anything changed?" - one read when nothing has. */
const DELTA_CHECK_MS = 2 * 60 * 1000;
/** A full pull now and then, so a customer deleted elsewhere disappears here. */
const FULL_RESYNC_MS = 24 * 60 * 60 * 1000;
/** Rewind the watermark a little: phone clocks are not in step with each other. */
const CLOCK_SLACK_MS = 5 * 60 * 1000;

let memo = null;                 // id -> customer, the live copy for this session
let meta = { lastFullAt: 0, lastDeltaAt: 0, watermark: '' };
let hydrated = false;
let inflight = null;

/* ── IndexedDB, wrapped so a failure is never fatal ── */

const openDb = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB unavailable'));
    return;
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' });
    if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const withStore = async (storeName, mode, run) => {
  const database = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, mode);
      const result = run(tx.objectStore(storeName));
      // Reads hand back a box the request fills in; writes hand back nothing.
      tx.oncomplete = () => resolve(result?.value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
};

const request = (req) => {
  const box = { value: undefined };
  req.onsuccess = () => { box.value = req.result; };
  return box;
};

const readLocal = () => withStore(STORE, 'readonly', (store) => request(store.getAll()));
const readMeta = () => withStore(META_STORE, 'readonly', (store) => request(store.get(META_KEY)));
const writeMeta = (value) => withStore(META_STORE, 'readwrite', (store) => { store.put(value, META_KEY); });

const writeLocal = (list, { replaceAll = false } = {}) =>
  withStore(STORE, 'readwrite', (store) => {
    if (replaceAll) store.clear();
    list.forEach(customer => store.put(customer));
  });

const deleteLocal = (id) => withStore(STORE, 'readwrite', (store) => { store.delete(id); });

/** Every local write is best-effort: the session copy is the source of truth. */
const quietly = (promise) => Promise.resolve(promise).catch(() => undefined);

/* ── sync ── */

const latestStamp = (customers) =>
  customers.reduce((latest, c) => {
    const stamp = c.updatedAt || c.createdAt || '';
    return stamp > latest ? stamp : latest;
  }, '');

const since = (watermark) => {
  const ms = Date.parse(watermark);
  if (Number.isNaN(ms)) return watermark;
  return new Date(ms - CLOCK_SLACK_MS).toISOString();
};

const asList = () => (memo ? [...memo.values()] : []);

const hydrate = async () => {
  if (hydrated) return;
  hydrated = true;
  const [stored, storedMeta] = await Promise.all([
    quietly(readLocal()),
    quietly(readMeta()),
  ]);
  if (Array.isArray(stored) && stored.length) {
    const fromDisk = new Map(stored.map(c => [c.id, c]));
    // A customer written on this device a moment ago is newer than the disk
    // copy, so it wins rather than being read back over.
    memo?.forEach((customer, id) => fromDisk.set(id, customer));
    memo = fromDisk;
    if (storedMeta) meta = { ...meta, ...storedMeta };
  }
};

const fullPull = async () => {
  const snap = await getDocs(collection(db, 'customers'));
  const list = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));

  memo = new Map(list.map(c => [c.id, c]));
  meta = { lastFullAt: Date.now(), lastDeltaAt: Date.now(), watermark: latestStamp(list) };
  await quietly(writeLocal(list, { replaceAll: true }));
  await quietly(writeMeta(meta));
  return asList();
};

const deltaPull = async () => {
  if (!meta.watermark) return fullPull();

  const snap = await getDocs(query(
    collection(db, 'customers'),
    where('updatedAt', '>', since(meta.watermark))
  ));

  const changed = [];
  snap.forEach(d => changed.push({ id: d.id, ...d.data() }));
  changed.forEach(c => memo.set(c.id, c));

  const newest = latestStamp(changed);
  meta = {
    ...meta,
    lastDeltaAt: Date.now(),
    watermark: newest > meta.watermark ? newest : meta.watermark,
  };
  if (changed.length) await quietly(writeLocal(changed));
  await quietly(writeMeta(meta));
  return asList();
};

/**
 * The customer list. Served from the phone, topped up with whatever changed
 * since the last check. Pass { force: true } to pull the whole collection.
 */
export const loadCustomers = async ({ force = false } = {}) => {
  if (inflight) return (await inflight).slice();

  const run = (async () => {
    await hydrate();
    const now = Date.now();

    if (force || !memo || !meta.lastFullAt || now - meta.lastFullAt > FULL_RESYNC_MS) {
      try {
        return await fullPull();
      } catch (err) {
        // A stored copy beats an error screen when the daily pull cannot run.
        if (memo && !force) {
          console.error('Customer refresh failed, using the stored copy:', err);
          return asList();
        }
        throw err;
      }
    }
    if (now - meta.lastDeltaAt > DELTA_CHECK_MS) {
      try {
        return await deltaPull();
      } catch (err) {
        // Offline or refused: the copy on the phone is still worth showing.
        console.error('Customer delta sync failed, using the stored copy:', err);
        return asList();
      }
    }
    return asList();
  })();

  inflight = run.finally(() => { inflight = null; });
  return (await inflight).slice();
};

/** Ask the server for changes on the next load, rather than waiting out the window. */
export const invalidateCustomers = () => {
  meta = { ...meta, lastDeltaAt: 0 };
  quietly(writeMeta(meta));
};

/** Pull the whole collection again - after a bulk import, or to catch deletions now. */
export const refreshCustomers = () => loadCustomers({ force: true });

/**
 * Record a customer this device just wrote. Keeping the local copy in step
 * costs nothing, where re-reading the collection costs a read per customer.
 */
export const rememberCustomer = (customer) => {
  if (!customer?.id) return;
  if (!memo) memo = new Map();
  memo.set(customer.id, customer);
  const stamp = customer.updatedAt || customer.createdAt || '';
  if (stamp && stamp > meta.watermark) meta = { ...meta, watermark: stamp };
  quietly(writeLocal([customer]));
  quietly(writeMeta(meta));
};

/** Drop a customer this device just deleted. */
export const forgetCustomer = (id) => {
  if (!id) return;
  memo?.delete(id);
  quietly(deleteLocal(id));
};

/** The stored copy, without touching the network - for a quick local lookup. */
export const cachedCustomers = () => asList();
