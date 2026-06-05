import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  LoadingOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { restoreMinimized, subscribeMinimized } from '../utils/notificationMinibar'

const TYPE_META = {
  success: { icon: CheckCircleOutlined, className: 'notification-minibar-chip--success' },
  error: { icon: CloseCircleOutlined, className: 'notification-minibar-chip--error' },
  warning: { icon: WarningOutlined, className: 'notification-minibar-chip--warning' },
  draft: { icon: EditOutlined, className: 'notification-minibar-chip--draft' },
  loading: { icon: LoadingOutlined, className: 'notification-minibar-chip--loading' },
  info: { icon: LoadingOutlined, className: 'notification-minibar-chip--info' },
}

export default function NotificationMinibar() {
  const [items, setItems] = useState([])

  useEffect(() => subscribeMinimized(setItems), [])

  if (!items.length) return null

  return (
    <div className="notification-minibar" role="status" aria-live="polite">
      <Space size={6} wrap>
        {items.map((item) => {
          const meta = TYPE_META[item.type] || TYPE_META.loading
          const Icon = meta.icon
          return (
            <Button
              key={item.key}
              size="small"
              className={`notification-minibar-chip ${meta.className}`}
              icon={
                <Icon spin={item.type === 'loading' || item.type === 'info'} aria-hidden />
              }
              onClick={() => restoreMinimized(item.key)}
            >
              <Typography.Text ellipsis className="notification-minibar-chip-label">
                {item.title}
              </Typography.Text>
            </Button>
          )
        })}
      </Space>
    </div>
  )
}
