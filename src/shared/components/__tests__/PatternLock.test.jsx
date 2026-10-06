/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import PatternLock from '@/shared/components/PatternLock'

afterEach(cleanup)

/* jsdom does no layout, so the pad measures 0x0 and every point would miss. The
   real pad is 288px square - the size the component asks for - so that is what
   is stubbed here. */
const PAD = { left: 0, top: 0, width: 288, height: 288, right: 288, bottom: 288 }
const centre = (id) => {
  const i = id - 1
  return { clientX: 96 * (i % 3) + 48, clientY: 96 * Math.floor(i / 3) + 48 }
}
const gap = { clientX: 96, clientY: 96 }   // where four cells meet

const draw = (value = []) => {
  const onChange = vi.fn()
  const { container } = render(<PatternLock value={value} onChange={onChange} />)
  const pad = container.querySelector('svg').parentElement
  pad.getBoundingClientRect = () => PAD
  const at = (type, point) => act(() => {
    pad.dispatchEvent(new window.PointerEvent(type, { bubbles: true, pointerId: 1, ...point }))
  })
  return { onChange, pad, at, container }
}

describe('drawing the pattern, the way a phone does it', () => {
  it('builds the sequence from a stroke across the dots', () => {
    const { onChange, at } = draw()
    at('pointerdown', centre(1))
    at('pointermove', centre(2))
    at('pointermove', centre(3))
    at('pointermove', centre(6))
    at('pointerup', centre(6))

    expect(onChange.mock.calls.map(c => c[0])).toEqual([
      [1, 2], [1, 2, 3], [1, 2, 3, 6],
    ])
  })

  it('commits nothing until the line reaches a second dot', () => {
    const { onChange, at } = draw()
    at('pointerdown', centre(5))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('picks up a dot the line passes through', () => {
    const { onChange, at } = draw()
    at('pointerdown', centre(1))
    at('pointermove', centre(2))   // on the way from 1 to 3
    at('pointermove', centre(3))
    at('pointerup', centre(3))
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 3])
  })

  it('ignores the gaps, so a diagonal does not collect its neighbours', () => {
    const { onChange, at } = draw()
    at('pointerdown', centre(1))
    at('pointermove', gap)
    at('pointermove', centre(9))
    at('pointerup', centre(9))
    expect(onChange).toHaveBeenLastCalledWith([1, 9])
  })

  it('will not let a stroke use one dot twice', () => {
    const { onChange, at } = draw()
    at('pointerdown', centre(1))
    at('pointermove', centre(2))
    at('pointermove', centre(1))
    at('pointermove', centre(3))
    at('pointerup', centre(3))
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 3])
  })

  it('starts a new pattern rather than extending the old one', () => {
    const { onChange, at } = draw([7, 8, 9])
    at('pointerdown', centre(1))
    at('pointermove', centre(2))
    expect(onChange).toHaveBeenLastCalledWith([1, 2])
  })

  it('leaves a gesture that began in a gap alone, so the form can scroll', () => {
    const { onChange, at } = draw()
    at('pointerdown', gap)
    at('pointermove', centre(1))
    at('pointermove', centre(2))
    at('pointerup', centre(2))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('tapping still adjusts the pattern that is there', () => {
  it('adds a dot on a press and release in the same place', () => {
    const { onChange, at } = draw([1, 2])
    at('pointerdown', centre(5))
    at('pointerup', centre(5))
    expect(onChange).toHaveBeenCalledWith([1, 2, 5])
  })

  it('drops the last dot when it is tapped again', () => {
    const { onChange, at } = draw([1, 2, 3])
    at('pointerdown', centre(3))
    at('pointerup', centre(3))
    expect(onChange).toHaveBeenCalledWith([1, 2])
  })

  it('rewinds to an earlier dot', () => {
    const { onChange, at } = draw([1, 2, 3, 6])
    at('pointerdown', centre(2))
    at('pointerup', centre(2))
    expect(onChange).toHaveBeenCalledWith([1, 2])
  })

  it('cancels when the finger slides off the dot before lifting', () => {
    const { onChange, at } = draw([1])
    at('pointerdown', centre(5))
    at('pointerup', gap)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('the keyboard', () => {
  it('adds a dot on Enter', () => {
    const onChange = vi.fn()
    render(<PatternLock value={[1]} onChange={onChange} />)
    fireEvent.keyDown(screen.getByLabelText(/^Dot 5/), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith([1, 5])
  })

  it('adds a dot on Space', () => {
    const onChange = vi.fn()
    render(<PatternLock value={[]} onChange={onChange} />)
    fireEvent.keyDown(screen.getByLabelText(/^Dot 9/), { key: ' ' })
    expect(onChange).toHaveBeenCalledWith([9])
  })
})

describe('read-only, on a page that only shows the pattern', () => {
  it('reports nothing when drawn on', () => {
    const onChange = vi.fn()
    const { container } = render(<PatternLock value={[1, 2]} readOnly onChange={onChange} />)
    const pad = container.querySelector('svg').parentElement
    pad.getBoundingClientRect = () => PAD
    act(() => {
      pad.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, pointerId: 1, ...centre(5) }))
      pad.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, pointerId: 1, ...centre(5) }))
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not tell the reader to draw anything', () => {
    render(<PatternLock value={[1, 2]} readOnly />)
    expect(screen.queryByText(/Draw the pattern/)).toBeNull()
    expect(screen.getByText('2 dots')).toBeTruthy()
  })
})

/* The two reasons drawing was taken out before. */
describe('living inside a bottom sheet', () => {
  it('keeps the stroke off the sheet, which would read it as pull-to-dismiss', () => {
    const onSheetTouch = vi.fn()
    const { container } = render(
      <div onTouchStart={onSheetTouch} onTouchMove={onSheetTouch}>
        <PatternLock value={[]} onChange={() => {}} />
      </div>
    )
    const dot = screen.getByLabelText(/^Dot 1/)
    fireEvent.touchStart(dot, { touches: [{ clientY: 10 }] })
    fireEvent.touchMove(dot, { touches: [{ clientY: 300 }] })
    expect(onSheetTouch).not.toHaveBeenCalled()
    expect(container).toBeTruthy()
  })

  it('holds the scroll only on the dots, so the gap still scrolls the form', () => {
    const { container } = render(<PatternLock value={[]} onChange={() => {}} />)
    const pad = container.querySelector('svg').parentElement
    expect(pad.style.touchAction).toBe('')
    for (const dot of screen.getAllByLabelText(/^Dot /)) {
      expect(dot.style.touchAction).toBe('none')
    }
  })
})

/* readOnly is used on the scan page, which is an ordinary scrolling page rather
   than a sheet. There is no stroke to protect there, so nothing may be held. */
describe('read-only does not interfere with the page it sits on', () => {
  it('leaves the scroll alone on every dot', () => {
    render(<PatternLock value={[1, 2, 3]} readOnly />)
    for (const dot of screen.getAllByLabelText(/^Dot /)) {
      expect(dot.style.touchAction).toBe('')
    }
  })

  it('lets a touch through to whatever is underneath', () => {
    const onPageTouch = vi.fn()
    render(
      <div onTouchStart={onPageTouch} onTouchMove={onPageTouch}>
        <PatternLock value={[1, 2, 3]} readOnly />
      </div>
    )
    const dot = screen.getByLabelText(/^Dot 1/)
    fireEvent.touchStart(dot, { touches: [{ clientY: 10 }] })
    fireEvent.touchMove(dot, { touches: [{ clientY: 300 }] })
    expect(onPageTouch).toHaveBeenCalled()
  })

  it('still shows the sequence it was given', () => {
    render(<PatternLock value={[4, 5, 6]} readOnly />)
    expect(screen.getByText('4 → 5 → 6')).toBeTruthy()
  })

  it('offers no way to change it', () => {
    render(<PatternLock value={[1, 2]} readOnly />)
    expect(screen.queryByText('Undo last dot')).toBeNull()
    expect(screen.queryByText('Clear')).toBeNull()
    for (const dot of screen.getAllByLabelText(/^Dot /)) expect(dot.disabled).toBe(true)
  })
})
