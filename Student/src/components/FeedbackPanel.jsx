import { Alert, Button, Card, Checkbox, Input, Select, Space, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { LEARNING_PARTNER } from '../constants/branding'
import { getEffectiveAbsenceCounts } from '../utils/attendanceStats'
import { composeFeedback, suggestAttendanceEmphasis } from '../utils/feedbackCompose'
import { isFeedbackLlmConfigured, refineFeedbackWithLlm } from '../utils/feedbackLlm'
import {
  ATTENDANCE_EMPHASIS,
  ASSIGNMENT_QUALITY,
  PARTICIPATION_LEVEL,
  assignmentOptions,
  attendanceEmphasisOptions,
  participationOptions,
} from '../utils/feedbackTraits'
import { formatClassLabel } from '../utils/classFormat'
import FormField from './FormField'
import PanelChrome from './PanelChrome'
import SearchableSelect from './SearchableSelect'
import { UI } from '../utils/uiCopy'

export default function FeedbackPanel({ classes = [], attendance = {} }) {
  const [classId, setClassId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [attendanceEmphasis, setAttendanceEmphasis] = useState(ATTENDANCE_EMPHASIS.auto)
  const [participation, setParticipation] = useState(PARTICIPATION_LEVEL.active)
  const [assignmentQuality, setAssignmentQuality] = useState(ASSIGNMENT_QUALITY.good)
  const [includeAttendance, setIncludeAttendance] = useState(true)
  const [extraNotes, setExtraNotes] = useState('')
  const [output, setOutput] = useState('')
  const [refining, setRefining] = useState(false)

  const classOptions = useMemo(
    () =>
      [...classes]
        .sort((a, b) => formatClassLabel(a).localeCompare(formatClassLabel(b)))
        .map((cls) => ({ value: cls.id, label: formatClassLabel(cls) })),
    [classes],
  )

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId],
  )

  const partnerOptions = useMemo(() => {
    if (!selectedClass) return []
    return [...(selectedClass.students ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ value: s.id, label: s.name }))
  }, [selectedClass])

  const selectedPartner = useMemo(
    () => selectedClass?.students?.find((s) => s.id === partnerId) ?? null,
    [selectedClass, partnerId],
  )

  const classAttendance = attendance[classId] || {}
  const counts = useMemo(() => {
    if (!selectedPartner) return { total: 0, consecutive: 0, recorded: { total: 0, consecutive: 0 } }
    return getEffectiveAbsenceCounts(selectedPartner, classAttendance)
  }, [selectedPartner, classAttendance])

  useEffect(() => {
    if (classId && !classOptions.some((o) => o.value === classId)) {
      setClassId('')
      setPartnerId('')
    }
  }, [classId, classOptions])

  useEffect(() => {
    if (partnerId && !partnerOptions.some((o) => o.value === partnerId)) {
      setPartnerId('')
    }
  }, [partnerId, partnerOptions])

  useEffect(() => {
    if (attendanceEmphasis !== ATTENDANCE_EMPHASIS.auto) return
    if (!selectedPartner) return
    // Auto mode: no need to store — compose uses suggestAttendanceEmphasis
  }, [attendanceEmphasis, selectedPartner, counts])

  const suggestedEmphasis = suggestAttendanceEmphasis({
    total: counts.total,
    consecutive: counts.consecutive,
  })

  const suggestedLabel =
    attendanceEmphasisOptions.find((o) => o.value === suggestedEmphasis)?.label ?? suggestedEmphasis

  const hasAttendanceStats = Boolean(selectedPartner)
  const statPlaceholder = '--'
  const displayTotal = hasAttendanceStats ? counts.total : statPlaceholder
  const displayStreak = hasAttendanceStats ? counts.consecutive : statPlaceholder
  const displaySuggestedTone =
    hasAttendanceStats && attendanceEmphasis === ATTENDANCE_EMPHASIS.auto
      ? suggestedLabel
      : statPlaceholder

  function handleGenerate() {
    if (!selectedPartner) {
      message.warning(`Select a ${UI.learningPartner} first.`)
      return
    }
    const text = composeFeedback({
      counts: { total: counts.total, consecutive: counts.consecutive },
      attendanceEmphasis,
      participation,
      assignmentQuality,
      extraNotes,
      includeAttendance,
    })
    setOutput(text)
  }

  async function handleRefine() {
    if (!output.trim()) {
      message.warning('Generate a draft first, or paste text to refine.')
      return
    }
    if (!selectedPartner || !selectedClass) return
    setRefining(true)
    try {
      const refined = await refineFeedbackWithLlm(output, {
        partnerName: selectedPartner.name,
        className: formatClassLabel(selectedClass),
        total: counts.total,
        consecutive: counts.consecutive,
        extraNotes,
      })
      setOutput(refined)
      message.success('Feedback refined.')
    } catch (err) {
      message.error(err.message || 'Could not refine feedback.')
    } finally {
      setRefining(false)
    }
  }

  async function handleCopy() {
    if (!output.trim()) {
      message.warning('Nothing to copy yet.')
      return
    }
    try {
      await navigator.clipboard.writeText(output)
      message.success('Copied to clipboard.')
    } catch {
      message.error('Could not copy — select the text and copy manually.')
    }
  }

  const aiReady = isFeedbackLlmConfigured()

  return (
    <section className="panel feedback-panel workspace-panel">
      <PanelChrome
        title="Feedback"
        description="Build report-style feedback from absence totals and streaks, participation and assignment quality, and your own notes. Copy or refine with AI when configured."
      />

      <div className="workspace-body">
        <div className="feedback-workspace-split">
          <div className="feedback-details-pane">
        <Card size="small" title="Select" className="feedback-panel-card">
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <FormField label="Class">
              <SearchableSelect
                placeholder="Choose class…"
                options={classOptions}
                value={classId || undefined}
                onChange={(v) => {
                  setClassId(v ?? '')
                  setPartnerId('')
                }}
                allowClear
              />
            </FormField>
            <FormField label={LEARNING_PARTNER.singularTitle}>
              <SearchableSelect
                placeholder={
                  classId
                    ? `Choose ${UI.learningPartner}…`
                    : 'Select a class first'
                }
                options={partnerOptions}
                value={partnerId || undefined}
                onChange={(v) => setPartnerId(v ?? '')}
                disabled={!classId}
                allowClear
              />
            </FormField>

            <div className="feedback-stats-row">
              <Typography.Text type="secondary">From attendance records</Typography.Text>
              <div className="feedback-stats-badges">
                <span className="feedback-stat">
                  <strong className="feedback-stat-value">{displayTotal}</strong> total absence days
                </span>
                <span className="feedback-stat">
                  <strong className="feedback-stat-value">{displayStreak}</strong> day streak
                </span>
              </div>
              {attendanceEmphasis === ATTENDANCE_EMPHASIS.auto && (
                <Typography.Text type="secondary" className="feedback-auto-hint">
                  Suggested attendance tone:{' '}
                  <span className="feedback-stat-value feedback-stat-value-tone">
                    {displaySuggestedTone}
                  </span>
                </Typography.Text>
              )}
            </div>
          </Space>
        </Card>

        <Card size="small" title={UI.traitsAndNotes} className="feedback-panel-card">
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <FormField label="Attendance in Feedback">
              <Select
                value={attendanceEmphasis}
                onChange={setAttendanceEmphasis}
                options={attendanceEmphasisOptions}
                style={{ width: '100%' }}
              />
            </FormField>
            <Checkbox
              checked={includeAttendance}
              onChange={(e) => setIncludeAttendance(e.target.checked)}
            >
              Include attendance paragraph
            </Checkbox>
            <FormField label="Participation">
              <Select
                value={participation}
                onChange={setParticipation}
                options={participationOptions}
                style={{ width: '100%' }}
              />
            </FormField>
            <FormField label="Assignments & Quality">
              <Select
                value={assignmentQuality}
                onChange={setAssignmentQuality}
                options={assignmentOptions}
                style={{ width: '100%' }}
              />
            </FormField>
            <FormField label="Extra Notes (Optional)">
              <Input.TextArea
                value={extraNotes}
                onChange={(e) => setExtraNotes(e.target.value)}
                placeholder="e.g. strong in group work, needs support with deadlines…"
                rows={3}
                maxLength={2000}
                showCount
              />
            </FormField>
            <Space wrap>
              <Button type="primary" onClick={handleGenerate} disabled={!selectedPartner}>
                {UI.generateFeedback}
              </Button>
              {aiReady && (
                <Button onClick={handleRefine} loading={refining} disabled={!output.trim()}>
                  Refine with AI
                </Button>
              )}
              <Button onClick={handleCopy} disabled={!output.trim()}>
                Copy
              </Button>
            </Space>
            {!aiReady && (
              <Alert
                type="info"
                showIcon
                title="AI Refine Optional"
                description="Templates work offline. For Refine with AI, configure Ollama or VITE_VISION_LLM_API_KEY (see .env.example). Use VITE_FEEDBACK_LLM_MODEL for a text model such as llama3.2."
              />
            )}
          </Space>
        </Card>
          </div>

          <div className="feedback-output-pane">
            <Card
              size="small"
              title={UI.generatedFeedback}
              className="feedback-panel-card feedback-panel-output-card"
            >
              <div className="feedback-output-field">
                <Input.TextArea
                  className="feedback-output-area"
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  placeholder={`Click ${UI.generateFeedback}, then edit here before copying.`}
                  maxLength={8000}
                />
                <div className="feedback-output-footer">
                  <span className="feedback-char-count" aria-live="polite">
                    {output.length} / 8000
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
