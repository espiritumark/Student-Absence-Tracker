import { Alert, Card, Checkbox, Col, Modal, Row, Table, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import {
  useScrollRegionHeight,
  ANT_TABLE_HEADER_OFFSET,
} from '../hooks/useScrollRegionHeight'
import { formatDateLabel } from '../utils/dates'
import { summarizeAttendanceReviewDraft } from '../utils/portalAttendanceReview'
import { UI, formatLpCount } from '../utils/uiCopy'

const REVIEW_MODAL_Z_INDEX = 1210

const CHANGE_TAG = {
  to_absent: { color: 'error', label: 'Present → Absent' },
  to_present: { color: 'success', label: UI.presentStreakReset },
  new_absent: { color: 'error', label: UI.absentFirstSession },
  new_record: { color: 'processing', label: UI.presentFirstSession },
  new: { color: 'processing', label: 'New Learning Partner' },
  unchanged: { color: 'default', label: 'Unchanged' },
}

export default function PortalAttendanceReviewModal({
  open,
  draft,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  const [reviewDraft, setReviewDraft] = useState(draft)

  useEffect(() => {
    if (open && draft) {
      setReviewDraft(draft)
    }
  }, [open, draft])

  const activeDraft = open ? reviewDraft ?? draft : draft
  const totals = useMemo(() => summarizeAttendanceReviewDraft(activeDraft), [activeDraft])
  const summary = activeDraft?.summary
  const payload = activeDraft?.payload

  const [tableRef, tableHeight] = useScrollRegionHeight(
    280,
    ANT_TABLE_HEADER_OFFSET,
    `${open}:${activeDraft?.items?.length ?? 0}`,
  )

  const columns = useMemo(
    () => [
      {
        title: 'Apply',
        key: 'apply',
        width: 64,
        align: 'center',
        render: (_, item) => (
          <Checkbox
            checked={item.selected}
            onChange={(event) => {
              const selected = event.target.checked
              setReviewDraft((current) => ({
                ...current,
                items: (current?.items ?? []).map((row) =>
                  row.id === item.id ? { ...row, selected } : row,
                ),
              }))
            }}
          />
        ),
      },
      {
        title: UI.student,
        dataIndex: 'name',
        key: 'name',
        ellipsis: true,
        render: (value) => <span className="portal-attendance-review-name">{value}</span>,
      },
      {
        title: UI.current,
        dataIndex: 'previousLabel',
        key: 'previous',
        width: 120,
      },
      {
        title: 'Portal',
        dataIndex: 'nextLabel',
        key: 'next',
        width: 88,
        render: (value, row) => (
          <Typography.Text strong type={row.nextLabel === 'Absent' ? 'danger' : undefined}>
            {value}
          </Typography.Text>
        ),
      },
      {
        title: UI.change,
        key: 'change',
        width: 160,
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
            <Typography.Text
              className={
                row.rosterStreakDelta ? 'portal-attendance-review-delta' : 'import-save-count-delta'
              }
            >
              {row.rosterStreak}
            </Typography.Text>
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
            <Typography.Text
              className={
                row.rosterTotalDelta ? 'portal-attendance-review-delta' : 'import-save-count-delta'
              }
            >
              {row.rosterTotal}
            </Typography.Text>
          ) : (
            '—'
          ),
      },
    ],
    [],
  )

  const selectedCount = (activeDraft?.items ?? []).filter((item) => item.selected).length
  const toggleableCount = activeDraft?.items?.length ?? 0

  function handleConfirm() {
    if (!activeDraft) return
    onConfirm(activeDraft)
  }

  if (!activeDraft || !summary || !payload) return null

  return (
    <Modal
      open={open}
      title="Review portal attendance"
      okText={busy ? 'Merging…' : 'Confirm merge'}
      cancelText="Back"
      confirmLoading={busy}
      cancelButtonProps={{ disabled: busy }}
      onCancel={busy ? undefined : onCancel}
      onOk={handleConfirm}
      centered
      width={960}
      zIndex={REVIEW_MODAL_Z_INDEX}
      destroyOnClose
      wrapClassName="portal-attendance-review-modal-wrap"
      className="portal-attendance-review-modal"
    >
      <Typography.Paragraph type="secondary" className="portal-attendance-review-intro">
        Review portal present/absent marks before merging into the hub. Streak and total columns
        show class-wide counts before → after, including consecutive absences when sessions line up
        on consecutive days.
      </Typography.Paragraph>

      <Row gutter={[12, 12]} className="portal-attendance-review-cards">
        <Col xs={24} md={10}>
          <Card size="small" title={UI.session}>
            <Typography.Text strong>{summary.classLabel}</Typography.Text>
            <div>
              <Typography.Text type="secondary">{formatDateLabel(summary.date)}</Typography.Text>
            </div>
            {summary.module ? (
              <div>
                <Typography.Text type="secondary">Module: {summary.module}</Typography.Text>
              </div>
            ) : null}
          </Card>
        </Col>
        <Col xs={24} md={14}>
          <Card size="small" title={UI.summary}>
            <Typography.Text>
              <Typography.Text strong>{totals.selected}</Typography.Text> of{' '}
              <Typography.Text strong>{totals.total}</Typography.Text> matched ·{' '}
              <Typography.Text strong type="danger">
                {totals.absent}
              </Typography.Text>{' '}
              absent selected ·{' '}
              <Typography.Text strong>{totals.streakChanges}</Typography.Text> streak change
              {totals.streakChanges === 1 ? '' : 's'}
            </Typography.Text>
            {summary.needsConfirm ? (
              <div>
                <Typography.Text type="secondary">
                  Session already in hub — absent count {summary.prevAbsent} → {summary.nextAbsent}
                </Typography.Text>
              </div>
            ) : null}
            {totals.unmatched > 0 ? (
              <div>
                <Typography.Text type="warning">
                  {totals.unmatched} portal name{totals.unmatched === 1 ? '' : 's'} not in hub
                  roster
                </Typography.Text>
              </div>
            ) : null}
          </Card>
        </Col>
      </Row>

      <div className="portal-attendance-review-toolbar">
        <Typography.Text type="secondary">
          {formatLpCount(totals.selected)} selected
          {summary.rosterUpdateCount > 0
            ? ` · ${summary.rosterUpdateCount} with roster streak/total updates`
            : ''}
        </Typography.Text>
        <Checkbox
          checked={selectedCount === toggleableCount && toggleableCount > 0}
          indeterminate={selectedCount > 0 && selectedCount < toggleableCount}
          onChange={(event) => {
            const selected = event.target.checked
            setReviewDraft((current) => ({
              ...current,
              items: (current?.items ?? []).map((row) => ({ ...row, selected })),
            }))
          }}
        >
          Select all
        </Checkbox>
      </div>

      <div className="portal-attendance-review-table-region table-scroll-region" ref={tableRef}>
        <Table
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={activeDraft.items}
          pagination={false}
          scroll={{ y: tableHeight }}
        />
      </div>

      {(activeDraft.unmatched ?? []).length > 0 ? (
        <Alert
          type="warning"
          showIcon
          className="portal-attendance-review-unmatched"
          title={`${activeDraft.unmatched.length} portal name${
            activeDraft.unmatched.length === 1 ? '' : 's'
          } not in hub roster`}
          description={activeDraft.unmatched.slice(0, 8).join(' · ')}
        />
      ) : null}

      {error ? (
        <Typography.Text type="danger" className="portal-attendance-review-error">
          {error}
        </Typography.Text>
      ) : null}
    </Modal>
  )
}
