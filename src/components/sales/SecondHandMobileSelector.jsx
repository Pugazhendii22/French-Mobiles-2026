import React, { useState, useMemo, useRef, useEffect } from 'react';

const SecondHandMobileSelector = ({
  mobiles = [],
  selectedId = '',
  onSelect,
  alreadySelectedIds = [],
  hasError = false
}) => {
  const [isOpen, setIsOpen] = useState(!selectedId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const searchInputRef = useRef(null);

  // Synchronize isOpen if selectedId becomes empty
  useEffect(() => {
    if (!selectedId) {
      setIsOpen(true);
    }
  }, [selectedId]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Find the currently selected device
  const selectedMobile = useMemo(() => {
    return mobiles.find(m => m.id === selectedId);
  }, [mobiles, selectedId]);

  // Dynamically extract unique brands with counts
  const brandList = useMemo(() => {
    const counts = {};
    mobiles.forEach(m => {
      const b = (m.brand || 'Other').trim();
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.keys(counts)
      .sort((a, b) => a.localeCompare(b))
      .map(brand => ({
        name: brand,
        count: counts[brand]
      }));
  }, [mobiles]);

  // Filter and sort available mobiles
  const filteredMobiles = useMemo(() => {
    let result = [...mobiles];

    // 1. Filter by Brand
    if (selectedBrand !== 'all') {
      result = result.filter(m => (m.brand || 'Other').trim().toLowerCase() === selectedBrand.toLowerCase());
    }

    // 2. Filter by Search Query
    if (searchQuery.trim()) {
      const tokens = searchQuery.trim().toLowerCase().split(/\s+/);
      result = result.filter(m => {
        const textToSearch = [
          m.brand,
          m.model,
          m.imei1,
          m.imei2,
          m.serialNumber,
          m.ram,
          m.rom,
          m.color,
          m.condition,
          m.assignedLabelNumber,
          m.labelNumber ? `#${m.labelNumber}` : '',
          m.salePrice ? `₹${m.salePrice} ${m.salePrice}` : ''
        ].filter(Boolean).join(' ').toLowerCase();

        return tokens.every(token => textToSearch.includes(token));
      });
    }

    // 3. Sort Options
    result.sort((a, b) => {
      if (sortBy === 'price_asc') {
        return (Number(a.salePrice) || 0) - (Number(b.salePrice) || 0);
      }
      if (sortBy === 'price_desc') {
        return (Number(b.salePrice) || 0) - (Number(a.salePrice) || 0);
      }
      if (sortBy === 'name_asc') {
        const nameA = `${a.brand || ''} ${a.model || ''}`.trim().toLowerCase();
        const nameB = `${b.brand || ''} ${b.model || ''}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      }
      if (sortBy === 'name_desc') {
        const nameA = `${a.brand || ''} ${a.model || ''}`.trim().toLowerCase();
        const nameB = `${b.brand || ''} ${b.model || ''}`.trim().toLowerCase();
        return nameB.localeCompare(nameA);
      }
      // 'newest' default
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return result;
  }, [mobiles, selectedBrand, searchQuery, sortBy]);

  const renderGradeBadge = (condition) => {
    if (!condition) return null;
    const g = String(condition).toUpperCase();
    const styles = {
      A: 'bg-green-100 text-green-800 border-green-200',
      B: 'bg-blue-100 text-blue-800 border-blue-200',
      C: 'bg-amber-100 text-amber-800 border-amber-200',
      D: 'bg-rose-100 text-rose-800 border-rose-200'
    }[g] || 'bg-gray-100 text-gray-800 border-gray-200';

    return (
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${styles}`}>
        Grade {g}
      </span>
    );
  };

  const handleSelectDevice = (mobile) => {
    if (alreadySelectedIds.includes(mobile.id)) return;
    onSelect(mobile.id);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClearSelection = (e) => {
    e.stopPropagation();
    onSelect('');
    setIsOpen(true);
  };

  return (
    <div className="w-full">
      {/* Hidden input for standard HTML form required validation */}
      <input
        type="text"
        required
        value={selectedId || ''}
        onChange={() => {}}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* 1. COLLAPSED VIEW: A device is currently selected */}
      {selectedMobile && !isOpen ? (
        <div className={`bg-white rounded-xl border-2 ${hasError ? 'border-[#ED2939]' : 'border-[#002395]/40'} p-3 shadow-sm transition hover:border-[#002395]`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#002395]/10 text-[#002395] flex items-center justify-center flex-shrink-0 text-base">
                <i className="fas fa-mobile-alt"></i>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-[#0f172a] text-sm leading-snug">
                    {selectedMobile.brand} {selectedMobile.model}
                  </h4>
                  {renderGradeBadge(selectedMobile.condition)}
                  {selectedMobile.assignedLabelNumber && (
                    <span className="text-[11px] bg-gray-100 text-gray-600 font-mono px-1.5 py-0.5 rounded font-medium">
                      #{selectedMobile.assignedLabelNumber}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 flex-wrap">
                  {(selectedMobile.rom || selectedMobile.ram) && (
                    <span>{selectedMobile.ram ? `${selectedMobile.ram} / ` : ''}{selectedMobile.rom || ''}</span>
                  )}
                  {selectedMobile.color && <span>• {selectedMobile.color}</span>}
                  <span>• IMEI: <span className="font-mono text-gray-700 font-medium">{selectedMobile.imei1 || selectedMobile.imei2 || 'N/A'}</span></span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-right mr-1">
                <span className="text-base font-bold text-[#002395]">
                  ₹{Number(selectedMobile.salePrice || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="bg-[#002395]/10 hover:bg-[#002395]/20 text-[#002395] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                title="Change selected device"
              >
                <i className="fas fa-exchange-alt"></i>
                <span>Change</span>
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-gray-400 hover:text-[#ED2939] p-1.5 rounded-lg transition"
                title="Remove device"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 2. EXPANDED SEARCH & SELECTION PANEL */
        <div className={`bg-white rounded-xl border-2 ${hasError ? 'border-[#ED2939]' : 'border-[#002395]'} p-3 shadow-md space-y-2.5`}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#002395] uppercase tracking-wider flex items-center gap-1.5">
                <i className="fas fa-search"></i> Select Second-Hand Mobile
              </span>
              <span className="text-[11px] bg-blue-50 text-[#002395] font-semibold px-2 py-0.5 rounded-full">
                {mobiles.length} available
              </span>
            </div>
            {selectedMobile && (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-0.5 rounded transition"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Search bar */}
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by brand, model, IMEI, specs, label #..."
              className="w-full pl-9 pr-8 py-2 bg-gray-50 hover:bg-white focus:bg-white border border-gray-300 focus:border-[#002395] rounded-xl text-xs font-medium text-gray-800 focus:outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 text-xs"
              >
                <i className="fas fa-times-circle"></i>
              </button>
            )}
          </div>

          {/* Sort & Filters Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-gray-100">
            {/* Quick Brand Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin text-xs">
              <button
                type="button"
                onClick={() => setSelectedBrand('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  selectedBrand === 'all'
                    ? 'bg-[#002395] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All ({mobiles.length})
              </button>
              {brandList.map(b => (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => setSelectedBrand(b.name)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    selectedBrand.toLowerCase() === b.name.toLowerCase()
                      ? 'bg-[#002395] text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {b.name} ({b.count})
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 flex-shrink-0 self-end sm:self-auto">
              <span className="text-[11px] text-gray-500 font-medium flex items-center gap-1">
                <i className="fas fa-sort-amount-down text-[#002395]"></i> Sort:
              </span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-300 rounded-lg px-2 py-1 font-medium text-gray-700 focus:outline-none focus:border-[#002395]"
              >
                <option value="newest">Recently Added</option>
                <option value="price_asc">Price: Low to High (₹ ↑)</option>
                <option value="price_desc">Price: High to Low (₹ ↓)</option>
                <option value="name_asc">Brand & Model (A - Z)</option>
                <option value="name_desc">Brand & Model (Z - A)</option>
              </select>
            </div>
          </div>

          {/* Results List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {mobiles.length === 0 ? (
              <div className="p-6 text-center text-gray-400">
                <i className="fas fa-box-open text-2xl mb-1 block"></i>
                <p className="text-xs">No second-hand mobiles available in inventory.</p>
              </div>
            ) : filteredMobiles.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <i className="fas fa-search text-2xl text-gray-300 block"></i>
                <p className="text-xs text-gray-500">No mobiles match "{searchQuery}"</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedBrand('all');
                  }}
                  className="text-xs text-[#002395] font-semibold underline"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              filteredMobiles.map(m => {
                const isAlreadySelected = alreadySelectedIds.includes(m.id);
                const isCurrent = m.id === selectedId;

                return (
                  <div
                    key={m.id}
                    onClick={() => !isAlreadySelected && handleSelectDevice(m)}
                    className={`p-2.5 flex items-center justify-between gap-2 transition ${
                      isAlreadySelected
                        ? 'bg-gray-50 opacity-50 cursor-not-allowed'
                        : isCurrent
                        ? 'bg-blue-50/80 cursor-pointer'
                        : 'hover:bg-blue-50/50 cursor-pointer'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[#0f172a] text-xs">
                          {m.brand} {m.model}
                        </span>
                        {renderGradeBadge(m.condition)}
                        {m.assignedLabelNumber && (
                          <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            #{m.assignedLabelNumber}
                          </span>
                        )}
                        {isAlreadySelected && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            Already Added
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        {(m.ram || m.rom) && (
                          <span>{m.ram ? `${m.ram}/` : ''}{m.rom}</span>
                        )}
                        {m.color && <span>• {m.color}</span>}
                        <span>• IMEI: <span className="font-mono text-gray-700">{m.imei1 || m.imei2 || 'N/A'}</span></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 text-right">
                      <div>
                        <div className="font-bold text-xs text-[#002395]">
                          ₹{Number(m.salePrice || 0).toLocaleString('en-IN')}
                        </div>
                        {Number(m.repairCost) > 0 && (
                          <div className="text-[10px] text-orange-600">
                            +₹{m.repairCost} rep
                          </div>
                        )}
                      </div>
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
                        isCurrent
                          ? 'bg-[#002395] text-white'
                          : isAlreadySelected
                          ? 'bg-gray-200 text-gray-400'
                          : 'bg-gray-100 text-[#002395] group-hover:bg-[#002395] group-hover:text-white'
                      }`}>
                        <i className={`fas ${isCurrent ? 'fa-check' : 'fa-plus'}`}></i>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer info */}
          <div className="flex items-center justify-between text-[11px] text-gray-500 px-1 pt-1">
            <span>Showing {filteredMobiles.length} of {mobiles.length} devices</span>
            {searchQuery && (
              <span>Filtered by "{searchQuery}"</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SecondHandMobileSelector;
