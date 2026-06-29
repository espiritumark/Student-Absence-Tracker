import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Checkbox, Modal, Segmented, Table, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import {
  ANT_TABLE_HEADER_OFFSET,
  useScrollRegionHeight,
} from '../hooks/useScrollRegionHeight'
import {
  formatSimilarityPercent,
  getReviewClassHeadline,
  getReviewKindMeta,
  rebuildReviewDraftSyncMode,
  summarizeReviewDraft,
  summarizeReviewSection,
} from '../utils/portalRosterMatch'
import { UI } from '../utils/uiCopy'
import { PORTAL_SYNC_MODAL_WIDTH, portalSyncModalStyles } from '../utils/portalSyncModalLayout'

const REVIEW_MODAL_Z_INDEX = 1210

function actionLabel(item) {
  if (item.kind === 'matched') return 'Already matched — no change'
  if (item.kind === 'normalize') return `Update hub name to ${item.portalName}`
  if (item.kind === 'similar') {
    return `Update hub to portal name (${formatSimilarityPercent(item.score)})`
  }
  if (item.kind === 'new') return `Add ${item.portalName} to hub`
  if (item.kind === 'hubOnly') return 'Remove from hub (not on portal)'
  return getReviewKindMeta(item.kind).label
}

function renderCountCell(value, delta) {
  if (value == null) return '—'
  return (
    <Typography.Text
      className={delta ? 'portal-attendance-review-delta' : 'import-save-count-delta'}
    >
      {value}
    </Typography.Text>
  )
}

function portalPresentCell(item) {
  if (item.portalPresentDays != null) return String(item.portalPresentDays)
  return '—'
}

function portalAbsentCell(item) {
  if (item.portalAbsentDays != null) return String(item.portalAbsentDays)
  return '—'
}

function ReviewClassPanel({ section, syncMode, onToggleItem, onToggleAll }) {
  const selectedCount = section.items.filter((item) => item.selected && item.canToggle).length
  const toggleableCount = section.items.filter((item) => item.canToggle).length
  const showAttendance = (section.items ?? []).some((item) => item.hubStudentId)
  const [tableRegionRef, tableScrollY] = useScrollRegionHeight(
    360,
    ANT_TABLE_HEADER_OFFSET,
    `${section.rowKey}-${section.items.length}`,
  )

  const columns = useMemo(
    () => [
      {
        title: 'Portal name',
        key: 'portal',
        ellipsis: true,
        fixed: showAttendance ? 'left' : undefined,
        width: showAttendance ? 180 : undefined,
        render: (_, item) => item.portalName || '—',
      },
      {
        title: 'Hub name',
        key: 'hub',
        ellipsis: true,
        fixed: showAttendance ? 'left' : undefined,
        width: showAttendance ? 180 : undefined,
        render: (_, item) => item.hubName || '—',
      },
      ...(showAttendance
        ? [
            {
              title: 'Present',
              key: 'present',
              width: 72,
              align: 'center',
              render: (_, item) => portalPresentCell(item),
            },
            {
              title: 'Absent',
              key: 'absent',
              width: 72,
              align: 'center',
              render: (_, item) => portalAbsentCell(item),
            },
            {
              title: `Hub ${UI.streak.toLowerCase()}`,
              key: 'hubStreak',
              width: 88,
              align: 'center',
              render: (_, item) =>
                item.hubStreak != null ? String(item.hubStreak) : '—',
            },
            {
              title: 'Hub abs.',
              key: 'hubTotal',
              width: 88,
              align: 'center',
              render: (_, item) =>
                item.hubTotalAbsent != null ? String(item.hubTotalAbsent) : '—',
            },
            {
              title: syncMode === 'overwrite' ? 'After str.' : 'Portal str.',
              key: 'syncStreak',
              width: 96,
              align: 'center',
              render: (_, item) => renderCountCell(item.syncStreakDisplay, item.streakDelta),
            },
            {
              title: syncMode === 'overwrite' ? 'After abs.' : 'Portal abs.',
              key: 'syncTotal',
              width: 96,
              align: 'center',
              render: (_, item) => renderCountCell(item.syncTotalDisplay, item.totalDelta),
            },
            {
              title: 'Streak note',
              key: 'streakNote',
              width: 128,
              ellipsis: true,
              render: (_, item) =>
                item.streakNote ? (
                  <Typography.Text type="secondary" className="portal-sync-review-streak-note">
                    {item.streakNote}
                  </Typography.Text>
                ) : (
                  '—'
                ),
            },
          ]
        : []),
      {
        title: 'Action',
        key: 'action',
        width: 168,
        ellipsis: true,
        render: (_, item) => (
          <Typography.Text type="secondary" className="portal-sync-review-action" ellipsis>
            <Tag color={getReviewKindMeta(item.kind).color} className="portal-sync-review-kind-tag">
              {getReviewKindMeta(item.kind).label}
            </Tag>
            {actionLabel(item)}
          </Typography.Text>
        ),
      },
      {
        title: 'Apply',
        key: 'apply',
        width: 72,
        align: 'center',
        fixed: 'right',
        render: (_, item) =>
          item.canToggle ? (
            <Checkbox
              checked={item.selected}
              onChange={(event) => onToggleItem(section.rowKey, item.id, event.target.checked)}
            />
          ) : (
            <Tag color="green">OK</Tag>
          ),
      },
    ],
    [section.rowKey, showAttendance, syncMode, onToggleItem],
  )

  return (
    <div className="portal-sync-review-class">
      <div className="portal-sync-review-class-toolbar">
        <Typography.Text type="secondary" className="portal-sync-review-class-meta" ellipsis>
          {section.items.length} rows
          {toggleableCount > 0 ? ` · ${selectedCount}/${toggleableCount} selected` : ''}
        </Typography.Text>
        {toggleableCount > 0 ? (
          <Checkbox
            checked={selectedCount === toggleableCount}
            indeterminate={selectedCount > 0 && selectedCount < toggleableCount}
            onChange={(event) => onToggleAll(section.rowKey, event.target.checked)}
          >
            All
          </Checkbox>
        ) : null}
      </div>
      <div ref={tableRegionRef} className="portal-sync-review-table-region">
        <Table
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={section.items}
          pagination={false}
          scroll={{ x: showAttendance ? 1280 : 'max-content', y: tableScrollY }}
        />
      </div>
    </div>
  )
}

