# Remembering dropdowns, and a sectioned settings page — design

Date: 2026-10-05
Status: approved, ready for an implementation plan

## Why

Two complaints, one of which turns out to be about something else.

**The dropdowns are unusable once a list grows.** Every option list renders as a
plain `<select>`. With fourteen brands that is tolerable; with a hundred models
it is a scroll. There is no way to search it.

**A value that is not in the list is lost.** `SecondHandForm` and
`ServiceOrderForm` do offer an escape: pick "Other" and a free-text box appears.
But what you type is saved **onto that one record** as `customBrand`. It never
joins the shared list, so the next person to take in the same phone types it
again, and the dropdown never learns. The shop's own vocabulary cannot grow
except through the settings page.

**The settings page shows everything at once.** One 711-line screen listing
every brand, model, accessory, RAM size, ROM size, complaint type and checklist
item. On a phone at a counter that is a long scroll to change a shop phone
number.

Success: you can type into any option field, see matching values as you type,
and have a genuinely new value become part of the list for everyone — while
Settings remains the place to fix a mistake.

## A premise this spec corrects

The settings page was to be sectioned **to reduce Firestore reads**. It will not,
because it does not read anything.

`SettingsPage.jsx` imports nothing from `firebase/firestore`. It renders entirely
from `SettingsContext`, which loads all nine settings documents **once per app
load** and caches them in `localStorage` under `fm_settings_cache_v3` with a TTL.
Opening the settings page costs zero reads. Opening one section would also cost
zero. The only read is the manual refresh button, which deliberately re-reads.

Sectioning is still worth doing — a 711-line page that dumps every list at once
is hard to use and hard to change — but as a usability and maintainability
change, not a cost one.

**Where the reads actually are**, measured 2026-10-01 and unchanged:
`ServiceOrderList` reads every service order with no filter and no cache, and
re-reads after every status change; `DuePaymentsPage` reads every sale.
Those are separate work, already recorded.

## Scope

In scope:

- A shared `ComboBox` component: searchable, free-typing, backed by a list.
- Writing genuinely new values back to the shared list, on save.
- Three fields that are plain text or hardcoded today become remembering
  fields: `supplier`, `colour`, product `category`.
- `ProductList`'s category **filter** reads the same settings list instead of its
  hardcoded copy, so filter options can never drift from what products actually
  carry. It stays a plain `<select>` — a filter is not data entry, and "add new"
  has no meaning there.
- The settings page becomes a list of sections, each at its own route.

Not in scope:

- **Workflow fields stay closed lists.** `status`, `lockType`, condition grade.
  See the constraint below.
- `CustomerAutocomplete` is untouched. It sources customers from
  `customerStore`, renders three specific fields, and is not an option picker.
- The unbounded reads named above.
- Migrating existing `customBrand` values onto the brands list.

## A hard constraint: workflow fields are not extensible

`status` drives real logic — `ServiceOrderList`'s `STATUSES`, `Dashboard`'s
`OPEN_STATUSES`, the due-payments filter, the reports. If a typed "Recieved"
became a real option, those orders would drop out of every filter and report
with nothing on screen to say so. Status-shaped fields keep plain `<select>`
elements over fixed lists. This is a correctness boundary, not a preference.

## Current state, measured

| Document | Shape | Edited in Settings |
|---|---|---|
| `settings/brands` | `{ items: [...] }` | yes |
| `settings/accessories` | `{ items: [...] }` | yes |
| `settings/ram_options` | `{ items: [...] }` | yes |
| `settings/rom_options` | `{ items: [...] }` | yes |
| `settings/complaint_types` | `{ items: [...] }` | yes |
| `settings/pre_delivery_checklist` | `{ items: [...] }` | yes |
| `settings/models` | `{ Samsung: [...], Apple: [...] }` | yes, per brand |
| `settings/device_checklist` | `{ common, iphone, android }` | yes |
| `settings/shop_details` | object of fields | yes |

- `updateSetting(key, items)` rewrites the whole document with `setDoc`.
- 38 `<select>` elements across 15 files. Many are filters
  (`ProductList` category/status, `EnquiryList`, `RatingsList`) where a fixed
  list is correct and "add new" is meaningless.
