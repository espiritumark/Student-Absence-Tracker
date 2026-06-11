import { CopyOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useEffect, useRef, useState } from 'react'

const COPIED_RESET_MS = 2000

export default function CopyIconButton({
  text,
  disabled = false,
  className = 'feedback-copy-btn',
  size = 'small',
  ariaLabel = 'Copy',
  emptyTooltip = 'Nothing to copy',
  stopPropagation = false,
  onCopyError,
}) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef(null)
  const canCopy = Boolean(String(text ?? '').trim())

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  async function handleClick(event) {
    if (stopPropagation) event.stopPropagation()
    if (!canCopy || disabled) return
    try {
      await navigator.clipboard.writeText(String(text).trim())
      setCopied(true)
      clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      onCopyError?.()
    }
  }

  const tooltipTitle = copied ? 'Copied!' : canCopy ? 'Copy' : emptyTooltip

  return (
    <Tooltip title={tooltipTitle} open={copied ? true : undefined}>
      <Button
        type="text"
        size={size}
        className={className}
        icon={<CopyOutlined />}
        aria-label={ariaLabel}
        disabled={disabled || !canCopy}
        onClick={handleClick}
      />
    </Tooltip>
  )
}
