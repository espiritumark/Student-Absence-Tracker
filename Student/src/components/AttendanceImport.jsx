import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Progress,
  Radio,
  Result,
  Row,
  Col,
  Space,
  Table,
  Tag,
  Tabs,
  Typography,
  Upload,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useAutoDismiss } from '../hooks/useAutoDismiss'
import { useReportTabActivity } from '../hooks/useReportTabActivity'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import { formatClassLabel } from '../utils/classFormat'
import { dateKey, formatDateLabel } from '../utils/dates'
import {
  buildImportPayload,
  computeOverwriteSummary,
} from '../utils/importReview'
import {
  cancelOcrJob,
  consumeOcrResult,
  prewarmOcr,
  runOcrJob,
  subscribeOcr,
} from '../utils/ocrSession'
import { buildPortalJson, parseAttendanceJson } from '../utils/parseAttendanceJson'
import { fileToDataUrl, isCloudOcrConfigured, isRoboflowCheckboxConfigured } from '../utils/parseScreenshot'
import ConfirmDialog from './ConfirmDialog'
import ConfirmOverwriteModal from './ConfirmOverwriteModal'
import BackButton from './BackButton'
import SaveFieldOverlay from './SaveFieldOverlay'

const emptyMeta = {
  intake: '',
  level: '',
  qualification: '',
  group: '',
  date: dateKey(),
  module: '',
  startTime: '',
  duration: '',
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

function OcrSpinner({ progress, stageLabel, elapsedSeconds = 0, progressStalled = false, onCancel }) {
  const pct = Math.round((progress ?? 0) * 100)
  return (
    <div className="ocr-spinner" aria-live="polite">
      <Progress type="circle" percent={pct} size={88} strokeColor="var(--primary)" />
      <div className="ocr-spinner-text">
        <Typography.Text strong>{stageLabel || 'Reading screenshot…'}</Typography.Text>
        <Typography.Text type="secondary" style={{ display: 'block' }}>
          {pct}% complete · {formatElapsed(elapsedSeconds)} elapsed
        </Typography.Text>
        <Progress percent={pct} showInfo={false} style={{ marginTop: 8 }} />
        {pct < 62 && (
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85rem' }}>
            First run downloads OCR files — this can take about a minute.
          </Typography.Text>
        )}
        {progressStalled && (
          <Typography.Text type="warning" style={{ display: 'block', fontSize: '0.85rem' }}>
            Still working — add a cloud OCR key in .env for much faster scans.
          </Typography.Text>
        )}
        {onCancel && (
          <Button size="small" style={{ marginTop: 8 }} onClick={onCancel}>
            Cancel scan
          </Button>
        )}
      </div>
    </div>
  )
}

function SaveSuccess({
  meta,
  classLabel,
  savedCount,
  resetCountdown,
  onGoToWarnings,
  onImportAnother,
}) {
  return (
    <Result
      status="success"
      title="Attendance saved"
      subTitle={
        <>
          <strong>{formatDateLabel(meta.date)}</strong>
          {classLabel && <> — {classLabel}</>}
        </>
      }
      extra={
        <div className="import-save-success-extra">
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {savedCount.total} students ·{' '}
            <Typography.Text type={savedCount.absent > 0 ? 'danger' : undefined} strong>
              {savedCount.absent} absent
            </Typography.Text>
          </Typography.Paragraph>
          {resetCountdown > 0 && (
            <Typography.Text type="secondary" className="import-save-success-reset">
              Ready for the next import in {resetCountdown}s — or use a button below.
            </Typography.Text>
          )}
          <Space wrap className="import-save-success-actions">
            {savedCount.absent > 0 && (
              <Button type="primary" onClick={onGoToWarnings}>
                View Dashboard
              </Button>
            )}
            <Button onClick={onImportAnother}>Import another now</Button>
          </Space>
        </div>
      }
    />
  )
}

const SUCCESS_RESET_SECONDS = 5

export default function AttendanceImport({
  importPortalSession,
  classes,
  attendance,
  isActive = true,
  onGoToWarnings,
  onTabActivityChange,
}) {
  const [importMode, setImportMode] = useState('json')
  const [jsonText, setJsonText] = useState('')
  const [pendingScreenshot, setPendingScreenshot] = useState(null)
  const pasteZoneRef = useRef(null)
  const [processing, setProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrStageLabel, setOcrStageLabel] = useState('')
  const [ocrElapsedSeconds, setOcrElapsedSeconds] = useState(0)
  const [ocrProgressStalled, setOcrProgressStalled] = useState(false)
  const ocrStartedAtRef = useRef(null)
  const ocrProgressAtRef = useRef(0)
  const [highAccuracy, setHighAccuracy] = useState(false)
  const [scanMode, setScanMode] = useState('full')
  const [error, setError] = useState('')
  const [meta, setMeta] = useState(emptyMeta)
  const [students, setStudents] = useState([])
  const [previewUrl, setPreviewUrl] = useState(null)
  const [saved, setSaved] = useState(false)
  const [savedCount, setSavedCount] = useState({ total: 0, absent: 0 })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [confirmSummary, setConfirmSummary] = useState(null)
  const [confirmError, setConfirmError] = useState('')
  const [saving, setSaving] = useState(false)
  const [parseMessage, setParseMessage] = useState('')
  const [jsonExportMessage, setJsonExportMessage] = useState('')
  const [resetCountdown, setResetCountdown] = useState(0)
  const [importView, setImportView] = useState('input')
  const savedRef = useRef(false)

  const hasUnsavedDraft = useCallback(() => {
    return (
      students.length > 0 ||
      Boolean(jsonText.trim()) ||
      Boolean(pendingScreenshot) ||
      processing
    )
  }, [students.length, jsonText, pendingScreenshot, processing])

  const resetParsedReview = useCallback(() => {
    setStudents([])
    setMeta(emptyMeta)
    setParseMessage('')
    setJsonExportMessage('')
    setError('')
    setImportView('input')
  }, [])

  const resetToFreshForm = useCallback(() => {
    savedRef.current = false
    setSaved(false)
    setResetCountdown(0)
    setMeta(emptyMeta)
    setStudents([])
    setPreviewUrl(null)
    setPendingScreenshot(null)
    setJsonText('')
    setError('')
    setParseMessage('')
    setJsonExportMessage('')
    setImportMode('json')
    setImportView('input')
    setConfirmOpen(false)
    setPendingImport(null)
    setConfirmSummary(null)
    setConfirmError('')
  }, [])

  useEffect(() => {
    savedRef.current = saved
  }, [saved])

  useEffect(() => {
    if (!saved || !isActive) {
      setResetCountdown(0)
      return undefined
    }

    setResetCountdown(SUCCESS_RESET_SECONDS)
    const interval = setInterval(() => {
      setResetCountdown((value) => {
        if (value <= 1) {
          clearInterval(interval)
          resetToFreshForm()
          return 0
        }
        return value - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [saved, isActive, resetToFreshForm])

  useEffect(() => {
    if (isActive) return
    if (savedRef.current && !hasUnsavedDraft()) {
      resetToFreshForm()
    }
  }, [isActive, hasUnsavedDraft, resetToFreshForm])

  useAutoDismiss(Boolean(parseMessage) && !hasUnsavedDraft(), () => setParseMessage(''))
  useAutoDismiss(Boolean(jsonExportMessage), () => setJsonExportMessage(''))

  const applyParsed = useCallback((parsed) => {
    const cm = parsed.meta.classMeta
    setMeta({
      intake: cm?.intake ?? '',
      level: cm?.level ?? '',
      qualification: cm?.qualification ?? parsed.meta.classLabel ?? '',
      group: cm?.group ?? '',
      date: parsed.meta.date || dateKey(),
      module: parsed.meta.module || '',
      startTime: parsed.meta.startTime || '',
      duration: parsed.meta.duration || '',
    })
    setStudents(
      [...parsed.students].sort((a, b) => a.name.localeCompare(b.name)),
    )
    if (parsed.previewUrl) setPreviewUrl(parsed.previewUrl)
    setError('')
    setParseMessage(
      `Parsed ${parsed.students.length} student${parsed.students.length === 1 ? '' : 's'}. Review details below, then save.`,
    )
    setImportView('review')
  }, [])

  useEffect(() => {
    if (!processing) return undefined

    const tick = setInterval(() => {
      if (ocrStartedAtRef.current) {
        setOcrElapsedSeconds(Math.floor((Date.now() - ocrStartedAtRef.current) / 1000))
      }
      setOcrProgressStalled(Date.now() - ocrProgressAtRef.current > 8000)
    }, 1000)

    return () => clearInterval(tick)
  }, [processing])

  useEffect(() => {
    return subscribeOcr((snap) => {
      if (snap) {
        setProcessing(true)
        setImportMode('screenshot')
        setOcrProgress(snap.progress)
        setOcrStageLabel(snap.label)
        ocrStartedAtRef.current = snap.startedAt
        ocrProgressAtRef.current = Date.now()
        if (snap.previewUrl) setPreviewUrl(snap.previewUrl)
        return
      }

      const result = consumeOcrResult()
      if (result) {
        applyParsed(result)
      }
      setProcessing(false)
    })
  }, [applyParsed])

  useEffect(() => {
    if (importMode === 'screenshot' && !isCloudOcrConfigured()) {
      prewarmOcr()
    }
    if (importMode === 'screenshot') {
      setTimeout(() => pasteZoneRef.current?.focus(), 50)
    }
  }, [importMode])

  const stageScreenshot = useCallback(async (file) => {
    if (!file?.type.startsWith('image/')) {
      setError('Please use an image file (PNG, JPG, etc.).')
      return
    }
    const dataUrl = await fileToDataUrl(file)
    setPendingScreenshot(dataUrl)
    setPreviewUrl(dataUrl)
    setStudents([])
    setParseMessage('')
    setSaved(false)
    setError('')
  }, [])

  const handlePasteImageEvent = useCallback(
    (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) stageScreenshot(file)
          return
        }
      }
    },
    [stageScreenshot],
  )

  async function pasteScreenshotFromClipboard() {
    pasteZoneRef.current?.focus()
    if (navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getAsType(type)
              await stageScreenshot(new File([blob], 'clipboard.png', { type }))
              return
            }
          }
        }
        setError('No image on clipboard. Take a screenshot with Win+Shift+S, then try again.')
      } catch {
        setError('Click the paste area below, then press Ctrl+V. Or use Choose image.')
      }
      return
    }
    setError('Click the paste area below, then press Ctrl+V.')
  }

  function clearPendingScreenshot() {
    setPendingScreenshot(null)
    setPreviewUrl(null)
    setError('')
  }

  function handleParseJson() {
    setError('')
    setParseMessage('')
    setSaved(false)
    try {
      const parsed = parseAttendanceJson(jsonText)
      applyParsed(parsed)
    } catch (e) {
      setError(e.message || 'Failed to parse JSON.')
      setStudents([])
      setParseMessage('')
      setImportView('input')
    }
  }

  function handleJsonFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setJsonText(String(reader.result || ''))
      setError('')
      setParseMessage('')
    }
    reader.onerror = () => setError('Could not read JSON file.')
    reader.readAsText(file)
  }

  async function handleCancelOcr() {
    await cancelOcrJob()
    setError('Scan cancelled.')
  }

  async function handleScanScreenshot() {
    if (!pendingScreenshot || processing) return
    await processImage(pendingScreenshot)
  }

  async function processImage(source) {
    setImportMode('screenshot')
    setOcrElapsedSeconds(0)
    setOcrProgressStalled(false)
    setError('')
    setSaved(false)
    try {
      await runOcrJob(
        source,
        ({ progress, label }) => {
          setOcrProgress(progress)
          setOcrStageLabel(label)
          ocrProgressAtRef.current = Date.now()
          setOcrProgressStalled(false)
        },
        { highAccuracy, scanMode },
      )
    } catch (e) {
      setError(e.message || 'Failed to read screenshot.')
    }
  }

  useEffect(() => {
    if (importMode !== 'screenshot' || processing) return
    function onPaste(e) {
      handlePasteImageEvent(e)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [importMode, processing, handlePasteImageEvent])

  function togglePresent(name) {
    setStudents((rows) =>
      rows.map((r) =>
        r.name === name ? { ...r, present: !r.present } : r,
      ),
    )
  }

  function setAllPresent(present) {
    setStudents((rows) => rows.map((r) => ({ ...r, present })))
  }

  async function commitImport(payload) {
    await importPortalSession(payload)
    setSavedCount({
      total: payload.students.length,
      absent: payload.students.filter((s) => !s.present).length,
    })
    setSaved(true)
    setStudents([])
    setPreviewUrl(null)
    setJsonText('')
    setParseMessage('')
    setError('')
    setConfirmOpen(false)
    setSaveConfirmOpen(false)
    setPendingImport(null)
    setConfirmSummary(null)
    setConfirmError('')
  }

  async function handleSave(e) {
    e.preventDefault()
    if (saving) return
    if (!students.length) {
      setError('No students to save.')
      return
    }
    const payload = buildImportPayload(meta, students)
    if (!payload.classMeta.qualification && !payload.classMeta.intake) {
      setError('Class details are required.')
      return
    }

    const summary = computeOverwriteSummary(payload, classes, attendance)
    if (summary.needsConfirm) {
      setPendingImport(payload)
      setConfirmSummary(summary)
      setConfirmError('')
      setConfirmOpen(true)
      return
    }
    setPendingImport(payload)
    setConfirmSummary(summary)
    setConfirmError('')
    setSaveConfirmOpen(true)
  }

  async function handleConfirmSaveImport() {
    if (!pendingImport || saving) return
    setSaveConfirmOpen(false)
    setSaving(true)
    setError('')
    try {
      await commitImport(pendingImport)
    } catch (err) {
      setError(err.message || 'Failed to save attendance. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleImportAnother() {
    resetToFreshForm()
  }

  function handleGoToDashboard() {
    document.activeElement?.blur?.()
    resetToFreshForm()
    onGoToWarnings?.()
  }

  async function handleCopyJson() {
    if (!students.length) return
    const json = buildPortalJson(meta, students)
    try {
      await navigator.clipboard.writeText(json)
      setJsonExportMessage('JSON copied to clipboard.')
    } catch {
      setJsonExportMessage('Could not copy JSON. Try downloading instead.')
    }
  }

  function handleDownloadJson() {
    if (!students.length) return
    const json = buildPortalJson(meta, students)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `attendance-${meta.date || 'export'}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setJsonExportMessage('JSON file downloaded.')
  }

  const classLabel =
    meta.intake && meta.level && meta.group
      ? formatClassLabel({
          intake: meta.intake,
          level: meta.level,
          qualification: meta.qualification,
          group: meta.group,
        })
      : meta.qualification || ''

  const [studentTableRef, studentTableHeight] = useScrollRegionHeight(220)
  const showReview = importView === 'review' && students.length > 0 && !processing
  const showImportInput = !showReview
  const backToInputLabel = importMode === 'json' ? 'Back to JSON' : 'Back to Screenshot'

  const importTabActivity = useMemo(() => {
    if (saving || processing) return 'processing'
    if (students.length > 0 || jsonText.trim() || pendingScreenshot) return 'draft'
    return null
  }, [saving, processing, students.length, jsonText, pendingScreenshot])

  useReportTabActivity('import', importTabActivity, onTabActivityChange)

  if (saved) {
    return (
      <section className="panel portal-panel workspace-panel">
        <SaveSuccess
          meta={meta}
          classLabel={classLabel}
          savedCount={savedCount}
          resetCountdown={resetCountdown}
          onGoToWarnings={handleGoToDashboard}
          onImportAnother={handleImportAnother}
        />
      </section>
    )
  }

  return (
    <section className="panel portal-panel workspace-panel">
      {showReview && (
        <div className="panel-nav-bar">
          <BackButton onClick={resetParsedReview}>{backToInputLabel}</BackButton>
        </div>
      )}

      <header className="panel-header">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Record Attendance
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="panel-desc" style={{ marginBottom: 0 }}>
          Upload or paste a screenshot, preview it, then scan. JSON import is instant if your
          portal exports a file.
          {isCloudOcrConfigured() && <> Cloud OCR is enabled for fast scans.</>}
        </Typography.Paragraph>
      </header>

      {showReview && parseMessage && (
        <Alert
          type="success"
          showIcon
          message={parseMessage}
          style={{ flexShrink: 0, marginBottom: '0.5rem' }}
        />
      )}

      <div className="import-workspace">
      {showImportInput && (
      <div className="import-mode-region">
      <Tabs
        activeKey={importMode}
        onChange={(mode) => {
          if (mode === importMode) return
          resetParsedReview()
          setImportMode(mode)
        }}
        items={[
          { key: 'json', label: 'JSON' },
          { key: 'screenshot', label: 'Screenshot' },
        ]}
        style={{ marginBottom: '0.75rem' }}
      />

      {importMode === 'json' ? (
        <div className="json-import-panel">
          <Typography.Paragraph type="secondary" className="json-import-hint">
            Paste JSON exported from your attendance platform, or upload a <code>.json</code> file.
          </Typography.Paragraph>
          <div className="json-import-textarea-wrap">
            <Input.TextArea
              className="json-import-textarea"
              placeholder={'Paste JSON here…\n\nExpected keys: session_details, attendance[]'}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                if (parseMessage) setParseMessage('')
              }}
              spellCheck={false}
            />
          </div>
          <Space wrap className="json-import-actions">
            <Button type="primary" onClick={handleParseJson} disabled={!jsonText.trim()}>
              Parse JSON
            </Button>
            <Upload
              accept=".json,application/json"
              showUploadList={false}
              beforeUpload={(file) => {
                handleJsonFile(file)
                return false
              }}
            >
              <Button>Upload .json</Button>
            </Upload>
          </Space>
        </div>
      ) : (
        <>
          {isCloudOcrConfigured() ? (
            <Alert
              type="success"
              showIcon
              message="Cloud OCR active — scans use OCR.space Engine 3 (table + checkbox text)."
              description={
                isRoboflowCheckboxConfigured()
                  ? 'Full scan falls back to Roboflow AI when checkbox symbols are missing.'
                  : 'Full scan falls back to layout detection when checkbox symbols are missing; add VITE_ROBOFLOW_API_KEY for better accuracy.'
              }
              style={{ marginBottom: '0.65rem' }}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message={
                <>
                  For faster scans, add a free <strong>OCR.space</strong> API key to your{' '}
                  <code>.env</code> as <code>VITE_OCR_SPACE_API_KEY</code>. Without it, scanning
                  runs slowly in your browser.
                </>
              }
              style={{ marginBottom: '0.65rem' }}
            />
          )}

          {!processing ? (
            <>
              <div
                ref={pasteZoneRef}
                tabIndex={0}
                role="button"
                aria-label="Paste screenshot area. Click here then Ctrl+V, or use the buttons below."
                className={`drop-zone drop-zone-paste ${pendingScreenshot ? 'drop-zone-has-preview' : ''}`}
                onPaste={handlePasteImageEvent}
                onClick={() => pasteZoneRef.current?.focus()}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.currentTarget.classList.add('drop-zone-active')
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove('drop-zone-active')}
                onDrop={(e) => {
                  e.preventDefault()
                  e.currentTarget.classList.remove('drop-zone-active')
                  stageScreenshot(e.dataTransfer.files?.[0])
                }}
              >
                {pendingScreenshot ? (
                  <div className="drop-zone-preview-wrap">
                    <img
                      src={pendingScreenshot}
                      alt="Screenshot preview"
                      className="drop-zone-preview"
                    />
                    <p className="drop-zone-preview-caption">
                      Preview ready — click <strong>Scan screenshot</strong> when it looks correct.
                    </p>
                  </div>
                ) : (
                  <div className="drop-zone-label">
                    <strong>Click here to paste</strong> (Ctrl+V)
                    <br />
                    <span className="muted">Or drag an image onto this area</span>
                  </div>
                )}
              </div>

              <Space wrap style={{ marginTop: '0.65rem' }}>
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    stageScreenshot(file)
                    return false
                  }}
                >
                  <Button>Choose image</Button>
                </Upload>
                <Button onClick={pasteScreenshotFromClipboard}>Paste screenshot</Button>
                <Button type="primary" disabled={!pendingScreenshot} onClick={handleScanScreenshot}>
                  Scan screenshot
                </Button>
                {pendingScreenshot && <Button type="link" onClick={clearPendingScreenshot}>Clear</Button>}
              </Space>
            </>
          ) : (
            <OcrSpinner
              progress={ocrProgress}
              stageLabel={ocrStageLabel}
              elapsedSeconds={ocrElapsedSeconds}
              progressStalled={ocrProgressStalled}
              onCancel={handleCancelOcr}
            />
          )}
          <div className="import-options">
            <Radio.Group value={scanMode} onChange={(e) => setScanMode(e.target.value)}>
              <Space direction="vertical">
                <Radio value="full">
                  Full — detect present/absent from checkboxes
                  {isCloudOcrConfigured() && ' (recommended)'}
                </Radio>
                <Radio value="fast">Fast — names only; mark absences yourself</Radio>
              </Space>
            </Radio.Group>
            {scanMode === 'full' && (
              <Checkbox
                checked={highAccuracy}
                onChange={(e) => setHighAccuracy(e.target.checked)}
                style={{ marginTop: '0.5rem' }}
              >
                High resolution checkbox scan (slower)
              </Checkbox>
            )}
          </div>
        </>
      )}
      </div>
      )}

      {error && showImportInput && (
        <Alert type="error" showIcon message={error} style={{ marginTop: '0.5rem', flexShrink: 0 }} />
      )}
      {parseMessage && !error && showImportInput && (
        <Alert type="success" showIcon message={parseMessage} style={{ marginTop: '0.5rem', flexShrink: 0 }} />
      )}

      {showReview && (
        <>
          {previewUrl && (
            <figure className="screenshot-preview screenshot-preview-compact">
              <img src={previewUrl} alt="Screenshot preview" />
            </figure>
          )}

          <SaveFieldOverlay busy={saving} label="Saving attendance…" className="import-review-overlay">
            <form className="portal-form import-review-form" onSubmit={handleSave}>
              <fieldset className="portal-form-fields import-review-fields" disabled={saving}>
                <div className="import-review-toolbar">
                  <Alert
                    type="info"
                    showIcon={false}
                    message={
                      <>
                        Class: <strong>{classLabel || 'Review class details below'}</strong>
                      </>
                    }
                  />

                  <Row gutter={[12, 12]} className="portal-meta-row">
                    <Col xs={12} sm={8} md={4}>
                      <Typography.Text className="field-label">Intake</Typography.Text>
                      <InputNumber
                        value={meta.intake === '' ? null : Number(meta.intake)}
                        onChange={(value) => setMeta((m) => ({ ...m, intake: value ?? '' }))}
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Typography.Text className="field-label">Level</Typography.Text>
                      <InputNumber
                        value={meta.level === '' ? null : Number(meta.level)}
                        onChange={(value) => setMeta((m) => ({ ...m, level: value ?? '' }))}
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Typography.Text className="field-label">Group</Typography.Text>
                      <InputNumber
                        value={meta.group === '' ? null : Number(meta.group)}
                        onChange={(value) => setMeta((m) => ({ ...m, group: value ?? '' }))}
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <Typography.Text className="field-label">Qualification / Programme</Typography.Text>
                      <Input
                        value={meta.qualification}
                        onChange={(e) => setMeta((m) => ({ ...m, qualification: e.target.value }))}
                      />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Typography.Text className="field-label">Date</Typography.Text>
                      <DatePicker
                        value={meta.date ? dayjs(meta.date) : null}
                        onChange={(value) =>
                          setMeta((m) => ({
                            ...m,
                            date: value ? value.format('YYYY-MM-DD') : dateKey(),
                          }))
                        }
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Typography.Text className="field-label">Module</Typography.Text>
                      <Input
                        value={meta.module}
                        onChange={(e) => setMeta((m) => ({ ...m, module: e.target.value }))}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Typography.Text className="field-label">Start Time</Typography.Text>
                      <Input
                        value={meta.startTime}
                        onChange={(e) => setMeta((m) => ({ ...m, startTime: e.target.value }))}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Typography.Text className="field-label">Duration</Typography.Text>
                      <Input
                        value={meta.duration}
                        onChange={(e) => setMeta((m) => ({ ...m, duration: e.target.value }))}
                      />
                    </Col>
                  </Row>

                  <Space wrap className="import-review-actions">
                    <Button type="primary" onClick={() => setAllPresent(true)}>
                      Check All
                    </Button>
                    <Button onClick={() => setAllPresent(false)}>Uncheck All</Button>
                    <Button onClick={handleCopyJson}>Copy as JSON</Button>
                    <Button onClick={handleDownloadJson}>Download JSON</Button>
                  </Space>
                  <Typography.Text type="secondary" className="import-review-hint">
                    Checked = present · Unchecked = absent
                  </Typography.Text>
                  {jsonExportMessage && (
                    <Alert type="success" showIcon message={jsonExportMessage} />
                  )}
                </div>

                <div className="table-scroll-region portal-student-list-scroll" ref={studentTableRef}>
                  <Table
                    size="small"
                    pagination={{ pageSize: 30, showSizeChanger: false, hideOnSinglePage: true }}
                    scroll={{ y: studentTableHeight }}
                    dataSource={students.map((row) => ({ key: `${row.index}-${row.name}`, ...row }))}
                    columns={[
                      {
                        title: '#',
                        dataIndex: 'index',
                        width: 48,
                      },
                      {
                        title: 'Present',
                        key: 'present',
                        width: 90,
                        render: (_, row) => (
                          <Checkbox
                            checked={row.present}
                            onChange={() => togglePresent(row.name)}
                          />
                        ),
                      },
                      {
                        title: 'Student',
                        dataIndex: 'name',
                        ellipsis: true,
                      },
                      {
                        title: 'Status',
                        key: 'status',
                        width: 90,
                        render: (_, row) =>
                          !row.present ? (
                            <Tag color="error">Absent</Tag>
                          ) : (
                            <Tag color="success">Present</Tag>
                          ),
                      },
                    ]}
                  />
                </div>

                <Typography.Paragraph type="secondary" className="import-review-summary">
                  {formatDateLabel(meta.date)} · {students.length} students ·{' '}
                  <Typography.Text strong type="danger">
                    {students.filter((s) => !s.present).length} absent
                  </Typography.Text>
                </Typography.Paragraph>

                <Button type="primary" htmlType="submit" loading={saving} block>
                  Save daily attendance
                </Button>
              </fieldset>
            </form>
          </SaveFieldOverlay>
        </>
      )}
      </div>

      <ConfirmOverwriteModal
        open={confirmOpen}
        summary={confirmSummary}
        error={confirmError}
        busy={saving}
        onCancel={() => {
          if (saving) return
          setConfirmOpen(false)
          setPendingImport(null)
          setConfirmSummary(null)
          setConfirmError('')
        }}
        onConfirm={async () => {
          if (!pendingImport || saving) return
          setSaving(true)
          setConfirmError('')
          try {
            await commitImport(pendingImport)
          } catch (err) {
            setConfirmError(err.message || 'Failed to save attendance. Please try again.')
          } finally {
            setSaving(false)
          }
        }}
      />

      <ConfirmDialog
        open={saveConfirmOpen}
        title="Save daily attendance?"
        confirmLabel="Save attendance"
        cancelLabel="Keep editing"
        busy={saving}
        onCancel={() => {
          if (saving) return
          setSaveConfirmOpen(false)
          setPendingImport(null)
          setConfirmSummary(null)
        }}
        onConfirm={handleConfirmSaveImport}
      >
        {confirmSummary && pendingImport && (
          <Typography.Paragraph>
            Save attendance for <strong>{confirmSummary.classLabel}</strong>
            {confirmSummary.isNewClass ? ' (new class will be created)' : ''} on{' '}
            <strong>{formatDateLabel(pendingImport.date)}</strong>
            {confirmSummary.module ? (
              <>
                {' '}
                · Module: <strong>{confirmSummary.module}</strong>
              </>
            ) : null}
            ? <strong>{pendingImport.students.length}</strong> students,{' '}
            <strong>{pendingImport.students.filter((s) => !s.present).length}</strong> marked absent.
          </Typography.Paragraph>
        )}
      </ConfirmDialog>
    </section>
  )
}
