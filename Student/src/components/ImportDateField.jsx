import { DatePicker, Typography } from 'antd'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { dateKey, formatDateLabel } from '../utils/dates'

dayjs.extend(customParseFormat)

const PORTAL_DATE_FORMAT = 'MM/DD/YYYY'

export default function ImportDateField({ value, onChange, disabled = false }) {
  const preview = value ? formatDateLabel(value) : ''

  return (
    <div className="import-date-field">
      <DatePicker
        value={value ? dayjs(value, 'YYYY-MM-DD') : null}
        format={PORTAL_DATE_FORMAT}
        placeholder={PORTAL_DATE_FORMAT}
        disabled={disabled}
        allowClear={false}
        onChange={(picked) => onChange(picked ? picked.format('YYYY-MM-DD') : dateKey())}
        style={{ width: '100%' }}
      />
      {preview ? (
        <Typography.Text type="secondary" className="import-date-preview">
          {preview}
        </Typography.Text>
      ) : null}
    </div>
  )
}
