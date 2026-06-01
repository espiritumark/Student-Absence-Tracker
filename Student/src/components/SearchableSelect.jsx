import { Select } from 'antd'
import { useMemo } from 'react'
import FormField from './FormField'

/**
 * Searchable dropdown backed by Ant Design Select.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  id,
  label: labelText,
  disabled = false,
  allowEmpty = false,
  emptyLabel = 'All',
}) {
  const selectOptions = useMemo(
    () => (allowEmpty ? [{ value: '', label: emptyLabel }, ...options] : options),
    [allowEmpty, emptyLabel, options],
  )

  const selectValue = allowEmpty && value === '' ? '' : value || undefined

  return (
    <FormField label={labelText}>
      <Select
        showSearch
        allowClear={allowEmpty}
        disabled={disabled}
        placeholder={placeholder}
        value={selectValue}
        options={selectOptions}
        optionFilterProp="label"
        filterOption={(input, option) =>
          String(option?.label ?? '')
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        onChange={(next) => onChange(next ?? '')}
        popupMatchSelectWidth
        listHeight={280}
        style={{ width: '100%' }}
        aria-labelledby={id ? `${id}-label` : undefined}
      />
    </FormField>
  )
}
