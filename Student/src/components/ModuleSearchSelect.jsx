import { useMemo, useState } from 'react'
import { Select } from 'antd'
import { formatModuleLabel } from '../utils/sessionKeys'
import FormField from './FormField'

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
  emptyLabel = 'All Modules',
}) {
  const [search, setSearch] = useState('')

  const selectOptions = useMemo(() => {
    const base = allowEmpty
      ? [{ value: '', label: emptyLabel }, ...options]
      : [...options]

    const trimmed = search.trim()
    if (
      trimmed &&
      !base.some(
        (option) =>
          option.value.toLowerCase() === trimmed.toLowerCase() ||
          option.label.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      return [...base, { value: trimmed, label: `Use "${trimmed}"` }]
    }

    return base
  }, [options, allowEmpty, emptyLabel, search])

  const antOptions = useMemo(
    () =>
      selectOptions.map((option) => ({
        value: option.value,
        label:
          option.value === '' || option.label.startsWith('Use "')
            ? option.label
            : formatModuleLabel(option.value) || option.label,
      })),
    [selectOptions],
  )

  function commit(nextValue) {
    onChange?.(nextValue)
    onCommit?.(nextValue)
  }

  function handleChange(nextValue) {
    commit(nextValue ?? '')
    setSearch('')
  }

  function handleBlur() {
    const trimmed = search.trim()
    if (trimmed && trimmed.toLowerCase() !== String(value).toLowerCase()) {
      commit(trimmed)
    }
    setSearch('')
  }

  const selectValue = allowEmpty && value === '' ? '' : value || undefined

  return (
    <FormField label={label}>
      <Select
        showSearch
        allowClear={allowEmpty}
        disabled={disabled}
        placeholder={placeholder}
        value={selectValue}
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
    </FormField>
  )
}
