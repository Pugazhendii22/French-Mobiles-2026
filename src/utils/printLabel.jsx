import JsBarcode from 'jsbarcode'

let isPrinting = false

/**
 * Product names have to be readable across the shop, not just at the scanner.
 * The name shares a row with the price, which frees a whole row of the 25mm
 * label for the name - measured to be worth more than the width the price
 * costs, for every name short enough to matter.
 *
 * The size is chosen by measuring the real string: work out how many lines it
 * needs at each candidate size, then take the largest that fits both the line
 * limit and the vertical room the row has.
 */
const NAME_SIZES_PT = [20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8]
const ROW_WIDTH_MM = 46          // 48mm printable, less a safety margin
const NAME_PRICE_GAP_MM = 1.5
const STACKED_MAX_LINES = 2
const STACKED_BUDGET_MM = 10.8   // room left once shop / price row / barcode / footer are placed
const INLINE_MAX_LINES = 3
const INLINE_BUDGET_MM = 14.5    // the price row is gone, so the name inherits it
const PRICE_PT = 11
const PX_PER_MM = 96 / 25.4
const PT_TO_PX = 96 / 72

/** Greedy line-break simulation - matches how the browser actually wraps. */
const countWrappedLines = (ctx, text, maxWidthPx) => {
  const words = text.split(/\s+/).filter(Boolean)
  const spacePx = ctx.measureText(' ').width
  let lines = 1
  let used = 0

  for (const word of words) {
    const wordPx = ctx.measureText(word).width

    // A single word wider than the line breaks mid-word (word-break: break-word)
    if (wordPx > maxWidthPx) {
      if (used > 0) lines++
      const chunks = Math.ceil(wordPx / maxWidthPx)
      lines += chunks - 1
      used = wordPx - (chunks - 1) * maxWidthPx
      continue
    }

    const needed = used === 0 ? wordPx : used + spacePx + wordPx
    if (needed <= maxWidthPx) {
      used = needed
    } else {
      lines++
      used = wordPx
    }
  }

  return lines
}

/** Largest size whose wrapped text fits `maxLines` and `budgetMM` of height. */
const fitSize = (ctx, text, availablePx, maxLines, budgetMM) => {
  for (const pt of NAME_SIZES_PT) {
    ctx.font = `900 ${pt * PT_TO_PX}px Arial, sans-serif`
    const lines = countWrappedLines(ctx, text, availablePx)
    if (lines > maxLines) continue
    if (((lines * pt) / 72) * 25.4 <= budgetMM) return pt
  }
  return NAME_SIZES_PT[NAME_SIZES_PT.length - 1]
}

/**
 * Two ways to lay out a product label:
 *
 *   stacked - name on its own rows, price beneath. Full 46mm width, but only
 *             two rows tall because the price needs a row of its own.
 *   inline  - name and price share a row. Frees that row (three lines of name
 *             fit) at the cost of the width the price occupies.
 *
 * Neither wins outright: short names do better inline, longer ones stacked.
 * So measure both and use whichever prints the name larger.
 */
const chooseProductLayout = (name, priceText = '') => {
  const text = String(name ?? '').trim().toUpperCase()
  const smallest = NAME_SIZES_PT[NAME_SIZES_PT.length - 1]
  if (!text) return { layout: 'stacked', pt: smallest }

  let ctx
  try {
    ctx = document.createElement('canvas').getContext('2d')
  } catch {
    // No canvas (SSR / odd browser): fall back to something conservative
    return { layout: 'stacked', pt: 11 }
  }
  if (!ctx) return { layout: 'stacked', pt: 11 }

  ctx.font = `900 ${PRICE_PT * PT_TO_PX}px Arial, sans-serif`
  const pricePx = ctx.measureText(String(priceText)).width
  const fullPx = ROW_WIDTH_MM * PX_PER_MM
  const besidePricePx = fullPx - pricePx - NAME_PRICE_GAP_MM * PX_PER_MM

  const stackedPt = fitSize(ctx, text, fullPx, STACKED_MAX_LINES, STACKED_BUDGET_MM)
  const inlinePt = besidePricePx > 0
    ? fitSize(ctx, text, besidePricePx, INLINE_MAX_LINES, INLINE_BUDGET_MM)
    : 0

  return inlinePt > stackedPt
    ? { layout: 'inline', pt: inlinePt }
    : { layout: 'stacked', pt: stackedPt }
}

