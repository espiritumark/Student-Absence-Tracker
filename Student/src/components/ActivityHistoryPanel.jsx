import { Alert, Button, Collapse, Empty, Space, Tag, Typography } from 'antd'
import { useMemo } from 'react'
import {
  formatActivityTimestamp,
  getCategoryLabel,
  getVerbLabel,
  groupActivityByCategory,
} from '../utils/activityLog'
import { UI } from '../utils/uiCopy'
import PanelChrome from './PanelChrome'

function ActivityEntryDetail({ entry }) {
  return (
    <div className="activity-entry-detail">
      {entry.lines?.length > 0 && (
        <Typography.Paragraph type="secondary" className="activity-entry-lines">
          {entry.lines.join(' · ')}
        </Typography.Paragraph>
      )}
      {entry.sessionStats && (
        <Typography.Text type="secondary" className="activity-entry-stats">
          {entry.sessionStats.rosterUpdates} roster update
          {entry.sessionStats.rosterUpdates === 1 ? '' : 's'} in confirm summary
        </Typography.Text>
      )}
      {entry.error ? (
        <Alert type="error" showIcon className="activity-entry-alert" title={entry.error} />
      ) : null}
      {entry.rosterRows?.length > 0 ? (
        <ul className="activity-entry-list">
          {entry.rosterRows.map((row) => (
            <li key={`${entry.id}-${row.name}`}>
              <Typography.Text>{row.name}</Typography.Text>
              <Typography.Text type="secondary">
                {' '}
                — {row.change}
                {row.streak ? ` · Streak ${row.streak}` : ''}
                {row.total ? ` · Total ${row.total}` : ''}
              </Typography.Text>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default function ActivityHistoryPanel({ entries, onClear }) {
  const failedCount = (entries ?? []).filter((e) => !e.success).length

  const groups = useMemo(() => groupActivityByCategory(entries), [entries])

  const groupItems = useMemo(
    () =>
      groups.map((group) => ({
        key: group.key,
        label: (
          <Space>
            <Typography.Text strong>{group.label}</Typography.Text>
            <Tag>{group.items.length}</Tag>
          </Space>
        ),
        children: (
          <Collapse
            size="small"
            className="activity-entry-collapse"
            defaultActiveKey={group.items[0]?.id ? [group.items[0].id] : []}
            items={group.items.map((entry) => ({
              key: entry.id,
              label: (
                <Space size="small" wrap className="activity-entry-label">
                  <Tag color={entry.success ? 'success' : 'error'}>
                    {entry.success ? getVerbLabel(entry.verb) : 'Failed'}
                  </Tag>
                  <Typography.Text>{entry.title}</Typography.Text>
                  <Typography.Text type="secondary">
                    {formatActivityTimestamp(entry.at)}
                  </Typography.Text>
                </Space>
              ),
              children: <ActivityEntryDetail entry={entry} />,
            }))}
          />
        ),
      })),
    [groups],
  )

  return (
    <section className="panel activity-history-panel workspace-panel">
      <PanelChrome
        title={UI.history}
        description="A log of confirmed actions on this device — attendance saves, roster edits, and class or Learning Partner changes."
        actions={
          entries?.length > 0 ? (
            <Button type="link" danger onClick={onClear}>
              {UI.clearHistory}
            </Button>
          ) : null
        }
      />

      {failedCount > 0 && (
        <Alert
          type="warning"
          showIcon
          className="import-alert-banner"
          title={`${failedCount} failed action${failedCount === 1 ? '' : 's'} in this log.`}
        />
      )}

      {!entries?.length ? (
        <Empty
          className="workspace-empty"
          description="No activity yet. Actions appear here after you save attendance, edit roster counts, or add or remove classes and Learning Partners."
        />
      ) : (
        <div className="activity-history-body">
          <Collapse
            size="small"
            defaultActiveKey={groups.map((g) => g.key)}
            items={groupItems}
            className="activity-history-groups"
          />
        </div>
      )}
    </section>
  )
}
