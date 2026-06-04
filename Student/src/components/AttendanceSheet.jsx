import dayjs from 'dayjs'
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Table,
  Space,
  Typography,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { formatClassLabel } from '../utils/classFormat'
import { dateKey, formatDateLabel } from '../utils/dates'
import { useReportTabActivity } from '../hooks/useReportTabActivity'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import {
  findSessionKey,
  formatModuleLabel,
  listModulesForClass,
  listSessionsForDate,
  normalizeModuleKey,
} from '../utils/sessionKeys'
import ConfirmDialog from './ConfirmDialog'
import ImportSaveConfirmModal from './ImportSaveConfirmModal'
import ModuleSearchSelect from './ModuleSearchSelect'
import SaveFieldOverlay from './SaveFieldOverlay'
import PanelChrome from './PanelChrome'
import SearchableSelect from './SearchableSelect'
import { buildAttendanceLogFromSummary } from '../utils/activityLog'
import { buildImportPayload, computeImportSaveSummary } from '../utils/importReview'
import { filterByNameSearch } from '../utils/tableNameSearch'
import { UI } from '../utils/uiCopy'
import TableNameSearch from './TableNameSearch'

const EMPTY_RECORDS = {}
const EMPTY_CLASS_ATTENDANCE = {}

function getSessionRecords(classAttendance, sessionKey) {
  return classAttendance?.[sessionKey]?.records ?? EMPTY_RECORDS
}

function recordsSnapshot(dayRecords, students) {
  const snap = {}
  for (const st of students) {
    const rec = dayRecords[st.id] || { status: 'present', priorNotice: false }
    snap[st.id] = { status: rec.status, priorNotice: Boolean(rec.priorNotice) }
  }
  return snap
}

function recordsEqual(a, b, students) {
  for (const st of students) {
    const left = a[st.id] || { status: 'present', priorNotice: false }
    const right = b[st.id] || { status: 'present', priorNotice: false }
    if (left.status !== right.status || left.priorNotice !== right.priorNotice) return false
  }
  return true
}

