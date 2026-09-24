import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BarcodeScannerModal from '../../components/common/BarcodeScannerModal';
import { lookupLabel } from '../../utils/lookupLabel';
import { lookupTac } from '../../utils/tacLookup';

/* A scanned label should open the record itself, not a read-only summary of it,
   so staff land somewhere they can actually act (sell, complete, edit, print). */
const DETAIL_PATH = {
  product: (id) => `/products/${id}`,
  second_hand: (id) => `/inventory/second-hand/${id}`,
  service_order: (id) => `/service/${id}`,
  sale: (id) => `/sales/${id}`,
};

const FORM_ROUTE = {
  service_order: '/service',
  second_hand: '/inventory/second-hand',
};

/* A factory IMEI is 14-15 digits - long enough to never collide with the
   shop's own short sequential label numbers, so length alone tells them apart. */
const looksLikeImei = (digits) => digits.length >= 14 && digits.length <= 16;

const ScannerPage = () => {
  const navigate = useNavigate();
  // null = choosing what to do; 'label' = scanning a shop label;
  // 'service_order' / 'second_hand' = new-device intake flow
  const [mode, setMode] = useState(null);
  const [intake, setIntake] = useState(null); // { imei1, brand, model, tac, tacMatched }

  const handleLabelScan = async (labelNumber) => {
    const digits = String(labelNumber || '').replace(/\D/g, '');

    if (looksLikeImei(digits)) {
      return { ok: false, message: 'That looks like a device IMEI, not a shop label. Use "New Service Order" or "New Second-Hand Purchase" instead.' };
    }

    const num = Number(digits);
    if (!num || Number.isNaN(num)) return { ok: false, message: 'Invalid barcode.' };

    let label;
    try {
      label = await lookupLabel(num);
    } catch {
      return { ok: false, message: 'Could not reach the label registry. Check your connection.' };
    }

    if (!label) {
      return { ok: false, message: `Label #${num} is not assigned to anything yet.` };
    }

    const toDetail = DETAIL_PATH[label.labelType];
    if (toDetail && label.referenceId) {
      navigate(toDetail(label.referenceId));
      return undefined;
    }

    navigate(`/scan/${num}`);
    return undefined;
  };

  // One continuous camera session for the whole device-intake scan: the first
  // barcode detected becomes IMEI 1 (triggers the TAC lookup), the second
  // becomes IMEI 2 - the modal stays open and on-screen text updates between
  // the two rather than closing and reopening the camera.
  const handleIntakeScan = async (raw) => {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!looksLikeImei(digits)) {
      return { ok: false, message: 'That does not look like an IMEI (expected 14-15 digits).' };
    }

    if (!intake) {
      const match = await lookupTac(digits);
      setIntake({
        imei1: digits,
        imei2: '',
        brand: match?.brand || '',
        model: match?.model || '',
        tacMatched: !!match,
      });
      return {
        ok: true,
        message: match
          ? `IMEI 1 recognised as ${match.brand} ${match.model}. Now scan IMEI 2, or tap Skip.`
          : 'IMEI 1 captured - not seen before. Now scan IMEI 2, or tap Skip.',
      };
    }

    if (digits === intake.imei1) {
      return { ok: false, message: 'That is the same IMEI you just scanned. Scan IMEI 2, or tap Skip.' };
    }

    goToForm({ ...intake, imei2: digits });
    return undefined;
  };

  const goToForm = (prefillData) => {
    navigate(FORM_ROUTE[mode], { state: prefillData });
  };

  const reset = () => {
    setMode(null);
    setIntake(null);
  };

  if (!mode) {
    return (
      <div className="fixed inset-0 z-[60] bg-[#0f172a]/95 overflow-y-auto">
        <div className="min-h-full w-full max-w-md mx-auto flex flex-col">
          <div className="bg-[#002395] px-4 py-3 flex items-center justify-between sticky top-0 z-10">
            <p className="text-white font-semibold text-sm">Scan</p>
            <button type="button" onClick={() => navigate(-1)} className="text-white p-1 rounded" aria-label="Close scanner">
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-white/60 text-xs text-center mb-1">What do you want to do?</p>

            <button
              type="button"
              onClick={() => setMode('label')}
              className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 text-left"
            >
              <span className="w-11 h-11 rounded-xl bg-[#002395]/10 text-[#002395] flex items-center justify-center shrink-0">
                <i className="fas fa-barcode text-lg"></i>
              </span>
              <span>
                <span className="block text-sm font-bold text-[#0f172a]">Scan Shop Label</span>
                <span className="block text-xs text-gray-400">Open an existing product, mobile, service order or sale</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode('service_order')}
              className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 text-left"
            >
              <span className="w-11 h-11 rounded-xl bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                <i className="fas fa-tools text-lg"></i>
              </span>
              <span>
                <span className="block text-sm font-bold text-[#0f172a]">New Service Order</span>
                <span className="block text-xs text-gray-400">Scan the device's IMEI to start the intake</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode('second_hand')}
              className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 text-left"
            >
              <span className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <i className="fas fa-mobile-alt text-lg"></i>
              </span>
              <span>
                <span className="block text-sm font-bold text-[#0f172a]">New Second-Hand Purchase</span>
                <span className="block text-xs text-gray-400">Scan the device's IMEI to start the purchase</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'label') {
    return (
      <BarcodeScannerModal
        title="Scan label"
        hint="Scan a product, mobile or service label to open it"
        onScan={handleLabelScan}
        onClose={() => navigate(-1)}
      />
    );
  }

  // Device intake: a single continuous scan - IMEI 1 then IMEI 2, one camera
  // session throughout (see handleIntakeScan).
  return (
    <BarcodeScannerModal
      title={!intake
        ? (mode === 'service_order' ? 'Scan IMEI - Service Order' : 'Scan IMEI - Second-Hand Purchase')
        : 'Scan IMEI 2 (optional)'}
      hint={!intake
        ? 'Scan the IMEI 1 barcode on the box or under Settings > About Phone'
        : (intake.tacMatched
            ? `Recognised as ${intake.brand} ${intake.model}. Scan IMEI 2, or skip if this phone has only one.`
            : 'Not seen before - brand/model will need to be entered by hand. Scan IMEI 2, or skip.')}
      onScan={handleIntakeScan}
      onClose={reset}
      secondaryAction={intake ? { label: 'Skip IMEI 2', onClick: () => goToForm(intake) } : undefined}
    />
  );
};

export default ScannerPage;
