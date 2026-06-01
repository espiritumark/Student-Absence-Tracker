import { useEffect, useState } from 'react'
import { useAutoDismiss } from '../hooks/useAutoDismiss'
import AbsenceBulkEditor from './AbsenceBulkEditor'
import { AbsenceCountBadge } from './AbsenceCountBadge'
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
  removeStudent,
  importStudentsBulk,
  bulkUpdateStudents,
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
  const [bulkEditMode, setBulkEditMode] = useState(false)
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

  useAutoDismiss(Boolean(addClassMessage) && !form.qualification.trim(), () => setAddClassMessage(''))
  useAutoDismiss(Boolean(bulkMessage) && !bulkText.trim(), () => setBulkMessage(''))

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
          `Added ${count} student${count === 1 ? '' : 's'} to ${formatClassLabel(selectedClass ?? {})}.`,
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

  if (bulkEditMode) {
    return (
      <AbsenceBulkEditor
        classes={classes}
        attendance={attendance}
        initialClassId={selectedClassId}
        bulkUpdateStudents={bulkUpdateStudents}
        onClose={() => setBulkEditMode(false)}
      />
    )
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Classes &amp; students</h2>
        <p className="panel-desc">
          Manage classes and rosters. Use bulk edit for absence count overrides on one page.
        </p>
      </header>

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
              className="btn btn-secondary"
              disabled={!selectedClass}
              onClick={() => setBulkEditMode(true)}
            >
              Bulk edit this class
            </button>
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
            {selectedClass ? (
              <p className="modal-lead">
                Delete <strong>{formatClassLabel(selectedClass)}</strong> and all of its
                attendance records? This cannot be undone.
              </p>
            ) : (
              <p className="modal-lead">
                Delete this class and all of its attendance records? This cannot be undone.
              </p>
            )}
          </ConfirmDialog>

          {selectedClass && (
            <div className="class-detail-card">
              <p className="class-detail-title">{formatClassLabel(selectedClass)}</p>

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

                    return (
                      <li key={st.id}>
                        <div className="student-row">
                          <span className="student-name-text">{st.name}</span>
                          <AbsenceCountBadge counts={counts} />
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
