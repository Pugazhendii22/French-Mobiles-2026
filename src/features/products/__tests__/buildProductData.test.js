import { describe, it, expect } from 'vitest'
import { buildProductData } from '@/features/products/ProductForm/buildProductData'

const formData = {
  name: 'Fast Charger',
  brand: 'Nokia',
  category: 'Charger',
  purchasePrice: '120',
  salePrice: '199',
  stock: '10',
  threshold: 5,
  sku: 'SKU-EXISTING',
  notes: '',
  imageUrl: '',
  compatibleModels: [],
}

const build = (overrides = {}) => buildProductData({
  formData: { ...formData, ...(overrides.formData || {}) },
  modelsInput: overrides.modelsInput ?? '',
  localId: overrides.localId ?? null,
  currentUserUid: overrides.currentUserUid ?? 'user-1',
  serialNumber: overrides.serialNumber,
})

describe('stock status', () => {
  it('is "out of stock" at zero', () => {
    expect(build({ formData: { stock: '0' } }).status).toBe('out of stock')
  })

  it('is "low stock" at or below the threshold', () => {
    expect(build({ formData: { stock: '5', threshold: 5 } }).status).toBe('low stock')
    expect(build({ formData: { stock: '3', threshold: 5 } }).status).toBe('low stock')
  })

  it('is "in stock" above the threshold', () => {
    expect(build({ formData: { stock: '6', threshold: 5 } }).status).toBe('in stock')
  })
})

describe('numbers', () => {
  it('coerces prices and stock from the form strings', () => {
    const data = build()
    expect(data.purchasePrice).toBe(120)
    expect(data.salePrice).toBe(199)
    expect(data.stock).toBe(10)
  })
})

describe('sku', () => {
  it('keeps one the user supplied', () => {
    expect(build().sku).toBe('SKU-EXISTING')
  })

  it('generates one when the field is blank', () => {
    const data = build({ formData: { sku: '' } })
    expect(data.sku).toMatch(/^SKU-\d{9}$/)
  })
})

describe('compatible models', () => {
  it('splits the comma-separated input and trims each entry', () => {
    const data = build({ modelsInput: ' Nokia 105 , Nokia 110 ,, ' })
    expect(data.compatibleModels).toEqual(['Nokia 105', 'Nokia 110'])
  })

  it('is an empty array when the input is blank', () => {
    expect(build({ modelsInput: '' }).compatibleModels).toEqual([])
  })
})

describe('create versus update', () => {
  it('stamps createdAt and createdBy on a new product, with no id', () => {
    const data = build({ localId: null })
    expect(data.createdBy).toBe('user-1')
    expect(data.createdAt).toBeTruthy()
    expect(data.id).toBeUndefined()
  })

  it('carries the id and no createdAt on an existing product', () => {
    const data = build({ localId: 'p1' })
    expect(data.id).toBe('p1')
    expect(data.createdAt).toBeUndefined()
    expect(data.createdBy).toBeUndefined()
  })

  it('always stamps updatedAt', () => {
    expect(build().updatedAt).toBeTruthy()
  })
})

describe('serial number', () => {
  it('is included when save-and-print supplies one', () => {
    expect(build({ serialNumber: 'FM-20261001-4821' }).serialNumber).toBe('FM-20261001-4821')
  })

  it('is absent on a plain save', () => {
    expect(build().serialNumber).toBeUndefined()
  })
})

/* Review Focus 4: Number('abc') || 0 is 0, which reads as out of stock. */
describe('non-numeric stock', () => {
  it('becomes zero and therefore "out of stock", never NaN', () => {
    const data = build({ formData: { stock: 'abc' } })
    expect(data.stock).toBe(0)
    expect(data.status).toBe('out of stock')
    expect(Number.isNaN(data.stock)).toBe(false)
  })
})

/* Review Focus 5: existing quirk, pinned so it reads as known. */
describe('a threshold of zero', () => {
  it('becomes 5, because Number(0) || 5 is 5', () => {
    const data = build({ formData: { stock: '3', threshold: 0 } })
    expect(data.threshold).toBe(5)
    expect(data.status).toBe('low stock')
  })
})
