import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

/* Read-only connection to a separate Firebase project holding the TAC (device
   model) reference database. This config is public by design - the client
   Firebase config is not a secret, access is controlled by that project's own
   Firestore rules (read-only on the tacDatabase collection, everything else
   denied). Optional: if these env vars aren't set, scan-to-autofill simply
   skips this lookup and falls back to this app's own tac_registry. */

const tacFirebaseConfig = {
  apiKey: import.meta.env.VITE_TAC_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_TAC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_TAC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_TAC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_TAC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_TAC_FIREBASE_APP_ID,
};

const isConfigured = Object.values(tacFirebaseConfig).every(Boolean);

export const tacDb = isConfigured
  ? getFirestore(initializeApp(tacFirebaseConfig, 'tacDb'))
  : null;
