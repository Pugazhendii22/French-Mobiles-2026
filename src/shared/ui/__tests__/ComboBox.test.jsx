/** @vitest-environment jsdom */
import { useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ComboBox from '@/shared/ui/ComboBox'

/* Vitest runs without `globals`, so Testing Library cannot register its own
   afterEach - without this each render stacks another ComboBox in the same
   document and the queries find several. */
afterEach(cleanup)

const BRANDS = ['Samsung', 'Apple', 'Xiaomi', 'Realme', 'OnePlus']

const setup = (props = {}) => {
  const onChange = vi.fn()
  const utils = render(
    <ComboBox value="" onChange={onChange} options={BRANDS} placeholder="Select or type a brand" {...props} />
  )
  return { onChange, input: screen.getByPlaceholderText('Select or type a brand'), ...utils }
}

describe('opening the list', () => {
  it('shows every option on focus, so it still behaves like a dropdown', () => {
    const { input } = setup()
    fireEvent.focus(input)
    BRANDS.forEach(b => expect(screen.getByText(b)).toBeTruthy())
  })

  it('shows nothing until it is focused', () => {
    setup()
    expect(screen.queryByText('Samsung')).toBeNull()
  })
})

describe('filtering', () => {
  it('narrows the list as you type', () => {
    const { input } = setup({ value: 'sam' })
    fireEvent.focus(input)
    expect(screen.getByText('Samsung')).toBeTruthy()
    expect(screen.queryByText('Apple')).toBeNull()
  })

  it('ignores case', () => {
    const { input } = setup({ value: 'SAMS' })
    fireEvent.focus(input)
    expect(screen.getByText('Samsung')).toBeTruthy()
  })

  it('ignores spaces, matching the customer search', () => {
    const { input } = setup({ value: 'one plus', options: ['OnePlus', 'Apple'] })
    fireEvent.focus(input)
    expect(screen.getByText('OnePlus')).toBeTruthy()
  })
})

describe('choosing a value', () => {
  it('reports the option that was clicked', () => {
    const { input, onChange } = setup()
    fireEvent.focus(input)
    fireEvent.click(screen.getByText('Xiaomi'))
    expect(onChange).toHaveBeenCalledWith('Xiaomi')
  })

  it('closes the list after a choice', () => {
    const { input } = setup()
    fireEvent.focus(input)
    fireEvent.click(screen.getByText('Xiaomi'))
    expect(screen.queryByText('Realme')).toBeNull()
  })

  it('reports every keystroke', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: 'Nokia' } })
    expect(onChange).toHaveBeenCalledWith('Nokia')
  })
})

describe('a value that is not in the list', () => {
  it('says it will be added, so a typo is not invisible', () => {
    const { input } = setup({ value: 'Sumsung' })
    fireEvent.focus(input)
    expect(screen.getByText(/will be added to the list/i)).toBeTruthy()
  })

  it('does not show that hint when the typed value already exists', () => {
    const { input } = setup({ value: 'Samsung' })
    fireEvent.focus(input)
    expect(screen.queryByText(/will be added to the list/i)).toBeNull()
  })

  it('does not show that hint for an empty field', () => {
    const { input } = setup({ value: '' })
    fireEvent.focus(input)
    expect(screen.queryByText(/will be added to the list/i)).toBeNull()
  })
})

describe('closing', () => {
  it('closes on Escape', () => {
    const { input } = setup()
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('Samsung')).toBeNull()
  })

  it('closes when a click lands outside it', () => {
    const { input } = setup()
    fireEvent.focus(input)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Samsung')).toBeNull()
  })
})

describe('the error state', () => {
  it('shows the message it is given', () => {
    setup({ error: 'Brand is required' })
    expect(screen.getByText('Brand is required')).toBeTruthy()
  })
})

/* Review Focus 5: never silently correct what someone typed. A snap from
   "Redmi 13C" to "Redmi 13" puts the wrong model on an invoice. */
describe('a near-miss value', () => {
  /* Driven as a real form drives it: the reported value comes back in as the
     next `value`. A spy that swallows the value would leave the component
     seeing an empty field, which is not how it is ever used. */
  const Controlled = ({ options, onValue }) => {
    const [v, setV] = useState('')
    return (
      <ComboBox
        value={v}
        onChange={next => { setV(next); onValue(next) }}
        options={options}
        placeholder="Model"
      />
    )
  }

  it('keeps exactly what was typed and never snaps to the closest option', () => {
    const onValue = vi.fn()
    render(<Controlled options={['Redmi 13']} onValue={onValue} />)
    const input = screen.getByPlaceholderText('Model')

    fireEvent.change(input, { target: { value: 'Redmi 13C' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

    expect(input.value).toBe('Redmi 13C')
    expect(onValue).not.toHaveBeenCalledWith('Redmi 13')
  })

  it('does confirm an exact match on Enter', () => {
    const onValue = vi.fn()
    render(<Controlled options={['Redmi 13']} onValue={onValue} />)
    const input = screen.getByPlaceholderText('Model')

    fireEvent.change(input, { target: { value: 'redmi13' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input.value).toBe('Redmi 13')
  })

  it('does not select the only option when Enter is pressed on an empty field', () => {
    const onValue = vi.fn()
    render(<Controlled options={['Redmi 13']} onValue={onValue} />)
    const input = screen.getByPlaceholderText('Model')

    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input.value).toBe('')
    expect(onValue).not.toHaveBeenCalled()
  })
})

describe('disabled', () => {
  it('does not open its list', () => {
    const { input } = setup({ disabled: true })
    fireEvent.focus(input)
    expect(screen.queryByText('Samsung')).toBeNull()
  })

  it('marks the input disabled so it cannot be typed into', () => {
    const { input } = setup({ disabled: true })
    expect(input.disabled).toBe(true)
  })

  it('is enabled by default', () => {
    const { input } = setup()
    expect(input.disabled).toBe(false)
  })
})
