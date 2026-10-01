/* ─────────────────────────────────────────────
   SHARED UI KIT
   The design language introduced on the Second-Hand screens, in one place
   so every page stays consistent. Presentation only - no data, no logic.
────────────────────────────────────────────── */

/* White card with an icon-chip heading. The building block of every screen. */
export const Section = ({ icon, title, hint, action, tone = 'brand', children }) => {
  const toneClass = tone === 'danger'
    ? 'bg-[#ED2939]/10 text-[#ED2939]'
    : 'bg-[#002395]/10 text-[#002395]';
  return (
    <section className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toneClass}`}>
            <i className={`fas ${icon} text-sm`}></i>
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#0f172a] leading-tight">{title}</h3>
            {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
};

export const FieldError = ({ message }) =>
  message ? (
    <p className="text-[#ED2939] text-xs mt-1.5">
      <i className="fas fa-exclamation-circle mr-1"></i>
      {message}
    </p>
  ) : null;

/* Label above value - the read-only counterpart of a form field */
export const InfoRow = ({ label, value, href, mono = false }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-gray-400">{label}</p>
      {href ? (
        <a href={href} className="font-semibold text-green-600 text-sm block break-all">{value}</a>
      ) : (
        <p className={`font-semibold text-[#0f172a] text-sm ${mono ? 'break-all' : ''}`}>{value}</p>
      )}
    </div>
  );
};

export const InfoGrid = ({ children }) => (
  <div className="grid grid-cols-2 gap-3">{children}</div>
);

export const Chip = ({ children, className = 'bg-gray-100 text-gray-600' }) => (
  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${className}`}>{children}</span>
);

/* Amount line for totals blocks; `strong` promotes it to the bottom-line row */
export const MoneyRow = ({ label, value, strong = false, tone, divider = false }) => (
  <div className={`flex justify-between ${divider ? 'border-t border-gray-200 pt-2 mt-2' : ''} ${
    strong ? 'text-base font-bold' : 'text-sm'
  } ${tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-[#ED2939]' : ''}`}>
    <span className={strong ? '' : 'text-gray-500'}>{label}</span>
    <span className={strong ? '' : 'font-medium'}>{value}</span>
  </div>
);

/* Bottom-sheet shell: full height on phones, centred dialog on desktop. */
export const Sheet = ({ title, subtitle, badge, onClose, footer, children }) => (
  <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center animate-fade-in">
    <div className="bg-[#f1f5f9] w-full md:max-w-2xl md:mx-auto rounded-t-3xl md:rounded-2xl flex flex-col h-[94dvh] md:h-auto md:max-h-[90vh] overflow-hidden">

      <div className="md:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0 bg-white">
        <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
      </div>

      <div className="flex-shrink-0 px-4 pt-2 pb-3 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#0f172a] truncate">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {badge}
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 active:bg-gray-100"
              aria-label="Close"
            >
              <i className="fas fa-times text-lg"></i>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">{children}</div>

      {footer && (
        <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white pb-safe space-y-2">
          {footer}
        </div>
      )}
    </div>
  </div>
);

/* Search + segmented status filter, shared by the list screens */
export const SearchBar = ({ value, onChange, onClear, placeholder, id }) => (
  <div className="relative">
    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
    <input
      id={id}
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full pl-11 pr-10 py-3 border border-[#e2e8f0] focus:border-[#002395] rounded-2xl bg-white focus:outline-none transition-colors text-sm text-[#0f172a] shadow-sm"
    />
    {value && (
      <button
        onClick={onClear}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center"
        aria-label="Clear search"
      >
        <i className="fas fa-times text-xs"></i>
      </button>
    )}
  </div>
);

export const Segmented = ({ options, value, onChange, colorFor }) => (
  <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-[#e2e8f0]">
    {options.map(opt => {
      const val = typeof opt === 'string' ? opt : opt.value;
      const label = typeof opt === 'string' ? opt.charAt(0).toUpperCase() + opt.slice(1) : opt.label;
      return (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition truncate ${
            value === val ? (colorFor ? colorFor(val) : 'bg-[#002395] text-white') : 'text-[#64748b]'
          }`}
        >
          {label}
        </button>
      );
    })}
  </div>
);

/* Collapsible panel used for the date filters */
export const CollapsibleFilter = ({ open, onToggle, active, label = 'Filter by date', children }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] overflow-hidden">
    <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3">
      <span className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
        <i className="fas fa-calendar-alt text-[#002395] text-xs"></i>
        {label}
        {active && <span className="bg-[#002395] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">On</span>}
      </span>
      <i className={`fas fa-chevron-down text-gray-300 text-xs transition-transform ${open ? 'rotate-180' : ''}`}></i>
    </button>
    {open && <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">{children}</div>}
  </div>
);

export const EmptyState = ({ icon = 'fa-inbox', title, hint }) => (
  <div className="text-center py-16 bg-white rounded-2xl border border-[#e2e8f0]">
    <i className={`fas ${icon} text-4xl text-gray-200 mb-3 block`}></i>
    <p className="text-gray-500 font-semibold text-sm">{title}</p>
    {hint && <p className="text-gray-400 text-xs mt-1">{hint}</p>}
  </div>
);

export const ListSkeleton = ({ count = 5, height = 'h-28' }) => (
  <div className="space-y-3">
    {[...Array(count)].map((_, i) => (
      <div key={i} className={`bg-white rounded-2xl ${height} animate-pulse`} />
    ))}
  </div>
);
