import { getAllAlerts } from '../utils/alerts'
import { getAllStudentAbsenceSummaries } from '../utils/attendanceStats'
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
    </article>
  )
}

function AbsenceCountRow({ row, rank, maxTotal }) {
  const barWidth = maxTotal > 0 ? Math.max(8, Math.round((row.total / maxTotal) * 100)) : 0

  return (
    <li className="absence-count-row">
      <span className="absence-count-rank" aria-hidden="true">
        {rank}
      </span>
      <div className="absence-count-main">
        <div className="absence-count-head">
          <span className="absence-count-name">{row.studentName}</span>
          <span className="absence-count-class">{row.className}</span>
        </div>
        <div
          className="absence-count-bar"
          style={{ width: `${barWidth}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="absence-count-stats">
        <span className="absence-count-total" title="Total absences">
          {row.total}
          {row.usesManualTotal && <span className="absence-count-manual">*</span>}
        </span>
        <span className="absence-count-consecutive" title="Consecutive absent days">
          {row.consecutive}d streak
          {row.usesManualConsecutive && <span className="absence-count-manual">*</span>}
        </span>
      </div>
    </li>
  )
}

export default function Dashboard({ classes, attendance }) {
  const alerts = getAllAlerts(classes, attendance)
  const absenceSummaries = getAllStudentAbsenceSummaries(classes, attendance)
  const maxTotal = absenceSummaries[0]?.total ?? 0
  const totalAbsences = absenceSummaries.reduce((sum, row) => sum + row.total, 0)

  return (
    <section className="panel dashboard-panel">
      <header className="panel-header">
        <h2>Warnings & absence counts</h2>
        <p className="panel-desc">
          Track rising absence totals across your classes. Warnings flag 14+ consecutive days
          or 30+ days without prior notice.
        </p>
      </header>

      {classes.length === 0 ? (
        <p className="empty-state">
          Import a portal screenshot or add a class to start tracking.
        </p>
      ) : (
        <>
          {absenceSummaries.length > 0 && (
            <section className="dashboard-section" aria-labelledby="absence-counts-heading">
              <div className="dashboard-section-header">
                <h3 id="absence-counts-heading">Absence counts</h3>
                <p className="dashboard-section-desc">
                  Students with at least one absence, sorted highest first.
                  {absenceSummaries.some((r) => r.usesManualTotal || r.usesManualConsecutive) && (
                    <> Asterisk (*) = manual override from Classes.</>
                  )}
                </p>
              </div>

              <div className="absence-summary-stats">
                <div className="stat-tile">
                  <span className="stat-tile-value">{absenceSummaries.length}</span>
                  <span className="stat-tile-label">Students with absences</span>
                </div>
                <div className="stat-tile stat-tile-highlight">
                  <span className="stat-tile-value">{maxTotal}</span>
                  <span className="stat-tile-label">Highest total</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-value">{totalAbsences}</span>
                  <span className="stat-tile-label">Absences recorded</span>
                </div>
              </div>

              <ol className="absence-count-list">
                {absenceSummaries.map((row, index) => (
                  <AbsenceCountRow
                    key={row.id}
                    row={row}
                    rank={index + 1}
                    maxTotal={maxTotal}
                  />
                ))}
              </ol>
            </section>
          )}

          <section className="dashboard-section" aria-labelledby="warnings-heading">
            <div className="dashboard-section-header">
              <h3 id="warnings-heading">Warnings</h3>
              <p className="dashboard-section-desc">
                Flags students absent 14+ consecutive days (2 weeks), every session for 2+
                weeks, or 30+ days without prior notice.
              </p>
            </div>

            {alerts.length === 0 ? (
              <div className="success-banner">
                {absenceSummaries.length === 0
                  ? 'No absences recorded yet — counts will appear here as you import attendance.'
                  : 'No students currently meet warning criteria.'}
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
