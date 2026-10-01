/* ─────────────────────────────────────────────
   PRODUCTS DATA

   Every products read and write in one place. Before this, the three products
   screens each spelled out their own Firestore calls - including one that
   imported firebase/firestore dynamically in the middle of a save handler -
   and whether a write refreshed the cached list was up to whoever wrote the
   screen. One of them did not, so a product could show as unlabelled on the
   list straight after being labelled.

   Reads go through the collection cache; every write invalidates it.
────────────────────────────────────────────── */
import { collection, doc, getDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/shared/firebase/firebase'
import { loadCollection, invalidateCollection } from '@/shared/data/collectionCache'

const PRODUCTS = 'products'

/** The whole collection, cached. Unsorted: display order belongs to the page. */
export const listProducts = () => loadCollection(PRODUCTS)

/** One product, or null when the id does not exist. */
export const getProduct = async (id) => {
  const snap = await getDoc(doc(db, PRODUCTS, id))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/** Add a product. Returns the new id. */
export const createProduct = async (data) => {
  const ref = await addDoc(collection(db, PRODUCTS), data)
  invalidateCollection(PRODUCTS)
  return ref.id
}

/** Change a product, whole or in part. Returns the id, for callers that chain. */
export const updateProduct = async (id, data) => {
  await updateDoc(doc(db, PRODUCTS, id), data)
  invalidateCollection(PRODUCTS)
  return id
}

/** Remove a product. */
export const deleteProduct = async (id) => {
  await deleteDoc(doc(db, PRODUCTS, id))
  invalidateCollection(PRODUCTS)
}
