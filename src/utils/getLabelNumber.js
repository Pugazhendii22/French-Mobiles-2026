import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const START_NUMBER = 26001;

export const getLabelNumber = async () => {
  try {
    const q = query(collection(db, 'label_registry'), orderBy('labelNumber', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return START_NUMBER;
    return snap.docs[0].data().labelNumber + 1;
  } catch (err) {
    console.error('getLabelNumber error:', err);
    return START_NUMBER;
  }
};
