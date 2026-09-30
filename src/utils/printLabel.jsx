import JsBarcode from 'jsbarcode'

/* ─────────────────────────────────────────────
   LABEL HTML

   One label, three ways to print it: QZ Tray on the shop PC (USB), the print
   server the phones post to, and the browser as a fallback. They must all put
   ink in the same place, so they all build the label here.

   The label is 50 x 25 mm. At 96dpi that is exactly 189 x 95 px, which is why
   every box below is sized in px and the label is never scaled - the print
   server renders this HTML at 189 x 95 and it lines up on the stock, so QZ
   Tray is handed the same page size (see qzPrint.js) rather than being left to
   scale the content to fit a page of some other size.

   @page belongs only to the browser path: a browser needs telling what size
   the paper is, while QZ Tray and the print server are told separately. It is
   added by withPageRule / printLabel, so the HTML the other two receive stays
   exactly what the print server has always been given.
────────────────────────────────────────────── */

let isPrinting = false

const LABEL_WIDTH_PX = 189
const LABEL_HEIGHT_PX = 95
const PAGE_RULE = '@page { size: 50mm 25mm; margin: 0; }'

const escapeHTML = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** Blank rather than "undefined" for a missing field, then escaped. */
const field = (value) => escapeHTML(value || '')

const buildBarcode = (labelData) => {
  const data = labelData?.data || {}
  const labelNumber = labelData?.labelNumber || ''
  const canvas = document.createElement('canvas')
  const value = labelNumber
    ? String(labelNumber)
    : data.imei1 || data.orderNumber || data.sku || '26000'

  try {
    JsBarcode(canvas, value, {
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

  return canvas.toDataURL('image/png')
}

const buildContent = (labelData, barcodeDataUrl) => {
  const type = labelData?.labelType
  const data = labelData?.data || {}
  const labelNumber = labelData?.labelNumber || ''

  if (type === 'second_hand') {
    return `
      <div class="shop-name">THE FRENCH MOBILES</div>
      <hr/>
      <div class="main-text">${field(data.brand)} ${field(data.model)}</div>
      <div class="sub-text">${field(data.ram)} RAM · ${field(data.rom)} ROM · Grade ${field(data.grade)}</div>
      <div class="price">Rs.${field(data.salePrice)}</div>
      <img class="barcode" src="${barcodeDataUrl}" />
      <div class="label-num">#${escapeHTML(labelNumber)}${data.imei1 ? ' · IMEI: ' + escapeHTML(data.imei1) : ''}</div>
    `
  }

  if (type === 'service_order') {
    return `
      <div class="shop-name">THE FRENCH MOBILES</div>
      <hr/>
      <div class="main-text">${field(data.brand)} ${field(data.model)}</div>
      <div class="sub-text">${field(data.customerName)}${data.complaintTypes?.[0] ? ' · ' + escapeHTML(data.complaintTypes[0]) : ''}</div>
      <div class="price">Est: Rs.${field(data.estimatedPrice)}</div>
      <img class="barcode" src="${barcodeDataUrl}" />
      <div class="label-num">#${escapeHTML(labelNumber)} · ${field(data.orderNumber)}</div>
    `
  }

  if (type === 'product') {
    return `
      <div class="shop-name">THE FRENCH MOBILES</div>
      <hr/>
      <div class="main-text">${field(data.productName)}</div>
      <div class="sub-text">${field(data.brand)} · ${field(data.category)}</div>
      <div class="price">Rs.${field(data.salePrice)}</div>
      <img class="barcode" src="${barcodeDataUrl}" />
      <div class="label-num">#${escapeHTML(labelNumber)}${data.sku ? ' · ' + escapeHTML(data.sku) : ''}</div>
    `
  }

  // An unknown type still gets a scannable label rather than a blank one.
  return `
    <div class="shop-name">THE FRENCH MOBILES</div>
    <div class="main-text">Label #${escapeHTML(labelNumber)}</div>
    <img class="barcode" src="${barcodeDataUrl}" />
  `
}

const LABEL_CSS = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${LABEL_WIDTH_PX}px; height: ${LABEL_HEIGHT_PX}px; overflow: hidden; background: white; }
    .label { width: ${LABEL_WIDTH_PX}px; height: ${LABEL_HEIGHT_PX}px; padding: 1px 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font-family: Arial, sans-serif; overflow: hidden; }
    .shop-name { font-size: 10pt; font-weight: bold; letter-spacing: 0.5pt; text-align: center; width: 100%; line-height: 1.1; }
    hr { width: 100%; border: none; border-top: 0.3pt solid black; margin: 0; }
    .main-text { font-size: 8pt; font-weight: bold; text-align: center; width: 100%; line-height: 1.1; }
    .sub-text { font-size: 8pt; font-weight: bold; text-align: center; color: #000000; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; letter-spacing: 0.3pt; }
    .price { font-size: 9pt; font-weight: bold; text-align: center; line-height: 1.1; }
    .barcode { width: 181px; height: 20px; display: block; }
    .label-num { font-size: 7pt; font-weight: bold; color: #000000; text-align: center; width: 100%; line-height: 1.2; letter-spacing: 0.5pt; }
  `

const buildLabelHTML = (labelData, { autoPrint = false, pageRule = false } = {}) => {
  const barcodeDataUrl = buildBarcode(labelData)
  const contentHTML = buildContent(labelData, barcodeDataUrl)
  const css = pageRule ? `${PAGE_RULE}${LABEL_CSS}` : LABEL_CSS

  const autoPrintScript = autoPrint
    ? `<script>
        window.onload = function() {
          setTimeout(function() {
            window.print()
            setTimeout(function() { window.close() }, 2000)
          }, 300)
        }
      </script>`
    : ''

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>${css}</style>
    </head>
    <body>
      <div class="label">${contentHTML}</div>${autoPrintScript}
    </body>
    </html>
  `
}

/** The label as QZ Tray and the print server take it: no page rule, no script. */
export const generateLabelHTML = (labelData) => buildLabelHTML(labelData)

/**
 * The same label, told what size the paper is - for printing through a
 * browser, which otherwise lays a 50x25mm label onto a sheet of A4.
 */
export const withPageRule = (html) =>
  String(html ?? '').replace('<style>', `<style>${PAGE_RULE}`)

export const printLabel = async (labelData) => {
  if (isPrinting) return
  isPrinting = true

  try {
    console.log('Printing label type:', labelData?.labelType, 'number:', labelData?.labelNumber)
    const printWindow = window.open('', '_blank', 'width=300,height=200')
    printWindow.document.write(buildLabelHTML(labelData, { autoPrint: true, pageRule: true }))
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
