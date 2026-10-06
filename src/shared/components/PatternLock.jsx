import { useMemo, useRef } from 'react';
import { DOT_IDS, nextPattern, appendDot, dotAtPoint, isValidPattern } from './patternSequence';

/* ─────────────────────────────────────────────
   UNLOCK PATTERN

   Drawn, the way a phone's own lock screen is drawn: press on the first dot,
   pull the line through the rest, lift. That is the gesture staff already know
   from handing the phone back to its owner, and it is how the customer describes
   it across the counter.

   Drawing was taken out once because it fought the sheet it sits in. Two things
   went wrong, and both are dealt with here rather than by giving up the gesture:

   The form stopped scrolling. touch-action: none was on the whole block, so a
   thumb landing anywhere near the pattern - including the space around it - was
   held by the pad instead of scrolling the form. Here it is on the dots alone.
   They are 64px inside a 96px cell, so a third of the pad is gap, and a thumb
   that lands in the gap scrolls the form exactly as it did before.

   A downward stroke closed the sheet. The stroke reached the sheet's own
   handlers and read as "pull down to dismiss", so drawing a line towards the
   bottom row threw the form away. The dots stop touch events going further.
   Touch events stay aimed at the element the touch began on, so a stroke that
   starts on a dot is contained for its whole length, however far it wanders.

   Tapping still works, because it is the better way to fix one wrong dot: tap a
   dot again to drop it, or tap an earlier one to rewind to it. A drag starts a
   new pattern; a tap adjusts the one that is there. The dots are still real
   buttons, so the keyboard reaches them and a screen reader reads the sequence
   out - neither of which the old SVG and its pointer maths managed.
────────────────────────────────────────────── */

const DOT_GEOMETRY = DOT_IDS.map((id, index) => ({
  id,
  cx: 50 + (index % 3) * 100,
  cy: 50 + Math.floor(index / 3) * 100,
}));

const FIRST = '#16a34a';
const MIDDLE = '#002395';
const LAST = '#ED2939';

const colourOf = (position, total) => {
  if (position === 0) return FIRST;
  return position === total - 1 && total > 1 ? LAST : MIDDLE;
};

