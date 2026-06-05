import { InfoCircleOutlined } from '@ant-design/icons'
import { Button, Popover, Typography } from 'antd'
import { useEffect, useState } from 'react'
import {
  IMPORT_TAB_INTRO_MS,
  hasSeenImportTabTip,
  markImportTabTipSeen,
} from '../utils/importTabTips'

export default function ImportTabInfoTip({ tabId, title, description, active = false }) {
  const [phase, setPhase] = useState(() =>
    hasSeenImportTabTip(tabId) ? 'manual' : 'intro',
  )
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!active || phase !== 'intro') return undefined
    setOpen(true)
    const timer = setTimeout(() => {
      setOpen(false)
      markImportTabTipSeen(tabId)
      setPhase('manual')
    }, IMPORT_TAB_INTRO_MS)
    return () => clearTimeout(timer)
  }, [active, phase, tabId])

  function handleOpenChange(next) {
    setOpen(next)
    if (!next && phase === 'intro') {
      markImportTabTipSeen(tabId)
      setPhase('manual')
    }
  }

  const popoverContent = (
    <Typography.Paragraph className="import-tab-info-copy" style={{ marginBottom: 0 }}>
      {description}
    </Typography.Paragraph>
  )

  return (
    <Popover
      title={title}
      content={popoverContent}
      open={open}
      onOpenChange={handleOpenChange}
      trigger={phase === 'manual' ? ['hover', 'click'] : []}
      placement="top"
      arrow={{ pointAtCenter: true }}
      classNames={{ root: 'import-tab-info-popover' }}
      getPopupContainer={() => document.body}
    >
      <Button
        type="text"
        size="small"
        className="import-tab-info-btn"
        icon={<InfoCircleOutlined />}
        aria-label={`About ${title}`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </Popover>
  )
}
