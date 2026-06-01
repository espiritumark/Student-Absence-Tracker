import { formatDateLabel } from '../utils/dates'

export default function ConfirmOverwriteModal({
  open,
  summary,
  onCancel,
  onConfirm,
  error = '',
  busy = false,
}) {
  if (!open || !summary) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm overwrite">
      <div className="modal">
        <div className="modal-header">
          <h3>{summary.isNewClass ? 'Confirm import' : 'Confirm overwrite'}</h3>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {summary.isNewClass ? (
            <p className="modal-lead">
              A new class will be created from this import.
            </p>
          ) : (
            <p className="modal-lead">
              Attendance already exists for this class, date, and module. Review changes before
              overwriting.
            </p>
          )}

          <div className="diff-grid">
            <div className="diff-card">
              <div className="diff-title">Where</div>
              <div className="diff-value">
                <strong>{summary.classLabel || 'Class'}</strong>
                <div className="muted">{formatDateLabel(summary.date)}</div>
                {summary.module && (
                  <div className="muted">Module: {summary.module}</div>
                )}
              </div>
            </div>
            {!summary.isNewClass && (
              <>
                <div className="diff-card">
                  <div className="diff-title">Absent count</div>
                  <div className="diff-value">
                    <strong>{summary.prevAbsent} → {summary.nextAbsent}</strong>
                    <div className="muted">Saved → this import</div>
                  </div>
                </div>
                <div className="diff-card">
                  <div className="diff-title">Changes</div>
                  <div className="diff-value">
                    <div><strong>{summary.toAbsent}</strong> become absent</div>
                    <div><strong>{summary.toPresent}</strong> become present</div>
                    <div className="muted"><strong>{summary.unchanged}</strong> unchanged</div>
                  </div>
                </div>
              </>
            )}
            <div className="diff-card">
              <div className="diff-title">New students</div>
              <div className="diff-value">
                <strong>{summary.newStudents ?? 0}</strong> will be added
                {summary.newStudentNames?.length > 0 && (
                  <div className="muted small">
                    {summary.newStudentNames.slice(0, 5).join(', ')}
                    {summary.newStudentNames.length > 5
                      ? ` … +${summary.newStudentNames.length - 5} more`
                      : ''}
                  </div>
                )}
              </div>
            </div>
          </div>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            {busy
              ? 'Saving…'
              : summary.isNewClass
                ? 'Save attendance'
                : 'Overwrite attendance'}
          </button>
        </div>
      </div>
    </div>
  )
}
