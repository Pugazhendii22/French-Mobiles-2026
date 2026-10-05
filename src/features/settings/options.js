/* ─────────────────────────────────────────────
   OPTION LISTS

   The shop's own vocabulary - brands, models, suppliers, colours, product
   categories. A value typed into a form that is not on the list joins it, so
   the next person finds it in the dropdown instead of typing it again.

   Deciding what is new is kept separate from writing it, so the rules can be
   tested without a database.
────────────────────────────────────────────── */

/** Trimmed, with runs of inner whitespace collapsed. Casing is left alone. */
export const normalizeOption = (value) =>
  String(value ?? '').trim().replace(/\s+/g, ' ')

const squash = (value) => normalizeOption(value).toLowerCase()

/** The entry already on the list that means the same thing, or null. */
export const findExisting = (options = [], value) => {
  const needle = squash(value)
  if (!needle) return null
  return options.find(o => squash(o) === needle) ?? null
}

/* Which settings document and field each kind of list lives in. A flat list
   keeps its values under `items`; models are keyed by brand; field options by
   field name. */
const plan = (writes, docKey, field, value, existing) => {
  const clean = normalizeOption(value)
  if (!clean || !field) return
  if (findExisting(existing, clean)) return
  writes.push({ docKey, field, value: clean })
}

/**
 * The writes needed so every requested value is on its list.
 * Returns [] when there is nothing new - the common case for a normal save.
 */
export const planOptionWrites = (requested = {}, known = {}) => {
  const writes = []
  const req = requested || {}

  plan(writes, 'brands', 'items', req.brands, known.brands || [])

  Object.entries(req.models || {}).forEach(([brand, model]) => {
    const brandKey = normalizeOption(brand)
    plan(writes, 'models', brandKey, model, (known.models || {})[brandKey] || [])
  })

  Object.entries(req.field_options || {}).forEach(([field, value]) => {
    plan(writes, 'field_options', field, value, (known.field_options || {})[field] || [])
  })

  return writes
}
