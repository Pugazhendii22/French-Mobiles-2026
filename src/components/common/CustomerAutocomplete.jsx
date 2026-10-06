import { useState, useRef, useEffect } from 'react';
import { inputClass, labelClass, errorInput } from '@/shared/ui/uiTokens';

/* ─────────────────────────────────────────────
   FINDING A CUSTOMER

   The customer block is the first thing filled in on a sale, a purchase and a
   service intake - and it was the one block in all three forms that looked like
   it came from somewhere else. Its own labels, its own borders, rounded-md where
   the app is rounded-xl, no focus ring, and indigo on the dropdown rows: a
   colour that appears nowhere else in this app.

   It was also the smallest thing to hit. p-2 made these inputs about 36px tall
   while every other field on the same form is 46px, so the first field a new
   employee touches was the hardest one to touch.

   Now it is built from the same tokens as every other field. The dropdown, which
   was written out twice identically - once under the name, once under the phone -
   is one component used twice.
────────────────────────────────────────────── */

const Required = () => <span className="text-[#ED2939]">*</span>;

/* The matches under a field. Two characters before it says anything: one letter
   matches most of the shop's customers and the list would be noise. */
const Matches = ({ queryLength, customers, onPick }) => (
  <div className="absolute z-50 w-full mt-1 bg-white border border-[#e2e8f0] rounded-xl shadow-lg max-h-60 overflow-y-auto break-words">
    {queryLength < 2 ? (
      <div className="px-4 py-2.5 text-xs text-[#64748b] bg-[#f8fafc]">Keep typing - two letters or digits to search</div>
    ) : customers.length === 0 ? (
      <div className="px-4 py-2.5 text-xs text-[#64748b] bg-[#f8fafc]">
        Nobody by that name or number yet. Carry on typing and they will be added with this sale.
      </div>
    ) : (
      customers.map(c => (
        <div
          key={c.id}
          role="button"
          tabIndex={0}
          className="px-4 py-2.5 hover:bg-[#002395]/5 active:bg-[#002395]/10 cursor-pointer border-b last:border-b-0 border-gray-100"
          onClick={() => onPick(c)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(c); } }}
        >
          <div className="font-semibold text-[#0f172a] text-sm">{c.name}</div>
          <span className="text-[13px] text-green-600 font-semibold block">{c.phone}</span>
        </div>
      ))
    )}
  </div>
);

const CustomerAutocomplete = ({
  customers,
  nameValue,
  phoneValue,
  alternatePhoneValue,
  onNameChange,
  onPhoneChange,
  onAlternatePhoneChange,
  onSelectCustomer,
  nameError,
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

  const pick = (c) => {
    onSelectCustomer(c);
    setShowDropdown(false);
  };

  const filtered = getFilteredCustomers();
  const queryLength = activeInput === 'name' ? nameValue?.length || 0 : phoneValue?.length || 0;

  return (
    <>
      <div className="relative" ref={nameRef}>
        <label className={labelClass}>Customer name <Required /></label>
        <input
          type="text"
          required
          value={nameValue}
          onChange={(e) => handleChange(e, 'name')}
          onFocus={() => handleFocus('name')}
          className={`${inputClass} ${nameError ? errorInput : ''} break-words`}
          placeholder="Name, or search for someone you have served before"
          autoComplete="off"
        />
        {showDropdown && activeInput === 'name' && (
          <Matches queryLength={queryLength} customers={filtered || []} onPick={pick} />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div className="relative" ref={phoneRef}>
          <label className={labelClass}>Mobile number <Required /></label>
          <input
            type="tel"
            inputMode="tel"
            pattern="[0-9]*"
            required
            value={phoneValue}
            onChange={(e) => handleChange(e, 'phone')}
            onFocus={() => handleFocus('phone')}
            className={`${inputClass} break-words`}
            placeholder="Search by number, or type a new one"
            autoComplete="off"
          />
          {showDropdown && activeInput === 'phone' && (
            <Matches queryLength={queryLength} customers={filtered || []} onPick={pick} />
          )}
        </div>
        <div>
          <label className={labelClass}>Another number</label>
          <input
            type="tel"
            inputMode="tel"
            pattern="[0-9]*"
            value={alternatePhoneValue || ''}
            onChange={(e) => onAlternatePhoneChange?.(e.target.value)}
            className={`${inputClass} break-words`}
            placeholder="A second number, or WhatsApp"
          />
        </div>
      </div>
    </>
  );
};

export default CustomerAutocomplete;
