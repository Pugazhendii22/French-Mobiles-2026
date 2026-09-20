/* ─────────────────────────────────────────────
   ATOMIC COUNTERS

   Invoice numbers, service order numbers and label numbers used to be derived
   by counting existing documents. Two people billing at the same time both
   counted the same total and both produced the same number - duplicate
   invoices, or two devices sharing one label so the scanner opens the wrong
   record.

   These run the increment inside a Firestore transaction instead, so each
   caller is guaranteed a number nobody else got.
────────────────────────────────────────────── */
import {
  doc, getDoc, getDocs, setDoc, runTransaction,
  collection, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

const COUNTERS = 'counters';

// Highest code point Firestore will sort after any normal string - turns a
// prefix into a range query.
const HIGH_SENTINEL = '\uf8ff';

/**
 * Seed a counter the first time it is used, so switching to counters does not
 * restart numbering over documents that already exist.
 * Transactions cannot run queries, so this happens before the transaction.
 */
const ensureSeeded = async (counterRef, seedFn) => {
  const snap = await getDoc(counterRef);
  if (snap.exists()) return;
  let seed = 0;
  try {
    seed = await seedFn();
  } catch (err) {
    console.error('Counter seed failed, starting from 0:', err);
  }
  // Only create it if nobody beat us to it
  const again = await getDoc(counterRef);
  if (!again.exists()) {
    await setDoc(counterRef, { count: seed, createdAt: new Date().toISOString() });
  }
};

const bump = async (counterRef) =>
  runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists() ? Number(snap.data().count) || 0 : 0) + 1;
    tx.set(counterRef, { count: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });

/**
 * Next number in a per-day series, e.g. INV-20260920-004.
 * `collectionName` / `field` are only used to seed the counter on first use.
 */
const countTodayDocs = async (collectionName, field, prefix) => {
  const snap = await getDocs(query(
    collection(db, collectionName),
    where(field, '>=', prefix),
    where(field, '<', prefix + HIGH_SENTINEL)
  ));
  return snap.size;
};

export const nextDailyNumber = async ({ kind, prefixLabel, collectionName, field }) => {
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `${prefixLabel}-${dateStr}-`;

  try {
    const counterRef = doc(db, COUNTERS, `${kind}_${dateStr}`);
    await ensureSeeded(counterRef, () => countTodayDocs(collectionName, field, prefix));
    const n = await bump(counterRef);
    return `${prefix}${String(n).padStart(3, '0')}`;
  } catch (err) {
    // The counters collection may not be writable yet (security rules). Billing
    // must never stop for that - fall back to counting today's documents, which
    // is what this did before counters existed.
    console.warn('Counter unavailable, counting documents instead:', err?.message || err);
    const n = (await countTodayDocs(collectionName, field, prefix)) + 1;
    return `${prefix}${String(n).padStart(3, '0')}`;
  }
};

const LABEL_START = 26001;

/** Next label number, unique even if two staff assign labels at once. */
const highestLabel = async () => {
  const snap = await getDocs(query(
    collection(db, 'label_registry'),
    orderBy('labelNumber', 'desc'),
    limit(1)
  ));
  // Counter holds the last number issued; start below the first label so the
  // first bump returns LABEL_START.
  return snap.empty ? LABEL_START - 1 : Number(snap.docs[0].data().labelNumber) || LABEL_START - 1;
};

export const nextLabelNumber = async () => {
  try {
    const counterRef = doc(db, COUNTERS, 'label_registry');
    await ensureSeeded(counterRef, highestLabel);
    return await bump(counterRef);
  } catch (err) {
    console.warn('Label counter unavailable, using highest existing label:', err?.message || err);
    return (await highestLabel()) + 1;
  }
};
