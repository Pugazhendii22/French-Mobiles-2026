import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Section, FieldError } from '@/shared/ui/ui';
import { inputClass, labelClass, errorInput } from '@/shared/ui/uiTokens';
import { collection, getDocs, query, where, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/shared/firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import CustomerAutocomplete from '../../components/common/CustomerAutocomplete';
import ImeiInput from '@/shared/components/ImeiInput';
import ComboBox from '@/shared/ui/ComboBox';
import { useSheetDismiss } from '@/shared/ui/useSheetDismiss';
import { readDraft, writeDraft, clearDraft } from '@/shared/lib/formDraft';
import { toDateTimeLocal, nowDateTimeLocal } from '@/shared/lib/datetime';
import { requireOrderDates } from '@/features/service/orderState';
import { getLabelNumber } from '@/features/labels/data';
import { uploadImageToCloudinary } from '@/shared/lib/uploadImage';
import { generateLabelHTML } from '@/features/labels/printing/printLabel';
import { generateServiceJobCard } from '../../utils/generateServiceJobCard';
import PrinterSelector from '@/features/labels/printing/PrinterSelector';
import { imageThumb } from '@/shared/lib/imageUrl';
import { loadCustomers } from '../../utils/customerCache';
import { recordTacIfNew } from '@/features/labels/tacLookup';

const PatternLock = lazy(() => import('@/shared/components/PatternLock').catch(() => ({ default: () => <div className="text-red-500">Failed to load PatternLock</div> })));

const generateSerialNumber = () => {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  const random = Math.floor(1000 + Math.random() * 9000)
  return `FM-${dateStr}-${random}`
}

const ServiceOrderForm = ({ initialData, prefillData, onSave, onCancel }) => {
  const { currentUser, userName, userRole } = useAuth();
  const { complaintTypes: complaintTypeOptions = [], accessories: accessoryOptions = [], brands: brandOptions = [], models: modelOptions = {}, shopDetails, fieldOptions = {}, rememberOptions } = useSettings();
  const [staffOptions, setStaffOptions] = useState([]);

  const LOCK_TYPES = ['None', 'PIN', 'Password', 'Pattern', 'Fingerprint', 'Face Unlock', 'Other'];
  const ACCESSORIES_OPTIONS = accessoryOptions;
  const MODELS = modelOptions;

  /* The grab handle promises this sheet can be pulled down; make it true. */
  /* Pulling the sheet down might be a slip, so it keeps the draft. The X is a
     decision, so it throws the draft away - see discardAndClose below. */
  const { sheetProps, handleProps, scrollRef } = useSheetDismiss({ onDismiss: onCancel });

  /* One key per order being edited, so a half-typed new intake and an edit of
     an existing order cannot overwrite one another. */
  const draftKey = `service-order:${initialData?.id || 'new'}`;

  const discardAndClose = () => {
    clearDraft(draftKey);
    onCancel();
  };
  const COMPLAINTS = complaintTypeOptions;
  const STATUSES = ['Received', 'In Progress', 'Parts Awaiting', 'Completed', 'Awaiting Customer Approval', 'Returned'];

  /* A scan-to-create flow (see ScannerPage) may hand us a recognised brand/model
     from the TAC database - only relevant for a brand-new record. The TAC data
     covers brands the shop's own dropdown does not list, so a scanned brand that
     is missing from it is offered as an extra option rather than being forced
     through the "Other" free-text fallback. */
  const scannedBrand = (!initialData && prefillData?.brand) || '';
  const prefillBrandMatch = scannedBrand
    ? brandOptions.find(b => b.toLowerCase() === scannedBrand.toLowerCase())
    : null;
  const BRANDS = scannedBrand && !prefillBrandMatch
    ? [...brandOptions, scannedBrand]
    : brandOptions;
  const prefillBrand = prefillBrandMatch || scannedBrand;
  const prefillModelMatch = !initialData && prefillData?.model && prefillBrand
    ? (MODELS[prefillBrand] || []).find(m => m.toLowerCase() === prefillData.model.toLowerCase())
    : null;


  const buildFreshForm = () => {
    const nowLocal = nowDateTimeLocal();
    const base = initialData ? {
      ...initialData,
      alternatePhone: initialData.alternatePhone || '',
      technicianName: initialData.technicianName || userName || currentUser?.displayName || currentUser?.email || '',
      technicianUid: initialData.technicianUid || currentUser?.uid || '',
      receivedAt: toDateTimeLocal(initialData.receivedAt) || nowLocal,
      expectedCompletionAt: toDateTimeLocal(initialData.expectedCompletionAt) || ''
    } : {
      customerId: '',
      customerName: '',
      customerPhone: '',
      alternatePhone: '',
      brand: prefillBrand,
      customBrand: '',
      model: prefillModelMatch || prefillData?.model || '',
      colour: '',
      problemDetails: '',
      imei1: prefillData?.imei1 || initialData?.imei1 || initialData?.imei || '',
      imei2: prefillData?.imei2 || initialData?.imei2 || '',
      imeiUnavailable: false,
      lockType: 'None',
      lockHint: initialData?.lockHint || initialData?.lockCode || '',
      lockPattern: initialData?.lockPattern || [],
      accessories: [],
      estimatedPrice: '',
      advancePaid: '0',
      status: 'Received',
      rawMaterialCost: '',
      outsideLabourCost: '',
      suggestions: '',
      imageUrl: '',
      technicianName: userName || currentUser?.displayName || currentUser?.email || '',
      technicianUid: currentUser?.uid || '',
      receivedAt: nowLocal,
      expectedCompletionAt: ''
    };
    return {
      ...base,
      complaintTypes: base.complaintTypes || (base.complaintNature ? [base.complaintNature] : []),
      otherComplaint: base.otherComplaint || (base.customComplaint || '')
    };
  };

  /* An untouched intake form is not empty: it already carries the time the
     device arrived, a status of Received, a technician and a lock type of None.
     Those count as content as far as storage is concerned, so without this an
     untouched form stored a draft - and the next person to open it was offered
     their "unsaved work" back. A draft is only a draft once it differs. */
  const [pristine] = useState(() => JSON.stringify(buildFreshForm()));

  const [formData, setFormData] = useState(() => {
    /* Whatever was typed before the form was closed wins, except over a device
       the scanner just handed us - that is a fresh intake, not the old draft. */
    const draft = prefillData ? null : readDraft(draftKey);
    const fresh = buildFreshForm();
    return draft ? { ...fresh, ...draft } : fresh;
  });

  const [restoredDraft, setRestoredDraft] = useState(() => {
    if (prefillData) return false;
    const draft = readDraft(draftKey);
    if (!draft) return false;
    return JSON.stringify({ ...buildFreshForm(), ...draft }) !== pristine;
  });

  /* What the form looked like when it was last written, or null if it never
     was. Two things read it.

     The draft keeps itself out of the way: without the comparison, the state
     change a save causes would write the draft straight back after it had been
     cleared, and a saved order would still greet the next person with "picked
     up where you left off".

     The footer reads it to tell saved from edited-since-saved. It is state and
     not a ref for exactly that reason - a ref read during render is both a lint
     error and a value React is not obliged to have refreshed. */
  const [savedSnapshot, setSavedSnapshot] = useState(null);

  /* Keep what has been typed, as it is typed. Declared below formData: the
     dependency array is read during render, so referencing it any earlier
     throws before the form can draw. */
  useEffect(() => {
    const now = JSON.stringify(formData);
    if (now === savedSnapshot) return;
    if (now === pristine) { clearDraft(draftKey); return; }
    writeDraft(draftKey, formData);
  }, [draftKey, formData, pristine, savedSnapshot]);

  const startFresh = () => {
    clearDraft(draftKey);
    setRestoredDraft(false);
    setFormData(buildFreshForm());
    setFieldErrors({});
    setError('');
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const [complaintSearch, setComplaintSearch] = useState('');


  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const brandRef = useRef(null)
  const modelRef = useRef(null)
  const imei1Ref = useRef(null)
  const complaintTypesRef = useRef(null)
  const estimatedPriceRef = useRef(null)
  const receivedAtRef = useRef(null)
  const expectedCompletionAtRef = useRef(null)

  const validateAndScroll = () => {
    const errors = {}
    let firstErrorRef = null

    if (!formData.brand) {
      errors.brand = 'Brand is required'
      if (!firstErrorRef) firstErrorRef = brandRef
    }
    if (!formData.model) {
      errors.model = 'Model is required'
      if (!firstErrorRef) firstErrorRef = modelRef
    }
    /* A dead phone or a smashed display cannot show its IMEI, and the shop still
       has to take the device in - so the requirement lifts once staff record why
       it could not be read. */
    if (!formData.imei1 && !formData.imeiUnavailable) {
      errors.imei1 = 'IMEI 1 is required'
      if (!firstErrorRef) firstErrorRef = imei1Ref
    }
    if (!formData.complaintTypes || formData.complaintTypes.length === 0) {
      errors.complaintTypes = 'Select at least one complaint type'
      if (!firstErrorRef) firstErrorRef = complaintTypesRef
    }
    if (!formData.estimatedPrice) {
      errors.estimatedPrice = 'Estimated price is required'
      if (!firstErrorRef) firstErrorRef = estimatedPriceRef
    }
    if (!formData.receivedAt) {
      errors.receivedAt = 'Received date is required'
      if (!firstErrorRef) firstErrorRef = receivedAtRef
    }
    if (!formData.expectedCompletionAt) {
      errors.expectedCompletionAt = 'Expected completion is required'
      if (!firstErrorRef) firstErrorRef = expectedCompletionAtRef
    }

    setFieldErrors(errors)

    if (firstErrorRef?.current) {
      firstErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      firstErrorRef.current.focus()
    }

    return Object.keys(errors).length === 0
  }
  const [uploading, setUploading] = useState(false);

  /* The options for the technician dropdown, and nothing else.

     This used to write a default technician into formData too, which cost two
     bugs. The name came from the users document rather than from AuthContext,
     so for an admin whose two names differ an untouched form stopped matching
     its pristine snapshot and stored a draft nobody had typed - the "unsaved
     work" prompt, back again. And the fallback was `|| list[0]`, so an admin
     who is not on the active-staff list had the first member of staff in the
     shop silently recorded as the person who took the device in.

     No default is needed here: buildFreshForm already puts the signed-in user
     in technicianUid, the dropdown selects on that uid, and buildFinalData
     resolves the name from this list when the order is saved. */
  useEffect(() => {
    if (userRole?.toLowerCase() !== 'admin') return;

    const fetchStaff = async () => {
      try {
        const q = query(collection(db, 'users'), where('isActive', '==', true));
        const snap = await getDocs(q);
        const list = [];
        snap.forEach(doc => list.push({ uid: doc.id, ...doc.data() }));
        setStaffOptions(list);
      } catch (err) {
        console.error('Error fetching active staff:', err);
        setStaffOptions([]);
      }
    };

    fetchStaff();
    /* Keyed on the uid, not the user object: the context hands out a fresh
       object each render, which re-ran this and re-read the staff list. */
  }, [userRole, currentUser?.uid]);
  /* Seeded from the order rather than left empty until something happens in
     this session. The registry lookup below confirms it, but that is a round
     trip - and anyone who opened a labelled order and printed its job card
     before it came back got a blank where the label number goes. */
  const [assignedLabelNumber, setAssignedLabelNumber] = useState(initialData?.assignedLabelNumber ?? null);
  const [localId, setLocalId] = useState(initialData?.id || null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPrinterSelector, setShowPrinterSelector] = useState(false);
  const [labelHTMLContent, setLabelHTMLContent] = useState('');
  const [labelEntry, setLabelEntry] = useState(null);

  useEffect(() => {
    if (localId) {
      const checkLabel = async () => {
        try {
          const q = query(collection(db, 'label_registry'), where('referenceId', '==', localId), where('labelType', '==', 'service_order'));
          const snap = await getDocs(q);
          if (!snap.empty) setAssignedLabelNumber(snap.docs[0].data().labelNumber);
        } catch (err) {
          console.error("Error fetching label:", err);
        }
      };
      checkLabel();
    }
  }, [localId]);



  const filteredComplaints = COMPLAINTS.filter(c => c.toLowerCase().includes(complaintSearch.toLowerCase()));

  const handleComplaintToggle = (complaint) => {
    setFormData(prev => {
      const types = prev.complaintTypes || [];
      if (types.includes(complaint)) {
        return { ...prev, complaintTypes: types.filter(t => t !== complaint) };
      } else {
        return { ...prev, complaintTypes: [...types, complaint] };
      }
    });
    if (fieldErrors.complaintTypes) setFieldErrors(prev => ({...prev, complaintTypes: ''}))
  };

  const removeComplaint = (complaint) => {
    setFormData(prev => ({
      ...prev,
      complaintTypes: (prev.complaintTypes || []).filter(t => t !== complaint)
    }));
    if (fieldErrors.complaintTypes) setFieldErrors(prev => ({...prev, complaintTypes: ''}))
  };

  const isCompletedOrder = initialData?.status === 'Completed';

  useEffect(() => {
    const fetchData = async () => {
      try {
        setCustomers(await loadCustomers());
      } catch (err) {
        console.error("Error fetching data:", err);
        setCustomers([]);
      }
    };
    fetchData();
  }, []);

  const handleCustomerSelect = (c) => {
    setFormData(prev => ({
      ...prev,
      customerId: c.id || '',
      customerName: c.name || '',
      customerPhone: c.phone || ''
    }));
  };

  const handleAccessoryChange = (acc) => {
    setFormData(prev => {
      const isSelected = prev.accessories.includes(acc);
      if (isSelected) {
        return { ...prev, accessories: prev.accessories.filter(a => a !== acc) };
      } else {
        return { ...prev, accessories: [...prev.accessories, acc] };
      }
    });
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageToCloudinary(file);
      setFormData(prev => ({ ...prev, imageUrl: url }));
    } catch (err) {
      console.error(err);
      setError('Image upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  /* ── WHAT ACTUALLY GETS SAVED ──
     Both save paths build this, and they used to build it separately: forty
     lines duplicated between Create Order and Save & Print, which had already
     drifted apart. Save refused an unparseable date and Save & Print wrote it
     to Firestore as an Invalid Date. One builder, one set of rules.
     Throws rather than returning a flag, so a caller cannot forget to look. */
  const buildFinalData = () => {
    const { received: receivedAtDate, expected: expectedCompletionDate } =
      requireOrderDates(formData.receivedAt, formData.expectedCompletionAt);

    const finalData = { ...formData, createdBy: currentUser?.uid || '' };
    delete finalData.customBrand;
    delete finalData.complaintNature;
    delete finalData.customComplaint;
    delete finalData.imei;
    if (!finalData.complaintTypes.includes('Other')) {
      finalData.otherComplaint = '';
    }

    /* Only for a device never saved from this form. Without the localId check,
       saving and then printing recorded the same handset twice. */
    if (!initialData && !localId) {
      recordTacIfNew(finalData.imei1, finalData.brand, finalData.model, currentUser?.uid);
    }

    const role = userRole?.toLowerCase();
    if (role === 'admin') {
      const selectedTech = staffOptions.find(u => u.uid === finalData.technicianUid);
      finalData.technicianName = selectedTech?.name || finalData.technicianName || currentUser?.displayName || currentUser?.email || '';
      finalData.technicianUid = finalData.technicianUid || currentUser?.uid || '';
    } else {
      // Staff, and anyone whose role has not loaded, own the orders they take in.
      finalData.technicianName = userName || currentUser?.displayName || currentUser?.email || '';
      finalData.technicianUid = currentUser?.uid || '';
    }

    finalData.alternatePhone = formData.alternatePhone || '';
    finalData.receivedAt = receivedAtDate;
    finalData.expectedCompletionAt = expectedCompletionDate;
    if (finalData.lockType !== 'Pattern') finalData.lockPattern = [];
    if (!['PIN', 'Password', 'Other'].includes(finalData.lockType)) finalData.lockHint = '';

    finalData.serviceProfit = (Number(formData.estimatedPrice) || 0) -
      (Number(formData.rawMaterialCost) || 0) -
      (Number(formData.outsideLabourCost) || 0);

    if (localId) finalData.id = localId;
    return finalData;
  };

  /* What a save handed back. The list returns the id together with the order
     number it drew from the daily counter; the device page returns the id alone,
     because an order it is already editing has a number. */
  const readSaveResult = (saved) => (
    typeof saved === 'string' || !saved
      ? { id: saved || null, orderNumber: null }
      : { id: saved.id || null, orderNumber: saved.orderNumber || null }
  );

  /* The form as it stands once the save's own answer is folded back in, which is
     also what stops the draft being kept. The order number only exists after the
     first write, and it has to be inside the snapshot or the footer would read
     it as an unsaved edit and offer to save it again.

     The settled form is returned, not just stored: setFormData does not take
     effect until the next render, so a caller that prints straight after saving
     would otherwise read the form as it was before the number arrived - and
     print a job card with no order number on it. */
  const noteSaved = (finalData, orderNumber) => {
    const settled = orderNumber ? { ...formData, orderNumber } : formData;
    if (orderNumber && orderNumber !== formData.orderNumber) setFormData(settled);
    setSavedSnapshot(JSON.stringify(settled));
    clearDraft(draftKey);
    setRestoredDraft(false);
    rememberOptions({
      brands: finalData.brand,
      models: { [finalData.brand]: finalData.model },
      field_options: { colour: finalData.colour },
    });
    return settled;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!validateAndScroll()) return;

    // Only admin can make changes to completed or billed orders
    if ((initialData?.status === 'Completed' || initialData?.billCreated) && userRole?.toLowerCase() !== 'admin') {
      setError('Only admin can make changes to completed bills.');
      return;
    }

    if (initialData?.status === 'Completed' && formData.status !== 'Completed') {
      setError('Cannot change status for a completed service order.');
      return;
    }

    setSaveStatus('saving');
    setError('');
    try {
      const finalData = buildFinalData();
      const { id: newId, orderNumber } = readSaveResult(await onSave(finalData));
      if (newId) setLocalId(newId);
      setSaveStatus('saved');
      return noteSaved(finalData, orderNumber);
    } catch (err) {
      setError(err.message);
      setSaveStatus('idle');
      return null;
    }
  };

  const handleSaveAndPrint = async () => {
    if (!validateAndScroll()) return;
    try {
      setIsProcessing(true);
      setError('');

      // Step 1: Auto generate serial number
      const finalSerialNumber = generateSerialNumber();

      // Step 2: Save service order to Firestore
      const finalData = buildFinalData();
      finalData.serialNumber = finalSerialNumber;

      const { id: savedDocId, orderNumber } = readSaveResult(await onSave(finalData));
      if (savedDocId) setLocalId(savedDocId);
      const settled = noteSaved(finalData, orderNumber);
      finalData.orderNumber = settled.orderNumber || finalData.orderNumber || '';

      /* Step 3: the label number. Reuse one this order already has rather than
         drawing another. The catch below resets saveStatus to 'idle' whatever
         went wrong, so a failure after the registry entry was written re-enabled
         the button - and a second press burned a second label number on one
         device, leaving two active registry rows pointing at it. */
      const nextLabel = assignedLabelNumber ?? await getLabelNumber();
      const labelData = {
        labelNumber: nextLabel,
        labelType: "service_order",
        referenceId: savedDocId || localId,
        assignedBy: currentUser.uid,
        assignedAt: new Date().toISOString(),
        isActive: true,
        data: {
          orderNumber: finalData.orderNumber || initialData?.orderNumber || '',
          brand: finalData.brand,
          model: finalData.model,
          customerName: finalData.customerName,
          customerPhone: finalData.customerPhone,
          complaintTypes: finalData.complaintTypes,
          estimatedPrice: Number(finalData.estimatedPrice || 0),
          technicianName: finalData.technicianName,
          status: finalData.status,
          serialNumber: finalSerialNumber,
          createdBy: currentUser.uid,
          createdAt: new Date().toISOString()
        }
      };

      await setDoc(doc(db, "label_registry", nextLabel.toString()), labelData);
      /* Recorded the moment it exists, so the guard above sees it even if one of
         the steps after this one fails. */
      setAssignedLabelNumber(nextLabel);

      await updateDoc(doc(db, "service_orders", savedDocId || localId), {
        assignedLabelNumber: nextLabel,
        serialNumber: finalSerialNumber
      });

      // Step 4: Show printer selector
      const html = generateLabelHTML(labelData);
      setLabelHTMLContent(html);
      setLabelEntry(labelData);
      setShowPrinterSelector(true);

      setSaveStatus(`Saved & Label #${nextLabel} Assigned ✓`);

    } catch (error) {
      console.error("Save & Print error:", error);
      alert("Error during Save & Print. Please try again.");
      setSaveStatus('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  /* Saved AND untouched since. The old test was on saveStatus alone, which
     stayed 'saved' while someone carried on typing - so the button sat there
     reading "Saved ✓" over a form full of changes that were not saved at all,
     and would not let you press it to save them. */
  const exists = Boolean(initialData || localId);
  const dirty = savedSnapshot === null || savedSnapshot !== JSON.stringify(formData);
  const justSaved = !dirty;
  const busy = saveStatus === 'saving' || isProcessing || uploading;

  /* Printing saves first. Being unable to print a job card until the order had
     been saved by a separate button was the same mistake the purchase
     declaration made: the paper the customer is handed is the point, and the
     save is bookkeeping that should happen on the way there. */
  const handlePrintJobCard = async () => {
    if (!validateAndScroll()) return;
    /* Opened before the save, not after it. window.open only counts as
       user-initiated while the tap that caused it is still being handled; an
       await in between hands control back to the browser, and a phone then
       treats the call as an unsolicited pop-up and blocks it. The old order
       also left printWindow unchecked, so a blocked pop-up threw inside an
       async click handler - no paper, and nothing on screen to say why. */
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('The browser blocked the print window. Allow pop-ups for this site, then print again.');
      return;
    }

    /* Only write if there is something to write: printing an unchanged order
       should cost neither a save nor a bumped updatedAt. What comes back is the
       form including the order number the save just minted - reading formData
       here instead would print the version from before it arrived. */
    const saved = dirty ? await handleSubmit() : null;
    if (dirty && !saved) { printWindow.close(); return; }
    const source = saved || formData;

    const orderData = {
      orderNumber: source.orderNumber || initialData?.orderNumber || '',
      customerName: source.customerName,
      customerPhone: source.customerPhone,
      alternatePhone: source.alternatePhone,
      brand: source.brand,
      model: source.model,
      colour: source.colour,
      imei1: source.imei1,
      imei2: source.imei2,
      lockType: source.lockType,
      technicianName: source.technicianName,
      complaintTypes: source.complaintTypes,
      otherComplaint: source.otherComplaint,
      problemDetails: source.problemDetails,
      accessoriesCollected: source.accessories,
      estimatedPrice: source.estimatedPrice,
      advancePaid: source.advancePaid,
      assignedLabelNumber: assignedLabelNumber
    }
    try {
      printWindow.document.write(generateServiceJobCard(orderData, shopDetails))
      printWindow.document.close()
      setTimeout(() => printWindow.print(), 500)
    } catch (err) {
      console.error('Job card print failed:', err)
      printWindow.close()
      setError('Could not print the job card: ' + (err?.message || err))
    }
  }

  if (!currentUser) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
        <div className="bg-white rounded-2xl px-6 py-5 flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#002395]"></div>
          <span className="text-sm text-gray-600">Loading user data...</span>
        </div>
      </div>
    );
  }

  const estPrice = Number(formData.estimatedPrice) || 0;
  const materialCost = Number(formData.rawMaterialCost) || 0;
  const labourCost = Number(formData.outsideLabourCost) || 0;
  const advance = Number(formData.advancePaid) || 0;
  const previewProfit = estPrice - materialCost - labourCost;

    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
        <div
          {...sheetProps}
          className="bg-[#f1f5f9] w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col h-[94dvh] md:h-auto md:max-h-[90vh] overflow-hidden"
        >

          {/* Grab handle - drag it down to close */}
          <div {...handleProps} aria-label="Drag down to close" className="md:hidden flex justify-center pt-2.5 pb-2 flex-shrink-0 bg-white">
            <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
          </div>

          {/* Header */}
          <div className="flex-shrink-0 px-4 pt-2 pb-3 bg-white border-b border-gray-100">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-[#0f172a] truncate">
                  {initialData ? 'Edit Service Order' : 'New Service Order'}
                </h2>
                <p className="text-xs text-gray-400 truncate">
                  {formData.brand && formData.model
                    ? `${formData.brand} ${formData.model}`
                    : 'Device, complaint and estimate'}
                </p>
              </div>
              <button
                type="button"
                onClick={discardAndClose}
                className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 active:bg-gray-100 shrink-0"
                aria-label="Close"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3">

            {/* Say so, rather than silently showing someone a form that is not
                as empty as they expect. */}
            {restoredDraft && (
              <div className="bg-[#002395]/5 border border-[#002395]/20 rounded-2xl px-4 py-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#0f172a]">Picked up where you left off</p>
                  <p className="text-xs text-[#64748b] mt-0.5 leading-relaxed">
                    This intake still had your unsaved details from last time.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startFresh}
                  className="text-xs font-bold text-[#002395] shrink-0 py-1"
                >
                  Start empty
                </button>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-[#ED2939] px-4 py-3 rounded-2xl text-sm font-medium">
                <i className="fas fa-exclamation-circle mr-2"></i>{error}
              </div>
            )}

            {/* ── DEVICE ── */}
            <Section icon="fa-mobile-alt" title="Device" hint="What came in for service">
              <div className="space-y-3">
                <div ref={brandRef}>
                  <label className={labelClass}>Brand <span className="text-[#ED2939]">*</span></label>
                  <ComboBox
                    required
                    value={formData.brand}
                    options={BRANDS}
                    placeholder="Select or type a brand"
                    error={fieldErrors.brand}
                    onChange={v => {
                      setFormData(prev => ({ ...prev, brand: v, model: '' }))
                      if (fieldErrors.brand) setFieldErrors(prev => ({...prev, brand: ''}))
                    }}
                  />
                </div>

                <div ref={modelRef}>
                  <label className={labelClass}>Model <span className="text-[#ED2939]">*</span></label>
                  <ComboBox
                    required
                    value={formData.model}
                    options={MODELS[formData.brand] || []}
                    disabled={!formData.brand}
                    placeholder={formData.brand ? 'Select or type a model' : 'Select brand first'}
                    error={fieldErrors.model}
                    onChange={v => {
                      setFormData(prev => ({ ...prev, model: v }))
                      if (fieldErrors.model) setFieldErrors(prev => ({...prev, model: ''}))
                    }}
                  />
                </div>

                <div>
                  <label className={labelClass}>Colour</label>
                  <ComboBox
                    value={formData.colour}
                    options={fieldOptions.colour || []}
                    placeholder="Select or type a colour"
                    onChange={v => setFormData(prev => ({ ...prev, colour: v }))}
                  />
                </div>

                <div ref={imei1Ref}>
                  <ImeiInput
                    label="IMEI 1"
                    value={formData.imei1}
                    onChange={val => {
                      setFormData(prev => ({ ...prev, imei1: val }))
                      if (fieldErrors.imei1) setFieldErrors(prev => ({...prev, imei1: ''}))
                    }}
                    onSecondaryChange={val => setFormData(prev => ({ ...prev, imei2: val }))}
                    secondaryLabel="IMEI 2"
                    required={!formData.imeiUnavailable}
                    scannerId="scanner-service-imei1"
                  />
                  <FieldError message={fieldErrors.imei1} />
                </div>
                <div>
                  <ImeiInput
                    label="IMEI 2 (optional)"
                    value={formData.imei2}
                    onChange={val => setFormData(prev => ({ ...prev, imei2: val }))}
                    onSecondaryChange={val => {
                      setFormData(prev => ({ ...prev, imei1: val }))
                      if (fieldErrors.imei1) setFieldErrors(prev => ({...prev, imei1: ''}))
                    }}
                    secondaryLabel="IMEI 1"
                    scannerId="scanner-service-imei2"
                  />
                </div>

                <label className="flex items-start gap-3 p-3 rounded-xl bg-white border border-[#e2e8f0] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!formData.imeiUnavailable}
                    onChange={e => {
                      const checked = e.target.checked
                      setFormData(prev => ({ ...prev, imeiUnavailable: checked }))
                      if (checked && fieldErrors.imei1) setFieldErrors(prev => ({ ...prev, imei1: '' }))
                    }}
                    className="h-5 w-5 text-[#002395] rounded border-gray-300 focus:ring-[#002395] shrink-0 mt-0.5"
                  />
                  <span className="text-xs text-[#0f172a] font-medium">
                    IMEI not readable
                    <span className="block text-[11px] text-gray-400 font-normal mt-0.5">
                      Device is dead or the display is damaged
                    </span>
                  </span>
                </label>

                <div>
                  <label className={labelClass}>Device image</label>
                  {formData.imageUrl ? (
                    <div className="relative inline-block">
                      <img src={imageThumb(formData.imageUrl, 112)} alt="Device" loading="lazy" decoding="async" className="h-28 w-28 object-cover rounded-xl border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, imageUrl: '' }))}
                        className="absolute top-1.5 right-1.5 bg-black/60 text-white w-7 h-7 rounded-full flex items-center justify-center"
                        aria-label="Remove device image"
                      >
                        <i className="fas fa-times text-xs"></i>
                      </button>
                    </div>
                  ) : uploading ? (
                    <div className="h-28 w-28 rounded-xl border-2 border-dashed border-[#002395]/30 bg-[#002395]/5 flex flex-col items-center justify-center">
                      <i className="fas fa-circle-notch fa-spin text-[#002395]"></i>
                      <span className="text-[10px] text-[#002395] font-bold mt-1.5">Uploading</span>
                    </div>
                  ) : (
                    <div className="relative h-28 w-28">
                      <label className="absolute inset-0 flex flex-col items-center justify-center border-2 border-dashed border-[#002395]/30 bg-[#002395]/5 rounded-xl cursor-pointer">
                        <i className="fas fa-camera text-[#002395] text-lg"></i>
                        <span className="text-[10px] text-[#002395] font-bold mt-1">Camera</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={e => handleUpload(e.target.files[0])}
                          className="hidden"
                        />
                      </label>
                      <label className="absolute bottom-1.5 right-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1 text-[10px] font-bold text-gray-500 cursor-pointer shadow-sm">
                        <i className="fas fa-images"></i>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => handleUpload(e.target.files[0])}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </Section>

            {/* ── COMPLAINT ── */}
            <Section icon="fa-triangle-exclamation" title="Issues & Complaints" hint="What the customer reported" tone="danger">
              <div className="space-y-3">
                <div ref={complaintTypesRef}>
                  <label className={labelClass}>Complaint type <span className="text-[#ED2939]">*</span></label>

                  {(formData.complaintTypes || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(formData.complaintTypes || []).map(c => (
                        <span key={c} className="inline-flex items-center pl-3 pr-1.5 py-1.5 rounded-full text-xs font-bold bg-[#002395] text-white">
                          {c}
                          <button type="button" onClick={() => removeComplaint(c)} className="ml-1.5 w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/20" aria-label={`Remove ${c}`}>
                            <i className="fas fa-times text-[10px]"></i>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <input type="text" placeholder="Search complaints..." value={complaintSearch} onChange={e => {
                    setComplaintSearch(e.target.value)
                    if (fieldErrors.complaintTypes) setFieldErrors(prev => ({...prev, complaintTypes: ''}))
                  }} className={`${inputClass} ${fieldErrors.complaintTypes ? errorInput : ''}`} />

                  <div className="max-h-[220px] overflow-y-auto border border-[#e2e8f0] rounded-xl p-1.5 bg-white mt-2">
                    {filteredComplaints.map(c => {
                      const checked = (formData.complaintTypes || []).includes(c)
                      return (
                        <label key={c} className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg cursor-pointer ${checked ? 'bg-[#002395]/5' : ''}`}>
                          <input type="checkbox" checked={checked} onChange={() => handleComplaintToggle(c)} className="h-5 w-5 text-[#002395] rounded border-gray-300 focus:ring-[#002395] shrink-0" />
                          <span className={`text-sm ${checked ? 'text-[#0f172a] font-semibold' : 'text-gray-600'}`}>{c}</span>
                        </label>
                      )
                    })}
                    {filteredComplaints.length === 0 && <div className="text-sm text-gray-400 p-3 text-center">No complaints found</div>}
                  </div>

                  <FieldError message={fieldErrors.complaintTypes} />

                  {(formData.complaintTypes || []).includes('Other') && (
                    <input type="text" required placeholder="Describe the other complaint" value={formData.otherComplaint || ''} onChange={e => setFormData({ ...formData, otherComplaint: e.target.value })} className={`${inputClass} mt-2`} />
                  )}
                </div>

                <div>
                  <label className={labelClass}>Status <span className="text-[#ED2939]">*</span></label>
                  <select
                    required
                    value={formData.status}
                    onChange={e => !isCompletedOrder && setFormData({ ...formData, status: e.target.value })}
                    disabled={isCompletedOrder}
                    className={`${inputClass} ${isCompletedOrder ? 'bg-gray-100 text-gray-500' : ''}`}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {isCompletedOrder && (
                    <p className="text-xs text-gray-400 mt-1.5">
                      <i className="fas fa-lock mr-1"></i>Status is locked after completion
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Problem details</label>
                  <textarea value={formData.problemDetails} onChange={e => setFormData({ ...formData, problemDetails: e.target.value })} className={inputClass} rows="2"></textarea>
                </div>

                <div>
                  <label className={labelClass}>Accessories collected</label>
                  <div className="flex flex-wrap gap-2">
                    {ACCESSORIES_OPTIONS.map(acc => {
                      const checked = formData.accessories.includes(acc)
                      return (
                        <label
                          key={acc}
                          className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer border transition ${
                            checked
                              ? 'bg-[#002395] border-[#002395] text-white'
                              : 'bg-white border-[#e2e8f0] text-[#64748b]'
                          }`}
                        >
                          <input type="checkbox" checked={checked} onChange={() => handleAccessoryChange(acc)} className="hidden" />
                          {checked && <i className="fas fa-check mr-1.5"></i>}
                          {acc}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Section>

            {/* ── PRICING ── */}
            <Section icon="fa-indian-rupee-sign" title="Estimate & Costs">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div ref={estimatedPriceRef}>
                    <label className={labelClass}>Estimated price <span className="text-[#ED2939]">*</span></label>
                    <input type="number" inputMode="numeric" pattern="[0-9]*" required min="0" value={formData.estimatedPrice} onChange={e => {
                      setFormData({ ...formData, estimatedPrice: e.target.value })
                      if (fieldErrors.estimatedPrice) setFieldErrors(prev => ({...prev, estimatedPrice: ''}))
                    }} className={`${inputClass} ${fieldErrors.estimatedPrice ? errorInput : ''}`} />
                    <FieldError message={fieldErrors.estimatedPrice} />
                  </div>
                  <div>
                    <label className={labelClass}>Advance paid</label>
                    <input type="number" inputMode="numeric" pattern="[0-9]*" min="0" value={formData.advancePaid} onChange={e => setFormData({ ...formData, advancePaid: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Raw material cost</label>
                    <input type="number" inputMode="numeric" pattern="[0-9]*" min="0" value={formData.rawMaterialCost} onChange={e => setFormData({ ...formData, rawMaterialCost: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Outside labour cost</label>
                    <input type="number" inputMode="numeric" pattern="[0-9]*" min="0" value={formData.outsideLabourCost} onChange={e => setFormData({ ...formData, outsideLabourCost: e.target.value })} className={inputClass} />
                  </div>
                </div>

                {/* Live margin, same read-out as the second-hand form */}
                <div className="bg-[#f8fafc] rounded-xl p-3 border border-gray-100 space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Estimate</span><span>₹{estPrice}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Material + Labour</span><span>₹{materialCost + labourCost}</span>
                  </div>
                  {advance > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Advance Paid</span><span>₹{advance}</span>
                    </div>
                  )}
                  {estPrice > 0 && (
                    <div className={`flex justify-between text-base font-bold border-t border-gray-200 pt-1.5 ${previewProfit >= 0 ? 'text-green-600' : 'text-[#ED2939]'}`}>
                      <span className="text-sm">Est. Profit</span>
                      <span>₹{previewProfit}</span>
                    </div>
                  )}
                </div>
              </div>
            </Section>

            {/* ── SCHEDULE ── */}
            <Section icon="fa-clock" title="Schedule & Technician">
              <div className="space-y-3">
                <div ref={receivedAtRef}>
                  <label className={labelClass}>Received at <span className="text-[#ED2939]">*</span></label>
                  <input type="datetime-local" required value={formData.receivedAt} onChange={e => {
                    setFormData({ ...formData, receivedAt: e.target.value })
                    if (fieldErrors.receivedAt) setFieldErrors(prev => ({...prev, receivedAt: ''}))
                  }} className={`${inputClass} ${fieldErrors.receivedAt ? errorInput : ''}`} />
                  <FieldError message={fieldErrors.receivedAt} />
                </div>
                <div ref={expectedCompletionAtRef}>
                  <label className={labelClass}>Expected completion <span className="text-[#ED2939]">*</span></label>
                  <input type="datetime-local" required value={formData.expectedCompletionAt} onChange={e => {
                    setFormData({ ...formData, expectedCompletionAt: e.target.value })
                    if (fieldErrors.expectedCompletionAt) setFieldErrors(prev => ({...prev, expectedCompletionAt: ''}))
                  }} className={`${inputClass} ${fieldErrors.expectedCompletionAt ? errorInput : ''}`} />
                  <FieldError message={fieldErrors.expectedCompletionAt} />
                </div>
                <div>
                  <label className={labelClass}>Technician</label>
                  {userRole?.toLowerCase() === 'admin' ? (
                    <select
                      value={formData.technicianUid}
                      onChange={e => {
                        const selected = staffOptions.find(s => s.uid === e.target.value);
                        setFormData(prev => ({
                          ...prev,
                          technicianUid: e.target.value,
                          technicianName: selected?.name || selected?.email || prev.technicianName
                        }));
                      }}
                      className={inputClass}
                    >
                      <option value="">Select Technician</option>
                      {staffOptions.map(staff => (
                        <option key={staff.uid} value={staff.uid}>{`${staff.name || staff.email}${staff.role ? ` (${staff.role})` : ''}`}</option>
                      ))}
                    </select>
                  ) : (
                    <div className={`${inputClass} bg-gray-50 font-medium text-gray-600`}>
                      {formData.technicianName || userName || currentUser?.displayName || currentUser?.email || 'Current User'}
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Suggestions</label>
                  <textarea value={formData.suggestions} onChange={e => setFormData({ ...formData, suggestions: e.target.value })} className={inputClass} rows="2"></textarea>
                </div>
              </div>
            </Section>

            {/* ── LOCK ── */}
            <Section icon="fa-lock" title="Lock & Security" hint="So the device can be opened for testing">
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Lock type</label>
                  <select value={formData.lockType} onChange={e => {
                    const selected = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      lockType: selected,
                      lockPattern: selected === 'Pattern' ? prev.lockPattern || [] : [],
                      lockHint: selected === 'Pattern' ? '' : prev.lockHint
                    }));
                  }} className={inputClass}>
                    {LOCK_TYPES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                {['PIN', 'Password', 'Other'].includes(formData.lockType) && (
                  <div>
                    <label className={labelClass}>
                      {formData.lockType === 'PIN' ? 'PIN' : formData.lockType === 'Password' ? 'Password' : 'Unlock code'}
                    </label>
                    <input type="text" value={formData.lockHint || ''} onChange={e => setFormData({ ...formData, lockHint: e.target.value })} placeholder="Code needed to unlock the device" className={inputClass} />
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      Shown to staff on the order, hidden until tapped.
                    </p>
                  </div>
                )}
                {formData.lockType === 'Pattern' && (
                  <div>
                    <label className={labelClass}>Unlock pattern</label>
                    <div className="flex justify-center">
                      <Suspense fallback={<div className="text-sm text-gray-400">Loading pattern lock...</div>}>
                        <PatternLock
                          value={formData?.lockPattern || []}
                          onChange={nextPattern => setFormData(prev => ({ ...prev, lockPattern: nextPattern || [] }))}
                        />
                      </Suspense>
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* ── CUSTOMER ── */}
            <Section icon="fa-user" title="Customer">
              <CustomerAutocomplete
                customers={customers}
                nameValue={formData.customerName}
                phoneValue={formData.customerPhone}
                alternatePhoneValue={formData.alternatePhone}
                onNameChange={val => setFormData({ ...formData, customerName: val, customerId: '' })}
                onPhoneChange={val => setFormData({ ...formData, customerPhone: val, customerId: '' })}
                onAlternatePhoneChange={val => setFormData({ ...formData, alternatePhone: val })}
                onSelectCustomer={handleCustomerSelect}
              />
            </Section>

          </div>

          {/* ── FOOTER ──
              One thing to do, and quieter ways to do the rest. This was four
              filled buttons in three different colours - blue, green and amber -
              stacked at the bottom of the form, with nothing to say which was
              the one you wanted. The paperwork actions save on their way to the
              printer, so none of them has to be unlocked by pressing something
              else first. */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white pb-safe">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || justSaved}
              className="w-full bg-[#002395] text-white rounded-xl py-3.5 text-sm font-bold disabled:opacity-50"
            >
              {saveStatus === 'saving' ? 'Saving…'
                : justSaved ? 'Saved ✓'
                  : exists ? 'Save changes' : 'Create order'}
            </button>

            {!initialData && (
              <button
                type="button"
                onClick={handleSaveAndPrint}
                disabled={busy || saveStatus.includes('Assigned ✓')}
                className="w-full mt-2 border border-[#002395] text-[#002395] rounded-xl py-3 text-sm font-bold disabled:opacity-50"
              >
                {isProcessing ? 'Printing…'
                  : saveStatus.includes('Assigned ✓') ? `Label #${assignedLabelNumber} printed ✓`
                    : 'Save and print the label'}
              </button>
            )}

            <div className="flex items-center justify-center gap-4 mt-2.5">
              <button
                type="button"
                onClick={discardAndClose}
                className="text-[13px] font-semibold text-[#64748b] py-1.5"
              >
                Cancel
              </button>
              <span aria-hidden="true" className="text-[#e2e8f0]">·</span>
              <button
                type="button"
                onClick={handlePrintJobCard}
                disabled={busy}
                className="text-[13px] font-semibold text-[#002395] py-1.5 disabled:opacity-50"
              >
                Print job card
              </button>
            </div>
          </div>
        </div>

        <PrinterSelector
          isOpen={showPrinterSelector}
          onClose={() => setShowPrinterSelector(false)}
          htmlContent={labelHTMLContent}
          labelEntry={labelEntry}
          title="Print Label"
        />

      </div>
    );
};

export default ServiceOrderForm;
