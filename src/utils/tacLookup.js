import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { tacDb } from '../firebase/tacFirebase';

/* TAC = Type Allocation Code, the first 8 digits of an IMEI. It identifies the
   exact device model, so once we know brand/model for a TAC we never need to
   ask a worker to type them again for that model - only for the very first
   phone of that model the shop ever sees.

   Two sources are checked, in order:
   1. tacDatabase in the separate read-only TAC reference project (tacFirebase.js) -
      a large pre-built dataset, in its own raw {brand, specs} shape.
   2. tac_registry in this app's own database - grows over time as staff enter
      brand/model for phones the reference database didn't have. */

const getTacFromImei = (imei) => {
  const digits = String(imei || '').replace(/\D/g, '');
  return digits.slice(0, 8).padStart(8, '0');
};

const BRAND_CASE = {
  SONY: 'Sony', ALCATEL: 'Alcatel', TCL: 'TCL', BLACKBERRY: 'BlackBerry',
  SAMSUNG: 'Samsung', TECNO: 'Tecno', ULEFONE: 'Ulefone', VIVO: 'Vivo',
  XIAOMI: 'Xiaomi', REDMI: 'Redmi', POCO: 'POCO',
};

const properBrand = (raw) => {
  const upper = String(raw || '').trim().toUpperCase();
  return BRAND_CASE[upper] || (upper ? upper[0] + upper.slice(1).toLowerCase() : '');
};

// "SAMSUNG GALAXY Z FOLD6, Samsung SM-F956B2024" -> "GALAXY Z FOLD6"
const deriveModel = (specs, brandUpper) => {
  const first = String(specs || '').split(',')[0].trim();
  const re = new RegExp('^' + brandUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i');
  return first.replace(re, '').trim() || first;
};

const lookupReferenceDb = async (tac) => {
  if (!tacDb) return null;
  try {
    // A small slice of the reference data has TAC ids stored without a
    // leading zero, so try the exact id first and fall back to the
    // zero-stripped form.
    let snap = await getDoc(doc(tacDb, 'tacDatabase', tac));
    if (!snap.exists() && tac.startsWith('0')) {
      snap = await getDoc(doc(tacDb, 'tacDatabase', tac.replace(/^0+/, '')));
    }
    if (!snap.exists()) return null;
    const d = snap.data();
    const brandUpper = String(d.brand || '').trim().toUpperCase();
    return { brand: properBrand(d.brand), model: deriveModel(d.specs, brandUpper) };
  } catch (err) {
    console.error('TAC reference database lookup error:', err);
    return null;
  }
};

const lookupOwnRegistry = async (tac) => {
  try {
    const snap = await getDoc(doc(db, 'tac_registry', tac));
    if (!snap.exists()) return null;
    return snap.data();
  } catch (err) {
    console.error('tac_registry lookup error:', err);
    return null;
  }
};

/** Look up brand/model for a scanned IMEI. Returns null if this TAC is unknown to either source. */
export const lookupTac = async (imei) => {
  const tac = getTacFromImei(imei);
  if (tac.length < 8) return null;

  const fromReference = await lookupReferenceDb(tac);
  if (fromReference?.brand && fromReference?.model) return { tac, ...fromReference };

  const fromOwn = await lookupOwnRegistry(tac);
  if (fromOwn?.brand && fromOwn?.model) return { tac, ...fromOwn };

  return null;
};

/**
 * Teach the app a TAC neither source knew about, so the next phone of this
 * model fills itself in. Called on every new intake - however the record was
 * started - rather than only for scanner-initiated ones, which is what lets
 * the registry actually grow with day-to-day use.
 *
 * Already-known TACs are left untouched: staff correcting a brand/model on one
 * order should not silently rewrite the shared entry for every future device.
 * Fire-and-forget - never block saving the record on this.
 */
export const recordTacIfNew = async (imei, brand, model, uid) => {
  const tac = getTacFromImei(imei);
  if (tac.length < 8 || !brand || !model) return;

  const known = await lookupTac(imei);
  if (known) return;

  try {
    await setDoc(doc(db, 'tac_registry', tac), {
      brand,
      model,
      addedBy: uid || '',
      addedAt: new Date().toISOString(),
      source: 'staff',
    }, { merge: true });
  } catch (err) {
    console.error('recordTacIfNew error:', err);
  }
};
