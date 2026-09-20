import { useNavigate } from 'react-router-dom';
import BarcodeScannerModal from '../../components/common/BarcodeScannerModal';
import { lookupLabel } from '../../utils/lookupLabel';

/* A scanned label should open the record itself, not a read-only summary of it,
   so staff land somewhere they can actually act (sell, complete, edit, print). */
const DETAIL_PATH = {
  product: (id) => `/products/${id}`,
  second_hand: (id) => `/inventory/second-hand/${id}`,
  service_order: (id) => `/service/${id}`,
  sale: (id) => `/sales/${id}`,
};

const ScannerPage = () => {
  const navigate = useNavigate();

  const handleScan = async (labelNumber) => {
    const num = Number(labelNumber);
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
      // Returning nothing keeps the modal from updating as it unmounts
      return undefined;
    }

    // Unrecognised type, or the label has no linked record: fall back to the
    // label summary rather than dead-ending the scan.
    navigate(`/scan/${num}`);
    return undefined;
  };

  return (
    <BarcodeScannerModal
      title="Scan label"
      hint="Scan a product, mobile or service label to open it"
      onScan={handleScan}
      onClose={() => navigate(-1)}
    />
  );
};

export default ScannerPage;
