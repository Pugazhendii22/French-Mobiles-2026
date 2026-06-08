import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';

const EnquiryForm = ({ onSave, onCancel, initialData = null }) => {
  const { currentUser } = useAuth();
  const [formData, setFormData] = useState(initialData || {
    customerName: '',
    customerPhone: '',
    modelEnquired: '',
    budgetMin: '',
    budgetMax: '',
    medium: 'Walk-in',
    seriousness: 'Ordinary',
    requiredWithin: 'No Rush',
    status: 'Open',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const customerNameRef = useRef(null)
  const customerPhoneRef = useRef(null)

  const validateAndScroll = () => {
    const errors = {}
    let firstErrorRef = null

    if (!formData.customerName) {
      errors.customerName = 'Customer name is required'
      if (!firstErrorRef) firstErrorRef = customerNameRef
    }
    if (!formData.customerPhone) {
      errors.customerPhone = 'Phone number is required'
      if (!firstErrorRef) firstErrorRef = customerPhoneRef
    }

    setFieldErrors(errors)

    if (firstErrorRef?.current) {
      firstErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      firstErrorRef.current.focus()
    }

    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateAndScroll()) return;
    setLoading(true);
    setError('');

    try {
      const data = {
        ...formData,
        budgetMin: Number(formData.budgetMin) || 0,
        budgetMax: Number(formData.budgetMax) || 0,
        updatedAt: new Date().toISOString()
      };

      if (!initialData) {
        data.createdAt = new Date().toISOString();
        data.createdBy = currentUser.uid;
      }

      await onSave(data);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

return (
  <form onSubmit={handleSubmit} className="space-y-5 pb-4">

    {error && (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
        {error}
      </div>
    )}

    {/* CUSTOMER DETAILS */}
    <div>
      <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
        Customer Details
      </p>
      <div className="space-y-3">
        <div ref={customerNameRef}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-[#ED2939]">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.customerName}
            onChange={e => {
              setFormData({ ...formData, customerName: e.target.value })
              if (fieldErrors.customerName) setFieldErrors(prev => ({...prev, customerName: ''}))
            }}
            placeholder="Customer name"
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.customerName ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`}
          />
          {fieldErrors.customerName && (
            <p className="text-[#ED2939] text-xs mt-1">
              <i className="fas fa-exclamation-circle mr-1"></i>
              {fieldErrors.customerName}
            </p>
          )}
        </div>
        <div ref={customerPhoneRef}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            WhatsApp Number <span className="text-[#ED2939]">*</span>
          </label>
          <input
            type="tel"
            inputMode="tel"
            pattern="[0-9]*"
            required
            value={formData.customerPhone}
            onChange={e => {
              setFormData({ ...formData, customerPhone: e.target.value })
              if (fieldErrors.customerPhone) setFieldErrors(prev => ({...prev, customerPhone: ''}))
            }}
            placeholder="WhatsApp number"
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.customerPhone ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`}
          />
          {fieldErrors.customerPhone && (
            <p className="text-[#ED2939] text-xs mt-1">
              <i className="fas fa-exclamation-circle mr-1"></i>
              {fieldErrors.customerPhone}
            </p>
          )}
        </div>
      </div>
    </div>

    {/* ENQUIRY DETAILS */}
    <div>
      <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
        Enquiry Details
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Model Enquired</label>
          <input
            type="text"
            value={formData.modelEnquired}
            onChange={e => setFormData({ ...formData, modelEnquired: e.target.value })}
            placeholder="e.g. iPhone 15, Samsung S24"
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Budget</label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              value={formData.budgetMin}
              onChange={e => setFormData({ ...formData, budgetMin: e.target.value })}
              placeholder="₹"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Budget</label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              value={formData.budgetMax}
              onChange={e => setFormData({ ...formData, budgetMax: e.target.value })}
              placeholder="₹"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select
              value={formData.medium}
              onChange={e => setFormData({ ...formData, medium: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
            >
              <option value="">Select</option>
              <option value="Walk-in">Walk-in</option>
              <option value="Instagram">Instagram</option>
              <option value="YouTube">YouTube</option>
              <option value="Referral">Referral</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Required Within</label>
            <select
              value={formData.requiredWithin}
              onChange={e => setFormData({ ...formData, requiredWithin: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
            >
              <option value="">Select</option>
              <option value="Today">Today</option>
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
              <option value="No Rush">No Rush</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    {/* STATUS & PRIORITY */}
    <div>
      <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
        Status & Priority
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={formData.status}
            onChange={e => setFormData({ ...formData, status: e.target.value })}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
          >
            <option value="Open">Open</option>
            <option value="Follow-up">Follow-up</option>
            <option value="Converted">Converted</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
          <select
            value={formData.seriousness}
            onChange={e => setFormData({ ...formData, seriousness: e.target.value })}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
          >
            <option value="Ordinary">Ordinary</option>
            <option value="Urgent">Urgent</option>
          </select>
        </div>
      </div>
    </div>

    {/* NOTES */}
    <div>
      <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
        Notes
      </p>
      <textarea
        value={formData.notes}
        onChange={e => setFormData({ ...formData, notes: e.target.value })}
        placeholder="Any additional notes..."
        rows={3}
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
      />
    </div>

    {/* SUBMIT BUTTONS */}
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
        disabled={loading}
        className="flex-1 bg-[#002395] text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {loading ? 'Saving...' : initialData ? 'Save Changes' : 'Add Enquiry'}
      </button>
    </div>

  </form>
);
};

export default EnquiryForm;
