/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { shouldDismiss, useSheetDismiss, CLOSE_MS } from '@/shared/ui/useSheetDismiss'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); cleanup() })

describe('shouldDismiss', () => {
  it('ignores a small nudge, so a half-filled form is not lost by accident', () => {
    expect(shouldDismiss({ distance: 30, elapsedMs: 400 })).toBe(false)
  })

  it('dismisses once the sheet has been pulled well down', () => {
    expect(shouldDismiss({ distance: 140, elapsedMs: 600 })).toBe(true)
  })

  it('dismisses a fast flick, which is how people actually close sheets', () => {
    expect(shouldDismiss({ distance: 90, elapsedMs: 80 })).toBe(true)
  })

  it('does not dismiss the same distance covered slowly', () => {
    expect(shouldDismiss({ distance: 90, elapsedMs: 900 })).toBe(false)
  })

  /* Below this, a flick is indistinguishable from a scroll that started at the
     top of the form, and closing it would discard everything typed. */
  it('ignores a flick too short to have been meant', () => {
    expect(shouldDismiss({ distance: 60, elapsedMs: 50 })).toBe(false)
  })

  it('never dismisses on an upward drag', () => {
    expect(shouldDismiss({ distance: -200, elapsedMs: 100 })).toBe(false)
  })

  it('survives a zero-length gesture without dividing by zero', () => {
    expect(shouldDismiss({ distance: 0, elapsedMs: 0 })).toBe(false)
    expect(Number.isNaN(shouldDismiss({ distance: 10, elapsedMs: 0 }))).toBe(false)
  })
})

/* A sheet shaped like the real ones: a handle, then a scrolling body. */
const Sheet = ({ onDismiss, scrollTop = 0 }) => {
  const { sheetProps, handleProps, scrollRef } = useSheetDismiss({ onDismiss })
  return (
    <div {...sheetProps} data-testid="sheet">
      <div {...handleProps} data-testid="handle">grab</div>
      <div
        ref={el => {
          scrollRef.current = el
          if (el) Object.defineProperty(el, 'scrollTop', { value: scrollTop, writable: true })
        }}
        data-testid="body"
      >
        body
      </div>
    </div>
  )
}

/* Distance decides these cases; the velocity rule is covered by the
   shouldDismiss tests above, where time can be stated exactly.
   The sheet slides out before it is dismissed, so the timers are run forward
   to the end of that animation. */
const drag = (el, { from = 0, to = 200 }) => {
  fireEvent.touchStart(el, { touches: [{ clientY: from }] })
  fireEvent.touchMove(el, { touches: [{ clientY: (from + to) / 2 }] })
  fireEvent.touchMove(el, { touches: [{ clientY: to }] })
  fireEvent.touchEnd(el, { changedTouches: [{ clientY: to }] })
  act(() => { vi.advanceTimersByTime(CLOSE_MS + 50) })
}

describe('dragging the sheet', () => {
  it('closes when pulled down from the handle', () => {
    const onDismiss = vi.fn()
    render(<Sheet onDismiss={onDismiss} />)
    drag(screen.getByTestId('handle'), { from: 10, to: 260 })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('stays open when barely moved', () => {
    const onDismiss = vi.fn()
    render(<Sheet onDismiss={onDismiss} />)
    drag(screen.getByTestId('handle'), { from: 10, to: 30 })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('stays open when dragged upward', () => {
    const onDismiss = vi.fn()
    render(<Sheet onDismiss={onDismiss} />)
    drag(screen.getByTestId('handle'), { from: 300, to: 40 })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  /* The reason the gesture is gated on scroll position: pulling down halfway
     through a long form must scroll it, not throw away what was typed. */
  it('does not close when the body is scrolled down - that gesture is a scroll', () => {
    const onDismiss = vi.fn()
    render(<Sheet onDismiss={onDismiss} scrollTop={420} />)
    drag(screen.getByTestId('body'), { from: 10, to: 260 })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('does close when dragged from a body already scrolled to the top', () => {
    const onDismiss = vi.fn()
    render(<Sheet onDismiss={onDismiss} scrollTop={0} />)
    drag(screen.getByTestId('body'), { from: 10, to: 260 })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('closes from the handle even when the body is scrolled', () => {
    const onDismiss = vi.fn()
    render(<Sheet onDismiss={onDismiss} scrollTop={420} />)
    drag(screen.getByTestId('handle'), { from: 10, to: 260 })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('closing is animated, not instant', () => {
  it('does not dismiss the moment the finger lifts', () => {
    const onDismiss = vi.fn()
    render(<Sheet onDismiss={onDismiss} />)
    const handle = screen.getByTestId('handle')
    fireEvent.touchStart(handle, { touches: [{ clientY: 10 }] })
    fireEvent.touchMove(handle, { touches: [{ clientY: 260 }] })
    fireEvent.touchEnd(handle, { changedTouches: [{ clientY: 260 }] })

    expect(onDismiss).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(CLOSE_MS + 50) })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('slides the sheet the rest of the way down while it closes', () => {
    const onDismiss = vi.fn()
    render(<Sheet onDismiss={onDismiss} />)
    const handle = screen.getByTestId('handle')
    const sheet = screen.getByTestId('sheet')
    fireEvent.touchStart(handle, { touches: [{ clientY: 10 }] })
    fireEvent.touchMove(handle, { touches: [{ clientY: 260 }] })
    fireEvent.touchEnd(handle, { changedTouches: [{ clientY: 260 }] })

    // further down than the finger ever went
    const y = Number((sheet.style.transform.match(/translateY\((\d+(?:\.\d+)?)px\)/) || [])[1])
    expect(y).toBeGreaterThan(260)

    act(() => { vi.advanceTimersByTime(CLOSE_MS + 50) })
  })
})
