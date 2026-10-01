import { describe, it, expect, vi } from 'vitest'

/* firebase.js throws while being imported when the VITE_FIREBASE_* variables
   are unset - that guard is what turns a missing deployment config into a
   readable message instead of a blank page. Tests have no such variables, so
   every suite that reaches the Firebase client through an import chain stubs
   it out. Nothing here touches the database. */
vi.mock('@/firebase/firebase', () => ({ db: { __stub: true }, auth: {}, secondaryAuth: {} }))

const { ttlFor } = await import('@/utils/collectionCache')

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
