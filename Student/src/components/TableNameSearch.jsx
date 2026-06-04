import { Input } from 'antd'
import { UI } from '../utils/uiCopy'

export default function TableNameSearch({
  value,
  onChange,
  placeholder = UI.tableNameSearchPlaceholder,
  matchCount,
  totalCount,
  className = '',
}) {
  const hasQuery = Boolean(String(value ?? '').trim())
  const showCount =
    typeof totalCount === 'number' && totalCount > 0 && typeof matchCount === 'number'

  return (
    <div className={`table-name-search-bar ${className}`.trim()}>
      <Input
        size="small"
        allowClear
        bordered={false}
        className="table-name-search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
        title={UI.tableNameSearchFuzzyHint}
        suffix={
          showCount ? (
            <span className="table-name-search-count" aria-live="polite">
              {hasQuery ? `${matchCount}/${totalCount}` : totalCount}
            </span>
          ) : null
        }
      />
    </div>
  )
}
