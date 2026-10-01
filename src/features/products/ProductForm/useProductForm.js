import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getLabelNumber, findLabel, createLabelEntryKeyedByNumber } from '@/features/labels/data';
import { generateLabelHTML } from '@/features/labels/printing/printLabel';
import { uploadImageToCloudinary } from '@/shared/lib/uploadImage';
import { updateProduct } from '../data';
import { buildProductData } from './buildProductData';

const generateSerialNumber = () => {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  const random = Math.floor(1000 + Math.random() * 9000)
  return `FM-${dateStr}-${random}`
}

/* All of the form's state and both of its save paths. The component files
   beside this one are presentation only. */
export const useProductForm = ({ onSave, initialData }) => {
  const { currentUser } = useAuth();
  const [formData, setFormData] = useState(initialData || {
    name: '',
    brand: '',
    category: 'Charger',
    purchasePrice: '',
    salePrice: '',
    stock: '',
    threshold: 5,
    sku: '',
    notes: '',
    imageUrl: '',
    compatibleModels: []
  });
  const [modelsInput, setModelsInput] = useState(initialData?.compatibleModels ? initialData.compatibleModels.join(', ') : '');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [uploading, setUploading] = useState(false);

  const nameRef = useRef(null)
  const salePriceRef = useRef(null)
  const stockRef = useRef(null)

  const validateAndScroll = () => {
    const errors = {}
    let firstErrorRef = null

    if (!formData.name) {
      errors.name = 'Product name is required'
      if (!firstErrorRef) firstErrorRef = nameRef
    }
    if (!formData.salePrice) {
      errors.salePrice = 'Sale price is required'
      if (!firstErrorRef) firstErrorRef = salePriceRef
    }
    if (!formData.stock) {
      errors.stock = 'Stock quantity is required'
      if (!firstErrorRef) firstErrorRef = stockRef
    }

    setFieldErrors(errors)

    if (firstErrorRef?.current) {
      firstErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      firstErrorRef.current.focus()
    }

    return Object.keys(errors).length === 0
  }
  const [labelAssigned, setLabelAssigned] = useState(false);
  const [labelEntry, setLabelEntry] = useState(null);
  const [localId, setLocalId] = useState(initialData?.id || null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPrinterSelector, setShowPrinterSelector] = useState(false);
  const [labelHTMLContent, setLabelHTMLContent] = useState('');

  useEffect(() => {
    if (!localId) return;
    const checkLabel = async () => {
      const entry = await findLabel('product', localId);
      if (entry) {
        setLabelAssigned(true);
        setLabelEntry(entry);
      }
    };
    checkLabel();
  }, [localId]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      const url = await uploadImageToCloudinary(file);
      setFormData(prev => ({ ...prev, imageUrl: url }));
    } catch (err) {
      console.error("Upload error:", err);
      alert("Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateAndScroll()) return;
    setSaveStatus('saving');
    setError('');

    try {
      const data = buildProductData({
        formData, modelsInput, localId, currentUserUid: currentUser.uid,
      });

      const newId = await onSave(data);
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

      // Step 2: Save product to Firestore
      const data = buildProductData({
        formData, modelsInput, localId,
        currentUserUid: currentUser.uid,
        serialNumber: finalSerialNumber,
      });

      const savedDocId = await onSave(data);
      if (savedDocId) setLocalId(savedDocId);

      // Step 3: Auto assign next label number
      const nextLabel = await getLabelNumber();
      const labelData = {
        labelNumber: nextLabel,
        labelType: "product",
        referenceId: savedDocId || localId,
        assignedBy: currentUser.uid,
        assignedAt: new Date().toISOString(),
        isActive: true,
        data: {
          productName: data.name,
          brand: data.brand,
          category: data.category,
          sku: data.sku,
          salePrice: data.salePrice,
          purchasePrice: data.purchasePrice,
          stockQuantity: data.stock,
          serialNumber: finalSerialNumber,
          createdBy: currentUser.uid,
          createdAt: new Date().toISOString()
        }
      };

      await createLabelEntryKeyedByNumber(nextLabel, labelData);

      await updateProduct(savedDocId || localId, {
        assignedLabelNumber: nextLabel,
        serialNumber: finalSerialNumber,
      });

      // Step 4: Show printer selector
      const html = generateLabelHTML(labelData);
      setLabelHTMLContent(html);
      setLabelEntry(labelData);
      setShowPrinterSelector(true);

      setSaveStatus(`Saved & Label #${nextLabel} Assigned ✓`);
      setLabelAssigned(true);

    } catch (error) {
      console.error("Save & Print error:", error);
      alert("Error during Save & Print. Please try again.");
      setSaveStatus('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    formData, setFormData, modelsInput, setModelsInput,
    error, fieldErrors, setFieldErrors, uploading,
    labelAssigned, labelEntry,
    saveStatus, isProcessing,
    showPrinterSelector, setShowPrinterSelector, labelHTMLContent,
    nameRef, salePriceRef, stockRef,
    handleUpload, handleSubmit, handleSaveAndPrint,
  };
};
