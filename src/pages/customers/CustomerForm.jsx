import React, { useState, useRef } from 'react';
import { uploadImageToCloudinary } from '../../utils/uploadImage';

const CustomerForm = ({ initialData, onSave, onCancel }) => {
  const [formData, setFormData] = useState(initialData || {
    name: '',
    phone: '',
    alternatePhone: '',
    email: '',
    address: '',
    idType: '',
    idNumber: '',
    photoUrl: '',
    idProofUrl: '',
    isRegular: false,
    relationship: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingId, setUploadingId] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const nameRef = useRef(null)
  const phoneRef = useRef(null)

  const validateAndScroll = () => {
    const errors = {}
    let firstErrorRef = null

    if (!formData.name) {
      errors.name = 'Name is required'
      if (!firstErrorRef) firstErrorRef = nameRef
    }
    if (!formData.phone) {
      errors.phone = 'Phone is required'
      if (!firstErrorRef) firstErrorRef = phoneRef
    }

    setFieldErrors(errors)

    if (firstErrorRef?.current) {
      firstErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      firstErrorRef.current.focus()
    }

    return Object.keys(errors).length === 0
  }
  const [photoUrl, setPhotoUrl] = useState(initialData?.photoUrl || '');
  const [idProofUrl, setIdProofUrl] = useState(initialData?.idProofUrl || '');

  const handleUpload = async (file, type) => {
    if (!file) return;
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset || cloudName.includes('paste_')) {
      setError("Cloudinary configuration missing in .env");
      return;
    }

    if (type === 'photo') setUploadingPhoto(true);
    else setUploadingId(true);

    const data = new FormData();
    data.append('file', file);
    data.append('upload_preset', uploadPreset);

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: data,
      });
      const fileData = await res.json();
      if (fileData.secure_url) {
        setFormData(prev => ({ ...prev, [type === 'photo' ? 'photoUrl' : 'idProofUrl']: fileData.secure_url }));
      } else {
        throw new Error(fileData.error?.message || 'Upload failed');
      }
    } catch (err) {
      console.error(err);
      setError('Image upload failed: ' + err.message);
    } finally {
      if (type === 'photo') setUploadingPhoto(false);
      else setUploadingId(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploadingPhoto(true);
      const url = await uploadImageToCloudinary(file);
      setPhotoUrl(url);
      setFormData(prev => ({ ...prev, photoUrl: url }));
    } catch (error) {
      alert('Upload failed. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleIdProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploadingId(true);
      const url = await uploadImageToCloudinary(file);
      setIdProofUrl(url);
      setFormData(prev => ({ ...prev, idProofUrl: url }));
    } catch (error) {
      alert('Upload failed. Please try again.');
    } finally {
      setUploadingId(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateAndScroll()) return;
    setLoading(true);
    setError('');
    try {
      await onSave(formData);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const inputClass = "mt-1 block w-full border-2 border-[#e2e8f0] focus:border-[#002395] focus:ring-1 focus:ring-[#002395] rounded-lg p-2.5 outline-none transition-colors text-sm font-medium text-[#0f172a]";
  const labelClass = "block text-sm font-bold text-[#0f172a]";

  return (
  <form onSubmit={handleSubmit} className="space-y-5 pb-4">

    {error && (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
        {error}
      </div>
    )}

    {/* PERSONAL DETAILS */}
    <div>
      <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
        Personal Details
      </p>
      <div className="space-y-3">
        <div ref={nameRef}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-[#ED2939]">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={e => {
              setFormData({ ...formData, name: e.target.value })
              if (fieldErrors.name) setFieldErrors(prev => ({...prev, name: ''}))
            }}
            placeholder="Enter customer name"
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.name ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`}
          />
          {fieldErrors.name && (
            <p className="text-[#ED2939] text-xs mt-1">
              <i className="fas fa-exclamation-circle mr-1"></i>
              {fieldErrors.name}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div ref={phoneRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone <span className="text-[#ED2939]">*</span>
            </label>
            <input
              type="tel"
              inputMode="tel"
              pattern="[0-9]*"
              required
              value={formData.phone}
              onChange={e => {
                setFormData({ ...formData, phone: e.target.value })
                if (fieldErrors.phone) setFieldErrors(prev => ({...prev, phone: ''}))
              }}
              placeholder="WhatsApp number"
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none ${fieldErrors.phone ? 'border-[#ED2939] bg-red-50 focus:border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'}`}
            />
            {fieldErrors.phone && (
              <p className="text-[#ED2939] text-xs mt-1">
                <i className="fas fa-exclamation-circle mr-1"></i>
                {fieldErrors.phone}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alternate Number
            </label>
            <input
              type="tel"
              inputMode="tel"
              pattern="[0-9]*"
              value={formData.alternatePhone}
              onChange={e => setFormData({ ...formData, alternatePhone: e.target.value })}
              placeholder="Optional"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            placeholder="Optional"
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <textarea
            value={formData.address}
            onChange={e => setFormData({ ...formData, address: e.target.value })}
            placeholder="Optional"
            rows={2}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
          />
        </div>
      </div>
    </div>

    {/* ID DETAILS */}
    <div>
      <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
        ID Details
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ID Type</label>
          <select
            value={formData.idType}
            onChange={e => setFormData({ ...formData, idType: e.target.value })}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
          >
            <option value="">Select ID Type</option>
            <option value="Aadhaar">Aadhaar</option>
            <option value="PAN">PAN</option>
            <option value="Driving Licence">Driving Licence</option>
            <option value="Working ID">Working ID</option>
            <option value="Student ID">Student ID</option>
            <option value="Others">Others</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={formData.idNumber}
            onChange={e => setFormData({ ...formData, idNumber: e.target.value })}
            placeholder="Optional"
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395]"
          />
        </div>
      </div>
    </div>

    {/* PHOTOS */}
    <div>
      <p className="text-xs font-bold text-[#002395] uppercase tracking-wide mb-3 border-l-4 border-[#002395] pl-3">
        Photos
      </p>
      <div className="grid grid-cols-2 gap-3">
        
        {/* Customer Photo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Customer Photo
          </label>
          {uploadingPhoto ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl h-28">
              <i className="fas fa-spinner fa-spin text-2xl text-[#002395] mb-1"></i>
              <span className="text-xs text-gray-400">Uploading...</span>
            </div>
          ) : photoUrl ? (
            <div className="relative">
              <img
                src={photoUrl}
                alt="Customer"
                className="w-full h-28 object-cover rounded-xl border border-gray-200"
              />
              <button
                type="button"
                onClick={() => {
                  setPhotoUrl('');
                  setFormData(prev => ({ ...prev, photoUrl: '' }));
                }}
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
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
              <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 bg-gray-50 rounded-xl h-16 cursor-pointer active:scale-95 transition">
                <i className="fas fa-images text-gray-500 text-lg mb-0.5"></i>
                <span className="text-xs text-gray-500 font-medium">Gallery</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {/* ID Proof Photo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ID Proof Photo
          </label>
          {uploadingId ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl h-28">
              <i className="fas fa-spinner fa-spin text-2xl text-[#002395] mb-1"></i>
              <span className="text-xs text-gray-400">Uploading...</span>
            </div>
          ) : idProofUrl ? (
            <div className="relative">
              <img
                src={idProofUrl}
                alt="ID Proof"
                className="w-full h-28 object-cover rounded-xl border border-gray-200"
              />
              <button
                type="button"
                onClick={() => {
                  setIdProofUrl('');
                  setFormData(prev => ({ ...prev, idProofUrl: '' }));
                }}
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
                  onChange={handleIdProofUpload}
                  className="hidden"
                />
              </label>
              <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 bg-gray-50 rounded-xl h-16 cursor-pointer active:scale-95 transition">
                <i className="fas fa-images text-gray-500 text-lg mb-0.5"></i>
                <span className="text-xs text-gray-500 font-medium">Gallery</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleIdProofUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

      </div>
    </div>

    {/* REGULAR CUSTOMER */}
    <div className="bg-[#f8fafc] rounded-xl p-4 border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#0f172a]">Regular Customer</p>
          <p className="text-xs text-gray-400">Gets special discounts</p>
        </div>
        <button
          type="button"
          onClick={() => setFormData({ ...formData, isRegular: !formData.isRegular })}
          className={`relative inline-flex items-center flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
            formData.isRegular ? 'bg-[#002395]' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 ${
              formData.isRegular ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      {formData.isRegular && (
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
          <select
            value={formData.relationship}
            onChange={e => setFormData({ ...formData, relationship: e.target.value })}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#002395] bg-white"
          >
            <option value="">Select</option>
            <option value="Family">Family</option>
            <option value="Close Friend">Close Friend</option>
            <option value="Other">Other</option>
          </select>
        </div>
      )}
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
        {loading ? 'Saving...' : initialData ? 'Save Changes' : 'Add Customer'}
      </button>
    </div>

  </form>
);
};

export default CustomerForm;
