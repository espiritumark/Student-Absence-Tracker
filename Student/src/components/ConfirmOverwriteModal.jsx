import { Alert, Card, Col, Modal, Row, Typography } from 'antd'
import { formatDateLabel } from '../utils/dates'

export default function ConfirmOverwriteModal({
  open,
  summary,
  onCancel,
  onConfirm,
  error = '',
  busy = false,
}) {
  if (!summary) return null

  const title = summary.isNewClass ? 'Confirm import' : 'Confirm overwrite'
  const okText = busy
    ? 'Saving…'
    : summary.isNewClass
      ? 'Save attendance'
      : 'Overwrite attendance'

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      cancelText="Cancel"
      confirmLoading={busy}
      cancelButtonProps={{ disabled: busy }}
      onCancel={busy ? undefined : onCancel}
      onOk={onConfirm}
      destroyOnHidden
      centered
      width={560}
    >
      {summary.isNewClass ? (
        <Typography.Paragraph>A new class will be created from this import.</Typography.Paragraph>
      ) : (
        <Typography.Paragraph>
          Attendance already exists for this class, date, and module. Review changes before
          overwriting.
        </Typography.Paragraph>
      )}

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12}>
          <Card size="small" title="Where">
            <Typography.Text strong>{summary.classLabel || 'Class'}</Typography.Text>
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
        {!summary.isNewClass && (
          <>
            <Col xs={24} sm={12}>
              <Card size="small" title="Absent count">
                <Typography.Text strong>
                  {summary.prevAbsent} → {summary.nextAbsent}
                </Typography.Text>
                <div>
                  <Typography.Text type="secondary">Saved → this import</Typography.Text>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card size="small" title="Changes">
                <div>
                  <Typography.Text strong>{summary.toAbsent}</Typography.Text> become absent
                </div>
                <div>
                  <Typography.Text strong>{summary.toPresent}</Typography.Text> become present
                </div>
                <Typography.Text type="secondary">
                  <Typography.Text strong>{summary.unchanged}</Typography.Text> unchanged
                </Typography.Text>
              </Card>
            </Col>
          </>
        )}
        <Col xs={24} sm={12}>
          <Card size="small" title="New students">
            <Typography.Text strong>{summary.newStudents ?? 0}</Typography.Text> will be added
            {summary.newStudentNames?.length > 0 && (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: '0.85rem' }}>
                {summary.newStudentNames.slice(0, 5).join(', ')}
                {summary.newStudentNames.length > 5
                  ? ` … +${summary.newStudentNames.length - 5} more`
                  : ''}
              </Typography.Paragraph>
            )}
          </Card>
        </Col>
      </Row>

      {error && (
        <Alert type="error" showIcon title={error} style={{ marginTop: '0.75rem' }} />
      )}
    </Modal>
  )
}
