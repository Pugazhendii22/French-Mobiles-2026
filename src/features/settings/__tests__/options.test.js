import { describe, it, expect, vi } from 'vitest'

vi.mock('@/shared/firebase/firebase', () => ({ db: { __db: true } }))

const fsMocks = vi.hoisted(() => ({
  setDoc: vi.fn(async () => undefined),
  arrayUnion: vi.fn((v) => ({ __arrayUnion: v })),
}))

vi.mock('firebase/firestore', () => ({
  doc: (_db, coll, id) => ({ __doc: `${coll}/${id}` }),
  setDoc: fsMocks.setDoc,
  arrayUnion: fsMocks.arrayUnion,
}))

const {
  normalizeOption, findExisting, planOptionWrites, applyOptionWrites,
} = await import('@/features/settings/options')

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
    /* The service form passes null when the technician is shop staff and there
       is deliberately nothing to file. */
    expect(planOptionWrites({ field_options: { technician: null } }, known)).toEqual([])
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

describe('an empty request', () => {
  it('plans nothing', () => {
    expect(planOptionWrites({}, known)).toEqual([])
    expect(planOptionWrites(undefined, known)).toEqual([])
  })

  it('plans nothing when nothing is known yet either', () => {
    expect(planOptionWrites({ brands: 'Nokia' }, {})).toEqual([
      { docKey: 'brands', field: 'items', value: 'Nokia' },
    ])
  })
})

describe('applyOptionWrites', () => {
  it('writes nothing when there is nothing to write', async () => {
    fsMocks.setDoc.mockClear()
    expect(await applyOptionWrites([])).toBe(true)
    expect(fsMocks.setDoc).not.toHaveBeenCalled()
  })

  it('appends to a flat list with arrayUnion, and merges rather than replacing', async () => {
    fsMocks.setDoc.mockClear()
    await applyOptionWrites([{ docKey: 'brands', field: 'items', value: 'Nokia' }])

    expect(fsMocks.setDoc).toHaveBeenCalledWith(
      { __doc: 'settings/brands' },
      { items: { __arrayUnion: 'Nokia' } },
      { merge: true },
    )
  })

  it('appends a model under its brand key', async () => {
    fsMocks.setDoc.mockClear()
    await applyOptionWrites([{ docKey: 'models', field: 'Nokia', value: 'Nokia G42' }])

    expect(fsMocks.setDoc).toHaveBeenCalledWith(
      { __doc: 'settings/models' },
      { Nokia: { __arrayUnion: 'Nokia G42' } },
      { merge: true },
    )
  })
})

/* Review Focus 4: a model under a brand with no list yet. arrayUnion creates
   the field, so the brand and its first model can be written together. */
describe('a brand-new brand and its first model', () => {
  it('writes both, the model keyed by the new brand', async () => {
    fsMocks.setDoc.mockClear()
    await applyOptionWrites(planOptionWrites(
      { brands: 'Nokia', models: { Nokia: 'Nokia G42' } },
      { brands: ['Samsung'], models: { Samsung: [] }, field_options: {} },
    ))

    expect(fsMocks.setDoc).toHaveBeenCalledTimes(2)
    expect(fsMocks.setDoc).toHaveBeenCalledWith(
      { __doc: 'settings/brands' }, { items: { __arrayUnion: 'Nokia' } }, { merge: true },
    )
    expect(fsMocks.setDoc).toHaveBeenCalledWith(
      { __doc: 'settings/models' }, { Nokia: { __arrayUnion: 'Nokia G42' } }, { merge: true },
    )
  })
})

/* Review Focus 3: filing a brand name must never block selling a phone. */
describe('a failed write', () => {
  it('is swallowed and reported as false, never thrown', async () => {
    fsMocks.setDoc.mockClear()
    fsMocks.setDoc.mockRejectedValueOnce(new Error('permission-denied'))

    await expect(
      applyOptionWrites([{ docKey: 'brands', field: 'items', value: 'Nokia' }])
    ).resolves.toBe(false)
  })

  it('leaves the other writes attempted rather than stopping at the first', async () => {
    fsMocks.setDoc.mockClear()
    fsMocks.setDoc.mockRejectedValueOnce(new Error('permission-denied'))

    await applyOptionWrites([
      { docKey: 'brands', field: 'items', value: 'Nokia' },
      { docKey: 'models', field: 'Nokia', value: 'Nokia G42' },
    ])

    expect(fsMocks.setDoc).toHaveBeenCalledTimes(2)
  })
})

/* A repair description typed on the second-hand form. It joins the same list the
   service form offers as complaint types, because the shop names the work once. */
describe('remembering a repair description', () => {
  it('plans a write for one that is new', () => {
    expect(planOptionWrites({ complaint_types: 'Back glass replacement' }, known)).toEqual([
      { docKey: 'complaint_types', field: 'items', value: 'Back glass replacement' },
    ])
  })

  it('plans nothing for one the shop already lists', () => {
    expect(planOptionWrites({ complaint_types: 'Display replacement' },
      { ...known, complaint_types: ['Display replacement'] })).toEqual([])
  })

  it('matches an existing one ignoring case and spacing', () => {
    expect(planOptionWrites({ complaint_types: '  display   REPLACEMENT ' },
      { ...known, complaint_types: ['Display replacement'] })).toEqual([])
  })

  it('takes several repairs off one purchase', () => {
    expect(planOptionWrites(
      { complaint_types: ['Back glass replacement', 'Camera lens'] },
      { ...known, complaint_types: [] },
    )).toEqual([
      { docKey: 'complaint_types', field: 'items', value: 'Back glass replacement' },
      { docKey: 'complaint_types', field: 'items', value: 'Camera lens' },
    ])
  })

  it('sends one write when two repair lines say the same thing', () => {
    expect(planOptionWrites(
      { complaint_types: ['Camera lens', 'camera  lens', 'Camera Lens'] },
      { ...known, complaint_types: [] },
    )).toEqual([
      { docKey: 'complaint_types', field: 'items', value: 'Camera lens' },
    ])
  })

  it('ignores blank and missing lines', () => {
    expect(planOptionWrites({ complaint_types: ['', '   ', undefined, null] },
      { ...known, complaint_types: [] })).toEqual([])
    expect(planOptionWrites({ complaint_types: undefined }, known)).toEqual([])
  })
})