const PatternLock = ({ value = [], onChange, readOnly = false }) => {
  /* Whatever Firestore or an older build put here, this component only ever
     works with a real pattern. */
  const pattern = useMemo(() => (isValidPattern(value) ? value : []), [value]);

  const padRef = useRef(null);
  /* The stroke in progress. Held in a ref because a pointermove arrives before
     React has re-rendered with the dot the one before it added, so reading the
     prop here would keep rediscovering the same dot. */
  const stroke = useRef(null);

  const tap = (id) => {
    if (readOnly) return;
    onChange?.(nextPattern(pattern, id));
  };

  const dotUnder = (e) => dotAtPoint(e.clientX, e.clientY, padRef.current?.getBoundingClientRect());

  const onPointerDown = (e) => {
    if (readOnly) return;
    const id = dotUnder(e);
    /* Started in the gap, so this gesture is not ours: leave it alone and the
       form scrolls. */
    if (!id) return;

    /* Nothing is committed yet. Until a second dot is reached this could still
       be a tap, which means something different - see the note above. */
    stroke.current = { from: id, drawing: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const current = stroke.current;
    if (!current) return;
    const id = dotUnder(e);
    if (!id) return;

    if (!current.drawing) {
      if (id === current.from) return;      // still on the dot it started from
      // A second dot: this is a stroke, and a stroke starts a new pattern.
      stroke.current = { ...current, drawing: true, dots: [current.from, id] };
      onChange?.([current.from, id]);
      return;
    }

    const next = appendDot(current.dots, id);
    if (next === current.dots) return;     // a dot already in the line
    stroke.current = { ...current, dots: next };
    onChange?.(next);
  };

  const onPointerUp = (e) => {
    const current = stroke.current;
    stroke.current = null;
    /* Asked before released: releasePointerCapture throws when the pointer is
       not one this element holds, and a throw inside the handler would leave the
       gesture half finished. */
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!current || current.drawing) return;

    /* Never reached a second dot. Treat it as a tap, but only if the finger came
       up on the dot it went down on - the way a button behaves, so sliding off
       to change your mind cancels instead of committing. */
    if (dotUnder(e) === current.from) tap(current.from);
  };

  const onPointerCancel = () => { stroke.current = null; };

  /* Keeps the stroke off the sheet underneath, which would otherwise read a
     downward line as a pull-to-dismiss. */
  const contain = (e) => e.stopPropagation();

  const positionOf = (id) => pattern.indexOf(id);
  const points = pattern.map(id => DOT_GEOMETRY[id - 1]).filter(Boolean);

  return (
    <div className="w-full select-none">
      <p className="text-[13px] text-[#64748b] text-center mb-3">
        {readOnly
          ? (pattern.length ? `${pattern.length} dots` : 'No pattern recorded')
          : pattern.length === 0
            ? 'Draw the pattern with your finger, or tap the dots in order'
            : `${pattern.length} ${pattern.length === 1 ? 'dot' : 'dots'} · draw again to replace it, or tap a dot to change it`}
      </p>

      <div className="bg-[#f0f4ff] rounded-2xl p-4 flex justify-center">
        <div
          ref={padRef}
          className="relative"
          style={{ width: 288, height: 288 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {/* The lines are decoration over the buttons, never a tap target. */}
          <svg
            viewBox="0 0 300 300"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            <defs>
              <marker id="pattern-arrow" viewBox="0 0 10 10" refX="16" refY="5"
                markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill={MIDDLE} />
              </marker>
            </defs>
            {points.slice(0, -1).map((p, i) => (
              <line
                key={p.id}
                x1={p.cx} y1={p.cy}
                x2={points[i + 1].cx} y2={points[i + 1].cy}
                stroke={MIDDLE} strokeWidth="4" opacity="0.75"
                markerEnd="url(#pattern-arrow)"
              />
            ))}
          </svg>

          <div className="grid grid-cols-3 w-full h-full">
            {DOT_IDS.map(id => {
              const position = positionOf(id);
              const on = position !== -1;
              const colour = on ? colourOf(position, pattern.length) : null;

              return (
                <div key={id} className="flex items-center justify-center">
                  <button
                    type="button"
                    disabled={readOnly}
                    /* The keyboard route. Pointers are handled on the pad above,
                       so preventDefault here stops the browser also firing a
                       click for the key and applying the tap twice. */
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(id); }
                    }}
                    onTouchStart={contain}
                    onTouchMove={contain}
                    onTouchEnd={contain}
                    onTouchCancel={contain}
                    /* 64px of target inside a 96px cell: a thumb cannot reach
                       two of them at once, which is what went wrong on the
                       pre-delivery checklist next door. The gap it leaves is
                       what the form scrolls by.

                       touchAction none on the dot and not on the pad: a stroke
                       that starts on a dot must not also scroll, while a thumb
                       landing in the gap must. */
                    style={{
                      width: 64, height: 64, borderRadius: '50%',
                      backgroundColor: on ? colour : '#ffffff',
                      border: `2px solid ${on ? colour : '#D1D5DB'}`,
                      color: on ? '#ffffff' : '#94a3b8',
                      touchAction: 'none',
                    }}
                    className="relative flex items-center justify-center text-[17px] font-bold shadow-sm transition-colors disabled:cursor-default"
                    aria-pressed={on}
                    aria-label={on
                      ? `Dot ${id}, number ${position + 1} in the pattern. Tap to change.`
                      : `Dot ${id}, not used. Tap to add.`}
                  >
                    {on ? position + 1 : ''}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* The sequence in words, because a line drawing is hard to read back to
          a customer over the phone. */}
      {pattern.length > 0 && (
        <p className="text-center text-[13px] font-bold text-[#0f172a] mt-2.5 tabular-nums break-words">
          {pattern.join(' → ')}
        </p>
      )}

      {!readOnly && pattern.length > 0 && (
        <div className="flex items-center justify-center gap-4 mt-2">
          <button
            type="button"
            onClick={() => onChange?.(pattern.slice(0, -1))}
            className="text-[13px] font-semibold text-[#002395] py-1.5"
          >
            Undo last dot
          </button>
          <span aria-hidden="true" className="text-[#cbd5e1]">·</span>
          <button
            type="button"
            onClick={() => onChange?.([])}
            className="text-[13px] font-semibold text-[#64748b] py-1.5"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};

export default PatternLock;
