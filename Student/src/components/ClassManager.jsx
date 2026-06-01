import { useEffect, useState } from 'react'
import { useAutoDismiss } from '../hooks/useAutoDismiss'
import { useScrollLoadMore } from '../hooks/useScrollLoadMore'
import AbsenceBulkEditor from './AbsenceBulkEditor'
import ClassStudentPanel from './ClassStudentPanel'
import ScrollSentinel from './ScrollSentinel'
import { formatClassLabel } from '../utils/classFormat'
import ConfirmDialog from './ConfirmDialog'
import SaveFieldOverlay from './SaveFieldOverlay'

export default function ClassManager({
  classes,
  attendance,
  syncing = false,
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
  const [openClassIds, setOpenClassIds] = useState(() => new Set())
  const [moduleFilters, setModuleFilters] = useState({})
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [bulkEditClassId, setBulkEditClassId] = useState('')
  const [deleteTargetClassId, setDeleteTargetClassId] = useState('')
  const [addClassBusy, setAddClassBusy] = useState(false)
  const [addClassMessage, setAddClassMessage] = useState('')
  const [addClassError, setAddClassError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [addConfirmOpen, setAddConfirmOpen] = useState(false)
  const [pendingClassFields, setPendingClassFields] = useState(null)

  useAutoDismiss(Boolean(addClassMessage) && !form.qualification.trim(), () => setAddClassMessage(''))

  const sortedClasses = [...classes].sort((a, b) =>
    formatClassLabel(a).localeCompare(formatClassLabel(b)),
  )

  const deleteTargetClass = classes.find((c) => c.id === deleteTargetClassId)
  const addClassLocked = addClassBusy || syncing

  const {
    visibleCount: visibleClassCount,
    rootRef: classScrollRef,
    sentinelRef: classSentinelRef,
    hasMore: hasMoreClasses,
  } = useScrollLoadMore({
    total: sortedClasses.length,
    batchSize: 12,
    resetKey: String(sortedClasses.length),
  })

  const visibleClasses = sortedClasses.slice(0, visibleClassCount)

  useEffect(() => {
    setOpenClassIds((prev) => {
      const valid = new Set([...prev].filter((id) => classes.some((c) => c.id === id)))
      return valid.size === prev.size ? prev : valid
    })
  }, [classes])

  function toggleClassOpen(classId) {
    setOpenClassIds((prev) => {
      const next = new Set(prev)
      if (next.has(classId)) next.delete(classId)
      else next.add(classId)
      return next
    })
  }

  function setModuleFilter(classId, value) {
    setModuleFilters((prev) => ({ ...prev, [classId]: value }))
  }

  async function handleAddClass(e) {
    e.preventDefault()
    if (!form.qualification.trim() || addClassLocked) return
    const fields = {
      intake: Number(form.intake) || null,
      level: Number(form.level) || null,
      qualification: form.qualification.trim(),
      group: Number(form.group) || null,
    }
    setPendingClassFields(fields)
    setAddConfirmOpen(true)
  }

  async function handleConfirmAddClass() {
    if (!pendingClassFields || addClassLocked) return
    setAddConfirmOpen(false)
    setAddClassBusy(true)
    setAddClassMessage('')
    setAddClassError('')
    try {
      const newId = await addClass(pendingClassFields)
      if (newId) {
        setOpenClassIds((prev) => new Set(prev).add(newId))
      }
      setForm({ intake: '', level: '', qualification: '', group: '' })
      setAddClassMessage(`"${formatClassLabel(pendingClassFields)}" added successfully.`)
    } catch (err) {
      setAddClassError(err.message || 'Failed to add class. Try again.')
    } finally {
      setAddClassBusy(false)
      setPendingClassFields(null)
    }
  }

  async function handleConfirmDeleteClass() {
    if (!deleteTargetClassId || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await removeClass(deleteTargetClassId)
      setOpenClassIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteTargetClassId)
        return next
      })
      setDeleteOpen(false)
      setDeleteTargetClassId('')
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete class. Try again.')
    } finally {
      setDeleteBusy(false)
    }
  }

  function openDeleteDialog(classId) {
    setDeleteTargetClassId(classId)
    setDeleteError('')
    setDeleteOpen(true)
  }

  function openBulkEdit(classId) {
    setBulkEditClassId(classId)
    setBulkEditMode(true)
  }

  if (bulkEditMode) {
    return (
      <AbsenceBulkEditor
        classes={classes}
        attendance={attendance}
        initialClassId={bulkEditClassId || sortedClasses[0]?.id || ''}
        bulkUpdateStudents={bulkUpdateStudents}
        onClose={() => {
          setBulkEditMode(false)
          setBulkEditClassId('')
        }}
      />
    )
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Classes &amp; students</h2>
        <p className="panel-desc">
          Expand a class to manage its roster. Student lists load only when opened to keep
          things fast.
        </p>
      </header>

      <details className="collapsible-form">
        <summary className="collapsible-summary">Add a new class manually</summary>
        <SaveFieldOverlay busy={addClassBusy} label="Adding class…">
          <form className="portal-meta-grid add-class-form" onSubmit={handleAddClass}>
            <fieldset className="add-class-fields" disabled={addClassLocked}>
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
              <button type="submit" className="btn btn-primary" disabled={addClassLocked}>
                {addClassBusy ? 'Adding class…' : 'Add class'}
              </button>
            </fieldset>
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
        </SaveFieldOverlay>
      </details>

      {classes.length === 0 ? (
        <p className="empty-state">No classes yet. Import a screenshot or add one above.</p>
      ) : (
        <>
          <p className="class-accordion-hint muted small">
            {sortedClasses.length} class{sortedClasses.length === 1 ? '' : 'es'} ·{' '}
            {openClassIds.size} expanded · scroll for more
          </p>

          <div className="scroll-panel class-accordion-scroll" ref={classScrollRef}>
            <div className="class-accordion-list">
            {visibleClasses.map((cls) => {
              const isOpen = openClassIds.has(cls.id)
              const studentCount = cls.students?.length ?? 0

              return (
                <details
                  key={cls.id}
                  className={`class-accordion-item ${isOpen ? 'is-open' : ''}`}
                  open={isOpen}
                >
                  <summary
                    className="class-accordion-summary"
                    onClick={(e) => {
                      e.preventDefault()
                      if (deleteBusy || addClassBusy) return
                      toggleClassOpen(cls.id)
                    }}
                  >
                    <span className="class-accordion-title">{formatClassLabel(cls)}</span>
                    <span className="class-accordion-meta">
                      {studentCount} student{studentCount === 1 ? '' : 's'}
                    </span>
                  </summary>

                  {isOpen && (
                    <ClassStudentPanel
                      cls={cls}
                      attendance={attendance?.[cls.id] || {}}
                      moduleFilter={moduleFilters[cls.id] ?? ''}
                      onModuleFilter={(value) => setModuleFilter(cls.id, value)}
                      syncing={syncing}
                      onBulkEdit={() => openBulkEdit(cls.id)}
                      onDeleteRequest={() => openDeleteDialog(cls.id)}
                      addStudent={addStudent}
                      removeStudent={removeStudent}
                      importStudentsBulk={importStudentsBulk}
                    />
                  )}
                </details>
              )
            })}
            </div>
            <ScrollSentinel
              sentinelRef={classSentinelRef}
              hasMore={hasMoreClasses}
              label="Loading more classes…"
            />
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
              setDeleteTargetClassId('')
              setDeleteError('')
            }}
            onConfirm={handleConfirmDeleteClass}
          >
            {deleteTargetClass ? (
              <p className="modal-lead">
                Delete <strong>{formatClassLabel(deleteTargetClass)}</strong> and all of its
                attendance records? This cannot be undone.
              </p>
            ) : (
              <p className="modal-lead">
                Delete this class and all of its attendance records? This cannot be undone.
              </p>
            )}
          </ConfirmDialog>

          <ConfirmDialog
            open={addConfirmOpen}
            title="Add this class?"
            confirmLabel="Add class"
            cancelLabel="Cancel"
            busy={addClassBusy}
            onCancel={() => {
              if (addClassBusy) return
              setAddConfirmOpen(false)
              setPendingClassFields(null)
            }}
            onConfirm={handleConfirmAddClass}
          >
            {pendingClassFields && (
              <p className="modal-lead">
                Create class <strong>{formatClassLabel(pendingClassFields)}</strong>? You can add
                students after it is created.
              </p>
            )}
          </ConfirmDialog>
        </>
      )}
    </section>
  )
}
