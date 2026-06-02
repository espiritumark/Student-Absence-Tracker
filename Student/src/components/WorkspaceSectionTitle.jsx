import { Typography } from 'antd'

/** Subheading for sections inside a workspace (tables, reporting queues, etc.). */
export default function WorkspaceSectionTitle({ children }) {
  return (
    <Typography.Title level={5} className="workspace-section-title">
      {children}
    </Typography.Title>
  )
}
