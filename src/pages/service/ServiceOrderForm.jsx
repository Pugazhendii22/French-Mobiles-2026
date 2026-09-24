import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Section, FieldError } from '../../components/common/ui';
import { inputClass, labelClass, errorInput } from '../../components/common/uiTokens';
import { collection, getDocs, addDoc, query, where, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import CustomerAutocomplete from '../../components/common/CustomerAutocomplete';
import ImeiInput from '../../components/ImeiInput';
import { getLabelNumber } from '../../utils/getLabelNumber';
import { uploadImageToCloudinary } from '../../utils/uploadImage';
import { generateLabelHTML } from '../../utils/printLabel.jsx';
import { generateServiceJobCard } from '../../utils/generateServiceJobCard';
import PrinterSelector from '../../components/PrinterSelector';
import { imageThumb } from '../../utils/imageUrl';
import { loadCustomers } from '../../utils/customerCache';
import { recordTacIfNew } from '../../utils/tacLookup';

const PatternLock = lazy(() => import('../../components/PatternLock').catch(() => ({ default: () => <div className="text-red-500">Failed to load PatternLock</div> })));

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
  const { complaintTypes: complaintTypeOptions = [], accessories: accessoryOptions = [], brands: brandOptions = [], models: modelOptions = {}, shopDetails } = useSettings();
  const [staffOptions, setStaffOptions] = useState([]);

  const LOCK_TYPES = ['None', 'PIN', 'Password', 'Pattern', 'Fingerprint', 'Face Unlock', 'Other'];
  const ACCESSORIES_OPTIONS = accessoryOptions;
  const MODELS = modelOptions;
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

  const [customModel, setCustomModel] = useState(
    () => (!initialData && prefillData?.model && !prefillModelMatch) ? prefillData.model : ''
  );
  const [isCustomModel, setIsCustomModel] = useState(
    () => !!(!initialData && prefillData?.model && !prefillModelMatch)
  );

  const formatDateTimeLocal = (value) => {
    if (!value) return '';
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState(() => {
    const nowLocal = new Date().toISOString().slice(0, 16);
    const base = initialData ? {
      ...initialData,
      alternatePhone: initialData.alternatePhone || '',
      technicianName: initialData.technicianName || userName || currentUser?.displayName || currentUser?.email || '',
      technicianUid: initialData.technicianUid || currentUser?.uid || '',
      receivedAt: formatDateTimeLocal(initialData.receivedAt) || nowLocal,
      expectedCompletionAt: formatDateTimeLocal(initialData.expectedCompletionAt) || ''
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
  });

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

  useEffect(() => {
    if (userRole?.toLowerCase() !== 'admin') return;

    const fetchStaff = async () => {
      try {
        const q = query(collection(db, 'users'), where('isActive', '==', true));
        const snap = await getDocs(q);
        const list = [];
        snap.forEach(doc => list.push({ uid: doc.id, ...doc.data() }));
        setStaffOptions(list);

        if (!initialData) {
          const defaultTech = list.find(u => u.uid === currentUser?.uid) || list[0];
          if (defaultTech) {
            setFormData(prev => ({
              ...prev,
              technicianUid: defaultTech.uid,
              technicianName: defaultTech.name || defaultTech.email || ''
            }));
          }
        }
      } catch (err) {
        console.error('Error fetching active staff:', err);
        setStaffOptions([]);
      }
    };

    fetchStaff();
  }, [userRole, currentUser, initialData]);
  const [labelAssigned, setLabelAssigned] = useState(false);
  const [assignedLabelNumber, setAssignedLabelNumber] = useState(null);
  const [assigning, setAssigning] = useState(false);
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
          if (!snap.empty) {
            setLabelAssigned(true);
            setAssignedLabelNumber(snap.docs[0].data().labelNumber);
          }
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

  const handleSubmit = async (e) => {
    e.preventDefault();
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

    const receivedAtDate = new Date(formData.receivedAt);
    const expectedCompletionDate = new Date(formData.expectedCompletionAt);
    if (Number.isNaN(receivedAtDate.getTime()) || Number.isNaN(expectedCompletionDate.getTime())) {
      setError('Please provide valid datetime values for received and expected completion');
      return;
    }

    setSaveStatus('saving');
    setError('');
    try {
      const finalData = { ...formData, createdBy: currentUser?.uid || '' };
      if (finalData.brand === 'Other') {
        finalData.brand = finalData.customBrand;
      }
      delete finalData.customBrand;
      delete finalData.complaintNature;
      delete finalData.customComplaint;
      delete finalData.imei;
      if (!finalData.complaintTypes.includes('Other')) {
        finalData.otherComplaint = '';
      }

      if (!initialData) {
        recordTacIfNew(finalData.imei1, finalData.brand, finalData.model, currentUser?.uid);
      }

      if (userRole?.toLowerCase() === 'staff') {
        finalData.technicianName = userName || currentUser?.displayName || currentUser?.email || '';
        finalData.technicianUid = currentUser?.uid || '';
      } else if (userRole?.toLowerCase() === 'admin') {
        const selectedTech = staffOptions.find(u => u.uid === finalData.technicianUid);
        finalData.technicianName = selectedTech?.name || finalData.technicianName || currentUser?.displayName || currentUser?.email || '';
        finalData.technicianUid = finalData.technicianUid || currentUser?.uid || '';
      } else {
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

      const newId = await onSave(finalData);
      if (newId) setLocalId(newId);
      setSaveStatus('saved');
    } catch (err) {
      setError(err.message);
      setSaveStatus('idle');
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
      const finalData = { ...formData, createdBy: currentUser?.uid || '' };
      if (finalData.brand === 'Other') {
        finalData.brand = finalData.customBrand;
      }
      delete finalData.customBrand;
      delete finalData.complaintNature;
      delete finalData.customComplaint;
      delete finalData.imei;
      if (!finalData.complaintTypes.includes('Other')) {
        finalData.otherComplaint = '';
      }

      if (!initialData) {
        recordTacIfNew(finalData.imei1, finalData.brand, finalData.model, currentUser?.uid);
      }

      if (userRole?.toLowerCase() === 'staff') {
        finalData.technicianName = userName || currentUser?.displayName || currentUser?.email || '';
        finalData.technicianUid = currentUser?.uid || '';
      } else if (userRole?.toLowerCase() === 'admin') {
        const selectedTech = staffOptions.find(u => u.uid === finalData.technicianUid);
        finalData.technicianName = selectedTech?.name || finalData.technicianName || currentUser?.displayName || currentUser?.email || '';
        finalData.technicianUid = finalData.technicianUid || currentUser?.uid || '';
      } else {
        finalData.technicianName = userName || currentUser?.displayName || currentUser?.email || '';
        finalData.technicianUid = currentUser?.uid || '';
      }

      finalData.alternatePhone = formData.alternatePhone || '';
      finalData.receivedAt = new Date(formData.receivedAt);
      finalData.expectedCompletionAt = new Date(formData.expectedCompletionAt);
      if (finalData.lockType !== 'Pattern') finalData.lockPattern = [];
      if (!['PIN', 'Password', 'Other'].includes(finalData.lockType)) finalData.lockHint = '';
      finalData.serviceProfit = (Number(formData.estimatedPrice) || 0) -
        (Number(formData.rawMaterialCost) || 0) -
        (Number(formData.outsideLabourCost) || 0);
      finalData.serialNumber = finalSerialNumber;

      if (localId) finalData.id = localId;

      const savedDocId = await onSave(finalData);
      if (savedDocId) setLocalId(savedDocId);

      // Step 3: Auto assign next label number
      const nextLabel = await getLabelNumber();
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
      setLabelAssigned(true);
      setAssignedLabelNumber(nextLabel);

    } catch (error) {
      console.error("Save & Print error:", error);
      alert("Error during Save & Print. Please try again.");
      setSaveStatus('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssignLabel = async () => {
    if (!localId) return;
    setAssigning(true);
    try {
      const nextNum = await getLabelNumber();
      if (window.confirm(`Assign label #${nextNum} to this service order?`)) {
        await addDoc(collection(db, 'label_registry'), {
          labelNumber: Number(nextNum),
          labelType: 'service_order',
          referenceId: localId,
          assignedBy: currentUser?.uid || '',
          assignedAt: new Date().toISOString(),
          isActive: true,
          data: {
            orderNumber: formData.orderNumber || initialData?.orderNumber || '',
            brand: formData.brand || '',
            model: formData.model || '',
            colour: formData.colour || '',
            customerName: formData.customerName || '',
            customerPhone: formData.customerPhone || '',
            complaintTypes: formData.complaintTypes || [],
            otherComplaint: formData.otherComplaint || '',
            problemDetails: formData.problemDetails || '',
            estimatedPrice: Number(formData.estimatedPrice || 0),
            advancePaid: Number(formData.advancePaid || 0),
            technicianName: formData.technicianName || userName || currentUser?.displayName || currentUser?.email || '',
            status: formData.status || 'Received',
            accessoriesCollected: formData.accessories || [],
            lockType: formData.lockType || 'None',
            lockPattern: formData.lockPattern || [],
            lockHint: formData.lockHint || ''
          }
        });
        setLabelAssigned(true);
        setAssignedLabelNumber(nextNum);
      }
    } catch (err) {
      alert("Error assigning label: " + err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handlePrintJobCard = () => {
    const orderData = {
      orderNumber: formData.orderNumber || initialData?.orderNumber || '',
      customerName: formData.customerName,
      customerPhone: formData.customerPhone,
      alternatePhone: formData.alternatePhone,
      brand: formData.brand,
      model: formData.model,
      colour: formData.colour,
      imei1: formData.imei1,
      imei2: formData.imei2,
      lockType: formData.lockType,
      technicianName: formData.technicianName,
      complaintTypes: formData.complaintTypes,
      otherComplaint: formData.otherComplaint,
      problemDetails: formData.problemDetails,
      accessoriesCollected: formData.accessories,
      estimatedPrice: formData.estimatedPrice,
      advancePaid: formData.advancePaid,
      assignedLabelNumber: assignedLabelNumber
    }
    const html = generateServiceJobCard(orderData, shopDetails)
    const printWindow = window.open('', '_blank')
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }

  const handlePrintLabel = () => {
    const labelData = {
      labelType: 'service_order',
      labelNumber: labelAssigned ? assignedLabelNumber : null,
      data: {
        customerName: formData.customerName || '',
        brand: formData.brand || '',
        model: formData.model || '',
        complaintTypes: formData.complaintTypes || [],
        estimatedPrice: Number(formData.estimatedPrice || 0),
        orderNumber: formData.orderNumber || initialData?.orderNumber || '',
        imei1: formData.imei1 || '',
      }
    }
    const html = generateLabelHTML(labelData)
    setLabelHTMLContent(html)
    setLabelEntry(labelData)
    setShowPrinterSelector(true)
  };

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

  try {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
        <div className="bg-[#f1f5f9] w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col h-[94dvh] md:h-auto md:max-h-[90vh] overflow-hidden">

          {/* Grab handle */}
          <div className="md:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0 bg-white">
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
                onClick={onCancel}
                className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 active:bg-gray-100 shrink-0"
                aria-label="Close"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

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
                  <select required value={formData.brand} onChange={e => {
                    const selectedBrand = e.target.value
                    setFormData(prev => ({ ...prev, brand: selectedBrand, model: '' }))
                    setCustomModel('')
                    setIsCustomModel(false)
                    if (fieldErrors.brand) setFieldErrors(prev => ({...prev, brand: ''}))
                  }} className={`${inputClass} ${fieldErrors.brand ? errorInput : ''}`}>
                    <option value="">Select Brand</option>
                    {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  {formData.brand === 'Other' && (
                    <input type="text" placeholder="Enter Custom Brand" required value={formData.customBrand || ''} onChange={e => setFormData({ ...formData, customBrand: e.target.value })} className={`${inputClass} mt-2`} />
                  )}
                  <FieldError message={fieldErrors.brand} />
                </div>

                <div ref={modelRef}>
                  <label className={labelClass}>Model <span className="text-[#ED2939]">*</span></label>
                  <select
                    required
                    value={isCustomModel ? '__custom__' : formData.model}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setIsCustomModel(true)
                        setFormData(prev => ({ ...prev, model: '' }))
                      } else {
                        setIsCustomModel(false)
                        setCustomModel('')
                        setFormData(prev => ({ ...prev, model: e.target.value }))
                      }
                      if (fieldErrors.model) setFieldErrors(prev => ({...prev, model: ''}))
                    }}
                    disabled={!formData.brand}
                    className={`${inputClass} disabled:bg-gray-50 disabled:text-gray-400 ${fieldErrors.model ? errorInput : ''}`}
                  >
                    <option value="" disabled>{formData.brand ? 'Select model' : 'Select brand first'}</option>
                    {formData.brand && (MODELS[formData.brand] || []).length === 0 && (
                      <option value="" disabled>No models available</option>
                    )}
                    {(MODELS[formData.brand] || []).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="__custom__">Other (type manually)</option>
                  </select>
                  {isCustomModel && (
                    <input
                      type="text"
                      placeholder="Type model name"
                      value={customModel}
                      onChange={e => {
                        setCustomModel(e.target.value)
                        setFormData(prev => ({ ...prev, model: e.target.value }))
                        if (fieldErrors.model) setFieldErrors(prev => ({...prev, model: ''}))
                      }}
                      className={`${inputClass} mt-2`}
                    />
                  )}
                  <FieldError message={fieldErrors.model} />
                </div>

                <div>
                  <label className={labelClass}>Colour</label>
                  <input type="text" value={formData.colour} onChange={e => setFormData({ ...formData, colour: e.target.value })} className={inputClass} />
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
                    <label className={labelClass}>Draw pattern</label>
                    <div className="bg-gray-50 p-4 rounded-xl border border-[#e2e8f0] flex justify-center">
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

          {/* Footer */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white pb-safe space-y-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saveStatus === 'saving' || uploading || saveStatus.includes('saved') || saveStatus.includes('Saved')}
              className="w-full bg-[#002395] text-white rounded-xl py-3.5 text-sm font-bold disabled:opacity-50"
            >
              {saveStatus === 'saving' ? 'Saving...' : saveStatus.includes('saved') || saveStatus.includes('Saved') ? 'Saved ✓' : initialData ? 'Save Changes' : 'Create Order'}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-bold"
              >
                Cancel
              </button>
              {!initialData && (
                <button
                  type="button"
                  onClick={handleSaveAndPrint}
                  disabled={isProcessing || saveStatus.includes('Assigned ✓')}
                  className="flex-[2] bg-green-600 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50"
                >
                  {isProcessing ? (
                    <span><i className="fas fa-spinner fa-spin mr-2"></i>Processing...</span>
                  ) : saveStatus.includes('Assigned ✓') ? (
                    <span>Done ✓</span>
                  ) : (
                    <span><i className="fas fa-print mr-2"></i>Save &amp; Print</span>
                  )}
                </button>
              )}
            </div>

            {(saveStatus === 'saved' || saveStatus.includes('Assigned ✓') || initialData) && (
              <button
                type="button"
                onClick={handlePrintJobCard}
                className="w-full bg-amber-500 text-white rounded-xl py-3 text-sm font-bold"
              >
                <i className="fas fa-file-alt mr-2"></i> Print Job Card
              </button>
            )}
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
  } catch (err) {
    console.error("Error rendering ServiceOrderForm:", err);
    return (
      <div className="p-4 md:p-8 text-center text-red-600 bg-red-50 rounded-lg break-words">
        <h3 className="font-bold mb-2">Something went wrong.</h3>
        <p>Please refresh the page or contact support if the issue persists.</p>
        <p className="text-xs mt-2 text-red-400">{err.message}</p>
      </div>
    );
  }
};

export default ServiceOrderForm;
