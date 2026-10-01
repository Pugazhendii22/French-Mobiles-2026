import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/shared/firebase/firebase', () => ({ db: { __db: true } }))

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDocsFromCache: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ __collection: name }),
  getDocs: mocks.getDocs,
  getDocsFromCache: mocks.getDocsFromCache,
}))

const { loadCollection, invalidateCollection, ttlFor } =
  await import('@/shared/data/collectionCache')

const snapshotOf = (docs) => ({
  empty: docs.length === 0,
  forEach: (fn) => docs.forEach(d => fn({ id: d.id, data: () => d.data })),
})

/* Each test uses its own collection name, so the module-level cache cannot leak
   between them. The names are arbitrary - ttlFor falls back to the default. */
let n = 0
const freshName = () => `test_collection_${++n}`

/* The freshness marker lives in localStorage, which does not exist under the
   node test environment. Tests that need the disk-cache path stub it. */
let stubbedWindow = false
const stubLocalStorage = (initial = {}) => {
  const store = { ...initial }
  globalThis.window = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
    },
  }
  stubbedWindow = true
  return store
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getDocsFromCache.mockReset()
})

afterEach(() => {
  if (stubbedWindow) { delete globalThis.window; stubbedWindow = false }
})

describe('a successful read', () => {
  it('returns the documents with their ids folded in', async () => {
    const name = freshName()
    mocks.getDocs.mockResolvedValue(snapshotOf([{ id: 'a', data: { n: 1 } }]))

    expect(await loadCollection(name)).toEqual([{ id: 'a', n: 1 }])
    expect(mocks.getDocs).toHaveBeenCalledWith({ __collection: name })
  })

  it('serves the next call from memory without touching Firestore', async () => {
    const name = freshName()
    mocks.getDocs.mockResolvedValue(snapshotOf([{ id: 'a', data: {} }]))

    await loadCollection(name)
    await loadCollection(name)

    expect(mocks.getDocs).toHaveBeenCalledTimes(1)
  })

  it('hands every caller its own array, so one sorting it cannot corrupt another', async () => {
    const name = freshName()
    mocks.getDocs.mockResolvedValue(snapshotOf([
      { id: 'a', data: { n: 1 } }, { id: 'b', data: { n: 2 } },
    ]))

    const first = await loadCollection(name)
    first.reverse()
    const second = await loadCollection(name)

    expect(second.map(d => d.id)).toEqual(['a', 'b'])
  })
})

/*
 * This is the behaviour the products list depends on: a read that fails must
 * reject, so the screen can say something went wrong. If it resolved to an
 * empty array, a shop with 300 products would be shown an empty inventory.
 */
describe('a failed read', () => {
  it('rejects rather than resolving to an empty list', async () => {
    const name = freshName()
    mocks.getDocs.mockRejectedValue(new Error('permission-denied'))

    await expect(loadCollection(name)).rejects.toThrow('permission-denied')
  })

  it('is not cached - the next call retries instead of returning the failure', async () => {
    const name = freshName()
    mocks.getDocs.mockRejectedValueOnce(new Error('offline'))
    mocks.getDocs.mockResolvedValue(snapshotOf([{ id: 'a', data: {} }]))

    await expect(loadCollection(name)).rejects.toThrow('offline')
    expect(await loadCollection(name)).toEqual([{ id: 'a' }])
    expect(mocks.getDocs).toHaveBeenCalledTimes(2)
  })

  it('reaches every concurrent caller, not just the first', async () => {
    const name = freshName()
    mocks.getDocs.mockRejectedValue(new Error('permission-denied'))

    const [a, b] = await Promise.allSettled([loadCollection(name), loadCollection(name)])

    expect(a.status).toBe('rejected')
    expect(b.status).toBe('rejected')
    expect(a.reason.message).toBe('permission-denied')
    expect(b.reason.message).toBe('permission-denied')
  })
})

describe('concurrent callers', () => {
  it('share one request instead of each paying for the collection', async () => {
    const name = freshName()
    let release
    mocks.getDocs.mockReturnValue(new Promise(res => { release = res }))

    const both = Promise.all([loadCollection(name), loadCollection(name)])
    release(snapshotOf([{ id: 'a', data: {} }]))
    const [first, second] = await both

    expect(mocks.getDocs).toHaveBeenCalledTimes(1)
    expect(first).toEqual([{ id: 'a' }])
    expect(second).toEqual([{ id: 'a' }])
  })
})

describe('invalidateCollection', () => {
  it('sends the next read back to the server', async () => {
    const name = freshName()
    mocks.getDocs.mockResolvedValue(snapshotOf([{ id: 'a', data: {} }]))

    await loadCollection(name)
    invalidateCollection(name)
    await loadCollection(name)

    expect(mocks.getDocs).toHaveBeenCalledTimes(2)
  })
})

describe('the disk-cache path', () => {
  it('serves from Firestore disk inside the freshness window, billing nothing', async () => {
    const name = freshName()
    stubLocalStorage({ [`fm:collection-synced:${name}`]: String(Date.now()) })
    mocks.getDocsFromCache.mockResolvedValue(snapshotOf([{ id: 'a', data: { n: 1 } }]))

    expect(await loadCollection(name)).toEqual([{ id: 'a', n: 1 }])
    expect(mocks.getDocsFromCache).toHaveBeenCalledTimes(1)
    expect(mocks.getDocs).not.toHaveBeenCalled()
  })

  /* An empty disk result means the browser cleared it, not that the shop has no
     stock - so it must fall through to the server rather than show nothing. */
  it('goes to the server when the disk copy is empty', async () => {
    const name = freshName()
    stubLocalStorage({ [`fm:collection-synced:${name}`]: String(Date.now()) })
    mocks.getDocsFromCache.mockResolvedValue(snapshotOf([]))
    mocks.getDocs.mockResolvedValue(snapshotOf([{ id: 'a', data: {} }]))

    expect(await loadCollection(name)).toEqual([{ id: 'a' }])
    expect(mocks.getDocs).toHaveBeenCalledTimes(1)
  })

  it('goes to the server when there is no disk cache on this device', async () => {
    const name = freshName()
    stubLocalStorage({ [`fm:collection-synced:${name}`]: String(Date.now()) })
    mocks.getDocsFromCache.mockRejectedValue(new Error('no persistence'))
    mocks.getDocs.mockResolvedValue(snapshotOf([{ id: 'a', data: {} }]))

    expect(await loadCollection(name)).toEqual([{ id: 'a' }])
    expect(mocks.getDocs).toHaveBeenCalledTimes(1)
  })

  it('goes to the server once the window has passed', async () => {
    const name = freshName()
    const longAgo = Date.now() - (ttlFor(name) + 1000)
    stubLocalStorage({ [`fm:collection-synced:${name}`]: String(longAgo) })
    mocks.getDocs.mockResolvedValue(snapshotOf([{ id: 'a', data: {} }]))

    expect(await loadCollection(name)).toEqual([{ id: 'a' }])
    expect(mocks.getDocsFromCache).not.toHaveBeenCalled()
    expect(mocks.getDocs).toHaveBeenCalledTimes(1)
  })
})

describe('ttlFor', () => {
  it('gives each collection the window its volatility deserves', () => {
    expect(ttlFor('customers')).toBe(30 * 60 * 1000)
    expect(ttlFor('service_orders')).toBe(2 * 60 * 1000)
    expect(ttlFor('products')).toBe(2 * 60 * 1000)
  })

  it('falls back to the default for anything unlisted', () => {
    expect(ttlFor('not_a_collection')).toBe(2 * 60 * 1000)
  })
})
