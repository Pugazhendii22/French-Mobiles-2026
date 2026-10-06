# Restructure: Skeleton + Products Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `features/` + `shared/` skeleton with a `@/` path alias and a Vitest harness, then migrate the products feature through it end to end — proving the slice pattern on a feature small enough to review before the 1000-line forms.

**Architecture:** Vertical slice. The skeleton tasks move only already-standalone modules (pure `git mv`) and consolidate the label utilities into `features/labels/`. The products tasks then extract every products Firestore call into `features/products/data.js` with tests, move the three pages into `features/products/`, and split `ProductForm.jsx` (617 lines) into a folder of focused components around a `useProductForm` hook and a pure, tested `buildProductData`.

**Tech Stack:** React 19, Vite 7, Firebase 12 (Firestore), React Router 7, Tailwind 3, Vitest (added by Task 1).

**Spec:** `docs/superpowers/specs/2026-10-01-restructure-design.md`

## Global Constraints

- **Behaviour does not change**, with two named exceptions recorded in Task 4 and Task 6. Every Firestore query shape is copied verbatim — same collection, same `where` clauses, same ordering, same limits. This slice must not change the read count.
- **Node 20.20.2, npm 10.8.2.** React 19.2.5, Vite 7.3.2, Firebase 12.12.1 — do not upgrade any dependency in this plan.
- **`npm run build` must pass after every task.** It passed on baseline `f920903` in 7.9s; it is the one gate that already works.
- **Lint is scoped, not global.** Baseline is 459 problems / 450 errors across the repo, 306 of them `react-hooks/error-boundaries`. Do not attempt to fix repo-wide lint here. The gate is: every file this plan creates or moves ends with **0 eslint errors**, checked with `npx eslint <paths>`. Products' three files start at 10 errors (7 × `no-unused-vars`, 2 × `react-hooks/set-state-in-effect`, 1 × `react-hooks/exhaustive-deps`) and must end at 0.
- **Imports use the `@/` alias** for anything outside the importing file's own folder. Relative imports are allowed only within a feature folder.
- **Interim imports are expected.** Contexts (`src/context/`) do not move in this plan — they belong to the auth and settings slices. Products will import `@/context/AuthContext` until then. That is correct, not debt.
- **Commit after every task.** One task, one commit, app building.
- **No new runtime dependencies.** Vitest is a devDependency.

## Review Focus

Five behaviours the spec implies that no task's happy path exercises. Each has a test assigned to the task owning the code.

1. **A failed collection read must reject, not resolve empty.** If `listProducts()` swallowed a Firestore error and returned `[]`, the list page would show "No products found" to a shop with 300 products. Test in Task 4.
2. **`getProduct` with an unknown id must return `null`, not throw or return a half object.** `ProductView` renders "Product not found" off exactly this. Test in Task 4.
3. **A partial update must still invalidate the products cache.** The label write in `handleSaveAndPrint` updates only two fields; today it does not invalidate, so the next list read can serve a row missing `assignedLabelNumber`. Test in Task 4.
4. **Non-numeric stock must not produce `NaN` status.** `Number('abc') || 0` yields 0, which means "out of stock". Test in Task 6.
5. **Threshold 0 silently becomes 5.** `Number(0) || 5` is 5, so a product with a zero low-stock threshold gets 5. This is existing behaviour and the test pins it, so a later reader sees it is known rather than accidental. Test in Task 6.

---

### Task 1: Path alias and Vitest harness

**Files:**
- Modify: `vite.config.js` (add `resolve.alias` and `test`)
- Create: `jsconfig.json`
- Modify: `package.json` (add `test` scripts, `vitest` devDependency)
- Create: `src/shared/data/__tests__/harness.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: the `@/` alias resolving to `src/`, usable by every later task. `npm test` runs Vitest once; `npm run test:watch` watches.

- [ ] **Step 1: Install Vitest**

```bash
npm i -D vitest
```

- [ ] **Step 2: Add the alias and test config to `vite.config.js`**

Add the `fileURLToPath` import at the top of the file:

```js
import { fileURLToPath } from 'node:url'
```

Then add these two keys to the object passed to `defineConfig`, as siblings of the existing `plugins`, `build` and `server` keys:

```js
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
```

- [ ] **Step 3: Create `jsconfig.json` so the editor resolves `@/`**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "jsx": "react-jsx",
    "checkJs": false
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Add test scripts to `package.json`**

In `"scripts"`, alongside the existing `dev`, `build`, `lint`, `preview`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 5: Write a harness test that proves the alias works**

Create `src/shared/data/__tests__/harness.test.js`. It imports through `@/` so a broken alias fails here rather than in a later task. `ttlFor` is a pure function in the existing `collectionCache`, which has not moved yet.

```js
import { describe, it, expect } from 'vitest'
import { ttlFor } from '@/utils/collectionCache'

describe('test harness', () => {
  it('resolves imports through the @ alias', () => {
    expect(ttlFor('products')).toBe(2 * 60 * 1000)
  })

  it('gives each collection its own window', () => {
    expect(ttlFor('customers')).toBe(30 * 60 * 1000)
  })

  it('falls back to the default TTL for an unlisted collection', () => {
    expect(ttlFor('not_a_collection')).toBe(2 * 60 * 1000)
  })
})
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm test`
Expected: 3 passed. If the alias is wrong, the failure is `Cannot find module '@/utils/collectionCache'`.

- [ ] **Step 7: Confirm the build still passes**

Run: `npm run build`
Expected: `✓ built in` — no resolution errors. Adding `resolve.alias` must not disturb the existing `manualChunks` config.

- [ ] **Step 8: Confirm the new files are lint-clean**

Run: `npx eslint src/shared vite.config.js`
Expected: no output (0 errors). Test files import `describe`/`it`/`expect` explicitly from `vitest`, so no eslint globals config is needed.

- [ ] **Step 9: Commit**

```bash
git add vite.config.js jsconfig.json package.json package-lock.json src/shared
git commit -m "Add @/ path alias and Vitest harness

The restructure moves files between folders constantly. Without an alias
every move rewrites deep relative paths in files that have no other reason
to change, so each later slice would churn imports it does not own.

Vitest arrives now because the first slice's data module is tested.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Move shared modules, delete dead `LabelPrint`

**Files:**
- Move: `src/components/common/Layout.jsx` → `src/shared/ui/Layout.jsx`
- Move: `src/components/common/ui.jsx` → `src/shared/ui/ui.jsx`
- Move: `src/components/common/uiTokens.js` → `src/shared/ui/uiTokens.js`
- Move: `src/components/common/ErrorBoundary.jsx` → `src/shared/ui/ErrorBoundary.jsx`
- Move: `src/components/common/ImageModal.jsx` → `src/shared/ui/ImageModal.jsx`
- Move: `src/components/ConfirmDeleteModal.jsx` → `src/shared/ui/ConfirmDeleteModal.jsx`
- Move: `src/components/PWAInstallPrompt.jsx` → `src/shared/ui/PWAInstallPrompt.jsx`
- Move: `src/components/common/BarcodeScannerModal.jsx` → `src/shared/components/BarcodeScannerModal.jsx`
- Move: `src/components/ImeiInput.jsx` → `src/shared/components/ImeiInput.jsx`
- Move: `src/components/PatternLock.jsx` → `src/shared/components/PatternLock.jsx`
- Move: `src/firebase/firebase.js` → `src/shared/firebase/firebase.js`
- Move: `src/firebase/tacFirebase.js` → `src/shared/firebase/tacFirebase.js`
- Move: `src/utils/firebaseError.js` → `src/shared/firebase/firebaseError.js`
- Move: `src/utils/collectionCache.js` → `src/shared/data/collectionCache.js`
- Move: `src/utils/counters.js` → `src/shared/data/counters.js`
- Move: `src/utils/phone.js` → `src/shared/lib/phone.js`
- Move: `src/utils/imageUrl.js` → `src/shared/lib/imageUrl.js`
- Move: `src/utils/uploadImage.js` → `src/shared/lib/uploadImage.js`
- Delete: `src/components/labels/LabelPrint.jsx`
- Modify: every file importing the above (import paths only)
- Modify: `src/shared/data/__tests__/harness.test.js` (new `collectionCache` path)

