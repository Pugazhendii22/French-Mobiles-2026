import { describe, it, expect } from 'vitest'
import {
  normalizeDate, isClosed, isOverdue, isDueToday,
  stateOf, STATE_META, stateMetaOf, matchesTab, TABS,
  requireOrderDates, DATE_ERROR,
  statusOptionsFor, STATUSES,
} from '@/features/service/orderState'

const NOW = new Date('2026-10-06T14:00:00')
const at = (iso) => ({ expectedCompletionAt: iso, status: 'In Progress' })

describe('normalizeDate', () => {
  it('reads an ISO string', () => {
    expect(normalizeDate('2026-10-06T10:00:00')?.getFullYear()).toBe(2026)
  })

  /* Some orders were written with a Firestore Timestamp and some with a
     string, so both shapes turn up in the same list. */
  it('reads a Firestore timestamp', () => {
    const stamp = { toDate: () => new Date('2026-10-06T10:00:00') }
    expect(normalizeDate(stamp)?.getHours()).toBe(10)
  })

  it('returns null rather than an Invalid Date', () => {
    expect(normalizeDate('not a date')).toBeNull()
    expect(normalizeDate(null)).toBeNull()
    expect(normalizeDate(undefined)).toBeNull()
    expect(normalizeDate('')).toBeNull()
  })
})

describe('isClosed', () => {
  it('counts a completed order as closed', () => expect(isClosed('Completed')).toBe(true))
  it('counts a returned order as closed', () => expect(isClosed('Returned')).toBe(true))
  it('counts everything else as still open', () => {
    expect(isClosed('Received')).toBe(false)
    expect(isClosed('In Progress')).toBe(false)
    expect(isClosed('Parts Awaiting')).toBe(false)
    expect(isClosed('Awaiting Customer Approval')).toBe(false)
    expect(isClosed(undefined)).toBe(false)
  })
})

describe('isOverdue', () => {
  it('is overdue once the promised time has passed', () => {
    expect(isOverdue(at('2026-10-06T09:00:00'), NOW)).toBe(true)
  })

  it('is not overdue while there is still time', () => {
    expect(isOverdue(at('2026-10-06T18:00:00'), NOW)).toBe(false)
  })

  /* A finished order cannot be late. Leaving these red meant the list stayed
     full of alarms for work that was already handed back. */
  it('is never overdue once the order is closed', () => {
    expect(isOverdue({ expectedCompletionAt: '2026-01-01', status: 'Completed' }, NOW)).toBe(false)
    expect(isOverdue({ expectedCompletionAt: '2026-01-01', status: 'Returned' }, NOW)).toBe(false)
  })

  it('is not overdue when no date was ever promised', () => {
    expect(isOverdue({ status: 'In Progress' }, NOW)).toBe(false)
  })
})

describe('isDueToday', () => {
  it('is due today at any hour of today, including one already past', () => {
    expect(isDueToday(at('2026-10-06T09:00:00'), NOW)).toBe(true)
    expect(isDueToday(at('2026-10-06T23:30:00'), NOW)).toBe(true)
  })

  it('is not due today for tomorrow or yesterday', () => {
    expect(isDueToday(at('2026-10-07T09:00:00'), NOW)).toBe(false)
    expect(isDueToday(at('2026-10-05T09:00:00'), NOW)).toBe(false)
  })

  it('is not due today once the order is closed', () => {
    expect(isDueToday({ expectedCompletionAt: '2026-10-06T09:00:00', status: 'Completed' }, NOW)).toBe(false)
  })
})

/* The one question the list has to answer at a glance: what do I have to do
   about this phone. Three answers, so three colours. */
describe('stateOf', () => {
  it('is overdue when it is late, whatever the status says', () => {
    expect(stateOf({ expectedCompletionAt: '2026-10-05', status: 'Parts Awaiting' }, NOW)).toBe('overdue')
  })

  it('is open while it is in the shop', () => {
    expect(stateOf({ expectedCompletionAt: '2026-10-08', status: 'In Progress' }, NOW)).toBe('open')
    expect(stateOf({ status: 'Received' }, NOW)).toBe('open')
  })

  it('is closed once it is completed or returned', () => {
    expect(stateOf({ status: 'Completed' }, NOW)).toBe('closed')
    expect(stateOf({ status: 'Returned' }, NOW)).toBe('closed')
  })

  /* Closed wins over late: a job handed back last month is not an alarm. */
  it('prefers closed over overdue', () => {
    expect(stateOf({ expectedCompletionAt: '2026-01-01', status: 'Completed' }, NOW)).toBe('closed')
  })
})

