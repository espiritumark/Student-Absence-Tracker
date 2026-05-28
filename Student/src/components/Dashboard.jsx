import { getAllAlerts } from '../utils/alerts'
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

export default function Dashboard({ classes, attendance }) {
  const alerts = getAllAlerts(classes, attendance)

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Warnings</h2>
        <p className="panel-desc">
          Flags students absent 14+ consecutive days (2 weeks), every session
          for 2+ weeks, or 30+ days without prior notice.
        </p>
      </header>

      {classes.length === 0 ? (
        <p className="empty-state">
          Import a portal screenshot or add a class to start tracking.
        </p>
      ) : alerts.length === 0 ? (
        <div className="success-banner">
          No students currently meet warning criteria.
        </div>
      ) : (
        <div className="alert-grid">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </section>
  )
}
