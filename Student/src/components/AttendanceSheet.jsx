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
import ModuleSearchSelect from './ModuleSearchSelect'
import SaveFieldOverlay from './SaveFieldOverlay'
import SearchableSelect from './SearchableSelect'

function getSessionRecords(classAttendance, sessionKey) {
  return classAttendance?.[sessionKey]?.records ?? {}
}

export default function AttendanceSheet({
  classes,
  attendance,
  setAttendance,
  setSessionMeta,
  syncing = false,
  onTabActivityChange,
}) {
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? '')
  const [selectedDate, setSelectedDate] = useState(dateKey())
  const [moduleInput, setModuleInput] = useState('')
  const [pending, setPending] = useState(false)
  const [markAllConfirmOpen, setMarkAllConfirmOpen] = useState(false)
  const [pendingMarkAllStatus, setPendingMarkAllStatus] = useState(null)

  const locked = syncing || pending

  const sortedClasses = [...classes].sort((a, b) =>
    formatClassLabel(a).localeCompare(formatClassLabel(b)),
  )
  const classOptions = sortedClasses.map((c) => ({ value: c.id, label: formatClassLabel(c) }))

  const selectedClass = classes.find((c) => c.id === selectedClassId)
  const classAttendance = selectedClassId ? attendance?.[selectedClassId] || {} : {}

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
  const dayRecords = getSessionRecords(classAttendance, sessionKey)

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

  const sortedStudents = selectedClass
    ? [...selectedClass.students].sort((a, b) => a.name.localeCompare(b.name))
    : []

  const [studentTableRef, studentTableHeight] = useScrollRegionHeight(280)

  const attendanceRows = useMemo(
    () =>
      sortedStudents.map((st, index) => {
        const rec = dayRecords[st.id] || { status: 'present', priorNotice: false }
        return {
          key: st.id,
          index: index + 1,
          student: st,
          present: rec.status !== 'absent',
          priorNotice: rec.priorNotice,
        }
      }),
    [sortedStudents, dayRecords],
  )

  async function runAction(action) {
    if (locked) return
    setPending(true)
    try {
      await action()
    } finally {
      setPending(false)
    }
  }

  function setStatus(studentId, status) {
    runAction(() => setAttendance(selectedClassId, sessionKey, studentId, { status }))
  }

  function setPriorNotice(studentId, priorNotice) {
    runAction(() =>
      setAttendance(selectedClassId, sessionKey, studentId, { priorNotice }),
    )
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
    runAction(async () => {
      for (const st of selectedClass.students) {
        await setAttendance(selectedClassId, sessionKey, st.id, {
          status,
          priorNotice: false,
        })
      }
    })
  }

  function handleModuleChange(value) {
    setModuleInput(value)
  }

  function handleModuleCommit(value) {
    if (locked) return
    const key = findSessionKey(classAttendance, selectedDate, value)
    runAction(() => setSessionMeta(selectedClassId, key, { module: value }))
  }

  const overlayLabel = syncing ? 'Syncing attendance…' : 'Saving attendance…'

  const attendanceTabActivity = syncing || pending ? 'processing' : null
  useReportTabActivity('attendance', attendanceTabActivity, onTabActivityChange)

  return (
    <section className="panel portal-panel workspace-panel attendance-workspace">
      <header className="panel-header">
        <Typography.Title level={3} style={{ margin: 0 }}>
          Daily attendance (manual)
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Mark attendance by hand for any class and date. The same class can have separate sessions
          per module or subject on the same day.
        </Typography.Paragraph>
      </header>

      {classes.length === 0 ? (
        <Empty description="Import a screenshot or add a class on Classes & rosters." />
      ) : (
        <SaveFieldOverlay busy={locked} label={overlayLabel} className="attendance-workspace-overlay">
          <div className="attendance-sheet-body">
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
                    Uncheck all
                  </Button>
                </Space>

                {sortedStudents.length > 30 && (
                  <Typography.Text type="secondary" style={{ fontSize: '0.85rem' }}>
                    {sortedStudents.length} students · scroll the list below for more
                  </Typography.Text>
                )}
              </fieldset>
            </div>

            {!selectedClass?.students.length ? (
              <Empty className="attendance-sheet-empty" description="No students in this class." />
            ) : (
              <div className="table-scroll-region attendance-sheet-list-scroll" ref={studentTableRef}>
                <Table
                  size="small"
                  pagination={{ pageSize: 30, showSizeChanger: false, hideOnSinglePage: true }}
                  scroll={{ y: studentTableHeight }}
                  dataSource={attendanceRows}
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
                            setStatus(row.student.id, row.present ? 'absent' : 'present')
                          }
                        />
                      ),
                    },
                    {
                      title: 'Student',
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
                              setPriorNotice(row.student.id, e.target.checked)
                            }
                          />
                        ) : null,
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </SaveFieldOverlay>
      )}

      <ConfirmDialog
        open={markAllConfirmOpen}
        title={pendingMarkAllStatus === 'absent' ? 'Mark all absent?' : 'Mark all present?'}
        confirmLabel={pendingMarkAllStatus === 'absent' ? 'Mark all absent' : 'Mark all present'}
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
            Mark all <strong>{selectedClass.students.length}</strong> students in{' '}
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
