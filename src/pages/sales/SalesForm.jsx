import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import CustomerAutocomplete from '../../components/common/CustomerAutocomplete';
import SecondHandMobileSelector from '../../components/sales/SecondHandMobileSelector';
import BarcodeScannerModal from '../../components/common/BarcodeScannerModal';
import { lookupLabel } from '../../utils/lookupLabel';
import { describeFirebaseError } from '../../utils/firebaseError';
import { Section, FieldError } from '../../components/common/ui';
import { inputClass, labelClass, errorInput } from '../../components/common/uiTokens';
import { DIRECT_PAYMENT_METHODS, FINANCE_PROVIDERS, isFinanceMethod } from '../../utils/paymentMethods';
import { loadCustomers } from '../../utils/customerCache';
import { loadCollection } from '../../utils/collectionCache';

// Shared by the manual dropdowns and the barcode scanner so both autofill identically
const buildSecondHandItem = (sh) => {
  const unitPrice = Number(sh.salePrice || 0);
  const purchaseCost = Number(sh.purchasePrice || 0);
  const repairCost = Number(sh.repairCost || 0);
  return {
    type: 'Second-hand',
    itemId: sh.id,
    name: `${sh.brand} ${sh.model}`,
    quantity: 1,
    unitPrice,
    total: unitPrice,
    purchaseCost,
    repairCost,
    itemProfit: unitPrice - purchaseCost - repairCost,
    imei: sh.imei1 || ''
  };
};

const buildProductItem = (prod, quantity = 1) => {
  const unitPrice = Number(prod.salePrice || prod.price || 0);
  const purchaseCost = Number(prod.purchasePrice || 0);
  return {
    type: 'New',
    itemId: prod.id,
    name: prod.name,
    quantity,
    unitPrice,
    total: unitPrice * quantity,
    purchaseCost,
    repairCost: 0,
    itemProfit: (unitPrice - purchaseCost) * quantity,
    imei: ''
  };
};

