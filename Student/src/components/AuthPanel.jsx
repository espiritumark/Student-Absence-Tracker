import { DownOutlined, LogoutOutlined } from '@ant-design/icons'
import { Badge, Button, Dropdown, Space, Typography } from 'antd'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { UI } from '../utils/uiCopy'
import AuthModal from './AuthModal'

export default function AuthPanel() {
  const { user, cloudEnabled, signOut } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('signin')

  if (!cloudEnabled) {
    return (
      <Space size={6} className="auth-panel-chip auth-panel-chip-local">
        <Badge status="default" />
        <Typography.Text type="secondary">Local only</Typography.Text>
      </Space>
    )
  }

  if (user) {
    const menu = {
      items: [
        {
          key: 'account',
          disabled: true,
          label: (
            <div className="auth-menu-account">
              <Typography.Text type="secondary" className="auth-menu-label">
                Signed in as
              </Typography.Text>
              <Typography.Text className="auth-menu-email" title={user.email}>
                {user.email}
              </Typography.Text>
            </div>
          ),
        },
        { type: 'divider' },
        {
          key: 'signout',
          label: UI.signOut,
          icon: <LogoutOutlined />,
          danger: true,
        },
      ],
      onClick: ({ key }) => {
        if (key === 'signout') signOut()
      },
    }

    return (
      <Dropdown menu={menu} trigger={['click']} placement="bottomRight" className="auth-account-dropdown">
        <Button size="small" className="auth-account-trigger" aria-label="Account menu">
          <Space size={6} className="auth-account-trigger-inner">
            <Badge status="success" />
            <Typography.Text ellipsis className="auth-account-email" title={user.email}>
              {user.email}
            </Typography.Text>
            <DownOutlined className="auth-account-chevron" aria-hidden />
          </Space>
        </Button>
      </Dropdown>
    )
  }

  return (
    <>
      <Space wrap size="small" className="auth-panel-signed-out">
        <Button
          type="primary"
          size="small"
          className="auth-sign-in-btn"
          onClick={() => {
            setModalMode('signin')
            setModalOpen(true)
          }}
        >
          {UI.signIn}
        </Button>
        <Button
          size="small"
          className="auth-create-account-btn"
          onClick={() => {
            setModalMode('signup')
            setModalOpen(true)
          }}
        >
          {UI.createAccount}
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
