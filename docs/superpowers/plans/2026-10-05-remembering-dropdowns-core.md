# Remembering Dropdowns — Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A searchable, free-typing `ComboBox` whose genuinely new values are written back to the shared option lists on save, wired up on the one feature that is already restructured — product category.

**Architecture:** A purely presentational `ComboBox` in `shared/ui` takes an array of strings and reports a string. Pure helpers in `features/settings/options.js` decide what is new and what to write; `SettingsContext` gains a `rememberOptions` method that performs the `arrayUnion` writes and updates its own cache. Forms call it from their save path, never on blur.

**Tech Stack:** React 19, Vite 7, Firebase 12 (Firestore `arrayUnion`), Vitest 4, jsdom + @testing-library/react (added by Task 1).

**Spec:** `docs/superpowers/specs/2026-10-05-remembering-dropdowns-design.md`

## Global Constraints

- **Workflow fields are never extensible.** `status`, `lockType`, condition grade keep plain `<select>` elements over fixed lists. A typed status would drop records out of `ServiceOrderList`'s `STATUSES` filter, `Dashboard`'s `OPEN_STATUSES` and the reports, silently.
- **Writes happen on save, never on blur or keystroke.** Only committed records contribute options.
- **A failed option write must never fail the record save.** Log and return, as `syncLabelSnapshot` already does.
- **`arrayUnion` only** — never `setDoc` on a list document. `setDoc` loses a concurrent addition.
- **Option values are stored as typed**, after trimming and collapsing internal whitespace. Matching against existing values is case-insensitive.
- Node 20.20.2, React 19.2.5, Vite 7.3.2, Firebase 12.12.1, Vitest 4.1.11. Do not upgrade any existing dependency.
- `npm run build` must pass after every task.
- Every file this plan creates or modifies ends at **0 eslint errors** (`npx eslint <paths>`). Repo-wide lint fails from before at 427 errors; that is not this plan's problem.
- Imports use the `@/` alias for anything outside the importing file's own folder.
- Commit after every task.

## Review Focus

Five failure modes the spec implies that no happy path exercises. Each has a test in the task that owns the code.

1. **A value differing only by case or spacing must not create a duplicate.** Typing "samsung" when "Samsung" exists must reuse the existing entry, or the list fills with variants of the same brand. Task 3.
2. **An empty or whitespace-only value must never become an option.** Clearing a field and saving must not append `""` to the list, which would render as a blank row nobody can identify in Settings. Task 3.
3. **A failed option write must not fail the save.** Rules or offline must not block someone taking in a phone. Task 5.
4. **A model typed under a brand that does not exist yet must create both.** Otherwise the model is orphaned under a key no dropdown reads. Task 5.
5. **`ComboBox` must report exactly what was typed when nothing matches.** Never snap to the nearest option — a silent correction from "Redmi 13C" to "Redmi 13" puts the wrong model on an invoice. Task 2.

---

### Task 1: Component test harness

**Files:**
- Modify: `package.json` (add `jsdom`, `@testing-library/react`, `@testing-library/user-event`)
- Create: `src/shared/ui/__tests__/harness.test.jsx`

**Interfaces:**
- Consumes: the `@/` alias and Vitest config from the restructure (`vite.config.js` already has `include: ['src/**/*.test.{js,jsx}']`).
- Produces: the ability to render a React component in a test. Later tasks use `render`, `screen`, `fireEvent` from `@testing-library/react` and open their file with the docblock `/** @vitest-environment jsdom */`.

The default Vitest environment stays `node`, which is faster and correct for the data tests that already exist. Only files that need a DOM opt in, per file, with a docblock.

- [ ] **Step 1: Install the DOM test dependencies**

```bash
npm i -D jsdom @testing-library/react @testing-library/user-event
```

- [ ] **Step 2: Write a test that proves a component can render**

Create `src/shared/ui/__tests__/harness.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

const Hello = ({ name }) => <p>Hello {name}</p>

describe('component test harness', () => {
  it('renders a component into a DOM', () => {
    render(<Hello name="counter" />)
    expect(screen.getByText('Hello counter')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run it and confirm it passes**

Run: `npm test -- harness`
Expected: PASS, 1 test. If the environment docblock is not honoured the failure is `document is not defined`.

- [ ] **Step 4: Confirm the existing node-environment suites still pass**

Run: `npm test`
Expected: all suites pass. The products and labels data tests must still run under `node` — if they now fail with DOM-related errors, the environment was changed globally instead of per file.

- [ ] **Step 5: Confirm build and lint**

Run: `npm run build && npx eslint src/shared/ui/__tests__`
Expected: `✓ built in`; eslint silent.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/shared/ui/__tests__
git commit -m "Add a DOM test environment for component tests

The option fields need tests that actually render. jsdom is opted into per
file with a docblock rather than switched on globally, so the data-module
suites keep running under node.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The ComboBox

**Files:**
- Create: `src/shared/ui/ComboBox.jsx`
- Create: `src/shared/ui/__tests__/ComboBox.test.jsx`

**Interfaces:**
- Consumes: the harness from Task 1.
- Produces `@/shared/ui/ComboBox`, default export:

```
ComboBox({
  value: string,
  onChange: (value: string) => void,
  options: string[],
  placeholder?: string,
  required?: boolean,
  error?: string,
  inputRef?: React.Ref,
  className?: string,
  id?: string,
})
```

No Firestore, no settings knowledge. It reports whatever is in the input.

- [ ] **Step 1: Write the failing tests**

Create `src/shared/ui/__tests__/ComboBox.test.jsx`. Review Focus 5 is the last block.

```jsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ComboBox from '@/shared/ui/ComboBox'

