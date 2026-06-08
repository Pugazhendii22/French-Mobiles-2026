import JsBarcode from 'jsbarcode'
import { printLabelQZ } from './qzPrint'

let isPrinting = false

export const generateLabelHTML = (labelData) => {
  const type = labelData?.labelType
  const data = labelData?.data || {}
  const labelNumber = labelData?.labelNumber || ''

  const barcodeCanvas = document.createElement('canvas')
  const barcodeValue = labelNumber
    ? String(labelNumber)
    : data.imei1 || data.orderNumber || data.sku || '26000'

  try {
    JsBarcode(barcodeCanvas, barcodeValue, {
      format: 'CODE128',
      width: 2,
      height: 40,
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
    @page { size: 50mm 25mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 50mm; height: 25mm; overflow: hidden; background: white; }
    .label { width: 50mm; height: 25mm; padding: 0.5mm 1mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5mm; font-family: Arial, sans-serif; overflow: hidden; }
    .shop-name { font-size: 7pt; font-weight: bold; letter-spacing: 0.5pt; text-align: center; width: 100%; line-height: 1.1; }
    hr { width: 100%; border: none; border-top: 0.3pt solid black; margin: 0; }
    .main-text { font-size: 8pt; font-weight: bold; text-align: center; width: 100%; line-height: 1.1; }
    .sub-text { font-size: 6pt; text-align: center; color: #333; width: 100%; line-height: 1.1; }
    .price { font-size: 9pt; font-weight: bold; text-align: center; line-height: 1.1; }
    .barcode { width: 48mm; height: 5mm; display: block; }
    .label-num { font-size: 5pt; color: #555; text-align: center; width: 100%; line-height: 1.1; }
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

export const printLabel = async (labelData) => {
  if (isPrinting) return
  isPrinting = true

  try {
    const type = labelData?.labelType
    const data = labelData?.data || {}
    const labelNumber = labelData?.labelNumber || ''

    console.log('Printing label type:', type, 'number:', labelNumber)

    // Generate barcode canvas
    const barcodeCanvas = document.createElement('canvas')
    const barcodeValue = labelNumber
      ? String(labelNumber)
      : data.imei1 || data.orderNumber || data.sku || '26000'

    try {
      JsBarcode(barcodeCanvas, barcodeValue, {
        format: 'CODE128',
        width: 2,
        height: 40,
        displayValue: false,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000'
      })
    } catch (e) {
      console.error('Barcode error:', e)
    }

    const barcodeDataUrl = barcodeCanvas.toDataURL('image/png')

    // Build label HTML based on type
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
    } else {
      contentHTML = `
        <div class="shop-name">THE FRENCH MOBILES</div>
        <div class="main-text">Label #${labelNumber}</div>
        <img class="barcode" src="${barcodeDataUrl}" />
      `
    }

    // Create print window
    const printWindow = window.open('', '_blank', 'width=300,height=200')

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page {
            size: 50mm 25mm;
            margin: 0;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 50mm;
            height: 25mm;
            overflow: hidden;
            background: white;
          }
          .label {
            width: 50mm;
            height: 25mm;
            padding: 0.5mm 1mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.5mm;
            font-family: Arial, sans-serif;
            overflow: hidden;
          }
          .shop-name {
            font-size: 8pt;
            font-weight: 900;
            letter-spacing: 0.5pt;
            text-align: center;
            width: 100%;
            line-height: 1.2;
          }
          hr {
            width: 100%;
            border: none;
            border-top: 0.5pt solid black;
          }
          .main-text {
            font-size: 10pt;
            font-weight: 900;
            text-align: center;
            width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
          }
          .sub-text {
            font-size: 7.5pt;
            font-weight: 700;
            text-align: center;
            color: #111;
            width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
          }
          .price {
            font-size: 11pt;
            font-weight: 900;
            text-align: center;
            line-height: 1.2;
          }
          .barcode {
            width: 48mm;
            height: 5mm;
            display: block;
          }
          .label-num {
            font-size: 6.5pt;
            font-weight: 700;
            color: #111;
            text-align: center;
            width: 100%;
            line-height: 1;
          }
        </style>
      </head>
      <body>
        <div class="label">
          ${contentHTML}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print()
              setTimeout(function() {
                window.close()
              }, 2000)
            }, 300)
          }
        </script>
      </body>
      </html>
    `)

    printWindow.document.close()

  } catch (error) {
    console.error('Print error:', error)
    alert('Print failed: ' + error.message)
  } finally {
    setTimeout(() => {
      isPrinting = false
    }, 3000)
  }
}
