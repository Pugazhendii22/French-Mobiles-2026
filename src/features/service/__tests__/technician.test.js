import { describe, it, expect } from 'vitest'
import {
  staffNameOf, matchStaffByName, technicianOptions, technicianFor, technicianToRemember,
  defaultTechnicianName,
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

describe('the list the box offers', () => {
  it('puts the shop first, then the outside names it remembers', () => {
    expect(technicianOptions(STAFF, ['Kumar Mobile Service', 'Star Electronics'])).toEqual([
      'Ravi Kumar', 'Anand', 'suresh@shop.in', 'Kumar Mobile Service', 'Star Electronics',
    ])
  })

  it('shows a name once when it is in both lists', () => {
    expect(technicianOptions(STAFF, ['anand', 'Kumar Mobile Service'])).toEqual([
      'Ravi Kumar', 'Anand', 'suresh@shop.in', 'Kumar Mobile Service',
    ])
  })

  it('keeps the staff spelling when the two disagree on case', () => {
    expect(technicianOptions(STAFF, ['ANAND'])).toContain('Anand')
    expect(technicianOptions(STAFF, ['ANAND'])).not.toContain('ANAND')
  })

  it('drops blanks and repeats from what it remembered', () => {
    expect(technicianOptions([], ['Kumar', '', '  ', 'Kumar', ' Kumar '])).toEqual(['Kumar'])
  })

  it('works with nothing remembered yet', () => {
    expect(technicianOptions(STAFF)).toEqual(['Ravi Kumar', 'Anand', 'suresh@shop.in'])
    expect(technicianOptions(STAFF, undefined)).toHaveLength(3)
  })
})

describe('what gets remembered after a save', () => {
  it('remembers a name from outside the shop', () => {
    expect(technicianToRemember('Kumar Mobile Service', STAFF)).toBe('Kumar Mobile Service')
  })

  it('trims it to what should be stored', () => {
    expect(technicianToRemember('  Star Electronics  ', STAFF)).toBe('Star Electronics')
  })

  /* Staff come from the users collection. Filing them here would show them twice
     and leave a copy behind when they leave. */
  it('never remembers shop staff', () => {
    expect(technicianToRemember('Anand', STAFF)).toBeNull()
    expect(technicianToRemember('anand', STAFF)).toBeNull()
    expect(technicianToRemember('suresh@shop.in', STAFF)).toBeNull()
  })

  it('remembers nothing from an empty box', () => {
    expect(technicianToRemember('', STAFF)).toBeNull()
    expect(technicianToRemember('   ', STAFF)).toBeNull()
    expect(technicianToRemember(undefined, STAFF)).toBeNull()
  })
})

/* The shop's own admin account is named "French Mobiles" in the users
   collection, and that name was being pre-filled as the technician on every new
   order - then printed on the job card. */
describe('who the box starts on', () => {
  it('starts an admin on nobody, rather than on the account name', () => {
    expect(defaultTechnicianName({ isAdmin: true, ownName: 'French Mobiles' })).toBe('')
  })

  it('starts a member of staff on themselves', () => {
    expect(defaultTechnicianName({ isAdmin: false, ownName: 'Ravi Kumar' })).toBe('Ravi Kumar')
  })

  it('keeps whoever an existing order already names', () => {
    expect(defaultTechnicianName({
      isAdmin: true, ownName: 'French Mobiles', existing: 'Kumar Mobile Service',
    })).toBe('Kumar Mobile Service')
    expect(defaultTechnicianName({
      isAdmin: false, ownName: 'Ravi Kumar', existing: 'Anand',
    })).toBe('Anand')
  })

  it('does not treat a blank stored name as a name worth keeping', () => {
    expect(defaultTechnicianName({ isAdmin: true, ownName: 'French Mobiles', existing: '   ' })).toBe('')
    expect(defaultTechnicianName({ isAdmin: false, ownName: 'Ravi Kumar', existing: '' })).toBe('Ravi Kumar')
  })

  it('copes with nothing at all', () => {
    expect(defaultTechnicianName()).toBe('')
    expect(defaultTechnicianName({ isAdmin: false })).toBe('')
  })
})
