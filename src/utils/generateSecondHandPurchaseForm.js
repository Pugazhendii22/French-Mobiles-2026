/* ─────────────────────────────────────────────
   SECOND-HAND PURCHASE & SELLER DECLARATION

   Printed when the shop takes a device in from a customer. It records who
   handed the device over, proof of their identity, the exact device, the money
   paid, and - the point of the whole form - a signed declaration that they own
   it and that ownership passes to the shop, with a stated window in which they
   may buy it back before the shop is free to sell.

   The wording here is a starting template. It is not legal advice; have a local
   advocate review and adjust it, and edit the clauses in Settings.
────────────────────────────────────────────── */

const DEFAULT_PURCHASE_TERMS = [
  'I am the lawful owner of the device described above and I am legally entitled to sell it.',
  'The device is not stolen or lost, has not been obtained by unlawful means, and is not the subject of any police complaint, FIR, or court proceeding.',
  'The device is free from any loan, EMI, hypothecation, insurance claim, or third-party claim.',
  'I have removed all my personal data, signed out of all accounts (Google / iCloud / Mi / Samsung and any others), and removed every screen lock and activation lock.',
  'I have handed over the device voluntarily for the amount stated above, and I confirm I have received that amount in full.',
  'Ownership of the device passes to the shop on receipt of the above payment.',
  'Once the buy-back period stated below has passed, the shop may repair, refurbish, resell or otherwise deal with the device without any further notice or consent from me, and I will have no claim over it.',
  'I will indemnify the shop against any loss, claim, or legal action arising from any prior ownership of the device, any defect in title, or any use of the device before this sale.',
  'I have produced valid government photo identification, a copy of which is attached to this form.',
]

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const fmtDate = (value) => {
  if (!value) return ''
  const d = value?.toDate ? value.toDate() : new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN')
}

const fmtDateTime = (value) => {
  if (!value) return ''
  const d = value?.toDate ? value.toDate() : new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN')
}

const addDays = (value, days) => {
  const d = value?.toDate ? value.toDate() : new Date(value || Date.now())
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + Number(days || 0))
  return d.toLocaleDateString('en-IN')
}

/** Value if present, otherwise a ruled blank to fill in by hand. */
const orBlank = (value, width = '100%') =>
  value
    ? `<span class="val">${esc(value)}</span>`
    : `<span class="blank" style="min-width:${width}"></span>`

