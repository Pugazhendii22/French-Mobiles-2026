import JsBarcode from 'jsbarcode'
import { generateLabelHTML } from './printLabel'

export const PRINT_SERVER_URL = "http://192.168.1.36:3000"

export const checkPrintServer = async () => {
  try {
    const resp = await fetch(${PRINT_SERVER_URL}/status, {
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
      <div class="main-text">${data.customerName || ''}</div>
      <div class="sub-text">${data.brand || ''} ${data.model || ''}</div>
      <div class="sub-text">${data.complaintTypes?.[0] || ''}</div>
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
    .shop-name { font-size: 9pt; font-weight: 900; letter-spacing: 0.8pt; text-align: center; width: 100%; line-height: 1.1; }
    hr { width: 100%; border: none; border-top: 0.3pt solid black; margin: 0; }
    .main-text { font-size: 8pt; font-weight: bold; text-align: center; width: 100%; line-height: 1.1; }
    .sub-text { font-size: 8pt; font-weight: bold; text-align: center; color: #000000; width: 100%; line-height: 1.2; }
    .price { font-size: 9pt; font-weight: bold; text-align: center; line-height: 1.1; }
    .barcode { width: 181px; height: 20px; display: block; }
    .label-num { font-size: 7pt; font-weight: bold; color: #000000; text-align: center; width: 100%; line-height: 1.2; }
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

  // Load html2canvas dynamically
  if (!window.html2canvas && !document.querySelector('script[src*="html2canvas"]')) {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    document.head.appendChild(script)
    await new Promise(resolve => script.onload = resolve)
  } else if (!window.html2canvas) {
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (window.html2canvas) {
          clearInterval(interval)
          resolve()
        }
      }, 50)
    })
  }

  const html = generateMobileLabelHTML(labelEntry)

  const base64Png = await new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.top = '-9999px'
    iframe.style.left = '-9999px'
    iframe.style.width = '189px'
    iframe.style.height = '95px'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()

    const captureFrame = () => {
      setTimeout(() => {
        window.html2canvas(doc.body, {
          width: 189,
          height: 95,
          scale: 2.116,
          logging: false,
          backgroundColor: '#ffffff'
        }).then(canvas => {
          const hiddenCanvas = document.createElement('canvas')
          hiddenCanvas.width = 400
          hiddenCanvas.height = 200
          const ctx = hiddenCanvas.getContext('2d')
          if (ctx) {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, 400, 200)
            ctx.drawImage(canvas, 0, 0, 400, 200)
          }
          const base64PngString = hiddenCanvas.toDataURL('image/png')
          document.body.removeChild(iframe)
          resolve(base64PngString)
        }).catch(err => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe)
          }
          reject(err)
        })
      }, 150)
    }

    if (doc.readyState === 'complete') {
      captureFrame()
    } else {
      iframe.onload = captureFrame
    }
  })

  const body = {
    mode: 'bitmap',
    bitmap: base64Png
  }

  const resp = await fetch(${PRINT_SERVER_URL}/print, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!resp.ok) {
    let msg = Print server responded ${resp.status}
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