import { Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'

export default function BackButton({ onClick, children = 'Back', disabled = false, className = '' }) {
  return (
    <Button
      type="default"
      icon={<ArrowLeftOutlined />}
      onClick={onClick}
      disabled={disabled}
      className={`back-button-ant ${className}`.trim()}
    >
      {children}
    </Button>
  )
}