describe('stateMetaOf', () => {
  it('gives every state a label and a colour', () => {
    Object.keys(STATE_META).forEach(key => {
      expect(STATE_META[key].label).toBeTruthy()
      expect(STATE_META[key].spine).toMatch(/^#[0-9A-Fa-f]{6}$/)
    })
  })

  it('answers for an order directly', () => {
    expect(stateMetaOf({ status: 'Completed' }, NOW)).toBe(STATE_META.closed)
  })

  it('falls back to open rather than returning nothing', () => {
    expect(stateMetaOf({}, NOW)).toBe(STATE_META.open)
  })
})

describe('matchesTab', () => {
  const open = { status: 'In Progress', expectedCompletionAt: '2026-10-09' }
  const late = { status: 'In Progress', expectedCompletionAt: '2026-10-01' }
  const today = { status: 'In Progress', expectedCompletionAt: '2026-10-06T17:00:00' }
  const done = { status: 'Completed' }
  const back = { status: 'Returned' }

  /* The tab the page opens on. The job at the counter is the work still in the
     shop; finished orders are history. */
  it('Open holds everything still in the shop, and nothing finished', () => {
    expect(matchesTab(open, 'Open', NOW)).toBe(true)
    expect(matchesTab(late, 'Open', NOW)).toBe(true)
    expect(matchesTab(today, 'Open', NOW)).toBe(true)
    expect(matchesTab(done, 'Open', NOW)).toBe(false)
    expect(matchesTab(back, 'Open', NOW)).toBe(false)
  })

  it('All holds everything', () => {
    [open, late, today, done, back].forEach(o =>
      expect(matchesTab(o, 'All', NOW)).toBe(true))
  })

  it('Overdue holds only what is late', () => {
    expect(matchesTab(late, 'Overdue', NOW)).toBe(true)
    expect(matchesTab(open, 'Overdue', NOW)).toBe(false)
  })

  it('Due Today holds only what is promised today', () => {
    expect(matchesTab(today, 'Due Today', NOW)).toBe(true)
    expect(matchesTab(open, 'Due Today', NOW)).toBe(false)
  })

  it('a status tab holds exactly that status', () => {
    expect(matchesTab(done, 'Completed', NOW)).toBe(true)
    expect(matchesTab(open, 'Completed', NOW)).toBe(false)
    expect(matchesTab(open, 'In Progress', NOW)).toBe(true)
  })

  it('offers Open first, because that is where the page lands', () => {
    expect(TABS[0]).toBe('Open')
  })
})

describe('requireOrderDates', () => {
  it('gives back both dates when both are usable', () => {
    const { received, expected } = requireOrderDates('2026-10-06T10:00', '2026-10-08T17:00')
    expect(received.getHours()).toBe(10)
    expect(expected.getDate()).toBe(8)
  })

  /* The divergence this was extracted to close: Save refused these and
     Save & Print wrote them to Firestore as an Invalid Date. */
  it('refuses an unparseable date rather than passing it on', () => {
    expect(() => requireOrderDates('not a date', '2026-10-08T17:00')).toThrow(DATE_ERROR)
    expect(() => requireOrderDates('2026-10-06T10:00', 'not a date')).toThrow(DATE_ERROR)
  })

  it('refuses a missing date', () => {
    expect(() => requireOrderDates('', '2026-10-08T17:00')).toThrow(DATE_ERROR)
    expect(() => requireOrderDates('2026-10-06T10:00', null)).toThrow(DATE_ERROR)
    expect(() => requireOrderDates(undefined, undefined)).toThrow(DATE_ERROR)
  })

  it('accepts a Firestore timestamp, as an edited order carries', () => {
    const stamp = (iso) => ({ toDate: () => new Date(iso) })
    const { expected } = requireOrderDates(stamp('2026-10-06T10:00'), stamp('2026-10-08T17:00'))
    expect(expected.getDate()).toBe(8)
  })
})

describe('statusOptionsFor', () => {
  it('never offers Completed, to anyone', () => {
    for (const current of STATUSES) {
      expect(statusOptionsFor(current, { isAdmin: true })).not.toContain('Completed')
      expect(statusOptionsFor(current, { isAdmin: false })).not.toContain('Completed')
    }
  })

  it('gives an admin every open status', () => {
    expect(statusOptionsFor('In Progress', { isAdmin: true })).toEqual([
      'Received', 'In Progress', 'Parts Awaiting', 'Awaiting Customer Approval', 'Returned',
    ])
  })

  it('will not send an order back to Received once it has moved on', () => {
    expect(statusOptionsFor('In Progress')).not.toContain('Received')
    expect(statusOptionsFor('Parts Awaiting')).not.toContain('Received')
  })

  it('offers Received while that is where the order still is', () => {
    expect(statusOptionsFor('Received')).toContain('Received')
  })

  /* The dead end the old positional rule created. */
  it('lets an approved order go back on the bench', () => {
    const options = statusOptionsFor('Awaiting Customer Approval')
    expect(options).toContain('In Progress')
    expect(options).toContain('Parts Awaiting')
  })

  it('does not depend on where a status sits in the list', () => {
    // Every active status reaches every other one, whatever the array order.
    const active = ['In Progress', 'Parts Awaiting', 'Awaiting Customer Approval']
    for (const from of active) {
      for (const to of active) expect(statusOptionsFor(from)).toContain(to)
    }
  })

  it('always includes where the order actually is', () => {
    for (const current of STATUSES.filter(s => s !== 'Completed')) {
      expect(statusOptionsFor(current)).toContain(current)
    }
  })

  it('shows a status this build does not recognise rather than hiding it', () => {
    expect(statusOptionsFor('Recieved')).toContain('Recieved')
    expect(statusOptionsFor('Recieved')[0]).toBe('Recieved')
  })

  it('copes with no status at all', () => {
    expect(statusOptionsFor(undefined)).not.toContain('Completed')
    expect(statusOptionsFor(undefined).length).toBeGreaterThan(0)
  })
})
