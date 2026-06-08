// Run: node scripts/migrateWalletFields.js
// Adds walletBalance: 0 and walletHistory: [] to existing customer docs

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const migrate = async () => {
  const snap = await getDocs(collection(db, 'customers'))
  let updated = 0
  for (const d of snap.docs) {
    const data = d.data()
    if (data.walletBalance === undefined) {
      await updateDoc(doc(db, 'customers', d.id), {
        walletBalance: 0,
        walletHistory: []
      })
      updated++
    }
  }
  console.log(`Migrated ${updated} customer documents`)
  process.exit(0)
}

migrate()
