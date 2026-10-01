import { imageThumb } from '@/shared/lib/imageUrl'

const PhotoSection = ({ formData, setFormData, handleUpload }) => (
  <>
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
  </>
)

export default PhotoSection
