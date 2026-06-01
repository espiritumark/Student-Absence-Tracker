import { Badge, Button, Space, Typography } from 'antd'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import AuthModal from './AuthModal'

export default function AuthPanel() {
  const { user, cloudEnabled, signOut } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('signin')

  if (!cloudEnabled) {
    return (
      <Space size={6} className="auth-panel-chip">
        <Badge status="default" />
        <Typography.Text type="secondary">Local only</Typography.Text>
      </Space>
    )
  }

  if (user) {
    return (
      <Space wrap size="small" className="auth-panel-signed-in">
        <Space size={8} className="auth-panel-chip">
          <Badge status="success" />
          <Typography.Text ellipsis className="auth-panel-email" title={user.email}>
            {user.email}
          </Typography.Text>
        </Space>
        <Button size="small" onClick={() => signOut()}>
          Sign Out
        </Button>
      </Space>
    )
  }

  return (
    <>
      <Space wrap size="small">
        <Button
          type="primary"
          size="small"
          onClick={() => {
            setModalMode('signin')
            setModalOpen(true)
          }}
        >
          Sign in
        </Button>
        <Button
          size="small"
          onClick={() => {
            setModalMode('signup')
            setModalOpen(true)
          }}
        >
          Create account
        </Button>
      </Space>
      <AuthModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialMode={modalMode}
      />
    </>
  )
}
