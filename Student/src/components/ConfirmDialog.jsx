import { Alert, Modal } from 'antd'

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  return (
    <Modal
      open={open}
      title={title}
      okText={busy ? `${confirmLabel}…` : confirmLabel}
      cancelText={cancelLabel}
      okButtonProps={{ danger, loading: busy }}
      cancelButtonProps={{ disabled: busy }}
      confirmLoading={busy}
      onCancel={busy ? undefined : onCancel}
      onOk={onConfirm}
      destroyOnHidden
      centered
    >
      {children}
      {error && (
        <Alert type="error" showIcon title={error} style={{ marginTop: '0.75rem' }} />
      )}
    </Modal>
  )
}
