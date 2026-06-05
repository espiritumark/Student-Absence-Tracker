import { Button, Modal, Radio, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { formatSimilarityPercent } from '../utils/nameMatching'

export default function SimilarNameResolveModal({
  open,
  row,
  onClose,
  onLinkRoster,
  onMarkNew,
}) {
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (!open || !row) {
      setSelectedId(null)
      return
    }
    setSelectedId(row.suggestedRosterId ?? row.similarCandidates?.[0]?.id ?? null)
  }, [open, row?.index, row?.importName, row?.name, row?.suggestedRosterId])

  if (!row) {
    return (
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        destroyOnHidden
        centered
        title="Similar Name"
      />
    )
  }

  function confirmLinkRoster() {
    const candidate = row.similarCandidates?.find((c) => c.id === selectedId)
    if (!candidate) return
    onLinkRoster(row, candidate)
    onClose()
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`#${row.index} — Similar Roster Match`}
      destroyOnHidden
      centered
      width={520}
      className="similar-name-resolve-modal"
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="confirm" type="primary" disabled={!selectedId} onClick={confirmLinkRoster}>
          Use Roster Name
        </Button>,
      ]}
    >
      <Typography.Paragraph className="similar-name-resolve-scanned">
        Scanned name: <strong>{row.importName || row.name}</strong>
      </Typography.Paragraph>

      <Typography.Paragraph type="secondary" className="similar-name-resolve-intro">
        Match is under 95% similar. Link to the roster Learning Partner or keep as a new entry.
      </Typography.Paragraph>

      <Radio.Group
        className="similar-name-resolve-options"
        value={selectedId ?? undefined}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {row.similarCandidates?.map((candidate) => (
          <Radio key={candidate.id} value={candidate.id} className="similar-name-resolve-radio">
            Same Learning Partner — use roster name: <strong>{candidate.name}</strong> (
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
        Different Learning Partner — Keep Scanned Name as New
      </Button>
    </Modal>
  )
}