export default function PortalSyncReviewModal({
  open,
  draft,
  classes = [],
  attendance = {},
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  const [reviewDraft, setReviewDraft] = useState(draft)
  const [pageIndex, setPageIndex] = useState(0)

  useEffect(() => {
    if (open && draft) {
      setReviewDraft(draft)
      setPageIndex(0)
    }
  }, [open, draft])

  const activeDraft = open ? reviewDraft ?? draft : draft
  const syncMode = activeDraft?.syncMode ?? 'merge'
  const totals = useMemo(() => summarizeReviewDraft(activeDraft), [activeDraft])
  const sections = activeDraft?.sections ?? []
  const sectionCount = sections.length
  const safePageIndex = sectionCount > 0 ? Math.min(pageIndex, sectionCount - 1) : 0
  const currentSection = sectionCount > 0 ? sections[safePageIndex] : null
  const classTotals = useMemo(
    () => (currentSection ? summarizeReviewSection(currentSection) : null),
    [currentSection],
  )

  useEffect(() => {
    if (pageIndex !== safePageIndex) {
      setPageIndex(safePageIndex)
    }
  }, [pageIndex, safePageIndex])

  function updateSection(rowKey, updater) {
    setReviewDraft((current) => ({
      ...current,
      sections: (current?.sections ?? []).map((section) =>
        section.rowKey !== rowKey ? section : updater(section),
      ),
    }))
  }

  function handleSyncModeChange(mode) {
    setReviewDraft((current) =>
      rebuildReviewDraftSyncMode(current ?? draft, mode, classes, attendance),
    )
  }

  function handleConfirm() {
    if (!activeDraft || !sectionCount) return
    onConfirm(activeDraft)
  }

  const classHeadline =
    currentSection && classTotals
      ? getReviewClassHeadline(currentSection, classTotals, syncMode)
      : ''
  const showPaWarning =
    currentSection &&
    !(currentSection.items ?? []).some(
      (item) =>
        item.portalPresentDays != null ||
        item.portalAbsentDays != null ||
        (item.portalSessions ?? []).length > 0,
    )
  const rosterSummaryLine = classHeadline
    ? classHeadline
        .split(' · ')
        .filter((part) => part.startsWith('Roster'))
        .join(' · ')
    : ''

  const overviewRoster =
    totals.selectedChanges > 0
      ? [
          totals.add > 0 ? `${totals.add} add` : null,
          totals.update > 0 ? `${totals.update} update` : null,
          totals.remove > 0 ? `${totals.remove} remove` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null

  const overviewLine =
    sectionCount > 0
      ? [
          `${totals.classes} module${totals.classes === 1 ? '' : 's'}`,
          totals.selectedChanges > 0
            ? `${totals.selectedChanges} change${totals.selectedChanges === 1 ? '' : 's'} on confirm${
                overviewRoster ? ` (${overviewRoster})` : ''
              }`
            : 'no changes selected',
          `P/A ${totals.attendanceLoadedClasses}/${totals.classes}`,
          `${totals.keep} matched`,
        ].join(' · ')
      : ''

  const moduleNavTitle = currentSection?.moduleLabel || currentSection?.hubLabel || ''
  const moduleStatusLine = showPaWarning
    ? `P/A not loaded — open class under Attendance on the portal, restart dev, pull class list, then ${UI.portalClassSyncSave}.${
        rosterSummaryLine ? ` ${rosterSummaryLine}` : ''
      }`
    : classHeadline

  return (
    <Modal
      title="Review portal sync"
      open={open}
      onCancel={busy ? undefined : onCancel}
      onOk={handleConfirm}
      okText={busy ? 'Saving…' : 'Confirm sync'}
      cancelText="Back"
      confirmLoading={busy}
      width={PORTAL_SYNC_MODAL_WIDTH}
      centered
      zIndex={REVIEW_MODAL_Z_INDEX}
      destroyOnClose
      wrapClassName="portal-sync-review-modal-wrap"
      className="portal-sync-review-modal"
      styles={portalSyncModalStyles}
    >
      <div className="portal-sync-review-body">
        {sectionCount > 0 ? (
          <div className="portal-sync-review-top-bar">
            <Typography.Text className="portal-sync-review-top-stats" ellipsis title={overviewLine}>
              {overviewLine}
            </Typography.Text>
            <Segmented
              size="small"
              value={syncMode}
              disabled={busy}
              options={[
                { label: 'Merge', value: 'merge' },
                { label: 'Overwrite', value: 'overwrite' },
              ]}
              onChange={handleSyncModeChange}
            />
          </div>
        ) : null}

        {sectionCount === 0 ? (
          <Typography.Paragraph type="secondary" className="portal-sync-review-empty">
            No modules selected for sync. Go back, expand a class, and check the modules you want.
          </Typography.Paragraph>
        ) : currentSection ? (
          <div className="portal-sync-review-main">
            <div className="portal-sync-review-module-nav">
              <Button
                size="small"
                type="text"
                icon={<LeftOutlined />}
                disabled={safePageIndex <= 0}
                aria-label="Previous module"
                onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
              />
              <Typography.Text
                className="portal-sync-review-module-title"
                ellipsis
                title={
                  currentSection.portalLabel
                    ? `${moduleNavTitle} — ${currentSection.portalLabel}`
                    : moduleNavTitle
                }
              >
                <span className="portal-sync-review-module-index">
                  {safePageIndex + 1}/{sectionCount}
                </span>
                {moduleNavTitle}
              </Typography.Text>
              <Button
                size="small"
                type="text"
                icon={<RightOutlined />}
                disabled={safePageIndex >= sectionCount - 1}
                aria-label="Next module"
                onClick={() =>
                  setPageIndex((index) => Math.min(sectionCount - 1, index + 1))
                }
              />
            </div>

            {moduleStatusLine ? (
              <Typography.Text
                type={showPaWarning ? 'warning' : 'secondary'}
                className="portal-sync-review-status"
                ellipsis
                title={moduleStatusLine}
              >
                {moduleStatusLine}
              </Typography.Text>
            ) : null}

            <ReviewClassPanel
              section={currentSection}
              syncMode={syncMode}
              onToggleItem={(rowKey, itemId, selected) => {
                updateSection(rowKey, (row) => ({
                  ...row,
                  items: row.items.map((item) =>
                    item.id === itemId ? { ...item, selected } : item,
                  ),
                }))
              }}
              onToggleAll={(rowKey, selected) => {
                updateSection(rowKey, (row) => ({
                  ...row,
                  items: row.items.map((item) =>
                    item.canToggle ? { ...item, selected } : item,
                  ),
                }))
              }}
            />
          </div>
        ) : null}

        {error ? (
          <Typography.Text type="danger" className="portal-sync-review-error">
            {error}
          </Typography.Text>
        ) : null}
      </div>
    </Modal>
  )
}
