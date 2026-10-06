import { describe, it, expect } from 'vitest'
import {
  staffNameOf, matchStaffByName, technicianOptions, technicianFor,
} from '@/features/service/technician'

const STAFF = [
  { uid: 'u-ravi', name: 'Ravi Kumar', role: 'technician' },
  { uid: 'u-anand', name: 'Anand', role: 'technician' },
  { uid: 'u-noname', email: 'suresh@shop.in' },
]

describe('technicianOptions', () => {
  it('offers the names, not the ids', () => {
    expect(technicianOptions(STAFF)).toEqual(['Ravi Kumar', 'Anand', 'suresh@shop.in'])
  })

  it('copes with no staff loaded yet', () => {
    expect(technicianOptions([])).toEqual([])
    expect(technicianOptions(undefined)).toEqual([])
  })
})

describe('matchStaffByName', () => {
  it('finds a staff member however the name was cased or spaced', () => {
    expect(matchStaffByName(STAFF, 'ravi kumar')?.uid).toBe('u-ravi')
    expect(matchStaffByName(STAFF, '  Ravi Kumar  ')?.uid).toBe('u-ravi')
  })

  it('falls back to the email for staff with no name', () => {
    expect(matchStaffByName(STAFF, 'suresh@shop.in')?.uid).toBe('u-noname')
  })

  it('is null for somebody who does not work here', () => {
    expect(matchStaffByName(STAFF, 'Kumar Mobile Service')).toBeNull()
    expect(matchStaffByName(STAFF, '')).toBeNull()
    expect(matchStaffByName(STAFF, '   ')).toBeNull()
  })

  it('does not match on a partial name', () => {
    expect(matchStaffByName(STAFF, 'Ravi')).toBeNull()
  })
})

describe('picking a technician off the list', () => {
  it('sets the name and the id to that person', () => {
    expect(technicianFor({ typed: 'Anand', staffOptions: STAFF, fallbackUid: 'u-admin' })).toEqual({
      technicianName: 'Anand', technicianUid: 'u-anand', isOutside: false,
    })
  })

  it('moves the order to them, off whoever had it', () => {
    const r = technicianFor({ typed: 'Anand', staffOptions: STAFF, previousUid: 'u-ravi' })
    expect(r.technicianUid).toBe('u-anand')
  })

  it('tidies the casing to what the staff list says', () => {
    expect(technicianFor({ typed: 'ANAND', staffOptions: STAFF }).technicianName).toBe('Anand')
  })
})

/* The repair shop down the road, and the technician who has left. */
describe('typing a name from outside the shop', () => {
  it('keeps the typed name exactly as written', () => {
    const r = technicianFor({ typed: 'Kumar Mobile Service', staffOptions: STAFF, previousUid: 'u-ravi' })
    expect(r.technicianName).toBe('Kumar Mobile Service')
    expect(r.isOutside).toBe(true)
  })

  /* The whole reason this module exists: technicianUid is the staff filter on the
     service list and the check behind canEditOrder, canComplete and
     canChangeStatus. Losing it hides the order from everyone but an admin. */
  it('leaves the order with whoever in the shop already had it', () => {
    const r = technicianFor({ typed: 'Kumar Mobile Service', staffOptions: STAFF, previousUid: 'u-ravi' })
    expect(r.technicianUid).toBe('u-ravi')
  })

  it('falls back to the person filling the form in when nobody had it', () => {
    const r = technicianFor({ typed: 'Kumar Mobile Service', staffOptions: STAFF, fallbackUid: 'u-admin' })
    expect(r.technicianUid).toBe('u-admin')
  })

  it('never leaves the order with nobody', () => {
    for (const typed of ['Kumar Mobile Service', 'A Person Who Left', 'x']) {
      const r = technicianFor({ typed, staffOptions: STAFF, previousUid: 'u-ravi', fallbackUid: 'u-admin' })
      expect(r.technicianUid).toBeTruthy()
    }
  })

  it('works when the staff list has not loaded, rather than wiping the name', () => {
    const r = technicianFor({ typed: 'Ravi Kumar', staffOptions: [], previousUid: 'u-ravi' })
    expect(r.technicianName).toBe('Ravi Kumar')
    expect(r.technicianUid).toBe('u-ravi')
  })
})

describe('clearing the box', () => {
  it('is not treated as outside work', () => {
    const r = technicianFor({ typed: '', staffOptions: STAFF, previousUid: 'u-ravi' })
    expect(r.isOutside).toBe(false)
    expect(r.technicianUid).toBe('u-ravi')
  })

  it('is not outside work when it holds only spaces', () => {
    expect(technicianFor({ typed: '   ', staffOptions: STAFF }).isOutside).toBe(false)
  })
})