const BRANDS = ['Samsung', 'Apple', 'Xiaomi', 'Realme', 'OnePlus']

const setup = (props = {}) => {
  const onChange = vi.fn()
  const utils = render(
    <ComboBox value="" onChange={onChange} options={BRANDS} placeholder="Select or type a brand" {...props} />
  )
  return { onChange, input: screen.getByPlaceholderText('Select or type a brand'), ...utils }
}

describe('opening the list', () => {
  it('shows every option on focus, so it still behaves like a dropdown', () => {
    const { input } = setup()
    fireEvent.focus(input)
    BRANDS.forEach(b => expect(screen.getByText(b)).toBeTruthy())
  })

  it('shows nothing until it is focused', () => {
    setup()
    expect(screen.queryByText('Samsung')).toBeNull()
  })
})

describe('filtering', () => {
  it('narrows the list as you type', () => {
    const { input } = setup({ value: 'sam' })
    fireEvent.focus(input)
    expect(screen.getByText('Samsung')).toBeTruthy()
    expect(screen.queryByText('Apple')).toBeNull()
  })

  it('ignores case', () => {
    const { input } = setup({ value: 'SAMS' })
    fireEvent.focus(input)
    expect(screen.getByText('Samsung')).toBeTruthy()
  })

  it('ignores spaces, matching the customer search', () => {
    const { input } = setup({ value: 'one plus', options: ['OnePlus', 'Apple'] })
    fireEvent.focus(input)
    expect(screen.getByText('OnePlus')).toBeTruthy()
  })
})

describe('choosing a value', () => {
  it('reports the option that was clicked', () => {
    const { input, onChange } = setup()
    fireEvent.focus(input)
    fireEvent.click(screen.getByText('Xiaomi'))
    expect(onChange).toHaveBeenCalledWith('Xiaomi')
  })

  it('closes the list after a choice', () => {
    const { input } = setup()
    fireEvent.focus(input)
    fireEvent.click(screen.getByText('Xiaomi'))
    expect(screen.queryByText('Realme')).toBeNull()
  })

  it('reports every keystroke', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: 'Nokia' } })
    expect(onChange).toHaveBeenCalledWith('Nokia')
  })
})

describe('a value that is not in the list', () => {
  it('says it will be added, so a typo is not invisible', () => {
    const { input } = setup({ value: 'Sumsung' })
    fireEvent.focus(input)
    expect(screen.getByText(/will be added to the list/i)).toBeTruthy()
  })

  it('does not show that hint when the typed value already exists', () => {
    const { input } = setup({ value: 'Samsung' })
    fireEvent.focus(input)
    expect(screen.queryByText(/will be added to the list/i)).toBeNull()
  })

  it('does not show that hint for an empty field', () => {
    const { input } = setup({ value: '' })
    fireEvent.focus(input)
    expect(screen.queryByText(/will be added to the list/i)).toBeNull()
  })
})

describe('closing', () => {
  it('closes on Escape', () => {
    const { input } = setup()
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('Samsung')).toBeNull()
  })

  it('closes when a click lands outside it', () => {
    const { input } = setup()
    fireEvent.focus(input)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Samsung')).toBeNull()
  })
})

describe('the error state', () => {
  it('shows the message it is given', () => {
    setup({ error: 'Brand is required' })
    expect(screen.getByText('Brand is required')).toBeTruthy()
  })
})

/* Review Focus 5: never silently correct what someone typed. A snap from
   "Redmi 13C" to "Redmi 13" puts the wrong model on an invoice. */
