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

/** Whether a stored value is a pattern at all, rather than older data or junk. */
export const isValidPattern = (value) =>
  Array.isArray(value)
  && value.every(onGrid)
  && new Set(value).size === value.length;
