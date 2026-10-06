import { describe, it, expect } from 'vitest'
import { normalizeIndianPhone, isSamePhone } from '@/shared/lib/phone'

describe('normalizeIndianPhone', () => {
  it('keeps a plain ten-digit mobile', () => {
    expect(normalizeIndianPhone('9876543210')).toBe('9876543210')
  })

  it('strips the formatting people type', () => {
    expect(normalizeIndianPhone('98765 43210')).toBe('9876543210')
    expect(normalizeIndianPhone('98765-43210')).toBe('9876543210')
    expect(normalizeIndianPhone(' 9876543210 ')).toBe('9876543210')
  })

  it('strips an Indian country code, written either way', () => {
    expect(normalizeIndianPhone('+91 98765 43210')).toBe('9876543210')
    expect(normalizeIndianPhone('919876543210')).toBe('9876543210')
    expect(normalizeIndianPhone('09876543210')).toBe('9876543210')
  })

  it('refuses what is not an Indian mobile', () => {
    expect(normalizeIndianPhone('+1 555 0100')).toBeNull()   // foreign
    expect(normalizeIndianPhone('1234567890')).toBeNull()    // does not start 6-9
    expect(normalizeIndianPhone('98765')).toBeNull()         // too short
    expect(normalizeIndianPhone('')).toBeNull()
    expect(normalizeIndianPhone(null)).toBeNull()
  })
})

/* The duplicate-customer bug: the service list filed a second record for someone
   whose number was typed in a different shape to the one already stored. */
describe('isSamePhone', () => {
  it('sees through formatting', () => {
    expect(isSamePhone('98765 43210', '9876543210')).toBe(true)
    expect(isSamePhone('+91 98765 43210', '9876543210')).toBe(true)
    expect(isSamePhone('09876543210', '+919876543210')).toBe(true)
  })

  it('still tells two people apart', () => {
    expect(isSamePhone('9876543210', '9876543211')).toBe(false)
  })

  it('compares exactly when a number is not a recognised mobile', () => {
    expect(isSamePhone('0413 2234567', '0413 2234567')).toBe(true)
    expect(isSamePhone('0413 2234567', '0413 2234568')).toBe(false)
  })

  it('does not call two blanks the same customer as a real number', () => {
    expect(isSamePhone('', '9876543210')).toBe(false)
    expect(isSamePhone(undefined, '9876543210')).toBe(false)
  })
})
