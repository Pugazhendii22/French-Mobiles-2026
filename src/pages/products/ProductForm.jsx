import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { collection, getDocs, addDoc, query, where, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { getLabelNumber } from '../../utils/getLabelNumber';
import { generateLabelHTML } from '../../utils/printLabel.jsx';
import PrinterSelector from '../../components/PrinterSelector';
import { uploadImageToCloudinary } from '../../utils/uploadImage';
import { imageThumb } from '../../utils/imageUrl';

const generateSerialNumber = () => {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  const random = Math.floor(1000 + Math.random() * 9000)
  return `FM-${dateStr}-${random}`
}

const ProductForm = ({ onSave, onCancel, initialData = null }) => {
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
  const [assignedLabelNumber, setAssignedLabelNumber] = useState(null);
  const [labelEntry, setLabelEntry] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [localId, setLocalId] = useState(initialData?.id || null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPrinterSelector, setShowPrinterSelector] = useState(false);
  const [labelHTMLContent, setLabelHTMLContent] = useState('');

  useEffect(() => {
    if (localId) {
      const checkLabel = async () => {
        const q = query(collection(db, 'label_registry'), where('referenceId', '==', localId), where('labelType', '==', 'product'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setLabelAssigned(true);
          setAssignedLabelNumber(snap.docs[0].data().labelNumber);
          setLabelEntry(snap.docs[0].data());
        }
      };
      checkLabel();
    }
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
      let finalSku = formData.sku;
      if (!finalSku) {
        finalSku = 'SKU-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      }

      const stockNum = Number(formData.stock) || 0;
      const thresholdNum = Number(formData.threshold) || 5;

      let status = 'in stock';
      if (stockNum === 0) status = 'out of stock';
      else if (stockNum <= thresholdNum) status = 'low stock';

      const data = {
        ...formData,
        sku: finalSku,
        purchasePrice: Number(formData.purchasePrice) || 0,
        salePrice: Number(formData.salePrice) || 0,
        stock: stockNum,
        threshold: thresholdNum,
        status,
        compatibleModels: modelsInput.split(',').map(m => m.trim()).filter(m => m !== ''),
        updatedAt: new Date().toISOString()
      };

      if (!localId) {
        data.createdAt = new Date().toISOString();
        data.createdBy = currentUser.uid;
      } else {
        data.id = localId;
      }

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
      let finalSku = formData.sku;
      if (!finalSku) {
        finalSku = 'SKU-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      }

      const stockNum = Number(formData.stock) || 0;
      const thresholdNum = Number(formData.threshold) || 5;

      let status = 'in stock';
      if (stockNum === 0) status = 'out of stock';
      else if (stockNum <= thresholdNum) status = 'low stock';

      const data = {
        ...formData,
        sku: finalSku,
        purchasePrice: Number(formData.purchasePrice) || 0,
        salePrice: Number(formData.salePrice) || 0,
        stock: stockNum,
        threshold: thresholdNum,
        status,
        compatibleModels: modelsInput.split(',').map(m => m.trim()).filter(m => m !== ''),
        updatedAt: new Date().toISOString(),
        serialNumber: finalSerialNumber
      };

      if (!localId) {
        data.createdAt = new Date().toISOString();
        data.createdBy = currentUser.uid;
      } else {
        data.id = localId;
      }

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

      await setDoc(doc(db, "label_registry", nextLabel.toString()), labelData);

      await updateDoc(doc(db, "products", savedDocId || localId), {
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
      if (window.confirm(`Assign label #${nextNum} to this product?`)) {
        const labelData = {
          labelNumber: Number(nextNum),
          labelType: 'product',
          referenceId: localId,
          assignedBy: currentUser.uid,
          assignedAt: new Date().toISOString(),
          isActive: true,
          data: {
            productName: formData.name || '',
            brand: formData.brand || '',
            category: formData.category || '',
            sku: formData.sku || '',
            purchasePrice: Number(formData.purchasePrice) || 0,
            salePrice: Number(formData.salePrice) || 0,
            stockQuantity: Number(formData.stock) || 0,
            imageUrl: formData.imageUrl || '',
            notes: formData.notes || '',
          }
        };
        await addDoc(collection(db, 'label_registry'), labelData);
        setLabelAssigned(true);
        setAssignedLabelNumber(nextNum);
        setLabelEntry(labelData);
      }
    } catch (err) {
      alert("Error assigning label: " + err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handlePrintLabel = () => {
    const labelData = {
      labelType: 'product',
      labelNumber: labelAssigned ? assignedLabelNumber : null,
      data: {
        productName: formData.name || '',
        brand: formData.brand || '',
        category: formData.category || '',
        salePrice: Number(formData.salePrice) || 0,
      }
    }
    const html = generateLabelHTML(labelData)
    setLabelHTMLContent(html)
    setLabelEntry(labelData)
    setShowPrinterSelector(true)
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center">
      <div className="bg-white w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col max-h-[90vh]">
        
        {/* Handle bar for mobile */}
        <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100 bg-white rounded-t-3xl md:rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0f172a]">
              {initialData ? 'Edit Product' : 'Add Product'}
            </h2>
            <button onClick={onCancel} className="text-gray-400 p-1">
              <i className="fas fa-times text-lg"></i>
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <form id="product-form" onSubmit={handleSubmit} className="space-y-5 pb-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* PRODUCT DETAILS */}
            <div>
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                Product Details
              </p>
              <div className="space-y-3">
                <div ref={nameRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Name <span className="text-[#ED2939]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => {
                      setFormData({ ...formData, name: e.target.value })
                      if (fieldErrors.name) setFieldErrors(prev => ({...prev, name: ''}))
                    }}
                    placeholder="Enter product name"
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.name ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`}
                  />
                  {fieldErrors.name && (
                    <p className="text-[#ED2939] text-xs mt-1">
                      <i className="fas fa-exclamation-circle mr-1"></i>
                      {fieldErrors.name}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                    <input
                      type="text"
                      value={formData.brand}
                      onChange={e => setFormData({ ...formData, brand: e.target.value })}
                      placeholder="Optional"
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
                    >
                      <option value="">Select Category</option>
                      <option value="Back Cover">Back Cover</option>
                      <option value="Battery">Battery</option>
                      <option value="Cable">Cable</option>
                      <option value="Charger">Charger</option>
                      <option value="Earphones">Earphones</option>
                      <option value="Memory Card">Memory Card</option>
                      <option value="Power Bank">Power Bank</option>
                      <option value="Screen Guard">Screen Guard</option>
                      <option value="Tempered Glass">Tempered Glass</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Optional"
                    rows={2}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                  />
                </div>
              </div>
            </div>

            {/* PRICING & STOCK */}
            <div>
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                Pricing &amp; Stock
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="0"
                    value={formData.purchasePrice}
                    onChange={e => setFormData({ ...formData, purchasePrice: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                  />
                </div>
                <div ref={salePriceRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sale Price <span className="text-[#ED2939]">*</span>
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    min="0"
                    value={formData.salePrice}
                    onChange={e => {
                      setFormData({ ...formData, salePrice: e.target.value })
                      if (fieldErrors.salePrice) setFieldErrors(prev => ({...prev, salePrice: ''}))
                    }}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.salePrice ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`}
                  />
                  {fieldErrors.salePrice && (
                    <p className="text-[#ED2939] text-xs mt-1">
                      <i className="fas fa-exclamation-circle mr-1"></i>
                      {fieldErrors.salePrice}
                    </p>
                  )}
                </div>
                <div ref={stockRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stock Quantity <span className="text-[#ED2939]">*</span>
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    min="0"
                    value={formData.stock}
                    onChange={e => {
                      setFormData({ ...formData, stock: e.target.value })
                      if (fieldErrors.stock) setFieldErrors(prev => ({...prev, stock: ''}))
                    }}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.stock ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`}
                  />
                  {fieldErrors.stock && (
                    <p className="text-[#ED2939] text-xs mt-1">
                      <i className="fas fa-exclamation-circle mr-1"></i>
                      {fieldErrors.stock}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Alert</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="0"
                    value={formData.threshold}
                    onChange={e => setFormData({ ...formData, threshold: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU / Barcode</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={e => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="Leave blank to auto-generate"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                  />
                </div>
              </div>
            </div>

            {/* COMPATIBLE MODELS */}
            <div>
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                Compatible Models
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model Numbers</label>
                <textarea
                  value={modelsInput}
                  onChange={e => setModelsInput(e.target.value)}
                  placeholder="Separate with commas: C21, C21Y, C25, C25S..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                />
                <p className="text-xs text-gray-400 mt-1">Separate each model with a comma</p>
              </div>
            </div>

            {/* PHOTO */}
            <div>
              <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
                Photo
              </p>
              {formData.imageUrl ? (
                <div className="relative">
                  <img src={imageThumb(formData.imageUrl, 320)} alt="Product" loading="lazy" decoding="async" className="w-full h-40 object-contain rounded-xl border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, imageUrl: '' })}
                    className="absolute top-2 right-2 bg-[#ED2939] text-white w-6 h-6 rounded-full flex items-center justify-center"
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
                      onChange={handleUpload}
                      className="hidden"
                    />
                  </label>
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 bg-gray-50 rounded-xl h-16 cursor-pointer active:scale-95 transition">
                    <i className="fas fa-images text-gray-500 text-lg mb-0.5"></i>
                    <span className="text-xs text-gray-500 font-medium">Gallery</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Fixed Footer */}
        <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-white">
          <div className="space-y-2">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold"
              >
                {saveStatus === 'saved' || labelAssigned ? 'Done' : 'Cancel'}
              </button>
              {saveStatus === 'saved' ? (
                <button type="button" disabled className="flex-1 bg-green-600 text-white rounded-xl py-2.5 text-sm font-semibold">
                  Saved <i className="fas fa-check ml-1"></i>
                </button>
              ) : (
                <button
                  type="submit"
                  form="product-form"
                  disabled={saveStatus === 'saving' || uploading}
                  className="flex-1 bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {saveStatus === 'saving' ? 'Saving...' : initialData ? 'Save Changes' : 'Add Product'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleSaveAndPrint}
              disabled={isProcessing || saveStatus.includes('Assigned \u2713')}
              className="w-full bg-green-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {isProcessing ? (
                <span><i className="fas fa-spinner fa-spin mr-2"></i>Processing...</span>
              ) : saveStatus.includes('Assigned \u2713') ? (
                <span>Done \u2713</span>
              ) : (
                <span><i className="fas fa-print mr-2"></i>Save &amp; Print Label</span>
              )}
            </button>
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
    </div>
  );
};

export default ProductForm;
