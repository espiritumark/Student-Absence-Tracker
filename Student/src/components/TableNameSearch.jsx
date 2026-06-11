import { SearchOutlined } from '@ant-design/icons'
import { Input } from 'antd'
import { UI } from '../utils/uiCopy'

export default function TableNameSearch({
  value,
  onChange,
  placeholder = UI.tableNameSearchPlaceholder,
  matchCount,
  totalCount,
  className = '',
  showSearchIcon = false,
  compact = false,
}) {
  const hasQuery = Boolean(String(value ?? '').trim())
  const showCount =
    typeof totalCount === 'number' && totalCount > 0 && typeof matchCount === 'number'

  return (
    <div
      className={`table-name-search-bar${compact ? ' table-name-search-bar-compact' : ''} ${className}`.trim()}
    >
      <Input
        size="small"
        allowClear
        variant={showSearchIcon ? 'outlined' : 'borderless'}
        prefix={showSearchIcon ? <SearchOutlined className="table-name-search-icon" /> : null}
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

