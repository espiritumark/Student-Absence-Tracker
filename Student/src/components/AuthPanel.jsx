import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function AuthPanel({ onMigrateLocal }) {
  const { user, cloudEnabled, signIn, signUp, signOut } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!cloudEnabled) {
    return (
      <div className="auth-panel auth-panel-local">
        <span className="muted small">
          Running in local mode. Add Supabase env vars to enable cloud sync.
        </span>
      </div>
    )
  }

  if (user) {
    return (
      <div className="auth-panel">
        <span className="auth-email">{user.email}</span>
        {onMigrateLocal && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onMigrateLocal}>
            Upload local data
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
        setMessage('Account created. Check your email if confirmation is required, then sign in.')
        setMode('signin')
      }
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-panel auth-panel-form">
      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? 'Create account' : 'Back to sign in'}
        </button>
      </form>
      {error && <p className="auth-error">{error}</p>}
      {message && <p className="auth-message">{message}</p>}
    </div>
  )
}
