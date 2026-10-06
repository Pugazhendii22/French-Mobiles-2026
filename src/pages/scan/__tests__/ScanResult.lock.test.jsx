/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

/*
 * /scan/:labelNumber is a public route - it is not inside ProtectedRoute, because
 * the QR code is printed on the label stuck to the device and the customer is
 * meant to be able to scan it. The unlock pattern is on the same page.
 *
 * So the sign-in check in front of it is the only thing standing between a
 * customer's pattern and anyone who scans their phone, or types a label number
 * into the address bar - they run from 26001 upwards. It is one line of JSX, and
 * this is the test that says it has to stay there.
 */

const auth = vi.hoisted(() => ({ currentUser: null }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('react-router-dom', () => ({
  useParams: () => ({ labelNumber: '26001' }),
  useNavigate: () => vi.fn(),
}))
vi.mock('@/shared/firebase/firebase', () => ({ db: {} }))
vi.mock('@/features/labels/data', () => ({ secondHandLabelData: (x) => x }))

const LOCK_PATTERN = [1, 2, 3, 6]
const ORDER = {
  orderNumber: 'SRV-20261006-004',
  customerName: 'Ravi Kumar',
  brand: 'Samsung', model: 'Galaxy A52',
  status: 'In Progress',
  lockType: 'Pattern',
  lockPattern: LOCK_PATTERN,
  estimatedPrice: 1800,
  /* The sections on this page are each conditional on their own data, so the
     fixture has to carry enough for them to render at all. */
  complaintTypes: ['Display replacement'],
  problemDetails: 'Screen cracked across the top',
  accessories: ['Charger', 'Back cover'],
  suggestions: 'Advise a tempered glass',
  imei1: '352099001761481',
}

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  doc: () => ({}),
  getDocs: async () => ({
    empty: false,
    docs: [{ data: () => ({ labelType: 'service_order', referenceId: 'order-1', data: ORDER }) }],
  }),
  getDoc: async () => ({ exists: () => true, id: 'order-1', data: () => ORDER }),
}))

const { default: ScanResult } = await import('@/pages/scan/ScanResult')

/* The pattern is drawn as nine buttons plus the sequence in words. Either one
   appearing means the pattern is on the page. */
const patternIsShown = () =>
  screen.queryAllByLabelText(/^Dot /).length > 0 || screen.queryByText('1 → 2 → 3 → 6') !== null

beforeEach(() => { auth.currentUser = null })
afterEach(cleanup)

describe('the unlock pattern on the public scan page', () => {
  it('is not shown to someone who is not signed in', async () => {
    render(<ScanResult />)
    await waitFor(() => expect(screen.getByText(/SRV-20261006-004/)).toBeTruthy())
    expect(patternIsShown()).toBe(false)
  })

  it('is not in the page at all, not merely hidden', async () => {
    const { container } = render(<ScanResult />)
    await waitFor(() => expect(screen.getByText(/SRV-20261006-004/)).toBeTruthy())
    // The dots carry their number as text; none of them may have been rendered.
    expect(container.querySelectorAll('[aria-pressed]').length).toBe(0)
    expect(container.textContent).not.toContain('1 → 2 → 3 → 6')
  })

  it('does not name the lock type either', async () => {
    render(<ScanResult />)
    await waitFor(() => expect(screen.getByText(/SRV-20261006-004/)).toBeTruthy())
    expect(screen.queryByText('Lock Type')).toBeNull()
  })

  it('is shown to signed-in staff, who need it to work on the device', async () => {
    auth.currentUser = { uid: 'staff-1' }
    render(<ScanResult />)
    await waitFor(() => expect(patternIsShown()).toBe(true))
    expect(screen.getByText('1 → 2 → 3 → 6')).toBeTruthy()
    expect(screen.getAllByLabelText(/^Dot /)).toHaveLength(9)
  })

  it('shows staff a pattern they cannot edit from here', async () => {
    auth.currentUser = { uid: 'staff-1' }
    render(<ScanResult />)
    await waitFor(() => expect(patternIsShown()).toBe(true))
    for (const dot of screen.getAllByLabelText(/^Dot /)) expect(dot.disabled).toBe(true)
    expect(screen.queryByText('Clear')).toBeNull()
  })
})

/* The eleven blocks on this page were re-nested when they became shared Sections.
   JSX that compiles can still be nested wrongly - a Section closed in the wrong
   place swallows everything after it - so this renders the page and checks the
   sections and their contents actually arrive. A scan that lands here on a blank
   page is indistinguishable, to whoever scanned it, from a scanner that does not
   work. */
describe('the page a scanned label lands on', () => {
  it('renders the service order sections, with their contents', async () => {
    auth.currentUser = { uid: 'staff-1' }
    render(<ScanResult />)
    await waitFor(() => expect(screen.getByText(/SRV-20261006-004/)).toBeTruthy())

    for (const heading of ['Device Info', 'Issues Reported',
                           'Accessories Collected', 'Notes & Suggestions']) {
      expect(screen.getByText(heading)).toBeTruthy()
    }

    // Contents, not just the headings - a mis-nested Section loses these.
    expect(screen.getByText('Ravi Kumar')).toBeTruthy()
    expect(screen.getByText(/Galaxy A52/)).toBeTruthy()
    expect(screen.getByText('352099001761481')).toBeTruthy()
    expect(screen.getByText(/Advise a tempered glass/)).toBeTruthy()
    expect(screen.getByText('Charger')).toBeTruthy()
  })

  it('shows the headings to someone not signed in too', async () => {
    render(<ScanResult />)
    await waitFor(() => expect(screen.getByText(/SRV-20261006-004/)).toBeTruthy())
    expect(screen.getByText('Device Info')).toBeTruthy()
  })
})
