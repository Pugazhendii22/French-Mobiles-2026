const PricingStockSection = ({ formData, setFormData, fieldErrors, setFieldErrors, salePriceRef, stockRef }) => (
  <>
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
  </>
)

export default PricingStockSection
