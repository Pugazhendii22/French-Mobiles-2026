import { useEffect, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';

const ScannerPage = () => {
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { 
        fps: 10, 
        qrbox: {width: 250, height: 150},
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128]
      },
      false
    );

    scanner.render(
      (decodedText) => {
        const numberMatch = decodedText.match(/\d+/);
        if (numberMatch && numberMatch[0]) {
          scanner.clear();
          navigate(`/scan/${numberMatch[0]}`);
        } else {
          setError('Invalid barcode format. Expected a numeric label.');
        }
      },
      () => {
        // Ignore background failures
      }
    );

    return () => {
      scanner.clear().catch(console.error);
    };
  }, [navigate]);

  return (
  <Layout title="Scan Label">
    <div className="bg-[#0f172a] min-h-screen">
      <div className="px-4 py-4 space-y-4">

        {/* SCANNER AREA */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-xl">
          <div className="bg-[#002395] px-4 py-3 flex items-center gap-2">
            <i className="fas fa-qrcode text-white"></i>
            <p className="text-white font-semibold text-sm">Point camera at barcode</p>
          </div>
          <div id="reader" className="w-full"></div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl shadow-sm p-4">
            <p className="text-red-600 text-sm font-semibold">
              <i className="fas fa-exclamation-circle mr-2"></i>{error}
            </p>
          </div>
        )}

      </div>
    </div>
  </Layout>
);
};

export default ScannerPage;
