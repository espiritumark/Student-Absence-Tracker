import { RobotOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { UI } from '../utils/uiCopy'

export default function RefineAiIconButton({
  onClick,
  disabled = false,
  loading = false,
  className = 'feedback-refine-btn',
  size = 'small',
  ariaLabel = UI.refineWithAi,
  emptyTooltip = 'Nothing to refine',
  canRefine = true,
}) {
  const tooltipTitle = canRefine ? UI.refineWithAi : emptyTooltip

  return (
    <Tooltip title={tooltipTitle}>
      <Button
        type="text"
        size={size}
        className={className}
        icon={<RobotOutlined />}
        aria-label={ariaLabel}
        disabled={disabled || !canRefine}
        loading={loading}
        onClick={onClick}
      />
    </Tooltip>
  )
}
