import {
  ABSENCE_VIOLATION_REPORT_LABEL,
  ABSENCE_VIOLATION_REPORT_URL,
} from '../constants/reporting'

export default function ReportViolationNotice({ compact = false }) {
  return (
    <aside
      className={`report-violation-notice ${compact ? 'report-violation-notice-compact' : ''}`}
      role="note"
    >
      <p className="report-violation-lead">
        <strong>Must report</strong> if a student&apos;s absences continue to violate policy.
      </p>
      {!compact && (
        <p className="report-violation-detail muted small">
          Use the official Microsoft Form when follow-up is required (e.g. extended consecutive
          absence or no prior notice).
        </p>
      )}
      <a
        href={ABSENCE_VIOLATION_REPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary btn-sm report-violation-link"
      >
        {ABSENCE_VIOLATION_REPORT_LABEL}
      </a>
    </aside>
  )
}
