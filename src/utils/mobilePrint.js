import JsBarcode from 'jsbarcode'

export const PRINT_SERVER_URL = "http://192.168.1.36:3000" // ← update with Termux phone IP

export const checkPrintServer = async () => {
  try {
    const resp = await fetch(`${PRINT_SERVER_URL}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000)
    })
    if (!resp.ok) return 'server_offline'
    const json = await resp.json()
    return json?.printer?.online === true ? 'online' : 'printer_offline'
  } catch (err) {
    return 'server_offline'
  }
}

// Build barcode value same as before
const getBarcodeValue = (labelEntry) => {
  const data = labelEntry?.data || {}
  const labelNumber = labelEntry?.labelNumber || ''
  return labelNumber
    ? String(labelNumber)
    : data.imei1 || data.orderNumber || data.sku || '26000'
}

// Build text fields per label type — sent to Termux server as TSPL
const buildLabelFields = (labelEntry) => {
  const type = labelEntry?.labelType
  const data = labelEntry?.data || {}
  const labelNumber = labelEntry?.labelNumber || ''
  const barcode = getBarcodeValue(labelEntry)

  if (type === 'second_hand') {
    return {
      line1:   `${data.brand || ''} ${data.model || ''}`.trim(),
      line2:   `${data.ram || ''}RAM ${data.rom || ''}ROM Gr:${data.grade || ''}`,
      line3:   `Rs.${data.salePrice || ''} #${labelNumber}${data.imei1 ? ' IMEI:' + data.imei1 : ''}`,
      barcode,
    }
  } else if (type === 'service_order') {
    return {
      line1:   `${data.brand || ''} ${data.model || ''}`.trim(),
      line2:   `${data.customerName || ''}${data.complaintTypes?.[0] ? ' · ' + data.complaintTypes[0] : ''}`,
      line3:   `Est:Rs.${data.estimatedPrice || ''} #${labelNumber} ${data.orderNumber || ''}`,
      barcode,
    }
  } else if (type === 'product') {
    return {
      line1:   `${data.productName || ''}`,
      line2:   `${data.brand || ''} · ${data.category || ''}`,
      line3:   `Rs.${data.salePrice || ''} #${labelNumber}${data.sku ? ' ' + data.sku : ''}`,
      barcode,
    }
  }

  // fallback
  return {
    line1: `Label #${labelNumber}`,
    line2: '',
    line3: '',
    barcode,
  }
}

export const printLabelMobile = async (labelEntry) => {
  if (!labelEntry) {
    throw new Error('labelEntry is required')
  }

  const fields = buildLabelFields(labelEntry)

  const body = {
    line1:   fields.line1,
    line2:   fields.line2,
    line3:   fields.line3,
    barcode: fields.barcode,
    copies:  1,
  }

  const resp = await fetch(`${PRINT_SERVER_URL}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  })

  if (!resp.ok) {
    let msg = `Print server responded ${resp.status}`
    try {
      const j = await resp.json()
      if (j && j.error) msg = j.error
    } catch (e) {}
    throw new Error(msg)
  }

  const json = await resp.json()
  if (json && json.success) return { success: true }
  throw new Error((json && json.error) || 'Unknown print server error')
}

export default {
  PRINT_SERVER_URL,
  checkPrintServer,
  printLabelMobile
}
