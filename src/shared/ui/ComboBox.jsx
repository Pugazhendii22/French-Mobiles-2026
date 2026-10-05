import { useState, useRef, useEffect } from 'react'

/* A dropdown you can type into. The list is whatever it is handed; a value
   that matches nothing is still a valid value, because the forms using this
   let the shop add to its own lists by typing. It never corrects what was
   typed - snapping "Redmi 13C" to "Redmi 13" would put the wrong model on an
   invoice. */

const MAX_VISIBLE = 50

const squash = (s) => (s || '').toLowerCase().replace(/\s+/g, '')

const ComboBox = ({
  value, onChange, options = [], placeholder, required, error, inputRef, className = '', id,
}) => {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const query = squash(value)
  const matches = query ? options.filter(o => squash(o).includes(query)) : options
  const visible = matches.slice(0, MAX_VISIBLE)

  const isNew = Boolean((value || '').trim()) && !options.some(o => squash(o) === query)

  const choose = (option) => {
    onChange(option)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      /* Enter confirms what was typed. With nothing typed there is nothing to
         confirm, and with a near-miss the typed value wins - snapping
         "Redmi 13C" to "Redmi 13" would put the wrong model on an invoice. */
      if (query && visible.length === 1 && !isNew) choose(visible[0])
      else setOpen(false)
    }
  }

  const base = 'w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-white'
  const border = error ? 'border-[#ED2939]' : 'border-gray-300 focus:border-[#002395]'

  return (
    <div className="relative" ref={wrapRef}>
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={value || ''}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onKeyDown={onKeyDown}
        className={`${base} ${border} ${className}`}
      />

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {visible.map(option => (
            <div
              key={option}
              role="button"
              tabIndex={0}
              onClick={() => choose(option)}
              className="px-4 py-2.5 text-sm hover:bg-[#002395]/5 active:bg-[#002395]/10 cursor-pointer border-b last:border-b-0 border-gray-100"
            >
              {option}
            </div>
          ))}
          {isNew && (
            <div className="px-4 py-2.5 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">
              New — will be added to the list
            </div>
          )}
          {!visible.length && !isNew && (
            <div className="px-4 py-2.5 text-xs text-gray-400">No options yet</div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-[#ED2939] mt-1">{error}</p>}
    </div>
  )
}

export default ComboBox
