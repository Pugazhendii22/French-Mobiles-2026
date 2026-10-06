import { describe, it, expect } from 'vitest'
import { nextPattern, DOT_IDS, isValidPattern, appendDot, dotAtPoint } from '@/shared/components/patternSequence'

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

describe('appendDot', () => {
  it('adds a dot the line has just reached', () => {
    expect(appendDot([1, 2], 3)).toEqual([1, 2, 3])
  })

  it('starts a pattern from nothing', () => {
    expect(appendDot([], 5)).toEqual([5])
    expect(appendDot(undefined, 5)).toEqual([5])
  })

  it('will not let one dot count twice', () => {
    expect(appendDot([1, 2, 3], 2)).toEqual([1, 2, 3])
    expect(appendDot([1, 2, 3], 3)).toEqual([1, 2, 3])
  })

  it('ignores anything that is not a dot on the grid', () => {
    expect(appendDot([1], 0)).toEqual([1])
    expect(appendDot([1], 10)).toEqual([1])
    expect(appendDot([1], undefined)).toEqual([1])
  })

  it('does not mutate what it was given', () => {
    const before = [1, 2]
    appendDot(before, 3)
    expect(before).toEqual([1, 2])
  })
})

/* The pad is 288px square in the form, laid out as a 3x3 grid of 96px cells. */
const rect = { left: 0, top: 0, width: 288, height: 288 }
const centreOf = (col, row) => [96 * col + 48, 96 * row + 48]

describe('dotAtPoint', () => {
  it('finds the dot under the middle of each cell', () => {
    const expected = [[0, 0, 1], [1, 0, 2], [2, 0, 3], [0, 1, 4], [1, 1, 5],
                      [2, 1, 6], [0, 2, 7], [1, 2, 8], [2, 2, 9]]
    for (const [col, row, id] of expected) {
      expect(dotAtPoint(...centreOf(col, row), rect)).toBe(id)
    }
  })

  /* The reason this is a circle and not a grid cell: a stroke from dot 1 to
     dot 3 passes along the top row and must pick up dot 2 on the way, but a
     stroke from 1 to 9 crosses the corners between dots and must not. */
  it('ignores the gaps between dots', () => {
    expect(dotAtPoint(96, 96, rect)).toBeNull()      // where four cells meet
    expect(dotAtPoint(48, 96, rect)).toBeNull()      // between dot 1 and dot 4
  })

  it('still counts a finger that is off-centre but on the dot', () => {
    expect(dotAtPoint(48 + 30, 48, rect)).toBe(1)
  })

  it('is null outside the pad', () => {
    expect(dotAtPoint(-10, 48, rect)).toBeNull()
    expect(dotAtPoint(48, -10, rect)).toBeNull()
    expect(dotAtPoint(400, 48, rect)).toBeNull()
    expect(dotAtPoint(48, 400, rect)).toBeNull()
  })

  it('reads an offset pad, not just one at the origin', () => {
    const moved = { left: 40, top: 200, width: 288, height: 288 }
    expect(dotAtPoint(40 + 48, 200 + 48, moved)).toBe(1)
    expect(dotAtPoint(48, 48, moved)).toBeNull()
  })

  it('copes with a pad that has not been measured yet', () => {
    expect(dotAtPoint(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull()
    expect(dotAtPoint(10, 10, undefined)).toBeNull()
  })
})
