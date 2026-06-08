export const generateServiceJobCard = (order, shopDetails) => {
  const shop = shopDetails || {}

  const watermarkStyle = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 60px;
    font-weight: 900;
    color: rgba(0,35,149,0.06);
    white-space: nowrap;
    pointer-events: none;
    z-index: 0;
    font-family: Arial, sans-serif;
    text-transform: uppercase;
    letter-spacing: 4px;
  `

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Job Card - ${order.orderNumber}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          color: #000;
          background: #fff;
        }
        @page { size: A4 portrait; margin: 10mm; }
        .page {
          width: 190mm;
          min-height: 277mm;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        /* HEADER */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 6px;
          margin-bottom: 6px;
          border-bottom: 3px solid #002395;
        }
        .header-left {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          flex: 1;
        }
        .logo-box {
          width: 70px;
          height: 70px;
          border: 1px dashed #ccc;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 8px;
          color: #ccc;
          border-radius: 4px;
        }
        .logo-img {
          width: 70px;
          height: 70px;
          object-fit: contain;
        }
        .shop-text { flex: 1; }
        .shop-name {
          font-size: 22px;
          font-weight: 900;
          color: #002395;
          text-transform: uppercase;
        }
        .shop-hours {
          font-size: 9px;
          color: #666;
          font-style: italic;
          margin-top: 2px;
        }
        .header-right {
          text-align: right;
          flex-shrink: 0;
        }
        .doc-title {
          font-size: 20px;
          font-weight: 300;
          color: #888;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        .order-no {
          font-size: 10px;
          color: #002395;
          font-weight: bold;
          margin-top: 4px;
        }

        /* FIELD ROWS */
        .fields-section {
          margin-bottom: 10px;
        }
        .field-row {
          display: flex;
          align-items: flex-start;
          margin-bottom: 10px;
          border-bottom: 1px solid #e0e0e0;
          padding-bottom: 6px;
        }
        .field-label {
          font-size: 10px;
          font-weight: bold;
          color: #002395;
          min-width: 140px;
          flex-shrink: 0;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          padding-top: 2px;
        }
        .field-value {
          flex: 1;
          font-size: 11px;
          color: #000;
          padding-left: 8px;
          min-height: 16px;
        }
        .field-box {
          flex: 1;
          border: 1px dashed #ccc;
          min-height: 50px;
          padding: 6px;
          margin-left: 8px;
          border-radius: 4px;
          font-size: 10px;
          color: #333;
        }
        .field-hint {
          font-size: 9px;
          color: #999;
          font-style: italic;
          margin-top: 4px;
          margin-left: 148px;
        }

        /* DIVIDER */
        .divider {
          border-top: 2px solid #002395;
          margin: 12px 0;
        }

        /* TERMS */
        .terms-section {
          margin-top: 10px;
        }
        .terms-title {
          font-size: 11px;
          font-weight: bold;
          color: #002395;
          margin-bottom: 6px;
          text-transform: uppercase;
        }
        .terms-item {
          font-size: 9px;
          line-height: 1.7;
          color: #444;
          margin-bottom: 3px;
        }

        /* SIGNATURE */
        .signature-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 20px;
          padding-top: 10px;
          border-top: 1px solid #ddd;
        }
        .sig-line {
          border-bottom: 1px solid #000;
          width: 180px;
          margin-top: 30px;
          margin-bottom: 4px;
        }

        .copy-text {
          font-size: 9px;
          color: #aaa;
          font-style: italic;
          text-align: right;
          margin-top: 8px;
        }
      </style>
    </head>
    <body>

      <!-- WATERMARK -->
      <div style="${watermarkStyle}">
        ${shop.watermark_text || 'THE FRENCH MOBILES'}
      </div>

      <div class="page">

        <!-- HEADER -->
        <div class="header">
          <div class="header-left">
            ${shop.logo_url
              ? `<img src="${shop.logo_url}" class="logo-img" alt="Logo" />`
              : `<div class="logo-box">LOGO</div>`
            }
            <div class="shop-text">
              <div class="shop-name">${shop.name || 'THE FRENCH MOBILES'}</div>
              <div class="shop-hours">Business Hours: ${shop.hours || '10:00 AM - 9:00 PM'}</div>
              <div style="font-size:9px;color:#555;margin-top:2px;">${shop.address || '225, Thiruvalluvar Salai, Puducherry - 605013'}</div>
              <div style="font-size:9px;color:#555;">Ph: ${shop.phone || '+91 99447 01436'}</div>
            </div>
          </div>
          <div class="header-right">
            <div class="doc-title">Receipt / Job Sheet</div>
            <div class="order-no">Order: ${order.orderNumber}</div>
            <div style="font-size:9px;color:#666;margin-top:2px;">
              ${order.receivedAt?.toDate?.()?.toLocaleString('en-IN', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) || new Date().toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        <!-- FIELDS -->
        <div class="fields-section">

          <div class="field-row">
            <span class="field-label">Customer Name:</span>
            <span class="field-value">${order.customerName || ''}</span>
          </div>

          <div class="field-row">
            <span class="field-label">Address:</span>
            <span class="field-value"></span>
          </div>

          <div class="field-row">
            <span class="field-label">Contact Number:</span>
            <span class="field-value">${order.customerPhone || ''}</span>
          </div>

          <div class="field-row">
            <span class="field-label">Alternate Number:</span>
            <span class="field-value">${order.alternatePhone || ''}</span>
          </div>

          <div class="field-row">
            <span class="field-label">Date / Time:</span>
            <span class="field-value">
              ${order.receivedAt?.toDate?.()?.toLocaleString('en-IN', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) || new Date().toLocaleString('en-IN')}
            </span>
          </div>

          <div class="field-row">
            <span class="field-label">Product Info:</span>
            <span class="field-value">${order.brand || ''} ${order.model || ''} ${order.colour ? '(' + order.colour + ')' : ''}</span>
          </div>

          <div class="field-row">
            <span class="field-label">Product IMEI:</span>
            <span class="field-value">
              ${order.imei1 || ''}
              ${order.imei2 ? ' / ' + order.imei2 : ''}
            </span>
          </div>

          <div class="field-row" style="align-items:flex-start;">
            <span class="field-label" style="padding-top:4px;">Condition of Phone:</span>
            <div class="field-box">
              ${order.problemDetails || ''}
            </div>
          </div>
          <div class="field-hint">* Please describe condition in the box above.</div>

          <div class="field-row" style="margin-top:10px;">
            <span class="field-label">Nature of Complaint:</span>
            <span class="field-value">
              ${(order.complaintTypes || []).join(', ')}
              ${order.otherComplaint ? (order.complaintTypes?.length ? ', ' : '') + order.otherComplaint : ''}
            </span>
          </div>

          <div class="field-row">
            <span class="field-label">Technician Name:</span>
            <span class="field-value">${order.technicianName || ''}</span>
          </div>

          <div class="field-row">
            <span class="field-label">Estimated Amount:</span>
            <span class="field-value" style="font-weight:bold;font-size:13px;">
              Rs. ${order.estimatedPrice || 0}
              ${order.advancePaid > 0 ? `<span style="font-size:10px;font-weight:normal;color:#555;margin-left:10px;">(Advance: Rs. ${order.advancePaid})</span>` : ''}
            </span>
          </div>

          ${order.lockType && order.lockType !== 'None' ? `
          <div class="field-row">
            <span class="field-label">Lock Type:</span>
            <span class="field-value">${order.lockType}</span>
          </div>` : ''}

          ${order.accessoriesCollected?.length > 0 ? `
          <div class="field-row">
            <span class="field-label">Accessories:</span>
            <span class="field-value">${order.accessoriesCollected.join(', ')}</span>
          </div>` : ''}

        </div>

        <div class="divider"></div>

        <!-- TERMS -->
        <div class="terms-section">
          <div class="terms-title">Terms, Conditions & Privacy Policy</div>
          ${(shop.service_terms || [
            'No warranty / guarantee for Aftermarket Spare Parts, especially for display components.',
            'The shop will not take responsibility for orders/devices not collected within 30 days.',
            'By agreeing, you allow our company to use your personal details such as your name, phone number, and IMEI number for Customer Support, Service Improvement, and Surveys, while keeping your data safe under Privacy Laws.'
          ]).map((term, i) => `
            <div class="terms-item">• ${term}</div>
          `).join('')}
        </div>

        <!-- SIGNATURES -->
        <div class="signature-section">
          <div>
            <div style="font-size:10px;font-weight:bold;">Customer Signature:</div>
            <div class="sig-line"></div>
            <div style="font-size:9px;color:#555;">I agree to the above terms and conditions</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;font-weight:bold;">${shop.technician_label || 'Technician'}:</div>
            <div style="font-size:11px;font-weight:bold;margin-top:4px;">${order.technicianName || ''}</div>
            <div class="sig-line" style="margin-left:auto;"></div>
          </div>
        </div>

        <div class="copy-text">Customer Copy</div>

      </div>
    </body>
    </html>
  `
}
