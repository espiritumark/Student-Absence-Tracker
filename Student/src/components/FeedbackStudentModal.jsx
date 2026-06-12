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
import { formatPersonName } from '../utils/nameMatching'
import { composeFeedback, suggestAttendanceEmphasis } from '../utils/feedbackCompose'
import { isFeedbackLlmConfigured, refineFeedbackWithLlm, refineNotesWithLlm } from '../utils/feedbackLlm'
import {
  ASSIGNMENT_QUALITY,
  ATTENDANCE_EMPHASIS,
  PARTICIPATION_LEVEL,
  assignmentOptions,
  attendanceEmphasisOptions,
  participationOptions,
} from '../utils/feedbackTraits'
import {
  FEEDBACK_NOTES_MAX,
  FEEDBACK_WORD_MAX,
  FEEDBACK_WORD_MIN,
  countFeedbackWords,
  feedbackWordCountStatus,
  isValidFeedbackWordCount,
  mergeFeedbackDraft,
} from '../utils/feedbackWords'
import { UI } from '../utils/uiCopy'
import CopyIconButton from './CopyIconButton'
import ConfirmDialog from './ConfirmDialog'
import FormField from './FormField'
import RefineAiIconButton from './RefineAiIconButton'
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
  onSaveStudentFields,
  saving = false,
  needsCloudMigration = false,
}) {
  const notify = useAppNotifier()
  const [attendanceEmphasis, setAttendanceEmphasis] = useState(ATTENDANCE_EMPHASIS.auto)
  const [participation, setParticipation] = useState(PARTICIPATION_LEVEL.active)
  const [assignmentQuality, setAssignmentQuality] = useState(ASSIGNMENT_QUALITY.good)
  const [includeAttendance, setIncludeAttendance] = useState(true)
  const [composeNotes, setComposeNotes] = useState('')
  const [draft, setDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [saveMode, setSaveMode] = useState(SAVE_MODES.replace)
  const [refiningField, setRefiningField] = useState(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const savedFeedback = String(partner?.feedback ?? '').trim()
  const savedNotes = String(partner?.feedbackNotes ?? '').trim()
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
    setComposeNotes('')
    setDraft('')
    setNotesDraft(savedNotes)
    setSaveMode(hasSaved ? SAVE_MODES.build : SAVE_MODES.replace)
    setDeleteOpen(false)
  }, [open, partner?.id, hasSaved, savedNotes])

  const draftWordCount = countFeedbackWords(draft)
  const draftWordStatus = feedbackWordCountStatus(draft)
  const aiReady = isFeedbackLlmConfigured()
  const refining = refiningField !== null
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
      extraNotes: composeNotes,
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
    setRefiningField('feedback')
    try {
      const refined = await refineFeedbackWithLlm(draft, {
        partnerName: partner.name,
        className: formatClassLabel(classMeta),
        total: counts.total,
        consecutive: counts.consecutive,
        extraNotes: composeNotes,
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
      setRefiningField(null)
    }
  }

  async function handleRefineNotes() {
    if (!notesDraft.trim()) {
      notify.warning({ title: 'Type extra notes first, then refine with AI.' })
      return
    }
    if (!partner || !classMeta) return
    setRefiningField('notes')
    try {
      const refined = await refineNotesWithLlm(notesDraft)
      setNotesDraft(refined)
      notify.success({ title: 'Extra notes refined.' })
    } catch (err) {
      notify.error({ title: err.message || 'Could not refine extra notes.' })
    } finally {
      setRefiningField(null)
    }
  }

  async function handleRefineComposeNotes() {
    if (!composeNotes.trim()) {
      notify.warning({ title: 'Add compose notes first, then refine with AI.' })
      return
    }
    setRefiningField('compose')
    try {
      const refined = await refineNotesWithLlm(composeNotes)
      setComposeNotes(refined)
      notify.success({ title: 'Compose notes refined.' })
    } catch (err) {
      notify.error({ title: err.message || 'Could not refine compose notes.' })
    } finally {
      setRefiningField(null)
    }
  }

  async function handleCopyError() {
    notify.error({ title: 'Could not copy — select the text and copy manually.' })
  }

  function renderFieldHeaderActions({
    copyText,
    onRefine,
    refineLoading = false,
    refineCanRun = true,
    refineEmptyTooltip = 'Nothing to refine',
    showRefine = aiReady,
  }) {
    return (
      <Space size={2} className="feedback-card-header-actions">
        {showRefine ? (
          <RefineAiIconButton
            onClick={onRefine}
            loading={refineLoading}
            disabled={busy || refining}
            canRefine={refineCanRun}
            emptyTooltip={refineEmptyTooltip}
          />
        ) : null}
        <CopyIconButton text={copyText} disabled={busy} onCopyError={handleCopyError} />
      </Space>
    )
  }

  async function handleSave() {
    const trimmedDraft = draft.trim()
    const trimmedNotes = notesDraft.trim()
    let nextFeedback = null

    if (trimmedDraft) {
      nextFeedback =
        hasSaved && saveMode === SAVE_MODES.build
          ? mergeFeedbackDraft(savedFeedback, draft, SAVE_MODES.build)
          : trimmedDraft

      if (!isValidFeedbackWordCount(nextFeedback)) {
        notify.warning({
          title: `Feedback must be ${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words.`,
          description: `Current draft: ${countFeedbackWords(nextFeedback)} words.`,
        })
        return
      }
    } else if (hasSaved) {
      nextFeedback = savedFeedback
    }

    const feedbackUnchanged = !trimmedDraft && hasSaved
    const notesUnchanged = trimmedNotes === savedNotes
    if (!trimmedDraft && !hasSaved && notesUnchanged) {
      notify.warning({ title: 'Nothing to save yet.' })
      return
    }
    if (feedbackUnchanged && notesUnchanged) {
      notify.warning({ title: 'No changes to save.' })
      return
    }

    if (needsCloudMigration) {
      notify.error({
        title: 'Cloud database update required before saving',
        description:
          'Run supabase/migrate-feedback.sql in the Supabase SQL Editor, then refresh this page.',
      })
      return
    }

    const patch = {}
    if (trimmedDraft) {
      patch.feedback = nextFeedback
    }
    if (!notesUnchanged) {
      patch.feedbackNotes = trimmedNotes || null
    }

    try {
      await onSaveStudentFields?.(classId, partner.id, patch)
      onClose?.()
    } catch {
      // Error surfaced by FeedbackPanel and cloud sync banner.
    }
  }

  async function handleDelete() {
    try {
      await onSaveStudentFields?.(classId, partner.id, { feedback: null })
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
        title={`Feedback — ${formatPersonName(partner.name)}`}
        onCancel={busy ? undefined : onClose}
        width="min(1080px, 96vw)"
        className="feedback-student-modal"
        destroyOnHidden
        closable={!busy}
        mask={{ closable: !busy }}
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
            <Button type="primary" loading={saving} disabled={busy || needsCloudMigration} onClick={handleSave}>
              {UI.saveFeedback}
            </Button>
          </Space>
        }
      >
        <div className="feedback-modal-body">
          {needsCloudMigration ? (
            <Alert
              type="error"
              showIcon
              className="feedback-setup-alert"
              title="Cloud database update required before saving"
              description={
                <>
                  Run this once in your Supabase project&apos;s SQL Editor, then refresh and save
                  again:
                  <pre className="feedback-setup-sql">
                    alter table public.students{'\n'}
                    {'  '}add column if not exists feedback text;{'\n'}
                    alter table public.students{'\n'}
                    {'  '}add column if not exists feedback_notes text;
                  </pre>
                  File: <code>supabase/migrate-feedback.sql</code>
                </>
              }
            />
          ) : null}
          <Typography.Text type="secondary" className="feedback-modal-compose-lead">
            {hasSaved
              ? 'Adjust traits on the left. Saved feedback and your new draft are on the right — build on saved or replace when you save (30–50 words). Extra notes are saved with the same button.'
              : 'Generate or write feedback, add optional extra notes, then save everything with Save Feedback (30–50 words for feedback).'}
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
                  <FormField
                    className="feedback-compose-notes-field"
                    label={
                      <span className="feedback-field-label-row">
                        <span>{UI.feedbackComposeNotes}</span>
                        {aiReady ? (
                          <RefineAiIconButton
                            onClick={handleRefineComposeNotes}
                            loading={refiningField === 'compose'}
                            disabled={busy || refining}
                            canRefine={Boolean(composeNotes.trim())}
                            emptyTooltip="Add compose notes first"
                          />
                        ) : null}
                      </span>
                    }
                  >
                    <SaveFieldOverlay
                      busy={refiningField === 'compose'}
                      label="Refining compose notes with AI…"
                      className="feedback-compose-notes-spin"
                    >
                      <Input.TextArea
                        value={composeNotes}
                        onChange={(e) => setComposeNotes(e.target.value)}
                        placeholder="e.g. strong in group work, needs support with deadlines…"
                        rows={3}
                        maxLength={500}
                        disabled={busy}
                      />
                    </SaveFieldOverlay>
                  </FormField>
                  <Button type="primary" onClick={handleGenerate} disabled={busy}>
                    {UI.generateFeedback}
                  </Button>
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
              <Card
                size="small"
                title={UI.feedbackSaved}
                className={`feedback-panel-card feedback-modal-saved-card${
                  hasSaved ? '' : ' feedback-modal-saved-card-empty'
                }`}
                extra={
                  hasSaved ? (
                    <CopyIconButton
                      text={savedFeedback}
                      disabled={busy}
                      onCopyError={handleCopyError}
                    />
                  ) : null
                }
              >
                {hasSaved ? (
                  <>
                    <Typography.Paragraph className="feedback-modal-saved-text">
                      {savedFeedback}
                    </Typography.Paragraph>
                    <Tag color="success">{countFeedbackWords(savedFeedback)} words</Tag>
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
                  </>
                ) : (
                  <div className="feedback-modal-saved-empty">
                    <Input.TextArea
                      className="feedback-modal-saved-placeholder"
                      value=""
                      readOnly
                      disabled
                      rows={4}
                      placeholder="Saved feedback will appear here."
                    />
                    <div className="feedback-modal-saved-empty-overlay" aria-hidden>
                      <Typography.Text className="feedback-modal-saved-empty-title">
                        No saved feedback yet
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        Generate a draft below, then save ({FEEDBACK_WORD_MIN}–{FEEDBACK_WORD_MAX}{' '}
                        words).
                      </Typography.Text>
                    </div>
                  </div>
                )}
              </Card>

              <Card
                size="small"
                title={hasSaved ? 'New Draft' : UI.generatedFeedback}
                className="feedback-panel-card feedback-panel-output-card"
                extra={
                  renderFieldHeaderActions({
                    copyText: draft,
                    onRefine: handleRefine,
                    refineLoading: refiningField === 'feedback',
                    refineCanRun: Boolean(draft.trim()),
                    refineEmptyTooltip: 'Generate or type feedback first',
                  })
                }
              >
                <SaveFieldOverlay
                  busy={refiningField === 'feedback'}
                  label="Refining feedback with AI…"
                  className="feedback-output-spin"
                >
                  <div className="feedback-output-field">
                    <Input.TextArea
                      className="feedback-output-area"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={`Click ${UI.generateFeedback}, then edit here before saving (${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words).`}
                      rows={5}
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

              <Card
                size="small"
                title={UI.feedbackExtraNotes}
                className="feedback-panel-card feedback-modal-notes-card"
                extra={
                  renderFieldHeaderActions({
                    copyText: notesDraft,
                    onRefine: handleRefineNotes,
                    refineLoading: refiningField === 'notes',
                    refineCanRun: Boolean(notesDraft.trim()),
                    refineEmptyTooltip: 'Add extra notes first',
                  })
                }
              >
                <Typography.Text type="secondary" className="feedback-modal-notes-lead">
                  Private notes for your reference — saved with feedback (up to{' '}
                  {FEEDBACK_NOTES_MAX.toLocaleString()} characters).
                </Typography.Text>
                <SaveFieldOverlay
                  busy={refiningField === 'notes'}
                  label="Refining extra notes with AI…"
                  className="feedback-notes-spin"
                >
                  <Input.TextArea
                    className="feedback-modal-notes-area"
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Observations, follow-ups, context for next term…"
                    rows={4}
                    maxLength={FEEDBACK_NOTES_MAX}
                    showCount
                    disabled={busy}
                  />
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
