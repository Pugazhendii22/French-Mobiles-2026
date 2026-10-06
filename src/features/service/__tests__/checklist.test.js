import { describe, it, expect } from 'vitest'
import {
  checklistKey, checklistEntries, blankChecklist, carryOver, allChecked,
} from '@/features/service/checklist'

describe('checklistKey', () => {
  it('turns a label into something storable', () => {
    expect(checklistKey('Display OK')).toBe('display_ok')
  })

  it('strips punctuation and trims the edges', () => {
    expect(checklistKey('  Display: OK!  ')).toBe('display_ok')
    expect(checklistKey('Camera / Flash')).toBe('camera_flash')
  })

  it('never returns an empty key, which would collide with the next blank one', () => {
    expect(checklistKey('!!!')).toBe('item')
    expect(checklistKey('')).toBe('item')
  })
})

/* The bug this exists to stop. Two labels a person reads as different -
   "Display OK" and "Display: OK!" - normalise to the same key, so they shared
   one checkbox: ticking the second visibly un-ticked the first, and the order
   was saved claiming a check nobody had done. In a pre-delivery checklist that
   is a device handed back untested. */
describe('two labels that normalise the same', () => {
  const items = ['Display OK', 'Display: OK!', 'Battery OK']

  it('still get a key each', () => {
    const keys = checklistEntries(items).map(e => e.key)
    expect(new Set(keys).size).toBe(3)
  })

  it('keeps the first one on the plain key, so stored data still reads', () => {
    expect(checklistEntries(items)[0].key).toBe('display_ok')
  })

  it('keeps every label exactly as it was written', () => {
    expect(checklistEntries(items).map(e => e.item)).toEqual(items)
  })

  it('gives the same answer every time it is asked', () => {
    expect(checklistEntries(items)).toEqual(checklistEntries(items))
  })
})

describe('exact duplicates in the settings list', () => {
  it('are each given their own key rather than silently merged', () => {
    const keys = checklistEntries(['Charge port', 'Charge port']).map(e => e.key)
    expect(new Set(keys).size).toBe(2)
  })
})

describe('blankChecklist', () => {
  it('starts everything unchecked', () => {
    expect(blankChecklist(['Display OK', 'Battery OK']))
      .toEqual({ display_ok: false, battery_ok: false })
  })

  it('copes with no checklist configured at all', () => {
    expect(blankChecklist([])).toEqual({})
    expect(blankChecklist(undefined)).toEqual({})
  })
})

/* The settings list can change while a sheet is open. What was already ticked
   stays ticked; items that have gone, go. */
describe('carryOver', () => {
  it('keeps the ticks for items that are still listed', () => {
    const was = { display_ok: true, battery_ok: false }
    expect(carryOver(['Display OK', 'Battery OK'], was))
      .toEqual({ display_ok: true, battery_ok: false })
  })

  it('drops items no longer on the list', () => {
    expect(carryOver(['Display OK'], { display_ok: true, gone: true }))
      .toEqual({ display_ok: true })
  })

  it('starts a newly added item unchecked', () => {
    expect(carryOver(['Display OK', 'New thing'], { display_ok: true }))
      .toEqual({ display_ok: true, new_thing: false })
  })
})

describe('allChecked', () => {
  const items = ['Display OK', 'Battery OK']

  it('is true only when every item is ticked', () => {
    expect(allChecked(items, { display_ok: true, battery_ok: true })).toBe(true)
    expect(allChecked(items, { display_ok: true, battery_ok: false })).toBe(false)
  })

  /* It used to read Object.values(state).every(...), which answers for whatever
     happens to be in the object - so a stale tick from an item since removed
     could carry the vote, and a missing key counted as agreement. */
  it('asks about the items on the list, not whatever the object holds', () => {
    expect(allChecked(items, { display_ok: true })).toBe(false)
    expect(allChecked(items, { display_ok: true, battery_ok: true, removed: false })).toBe(true)
  })

  /* A shop that has configured no checklist has nothing to verify. Failing this
     would stop every order in the shop being completed until somebody built
     one, which is a rule nobody asked for. */
  it('passes an empty list rather than blocking the whole shop', () => {
    expect(allChecked([], {})).toBe(true)
    expect(allChecked(undefined, {})).toBe(true)
  })
})
