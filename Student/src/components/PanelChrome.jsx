import { Typography } from 'antd'
import { isValidElement } from 'react'

/**
 * Consistent tab header: level-4 title + compact description, optional trailing actions.
 * @param {string} title
 * @param {import('react').ReactNode} [description] — plain text or inline markup (e.g. <strong>)
 * @param {import('react').ReactNode} [actions]
 */
function hasDescription(description) {
  if (description == null || description === false) return false
  if (typeof description === 'string') return description.trim() !== ''
  if (typeof description === 'number') return true
  return isValidElement(description) || Array.isArray(description)
}

export default function PanelChrome({ title, description, actions, className = '' }) {
  const headerClass = [
    'panel-header',
    actions ? 'dashboard-header-compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <header className={headerClass}>
      <div className="panel-header-copy">
        <Typography.Title level={4} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {hasDescription(description) && (
          <Typography.Paragraph
            type="secondary"
            className="panel-desc panel-desc-compact"
            style={{ marginBottom: 0 }}
          >
            {description}
          </Typography.Paragraph>
        )}
      </div>
      {actions}
    </header>
  )
}