const FormFooter = ({ saveStatus, labelAssigned, uploading, isProcessing, initialData, onCancel, handleSaveAndPrint }) => (
  <>
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
  </>
)

export default FormFooter
