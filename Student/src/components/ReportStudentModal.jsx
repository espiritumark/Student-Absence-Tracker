import { CopyOutlined } from '@ant-design/icons'
import { Button, Descriptions, Modal, Space, Typography, message } from 'antd'
import { useMemo } from 'react'
import {
  ABSENCE_VIOLATION_REPORT_EMBED_URL,
  ABSENCE_VIOLATION_REPORT_URL,
} from '../constants/reporting'
import { buildReportCopyFields } from '../utils/reportingQueue'

export default function ReportStudentModal({
  open,
  candidate,
  onClose,
  onMarkReported,
  marking = false,
}) {
  const copyFields = useMemo(
    () => (candidate ? buildReportCopyFields(candidate) : []),
    [candidate],
  )

  async function copyValue(label, value) {
    try {
      await navigator.clipboard.writeText(value)
      message.success(`Copied ${label.toLowerCase()}`)
    } catch {
      message.error('Could not copy to clipboard')
    }
  }

  async function copyAll() {
    const text = copyFields.map((field) => `${field.label}: ${field.value}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      message.success('Copied all details')
    } catch {
      message.error('Could not copy to clipboard')
    }
  }

  return (
    <Modal
      title={candidate ? `Report — ${candidate.studentName}` : 'Report student'}
      open={open}
      onCancel={onClose}
      width="min(960px, 96vw)"
      className="report-student-modal"
      destroyOnClose
      footer={
        <Space wrap>
          <Button onClick={onClose} disabled={marking}>
            Close
          </Button>
          <Button href={ABSENCE_VIOLATION_REPORT_URL} target="_blank" rel="noopener noreferrer">
            Open form in new tab
          </Button>
          <Button type="primary" loading={marking} disabled={!candidate} onClick={onMarkReported}>
            Mark as reported
          </Button>
        </Space>
      }
    >
      {candidate && (
        <div className="report-student-modal-body">
          <div className="report-student-details">
            <Space wrap style={{ marginBottom: '0.65rem' }}>
              <Typography.Text type="secondary">
                Copy details into the form fields on the right.
              </Typography.Text>
              <Button size="small" icon={<CopyOutlined />} onClick={copyAll}>
                Copy all
              </Button>
            </Space>
            <Descriptions column={1} size="small" bordered className="report-copy-descriptions">
              {copyFields.map((field) => (
                <Descriptions.Item key={field.label} label={field.label}>
                  <Space align="start">
                    <Typography.Text>{field.value}</Typography.Text>
                    <Button
                      type="link"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => copyValue(field.label, field.value)}
                      aria-label={`Copy ${field.label}`}
                    />
                  </Space>
                </Descriptions.Item>
              ))}
            </Descriptions>
          </div>
          <div className="report-student-form-pane">
            <Typography.Text type="secondary" className="report-form-pane-label">
              Official Microsoft Form
            </Typography.Text>
            <iframe
              title="Absence violation report form"
              src={ABSENCE_VIOLATION_REPORT_EMBED_URL}
              className="report-form-iframe"
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
