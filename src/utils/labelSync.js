/* ─────────────────────────────────────────────
   LABEL SNAPSHOTS

   A label_registry entry carries a copy of the record it was printed for, so a
   scan resolves without a second read. The copy was written once, when the
   label was assigned, and never touched again - so correcting a price on the
   mobile left the label (and every reprint and scan of it) showing the old one,
   while the bill and the detail page showed the new one.

   Two rules keep the two in step:
     - after saving a record, refresh the snapshot on its labels;
     - when printing or showing a label, lay the live record over the snapshot,
       so labels assigned before this existed still print the current price.
────────────────────────────────────────────── */

import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/shared/firebase/firebase';

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
});

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
});

/** Merge the live record over a label entry, for printing or display. */
export const withLiveLabelData = (labelEntry, liveData) =>
  labelEntry ? { ...labelEntry, data: { ...labelEntry.data, ...liveData } } : labelEntry;

/**
 * Refresh the printed details on every label assigned to a record. The label
 * keeps its number and who assigned it; only the copied details change.
 * A label that cannot be refreshed must never fail the save the user just
 * made, so this reports and returns instead of throwing.
 */
export const syncLabelSnapshot = async (labelType, referenceId, liveData) => {
  if (!labelType || !referenceId) return;
  try {
    const snap = await getDocs(query(
      collection(db, 'label_registry'),
      where('referenceId', '==', referenceId),
      where('labelType', '==', labelType)
    ));
    await Promise.all(snap.docs.map(entry => updateDoc(doc(db, 'label_registry', entry.id), {
      data: { ...(entry.data().data || {}), ...liveData },
      updatedAt: new Date().toISOString(),
    })));
  } catch (err) {
    console.error('Label snapshot sync failed:', err);
  }
};
