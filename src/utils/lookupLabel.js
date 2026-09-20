import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';

/**
 * Resolve a scanned barcode / label number to its label_registry entry.
 * Returns { id, labelNumber, labelType, referenceId, data } or null when unknown.
 */
export const lookupLabel = async (labelNumber) => {
  const num = Number(labelNumber);
  if (!num || Number.isNaN(num)) return null;

  try {
    const q = query(
      collection(db, 'label_registry'),
      where('labelNumber', '==', num),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (err) {
    console.error('lookupLabel error:', err);
    throw err;
  }
};

export default lookupLabel;
