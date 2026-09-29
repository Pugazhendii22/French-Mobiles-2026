/* ─────────────────────────────────────────────
   CUSTOMER CACHE

   Kept as the name every screen already imports. The customer list is no
   longer fetched per screen and thrown away - it lives on the phone and only
   changes are pulled. See customerStore.js for how that works.
────────────────────────────────────────────── */

export {
  loadCustomers,
  invalidateCustomers,
  refreshCustomers,
  rememberCustomer,
  forgetCustomer,
  cachedCustomers,
} from './customerStore';
