import JsBarcode from 'jsbarcode'
import { generateLabelHTML } from './printLabel'

export const PRINT_SERVER_URL = "http://192.168.1.36:3000"

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

export const generateMobileLabelHTML = (labelEntry) => {
  const type = labelEntry?.labelType
  const data = labelEntry?.data || {}
  const labelNumber = labelEntry?.labelNumber || ''

  const barcodeCanvas = document.createElement('canvas')
  const barcodeValue = labelNumber
    ? String(labelNumber)
    : data.imei1 || data.orderNumber || data.sku || '26000'

  try {
    JsBarcode(barcodeCanvas, barcodeValue, {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000'
    })
  } catch (e) {
    console.error('Barcode error:', e)
  }

  const barcodeDataUrl = barcodeCanvas.toDataURL('image/png')

  let contentHTML = ''
  if (type === 'second_hand') {
    contentHTML = `
      <div class="shop-name">THE FRENCH MOBILES</div>
      <hr/>
      <div class="main-text">${data.brand || ''} ${data.model || ''}</div>
      <div class="sub-text">${data.ram || ''} RAM · ${data.rom || ''} ROM · Grade ${data.grade || ''}</div>
      <div class="price">Rs.${data.salePrice || ''}</div>
      <img class="barcode" src="${barcodeDataUrl}" />
      <div class="label-num">#${labelNumber}${data.imei1 ? ' · IMEI: ' + data.imei1 : ''}</div>
    `
  } else if (type === 'service_order') {
    contentHTML = `
      <div class="shop-name">THE FRENCH MOBILES</div>
      <hr/>
      <div class="main-text">${data.brand || ''} ${data.model || ''}</div>
      <div class="sub-text">${data.customerName || ''}${data.complaintTypes?.[0] ? ' · ' + data.complaintTypes[0] : ''}</div>
      <div class="price">Est: Rs.${data.estimatedPrice || ''}</div>
      <img class="barcode" src="${barcodeDataUrl}" />
      <div class="label-num">#${labelNumber} · ${data.orderNumber || ''}</div>
    `
  } else if (type === 'product') {
    contentHTML = `
      <div class="shop-name">THE FRENCH MOBILES</div>
      <hr/>
      <div class="main-text">${data.productName || ''}</div>
      <div class="sub-text">${data.brand || ''} · ${data.category || ''}</div>
      <div class="price">Rs.${data.salePrice || ''}</div>
      <img class="barcode" src="${barcodeDataUrl}" />
      <div class="label-num">#${labelNumber}${data.sku ? ' · ' + data.sku : ''}</div>
    `
  }

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 189px; height: 95px; overflow: hidden; background: white; }
    .label { width: 189px; height: 95px; padding: 1px 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font-family: Arial, sans-serif; overflow: hidden; }
    .shop-name { font-size: 7pt; font-weight: bold; letter-spacing: 0.5pt; text-align: center; width: 100%; line-height: 1.1; }
    hr { width: 100%; border: none; border-top: 0.3pt solid black; margin: 0; }
    .main-text { font-size: 8pt; font-weight: bold; text-align: center; width: 100%; line-height: 1.1; }
    .sub-text { font-size: 8pt; font-weight: bold; text-align: center; color: #000000; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; letter-spacing: 0.3pt; }
    .price { font-size: 9pt; font-weight: bold; text-align: center; line-height: 1.1; }
    .barcode { width: 181px; height: 20px; display: block; }
    .label-num { font-size: 7pt; font-weight: bold; color: #000000; text-align: center; width: 100%; line-height: 1.2; letter-spacing: 0.5pt; }
  `

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>${css}</style>
    </head>
    <body>
      <div class="label">${contentHTML}</div>
    </body>
    </html>
  `
}

export const printLabelMobile = async (labelEntry) => {
  if (!labelEntry) {
    throw new Error('labelEntry is required')
  }

  const html = generateMobileLabelHTML(labelEntry)
  const labelType = labelEntry.labelType || 'product'

  const body = {
    mode: 'html',
    html: html,
    labelType: labelType
  }

  const resp = await fetch(`${PRINT_SERVER_URL}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
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
