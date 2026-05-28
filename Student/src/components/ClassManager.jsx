import { useState } from 'react'
import { formatClassLabel } from '../utils/classFormat'
import SearchableSelect from './SearchableSelect'

export default function ClassManager({
  classes,
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

  const sortedClasses = [...classes].sort((a, b) =>
    formatClassLabel(a).localeCompare(formatClassLabel(b)),
  )

  const classOptions = sortedClasses.map((c) => ({
    value: c.id,
    label: formatClassLabel(c),
  }))

  const selectedClass = classes.find((c) => c.id === selectedClassId)
  const sortedStudents = selectedClass
    ? [...selectedClass.students].sort((a, b) => a.name.localeCompare(b.name))
    : []

  function handleAddClass(e) {
    e.preventDefault()
    if (!form.qualification.trim()) return
    const newId = addClass({
      intake: Number(form.intake) || null,
      level: Number(form.level) || null,
      qualification: form.qualification.trim(),
      group: Number(form.group) || null,
    })
    if (newId) setSelectedClassId(newId)
    setForm({ intake: '', level: '', qualification: '', group: '' })
  }

  function handleAddStudent(e) {
    e.preventDefault()
    if (!selectedClassId) return
    addStudent(selectedClassId, studentInput)
    setStudentInput('')
  }

  function handleBulkImport() {
    if (!selectedClassId) return
    const count = importStudentsBulk(selectedClassId, bulkText)
    if (count) setBulkText('')
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

  function toggleManual(studentId) {
    setExpandedManual((prev) => ({ ...prev, [studentId]: !prev[studentId] }))
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
          <button type="submit" className="btn btn-primary">
            Add class
          </button>
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
              }}
              placeholder="Search and select a class…"
              label="Select class"
            />
            <button
              type="button"
              className="btn btn-ghost btn-danger-text"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${formatClassLabel(selectedClass)}" and all attendance records?`,
                  )
                ) {
                  const remaining = classes.filter((c) => c.id !== selectedClassId)
                  removeClass(selectedClassId)
                  setSelectedClassId(remaining[0]?.id ?? '')
                }
              }}
              disabled={!selectedClass}
            >
              Delete class
            </button>
          </div>

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
                  onChange={(e) => setBulkText(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleBulkImport}
                >
                  Import
                </button>
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
                  {sortedStudents.map((st) => (
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
                                value={st.manualTotalAbsences ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  updateStudent(selectedClassId, st.id, {
                                    manualTotalAbsences: v === '' ? null : Number(v),
                                  })
                                }}
                              />
                            </label>
                            <label>
                              Consecutive days (manual override)
                              <input
                                type="number"
                                min="0"
                                value={st.manualConsecutiveAbsences ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  updateStudent(selectedClassId, st.id, {
                                    manualConsecutiveAbsences: v === '' ? null : Number(v),
                                  })
                                }}
                              />
                            </label>
                            <label className="manual-notice">
                              <input
                                type="checkbox"
                                checked={Boolean(st.manualNoPriorNotice)}
                                onChange={(e) =>
                                  updateStudent(selectedClassId, st.id, {
                                    manualNoPriorNotice: e.target.checked,
                                  })
                                }
                                disabled={st.manualConsecutiveAbsences == null}
                              />
                              No prior notice (manual)
                            </label>
                            <div className="manual-actions">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() =>
                                  updateStudent(selectedClassId, st.id, {
                                    manualTotalAbsences: null,
                                    manualConsecutiveAbsences: null,
                                    manualNoPriorNotice: false,
                                  })
                                }
                              >
                                Clear manual
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => toggleManual(st.id)}
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="student-meta-row">
                            {(st.manualTotalAbsences != null ||
                              st.manualConsecutiveAbsences != null) && (
                              <span className="manual-badge">manual override</span>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleManual(st.id)}
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
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
