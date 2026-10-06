import { describe, it, expect, vi } from 'vitest'

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

  it('leaves the other writes attempted rather than stopping at the first', async () => {
    fsMocks.updateDoc.mockClear()
    fsMocks.updateDoc.mockRejectedValueOnce(new Error('permission-denied'))

    await applyOptionWrites([
      { docKey: 'brands', field: 'items', value: 'Nokia' },
      { docKey: 'models', field: 'Nokia', value: 'Nokia G42' },
    ])

    expect(fsMocks.updateDoc).toHaveBeenCalledTimes(2)
  })
})
