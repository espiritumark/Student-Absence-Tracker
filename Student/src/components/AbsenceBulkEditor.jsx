import { useEffect, useMemo, useState } from 'react'
import { AbsenceCountBadge } from './AbsenceCountBadge'
import ConfirmDialog from './ConfirmDialog'
import SearchableSelect from './SearchableSelect'
import { getEffectiveAbsenceCounts } from '../utils/attendanceStats'
import { formatClassLabel } from '../utils/classFormat'

function emptyDraft(student) {
  return {
    manualTotalAbsences: student.manualTotalAbsences ?? '',
    manualConsecutiveAbsences: student.manualConsecutiveAbsences ?? '',
    manualNoPriorNotice: Boolean(student.manualNoPriorNotice),
  }
}

function draftToPatch(draft) {
  return {
    manualTotalAbsences:
      draft.manualTotalAbsences === '' ? null : Number(draft.manualTotalAbsences),
    manualConsecutiveAbsences:
      draft.manualConsecutiveAbsences === ''
        ? null
        : Number(draft.manualConsecutiveAbsences),
    manualNoPriorNotice: Boolean(draft.manualNoPriorNotice),
  }
}

function draftChanged(student, draft) {
  const base = emptyDraft(student)
  return (
    String(draft.manualTotalAbsences) !== String(base.manualTotalAbsences) ||
    String(draft.manualConsecutiveAbsences) !== String(base.manualConsecutiveAbsences) ||
    Boolean(draft.manualNoPriorNotice) !== base.manualNoPriorNotice
  )
}

