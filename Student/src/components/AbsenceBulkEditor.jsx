import { Alert, Button, Checkbox, Empty, InputNumber, Space, Table, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useAutoDismiss } from '../hooks/useAutoDismiss'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import { RISK_META, getOverallAbsenceRisk } from '../utils/absenceRisk'
import { getEffectiveAbsenceCounts } from '../utils/attendanceStats'
import { formatClassLabel } from '../utils/classFormat'
import { UI } from '../utils/uiCopy'
import BackButton from './BackButton'
import ConfirmDialog from './ConfirmDialog'
import SaveFieldOverlay from './SaveFieldOverlay'
import SearchableSelect from './SearchableSelect'

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
  restrictToClassIds = null,
  onActivityChange,
}) {
  const sortedClasses = useMemo(
    () =>
      [...classes]
        .filter((c) => !restrictToClassIds || restrictToClassIds.includes(c.id))
        .sort((a, b) => formatClassLabel(a).localeCompare(formatClassLabel(b))),
    [classes, restrictToClassIds],
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
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)

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
        const previewRisk = getOverallAbsenceRisk(previewCounts)
        const hasManualType =
          previewPatch.manualTotalAbsences != null ||
          previewPatch.manualConsecutiveAbsences != null ||
          previewPatch.manualNoPriorNotice
        return {
          key: student.id,
          student,
          counts,
          draft,
          previewCounts,
          previewRisk,
          hasManualType,
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
  const [tableRegionRef, tableHeight] = useScrollRegionHeight(320)

  useEffect(() => {
    onActivityChange?.({ busy, draftCount: changedCount })
  }, [busy, changedCount, onActivityChange])

  useAutoDismiss(Boolean(message) && changedCount === 0, () => setMessage(''))

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
    setConfirmSaveOpen(false)
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
      onClose?.()
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

  const columns = useMemo(
    () => [
      {
        title: 'Student',
        dataIndex: ['student', 'name'],
        key: 'name',
        fixed: 'left',
        width: 220,
        ellipsis: true,
      },
      {
        title: 'Status',
        key: 'status',
        width: 92,
        render: (_, record) => (
          <Tag
            variant="filled"
            className={`absence-risk-tag absence-risk-tag-${record.previewRisk}`}
            title={RISK_META[record.previewRisk]?.description}
          >
            {RISK_META[record.previewRisk]?.shortLabel ?? record.previewRisk}
          </Tag>
        ),
      },
      {
        title: 'Total',
        key: 'total',
        width: 64,
        align: 'center',
        render: (_, record) => (
          <Typography.Text strong className="roster-student-total">
            {record.previewCounts.total}
          </Typography.Text>
        ),
      },
      {
        title: 'Streak',
        key: 'streak',
        width: 72,
        align: 'center',
        render: (_, record) => {
          const streakClass =
            record.previewRisk === 'critical'
              ? 'dashboard-student-days-critical'
              : record.previewRisk === 'warning'
                ? 'dashboard-student-days-warning'
                : record.previewRisk === 'watch'
                  ? 'dashboard-student-days-watch'
                  : ''

          return (
            <span className={`dashboard-student-days ${streakClass}`.trim()}>
              {record.previewCounts.consecutive}
            </span>
          )
        },
      },
      {
        title: 'Type',
        key: 'type',
        width: 80,
        render: (_, record) =>
          record.hasManualType ? (
            <Tag color="processing" className="roster-student-type-tag">
              Manual
            </Tag>
          ) : null,
      },
      {
        title: 'Recorded',
        key: 'recorded',
        width: 88,
        align: 'center',
        render: (_, record) => (
          <Typography.Text type="secondary" className="bulk-recorded-summary">
            {record.counts.recorded.total}
            {record.counts.recorded.consecutive > 0
              ? ` · ${record.counts.recorded.consecutive}d`
              : ''}
          </Typography.Text>
        ),
      },
      {
        title: 'Manual Total',
        key: 'manualTotal',
        width: 108,
        render: (_, record) => (
          <InputNumber
            min={0}
            placeholder="auto"
            disabled={busy}
            value={record.draft.manualTotalAbsences === '' ? null : record.draft.manualTotalAbsences}
            onChange={(value) =>
              updateDraft(record.student.id, {
                manualTotalAbsences: value ?? '',
              })
            }
            style={{ width: '100%' }}
          />
        ),
      },
      {
        title: 'Manual Streak',
        key: 'manualStreak',
        width: 108,
        render: (_, record) => (
          <InputNumber
            min={0}
            placeholder="auto"
            disabled={busy}
            value={
              record.draft.manualConsecutiveAbsences === ''
                ? null
                : record.draft.manualConsecutiveAbsences
            }
            onChange={(value) =>
              updateDraft(record.student.id, {
                manualConsecutiveAbsences: value ?? '',
              })
            }
            style={{ width: '100%' }}
          />
        ),
      },
      {
        title: 'No Notice',
        key: 'notice',
        width: 88,
        align: 'center',
        render: (_, record) => (
          <Checkbox
            checked={Boolean(record.draft.manualNoPriorNotice)}
            disabled={busy || record.draft.manualConsecutiveAbsences === ''}
            onChange={(e) =>
              updateDraft(record.student.id, { manualNoPriorNotice: e.target.checked })
            }
          />
        ),
      },
    ],
    [busy],
  )

  if (classes.length === 0) {
    return (
      <section className="panel">
        <Empty description="Add a class first, then edit absence counts here." />
      </section>
    )
  }

  return (
    <section className="panel bulk-absence-panel workspace-panel">
      {onClose && (
        <div className="panel-nav-bar">
          <BackButton onClick={onClose} disabled={busy}>
            Back to Rosters
          </BackButton>
        </div>
      )}
      <header className="panel-header bulk-absence-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Bulk Edit Absence Counts
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Set manual overrides for every student in the selected class. Leave a field blank to use
            recorded attendance.
          </Typography.Paragraph>
        </div>
      </header>

      {message && <Alert type="success" showIcon title={message} style={{ marginBottom: '0.5rem' }} />}

      <SaveFieldOverlay busy={busy} label="Saving changes…">
        <div className="bulk-absence-toolbar">
          <SearchableSelect
            options={classOptions}
            value={classId}
            onChange={setClassId}
            placeholder="Select class…"
            label="Class"
            disabled={busy}
          />
          <Checkbox
            checked={!showAll}
            disabled={busy}
            onChange={(e) => setShowAll(!e.target.checked)}
          >
            Only Students With Absence Counts
          </Checkbox>
        </div>

        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: '0.5rem' }} />}

        {visibleStudents.length === 0 ? (
          <Empty description="No students in this class yet." />
        ) : (
          <div className="table-scroll-region bulk-table-scroll" ref={tableRegionRef}>
            <Table
              size="small"
              columns={columns}
              dataSource={visibleStudents}
              pagination={{ pageSize: 30, showSizeChanger: false, hideOnSinglePage: true }}
              scroll={{ x: 980, y: tableHeight }}
              rowClassName={(record) => (record.changed ? 'bulk-row-changed' : '')}
            />
          </div>
        )}

        <Space wrap style={{ marginTop: '0.75rem' }}>
          <Button
            type="primary"
            disabled={busy || changedCount === 0}
            onClick={() => setConfirmSaveOpen(true)}
          >
            {changedCount === 0
              ? 'Save Changes'
              : `Save ${changedCount} Change${changedCount === 1 ? '' : 's'}`}
          </Button>
          <Button danger type="link" disabled={busy} onClick={() => setConfirmClear(true)}>
            Clear All Manual Overrides
          </Button>
        </Space>
      </SaveFieldOverlay>

      <ConfirmDialog
        open={confirmSaveOpen}
        title="Save Absence Overrides?"
        confirmLabel="Save Changes"
        cancelLabel={UI.keepEditing}
        busy={busy}
        onCancel={() => !busy && setConfirmSaveOpen(false)}
        onConfirm={handleSave}
      >
        <Typography.Paragraph>
          Save manual absence overrides for <strong>{changedCount}</strong> student
          {changedCount === 1 ? '' : 's'} in <strong>{formatClassLabel(selectedClass)}</strong>?
        </Typography.Paragraph>
      </ConfirmDialog>

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
        <Typography.Paragraph>
          Remove every manual absence override in <strong>{formatClassLabel(selectedClass)}</strong>
          ? Recorded attendance stays unchanged.
        </Typography.Paragraph>
      </ConfirmDialog>
    </section>
  )
}
