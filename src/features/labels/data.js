/* ─────────────────────────────────────────────
   LABEL REGISTRY

   One home for the label_registry collection. Before this, label reads and
   writes were spelled out in a dozen screens, which is why the same lookup
   existed twice in the products feature alone and why two different document
   shapes were in use without anyone noticing.

   A label entry carries a copy of the record it was printed for, so a scan
   resolves without a second read. syncLabelSnapshot keeps that copy in step
   after a save; withLiveLabelData lays the live record over labels assigned
   before that existed.
────────────────────────────────────────────── */
import {
  collection, doc, query, where, limit, getDocs, addDoc, setDoc, updateDoc,
} from 'firebase/firestore'
import { db } from '@/shared/firebase/firebase'
import { nextLabelNumber } from '@/shared/data/counters'

const LABELS = 'label_registry'

/**
 * Next label number. Backed by an atomic counter - deriving it from the
 * highest existing label meant two staff assigning at the same moment both
 * got the same number, and the scanner then opened the wrong record.
 */
export const getLabelNumber = async () => nextLabelNumber()

/** The label assigned to a record, or null. Returns the first if several. */
export const findLabel = async (labelType, referenceId) => {
  if (!labelType || !referenceId) return null
  const snap = await getDocs(query(
    collection(db, LABELS),
    where('referenceId', '==', referenceId),
    where('labelType', '==', labelType)
  ))
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

/**
 * Resolve a scanned barcode / label number to its entry.
 * Returns null when the number is unknown or not a number.
 */
export const lookupLabel = async (labelNumber) => {
  const num = Number(labelNumber)
  if (!num || Number.isNaN(num)) return null

  try {
    const snap = await getDocs(query(
      collection(db, LABELS),
      where('labelNumber', '==', num),
      limit(1)
    ))
    if (snap.empty) return null
    return { id: snap.docs[0].id, ...snap.docs[0].data() }
  } catch (err) {
    console.error('lookupLabel error:', err)
    throw err
  }
}

/** Add a label entry under an auto-generated document id. */
export const createLabelEntry = async (labelData) => {
  const ref = await addDoc(collection(db, LABELS), labelData)
  return ref.id
}

/**
 * Add a label entry keyed by its own label number.
 * The save-and-print path writes labels this way while the assign-label paths
 * use an auto id. Both shapes are in the database already, so both are kept
 * until someone decides which is right.
 */
export const createLabelEntryKeyedByNumber = async (labelNumber, labelData) => {
  await setDoc(doc(db, LABELS, labelNumber.toString()), labelData)
}

/**
 * Refresh the printed details on every label assigned to a record. The label
 * keeps its number and who assigned it; only the copied details change.
 * Never throws: a label that cannot be refreshed must not fail the user's save.
 */
export const syncLabelSnapshot = async (labelType, referenceId, liveData) => {
  if (!labelType || !referenceId) return
  try {
    const snap = await getDocs(query(
      collection(db, LABELS),
      where('referenceId', '==', referenceId),
      where('labelType', '==', labelType)
    ))
    await Promise.all(snap.docs.map(entry => updateDoc(doc(db, LABELS, entry.id), {
      data: { ...(entry.data().data || {}), ...liveData },
      updatedAt: new Date().toISOString(),
    })))
  } catch (err) {
    console.error('Label snapshot sync failed:', err)
  }
}

/** Merge the live record over a label entry, for printing or display. */
export const withLiveLabelData = (labelEntry, liveData) =>
  labelEntry ? { ...labelEntry, data: { ...labelEntry.data, ...liveData } } : labelEntry

/** The part of a second-hand mobile a label shows. */
export const secondHandLabelData = (mobile = {}) => ({
  brand: mobile.brand || '',
  model: mobile.model || '',
  ram: mobile.ram || '',
  rom: mobile.rom || '',
  condition: mobile.condition || '',
  grade: mobile.condition || '',
  imei1: mobile.imei1 || '',
  imei2: mobile.imei2 || '',
  serialNumber: mobile.serialNumber || '',
  purchasePrice: Number(mobile.purchasePrice || 0),
  salePrice: Number(mobile.salePrice || 0),
  purchaseDate: mobile.purchaseDate || '',
  supplier: mobile.supplier || '',
  specialNotes: mobile.notes || '',
  frontImageUrl: mobile.photo1Url || mobile.frontImageUrl || '',
  backImageUrl: mobile.photo2Url || mobile.backImageUrl || '',
  status: mobile.status || '',
})

/** The part of a service order a label shows. */
export const serviceOrderLabelData = (order = {}) => ({
  orderNumber: order.orderNumber || '',
  brand: order.brand || '',
  model: order.model || '',
  colour: order.colour || '',
  customerName: order.customerName || '',
  customerPhone: order.customerPhone || '',
  complaintType: order.complaintNature || '',
  complaintTypes: order.complaintTypes || (order.complaintNature ? [order.complaintNature] : []),
  otherComplaint: order.otherComplaint || '',
  problemDetails: order.problemDetails || '',
  estimatedPrice: Number(order.estimatedPrice || 0),
  advancePaid: Number(order.advancePaid || 0),
  technicianName: order.technicianName || '',
  status: order.status || '',
  accessoriesCollected: order.accessories || [],
  rawMaterialCost: Number(order.rawMaterialCost || 0),
  outsideLabourCost: Number(order.outsideLabourCost || 0),
})
