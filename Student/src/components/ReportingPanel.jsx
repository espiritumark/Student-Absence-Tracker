import { Alert, Button, Empty, Table, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import { CONSECUTIVE_REPORT_DAYS, MONTH_REPORT_DAYS } from '../utils/alerts'
import { formatDateLabel } from '../utils/dates'
import ReportStudentModal from './ReportStudentModal'

export default function ReportingPanel({
  reportingPending = [],
  reported = [],
  markStudentReported,
  clearStudentReported,
  initialStudentKey = null,
  onInitialStudentHandled,
}) {
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [marking, setMarking] = useState(false)

  const pending = reportingPending

  const [pendingTableRef, pendingTableHeight] = useScrollRegionHeight(220)
  const [reportedTableRef, reportedTableHeight] = useScrollRegionHeight(160)

  useEffect(() => {
    if (!initialStudentKey || !pending.length) return
    const match = pending.find((row) => row.key === initialStudentKey)
    if (match) {
      setSelectedCandidate(match)
      onInitialStudentHandled?.()
    }
  }, [initialStudentKey, pending, onInitialStudentHandled])

  const pendingColumns = useMemo(
    () => [
      {
        title: 'Student',
        dataIndex: 'studentName',
        key: 'studentName',
        ellipsis: true,
      },
      {
        title: 'Class',
        dataIndex: 'className',
        key: 'className',
        ellipsis: true,
      },
      {
        title: 'Days',
        key: 'days',
        width: 72,
        render: (_, row) => (
          <span
            className={`dashboard-student-days ${
              row.streakLength >= CONSECUTIVE_REPORT_DAYS
                ? 'dashboard-student-days-report'
                : 'dashboard-student-days-warning'
            }`.trim()}
          >
            {row.consecutiveAbsences ?? row.streakLength}
          </span>
        ),
      },
      {
        title: 'Reason',
        key: 'reason',
        ellipsis: true,
        render: (_, row) => row.alertMessage,
      },
      {
        title: 'Severity',
        key: 'severity',
        width: 96,
        render: (_, row) => (
          <Tag
            bordered={false}
            className={`absence-risk-tag absence-risk-tag-${row.severity === 'high' ? 'critical' : 'warning'}`}
          >
            {row.severity === 'high' ? 'High' : 'Medium'}
          </Tag>
        ),
      },
    ],
    [],
  )

  const reportedColumns = useMemo(
    () => [
      ...pendingColumns.filter((col) => col.key !== 'severity'),
      {
        title: 'Reported',
        key: 'reportedAt',
        width: 120,
        render: (_, row) => formatDateLabel(row.reportedAt?.slice(0, 10)),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 100,
        render: (_, row) => (
          <Button
            type="link"
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              clearStudentReported(row.classId, row.studentId)
            }}
          >
            Undo
          </Button>
        ),
      },
    ],
    [pendingColumns, clearStudentReported],
  )

  async function handleMarkReported() {
    if (!selectedCandidate || marking) return
    setMarking(true)
    try {
      markStudentReported(selectedCandidate.classId, selectedCandidate.studentId, {
        alertType: selectedCandidate.alertType,
        alertMessage: selectedCandidate.alertMessage,
        streakLength: selectedCandidate.streakLength,
      })
      setSelectedCandidate(null)
    } finally {
      setMarking(false)
    }
  }

  return (
    <section className="panel reporting-panel workspace-panel">
      <header className="panel-header">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Official reporting
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="panel-desc" style={{ marginBottom: 0 }}>
          Students opened from the Dashboard appear here for the official form. Mark as reported
          when done — they return to the Dashboard with live attendance updates.
        </Typography.Paragraph>
      </header>

      <Alert
        type="info"
        showIcon
        className="reporting-threshold-alert"
        message="Reporting thresholds"
        description={
          <>
            Submit the official form at{' '}
            <strong>{CONSECUTIVE_REPORT_DAYS}+ consecutive absence days</strong> (about two weeks)
            or <strong>{MONTH_REPORT_DAYS} days absent without prior notice</strong>. Click a red
            name on the Dashboard to move a student here.
          </>
        }
      />

      <div className="reporting-section">
        <Typography.Title level={5} style={{ margin: '0 0 0.5rem' }}>
          To report ({pending.length})
        </Typography.Title>
        {pending.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No students in the reporting queue. Open one from the Dashboard when ready."
          />
        ) : (
          <div className="table-scroll-region" ref={pendingTableRef}>
            <Table
              size="small"
              rowKey="key"
              columns={pendingColumns}
              dataSource={pending}
              pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
              scroll={{ y: pendingTableHeight }}
              onRow={(row) => ({
                onClick: () => setSelectedCandidate(row),
                style: { cursor: 'pointer' },
              })}
            />
          </div>
        )}
      </div>

      <div className="reporting-section">
        <Typography.Title level={5} style={{ margin: '0 0 0.5rem' }}>
          Reported ({reported.length})
        </Typography.Title>
        {reported.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No reported students yet." />
        ) : (
          <div className="table-scroll-region" ref={reportedTableRef}>
            <Table
              size="small"
              rowKey="key"
              columns={reportedColumns}
              dataSource={reported}
              pagination={{ pageSize: 15, showSizeChanger: false, hideOnSinglePage: true }}
              scroll={{ y: reportedTableHeight }}
              onRow={(row) => ({
                onClick: () => setSelectedCandidate(row),
                style: { cursor: 'pointer' },
              })}
            />
          </div>
        )}
      </div>

      <ReportStudentModal
        open={Boolean(selectedCandidate)}
        candidate={selectedCandidate}
        marking={marking}
        onClose={() => !marking && setSelectedCandidate(null)}
        onMarkReported={handleMarkReported}
      />
    </section>
  )
}
