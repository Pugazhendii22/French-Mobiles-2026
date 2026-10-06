/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useState, useEffect, useRef } from 'react'
import { readDraft, writeDraft, clearDraft } from '@/shared/lib/formDraft'

afterEach(cleanup)
beforeEach(() => {
  const store = {}
  globalThis.window.localStorage.clear?.()
  Object.keys(store).forEach(k => delete store[k])
  clearDraft('t')
})

/*
 * The sequence that went wrong on the purchase form: saving uploads the
 * signature and puts the resulting URL back into the form, so the state
 * changes *after* the draft is cleared. The effect that keeps the draft then
 * runs again and writes it straight back, and the next person to open the form
 * is told they have unsaved work on a purchase that is already saved.
 *
 * This is the form reduced to just that: a field, an effect that drafts it,
 * and a save that clears the draft and then changes the state.
 */
const Form = ({ snapshotting }) => {
  const [data, setData] = useState({ brand: '', signatureUrl: '' })
  const savedSnapshot = useRef(null)

  useEffect(() => {
    if (snapshotting && savedSnapshot.current === JSON.stringify(data)) return
    writeDraft('t', data)
  }, [data, snapshotting])

  const save = () => {
    // what the save writes back: the uploaded signature
    const settled = { ...data, signatureUrl: 'https://img/sig.png' }
    if (snapshotting) savedSnapshot.current = JSON.stringify(settled)
    setData(settled)
    clearDraft('t')
  }

  return (
    <>
      <input
        aria-label="brand"
        value={data.brand}
        onChange={e => setData(d => ({ ...d, brand: e.target.value }))}
      />
      <button onClick={save}>Save</button>
    </>
  )
}

const type = (value) =>
  fireEvent.change(screen.getByLabelText('brand'), { target: { value } })

describe('the draft after a save', () => {
  it('is written while the form is being filled in', () => {
    render(<Form snapshotting />)
    type('Nokia')
    expect(readDraft('t')).toMatchObject({ brand: 'Nokia' })
  })

  /* Without the snapshot comparison this is the bug: cleared, then rewritten
     by the state change the save itself caused. */
  it('comes back after saving when nothing guards the effect', () => {
    render(<Form snapshotting={false} />)
    type('Nokia')
    act(() => { screen.getByText('Save').click() })
    expect(readDraft('t')).not.toBeNull()
  })

  it('stays gone after saving', () => {
    render(<Form snapshotting />)
    type('Nokia')
    act(() => { screen.getByText('Save').click() })
    expect(readDraft('t')).toBeNull()
  })

  it('starts being kept again once the form is edited after saving', () => {
    render(<Form snapshotting />)
    type('Nokia')
    act(() => { screen.getByText('Save').click() })
    expect(readDraft('t')).toBeNull()

    type('Nokia G42')
    expect(readDraft('t')).toMatchObject({ brand: 'Nokia G42' })
  })
})
