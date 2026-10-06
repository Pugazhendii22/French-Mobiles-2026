import { useMemo } from 'react';
import { DOT_IDS, nextPattern, isValidPattern } from './patternSequence';

/* ─────────────────────────────────────────────
   UNLOCK PATTERN

   Tapped, not drawn. This used to be a drag: press on a dot, pull across the
   others, release - the gesture a phone's own lock screen uses. It is the wrong
   gesture here. The field sits two thirds of the way down a bottom sheet, where
   a drag is already how you scroll the form and how you pull the sheet shut, so
   drawing a pattern fought both: the block had touch-action none, which stopped
   the form scrolling whenever a thumb landed on it, and a downward stroke could
   close the sheet instead of drawing a line.

   Tapping has none of that. Each dot is its own button, so the browser decides
   what is a tap and what is a scroll, the sequence is visible as numbers, and
   there is a way back from a wrong dot that is not "clear it and start again":
   tap a dot again to drop it, or tap an earlier one to rewind to it.

   It also means this works from a keyboard and reads correctly aloud, which the
   SVG and its pointer maths never did.
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

  const tap = (id) => {
    if (readOnly) return;
    onChange?.(nextPattern(pattern, id));
  };

  const positionOf = (id) => pattern.indexOf(id);
  const points = pattern.map(id => DOT_GEOMETRY[id - 1]).filter(Boolean);

  return (
    <div className="w-full select-none">
      <p className="text-[13px] text-[#64748b] text-center mb-3">
        {pattern.length === 0
          ? 'Tap the dots in the order the customer draws them'
          : `${pattern.length} ${pattern.length === 1 ? 'dot' : 'dots'} · tap a dot again to change it`}
      </p>

      <div className="bg-[#f0f4ff] rounded-2xl p-4 flex justify-center">
        <div className="relative" style={{ width: 288, height: 288 }}>
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
                    onClick={() => tap(id)}
                    disabled={readOnly}
                    /* 64px of target inside a 96px cell: a thumb cannot reach
                       two of them at once, which is what went wrong on the
                       pre-delivery checklist next door. */
                    style={{
                      width: 64, height: 64, borderRadius: '50%',
                      backgroundColor: on ? colour : '#ffffff',
                      border: `2px solid ${on ? colour : '#D1D5DB'}`,
                      color: on ? '#ffffff' : '#94a3b8',
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
