import { describe, it, expect } from 'vitest'
import { toDateTimeLocal, nowDateTimeLocal, fromDateTimeLocal } from '@/shared/lib/datetime'

/* These run in whatever timezone the machine is set to. Rather than pinning one,
   they assert the property that actually matters: what goes into the field is
   the wall clock the device shows, and the field survives a round trip. The
   old helper failed both of these anywhere but UTC. */

describe('toDateTimeLocal', () => {
  it('shows the local wall clock, not UTC', () => {
    const date = new Date(2026, 9, 6, 19, 3, 20)   // 6 Oct 2026, 7:03:20pm local
    expect(toDateTimeLocal(date)).toBe('2026-10-06T19:03')
  })

  it('pads every part to the width the input needs', () => {
    expect(toDateTimeLocal(new Date(2026, 0, 2, 3, 4))).toBe('2026-01-02T03:04')
  })

  it('reads a Firestore Timestamp', () => {
    const date = new Date(2026, 9, 6, 19, 3)
    expect(toDateTimeLocal({ toDate: () => date })).toBe('2026-10-06T19:03')
  })

  it('is empty rather than "Invalid Date" for junk', () => {
    expect(toDateTimeLocal(undefined)).toBe('')
    expect(toDateTimeLocal(null)).toBe('')
    expect(toDateTimeLocal('')).toBe('')
    expect(toDateTimeLocal('not a date')).toBe('')
  })
})

describe('nowDateTimeLocal', () => {
  it('agrees with the clock on the wall', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      + `-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}`
      + `:${String(now.getMinutes()).padStart(2, '0')}`
    expect(nowDateTimeLocal()).toBe(expected)
  })
})

describe('fromDateTimeLocal', () => {
  it('reads the field back as local time', () => {
    expect(fromDateTimeLocal('2026-10-06T19:03')).toEqual(new Date(2026, 9, 6, 19, 3))
  })

  it('refuses junk instead of returning an Invalid Date', () => {
    expect(fromDateTimeLocal('not a date')).toBeNull()
    expect(fromDateTimeLocal('')).toBeNull()
    expect(fromDateTimeLocal(undefined)).toBeNull()
  })
})

/* The bug this module exists for: the intake form showed a time, saved it,
   reopened it and showed a different one. */
describe('the intake form round trip', () => {
  it('survives being opened and saved over and over', () => {
    const takenIn = new Date(2026, 9, 6, 19, 3)
    let shown = toDateTimeLocal(takenIn)
    expect(shown).toBe('2026-10-06T19:03')

    for (let edit = 0; edit < 5; edit++) {
      const stored = fromDateTimeLocal(shown)
      shown = toDateTimeLocal(stored)
      expect(shown).toBe('2026-10-06T19:03')   // not 13:33, then 08:03, then...
    }
  })
})
