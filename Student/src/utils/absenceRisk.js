/** Risk tiers aligned with warning thresholds (14d / 30d). */

export const RISK_ORDER = ['safe', 'watch', 'warning', 'critical']

export const RISK_META = {
  safe: {
    label: 'Safe',
    shortLabel: 'Safe',
    description: 'Low absence count — no action needed yet.',
    className: 'risk-safe',
  },
  watch: {
    label: 'Watch',
    shortLabel: 'Watch',
    description: 'Building up — worth keeping an eye on (e.g. ~1 week).',
    className: 'risk-watch',
  },
  warning: {
    label: 'Warning',
    shortLabel: 'Warning',
    description: '14+ consecutive days or high total — follow up soon.',
    className: 'risk-warning',
  },
  critical: {
    label: 'Critical',
    shortLabel: 'Critical',
    description: '30+ days or very high totals — urgent attention.',
    className: 'risk-critical',
  },
}

function consecutiveRisk(consecutive) {
  if (consecutive <= 0) return 'safe'
  if (consecutive <= 3) return 'safe'
  if (consecutive <= 13) return 'watch'
  if (consecutive <= 29) return 'warning'
  return 'critical'
}

function totalRisk(total) {
  if (total <= 0) return 'safe'
  if (total <= 5) return 'safe'
  if (total <= 10) return 'watch'
  if (total <= 20) return 'warning'
  return 'critical'
}

export function getOverallAbsenceRisk({ total = 0, consecutive = 0 }) {
  const c = consecutiveRisk(consecutive)
  const t = totalRisk(total)
  return RISK_ORDER[Math.max(RISK_ORDER.indexOf(c), RISK_ORDER.indexOf(t))]
}

export function hasAbsenceNumbers({ total = 0, consecutive = 0 }) {
  return total > 0 || consecutive > 0
}

export function compareAbsenceRisk(a, b) {
  const riskDiff =
    RISK_ORDER.indexOf(getOverallAbsenceRisk(b)) -
    RISK_ORDER.indexOf(getOverallAbsenceRisk(a))
  if (riskDiff !== 0) return riskDiff
  return (
    b.consecutive - a.consecutive ||
    b.total - a.total ||
    a.className?.localeCompare(b.className) ||
    a.studentName?.localeCompare(b.studentName)
  )
}
