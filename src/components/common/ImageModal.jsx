import React from 'react';

const ImageModal = ({ isOpen, onClose, imageUrl, title = 'View Image' }) => {
  if (!isOpen || !imageUrl) return null;

  const handleDownload = (e) => {
    e.stopPropagation();
    // Open image in a new tab for native save/download or zoom
    window.open(imageUrl, '_blank');
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-4 transition-all duration-300 animate-fade-in"
      onClick={onClose}
    >
      {/* Top Header Controls */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent text-white z-10">
        <h3 className="text-base font-semibold truncate max-w-[70%]">{title}</h3>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleDownload}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white px-3.5 py-1.5 rounded-full text-xs font-semibold"
            title="Open in new tab / Download"
          >
            <i className="fas fa-external-link-alt"></i> Open Original
          </button>
          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center text-white"
            title="Close"
          >
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>
      </div>

      {/* Image Container */}
      <div 
        className="relative max-w-full max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img 
          src={imageUrl} 
          alt={title} 
          className="max-w-[95vw] max-h-[80vh] object-contain rounded-lg shadow-2xl border border-white/10"
        />
      </div>

      {/* Tip helper */}
      <p className="text-white/40 text-[10px] mt-4 select-none">
        Click anywhere outside the image to close.
      </p>
    </div>
  );
};

export default ImageModal;