- `supplier` is a plain text input at `SecondHandForm.jsx:952`.
- `colour` is a plain text input at `ServiceOrderForm.jsx:706`.
- Product `category` options are **hardcoded in the JSX of two files** —
  `features/products/ProductList.jsx` and
  `features/products/ProductForm/ProductDetailsSection.jsx`. They are not in
  settings at all, cannot be edited by the shop, and the two copies can drift.

## Design

### Where options live

Existing documents stay exactly as they are. Nothing migrates.

Three new lists go in **one** new document, shaped like `models`:

```
settings/field_options = { supplier: [...], colour: [...], product_category: [...] }
```

One document rather than three keeps this at **+1 read per app load, not +3**,
and any future field costs nothing further. Settings goes from nine documents to
ten per load, still cached.

Forms pay nothing: they already read options from `SettingsContext`.

### How a new value is written

`arrayUnion`, not a whole-document rewrite:

```js
updateDoc(doc(db, 'settings', 'brands'),      { items: arrayUnion(brand) })
updateDoc(doc(db, 'settings', 'models'),      { [brand]: arrayUnion(model) })
updateDoc(doc(db, 'settings', 'field_options'), { supplier: arrayUnion(name) })
```

This is atomic. Two staff adding a brand in the same minute both succeed —
with today's `setDoc` one would silently overwrite the other, the same race
`counters.js` exists to prevent for label numbers. It also writes less data.

`arrayUnion` creates a missing field, so a model under a brand-new brand needs
no special case.

### Normalisation

Before comparing or storing: trim, collapse internal whitespace, and compare
case-insensitively against what is already there. "samsung", "Samsung " and
"SAMSUNG" all resolve to the existing "Samsung" rather than adding three
entries. A value with no match is stored **as typed**.

### Writing happens on save, not on blur

`rememberOptions` is called from the form's save path, beside the record write:

```js
await rememberOptions({ brands: data.brand, models: { [data.brand]: data.model } })
```

On blur or on keystroke, opening a form, typing "Sumsng" and abandoning it would
pollute the list forever. On save, **only records actually committed contribute
options** — which is also what "saved with the record" means.

It diffs against the known lists first, so a normal save with an existing brand
and model performs **zero writes**.

**A failed option write must never fail the save.** If it throws — rules,
offline — it logs and returns, exactly as `syncLabelSnapshot` already does for
labels. Nobody selling a phone should be blocked because a brand name could not
be filed.

After a successful write, the in-memory settings and the `localStorage` cache
update immediately, so the value appears without a reload.

### The ComboBox

Purely presentational. Takes an array of strings, reports a string. No Firestore,
no settings knowledge — so it is testable alone and reusable for any field.

```jsx
<ComboBox
  value={formData.brand}
  onChange={v => setFormData(p => ({ ...p, brand: v, model: '' }))}
  options={brandOptions}
  placeholder="Select or type a brand"
  required
  error={fieldErrors.brand}
  inputRef={brandRef}
/>
```

Behaviour:

- **Focus shows the whole list.** This is the "keep the dropdown" half of the
  request. `CustomerAutocomplete` requires two characters before showing
  anything; for a field replacing a `<select>` that is wrong.
- Typing filters, case- and whitespace-insensitive, matching the existing
  customer search.
- The typed value is the value; no selection required.
- When nothing matches, a quiet line reads *"New — will be added to the list"*.
  Not an extra tap, just feedback so a typo is not invisible.
- Click outside closes. Escape closes. Enter takes the first match if there is
  one, otherwise keeps what was typed.
- Long lists scroll, capped at 50 rendered rows.

Lifted from `CustomerAutocomplete`: click-outside handling, the
whitespace-insensitive filter, the absolute-positioned list. Not lifted: the
two-character gate, and the markup duplicated twice inside it.

### What this removes

`SecondHandForm`'s `customBrand`, `isCustomModel`, `setCustomModel` state and
their conditional free-text inputs, and the equivalent in `ServiceOrderForm`.
Typing *is* the escape hatch now. Records that already hold a `customBrand` keep
rendering it as their brand value; nothing new writes that field.

### The settings page

`/admin/settings` becomes a list of sections. Each row opens a full-screen
editor at its own route with a back arrow, matching Products → product detail.

