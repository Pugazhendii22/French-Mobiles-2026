import { useState, useRef, useEffect } from 'react';

const CustomerAutocomplete = ({ 
  customers, 
  nameValue, 
  phoneValue, 
  alternatePhoneValue,
  onNameChange, 
  onPhoneChange, 
  onAlternatePhoneChange,
  onSelectCustomer 
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeInput, setActiveInput] = useState(''); // 'name' or 'phone'
  const nameRef = useRef(null);
  const phoneRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (nameRef.current && !nameRef.current.contains(event.target) && 
          phoneRef.current && !phoneRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getFilteredCustomers = () => {
    const query = activeInput === 'name' ? nameValue : phoneValue;
    if (!query || query.length < 2) return null;

    const lowerQuery = query.toLowerCase().replace(/\s+/g, '');
    
    const filtered = customers.filter(c => {
      const nameMatch = (c.name || '').toLowerCase().replace(/\s+/g, '').includes(lowerQuery);
      const phoneMatch = (c.phone || '').toLowerCase().replace(/\s+/g, '').includes(lowerQuery);
      return nameMatch || phoneMatch;
    }).slice(0, 10);
    
    return filtered;
  };

  const handleFocus = (type) => {
    setActiveInput(type);
    setShowDropdown(true);
  };

  const handleChange = (e, type) => {
    setActiveInput(type);
    setShowDropdown(true);
    if (type === 'name') onNameChange(e.target.value);
    if (type === 'phone') onPhoneChange(e.target.value);
  };

  const filtered = getFilteredCustomers();
  const queryLength = activeInput === 'name' ? nameValue?.length || 0 : phoneValue?.length || 0;

  return (
    <>
      <div className="relative" ref={nameRef}>
        <label className="block text-sm font-medium text-gray-700">Customer Name *</label>
        <input 
          type="text" 
          required 
          value={nameValue} 
          onChange={(e) => handleChange(e, 'name')} 
          onFocus={() => handleFocus('name')}
          className="mt-1 block w-full border border-gray-300 rounded-md p-2 break-words" 
          placeholder="Enter customer name"
          autoComplete="off"
        />
        {showDropdown && activeInput === 'name' && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto break-words">
            {queryLength < 2 ? (
              <div className="p-2 text-sm text-gray-500 bg-gray-50 border-b">Type at least 2 characters</div>
            ) : filtered.length === 0 ? (
              <div className="p-2 text-sm text-gray-500 bg-gray-50 border-b">No customers found</div>
            ) : (
              filtered.map(c => (
                <div 
                  key={c.id} 
                  role="button"
                  tabIndex={0}
                  className="p-3 hover:bg-indigo-50 active:bg-indigo-100 cursor-pointer border-b last:border-b-0"
                  onClick={() => {
                    onSelectCustomer(c);
                    setShowDropdown(false);
                  }}
                >
                  <div className="font-medium text-gray-900">{c.name}</div>
                  <span className="text-sm text-green-600 font-semibold block">{c.phone}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="relative" ref={phoneRef}>
          <label className="block text-sm font-medium text-gray-700">Customer Phone (Search/Add) *</label>
          <input 
            type="tel" 
            inputMode="tel"
            pattern="[0-9]*"
            required 
            value={phoneValue} 
            onChange={(e) => handleChange(e, 'phone')} 
            onFocus={() => handleFocus('phone')}
            className="mt-1 block w-full border border-gray-300 rounded-md p-2 break-words" 
            placeholder="Enter mobile number" 
            autoComplete="off"
          />
          {showDropdown && activeInput === 'phone' && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto break-words">
              {queryLength < 2 ? (
                <div className="p-2 text-sm text-gray-500 bg-gray-50 border-b">Type at least 2 characters</div>
              ) : filtered.length === 0 ? (
                <div className="p-2 text-sm text-gray-500 bg-gray-50 border-b">No customers found</div>
              ) : (
                filtered.map(c => (
                  <div 
                    key={c.id} 
                    role="button"
                    tabIndex={0}
                    className="p-3 hover:bg-indigo-50 active:bg-indigo-100 cursor-pointer border-b last:border-b-0"
                    onClick={() => {
                      onSelectCustomer(c);
                      setShowDropdown(false);
                    }}
                  >
                    <div className="font-medium text-gray-900">{c.name}</div>
                    <span className="text-sm text-green-600 font-semibold block">{c.phone}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Alternate Number</label>
          <input
            type="tel"
            inputMode="tel"
            pattern="[0-9]*"
            value={alternatePhoneValue || ''}
            onChange={(e) => onAlternatePhoneChange?.(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md p-2 break-words"
            placeholder="Alternate / WhatsApp number"
          />
        </div>
      </div>

    </>
  );
};

export default CustomerAutocomplete;
