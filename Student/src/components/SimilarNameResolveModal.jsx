import { Button, Modal, Radio, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
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

  const selectedCandidate = useMemo(
    () => row?.similarCandidates?.find((c) => c.id === selectedId) ?? null,
    [row, selectedId],
  )

  const scannedName = row?.importName || row?.name || ''
  const multipleCandidates = (row?.similarCandidates?.length ?? 0) > 1

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

  function linkWithNameChoice(nameChoice) {
    if (!selectedCandidate) return
    onLinkRoster(row, selectedCandidate, nameChoice)
    onClose()
  }

  function markAsNew() {
    onMarkNew(row)
    onClose()
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`#${row.index} — Similar Roster Match`}
      destroyOnHidden
      centered
      width={560}
      className="similar-name-resolve-modal"
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
      <Typography.Paragraph className="similar-name-resolve-scanned">
        Scanned name: <strong>{scannedName}</strong>
      </Typography.Paragraph>

      <Typography.Paragraph type="secondary" className="similar-name-resolve-intro">
        Match is under 95% similar. Linking to the roster keeps attendance history, streaks, and
        feedback on the same record.
      </Typography.Paragraph>

      {multipleCandidates ? (
        <>
          <Typography.Text className="field-label">Roster match</Typography.Text>
          <Radio.Group
            className="similar-name-resolve-options"
            value={selectedId ?? undefined}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {row.similarCandidates?.map((candidate) => (
              <Radio key={candidate.id} value={candidate.id} className="similar-name-resolve-radio">
                <strong>{candidate.name}</strong> ({formatSimilarityPercent(candidate.score)} match)
              </Radio>
            ))}
          </Radio.Group>
        </>
      ) : selectedCandidate ? (
        <Typography.Paragraph className="similar-name-resolve-single-match">
          Closest roster match: <strong>{selectedCandidate.name}</strong> (
          {formatSimilarityPercent(selectedCandidate.score)} match)
        </Typography.Paragraph>
      ) : null}

      <div className="similar-name-resolve-actions">
        <Button
          block
          type="primary"
          disabled={!selectedId}
          className="similar-name-resolve-action-btn"
          onClick={() => linkWithNameChoice('roster')}
        >
          <span className="similar-name-resolve-action-title">Use roster name</span>
          {selectedCandidate ? (
            <span className="similar-name-resolve-action-detail">{selectedCandidate.name}</span>
          ) : null}
        </Button>

        <Button
          block
          disabled={!selectedId}
          className="similar-name-resolve-action-btn"
          onClick={() => linkWithNameChoice('scanned')}
        >
          <span className="similar-name-resolve-action-title">Use scanned name</span>
          <span className="similar-name-resolve-action-detail">{scannedName}</span>
        </Button>

        <Button block className="similar-name-resolve-action-btn similar-name-resolve-new-btn" onClick={markAsNew}>
          <span className="similar-name-resolve-action-title">Use as a new Learning Partner</span>
          <span className="similar-name-resolve-action-detail">
            Keeps scanned name on a separate record with no prior history
          </span>
        </Button>
      </div>
    </Modal>
  )
}
