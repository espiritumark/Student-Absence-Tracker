import { getOverallAbsenceRisk, hasAbsenceNumbers, RISK_META } from '../utils/absenceRisk'

export function AbsenceCountBadge({ counts, showManual = true, size = 'md', placeholder = false }) {
  const hasNumbers = counts && hasAbsenceNumbers(counts)

  if (!hasNumbers) {
    if (!placeholder) return null
    return (
      <span
        className={`absence-badge absence-badge-empty absence-badge-${size}`}
        aria-hidden="true"
      >
        <span className="absence-badge-placeholder">—</span>
      </span>
    )
  }

  const risk = getOverallAbsenceRisk(counts)
  const meta = RISK_META[risk]
  const hasManual = counts.usesManualTotal || counts.usesManualConsecutive

  return (
    <span
      className={`absence-badge absence-badge-${risk} absence-badge-${size}`}
      title={meta.description}
    >
      <span className="absence-badge-label">{meta.shortLabel}</span>
      <span className="absence-badge-part">
        <strong>{counts.total}</strong>
        <span>total</span>
      </span>
      {counts.consecutive > 0 && (
        <span className="absence-badge-part">
          <strong>{counts.consecutive}</strong>
          <span>days</span>
        </span>
      )}
      {showManual && hasManual && (
        <span className="absence-badge-manual">manual</span>
      )}
    </span>
  )
}

export function AbsenceRiskLegend({ compact = false }) {
  const tiers = ['safe', 'watch', 'warning', 'critical']

  return (
    <ul className={`risk-legend ${compact ? 'risk-legend-compact' : ''}`}>
      {tiers.map((tier) => (
        <li key={tier}>
          <span className={`risk-legend-swatch ${RISK_META[tier].className}`} />
          <span>
            <strong>{RISK_META[tier].label}</strong>
            {!compact && ` — ${RISK_META[tier].description}`}
          </span>
        </li>
      ))}
    </ul>
  )
}
