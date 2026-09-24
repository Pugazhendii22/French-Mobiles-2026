// Run: node scripts/backupTacDatabase.js [outputPath]
// Exports the TAC reference collection to a JSON file so the app's device
// lookup data survives accidental loss. Reads only - never writes.
//
// Uses the same public VITE_TAC_FIREBASE_* config the app uses, loaded from
// .env, so no admin service-account key is needed.
//
// Note: this reads every document in one pass (~20k). Firestore's free tier
// allows 50k reads/day, so run it sparingly - normal app use costs 1 read per
// scan and is nowhere near the limit, but repeated full exports will exhaust it.

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'
import { readFileSync, writeFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(line => line.trim() && !line.trim().startsWith('#'))
    .map(line => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    })
)

const config = {
  apiKey: env.VITE_TAC_FIREBASE_API_KEY,
  authDomain: env.VITE_TAC_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_TAC_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_TAC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_TAC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_TAC_FIREBASE_APP_ID,
}

if (!config.projectId) {
  console.error('VITE_TAC_FIREBASE_* values are missing from .env')
  process.exit(1)
}

const outPath = process.argv[2] || `tac-database-backup-${new Date().toISOString().slice(0, 10)}.json`

const db = getFirestore(initializeApp(config))

try {
  const snap = await getDocs(collection(db, 'tacDatabase'))
  const docs = []
  snap.forEach(d => docs.push({ id: d.id, data: d.data() }))

  writeFileSync(outPath, JSON.stringify({
    project: config.projectId,
    collection: 'tacDatabase',
    exportedAt: new Date().toISOString(),
    count: docs.length,
    docs,
  }, null, 1))

  console.log(`Backed up ${docs.length} TAC records -> ${outPath}`)
  process.exit(0)
} catch (err) {
  if (err?.code === 'resource-exhausted') {
    console.error('Firestore daily read quota exhausted. Try again after it resets (midnight US Pacific).')
  } else {
    console.error('Backup failed:', err?.code || err?.message || err)
  }
  process.exit(1)
}
