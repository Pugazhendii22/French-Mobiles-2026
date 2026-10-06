import { describe, it, expect } from 'vitest'
import { nextPattern, DOT_IDS, isValidPattern } from '@/shared/components/patternSequence'

describe('the grid', () => {
  it('is the nine dots of a phone lock screen', () => {
    expect(DOT_IDS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('tapping a dot that is not in the pattern', () => {
  it('adds it to the end', () => {
    expect(nextPattern([], 5)).toEqual([5])
    expect(nextPattern([1, 2], 3)).toEqual([1, 2, 3])
  })

  it('keeps the order they were tapped in, which is the whole point', () => {
    let p = []
    for (const id of [3, 1, 9, 5]) p = nextPattern(p, id)
    expect(p).toEqual([3, 1, 9, 5])
  })

  it('allows all nine', () => {
    let p = []
    for (const id of DOT_IDS) p = nextPattern(p, id)
    expect(p).toEqual(DOT_IDS)
  })
})

/* One wrong dot used to mean clearing the whole thing and starting again. */
describe('tapping the dot you just tapped', () => {
  it('takes it back off', () => {
    expect(nextPattern([1, 2, 3], 3)).toEqual([1, 2])
  })

  it('empties the pattern when it was the only one', () => {
    expect(nextPattern([7], 7)).toEqual([])
  })
})

/* Tapping back to a dot rewinds to it, so a pattern entered wrongly halfway
   can be corrected without retyping the start of it. */
describe('tapping a dot from earlier in the pattern', () => {
  it('rewinds to that dot', () => {
    expect(nextPattern([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3])
  })

  it('rewinds to the first dot', () => {
    expect(nextPattern([4, 5, 6], 4)).toEqual([4])
  })
})

describe('nextPattern never mutates what it was given', () => {
  it('leaves the original alone', () => {
    const before = [1, 2, 3]
    nextPattern(before, 4)
    nextPattern(before, 3)
    nextPattern(before, 1)
    expect(before).toEqual([1, 2, 3])
  })
})

describe('rubbish input', () => {
  it('ignores a dot that is not on the grid', () => {
    expect(nextPattern([1], 0)).toEqual([1])
    expect(nextPattern([1], 10)).toEqual([1])
    expect(nextPattern([1], undefined)).toEqual([1])
  })

  it('treats a missing pattern as an empty one', () => {
    expect(nextPattern(undefined, 4)).toEqual([4])
    expect(nextPattern(null, 4)).toEqual([4])
  })
})

/* What comes back from Firestore has been through JSON and older builds. */
describe('isValidPattern', () => {
  it('accepts a real pattern', () => {
    expect(isValidPattern([1, 5, 9])).toBe(true)
    expect(isValidPattern([])).toBe(true)
  })

  it('rejects anything that is not a list of distinct grid dots', () => {
    expect(isValidPattern(null)).toBe(false)
    expect(isValidPattern('159')).toBe(false)
    expect(isValidPattern([1, 1, 2])).toBe(false)
    expect(isValidPattern([0, 5])).toBe(false)
    expect(isValidPattern([1, '5'])).toBe(false)
  })
})
