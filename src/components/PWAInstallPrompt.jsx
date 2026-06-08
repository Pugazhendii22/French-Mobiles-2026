import React, { useState, useEffect } from 'react';

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('pwaPromptDismissed')) {
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    
    const { outcome } = await deferredPrompt.userChoice;
    
    setDeferredPrompt(null);
    setShowPrompt(false);
    sessionStorage.setItem('pwaPromptDismissed', 'true');
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem('pwaPromptDismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 flex justify-between items-center z-50 shadow-lg break-words">
      <div className="text-sm font-medium pr-4">
        Install French Mobiles app for better experience
      </div>
      <div className="flex space-x-3 shrink-0">
        <button 
          onClick={handleDismiss} 
          className="text-gray-400 hover:text-white px-2 py-1 text-sm font-medium transition-colors"
        >
          Dismiss
        </button>
        <button 
          onClick={handleInstallClick} 
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm break-words"
        >
          Install
        </button>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
