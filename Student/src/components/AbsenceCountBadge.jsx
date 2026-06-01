import { Flex, Space, Tag, Typography } from 'antd'
import { getOverallAbsenceRisk, hasAbsenceNumbers, RISK_META } from '../utils/absenceRisk'

export function AbsenceCountBadge({ counts, showManual = true, size = 'md', placeholder = false }) {
  const hasNumbers = counts && hasAbsenceNumbers(counts)

  if (!hasNumbers) {
    if (!placeholder) return null
    return (
      <Typography.Text type="secondary" className={`absence-tag-placeholder absence-tag-${size}`}>
        —
      </Typography.Text>
    )
  }

  const risk = getOverallAbsenceRisk(counts)
  const meta = RISK_META[risk]
  const hasManual = counts.usesManualTotal || counts.usesManualConsecutive

  return (
    <Flex gap={4} wrap="wrap" align="center" className={`absence-tag-group absence-tag-${size}`}>
      <Tag
        bordered={false}
        className={`absence-risk-tag absence-risk-tag-${risk}`}
        title={meta.description}
      >
        {meta.shortLabel}
      </Tag>
      <Tag>
        <strong>{counts.total}</strong> Total
      </Tag>
      {counts.consecutive > 0 && (
        <Tag>
          <strong>{counts.consecutive}</strong> Days
        </Tag>
      )}
      {showManual && hasManual && <Tag color="processing">Manual</Tag>}
    </Flex>
  )
}

export function AbsenceRiskLegend({ compact = false }) {
  const tiers = ['safe', 'watch', 'warning', 'critical']

  return (
    <Flex
      wrap="wrap"
      gap={8}
      align="center"
      className={`risk-legend ${compact ? 'risk-legend-compact risk-legend-inline' : ''}`}
    >
      {tiers.map((tier) => (
        <Flex key={tier} gap={6} align="center">
          <Tag bordered={false} className={`absence-risk-tag absence-risk-tag-${tier}`}>
            {RISK_META[tier].label}
          </Tag>
          {!compact && (
            <Typography.Text type="secondary" style={{ fontSize: '0.85rem' }}>
              {RISK_META[tier].description}
            </Typography.Text>
          )}
        </Flex>
      ))}
    </Flex>
  )
}

const DASHBOARD_RISK_TIERS = ['watch', 'warning', 'critical']

export function DashboardRiskSummary({ activeTiers, showReportRequired = false }) {
  return (
    <div className="dashboard-risk-summary" aria-label="Risk level key">
      {DASHBOARD_RISK_TIERS.map((tier) => {
        const active = Boolean(activeTiers?.[tier])
        return (
          <Tag
            key={tier}
            bordered={false}
            className={`absence-risk-tag absence-risk-tag-${tier}${active ? '' : ' absence-risk-tag-inactive'}`}
            title={RISK_META[tier].description}
          >
            {RISK_META[tier].label}
          </Tag>
        )
      })}
      {showReportRequired ? (
        <Tag bordered={false} className="dashboard-student-report-tag" title="Must be reported on the official form">
          Report required
        </Tag>
      ) : (
        <Tag
          bordered={false}
          className="dashboard-student-report-tag dashboard-student-report-tag-inactive"
          title="Shown when a student must be reported on the official form"
        >
          Report required
        </Tag>
      )}
    </div>
  )
}
