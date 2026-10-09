import { describe, it, expect } from 'vitest'
import {
  AVAILABLE, REPAIRING, SOLD,
  stockStateOf, stockMetaOf, isSellable, isBeingRepaired, statusForSave,
} from '@/features/inventory/stockState'

describe('stockStateOf', () => {
  it('reads the three states', () => {
    expect(stockStateOf({ status: AVAILABLE })).toBe(AVAILABLE)
    expect(stockStateOf({ status: REPAIRING })).toBe(REPAIRING)
    expect(stockStateOf({ status: SOLD })).toBe(SOLD)
  })

  /* Records written before the form set a status at all. */
  it('treats a device with no status as plain stock', () => {
    expect(stockStateOf({})).toBe(AVAILABLE)
    expect(stockStateOf({ status: '' })).toBe(AVAILABLE)
    expect(stockStateOf(undefined)).toBe(AVAILABLE)
  })

  it('treats a status it does not recognise as plain stock, not as sellable-unknown', () => {
    expect(stockStateOf({ status: 'reserved' })).toBe(AVAILABLE)
  })
})

describe('can I sell it', () => {
  it('yes, when it is in stock', () => {
    expect(isSellable({ status: AVAILABLE })).toBe(true)
    expect(isSellable({})).toBe(true)
  })

  /* The whole point: a phone in pieces must not offer itself on a bill. */
  it('no, while the shop is still repairing it', () => {
    expect(isSellable({ status: REPAIRING })).toBe(false)
    expect(isBeingRepaired({ status: REPAIRING })).toBe(true)
  })

  it('no, once it has gone', () => {
    expect(isSellable({ status: SOLD })).toBe(false)
  })
})

describe('the spine down the row', () => {
  it('gives each state its own colour and words', () => {
    expect(stockMetaOf({ status: AVAILABLE }).label).toBe('In stock')
    expect(stockMetaOf({ status: REPAIRING }).label).toBe('Being repaired')
    expect(stockMetaOf({ status: SOLD }).label).toBe('Sold')

    const colours = [AVAILABLE, REPAIRING, SOLD].map(s => stockMetaOf({ status: s }).spine)
    expect(new Set(colours).size).toBe(3)
  })

  it('always has something to draw, whatever the record says', () => {
    expect(stockMetaOf({}).spine).toBeTruthy()
    expect(stockMetaOf({ status: 'nonsense' }).spine).toBeTruthy()
  })
})

describe('what gets stored when a purchase is saved', () => {
  it('marks it under repair when the form says it is not ready', () => {
    expect(statusForSave({ current: AVAILABLE, stillBeingRepaired: true })).toBe(REPAIRING)
  })

  it('puts it back on the shelf when the work is done', () => {
    expect(statusForSave({ current: REPAIRING, stillBeingRepaired: false })).toBe(AVAILABLE)
  })

  it('leaves plain stock alone', () => {
    expect(statusForSave({ current: AVAILABLE, stillBeingRepaired: false })).toBe(AVAILABLE)
  })

  /* Editing the record of a device already out of the shop must not resurrect it. */
  it('never moves a sold device, whatever the form says', () => {
    expect(statusForSave({ current: SOLD, stillBeingRepaired: true })).toBe(SOLD)
    expect(statusForSave({ current: SOLD, stillBeingRepaired: false })).toBe(SOLD)
  })

  it('defaults to plain stock for a brand-new purchase', () => {
    expect(statusForSave({})).toBe(AVAILABLE)
    expect(statusForSave()).toBe(AVAILABLE)
  })
})
