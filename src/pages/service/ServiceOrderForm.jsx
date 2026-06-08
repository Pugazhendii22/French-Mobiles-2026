import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { collection, getDocs, addDoc, query, where, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import CustomerAutocomplete from '../../components/common/CustomerAutocomplete';
import ImeiInput from '../../components/ImeiInput';
import { getLabelNumber } from '../../utils/getLabelNumber';
import { uploadImageToCloudinary } from '../../utils/uploadImage';
import { printLabel, generateLabelHTML } from '../../utils/printLabel.jsx';
import { generateServiceJobCard } from '../../utils/generateServiceJobCard';
import PrinterSelector from '../../components/PrinterSelector';

const PatternLock = lazy(() => import('../../components/PatternLock').catch(() => ({ default: () => <div className="text-red-500">Failed to load PatternLock</div> })));

const generateSerialNumber = () => {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  const random = Math.floor(1000 + Math.random() * 9000)
  return `FM-${dateStr}-${random}`
}

const ServiceOrderForm = ({ initialData, onSave, onCancel }) => {
  const { currentUser, userName, userRole } = useAuth();
  const { complaintTypes: complaintTypeOptions = [], accessories: accessoryOptions = [], brands: brandOptions = [], models: modelOptions = {}, shopDetails } = useSettings();
  const [staffOptions, setStaffOptions] = useState([]);
  const [customModel, setCustomModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);

  const LOCK_TYPES = ['None', 'PIN', 'Password', 'Pattern', 'Fingerprint', 'Face Unlock', 'Other'];
  const ACCESSORIES_OPTIONS = accessoryOptions;
  const BRANDS = brandOptions;
  const MODELS = modelOptions;
  const COMPLAINTS = complaintTypeOptions;
  const STATUSES = ['Received', 'In Progress', 'Parts Awaiting', 'Completed', 'Awaiting Customer Approval', 'Returned'];

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
      brand: '',
      customBrand: '',
      model: '',
      colour: '',
      problemDetails: '',
      imei1: initialData?.imei1 || initialData?.imei || '',
      imei2: initialData?.imei2 || '',
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
    if (!formData.imei1) {
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
        const custSnap = await getDocs(collection(db, 'customers'));
        const cList = [];
        custSnap.forEach(doc => {
          cList.push({ id: doc.id, ...doc.data() });
        });
        setCustomers(cList);
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
      <div className="flex justify-center p-4 md:p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 break-words"></div>
        <span className="ml-3 text-gray-600">Loading user data...</span>
      </div>
    );
  }

  try {
    return (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
    <div className="bg-white w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90vh]">
      
      {/* Handle bar */}
      <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
      </div>

      {/* Fixed header */}
      <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#0f172a]">
            {initialData ? 'Edit Service Order' : 'New Service Order'}
          </h2>
          <button type="button" onClick={onCancel} className="text-gray-400 p-1">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>
      </div>

      {/* Scrollable form content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* CUSTOMER DETAILS SECTION */}
        <div>
          <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
            Customer Details
          </p>
          <div className="space-y-3">
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
          </div>
        </div>

        {/* DEVICE INFO SECTION */}
        <div>
          <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
            Device Info
          </p>
          <div className="space-y-3">
            <div ref={brandRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand *</label>
              <select required value={formData.brand} onChange={e => {
                const selectedBrand = e.target.value
                setFormData(prev => ({ ...prev, brand: selectedBrand, model: '' }))
                setCustomModel('')
                setIsCustomModel(false)
                if (fieldErrors.brand) setFieldErrors(prev => ({...prev, brand: ''}))
              }} className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.brand ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`}>
                <option value="">Select Brand</option>
                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              {formData.brand === 'Other' && (
                <input type="text" placeholder="Enter Custom Brand" required value={formData.customBrand || ''} onChange={e => setFormData({ ...formData, customBrand: e.target.value })} className="mt-2 w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]" />
              )}
              {fieldErrors.brand && (
                <p className="text-[#ED2939] text-xs mt-1">
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  {fieldErrors.brand}
                </p>
              )}
            </div>
            <div ref={modelRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model *</label>
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
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.model ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`}
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
                  className="mt-2 w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                />
              )}
              {fieldErrors.model && (
                <p className="text-[#ED2939] text-xs mt-1">
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  {fieldErrors.model}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colour</label>
              <input type="text" value={formData.colour} onChange={e => setFormData({ ...formData, colour: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div ref={imei1Ref}>
                <ImeiInput
                  label="IMEI 1"
                  value={formData.imei1}
                  onChange={val => {
                    setFormData({ ...formData, imei1: val })
                    if (fieldErrors.imei1) setFieldErrors(prev => ({...prev, imei1: ''}))
                  }}
                  required={true}
                  scannerId="scanner-service-imei1"
                />
                {fieldErrors.imei1 && (
                  <p className="text-[#ED2939] text-xs mt-1">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {fieldErrors.imei1}
                  </p>
                )}
              </div>
              <div>
                <ImeiInput
                  label="IMEI 2 (optional)"
                  value={formData.imei2}
                  onChange={val => setFormData({ ...formData, imei2: val })}
                  scannerId="scanner-service-imei2"
                />
              </div>
            </div>
          </div>
        </div>

        {/* COMPLAINT SECTION */}
        <div>
          <p className="text-xs font-bold text-[#ED2939] uppercase tracking-wide mb-3 border-l-4 border-[#ED2939] pl-3">
            Issues & Complaints
          </p>
          <div className="space-y-3">
            <div ref={complaintTypesRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Complaint type *</label>
              <input type="text" placeholder="Search complaints..." value={complaintSearch} onChange={e => {
                setComplaintSearch(e.target.value)
                if (fieldErrors.complaintTypes) setFieldErrors(prev => ({...prev, complaintTypes: ''}))
              }} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] mb-2" />
              <div className="max-h-[200px] overflow-y-auto border border-gray-300 rounded-xl p-2 bg-white">
                {filteredComplaints.map(c => (
                  <label key={c} className="flex items-center space-x-2 p-1.5 hover:bg-blue-50 rounded cursor-pointer">
                    <input type="checkbox" checked={(formData.complaintTypes || []).includes(c)} onChange={() => handleComplaintToggle(c)} className="h-4 w-4 text-[#002395] rounded border-gray-300 focus:ring-[#002395]" />
                    <span className="text-sm text-gray-700">{c}</span>
                  </label>
                ))}
                {filteredComplaints.length === 0 && <div className="text-sm text-[#64748b] p-2">No complaints found</div>}
              </div>
              {(formData.complaintTypes || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {(formData.complaintTypes || []).map(c => (
                    <span key={c} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#002395] text-white">
                      {c}
                      <button type="button" onClick={() => removeComplaint(c)} className="ml-1.5 inline-flex text-white hover:text-red-200 focus:outline-none">
                        <i className="fas fa-times"></i>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {(formData.complaintTypes || []).includes('Other') && (
                <div className="mt-3">
                  <input type="text" required placeholder="Describe the other complaint" value={formData.otherComplaint || ''} onChange={e => setFormData({ ...formData, otherComplaint: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]" />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
              <select
                required
                value={formData.status}
                onChange={e => !isCompletedOrder && setFormData({ ...formData, status: e.target.value })}
                disabled={isCompletedOrder}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${isCompletedOrder ? 'border-gray-200 bg-gray-100 text-gray-600' : 'border-gray-300 focus:border-[#002395]'}`}
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {isCompletedOrder && (
                <p className="text-xs text-gray-500 mt-2">Status is locked after completion and cannot be changed.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Problem details</label>
              <textarea value={formData.problemDetails} onChange={e => setFormData({ ...formData, problemDetails: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]" rows="2"></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Accessories collected</label>
              <div className="flex flex-wrap gap-3 mt-1">
                {ACCESSORIES_OPTIONS.map(acc => (
                  <label key={acc} className="inline-flex items-center">
                    <input type="checkbox" checked={formData.accessories.includes(acc)} onChange={() => handleAccessoryChange(acc)} className="h-4 w-4 text-[#002395] rounded border-gray-300 focus:ring-[#002395]" />
                    <span className="ml-2 text-sm text-gray-700">{acc}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SERVICE DETAILS SECTION */}
        <div>
          <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
            Service Details
          </p>
          <div className="space-y-3">
            <div ref={estimatedPriceRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estimated price *</label>
              <input type="number" inputMode="numeric" pattern="[0-9]*" required min="0" value={formData.estimatedPrice} onChange={e => {
                setFormData({ ...formData, estimatedPrice: e.target.value })
                if (fieldErrors.estimatedPrice) setFieldErrors(prev => ({...prev, estimatedPrice: ''}))
              }} className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.estimatedPrice ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`} />
              {fieldErrors.estimatedPrice && (
                <p className="text-[#ED2939] text-xs mt-1">
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  {fieldErrors.estimatedPrice}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Advance paid</label>
              <input type="number" inputMode="numeric" pattern="[0-9]*" min="0" value={formData.advancePaid} onChange={e => setFormData({ ...formData, advancePaid: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Raw material cost</label>
              <input type="number" inputMode="numeric" pattern="[0-9]*" min="0" value={formData.rawMaterialCost} onChange={e => setFormData({ ...formData, rawMaterialCost: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Outside labour cost</label>
              <input type="number" inputMode="numeric" pattern="[0-9]*" min="0" value={formData.outsideLabourCost} onChange={e => setFormData({ ...formData, outsideLabourCost: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]" />
            </div>
            <div ref={receivedAtRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Received at *</label>
              <input type="datetime-local" required value={formData.receivedAt} onChange={e => {
                setFormData({ ...formData, receivedAt: e.target.value })
                if (fieldErrors.receivedAt) setFieldErrors(prev => ({...prev, receivedAt: ''}))
              }} className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.receivedAt ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`} />
              {fieldErrors.receivedAt && (
                <p className="text-[#ED2939] text-xs mt-1">
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  {fieldErrors.receivedAt}
                </p>
              )}
            </div>
            <div ref={expectedCompletionAtRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected completion *</label>
              <input type="datetime-local" required value={formData.expectedCompletionAt} onChange={e => {
                setFormData({ ...formData, expectedCompletionAt: e.target.value })
                if (fieldErrors.expectedCompletionAt) setFieldErrors(prev => ({...prev, expectedCompletionAt: ''}))
              }} className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.expectedCompletionAt ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`} />
              {fieldErrors.expectedCompletionAt && (
                <p className="text-[#ED2939] text-xs mt-1">
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  {fieldErrors.expectedCompletionAt}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Technician</label>
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
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
                >
                  <option value="">Select Technician</option>
                  {staffOptions.map(staff => (
                    <option key={staff.uid} value={staff.uid}>{`${staff.name || staff.email}${staff.role ? ` (${staff.role})` : ''}`}</option>
                  ))}
                </select>
              ) : (
                <div className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50 font-medium text-gray-600">
                  {formData.technicianName || userName || currentUser?.displayName || currentUser?.email || 'Current User'}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Suggestions</label>
              <textarea value={formData.suggestions} onChange={e => setFormData({ ...formData, suggestions: e.target.value })} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]" rows="2"></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Device image</label>
              {formData.imageUrl ? (
                <div className="relative inline-block">
                  <img src={formData.imageUrl} alt="Device" className="mt-2 h-32 w-32 object-cover rounded-xl shadow-sm border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, imageUrl: '' }))}
                    className="absolute top-1 right-1 bg-[#ED2939] text-white w-6 h-6 rounded-full flex items-center justify-center"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 mt-1">
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-[#002395]/30 bg-[#002395]/5 rounded-xl h-16 cursor-pointer active:scale-95 transition">
                    <i className="fas fa-camera text-[#002395] text-lg mb-0.5"></i>
                    <span className="text-xs text-[#002395] font-medium">Camera</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={e => handleUpload(e.target.files[0])}
                      className="hidden"
                    />
                  </label>
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 bg-gray-50 rounded-xl h-16 cursor-pointer active:scale-95 transition">
                    <i className="fas fa-images text-gray-500 text-lg mb-0.5"></i>
                    <span className="text-xs text-gray-500 font-medium">Gallery</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleUpload(e.target.files[0])}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
              {uploading && <span className="text-sm text-[#002395] mt-1 inline-block">Uploading...</span>}
            </div>
          </div>
        </div>

        {/* LOCK & SECURITY SECTION */}
        <div>
          <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
            Lock & Security
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lock type</label>
              <select value={formData.lockType} onChange={e => {
                const selected = e.target.value;
                setFormData(prev => ({
                  ...prev,
                  lockType: selected,
                  lockPattern: selected === 'Pattern' ? prev.lockPattern || [] : [],
                  lockHint: selected === 'Pattern' ? '' : prev.lockHint
                }));
              }} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]">
                {LOCK_TYPES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            {['PIN', 'Password', 'Other'].includes(formData.lockType) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lock hint</label>
                <input type="text" value={formData.lockHint || ''} onChange={e => setFormData({ ...formData, lockHint: e.target.value })} placeholder="Optional hint for the lock" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]" />
              </div>
            )}
            {formData.lockType === 'Pattern' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Draw pattern</label>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-300 flex justify-center">
                  <Suspense fallback={<div className="text-sm text-gray-500">Loading pattern lock...</div>}>
                    <PatternLock
                      value={formData?.lockPattern || []}
                      onChange={nextPattern => setFormData(prev => ({ ...prev, lockPattern: nextPattern || [] }))}
                    />
                  </Suspense>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Fixed footer with buttons */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saveStatus === 'saving' || uploading || saveStatus.includes('saved') || saveStatus.includes('Saved')}
            className="flex-1 bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {saveStatus === 'saving' ? 'Saving...' : saveStatus.includes('saved') || saveStatus.includes('Saved') ? 'Saved ✓' : initialData ? 'Save Changes' : 'Create Order'}
          </button>
        </div>
        
        {(saveStatus === 'saved' || saveStatus.includes('Assigned ✓') || initialData) && (
          <button
            type="button"
            onClick={handlePrintJobCard}
            className="w-full mt-3 bg-amber-500 text-white rounded-xl py-2.5 text-sm font-semibold"
          >
            <i className="fas fa-file-alt mr-2"></i> Print Job Card
          </button>
        )}
        {!initialData && (
          <button
            type="button"
            onClick={handleSaveAndPrint}
            disabled={isProcessing || saveStatus.includes('Assigned ✓')}
            className="w-full mt-3 bg-green-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {isProcessing ? (
              <span><i className="fas fa-spinner fa-spin mr-2"></i>Processing...</span>
            ) : saveStatus.includes('Assigned ✓') ? (
              <span>Done ✓</span>
            ) : (
              <span><i className="fas fa-print mr-2"></i>Save & Print</span>
            )}
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
