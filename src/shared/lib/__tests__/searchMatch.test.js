import { describe, it, expect } from 'vitest'
import { normalizeForSearch, matchesQuery } from '@/shared/lib/searchMatch'

/* The fields of a second-hand record someone would actually search by. */
const device = {
  brand: 'Apple',
  model: 'iPhone 13',
  imei1: '352099001761481',
  sellerName: 'Ravi Kumar',
  sellerPhone: '+91 98765 43210',
  supplier: 'Anand Traders',
}
const fieldsOf = (d) => [d.brand, d.model, d.imei1, d.sellerName, d.sellerPhone, d.supplier]
const find = (query, d = device) => matchesQuery(query, fieldsOf(d))

describe('normalizeForSearch', () => {
  it('ignores case', () => {
    expect(normalizeForSearch('Apple')).toBe('apple')
  })

  /* A phone number is written a dozen ways and typed a dozen more. None of the
     punctuation carries meaning, so none of it should block a match. */
  it('drops the punctuation people put in phone numbers', () => {
    expect(normalizeForSearch('+91 98765-43210')).toBe('919876543210')
  })

  it('survives nothing at all', () => {
    expect(normalizeForSearch(null)).toBe('')
    expect(normalizeForSearch(undefined)).toBe('')
    expect(normalizeForSearch(12345)).toBe('12345')
  })
})

describe('an empty search', () => {
  it('matches everything, so the list is not hidden before anyone types', () => {
    expect(find('')).toBe(true)
    expect(find('   ')).toBe(true)
    expect(find(null)).toBe(true)
  })
})

describe('searching by the device', () => {
  it('finds it by brand', () => expect(find('apple')).toBe(true))
  it('finds it by model', () => expect(find('iphone')).toBe(true))
  it('finds it by part of the IMEI, which is how a long number is read off', () => {
    expect(find('1761481')).toBe(true)
  })
  it('does not match a device that is not there', () => {
    expect(find('samsung')).toBe(false)
  })
})

/* The reason this exists: staff remember who they bought a phone from long
   before they remember which model it was. */
describe('searching by the person', () => {
  it('finds it by the seller name', () => expect(find('ravi')).toBe(true))
  it('finds it by surname', () => expect(find('kumar')).toBe(true))
  it('is not case sensitive about a name', () => expect(find('RAVI')).toBe(true))
  it('finds it by the seller phone number typed plainly', () => {
    expect(find('9876543210')).toBe(true)
  })
  it('finds it by the last few digits of the phone, which is what gets remembered', () => {
    expect(find('43210')).toBe(true)
  })
  it('finds it by the phone number typed with spaces', () => {
    expect(find('98765 43210')).toBe(true)
  })
  it('finds it by supplier', () => expect(find('anand')).toBe(true))
})

/* Each word is matched on its own, so a query can name two different things.
   Joining the query into one string meant "apple 13" matched nothing, because
   no single field contains both. */
describe('a search of several words', () => {
  it('matches when each word is found, even in different fields', () => {
    expect(find('apple 13')).toBe(true)
    expect(find('ravi apple')).toBe(true)
  })

  it('fails when any one word is not found anywhere', () => {
    expect(find('apple samsung')).toBe(false)
    expect(find('ravi nokia')).toBe(false)
  })

  it('matches a full name across the space', () => {
    expect(find('ravi kumar')).toBe(true)
  })

  it('ignores extra spacing someone typed', () => {
    expect(find('  apple   13  ')).toBe(true)
  })
})

describe('when a record is missing fields', () => {
  it('does not throw, and simply does not match', () => {
    expect(matchesQuery('ravi', [undefined, null, ''])).toBe(false)
  })

  it('still matches on the fields that are filled in', () => {
    expect(matchesQuery('nokia', ['Nokia', null, undefined])).toBe(true)
  })
})
