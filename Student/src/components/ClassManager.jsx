import { useEffect, useState } from 'react'
import { getEffectiveAbsenceCounts } from '../utils/attendanceStats'
import { formatClassLabel } from '../utils/classFormat'
import ConfirmDialog from './ConfirmDialog'
import SearchableSelect from './SearchableSelect'

export default function ClassManager({
  classes,
  attendance,
  addClass,
  removeClass,
  addStudent,
  updateStudent,
  removeStudent,
  importStudentsBulk,
}) {
  const [form, setForm] = useState({
    intake: '',
    level: '',
    qualification: '',
    group: '',
  })
  const [selectedClassId, setSelectedClassId] = useState(
    classes.length > 0 ? classes[0].id : '',
  )
  const [studentInput, setStudentInput] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [expandedManual, setExpandedManual] = useState({})
  const [removedStudents, setRemovedStudents] = useState([])
  const [addClassBusy, setAddClassBusy] = useState(false)
  const [addClassMessage, setAddClassMessage] = useState('')
  const [addClassError, setAddClassError] = useState('')
  const [bulkMessage, setBulkMessage] = useState('')
  const [bulkError, setBulkError] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [manualDrafts, setManualDrafts] = useState({})
  const [manualConfirm, setManualConfirm] = useState(null)
  const [manualBusy, setManualBusy] = useState(false)
  const [manualError, setManualError] = useState('')
  const [manualMessage, setManualMessage] = useState('')

  const sortedClasses = [...classes].sort((a, b) =>
    formatClassLabel(a).localeCompare(formatClassLabel(b)),
  )

  const classOptions = sortedClasses.map((c) => ({
    value: c.id,
    label: formatClassLabel(c),
  }))

  const selectedClass = classes.find((c) => c.id === selectedClassId)
  const classAttendance = selectedClass ? attendance?.[selectedClass.id] || {} : {}
  const sortedStudents = selectedClass
    ? [...selectedClass.students].sort((a, b) => a.name.localeCompare(b.name))
    : []

  useEffect(() => {
    if (classes.length === 0) {
      setSelectedClassId('')
      return
    }
    if (!classes.some((c) => c.id === selectedClassId)) {
      const sorted = [...classes].sort((a, b) =>
        formatClassLabel(a).localeCompare(formatClassLabel(b)),
      )
      setSelectedClassId(sorted[0]?.id ?? '')
    }
  }, [classes, selectedClassId])

  async function handleAddClass(e) {
    e.preventDefault()
    if (!form.qualification.trim() || addClassBusy) return
    const fields = {
      intake: Number(form.intake) || null,
      level: Number(form.level) || null,
      qualification: form.qualification.trim(),
      group: Number(form.group) || null,
    }
    setAddClassBusy(true)
    setAddClassMessage('')
    setAddClassError('')
    try {
      const newId = await addClass(fields)
      if (newId) setSelectedClassId(newId)
      setForm({ intake: '', level: '', qualification: '', group: '' })
      setAddClassMessage(`"${formatClassLabel(fields)}" added successfully.`)
    } catch (err) {
      setAddClassError(err.message || 'Failed to add class. Try again.')
    } finally {
      setAddClassBusy(false)
    }
  }

  function handleAddStudent(e) {
    e.preventDefault()
    if (!selectedClassId || !studentInput.trim()) return
    addStudent(selectedClassId, studentInput)
    setStudentInput('')
  }

  async function handleBulkImport() {
    if (!selectedClassId || bulkBusy) return
    if (!bulkText.trim()) {
      setBulkError('Enter at least one student name.')
      setBulkMessage('')
      return
    }
    setBulkBusy(true)
    setBulkMessage('')
    setBulkError('')
    try {
      const count = await importStudentsBulk(selectedClassId, bulkText)
      if (count > 0) {
        setBulkText('')
        setBulkMessage(
          `Added ${count} student${count === 1 ? '' : 's'} to ${formatClassLabel(selectedClass)}.`,
        )
      } else {
        setBulkMessage('No new students to add — all names were already in this class.')
      }
    } catch (err) {
      setBulkError(err.message || 'Failed to import students. Try again.')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleConfirmDeleteClass() {
    if (!selectedClassId || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      const remaining = classes.filter((c) => c.id !== selectedClassId)
      await removeClass(selectedClassId)
      setSelectedClassId(remaining[0]?.id ?? '')
      setDeleteOpen(false)
      setBulkMessage('')
      setBulkError('')
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete class. Try again.')
    } finally {
      setDeleteBusy(false)
    }
  }

  function handleRemoveStudent(classId, student) {
    const token = { classId, student, restoredAt: null }
    setRemovedStudents((prev) => [token, ...prev.slice(0, 4)])
    removeStudent(classId, student.id)
    setTimeout(() => {
      setRemovedStudents((prev) => prev.filter((r) => r.student.id !== student.id))
    }, 7000)
  }

  function handleUndo(token) {
    addStudent(token.classId, token.student.name)
    setRemovedStudents((prev) => prev.filter((r) => r.student.id !== token.student.id))
  }

  function openManualEdit(student) {
    setManualDrafts((prev) => ({
      ...prev,
      [student.id]: {
        manualTotalAbsences: student.manualTotalAbsences ?? '',
        manualConsecutiveAbsences: student.manualConsecutiveAbsences ?? '',
        manualNoPriorNotice: Boolean(student.manualNoPriorNotice),
      },
    }))
    setExpandedManual((prev) => ({ ...prev, [student.id]: true }))
    setManualError('')
  }

  function cancelManualEdit(studentId) {
    setManualDrafts((prev) => {
      const next = { ...prev }
      delete next[studentId]
      return next
    })
    setExpandedManual((prev) => ({ ...prev, [studentId]: false }))
    setManualError('')
  }

  function updateManualDraft(studentId, patch) {
    setManualDrafts((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], ...patch },
    }))
  }

  function buildManualPatch(draft) {
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

  function describeManualPatch(student, patch) {
    const parts = []
    if (patch.manualTotalAbsences != null) {
      parts.push(`total absences: ${patch.manualTotalAbsences}`)
    } else if (student.manualTotalAbsences != null) {
      parts.push('clear total absences override')
    }
    if (patch.manualConsecutiveAbsences != null) {
      parts.push(`consecutive days: ${patch.manualConsecutiveAbsences}`)
    } else if (student.manualConsecutiveAbsences != null) {
      parts.push('clear consecutive days override')
    }
    if (patch.manualNoPriorNotice) {
      parts.push('no prior notice: yes')
    } else if (student.manualNoPriorNotice) {
      parts.push('no prior notice: no')
    }
    return parts.length ? parts.join(' · ') : 'clear all manual overrides'
  }

  async function handleConfirmManual() {
    if (!manualConfirm || manualBusy || !selectedClassId) return
    setManualBusy(true)
    setManualError('')
    try {
      if (manualConfirm.action === 'clear') {
        await updateStudent(selectedClassId, manualConfirm.student.id, {
          manualTotalAbsences: null,
          manualConsecutiveAbsences: null,
          manualNoPriorNotice: false,
        })
      } else {
        await updateStudent(
          selectedClassId,
          manualConfirm.student.id,
          manualConfirm.patch,
        )
      }
      cancelManualEdit(manualConfirm.student.id)
      setManualConfirm(null)
      setManualMessage(`Updated manual absences for ${manualConfirm.student.name}.`)
    } catch (err) {
      setManualError(err.message || 'Failed to save manual absences.')
    } finally {
      setManualBusy(false)
    }
  }

  function toggleManual(student) {
    if (expandedManual[student.id]) {
      cancelManualEdit(student.id)
      return
    }
    openManualEdit(student)
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Classes &amp; students</h2>
        <p className="panel-desc">
          Classes are usually created automatically when you import a screenshot.
          You can also add them manually below.
        </p>
      </header>

      {/* ── Add class form ── */}
      <details className="collapsible-form">
        <summary className="collapsible-summary">Add a new class manually</summary>
        <form className="portal-meta-grid add-class-form" onSubmit={handleAddClass}>
          <label>
            Intake
            <input
              type="number"
              value={form.intake}
              onChange={(e) => setForm((f) => ({ ...f, intake: e.target.value }))}
            />
          </label>
          <label>
            Level
            <input
              type="number"
              value={form.level}
              onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
            />
          </label>
          <label>
            Group
            <input
              type="number"
              value={form.group}
              onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
            />
          </label>
          <label className="span-2">
            Qualification / programme
            <input
              type="text"
              placeholder="HND IN COMPUTING"
              value={form.qualification}
              onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={addClassBusy}>
            {addClassBusy ? 'Adding class…' : 'Add class'}
          </button>
          {addClassMessage && (
            <p className="auth-message span-2" role="status">
              {addClassMessage}
            </p>
          )}
          {addClassError && (
            <p className="auth-error span-2" role="alert">
              {addClassError}
            </p>
          )}
        </form>
      </details>

      {classes.length === 0 ? (
        <p className="empty-state">No classes yet. Import a screenshot or add one above.</p>
      ) : (
        <>
          {/* ── Class selector ── */}
          <div className="class-selector-row">
            <SearchableSelect
              options={classOptions}
              value={selectedClassId}
              onChange={(v) => {
                setSelectedClassId(v)
                setStudentInput('')
                setBulkText('')
                setBulkMessage('')
                setBulkError('')
              }}
              placeholder="Search and select a class…"
              label="Select class"
            />
            <button
              type="button"
              className="btn btn-ghost btn-danger-text"
              onClick={() => {
                setDeleteError('')
                setDeleteOpen(true)
              }}
              disabled={!selectedClass}
            >
              Delete class
            </button>
          </div>

          <ConfirmDialog
            open={deleteOpen}
            title="Delete class?"
            confirmLabel="Delete class"
            cancelLabel="Keep class"
            danger
            busy={deleteBusy}
            error={deleteError}
            onCancel={() => {
              if (deleteBusy) return
              setDeleteOpen(false)
              setDeleteError('')
            }}
            onConfirm={handleConfirmDeleteClass}
          >
            <p className="modal-lead">
              Delete <strong>{formatClassLabel(selectedClass)}</strong> and all of its
              attendance records? This cannot be undone.
            </p>
          </ConfirmDialog>

          <ConfirmDialog
            open={Boolean(manualConfirm)}
            title={
              manualConfirm?.action === 'clear'
                ? 'Clear manual absences?'
                : 'Save manual absences?'
            }
            confirmLabel={manualConfirm?.action === 'clear' ? 'Clear overrides' : 'Save changes'}
            cancelLabel="Cancel"
            danger={manualConfirm?.action === 'clear'}
            busy={manualBusy}
            error={manualError}
            onCancel={() => {
              if (manualBusy) return
              setManualConfirm(null)
              setManualError('')
            }}
            onConfirm={handleConfirmManual}
          >
            {manualConfirm && (
              <p className="modal-lead">
                {manualConfirm.action === 'clear' ? (
                  <>
                    Clear manual absence overrides for{' '}
                    <strong>{manualConfirm.student.name}</strong>?
                  </>
                ) : (
                  <>
                    Save manual absence overrides for{' '}
                    <strong>{manualConfirm.student.name}</strong>?
                    <span className="muted small block">
                      {describeManualPatch(manualConfirm.student, manualConfirm.patch)}
                    </span>
                  </>
                )}
              </p>
            )}
          </ConfirmDialog>

          {manualMessage && (
            <p className="auth-message" role="status">
              {manualMessage}
            </p>
          )}

          {selectedClass && (
            <div className="class-detail-card">
              <p className="class-detail-title">{formatClassLabel(selectedClass)}</p>

              {/* ── Add student ── */}
              <form className="inline-form" onSubmit={handleAddStudent}>
                <input
                  type="text"
                  placeholder="Student name"
                  value={studentInput}
                  onChange={(e) => setStudentInput(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary">
                  Add student
                </button>
              </form>

              <details className="bulk-import">
                <summary>Bulk add names</summary>
                <textarea
                  placeholder="One name per line, or separated by commas"
                  rows={4}
                  value={bulkText}
                  onChange={(e) => {
                    setBulkText(e.target.value)
                    if (bulkMessage || bulkError) {
                      setBulkMessage('')
                      setBulkError('')
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleBulkImport}
                  disabled={bulkBusy}
                >
                  {bulkBusy ? 'Importing…' : 'Import'}
                </button>
                {bulkMessage && (
                  <p className="auth-message" role="status">
                    {bulkMessage}
                  </p>
                )}
                {bulkError && (
                  <p className="auth-error" role="alert">
                    {bulkError}
                  </p>
                )}
              </details>

              {/* ── Undo toasts ── */}
              {removedStudents.length > 0 && (
                <div className="undo-stack">
                  {removedStudents.map((r) => (
                    <div key={r.student.id} className="undo-toast">
                      <span>Removed {r.student.name}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleUndo(r)}
                      >
                        Undo
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {sortedStudents.length === 0 ? (
                <p className="muted">No students in this class.</p>
              ) : (
                <ul className="student-list">
                  {sortedStudents.map((st) => {
                    const counts = getEffectiveAbsenceCounts(st, classAttendance)
                    const hasManualOnly =
                      (st.manualTotalAbsences != null || st.manualConsecutiveAbsences != null) &&
                      counts.total <= 0 &&
                      counts.consecutive <= 0

                    return (
                    <li key={st.id}>
                      <div className="student-row">
                        <span className="student-name-text">{st.name}</span>

                        {/* Manual override section — collapsed by default */}
                        {expandedManual[st.id] ? (
                          <div className="student-manual">
                            <label>
                              Total absences (manual override)
                              <input
                                type="number"
                                min="0"
                                value={manualDrafts[st.id]?.manualTotalAbsences ?? ''}
                                onChange={(e) =>
                                  updateManualDraft(st.id, {
                                    manualTotalAbsences: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Consecutive days (manual override)
                              <input
                                type="number"
                                min="0"
                                value={manualDrafts[st.id]?.manualConsecutiveAbsences ?? ''}
                                onChange={(e) =>
                                  updateManualDraft(st.id, {
                                    manualConsecutiveAbsences: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="manual-notice">
                              <input
                                type="checkbox"
                                checked={Boolean(manualDrafts[st.id]?.manualNoPriorNotice)}
                                onChange={(e) =>
                                  updateManualDraft(st.id, {
                                    manualNoPriorNotice: e.target.checked,
                                  })
                                }
                                disabled={manualDrafts[st.id]?.manualConsecutiveAbsences === ''}
                              />
                              No prior notice (manual)
                            </label>
                            <div className="manual-actions">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() =>
                                  setManualConfirm({
                                    student: st,
                                    action: 'clear',
                                  })
                                }
                              >
                                Clear manual
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => cancelManualEdit(st.id)}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  const draft = manualDrafts[st.id]
                                  if (!draft) return
                                  setManualConfirm({
                                    student: st,
                                    action: 'save',
                                    patch: buildManualPatch(draft),
                                  })
                                }}
                              >
                                Save changes
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="student-meta-row">
                            {counts.total > 0 || counts.consecutive > 0 ? (
                              <span className="student-absence-counts">
                                <strong>{counts.total}</strong> total
                                {counts.consecutive > 0 && (
                                  <>
                                    {' · '}
                                    <strong>{counts.consecutive}</strong> consecutive
                                  </>
                                )}
                                {(counts.usesManualTotal || counts.usesManualConsecutive) && (
                                  <span className="manual-badge">manual</span>
                                )}
                              </span>
                            ) : hasManualOnly ? (
                              <span className="manual-badge">manual override</span>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleManual(st)}
                            >
                              Edit absences
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-danger-text"
                        onClick={() => handleRemoveStudent(selectedClassId, st)}
                        aria-label={`Remove ${st.name}`}
                      >
                        Remove
                      </button>
                    </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
