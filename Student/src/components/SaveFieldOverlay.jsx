import { Spin } from 'antd'

export default function SaveFieldOverlay({
  busy,
  label = 'Saving…',
  children,
  className = '',
}) {
  return (
    <Spin
      spinning={busy}
      description={label}
      classNames={{ root: `save-field-spin-wrap ${className}`.trim() }}
    >
      <div className="save-field-overlay-content">{children}</div>
    </Spin>
  )
}