export const generateSecondHandPurchaseForm = (mobile, shopDetails, seller = {}, staffName = '') => {
  const shop = shopDetails || {}
  const m = mobile || {}
  const terms = (shop.purchase_terms && shop.purchase_terms.length)
    ? shop.purchase_terms
    : DEFAULT_PURCHASE_TERMS
  const holdDays = Number(shop.purchase_hold_days ?? 7)

  const purchaseDate = m.purchaseDate || m.createdAt
  const buyBackBy = addDays(purchaseDate, holdDays)

  const row = (label, value, width) =>
    `<div class="field"><span class="lbl">${label}</span>${orBlank(value, width)}</div>`

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Purchase Declaration - ${esc(m.brand)} ${esc(m.model)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; }
        @page { size: A4 portrait; margin: 10mm; }
        .page { width: 190mm; margin: 0 auto; }

        .header { display: flex; justify-content: space-between; align-items: flex-start;
                  padding-bottom: 6px; margin-bottom: 8px; border-bottom: 3px solid #002395; }
        .shop-name { font-size: 17px; font-weight: 900; color: #002395; letter-spacing: 0.5px; }
        .shop-meta { font-size: 9px; color: #444; line-height: 1.5; margin-top: 2px; max-width: 105mm; }
        .doc-title { text-align: right; }
        .doc-title h1 { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
        .doc-title .sub { font-size: 9px; color: #555; margin-top: 2px; }

        .section { margin-top: 9px; }
        .section-title { font-size: 10px; font-weight: bold; color: #002395; text-transform: uppercase;
                         letter-spacing: 0.5px; border-bottom: 1px solid #002395; padding-bottom: 2px; margin-bottom: 5px; }
        .grid { display: flex; flex-wrap: wrap; gap: 4px 14px; }
        .field { flex: 1 1 45%; display: flex; align-items: flex-end; gap: 5px; font-size: 10.5px; padding: 2px 0; }
        .field.full { flex-basis: 100%; }
        .lbl { color: #555; white-space: nowrap; }
        .val { font-weight: bold; border-bottom: 1px dotted #bbb; flex: 1; }
        .blank { border-bottom: 1px solid #000; flex: 1; height: 12px; display: inline-block; }

        .amount-box { border: 2px solid #002395; border-radius: 4px; padding: 6px 10px; margin-top: 8px;
                      display: flex; justify-content: space-between; align-items: center; }
        .amount-box .k { font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
        .amount-box .v { font-size: 18px; font-weight: 900; color: #002395; }

        .warning { border: 2px solid #ED2939; background: #fff5f5; border-radius: 4px;
                   padding: 7px 10px; margin-top: 9px; }
        .warning-title { font-size: 10.5px; font-weight: 900; color: #ED2939; text-transform: uppercase;
                         letter-spacing: 0.5px; margin-bottom: 3px; }
        .warning p { font-size: 9.5px; line-height: 1.55; color: #7a1520; }

        .buyback { border: 1.5px dashed #002395; border-radius: 4px; padding: 7px 10px; margin-top: 9px; background: #f5f8ff; }
        .buyback-title { font-size: 10.5px; font-weight: 900; color: #002395; text-transform: uppercase; margin-bottom: 3px; }
        .buyback p { font-size: 9.5px; line-height: 1.6; }
        .buyback .date { font-weight: 900; text-decoration: underline; }

        .decl li { font-size: 9.5px; line-height: 1.65; margin-bottom: 3px; margin-left: 14px; }

        .sign-row { display: flex; justify-content: space-between; gap: 18px; margin-top: 16px; padding-top: 8px; border-top: 1px solid #ddd; }
        .sign-col { flex: 1; }
        .sig-line { border-bottom: 1px solid #000; margin-top: 28px; margin-bottom: 3px; }
        .sig-img { display: block; height: 22mm; max-width: 60mm; object-fit: contain;
                   border-bottom: 1px solid #000; margin-top: 4px; margin-bottom: 3px; }
        .sig-label { font-size: 9.5px; font-weight: bold; }
        .sig-note { font-size: 8.5px; color: #666; }
        .thumb { border: 1px solid #000; width: 26mm; height: 26mm; display: flex; align-items: center;
                 justify-content: center; font-size: 8px; color: #888; text-align: center; }

        .footer { margin-top: 12px; display: flex; justify-content: space-between;
                  font-size: 8.5px; color: #888; border-top: 1px solid #eee; padding-top: 5px; }
      </style>
    </head>
    <body>
      <div class="page">

        <div class="header">
          <div>
            <div class="shop-name">${esc(shop.name || 'THE FRENCH MOBILES')}</div>
            <div class="shop-meta">
              ${esc(shop.address || '')}<br>
              Ph: ${esc(shop.phone || '')} ${shop.gstin ? ' &middot; GSTIN: ' + esc(shop.gstin) : ''}
            </div>
          </div>
          <div class="doc-title">
            <h1>Mobile Purchase &amp;<br>Seller Declaration</h1>
            <div class="sub">
              Date: <strong>${esc(fmtDate(purchaseDate) || fmtDate(new Date()))}</strong><br>
              ${m.assignedLabelNumber ? 'Ref: #' + esc(m.assignedLabelNumber) : ''}
            </div>
          </div>
        </div>

        <!-- SELLER -->
        <div class="section">
          <div class="section-title">Seller Details (person handing over the device)</div>
          <div class="grid">
            ${row('Name', m.sellerName || seller.name)}
            ${row('Mobile No.', m.sellerPhone || seller.phone)}
            ${row('Alternate No.', m.sellerAlternatePhone || seller.alternatePhone)}
            ${row('ID Type', seller.idType)}
            ${row('ID Number', seller.idNumber)}
            ${row('ID Copy Attached', m.idCardFrontUrl ? 'Yes - on file' : '')}
            <div class="field full">
              <span class="lbl">Address</span>${orBlank(seller.address || m.sellerAddress)}
            </div>
          </div>
        </div>

        <!-- DEVICE -->
        <div class="section">
          <div class="section-title">Device Details</div>
          <div class="grid">
            ${row('Brand', m.brand)}
            ${row('Model', m.model)}
            ${row('IMEI 1', m.imei1)}
            ${row('IMEI 2', m.imei2)}
            ${row('Serial No.', m.serialNumber)}
            ${row('Colour', m.colour)}
            ${row('RAM / Storage', [m.ram, m.rom].filter(Boolean).join(' / '))}
            ${row('Condition Grade', m.condition ? 'Grade ' + m.condition : '')}
            <div class="field full">
              <span class="lbl">Accessories handed over</span>${orBlank(m.accessories && m.accessories.join ? m.accessories.join(', ') : '')}
            </div>
          </div>
        </div>

        <div class="amount-box">
          <div>
            <div class="k">Amount paid to seller</div>
            <div style="font-size:9px;color:#666;margin-top:1px;">Received in full by the seller on the date above</div>
          </div>
          <div class="v">Rs. ${Number(m.purchasePrice || 0).toLocaleString('en-IN')}</div>
        </div>

        <!-- DECLARATION -->
        <div class="section">
          <div class="section-title">Seller's Declaration</div>
          <ol class="decl">
            ${terms.map(t => `<li>${esc(t)}</li>`).join('')}
          </ol>
        </div>

        <!-- WARNING -->
        <div class="warning">
          <div class="warning-title">Important notice</div>
          <p>
            Selling a stolen or lost mobile phone, or any device that does not belong to you, is a criminal
            offence. Altering, removing or misrepresenting an IMEI number is also an offence under applicable
            law. This shop records the seller's identity and the device IMEI for every purchase and will
            co-operate fully with the police and other authorities in any investigation. Giving false
            information on this form may result in criminal proceedings.
          </p>
        </div>

        <!-- SIGNATURES -->
        <div class="sign-row">
          <div class="sign-col">
            <div class="sig-label">Seller's Signature</div>
            ${m.sellerSignatureUrl
              ? `<img class="sig-img" src="${esc(m.sellerSignatureUrl)}" alt="Seller signature" />`
              : `<div class="sig-line"></div>`}
            <div class="sig-note">I have read and understood the above and I agree to it.</div>
            <div class="sig-note" style="margin-top:3px;">Name: ${esc(m.sellerName || '')}</div>
            ${m.agreementAcceptedAt
              ? `<div class="sig-note">Signed in store on ${esc(fmtDateTime(m.agreementAcceptedAt))}</div>`
              : ''}
            ${m.sellerIdVerified
              ? `<div class="sig-note" style="color:#166534;font-weight:bold;">&#10003; Original photo ID checked by shop staff</div>`
              : ''}
          </div>
          <div class="sign-col" style="flex:0 0 26mm;">
            <div class="sig-label">Thumb Impression</div>
            <div class="thumb" style="margin-top:4px;">Left thumb</div>
          </div>
          <div class="sign-col" style="text-align:right;">
            <div class="sig-label">For ${esc(shop.name || 'THE FRENCH MOBILES')}</div>
            <div class="sig-line"></div>
            <div class="sig-note">${esc(staffName || '')}</div>
          </div>
        </div>

        <div class="footer">
          <span>Two copies to be signed &mdash; one retained by the shop, one given to the seller.</span>
          <span>Shop Copy / Seller Copy</span>
        </div>

      </div>
    </body>
    </html>
  `
}

export default generateSecondHandPurchaseForm
