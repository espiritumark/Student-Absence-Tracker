import {
  Alert,
  Button,
  Collapse,
  Empty,
  Input,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { LinkOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import { useAppNotifier } from '../hooks/useAppNotifier'
import {
  ANT_TABLE_HEADER_OFFSET,
  ANT_TABLE_PAGINATION_OFFSET,
  ANT_TABLE_ROW_SMALL,
  useAdaptiveTableScroll,
} from '../hooks/useScrollRegionHeight'
import ConfirmDialog from './ConfirmDialog'
import PortalAttendanceReviewModal from './PortalAttendanceReviewModal'
import ModuleSearchSelect from './ModuleSearchSelect'
import SaveFieldOverlay from './SaveFieldOverlay'
import { RISK_META, getOverallAbsenceRisk } from '../utils/absenceRisk'
import { getEffectiveAbsenceCounts } from '../utils/attendanceStats'
import { formatClassLabel } from '../utils/classFormat'
import {
  filterAttendanceByModule,
  formatModuleLabel,
  listModulesForClass,
  listSessionKeysForModule,
} from '../utils/sessionKeys'
import { filterByNameSearch } from '../utils/tableNameSearch'
import { UI, formatLpCount } from '../utils/uiCopy'
import { NOTIFIER_KEYS } from '../utils/appNotifications'
import TableNameSearch from './TableNameSearch'
import StudentNameCell from './StudentNameCell'

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
  deleteModuleSessions,
  addStudent,
  removeStudent,
  updateStudent,
  importStudentsBulk,
  syncRosterFromPortal,
  previewPortalAttendance,
  applyPortalAttendance,
  onActivityChange,
}) {
  const [studentInput, setStudentInput] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [bulkMessage, setBulkMessage] = useState('')
  const [bulkError, setBulkError] = useState('')
  const notify = useAppNotifier()
  const [addStudentBusy, setAddStudentBusy] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [portalRosterBusy, setPortalRosterBusy] = useState(false)
  const [portalAttendanceBusy, setPortalAttendanceBusy] = useState(false)
  const [attendanceReviewOpen, setAttendanceReviewOpen] = useState(false)
  const [attendanceReviewDraft, setAttendanceReviewDraft] = useState(null)
  const [attendanceReviewError, setAttendanceReviewError] = useState('')
  const [removingStudentId, setRemovingStudentId] = useState('')
  const [removedStudents, setRemovedStudents] = useState([])
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const [studentToRemove, setStudentToRemove] = useState(null)
  const [addConfirmOpen, setAddConfirmOpen] = useState(false)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [removeModuleConfirmOpen, setRemoveModuleConfirmOpen] = useState(false)
  const [removeModuleBusy, setRemoveModuleBusy] = useState(false)
  const [removeModuleError, setRemoveModuleError] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [renamingStudentId, setRenamingStudentId] = useState('')

  const classAttendance = attendance || {}
  const moduleSessionCount = useMemo(
    () =>
      lockModuleFilter && moduleFilter
        ? listSessionKeysForModule(classAttendance, moduleFilter).length
        : 0,
    [classAttendance, lockModuleFilter, moduleFilter],
  )
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
      ? 'All Modules'
      : classModules.find((m) => m.value === moduleFilter)?.label ??
        formatModuleLabel(moduleFilter)

  const sortedStudents = useMemo(
    () => [...(cls.students ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [cls.students],
  )

  const panelBusy =
    syncing ||
    addStudentBusy ||
    bulkBusy ||
    portalRosterBusy ||
    portalAttendanceBusy ||
    removeModuleBusy ||
    Boolean(removingStudentId) ||
    Boolean(renamingStudentId)

  async function handleConfirmRemoveFromModule() {
    if (!deleteModuleSessions || !moduleFilter || removeModuleBusy) return
    setRemoveModuleBusy(true)
    setRemoveModuleError('')
    try {
      const removed = await deleteModuleSessions(cls.id, moduleFilter)
      setRemoveModuleConfirmOpen(false)
      notify.success({
        key: `remove-module-${cls.id}-${moduleFilter}`,
        title:
          removed === 1
            ? `Removed 1 session from ${activeModuleLabel}`
            : `Removed ${removed} sessions from ${activeModuleLabel}`,
        description: `${formatClassLabel(cls)} is unchanged in By Class and other modules.`,
      })
    } catch (e) {
      setRemoveModuleError(e.message || 'Could not remove module sessions.')
    } finally {
      setRemoveModuleBusy(false)
    }
  }

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

  const filteredStudentTableData = useMemo(
    () => filterByNameSearch(studentTableData, nameSearch, (row) => row.student.name),
    [studentTableData, nameSearch],
  )

  const studentListPageSize = 25
  const showStudentPagination = filteredStudentTableData.length > studentListPageSize
  const {
    ref: studentTableRef,
    scrollY: studentTableScrollY,
    needsScroll: studentTableNeedsScroll,
  } = useAdaptiveTableScroll({
    rowCount: filteredStudentTableData.length,
    rowHeight: ANT_TABLE_ROW_SMALL,
    headerOffset: ANT_TABLE_HEADER_OFFSET,
    paginationOffset: showStudentPagination ? ANT_TABLE_PAGINATION_OFFSET : 0,
    defaultHeight: 200,
    remeasureKey: `${cls.id}:${filteredStudentTableData.length}:${showStudentPagination ? 1 : 0}`,
  })

  useEffect(() => {
    setNameSearch('')
  }, [cls.id])

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
      const title = `Enter at least one ${UI.learningPartnerName}.`
      setBulkError(title)
      notify.error({ key: 'roster-bulk-error', title, duration: 8 })
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
        const title = `Added ${formatLpCount(count)} to ${formatClassLabel(cls)}.`
        setBulkMessage(title)
        notify.success({ key: 'roster-bulk-success', title })
      } else {
        const title = `No new ${UI.learningPartners} to add — all names were already in this class.`
        setBulkMessage(title)
        notify.info({ key: 'roster-bulk-success', title })
      }
    } catch (err) {
      const title = err.message || `Failed to import ${UI.learningPartners}. Try again.`
      setBulkError(title)
      notify.error({ key: 'roster-bulk-error', title, duration: 8 })
    } finally {
      setBulkBusy(false)
    }
  }

  async function handlePullPortalRoster() {
    if (panelBusy || !syncRosterFromPortal) return
    if (!cls.portalClassId) {
      notify.warning({
        key: NOTIFIER_KEYS.portalSyncError,
        title: UI.portalRosterNotLinked,
        duration: 8,
      })
      return
    }

    setPortalRosterBusy(true)
    try {
      const result = await syncRosterFromPortal(cls.id)
      const title = UI.portalRosterPulled
      const description =
        result.added > 0
          ? `Added ${formatLpCount(result.added)} from ${result.portalCount} on the college portal (${result.alreadyPresent} already in hub).`
          : `All ${result.portalCount} ${result.portalCount === 1 ? 'name was' : 'names were'} already in this class.`
      notify.success({ key: NOTIFIER_KEYS.portalSync, title, description })
    } catch (err) {
      const title = err.message || 'Failed to pull roster from the college portal.'
      notify.error({ key: NOTIFIER_KEYS.portalSyncError, title, duration: 8 })
    } finally {
      setPortalRosterBusy(false)
    }
  }

  async function handlePullPortalAttendance() {
    if (panelBusy || !previewPortalAttendance) return
    if (!cls.portalClassId) {
      notify.warning({
        key: NOTIFIER_KEYS.portalSyncError,
        title: UI.portalAttendanceNotLinked,
        duration: 8,
      })
      return
    }

    setPortalAttendanceBusy(true)
    setAttendanceReviewError('')
    try {
      const preview = await previewPortalAttendance(cls.id)
      setAttendanceReviewDraft(preview.reviewDraft)
      setAttendanceReviewOpen(true)
    } catch (err) {
      const title = err.message || 'Failed to pull attendance from the college portal.'
      notify.error({ key: NOTIFIER_KEYS.portalSyncError, title, duration: 10 })
    } finally {
      setPortalAttendanceBusy(false)
    }
  }

  async function handleConfirmPortalAttendance(confirmedDraft) {
    if (!applyPortalAttendance || portalAttendanceBusy) return
    setPortalAttendanceBusy(true)
    setAttendanceReviewError('')
    try {
      const result = await applyPortalAttendance(confirmedDraft)
      setAttendanceReviewOpen(false)
      setAttendanceReviewDraft(null)
      notify.success({
        key: NOTIFIER_KEYS.portalSync,
        title: UI.portalAttendancePulled,
        description: `${result.module || 'Session'} on ${result.date}: ${result.presentCount} present, ${result.absentCount} absent merged (${result.matchedCount} matched).`,
      })
      onActivityChange?.()
    } catch (err) {
      const title = err.message || 'Failed to merge portal attendance.'
      setAttendanceReviewError(title)
      notify.error({ key: NOTIFIER_KEYS.portalSyncError, title, duration: 10 })
    } finally {
      setPortalAttendanceBusy(false)
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

  async function handleRenameStudent(studentId, nextName) {
    if (!updateStudent || panelBusy) return
    setRenamingStudentId(studentId)
    try {
      await updateStudent(cls.id, studentId, { name: nextName })
      notify.success({ title: 'Name updated.' })
    } catch (err) {
      notify.error({
        title: 'Could not update name',
        description: err.message || 'Try again.',
      })
      throw err
    } finally {
      setRenamingStudentId('')
    }
  }

  const studentColumns = useMemo(
    () => [
      {
        title: UI.learningPartner,
        key: 'name',
        ellipsis: true,
        render: (_, row) => (
          <StudentNameCell
            name={row.student.name}
            disabled={panelBusy}
            saving={renamingStudentId === row.student.id}
            onSave={(nextName) => handleRenameStudent(row.student.id, nextName)}
          />
        ),
      },
      {
        title: UI.status,
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
        title: UI.total,
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
        title: UI.streak,
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
        title: UI.actions,
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
    [panelBusy, removingStudentId, renamingStudentId, updateStudent, cls.id, notify],
  )

  const overlayLabel = portalRosterBusy
    ? 'Pulling portal roster…'
    : bulkBusy
    ? `Importing ${UI.learningPartners}…`
    : addStudentBusy
      ? `Adding ${UI.learningPartner}…`
      : removingStudentId
        ? `Removing ${UI.learningPartner}…`
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
            emptyLabel="All Modules"
            placeholder={
              classModules.length ? 'Search module…' : 'No modules recorded yet'
            }
            label={lockModuleFilter ? 'Module / Subject' : 'Filter by Module'}
            disabled={panelBusy || classModules.length === 0 || lockModuleFilter}
          />
          {lockModuleFilter && moduleFilter !== '' && (
            <p className="class-detail-scope muted small">
              Browsing <strong>{activeModuleLabel}</strong> — Total and streak are for this module
              only. Switch to <strong>By Class</strong> and <strong>All Modules</strong> for
              class-wide counts.
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
          {syncRosterFromPortal ? (
            <Tooltip
              title={
                cls.portalClassId
                  ? 'Add Learning Partners from the college portal roster for this linked class.'
                  : UI.portalRosterNotLinked
              }
            >
              <Button
                type="default"
                icon={<LinkOutlined />}
                disabled={panelBusy || !cls.portalClassId}
                loading={portalRosterBusy}
                onClick={handlePullPortalRoster}
              >
                {UI.pullPortalRoster}
              </Button>
            </Tooltip>
          ) : null}
          {previewPortalAttendance && applyPortalAttendance ? (
            <Tooltip
              title={
                cls.portalClassId
                  ? 'Import today’s present/absent marks from the college portal for this linked class.'
                  : UI.portalAttendanceNotLinked
              }
            >
              <Button
                type="default"
                icon={<LinkOutlined />}
                disabled={panelBusy || !cls.portalClassId}
                loading={portalAttendanceBusy}
                onClick={handlePullPortalAttendance}
              >
                {UI.pullPortalAttendance}
              </Button>
            </Tooltip>
          ) : null}
          {lockModuleFilter && moduleFilter && deleteModuleSessions ? (
            <Button
              type="link"
              className="link-destructive-muted"
              disabled={panelBusy || moduleSessionCount === 0}
              onClick={() => {
                setRemoveModuleError('')
                setRemoveModuleConfirmOpen(true)
              }}
            >
              {UI.removeFromModule}
            </Button>
          ) : null}
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
            placeholder={UI.learningPartnerName}
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
                </>
              ),
            },
          ]}
        />

        {removedStudents.length > 0 && (
          <Space orientation="vertical" style={{ width: '100%', marginBottom: '0.5rem' }}>
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
            description={`No ${UI.learningPartners} in this class.`}
          />
        ) : (
            <div className="table-scroll-region table-scroll-region-with-search student-list-scroll">
              <TableNameSearch
                value={nameSearch}
                onChange={setNameSearch}
                matchCount={filteredStudentTableData.length}
                totalCount={studentTableData.length}
              />
              <div
                className={`table-scroll-region student-list-scroll-inner${studentTableNeedsScroll ? '' : ' table-scroll-region-fits'}`}
                ref={studentTableRef}
              >
                {filteredStudentTableData.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No names match this search."
                  />
                ) : (
                  <Table
                    size="small"
                    pagination={{
                      pageSize: studentListPageSize,
                      showSizeChanger: false,
                      hideOnSinglePage: true,
                    }}
                    scroll={studentTableScrollY ? { y: studentTableScrollY } : undefined}
                  dataSource={filteredStudentTableData}
                  columns={studentColumns}
                />
              )}
            </div>
          </div>
        )}

        <ConfirmDialog
          open={removeConfirmOpen}
          title={`Remove ${UI.learningPartner}?`}
          confirmLabel={`Remove ${UI.learningPartner}`}
          cancelLabel={`Keep ${UI.learningPartner}`}
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
          title={`Add this ${UI.learningPartner}?`}
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
          open={removeModuleConfirmOpen}
          title={UI.confirmRemoveFromModule}
          confirmLabel={UI.removeFromModule}
          cancelLabel="Keep Sessions"
          danger
          busy={removeModuleBusy}
          error={removeModuleError}
          onCancel={() => {
            if (removeModuleBusy) return
            setRemoveModuleConfirmOpen(false)
            setRemoveModuleError('')
          }}
          onConfirm={handleConfirmRemoveFromModule}
        >
          <p className="modal-lead">
            Remove all <strong>{moduleSessionCount}</strong> saved attendance session
            {moduleSessionCount === 1 ? '' : 's'} for <strong>{activeModuleLabel}</strong> from{' '}
            <strong>{formatClassLabel(cls)}</strong>?
          </p>
          <p className="modal-lead">
            The class and its roster stay intact. Other modules for this class are not affected.
            This only removes the class from the <strong>By Module</strong> list for this subject.
          </p>
        </ConfirmDialog>

        <ConfirmDialog
          open={bulkConfirmOpen}
          title={`Import these ${UI.learningPartners}?`}
          confirmLabel={`Import ${UI.learningPartners}`}
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
            {UI.learningPartnerName}
            {countBulkNames(bulkText) === 1 ? '' : 's'} to{' '}
            <strong>{formatClassLabel(cls)}</strong>? Names already in the class will be skipped.
          </p>
        </ConfirmDialog>

        <PortalAttendanceReviewModal
          open={attendanceReviewOpen}
          draft={attendanceReviewDraft}
          busy={portalAttendanceBusy}
          error={attendanceReviewError}
          onCancel={() => {
            if (portalAttendanceBusy) return
            setAttendanceReviewOpen(false)
            setAttendanceReviewDraft(null)
            setAttendanceReviewError('')
          }}
          onConfirm={handleConfirmPortalAttendance}
        />
      </div>
    </SaveFieldOverlay>
  )
}
