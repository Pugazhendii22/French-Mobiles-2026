import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  readDraft, writeDraft, clearDraft, DRAFT_MAX_AGE_MS,
} from '@/shared/lib/formDraft'

/* localStorage does not exist under the node test environment, and in a private
   window it exists but throws. Both are modelled here, because a shop phone in
   private mode must still be able to fill in a form. */
const installStorage = (initial = {}, { throwOn } = {}) => {
  const store = { ...initial }
  globalThis.window = {
    localStorage: {
      getItem: (k) => { if (throwOn === 'get') throw new Error('denied'); return k in store ? store[k] : null },
      setItem: (k, v) => { if (throwOn === 'set') throw new Error('quota'); store[k] = String(v) },
      removeItem: (k) => { if (throwOn === 'remove') throw new Error('denied'); delete store[k] },
    },
  }
  return store
}

beforeEach(() => { installStorage() })
afterEach(() => { delete globalThis.window })

describe('writeDraft then readDraft', () => {
  it('returns what was stored', () => {
    writeDraft('k', { brand: 'Nokia', salePrice: '7500' })
    expect(readDraft('k')).toEqual({ brand: 'Nokia', salePrice: '7500' })
  })

  it('keeps drafts for different forms apart', () => {
    writeDraft('a', { brand: 'Nokia' })
    writeDraft('b', { brand: 'Apple' })
    expect(readDraft('a').brand).toBe('Nokia')
    expect(readDraft('b').brand).toBe('Apple')
  })
})

describe('when there is nothing to restore', () => {
  it('returns null for a key never written', () => {
    expect(readDraft('nothing-here')).toBeNull()
  })

  it('returns null after it is cleared', () => {
    writeDraft('k', { brand: 'Nokia' })
    clearDraft('k')
    expect(readDraft('k')).toBeNull()
  })
})

/* A half-filled purchase from a fortnight ago is not what someone expects to
   see when they open the form today. */
describe('a stale draft', () => {
  it('is not restored once it is older than the window', () => {
    const old = Date.now() - (DRAFT_MAX_AGE_MS + 60_000)
    installStorage({ 'fm:draft:x': JSON.stringify({ at: old, value: { brand: 'Nokia' } }) })
    expect(readDraft('x')).toBeNull()
  })

  it('is still restored just inside the window', () => {
    const recent = Date.now() - (DRAFT_MAX_AGE_MS - 60_000)
    installStorage({ 'fm:draft:x': JSON.stringify({ at: recent, value: { brand: 'Nokia' } }) })
    expect(readDraft('x')).toEqual({ brand: 'Nokia' })
  })
})

describe('when the stored value is unusable', () => {
  it('returns null rather than throwing on corrupt JSON', () => {
    installStorage({ 'fm:draft:x': '{not json' })
    expect(readDraft('x')).toBeNull()
  })

  it('returns null on a value in an older shape', () => {
    installStorage({ 'fm:draft:x': JSON.stringify({ brand: 'Nokia' }) })
    expect(readDraft('x')).toBeNull()
  })
})

/* Private browsing, a full disk, or a locked-down WebView. Losing the draft is
   acceptable; losing the form the person is typing into is not. */
describe('when storage itself refuses', () => {
  it('reading returns null instead of throwing', () => {
    installStorage({}, { throwOn: 'get' })
    expect(() => readDraft('x')).not.toThrow()
    expect(readDraft('x')).toBeNull()
  })

  it('writing fails quietly', () => {
    installStorage({}, { throwOn: 'set' })
    expect(() => writeDraft('x', { brand: 'Nokia' })).not.toThrow()
  })

  it('clearing fails quietly', () => {
    installStorage({}, { throwOn: 'remove' })
    expect(() => clearDraft('x')).not.toThrow()
  })

  it('works with no window at all, as on the server or in tests', () => {
    delete globalThis.window
    expect(() => writeDraft('x', { a: 1 })).not.toThrow()
    expect(readDraft('x')).toBeNull()
    expect(() => clearDraft('x')).not.toThrow()
  })
})

describe('an empty draft', () => {
  it('is not worth storing, so nothing comes back', () => {
    writeDraft('k', {})
    expect(readDraft('k')).toBeNull()
  })

  it('treats a form of only blank values as empty', () => {
    writeDraft('k', { brand: '', model: '   ', notes: '' })
    expect(readDraft('k')).toBeNull()
  })

  it('stores as soon as one field has something in it', () => {
    writeDraft('k', { brand: 'Nokia', model: '' })
    expect(readDraft('k')).toEqual({ brand: 'Nokia', model: '' })
  })
})
