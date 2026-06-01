import { AbsenceCountBadge, AbsenceRiskLegend } from './AbsenceCountBadge'
import ReportViolationNotice from './ReportViolationNotice'
import { getAllAlerts } from '../utils/alerts'
import { getAllStudentAbsenceSummaries } from '../utils/attendanceStats'
import { RISK_META } from '../utils/absenceRisk'
import { ABSENCE_VIOLATION_REPORT_LABEL, ABSENCE_VIOLATION_REPORT_URL } from '../constants/reporting'
import { formatDateLabel } from '../utils/dates'

function AlertCard({ alert }) {
  const isMonth = alert.type === 'month_no_notice'
  const range = alert.streakDays || alert.streakWeeks || []

  return (
    <article className={`alert-card alert-${alert.severity}`}>
      <div className="alert-card-header">
        <span className={`badge badge-${isMonth ? 'critical' : 'warning'}`}>
          {isMonth ? 'No notice (~1 mo.)' : 'Extended absence'}
        </span>
        <span className="alert-class">{alert.className}</span>
      </div>
      <h3 className="alert-student">{alert.studentName}</h3>
      <p className="alert-message">{alert.message}</p>
      {range.length > 0 && (
        <p className="alert-weeks">
          {alert.streakDays ? 'Days' : 'Weeks'}:{' '}
          {range
            .slice(0, 5)
            .map((k) => formatDateLabel(k))
            .join(', ')}
          {range.length > 5 ? ` … +${range.length - 5} more` : ''}
        </p>
      )}
      <a
        href={ABSENCE_VIOLATION_REPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="alert-report-link"
      >
        {ABSENCE_VIOLATION_REPORT_LABEL} →
      </a>
    </article>
  )
}

function AbsenceCountRow({ row, rank, maxScore }) {
  const score = Math.max(row.total, row.consecutive)
  const barWidth = maxScore > 0 ? Math.max(8, Math.round((score / maxScore) * 100)) : 0
  const meta = RISK_META[row.risk]

  return (
    <li className={`absence-count-row absence-count-row-${row.risk}`}>
      <span className="absence-count-rank" aria-hidden="true">
        {rank}
      </span>
      <div className="absence-count-main">
        <div className="absence-count-head">
          <span className="absence-count-name">{row.studentName}</span>
          <span className={`risk-pill ${meta.className}`}>{meta.label}</span>
          <span className="absence-count-class">{row.className}</span>
        </div>
        <div
          className={`absence-count-bar absence-count-bar-${row.risk}`}
          style={{ width: `${barWidth}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="absence-count-stats">
        <AbsenceCountBadge
          counts={{
            total: row.total,
            consecutive: row.consecutive,
          }}
          showManual={false}
          size="sm"
        />
      </div>
    </li>
  )
}

export default function Dashboard({ classes, attendance }) {
  const alerts = getAllAlerts(classes, attendance)
  const absenceSummaries = getAllStudentAbsenceSummaries(classes, attendance)
  const maxScore = Math.max(
    0,
    ...absenceSummaries.map((row) => Math.max(row.total, row.consecutive)),
  )
  const watchCount = absenceSummaries.filter(
    (row) => row.risk === 'watch' || row.risk === 'warning' || row.risk === 'critical',
  ).length
  const mustReport =
    alerts.length > 0 ||
    absenceSummaries.some((row) => row.risk === 'warning' || row.risk === 'critical')

  return (
    <section className="panel dashboard-panel">
      <header className="panel-header">
        <h2>Dashboard</h2>
        <p className="panel-desc">
          Color-coded absence totals across all classes. Edit counts per class on the Classes
          tab.
        </p>
      </header>

      {classes.length === 0 ? (
        <p className="empty-state">
          Import a portal screenshot or add a class to start tracking.
        </p>
      ) : (
        <>
          <AbsenceRiskLegend compact />

          {mustReport && <ReportViolationNotice />}

          {absenceSummaries.length > 0 ? (
            <section className="dashboard-section" aria-labelledby="absence-counts-heading">
              <div className="dashboard-section-header">
                <h3 id="absence-counts-heading">Students with absence counts</h3>
                <p className="dashboard-section-desc">
                  Sorted by risk, then highest streak or total. {watchCount} student
                  {watchCount === 1 ? '' : 's'} need watching or follow-up.
                </p>
              </div>

              <div className="absence-summary-stats">
                <div className="stat-tile">
                  <span className="stat-tile-value">{absenceSummaries.length}</span>
                  <span className="stat-tile-label">With counts</span>
                </div>
                <div className="stat-tile stat-tile-highlight">
                  <span className="stat-tile-value">{maxScore}</span>
                  <span className="stat-tile-label">Highest number</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-value">{watchCount}</span>
                  <span className="stat-tile-label">Watch or above</span>
                </div>
              </div>

              <ol className="absence-count-list">
                {absenceSummaries.map((row, index) => (
                  <AbsenceCountRow
                    key={row.id}
                    row={row}
                    rank={index + 1}
                    maxScore={maxScore}
                  />
                ))}
              </ol>
            </section>
          ) : (
            <div className="success-banner dashboard-empty-counts">
              No absence counts yet — they appear after you import attendance or set overrides
              on the Classes tab.
            </div>
          )}

          <section className="dashboard-section" aria-labelledby="warnings-heading">
            <div className="dashboard-section-header">
              <h3 id="warnings-heading">Automatic warnings</h3>
              <p className="dashboard-section-desc">
                Triggered at 14+ consecutive days, 2+ full absent weeks, or 30+ days without
                prior notice. Continued violations must be reported via the official form.
              </p>
            </div>

            {alerts.length === 0 ? (
              <div className="success-banner">
                {absenceSummaries.length === 0
                  ? 'Import attendance to start tracking.'
                  : 'No students currently meet automatic warning rules.'}
              </div>
            ) : (
              <div className="alert-grid">
                {alerts.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}
