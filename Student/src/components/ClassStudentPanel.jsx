import {
  Alert,
  Button,
  Collapse,
  Empty,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useAutoDismiss } from '../hooks/useAutoDismiss'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import ConfirmDialog from './ConfirmDialog'
import ModuleSearchSelect from './ModuleSearchSelect'
import SaveFieldOverlay from './SaveFieldOverlay'
import { RISK_META, getOverallAbsenceRisk } from '../utils/absenceRisk'
import { getEffectiveAbsenceCounts } from '../utils/attendanceStats'
import { formatClassLabel } from '../utils/classFormat'
import {
  filterAttendanceByModule,
  formatModuleLabel,
  listModulesForClass,
} from '../utils/sessionKeys'
import { UI } from '../utils/uiCopy'

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
  lockModuleFilter = false,
  syncing = false,
  onBulkEdit,
  onDeleteRequest,
  addStudent,
  removeStudent,
  importStudentsBulk,
  onActivityChange,
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

  const [studentTableRef, studentTableHeight] = useScrollRegionHeight(200)

  const panelBusy = syncing || addStudentBusy || bulkBusy || Boolean(removingStudentId)

  const studentTableData = useMemo(
    () =>
      sortedStudents.map((st) => {
        const counts = getEffectiveAbsenceCounts(st, filteredAttendance)
        return {
          key: st.id,
          student: st,
          counts,
          risk: getOverallAbsenceRisk(counts),
        }
      }),
    [sortedStudents, filteredAttendance],
  )

  useEffect(() => {
    onActivityChange?.({
      processing: panelBusy,
      draft: Boolean(studentInput.trim()) || Boolean(bulkText.trim()),
    })
  }, [panelBusy, studentInput, bulkText, onActivityChange])

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
      setBulkError(`Enter at least one ${UI.learningPartner.toLowerCase()} name.`)
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
          `Added ${count} ${UI.learningPartner.toLowerCase()}${count === 1 ? '' : 's'} to ${formatClassLabel(cls)}.`,
        )
      } else {
        setBulkMessage(
          `No new ${UI.learningPartners.toLowerCase()} to add — all names were already in this class.`,
        )
      }
    } catch (err) {
      setBulkError(
        err.message || `Failed to import ${UI.learningPartners.toLowerCase()}. Try again.`,
      )
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

  const studentColumns = useMemo(
    () => [
      {
        title: UI.learningPartner,
        key: 'name',
        ellipsis: true,
        render: (_, row) => row.student.name,
      },
      {
        title: 'Status',
        key: 'status',
        width: 92,
        render: (_, row) => (
          <Tag
            variant="filled"
            className={`absence-risk-tag absence-risk-tag-${row.risk}`}
            title={RISK_META[row.risk]?.description}
          >
            {RISK_META[row.risk]?.shortLabel ?? row.risk}
          </Tag>
        ),
      },
      {
        title: 'Total',
        key: 'total',
        width: 64,
        align: 'center',
        render: (_, row) => (
          <Typography.Text strong className="roster-student-total">
            {row.counts.total}
          </Typography.Text>
        ),
      },
      {
        title: 'Streak',
        key: 'streak',
        width: 72,
        align: 'center',
        render: (_, row) => {
          const streakClass =
            row.risk === 'critical'
              ? 'dashboard-student-days-critical'
              : row.risk === 'warning'
                ? 'dashboard-student-days-warning'
                : row.risk === 'watch'
                  ? 'dashboard-student-days-watch'
                  : ''

          return (
            <span className={`dashboard-student-days ${streakClass}`.trim()}>
              {row.counts.consecutive}
            </span>
          )
        },
      },
      {
        title: 'Type',
        key: 'type',
        width: 80,
        render: (_, row) =>
          row.counts.usesManualTotal || row.counts.usesManualConsecutive ? (
            <Tag color="processing" className="roster-student-type-tag">
              Manual
            </Tag>
          ) : null,
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 96,
        align: 'right',
        render: (_, row) => (
          <Button
            type="link"
            danger
            disabled={panelBusy}
            loading={removingStudentId === row.student.id}
            onClick={() => requestRemoveStudent(row.student)}
          >
            Remove
          </Button>
        ),
      },
    ],
    [panelBusy, removingStudentId],
  )

  const overlayLabel = bulkBusy
    ? `Importing ${UI.learningPartners.toLowerCase()}…`
    : addStudentBusy
      ? `Adding ${UI.learningPartner.toLowerCase()}…`
      : removingStudentId
        ? `Removing ${UI.learningPartner.toLowerCase()}…`
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
            allowEmpty={!lockModuleFilter}
            emptyLabel="All modules"
            placeholder={
              classModules.length ? 'Search module…' : 'No modules recorded yet'
            }
            label={lockModuleFilter ? 'Module / Subject' : 'Filter by Module'}
            disabled={panelBusy || classModules.length === 0 || lockModuleFilter}
          />
          {lockModuleFilter && moduleFilter !== '' && (
            <p className="class-detail-scope muted small">
              Browsing <strong>{activeModuleLabel}</strong> — switch to All classes to change
              module per class.
            </p>
          )}
          {!lockModuleFilter && classModules.length > 0 && moduleFilter !== '' && (
            <p className="class-detail-scope muted small">
              Showing absence counts for <strong>{activeModuleLabel}</strong> only.
            </p>
          )}
        </div>

        <div className="class-panel-actions">
          <Button disabled={panelBusy} onClick={onBulkEdit}>
            Bulk Edit This Class
          </Button>
          <Button
            type="link"
            className="link-destructive-muted"
            disabled={panelBusy}
            onClick={onDeleteRequest}
          >
            Delete Class
          </Button>
        </div>

        <form className="inline-form antd-inline-form" onSubmit={handleAddStudent}>
          <Input
            placeholder={`${UI.learningPartner} name`}
            value={studentInput}
            disabled={panelBusy}
            onChange={(e) => setStudentInput(e.target.value)}
          />
          <Button type="default" htmlType="submit" disabled={panelBusy} loading={addStudentBusy}>
            {`Add ${UI.learningPartner}`}
          </Button>
        </form>

        <Collapse
          className="bulk-import-collapse"
          items={[
            {
              key: 'bulk',
              label: 'Bulk Add Names',
              children: (
                <>
                  <Input.TextArea
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
                  <Button
                    type="default"
                    style={{ marginTop: '0.5rem' }}
                    onClick={requestBulkImport}
                    disabled={panelBusy}
                    loading={bulkBusy}
                  >
                    Import
                  </Button>
                  {bulkMessage && <Alert type="success" showIcon title={bulkMessage} style={{ marginTop: '0.5rem' }} />}
                  {bulkError && <Alert type="error" showIcon title={bulkError} style={{ marginTop: '0.5rem' }} />}
                </>
              ),
            },
          ]}
        />

        {removedStudents.length > 0 && (
          <Space direction="vertical" style={{ width: '100%', marginBottom: '0.5rem' }}>
            {removedStudents.map((r) => (
              <Alert
                key={r.student.id}
                type="info"
                showIcon
                title={`Removed ${r.student.name}`}
                action={
                  <Button size="small" disabled={panelBusy} onClick={() => handleUndo(r)}>
                    Undo
                  </Button>
                }
              />
            ))}
          </Space>
        )}

        {sortedStudents.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`No ${UI.learningPartners.toLowerCase()} in this class.`}
          />
        ) : (
          <div className="table-scroll-region student-list-scroll" ref={studentTableRef}>
            <Table
              size="small"
              pagination={{ pageSize: 25, showSizeChanger: false, hideOnSinglePage: true }}
              scroll={{ y: studentTableHeight }}
              dataSource={studentTableData}
              columns={studentColumns}
            />
          </div>
        )}

        <ConfirmDialog
          open={removeConfirmOpen}
          title={`Remove ${UI.learningPartner.toLowerCase()}?`}
          confirmLabel={`Remove ${UI.learningPartner.toLowerCase()}`}
          cancelLabel={`Keep ${UI.learningPartner.toLowerCase()}`}
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
          title={`Add this ${UI.learningPartner.toLowerCase()}?`}
          confirmLabel={`Add ${UI.learningPartner}`}
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
          title={`Import these ${UI.learningPartners.toLowerCase()}?`}
          confirmLabel={`Import ${UI.learningPartners.toLowerCase()}`}
          cancelLabel="Cancel"
          busy={bulkBusy}
          onCancel={() => {
            if (bulkBusy) return
            setBulkConfirmOpen(false)
          }}
          onConfirm={handleBulkImport}
        >
          <p className="modal-lead">
            Add up to <strong>{countBulkNames(bulkText)}</strong>{' '}
            {UI.learningPartner.toLowerCase()} name
            {countBulkNames(bulkText) === 1 ? '' : 's'} to{' '}
            <strong>{formatClassLabel(cls)}</strong>? Names already in the class will be skipped.
          </p>
        </ConfirmDialog>
      </div>
    </SaveFieldOverlay>
  )
}
