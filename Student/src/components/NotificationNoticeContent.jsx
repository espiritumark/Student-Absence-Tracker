import { Button } from 'antd'

export default function NotificationNoticeContent({
  body,
  noticeKey,
  minimizable = false,
  onMinimize,
}) {
  return (
    <div className="app-notification-body">
      {body != null && body !== '' && (
        <div className="app-notification-body-text">{body}</div>
      )}
      {minimizable && noticeKey && (
        <Button
          type="link"
          size="small"
          className="app-notification-minimize"
          onClick={onMinimize}
        >
          Minimize
        </Button>
      )}
    </div>
  )
}
