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
        form.setFieldsValue({ password: '', confirmPassword: '' })
      }
    } catch (err) {
      setError(friendlyAuthError(err.message))
    } finally {
      setBusy(false)
    }
  }

  const isSignUp = mode === 'signup'

  return (
    <Modal
      open={open}
      title={mode === 'signin' ? 'Sign In' : 'Create Account'}
      footer={null}
      onCancel={onClose}
      destroyOnHidden
      centered
      width={420}
      className="auth-modal"
    >
      <div className="auth-modal-body">
        <Typography.Paragraph type="secondary" className="auth-modal-intro">
          {mode === 'signin'
            ? 'Access your classes and attendance from any device.'
            : 'Create an account to sync attendance to the cloud.'}
        </Typography.Paragraph>

        <Form
          form={form}
          layout="vertical"
          className="auth-modal-form"
          onFinish={handleSubmit}
          requiredMark={false}
          validateTrigger={isSignUp ? ['onBlur', 'onSubmit'] : 'onSubmit'}
        >
          <div className="auth-modal-fields">
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

            {isSignUp ? (
              <div className="auth-modal-password-group">
                <Form.Item
                  name="password"
                  label="Password"
                  className="auth-modal-password-item"
                  rules={[
                    { required: true, message: 'Enter your password' },
                    { min: 6, message: 'At least 6 characters' },
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Typography.Text type="secondary" className="auth-modal-field-hint">
                  At least 6 characters
                </Typography.Text>
                <Form.Item
                  name="confirmPassword"
                  label="Verify Password"
                  className="auth-modal-verify-item"
                  dependencies={['password']}
                  rules={[
                    { required: true, message: 'Enter your password again' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('password') === value) {
                          return Promise.resolve()
                        }
                        return Promise.reject(new Error('Passwords do not match'))
                      },
                    }),
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
              </div>
            ) : (
              <Form.Item
                name="password"
                label="Password"
                rules={[
                  { required: true, message: 'Enter your password' },
                  { min: 6, message: 'At least 6 characters' },
                ]}
              >
                <Input.Password autoComplete="current-password" />
              </Form.Item>
            )}
          </div>

          {(error || message) && (
            <div className="auth-modal-alerts">
              {error && <Alert type="error" showIcon title={error} />}
              {message && <Alert type="success" showIcon title={message} />}
            </div>
          )}

          <div className="auth-modal-actions">
            <Button type="primary" htmlType="submit" block loading={busy}>
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </div>
        </Form>

        <Typography.Paragraph type="secondary" className="auth-modal-footer">
          {mode === 'signin' ? (
            <>
              Don&apos;t have an account?{' '}
              <Button
                type="link"
                size="small"
                className="auth-modal-switch-link"
                onClick={() => {
                  setMode('signup')
                  setError('')
                  setMessage('')
                  form.setFieldsValue({ confirmPassword: '' })
                }}
              >
                Create One
              </Button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Button
                type="link"
                size="small"
                className="auth-modal-switch-link"
                onClick={() => {
                  setMode('signin')
                  setError('')
                  setMessage('')
                  form.setFieldsValue({ confirmPassword: '' })
                }}
              >
                Sign In
              </Button>
            </>
          )}
        </Typography.Paragraph>
      </div>
    </Modal>
  )
}
