import { UI, formatLpCount } from '../utils/uiCopy'

export default function ImportReviewTableSummary({ students }) {
  const total = students.length
  if (total === 0) return null

  const absentCount = students.filter((s) => !s.present).length
  const presentCount = total - absentCount
  const partnerLabel = total === 1 ? UI.learningPartner : UI.learningPartners

  return (
    <div
      className="import-review-toolbar-summary"
      aria-live="polite"
      aria-label={`${formatLpCount(total)}, ${presentCount} Present, ${absentCount} Absent`}
    >
      <div className="import-review-summary-strip">
        <div className="import-review-summary-item import-review-summary-item-total">
          <span className="import-review-summary-value">{total}</span>
          <span className="import-review-summary-label">{partnerLabel}</span>
        </div>
        <span className="import-review-summary-sep" aria-hidden="true" />
        <div className="import-review-summary-item import-review-summary-item-present">
          <span className="import-review-summary-value">{presentCount}</span>
          <span className="import-review-summary-label">Present</span>
        </div>
        <span className="import-review-summary-sep" aria-hidden="true" />
        <div
          className={`import-review-summary-item import-review-summary-item-absent${
            absentCount > 0 ? ' import-review-summary-item-absent-active' : ''
          }`}
        >
          <span className="import-review-summary-value">{absentCount}</span>
          <span className="import-review-summary-label">Absent</span>
        </div>
      </div>
    </div>
  )
}