**Interfaces:**
- Consumes: the `@/` alias from Task 1.
- Produces: `@/shared/ui/*`, `@/shared/components/*`, `@/shared/firebase/firebase` (exporting `db`, `auth`, `secondaryAuth`), `@/shared/firebase/firebaseError`, `@/shared/data/collectionCache` (exporting `loadCollection`, `invalidateCollection`, `ttlFor`), `@/shared/data/counters` (exporting `nextDailyNumber`, `nextLabelNumber`), `@/shared/lib/phone`, `@/shared/lib/imageUrl`, `@/shared/lib/uploadImage`.

`counters.js` goes to `shared/data/` rather than `features/labels/` because three features need it: labels (`nextLabelNumber`), sales and service (`nextDailyNumber` for invoice and order numbers).

- [ ] **Step 1: Confirm `LabelPrint.jsx` is genuinely unreachable before deleting it**

```bash
grep -rn "LabelPrint" src/ --include=*.jsx --include=*.js
```

Expected: only `src/components/labels/LabelPrint.jsx` itself. If anything else appears, stop and report — do not delete it.

- [ ] **Step 2: Create the shared directories and move the files**

```bash
mkdir -p src/shared/ui src/shared/components src/shared/firebase src/shared/lib
git mv src/components/common/Layout.jsx src/shared/ui/Layout.jsx
git mv src/components/common/ui.jsx src/shared/ui/ui.jsx
git mv src/components/common/uiTokens.js src/shared/ui/uiTokens.js
git mv src/components/common/ErrorBoundary.jsx src/shared/ui/ErrorBoundary.jsx
git mv src/components/common/ImageModal.jsx src/shared/ui/ImageModal.jsx
git mv src/components/ConfirmDeleteModal.jsx src/shared/ui/ConfirmDeleteModal.jsx
git mv src/components/PWAInstallPrompt.jsx src/shared/ui/PWAInstallPrompt.jsx
git mv src/components/common/BarcodeScannerModal.jsx src/shared/components/BarcodeScannerModal.jsx
git mv src/components/ImeiInput.jsx src/shared/components/ImeiInput.jsx
git mv src/components/PatternLock.jsx src/shared/components/PatternLock.jsx
git mv src/firebase/firebase.js src/shared/firebase/firebase.js
git mv src/firebase/tacFirebase.js src/shared/firebase/tacFirebase.js
git mv src/utils/firebaseError.js src/shared/firebase/firebaseError.js
git mv src/utils/collectionCache.js src/shared/data/collectionCache.js
git mv src/utils/counters.js src/shared/data/counters.js
git mv src/utils/phone.js src/shared/lib/phone.js
git mv src/utils/imageUrl.js src/shared/lib/imageUrl.js
git mv src/utils/uploadImage.js src/shared/lib/uploadImage.js
git rm src/components/labels/LabelPrint.jsx
```

- [ ] **Step 3: Rewrite the import paths that pointed at the moved files**

Every import of a moved module becomes its `@/shared/...` path. Work module by module so each `grep` has one answer. For example, for `Layout`:

```bash
grep -rln "components/common/Layout" src/
```

and in each file replace the specifier with `@/shared/ui/Layout`. Repeat for each moved module, using these final specifiers:

| Old specifier (any relative prefix) | New specifier |
|---|---|
| `components/common/Layout` | `@/shared/ui/Layout` |
| `components/common/ui` | `@/shared/ui/ui` |
| `components/common/uiTokens` | `@/shared/ui/uiTokens` |
| `components/common/ErrorBoundary` | `@/shared/ui/ErrorBoundary` |
| `components/common/ImageModal` | `@/shared/ui/ImageModal` |
| `components/ConfirmDeleteModal` | `@/shared/ui/ConfirmDeleteModal` |
| `components/PWAInstallPrompt` | `@/shared/ui/PWAInstallPrompt` |
| `components/common/BarcodeScannerModal` | `@/shared/components/BarcodeScannerModal` |
| `components/ImeiInput` | `@/shared/components/ImeiInput` |
| `components/PatternLock` | `@/shared/components/PatternLock` |
| `firebase/firebase` | `@/shared/firebase/firebase` |
| `firebase/tacFirebase` | `@/shared/firebase/tacFirebase` |
| `utils/firebaseError` | `@/shared/firebase/firebaseError` |
| `utils/collectionCache` | `@/shared/data/collectionCache` |
| `utils/counters` | `@/shared/data/counters` |
| `utils/phone` | `@/shared/lib/phone` |
| `utils/imageUrl` | `@/shared/lib/imageUrl` |
| `utils/uploadImage` | `@/shared/lib/uploadImage` |

Two internal imports inside moved files also need fixing, because their own relative depth changed:

- `src/shared/data/collectionCache.js` line 35: `from '../firebase/firebase'` → `from '@/shared/firebase/firebase'`
- `src/shared/data/counters.js` line 17: `from '../firebase/firebase'` → `from '@/shared/firebase/firebase'`

- [ ] **Step 4: Update the harness test to the new `collectionCache` path**

In `src/shared/data/__tests__/harness.test.js`, change the import:

```js
import { ttlFor } from '@/shared/data/collectionCache'
```

- [ ] **Step 5: Confirm no stale import paths remain**

```bash
grep -rn "firebase/firebase'\|utils/collectionCache\|utils/counters\|utils/phone'\|utils/imageUrl\|utils/uploadImage\|utils/firebaseError\|components/common/\|components/ConfirmDeleteModal\|components/PWAInstallPrompt\|components/ImeiInput\|components/PatternLock" src/ | grep -v "@/shared"
```

Expected: no output. Any line printed is a missed import.

- [ ] **Step 6: Confirm the remaining old directories are empty and remove them**

```bash
ls -A src/components/common src/components/labels src/firebase 2>/dev/null
```

Expected: empty or "No such file". If empty, `rmdir` them. `src/components/` still holds `sales/`, `PrinterSelector.jsx`, `PWAInstallPrompt.jsx`'s former siblings — it is not removed in this task.

- [ ] **Step 7: Run tests and build**

Run: `npm test && npm run build`
Expected: 3 tests passed; `✓ built in`. A broken import shows up here as a Rollup resolution error naming the file.

- [ ] **Step 8: Confirm the moved files are lint-clean**

Run: `npx eslint src/shared`
Expected: no output. If `Layout.jsx` or `ui.jsx` report pre-existing errors, fix only those files' errors — they are in scope now that the files moved.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Move shared modules to src/shared, delete unused LabelPrint

These are the modules the import graph shows four or more features using:
the app shell, the shared modals and UI primitives, the Firebase clients,
the collection cache, the atomic counters, and the small helpers. They move
first so no feature slice has to wait on them.

counters.js lands in shared/data rather than with labels because sales and
service need nextDailyNumber for invoice and order numbers.

components/labels/LabelPrint.jsx is deleted: nothing imported it. Live label
HTML comes from utils/printLabel.jsx.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Consolidate the labels feature

**Files:**
- Create: `src/features/labels/data.js`
- Move: `src/utils/printLabel.jsx` → `src/features/labels/printing/printLabel.jsx`
- Move: `src/utils/qzPrint.js` → `src/features/labels/printing/qzPrint.js`
- Move: `src/utils/mobilePrint.js` → `src/features/labels/printing/mobilePrint.js`
- Move: `src/components/PrinterSelector.jsx` → `src/features/labels/printing/PrinterSelector.jsx`
- Move: `src/utils/tacLookup.js` → `src/features/labels/tacLookup.js`
- Delete: `src/utils/getLabelNumber.js`, `src/utils/lookupLabel.js`, `src/utils/labelSync.js` (contents absorbed into `data.js`)
- Modify: every importer of the above
- Create: `src/features/labels/__tests__/data.test.js`

