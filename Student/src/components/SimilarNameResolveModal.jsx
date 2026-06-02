import { Button, Modal, Radio, Typography } from 'antd'
import { formatSimilarityPercent } from '../utils/nameMatching'
import { topSimilarityScore } from '../utils/importNameResolution'

export default function SimilarNameResolveModal({
  open,
  row,
  onClose,
  onLinkRoster,
  onMarkNew,
}) {
  if (!row) {
    return (
      <Modal open={open} onCancel={onClose} footer={null} destroyOnHidden title="Similar name" />
    )
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`#${row.index} — similar roster match`}
      footer={null}
      destroyOnHidden
      width={520}
      className="similar-name-resolve-modal"
    >
      <Typography.Paragraph className="similar-name-resolve-scanned">
        Scanned name: <strong>{row.importName || row.name}</strong>
      </Typography.Paragraph>

      <Typography.Paragraph type="secondary" className="similar-name-resolve-intro">
        Match is under 95% similar. Link to the roster student or keep as a new entry.
      </Typography.Paragraph>

      <Radio.Group
        className="similar-name-resolve-options"
        onChange={(e) => {
          const candidate = row.similarCandidates?.find((c) => c.id === e.target.value)
          if (candidate) {
            onLinkRoster(row, candidate)
            onClose()
          }
        }}
      >
        {row.similarCandidates?.map((candidate) => (
          <Radio key={candidate.id} value={candidate.id} className="similar-name-resolve-radio">
            Same student — use roster name: <strong>{candidate.name}</strong> (
            {formatSimilarityPercent(candidate.score)} match)
          </Radio>
        ))}
      </Radio.Group>

      <Button
        block
        className="similar-name-resolve-new-btn"
        onClick={() => {
          onMarkNew(row)
          onClose()
        }}
      >
        Different student — keep scanned name as new
      </Button>
    </Modal>
  )
}
