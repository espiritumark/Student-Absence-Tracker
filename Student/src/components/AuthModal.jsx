import { Alert, Button, Form, Input, Modal, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { friendlyAuthError } from '../utils/authErrors'

export default function AuthModal({ open, onClose, initialMode = 'signin' }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState(initialMode)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setError('')
      setMessage('')
      form.resetFields()
    }
  }, [open, initialMode, form])

  async function handleSubmit(values) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'signin') {
        await signIn(values.email.trim(), values.password)
        onClose()
      } else {
        await signUp(values.email.trim(), values.password)
        setMessage(
          'Account created! If email confirmation is enabled, check your inbox, then sign in.',
        )
        setMode('signin')
        form.setFieldValue('password', '')
      }
    } catch (err) {
      setError(friendlyAuthError(err.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={mode === 'signin' ? 'Sign in' : 'Create account'}
      footer={null}
      onCancel={onClose}
      destroyOnHidden
      centered
      width={420}
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        {mode === 'signin'
          ? 'Access your classes and attendance from any device.'
          : 'Create an account to sync attendance to the cloud.'}
      </Typography.Paragraph>

      <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Enter your email' },
            { type: 'email', message: 'Enter a valid email' },
          ]}
        >
          <Input autoComplete="email" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          extra={mode === 'signup' ? 'At least 6 characters' : undefined}
          rules={[
            { required: true, message: 'Enter your password' },
            { min: 6, message: 'At least 6 characters' },
          ]}
        >
          <Input.Password
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </Form.Item>

        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: '1rem' }} />}
        {message && (
          <Alert type="success" showIcon message={message} style={{ marginBottom: '1rem' }} />
        )}

        <Button type="primary" htmlType="submit" block loading={busy}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </Form>

      <Typography.Paragraph style={{ marginBottom: 0, marginTop: '1rem', textAlign: 'center' }}>
        {mode === 'signin' ? (
          <>
            Don&apos;t have an account?{' '}
            <Button
              type="link"
              size="small"
              onClick={() => {
                setMode('signup')
                setError('')
                setMessage('')
              }}
              style={{ padding: 0 }}
            >
              Create one
            </Button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Button
              type="link"
              size="small"
              onClick={() => {
                setMode('signin')
                setError('')
                setMessage('')
              }}
              style={{ padding: 0 }}
            >
              Sign in
            </Button>
          </>
        )}
      </Typography.Paragraph>
    </Modal>
  )
}
