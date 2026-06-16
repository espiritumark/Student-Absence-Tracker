import { Tag } from 'antd'
import {
  needsSimilarReviewWarning,
  shouldShowRosterNameReplacement,
} from '../utils/importNameResolution'

export default function ImportMatchColumn({ row, onReview }) {
  if (needsSimilarReviewWarning(row)) {
    return (
      <Tag
        color="warning"
        className="import-similar-match-tag import-similar-match-tag-review"
        onClick={() => onReview?.(row)}
      >
        Review
      </Tag>
    )
  }

  if (shouldShowRosterNameReplacement(row)) {
    return <Tag color="processing">Roster</Tag>
  }
  if (row.matchStatus === 'exact' || row.matchStatus === 'linked_roster') {
    return <Tag color="success">Exact</Tag>
  }
  if (row.matchStatus === 'new') {
    return <Tag>New</Tag>
  }
  return null
}
