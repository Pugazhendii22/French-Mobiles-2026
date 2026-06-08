import { doc, updateDoc, getDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase/firebase'

export const creditWallet = async (customerId, amount, reason, referenceId, staffUid) => {
  if (!customerId || amount <= 0) return
  const custRef = doc(db, 'customers', customerId)
  const custSnap = await getDoc(custRef)
  if (!custSnap.exists()) return

  const currentBalance = custSnap.data().walletBalance || 0
  const newBalance = currentBalance + amount

  const transaction = {
    amount: amount,
    type: 'credit',
    reason: reason,
    referenceId: referenceId || '',
    date: new Date(),
    addedBy: staffUid,
    balanceAfter: newBalance
  }

  await updateDoc(custRef, {
    walletBalance: newBalance,
    walletHistory: arrayUnion(transaction)
  })

  return newBalance
}

export const debitWallet = async (customerId, amount, reason, referenceId, staffUid) => {
  if (!customerId || amount <= 0) return
  const custRef = doc(db, 'customers', customerId)
  const custSnap = await getDoc(custRef)
  if (!custSnap.exists()) return

  const currentBalance = custSnap.data().walletBalance || 0
  if (currentBalance < amount) throw new Error('Insufficient wallet balance')

  const newBalance = currentBalance - amount

  const transaction = {
    amount: -amount,
    type: 'debit',
    reason: reason,
    referenceId: referenceId || '',
    date: new Date(),
    addedBy: staffUid,
    balanceAfter: newBalance
  }

  await updateDoc(custRef, {
    walletBalance: newBalance,
    walletHistory: arrayUnion(transaction)
  })

  return newBalance
}
