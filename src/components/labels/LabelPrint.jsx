import { useCallback } from 'react';
import JsBarcode from 'jsbarcode';

const LabelPrint = ({ labelData }) => {
  const cleanBarcodeValue = (val) => {
    if (!val) return null;
    const cleaned = String(val)
      .split("")
      .filter((ch) => ch.charCodeAt(0) <= 0x7F)
      .join("")
      .trim();
    return cleaned.length > 0 ? cleaned : null;
  };

  const rawBarcodeValue = labelData?.labelNumber 
    ? String(labelData.labelNumber)
    : labelData?.data?.imei1 
      ? String(labelData.data.imei1)
      : labelData?.data?.orderNumber
        ? String(labelData.data.orderNumber)
        : null;

  const barcodeValue = cleanBarcodeValue(rawBarcodeValue);

  const barcodeRef = useCallback((node) => {
    if (node && barcodeValue) {
      try {
        JsBarcode(node, barcodeValue, {
          format: "CODE128",
          width: 1,
          height: 20,
          displayValue: false,
          margin: 0,
        });
      } catch (e) {
        console.error("Barcode error:", e);
      }
    }
  }, [barcodeValue]);

  if (!labelData) return null;

  const renderContent = () => {
    const d = labelData.data || {};

    switch (labelData.labelType) {
      case 'second_hand':
        return (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
            <div style={{ fontSize: '7px', fontWeight: 'bold', textAlign: 'center', letterSpacing: '0.5px' }}>
              FRENCH MOBILES
            </div>
            <div style={{ fontSize: '8px', fontWeight: 'bold', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.brand} {d.model}
            </div>
            <div style={{ fontSize: '6px', color: '#555', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.ram}/{d.storage || d.rom} · Grade {d.grade}
            </div>
            <div style={{ fontSize: '9px', fontWeight: 'bold', textAlign: 'center', width: '100%' }}>
              ₹{d.salePrice}
            </div>
            {barcodeValue ? (
              <svg ref={barcodeRef} style={{ width: '46mm', height: '8mm', display: 'block' }}></svg>
            ) : (
              <div style={{ fontSize: '6px', color: '#999', textAlign: 'center', width: '100%' }}>No barcode available</div>
            )}
            <div style={{ fontSize: '6px', color: '#666', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              #{labelData.labelNumber}
            </div>
          </div>
        );
      case 'service_order': {
        const issues = Array.isArray(d.complaintTypes) ? d.complaintTypes[0] : d.complaintTypes;
        return (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
            <div style={{ fontSize: '7px', fontWeight: 'bold', textAlign: 'center' }}>
              FRENCH MOBILES
            </div>
            <div style={{ fontSize: '8px', fontWeight: 'bold', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.customerName}
            </div>
            <div style={{ fontSize: '6px', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.brand} {d.model}
            </div>
            <div style={{ fontSize: '6px', color: '#555', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {issues}
            </div>
            <div style={{ fontSize: '7px', fontWeight: 'bold', textAlign: 'center', width: '100%' }}>
              Est: ₹{d.estimatedPrice || '0'}
            </div>
            {barcodeValue ? (
              <svg ref={barcodeRef} style={{ width: '46mm', height: '8mm', display: 'block' }}></svg>
            ) : (
              <div style={{ fontSize: '6px', color: '#999', textAlign: 'center', width: '100%' }}>No barcode available</div>
            )}
            <div style={{ fontSize: '5px', color: '#666', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              #{labelData.labelNumber} · {d.orderNumber}
            </div>
          </div>
        );
      }
      case 'product':
        return (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
            <div style={{ fontSize: '7px', fontWeight: 'bold', textAlign: 'center' }}>FRENCH MOBILES</div>
            <div style={{ fontSize: '8px', fontWeight: 'bold', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.productName}
            </div>
            <div style={{ fontSize: '6px', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.brand} · {d.category}
            </div>
            <div style={{ fontSize: '9px', fontWeight: 'bold', textAlign: 'center', width: '100%' }}>
              ₹{d.salePrice}
            </div>
            {barcodeValue ? (
              <svg ref={barcodeRef} style={{ width: '46mm', height: '8mm', display: 'block' }}></svg>
            ) : (
              <div style={{ fontSize: '6px', color: '#999', textAlign: 'center', width: '100%' }}>No barcode available</div>
            )}
            <div style={{ fontSize: '6px', color: '#666', textAlign: 'center', width: '100%' }}>
              #{labelData.labelNumber}
            </div>
          </div>
        );
      case 'sale':
        return (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' }}>FRENCH MOBILES</div>
            <div style={{ width: '100%', borderTop: '1px solid black', margin: '2px 0' }}></div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>Invoice: {d.invoiceNumber}</div>
            <div style={{ fontSize: '12px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{d.customerName}</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '2px' }}>Total: ₹{d.totalAmount}</div>
            <div style={{ width: '100%', borderTop: '1px solid black', margin: '2px 0' }}></div>
            {barcodeValue ? (
              <svg ref={barcodeRef} style={{ height: '35px' }}></svg>
            ) : (
              <p style={{ fontSize: '10px', color: '#999', margin: '10px 0' }}>No barcode available</p>
            )}
            <div style={{ fontSize: '10px', color: 'gray', textAlign: 'center' }}>{labelData.labelNumber}</div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{
      width: '50mm',
      height: '25mm',
      padding: '1.5mm',
      boxSizing: 'border-box',
      fontFamily: 'Arial, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      overflow: 'hidden',
      backgroundColor: 'white'
    }}>
      {renderContent()}
    </div>
  );
};

export default LabelPrint;
