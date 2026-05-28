import { useEffect, useRef, useState } from 'react'

/**
 * A keyboard-accessible searchable dropdown.
 * Props:
 *   options: [{ value, label }]  — should already be sorted by caller
 *   value: string
 *   onChange: (value) => void
 *   placeholder?: string
 *   id?: string
 *   label?: string   — if provided, renders a <label> above
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  id,
  label: labelText,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const containerRef = useRef(null)

  const selected = options.find((o) => o.value === value)

  const filtered = query
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()),
      )
    : options

  function openDropdown() {
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function pick(val) {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  useEffect(() => {
    if (!open) return
    function onOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const inputId = id || `ss-${Math.random().toString(36).slice(2)}`

  return (
    <div className="ss-wrapper" ref={containerRef}>
      {labelText && (
        <label className="ss-label" htmlFor={inputId}>
          {labelText}
        </label>
      )}
      {open ? (
        <div className="ss-open">
          <input
            ref={inputRef}
            id={inputId}
            className="ss-input"
            type="text"
            value={query}
            placeholder={placeholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-autocomplete="list"
            aria-expanded="true"
          />
          {filtered.length > 0 && (
            <ul ref={listRef} className="ss-list" role="listbox">
              {filtered.map((o) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  className={`ss-option ${o.value === value ? 'ss-option-selected' : ''}`}
                  onMouseDown={() => pick(o.value)}
                >
                  {o.label}
                </li>
              ))}
            </ul>
          )}
          {filtered.length === 0 && (
            <p className="ss-empty">No matches</p>
          )}
        </div>
      ) : (
        <button
          type="button"
          id={inputId}
          className="ss-trigger"
          onClick={openDropdown}
          aria-haspopup="listbox"
          aria-expanded="false"
        >
          <span className={selected ? '' : 'ss-placeholder'}>
            {selected ? selected.label : placeholder}
          </span>
          <svg className="ss-chevron" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  )
}
