export const generateServiceFinalBill = (order, shopDetails) => {
  const shop = shopDetails || {}
  const finalAmount = order.estimatedPrice || 0
  const advance = order.advancePaid || 0
  const balance = finalAmount - advance

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
      <title>Final Bill - ${order.orderNumber}</title>
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
          font-weight: bold;
          color: #002395;
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

        /* FAULT / SOLUTION SECTION */
        .fault-solution {
          display: flex;
          gap: 0;
          border: 1px solid #ddd;
          margin-bottom: 10px;
        }
        .fault-col {
          flex: 1;
          padding: 8px 10px;
          border-right: 1px solid #ddd;
        }
        .solution-col {
          flex: 1;
          padding: 8px 10px;
        }
        .section-title {
          font-size: 10px;
          font-weight: bold;
          color: #002395;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
          border-bottom: 1px solid #eee;
          padding-bottom: 3px;
        }
        .content-text {
          font-size: 10px;
          line-height: 1.6;
          color: #333;
          min-height: 40px;
        }

        /* PAYMENT SUMMARY */
        .payment-summary-box {
          border: 1px solid #ddd;
          margin-bottom: 10px;
        }
        .payment-summary-title {
          background: #002395;
          color: white;
          padding: 6px 10px;
          font-size: 10px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .payment-table {
          width: 100%;
          border-collapse: collapse;
        }
        .payment-table td {
          padding: 6px 10px;
          font-size: 10px;
          border-bottom: 1px solid #eee;
        }
        .payment-table tr:last-child td {
          border-bottom: none;
        }
        .payment-table .total-row td {
          font-weight: bold;
          font-size: 11px;
        }
        .payment-table .balance-row td {
          font-weight: bold;
          font-size: 12px;
          background: #f8fafc;
        }

        /* WARRANTY */
        .warranty-section {
          border: 1px solid #ddd;
          padding: 8px 10px;
          margin-bottom: 10px;
        }
        .warranty-title {
          font-size: 10px;
          font-weight: bold;
          color: #002395;
          border-bottom: 1px solid #eee;
          padding-bottom: 4px;
          margin-bottom: 6px;
          text-transform: uppercase;
        }
        .warranty-text {
          font-size: 9px;
          line-height: 1.6;
          color: #444;
        }

        /* SIGNATURES */
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
            <div class="doc-title">FINAL SERVICE BILL</div>
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
            <span class="field-label">Contact Number:</span>
            <span class="field-value">${order.customerPhone || ''}</span>
          </div>

          <div class="field-row">
            <span class="field-label">Product Info:</span>
            <span class="field-value">${order.brand || ''} ${order.model || ''} ${order.colour ? '(' + order.colour + ')' : ''}</span>
          </div>

          <div class="field-row">
            <span class="field-label">Product IMEI:</span>
            <span class="field-value">${order.imei1 || ''}</span>
          </div>

          <div class="field-row">
            <span class="field-label">Technician Name:</span>
            <span class="field-value">${order.technicianName || ''}</span>
          </div>

          <div class="field-row">
            <span class="field-label">Completion Date:</span>
            <span class="field-value">
              ${order.actualCompletedAt?.toDate?.()?.toLocaleString('en-IN', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) || new Date().toLocaleString('en-IN')}
            </span>
          </div>

        </div>

        <!-- FAULT & SOLUTION -->
        <div class="fault-solution">
          <div class="fault-col">
            <div class="section-title">Issues Reported</div>
            <div class="content-text">
              ${(order.complaintTypes || []).map(c => `• ${c}`).join('<br>')}
              ${order.otherComplaint ? `<br>• ${order.otherComplaint}` : ''}
            </div>
          </div>
          <div class="solution-col">
            <div class="section-title">Work Done / Solution</div>
            <div class="content-text">
              ${order.suggestions || 'Service completed successfully.'}
            </div>
          </div>
        </div>

        <!-- PAYMENT SUMMARY -->
        <div class="payment-summary-box">
          <div class="payment-summary-title">Payment Summary</div>
          <table class="payment-table">
            <tr>
              <td>Service Charge</td>
              <td style="text-align:right;">Rs. ${(order.estimatedPrice || 0).toLocaleString('en-IN')}</td>
            </tr>
            ${order.rawMaterialCost > 0 ? `
            <tr>
              <td>Parts / Material Cost</td>
              <td style="text-align:right;">Rs. ${Number(order.rawMaterialCost).toLocaleString('en-IN')}</td>
            </tr>` : ''}
            ${order.outsideLabourCost > 0 ? `
            <tr>
              <td>Outside Labour</td>
              <td style="text-align:right;">Rs. ${Number(order.outsideLabourCost).toLocaleString('en-IN')}</td>
            </tr>` : ''}
            <tr class="total-row">
              <td>Total Amount</td>
              <td style="text-align:right;">Rs. ${finalAmount.toLocaleString('en-IN')}</td>
            </tr>
            ${advance > 0 ? `
            <tr>
              <td>Advance Paid</td>
              <td style="text-align:right;color:green;">- Rs. ${advance.toLocaleString('en-IN')}</td>
            </tr>` : ''}
            <tr class="balance-row">
              <td style="font-weight:bold;">
                ${balance > 0 ? 'Balance Due' : 'Status'}
              </td>
              <td style="text-align:right;font-weight:bold;color:${balance > 0 ? '#ED2939' : '#16a34a'};">
                ${balance > 0 ? `Rs. ${balance.toLocaleString('en-IN')}` : '✓ FULLY PAID'}
              </td>
            </tr>
          </table>
        </div>

        <!-- WARRANTY -->
        <div class="warranty-section">
          <div class="warranty-title">WARRANTY TERMS & CONDITIONS</div>
          <div class="warranty-text">
            ${shop.warranty_text || 'Mobile handset & Chargers are warranted for the period defined by the respective manufacturers. We are not giving warranty and does not hold out any warranty of product sold. Physical and liquid damages will not be covered under warranty terms.'}
          </div>
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
