/* Shared style tokens for the app's screens. Values only - no components. */

export const inputClass =
  "border border-[#e2e8f0] focus:border-[#002395] focus:ring-2 focus:ring-[#002395]/20 rounded-xl px-4 py-3 w-full outline-none transition text-[#0f172a] text-sm bg-white";

export const labelClass = "block text-xs font-semibold text-[#64748b] mb-1.5";

export const errorInput =
  "border-[#ED2939] bg-red-50 focus:border-[#ED2939] focus:ring-[#ED2939]/20";

/* One vocabulary for condition, used by the form, the stock list and the
   device page. The wording has to match everywhere: staff reading "Light wear"
   on one screen and "Good" on another cannot tell whether they mean the same
   grade. The grade travels as words, not as a colour: four unlabelled colours
   down a list read as decoration, and nobody can say which one means what. */
export const GRADE_META = {
  A: { label: 'Like new',   on: 'bg-green-500 border-green-500' },
  B: { label: 'Light wear', on: 'bg-blue-500 border-blue-500' },
  C: { label: 'Heavy wear', on: 'bg-orange-500 border-orange-500' },
  D: { label: 'Damaged',    on: 'bg-[#ED2939] border-[#ED2939]' },
};

export const gradeOf = (g) => GRADE_META[g] || { label: 'Not graded', on: 'bg-gray-400 border-gray-400' };

export const gradeColor = (g) => ({
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-orange-100 text-orange-700',
  D: 'bg-red-100 text-red-700',
}[g] || 'bg-gray-100 text-[#64748b]');