export default function AbsenceBulkEditor({
  classes,
  attendance,
  initialClassId,
  onClose,
  bulkUpdateStudents,
}) {
  const sortedClasses = useMemo(
    () =>
      [...classes].sort((a, b) => formatClassLabel(a).localeCompare(formatClassLabel(b))),
    [classes],
  )

  const classOptions = sortedClasses.map((c) => ({
    value: c.id,
    label: formatClassLabel(c),
  }))

  const [classId, setClassId] = useState(initialClassId || sortedClasses[0]?.id || '')
  const [drafts, setDrafts] = useState({})
  const [showAll, setShowAll] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const selectedClass = sortedClasses.find((c) => c.id === classId)
  const classAttendance = selectedClass ? attendance?.[selectedClass.id] || {} : {}

  const students = useMemo(() => {
    if (!selectedClass) return []
    return [...selectedClass.students]
      .map((student) => {
        const counts = getEffectiveAbsenceCounts(student, classAttendance)
        const draft = drafts[student.id] ?? emptyDraft(student)
        const previewPatch = draftToPatch(draft)
        const previewCounts = {
          total:
            previewPatch.manualTotalAbsences != null
              ? previewPatch.manualTotalAbsences
              : counts.recorded.total,
          consecutive:
            previewPatch.manualConsecutiveAbsences != null
              ? previewPatch.manualConsecutiveAbsences
              : counts.recorded.consecutive,
          usesManualTotal: previewPatch.manualTotalAbsences != null,
          usesManualConsecutive: previewPatch.manualConsecutiveAbsences != null,
        }
        return {
          student,
          counts,
          draft,
          previewCounts,
          changed: draftChanged(student, draft),
        }
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name))
  }, [selectedClass, classAttendance, drafts])

  const visibleStudents = showAll
    ? students
    : students.filter(
        ({ counts, changed }) =>
          changed ||
          counts.total > 0 ||
          counts.consecutive > 0 ||
          counts.usesManualTotal ||
          counts.usesManualConsecutive,
      )

  const changedCount = students.filter(({ changed }) => changed).length

  useEffect(() => {
    if (!classId && sortedClasses[0]?.id) {
      setClassId(sortedClasses[0].id)
    }
  }, [classId, sortedClasses])

  useEffect(() => {
    setDrafts({})
    setMessage('')
    setError('')
  }, [classId])

  function updateDraft(studentId, patch) {
    setDrafts((prev) => {
      const student = selectedClass?.students.find((s) => s.id === studentId)
      if (!student) return prev
      return {
        ...prev,
        [studentId]: { ...(prev[studentId] ?? emptyDraft(student)), ...patch },
      }
    })
    setMessage('')
    setError('')
  }

  async function handleSave() {
    if (!classId || busy || changedCount === 0) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const updates = students
        .filter(({ changed }) => changed)
        .map(({ student, draft }) => ({
          studentId: student.id,
          patch: draftToPatch(draft),
        }))
      await bulkUpdateStudents(classId, updates)
      setDrafts({})
      setMessage(
        `Saved absence overrides for ${updates.length} student${updates.length === 1 ? '' : 's'}.`,
      )
    } catch (err) {
      setError(err.message || 'Failed to save changes.')
    } finally {
      setBusy(false)
    }
  }

  async function handleClearAll() {
    if (!classId || busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const updates = students
        .filter(
          ({ student }) =>
            student.manualTotalAbsences != null ||
            student.manualConsecutiveAbsences != null ||
            student.manualNoPriorNotice,
        )
        .map(({ student }) => ({
          studentId: student.id,
          patch: {
            manualTotalAbsences: null,
            manualConsecutiveAbsences: null,
            manualNoPriorNotice: false,
          },
        }))
      if (updates.length === 0) {
        setMessage('No manual overrides to clear in this class.')
      } else {
        await bulkUpdateStudents(classId, updates)
        setDrafts({})
        setMessage(`Cleared manual overrides for ${updates.length} students.`)
      }
      setConfirmClear(false)
    } catch (err) {
      setError(err.message || 'Failed to clear overrides.')
    } finally {
      setBusy(false)
    }
  }

  if (classes.length === 0) {
    return (
      <section className="panel">
        <p className="empty-state">Add a class first, then edit absence counts here.</p>
      </section>
    )
  }

  return (
    <section className="panel bulk-absence-panel">
      <header className="panel-header bulk-absence-header">
        <div>
          <h2>Bulk edit absence counts</h2>
          <p className="panel-desc">
            Set manual overrides for every student in the selected class. Leave a field blank
            to use recorded attendance.
          </p>
        </div>
        {onClose && (
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Back to class list
          </button>
        )}
      </header>

      <div className="bulk-absence-toolbar">
        <SearchableSelect
          options={classOptions}
          value={classId}
          onChange={setClassId}
          placeholder="Select class…"
          label="Class"
        />
        <label className="bulk-absence-filter">
          <input
            type="checkbox"
            checked={!showAll}
            onChange={(e) => setShowAll(!e.target.checked)}
          />
          Only students with absence counts
        </label>
      </div>

      {message && (
        <p className="auth-message" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {visibleStudents.length === 0 ? (
        <p className="empty-state">
          No students in this class yet.
        </p>
      ) : (
        <div className="bulk-absence-table-wrap">
          <table className="bulk-absence-table">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Recorded</th>
                <th scope="col">Manual total</th>
                <th scope="col">Manual streak</th>
                <th scope="col">No notice</th>
                <th scope="col">Effective</th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map(({ student, counts, draft, previewCounts, changed }) => (
                <tr key={student.id} className={changed ? 'bulk-row-changed' : ''}>
                  <th scope="row" className="bulk-student-name">
                    {student.name}
                  </th>
                  <td className="bulk-recorded">
                    {counts.recorded.total} total
                    {counts.recorded.consecutive > 0 && (
                      <> · {counts.recorded.consecutive}d</>
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      className="bulk-input"
                      placeholder="auto"
                      aria-label={`Manual total absences for ${student.name}`}
                      value={draft.manualTotalAbsences}
                      onChange={(e) =>
                        updateDraft(student.id, { manualTotalAbsences: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      className="bulk-input"
                      placeholder="auto"
                      aria-label={`Manual consecutive days for ${student.name}`}
                      value={draft.manualConsecutiveAbsences}
                      onChange={(e) =>
                        updateDraft(student.id, {
                          manualConsecutiveAbsences: e.target.value,
                        })
                      }
                    />
                  </td>
                  <td className="bulk-notice-cell">
                    <input
                      type="checkbox"
                      aria-label={`No prior notice for ${student.name}`}
                      checked={Boolean(draft.manualNoPriorNotice)}
                      disabled={draft.manualConsecutiveAbsences === ''}
                      onChange={(e) =>
                        updateDraft(student.id, { manualNoPriorNotice: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <AbsenceCountBadge counts={previewCounts} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bulk-absence-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || changedCount === 0}
          onClick={handleSave}
        >
          {busy
            ? 'Saving…'
            : changedCount === 0
              ? 'Save changes'
              : `Save ${changedCount} change${changedCount === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-danger-text"
          disabled={busy}
          onClick={() => setConfirmClear(true)}
        >
          Clear all manual overrides
        </button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all manual overrides?"
        confirmLabel="Clear all"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onCancel={() => !busy && setConfirmClear(false)}
        onConfirm={handleClearAll}
      >
        <p className="modal-lead">
          Remove every manual absence override in{' '}
          <strong>{formatClassLabel(selectedClass)}</strong>? Recorded attendance stays
          unchanged.
        </p>
      </ConfirmDialog>
    </section>
  )
}
