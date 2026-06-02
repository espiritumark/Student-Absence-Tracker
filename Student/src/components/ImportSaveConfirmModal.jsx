import { Alert, Card, Col, Modal, Row, Table, Tag, Typography } from 'antd'
import { useMemo } from 'react'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import { formatDateLabel } from '../utils/dates'
import { UI } from '../utils/uiCopy'

const CHANGE_TAG = {
  to_absent: { color: 'error', label: 'Present → Absent' },
  to_present: { color: 'success', label: UI.presentStreakReset },
  new_absent: { color: 'error', label: UI.absentStreakUp },
  new_record: { color: 'processing', label: 'New Record' },
  new: { color: 'processing', label: 'New Student' },
}

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

  if (!summary || !pendingImport) return null

  const title = summary.isNewClass
    ? UI.confirmSaveNewClass
    : summary.needsConfirm
      ? UI.confirmOverwriteAttendance
      : UI.confirmSaveAttendance

  const okText = busy ? 'Saving…' : summary.needsConfirm ? UI.overwriteAttendance : UI.saveAttendance

  const intro =
    'Only students whose roster streak or total changes are listed below.'

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
      <Typography.Paragraph style={{ marginBottom: '0.75rem' }}>
        {summary.isNewClass
          ? 'A new class will be created. '
          : summary.needsConfirm
            ? 'Attendance already exists for this session. '
            : ''}
        {intro}
      </Typography.Paragraph>

      <Row gutter={[12, 12]} style={{ marginBottom: '0.75rem' }}>
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
        Streak and total show class roster counts (before → after). Present marks reset a streak;
        absent marks can increase it.
      </Typography.Text>

      <div className="table-scroll-region import-save-confirm-scroll" ref={tableRef}>
        {hasRosterUpdates ? (
          <Table
            size="small"
            rowKey="key"
            columns={columns}
            dataSource={summary.studentRows}
            pagination={false}
            scroll={{ y: tableHeight }}
          />
        ) : (
          <Typography.Paragraph type="secondary" style={{ margin: '0.5rem 0 0', textAlign: 'center' }}>
            No roster streak or total changes in this import. Session data will still be saved for
            all {pendingImport.students.length} students.
          </Typography.Paragraph>
        )}
      </div>

      {error && <Alert type="error" showIcon title={error} style={{ marginTop: '0.75rem' }} />}
    </Modal>
  )
}
