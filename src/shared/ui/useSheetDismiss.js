import { useRef, useState, useCallback, useEffect } from 'react'

/* ─────────────────────────────────────────────
   SWIPE A SHEET AWAY

   The bottom sheets in this app draw a grab handle, which tells people the
   sheet can be pulled down - but until now only the Cancel button closed it,
   so the handle was an affordance that lied.

   The gesture is gated on scroll position on purpose: these sheets hold long
   forms, and a downward drag halfway through one must scroll it rather than
   throw away what was typed. Pulling from the handle always closes; pulling
   from the body only closes when the body is already at the top.
────────────────────────────────────────────── */

/** Pull this far and the sheet closes however slowly you did it. */
export const DISMISS_DISTANCE = 120
/* A shorter pull closes too if it was flicked. Kept deliberately large: these
   sheets hold long forms and closing discards everything typed, so the gesture
   has to look like someone meant it. 70px is roughly a thumb's travel. */
export const FLICK_DISTANCE = 70
export const FLICK_VELOCITY = 0.5

/* How long the sheet takes to slide out once the gesture has decided. It
   opened by sliding up, so vanishing on the spot reads as a glitch rather than
   a dismissal - and leaves nothing to tell you which screen you landed on. */
export const CLOSE_MS = 200

/**
 * Whether a finished drag should close the sheet.
 * `distance` is positive downwards; an upward drag never closes.
 */
export const shouldDismiss = ({ distance, elapsedMs }) => {
  if (!(distance > 0)) return false
  if (distance >= DISMISS_DISTANCE) return true
  if (distance < FLICK_DISTANCE) return false
  const velocity = elapsedMs > 0 ? distance / elapsedMs : Infinity
  return velocity >= FLICK_VELOCITY
}

export const useSheetDismiss = ({ onDismiss, enabled = true } = {}) => {
  const scrollRef = useRef(null)
  const gesture = useRef(null)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef(null)

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  /* Slide the sheet off the bottom, then hand over. Someone who has asked the
     system for less motion gets the dismissal immediately. */
  const close = useCallback(() => {
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduced) { onDismiss?.(); return }

    setClosing(true)
    setOffset(typeof window !== 'undefined' ? window.innerHeight : 1000)
    closeTimer.current = setTimeout(() => onDismiss?.(), CLOSE_MS)
  }, [onDismiss])

  const start = useCallback((e, fromHandle) => {
    if (!enabled || !onDismiss) return
    // Pulling the body only closes the sheet when there is nothing to scroll up to.
    if (!fromHandle && (scrollRef.current?.scrollTop ?? 0) > 0) return
    gesture.current = { y: e.touches[0].clientY, at: Date.now() }
  }, [enabled, onDismiss])

  const move = useCallback((e) => {
    if (!gesture.current) return
    const distance = e.touches[0].clientY - gesture.current.y
    if (distance <= 0) { setOffset(0); setDragging(false); return }
    setDragging(true)
    // Resist a little, so the sheet feels attached rather than loose.
    setOffset(distance < DISMISS_DISTANCE ? distance : DISMISS_DISTANCE + (distance - DISMISS_DISTANCE) * 0.4)
  }, [])

  const end = useCallback((e) => {
    const g = gesture.current
    gesture.current = null
    setDragging(false)
    if (!g) return
    const distance = (e.changedTouches?.[0]?.clientY ?? g.y) - g.y
    if (shouldDismiss({ distance, elapsedMs: Date.now() - g.at })) {
      close()
      return
    }
    setOffset(0)
  }, [onDismiss, close])

  const sheetProps = {
    onTouchStart: (e) => start(e, false),
    onTouchMove: move,
    onTouchEnd: end,
    onTouchCancel: end,
    style: {
      transform: offset ? `translateY(${offset}px)` : undefined,
        transition: dragging
        ? 'none'
        : `transform ${closing ? CLOSE_MS : 220}ms cubic-bezier(0.22, 1, 0.36, 1)`,
    },
  }

  /* Spread on the grab handle: it closes from any scroll position, and
     touch-action tells the browser we are handling the vertical gesture. */
  const handleProps = {
    onTouchStart: (e) => { e.stopPropagation(); start(e, true) },
    onTouchMove: (e) => { e.stopPropagation(); move(e) },
    onTouchEnd: (e) => { e.stopPropagation(); end(e) },
    onTouchCancel: (e) => { e.stopPropagation(); end(e) },
    style: { touchAction: 'none' },
  }

  return { sheetProps, handleProps, scrollRef, dragging }
}

export default useSheetDismiss
