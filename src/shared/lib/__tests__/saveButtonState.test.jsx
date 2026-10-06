/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useState } from 'react'

afterEach(cleanup)

/*
 * The intake form's primary button, reduced to the thing that went wrong.
 *
 * It decided whether to read "Saved ✓" from saveStatus alone. saveStatus stays
 * 'saved' for as long as the form is open, so after one save the button sat
 * there claiming the form was saved while someone carried on typing into it -
 * and, because it was disabled in that state, refused to let them save the
 * changes it was busy denying existed.
 *
 * The fix compares the form against a snapshot of what was actually written.
 * `byStatus` is the old rule, kept so the bug stays described by a failing
 * expectation rather than a comment.
 */
const SaveButton = ({ byStatus = false }) => {
  const [form, setForm] = useState({ brand: '' })
  const [saveStatus, setSaveStatus] = useState('idle')
  const [savedSnapshot, setSavedSnapshot] = useState(null)
  const [saves, setSaves] = useState(0)

  const dirty = savedSnapshot === null || savedSnapshot !== JSON.stringify(form)
  const justSaved = byStatus ? saveStatus === 'saved' : !dirty

  const save = () => {
    setSaves(n => n + 1)
    setSaveStatus('saved')
    setSavedSnapshot(JSON.stringify(form))
  }

  return (
    <>
      <input
        aria-label="brand"
        value={form.brand}
        onChange={e => setForm({ brand: e.target.value })}
      />
      <button onClick={save} disabled={justSaved}>
        {justSaved ? 'Saved ✓' : 'Save'}
      </button>
      <span data-testid="saves">{saves}</span>
    </>
  )
}

const type = (v) => fireEvent.change(screen.getByLabelText('brand'), { target: { value: v } })
const button = () => screen.getByRole('button')
const press = () => act(() => { button().click() })

describe('the save button before anything is saved', () => {
  it('offers to save', () => {
    render(<SaveButton />)
    expect(button()).toHaveProperty('disabled', false)
    expect(button().textContent).toBe('Save')
  })
})

describe('straight after saving', () => {
  it('says so, and will not be pressed again', () => {
    render(<SaveButton />)
    type('Nokia')
    press()
    expect(button().textContent).toBe('Saved ✓')
    expect(button()).toHaveProperty('disabled', true)
  })

  it('has saved exactly once', () => {
    render(<SaveButton />)
    type('Nokia')
    press()
    expect(screen.getByTestId('saves').textContent).toBe('1')
  })
})

/* The report that found this: "i can able to edit after i click the create
   order". You can - and the button has to admit that those edits are not
   saved, and let you save them. */
describe('editing after a save', () => {
  it('offers to save again', () => {
    render(<SaveButton />)
    type('Nokia')
    press()
    type('Nokia G42')
    expect(button().textContent).toBe('Save')
    expect(button()).toHaveProperty('disabled', false)
  })

  it('can actually be saved again', () => {
    render(<SaveButton />)
    type('Nokia')
    press()
    type('Nokia G42')
    press()
    expect(screen.getByTestId('saves').textContent).toBe('2')
    expect(button().textContent).toBe('Saved ✓')
  })

  it('settles back to saved when the edit is undone', () => {
    render(<SaveButton />)
    type('Nokia')
    press()
    type('Nokia G42')
    expect(button().textContent).toBe('Save')
    type('Nokia')
    expect(button().textContent).toBe('Saved ✓')
  })

  /* The old rule, reproducing the bug: still claiming to be saved over a form
     that has been typed into since, and refusing to save it. */
  it('lies about it when the state is read from saveStatus alone', () => {
    render(<SaveButton byStatus />)
    type('Nokia')
    press()
    type('Nokia G42')
    expect(button().textContent).toBe('Saved ✓')
    expect(button()).toHaveProperty('disabled', true)
  })
})