**Interfaces:**
- Consumes: `@/shared/firebase/firebase` (`db`), `@/shared/data/counters` (`nextLabelNumber`).
- Produces `@/features/labels/data`:
  - `getLabelNumber(): Promise<number>`
  - `findLabel(labelType: string, referenceId: string): Promise<object|null>`
  - `lookupLabel(labelNumber: number|string): Promise<object|null>`
  - `createLabelEntry(labelData: object): Promise<string>` — auto-generated document id
  - `createLabelEntryKeyedByNumber(labelNumber: number, labelData: object): Promise<void>` — label number as the document id
  - `syncLabelSnapshot(labelType: string, referenceId: string, liveData: object): Promise<void>`
  - `withLiveLabelData(labelEntry: object|null, liveData: object): object|null`
  - `secondHandLabelData(mobile: object): object`
  - `serviceOrderLabelData(order: object): object`
- Produces `@/features/labels/printing/printLabel` (`generateLabelHTML`, `withPageRule`), `.../qzPrint` (`getPrinters`, `printLabelQZ`), `.../mobilePrint` (`checkPrintServer`, `printLabelMobile`), `.../PrinterSelector` (default export).

**The two write shapes are deliberate.** `createLabelEntry` and `createLabelEntryKeyedByNumber` exist because the codebase writes `label_registry` both ways today, and unifying them would change behaviour. The spec records this under "Found, flagged, not fixed".

- [ ] **Step 1: Move the printing subsystem and TAC lookup**

```bash
mkdir -p src/features/labels/printing
git mv src/utils/printLabel.jsx src/features/labels/printing/printLabel.jsx
git mv src/utils/qzPrint.js src/features/labels/printing/qzPrint.js
git mv src/utils/mobilePrint.js src/features/labels/printing/mobilePrint.js
git mv src/components/PrinterSelector.jsx src/features/labels/printing/PrinterSelector.jsx
git mv src/utils/tacLookup.js src/features/labels/tacLookup.js
```

- [ ] **Step 2: Fix the moved files' own imports**

- `src/features/labels/printing/qzPrint.js`: `from '../utils/printLabel'` → `from './printLabel'`
- `src/features/labels/printing/mobilePrint.js` line 1: `from './printLabel'` — unchanged, both files moved together
- `src/features/labels/printing/PrinterSelector.jsx` lines 2, 4, 5: `'../utils/qzPrint'` → `'./qzPrint'`, `'../utils/mobilePrint'` → `'./mobilePrint'`, `'../utils/printLabel'` → `'./printLabel'`
- `src/features/labels/tacLookup.js`: its `firebase/tacFirebase` import became `@/shared/firebase/tacFirebase` in Task 2; confirm with `grep -n "import" src/features/labels/tacLookup.js`

Check each moved file for any remaining `../` import that now points outside its folder:

```bash
grep -n "from '\.\./" src/features/labels/printing/*.jsx src/features/labels/printing/*.js src/features/labels/tacLookup.js
```

Expected: no output.

- [ ] **Step 3: Write `src/features/labels/data.js`**

The three deleted utils' logic, verbatim in query shape, plus the two write helpers the pages need. Note `syncLabelSnapshot` keeps its "report and return" error handling — a label refresh must never fail the save the user just made.

```js
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
```

- [ ] **Step 4: Write the failing tests for the pure helpers and the query shapes**

Create `src/features/labels/__tests__/data.test.js`. Firestore is mocked so the query builders record what was asked for, which is how the "query shapes copied verbatim" constraint gets checked.

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/firebase/firebase', () => ({ db: { __db: true } }))
vi.mock('@/shared/data/counters', () => ({ nextLabelNumber: vi.fn(async () => 26042) }))

const snapshotOf = (docs) => ({
  empty: docs.length === 0,
  docs: docs.map(d => ({ id: d.id, data: () => d.data })),
})

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  addDoc: vi.fn(async () => ({ id: 'new-label-id' })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ __collection: name }),
  doc: (_db, name, id) => ({ __doc: `${name}/${id}` }),
  query: (coll, ...constraints) => ({ coll, constraints }),
  where: (field, op, value) => ({ type: 'where', field, op, value }),
  limit: (n) => ({ type: 'limit', n }),
  getDocs: mocks.getDocs,
  addDoc: mocks.addDoc,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
}))

const {
  getLabelNumber, findLabel, lookupLabel, createLabelEntry,
  createLabelEntryKeyedByNumber, withLiveLabelData, secondHandLabelData,
} = await import('@/features/labels/data')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.addDoc.mockResolvedValue({ id: 'new-label-id' })
})

describe('getLabelNumber', () => {
  it('comes from the atomic counter', async () => {
    expect(await getLabelNumber()).toBe(26042)
  })
})

describe('findLabel', () => {
  it('queries label_registry by referenceId and labelType', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([
      { id: 'abc', data: { labelNumber: 26001, labelType: 'product' } },
    ]))

    const found = await findLabel('product', 'prod-1')

    expect(found).toEqual({ id: 'abc', labelNumber: 26001, labelType: 'product' })
    const { coll, constraints } = mocks.getDocs.mock.calls[0][0]
    expect(coll).toEqual({ __collection: 'label_registry' })
    expect(constraints).toEqual([
      { type: 'where', field: 'referenceId', op: '==', value: 'prod-1' },
      { type: 'where', field: 'labelType', op: '==', value: 'product' },
    ])
  })

  it('returns null when the record has no label', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([]))
    expect(await findLabel('product', 'prod-1')).toBeNull()
  })

  it('does not query at all when either argument is missing', async () => {
    expect(await findLabel('product', undefined)).toBeNull()
    expect(await findLabel(undefined, 'prod-1')).toBeNull()
    expect(mocks.getDocs).not.toHaveBeenCalled()
  })
})

describe('lookupLabel', () => {
  it('queries by labelNumber with limit 1', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([
      { id: 'xyz', data: { labelNumber: 26001, referenceId: 'prod-1' } },
    ]))

    const found = await lookupLabel('26001')

    expect(found.referenceId).toBe('prod-1')
    const { constraints } = mocks.getDocs.mock.calls[0][0]
    expect(constraints).toEqual([
      { type: 'where', field: 'labelNumber', op: '==', value: 26001 },
      { type: 'limit', n: 1 },
    ])
  })

  it('returns null for a non-numeric barcode without querying', async () => {
    expect(await lookupLabel('not-a-number')).toBeNull()
    expect(mocks.getDocs).not.toHaveBeenCalled()
  })
})

describe('the two write shapes', () => {
  it('createLabelEntry lets Firestore pick the document id', async () => {
    const id = await createLabelEntry({ labelNumber: 26003 })
    expect(id).toBe('new-label-id')
    expect(mocks.addDoc).toHaveBeenCalledWith(
      { __collection: 'label_registry' },
      { labelNumber: 26003 },
    )
  })

  it('createLabelEntryKeyedByNumber uses the label number as the document id', async () => {
    await createLabelEntryKeyedByNumber(26004, { labelNumber: 26004 })
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { __doc: 'label_registry/26004' },
      { labelNumber: 26004 },
    )
  })
})

describe('withLiveLabelData', () => {
  it('lays the live record over the stored snapshot', () => {
    const entry = { labelNumber: 1, data: { salePrice: 100, brand: 'Nokia' } }
    expect(withLiveLabelData(entry, { salePrice: 250 })).toEqual({
      labelNumber: 1,
      data: { salePrice: 250, brand: 'Nokia' },
    })
  })

  it('passes a missing entry straight through', () => {
    expect(withLiveLabelData(null, { salePrice: 250 })).toBeNull()
  })
})

