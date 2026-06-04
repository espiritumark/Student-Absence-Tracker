import { Alert, Card, Col, Modal, Row, Table, Tag, Typography } from 'antd'
import { useMemo, useState, useEffect } from 'react'
import { filterByNameSearch } from '../utils/tableNameSearch'
import TableNameSearch from './TableNameSearch'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import { formatDateLabel } from '../utils/dates'
import { UI, formatLpCount } from '../utils/uiCopy'

const CHANGE_TAG = {
  to_absent: { color: 'error', label: 'Present → Absent' },
  to_present: { color: 'success', label: UI.presentStreakReset },
  new_absent: { color: 'error', label: UI.absentFirstSession },
  new_record: { color: 'processing', label: UI.presentFirstSession },
  new: { color: 'processing', label: 'New Learning Partner' },
  unchanged: { color: 'default', label: 'Unchanged' },
}

const introRosterChanges =
  'Learning Partners marked absent for this session, or whose roster streak/total changes, are listed below.'

export default function ImportSaveConfirmModal({
  open,
  summary,
  pendingImport,
  onCancel,
  onConfirm,
  error = '',
  busy = false,
}) {
  const [tableRef, tableHeight] = useScrollRegionHeight(280)
  const [nameSearch, setNameSearch] = useState('')

  useEffect(() => {
    if (!open) setNameSearch('')
  }, [open])

  const columns = useMemo(
    () => [
      {
        title: UI.student,
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
      },
      {
        title: UI.current,
        dataIndex: 'previousLabel',
        key: 'previous',
        width: 132,
      },
      {
        title: UI.afterSave,
        dataIndex: 'nextLabel',
        key: 'next',
        width: 100,
        render: (value, row) => (
          <Typography.Text strong type={row.nextLabel === 'Absent' ? 'danger' : undefined}>
            {value}
          </Typography.Text>
        ),
      },
      {
        title: UI.change,
        key: 'change',
        width: 168,
        render: (_, row) => {
          const meta = CHANGE_TAG[row.changeType] || { color: 'default', label: row.changeLabel }
          return <Tag color={meta.color}>{row.changeLabel || meta.label}</Tag>
        },
      },
      {
        title: UI.streak,
        key: 'streak',
        width: 72,
        align: 'center',
        render: (_, row) =>
          row.rosterStreak != null ? (
            <Typography.Text className="import-save-count-delta">{row.rosterStreak}</Typography.Text>
          ) : (
            '—'
          ),
      },
      {
        title: UI.total,
        key: 'total',
        width: 72,
        align: 'center',
        render: (_, row) =>
          row.rosterTotal != null ? (
            <Typography.Text className="import-save-count-delta">{row.rosterTotal}</Typography.Text>
          ) : (
            '—'
          ),
      },
    ],
    [],
  )

  const filteredStudentRows = useMemo(() => {
    if (!summary?.studentRows) return []
    return filterByNameSearch(summary.studentRows, nameSearch, (row) => row.name)
  }, [summary, nameSearch])

  if (!summary || !pendingImport) return null

  const title = summary.isNewClass
    ? UI.confirmSaveNewClass
    : summary.needsConfirm
      ? UI.confirmOverwriteAttendance
      : UI.confirmSaveAttendance

  const okText = busy ? 'Saving…' : summary.needsConfirm ? UI.overwriteAttendance : UI.saveAttendance

  const intro = introRosterChanges

  const hasRosterUpdates = summary.studentRows.length > 0

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      cancelText={UI.keepEditing}
      confirmLoading={busy}
      cancelButtonProps={{ disabled: busy }}
      onCancel={busy ? undefined : onCancel}
      onOk={onConfirm}
      destroyOnHidden
      centered
      width={860}
      className="import-save-confirm-modal"
    >
      <Typography.Paragraph className="import-save-confirm-intro">
        {summary.isNewClass
          ? 'A new class will be created. '
          : summary.needsConfirm
            ? 'Attendance already exists for this session. '
            : ''}
        {intro}
      </Typography.Paragraph>

      <Row gutter={[12, 12]} className="import-save-confirm-cards">
        <Col xs={24} md={10}>
          <Card size="small" title={UI.session}>
            <Typography.Text strong>{summary.classLabel}</Typography.Text>
            <div>
              <Typography.Text type="secondary">{formatDateLabel(summary.date)}</Typography.Text>
            </div>
            {summary.module && (
              <div>
                <Typography.Text type="secondary">Module: {summary.module}</Typography.Text>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} md={14}>
          <Card size="small" title={UI.summary}>
            <Typography.Text>
              <Typography.Text strong>{pendingImport.students.length}</Typography.Text> in import ·{' '}
              <Typography.Text strong type="danger">
                {summary.nextAbsent}
              </Typography.Text>{' '}
              absent after save
            </Typography.Text>
            {summary.needsConfirm && (
              <div>
                <Typography.Text type="secondary">
                  Absent count: {summary.prevAbsent} → {summary.nextAbsent}
                </Typography.Text>
              </div>
            )}
            <div>
              <Typography.Text type="secondary">
                <Typography.Text strong>{summary.rosterUpdateCount}</Typography.Text> with roster
                changes · {pendingImport.students.length} in import
                {summary.newStudents > 0 ? ` · ${summary.newStudents} New Absent` : ''}
              </Typography.Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Typography.Text type="secondary" className="import-save-table-hint">
        Current is for this class, date, and module only — not the whole roster. Streak and total
        match {UI.classesAndRosters} (before → after). If a module filter is active on{' '}
        {UI.classesAndRosters}, counts only include that module’s sessions.
      </Typography.Text>

      <div className="table-scroll-region table-scroll-region-with-search import-save-confirm-scroll">
        {hasRosterUpdates && summary.studentRows.length > 0 && (
          <TableNameSearch
            value={nameSearch}
            onChange={setNameSearch}
            matchCount={filteredStudentRows.length}
            totalCount={summary.studentRows.length}
          />
        )}
        <div className="import-save-confirm-scroll-inner" ref={tableRef}>
        {hasRosterUpdates ? (
          filteredStudentRows.length === 0 ? (
            <Typography.Paragraph type="secondary" className="import-save-confirm-empty">
              No names match this search.
            </Typography.Paragraph>
          ) : (
          <Table
            size="small"
            rowKey="key"
            columns={columns}
            dataSource={filteredStudentRows}
            pagination={false}
            scroll={{ y: tableHeight }}
          />
          )
        ) : (
          <Typography.Paragraph type="secondary" className="import-save-confirm-empty">
            No roster streak or total changes in this import. Session data will still be saved for
            all {formatLpCount(pendingImport.students.length)}.
          </Typography.Paragraph>
        )}
        </div>
      </div>

      {error && <Alert type="error" showIcon className="import-alert-banner" title={error} />}
    </Modal>
  )
}
