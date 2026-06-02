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
import SearchableSelect from './SearchableSelect'

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

  function handleGenerate() {
    if (!selectedPartner) {
      message.warning(`Select a ${LEARNING_PARTNER.singular.toLowerCase()} first.`)
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
    <div className="feedback-panel">
      <Typography.Paragraph type="secondary" className="feedback-panel-intro">
        Build report-style feedback using absence totals and streaks from your records, plus
        participation and assignment quality. Add your own notes, then copy or refine with AI.
      </Typography.Paragraph>

      <div className="feedback-panel-grid">
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
                    ? `Choose ${LEARNING_PARTNER.singular.toLowerCase()}…`
                    : 'Select a class first'
                }
                options={partnerOptions}
                value={partnerId || undefined}
                onChange={(v) => setPartnerId(v ?? '')}
                disabled={!classId}
                allowClear
              />
            </FormField>

            {selectedPartner && (
              <div className="feedback-stats-row">
                <Typography.Text type="secondary">From attendance records</Typography.Text>
                <div className="feedback-stats-badges">
                  <span className="feedback-stat">
                    <strong>{counts.total}</strong> total absence
                    {counts.total === 1 ? ' day' : ' days'}
                    {counts.usesManualTotal ? ' (manual)' : ''}
                  </span>
                  <span className="feedback-stat">
                    <strong>{counts.consecutive}</strong> day streak
                    {counts.usesManualConsecutive ? ' (manual)' : ''}
                  </span>
                </div>
                {attendanceEmphasis === ATTENDANCE_EMPHASIS.auto && (
                  <Typography.Text type="secondary" className="feedback-auto-hint">
                    Auto attendance tone: {suggestedLabel}
                  </Typography.Text>
                )}
              </div>
            )}
          </Space>
        </Card>

        <Card size="small" title="Traits & notes" className="feedback-panel-card">
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <FormField label="Attendance in feedback">
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
            <FormField label="Assignments & quality">
              <Select
                value={assignmentQuality}
                onChange={setAssignmentQuality}
                options={assignmentOptions}
                style={{ width: '100%' }}
              />
            </FormField>
            <FormField label="Extra notes (optional)">
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
                Generate feedback
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
                title="AI refine optional"
                description="Templates work offline. For Refine with AI, configure Ollama or VITE_VISION_LLM_API_KEY (see .env.example). Use VITE_FEEDBACK_LLM_MODEL for a text model such as llama3.2."
              />
            )}
          </Space>
        </Card>

        <Card
          size="small"
          title="Generated feedback"
          className="feedback-panel-card feedback-panel-output-card"
        >
          <Input.TextArea
            className="feedback-output-area"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="Click Generate feedback, then edit here before copying."
            rows={12}
            maxLength={8000}
            showCount
          />
        </Card>
      </div>
    </div>
  )
}
