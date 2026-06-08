import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const ImeiInput = ({ value, onChange, label, placeholder = '', required = false, scannerId }) => {
  const [scannerOpen, setScannerOpen] = useState(false);
  const html5QrcodeRef = useRef(null);
  const isRunningRef = useRef(false);

  const stopScanner = useCallback(() => {
    if (html5QrcodeRef.current && isRunningRef.current) {
      isRunningRef.current = false;
      html5QrcodeRef.current.stop()
        .then(() => {
          try {
            html5QrcodeRef.current.clear();
          } catch (e) {
            console.error('Scanner clear failed:', e);
          }
          html5QrcodeRef.current = null;
          setScannerOpen(false);
        })
        .catch(() => {
          html5QrcodeRef.current = null;
          setScannerOpen(false);
        });
    } else {
      if (html5QrcodeRef.current) {
        try {
          html5QrcodeRef.current.clear();
        } catch (e) {
          console.error('Scanner clear failed:', e);
        }
        html5QrcodeRef.current = null;
      }
      isRunningRef.current = false;
      setScannerOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!scannerOpen) return undefined;

    const timer = setTimeout(() => {
      if (!scannerId) return;

      try {
        html5QrcodeRef.current = new Html5Qrcode(scannerId);
        html5QrcodeRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 100 } },
          (decodedText) => {
            stopScanner();
            onChange(decodedText);
          },
          () => {}
        ).then(() => {
          isRunningRef.current = true;
        }).catch((err) => {
          console.error('Scanner start failed:', err);
          isRunningRef.current = false;
        });
      } catch (err) {
        console.error('Scanner init failed:', err);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [scannerOpen, scannerId, onChange, stopScanner]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && scannerOpen) {
        stopScanner();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [scannerOpen]);

  useEffect(() => {
    return () => stopScanner();
  }, []);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="flex-1 border border-gray-300 rounded-md p-2 break-words"
        />
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="bg-slate-100 border p-2 rounded text-slate-700 hover:bg-slate-200 break-words"
        >
          <i className="fas fa-barcode" aria-hidden="true" />
          <span className="sr-only">Scan {label}</span>
        </button>
      </div>

      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={stopScanner}>
          <div className="bg-white rounded-xl p-4 max-w-sm w-full mx-4 break-words" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Scan IMEI Barcode</h3>
              <button type="button" onClick={stopScanner} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div id={scannerId} className="w-full min-h-48 rounded-xl bg-slate-100 break-words" />
            <p className="mt-3 text-sm text-gray-600">Point camera at IMEI barcode</p>
            <div className="mt-4 text-right">
              <button type="button" onClick={stopScanner} className="px-4 py-2 bg-slate-100 rounded-md text-slate-800 hover:bg-slate-200 break-words">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImeiInput;
