import { Alert, Button } from 'antd'
import { UI, formatLpCount } from '../utils/uiCopy'

export default function ReportViolationNotice({ compact = false, pendingCount = 0, onOpenReporting }) {
  return (
    <Alert
      type="error"
      showIcon
      className={compact ? 'report-violation-notice-compact' : ''}
      title={
        pendingCount > 0
          ? `${formatLpCount(pendingCount)} must be reported on the official form.`
          : `Must report if a ${UI.learningPartner}'s absences continue to violate policy.`
      }
      description={
        compact ? undefined : (
          <>
            Use the Reporting tab to copy {UI.learningPartner} details and submit the Microsoft Form (14+
            consecutive days or 30 days without prior notice).
          </>
        )
      }
      action={
        onOpenReporting && (
          <Button type="primary" size="small" onClick={onOpenReporting}>
            {pendingCount > 0 ? `${UI.openReporting} (${pendingCount})` : UI.openReporting}
          </Button>
        )
      }
    />
  )
}