describe('a near-miss value', () => {
  it('keeps exactly what was typed and never snaps to the closest option', () => {
    const onChange = vi.fn()
    render(
      <ComboBox value="" onChange={onChange} options={['Redmi 13']} placeholder="Model" />
    )
    const input = screen.getByPlaceholderText('Model')
    fireEvent.change(input, { target: { value: 'Redmi 13C' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith('Redmi 13C')
    expect(onChange).not.toHaveBeenCalledWith('Redmi 13')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm test -- ComboBox`
Expected: FAIL with `Cannot find module '@/shared/ui/ComboBox'`.

- [ ] **Step 3: Write the component**

Create `src/shared/ui/ComboBox.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react'

/* A dropdown you can type into. The list is whatever it is handed; a value
   that matches nothing is still a valid value, because the forms using this
   let the shop add to its own lists by typing. It never corrects what was
   typed - snapping "Redmi 13C" to "Redmi 13" would put the wrong model on an
   invoice. */

const MAX_VISIBLE = 50

const squash = (s) => (s || '').toLowerCase().replace(/\s+/g, '')

const ComboBox = ({
  value, onChange, options = [], placeholder, required, error, inputRef, className = '', id,
}) => {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const query = squash(value)
  const matches = query
    ? options.filter(o => squash(o).includes(query))
    : options
  const visible = matches.slice(0, MAX_VISIBLE)

  const isNew = Boolean((value || '').trim()) && !options.some(o => squash(o) === query)

  const choose = (option) => {
    onChange(option)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      // Enter takes an exact-ish match if there is one, and otherwise leaves
      // what was typed alone.
      if (visible.length === 1) choose(visible[0])
      else setOpen(false)
    }
  }

  const base = 'w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-white'
  const border = error ? 'border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'

  return (
    <div className="relative" ref={wrapRef}>
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={value || ''}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onKeyDown={onKeyDown}
        className={`${base} ${border} ${className}`}
      />

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {visible.map(option => (
            <div
              key={option}
              role="button"
              tabIndex={0}
              onClick={() => choose(option)}
              className="px-4 py-2.5 text-sm hover:bg-[#002395]/5 active:bg-[#002395]/10 cursor-pointer border-b last:border-b-0 border-gray-100"
            >
              {option}
            </div>
          ))}
          {isNew && (
            <div className="px-4 py-2.5 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">
              New — will be added to the list
            </div>
          )}
          {!visible.length && !isNew && (
            <div className="px-4 py-2.5 text-xs text-gray-400">No options yet</div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-[#ED2939] mt-1">{error}</p>}
    </div>
  )
}

export default ComboBox
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npm test -- ComboBox`
Expected: PASS, 15 tests.

- [ ] **Step 5: Run the whole suite, build and lint**

Run: `npm test && npm run build && npx eslint src/shared/ui`
Expected: all suites pass; build succeeds; eslint silent.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ui/ComboBox.jsx src/shared/ui/__tests__/ComboBox.test.jsx
git commit -m "Add a ComboBox: a dropdown you can type into

Focus shows the whole list, typing narrows it, and a value matching nothing
is still valid - that is how the shop adds to its own lists. It never
corrects what was typed: snapping 'Redmi 13C' to 'Redmi 13' would put the
wrong model on an invoice, and a test pins that.

Presentational only - an array of strings in, a string out - so it carries no
Firestore or settings knowledge and works for any field.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Option normalisation and write planning

**Files:**
- Create: `src/features/settings/options.js`
- Create: `src/features/settings/__tests__/options.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces `@/features/settings/options`:
  - `normalizeOption(value: string): string` — trimmed, internal whitespace collapsed. `''` for blank input.
  - `findExisting(options: string[], value: string): string | null` — the existing entry matching case-insensitively, or null.
  - `planOptionWrites(requested, known): Array<{ docKey: string, field: string, value: string }>` where
    - `requested` is `{ brands?: string, models?: { [brand]: string }, field_options?: { [field]: string } }`
    - `known` is `{ brands: string[], models: { [brand]: string[] }, field_options: { [field]: string[] } }`
    - each returned write names the settings document (`docKey`), the field within it (`field`), and the value to `arrayUnion`.

For a flat list the field is `items`; for `models` it is the brand; for `field_options` it is the field name.

Pure, no Firestore. Review Focus 1 and 2 are the last two blocks.

- [ ] **Step 1: Write the failing tests**

Create `src/features/settings/__tests__/options.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { normalizeOption, findExisting, planOptionWrites } from '@/features/settings/options'

const known = {
  brands: ['Samsung', 'Apple'],
  models: { Samsung: ['Galaxy A52'], Apple: ['iPhone 13'] },
  field_options: { supplier: ['Anand Mobiles'], colour: ['Black'], product_category: ['Charger'] },
}

describe('normalizeOption', () => {
  it('trims the ends', () => {
    expect(normalizeOption('  Samsung  ')).toBe('Samsung')
  })

  it('collapses runs of inner whitespace', () => {
    expect(normalizeOption('Galaxy   A52')).toBe('Galaxy A52')
  })

  it('keeps the casing it was given', () => {
    expect(normalizeOption('samSUNG')).toBe('samSUNG')
  })

  it('returns empty string for blank input', () => {
    expect(normalizeOption('   ')).toBe('')
    expect(normalizeOption('')).toBe('')
    expect(normalizeOption(undefined)).toBe('')
    expect(normalizeOption(null)).toBe('')
  })
})

describe('findExisting', () => {
  it('matches ignoring case', () => {
    expect(findExisting(['Samsung'], 'samsung')).toBe('Samsung')
  })

  it('matches ignoring surrounding whitespace', () => {
    expect(findExisting(['Samsung'], '  SAMSUNG ')).toBe('Samsung')
  })

  it('returns null when nothing matches', () => {
    expect(findExisting(['Samsung'], 'Nokia')).toBeNull()
  })

  it('returns null for a blank value', () => {
    expect(findExisting(['Samsung'], '  ')).toBeNull()
  })
})

describe('planOptionWrites', () => {
  it('plans nothing when every value is already known', () => {
    expect(planOptionWrites({ brands: 'Samsung' }, known)).toEqual([])
  })

  it('plans a brand write for a new brand', () => {
    expect(planOptionWrites({ brands: 'Nokia' }, known)).toEqual([
      { docKey: 'brands', field: 'items', value: 'Nokia' },
    ])
  })

  it('plans a model write under its brand', () => {
    expect(planOptionWrites({ models: { Samsung: 'Galaxy A56' } }, known)).toEqual([
      { docKey: 'models', field: 'Samsung', value: 'Galaxy A56' },
    ])
  })

  it('plans nothing for a model that brand already has', () => {
    expect(planOptionWrites({ models: { Samsung: 'Galaxy A52' } }, known)).toEqual([])
  })

  it('plans a field_options write under the field name', () => {
    expect(planOptionWrites({ field_options: { supplier: 'Sri Traders' } }, known)).toEqual([
      { docKey: 'field_options', field: 'supplier', value: 'Sri Traders' },
    ])
  })

  it('plans several writes at once', () => {
    const writes = planOptionWrites(
      { brands: 'Nokia', models: { Nokia: 'Nokia G42' }, field_options: { colour: 'Teal' } },
      known,
    )
    expect(writes).toEqual([
      { docKey: 'brands', field: 'items', value: 'Nokia' },
      { docKey: 'models', field: 'Nokia', value: 'Nokia G42' },
      { docKey: 'field_options', field: 'colour', value: 'Teal' },
    ])
  })

  it('stores the normalised value, not the raw one', () => {
    expect(planOptionWrites({ brands: '  Nokia  ' }, known)).toEqual([
      { docKey: 'brands', field: 'items', value: 'Nokia' },
    ])
  })
})

/* Review Focus 1: variants of one brand must not pile up in the list. */
describe('a value differing only by case or spacing', () => {
  it('is recognised as the existing entry and writes nothing', () => {
    expect(planOptionWrites({ brands: 'samsung' }, known)).toEqual([])
    expect(planOptionWrites({ brands: 'SAMSUNG' }, known)).toEqual([])
    expect(planOptionWrites({ brands: ' Samsung ' }, known)).toEqual([])
  })

  it('applies the same rule to models and field options', () => {
    expect(planOptionWrites({ models: { Samsung: 'galaxy  a52' } }, known)).toEqual([])
    expect(planOptionWrites({ field_options: { colour: 'black' } }, known)).toEqual([])
  })
})

/* Review Focus 2: a blank row in Settings that nobody can identify. */
describe('a blank value', () => {
  it('is never planned as a write', () => {
    expect(planOptionWrites({ brands: '' }, known)).toEqual([])
    expect(planOptionWrites({ brands: '   ' }, known)).toEqual([])
    expect(planOptionWrites({ brands: undefined }, known)).toEqual([])
    expect(planOptionWrites({ models: { Samsung: '  ' } }, known)).toEqual([])
    expect(planOptionWrites({ field_options: { supplier: '' } }, known)).toEqual([])
  })

  it('is never planned under a blank brand either', () => {
    expect(planOptionWrites({ models: { '': 'Galaxy A56' } }, known)).toEqual([])
  })
})

describe('an unknown brand with a model', () => {
  it('plans the model under that brand even though the brand has no list yet', () => {
    expect(planOptionWrites({ models: { Nokia: 'Nokia G42' } }, known)).toEqual([
      { docKey: 'models', field: 'Nokia', value: 'Nokia G42' },
    ])
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm test -- options`
Expected: FAIL with `Cannot find module '@/features/settings/options'`.

- [ ] **Step 3: Write the module**

Create `src/features/settings/options.js`:

```js
/* ─────────────────────────────────────────────
   OPTION LISTS

   The shop's own vocabulary - brands, models, suppliers, colours, product
   categories. A value typed into a form that is not on the list joins it, so
   the next person finds it in the dropdown instead of typing it again.

   Everything here is pure. Deciding what is new is separate from writing it,
   so the rules can be tested without a database.
────────────────────────────────────────────── */

/** Trimmed, with runs of inner whitespace collapsed. Casing is left alone. */
export const normalizeOption = (value) =>
  String(value ?? '').trim().replace(/\s+/g, ' ')

const squash = (value) => normalizeOption(value).toLowerCase()

/** The entry already on the list that means the same thing, or null. */
export const findExisting = (options = [], value) => {
  const needle = squash(value)
  if (!needle) return null
  return options.find(o => squash(o) === needle) ?? null
}

/* Which settings document and field each kind of list lives in. A flat list
   keeps its values under `items`; models are keyed by brand; field options by
   field name. */
const plan = (writes, docKey, field, value, existing) => {
  const clean = normalizeOption(value)
  if (!clean || !field) return
  if (findExisting(existing, clean)) return
  writes.push({ docKey, field, value: clean })
}

/**
 * The writes needed so every requested value is on its list.
 * Returns [] when there is nothing new - the common case for a normal save.
 */
export const planOptionWrites = (requested = {}, known = {}) => {
  const writes = []

  plan(writes, 'brands', 'items', requested.brands, known.brands || [])

  Object.entries(requested.models || {}).forEach(([brand, model]) => {
    const brandKey = normalizeOption(brand)
    plan(writes, 'models', brandKey, model, (known.models || {})[brandKey] || [])
  })

  Object.entries(requested.field_options || {}).forEach(([field, value]) => {
    plan(writes, 'field_options', field, value, (known.field_options || {})[field] || [])
  })

  return writes
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npm test -- options`
Expected: PASS, 20 tests.

- [ ] **Step 5: Run the suite, build and lint**

Run: `npm test && npm run build && npx eslint src/features/settings`
Expected: all pass; eslint silent.

- [ ] **Step 6: Commit**

```bash
git add src/features/settings
git commit -m "Add option normalisation and write planning

Pure rules for what counts as a new option: trimmed, inner whitespace
collapsed, matched case-insensitively against the list so samsung, SAMSUNG
and ' Samsung ' all resolve to the existing Samsung rather than adding three
entries. A blank value is never an option - it would render as a row in
Settings that nobody can identify.

Deciding is separate from writing so the rules are testable without a
database.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `field_options` in SettingsContext

**Files:**
- Modify: `src/context/SettingsContext.jsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `settings.field_options`, and on the context value a new `fieldOptions` object, defaulting to `{ supplier: [], colour: [], product_category: [] }`.

`SettingsContext` seeds any missing settings document from `DEFAULT_SETTINGS` on load, so an existing shop gets `settings/field_options` created on its next app load with the default categories in it.

- [ ] **Step 1: Add the default**

In `DEFAULT_SETTINGS`, after the `models` entry, add:

```js
  field_options: {
    supplier: [],
    colour: ['Black', 'White', 'Blue', 'Red', 'Gold', 'Silver', 'Green'],
    product_category: [
      'Back Cover', 'Battery', 'Cable', 'Charger', 'Earphones',
      'Memory Card', 'Power Bank', 'Screen Guard', 'Tempered Glass', 'Other',
    ],
  },
```

The product categories are the ten currently hardcoded in `ProductList.jsx` and `ProductDetailsSection.jsx`, so nothing a shop already has changes meaning.

- [ ] **Step 2: Load it**

In `loadSettings`, add `'field_options'` to the end of the `keys` array:

```js
      const keys = ['complaint_types', 'pre_delivery_checklist', 'brands', 'accessories', 'models', 'ram_options', 'rom_options', 'device_checklist', 'shop_details', 'field_options']
```

- [ ] **Step 3: Write it whole, like the other map-shaped documents**

In `updateSetting`, `field_options` is a map of field → array, exactly like `models`, so it must not be wrapped in `{ items }`. Change the first condition:

```js
      if (key === 'models' || key === 'field_options') {
        await setDoc(doc(db, 'settings', key), items)
      } else if (key === 'device_checklist') {
```

and the matching line that rebuilds local state:

```js
      const newSettings = { ...settings, [key]: key === 'models' || key === 'field_options' || key === 'device_checklist' || key === 'shop_details' ? items : { items } }
```

- [ ] **Step 4: Expose it**

In the provider's `value`, after `deviceChecklist`:

```js
        fieldOptions: { ...DEFAULT_SETTINGS.field_options, ...(settings.field_options || {}) },
```

- [ ] **Step 5: Confirm the app still loads and nothing else changed**

Run: `npm test && npm run build && npx eslint src/context/SettingsContext.jsx`
Expected: all suites pass; build succeeds; eslint silent.

- [ ] **Step 6: Check it in the running app**

```bash
npm run dev
```

Open the app, sign in, and confirm the settings page still shows every existing list. In the browser console, confirm the new document was seeded:

Expected: no `Failed to load settings` error, and the settings page renders brands, models and accessories as before.

- [ ] **Step 7: Commit**

```bash
git add src/context/SettingsContext.jsx
git commit -m "Add settings/field_options for supplier, colour and category

One document holding every list that is not already a settings document, so
this costs one extra read per app load rather than three - and any future
remembering field costs none. Shaped like models: a map of field name to
array, so it is written whole rather than wrapped in { items }.

The default product categories are the ten currently hardcoded in the JSX of
ProductList and ProductDetailsSection, so nothing changes meaning for a shop
already running.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `rememberOptions`

**Files:**
- Modify: `src/features/settings/options.js` (add `applyOptionWrites`)
- Modify: `src/features/settings/__tests__/options.test.js` (add the write tests)
- Modify: `src/context/SettingsContext.jsx` (expose `rememberOptions`)

**Interfaces:**
- Consumes: `planOptionWrites` and `normalizeOption` from Task 3; `fieldOptions` from Task 4.
- Produces:
  - from `@/features/settings/options`: `applyOptionWrites(writes: Array<{docKey, field, value}>): Promise<boolean>` — performs the `arrayUnion` writes, returns `true` if they all succeeded, `false` if any threw. **Never throws.**
  - on the context value: `rememberOptions(requested): Promise<void>` — plans, writes, and merges the new values into local state and the cache.

Review Focus 3 and 4 are covered here.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/settings/__tests__/options.test.js`. The existing file has no mocks, so add these at the very top of the file, above the current imports:

```js
import { vi } from 'vitest'

vi.mock('@/shared/firebase/firebase', () => ({ db: { __db: true } }))

const fsMocks = vi.hoisted(() => ({
  updateDoc: vi.fn(async () => undefined),
  arrayUnion: vi.fn((v) => ({ __arrayUnion: v })),
}))

vi.mock('firebase/firestore', () => ({
  doc: (_db, coll, id) => ({ __doc: `${coll}/${id}` }),
  updateDoc: fsMocks.updateDoc,
  arrayUnion: fsMocks.arrayUnion,
}))
```

and add `applyOptionWrites` to the import from `@/features/settings/options`, then append these blocks:

```js
describe('applyOptionWrites', () => {
  it('writes nothing when there is nothing to write', async () => {
    fsMocks.updateDoc.mockClear()
    expect(await applyOptionWrites([])).toBe(true)
    expect(fsMocks.updateDoc).not.toHaveBeenCalled()
  })

  it('appends to a flat list with arrayUnion, never setDoc', async () => {
    fsMocks.updateDoc.mockClear()
    await applyOptionWrites([{ docKey: 'brands', field: 'items', value: 'Nokia' }])

    expect(fsMocks.updateDoc).toHaveBeenCalledWith(
      { __doc: 'settings/brands' },
      { items: { __arrayUnion: 'Nokia' } },
    )
  })

  it('appends a model under its brand key', async () => {
    fsMocks.updateDoc.mockClear()
    await applyOptionWrites([{ docKey: 'models', field: 'Nokia', value: 'Nokia G42' }])

    expect(fsMocks.updateDoc).toHaveBeenCalledWith(
      { __doc: 'settings/models' },
      { Nokia: { __arrayUnion: 'Nokia G42' } },
    )
  })
})

/* Review Focus 4: a model under a brand with no list yet. arrayUnion creates
   the field, so the brand and its first model can be written together. */
describe('a brand-new brand and its first model', () => {
  it('writes both, the model keyed by the new brand', async () => {
    fsMocks.updateDoc.mockClear()
    await applyOptionWrites(planOptionWrites(
      { brands: 'Nokia', models: { Nokia: 'Nokia G42' } },
      { brands: ['Samsung'], models: { Samsung: [] }, field_options: {} },
    ))

    expect(fsMocks.updateDoc).toHaveBeenCalledTimes(2)
    expect(fsMocks.updateDoc).toHaveBeenCalledWith(
      { __doc: 'settings/brands' }, { items: { __arrayUnion: 'Nokia' } },
    )
    expect(fsMocks.updateDoc).toHaveBeenCalledWith(
      { __doc: 'settings/models' }, { Nokia: { __arrayUnion: 'Nokia G42' } },
    )
  })
})

/* Review Focus 3: filing a brand name must never block selling a phone. */
describe('a failed write', () => {
  it('is swallowed and reported as false, never thrown', async () => {
    fsMocks.updateDoc.mockClear()
    fsMocks.updateDoc.mockRejectedValueOnce(new Error('permission-denied'))

    await expect(
      applyOptionWrites([{ docKey: 'brands', field: 'items', value: 'Nokia' }])
    ).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm test -- options`
Expected: FAIL — `applyOptionWrites is not a function`.

- [ ] **Step 3: Add `applyOptionWrites`**

Append to `src/features/settings/options.js`, and add the imports at the top of that file:

```js
import { doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '@/shared/firebase/firebase'
```

```js
/**
 * Append each planned value to its list.
 *
 * arrayUnion rather than a whole-document write: two staff adding a brand in
 * the same minute must both succeed, and a setDoc would let one silently
 * overwrite the other. It also creates a missing field, so a model under a
 * brand-new brand needs no special case.
 *
 * Never throws. Filing a brand name must not be able to fail the sale the
 * person just made.
 */
export const applyOptionWrites = async (writes = []) => {
  if (!writes.length) return true
  try {
    await Promise.all(writes.map(({ docKey, field, value }) =>
      updateDoc(doc(db, 'settings', docKey), { [field]: arrayUnion(value) })
    ))
    return true
  } catch (err) {
    console.error('Could not save new option(s):', err)
    return false
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npm test -- options`
Expected: PASS, 25 tests.

- [ ] **Step 5: Expose `rememberOptions` on the context**

In `src/context/SettingsContext.jsx`, import at the top:

```js
import { planOptionWrites, applyOptionWrites } from '@/features/settings/options'
```

Add this function beside `updateSetting`:

```js
  /* Record any option values a saved record introduced. Called from a form's
     save path, never on blur - an abandoned form must not leave its typing in
     everyone's dropdowns. Does nothing, and costs nothing, when every value is
     already on its list. */
  const rememberOptions = async (requested) => {
    const known = {
      brands: settings.brands?.items || [],
      models: settings.models || {},
      field_options: settings.field_options || {},
    }
    const writes = planOptionWrites(requested, known)
    if (!writes.length) return

    const ok = await applyOptionWrites(writes)
    if (!ok) return

    const next = JSON.parse(JSON.stringify(settings))
    writes.forEach(({ docKey, field, value }) => {
      if (docKey === 'brands') {
        next.brands = { items: [...(next.brands?.items || []), value] }
      } else {
        next[docKey] = { ...(next[docKey] || {}) }
        next[docKey][field] = [...(next[docKey][field] || []), value]
      }
    })
    setSettings(next)
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: next, timestamp: Date.now() }))
  }
```

and add `rememberOptions` to the provider's `value` object, after `updateSetting`.

- [ ] **Step 6: Confirm nothing regressed**

Run: `npm test && npm run build && npx eslint src/features/settings src/context/SettingsContext.jsx`
Expected: all suites pass; build succeeds; eslint silent.

- [ ] **Step 7: Commit**

```bash
git add src/features/settings src/context/SettingsContext.jsx
git commit -m "Write new option values back with arrayUnion

arrayUnion rather than rewriting the list document: two staff adding a brand
in the same minute both succeed, where a setDoc would let one silently
overwrite the other - the same race counters.js exists to prevent for label
numbers. It also creates a missing field, so a brand-new brand and its first
model are written together with no special case.

The write never throws. Filing a brand name must not be able to fail the sale
the person just made; a failure is logged and reported, and the local list is
left alone so the next save retries.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Product category becomes a remembering field

**Files:**
- Modify: `src/features/products/ProductForm/ProductDetailsSection.jsx:44-60`
- Modify: `src/features/products/ProductForm/index.jsx`
- Modify: `src/features/products/ProductForm/useProductForm.js`
- Modify: `src/features/products/ProductList.jsx` (the category filter)

**Interfaces:**
- Consumes: `ComboBox` (Task 2), `fieldOptions` and `rememberOptions` (Tasks 4, 5).
- Produces: nothing later tasks depend on. This is the plan's first real use of the feature.

Products is chosen because it is the one feature already restructured — `ProductForm` is a folder of small components, so this change is contained. `SecondHandForm` and `ServiceOrderForm` get the same treatment inside their own restructure slices, per the spec.

- [ ] **Step 1: Pass the category options into the section**

In `useProductForm.js`, add to the imports:

```js
import { useSettings } from '@/context/SettingsContext';
```

Inside the hook, beside the existing `useAuth()` call:

```js
  const { fieldOptions, rememberOptions } = useSettings();
```

and add both to the hook's returned object:

```js
    categoryOptions: fieldOptions.product_category || [],
    rememberOptions,
```

- [ ] **Step 2: Record the category when the product saves**

In `useProductForm.js`, in `handleSubmit`, **after `setSaveStatus('saved')`** — not
before it. The person must see "Saved" the moment the product is written; filing
a new category is bookkeeping and must not add a round trip to the save they are
waiting on:

```js
      const newId = await onSave(data);
      if (newId) setLocalId(newId);
      setSaveStatus('saved');
      await rememberOptions({ field_options: { product_category: data.category } });
```

In `handleSaveAndPrint`, put it at the very end of the `try` block, after
`setLabelAssigned(true)`:

```js
      await rememberOptions({ field_options: { product_category: data.category } });
```

`rememberOptions` returns without writing when the category is already known,
which is the normal case, so an ordinary save costs nothing. It never throws, so
it cannot turn a successful save into the catch block's error alert.

- [ ] **Step 3: Hand the options to the section**

In `ProductForm/index.jsx`, add `categoryOptions` to the `ProductDetailsSection` props:

```jsx
            <ProductDetailsSection
              formData={form.formData}
              setFormData={form.setFormData}
              fieldErrors={form.fieldErrors}
              setFieldErrors={form.setFieldErrors}
              nameRef={form.nameRef}
              categoryOptions={form.categoryOptions}
            />
```

- [ ] **Step 4: Replace the hardcoded select with the ComboBox**

In `ProductDetailsSection.jsx`, add to the top:

```jsx
import ComboBox from '@/shared/ui/ComboBox'
```

add `categoryOptions` to the destructured props, and replace the whole `<select>` block (lines 44-60, from `<select` through `</select>`) with:

```jsx
            <ComboBox
              value={formData.category}
              onChange={v => setFormData({ ...formData, category: v })}
              options={categoryOptions}
              placeholder="Select or type a category"
            />
```

- [ ] **Step 5: Make the list filter read the same list**

In `ProductList.jsx`, add:

```jsx
import { useSettings } from '@/context/SettingsContext';
```

inside the component:

```jsx
  const { fieldOptions } = useSettings();
```

and replace the ten hardcoded `<option>` lines in the category filter — everything between `<option value="">All Categories</option>` and `</select>` — with:

```jsx
              {(fieldOptions.product_category || []).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
```

The filter stays a plain `<select>`: it is not data entry, and "add new" has no meaning when filtering. It now cannot drift from what products actually carry.

- [ ] **Step 6: Confirm no hardcoded category list remains**

```bash
grep -rn "Tempered Glass" src/features/products/
```

Expected: no output. The only remaining copy is the default in `SettingsContext.jsx`.

- [ ] **Step 7: Run the suite, build and lint**

Run: `npm test && npm run build && npx eslint src/features/products src/shared/ui src/features/settings`
Expected: all suites pass; build succeeds; eslint silent. The existing `buildProductData` and products data tests must still pass untouched — this task changes how `category` is *entered*, never how it is stored.

- [ ] **Step 8: Check it by hand**

```bash
npm run dev
```

- [ ] Open a product's edit form. The Category field shows the full list on focus.
- [ ] Type "char" — the list narrows to Charger.
- [ ] Type "Tripod" — the list shows "New — will be added to the list".
- [ ] Save. Reopen the form: Tripod is now in the list without a reload.
- [ ] Go to `/products`. The category filter now offers Tripod too.
- [ ] Type "charger" in lower case into a new product and save. Confirm Settings has not gained a second "charger" entry beside "Charger".

- [ ] **Step 9: Commit**

```bash
git add src/features/products src/context/SettingsContext.jsx
git commit -m "Product category becomes a searchable, remembering field

The category list was hardcoded in the JSX of two files - the form and the
list filter - so the shop could not edit it and the two copies could drift.
It now lives in settings/field_options, the form uses the ComboBox, and the
filter reads the same list, so it cannot offer a category no product has or
miss one every product has.

Typing a category that does not exist adds it when the product saves. An
existing category, in any casing, writes nothing.

Products goes first because it is the one feature already restructured, so
the change is contained to small files. Second-hand and service get the same
treatment inside their own slices.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Verify the whole change

**Files:** none changed unless a check fails.

- [ ] **Step 1: Full automated check from a clean state**

```bash
rm -rf dist && npm test && npm run build && npx eslint src/features src/shared src/context
```

Expected: all suites pass; `✓ built in`; eslint reports 0 errors across those trees.

- [ ] **Step 2: Confirm the structural claims**

```bash
echo "--- no hardcoded category list outside SettingsContext ---"
grep -rln "Tempered Glass" src/ | grep -v SettingsContext
echo "--- option writes go through arrayUnion only ---"
grep -rn "setDoc" src/features/settings/
echo "--- repo lint total, against the 427 baseline ---"
npx eslint . -f json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(f['errorCount'] for f in d), 'errors')"
```

Expected: nothing for the first; nothing for the second (`options.js` uses `updateDoc`/`arrayUnion` only); the repo total at or below 427.

- [ ] **Step 3: Confirm the seeding path ran**

`settings/field_options` does not exist in a shop that was running before this
change; `SettingsContext` creates it from `DEFAULT_SETTINGS` on the first load
after Task 4. That already happened during Task 4's manual check, so confirm the
result rather than re-testing it:

In the Firebase console, open `settings/field_options` and confirm it exists with
`product_category`, `colour` and an empty `supplier`.

**Do not delete the document to re-test the seeding path.** By this point it may
already hold categories added through the form, and seeding only restores the
defaults — the additions would be gone, and there is no UI to re-enter them until
the settings slice lands.

- [ ] **Step 4: Commit any fixes, or record that none were needed**

```bash
git add -A
git commit -m "Record verification of the remembering-dropdowns core

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## What this plan does not cover

- **`SecondHandForm`** (brand, model, RAM, ROM, supplier) and **`ServiceOrderForm`** (brand, model, complaint types, accessories, colour). Both are entangled with restructure slices 5 and 7, and both are over 1100 lines. Adding fields to them now and re-splitting them later would do the riskiest work twice, so the ComboBox goes in as part of those slices. Their plans must also remove the `customBrand` / `isCustomModel` free-text branches, which this plan leaves alone.
- **The sectioned settings page.** It is restructure slice 9 and gets its own plan. Until then, `SettingsPage` keeps its current shape — and the new `field_options` lists are **not editable from the UI**, so a typo in a product category can only be fixed from the Firebase console. That is the main cost of splitting the work this way, and it is the reason the settings slice should follow soon.
- **Accessories, RAM and ROM** already have settings sections, so a typo in those is fixable today.
