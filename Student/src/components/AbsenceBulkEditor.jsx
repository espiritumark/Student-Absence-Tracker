import { Button, Checkbox, Empty, Input, InputNumber, Space, Table, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useAppNotifier } from '../hooks/useAppNotifier'
import { NOTIFIER_KEYS } from '../utils/appNotifications'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import { RISK_META, getOverallAbsenceRisk } from '../utils/absenceRisk'
import { getEffectiveAbsenceCounts } from '../utils/attendanceStats'
import { buildActivityEntry } from '../utils/activityLog'
import { formatClassLabel } from '../utils/classFormat'
import { formatPersonName, normalizeName } from '../utils/nameMatching'
import { filterByNameSearch } from '../utils/tableNameSearch'
import { UI, formatLpCount } from '../utils/uiCopy'
import TableNameSearch from './TableNameSearch'
import BackButton from './BackButton'
import PanelChrome from './PanelChrome'
import ConfirmDialog from './ConfirmDialog'
import SaveFieldOverlay from './SaveFieldOverlay'
import SearchableSelect from './SearchableSelect'

function emptyDraft(student) {
  return {
    name: null,
    manualTotalAbsences: student.manualTotalAbsences ?? '',
    manualConsecutiveAbsences: student.manualConsecutiveAbsences ?? '',
    manualNoPriorNotice: Boolean(student.manualNoPriorNotice),
  }
}

function draftName(student, draft) {
  if (draft.name != null) return draft.name
  return formatPersonName(student.name)
}

function draftToPatch(student, draft) {
  const patch = {
    manualTotalAbsences:
      draft.manualTotalAbsences === '' ? null : Number(draft.manualTotalAbsences),
    manualConsecutiveAbsences:
      draft.manualConsecutiveAbsences === ''
        ? null
        : Number(draft.manualConsecutiveAbsences),
    manualNoPriorNotice: Boolean(draft.manualNoPriorNotice),
  }
  if (draft.name != null && normalizeName(draft.name) !== normalizeName(student.name)) {
    patch.name = draft.name
  }
  return patch
}

function draftChanged(student, draft) {
  const base = emptyDraft(student)
  return (
    (draft.name != null && normalizeName(draft.name) !== normalizeName(student.name)) ||
    String(draft.manualTotalAbsences) !== String(base.manualTotalAbsences) ||
    String(draft.manualConsecutiveAbsences) !== String(base.manualConsecutiveAbsences) ||
    Boolean(draft.manualNoPriorNotice) !== base.manualNoPriorNotice
  )
}

function displayTotal(record) {
  return record.draft.manualTotalAbsences === ''
    ? record.previewCounts.total
    : record.draft.manualTotalAbsences
}

function displayStreak(record) {
  return record.draft.manualConsecutiveAbsences === ''
    ? record.previewCounts.consecutive
    : record.draft.manualConsecutiveAbsences
}

function commitTotalDraft(record, value) {
  if (value == null) return { manualTotalAbsences: '' }
  if (value === record.counts.recorded.total) return { manualTotalAbsences: '' }
  return { manualTotalAbsences: value }
}

function commitStreakDraft(record, value) {
  if (value == null) return { manualConsecutiveAbsences: '' }
  if (value === record.counts.recorded.consecutive) return { manualConsecutiveAbsences: '' }
  return { manualConsecutiveAbsences: value }
}