describe('secondHandLabelData', () => {
  it('maps notes to specialNotes and coerces prices to numbers', () => {
    const data = secondHandLabelData({ notes: 'cracked back', salePrice: '7500' })
    expect(data.specialNotes).toBe('cracked back')
    expect(data.salePrice).toBe(7500)
  })

  it('returns empty strings and zeros for a blank record', () => {
    const data = secondHandLabelData()
    expect(data.brand).toBe('')
    expect(data.purchasePrice).toBe(0)
  })
})
```

- [ ] **Step 5: Run the tests and watch them fail for the right reason**

Run: `npm test`
Expected: the labels suite fails with `Cannot find module '@/features/labels/data'` if Step 3 was skipped, or passes if Step 3 is already done. If a `findLabel` assertion fails on the constraints array, the query shape was not copied verbatim — fix `data.js`, not the test.

- [ ] **Step 6: Point the former utils' importers at the new module, then delete them**

Replace these specifiers across `src/`:

| Old | New |
|---|---|
| `utils/getLabelNumber` → `{ getLabelNumber }` | `@/features/labels/data` |
| `utils/lookupLabel` → `{ lookupLabel }` | `@/features/labels/data` |
| `utils/labelSync` → `{ syncLabelSnapshot, withLiveLabelData, secondHandLabelData, serviceOrderLabelData }` | `@/features/labels/data` |
| `utils/printLabel` → `{ generateLabelHTML }` | `@/features/labels/printing/printLabel` |
| `utils/tacLookup` | `@/features/labels/tacLookup` |
| `components/PrinterSelector` | `@/features/labels/printing/PrinterSelector` |

Some files import `getLabelNumber` as a default export (`import getLabelNumber from ...`). `data.js` exports it as a named export only, so those become `import { getLabelNumber } from '@/features/labels/data'`. Find them with:

```bash
grep -rn "import getLabelNumber\|import lookupLabel" src/
```

Then delete the absorbed files:

```bash
git rm src/utils/getLabelNumber.js src/utils/lookupLabel.js src/utils/labelSync.js
```

- [ ] **Step 7: Confirm nothing still points at the old paths**

```bash
grep -rn "utils/getLabelNumber\|utils/lookupLabel\|utils/labelSync\|utils/printLabel\|utils/qzPrint\|utils/mobilePrint\|utils/tacLookup\|components/PrinterSelector" src/
```

Expected: no output.

- [ ] **Step 8: Run tests, build, and lint**

Run: `npm test && npm run build && npx eslint src/features/labels`
Expected: all labels tests pass; build succeeds; eslint silent. `mobilePrint.js` carried 3 pre-existing errors (`no-unused-vars` ×2, `no-empty`) — fix those three now that the file has moved.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Consolidate label registry and printing into features/labels

label_registry was read and written from a dozen screens, with the same
lookup written out twice in the products feature alone. One module now owns
the collection, and the printing subsystem - label HTML, QZ Tray, the print
server, and the selector that chooses between them - sits beside it.

Two label write shapes are preserved deliberately, as createLabelEntry and
createLabelEntryKeyedByNumber: the save-and-print path keys documents by
label number while the assign paths use an auto id, and both shapes are
already in the database. Tests pin each one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `features/products/data.js`, test first

**Files:**
- Create: `src/features/products/__tests__/data.test.js`
- Create: `src/features/products/data.js`

**Interfaces:**
- Consumes: `@/shared/firebase/firebase` (`db`), `@/shared/data/collectionCache` (`loadCollection`, `invalidateCollection`).
- Produces `@/features/products/data`:
  - `listProducts(): Promise<object[]>` — the whole collection through the cache, unsorted
  - `getProduct(id: string): Promise<object|null>`
  - `createProduct(data: object): Promise<string>` — returns the new id
  - `updateProduct(id: string, data: object): Promise<string>` — returns the id
  - `deleteProduct(id: string): Promise<void>`

`listProducts` deliberately does not sort. `ProductList` sorts by `createdAt` descending after loading, and sorting is a view concern — moving it here would change what other future callers receive.

**Named behaviour change (1 of 2 in this plan).** Every write in this module invalidates the products cache. Today `ProductForm.handleSaveAndPrint` updates `assignedLabelNumber` and `serialNumber` via a bare `updateDoc` with no invalidation, so the next list read can serve a cached row missing those fields. Routing it through `updateProduct` adds the invalidation. This is the spec's rule — "cache invalidation moves inside the write" — and it costs one extra collection read after a save-and-print, in exchange for the list not showing a product as unlabelled after it was labelled.

- [ ] **Step 1: Write the failing tests**

Create `src/features/products/__tests__/data.test.js`. Review Focus items 1, 2 and 3 are the last three `describe` blocks.

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/firebase/firebase', () => ({ db: { __db: true } }))

const mocks = vi.hoisted(() => ({
  loadCollection: vi.fn(),
  invalidateCollection: vi.fn(),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
}))

vi.mock('@/shared/data/collectionCache', () => ({
  loadCollection: mocks.loadCollection,
  invalidateCollection: mocks.invalidateCollection,
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ __collection: name }),
  doc: (_db, name, id) => ({ __doc: `${name}/${id}` }),
  getDoc: mocks.getDoc,
  addDoc: mocks.addDoc,
  updateDoc: mocks.updateDoc,
  deleteDoc: mocks.deleteDoc,
}))

const {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
} = await import('@/features/products/data')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.addDoc.mockResolvedValue({ id: 'new-product-id' })
})

describe('listProducts', () => {
  it('reads the products collection through the cache', async () => {
    mocks.loadCollection.mockResolvedValue([{ id: 'p1', name: 'Charger' }])

    const list = await listProducts()

    expect(mocks.loadCollection).toHaveBeenCalledWith('products')
    expect(list).toEqual([{ id: 'p1', name: 'Charger' }])
  })

  it('does not sort - the list page owns display order', async () => {
    mocks.loadCollection.mockResolvedValue([
      { id: 'a', createdAt: '2026-01-01' },
      { id: 'b', createdAt: '2026-09-01' },
    ])

    const list = await listProducts()

    expect(list.map(p => p.id)).toEqual(['a', 'b'])
  })
})

describe('getProduct', () => {
  it('returns the document with its id folded in', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      id: 'p1',
      data: () => ({ name: 'Charger', stock: 4 }),
    })

    expect(await getProduct('p1')).toEqual({ id: 'p1', name: 'Charger', stock: 4 })
    expect(mocks.getDoc).toHaveBeenCalledWith({ __doc: 'products/p1' })
  })
})

describe('createProduct', () => {
  it('adds the document and returns its new id', async () => {
    const id = await createProduct({ name: 'Cable' })

    expect(mocks.addDoc).toHaveBeenCalledWith({ __collection: 'products' }, { name: 'Cable' })
    expect(id).toBe('new-product-id')
  })

  it('invalidates the cache so the next list read is fresh', async () => {
    await createProduct({ name: 'Cable' })
    expect(mocks.invalidateCollection).toHaveBeenCalledWith('products')
  })
})

describe('updateProduct', () => {
  it('updates the document and returns the id', async () => {
    expect(await updateProduct('p1', { stock: 9 })).toBe('p1')
    expect(mocks.updateDoc).toHaveBeenCalledWith({ __doc: 'products/p1' }, { stock: 9 })
  })
})

describe('deleteProduct', () => {
  it('deletes the document and invalidates the cache', async () => {
    await deleteProduct('p1')
    expect(mocks.deleteDoc).toHaveBeenCalledWith({ __doc: 'products/p1' })
    expect(mocks.invalidateCollection).toHaveBeenCalledWith('products')
  })
})

/* Review Focus 1: a failed read must not look like an empty shop. */
describe('a failing collection read', () => {
  it('rejects instead of resolving to an empty list', async () => {
    mocks.loadCollection.mockRejectedValue(new Error('permission-denied'))
    await expect(listProducts()).rejects.toThrow('permission-denied')
  })
})

/* Review Focus 2: ProductView renders "Product not found" off exactly this. */
describe('getProduct for an unknown id', () => {
  it('returns null rather than throwing or returning a partial object', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false, id: 'gone', data: () => undefined })
    expect(await getProduct('gone')).toBeNull()
  })
})

/* Review Focus 3: the save-and-print label write is a two-field update. */
describe('a partial update', () => {
  it('still invalidates the cache', async () => {
    await updateProduct('p1', { assignedLabelNumber: 26007, serialNumber: 'FM-20261001-4821' })

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { __doc: 'products/p1' },
      { assignedLabelNumber: 26007, serialNumber: 'FM-20261001-4821' },
    )
    expect(mocks.invalidateCollection).toHaveBeenCalledWith('products')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- products`
