import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, query, where, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/shared/firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import CustomerAutocomplete from '../../components/common/CustomerAutocomplete';
import ImeiInput from '@/shared/components/ImeiInput';
import { getLabelNumber } from '@/features/labels/data';
import { generateLabelHTML } from '@/features/labels/printing/printLabel';
import PrinterSelector from '@/features/labels/printing/PrinterSelector';
import { uploadImageToCloudinary } from '@/shared/lib/uploadImage';
import { generateSecondHandPurchaseForm } from '../../utils/generateSecondHandPurchaseForm';
import SignaturePad from '../../components/common/SignaturePad';
import ComboBox from '@/shared/ui/ComboBox';
import { useSheetDismiss } from '@/shared/ui/useSheetDismiss';
import { readDraft, writeDraft, clearDraft } from '@/shared/lib/formDraft';
import { imageThumb } from '@/shared/lib/imageUrl';
import { loadCustomers, rememberCustomer } from '../../utils/customerCache';
import { recordTacIfNew } from '@/features/labels/tacLookup';
import { secondHandLabelData } from '@/features/labels/data';

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

/* ─────────────────────────────────────────────
   PRESENTATION HELPERS
   Layout only - all behaviour stays in the component below.
────────────────────────────────────────────── */
const Section = ({ icon, title, hint, children }) => (
  <section className="bg-white rounded-2xl p-4 shadow-sm">
    <div className="flex items-start gap-2.5 mb-3">
      <span className="w-8 h-8 rounded-xl bg-[#002395]/10 text-[#002395] flex items-center justify-center shrink-0">
        <i className={`fas ${icon} text-sm`}></i>
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-[#0f172a] leading-tight">{title}</h3>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
    </div>
    {children}
  </section>
);

const FieldError = ({ message }) =>
  message ? (
    <p className="text-[#ED2939] text-xs mt-1.5">
      <i className="fas fa-exclamation-circle mr-1"></i>
      {message}
    </p>
  ) : null;

/* One checklist question as a segmented control - easier to hit than two
   separate buttons, and it reads as a single choice. */
const ChecklistRow = ({ item, value, onChange }) => {
  const key = item.label.replace(/\s+/g, '_').toLowerCase();
  const options =
    item.type === 'working_notworking'
      ? [{ v: 'Working', label: 'Working', good: true }, { v: 'Not Working', label: 'Not working', good: false }]
      : [{ v: 'Yes', label: 'Yes', good: false }, { v: 'No', label: 'No', good: true }];

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-[#0f172a] flex-1 min-w-0">{item.label}</span>
      <div className="flex bg-gray-100 rounded-xl p-0.5 shrink-0">
        {options.map(o => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(key, o.v)}
            className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold whitespace-nowrap transition ${
              value === o.v
                ? o.good
                  ? 'bg-green-500 text-white shadow-sm'
                  : 'bg-[#ED2939] text-white shadow-sm'
                : 'text-gray-500'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const ChecklistGroup = ({ title, accent, grouped, checklist, onChange }) => (
  <div className="space-y-3">
    <p className={`text-xs font-bold uppercase tracking-wide ${accent}`}>{title}</p>
    {Object.entries(grouped).map(([category, items]) => (
      <div key={category} className="bg-gray-50/70 rounded-xl px-3 py-1">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide pt-2">{category}</p>
        {items.map((item, idx) => (
          <ChecklistRow
            key={idx}
            item={item}
            value={checklist[item.label.replace(/\s+/g, '_').toLowerCase()]}
            onChange={onChange}
          />
        ))}
      </div>
    ))}
  </div>
);

const GRADE_META = {
  A: { label: 'Like new', on: 'bg-green-500 border-green-500' },
  B: { label: 'Light wear', on: 'bg-blue-500 border-blue-500' },
  C: { label: 'Heavy wear', on: 'bg-orange-500 border-orange-500' },
  D: { label: 'Damaged', on: 'bg-[#ED2939] border-[#ED2939]' },
};

const SecondHandForm = ({ initialData, prefillData, onSave, onCancel }) => {
  /* One draft per form. Editing an existing device keeps its own, so an
     interrupted edit cannot leak into a new purchase. */
  const draftKey = `second-hand:${initialData?.id || 'new'}`;
  const { currentUser } = useAuth();
  const {
    deviceChecklist, complaintTypes, shopDetails, purchaseTerms,
    brands: brandOptions = [], models: modelOptions = {},
    ramOptions = [], romOptions = [], fieldOptions = {}, rememberOptions
  } = useSettings();
  const MODELS = modelOptions;

  /* The grab handle at the top of this sheet announced that it could be pulled
     down; until now only Cancel actually closed it. */
  /* Pulling the sheet down might be a slip, so it keeps the draft. The X is a
     decision, so it throws the draft away - see discardAndClose below. */
  const { sheetProps, handleProps, scrollRef } = useSheetDismiss({ onDismiss: onCancel });

  const discardAndClose = () => {
    clearDraft(draftKey);
    onCancel();
  };

  const startFresh = () => {
    clearDraft(draftKey);
    setRestoredDraft(false);
    setFormData(buildFreshForm());
    setSignatureData(initialData?.sellerSignatureUrl || '');
    setFieldErrors({});
    setError('');
    scrollRef.current?.scrollTo({ top: 0 });
  };

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

  /* The form as it opens, with nothing typed. Named so that "Start empty" can
     reset to exactly the same thing the form would have shown on a first open,
     rather than closing and asking the person to come back in. */
  const buildFreshForm = () => {
    const base = initialData || {};
    const checklist = base.conditionChecklist || {};
    const autoGrade = base.gradeAutoCalculated || 'A';
    const manualOverride = base.gradeManualOverride || false;
    const initialCondition = base.condition || (manualOverride ? base.condition : autoGrade);

    const fresh = {
      brand: initialData ? (base.brand || '') : prefillBrand,
      customBrand: initialData ? (base.customBrand || '') : '',
      model: initialData ? (base.model || '') : (prefillModelMatch || prefillData?.model || ''),
      ram: base.ram || '',
      rom: base.rom || '',
      imei1: initialData ? (base.imei1 || '') : (prefillData?.imei1 || ''),
      imei2: initialData ? (base.imei2 || '') : (prefillData?.imei2 || ''),
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
      gradeManualOverride: manualOverride,
      sellerSignatureUrl: base.sellerSignatureUrl || '',
      sellerIdVerified: base.sellerIdVerified || false,
      agreementAcceptedAt: base.agreementAcceptedAt || ''
    };

    return fresh;
  };

  const [formData, setFormData] = useState(() => {
    /* Anything typed before the form was closed wins, except over a device the
       scanner just handed us - that is a fresh intake, not the old draft. */
    const draft = prefillData ? null : readDraft(`second-hand:${initialData?.id || 'new'}`);
    const fresh = buildFreshForm();
    return draft ? { ...fresh, ...draft } : fresh;
  });

  const [restoredDraft, setRestoredDraft] = useState(
    () => !prefillData && Boolean(readDraft(`second-hand:${initialData?.id || 'new'}`)),
  );

  /* Keep what has been typed, as it is typed. Declared below formData: the
     dependency array is read during render, so referencing it any earlier
     throws before the form can draw. */
  useEffect(() => { writeDraft(draftKey, formData); }, [draftKey, formData]);

  // Signature is held as a data URL until save, then uploaded like any other image
  const [signatureData, setSignatureData] = useState(initialData?.sellerSignatureUrl || '');
  const agreementRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState({});
  const [error, setError] = useState('');

  const [customers, setCustomers] = useState([]);
  /* No "new customer" mode. Typing a name nobody matches simply means a new
     seller, created when the purchase is saved - the same rule the brand and
     model fields follow. */
  const [sellerIdType, setSellerIdType] = useState(initialData?.sellerIdType || 'Aadhaar');
  const [sellerIdNumber, setSellerIdNumber] = useState(initialData?.sellerIdNumber || '');
  const [labelAssigned, setLabelAssigned] = useState(false);
  const [assignedLabelNumber, setAssignedLabelNumber] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [localId, setLocalId] = useState(initialData?.id || null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [isProcessing, setIsProcessing] = useState(false);
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
    // A device must not enter stock without the seller's signed agreement
    if (!initialData) {
      if (!formData.sellerIdVerified) {
        errors.agreement = 'Confirm you checked the seller\'s original photo ID'
        if (!firstErrorRef) firstErrorRef = agreementRef
      } else if (!signatureData) {
        errors.agreement = 'The seller must sign before the device can be taken in'
        if (!firstErrorRef) firstErrorRef = agreementRef
      }
    } else if (initialData.sellerSignatureUrl && !signatureData) {
      // Editing must never quietly strip a signature the seller already gave -
      // it is the evidence that they agreed to the sale
      errors.agreement = 'This purchase already has the seller\'s signature. Sign again before saving, or cancel to keep the one on file.'
      if (!firstErrorRef) firstErrorRef = agreementRef
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
      setCustomers(await loadCustomers());
    };
    fetchCustomers();
  }, []);

  const handleCustomerSelect = (c) => {
    if (c.idType) setSellerIdType(c.idType);
    if (c.idNumber) setSellerIdNumber(c.idNumber);
    setFormData(prev => ({
      ...prev,
      sellerCustomerId: c.id,
      sellerName: c.name || '',
      sellerPhone: c.phone || '',
      sellerAlternatePhone: c.alternatePhone || ''
    }));
  };

  /**
   * The seller, as a customer record. Called from the save path: if the name
   * typed matched nobody, that person is new and is created now. Previously
   * this only happened if you first noticed the autocomplete had no match and
   * then went looking for a "New Customer" button - so a seller typed straight
   * into the field was never recorded as a customer at all.
   */
  const ensureSellerCustomer = async () => {
    if (formData.sellerCustomerId) return formData.sellerCustomerId;
    const name = (formData.sellerName || '').trim();
    const phone = (formData.sellerPhone || '').trim();
    if (!name || !phone) return '';

    const now = new Date().toISOString();
    const record = {
      name,
      phone,
      idType: sellerIdType,
      idNumber: sellerIdNumber,
      // Without these the customer never reaches the other phones, which
      // pull changes by updatedAt.
      createdAt: now,
      updatedAt: now,
    };
    try {
      const docRef = await addDoc(collection(db, 'customers'), record);
      const c = { id: docRef.id, ...record };
      rememberCustomer(c);
      setCustomers(prev => [...prev, c]);
      return docRef.id;
    } catch (err) {
      /* Recording the seller must never cost the shop the purchase it just
         took in. The mobile still saves with the name and phone on it. */
      console.error('Could not save the seller as a customer:', err);
      return '';
    }
  };

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

  /** Signature is drawn as a data URL; store it like any other image. */
  const uploadSignature = async () => {
    if (!signatureData || signatureData.startsWith('http')) return signatureData;
    const blob = await (await fetch(signatureData)).blob();
    const file = new File([blob], 'seller-signature.png', { type: 'image/png' });
    return uploadImageToCloudinary(file);
  };

  /**
   * Write the purchase, and hand back what was written.
   * Returns null when validation stopped it or the write failed - in both
   * cases the reason is already on screen.
   */
  const saveMobile = async () => {
    if (!validateAndScroll()) return null;
    if (!formData.photo1Url) {
      setError("Photo 1 (Front) is required.");
      return null;
    }
    setSaveStatus('saving');
    setError('');
    try {
      const sellerSignatureUrl = await uploadSignature();
      const sellerCustomerId = await ensureSellerCustomer();
      const purchasePrice = Number(formData.purchasePrice) || 0
      const salePrice = Number(formData.salePrice) || 0
      const totalCost = purchasePrice + (wasRepaired ? repairCost : 0)
      const profit = salePrice - totalCost
      const finalData = { ...formData, conditionChecklist, wasRepaired, repairItems: wasRepaired ? repairItems : [], repairCost: wasRepaired ? repairCost : 0, totalCost, profit, createdBy: currentUser.uid, sellerSignatureUrl, sellerCustomerId, sellerIdType, sellerIdNumber, agreementAcceptedAt: formData.agreementAcceptedAt || new Date().toISOString() };
      delete finalData.customBrand;

      // Only on the very first write - a second save is not a new device.
      if (!initialData && !localId) {
        recordTacIfNew(finalData.imei1, finalData.brand, finalData.model, currentUser?.uid);
      }

      if (localId) {
        finalData.id = localId;
      }

      const newId = await onSave(finalData);
      setFormData(prev => ({ ...prev, sellerSignatureUrl, sellerCustomerId }));
      clearDraft(draftKey);
      if (newId) setLocalId(newId);
      setSaveStatus('saved');
      await rememberOptions({
        brands: finalData.brand,
        models: { [finalData.brand]: finalData.model },
        field_options: { supplier: finalData.supplier },
      });
      return { ...finalData, id: newId || localId };
    } catch (err) {
      setError(err.message);
      setSaveStatus('idle');
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await saveMobile();
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
      const sellerSignatureUrl = await uploadSignature();
      const sellerCustomerId = await ensureSellerCustomer();
      const finalData = { ...formData, conditionChecklist, serialNumber: finalSerialNumber, wasRepaired, repairItems: wasRepaired ? repairItems : [], repairCost: wasRepaired ? repairCost : 0, totalCost, profit, createdBy: currentUser.uid, sellerSignatureUrl, sellerCustomerId, sellerIdType, sellerIdNumber, agreementAcceptedAt: formData.agreementAcceptedAt || new Date().toISOString() };
      delete finalData.customBrand;

      if (!initialData) {
        recordTacIfNew(finalData.imei1, finalData.brand, finalData.model, currentUser?.uid);
      }

      if (localId) {
        finalData.id = localId;
      }

      const savedDocId = await onSave(finalData);
      setFormData(prev => ({ ...prev, sellerSignatureUrl, sellerCustomerId }));
      clearDraft(draftKey);
      if (savedDocId) setLocalId(savedDocId);
      await rememberOptions({
        brands: finalData.brand,
        models: { [finalData.brand]: finalData.model },
        field_options: { supplier: finalData.supplier },
      });

      const nextLabel = await getLabelNumber();
      const labelData = {
        labelNumber: nextLabel,
        labelType: "second_hand",
        referenceId: savedDocId || localId,
        assignedBy: currentUser.uid,
        assignedAt: new Date().toISOString(),
        isActive: true,
        data: {
          ...secondHandLabelData({ ...finalData, serialNumber: finalSerialNumber }),
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

  // Printed at the counter so the seller signs it while handing the device over
  /* Printing saves first. The declaration describes a purchase, so it should
     never describe one the shop has no record of - and the seller's signature
     is only a drawing in the browser until a save uploads it. A signature is
     not required: a declaration printed to be signed on paper is a normal way
     to work. */
  const handlePrintPurchaseForm = async () => {
    const saved = await saveMobile();
    if (!saved) return;

    const seller = customers.find(c => c.id === saved.sellerCustomerId) || {
      name: saved.sellerName,
      phone: saved.sellerPhone,
      idType: sellerIdType,
      idNumber: sellerIdNumber,
    };
    const html = generateSecondHandPurchaseForm(
      { ...saved, assignedLabelNumber: labelAssigned ? assignedLabelNumber : null },
      shopDetails,
      seller,
      currentUser?.displayName || '',
    );
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('Your browser blocked the print window. Allow pop-ups for this site and try again.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
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


  const inputClass = "border border-[#e2e8f0] focus:border-[#002395] focus:ring-2 focus:ring-[#002395]/20 rounded-xl px-4 py-3 w-full outline-none transition text-[#0f172a] text-sm bg-white";
  const labelClass = "block text-xs font-semibold text-[#64748b] mb-1.5";
  const errorInput = "border-[#ED2939] bg-red-50 focus:border-[#ED2939] focus:ring-[#ED2939]/20";

  const renderPhotoUpload = (label, fieldName, isRequired = false) => (
    <div>
      <p className="text-[11px] font-semibold text-[#64748b] mb-1.5 truncate">
        {label} {isRequired && <span className="text-[#ED2939]">*</span>}
      </p>
      {formData[fieldName] ? (
        <div className="relative rounded-xl overflow-hidden aspect-square border border-[#e2e8f0]">
          <img src={imageThumb(formData[fieldName], 120)} alt={label} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => removePhoto(fieldName)}
            className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs"
            aria-label={`Remove ${label}`}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      ) : uploadingPhotos[fieldName] ? (
        <div className="aspect-square rounded-xl border-2 border-dashed border-[#002395]/30 bg-[#002395]/5 flex flex-col items-center justify-center">
          <i className="fas fa-circle-notch fa-spin text-[#002395]"></i>
          <span className="text-[10px] text-[#002395] font-bold mt-1.5">Uploading</span>
        </div>
      ) : (
        /* Camera fills the tile (the common case in the shop); gallery is the corner chip */
        <div className="relative aspect-square">
          <label className="absolute inset-0 flex flex-col items-center justify-center border-2 border-dashed border-[#002395]/30 bg-[#002395]/5 rounded-xl cursor-pointer">
            <i className="fas fa-camera text-[#002395] text-lg"></i>
            <span className="text-[10px] text-[#002395] font-bold mt-1">Camera</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => handleUploadPhoto(e.target.files[0], fieldName)}
              className="hidden"
            />
          </label>
          <label className="absolute bottom-1.5 right-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1 text-[10px] font-bold text-gray-500 cursor-pointer shadow-sm">
            <i className="fas fa-images"></i>
            <input
              type="file"
              accept="image/*"
              onChange={e => handleUploadPhoto(e.target.files[0], fieldName)}
              className="hidden"
            />
          </label>
        </div>
      )}
    </div>
  );

  const purchasePriceNum = Number(formData.purchasePrice) || 0;
  const salePriceNum = Number(formData.salePrice) || 0;
  const previewProfit = salePriceNum - purchasePriceNum - repairCost;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
      <div
        {...sheetProps}
        className="bg-[#f1f5f9] w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col h-[94dvh] md:h-auto md:max-h-[90vh] overflow-hidden"
      >

        {/* Grab handle - drag it down to close */}
        <div
          {...handleProps}
          className="md:hidden flex justify-center pt-2.5 pb-2 flex-shrink-0 bg-white"
          aria-label="Drag down to close"
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-2 pb-3 bg-white border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-[#0f172a] truncate">
                {initialData ? 'Edit Mobile' : 'Add Second-Hand Mobile'}
              </h2>
              <p className="text-xs text-gray-400">
                {formData.brand && formData.model
                  ? `${formData.brand} ${formData.model}`
                  : 'Fill the device details below'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {formData.condition && (
                <span className={`w-9 h-9 rounded-xl text-white text-sm font-bold flex items-center justify-center ${GRADE_META[formData.condition]?.on || 'bg-gray-400'}`}>
                  {formData.condition}
                </span>
              )}
              <button
                type="button"
                onClick={discardAndClose}
                className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 active:bg-gray-100"
                aria-label="Close"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
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
                  This form still had your unsaved details from last time.
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
          <Section icon="fa-mobile-alt" title="Device" hint="Brand, model and memory">
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

              <div className="grid grid-cols-2 gap-3">
                <div ref={ramRef}>
                  <label className={labelClass}>RAM <span className="text-[#ED2939]">*</span></label>
                  <ComboBox
                    required
                    value={formData.ram}
                    options={ramOptions}
                    placeholder="Select or type"
                    error={fieldErrors.ram}
                    onChange={v => {
                      setFormData(prev => ({ ...prev, ram: v }))
                      if (fieldErrors.ram) setFieldErrors(prev => ({...prev, ram: ''}))
                    }}
                  />
                </div>
                <div ref={romRef}>
                  <label className={labelClass}>ROM <span className="text-[#ED2939]">*</span></label>
                  <ComboBox
                    required
                    value={formData.rom}
                    options={romOptions}
                    placeholder="Select or type"
                    error={fieldErrors.rom}
                    onChange={v => {
                      setFormData(prev => ({ ...prev, rom: v }))
                      if (fieldErrors.rom) setFieldErrors(prev => ({...prev, rom: ''}))
                    }}
                  />
                </div>
              </div>
            </div>
          </Section>

          {/* ── IMEI & SERIAL ── */}
          <Section icon="fa-barcode" title="IMEI & Serial" hint="Scan or type the device numbers">
            <div className="space-y-3">
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
                  required={true}
                  scannerId="scanner-secondhand-imei1"
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
                  scannerId="scanner-secondhand-imei2"
                />
              </div>
              <div>
                <label className={labelClass}>
                  Serial Number {formData.brand === 'Apple' && <span className="text-[#ED2939]">*</span>}
                </label>
                <input type="text" value={formData.serialNumber} onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} required={formData.brand === 'Apple'} placeholder="Enter serial number" className={inputClass} />
                {formData.brand === 'Apple' && (
                  <p className="text-xs text-[#002395] mt-1.5 font-semibold">Required for Apple devices</p>
                )}
              </div>
            </div>
          </Section>

          {/* ── PRICING ── */}
          <Section icon="fa-indian-rupee-sign" title="Pricing" hint="What you paid and what you'll sell for">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div ref={purchasePriceRef}>
                  <label className={labelClass}>Purchase Price <span className="text-[#ED2939]">*</span></label>
                  <input type="number" inputMode="numeric" pattern="[0-9]*" required min="0" value={formData.purchasePrice} onChange={e => {
                    setFormData({ ...formData, purchasePrice: e.target.value })
                    if (fieldErrors.purchasePrice) setFieldErrors(prev => ({...prev, purchasePrice: ''}))
                  }} className={`${inputClass} ${fieldErrors.purchasePrice ? errorInput : ''}`} />
                  <FieldError message={fieldErrors.purchasePrice} />
                </div>
                <div ref={salePriceRef}>
                  <label className={labelClass}>Sale Price <span className="text-[#ED2939]">*</span></label>
                  <input type="number" inputMode="numeric" pattern="[0-9]*" required min="0" value={formData.salePrice} onChange={e => {
                    setFormData({ ...formData, salePrice: e.target.value })
                    if (fieldErrors.salePrice) setFieldErrors(prev => ({...prev, salePrice: ''}))
                  }} className={`${inputClass} ${fieldErrors.salePrice ? errorInput : ''}`} />
                  <FieldError message={fieldErrors.salePrice} />
                </div>
              </div>

              {/* Live margin, so the shop sees the profit before saving */}
              <div className="bg-[#f8fafc] rounded-xl p-3 border border-gray-100 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Purchase Price</span>
                  <span>₹{purchasePriceNum}</span>
                </div>
                {wasRepaired && repairCost > 0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Repair Cost</span>
                    <span>₹{repairCost}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-semibold text-[#0f172a] border-t border-gray-200 pt-1.5">
                  <span>Total Cost</span>
                  <span>₹{purchasePriceNum + repairCost}</span>
                </div>
                {salePriceNum > 0 && (
                  <div className={`flex justify-between text-base font-bold border-t border-gray-200 pt-1.5 ${previewProfit >= 0 ? 'text-green-600' : 'text-[#ED2939]'}`}>
                    <span className="text-sm">Profit</span>
                    <span>₹{previewProfit}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Purchase Date <span className="text-[#ED2939]">*</span></label>
                  <input type="date" required value={formData.purchaseDate} onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Supplier</label>
                  <ComboBox
                    value={formData.supplier}
                    options={fieldOptions.supplier || []}
                    placeholder="Shop or person"
                    onChange={v => setFormData(prev => ({ ...prev, supplier: v }))}
                  />
                </div>
              </div>
            </div>
          </Section>

          {/* ── REPAIR ── */}
          <Section icon="fa-screwdriver-wrench" title="Repair & Refurbishment" hint="Adds to cost so profit stays accurate">
            <div className="flex items-center justify-between gap-3 bg-[#f8fafc] rounded-xl p-3 border border-gray-100">
              <p className="text-sm font-semibold text-[#0f172a]">Repaired before sale</p>
              <button
                type="button"
                onClick={() => {
                  setWasRepaired(!wasRepaired)
                  if (wasRepaired) {
                    setRepairItems([])
                    setRepairCost(0)
                  }
                }}
                className={`relative inline-flex items-center flex-shrink-0 w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none ${
                  wasRepaired ? 'bg-[#002395]' : 'bg-gray-300'
                }`}
                aria-pressed={wasRepaired}
              >
                <span
                  className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ${
                    wasRepaired ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {wasRepaired && (
              <div className="space-y-3 mt-3">
                {repairItems.map((item, index) => (
                  <div key={index} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-[#002395]">Repair #{index + 1}</p>
                      <button
                        type="button"
                        onClick={() => removeRepairItem(index)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[#ED2939]"
                        aria-label={`Remove repair ${index + 1}`}
                      >
                        <i className="fas fa-times text-sm"></i>
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className={labelClass}>Description <span className="text-[#ED2939]">*</span></label>
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
                          className={inputClass}
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
                            className={`${inputClass} mt-2`}
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelClass}>Cost (₹)</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min="0"
                            value={item.cost}
                            onChange={e => updateRepairItem(index, 'cost', e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Date</label>
                          <input
                            type="date"
                            value={item.date}
                            onChange={e => updateRepairItem(index, 'date', e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Technician</label>
                        <input
                          type="text"
                          value={item.technician}
                          onChange={e => updateRepairItem(index, 'technician', e.target.value)}
                          placeholder="Who did the repair"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addRepairItem}
                  className="w-full border-2 border-dashed border-[#002395]/30 text-[#002395] rounded-xl py-3 text-sm font-bold"
                >
                  <i className="fas fa-plus mr-2"></i>Add Repair Item
                </button>
                {repairItems.length > 0 && (
                  <div className="bg-[#002395]/5 rounded-xl p-3 border border-[#002395]/20">
                    <div className="flex justify-between text-sm font-bold text-[#002395]">
                      <span>Total Repair Cost</span>
                      <span>₹{repairCost}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ── CONDITION ── */}
          <Section icon="fa-clipboard-check" title="Condition & Grade" hint="Grade updates as you answer">
            {!formData.brand ? (
              <div className="text-center py-6 bg-gray-50 rounded-xl">
                <i className="fas fa-mobile-alt text-2xl text-gray-200 mb-2 block"></i>
                <p className="text-sm text-gray-400">Select a brand to see the checklist</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
                  formData.brand?.toLowerCase() === 'apple'
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-green-50 text-green-700'
                }`}>
                  <i className={`fab ${formData.brand?.toLowerCase() === 'apple' ? 'fa-apple' : 'fa-android'} text-lg`}></i>
                  <p className="text-sm font-bold">
                    {formData.brand?.toLowerCase() === 'apple' ? 'iPhone Checklist' : 'Android Checklist'}
                  </p>
                </div>

                {(() => {
                  const groupedCommon = groupByCategory(deviceChecklist.common || [])
                  return Object.keys(groupedCommon).length > 0 && (
                    <ChecklistGroup
                      title="Common Checks"
                      accent="text-gray-500"
                      grouped={groupedCommon}
                      checklist={conditionChecklist}
                      onChange={handleChecklistChange}
                    />
                  )
                })()}

                {(() => {
                  const isApple = formData.brand?.toLowerCase() === 'apple'
                  const specificItems = isApple
                    ? (deviceChecklist.iphone || [])
                    : (deviceChecklist.android || [])
                  const groupedSpecific = groupByCategory(specificItems)
                  return Object.keys(groupedSpecific).length > 0 ? (
                    <ChecklistGroup
                      title={isApple ? 'iPhone Specific Checks' : 'Android Specific Checks'}
                      accent="text-[#002395]"
                      grouped={groupedSpecific}
                      checklist={conditionChecklist}
                      onChange={handleChecklistChange}
                    />
                  ) : null
                })()}
              </div>
            )}

            <div className="mt-4">
              <label className={labelClass}>Final Grade</label>
              <div className="grid grid-cols-4 gap-2">
                {['A', 'B', 'C', 'D'].map(grade => (
                  <button key={grade} type="button" onClick={() => handleConditionChange(grade)}
                    className={`py-2.5 rounded-xl border-2 transition flex flex-col items-center ${
                      formData.condition === grade
                        ? `${GRADE_META[grade].on} text-white`
                        : 'bg-white border-[#e2e8f0] text-[#64748b]'
                    }`}>
                    <span className="text-lg font-bold leading-none">{grade}</span>
                    <span className="text-[9px] font-semibold mt-1 leading-none">{GRADE_META[grade].label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {formData.gradeManualOverride ? 'Grade was set manually' : 'Grade auto-calculated from the checklist'}
              </p>
            </div>

            <div className="space-y-3 mt-3">
              {formData.condition === 'A' && (
                <div className="grid grid-cols-1 gap-3">
                  <div><label className={labelClass}>Warranty Expiry</label><input type="date" value={formData.conditionDetails.warrantyExpiry || ''} onChange={e => setFormData({ ...formData, conditionDetails: { ...formData.conditionDetails, warrantyExpiry: e.target.value } })} className={inputClass} /></div>
                  <div><label className={labelClass}>Accessories Included</label><input type="text" value={formData.conditionDetails.accessories || ''} onChange={e => setFormData({ ...formData, conditionDetails: { ...formData.conditionDetails, accessories: e.target.value } })} className={inputClass} /></div>
                </div>
              )}
              {formData.condition === 'B' && (
                <div><label className={labelClass}>Description of Wear</label><textarea required value={formData.conditionDetails.wearDescription || ''} onChange={e => setFormData({ ...formData, conditionDetails: { ...formData.conditionDetails, wearDescription: e.target.value } })} className={inputClass} rows="2"></textarea></div>
              )}
              {formData.condition === 'C' && (
                <div><label className={labelClass}>Description of Condition</label><textarea required value={formData.conditionDetails.conditionDescription || ''} onChange={e => setFormData({ ...formData, conditionDetails: { ...formData.conditionDetails, conditionDescription: e.target.value } })} className={inputClass} rows="2"></textarea></div>
              )}
              {formData.condition === 'D' && (
                <div><label className={labelClass}>Description of Damage</label><textarea required value={formData.conditionDetails.damageDescription || ''} onChange={e => setFormData({ ...formData, conditionDetails: { ...formData.conditionDetails, damageDescription: e.target.value } })} className={inputClass} rows="2"></textarea></div>
              )}
              <div>
                <label className={labelClass}>Special features / notes</label>
                <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className={inputClass} rows="2"></textarea>
              </div>
            </div>
          </Section>

          {/* ── PHOTOS ── */}
          <Section icon="fa-camera" title="Photos" hint="Front view is required">
            <div className="grid grid-cols-3 gap-2.5">
              {renderPhotoUpload('Front', 'photo1Url', true)}
              {renderPhotoUpload('Back', 'photo2Url')}
              {renderPhotoUpload('Left', 'photo3Url')}
              {renderPhotoUpload('Right', 'photo4Url')}
              {renderPhotoUpload('Top/Bottom', 'photo5Url')}
              {renderPhotoUpload('Additional', 'photo6Url')}
            </div>
            <p className="text-xs font-bold text-[#64748b] uppercase tracking-wide mt-4 mb-2">ID Card</p>
            <div className="grid grid-cols-3 gap-2.5">
              {renderPhotoUpload('ID Front', 'idCardFrontUrl')}
              {renderPhotoUpload('ID Back', 'idCardBackUrl')}
            </div>
          </Section>

          {/* ── SELLER ── */}
          <Section
            icon="fa-user"
            title="Seller"
            hint="Search by name or number. Someone new? Just type them in - they are added when you save."
          >
            <CustomerAutocomplete
              customers={customers}
              nameValue={formData.sellerName}
              phoneValue={formData.sellerPhone}
              alternatePhoneValue={formData.sellerAlternatePhone}
              onNameChange={val => setFormData({ ...formData, sellerName: val, sellerCustomerId: '' })}
              onPhoneChange={val => setFormData({ ...formData, sellerPhone: val, sellerCustomerId: '' })}
              onAlternatePhoneChange={val => setFormData({ ...formData, sellerAlternatePhone: val })}
              onSelectCustomer={handleCustomerSelect}
            />

            {/* Needed on the purchase declaration the seller signs. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className={labelClass}>ID type</label>
                <select
                  value={sellerIdType}
                  onChange={e => setSellerIdType(e.target.value)}
                  className={inputClass}
                >
                  <option>Aadhaar</option>
                  <option>PAN</option>
                  <option>Driving License</option>
                  <option>Voter ID</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>ID number</label>
                <input
                  type="text"
                  value={sellerIdNumber}
                  onChange={e => setSellerIdNumber(e.target.value)}
                  placeholder="As on the document"
                  className={inputClass}
                />
              </div>
            </div>

            <p className="text-xs text-[#64748b] mt-3 leading-relaxed">
              {formData.sellerCustomerId
                ? 'This seller is already in your customer list.'
                : 'This seller will be added to your customer list when you save.'}
            </p>

          </Section>

          {/* ── SELLER AGREEMENT ── */}
          <div ref={agreementRef}>
            <Section
              icon="fa-file-signature"
              title="Seller Agreement"
              hint={initialData ? 'Signed when the device was taken in' : 'Required before the device can be taken in'}
              tone="danger"
            >
              <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-3 max-h-44 overflow-y-auto">
                <p className="text-[11px] font-bold text-[#002395] uppercase tracking-wide mb-2">
                  Read this to the seller
                </p>
                <ol className="list-decimal pl-4 space-y-1.5">
                  {(purchaseTerms || []).map((term, i) => (
                    <li key={i} className="text-[11px] text-gray-600 leading-snug">{term}</li>
                  ))}
                </ol>
              </div>

              <label className="flex items-start gap-3 mt-3 p-3 rounded-xl bg-white border border-[#e2e8f0] cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!formData.sellerIdVerified}
                  onChange={e => {
                    setFormData({ ...formData, sellerIdVerified: e.target.checked })
                    if (fieldErrors.agreement) setFieldErrors(prev => ({ ...prev, agreement: '' }))
                  }}
                  className="h-5 w-5 text-[#002395] rounded border-gray-300 focus:ring-[#002395] shrink-0 mt-0.5"
                />
                <span className="text-xs text-[#0f172a] font-medium">
                  I have seen the seller's <strong>original</strong> photo ID and it matches the person
                  handing over the device.
                </span>
              </label>

              <div className="mt-3">
                <label className={labelClass}>Seller's Signature</label>
                <SignaturePad
                  value={signatureData}
                  onChange={(data) => {
                    setSignatureData(data)
                    setFormData(prev => ({
                      ...prev,
                      agreementAcceptedAt: data ? new Date().toISOString() : ''
                    }))
                    if (fieldErrors.agreement) setFieldErrors(prev => ({ ...prev, agreement: '' }))
                  }}
                />
              </div>

              {/* The declaration belongs here, under the signature it carries,
                  and only once the purchase is saved. A signature is a drawing
                  in the browser until it is saved - printed any earlier the
                  declaration comes out with an empty signature box, and
                  describes a purchase with no record behind it. */}
              <div className="mt-4 pt-3 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={handlePrintPurchaseForm}
                  disabled={saveStatus === 'saving'}
                  className="w-full border border-[#e2e8f0] text-[#002395] rounded-xl py-2.5 text-sm font-semibold disabled:text-[#94a3b8] disabled:bg-[#f8fafc]"
                >
                  <i className="fas fa-file-signature mr-2"></i>
                  {saveStatus === 'saving' ? 'Saving...' : 'Save and print declaration'}
                </button>
                <p className="text-[12px] text-[#64748b] mt-2 leading-relaxed">
                  Saves the purchase, then prints the declaration with the shop's
                  terms and whatever signature has been captured - sign it on
                  paper if the seller has not signed here.
                </p>
              </div>

              <FieldError message={fieldErrors.agreement} />

              {formData.agreementAcceptedAt && (
                <p className="text-[11px] text-green-700 mt-2">
                  <i className="fas fa-check-circle mr-1"></i>
                  Agreed {new Date(formData.agreementAcceptedAt).toLocaleString('en-IN')}
                </p>
              )}
            </Section>
          </div>

        </div>

        {/* Footer */}
        {/* One way to save, and one variant of it. The declaration moved to the
            Seller section it belongs to, and Cancel is gone: the X in the header
            closes this, and so does pulling the sheet down. */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white pb-safe">
          {saveStatus === 'saved' ? (
            <button type="button" disabled className="w-full bg-green-600 text-white rounded-xl py-3.5 text-sm font-bold opacity-60">
              Saved <i className="fas fa-check ml-1"></i>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saveStatus === 'saving' || Object.values(uploadingPhotos).some(v => v)}
              className="w-full bg-[#002395] text-white rounded-xl py-3.5 text-[15px] font-bold disabled:opacity-50"
            >
              {saveStatus === 'saving'
                ? 'Saving...'
                : initialData ? 'Save changes' : 'Save this mobile'}
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveAndPrint}
            disabled={isProcessing || saveStatus.includes('Assigned \u2713')}
            className="w-full mt-2 text-[13px] font-semibold text-[#002395] py-2 disabled:opacity-40"
          >
            {isProcessing
              ? 'Processing...'
              : saveStatus.includes('Assigned \u2713')
                ? 'Label printed'
                : 'Save and print the price label'}
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
