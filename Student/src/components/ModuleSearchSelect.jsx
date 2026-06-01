import { useEffect, useMemo, useRef, useState } from 'react'
import { formatModuleLabel } from '../utils/sessionKeys'

/**
 * Searchable module picker — pick from known modules or type a new one.
 */
export default function ModuleSearchSelect({
  options = [],
  value = '',
  onChange,
  onCommit,
  placeholder = 'Search or type module…',
  label,
  disabled = false,
  allowEmpty = false,
  emptyLabel = 'All modules',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const displayValue = value ? formatModuleLabel(value) : allowEmpty ? emptyLabel : ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = allowEmpty
      ? [{ value: '', label: emptyLabel }, ...options]
      : options
    if (!q) return base
    return base.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query, allowEmpty, emptyLabel])

  const trimmedQuery = query.trim()
  const showCustomOption =
    trimmedQuery &&
    !filtered.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase())

  function close() {
    setOpen(false)
    setQuery('')
  }

  function pick(nextValue) {
    onChange?.(nextValue)
    onCommit?.(nextValue)
    close()
  }

  function openDropdown() {
    if (disabled) return
    setOpen(true)
    setQuery(value || '')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function commitCustom() {
    if (!trimmedQuery) return
    pick(trimmedQuery)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      close()
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (showCustomOption) {
        commitCustom()
        return
      }
      if (filtered.length === 1) {
        pick(filtered[0].value)
      }
    }
  }

  useEffect(() => {
    if (disabled) close()
  }, [disabled])

  useEffect(() => {
    if (!open) return undefined
    function onOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        if (trimmedQuery && trimmedQuery !== value) {
          onChange?.(trimmedQuery)
          onCommit?.(trimmedQuery)
        }
        close()
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open, trimmedQuery, value, onChange, onCommit])

  const inputId = `module-ss-${Math.random().toString(36).slice(2)}`

  return (
    <div className="ss-wrapper module-search-select" ref={containerRef}>
      {label && (
        <label className="ss-label" htmlFor={inputId}>
          {label}
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
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-autocomplete="list"
            aria-expanded="true"
          />
          <ul className="ss-list" role="listbox">
            {filtered.map((o) => (
              <li
                key={o.value || '__empty__'}
                role="option"
                aria-selected={o.value === value}
                className={`ss-option ${o.value === value ? 'ss-option-selected' : ''}`}
                onMouseDown={() => pick(o.value)}
              >
                {o.label}
              </li>
            ))}
            {showCustomOption && (
              <li
                role="option"
                className="ss-option ss-option-custom"
                onMouseDown={commitCustom}
              >
                Use &ldquo;{trimmedQuery}&rdquo;
              </li>
            )}
            {filtered.length === 0 && !showCustomOption && (
              <li className="ss-empty-item">No matches</li>
            )}
          </ul>
        </div>
      ) : (
        <button
          type="button"
          id={inputId}
          className="ss-trigger ss-trigger-compact"
          disabled={disabled}
          onClick={openDropdown}
          title={displayValue || placeholder}
          aria-haspopup="listbox"
          aria-expanded="false"
        >
          <span className={displayValue ? 'ss-trigger-text' : 'ss-placeholder'}>
            {displayValue || placeholder}
          </span>
          <svg className="ss-chevron" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  )
}
