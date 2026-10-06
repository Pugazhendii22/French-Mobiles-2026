import { describe, it, expect } from 'vitest'
import { validateProductForm } from '@/features/products/ProductForm/validateProductForm'

const filled = { name: 'Fast Charger', salePrice: '199', stock: '10' }

describe('a complete form', () => {
  it('has no errors and no field to scroll to', () => {
    expect(validateProductForm(filled)).toEqual({ errors: {}, firstErrorField: null })
  })
})

describe('missing values', () => {
  it('requires a name', () => {
    const { errors, firstErrorField } = validateProductForm({ ...filled, name: '' })
    expect(errors.name).toBe('Product name is required')
    expect(firstErrorField).toBe('name')
  })

  it('requires a sale price', () => {
    const { errors } = validateProductForm({ ...filled, salePrice: '' })
    expect(errors.salePrice).toBe('Sale price is required')
  })

  it('requires a stock quantity', () => {
    const { errors } = validateProductForm({ ...filled, stock: '' })
    expect(errors.stock).toBe('Stock quantity is required')
  })

  it('treats undefined and null as missing', () => {
    expect(validateProductForm({}).errors).toEqual({
      name: 'Product name is required',
      salePrice: 'Sale price is required',
      stock: 'Stock quantity is required',
    })
    expect(validateProductForm({ name: null, salePrice: null, stock: null }).errors.stock)
      .toBe('Stock quantity is required')
  })

  it('reports the topmost missing field first, so the form scrolls there', () => {
    const { firstErrorField } = validateProductForm({ name: '', salePrice: '', stock: '' })
    expect(firstErrorField).toBe('name')
    expect(validateProductForm({ ...filled, salePrice: '', stock: '' }).firstErrorField)
      .toBe('salePrice')
  })
})

/*
 * A sold-out product has stock 0, and an edit seeds the form straight from the
 * Firestore document - where stock is a number, not a string. The old check was
 * `!formData.stock`, so 0 read as missing and the save was refused: you could
 * not change the price of anything that had sold out without first editing its
 * stock count. Same trap for a product given away at no charge.
 */
describe('zero is a value, not a missing field', () => {
  it('accepts stock 0 - the sold-out case', () => {
    const { errors, firstErrorField } = validateProductForm({ ...filled, stock: 0 })
    expect(errors).toEqual({})
    expect(firstErrorField).toBeNull()
  })

  it('accepts stock "0" as typed into the field', () => {
    expect(validateProductForm({ ...filled, stock: '0' }).errors).toEqual({})
  })

  it('accepts salePrice 0', () => {
    expect(validateProductForm({ ...filled, salePrice: 0 }).errors).toEqual({})
  })

  it('accepts a product that is both free and sold out', () => {
    expect(validateProductForm({ name: 'Promo sticker', salePrice: 0, stock: 0 }).errors)
      .toEqual({})
  })
})
