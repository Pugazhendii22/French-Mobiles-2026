/* ─────────────────────────────────────────────
   THE UNLOCK PATTERN, AS A SEQUENCE OF TAPS

   Staff used to have to draw the pattern: press, drag across the dots, release.
   Inside a bottom sheet that is a bad gesture to ask for - it competes with
   scrolling the form and with pulling the sheet shut, and one wrong dot meant
   clearing the whole thing and starting again.

   Tapping is unambiguous. These are the rules a tap follows, kept here so they
   can be stated exactly rather than inferred from pointer maths:

     a dot not yet used   is added to the end
     the dot just used    is taken back off   (tap again to undo)
     a dot used earlier   rewinds to it       (fix the middle of a pattern)

   Nothing here mutates its input.
────────────────────────────────────────────── */

export const DOT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const onGrid = (id) => Number.isInteger(id) && id >= 1 && id <= 9;

export const nextPattern = (pattern, id) => {
  const current = Array.isArray(pattern) ? pattern : [];
  if (!onGrid(id)) return current;

  const at = current.indexOf(id);
  if (at === -1) return [...current, id];
  // The last dot comes off; an earlier one rewinds the pattern back to it.
  return at === current.length - 1 ? current.slice(0, at) : current.slice(0, at + 1);
};

/**
 * A dot the finger has just reached while drawing the pattern.
 *
 * Appended unless it is already in the sequence - a phone's lock screen will not
 * let one dot count twice either, and allowing it would make a pattern nobody
 * could redraw.
 */
export const appendDot = (pattern, id) => {
  const current = Array.isArray(pattern) ? pattern : [];
  if (!onGrid(id) || current.includes(id)) return current;
  return [...current, id];
};

/**
 * Which dot a point on the pad falls on, or null for the gaps between them.
 *
 * Geometry only, so the drawing rules can be tested without a browser. `rect` is
 * the pad's bounding box. A dot is counted once the finger is inside its circle
 * rather than merely inside its third of the grid: passing through the gap
 * between two dots on the way to a third must not pick up either of them.
 *
 * REACH is a little wider than the 64px dot inside its 96px cell, because a
 * finger drawing a line does not pass exactly through the middle.
 */
const REACH = 0.42;

export const dotAtPoint = (x, y, rect) => {
  if (!rect?.width || !rect?.height) return null;
  const cellW = rect.width / 3;
  const cellH = rect.height / 3;
  const col = Math.floor((x - rect.left) / cellW);
  const row = Math.floor((y - rect.top) / cellH);
  if (col < 0 || col > 2 || row < 0 || row > 2) return null;

  const cx = rect.left + cellW * (col + 0.5);
  const cy = rect.top + cellH * (row + 0.5);
  const reach = Math.min(cellW, cellH) * REACH;
  if (Math.hypot(x - cx, y - cy) > reach) return null;

  return DOT_IDS[row * 3 + col];
};

/** Whether a stored value is a pattern at all, rather than older data or junk. */
export const isValidPattern = (value) =>
  Array.isArray(value)
  && value.every(onGrid)
  && new Set(value).size === value.length;
