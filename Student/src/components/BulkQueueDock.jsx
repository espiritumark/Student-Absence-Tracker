import { Badge, Button, Popover, Progress, Typography } from 'antd'
import { PictureOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import { BULK_QUEUE_STATUS, queueItemClassLabel } from '../utils/bulkScreenshotQueue'

function statusTag(status) {
  const map = {
    [BULK_QUEUE_STATUS.queued]: { color: 'default', label: 'Queued' },
    [BULK_QUEUE_STATUS.scanning]: { color: 'processing', label: 'Scanning' },
    [BULK_QUEUE_STATUS.ready]: { color: 'success', label: 'Ready' },
    [BULK_QUEUE_STATUS.error]: { color: 'error', label: 'Error' },
    [BULK_QUEUE_STATUS.saved]: { color: 'blue', label: 'Saved' },
  }
  const meta = map[status] || map[BULK_QUEUE_STATUS.queued]
  return (
    <span className={`bulk-queue-dock-status bulk-queue-dock-status-${meta.color}`}>
      {meta.label}
    </span>
  )
}

export default function BulkQueueDock({
  queue,
  selectedId,
  scanning,
  scanningItem,
  scanCirclePercent = 0,
  maxQueue = 30,
  disabled = false,
  onSelect,
  onRemove,
}) {
  const [open, setOpen] = useState(false)
  const [coverAnim, setCoverAnim] = useState(false)
  const prevCoverIdRef = useRef(null)

  const selected = queue.find((item) => item.id === selectedId) ?? null
  const coverItem = scanningItem || selected || queue[0] || null
  const coverUrl = coverItem?.previewUrl

  useEffect(() => {
    const coverId = scanningItem?.id ?? null
    if (coverId && coverId !== prevCoverIdRef.current) {
      setCoverAnim(true)
      const t = setTimeout(() => setCoverAnim(false), 380)
      prevCoverIdRef.current = coverId
      return () => clearTimeout(t)
    }
    if (!scanning) prevCoverIdRef.current = null
    return undefined
  }, [scanningItem?.id, scanning])

  const queueLabel = `${queue.length} screenshot${queue.length === 1 ? '' : 's'} in queue`

  const popover = (
    <div className="bulk-queue-dock-popover">
      <Typography.Text type="secondary" className="bulk-queue-dock-hint">
        Click a row to review · scans run oldest queued first
      </Typography.Text>
      <ul className="bulk-queue-dock-list">
        {queue.map((item) => (
          <li
            key={item.id}
            className={`bulk-queue-dock-row ${selectedId === item.id ? 'is-selected' : ''}`}
          >
            <button
              type="button"
              className="bulk-queue-dock-row-btn"
              onClick={() => {
                onSelect(item.id)
                setOpen(false)
              }}
            >
              <img src={item.previewUrl} alt="" className="bulk-queue-dock-row-thumb" />
              <div className="bulk-queue-dock-row-text">
                <Typography.Text ellipsis strong>
                  {item.fileName}
                </Typography.Text>
                <Typography.Text type="secondary" ellipsis className="bulk-queue-dock-row-class">
                  {item.status === BULK_QUEUE_STATUS.ready || item.status === BULK_QUEUE_STATUS.saved
                    ? queueItemClassLabel(item.meta)
                    : '—'}
                </Typography.Text>
                <div className="bulk-queue-dock-row-meta">
                  {statusTag(item.status)}
                  {item.status === BULK_QUEUE_STATUS.scanning && (
                    <Progress
                      percent={Math.round((item.progress ?? 0) * 100)}
                      size="small"
                      showInfo={false}
                      className="bulk-queue-dock-row-progress"
                    />
                  )}
                </div>
              </div>
            </button>
            {item.status !== BULK_QUEUE_STATUS.scanning && (
              <Button
                type="text"
                size="small"
                disabled={disabled}
                onClick={() => onRemove(item.id)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      content={popover}
      trigger="click"
      placement="bottomRight"
      classNames={{ root: 'bulk-queue-dock-popover-wrap' }}
    >
      <button
        type="button"
        className="bulk-queue-dock-trigger"
        aria-label={`${queueLabel}. Open queue.`}
        title={queueLabel}
      >
        <Badge
          count={queue.length}
          overflowCount={maxQueue}
          size="small"
          className="bulk-queue-dock-badge"
        >
          <span className="bulk-queue-dock-icon-wrap">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                className={`bulk-queue-dock-cover${coverAnim ? ' is-page-turn' : ''}`}
              />
            ) : (
              <span className="bulk-queue-dock-placeholder" aria-hidden>
                <PictureOutlined />
              </span>
            )}
            {scanning && (
              <span className="bulk-queue-dock-scan-overlay" aria-hidden>
                <Progress
                  type="circle"
                  percent={scanCirclePercent}
                  size={40}
                  strokeWidth={8}
                  status="active"
                />
              </span>
            )}
          </span>
        </Badge>
      </button>
    </Popover>
  )
}
