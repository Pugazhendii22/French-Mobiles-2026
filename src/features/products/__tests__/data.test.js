import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/firebase/firebase', () => ({ db: { __db: true } }))

const mocks = vi.hoisted(() => ({
  loadCollection: vi.fn(),
  invalidateCollection: vi.fn(),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
}))

vi.mock('@/shared/data/collectionCache', () => ({
  loadCollection: mocks.loadCollection,
  invalidateCollection: mocks.invalidateCollection,
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ __collection: name }),
  doc: (_db, name, id) => ({ __doc: `${name}/${id}` }),
  getDoc: mocks.getDoc,
  addDoc: mocks.addDoc,
  updateDoc: mocks.updateDoc,
  deleteDoc: mocks.deleteDoc,
}))

const {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
} = await import('@/features/products/data')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.addDoc.mockResolvedValue({ id: 'new-product-id' })
})

describe('listProducts', () => {
  it('reads the products collection through the cache', async () => {
    mocks.loadCollection.mockResolvedValue([{ id: 'p1', name: 'Charger' }])

    const list = await listProducts()

    expect(mocks.loadCollection).toHaveBeenCalledWith('products')
    expect(list).toEqual([{ id: 'p1', name: 'Charger' }])
  })

  it('does not sort - the list page owns display order', async () => {
    mocks.loadCollection.mockResolvedValue([
      { id: 'a', createdAt: '2026-01-01' },
      { id: 'b', createdAt: '2026-09-01' },
    ])

    const list = await listProducts()

    expect(list.map(p => p.id)).toEqual(['a', 'b'])
  })
})

describe('getProduct', () => {
  it('returns the document with its id folded in', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      id: 'p1',
      data: () => ({ name: 'Charger', stock: 4 }),
    })

    expect(await getProduct('p1')).toEqual({ id: 'p1', name: 'Charger', stock: 4 })
    expect(mocks.getDoc).toHaveBeenCalledWith({ __doc: 'products/p1' })
  })
})

describe('createProduct', () => {
  it('adds the document and returns its new id', async () => {
    const id = await createProduct({ name: 'Cable' })

    expect(mocks.addDoc).toHaveBeenCalledWith({ __collection: 'products' }, { name: 'Cable' })
    expect(id).toBe('new-product-id')
  })

  it('invalidates the cache so the next list read is fresh', async () => {
    await createProduct({ name: 'Cable' })
    expect(mocks.invalidateCollection).toHaveBeenCalledWith('products')
  })
})

describe('updateProduct', () => {
  it('updates the document and returns the id', async () => {
    expect(await updateProduct('p1', { stock: 9 })).toBe('p1')
    expect(mocks.updateDoc).toHaveBeenCalledWith({ __doc: 'products/p1' }, { stock: 9 })
  })
})

describe('deleteProduct', () => {
  it('deletes the document and invalidates the cache', async () => {
    await deleteProduct('p1')
    expect(mocks.deleteDoc).toHaveBeenCalledWith({ __doc: 'products/p1' })
    expect(mocks.invalidateCollection).toHaveBeenCalledWith('products')
  })
})

/* Review Focus 1: a failed read must not look like an empty shop. */
describe('a failing collection read', () => {
  it('rejects instead of resolving to an empty list', async () => {
    mocks.loadCollection.mockRejectedValue(new Error('permission-denied'))
    await expect(listProducts()).rejects.toThrow('permission-denied')
  })
})

/* Review Focus 2: ProductView renders "Product not found" off exactly this. */
describe('getProduct for an unknown id', () => {
  it('returns null rather than throwing or returning a partial object', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false, id: 'gone', data: () => undefined })
    expect(await getProduct('gone')).toBeNull()
  })
})

/* Review Focus 3: the save-and-print label write is a two-field update. */
describe('a partial update', () => {
  it('still invalidates the cache', async () => {
    await updateProduct('p1', { assignedLabelNumber: 26007, serialNumber: 'FM-20261001-4821' })

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { __doc: 'products/p1' },
      { assignedLabelNumber: 26007, serialNumber: 'FM-20261001-4821' },
    )
    expect(mocks.invalidateCollection).toHaveBeenCalledWith('products')
  })
})
