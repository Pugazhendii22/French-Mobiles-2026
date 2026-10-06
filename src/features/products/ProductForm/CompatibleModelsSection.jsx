const CompatibleModelsSection = ({ modelsInput, setModelsInput }) => (
  <>
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
  </>
)

export default CompatibleModelsSection