const escapeHTML = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

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
      height: 40,
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
      <div class="main-text">${escapeHTML(data.brand)} ${escapeHTML(data.model)}</div>
      <div class="sub-text">${escapeHTML(data.ram)} RAM · ${escapeHTML(data.rom)} ROM · Grade ${escapeHTML(data.grade)}</div>
      <div class="price">Rs.${escapeHTML(data.salePrice)}</div>
      <img class="barcode" src="${barcodeDataUrl}" />
      <div class="label-num">#${escapeHTML(labelNumber)}${data.imei1 ? ' · IMEI: ' + escapeHTML(data.imei1) : ''}</div>
    `
  }

  if (type === 'service_order') {
    return `
      <div class="shop-name">THE FRENCH MOBILES</div>
      <hr/>
      <div class="main-text">${escapeHTML(data.brand)} ${escapeHTML(data.model)}</div>
      <div class="sub-text">${escapeHTML(data.customerName)}${data.complaintTypes?.[0] ? ' · ' + escapeHTML(data.complaintTypes[0]) : ''}</div>
      <div class="price">Est: Rs.${escapeHTML(data.estimatedPrice)}</div>
      <img class="barcode" src="${barcodeDataUrl}" />
      <div class="label-num">#${escapeHTML(labelNumber)} · ${escapeHTML(data.orderNumber)}</div>
    `
  }

  if (type === 'product') {
    // Brand / category / SKU drop to the footer so the name owns the space
    const priceText = `Rs.${data.salePrice ?? ''}`
    const footer = [
      labelNumber ? `#${escapeHTML(labelNumber)}` : '',
      escapeHTML(data.brand),
      escapeHTML(data.category),
      escapeHTML(data.sku)
    ].filter(Boolean).join(' · ')

    const { layout, pt } = chooseProductLayout(data.productName, priceText)
    const nameHTML = `<div class="p-name p-name--${layout}" style="font-size:${pt}pt">${escapeHTML(data.productName)}</div>`

    const body = layout === 'inline'
      ? `<div class="p-row">${nameHTML}<div class="p-price p-price--inline">${escapeHTML(priceText)}</div></div>`
      : `${nameHTML}<div class="p-price">${escapeHTML(priceText)}</div>`

    return `
      <div class="p-shop">THE FRENCH MOBILES</div>
      ${body}
      <img class="barcode" src="${barcodeDataUrl}" />
      <div class="p-foot">${footer}</div>
    `
  }

  return `
    <div class="shop-name">THE FRENCH MOBILES</div>
    <div class="main-text">Label #${escapeHTML(labelNumber)}</div>
    <img class="barcode" src="${barcodeDataUrl}" />
  `
}

const LABEL_CSS = `
  @page { size: 50mm 25mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 50mm; height: 25mm; overflow: hidden; background: white; }
  .label { width: 50mm; height: 25mm; padding: 0.5mm 1mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5mm; font-family: Arial, sans-serif; overflow: hidden; }
  .shop-name { font-size: 9pt; font-weight: bold; letter-spacing: 0.5pt; text-align: center; width: 100%; line-height: 1.1; }
  hr { width: 100%; border: none; border-top: 0.3pt solid black; margin: 0; }
  .main-text { font-size: 8pt; font-weight: bold; text-align: center; width: 100%; line-height: 1.1; }
  .sub-text { font-size: 8pt; font-weight: bold; text-align: center; color: #000000; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; letter-spacing: 0.3pt; }
  .price { font-size: 9pt; font-weight: bold; text-align: center; line-height: 1.1; }
  .barcode { width: 48mm; height: 5mm; display: block; }
  .label-num { font-size: 7pt; font-weight: bold; color: #000000; text-align: center; width: 100%; line-height: 1.2; letter-spacing: 0.5pt; }

  /* ── PRODUCT LABEL ───────────────────────────────
     Tuned so the product name reads from across the shop. Tighter gaps and a
     demoted footer buy the vertical room; the size itself is set inline from
     productNameSize() so long names step down rather than clip. */
  .label--product { gap: 0.2mm; padding: 0.3mm 1mm; }
  .p-shop { font-size: 5.5pt; font-weight: bold; letter-spacing: 0.4pt; text-align: center; width: 100%; line-height: 1; }
  .p-row { display: flex; align-items: center; width: 100%; gap: 1.5mm; }
  .p-name {
    font-weight: 900; line-height: 1; text-transform: uppercase; letter-spacing: -0.1pt;
    display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;
  }
  .p-name--stacked { text-align: center; width: 100%; -webkit-line-clamp: 2; }
  .p-name--inline { text-align: left; flex: 1; min-width: 0; -webkit-line-clamp: 3; }
  .p-price { font-size: 11pt; font-weight: 900; text-align: center; width: 100%; line-height: 1; }
  .p-price--inline { text-align: right; width: auto; white-space: nowrap; flex-shrink: 0; }
  .p-foot { font-size: 5.5pt; font-weight: bold; text-align: center; width: 100%; line-height: 1; letter-spacing: 0.2pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`

/** Single source of truth for every print path (QZ Tray, browser, mobile). */
const buildLabelHTML = (labelData, { autoPrint = false } = {}) => {
  const barcodeDataUrl = buildBarcode(labelData)
  const contentHTML = buildContent(labelData, barcodeDataUrl)
  const modifier = labelData?.labelType === 'product' ? ' label--product' : ''

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
      <style>${LABEL_CSS}</style>
    </head>
    <body>
      <div class="label${modifier}">${contentHTML}</div>
      ${autoPrintScript}
    </body>
    </html>
  `
}

export const generateLabelHTML = (labelData) => buildLabelHTML(labelData)

export const printLabel = async (labelData) => {
  if (isPrinting) return
  isPrinting = true

  try {
    console.log('Printing label type:', labelData?.labelType, 'number:', labelData?.labelNumber)
    const printWindow = window.open('', '_blank', 'width=300,height=200')
    printWindow.document.write(buildLabelHTML(labelData, { autoPrint: true }))
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
