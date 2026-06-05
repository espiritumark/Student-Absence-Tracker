import { CheckCircleOutlined } from '@ant-design/icons'
import { Button, Modal, Progress, Space, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { UI } from '../utils/uiCopy'

export const BULK_QUEUE_ADVANCE_MS = 5000

export default function BulkQueueAdvancePrompt({
  open = false,
  nextFileName,
  savedLabel = '',
  wasOverwrite = false,
  onCancel,
  onComplete,
}) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const completedRef = useRef(false)

  useEffect(() => {
    if (!open) return undefined
    completedRef.current = false
    setElapsedMs(0)
    const started = Date.now()
    const tick = setInterval(() => {
      const elapsed = Date.now() - started
      setElapsedMs(elapsed)
      if (elapsed >= BULK_QUEUE_ADVANCE_MS && !completedRef.current) {
        completedRef.current = true
        clearInterval(tick)
        onComplete()
      }
    }, 50)
    return () => clearInterval(tick)
  }, [open, nextFileName, onComplete])

  const remainingSec = Math.max(1, Math.ceil((BULK_QUEUE_ADVANCE_MS - elapsedMs) / 1000))
  const percent = Math.min(100, (elapsedMs / BULK_QUEUE_ADVANCE_MS) * 100)

  return (
    <Modal
      open={open}
      centered
      width={420}
      className="bulk-queue-advance-modal"
      title={
        <Space size="small" align="start">
          <CheckCircleOutlined className="bulk-queue-advance-modal-icon" />
          <span>{wasOverwrite ? 'Session updated' : 'Session saved'}</span>
        </Space>
      }
      footer={
        <Button onClick={onCancel}>{UI.stayOnThisItem}</Button>
      }
      closable={false}
      maskClosable={false}
      keyboard={false}
      destroyOnHidden
    >
      <div className="bulk-queue-advance-modal-body" role="status" aria-live="polite">
        {savedLabel ? (
          <Typography.Text type="secondary" className="bulk-queue-advance-modal-sub">
            {savedLabel}
          </Typography.Text>
        ) : null}
        <Typography.Paragraph className="bulk-queue-advance-modal-copy">
          Moving to <strong>{nextFileName}</strong> in {remainingSec}s
        </Typography.Paragraph>
        <Progress
          percent={percent}
          showInfo={false}
          size="small"
          strokeColor="#0d9488"
          className="bulk-queue-advance-modal-bar"
        />
      </div>
    </Modal>
  )
}