Expected: FAIL with `Cannot find module '@/features/products/data'`.

- [ ] **Step 3: Write `src/features/products/data.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- products`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the whole suite, build, and lint**

Run: `npm test && npm run build && npx eslint src/features/products`
Expected: all suites pass; build succeeds; eslint silent.

- [ ] **Step 6: Commit**

```bash
git add src/features/products
git commit -m "Add features/products/data.js with tests

One module owns the products collection. Query shapes are copied exactly, so
this does not change what any screen reads.

One behaviour does change, deliberately: every write invalidates the cached
list. The save-and-print path updated a product's label number with a bare
updateDoc and no invalidation, so the list could still show that product as
unlabelled. It costs one collection read after a save-and-print.

Tests cover the reads, the writes, the invalidation, a rejected read (an
error must not look like an empty shop) and an unknown id (the detail page
renders 'Product not found' off exactly that null).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Move the products pages onto the data module

**Files:**
- Move: `src/pages/products/ProductList.jsx` → `src/features/products/ProductList.jsx`
- Move: `src/pages/products/ProductView.jsx` → `src/features/products/ProductView.jsx`
- Move: `src/pages/products/ProductForm.jsx` → `src/features/products/ProductForm.jsx` (split in Task 6)
- Modify: `src/App.jsx` (two lazy import paths)

**Interfaces:**
- Consumes: `@/features/products/data` (Task 4), `@/features/labels/data` and `@/features/labels/printing/*` (Task 3), `@/shared/ui/*` and `@/shared/lib/*` (Task 2).
- Produces: the three pages at their new paths. `ProductForm`'s props are unchanged — `{ onSave, onCancel, initialData }`, where `onSave(data)` resolves to the product id.

Dead code removed in this task, each confirmed unreachable by eslint on the baseline:

| What | Where | Evidence |
|---|---|---|
| `handleAssignLabel` (36 lines) | `ProductForm.jsx:252-287` | `no-unused-vars` — never called |
| `handlePrintLabel` (16 lines) | `ProductForm.jsx:289-304` | `no-unused-vars` — never called |
| `assigning` / `setAssigning` state | `ProductForm.jsx:73` | only read by `handleAssignLabel` |
| `statusColor` | `ProductList.jsx:79` | `no-unused-vars` — never called |
| `userRole` from `useAuth()` | `ProductList.jsx:12` | `no-unused-vars` |
| unused `React` default imports | all three files | `no-unused-vars`; the JSX transform does not need it |

**Not removed, flagged instead:** `ProductList` renders `ConfirmDeleteModal` and defines `handleDelete`, but `setDeleteTarget` is never called with a product, so **there is no way to delete a product from the UI** and `handleDelete` is unreachable. Deleting the modal would remove the intent; wiring a delete button would add a feature. Leave both exactly as they are, keep `deleteProduct` in `data.js` for when it is wired, and report it.

- [ ] **Step 1: Move the three files**

```bash
git mv src/pages/products/ProductList.jsx src/features/products/ProductList.jsx
git mv src/pages/products/ProductView.jsx src/features/products/ProductView.jsx
git mv src/pages/products/ProductForm.jsx src/features/products/ProductForm.jsx
rmdir src/pages/products
```

- [ ] **Step 2: Rewrite `ProductList.jsx`'s imports and data calls**

Replace lines 1-9 with:

```jsx
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '@/shared/ui/Layout';
import ConfirmDeleteModal from '@/shared/ui/ConfirmDeleteModal';
import { useAuth } from '@/context/AuthContext';
import { listProducts, createProduct, updateProduct, deleteProduct } from './data';
import ProductForm from './ProductForm';
```

Replace the `useAuth()` destructure at line 12 with a bare call, since `userRole` is unused:

```jsx
  useAuth();
```

Replace `fetchProducts` (lines 23-33) — same sort, now reading through the module:

```jsx
  const fetchProducts = async () => {
    try {
      const list = await listProducts();
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setProducts(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
```

Replace `handleSaveProduct` (lines 39-51). The dynamic `import('firebase/firestore')` and the two `invalidateCollection` calls are gone — the module owns both:

```jsx
  const handleSaveProduct = async (data) => {
    if (data.id) {
      const { id, ...updateData } = data;
      await updateProduct(id, updateData);
      fetchProducts();
      return id;
    }
    const newId = await createProduct(data);
    fetchProducts();
    return newId;
  };
```

Replace the body of `handleDelete` (lines 56-62) — still unreachable, still preserved:

```jsx
    try {
      await deleteProduct(deleteTarget.id);
      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { console.error(err); }
    finally { setDeleting(false); }
```

Delete the `statusColor` line (line 79) entirely.

- [ ] **Step 3: Rewrite `ProductView.jsx`'s imports and data calls**

Replace lines 1-12 with:

```jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth } from '@/shared/firebase/firebase';
import Layout from '@/shared/ui/Layout';
import ImageModal from '@/shared/ui/ImageModal';
import PrinterSelector from '@/features/labels/printing/PrinterSelector';
import { generateLabelHTML } from '@/features/labels/printing/printLabel';
import { getLabelNumber, findLabel, createLabelEntry } from '@/features/labels/data';
import { imageThumb } from '@/shared/lib/imageUrl';
import { getProduct, updateProduct } from './data';
import ProductForm from './ProductForm';
```

Replace `fetchProduct` (lines 33-38):

```jsx
  const fetchProduct = async () => {
    try {
      const found = await getProduct(id);
      if (found) setProduct(found);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };
```

Replace `fetchLabel` (lines 40-43). This is the same query `ProductForm` was running separately; both now call `findLabel`:

```jsx
  const fetchLabel = async () => {
    const entry = await findLabel('product', id);
    if (entry) setLabelEntry(entry);
  };
```

Replace `handleUpdate` (lines 47-52):

```jsx
  const handleUpdate = async (data) => {
    await updateProduct(id, data);
    setProduct({ id, ...data });
    return id;
  };
```

Replace the write inside `confirmAssign` (line 84) — the `labelData` object above it is unchanged:

```jsx
      await createLabelEntry(labelData);
```

- [ ] **Step 4: Rewrite `ProductForm.jsx`'s imports and data calls, and delete the dead handlers**

Replace lines 1-9 with:

```jsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import PrinterSelector from '@/features/labels/printing/PrinterSelector';
import { generateLabelHTML } from '@/features/labels/printing/printLabel';
import { getLabelNumber, findLabel, createLabelEntryKeyedByNumber } from '@/features/labels/data';
import { updateProduct } from './data';
import { uploadImageToCloudinary } from '@/shared/lib/uploadImage';
import { imageThumb } from '@/shared/lib/imageUrl';
```

Delete the `assigning` state line (line 73).

Replace the label-check effect (lines 80-93):

```jsx
  useEffect(() => {
    if (!localId) return;
    const checkLabel = async () => {
      const entry = await findLabel('product', localId);
      if (entry) {
        setLabelAssigned(true);
        setAssignedLabelNumber(entry.labelNumber);
        setLabelEntry(entry);
      }
    };
    checkLabel();
  }, [localId]);
```

Replace the two Firestore writes inside `handleSaveAndPrint` (lines 226-231):

```jsx
      await createLabelEntryKeyedByNumber(nextLabel, labelData);

      await updateProduct(savedDocId || localId, {
        assignedLabelNumber: nextLabel,
        serialNumber: finalSerialNumber,
      });
```

Delete `handleAssignLabel` entirely (lines 252-287) and `handlePrintLabel` entirely (lines 289-304).

- [ ] **Step 5: Update the route imports in `App.jsx`**

```jsx
const ProductList = lazy(() => import('./features/products/ProductList'));
const ProductView = lazy(() => import('./features/products/ProductView'));
```

- [ ] **Step 6: Confirm no products file touches Firestore directly any more**

```bash
grep -rn "firebase/firestore" src/features/products/
```

Expected: only `src/features/products/data.js`.

- [ ] **Step 7: Confirm nothing still imports the old page paths**

```bash
grep -rn "pages/products" src/
```

Expected: no output.

- [ ] **Step 8: Run tests, build, and lint**

Run: `npm test && npm run build && npx eslint src/features/products src/App.jsx`
Expected: tests pass; build succeeds. eslint must be **silent for the three products files** — the 10 baseline errors are gone, because the unused `React` imports, `userRole`, `statusColor`, `assigning` and the two dead handlers are all removed.

The two `react-hooks/set-state-in-effect` errors were on `fetchProducts()` and `fetchProduct()` inside effects. They survive the move. If eslint still reports them, fix them the smallest way that keeps behaviour: keep the effect, move the `setState` into the promise continuation rather than restructuring the fetch.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Move products onto features/products, drop its dead code

The three products screens now read and write through features/products/data
and features/labels/data instead of calling Firestore themselves. The same
label lookup existed in both ProductView and ProductForm; both call findLabel.

Removed as unreachable, each confirmed by eslint on the baseline:
handleAssignLabel and handlePrintLabel in ProductForm (52 lines, never
called), the assigning state only they used, statusColor and an unused
userRole in ProductList, and three unused React default imports.

Left alone deliberately: ProductList renders a delete confirmation and
defines handleDelete, but nothing ever sets a delete target, so products
cannot be deleted from the UI at all. Wiring that up is a feature decision,
not a restructuring one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Split `ProductForm` into a folder

**Files:**
- Create: `src/features/products/ProductForm/index.jsx`
- Create: `src/features/products/ProductForm/useProductForm.js`
- Create: `src/features/products/ProductForm/buildProductData.js`
- Create: `src/features/products/ProductForm/ProductDetailsSection.jsx`
- Create: `src/features/products/ProductForm/PricingStockSection.jsx`
- Create: `src/features/products/ProductForm/CompatibleModelsSection.jsx`
- Create: `src/features/products/ProductForm/PhotoSection.jsx`
- Create: `src/features/products/ProductForm/FormFooter.jsx`
- Create: `src/features/products/__tests__/buildProductData.test.js`
- Delete: `src/features/products/ProductForm.jsx` (after its contents are distributed)

**Interfaces:**
- Consumes: `@/features/products/data` (`updateProduct`), `@/features/labels/data` (`getLabelNumber`, `findLabel`, `createLabelEntryKeyedByNumber`), `@/features/labels/printing/*`, `@/shared/lib/*`, `@/context/AuthContext`.
- Produces: `ProductForm` as the default export of `./ProductForm/index.jsx`, **props unchanged** — `{ onSave, onCancel, initialData = null }`. `ProductList` and `ProductView` import `./ProductForm` and keep resolving, because Node resolves a folder's `index.jsx` through Vite. Neither caller changes.
- `buildProductData(args): object` — pure, where `args` is `{ formData, modelsInput, localId, currentUserUid, serialNumber }` and `serialNumber` is optional.

**Named behaviour change (2 of 2).** `handleSubmit` and `handleSaveAndPrint` each build the product document with their own copy of the same ~25 lines, including the stock-status calculation duplicated at lines 127 and 177. `buildProductData` is that logic once. Same output for the same input — the only difference is that `handleSaveAndPrint` passes a `serialNumber` and `handleSubmit` does not.

- [ ] **Step 1: Write the failing tests for `buildProductData`**

Create `src/features/products/__tests__/buildProductData.test.js`. Review Focus items 4 and 5 are the last two `describe` blocks. These pin behaviour the current code already has — if a test fails, the extraction changed something.

```js
import { describe, it, expect } from 'vitest'
import { buildProductData } from '@/features/products/ProductForm/buildProductData'

const formData = {
  name: 'Fast Charger',
  brand: 'Nokia',
  category: 'Charger',
  purchasePrice: '120',
  salePrice: '199',
  stock: '10',
  threshold: 5,
  sku: 'SKU-EXISTING',
  notes: '',
  imageUrl: '',
  compatibleModels: [],
}

const build = (overrides = {}) => buildProductData({
  formData: { ...formData, ...(overrides.formData || {}) },
  modelsInput: overrides.modelsInput ?? '',
  localId: overrides.localId ?? null,
  currentUserUid: overrides.currentUserUid ?? 'user-1',
  serialNumber: overrides.serialNumber,
})

describe('stock status', () => {
  it('is "out of stock" at zero', () => {
    expect(build({ formData: { stock: '0' } }).status).toBe('out of stock')
  })

  it('is "low stock" at or below the threshold', () => {
    expect(build({ formData: { stock: '5', threshold: 5 } }).status).toBe('low stock')
    expect(build({ formData: { stock: '3', threshold: 5 } }).status).toBe('low stock')
  })

  it('is "in stock" above the threshold', () => {
    expect(build({ formData: { stock: '6', threshold: 5 } }).status).toBe('in stock')
  })
})

describe('numbers', () => {
  it('coerces prices and stock from the form strings', () => {
    const data = build()
    expect(data.purchasePrice).toBe(120)
    expect(data.salePrice).toBe(199)
    expect(data.stock).toBe(10)
  })
})

describe('sku', () => {
  it('keeps one the user supplied', () => {
    expect(build().sku).toBe('SKU-EXISTING')
  })

  it('generates one when the field is blank', () => {
    const data = build({ formData: { sku: '' } })
    expect(data.sku).toMatch(/^SKU-\d{9}$/)
  })
})

describe('compatible models', () => {
  it('splits the comma-separated input and trims each entry', () => {
    const data = build({ modelsInput: ' Nokia 105 , Nokia 110 ,, ' })
    expect(data.compatibleModels).toEqual(['Nokia 105', 'Nokia 110'])
  })

  it('is an empty array when the input is blank', () => {
    expect(build({ modelsInput: '' }).compatibleModels).toEqual([])
  })
})

describe('create versus update', () => {
  it('stamps createdAt and createdBy on a new product, with no id', () => {
    const data = build({ localId: null })
    expect(data.createdBy).toBe('user-1')
    expect(data.createdAt).toBeTruthy()
    expect(data.id).toBeUndefined()
  })

  it('carries the id and no createdAt on an existing product', () => {
    const data = build({ localId: 'p1' })
    expect(data.id).toBe('p1')
    expect(data.createdAt).toBeUndefined()
    expect(data.createdBy).toBeUndefined()
  })

  it('always stamps updatedAt', () => {
    expect(build().updatedAt).toBeTruthy()
  })
})

describe('serial number', () => {
  it('is included when save-and-print supplies one', () => {
    expect(build({ serialNumber: 'FM-20261001-4821' }).serialNumber).toBe('FM-20261001-4821')
  })

  it('is absent on a plain save', () => {
    expect(build().serialNumber).toBeUndefined()
  })
})

/* Review Focus 4: Number('abc') || 0 is 0, which reads as out of stock. */
describe('non-numeric stock', () => {
  it('becomes zero and therefore "out of stock", never NaN', () => {
    const data = build({ formData: { stock: 'abc' } })
    expect(data.stock).toBe(0)
    expect(data.status).toBe('out of stock')
    expect(Number.isNaN(data.stock)).toBe(false)
  })
})

