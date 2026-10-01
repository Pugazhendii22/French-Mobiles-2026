/* Which required fields are missing, and which one the form should scroll to.

   "Missing" means empty, not falsy. A sold-out product has stock 0 and an edit
   seeds the form straight from the Firestore document, where stock is a number -
   so a !value check called 0 missing and refused the save. You could not change
   the price of anything that had sold out without first editing its stock. */

const isBlank = (value) => value === '' || value === null || value === undefined

export const validateProductForm = (formData = {}) => {
  const errors = {}
  let firstErrorField = null

  const require_ = (field, message) => {
    if (isBlank(formData[field])) {
      errors[field] = message
      if (!firstErrorField) firstErrorField = field
    }
  }

  require_('name', 'Product name is required')
  require_('salePrice', 'Sale price is required')
  require_('stock', 'Stock quantity is required')

  return { errors, firstErrorField }
}
