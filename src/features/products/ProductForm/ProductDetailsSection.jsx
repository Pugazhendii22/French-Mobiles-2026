import ComboBox from '@/shared/ui/ComboBox'

const ProductDetailsSection = ({ formData, setFormData, fieldErrors, setFieldErrors, nameRef, categoryOptions = [] }) => (
  <>
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
            <ComboBox
              value={formData.category}
              onChange={v => setFormData({ ...formData, category: v })}
              options={categoryOptions}
              placeholder="Select or type a category"
            />
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
  </>
)

export default ProductDetailsSection
