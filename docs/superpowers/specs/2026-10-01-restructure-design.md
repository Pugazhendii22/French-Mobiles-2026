# Restructuring French Mobiles — design

Date: 2026-10-01
Status: approved, ready for an implementation plan

## Why

The app works. Two things about its shape make it expensive to change:

**Files too large to hold in your head.** Five files carry most of the
application:

| File | Lines |
|---|---|
| `src/pages/inventory/SecondHandForm.jsx` | 1377 |
| `src/pages/service/ServiceOrderView.jsx` | 1216 |
| `src/pages/service/ServiceOrderForm.jsx` | 1128 |
| `src/pages/sales/SalesForm.jsx` | 979 |
| `src/pages/service/ServiceOrderList.jsx` | 874 |

**A layout organised by file type, not by feature.** Working on service
orders means touching `pages/service/`, `components/`, `utils/`, and
`firebase/`. Nothing tells you which of the 29 files in `utils/` belong to
service and which are shared — the answer is only in the import graph.

Success is: you can open a feature and find all of it, and no file in it is
too big to read in one sitting. Behaviour does not change.

## Scope

In scope: moving files into feature modules, splitting oversized files, and
extracting each feature's Firestore access into a data module.

Explicitly **not** in scope:

- **The unbounded reads.** `ServiceOrderList` re-reading every service order
  after every status change, `DuePaymentsPage` reading every sale,
  `ReportsPage` reading five whole collections. These are real and
  independently fixable; mixing them in would make "behaviour unchanged"
  untrue and the commits unreviewable. They are the pass after this one.
- **TypeScript, and any framework migration.** Separate decisions.
- **Any user-visible change.** Not a redesign, not a feature change.

## Current state, measured

- React 19, Vite 7, Firebase 12, React Router 7. PWA, deployed to Vercel as
  a static SPA. ~24k lines of JS/JSX. No TypeScript, no tests.
- `src/` is split `pages/ components/ context/ utils/ firebase/`.
- 40 of ~60 source files import `firebase/firestore` directly.
- Three data-access styles coexist: raw Firestore in the component (most
  pages), `utils/collectionCache.js` (whole-collection read + TTL + disk
  cache, 5 collections), and `utils/customerStore.js` (one pull then
  delta-sync into IndexedDB, customers only). Cache invalidation is each
  screen's job to remember, so some writes refresh the cache and some do not.
- The oversized `*Form` files are modals imported by list and view pages,
  not routes — so each form's logic is coupled to two or three parents.
- `components/sales/NewSaleModal.jsx` imports `pages/sales/SalesForm.jsx`:
  a component importing a page.

### What the import graph says about ownership

Shared by four or more features: `Layout` (11 features),
`collectionCache` (7), `customerCache` (7), `imageUrl` (7),
`ConfirmDeleteModal` (6), `phone` (5), `uploadImage` (5), `ui.jsx` (5),
`ImageModal` (5), `PrinterSelector` (4), `firebaseError` (4).

Everything else is feature-owned regardless of where it currently sits.
`components/common/SignaturePad.jsx` is used only by second-hand. Each of
the four document generators in `utils/` is used by exactly one feature.

Two things the graph exposed:

- **`components/labels/LabelPrint.jsx` (166 lines) is imported by nothing.**
  Live label HTML comes from `utils/printLabel.jsx`. Delete it.
- **An unnamed labels-and-scanning domain** cuts across features:
  `getLabelNumber`, `labelSync`, `lookupLabel`, the `label_registry`
  collection (18 call sites), `LabelRegistryList`, `ScannerPage`,
  `ScanResult`, plus a printing subsystem (`printLabel` → `qzPrint` for QZ
  Tray and `mobilePrint` for the print server, with `PrinterSelector` as the
  single UI choosing between them). This becomes its own feature.

## Target structure

Pages sit at the feature root. Subfolders only when earned. A file that is
too big becomes a *folder* with `index.jsx`, which gives its split pieces an
obvious home.

```
src/
  app/            App.jsx (routes only), routes.jsx, providers.jsx, main.jsx
  features/
    sales/        SalesList, SalesView, SalesForm/, NewSaleModal,
                  SecondHandMobileSelector, data.js, paymentMethods.js,
                  documents/ (generateInvoiceHTML, numberToWords)
    service/      ServiceOrderList/, ServiceOrderView/, ServiceOrderForm/,
                  data.js, documents/
    inventory/    SecondHandList, SecondHandView, SecondHandForm/,
                  SignaturePad, data.js, documents/
    products/     ProductList, ProductView, ProductForm/, data.js
    customers/    CustomerList, CustomerView, CustomerForm/,
                  CustomerAutocomplete, customerStore.js, wallet.js
    labels/       LabelRegistryList, ScannerPage, ScanResult/, data.js,
                  printing/ (printLabel, qzPrint, mobilePrint, PrinterSelector),
                  tacLookup.js
    enquiries/  tasks/  reports/  payments/  ratings/  dashboard/
    auth/         Login, AdminSetup, AuthContext.jsx
    settings/     SettingsPage/, SettingsContext.jsx
    staff/        StaffManagement, data.js
  shared/
    ui/           Layout, ui.jsx, uiTokens.js, ConfirmDeleteModal, ImageModal,
                  ErrorBoundary, PWAInstallPrompt
    components/   BarcodeScannerModal, ImeiInput, PatternLock
    firebase/     firebase.js, tacFirebase.js, firebaseError.js
    data/         collectionCache.js
    lib/          phone.js, imageUrl.js, uploadImage.js
```

### The layering rule

A feature may import another feature's `data.js` or its `index.js` barrel.
It may never reach into another feature's internals.