/* Review Focus 5: existing quirk, pinned so it reads as known. */
describe('a threshold of zero', () => {
  it('becomes 5, because Number(0) || 5 is 5', () => {
    const data = build({ formData: { stock: '3', threshold: 0 } })
    expect(data.threshold).toBe(5)
    expect(data.status).toBe('low stock')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- buildProductData`
Expected: FAIL with `Cannot find module '@/features/products/ProductForm/buildProductData'`.

- [ ] **Step 3: Write `buildProductData.js`**

```js
/* The product document, built from the form. handleSubmit and
   handleSaveAndPrint each had their own copy of this, including the stock
   status rules written out twice, so the two paths could drift apart. */

const generateSku = () =>
  'SKU-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000).toString().padStart(3, '0')

/** Stock status from the quantity on hand and the low-stock threshold. */
export const stockStatus = (stockNum, thresholdNum) => {
  if (stockNum === 0) return 'out of stock'
  if (stockNum <= thresholdNum) return 'low stock'
  return 'in stock'
}

/**
 * The document to save. `serialNumber` is only passed by the save-and-print
 * path; a plain save leaves the field off entirely.
 */
export const buildProductData = ({
  formData, modelsInput, localId, currentUserUid, serialNumber,
}) => {
  const stockNum = Number(formData.stock) || 0
  const thresholdNum = Number(formData.threshold) || 5

  const data = {
    ...formData,
    sku: formData.sku || generateSku(),
    purchasePrice: Number(formData.purchasePrice) || 0,
    salePrice: Number(formData.salePrice) || 0,
    stock: stockNum,
    threshold: thresholdNum,
    status: stockStatus(stockNum, thresholdNum),
    compatibleModels: modelsInput.split(',').map(m => m.trim()).filter(m => m !== ''),
    updatedAt: new Date().toISOString(),
  }

  if (serialNumber) data.serialNumber = serialNumber

  if (!localId) {
    data.createdAt = new Date().toISOString()
    data.createdBy = currentUserUid
  } else {
    data.id = localId
  }

  return data
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- buildProductData`
Expected: PASS, 15 tests.

- [ ] **Step 5: Create the hook with all the form's state and handlers**

Create `src/features/products/ProductForm/useProductForm.js`. Move into it, unchanged except for calling `buildProductData`: the `formData`/`modelsInput`/`error`/`fieldErrors`/`uploading` state, the three refs, `validateAndScroll`, the label state, `saveStatus`, `isProcessing`, the printer state, the label-check effect, `handleUpload`, `handleSubmit`, `handleSaveAndPrint`, and `generateSerialNumber`.

```js
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getLabelNumber, findLabel, createLabelEntryKeyedByNumber } from '@/features/labels/data'
import { generateLabelHTML } from '@/features/labels/printing/printLabel'
import { uploadImageToCloudinary } from '@/shared/lib/uploadImage'
import { updateProduct } from '../data'
import { buildProductData } from './buildProductData'

const generateSerialNumber = () => {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  const random = Math.floor(1000 + Math.random() * 9000)
  return `FM-${dateStr}-${random}`
}

export const useProductForm = ({ onSave, initialData }) => {
  const { currentUser } = useAuth()

  const [formData, setFormData] = useState(initialData || {
    name: '', brand: '', category: 'Charger', purchasePrice: '', salePrice: '',
    stock: '', threshold: 5, sku: '', notes: '', imageUrl: '', compatibleModels: [],
  })
  const [modelsInput, setModelsInput] = useState(
    initialData?.compatibleModels ? initialData.compatibleModels.join(', ') : ''
  )
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [uploading, setUploading] = useState(false)

  const [labelAssigned, setLabelAssigned] = useState(false)
  const [assignedLabelNumber, setAssignedLabelNumber] = useState(null)
  const [labelEntry, setLabelEntry] = useState(null)
  const [localId, setLocalId] = useState(initialData?.id || null)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showPrinterSelector, setShowPrinterSelector] = useState(false)
  const [labelHTMLContent, setLabelHTMLContent] = useState('')

  const nameRef = useRef(null)
  const salePriceRef = useRef(null)
  const stockRef = useRef(null)

  const validateAndScroll = () => {
    const errors = {}
    let firstErrorRef = null

    if (!formData.name) {
      errors.name = 'Product name is required'
      if (!firstErrorRef) firstErrorRef = nameRef
    }
    if (!formData.salePrice) {
      errors.salePrice = 'Sale price is required'
      if (!firstErrorRef) firstErrorRef = salePriceRef
    }
    if (!formData.stock) {
      errors.stock = 'Stock quantity is required'
      if (!firstErrorRef) firstErrorRef = stockRef
    }

    setFieldErrors(errors)

    if (firstErrorRef?.current) {
      firstErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      firstErrorRef.current.focus()
    }

    return Object.keys(errors).length === 0
  }

  useEffect(() => {
    if (!localId) return
    const checkLabel = async () => {
      const entry = await findLabel('product', localId)
      if (entry) {
        setLabelAssigned(true)
        setAssignedLabelNumber(entry.labelNumber)
        setLabelEntry(entry)
      }
    }
    checkLabel()
  }, [localId])

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      setUploading(true)
      const url = await uploadImageToCloudinary(file)
      setFormData(prev => ({ ...prev, imageUrl: url }))
    } catch (err) {
      console.error('Upload error:', err)
      alert('Image upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateAndScroll()) return
    setSaveStatus('saving')
    setError('')

    try {
      const data = buildProductData({
        formData, modelsInput, localId, currentUserUid: currentUser.uid,
      })
      const newId = await onSave(data)
      if (newId) setLocalId(newId)
      setSaveStatus('saved')
    } catch (err) {
      setError(err.message)
      setSaveStatus('idle')
    }
  }

  const handleSaveAndPrint = async () => {
    if (!validateAndScroll()) return
    try {
      setIsProcessing(true)
      setError('')

      const finalSerialNumber = generateSerialNumber()
      const data = buildProductData({
        formData, modelsInput, localId,
        currentUserUid: currentUser.uid,
        serialNumber: finalSerialNumber,
      })

      const savedDocId = await onSave(data)
      if (savedDocId) setLocalId(savedDocId)

      const nextLabel = await getLabelNumber()
      const labelData = {
        labelNumber: nextLabel,
        labelType: 'product',
        referenceId: savedDocId || localId,
        assignedBy: currentUser.uid,
        assignedAt: new Date().toISOString(),
        isActive: true,
        data: {
          productName: data.name,
          brand: data.brand,
          category: data.category,
          sku: data.sku,
          salePrice: data.salePrice,
          purchasePrice: data.purchasePrice,
          stockQuantity: data.stock,
          serialNumber: finalSerialNumber,
          createdBy: currentUser.uid,
          createdAt: new Date().toISOString(),
        },
      }

      await createLabelEntryKeyedByNumber(nextLabel, labelData)

      await updateProduct(savedDocId || localId, {
        assignedLabelNumber: nextLabel,
        serialNumber: finalSerialNumber,
      })

      setLabelHTMLContent(generateLabelHTML(labelData))
      setLabelEntry(labelData)
      setShowPrinterSelector(true)

      setSaveStatus(`Saved & Label #${nextLabel} Assigned ✓`)
      setLabelAssigned(true)
      setAssignedLabelNumber(nextLabel)
    } catch (err) {
      console.error('Save & Print error:', err)
      alert('Error during Save & Print. Please try again.')
      setSaveStatus('idle')
    } finally {
      setIsProcessing(false)
    }
  }

  return {
    formData, setFormData, modelsInput, setModelsInput,
    error, fieldErrors, uploading,
    labelAssigned, assignedLabelNumber, labelEntry,
    saveStatus, isProcessing,
    showPrinterSelector, setShowPrinterSelector, labelHTMLContent,
    nameRef, salePriceRef, stockRef,
    handleUpload, handleSubmit, handleSaveAndPrint,
  }
}
```

- [ ] **Step 6: Extract each JSX section into its own component**

The sections are the ones `ProductForm.jsx` already marks with comments. Move each block's JSX verbatim into the matching file, changing only the identifiers it reads to the props below. Line numbers are from `ProductForm.jsx` as it stands after Task 5's deletions — locate each block by its comment marker, not by number.

| New file | Source block | Props |
|---|---|---|
| `ProductDetailsSection.jsx` | `{/* PRODUCT DETAILS */}` | `{ formData, setFormData, fieldErrors, nameRef }` |
| `PricingStockSection.jsx` | `{/* PRICING & STOCK */}` | `{ formData, setFormData, fieldErrors, salePriceRef, stockRef }` |
| `CompatibleModelsSection.jsx` | `{/* COMPATIBLE MODELS */}` | `{ modelsInput, setModelsInput }` |
| `PhotoSection.jsx` | `{/* PHOTO */}` | `{ formData, setFormData, uploading, handleUpload }` |
| `FormFooter.jsx` | `{/* Fixed Footer */}` | `{ saveStatus, labelAssigned, uploading, isProcessing, initialData, onCancel, handleSubmit, handleSaveAndPrint }` |

Each file follows this shape — `PhotoSection.jsx` shown in full as the pattern, since it is the one that also needs `imageThumb`:

```jsx
import { imageThumb } from '@/shared/lib/imageUrl'

const PhotoSection = ({ formData, setFormData, uploading, handleUpload }) => (
  <>
    {/* the JSX from the {/* PHOTO *‍/} block, verbatim */}
  </>
)

export default PhotoSection
```

- [ ] **Step 7: Write `index.jsx` to compose them**

Keep the modal shell, the handle bar, the header and the form wrapper — the markup outside the five sections — exactly as it is in `ProductForm.jsx`, with the section blocks replaced by the components.

```jsx
import PrinterSelector from '@/features/labels/printing/PrinterSelector'
import { useProductForm } from './useProductForm'
import ProductDetailsSection from './ProductDetailsSection'
import PricingStockSection from './PricingStockSection'
import CompatibleModelsSection from './CompatibleModelsSection'
import PhotoSection from './PhotoSection'
import FormFooter from './FormFooter'

const ProductForm = ({ onSave, onCancel, initialData = null }) => {
  const form = useProductForm({ onSave, initialData })

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
      <div className="bg-white w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90vh]">

        {/* Handle bar for mobile */}
        <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100 bg-white rounded-t-3xl md:rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0f172a]">
              {initialData ? 'Edit Product' : 'Add Product'}
            </h2>
            <button onClick={onCancel} className="text-gray-400 p-1">
              <i className="fas fa-times text-lg"></i>
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <form id="product-form" onSubmit={form.handleSubmit} className="space-y-5 pb-4">
            {form.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                {form.error}
              </div>
            )}

            <ProductDetailsSection
              formData={form.formData}
              setFormData={form.setFormData}
              fieldErrors={form.fieldErrors}
              nameRef={form.nameRef}
            />
            <PricingStockSection
              formData={form.formData}
              setFormData={form.setFormData}
              fieldErrors={form.fieldErrors}
              salePriceRef={form.salePriceRef}
              stockRef={form.stockRef}
            />
            <CompatibleModelsSection
              modelsInput={form.modelsInput}
              setModelsInput={form.setModelsInput}
            />
            <PhotoSection
              formData={form.formData}
              setFormData={form.setFormData}
              uploading={form.uploading}
              handleUpload={form.handleUpload}
            />
          </form>
        </div>

        <FormFooter
          saveStatus={form.saveStatus}
          labelAssigned={form.labelAssigned}
          uploading={form.uploading}
          isProcessing={form.isProcessing}
          initialData={initialData}
          onCancel={onCancel}
          handleSubmit={form.handleSubmit}
          handleSaveAndPrint={form.handleSaveAndPrint}
        />

        <PrinterSelector
          isOpen={form.showPrinterSelector}
          onClose={() => form.setShowPrinterSelector(false)}
          htmlContent={form.labelHTMLContent}
          labelEntry={form.labelEntry}
          title="Print Label"
        />
      </div>
    </div>
  )
}

