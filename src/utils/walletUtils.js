import { doc, runTransaction, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase/firebase'

/* Wallet moves run inside a transaction. Reading the balance and then writing
   it back separately meant two operations on the same customer at the same
   moment could each read the old balance, and one update would be lost. */

const applyWalletChange = async (customerId, delta, entry) => {
  if (!customerId || !delta) return undefined

  return runTransaction(db, async (tx) => {
    const custRef = doc(db, 'customers', customerId)
    const custSnap = await tx.get(custRef)
    if (!custSnap.exists()) return undefined

    const currentBalance = Number(custSnap.data().walletBalance) || 0
    const newBalance = currentBalance + delta

    if (newBalance < 0) throw new Error('Insufficient wallet balance')

    tx.update(custRef, {
      walletBalance: newBalance,
      walletHistory: arrayUnion({ ...entry, balanceAfter: newBalance }),
    })

    return newBalance
  })
}

export const creditWallet = async (customerId, amount, reason, referenceId, staffUid) => {
  if (!customerId || amount <= 0) return
  return applyWalletChange(customerId, amount, {
    amount,
    type: 'credit',
    reason,
    referenceId: referenceId || '',
    date: new Date(),
    addedBy: staffUid,
  })
}

export const debitWallet = async (customerId, amount, reason, referenceId, staffUid) => {
  if (!customerId || amount <= 0) return
  return applyWalletChange(customerId, -amount, {
    amount: -amount,
    type: 'debit',
    reason,
    referenceId: referenceId || '',
    date: new Date(),
    addedBy: staffUid,
  })
}
