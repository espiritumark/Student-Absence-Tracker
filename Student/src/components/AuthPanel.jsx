import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import AuthModal from './AuthModal'

export default function AuthPanel() {
  const { user, cloudEnabled, signOut } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('signin')

  if (!cloudEnabled) {
    return (
      <div className="auth-status auth-status-local" title="Data stays in this browser only">
        <span className="status-dot status-dot-local" aria-hidden="true" />
        <span className="auth-status-text">Local only</span>
      </div>
    )
  }

  if (user) {
    return (
      <div className="auth-panel auth-panel-signed-in">
        <div className="auth-user-chip">
          <span className="status-dot status-dot-cloud" aria-hidden="true" />
          <span className="auth-email" title={user.email}>
            {user.email}
          </span>
        </div>
        <div className="auth-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="auth-panel auth-panel-signed-out">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            setModalMode('signin')
            setModalOpen(true)
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setModalMode('signup')
            setModalOpen(true)
          }}
        >
          Create account
        </button>
      </div>
      <AuthModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialMode={modalMode}
      />
    </>
  )
}