export default ProductForm
```

- [ ] **Step 8: Delete the old file and confirm every piece of it landed somewhere**

```bash
git rm src/features/products/ProductForm.jsx
grep -rn "error\b" src/features/products/ProductForm/index.jsx
```

The `error` state is returned by the hook and rendered in the original markup — make sure the error banner survived into `index.jsx`. If it was inside a section block, it belongs with that section instead.

- [ ] **Step 9: Confirm no file in the feature exceeds 300 lines**

```bash
wc -l src/features/products/*.jsx src/features/products/*.js src/features/products/ProductForm/*
```

Expected: every file under 300. `useProductForm.js` is the largest at roughly 200.

- [ ] **Step 10: Run tests, build, and lint**

Run: `npm test && npm run build && npx eslint src/features/products`
Expected: all tests pass; build succeeds; eslint silent. `react-refresh/only-export-components` fires if a component file also exports a non-component — if it does, move that export to `buildProductData.js` or the hook.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Split ProductForm into a folder of focused pieces

617 lines becomes a hook holding the state and the two save paths, a pure
buildProductData, and one component per section the file already marked with
a comment. Nothing in the feature is over 300 lines now.

handleSubmit and handleSaveAndPrint each carried their own copy of the
document-building logic, with the stock status rules written out twice, so
the two paths could drift. buildProductData is that logic once, and its
tests pin the rules - including two existing quirks worth knowing about:
non-numeric stock becomes zero and reads as out of stock, and a threshold
of zero becomes 5.

ProductForm's props are unchanged, so ProductList and ProductView import
./ProductForm exactly as before.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Verify the slice end to end

**Files:** none changed unless a check fails.

**Interfaces:** none. This task produces a verification record, and either a green light for slice 2 or a list of defects.

- [ ] **Step 1: Full automated check from a clean state**

```bash
rm -rf dist && npm test && npm run build && npx eslint src/features src/shared
```

Expected: all suites pass; `✓ built in`; eslint silent across both trees.

- [ ] **Step 2: Confirm the structural claims the spec makes**

```bash
echo "--- products files touching Firestore (expect only data.js) ---"
grep -rln "firebase/firestore" src/features/products/
echo "--- stale import paths anywhere (expect none) ---"
grep -rn "utils/collectionCache\|utils/counters\|utils/labelSync\|utils/printLabel\|pages/products\|components/common/\|firebase/firebase'" src/ | grep -v "@/shared\|@/features"
echo "--- repo lint total, for comparison with the 459 baseline ---"
npm run lint 2>&1 | tail -1
```

Expected: only `data.js`; no stale paths; the repo total **below** 459, since products and the moved shared files are now clean.

- [ ] **Step 3: Start the dev server and smoke-test products by hand**

```bash
npm run dev
```

Work through this list. Each line is a behaviour the automated checks cannot see:

- [ ] `/products` lists products, newest first, with the count badge matching
- [ ] Search by name, by brand, and by a compatible model each filter correctly
- [ ] The category and status dropdowns filter, and combine with search
- [ ] "Add Product" opens the form; saving with the name blank scrolls to and focuses the name field
- [ ] Saving a new product returns to a list that includes it
- [ ] Opening a product shows its details, and "Edit" pre-fills the form
- [ ] Editing a price saves, and the detail page shows the new value
- [ ] "Assign Label" on the detail page offers the next number and saves it
- [ ] "Save & Print" on the form assigns a label, opens the printer selector, and the preview shows the right product and price
- [ ] A labelled product's detail page shows "Print #N" instead of "Assign Label"
- [ ] Uploading a photo works, and the thumbnail appears
- [ ] "Sell" from the list and "Sell Product" from the detail page both land on `/sales` with the item pre-filled

- [ ] **Step 4: Record the result**

If everything passes, append to the spec's "Found, flagged, not fixed" section that the products slice is complete, and note the two named behaviour changes shipped. If anything fails, stop: do not start slice 2 on top of a broken slice 1. Fix forward, or `git revert` the offending task's commit.

- [ ] **Step 5: Commit the verification note**

```bash
git add docs/
git commit -m "Record products slice verification

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## What this plan does not cover

The remaining slices from the spec — customers, enquiries, the labels pages, inventory, sales, service, the small admin features, the read-heavy consumers, and the app shell — each get their own plan, written against files actually read. Writing them now would mean inventing code for `SecondHandForm.jsx` (1377 lines) and `ServiceOrderView.jsx` (1216 lines) sight unseen, which is how plans end up full of "handle the remaining cases".

Carried forward, unresolved:

- **Products cannot be deleted from the UI.** `handleDelete` and its confirmation modal exist but nothing opens them. A feature decision, not a restructuring one.
- **Editing a product leaves its label snapshot stale.** `syncLabelSnapshot` exists and inventory, service and scan all call it after saving; products never did. Wiring it in would change behaviour — a reprinted product label would start showing the corrected price — so it is a decision, not a move.
- **Two `label_registry` write shapes** remain live, now named in `features/labels/data.js`.
- **Repo-wide lint is failing** on 450 errors, 306 of them one rule. The slices clean up only what they touch.
- **All 11 `no-undef` errors** are `process` in `scripts/`; the eslint config declares browser globals only. A three-line config fix nobody has made.
