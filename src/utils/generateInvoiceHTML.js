import { numberToWords } from './numberToWords'

export const generateInvoiceHTML = (sale, shopDetails, staffName) => {
  const shop = shopDetails || {}
  const items = sale.items || []
  const grandTotal = Number(sale.totalAmount || 0)
  const balanceDue = Number(sale.balanceDue || 0)
  const amountPaid = Number(sale.amountPaid || 0)

  // Financed sales are settled by the finance company, so the invoice shows the
  // loan reference and the down-payment / financed split instead of a balance.
  const isFinanced = Boolean(sale.isFinanced || sale.financeProvider)
  const downPayment = Number(sale.downPayment || 0)
  const financedAmount = Number(sale.financedAmount || 0)
  const amountInWords = numberToWords(grandTotal)

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
      <title>Invoice - ${sale.invoiceNumber}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          color: #000;
          background: #fff;
          position: relative;
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
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 3px solid #002395;
        }
        .header-left {
          flex: 1;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .logo-box {
          width: 100px;
          height: 100px;
          border: 1px dashed #ccc;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 9px;
          color: #ccc;
          border-radius: 4px;
        }
        .logo-img {
          width: 100px;
          height: 100px;
          object-fit: contain;
          border-radius: 4px;
        }
        .shop-info-left {
          flex: 1;
        }
        .shop-name {
          font-size: 22px;
          font-weight: 900;
          color: #002395;
          text-transform: uppercase;
          line-height: 1.1;
        }
        .shop-address {
          font-size: 9px;
          color: #555;
          margin-top: 3px;
          line-height: 1.5;
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
        }
        .gstin-text {
          font-size: 9px;
          color: #555;
          margin-top: 4px;
        }

        /* INVOICE META */
        .invoice-meta {
          display: flex;
          justify-content: space-between;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 6px 10px;
          margin-bottom: 8px;
          font-size: 10px;
        }
        .meta-left { }
        .meta-right { text-align: right; }
        .meta-label { font-weight: bold; }

        /* BILLED TO */
        .billed-section {
          display: flex;
          gap: 0;
          border: 1px solid #ddd;
          margin-bottom: 8px;
        }
        .billed-col {
          flex: 1;
          padding: 8px 10px;
        }
        .billed-col:first-child {
          border-right: 1px solid #ddd;
        }
        .billed-label {
          font-size: 9px;
          font-weight: bold;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 4px;
          border-bottom: 1px solid #eee;
          padding-bottom: 3px;
        }
        .billed-name {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 2px;
        }
        .billed-info {
          font-size: 10px;
          color: #444;
          line-height: 1.6;
        }

        /* ITEMS TABLE */
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 0;
        }
        .items-table th {
          background: #002395;
          color: white;
          border: 1px solid #002395;
          padding: 6px 8px;
          font-size: 10px;
          font-weight: bold;
          text-align: center;
        }
        .items-table td {
          border: 1px solid #ddd;
          padding: 6px 8px;
          font-size: 10px;
          vertical-align: top;
        }
        .items-table tr:nth-child(even) td {
          background: #f8fafc;
        }
        .col-sn { text-align: center; width: 35px; }
        .col-qty { text-align: center; width: 40px; }
        .col-rate { text-align: right; width: 70px; }
        .col-amount { text-align: right; width: 90px; }
        .item-name { font-weight: bold; }
        .item-imei { font-size: 9px; color: #666; margin-top: 2px; }

        /* TOTALS */
        .totals-section {
          display: flex;
          justify-content: flex-end;
          border: 1px solid #ddd;
          border-top: none;
          margin-bottom: 8px;
        }
        .totals-table {
          width: 280px;
          border-collapse: collapse;
        }
        .totals-table td {
          padding: 4px 8px;
          font-size: 10px;
          border-bottom: 1px solid #eee;
        }
        .totals-table .total-label { font-weight: bold; }
        .totals-table .total-value { text-align: right; }
        .grand-total-row td {
          background: #002395;
          color: white;
          font-size: 13px;
          font-weight: bold;
          padding: 6px 8px;
          border-bottom: none;
        }

        /* PAYMENT INFO */
        .finance-band {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          border: 2px solid #002395;
          border-radius: 4px;
          padding: 8px 14px;
          margin-top: 10px;
          background: #f5f8ff;
        }
        .finance-label {
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #555;
          font-weight: bold;
        }
        .finance-name {
          font-size: 17px;
          font-weight: 900;
          color: #002395;
          text-transform: uppercase;
          line-height: 1.1;
        }
        .finance-band-right { text-align: right; }
        .finance-loan { font-size: 11px; color: #000; }
        .finance-split { font-size: 10px; color: #444; margin-top: 2px; }

        .payment-info {
          border: 1px solid #ddd;
          padding: 8px 10px;
          margin-bottom: 8px;
          font-size: 10px;
          background: #f8fafc;
        }
        .amount-words {
          font-weight: bold;
          margin-bottom: 3px;
        }

        /* WARRANTY */
        .warranty-section {
          border: 1px solid #ddd;
          padding: 8px 10px;
          margin-bottom: 8px;
        }
        .warranty-title {
          font-size: 11px;
          font-weight: bold;
          color: #002395;
          border-bottom: 1px solid #eee;
          padding-bottom: 4px;
          margin-bottom: 6px;
        }
        .warranty-item {
          font-size: 9px;
          line-height: 1.7;
          color: #444;
          margin-bottom: 2px;
        }
        .warranty-item::before {
          content: "• ";
        }

        /* FOOTER */
        .footer-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          border-top: 2px solid #002395;
          padding-top: 8px;
          margin-top: 4px;
        }
        .sig-line {
          border-bottom: 1px solid #000;
          width: 150px;
          margin-top: 25px;
          margin-bottom: 4px;
        }
        .copy-text {
          font-size: 9px;
          color: #999;
          font-style: italic;
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
            <div class="shop-info-left">
              <div class="shop-name">${shop.name || 'THE FRENCH MOBILES'}</div>
              <div class="shop-address">
                ${shop.address || '225, Thiruvalluvar Salai, Puducherry - 605013'}<br>
                Ph: ${shop.phone || '+91 99447 01436'} &nbsp;|&nbsp;
                Hours: ${shop.hours || '10:00 AM - 9:00 PM'}
              </div>
              ${shop.gstin ? `<div style="font-size:9px;margin-top:3px;color:#444;">GSTIN: <strong>${shop.gstin}</strong></div>` : '<div style="font-size:9px;margin-top:3px;color:#aaa;">GSTIN: Applied For</div>'}
            </div>
          </div>
          <div class="header-right">
            <div class="doc-title">TAX INVOICE</div>
          </div>
        </div>

        <!-- INVOICE META -->
        <div class="invoice-meta">
          <div class="meta-left">
            <span class="meta-label">Invoice No:</span> ${sale.invoiceNumber}<br>
            <span class="meta-label">Invoice Time:</span> ${sale.createdAt?.toDate ? new Date(sale.createdAt.seconds * 1000).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}) : new Date().toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}
          </div>
          <div class="meta-right">
            <span class="meta-label">Invoice Date:</span> ${sale.createdAt?.toDate ? new Date(sale.createdAt.seconds * 1000).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}<br>
            <span class="meta-label">Salesperson:</span> ${staffName || 'Staff'}
          </div>
        </div>

        <!-- BILLED TO -->
        <div class="billed-section">
          <div class="billed-col">
            <div class="billed-label">Billed To</div>
            <div class="billed-name">${sale.customerName || ''}</div>
            <div class="billed-info">
              ${sale.customerAddress ? sale.customerAddress + '<br>' : ''}
              Ph: ${sale.customerPhone || ''}
            </div>
          </div>
          <div class="billed-col">
            <div class="billed-label">Payment Details</div>
            <div class="billed-info">
              <strong>Method:</strong> ${sale.paymentMethod || 'Cash'}<br>
              ${isFinanced ? `
                <strong>Loan / App No:</strong> ${sale.financeLoanNumber || '-'}<br>
                <strong>Down Payment:</strong> Rs. ${downPayment.toLocaleString('en-IN')}<br>
                <strong>Financed:</strong> Rs. ${financedAmount.toLocaleString('en-IN')}<br>
                <strong style="color:green;">Status:</strong> <span style="color:green;">&#10003; PAID VIA FINANCE</span>
              ` : `
                <strong>Amount Paid:</strong> Rs. ${amountPaid.toLocaleString('en-IN')}<br>
                ${balanceDue > 0
                  ? `<strong style="color:red;">Balance Due:</strong> <span style="color:red;">Rs. ${balanceDue.toLocaleString('en-IN')}</span>`
                  : `<strong style="color:green;">Status:</strong> <span style="color:green;">&#10003; FULLY PAID</span>`
                }
              `}
            </div>
          </div>
        </div>

        <!-- ITEMS TABLE -->
        <table class="items-table">
          <thead>
            <tr>
              <th class="col-sn">S.No</th>
              <th>Particulars</th>
              <th class="col-qty">Qty</th>
              <th class="col-rate">Rate</th>
              <th class="col-amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, i) => {
              const itemTotal = Number(item.total || (item.unitPrice * item.quantity) || 0)
              const itemRate = Number(item.unitPrice || 0)
              return `
                <tr>
                  <td class="col-sn">${i + 1}</td>
                  <td>
                    <div class="item-name">${item.name || ''}</div>
                    ${item.imei ? `<div class="item-imei">IMEI No: ${item.imei}</div>` : ''}
                  </td>
                  <td class="col-qty">${item.quantity || 1}</td>
                  <td class="col-rate">Rs. ${itemRate.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                  <td class="col-amount">Rs. ${itemTotal.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                </tr>
              `
            }).join('')}
            ${items.length < 3 ? Array(3 - items.length).fill(`
              <tr>
                <td class="col-sn"></td>
                <td></td>
                <td class="col-qty"></td>
                <td class="col-rate"></td>
                <td class="col-amount"></td>
              </tr>
            `).join('') : ''}
            <tr>
              <td colspan="4" style="text-align:right;font-weight:bold;border-left:none;border-bottom:none;">Total</td>
              <td class="col-amount" style="font-weight:bold;">Rs. ${grandTotal.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            </tr>
          </tbody>
        </table>

        <!-- GRAND TOTAL -->
        <div class="totals-section">
          <table class="totals-table">
            ${sale.discount > 0 ? `
            <tr>
              <td class="total-label">Subtotal</td>
              <td class="total-value">Rs. ${(grandTotal + Number(sale.discount || 0)).toLocaleString('en-IN')}</td>
            </tr>
            <tr style="color: green;">
              <td class="total-label">Discount</td>
              <td class="total-value">- Rs. ${Number(sale.discount || 0).toLocaleString('en-IN')}</td>
            </tr>
            ` : ''}
            <tr class="grand-total-row">
              <td class="total-label">Net Total</td>
              <td class="total-value" style="text-align:right;">Rs. ${grandTotal.toLocaleString('en-IN')}</td>
            </tr>
          </table>
        </div>

        <!-- FINANCE BAND -->
        ${isFinanced ? `
        <div class="finance-band">
          <div class="finance-band-left">
            <div class="finance-label">Financed By</div>
            <div class="finance-name">${sale.financeProvider || sale.paymentMethod || ''}</div>
          </div>
          <div class="finance-band-right">
            <div class="finance-loan">Loan / App No: <strong>${sale.financeLoanNumber || '-'}</strong></div>
            <div class="finance-split">
              Down Payment Rs. ${downPayment.toLocaleString('en-IN')}
              &nbsp;&middot;&nbsp;
              Financed Rs. ${financedAmount.toLocaleString('en-IN')}
            </div>
          </div>
        </div>` : ''}

        <!-- PAYMENT INFO -->
        <div class="payment-info">
          <div class="amount-words">Amount in Words: ${amountInWords}</div>
          <div>Payment Info: ${sale.paymentMethod || 'Cash'} Rs. ${grandTotal.toLocaleString('en-IN')}</div>
          ${sale.discount > 0 ? `<div>Discount Applied: Rs. ${Number(sale.discount || 0).toLocaleString('en-IN')}</div>` : ''}
        </div>

        <!-- WARRANTY / TERMS -->
        <div class="warranty-section">
          <div class="warranty-title">WARRANTY TERMS & CONDITIONS</div>
          ${(shop.invoice_terms || [
            'Goods once sold will not be taken back.',
            'Warranty as per manufacturer terms only.',
            'Physical and liquid damage not covered under warranty.',
            'Please check all goods before leaving the shop.',
            'The shop will not be responsible for any data loss.'
          ]).map(term => `<div class="warranty-item">${term}</div>`).join('')}
        </div>

        <!-- FOOTER -->
        <div class="footer-section">
          <div>
            <div style="font-size:10px;font-weight:bold;">Customer's Signature:</div>
            <div class="sig-line"></div>
            <div style="font-size:9px;color:#555;">Goods received in good condition</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;font-weight:bold;">${shop.name || 'THE FRENCH MOBILES'}</div>
            <div style="width:70px;height:70px;border:1px solid #ccc;border-radius:50%;margin:4px 0 0 auto;display:flex;align-items:center;justify-content:center;font-size:8px;color:#ccc;">SEAL</div>
            <div style="font-size:9px;color:#555;margin-top:4px;">Authorised Signature</div>
          </div>
        </div>

        <!-- COPY TEXT -->
        <div style="text-align:right;margin-top:8px;">
          <span class="copy-text">Original Copy</span>
        </div>

      </div>
    </body>
    </html>
  `
}
