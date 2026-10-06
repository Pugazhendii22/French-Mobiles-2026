import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// The camera re-reads the same barcode every frame, so ignore repeats for this long.
// Typed / wedge-scanner entry is a deliberate action and is never de-duplicated.
const SCAN_COOLDOWN_MS = 2000;

/**
 * Full screen barcode scanner.
 * Camera scanning plus a manual label-number box (also works with USB / keyboard-wedge scanners).
 *
 * onScan(labelNumber) may return { ok, message } - shown as feedback while the camera stays live,
 * so several items can be scanned one after another without reopening.
 */
const BarcodeScannerModal = ({
  open = true,
  title = 'Scan Barcode',
  hint = 'Point the camera at the barcode on the label',
  onScan,
  onClose,
  secondaryAction
}) => {
  const [cameraError, setCameraError] = useState('');
  const [starting, setStarting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [manualValue, setManualValue] = useState('');

  const readerId = `barcode-reader-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scannerRef = useRef(null);
  const lastScanRef = useRef({ value: '', at: 0 });
  const busyRef = useRef(false);
  const onScanRef = useRef(onScan);

  // Always call the freshest handler without restarting the camera
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const handleDetected = async (rawValue, { fromCamera = false } = {}) => {
    const match = String(rawValue || '').match(/\d+/);
    const labelNumber = match ? match[0] : '';

    if (!labelNumber) {
      setResult({ ok: false, message: 'Unreadable barcode. Expected a numeric label.' });
      return;
    }

    if (busyRef.current) return;

    const now = Date.now();
    if (
      fromCamera &&
      lastScanRef.current.value === labelNumber &&
      now - lastScanRef.current.at < SCAN_COOLDOWN_MS
    ) {
      return;
    }
    lastScanRef.current = { value: labelNumber, at: now };

    busyRef.current = true;
    setBusy(true);
    try {
      const outcome = await onScanRef.current?.(labelNumber);
      if (outcome) {
        setResult(outcome);
        if (outcome.ok && navigator.vibrate) navigator.vibrate(60);
      }
    } catch (err) {
      console.error('Barcode scan handler error:', err);
      setResult({ ok: false, message: err?.message || 'Could not read that label. Try again.' });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Keep the camera callback pointed at the latest handler without restarting the stream
  const handleDetectedRef = useRef(handleDetected);
  useEffect(() => {
    handleDetectedRef.current = handleDetected;
  });

  // Start / stop the camera with the modal
  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    // No formatsToSupport restriction - shop labels print CODE_128, but a
    // device's own factory IMEI sticker is often CODE_39 or another linear
    // format, so we accept whatever the camera can decode.
    const scanner = new Html5Qrcode(readerId, { verbose: false });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 150 } },
        (decodedText) => handleDetectedRef.current(decodedText, { fromCamera: true }),
        () => {
          // per-frame decode misses are normal, ignore
        }
      )
      .then(() => {
        if (!cancelled) setStarting(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Camera start error:', err);
        setStarting(false);
        setCameraError(
          'Camera unavailable. Allow camera access, or type the label number below.'
        );
      });

    return () => {
      cancelled = true;
      const active = scannerRef.current;
      scannerRef.current = null;
      if (!active) return;
      Promise.resolve()
        .then(() => active.stop())
        .then(() => active.clear())
        .catch(() => {
          /* already stopped */
        });
    };
  }, [open, readerId]);

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const submitManual = () => {
    const value = manualValue.trim();
    // don't swallow the typed value while a lookup is still running
    if (!value || busyRef.current) return;
    setManualValue('');
    handleDetected(value);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-[#0f172a]/95 overflow-y-auto">
      <div className="min-h-full w-full max-w-md mx-auto flex flex-col">

        {/* HEADER */}
        <div className="bg-[#002395] px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <i className="fas fa-barcode text-white"></i>
            <p className="text-white font-semibold text-sm truncate">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white p-1 rounded"
            aria-label="Close scanner"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-4 space-y-3">

          {/* CAMERA */}
          <div className="bg-black rounded-2xl overflow-hidden shadow-xl">
            <div id={readerId} className="w-full"></div>
            {starting && !cameraError && (
              <p className="text-white/70 text-xs text-center py-6">Starting camera...</p>
            )}
          </div>

          <p className="text-white/60 text-xs text-center">{hint}</p>

          {busy && (
            <p className="text-white text-xs text-center">
              <i className="fas fa-circle-notch fa-spin mr-2"></i>Looking up label...
            </p>
          )}

          {/* LAST SCAN FEEDBACK */}
          {result && (
            <div
              className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                result.ok
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-[#ED2939]'
              }`}
            >
              <i className={`fas ${result.ok ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-2`}></i>
              {result.message}
            </div>
          )}

          {cameraError && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-700">
              <i className="fas fa-camera mr-2"></i>{cameraError}
            </div>
          )}

          {/* MANUAL / WEDGE SCANNER ENTRY */}
          <div className="bg-white rounded-2xl p-4 space-y-2">
            <label className="block text-xs font-bold text-[#002395] uppercase tracking-wide">
              Or enter label number
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // never let Enter submit a surrounding form
                    e.preventDefault();
                    submitManual();
                  }
                }}
                placeholder="e.g. 26001"
                className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
              />
              <button
                type="button"
                onClick={submitManual}
                disabled={!manualValue.trim() || busy}
                className="bg-[#002395] text-white px-4 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <p className="text-gray-400 text-xs">
              A USB / bluetooth barcode scanner also types straight into this box.
            </p>
          </div>

          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="w-full bg-white text-[#002395] rounded-xl py-2.5 text-sm font-bold"
            >
              {secondaryAction.label}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full bg-white/10 border border-white/20 text-white rounded-xl py-2.5 text-sm font-semibold"
          >
            Done
          </button>

        </div>
      </div>
    </div>
  );
};

export default BarcodeScannerModal;
