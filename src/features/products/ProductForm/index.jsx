import PrinterSelector from '@/features/labels/printing/PrinterSelector';
import { useProductForm } from './useProductForm';
import ProductDetailsSection from './ProductDetailsSection';
import PricingStockSection from './PricingStockSection';
import CompatibleModelsSection from './CompatibleModelsSection';
import PhotoSection from './PhotoSection';
import FormFooter from './FormFooter';

const ProductForm = ({ onSave, onCancel, initialData = null }) => {
  const form = useProductForm({ onSave, initialData });

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
          <form id="product-form" onSubmit={form.handleSubmit} className="space-y-5 pb-4">
            {form.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                {form.error}
              </div>
            )}

            <ProductDetailsSection
              formData={form.formData}
              setFormData={form.setFormData}
              fieldErrors={form.fieldErrors}
              setFieldErrors={form.setFieldErrors}
              nameRef={form.nameRef}
            />
            <PricingStockSection
              formData={form.formData}
              setFormData={form.setFormData}
              fieldErrors={form.fieldErrors}
              setFieldErrors={form.setFieldErrors}
              salePriceRef={form.salePriceRef}
              stockRef={form.stockRef}
            />
            <CompatibleModelsSection
              modelsInput={form.modelsInput}
              setModelsInput={form.setModelsInput}
            />
            <PhotoSection
              formData={form.formData}
              setFormData={form.setFormData}
              handleUpload={form.handleUpload}
            />
          </form>
        </div>

        <FormFooter
          saveStatus={form.saveStatus}
          labelAssigned={form.labelAssigned}
          uploading={form.uploading}
          isProcessing={form.isProcessing}
          initialData={initialData}
          onCancel={onCancel}
          handleSaveAndPrint={form.handleSaveAndPrint}
        />

        <PrinterSelector
          isOpen={form.showPrinterSelector}
          onClose={() => form.setShowPrinterSelector(false)}
          htmlContent={form.labelHTMLContent}
          labelEntry={form.labelEntry}
          title="Print Label"
        />
      </div>
    </div>
  );
};

export default ProductForm;
