import { Button, Typography } from 'antd'
import { ExclamationCircleFilled } from '@ant-design/icons'
import {
  canSwitchLinkedImportRowToRosterName,
  canSwitchLinkedImportRowToScannedName,
  canUndoImportNameResolution,
  needsSimilarReviewWarning,
  shouldShowRosterNameReplacement,
  topSimilarityScore,
} from '../utils/importNameResolution'
import { formatSimilarityPercent } from '../utils/nameMatching'

function ImportNameActions({ row, onUndo, onUseScannedName, onUseRosterName }) {
  const showUseScanned = canSwitchLinkedImportRowToScannedName(row) && onUseScannedName
  const showUseRoster = canSwitchLinkedImportRowToRosterName(row) && onUseRosterName
  const showUndo = canUndoImportNameResolution(row) && onUndo

  if (!showUseScanned && !showUseRoster && !showUndo) {
    return null
  }

  return (
    <div className="import-name-cell-actions">
      {showUseScanned ? (
        <Button type="link" className="import-name-cell-action" onClick={() => onUseScannedName(row)}>
          Use scanned name
        </Button>
      ) : null}
      {showUseRoster ? (
        <Button type="link" className="import-name-cell-action" onClick={() => onUseRosterName(row)}>
          Use roster name
        </Button>
      ) : null}
      {showUndo ? (
        <Button type="link" className="import-name-cell-action" onClick={() => onUndo(row)}>
          Undo
        </Button>
      ) : null}
    </div>
  )
}

export default function ImportLearningPartnerCell({
  row,
  onReview,
  onUndo,
  onUseScannedName,
  onUseRosterName,
}) {
  if (shouldShowRosterNameReplacement(row)) {
    return (
      <div className="import-name-cell">
        <Typography.Text type="secondary" delete style={{ display: 'block' }}>
          {row.importName}
        </Typography.Text>
        <Typography.Text strong>{row.name}</Typography.Text>
        <ImportNameActions
          row={row}
          onUndo={onUndo}
          onUseScannedName={onUseScannedName}
          onUseRosterName={onUseRosterName}
        />
      </div>
    )
  }

  if (needsSimilarReviewWarning(row)) {
    const score = topSimilarityScore(row)
    return (
      <div className="import-name-cell">
        <button
          type="button"
          className="import-similar-name-trigger"
          onClick={() => onReview?.(row)}
          title="Review Roster Match"
        >
          <ExclamationCircleFilled aria-hidden />
          <span className="import-similar-name-text">{row.importName || row.name}</span>
          <Typography.Text type="secondary" className="import-similar-score">
            {formatSimilarityPercent(score)}
          </Typography.Text>
        </button>
      </div>
    )
  }

  if (row.matchStatus === 'linked_roster' && row.linkedNameChoice === 'scanned') {
    return (
      <div className="import-name-cell">
        <Typography.Text>{row.name}</Typography.Text>
        <ImportNameActions
          row={row}
          onUndo={onUndo}
          onUseScannedName={onUseScannedName}
          onUseRosterName={onUseRosterName}
        />
      </div>
    )
  }

  if (canUndoImportNameResolution(row)) {
    return (
      <div className="import-name-cell">
        <Typography.Text>{row.name}</Typography.Text>
        <ImportNameActions
          row={row}
          onUndo={onUndo}
          onUseScannedName={onUseScannedName}
          onUseRosterName={onUseRosterName}
        />
      </div>
    )
  }

  return <Typography.Text>{row.name}</Typography.Text>
}