| Route | Section |
|---|---|
| `/admin/settings` | the list itself |
| `/admin/settings/shop` | Shop Details |
| `/admin/settings/brands` | Mobile Brands |
| `/admin/settings/models` | Models — pick a brand, then edit its models |
| `/admin/settings/accessories` | Accessories |
| `/admin/settings/ram` | RAM Options |
| `/admin/settings/rom` | ROM / Storage Options |
| `/admin/settings/complaints` | Complaint Types |
| `/admin/settings/pre-delivery` | Pre-Delivery Checklist |
| `/admin/settings/device-checklist` | Device Checklist (common / iPhone / Android) |
| `/admin/settings/field-options` | Supplier, Colour, Product Category |

Each section is its own file of roughly 60–150 lines instead of one 711-line
page. Because they are routed, a deep link opens the section directly.

**Models stays two-level**: a brand picker, then that brand's list — the shape
`selectedModelBrand` already gives it today.

The new **Field Options** section is where a typo created by a form gets fixed.

## Verification

Vitest, as established by the products slice.

- `ComboBox` is presentational and pure: filtering, the no-match state, Enter
  behaviour, and that it reports exactly what was typed. These need a DOM, so
  this is the first `.test.jsx` — the Vitest `include` glob already accepts it,
  and `jsdom` gets added here.
- `rememberOptions` is testable against a mocked Firestore: that an existing
  value writes nothing, a new value writes `arrayUnion` to the right document
  and field, normalisation collapses case and whitespace variants, a new
  brand-and-model pair writes both, and a thrown error is swallowed rather than
  propagated.
- Normalisation is a pure function with its own tests.
- The settings sections and the form wiring are covered by build, lint and a
  click-through checklist, as in the products slice.

Every file created or moved ends at 0 eslint errors. Repo-wide lint remains
failing from before and is not this work's problem.

## Relationship to the restructure

`SettingsPage.jsx` and `SettingsContext.jsx` are slice 9 of
`2026-10-01-restructure-design.md`. Sectioning the page **is** most of that
slice's work, so the two are done together: the settings feature moves to
`features/settings/` and is split into sections in one pass, rather than being
moved and then immediately reshaped.

Only **two** forms are entangled with unfinished slices:

| File | Fields in scope | Restructure slice |
|---|---|---|
| `features/products/ProductForm/ProductDetailsSection.jsx` | category | **done** — products shipped |
| `features/products/ProductList.jsx` | category *filter* | **done** |
| `pages/inventory/SecondHandForm.jsx` | brand, model, ram, rom, supplier | slice 5, not started |
| `pages/service/ServiceOrderForm.jsx` | brand, model, complaint types, accessories, colour | slice 7, not started |

`EnquiryForm`, `SalesForm` and `CustomerForm` are **not** affected: their
selects are all closed sets — `status`, `seriousness`, `requiredWithin`,
`medium`, `paymentMethod`, `discountCategory`, `idType`, `relationship` — and
`SalesForm`'s remaining one picks an actual product record, not an option.

So the ordering question applies to two files, not five. The plan must choose:

1. Do this feature now, on `SecondHandForm` and `ServiceOrderForm` where they
   stand, and let slices 5 and 7 move the result.
2. Do slices 5 and 7 first, then add the ComboBox to the restructured forms.

Option 2 touches those two files once instead of twice, but delays the feature
behind the two largest slices in the restructure. Option 1 delivers sooner at
the cost of a second pass over the two biggest files in the app.

## Risks

- **Typos become shared options.** Chosen deliberately: silent adding, fewest
  taps, with Settings as the cleanup. Normalisation removes the case and
  whitespace variants; it cannot catch "Sumsung". The Field Options and Brands
  sections exist precisely for this.
- **The two largest files in the app change.** `SecondHandForm` is 1377 lines
  and `ServiceOrderForm` 1128, and removing the custom-value branches touches
  their most tangled parts. This is the strongest argument for ordering
  option 2.
- **`settings/field_options` will not exist** in a shop already running.
  `SettingsContext` already seeds missing documents from `DEFAULT_SETTINGS` on
  load, so the new key must be added there and will be created on first run.
- **Option lists grow without bound.** `supplier` in particular. Nothing prunes
  them, and the ComboBox renders at most 50 rows. If a list reaches hundreds,
  the section that edits it needs its own search — out of scope here, worth
  watching.
