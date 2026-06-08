import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, query, where, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import { useSettings, normalizeChecklistItems } from '../../context/SettingsContext';
import CustomerAutocomplete from '../../components/common/CustomerAutocomplete';
import ImeiInput from '../../components/ImeiInput';
import { getLabelNumber } from '../../utils/getLabelNumber';
import { printLabel, generateLabelHTML } from '../../utils/printLabel.jsx';
import PrinterSelector from '../../components/PrinterSelector';
import { uploadImageToCloudinary } from '../../utils/uploadImage';

const generateSerialNumber = () => {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  const random = Math.floor(1000 + Math.random() * 9000)
  return `FM-${dateStr}-${random}`
}

const groupByCategory = (items) => {
  const grouped = {}
  items.forEach(item => {
    const cat = item.category || 'Display'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(item)
  })
  return grouped
}

const SecondHandForm = ({ initialData, onSave, onCancel }) => {
  const { currentUser } = useAuth();
  const { deviceChecklist, complaintTypes } = useSettings();

  const getChecklistForBrand = (selectedBrand) => {
    const isApple = selectedBrand?.toLowerCase() === 'apple'
    const specificItems = isApple
      ? (deviceChecklist.iphone || [])
      : (deviceChecklist.android || [])
    const commonItems = deviceChecklist.common || []
    return { commonItems, specificItems, isApple }
  }

  const calculateGrade = (checklist, selectedBrand) => {
    if (!checklist) return 'A'
    const values = Object.values(checklist)
    const notWorkingCount = values.filter(v => v === 'Not Working').length
    const hasPhysicalDamage = Object.entries(checklist).some(
      ([k, v]) => k.includes('physical_damage') && v === 'Yes'
    )
    const hasDisplayReplaced = Object.entries(checklist).some(
      ([k, v]) => k.includes('display_replaced') && v === 'Yes'
    )
    const hasWhiteSpots = Object.entries(checklist).some(
      ([k, v]) => k.includes('white_spots') && v === 'Yes'
    )
    const isIcloudLocked = Object.entries(checklist).some(
      ([k, v]) => k.includes('icloud') && v === 'Yes'
    )
    if (hasPhysicalDamage || isIcloudLocked) return 'D'
    if (notWorkingCount >= 4 || hasDisplayReplaced || hasWhiteSpots) return 'C'
    if (notWorkingCount >= 1 && notWorkingCount <= 3) return 'B'
    return 'A'
  }

  const [formData, setFormData] = useState(() => {
    const base = initialData || {};
    const checklist = base.conditionChecklist || {};
    const autoGrade = base.gradeAutoCalculated || 'A';
    const manualOverride = base.gradeManualOverride || false;
    const initialCondition = base.condition || (manualOverride ? base.condition : autoGrade);

    return {
      brand: base.brand || '',
      customBrand: base.customBrand || '',
      model: base.model || '',
      ram: base.ram || '',
      rom: base.rom || '',
      imei1: base.imei1 || '',
      imei2: base.imei2 || '',
      serialNumber: base.serialNumber || '',
      purchasePrice: base.purchasePrice || '',
      salePrice: base.salePrice || '',
      condition: initialCondition,
      conditionDetails: base.conditionDetails || {},
      notes: base.notes || '',
      photo1Url: base.photo1Url || base.frontImageUrl || '',
      photo2Url: base.photo2Url || base.backImageUrl || '',
      photo3Url: base.photo3Url || '',
      photo4Url: base.photo4Url || '',
      photo5Url: base.photo5Url || '',
      photo6Url: base.photo6Url || '',
      idCardFrontUrl: base.idCardFrontUrl || '',
      idCardBackUrl: base.idCardBackUrl || '',
      sellerCustomerId: base.sellerCustomerId || '',
      sellerName: base.sellerName || '',
      sellerPhone: base.sellerPhone || '',
      sellerAlternatePhone: base.sellerAlternatePhone || '',
      purchaseDate: base.purchaseDate || new Date().toISOString().split('T')[0],
      supplier: base.supplier || '',
      status: base.status || 'available',
      conditionChecklist: checklist,
      gradeAutoCalculated: autoGrade,
      gradeManualOverride: manualOverride
    };
  });
  const [loading, setLoading] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState({});
  const [error, setError] = useState('');

  const [customers, setCustomers] = useState([]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '', idType: 'Aadhaar', idNumber: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [labelAssigned, setLabelAssigned] = useState(false);
  const [assignedLabelNumber, setAssignedLabelNumber] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [localId, setLocalId] = useState(initialData?.id || null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [conditionChecklist, setConditionChecklist] = useState({});
  const [brandInitialized, setBrandInitialized] = useState(false);
  const [showPrinterSelector, setShowPrinterSelector] = useState(false);
  const [labelHTMLContent, setLabelHTMLContent] = useState('');
  const [labelEntry, setLabelEntry] = useState(null);
  const [wasRepaired, setWasRepaired] = useState(initialData?.wasRepaired || false);
  const [repairItems, setRepairItems] = useState(initialData?.repairItems || []);
  const [repairCost, setRepairCost] = useState(initialData?.repairCost || 0);

  const brandRef = useRef(null)
  const modelRef = useRef(null)
  const ramRef = useRef(null)
  const romRef = useRef(null)
  const purchasePriceRef = useRef(null)
  const salePriceRef = useRef(null)
  const imei1Ref = useRef(null)

  const [fieldErrors, setFieldErrors] = useState({})

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
    if (!formData.ram) {
      errors.ram = 'RAM is required'
      if (!firstErrorRef) firstErrorRef = ramRef
    }
    if (!formData.rom) {
      errors.rom = 'ROM / Storage is required'
      if (!firstErrorRef) firstErrorRef = romRef
    }
    if (!formData.purchasePrice) {
      errors.purchasePrice = 'Purchase price is required'
      if (!firstErrorRef) firstErrorRef = purchasePriceRef
    }
    if (!formData.salePrice) {
      errors.salePrice = 'Sale price is required'
      if (!firstErrorRef) firstErrorRef = salePriceRef
    }
    if (!formData.imei1) {
      errors.imei1 = 'IMEI 1 is required'
      if (!firstErrorRef) firstErrorRef = imei1Ref
    }

    setFieldErrors(errors)

    if (firstErrorRef?.current) {
      firstErrorRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
      firstErrorRef.current.focus()
    }

    return Object.keys(errors).length === 0
  }

  useEffect(() => {
    if (!formData.brand) return

    if (initialData?.conditionChecklist && !brandInitialized) {
      setConditionChecklist(initialData.conditionChecklist)
      setBrandInitialized(true)
      return
    }

    const { commonItems, specificItems } = getChecklistForBrand(formData.brand)
    const allItems = [...commonItems, ...specificItems]
    const newChecklist = {}
    allItems.forEach(item => {
      const key = item.label.replace(/\s+/g, '_').toLowerCase()
      newChecklist[key] = item.type === 'yes_no' ? 'No' : 'Working'
    })
    setConditionChecklist(newChecklist)
    setBrandInitialized(true)
  }, [formData.brand, deviceChecklist])

  useEffect(() => {
    const total = repairItems.reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
    setRepairCost(total)
  }, [repairItems])

  useEffect(() => {
    if (localId) {
      const checkLabel = async () => {
        const q = query(collection(db, 'label_registry'), where('referenceId', '==', localId), where('labelType', '==', 'second_hand'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setLabelAssigned(true);
          setAssignedLabelNumber(snap.docs[0].data().labelNumber);
        }
      };
      checkLabel();
    }
  }, [localId]);

  useEffect(() => {
    const fetchCustomers = async () => {
      const snap = await getDocs(collection(db, 'customers'));
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setCustomers(list);
    };
    fetchCustomers();
  }, []);

  const handleCustomerSelect = (c) => {
    setFormData(prev => ({
      ...prev,
      sellerCustomerId: c.id,
      sellerName: c.name || '',
      sellerPhone: c.phone || '',
      sellerAlternatePhone: c.alternatePhone || ''
    }));
  };

  const handleSaveNewCustomer = async () => {
    if (!newCust.name || !newCust.phone) return alert('Name and phone required');
    setSavingCustomer(true);
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        name: newCust.name,
        phone: newCust.phone,
        idType: newCust.idType,
        idNumber: newCust.idNumber
      });
      const c = { id: docRef.id, name: newCust.name, phone: newCust.phone, idType: newCust.idType, idNumber: newCust.idNumber };
      setCustomers(prev => [...prev, c]);
      handleCustomerSelect(c);
      setShowNewCustomer(false);
      setNewCust({ name: '', phone: '', idType: 'Aadhaar', idNumber: '' });
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingCustomer(false);
    }
  };

  const { brands: brandOptions = [], models: modelOptions = {}, ramOptions = [], romOptions = [] } = useSettings();
  const BRANDS = brandOptions;
  const MODELS = modelOptions;

  const handleUploadPhoto = async (file, fieldName) => {
    if (!file) return;

    setUploadingPhotos(prev => ({ ...prev, [fieldName]: true }));

    try {
      const url = await uploadImageToCloudinary(file);
      setFormData(prev => ({ ...prev, [fieldName]: url }));
    } catch (err) {
      console.error(err);
      setError('Image upload failed: ' + err.message);
    } finally {
      setUploadingPhotos(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  const removePhoto = (fieldName) => setFormData(prev => ({ ...prev, [fieldName]: '' }));

  const handleConditionChange = (conditionGrade) => {
    setFormData({
      ...formData,
      condition: conditionGrade,
      conditionDetails: {},
      gradeManualOverride: true
    });
  };

  const handleChecklistChange = (key, value) => {
    const newChecklist = { ...conditionChecklist, [key]: value };
    setConditionChecklist(newChecklist);
    const newGrade = calculateGrade(newChecklist, formData.brand);
    setFormData(prev => ({
      ...prev,
      conditionChecklist: newChecklist,
      condition: newGrade,
      gradeAutoCalculated: newGrade,
      gradeManualOverride: false
    }));
  };

  const addRepairItem = () => {
    setRepairItems(prev => [...prev, {
      description: '',
      isCustom: false,
      cost: '',
      technician: '',
      date: new Date().toISOString().split('T')[0]
    }])
  }

  const removeRepairItem = (index) => {
    setRepairItems(prev => prev.filter((_, i) => i !== index))
  }

  const updateRepairItem = (index, field, value) => {
    setRepairItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateAndScroll()) return;
    if (!formData.photo1Url) {
      setError("Photo 1 (Front) is required.");
      return;
    }
    setSaveStatus('saving');
    setError('');
    try {
      const purchasePrice = Number(formData.purchasePrice) || 0
      const salePrice = Number(formData.salePrice) || 0
      const totalCost = purchasePrice + (wasRepaired ? repairCost : 0)
      const profit = salePrice - totalCost
      const finalData = { ...formData, conditionChecklist, wasRepaired, repairItems: wasRepaired ? repairItems : [], repairCost: wasRepaired ? repairCost : 0, totalCost, profit, createdBy: currentUser.uid };
      if (finalData.brand === 'Other') {
        finalData.brand = finalData.customBrand;
      }
      delete finalData.customBrand;

      if (localId) {
        finalData.id = localId;
      }

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
    if (!formData.photo1Url) {
      setError("Photo 1 (Front) is required.");
      return;
    }
    setIsProcessing(true);
    setError('');
    try {
      const finalSerialNumber = formData.serialNumber || generateSerialNumber();
      setFormData(prev => ({ ...prev, serialNumber: finalSerialNumber }));

      const purchasePrice = Number(formData.purchasePrice) || 0
      const salePrice = Number(formData.salePrice) || 0
      const totalCost = purchasePrice + (wasRepaired ? repairCost : 0)
      const profit = salePrice - totalCost
      const finalData = { ...formData, conditionChecklist, serialNumber: finalSerialNumber, wasRepaired, repairItems: wasRepaired ? repairItems : [], repairCost: wasRepaired ? repairCost : 0, totalCost, profit, createdBy: currentUser.uid };
      if (finalData.brand === 'Other') {
        finalData.brand = finalData.customBrand;
      }
      delete finalData.customBrand;

      if (localId) {
        finalData.id = localId;
      }

      const savedDocId = await onSave(finalData);
      if (savedDocId) setLocalId(savedDocId);

      const nextLabel = await getLabelNumber();
      const labelData = {
        labelNumber: nextLabel,
        labelType: "second_hand",
        referenceId: savedDocId || localId,
        assignedBy: currentUser.uid,
        assignedAt: new Date().toISOString(),
        isActive: true,
        data: {
          brand: finalData.brand,
          model: finalData.model,
          ram: finalData.ram,
          rom: finalData.rom,
          grade: finalData.condition,
          imei1: finalData.imei1,
          imei2: finalData.imei2,
          serialNumber: finalSerialNumber,
          salePrice: finalData.salePrice,
          purchasePrice: finalData.purchasePrice,
          condition: finalData.condition,
          purchaseDate: finalData.purchaseDate,
          supplier: finalData.supplier,
          specialNotes: finalData.notes || '',
          status: "available",
          createdBy: currentUser.uid,
          createdAt: new Date().toISOString()
        }
      };

      await setDoc(doc(db, "label_registry", nextLabel.toString()), labelData);

      await updateDoc(doc(db, "second_hand_mobiles", savedDocId || localId), {
        assignedLabelNumber: nextLabel
      });

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
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssignLabel = async () => {
    if (!localId) return;
    setAssigning(true);
    try {
      const nextNum = await getLabelNumber();
      if (window.confirm(`Assign label #${nextNum} to this mobile?`)) {
        await addDoc(collection(db, 'label_registry'), {
          labelNumber: Number(nextNum),
          labelType: 'second_hand',
          referenceId: localId,
          assignedBy: currentUser.uid,
          assignedAt: new Date().toISOString(),
          isActive: true,
          data: { ...formData, serialNumber: formData.serialNumber || '' }
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

  const handlePrintLabel = () => {
    const labelData = {
      labelType: 'second_hand',
      labelNumber: labelAssigned ? assignedLabelNumber : null,
      data: {
        brand: formData.brand,
        model: formData.model,
        ram: formData.ram,
        rom: formData.rom,
        salePrice: formData.salePrice,
        imei1: formData.imei1,
        grade: formData.condition,
        serialNumber: formData.serialNumber || '',
      }
    }
    const html = generateLabelHTML(labelData)
    setLabelHTMLContent(html)
    setLabelEntry(labelData)
    setShowPrinterSelector(true)
  };

  const inputClass = "border border-[#e2e8f0] focus:border-[#002395] focus:ring-2 focus:ring-[#002395]/20 rounded-lg px-4 py-2.5 w-full outline-none transition text-[#0f172a] text-sm";
  const labelClass = "block text-sm font-medium text-[#0f172a] mb-1";

  const sectionHeaderClass = "border-l-4 border-[#002395] pl-3 text-[#002395] font-bold text-sm uppercase tracking-wide mb-4";

  const renderPhotoUpload = (label, fieldName, isRequired = false) => (
    <div>
      <label className={labelClass}>
        {label} {isRequired && <span className="text-[#ED2939]">*</span>}
      </label>
      {formData[fieldName] ? (
        <div className="relative rounded-xl overflow-hidden h-32 border border-[#e2e8f0]">
          <img src={formData[fieldName]} alt={label} className="h-full w-full object-cover" />
          <button type="button" onClick={() => removePhoto(fieldName)} className="absolute top-2 right-2 bg-[#ED2939] text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 shadow-md text-xs transition">
            <i className="fas fa-times"></i>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2 mt-1">
            <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-[#002395]/30 bg-[#002395]/5 rounded-xl h-28 cursor-pointer active:scale-95 transition">
              <i className="fas fa-camera text-[#002395] text-lg mb-0.5"></i>
              <span className="text-xs text-[#002395] font-medium">Camera</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => handleUploadPhoto(e.target.files[0], fieldName)}
                className="hidden"
              />
            </label>
            <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 bg-gray-50 rounded-xl h-28 cursor-pointer active:scale-95 transition">
              <i className="fas fa-images text-gray-500 text-lg mb-0.5"></i>
              <span className="text-xs text-gray-500 font-medium">Gallery</span>
              <input
                type="file"
                accept="image/*"
                onChange={e => handleUploadPhoto(e.target.files[0], fieldName)}
                className="hidden"
              />
            </label>
          </div>
          {uploadingPhotos[fieldName] && <span className="text-xs text-[#002395] font-bold">Uploading...</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
      <div className="bg-white w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90vh]">

        {/* Handle bar */}
        <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
        </div>

        {/* Fixed header */}
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100 bg-white rounded-t-3xl md:rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0f172a]">
              {initialData ? 'Edit Mobile' : 'Add Second-Hand Mobile'}
            </h2>
            <button type="button" onClick={onCancel} className="text-gray-400 p-1">
              <i className="fas fa-times text-lg"></i>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* SELLER DETAILS */}
          <div>
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              Seller Details
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <CustomerAutocomplete
                  customers={customers}
                  nameValue={formData.sellerName}
                  phoneValue={formData.sellerPhone}
                  alternatePhoneValue={formData.sellerAlternatePhone}
                  onNameChange={val => setFormData({ ...formData, sellerName: val })}
                  onPhoneChange={val => setFormData({ ...formData, sellerPhone: val })}
                  onAlternatePhoneChange={val => setFormData({ ...formData, sellerAlternatePhone: val })}
                  onSelectCustomer={handleCustomerSelect}
                />
                <div className="mt-2 text-sm flex items-center justify-between">
                  <span className="text-[#64748b]">Can't find the seller?</span>
                  <button type="button" onClick={() => setShowNewCustomer(!showNewCustomer)} className="text-[#002395] font-bold hover:underline">
                    {showNewCustomer ? 'Cancel Adding New' : '+ Add New Customer'}
                  </button>
                </div>
              </div>

              {showNewCustomer && (
                <div className="md:col-span-2 p-4 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Name <span className="text-[#ED2939]">*</span></label>
                    <input type="text" value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Phone <span className="text-[#ED2939]">*</span></label>
                    <input type="tel" inputMode="tel" pattern="[0-9]*" value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>ID Type</label>
                    <select value={newCust.idType} onChange={e => setNewCust({ ...newCust, idType: e.target.value })} className={inputClass}>
                      <option>Aadhaar</option>
                      <option>PAN</option>
                      <option>Driving License</option>
                      <option>Voter ID</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>ID Number</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={newCust.idNumber} onChange={e => setNewCust({ ...newCust, idNumber: e.target.value })} className={inputClass} />
                  </div>
                  <div className="md:col-span-2 flex justify-end mt-2">
                    <button type="button" onClick={handleSaveNewCustomer} disabled={savingCustomer} className="bg-[#002395] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#001a7a] transition disabled:opacity-50">
                      {savingCustomer ? 'Saving...' : 'Save & Select Customer'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* DEVICE DETAILS */}
          <div>
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              Device Details
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div ref={brandRef}>
                <label className={labelClass}>Brand <span className="text-[#ED2939]">*</span></label>
                <select required value={formData.brand} onChange={e => {
                  const selectedBrand = e.target.value
                  setFormData(prev => ({ ...prev, brand: selectedBrand, model: '' }))
                  setCustomModel('')
                  setIsCustomModel(false)
                  if (fieldErrors.brand) setFieldErrors(prev => ({...prev, brand: ''}))
                }} className={`${inputClass} ${fieldErrors.brand ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939] focus:ring-[#ED2939]/20' : ''}`}>
                  <option value="">Select Brand</option>
                  {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {formData.brand === 'Other' && (
                  <input type="text" placeholder="Enter Custom Brand" required value={formData.customBrand || ''} onChange={e => setFormData({ ...formData, customBrand: e.target.value })} className={`${inputClass} mt-3`} />
                )}
                {fieldErrors.brand && (
                  <p className="text-[#ED2939] text-xs mt-1">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {fieldErrors.brand}
                  </p>
                )}
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
                  className={`${inputClass} ${fieldErrors.model ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939] focus:ring-[#ED2939]/20' : ''}`}
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
                {fieldErrors.model && (
                  <p className="text-[#ED2939] text-xs mt-1">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {fieldErrors.model}
                  </p>
                )}
              </div>
              <div ref={ramRef}>
                <label className={labelClass}>RAM <span className="text-[#ED2939]">*</span></label>
                <select required value={formData.ram} onChange={e => {
                  setFormData({ ...formData, ram: e.target.value })
                  if (fieldErrors.ram) setFieldErrors(prev => ({...prev, ram: ''}))
                }} className={`${inputClass} ${fieldErrors.ram ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939] focus:ring-[#ED2939]/20' : ''}`}>
                  <option value="">Select RAM</option>
                  {ramOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {fieldErrors.ram && (
                  <p className="text-[#ED2939] text-xs mt-1">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {fieldErrors.ram}
                  </p>
                )}
              </div>
              <div ref={romRef}>
                <label className={labelClass}>ROM <span className="text-[#ED2939]">*</span></label>
                <select required value={formData.rom} onChange={e => {
                  setFormData({ ...formData, rom: e.target.value })
                  if (fieldErrors.rom) setFieldErrors(prev => ({...prev, rom: ''}))
                }} className={`${inputClass} ${fieldErrors.rom ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939] focus:ring-[#ED2939]/20' : ''}`}>
                  <option value="">Select ROM</option>
                  {romOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {fieldErrors.rom && (
                  <p className="text-[#ED2939] text-xs mt-1">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {fieldErrors.rom}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* PRICING */}
          <div>
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              Pricing &amp; Purchase Info
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div ref={purchasePriceRef}>
                <label className={labelClass}>Purchase Price <span className="text-[#ED2939]">*</span></label>
                <input type="number" inputMode="numeric" pattern="[0-9]*" required min="0" value={formData.purchasePrice} onChange={e => {
                  setFormData({ ...formData, purchasePrice: e.target.value })
                  if (fieldErrors.purchasePrice) setFieldErrors(prev => ({...prev, purchasePrice: ''}))
                }} className={`${inputClass} ${fieldErrors.purchasePrice ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939] focus:ring-[#ED2939]/20' : ''}`} />
                {fieldErrors.purchasePrice && (
                  <p className="text-[#ED2939] text-xs mt-1">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {fieldErrors.purchasePrice}
                  </p>
                )}
              </div>
              <div ref={salePriceRef}>
                <label className={labelClass}>Sale Price <span className="text-[#ED2939]">*</span></label>
                <input type="number" inputMode="numeric" pattern="[0-9]*" required min="0" value={formData.salePrice} onChange={e => {
                  setFormData({ ...formData, salePrice: e.target.value })
                  if (fieldErrors.salePrice) setFieldErrors(prev => ({...prev, salePrice: ''}))
                }} className={`${inputClass} ${fieldErrors.salePrice ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939] focus:ring-[#ED2939]/20' : ''}`} />
                {fieldErrors.salePrice && (
                  <p className="text-[#ED2939] text-xs mt-1">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {fieldErrors.salePrice}
                  </p>
                )}
              </div>
              <div className="md:col-span-2">
                <div className="bg-[#f8fafc] rounded-xl p-3 border border-gray-100 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Purchase Price</span>
                    <span>₹{Number(formData.purchasePrice) || 0}</span>
                  </div>
                  {wasRepaired && repairCost > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Repair Cost</span>
                      <span>₹{repairCost}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-semibold text-[#0f172a] border-t border-gray-200 pt-2">
                    <span>Total Cost</span>
                    <span>₹{(Number(formData.purchasePrice) || 0) + repairCost}</span>
                  </div>
                  {Number(formData.salePrice) > 0 && (
                    <div className={`flex justify-between text-sm font-bold border-t border-gray-200 pt-2 ${
                      (Number(formData.salePrice) - (Number(formData.purchasePrice) || 0) - repairCost) >= 0
                        ? 'text-green-600'
                        : 'text-[#ED2939]'
                    }`}>
                      <span>Profit</span>
                      <span>₹{Number(formData.salePrice) - (Number(formData.purchasePrice) || 0) - repairCost}</span>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className={labelClass}>Purchase Date <span className="text-[#ED2939]">*</span></label>
                <input type="date" required value={formData.purchaseDate} onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Supplier</label>
                <input type="text" value={formData.supplier} onChange={e => setFormData({ ...formData, supplier: e.target.value })} className={inputClass} />
              </div>
            </div>
          </div>

          {/* IMEI & SERIAL */}
          <div>
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              IMEI &amp; Serial
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div ref={imei1Ref}>
                <ImeiInput label="IMEI 1" value={formData.imei1} onChange={val => {
                  setFormData({ ...formData, imei1: val })
                  if (fieldErrors.imei1) setFieldErrors(prev => ({...prev, imei1: ''}))
                }} required={true} scannerId="scanner-secondhand-imei1" />
                {fieldErrors.imei1 && (
                  <p className="text-[#ED2939] text-xs mt-1">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {fieldErrors.imei1}
                  </p>
                )}
              </div>
              <div>
                <ImeiInput label="IMEI 2 (optional)" value={formData.imei2} onChange={val => setFormData({ ...formData, imei2: val })} scannerId="scanner-secondhand-imei2" />
              </div>
              <div>
                <label className={labelClass}>
                  Serial Number {formData.brand === 'Apple' && <span className="text-[#ED2939]">*</span>}
                </label>
                <input type="text" value={formData.serialNumber} onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} required={formData.brand === 'Apple'} placeholder="Enter serial number" className={inputClass} />
                {formData.brand === 'Apple' && (
                  <p className="text-xs text-[#002395] mt-1 font-semibold">Required for Apple devices</p>
                )}
              </div>
            </div>
          </div>

          {/* REPAIR & REFURBISHMENT */}
          <div>
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              Repair &amp; Refurbishment
            </p>
            <div className="bg-[#f8fafc] rounded-xl p-4 border border-gray-100 mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#0f172a]">Phone was repaired before sale</p>
                  <p className="text-xs text-gray-400">Add repair costs to calculate profit correctly</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWasRepaired(!wasRepaired)
                    if (wasRepaired) {
                      setRepairItems([])
                      setRepairCost(0)
                    }
                  }}
                  className={`relative inline-flex items-center flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                    wasRepaired ? 'bg-[#002395]' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 ${
                      wasRepaired ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
            {wasRepaired && (
              <div className="space-y-3">
                {repairItems.map((item, index) => (
                  <div key={index} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-[#002395]">Repair #{index + 1}</p>
                      <button
                        type="button"
                        onClick={() => removeRepairItem(index)}
                        className="text-[#ED2939] p-1"
                      >
                        <i className="fas fa-times text-sm"></i>
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Description <span className="text-[#ED2939]">*</span>
                        </label>
                        <select
                          value={item.isCustom ? '__custom__' : item.description}
                          onChange={e => {
                            if (e.target.value === '__custom__') {
                              updateRepairItem(index, 'description', '')
                              updateRepairItem(index, 'isCustom', true)
                            } else {
                              updateRepairItem(index, 'description', e.target.value)
                              updateRepairItem(index, 'isCustom', false)
                            }
                          }}
                          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395] bg-white"
                        >
                          <option value="">Select repair type</option>
                          {complaintTypes.map((type, i) => (
                            <option key={i} value={type}>{type}</option>
                          ))}
                          <option value="__custom__">Other (type manually)</option>
                        </select>
                        {item.isCustom && (
                          <input
                            type="text"
                            value={item.description}
                            onChange={e => updateRepairItem(index, 'description', e.target.value)}
                            placeholder="Describe the repair"
                            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395] mt-2"
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Cost (₹)</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min="0"
                            value={item.cost}
                            onChange={e => updateRepairItem(index, 'cost', e.target.value)}
                            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                          <input
                            type="date"
                            value={item.date}
                            onChange={e => updateRepairItem(index, 'date', e.target.value)}
                            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Technician</label>
                        <input
                          type="text"
                          value={item.technician}
                          onChange={e => updateRepairItem(index, 'technician', e.target.value)}
                          placeholder="Who did the repair"
                          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addRepairItem}
                  className="w-full border-2 border-dashed border-[#002395]/30 text-[#002395] rounded-xl py-2.5 text-sm font-semibold"
                >
                  <i className="fas fa-plus mr-2"></i>Add Repair Item
                </button>
                {repairItems.length > 0 && (
                  <div className="bg-[#002395]/5 rounded-xl p-3 border border-[#002395]/20">
                    <div className="flex justify-between text-sm font-semibold text-[#002395]">
                      <span>Total Repair Cost</span>
                      <span>₹{repairCost}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CONDITION & GRADE */}
          <div>
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              Condition &amp; Grade
            </p>
            <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 md:p-6 mb-4">
              <div className="space-y-4">
                {!formData.brand ? (
                  <div className="text-center py-4 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-400">Select a brand to see condition checklist</p>
                  </div>
                ) : (
                  <>
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
                      formData.brand?.toLowerCase() === 'apple'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-green-50 text-green-700'
                    }`}>
                      <i className={`fab ${formData.brand?.toLowerCase() === 'apple' ? 'fa-apple' : 'fa-android'} text-lg`}></i>
                      <p className="text-sm font-semibold">
                        {formData.brand?.toLowerCase() === 'apple' ? 'iPhone Checklist' : 'Android Checklist'}
                      </p>
                    </div>

                    {(() => {
                      const groupedCommon = groupByCategory(deviceChecklist.common || [])
                      return Object.keys(groupedCommon).length > 0 && (
                        <div className="space-y-4">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-1">
                            Common Checks
                          </p>
                          {Object.entries(groupedCommon).map(([category, items]) => (
                            <div key={category} className="space-y-2">
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide pl-1">
                                {category}
                              </p>
                              <div className="space-y-2 pl-2">
                                {items.map((item, idx) => {
                                  const key = item.label.replace(/\s+/g, '_').toLowerCase()
                                  const value = conditionChecklist[key]
                                  return (
                                    <div key={idx} className="flex items-center justify-between py-1.5 border-b border-gray-50/50">
                                      <span className="text-sm text-[#0f172a] flex-1 pr-3">{item.label}</span>
                                      {item.type === 'working_notworking' ? (
                                        <div className="flex gap-2 flex-shrink-0">
                                          <button type="button"
                                            onClick={() => handleChecklistChange(key, 'Working')}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                                              value === 'Working' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                                            }`}>Working</button>
                                          <button type="button"
                                            onClick={() => handleChecklistChange(key, 'Not Working')}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                                              value === 'Not Working' ? 'bg-[#ED2939] text-white' : 'bg-gray-100 text-gray-500'
                                            }`}>Not Working</button>
                                        </div>
                                      ) : (
                                        <div className="flex gap-2 flex-shrink-0">
                                          <button type="button"
                                            onClick={() => handleChecklistChange(key, 'Yes')}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                                              value === 'Yes' ? 'bg-[#ED2939] text-white' : 'bg-gray-100 text-gray-500'
                                            }`}>Yes</button>
                                          <button type="button"
                                            onClick={() => handleChecklistChange(key, 'No')}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                                              value === 'No' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                                            }`}>No</button>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {(() => {
                      const isApple = formData.brand?.toLowerCase() === 'apple'
                      const specificItems = isApple
                        ? (deviceChecklist.iphone || [])
                        : (deviceChecklist.android || [])
                      const groupedSpecific = groupByCategory(specificItems)
                      return Object.keys(groupedSpecific).length > 0 ? (
                        <div className="space-y-4 mt-4">
                          <p className="text-xs font-bold text-[#002395] uppercase tracking-wide border-b border-gray-100 pb-1">
                            {isApple ? 'iPhone Specific Checks' : 'Android Specific Checks'}
                          </p>
                          {Object.entries(groupedSpecific).map(([category, items]) => (
                            <div key={category} className="space-y-2">
                              <p className="text-xs font-bold text-[#002395]/70 uppercase tracking-wide pl-1">
                                {category}
                              </p>
                              <div className="space-y-2 pl-2">
                                {items.map((item, idx) => {
                                  const key = item.label.replace(/\s+/g, '_').toLowerCase()
                                  const value = conditionChecklist[key]
                                  return (
                                    <div key={idx} className="flex items-center justify-between py-1.5 border-b border-gray-50/50">
                                      <span className="text-sm text-[#0f172a] flex-1 pr-3">{item.label}</span>
                                      {item.type === 'working_notworking' ? (
                                        <div className="flex gap-2 flex-shrink-0">
                                          <button type="button"
                                            onClick={() => handleChecklistChange(key, 'Working')}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                                              value === 'Working' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                                            }`}>Working</button>
                                          <button type="button"
                                            onClick={() => handleChecklistChange(key, 'Not Working')}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                                              value === 'Not Working' ? 'bg-[#ED2939] text-white' : 'bg-gray-100 text-gray-500'
                                            }`}>Not Working</button>
                                        </div>
                                      ) : (
                                        <div className="flex gap-2 flex-shrink-0">
                                          <button type="button"
                                            onClick={() => handleChecklistChange(key, 'Yes')}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                                              value === 'Yes' ? 'bg-[#ED2939] text-white' : 'bg-gray-100 text-gray-500'
                                            }`}>Yes</button>
                                          <button type="button"
                                            onClick={() => handleChecklistChange(key, 'No')}
                                            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                                              value === 'No' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                                            }`}>No</button>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null
                    })()}
                  </>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label className={labelClass}>Final Grade Assignment</label>
              <div className="grid grid-cols-4 gap-2 md:gap-4 mt-2">
                {['A', 'B', 'C', 'D'].map(grade => (
                  <button key={grade} type="button" onClick={() => handleConditionChange(grade)}
                    className={`py-3 rounded-xl font-bold text-center border-2 transition ${formData.condition === grade
                      ? grade === 'A' ? 'bg-green-500 border-green-500 text-white' :
                        grade === 'B' ? 'bg-blue-500 border-blue-500 text-white' :
                        grade === 'C' ? 'bg-orange-500 border-orange-500 text-white' :
                        'bg-[#ED2939] border-[#ED2939] text-white'
                      : 'bg-white border-[#e2e8f0] text-[#64748b] hover:border-[#002395]'
                    }`}>
                    Grade {grade}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#64748b] mt-2 font-medium">
                {formData.gradeManualOverride ? '* Grade was manually overridden' : '* Grade auto-calculated from checklist'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {formData.condition === 'A' && (
                <>
                  <div><label className={labelClass}>Warranty Expiry</label><input type="date" value={formData.conditionDetails.warrantyExpiry || ''} onChange={e => setFormData({ ...formData, conditionDetails: { ...formData.conditionDetails, warrantyExpiry: e.target.value } })} className={inputClass} /></div>
                  <div><label className={labelClass}>Accessories Included</label><input type="text" value={formData.conditionDetails.accessories || ''} onChange={e => setFormData({ ...formData, conditionDetails: { ...formData.conditionDetails, accessories: e.target.value } })} className={inputClass} /></div>
                </>
              )}
              {formData.condition === 'B' && (
                <div className="md:col-span-2"><label className={labelClass}>Description of Wear</label><textarea required value={formData.conditionDetails.wearDescription || ''} onChange={e => setFormData({ ...formData, conditionDetails: { ...formData.conditionDetails, wearDescription: e.target.value } })} className={inputClass}></textarea></div>
              )}
              {formData.condition === 'C' && (
                <div className="md:col-span-2"><label className={labelClass}>Description of Condition</label><textarea required value={formData.conditionDetails.conditionDescription || ''} onChange={e => setFormData({ ...formData, conditionDetails: { ...formData.conditionDetails, conditionDescription: e.target.value } })} className={inputClass}></textarea></div>
              )}
              {formData.condition === 'D' && (
                <div className="md:col-span-2"><label className={labelClass}>Description of Damage</label><textarea required value={formData.conditionDetails.damageDescription || ''} onChange={e => setFormData({ ...formData, conditionDetails: { ...formData.conditionDetails, damageDescription: e.target.value } })} className={inputClass}></textarea></div>
              )}
              <div className="md:col-span-2">
                <label className={labelClass}>Special features / notes</label>
                <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className={inputClass} rows="2"></textarea>
              </div>
            </div>
          </div>

          {/* PHOTOS */}
          <div>
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
              Photos
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {renderPhotoUpload('Front View', 'photo1Url', true)}
              {renderPhotoUpload('Back View', 'photo2Url')}
              {renderPhotoUpload('Left Side', 'photo3Url')}
              {renderPhotoUpload('Right Side', 'photo4Url')}
              {renderPhotoUpload('Top/Bottom', 'photo5Url')}
              {renderPhotoUpload('Additional', 'photo6Url')}
            </div>
            <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3 mt-6">
              ID Card Photos
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {renderPhotoUpload('ID Card Front', 'idCardFrontUrl')}
              {renderPhotoUpload('ID Card Back', 'idCardBackUrl')}
            </div>
          </div>

        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white space-y-2">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold"
            >
              {saveStatus === 'saved' || labelAssigned ? 'Done' : 'Cancel'}
            </button>
            {saveStatus === 'saved' ? (
              <button type="button" disabled className="flex-1 bg-green-600 text-white rounded-xl py-2.5 text-sm font-semibold opacity-50 cursor-not-allowed">
                Saved <i className="fas fa-check ml-1"></i>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saveStatus === 'saving' || Object.values(uploadingPhotos).some(v => v)}
                className="flex-1 bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saveStatus === 'saving' ? 'Saving...' : initialData ? 'Save Changes' : 'Add Mobile'}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSaveAndPrint}
            disabled={isProcessing || saveStatus.includes('Assigned ✓')}
            className="w-full bg-green-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {isProcessing ? (
              <span><i className="fas fa-spinner fa-spin mr-2"></i>Processing...</span>
            ) : saveStatus.includes('Assigned ✓') ? (
              <span>Done ✓</span>
            ) : (
              <span><i className="fas fa-print mr-2"></i>Save &amp; Print Label</span>
            )}
          </button>
        </div>

        <PrinterSelector
          isOpen={showPrinterSelector}
          onClose={() => setShowPrinterSelector(false)}
          htmlContent={labelHTMLContent}
          labelEntry={labelEntry}
          title="Print Label"
        />

      </div>
    </div>
  );
};

export default SecondHandForm;
