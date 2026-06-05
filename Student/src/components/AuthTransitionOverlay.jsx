import { Progress, Typography } from 'antd'

export default function AuthTransitionOverlay({ transition }) {
  if (!transition) return null

  const heading = transition.type === 'signin' ? 'Signing in' : 'Signing out'

  return (
    <div
      className="auth-transition-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-transition-title"
      aria-live="polite"
    >
      <div className="auth-transition-card">
        <Typography.Title level={5} id="auth-transition-title" style={{ margin: 0 }}>
          {heading}
        </Typography.Title>
        <Typography.Text type="secondary" className="auth-transition-email">
          {transition.email}
        </Typography.Text>
        <Progress
          percent={transition.progress}
          status={transition.progress >= 100 ? 'success' : 'active'}
          strokeColor="var(--primary)"
          showInfo={false}
        />
        <Typography.Text className="auth-transition-label">{transition.label}</Typography.Text>
      </div>
    </div>
  )
}
