import { useMemo, useState } from 'react'
import { useAutoDismiss } from '../hooks/useAutoDismiss'
import { useScrollLoadMore } from '../hooks/useScrollLoadMore'
import { AbsenceCountBadge } from './AbsenceCountBadge'
import ConfirmDialog from './ConfirmDialog'
import ModuleSearchSelect from './ModuleSearchSelect'
import SaveFieldOverlay from './SaveFieldOverlay'
import ScrollSentinel from './ScrollSentinel'
import { getEffectiveAbsenceCounts } from '../utils/attendanceStats'
import { formatClassLabel } from '../utils/classFormat'
import {
  filterAttendanceByModule,
  formatModuleLabel,
  listModulesForClass,
} from '../utils/sessionKeys'

const STUDENTS_PAGE_SIZE = 25

function countBulkNames(text) {
  return text
    .split(/[\n,;]+/)
    .map((name) => name.trim())
    .filter(Boolean).length
}

export default function ClassStudentPanel({
  cls,
  attendance,
  moduleFilter,
  onModuleFilter,
  syncing = false,
  onBulkEdit,
  onDeleteRequest,
  addStudent,
  removeStudent,
  importStudentsBulk,
}) {
  const [studentInput, setStudentInput] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [bulkMessage, setBulkMessage] = useState('')
  const [bulkError, setBulkError] = useState('')
  const [addStudentBusy, setAddStudentBusy] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [removingStudentId, setRemovingStudentId] = useState('')
  const [removedStudents, setRemovedStudents] = useState([])
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const [studentToRemove, setStudentToRemove] = useState(null)
  const [addConfirmOpen, setAddConfirmOpen] = useState(false)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)

  useAutoDismiss(Boolean(bulkMessage) && !bulkText.trim(), () => setBulkMessage(''))

  const classAttendance = attendance || {}
  const classModules = useMemo(() => listModulesForClass(classAttendance), [classAttendance])
  const filteredAttendance = useMemo(
    () =>
      moduleFilter === ''
        ? classAttendance
        : filterAttendanceByModule(classAttendance, moduleFilter),
    [classAttendance, moduleFilter],
  )
  const activeModuleLabel =
    moduleFilter === ''
      ? 'All modules'
      : classModules.find((m) => m.value === moduleFilter)?.label ??
        formatModuleLabel(moduleFilter)

  const sortedStudents = useMemo(
    () => [...(cls.students ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [cls.students],
  )

  const {
    visibleCount,
    rootRef: studentScrollRef,
    sentinelRef: studentSentinelRef,
    hasMore: hasMoreStudents,
  } = useScrollLoadMore({
    total: sortedStudents.length,
    batchSize: STUDENTS_PAGE_SIZE,
    resetKey: `${cls.id}-${moduleFilter}`,
  })

  const visibleStudents = sortedStudents.slice(0, visibleCount)
  const panelBusy = syncing || addStudentBusy || bulkBusy || Boolean(removingStudentId)

  async function handleAddStudent(e) {
    e.preventDefault()
    if (panelBusy || !studentInput.trim()) return
    setAddConfirmOpen(true)
  }

  async function handleConfirmAddStudent() {
    if (panelBusy || !studentInput.trim()) return
    setAddConfirmOpen(false)
    setAddStudentBusy(true)
    try {
      await addStudent(cls.id, studentInput)
      setStudentInput('')
    } finally {
      setAddStudentBusy(false)
    }
  }

  function requestBulkImport() {
    if (panelBusy) return
    if (!bulkText.trim()) {
      setBulkError('Enter at least one student name.')
      setBulkMessage('')
      return
    }
    setBulkConfirmOpen(true)
  }

  async function handleBulkImport() {
    if (panelBusy) return
    setBulkConfirmOpen(false)
    setBulkBusy(true)
    setBulkMessage('')
    setBulkError('')
    try {
      const count = await importStudentsBulk(cls.id, bulkText)
      if (count > 0) {
        setBulkText('')
        setBulkMessage(
          `Added ${count} student${count === 1 ? '' : 's'} to ${formatClassLabel(cls)}.`,
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

  function requestRemoveStudent(student) {
    if (panelBusy) return
    setStudentToRemove(student)
    setRemoveConfirmOpen(true)
  }

  async function handleConfirmRemoveStudent() {
    if (!studentToRemove || panelBusy) return
    const student = studentToRemove
    setRemoveConfirmOpen(false)
    setStudentToRemove(null)
    setRemovingStudentId(student.id)
    const token = { classId: cls.id, student, restoredAt: null }
    setRemovedStudents((prev) => [token, ...prev.slice(0, 4)])
    try {
      await removeStudent(cls.id, student.id)
      setTimeout(() => {
        setRemovedStudents((prev) => prev.filter((r) => r.student.id !== student.id))
      }, 7000)
    } finally {
      setRemovingStudentId('')
    }
  }

  async function handleUndo(token) {
    if (panelBusy) return
    setAddStudentBusy(true)
    try {
      await addStudent(token.classId, token.student.name)
      setRemovedStudents((prev) => prev.filter((r) => r.student.id !== token.student.id))
    } finally {
      setAddStudentBusy(false)
    }
  }

  const overlayLabel = bulkBusy
    ? 'Importing students…'
    : addStudentBusy
      ? 'Adding student…'
      : removingStudentId
        ? 'Removing student…'
        : syncing
          ? 'Syncing…'
          : 'Saving…'

  return (
    <SaveFieldOverlay busy={panelBusy} label={overlayLabel}>
      <div className="class-student-panel">
        <div className="class-detail-modules">
          <ModuleSearchSelect
            options={classModules}
            value={moduleFilter}
            onChange={onModuleFilter}
            allowEmpty
            emptyLabel="All modules"
            placeholder={
              classModules.length ? 'Search module…' : 'No modules recorded yet'
            }
            label="Filter by module"
            disabled={panelBusy || classModules.length === 0}
          />
          {classModules.length > 0 && moduleFilter !== '' && (
            <p className="class-detail-scope muted small">
              Showing absence counts for <strong>{activeModuleLabel}</strong> only.
            </p>
          )}
        </div>

        <div className="class-panel-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={panelBusy}
            onClick={onBulkEdit}
          >
            Bulk edit this class
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-danger-text"
            disabled={panelBusy}
            onClick={onDeleteRequest}
          >
            Delete class
          </button>
        </div>

        <form className="inline-form" onSubmit={handleAddStudent}>
          <input
            type="text"
            placeholder="Student name"
            value={studentInput}
            disabled={panelBusy}
            onChange={(e) => setStudentInput(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary" disabled={panelBusy}>
            {addStudentBusy ? 'Adding…' : 'Add student'}
          </button>
        </form>

        <details className="bulk-import">
          <summary>Bulk add names</summary>
          <textarea
            placeholder="One name per line, or separated by commas"
            rows={4}
            value={bulkText}
            disabled={panelBusy}
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
            onClick={requestBulkImport}
            disabled={panelBusy}
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
                  disabled={panelBusy}
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
          <div className="scroll-panel student-list-scroll" ref={studentScrollRef}>
            <ul className="student-list student-list-inset">
              {visibleStudents.map((st) => {
                const counts = getEffectiveAbsenceCounts(st, filteredAttendance)
                const removing = removingStudentId === st.id

                return (
                  <li key={st.id} className="student-list-item">
                    <div className="student-list-main">
                      <span className="student-name-text">{st.name}</span>
                    </div>
                    <div className="student-list-aside">
                      <AbsenceCountBadge counts={counts} />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-danger-text"
                        disabled={panelBusy}
                        onClick={() => requestRemoveStudent(st)}
                        aria-label={`Remove ${st.name}`}
                      >
                        {removing ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <ScrollSentinel
              sentinelRef={studentSentinelRef}
              hasMore={hasMoreStudents}
              label="Loading more students…"
            />
          </div>
        )}

        <ConfirmDialog
          open={removeConfirmOpen}
          title="Remove student?"
          confirmLabel="Remove student"
          cancelLabel="Keep student"
          danger
          busy={Boolean(removingStudentId)}
          onCancel={() => {
            if (removingStudentId) return
            setRemoveConfirmOpen(false)
            setStudentToRemove(null)
          }}
          onConfirm={handleConfirmRemoveStudent}
        >
          {studentToRemove && (
            <p className="modal-lead">
              Remove <strong>{studentToRemove.name}</strong> from{' '}
              <strong>{formatClassLabel(cls)}</strong>? Their attendance records for this class
              will be deleted. You can undo shortly after removing.
            </p>
          )}
        </ConfirmDialog>

        <ConfirmDialog
          open={addConfirmOpen}
          title="Add this student?"
          confirmLabel="Add student"
          cancelLabel="Cancel"
          busy={addStudentBusy}
          onCancel={() => {
            if (addStudentBusy) return
            setAddConfirmOpen(false)
          }}
          onConfirm={handleConfirmAddStudent}
        >
          <p className="modal-lead">
            Add <strong>{studentInput.trim()}</strong> to{' '}
            <strong>{formatClassLabel(cls)}</strong>?
          </p>
        </ConfirmDialog>

        <ConfirmDialog
          open={bulkConfirmOpen}
          title="Import these students?"
          confirmLabel="Import students"
          cancelLabel="Cancel"
          busy={bulkBusy}
          onCancel={() => {
            if (bulkBusy) return
            setBulkConfirmOpen(false)
          }}
          onConfirm={handleBulkImport}
        >
          <p className="modal-lead">
            Add up to <strong>{countBulkNames(bulkText)}</strong> student name
            {countBulkNames(bulkText) === 1 ? '' : 's'} to{' '}
            <strong>{formatClassLabel(cls)}</strong>? Names already in the class will be skipped.
          </p>
        </ConfirmDialog>
      </div>
    </SaveFieldOverlay>
  )
}