const SalesForm = ({ onSave, onCancel, prefillData }) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [formData, setFormData] = useState(() => {
    const prefill = prefillData || {};
    return {
      date: new Date().toISOString().split('T')[0],
      customerId: prefill.customerId || '',
      customerName: prefill.customerName || '',
      customerPhone: prefill.customerPhone || '',
      alternatePhone: prefill.alternatePhone || '',
      customerAddress: prefill.customerAddress || '',
      items: prefill.items ? prefill.items.map(item => {
        const unitPrice = Number(item.unitPrice || 0);
        const quantity = Number(item.quantity || 1);
        const purchaseCost = Number(item.purchaseCost || 0);
        const repairCost = Number(item.repairCost || 0);
        return {
          type: item.type || 'Service',
          itemId: item.itemId || 'service',
          name: item.name || '',
          quantity,
          unitPrice,
          total: quantity * unitPrice,
          purchaseCost,
          repairCost,
          itemProfit: (unitPrice - purchaseCost - repairCost) * quantity,
          imei: item.imei || ''
        };
      }) : [],
      discount: 0,
      paymentMethod: 'Cash',
      splitCash: '',
      splitUpi: '',
      amountPaid: '',
      downPayment: '',
      financeLoanNumber: '',
      notes: '',
      linkedServiceOrderId: prefill.serviceOrderId || '',
      linkedServiceOrderNumber: prefill.serviceOrderNumber || ''
    };
  });
  
  const [discountCategory, setDiscountCategory] = useState('');
  const [customers, setCustomers] = useState([]);
  const [secondHandMobiles, setSecondHandMobiles] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerWalletBalance, setCustomerWalletBalance] = useState(0);
  const [useWalletAmount, setUseWalletAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);

  const customerNameRef = useRef(null)
  const itemsRef = useRef(null)
  const amountPaidRef = useRef(null)

  const validateAndScroll = () => {
    const errors = {}
    let firstErrorRef = null

    if (!formData.customerName) {
      errors.customerName = 'Customer name is required'
      if (!firstErrorRef) firstErrorRef = customerNameRef
    }
    if (formData.items.length === 0) {
      errors.items = 'Add at least one item'
      if (!firstErrorRef) firstErrorRef = itemsRef
    } else {
      const missingIndex = formData.items.findIndex(it => !it.itemId);
      if (missingIndex !== -1) {
        const itemType = formData.items[missingIndex].type === 'Second-hand' ? 'second-hand mobile' : 'product';
        errors.items = `Please select a ${itemType} for item #${missingIndex + 1}`;
        if (!firstErrorRef) firstErrorRef = itemsRef;
      }
    }
    if (!formData.amountPaid && !isFinanceMethod(formData.paymentMethod)) {
      errors.amountPaid = 'Amount paid is required'
      if (!firstErrorRef) firstErrorRef = amountPaidRef
    }
    if (isFinanceMethod(formData.paymentMethod) && !formData.financeLoanNumber) {
      errors.financeLoanNumber = 'Loan / application number is required'
      if (!firstErrorRef) firstErrorRef = amountPaidRef
    }

    setFieldErrors(errors)

    if (firstErrorRef?.current) {
      firstErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      firstErrorRef.current.focus()
    }

    return Object.keys(errors).length === 0
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setCustomers(await loadCustomers());

        const [shList, pList] = await Promise.all([
          loadCollection('second_hand_mobiles'),
          loadCollection('products'),
        ]);
        setSecondHandMobiles(shList.filter(m => m.status === 'available'));
        setProducts(pList);
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setDataLoaded(true);
      }
    };
    fetchData();
  }, []);

  // Recalculate discount when items or discount category changes
  useEffect(() => {
    if (!discountCategory) return;
    const estProfit = formData.items.reduce((sum, item) => sum + (Number(item.itemProfit) || 0), 0);
    let percentage = 0;
    if (discountCategory === 'family') percentage = 15;
    else if (discountCategory === 'friends') percentage = 10;
    else if (discountCategory === 'regular') percentage = 5;
    const discountAmount = Math.round((estProfit * percentage) / 100);
    setFormData(prev => ({ ...prev, discount: discountAmount }));
  }, [formData.items, discountCategory]);

  const handleCustomerSelect = (c) => {
    setFormData(prev => ({ 
      ...prev, 
      customerId: c.id || '',
      customerName: c.name || '', 
      customerPhone: c.phone || '',
      alternatePhone: c.alternatePhone || '',
      customerAddress: c.address || c.customerAddress || ''
    }));
    setCustomerWalletBalance(Number(c.walletBalance) || 0);
    setUseWalletAmount(0);
    if (fieldErrors.customerName) setFieldErrors(prev => ({...prev, customerName: ''}))
  };

  const handleDiscountCategoryChange = (e) => {
    const category = e.target.value;
    setDiscountCategory(category);

    if (!category) {
      // Manual mode - clear auto discount
      setFormData(prev => ({ ...prev, discount: 0 }));
      return;
    }

    // Calculate discount based on estimated profit
    const estProfit = formData.items.reduce((sum, item) => sum + (Number(item.itemProfit) || 0), 0);
    
    let percentage = 0;
    if (category === 'family') percentage = 15;
    else if (category === 'friends') percentage = 10;
    else if (category === 'regular') percentage = 5;

    const discountAmount = Math.round((estProfit * percentage) / 100);
    setFormData(prev => ({ ...prev, discount: discountAmount }));
  };

  const addItem = (type) => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { type, itemId: '', name: '', quantity: 1, unitPrice: 0, total: 0, purchaseCost: 0, repairCost: 0, itemProfit: 0, imei: '' }]
    }));
    if (fieldErrors.items) setFieldErrors(prev => ({...prev, items: ''}))
  };

  const removeItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
    if (fieldErrors.items) setFieldErrors(prev => ({...prev, items: ''}))
  };

  const handleItemChange = (index, field, value) => {
     if (field === 'itemId' && value !== '') {
      const currentItemType = formData.items[index]?.type;
      if (currentItemType === 'Second-hand') {
        const alreadyAdded = formData.items.some((it, i) => i !== index && it.type === 'Second-hand' && it.itemId === value);
        if (alreadyAdded) {
          alert("This device has already been added to the sale.");
          return;
        }
      }
    }
    setFormData(prev => {
      const newItems = [...prev.items];
      const item = { ...newItems[index] };
      item[field] = value;

      if (field === 'itemId') {
        if (item.type === 'Second-hand') {
          const sh = secondHandMobiles.find(m => m.id === value);
          if (sh) {
            Object.assign(item, buildSecondHandItem(sh));
          } else {
            item.name = '';
            item.unitPrice = 0;
            item.purchaseCost = 0;
            item.repairCost = 0;
            item.imei = '';
            item.itemProfit = 0;
          }
        } else if (item.type === 'New') {
          const prod = products.find(p => p.id === value);
          if (prod) {
            Object.assign(item, buildProductItem(prod));
          } else {
            item.name = '';
            item.unitPrice = 0;
            item.purchaseCost = 0;
            item.repairCost = 0;
            item.imei = '';
            item.itemProfit = 0;
          }
        } else if (item.type === 'Service') {
          item.purchaseCost = 0;
          item.repairCost = 0;
          item.itemProfit = item.unitPrice;
        }
      }

      if (field === 'quantity' || field === 'unitPrice' || field === 'itemId') {
        item.total = item.quantity * item.unitPrice;
        item.itemProfit = (item.unitPrice - item.purchaseCost - item.repairCost) * item.quantity;
      }

      newItems[index] = item;
      return { ...prev, items: newItems };
    });
  };

  // Resolve a scanned label to live inventory, then autofill it onto the bill
  const handleBarcodeScan = async (labelNumber) => {
    const num = Number(labelNumber);
    if (!num || Number.isNaN(num)) return { ok: false, message: 'Invalid barcode.' };

    let kind = null;
    let record = secondHandMobiles.find(m => Number(m.assignedLabelNumber) === num);
    if (record) kind = 'second_hand';

    if (!record) {
      record = products.find(p => Number(p.assignedLabelNumber) === num);
      if (record) kind = 'product';
    }

    // Labels assigned separately are only in the registry, so look there too
    if (!record) {
      let label;
      try {
        label = await lookupLabel(num);
      } catch {
        return { ok: false, message: 'Could not reach the label registry. Check your connection.' };
      }
      if (!label) return { ok: false, message: `Label #${num} is not assigned to anything yet.` };

      if (label.labelType === 'second_hand') {
        record = secondHandMobiles.find(m => m.id === label.referenceId);
        if (!record) {
          const name = [label.data?.brand, label.data?.model].filter(Boolean).join(' ') || `Label #${num}`;
          return { ok: false, message: `${name} is not available for sale (already sold or removed).` };
        }
        kind = 'second_hand';
      } else if (label.labelType === 'product') {
        record = products.find(p => p.id === label.referenceId);
        if (!record) return { ok: false, message: `The product for label #${num} no longer exists.` };
        kind = 'product';
      } else {
        const belongsTo = label.labelType === 'service_order' ? 'a service order' : 'a past sale';
        return { ok: false, message: `Label #${num} belongs to ${belongsTo}, not a sellable item.` };
      }
    }

    if (fieldErrors.items) setFieldErrors(prev => ({ ...prev, items: '' }));

    if (kind === 'second_hand') {
      const sh = record;
      if (formData.items.some(it => it.type === 'Second-hand' && it.itemId === sh.id)) {
        return { ok: false, message: `${sh.brand} ${sh.model} is already on this bill.` };
      }
      const newItem = buildSecondHandItem(sh);
      setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
      const message = `Added ${newItem.name} - ₹${newItem.unitPrice}`;
      setScanNotice(message);
      return { ok: true, message };
    }

    // New product: scanning the same label again bumps the quantity
    const prod = record;
    const stock = Number(prod.stock) || 0;
    const existingIndex = formData.items.findIndex(it => it.type === 'New' && it.itemId === prod.id);
    const alreadyOnBill = existingIndex === -1 ? 0 : Number(formData.items[existingIndex].quantity) || 0;

    if (stock <= 0) return { ok: false, message: `${prod.name} is out of stock.` };
    if (alreadyOnBill + 1 > stock) {
      return { ok: false, message: `Only ${stock} unit(s) of ${prod.name} left in stock.` };
    }

    if (existingIndex !== -1) {
      const quantity = alreadyOnBill + 1;
      setFormData(prev => {
        const items = [...prev.items];
        const target = { ...items[existingIndex], quantity };
        target.total = target.quantity * target.unitPrice;
        target.itemProfit = (target.unitPrice - target.purchaseCost - target.repairCost) * target.quantity;
        items[existingIndex] = target;
        return { ...prev, items };
      });
      const message = `${prod.name} x${quantity}`;
      setScanNotice(message);
      return { ok: true, message };
    }

    const newItem = buildProductItem(prod);
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
    const message = `Added ${newItem.name} - ₹${newItem.unitPrice}`;
    setScanNotice(message);
    return { ok: true, message };
  };

  // Opened from the scanner page ("Add to Sale") - fill the item in as soon as inventory is ready
  const autoScanRef = useRef(false);
  useEffect(() => {
    const scanned = prefillData?.scanLabelNumber;
    if (!dataLoaded || !scanned || autoScanRef.current) return;
    autoScanRef.current = true;
    handleBarcodeScan(scanned).then(res => {
      if (res && !res.ok) setError(res.message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoaded, prefillData]);

  const subtotal = formData.items.reduce((sum, item) => sum + (item.total || 0), 0);
  const totalAmount = subtotal - (Number(formData.discount) || 0);
  const walletUsed = Number(useWalletAmount) || 0;
  const finalAmount = totalAmount - walletUsed;

  // On a financed sale the financier covers whatever the down payment does not,
  // so nothing is left owing by the customer.
  const financed = isFinanceMethod(formData.paymentMethod);
  const downPayment = Number(formData.downPayment) || 0;
  const financedAmount = financed ? Math.max(0, finalAmount - downPayment) : 0;
  const amountPaidValue = financed ? finalAmount : (Number(formData.amountPaid) || 0);
  const balanceDue = finalAmount - amountPaidValue;
  const totalItemProfit = formData.items.reduce((sum, item) =>
    sum + (Number(item.itemProfit) || 0), 0
  );
  const finalProfit = totalItemProfit - (Number(formData.discount) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    
    if (!validateAndScroll()) return;
    
    // Validate split payment
    if (formData.paymentMethod === 'Split') {
      const splitTotal = (Number(formData.splitCash) || 0) + (Number(formData.splitUpi) || 0);
      if (splitTotal !== Number(formData.amountPaid)) {
        setError("Split Cash and UPI must add up to Amount Paid.");
        return;
      }
    }

    setSubmitting(true);
    setError('');
    try {
      const finalData = { 
        ...formData, 
        subtotal, 
        totalAmount,
        walletUsed,
        finalAmount,
        amountPaid: amountPaidValue,
        balanceDue,
        isFinanced: financed,
        financeProvider: financed ? formData.paymentMethod : '',
        downPayment: financed ? downPayment : 0,
        financedAmount,
        discountCategory: discountCategory || 'manual',
        createdBy: currentUser.uid,
        totalProfit: finalProfit,
        walletCredited: (Number(formData.discount) > 0) ? 0 : Math.round(finalProfit * 0.01)
      };
      delete finalData.linkedServiceOrderNumber;
      await onSave(finalData);
    } catch (err) {
      console.error('Sale save failed:', err);
      setError(describeFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">


      {/* ── CUSTOMER ── */}
      <Section icon="fa-user" title="Customer" hint="Who is buying">
        <div className="space-y-3">
          <div ref={customerNameRef}>
            <CustomerAutocomplete
              customers={customers}
              nameValue={formData.customerName}
              phoneValue={formData.customerPhone}
              alternatePhoneValue={formData.alternatePhone}
              onNameChange={val => {
                setFormData({...formData, customerName: val, customerId: ''})
                if (fieldErrors.customerName) setFieldErrors(prev => ({...prev, customerName: ''}))
              }}
              onPhoneChange={val => setFormData({...formData, customerPhone: val, customerId: ''})}
              onAlternatePhoneChange={val => setFormData({...formData, alternatePhone: val})}
              onSelectCustomer={handleCustomerSelect}
            />
            <FieldError message={fieldErrors.customerName} />
          </div>
          <div>
            <label className={labelClass}>Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={e => setFormData({...formData, date: e.target.value})}
              className={inputClass}
            />
          </div>
          {formData.linkedServiceOrderId && (
            <div>
              <label className={labelClass}>Linked Service Order</label>
              <input
                type="text"
                readOnly
                value={formData.linkedServiceOrderNumber}
                className={`${inputClass} bg-gray-100`}
              />
            </div>
          )}
        </div>
      </Section>

      {/* ── ITEMS ── */}
      <Section icon="fa-box" title="Items" hint="Scan a label or add by hand">
        <button
          type="button"
          onClick={() => { setScanNotice(''); setScannerOpen(true); }}
          className="w-full bg-[#002395] text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
        >
          <i className="fas fa-barcode"></i>
          Scan Barcode
        </button>

        {scanNotice && (
          <p className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-3 py-2 text-xs font-medium mt-2">
            <i className="fas fa-check-circle mr-1"></i>{scanNotice}
          </p>
        )}

        <p className="text-center text-xs text-gray-400 my-2">or add manually</p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addItem('Second-hand')}
            className="flex-1 bg-[#002395]/10 text-[#002395] py-2.5 rounded-xl text-xs font-bold"
          >
            <i className="fas fa-plus mr-1.5"></i>Second-hand
          </button>
          <button
            type="button"
            onClick={() => addItem('New')}
            className="flex-1 bg-green-50 text-green-700 py-2.5 rounded-xl text-xs font-bold"
          >
            <i className="fas fa-plus mr-1.5"></i>New Product
          </button>
        </div>

        {formData.items.length === 0 ? (
          <div ref={itemsRef} className="text-center py-8 bg-gray-50 rounded-xl mt-3">
            <i className="fas fa-box-open text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-gray-400 text-sm">No items yet</p>
            <FieldError message={fieldErrors.items} />
          </div>
        ) : (
          <div ref={itemsRef} className="space-y-3 mt-3">
            <FieldError message={fieldErrors.items} />
            {formData.items.map((item, index) => (
              <div key={index} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    item.type === 'Second-hand' ? 'bg-[#002395]/10 text-[#002395]' :
                    item.type === 'Service' ? 'bg-purple-100 text-purple-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {item.type}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[#ED2939]"
                    aria-label={`Remove item ${index + 1}`}
                  >
                    <i className="fas fa-times text-sm"></i>
                  </button>
                </div>
                <div className="space-y-2">
                  {item.type === 'Second-hand' ? (
                    <SecondHandMobileSelector
                      mobiles={secondHandMobiles}
                      selectedId={item.itemId}
                      onSelect={(val) => handleItemChange(index, 'itemId', val)}
                      alreadySelectedIds={formData.items
                        .filter((it, i) => i !== index && it.type === 'Second-hand' && it.itemId)
                        .map(it => it.itemId)}
                      hasError={Boolean(fieldErrors.items && !item.itemId)}
                    />
                  ) : item.type === 'Service' ? (
                    <input
                      type="text"
                      value={item.name}
                      readOnly
                      className={`${inputClass} bg-gray-100`}
                    />
                  ) : (
                    <select
                      required
                      value={item.itemId}
                      onChange={e => handleItemChange(index, 'itemId', e.target.value)}
                      className={`${inputClass} ${fieldErrors.items && !item.itemId ? errorInput : ''}`}
                    >
                      <option value="">Select Product</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id} disabled={Number(p.stock) <= 0}>
                          {p.name} (Stock: {p.stock || 0}) - ₹{p.salePrice || p.price || 0}
                          {Number(p.stock) <= 0 ? ' - Out of Stock' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {item.type === 'Second-hand' && item.repairCost > 0 && (
                    <p className="text-[11px] text-orange-600">
                      <i className="fas fa-wrench mr-1"></i>
                      Includes repair cost ₹{item.repairCost}
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Qty</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="1"
                        required
                        disabled={item.type === 'Second-hand'}
                        value={item.quantity}
                        onChange={e => handleItemChange(index, 'quantity', Number(e.target.value))}
                        className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#002395] disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Price</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        required
                        value={item.unitPrice}
                        onChange={e => handleItemChange(index, 'unitPrice', Number(e.target.value))}
                        className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Total</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        readOnly
                        value={item.total}
                        className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm bg-gray-100 font-semibold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── PAYMENT ── */}
      <Section icon="fa-indian-rupee-sign" title="Payment">
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Payment Method</label>
            <div className="flex bg-gray-100 rounded-xl p-1">
              {DIRECT_PAYMENT_METHODS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFormData({...formData, paymentMethod: m, downPayment: '', financeLoanNumber: ''})}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                    formData.paymentMethod === m ? 'bg-[#002395] text-white shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {m}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setFormData({...formData, paymentMethod: FINANCE_PROVIDERS[0], splitCash: '', splitUpi: ''})}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                  financed ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500'
                }`}
              >
                EMI
              </button>
            </div>
          </div>

          {formData.paymentMethod === 'Split' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Cash Amount</label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  min="0"
                  value={formData.splitCash}
                  onChange={e => setFormData({...formData, splitCash: e.target.value})}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>UPI Amount</label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  min="0"
                  value={formData.splitUpi}
                  onChange={e => setFormData({...formData, splitUpi: e.target.value})}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {/* ── FINANCE / EMI ── */}
          {financed && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-3">
              <div>
                <label className={labelClass}>Finance Provider</label>
                <select
                  value={formData.paymentMethod}
                  onChange={e => setFormData({...formData, paymentMethod: e.target.value})}
                  className={inputClass}
                >
                  {FINANCE_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Down Payment</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="0"
                    value={formData.downPayment}
                    onChange={e => setFormData({...formData, downPayment: e.target.value})}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Financed by {formData.paymentMethod}</label>
                  <input
                    type="text"
                    readOnly
                    value={`₹${financedAmount}`}
                    className={`${inputClass} bg-white font-bold text-indigo-700`}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Loan / Application No. <span className="text-[#ED2939]">*</span></label>
                <input
                  type="text"
                  value={formData.financeLoanNumber}
                  onChange={e => {
                    setFormData({...formData, financeLoanNumber: e.target.value})
                    if (fieldErrors.financeLoanNumber) setFieldErrors(prev => ({...prev, financeLoanNumber: ''}))
                  }}
                  placeholder="From the finance approval"
                  className={`${inputClass} ${fieldErrors.financeLoanNumber ? errorInput : ''}`}
                />
                <FieldError message={fieldErrors.financeLoanNumber} />
              </div>

              <p className="text-[11px] text-indigo-700">
                <i className="fas fa-circle-info mr-1"></i>
                Recorded as fully paid - the customer owes nothing. ₹{financedAmount} is due to
                the shop from {formData.paymentMethod}.
              </p>
            </div>
          )}

          {!financed && (
            <div ref={amountPaidRef}>
              <label className={labelClass}>Amount Paid</label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                min="0"
                value={formData.amountPaid}
                onChange={e => {
                  setFormData({...formData, amountPaid: e.target.value})
                  if (fieldErrors.amountPaid) setFieldErrors(prev => ({...prev, amountPaid: ''}))
                }}
                className={`${inputClass} ${fieldErrors.amountPaid ? errorInput : ''}`}
              />
              <FieldError message={fieldErrors.amountPaid} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Discount Category</label>
              <select
                value={discountCategory}
                onChange={handleDiscountCategoryChange}
                className={inputClass}
              >
                <option value="">Manual</option>
                <option value="family">Family</option>
                <option value="friends">Friends</option>
                <option value="regular">Regular</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Discount</label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="0"
                value={formData.discount}
                onChange={e => setFormData({...formData, discount: e.target.value})}
                className={inputClass}
              />
            </div>
          </div>

          {customerWalletBalance > 0 && (
            <div className="bg-[#002395]/5 border border-[#002395]/20 rounded-xl p-3">
              <p className="text-sm font-bold text-[#002395] mb-2">
                <i className="fas fa-wallet mr-2"></i>Wallet Balance ₹{customerWalletBalance}
              </p>
              <label className="block text-[11px] text-gray-500 mb-1">
                Use from wallet (max ₹{Math.min(customerWalletBalance, totalAmount)})
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  max={Math.min(customerWalletBalance, totalAmount)}
                  value={useWalletAmount}
                  onChange={e => {
                    const val = Math.min(
                      Number(e.target.value) || 0,
                      customerWalletBalance,
                      totalAmount
                    )
                    setUseWalletAmount(val)
                  }}
                  className="flex-1 border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                />
                <button
                  type="button"
                  onClick={() => setUseWalletAmount(Math.min(customerWalletBalance, totalAmount))}
                  className="bg-[#002395] text-white rounded-xl px-3 text-xs font-bold whitespace-nowrap"
                >
                  Use All
                </button>
                <button
                  type="button"
                  onClick={() => setUseWalletAmount(0)}
                  className="bg-gray-100 text-gray-600 rounded-xl px-3 text-xs font-bold"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              rows={2}
              className={inputClass}
            />
          </div>
        </div>
      </Section>

      {/* ── TOTALS ── */}
      <Section icon="fa-receipt" title="Bill Summary">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-medium">₹{subtotal}</span>
          </div>
          {Number(formData.discount) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-green-600">
                Discount {discountCategory ? `(${discountCategory === 'family' ? 'Family' : discountCategory === 'friends' ? 'Friends' : 'Regular'})` : ''}
              </span>
              <span className="font-medium text-green-600">- ₹{formData.discount}</span>
            </div>
          )}
          {walletUsed > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#002395]"><i className="fas fa-wallet mr-1"></i>Wallet Used</span>
              <span className="font-medium text-[#002395]">- ₹{walletUsed}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2">
            <span>Final Amount</span>
            <span className="text-[#002395]">₹{finalAmount}</span>
          </div>
          {financed ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Down Payment</span>
                <span className="font-medium text-green-600">₹{downPayment}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-indigo-700">{formData.paymentMethod}</span>
                <span className="font-medium text-indigo-700">₹{financedAmount}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span>Customer Balance</span>
                <span className="text-green-600">Nil ✓</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Amount Paid</span>
                <span className="font-medium text-green-600">₹{Number(formData.amountPaid) || 0}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span>Balance Due</span>
                <span className={balanceDue > 0 ? 'text-[#ED2939]' : 'text-green-600'}>
                  {balanceDue > 0 ? `₹${balanceDue}` : 'Fully Paid ✓'}
                </span>
              </div>
            </>
          )}
          <div className="flex justify-between text-xs border-t border-gray-100 pt-2">
            <span className="text-gray-400">Est. Profit</span>
            <span className={`font-semibold ${finalProfit >= 0 ? 'text-green-600' : 'text-[#ED2939]'}`}>
              ₹{finalProfit}
            </span>
          </div>
        </div>
      </Section>

      {/* ── ACTIONS (pinned to the bottom of the sheet) ── */}
      <div className="sticky bottom-0 -mx-3 px-3 pt-3 pb-3 bg-[#f1f5f9]/95 backdrop-blur border-t border-gray-200 space-y-2">
        {/* Errors belong next to the button that caused them - at the top of a
            long sheet nobody sees them, and the sale just looks like it failed
            silently. */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-[#ED2939] px-4 py-3 rounded-xl text-sm font-medium">
            <i className="fas fa-exclamation-circle mr-2"></i>{error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#002395] text-white rounded-xl py-3.5 text-sm font-bold disabled:opacity-50"
        >
          {submitting ? 'Processing...' : `Complete Sale · ₹${finalAmount}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full border border-gray-200 bg-white text-gray-600 rounded-xl py-3 text-sm font-bold"
        >
          Cancel
        </button>
      </div>

      {scannerOpen && (
        <BarcodeScannerModal
          title="Scan item barcode"
          hint="Scan the label on the phone or product to add it to the bill"
          onScan={handleBarcodeScan}
          onClose={() => setScannerOpen(false)}
        />
      )}

    </form>
  );
};

export default SalesForm;
