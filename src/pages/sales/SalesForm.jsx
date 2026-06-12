import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import CustomerAutocomplete from '../../components/common/CustomerAutocomplete';

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
    }
    if (!formData.amountPaid) {
      errors.amountPaid = 'Amount paid is required'
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
        const custSnap = await getDocs(collection(db, 'customers'));
        const cList = [];
        custSnap.forEach(doc => cList.push({ id: doc.id, ...doc.data() }));
        setCustomers(cList);

        const shSnap = await getDocs(collection(db, 'second_hand_mobiles'));
        const shList = [];
        shSnap.forEach(doc => {
          if (doc.data().status === 'available') {
            shList.push({ id: doc.id, ...doc.data() });
          }
        });
        setSecondHandMobiles(shList);

        const prodSnap = await getDocs(collection(db, 'products'));
        const pList = [];
        prodSnap.forEach(doc => pList.push({ id: doc.id, ...doc.data() }));
        setProducts(pList);
      } catch (err) {
        console.error("Error fetching data:", err);
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
            item.name = `${sh.brand} ${sh.model}`;
            item.unitPrice = Number(sh.salePrice || 0);
            item.purchaseCost = Number(sh.purchasePrice || 0);
            item.repairCost = Number(sh.repairCost || 0);
            item.imei = sh.imei1 || '';
            item.quantity = 1;
            item.itemProfit = item.unitPrice - item.purchaseCost - item.repairCost;
          }
        } else if (item.type === 'New') {
          const prod = products.find(p => p.id === value);
          if (prod) {
            item.name = prod.name;
            item.unitPrice = Number(prod.salePrice || prod.price || 0);
            item.purchaseCost = Number(prod.purchasePrice || 0);
            item.repairCost = 0;
            item.quantity = 1;
            item.itemProfit = item.unitPrice - item.purchaseCost;
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

  const subtotal = formData.items.reduce((sum, item) => sum + (item.total || 0), 0);
  const totalAmount = subtotal - (Number(formData.discount) || 0);
  const walletUsed = Number(useWalletAmount) || 0;
  const finalAmount = totalAmount - walletUsed;
  const balanceDue = finalAmount - (Number(formData.amountPaid) || 0);
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
        balanceDue,
        discountCategory: discountCategory || 'manual',
        createdBy: currentUser.uid,
        totalProfit: finalProfit,
        walletCredited: (Number(formData.discount) > 0) ? 0 : Math.round(finalProfit * 0.01)
      };
      delete finalData.linkedServiceOrderNumber;
      await onSave(finalData);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-4">

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* DATE AND CUSTOMER */}
      <div>
        <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
          Customer Details
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={e => setFormData({...formData, date: e.target.value})}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
            />
          </div>
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
            {fieldErrors.customerName && (
              <p className="text-[#ED2939] text-xs mt-1">
                <i className="fas fa-exclamation-circle mr-1"></i>
                {fieldErrors.customerName}
              </p>
            )}
          </div>
          {formData.linkedServiceOrderId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Linked Service Order</label>
              <input
                type="text"
                readOnly
                value={formData.linkedServiceOrderNumber}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-100"
              />
            </div>
          )}
        </div>
      </div>

      {/* ITEMS */}
      <div>
        <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
          Items
        </p>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => addItem('Second-hand')}
            className="flex-1 bg-[#002395]/10 text-[#002395] py-2 rounded-xl text-sm font-semibold"
          >
            + Second-hand
          </button>
          <button
            type="button"
            onClick={() => addItem('New')}
            className="flex-1 bg-green-50 text-green-700 py-2 rounded-xl text-sm font-semibold"
          >
            + New Product
          </button>
        </div>

        {formData.items.length === 0 ? (
          <div ref={itemsRef} className="text-center py-8 bg-gray-50 rounded-xl">
            <i className="fas fa-box-open text-3xl text-gray-200 mb-2 block"></i>
            <p className="text-gray-400 text-sm">No items added yet</p>
            {fieldErrors.items && (
              <p className="text-[#ED2939] text-xs mt-2">
                <i className="fas fa-exclamation-circle mr-1"></i>
                {fieldErrors.items}
              </p>
            )}
          </div>
        ) : (
          <div ref={itemsRef} className="space-y-3">
            {fieldErrors.items && (
              <p className="text-[#ED2939] text-xs">
                <i className="fas fa-exclamation-circle mr-1"></i>
                {fieldErrors.items}
              </p>
            )}
            {formData.items.map((item, index) => (
              <div key={index} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    item.type === 'Second-hand' ? 'bg-[#002395]/10 text-[#002395]' :
                    item.type === 'Service' ? 'bg-purple-100 text-purple-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {item.type}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-[#ED2939] p-1"
                  >
                    <i className="fas fa-times text-sm"></i>
                  </button>
                </div>
                <div className="space-y-2">
                  {item.type === 'Second-hand' ? (
                    <select
                      required
                      value={item.itemId}
                      onChange={e => handleItemChange(index, 'itemId', e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
                    >
                      <option value="">Select Device</option>
                      {secondHandMobiles.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.brand} {m.model} (IMEI: {m.imei1}) - ₹{m.salePrice}
                        </option>
                      ))}
                    </select>
                  ) : item.type === 'Service' ? (
                    <input
                      type="text"
                      value={item.name}
                      readOnly
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-100"
                    />
                  ) : (
                    <select
                      required
                      value={item.itemId}
                      onChange={e => handleItemChange(index, 'itemId', e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
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
                    <p className="text-xs text-orange-600 mt-1">
                      <i className="fas fa-wrench mr-1"></i>
                      Includes repair cost: ₹{item.repairCost}
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Qty</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="1"
                        required
                        disabled={item.type === 'Second-hand'}
                        value={item.quantity}
                        onChange={e => handleItemChange(index, 'quantity', Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Price</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        required
                        value={item.unitPrice}
                        onChange={e => handleItemChange(index, 'unitPrice', Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#002395]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Total</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        readOnly
                        value={item.total}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-gray-100"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PAYMENT */}
      <div>
        <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
          Payment
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select
              required
              value={formData.paymentMethod}
              onChange={e => setFormData({...formData, paymentMethod: e.target.value})}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
              <option value="Split">Split</option>
            </select>
          </div>
          {formData.paymentMethod === 'Split' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cash Amount</label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  min="0"
                  value={formData.splitCash}
                  onChange={e => setFormData({...formData, splitCash: e.target.value})}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">UPI Amount</label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  min="0"
                  value={formData.splitUpi}
                  onChange={e => setFormData({...formData, splitUpi: e.target.value})}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
                />
              </div>
            </div>
          )}
          <div ref={amountPaidRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid</label>
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
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.amountPaid ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`}
            />
            {fieldErrors.amountPaid && (
              <p className="text-[#ED2939] text-xs mt-1">
                <i className="fas fa-exclamation-circle mr-1"></i>
                {fieldErrors.amountPaid}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Discount Category
            </label>
            <select
              value={discountCategory}
              onChange={handleDiscountCategoryChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
            >
              <option value="">No Category (Manual)</option>
              <option value="family">Family</option>
              <option value="friends">Friends</option>
              <option value="regular">Regular Customer</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount</label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              value={formData.discount}
              onChange={e => setFormData({...formData, discount: e.target.value})}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
            />
          </div>
          {customerWalletBalance > 0 && (
            <div className="bg-[#002395]/5 border border-[#002395]/20 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <i className="fas fa-wallet text-[#002395] text-sm"></i>
                  <p className="text-sm font-semibold text-[#002395]">
                    Wallet Balance: ₹{customerWalletBalance}
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
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
                    className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#002395]"
                  />
                  <button
                    type="button"
                    onClick={() => setUseWalletAmount(Math.min(customerWalletBalance, totalAmount))}
                    className="bg-[#002395] text-white rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap"
                  >
                    Use All
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseWalletAmount(0)}
                    className="bg-gray-100 text-gray-600 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              rows={2}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
            />
          </div>
        </div>
      </div>

      {/* TOTALS SUMMARY */}
      <div className="bg-[#f8fafc] rounded-xl p-4 border border-gray-100 space-y-2">
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
            <span className="text-[#002395]">
              <i className="fas fa-wallet mr-1"></i>Wallet Used
            </span>
            <span className="font-medium text-[#002395]">- ₹{walletUsed}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
          <span>Final Amount</span>
          <span className="text-[#002395]">₹{finalAmount}</span>
        </div>
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
        <div className="flex justify-between text-xs border-t border-gray-100 pt-2 mt-1">
          <span className="text-gray-400">Est. Profit</span>
          <span className={`font-semibold ${finalProfit >= 0 ? 'text-green-600' : 'text-[#ED2939]'}`}>
            ₹{finalProfit}
          </span>
        </div>
      </div>

      {/* BUTTONS */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? 'Processing...' : 'Complete Sale'}
        </button>
      </div>

    </form>
  );
};

export default SalesForm;
