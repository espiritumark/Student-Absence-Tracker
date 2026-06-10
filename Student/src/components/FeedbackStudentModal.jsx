import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useAppNotifier } from '../hooks/useAppNotifier'
import { getEffectiveAbsenceCounts } from '../utils/attendanceStats'
import { formatClassLabel } from '../utils/classFormat'
import { composeFeedback, suggestAttendanceEmphasis } from '../utils/feedbackCompose'
import { isFeedbackLlmConfigured, refineFeedbackWithLlm } from '../utils/feedbackLlm'
import {
  ASSIGNMENT_QUALITY,
  ATTENDANCE_EMPHASIS,
  PARTICIPATION_LEVEL,
  assignmentOptions,
  attendanceEmphasisOptions,
  participationOptions,
} from '../utils/feedbackTraits'
import {
  FEEDBACK_WORD_MAX,
  FEEDBACK_WORD_MIN,
  countFeedbackWords,
  feedbackWordCountStatus,
  isValidFeedbackWordCount,
  mergeFeedbackDraft,
} from '../utils/feedbackWords'
import { UI } from '../utils/uiCopy'
import ConfirmDialog from './ConfirmDialog'
import FormField from './FormField'
import SaveFieldOverlay from './SaveFieldOverlay'

const SAVE_MODES = {
  replace: 'replace',
  build: 'build',
}

function wordCountClass(status) {
  if (status === 'ok') return 'feedback-word-count-ok'
  if (status === 'long') return 'feedback-word-count-long'
  if (status === 'short') return 'feedback-word-count-short'
  return 'feedback-word-count-empty'
}