export default function AttendanceSheet({
  classes,
  attendance,
  setAttendance,
  setSessionMeta,
  syncing = false,
  recordAction,
  onTabActivityChange,
}) {
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? '')
  const [selectedDate, setSelectedDate] = useState(dateKey())
  const [moduleInput, setModuleInput] = useState('')
  const [pending, setPending] = useState(false)
  const [draftRecords, setDraftRecords] = useState({})
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [confirmSummary, setConfirmSummary] = useState(null)
  const [pendingPayload, setPendingPayload] = useState(null)
  const [confirmError, setConfirmError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [markAllConfirmOpen, setMarkAllConfirmOpen] = useState(false)
  const [pendingMarkAllStatus, setPendingMarkAllStatus] = useState(null)
  const [nameSearch, setNameSearch] = useState('')

  const locked = syncing || pending

  const sortedClasses = [...classes].sort((a, b) =>
    formatClassLabel(a).localeCompare(formatClassLabel(b)),
  )
  const classOptions = sortedClasses.map((c) => ({ value: c.id, label: formatClassLabel(c) }))

  const selectedClass = classes.find((c) => c.id === selectedClassId)
  const classAttendance = useMemo(
    () =>
      selectedClassId
        ? attendance?.[selectedClassId] ?? EMPTY_CLASS_ATTENDANCE
        : EMPTY_CLASS_ATTENDANCE,
    [attendance, selectedClassId],
  )

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

  useEffect(() => {
    const sessions = listSessionsForDate(classAttendance, selectedDate)
    setModuleInput((prev) => {
      if (prev && sessions.some((s) => normalizeModuleKey(s.module) === normalizeModuleKey(prev))) {
        return prev
      }
      return sessions[0]?.module ?? ''
    })
  }, [selectedClassId, selectedDate, classAttendance])

  const sessionKey = findSessionKey(classAttendance, selectedDate, moduleInput)
  const dayRecords = useMemo(
    () => getSessionRecords(classAttendance, sessionKey),
    [classAttendance, sessionKey],
  )

  const moduleOptions = useMemo(() => {
    const seen = new Map()
    for (const { module } of listSessionsForDate(classAttendance, selectedDate)) {
      const label = formatModuleLabel(module)
      const key = normalizeModuleKey(module)
      if (!seen.has(key)) seen.set(key, { value: module || '', label })
    }
    for (const { value, label } of listModulesForClass(classAttendance)) {
      if (!seen.has(value)) seen.set(value, { value, label })
    }
    if (moduleInput) {
      const key = normalizeModuleKey(moduleInput)
      if (!seen.has(key)) {
        seen.set(key, { value: moduleInput, label: formatModuleLabel(moduleInput) })
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [classAttendance, selectedDate, moduleInput])

  const sortedStudents = useMemo(() => {
    if (!selectedClass?.students?.length) return []
    return [...selectedClass.students].sort((a, b) => a.name.localeCompare(b.name))
  }, [selectedClass])

  const savedRecords = useMemo(
    () => recordsSnapshot(dayRecords, sortedStudents),
    [dayRecords, sortedStudents],
  )

  const savedRecordsKey = useMemo(() => JSON.stringify(savedRecords), [savedRecords])

  useEffect(() => {
    setDraftRecords(recordsSnapshot(dayRecords, sortedStudents))
    setSaveMessage('')
  }, [selectedClassId, selectedDate, sessionKey, savedRecordsKey, dayRecords, sortedStudents])

  const hasDraftChanges = useMemo(
    () => sortedStudents.length > 0 && !recordsEqual(draftRecords, savedRecords, sortedStudents),
    [draftRecords, savedRecords, sortedStudents],
  )

  const [studentTableRef, studentTableHeight] = useScrollRegionHeight(280)

  const attendanceRows = useMemo(
    () =>
      sortedStudents.map((st, index) => {
        const rec = draftRecords[st.id] || { status: 'present', priorNotice: false }
        return {
          key: st.id,
          index: index + 1,
          student: st,
          present: rec.status !== 'absent',
          priorNotice: rec.priorNotice,
        }
      }),
    [sortedStudents, draftRecords],
  )

  const filteredAttendanceRows = useMemo(
    () => filterByNameSearch(attendanceRows, nameSearch, (row) => row.student.name),
    [attendanceRows, nameSearch],
  )

  useEffect(() => {
    setNameSearch('')
  }, [selectedClassId])

  async function runAction(action) {
    if (locked) return
    setPending(true)
    try {
      await action()
    } finally {
      setPending(false)
    }
  }

  function setDraftStatus(studentId, status) {
    setDraftRecords((prev) => {
      const current = prev[studentId] || { status: 'present', priorNotice: false }
      return {
        ...prev,
        [studentId]: {
          status,
          priorNotice: status === 'present' ? false : current.priorNotice,
        },
      }
    })
    setSaveMessage('')
  }

  function setDraftPriorNotice(studentId, priorNotice) {
    setDraftRecords((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { status: 'absent', priorNotice: false }),
        priorNotice,
      },
    }))
    setSaveMessage('')
  }

  function buildManualPayload() {
    const meta = {
      intake: selectedClass?.intake ?? '',
      level: selectedClass?.level ?? '',
      qualification: selectedClass?.qualification ?? '',
      group: selectedClass?.group ?? '',
      date: selectedDate,
      module: moduleInput,
      startTime: '',
      duration: '',
    }
    const students = sortedStudents.map((st, index) => {
      const rec = draftRecords[st.id] || { status: 'present', priorNotice: false }
      return {
        index: index + 1,
        name: st.name,
        present: rec.status !== 'absent',
        rosterStudentId: st.id,
        importName: st.name,
      }
    })
    return buildImportPayload(meta, students)
  }

  function handleRequestSave() {
    if (locked || !hasDraftChanges || !selectedClass) return
    const payload = buildManualPayload()
    const summary = computeImportSaveSummary(payload, classes, attendance)
    setPendingPayload(payload)
    setConfirmSummary(summary)
    setConfirmError('')
    setSaveConfirmOpen(true)
  }

  async function handleConfirmSave() {
    if (!pendingPayload || locked) return
    setPending(true)
    setConfirmError('')
    const summaryForLog = confirmSummary
    try {
      if (moduleInput.trim()) {
        await setSessionMeta(selectedClassId, sessionKey, { module: moduleInput.trim() })
      }
      for (const st of sortedStudents) {
        const draft = draftRecords[st.id] || { status: 'present', priorNotice: false }
        const saved = savedRecords[st.id] || { status: 'present', priorNotice: false }
        if (draft.status === saved.status && draft.priorNotice === saved.priorNotice) continue
        await setAttendance(selectedClassId, sessionKey, st.id, {
          status: draft.status,
          priorNotice: draft.priorNotice,
        })
      }
      setSaveConfirmOpen(false)
      setPendingPayload(null)
      setConfirmSummary(null)
      setSaveMessage('Attendance saved.')
      recordAction?.(
        buildAttendanceLogFromSummary('manual', pendingPayload, summaryForLog, { success: true }),
      )
    } catch (err) {
      const message = err?.message || 'Failed to save attendance. Please try again.'
      setConfirmError(message)
      recordAction?.(
        buildAttendanceLogFromSummary('manual', pendingPayload, summaryForLog, {
          success: false,
          error: message,
        }),
      )
    } finally {
      setPending(false)
    }
  }

  function handleDiscardDraft() {
    setDraftRecords(savedRecords)
    setSaveMessage('')
  }

  function requestMarkAll(status) {
    if (!selectedClass?.students.length || locked) return
    setPendingMarkAllStatus(status)
    setMarkAllConfirmOpen(true)
  }

  function handleConfirmMarkAll() {
    if (!selectedClass || locked || !pendingMarkAllStatus) return
    setMarkAllConfirmOpen(false)
    const status = pendingMarkAllStatus
    setPendingMarkAllStatus(null)
    setDraftRecords((prev) => {
      const next = { ...prev }
      for (const st of selectedClass.students) {
        next[st.id] = { status, priorNotice: false }
      }
      return next
    })
    setSaveMessage('')
  }

  function handleModuleChange(value) {
    setModuleInput(value)
  }

  function handleModuleCommit(value) {
    if (locked) return
    setModuleInput(value)
    setSaveMessage('')
  }

  const overlayLabel = syncing ? 'Syncing attendance…' : 'Saving attendance…'

  const attendanceTabActivity = syncing || pending ? 'processing' : hasDraftChanges ? 'draft' : null
  useReportTabActivity('attendance', attendanceTabActivity, onTabActivityChange)

  return (
    <section className="panel portal-panel workspace-panel attendance-workspace">
      <PanelChrome
        title="Mark Manually"
        description="Mark attendance by hand for any class and date. Changes stay on this page until you save — nothing is written to your account until you confirm."
      />

      {classes.length === 0 ? (
        <Empty
          className="workspace-empty"
          description={`Import a screenshot or add a class on ${UI.classesAndRosters}.`}
        />
      ) : (
        <SaveFieldOverlay busy={locked} label={overlayLabel} className="attendance-workspace-overlay">
          <div className="attendance-sheet-body workspace-body">
            <div className="attendance-sheet-toolbar">
              <fieldset className="attendance-sheet-fields" disabled={locked}>
                <div className="portal-meta-grid attendance-meta">
                  <div className="ss-field attendance-meta-class">
                    <SearchableSelect
                      options={classOptions}
                      value={selectedClassId}
                      onChange={setSelectedClassId}
                      placeholder="Search class…"
                      label="Class"
                      disabled={locked}
                    />
                  </div>
                  <div className="antd-field attendance-meta-date">
                    <span className="antd-field-label">Date</span>
                    <DatePicker
                      value={selectedDate ? dayjs(selectedDate) : null}
                      onChange={(value) => setSelectedDate(value ? value.format('YYYY-MM-DD') : dateKey())}
                      style={{ width: '100%' }}
                      disabled={locked}
                    />
                  </div>
                  <div className="attendance-meta-module">
                    <ModuleSearchSelect
                      options={moduleOptions}
                      value={moduleInput}
                      onChange={handleModuleChange}
                      onCommit={handleModuleCommit}
                      placeholder="Search or type module…"
                      label="Module / Subject"
                      disabled={locked}
                    />
                  </div>
                </div>

                {selectedClass && (
                  <Alert
                    type="info"
                    showIcon={false}
                    title={
                      <>
                        Class: <strong>{formatClassLabel(selectedClass)}</strong>
                        {moduleInput.trim() && (
                          <>
                            {' '}
                            · Module: <strong>{moduleInput.trim()}</strong>
                          </>
                        )}
                      </>
                    }
                    style={{ marginBottom: '0.65rem' }}
                  />
                )}

                <Space wrap style={{ marginBottom: '0.65rem' }}>
                  <Button type="primary" disabled={locked} onClick={() => requestMarkAll('present')}>
                    Check All
                  </Button>
                  <Button disabled={locked} onClick={() => requestMarkAll('absent')}>
                    Uncheck All
                  </Button>
                </Space>

                {sortedStudents.length > 30 && (
                  <Typography.Text type="secondary" className="master-pane-hint">
                    {sortedStudents.length} {UI.learningPartners} · scroll the list
                    below for more
                  </Typography.Text>
                )}
              </fieldset>
            </div>

            {!selectedClass?.students.length ? (
              <Empty
                className="attendance-sheet-empty"
                description={`No ${UI.learningPartners} in this class.`}
              />
            ) : (
              <div className="table-scroll-region table-scroll-region-with-search attendance-sheet-list-scroll">
                <TableNameSearch
                  value={nameSearch}
                  onChange={setNameSearch}
                  matchCount={filteredAttendanceRows.length}
                  totalCount={attendanceRows.length}
                />
                <div className="attendance-sheet-list-scroll-inner" ref={studentTableRef}>
                  {filteredAttendanceRows.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No names match this search."
                    />
                  ) : (
                <Table
                  size="small"
                  pagination={{ pageSize: 30, showSizeChanger: false, hideOnSinglePage: true }}
                  scroll={{ y: studentTableHeight }}
                  dataSource={filteredAttendanceRows}
                  rowClassName={(row) => (!row.present ? 'attendance-row-absent' : '')}
                  columns={[
                    {
                      title: '#',
                      dataIndex: 'index',
                      width: 48,
                    },
                    {
                      title: 'Present',
                      key: 'present',
                      width: 90,
                      render: (_, row) => (
                        <Checkbox
                          checked={row.present}
                          disabled={locked}
                          onChange={() =>
                            setDraftStatus(row.student.id, row.present ? 'absent' : 'present')
                          }
                        />
                      ),
                    },
                    {
                      title: UI.learningPartner,
                      key: 'name',
                      render: (_, row) => row.student.name,
                    },
                    {
                      title: 'Prior Notice',
                      key: 'notice',
                      width: 120,
                      render: (_, row) =>
                        !row.present ? (
                          <Checkbox
                            checked={row.priorNotice}
                            disabled={locked}
                            onChange={(e) =>
                              setDraftPriorNotice(row.student.id, e.target.checked)
                            }
                          />
                        ) : null,
                    },
                  ]}
                />
                  )}
                </div>
              </div>
            )}

            {selectedClass?.students.length > 0 && (
              <div className="attendance-sheet-save-bar">
                {hasDraftChanges && (
                  <Typography.Text type="warning" className="attendance-sheet-unsaved-hint">
                    Unsaved changes — review and confirm before saving to your account.
                  </Typography.Text>
                )}
                {saveMessage && !hasDraftChanges && (
                  <Alert type="success" showIcon className="import-alert-banner" title={saveMessage} />
                )}
                <Space wrap className="attendance-sheet-save-actions">
                  <Button
                    type="primary"
                    disabled={locked || !hasDraftChanges}
                    loading={pending}
                    onClick={handleRequestSave}
                  >
                    {UI.saveAttendance}
                  </Button>
                  <Button disabled={locked || !hasDraftChanges} onClick={handleDiscardDraft}>
                    {UI.discardChanges}
                  </Button>
                </Space>
              </div>
            )}
          </div>
        </SaveFieldOverlay>
      )}

      <ImportSaveConfirmModal
        open={saveConfirmOpen}
        summary={confirmSummary}
        pendingImport={pendingPayload}
        error={confirmError}
        busy={pending}
        onCancel={() => {
          if (pending) return
          setSaveConfirmOpen(false)
          setPendingPayload(null)
          setConfirmSummary(null)
          setConfirmError('')
        }}
        onConfirm={handleConfirmSave}
      />

      <ConfirmDialog
        open={markAllConfirmOpen}
        title={pendingMarkAllStatus === 'absent' ? 'Mark All Absent?' : 'Mark All Present?'}
        confirmLabel={pendingMarkAllStatus === 'absent' ? UI.markAllAbsent : UI.markAllPresent}
        cancelLabel="Cancel"
        busy={locked}
        onCancel={() => {
          if (locked) return
          setMarkAllConfirmOpen(false)
          setPendingMarkAllStatus(null)
        }}
        onConfirm={handleConfirmMarkAll}
      >
        {selectedClass && pendingMarkAllStatus && (
          <Typography.Paragraph>
            Mark all <strong>{selectedClass.students.length}</strong>{' '}
            {selectedClass.students.length === 1 ? UI.learningPartner : UI.learningPartners} in{' '}
            <strong>{formatClassLabel(selectedClass)}</strong> as{' '}
            <strong>{pendingMarkAllStatus === 'absent' ? 'absent' : 'present'}</strong> for{' '}
            <strong>{formatDateLabel(selectedDate)}</strong>
            {moduleInput.trim() ? (
              <>
                {' '}
                · Module: <strong>{moduleInput.trim()}</strong>
              </>
            ) : null}
            ?
          </Typography.Paragraph>
        )}
      </ConfirmDialog>
    </section>
  )
}
