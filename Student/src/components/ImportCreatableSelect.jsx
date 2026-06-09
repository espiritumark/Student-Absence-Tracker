import { useMemo, useState } from 'react'
import { Select } from 'antd'

/**
 * Searchable select with roster options plus inline "Use …" for new values.
 * Parent handles confirmation before committing changes.
 */
export default function ImportCreatableSelect({
  options = [],
  value,
  onRequestChange,
  placeholder = 'Search or type…',
  disabled = false,
  numeric = false,
}) {
  const [search, setSearch] = useState('')

  const displayValue =
    value === '' || value == null ? undefined : numeric ? String(value) : String(value)

  const selectOptions = useMemo(() => {
    const base = [...options]
    const current = displayValue

    if (current && !base.some((option) => String(option.value) === current)) {
      base.unshift({ value: current, label: current })
    }

    const trimmed = search.trim()
    if (
      trimmed &&
      !base.some(
        (option) =>
          String(option.value).toLowerCase() === trimmed.toLowerCase() ||
          String(option.label).toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      return [...base, { value: trimmed, label: `Use "${trimmed}"` }]
    }

    return base
  }, [options, displayValue, search])

  const antOptions = useMemo(
    () =>
      selectOptions.map((option) => ({
        value: option.value,
        label: option.label.startsWith('Use "') ? option.label : option.label,
      })),
    [selectOptions],
  )

  function commit(nextValue) {
    if (nextValue == null || nextValue === '') {
      onRequestChange?.('')
      return
    }
    if (numeric) {
      const n = Number(nextValue)
      onRequestChange?.(Number.isFinite(n) ? n : '')
      return
    }
    onRequestChange?.(String(nextValue))
  }

  function handleChange(nextValue) {
    commit(nextValue ?? '')
    setSearch('')
  }

  function handleBlur() {
    const trimmed = search.trim()
    if (trimmed && trimmed.toLowerCase() !== String(value ?? '').toLowerCase()) {
      commit(trimmed)
    }
    setSearch('')
  }

  return (
    <Select
      showSearch
      disabled={disabled}
      placeholder={placeholder}
      value={displayValue}
      options={antOptions}
      optionFilterProp="label"
      filterOption={(input, option) =>
        String(option?.label ?? '')
          .toLowerCase()
          .includes(input.toLowerCase())
      }
      onSearch={setSearch}
      onChange={handleChange}
      onBlur={handleBlur}
      popupMatchSelectWidth
      listHeight={280}
      style={{ width: '100%' }}
    />
  )
}