export default function FeedbackStudentModal({
  open,
  classId,
  classMeta,
  partner,
  classAttendance = {},
  onClose,
  onSaveFeedback,
  saving = false,
}) {
  const notify = useAppNotifier()
  const [attendanceEmphasis, setAttendanceEmphasis] = useState(ATTENDANCE_EMPHASIS.auto)
  const [participation, setParticipation] = useState(PARTICIPATION_LEVEL.active)
  const [assignmentQuality, setAssignmentQuality] = useState(ASSIGNMENT_QUALITY.good)
  const [includeAttendance, setIncludeAttendance] = useState(true)
  const [extraNotes, setExtraNotes] = useState('')
  const [draft, setDraft] = useState('')
  const [saveMode, setSaveMode] = useState(SAVE_MODES.replace)
  const [refining, setRefining] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const savedFeedback = String(partner?.feedback ?? '').trim()
  const hasSaved = Boolean(savedFeedback)

  const counts = useMemo(() => {
    if (!partner) return { total: 0, consecutive: 0 }
    return getEffectiveAbsenceCounts(partner, classAttendance)
  }, [partner, classAttendance])

  useEffect(() => {
    if (!open) return
    setAttendanceEmphasis(ATTENDANCE_EMPHASIS.auto)
    setParticipation(PARTICIPATION_LEVEL.active)
    setAssignmentQuality(ASSIGNMENT_QUALITY.good)
    setIncludeAttendance(true)
    setExtraNotes('')
    setDraft('')
    setSaveMode(hasSaved ? SAVE_MODES.build : SAVE_MODES.replace)
    setDeleteOpen(false)
  }, [open, partner?.id, hasSaved])

  const draftWordCount = countFeedbackWords(draft)
  const draftWordStatus = feedbackWordCountStatus(draft)
  const aiReady = isFeedbackLlmConfigured()
  const busy = saving || refining

  const suggestedEmphasis = suggestAttendanceEmphasis({
    total: counts.total,
    consecutive: counts.consecutive,
  })
  const suggestedLabel =
    attendanceEmphasisOptions.find((o) => o.value === suggestedEmphasis)?.label ??
    suggestedEmphasis

  function handleGenerate() {
    const generated = composeFeedback({
      counts: { total: counts.total, consecutive: counts.consecutive },
      attendanceEmphasis,
      participation,
      assignmentQuality,
      extraNotes,
      includeAttendance,
    })
    setDraft(generated)
  }

  async function handleRefine() {
    if (!draft.trim()) {
      notify.warning({ title: 'Generate a draft first, or type feedback to refine.' })
      return
    }
    if (!partner || !classMeta) return
    setRefining(true)
    try {
      const refined = await refineFeedbackWithLlm(draft, {
        partnerName: partner.name,
        className: formatClassLabel(classMeta),
        total: counts.total,
        consecutive: counts.consecutive,
        extraNotes,
        existingFeedback: hasSaved && saveMode === SAVE_MODES.build ? savedFeedback : '',
      })
      setDraft(refined)
      if (!isValidFeedbackWordCount(refined)) {
        notify.warning({
          title: `Refined feedback is ${countFeedbackWords(refined)} words.`,
          description: `Adjust to ${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words before saving.`,
        })
      } else {
        notify.success({ title: 'Feedback refined.' })
      }
    } catch (err) {
      notify.error({ title: err.message || 'Could not refine feedback.' })
    } finally {
      setRefining(false)
    }
  }

  async function handleCopy(text) {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      notify.success({ title: 'Copied to clipboard.' })
    } catch {
      notify.error({ title: 'Could not copy — select the text and copy manually.' })
    }
  }

  async function handleSave() {
    const next =
      hasSaved && saveMode === SAVE_MODES.build
        ? mergeFeedbackDraft(savedFeedback, draft, SAVE_MODES.build)
        : draft.trim()

    if (!isValidFeedbackWordCount(next)) {
      notify.warning({
        title: `Feedback must be ${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words.`,
        description: `Current draft: ${countFeedbackWords(next)} words.`,
      })
      return
    }

    try {
      await onSaveFeedback?.(classId, partner.id, next)
      onClose?.()
    } catch {
      // Error surfaced by FeedbackPanel and cloud sync banner.
    }
  }

  async function handleDelete() {
    try {
      await onSaveFeedback?.(classId, partner.id, '')
      setDeleteOpen(false)
      onClose?.()
    } catch {
      setDeleteOpen(false)
    }
  }

  if (!partner || !classMeta) return null

  return (
    <>
      <Modal
        open={open}
        title={`Feedback — ${partner.name}`}
        onCancel={busy ? undefined : onClose}
        width="min(1080px, 96vw)"
        className="feedback-student-modal"
        destroyOnHidden
        closable={!busy}
        maskClosable={!busy}
        keyboard={!busy}
        footer={
          <Space wrap>
            <Button onClick={onClose} disabled={busy}>
              Close
            </Button>
            {hasSaved && (
              <Button danger disabled={busy} onClick={() => setDeleteOpen(true)}>
                Remove Saved Feedback
              </Button>
            )}
            <Button
              onClick={() => handleCopy(hasSaved && !draft.trim() ? savedFeedback : draft)}
              disabled={busy || (!draft.trim() && !hasSaved)}
            >
              Copy
            </Button>
            <Button type="primary" loading={saving} disabled={busy} onClick={handleSave}>
              {UI.saveFeedback}
            </Button>
          </Space>
        }
      >
        <div className="feedback-modal-body">
          <Typography.Text type="secondary" className="feedback-modal-compose-lead">
            {hasSaved
              ? 'Adjust traits on the left. Saved feedback and your new draft are on the right — build on saved or replace when you save (30–50 words).'
              : 'Generate or write feedback in the right panel, then save (30–50 words).'}
          </Typography.Text>

          <div className="feedback-workspace-split">
            <div className="feedback-details-pane">
              <Card size="small" title="Context" className="feedback-panel-card">
                <div className="feedback-stats-row">
                  <Typography.Text type="secondary">From attendance records</Typography.Text>
                  <div className="feedback-stats-badges">
                    <span className="feedback-stat">
                      <strong className="feedback-stat-value">{counts.total}</strong> total absence
                      days
                    </span>
                    <span className="feedback-stat">
                      <strong className="feedback-stat-value">{counts.consecutive}</strong> day streak
                    </span>
                  </div>
                  {attendanceEmphasis === ATTENDANCE_EMPHASIS.auto && (
                    <Typography.Text type="secondary" className="feedback-auto-hint">
                      Suggested attendance tone:{' '}
                      <span className="feedback-stat-value feedback-stat-value-tone">
                        {suggestedLabel}
                      </span>
                    </Typography.Text>
                  )}
                </div>
              </Card>

              <Card size="small" title={UI.traitsAndNotes} className="feedback-panel-card">
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <FormField label="Attendance in Feedback">
                    <Select
                      value={attendanceEmphasis}
                      onChange={setAttendanceEmphasis}
                      options={attendanceEmphasisOptions}
                      style={{ width: '100%' }}
                      disabled={busy}
                    />
                  </FormField>
                  <Checkbox
                    checked={includeAttendance}
                    onChange={(e) => setIncludeAttendance(e.target.checked)}
                    disabled={busy}
                  >
                    Include attendance in draft
                  </Checkbox>
                  <FormField label="Participation">
                    <Select
                      value={participation}
                      onChange={setParticipation}
                      options={participationOptions}
                      style={{ width: '100%' }}
                      disabled={busy}
                    />
                  </FormField>
                  <FormField label="Assignments & Quality">
                    <Select
                      value={assignmentQuality}
                      onChange={setAssignmentQuality}
                      options={assignmentOptions}
                      style={{ width: '100%' }}
                      disabled={busy}
                    />
                  </FormField>
                  <FormField label="Extra Notes (Optional)">
                    <Input.TextArea
                      value={extraNotes}
                      onChange={(e) => setExtraNotes(e.target.value)}
                      placeholder="e.g. strong in group work, needs support with deadlines…"
                      rows={3}
                      maxLength={500}
                      disabled={busy}
                    />
                  </FormField>
                  <Space wrap>
                    <Button type="primary" onClick={handleGenerate} disabled={busy}>
                      {UI.generateFeedback}
                    </Button>
                    {aiReady && (
                      <Button
                        onClick={handleRefine}
                        loading={refining}
                        disabled={saving || refining || !draft.trim()}
                      >
                        Refine with AI
                      </Button>
                    )}
                  </Space>
                  {!aiReady && (
                    <Alert
                      type="info"
                      showIcon
                      title="AI Refine Optional"
                      description="Templates work offline. Configure Ollama or VITE_VISION_LLM_API_KEY for Refine with AI."
                    />
                  )}
                </Space>
              </Card>
            </div>

            <div className="feedback-output-pane feedback-modal-output-stack">
              {hasSaved && (
                <Card
                  size="small"
                  title={UI.feedbackSaved}
                  className="feedback-panel-card feedback-modal-saved-card"
                >
                  <Typography.Paragraph className="feedback-modal-saved-text">
                    {savedFeedback}
                  </Typography.Paragraph>
                  <Space wrap size={[6, 6]}>
                    <Tag color="success">{countFeedbackWords(savedFeedback)} words</Tag>
                    <Button
                      size="small"
                      type="link"
                      disabled={busy}
                      onClick={() => handleCopy(savedFeedback)}
                    >
                      Copy Saved
                    </Button>
                  </Space>
                  <FormField label="When Saving" className="feedback-modal-save-mode-field">
                    <Radio.Group
                      value={saveMode}
                      onChange={(e) => setSaveMode(e.target.value)}
                      optionType="button"
                      buttonStyle="solid"
                      className="feedback-save-mode-group"
                      disabled={busy}
                    >
                      <Radio.Button value={SAVE_MODES.build}>Build on Saved</Radio.Button>
                      <Radio.Button value={SAVE_MODES.replace}>Replace Entirely</Radio.Button>
                    </Radio.Group>
                  </FormField>
                </Card>
              )}

              <Card
                size="small"
                title={hasSaved ? 'New Draft' : UI.generatedFeedback}
                className="feedback-panel-card feedback-panel-output-card"
              >
                <SaveFieldOverlay
                  busy={refining}
                  label="Refining with AI…"
                  className="feedback-output-spin"
                >
                  <div className="feedback-output-field">
                    <Input.TextArea
                      className="feedback-output-area"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={`Click ${UI.generateFeedback}, then edit here before saving (${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words).`}
                      readOnly={busy}
                    />
                    <div className="feedback-output-footer">
                      <span
                        className={`feedback-word-count ${wordCountClass(draftWordStatus)}`}
                        aria-live="polite"
                      >
                        {draftWordCount} / {FEEDBACK_WORD_MAX} words
                        {draftWordCount > 0 && draftWordCount < FEEDBACK_WORD_MIN
                          ? ` (${FEEDBACK_WORD_MIN} minimum to save)`
                          : ''}
                      </span>
                    </div>
                  </div>
                </SaveFieldOverlay>
              </Card>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Remove saved feedback?"
        confirmLabel="Remove"
        cancelLabel="Keep Feedback"
        danger
        busy={busy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      >
        <p className="modal-lead">
          Remove all saved feedback for <strong>{partner.name}</strong>? You can write new feedback
          later.
        </p>
      </ConfirmDialog>
    </>
  )
}
