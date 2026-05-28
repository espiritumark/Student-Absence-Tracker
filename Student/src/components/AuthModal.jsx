import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { friendlyAuthError } from '../utils/authErrors'

export default function AuthModal({ open, onClose, initialMode = 'signin' }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const emailRef = useRef(null)

  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setError('')
      setMessage('')
      setTimeout(() => emailRef.current?.focus(), 50)
    }
  }, [open, initialMode])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
        onClose()
      } else {
        await signUp(email.trim(), password)
        setMessage(
          'Account created! If email confirmation is enabled, check your inbox, then sign in.',
        )
        setMode('signin')
        setPassword('')
      }
    } catch (err) {
      setError(friendlyAuthError(err.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={onClose}
    >
      <div className="modal auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 id="auth-modal-title">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </h3>
            <p className="auth-modal-sub">
              {mode === 'signin'
                ? 'Access your classes and attendance from any device.'
                : 'Create an account to sync attendance to the cloud.'}
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="modal-body auth-modal-body" onSubmit={handleSubmit}>
          <label className="field-label">
            Email
            <input
              ref={emailRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="field-label">
            Password
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {mode === 'signup' && (
              <span className="field-hint">At least 6 characters</span>
            )}
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {message && <p className="auth-message">{message}</p>}

          <button type="submit" className="btn btn-primary btn-submit" disabled={busy}>
            {busy
              ? mode === 'signin'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </button>

          <p className="auth-switch">
            {mode === 'signin' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setMode('signup')
                    setError('')
                    setMessage('')
                  }}
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setMode('signin')
                    setError('')
                    setMessage('')
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