Products needs this in the very first slice: `label_registry` belongs to the
labels feature, so `ProductForm`'s label writes call
`features/labels/data.js` instead of touching Firestore. That rule is also
what collapses the 18 scattered `label_registry` call sites into one module.

### Path alias

A `@/` alias is added to `vite.config.js`, with a matching `jsconfig.json`
so the editor resolves it. Without it, every move produces churn like
`../../../shared/ui/Layout` and each later slice rewrites relative paths it
should not care about. With it, a move changes an import prefix and nothing
else.

## How one slice runs

Vertical slices: one feature at a time, each a single reviewable commit that
leaves the app working. No file is touched twice.

1. **Move.** `git mv` the feature's files into `features/<name>/`, rewrite
   imports to `@/`. `git mv` preserves history.
2. **Extract `data.js`.** Every Firestore call against the feature's own
   collection becomes a named function. **Query shapes are copied exactly as
   they are** — this pass must not change the read count. Cache invalidation
   moves inside the write, instead of being each caller's job to remember.
3. **Split what is oversized.** Target: nothing in the feature over ~300
   lines. The big forms already mark their own seams with section comments;
   those are the cut lines. State and submission logic goes to a
   `use<Feature>Form.js` hook, each labelled JSX section becomes a component,
   `index.jsx` composes them.
4. **Verify, then commit.** See below.

## Verification

Vitest is added in the skeleton step. Each slice's `data.js` gets tests for
its reads, its writes, and its cache invalidation, against a mocked
Firestore. This catches the plumbing mistakes that clicking through the UI
does not — a write that no longer invalidates its cache, a query that lost a
`where` clause.

Every slice must also pass `npm run build` and `npm run lint`. These prove
imports resolve and nothing is syntactically broken; they prove nothing about
behaviour, which is what the data-module tests and the per-slice click-through
are for.

Each slice ships with a short manual checklist. For products: open the list,
add a product, edit it, assign a label, preview the print, delete it.

The honest limit: the split forms themselves are not unit-tested under this
plan. Render-testing modal-heavy forms against Firebase mocks was considered
and rejected as roughly doubling the work. The forms are covered by the
build, by their extracted data modules being tested, and by the manual pass.

## Order of work

Dependency-driven: a feature is sliced after the features whose `data.js` it
needs.

| # | Slice | Why here |
|---|---|---|
| 0 | Skeleton | Folders, `@/` alias, Vitest, `shared/*` moves (already-standalone modules), `features/labels/data.js` + `printing/` consolidated from the label utils, delete dead `LabelPrint.jsx`. No feature pages move. App must build. |
| 1 | products (~1243 lines) | Medium and self-contained — proves the pattern on something reviewable before the hard ones. |
| 2 | customers (~1521) | Six screens depend on it; `customerStore.js` is already a sound module, so largely a move. Its `data.js` becomes the canonical customer surface. |
| 3 | enquiries (~727) | Small and independent. Validates the pattern a second time, cheaply. |
| 4 | labels pages (~1143) | `data.js` already exists from step 0; this moves `LabelRegistryList`, `ScannerPage`, and splits `ScanResult` (761). |
| 5 | inventory / second-hand (~2380) | Needs customers and labels. Contains the largest file in the app. |
| 6 | sales (~2141) | Needs customers, products, second-hand, labels. Fixes the component-imports-page inversion. |
| 7 | service (~3218) | Largest and most entangled: customers, labels, users, and sales' `NewSaleModal`. Last of the big ones, by which point the pattern is routine. |
| 8 | tasks, staff, ratings, auth (~1519) | Small features, grouped. |
| 9 | dashboard, reports, payments, settings (~2332) | Consumers of every other feature's `data.js`, so they go after those exist. |
| 10 | App shell + sweep | `App.jsx` → `app/routes.jsx` + `app/providers.jsx`. Verify no `firebase/firestore` import remains outside a feature `data.js` or `shared/firebase/`. |

## Found, flagged, not fixed

Recorded here so they are not lost, and so nobody mistakes them for
restructuring damage. Each needs its own decision.

- **`label_registry` is written two ways.** `setDoc` with the label number as
  the document ID (`ProductForm.jsx:226`), and `addDoc` with an auto-ID
  (`ProductForm.jsx:277`, `ProductView.jsx:84`). Both shapes are preserved as
  distinctly-named functions in `features/labels/data.js` and reported.
  Unifying them changes behaviour and may be a real bug.
- **Inline dynamic import of Firestore** at `ProductList.jsx:42`
  (`await import('firebase/firestore')` mid-handler) — normalised when the
  call moves into `data.js`.
- **Duplicated stock-status logic** in `ProductForm.jsx` at lines 127 and 177.
  This one *is* collapsed into a single function during the split: same
  result, one copy. It is the only intentional logic change in the plan.
- The unbounded reads listed under Scope.

## Risks

- **Wide change.** Every page eventually loses its direct `firebase/firestore`
  import. Mitigated by one commit per slice: any single slice can be reverted
  without unpicking the others.
- **No test coverage of the forms.** The largest files get the least automated
  verification. Mitigated by slicing them late, after the pattern is proven,
  and by the manual checklist.
- **This working copy is not the canonical repo.** It is an unzipped download
  of `French-Mobiles-2026-main.zip`, now committed as baseline `f920903`. Two
  commits described as sitting on `claude/whatsapp-phone-validation-error-lh0eet`
  — the customer store and a label printing fix — could not be reconciled
  against it, though the customer-store work does appear present here. Any
  work genuinely unmerged on that branch must be re-applied by hand, and the
  longer the restructure runs, the harder that gets.
