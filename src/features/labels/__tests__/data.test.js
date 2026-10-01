import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/firebase/firebase', () => ({ db: { __db: true } }))
vi.mock('@/shared/data/counters', () => ({ nextLabelNumber: vi.fn(async () => 26042) }))

const snapshotOf = (docs) => ({
  empty: docs.length === 0,
  docs: docs.map(d => ({ id: d.id, data: () => d.data })),
})

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  addDoc: vi.fn(async () => ({ id: 'new-label-id' })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ __collection: name }),
  doc: (_db, name, id) => ({ __doc: `${name}/${id}` }),
  query: (coll, ...constraints) => ({ coll, constraints }),
  where: (field, op, value) => ({ type: 'where', field, op, value }),
  limit: (n) => ({ type: 'limit', n }),
  getDocs: mocks.getDocs,
  addDoc: mocks.addDoc,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
}))

const {
  getLabelNumber, findLabel, lookupLabel, createLabelEntry,
  createLabelEntryKeyedByNumber, syncLabelSnapshot, withLiveLabelData,
  secondHandLabelData,
} = await import('@/features/labels/data')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.addDoc.mockResolvedValue({ id: 'new-label-id' })
})

describe('getLabelNumber', () => {
  it('comes from the atomic counter', async () => {
    expect(await getLabelNumber()).toBe(26042)
  })
})

describe('findLabel', () => {
  it('queries label_registry by referenceId and labelType', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([
      { id: 'abc', data: { labelNumber: 26001, labelType: 'product' } },
    ]))

    const found = await findLabel('product', 'prod-1')

    expect(found).toEqual({ id: 'abc', labelNumber: 26001, labelType: 'product' })
    const { coll, constraints } = mocks.getDocs.mock.calls[0][0]
    expect(coll).toEqual({ __collection: 'label_registry' })
    expect(constraints).toEqual([
      { type: 'where', field: 'referenceId', op: '==', value: 'prod-1' },
      { type: 'where', field: 'labelType', op: '==', value: 'product' },
    ])
  })

  it('returns null when the record has no label', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([]))
    expect(await findLabel('product', 'prod-1')).toBeNull()
  })

  it('does not query at all when either argument is missing', async () => {
    expect(await findLabel('product', undefined)).toBeNull()
    expect(await findLabel(undefined, 'prod-1')).toBeNull()
    expect(mocks.getDocs).not.toHaveBeenCalled()
  })
})

describe('lookupLabel', () => {
  it('queries by labelNumber with limit 1', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([
      { id: 'xyz', data: { labelNumber: 26001, referenceId: 'prod-1' } },
    ]))

    const found = await lookupLabel('26001')

    expect(found.referenceId).toBe('prod-1')
    const { constraints } = mocks.getDocs.mock.calls[0][0]
    expect(constraints).toEqual([
      { type: 'where', field: 'labelNumber', op: '==', value: 26001 },
      { type: 'limit', n: 1 },
    ])
  })

  it('returns null for a non-numeric barcode without querying', async () => {
    expect(await lookupLabel('not-a-number')).toBeNull()
    expect(mocks.getDocs).not.toHaveBeenCalled()
  })
})

describe('the two write shapes', () => {
  it('createLabelEntry lets Firestore pick the document id', async () => {
    const id = await createLabelEntry({ labelNumber: 26003 })
    expect(id).toBe('new-label-id')
    expect(mocks.addDoc).toHaveBeenCalledWith(
      { __collection: 'label_registry' },
      { labelNumber: 26003 },
    )
  })

  it('createLabelEntryKeyedByNumber uses the label number as the document id', async () => {
    await createLabelEntryKeyedByNumber(26004, { labelNumber: 26004 })
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { __doc: 'label_registry/26004' },
      { labelNumber: 26004 },
    )
  })
})

describe('syncLabelSnapshot', () => {
  it('merges the live data over each matching label snapshot', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([
      { id: 'l1', data: { data: { salePrice: 100, brand: 'Nokia' } } },
    ]))

    await syncLabelSnapshot('product', 'prod-1', { salePrice: 250 })

    expect(mocks.updateDoc).toHaveBeenCalledTimes(1)
    const [ref, patch] = mocks.updateDoc.mock.calls[0]
    expect(ref).toEqual({ __doc: 'label_registry/l1' })
    expect(patch.data).toEqual({ salePrice: 250, brand: 'Nokia' })
    expect(patch.updatedAt).toBeTruthy()
  })

  it('refreshes every label assigned to the record, not just the first', async () => {
    mocks.getDocs.mockResolvedValue(snapshotOf([
      { id: 'l1', data: { data: {} } },
      { id: 'l2', data: { data: {} } },
    ]))

    await syncLabelSnapshot('product', 'prod-1', { salePrice: 250 })

    expect(mocks.updateDoc).toHaveBeenCalledTimes(2)
  })

  it('never throws when the refresh fails - a save must not fail over a label', async () => {
    mocks.getDocs.mockRejectedValue(new Error('permission-denied'))
    await expect(syncLabelSnapshot('product', 'prod-1', { salePrice: 250 })).resolves.toBeUndefined()
  })

  it('does nothing when either argument is missing', async () => {
    await syncLabelSnapshot(undefined, 'prod-1', {})
    await syncLabelSnapshot('product', undefined, {})
    expect(mocks.getDocs).not.toHaveBeenCalled()
  })
})

describe('withLiveLabelData', () => {
  it('lays the live record over the stored snapshot', () => {
    const entry = { labelNumber: 1, data: { salePrice: 100, brand: 'Nokia' } }
    expect(withLiveLabelData(entry, { salePrice: 250 })).toEqual({
      labelNumber: 1,
      data: { salePrice: 250, brand: 'Nokia' },
    })
  })

  it('passes a missing entry straight through', () => {
    expect(withLiveLabelData(null, { salePrice: 250 })).toBeNull()
  })
})

describe('secondHandLabelData', () => {
  it('maps notes to specialNotes and coerces prices to numbers', () => {
    const data = secondHandLabelData({ notes: 'cracked back', salePrice: '7500' })
    expect(data.specialNotes).toBe('cracked back')
    expect(data.salePrice).toBe(7500)
  })

  it('returns empty strings and zeros for a blank record', () => {
    const data = secondHandLabelData()
    expect(data.brand).toBe('')
    expect(data.purchasePrice).toBe(0)
  })
})
