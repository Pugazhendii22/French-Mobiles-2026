/* The product document, built from the form. handleSubmit and
   handleSaveAndPrint each had their own copy of this, including the stock
   status rules written out twice, so the two paths could drift apart. */

const generateSku = () =>
  'SKU-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000).toString().padStart(3, '0')

/** Stock status from the quantity on hand and the low-stock threshold. */
export const stockStatus = (stockNum, thresholdNum) => {
  if (stockNum === 0) return 'out of stock'
  if (stockNum <= thresholdNum) return 'low stock'
  return 'in stock'
}

/**
 * The document to save. `serialNumber` is only passed by the save-and-print
 * path; a plain save leaves the field off entirely.
 */
export const buildProductData = ({
  formData, modelsInput, localId, currentUserUid, serialNumber,
}) => {
  const stockNum = Number(formData.stock) || 0
  const thresholdNum = Number(formData.threshold) || 5

  const data = {
    ...formData,
    sku: formData.sku || generateSku(),
    purchasePrice: Number(formData.purchasePrice) || 0,
    salePrice: Number(formData.salePrice) || 0,
    stock: stockNum,
    threshold: thresholdNum,
    status: stockStatus(stockNum, thresholdNum),
    compatibleModels: modelsInput.split(',').map(m => m.trim()).filter(m => m !== ''),
    updatedAt: new Date().toISOString(),
  }

  if (serialNumber) data.serialNumber = serialNumber

  if (!localId) {
    data.createdAt = new Date().toISOString()
    data.createdBy = currentUserUid
  } else {
    data.id = localId
  }

  return data
}
