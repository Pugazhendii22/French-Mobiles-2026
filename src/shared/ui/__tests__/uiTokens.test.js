import { describe, it, expect } from 'vitest'
import { money, gradeOf } from '@/shared/ui/uiTokens'

describe('money', () => {
  it('groups the Indian way, not the western one', () => {
    expect(money(125000)).toBe('₹1,25,000')     // not ₹125,000
    expect(money(1250000)).toBe('₹12,50,000')   // not ₹1,250,000
  })

  it('leaves small amounts alone', () => {
    expect(money(0)).toBe('₹0')
    expect(money(50)).toBe('₹50')
    expect(money(1800)).toBe('₹1,800')
  })

  it('reads a number held as a string, which is what the forms hold', () => {
    expect(money('1800')).toBe('₹1,800')
    expect(money('125000')).toBe('₹1,25,000')
  })

  it('shows nothing-yet as zero rather than NaN or blank', () => {
    expect(money(undefined)).toBe('₹0')
    expect(money(null)).toBe('₹0')
    expect(money('')).toBe('₹0')
  })

  it('keeps a negative, which a loss has to show', () => {
    expect(money(-2500)).toBe('₹-2,500')
  })
})

describe('gradeOf', () => {
  it('gives one name per grade, so two screens cannot disagree', () => {
    expect(gradeOf('Light wear').label).toBeTruthy()
    expect(gradeOf('nonsense').label).toBe('Not graded')
  })
})