export default function AbsenceBulkEditor({
  classes,
  attendance,
  initialClassId,
  onClose,
  bulkUpdateStudents,
  recordActivity,
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
  const notify = useAppNotifier()

  const selectedClass = sortedClasses.find((c) => c.id === classId)
  const classAttendance = selectedClass ? attendance?.[selectedClass.id] || {} : {}

  const students = useMemo(() => {
    if (!selectedClass) return []
    return [...selectedClass.students]
      .map((student) => {
        const counts = getEffectiveAbsenceCounts(student, classAttendance)
        const draft = drafts[student.id] ?? emptyDraft(student)
        const previewPatch = draftToPatch(student, draft)
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
        return {
          key: student.id,
          student,
          counts,
          draft,
          previewCounts,
          previewRisk,
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
  const [nameSearch, setNameSearch] = useState('')
  const [tableRegionRef, tableHeight] = useScrollRegionHeight(320)

  const filteredVisibleStudents = useMemo(
    () => filterByNameSearch(visibleStudents, nameSearch, (row) => row.student.name),
    [visibleStudents, nameSearch],
  )

  useEffect(() => {
    onActivityChange?.({ busy, draftCount: changedCount })
  }, [busy, changedCount, onActivityChange])

  useEffect(() => {
    if (!error) return
    notify.error({
      key: 'absence-bulk-error',
      title: error,
      duration: 8,
    })
  }, [error, notify])

  useEffect(() => {
    if (!busy) {
      notify.destroy('absence-bulk-saving')
      return
    }
    notify.progress({
      key: 'absence-bulk-saving',
      title: 'Saving absence changes',
      description: 'Updating roster overrides…',
    })
  }, [busy, notify])

  useEffect(() => {
    if (!classId && sortedClasses[0]?.id) {
      setClassId(sortedClasses[0].id)
    }
  }, [classId, sortedClasses])

  useEffect(() => {
    setDrafts({})
    setMessage('')
    setError('')
    setNameSearch('')
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
          patch: draftToPatch(student, draft),
        }))
      await bulkUpdateStudents(classId, updates)
      recordActivity?.(
        buildActivityEntry({
          category: 'roster',
          verb: 'updated',
          title: `${UI.bulkEditAbsenceCounts} — ${formatClassLabel(selectedClass)}`,
          lines: [
            formatLpCount(updates.length),
          ],
        }),
      )
      setDrafts({})
      notify.success({
        key: NOTIFIER_KEYS.absenceBulk,
        title: `Saved absence changes for ${formatLpCount(updates.length)}.`,
      })
      onClose?.()
    } catch (err) {
      const message = err.message || 'Failed to save changes.'
      setError(message)
      notify.error({ key: 'absence-bulk-error', title: message, duration: 8 })
      recordActivity?.(
        buildActivityEntry({
          category: 'roster',
          verb: 'updated',
          title: `${UI.bulkEditAbsenceCounts} — ${formatClassLabel(selectedClass)}`,
          success: false,
          error: message,
        }),
      )
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
        notify.info({
          key: NOTIFIER_KEYS.absenceBulk,
          title: 'No saved overrides to clear in this class.',
        })
      } else {
        await bulkUpdateStudents(classId, updates)
        recordActivity?.(
          buildActivityEntry({
            category: 'roster',
            verb: 'cleared',
            title: `${UI.clearAllOverrides} — ${formatClassLabel(selectedClass)}`,
            lines: [
              formatLpCount(updates.length),
            ],
          }),
        )
        setDrafts({})
        notify.success({
          key: NOTIFIER_KEYS.absenceBulk,
          title: `Cleared overrides for ${updates.length} ${UI.learningPartners}.`,
        })
      }
      setConfirmClear(false)
    } catch (err) {
      const message = err.message || 'Failed to clear overrides.'
      setError(message)
      notify.error({ key: 'absence-bulk-error', title: message, duration: 8 })
      recordActivity?.(
        buildActivityEntry({
          category: 'roster',
          verb: 'cleared',
          title: `${UI.clearAllOverrides} — ${formatClassLabel(selectedClass)}`,
          success: false,
          error: message,
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  const columns = useMemo(
    () => [
      {
        title: UI.learningPartner,
        key: 'name',
        fixed: 'left',
        width: 260,
        render: (_, record) => (
          <Input
            disabled={busy}
            value={draftName(record.student, record.draft)}
            onChange={(e) => updateDraft(record.student.id, { name: e.target.value })}
            className="bulk-student-name-input"
            aria-label={`Edit name for ${record.student.name}`}
          />
        ),
      },
      {
        title: UI.status,
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
        title: UI.total,
        key: 'total',
        width: 96,
        align: 'center',
        render: (_, record) => (
          <InputNumber
            min={0}
            disabled={busy}
            value={displayTotal(record)}
            onChange={(value) =>
              updateDraft(record.student.id, commitTotalDraft(record, value))
            }
            className="bulk-count-input"
            style={{ width: '100%' }}
          />
        ),
      },
      {
        title: UI.streak,
        key: 'streak',
        width: 96,
        align: 'center',
        render: (_, record) => (
          <InputNumber
            min={0}
            disabled={busy}
            value={displayStreak(record)}
            onChange={(value) =>
              updateDraft(record.student.id, commitStreakDraft(record, value))
            }
            className="bulk-count-input"
            style={{ width: '100%' }}
          />
        ),
      },
      {
        title: UI.priorNotice,
        key: 'notice',
        width: 100,
        align: 'center',
        render: (_, record) => (
          <Checkbox
            checked={Boolean(record.draft.manualNoPriorNotice)}
            disabled={busy || displayStreak(record) === 0}
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
      <section className="panel bulk-absence-panel workspace-panel">
        <PanelChrome
          className="bulk-absence-header"
          title={UI.bulkEditAbsenceCounts}
          description={`Add a class first, then adjust total and streak for each ${UI.learningPartner}.`}
        />
        <Empty
          className="workspace-empty"
          description={`Add a class on ${UI.classesAndRosters} first.`}
        />
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
      <PanelChrome
        className="bulk-absence-header"
        title={UI.bulkEditAbsenceCounts}
        description={`Adjust total and streak for each ${UI.learningPartner} in the selected class. Values match ${UI.classesAndRosters} until you change them; confirm before saving.`}
      />

      <SaveFieldOverlay busy={busy} label="Saving changes…">
        <div className="workspace-body">
          <div className="bulk-absence-toolbar filter-toolbar">
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
              Only {UI.learningPartners} With Absence Counts
            </Checkbox>
          </div>

          {visibleStudents.length === 0 ? (
            <Empty description={`No ${UI.learningPartners} in this class yet.`} />
          ) : (
            <div className="table-scroll-region table-scroll-region-with-search bulk-table-scroll">
              <TableNameSearch
                value={nameSearch}
                onChange={setNameSearch}
                matchCount={filteredVisibleStudents.length}
                totalCount={visibleStudents.length}
              />
              <div className="bulk-table-scroll-inner" ref={tableRegionRef}>
              {filteredVisibleStudents.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No names match this search."
                />
              ) : (
              <Table
                size="small"
                columns={columns}
                dataSource={filteredVisibleStudents}
                pagination={{ pageSize: 30, showSizeChanger: false, hideOnSinglePage: true }}
                scroll={{ x: 980, y: tableHeight }}
                rowClassName={(record) => (record.changed ? 'bulk-row-changed' : '')}
              />
              )}
              </div>
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
            <Button
              type="link"
              danger
              className="link-destructive"
              disabled={busy}
              onClick={() => setConfirmClear(true)}
            >
              {UI.clearAllOverrides}
            </Button>
          </Space>
        </div>
      </SaveFieldOverlay>

      <ConfirmDialog
        open={confirmSaveOpen}
        title="Save Absence Counts?"
        confirmLabel="Save Changes"
        cancelLabel={UI.keepEditing}
        busy={busy}
        onCancel={() => !busy && setConfirmSaveOpen(false)}
        onConfirm={handleSave}
      >
        <Typography.Paragraph>
          Save total and streak changes for <strong>{changedCount}</strong>{' '}
          {UI.learningPartner}
          {changedCount === 1 ? '' : 's'} in <strong>{formatClassLabel(selectedClass)}</strong>?
        </Typography.Paragraph>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmClear}
        title="Clear All Overrides?"
        confirmLabel="Clear All"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onCancel={() => !busy && setConfirmClear(false)}
        onConfirm={handleClearAll}
      >
        <Typography.Paragraph>
          Reset saved totals and streaks in <strong>{formatClassLabel(selectedClass)}</strong> to
          recorded attendance? Session marks stay unchanged.
        </Typography.Paragraph>
      </ConfirmDialog>
    </section>
  )
}
