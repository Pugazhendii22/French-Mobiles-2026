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
