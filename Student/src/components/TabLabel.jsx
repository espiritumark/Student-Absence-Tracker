import { EditOutlined, ExclamationCircleFilled, LoadingOutlined } from '@ant-design/icons'

export default function TabLabel({ label, activity = null, reportAlert = false }) {
  return (
    <span className="app-tab-label">
      <span className="app-tab-label-text">{label}</span>
      {reportAlert && (
        <ExclamationCircleFilled
          className="app-tab-report-alert"
          aria-label="Official reporting action required"
        />
      )}
      {activity === 'processing' && (
        <LoadingOutlined
          spin
          className="app-tab-status app-tab-status-processing"
          aria-label="In progress"
        />
      )}
      {activity === 'draft' && (
        <EditOutlined className="app-tab-status app-tab-status-draft" aria-label="Unsaved draft" />
      )}
    </span>
  )
}
