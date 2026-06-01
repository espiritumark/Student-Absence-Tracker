import { useCallback, useEffect, useRef, useState } from 'react'
import { useAutoDismiss } from '../hooks/useAutoDismiss'
import { useScrollLoadMore } from '../hooks/useScrollLoadMore'
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
import SaveFieldOverlay from './SaveFieldOverlay'
import ScrollSentinel from './ScrollSentinel'

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
      <div className="ocr-spinner-icon">
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle
            cx="22" cy="22" r="18" fill="none"
            stroke="var(--primary)" strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 18}`}
            strokeDashoffset={`${2 * Math.PI * 18 * (1 - (progress ?? 0))}`}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
          />
        </svg>
      </div>
      <div className="ocr-spinner-text">
        <strong>{stageLabel || 'Reading screenshot…'}</strong>
        <span>
          {pct}% complete · {formatElapsed(elapsedSeconds)} elapsed
        </span>
        <div className="ocr-progress-bar" aria-hidden="true">
          <div className="ocr-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        {pct < 62 && (
          <span className="ocr-progress-hint">
            First run downloads OCR files — this can take about a minute.
          </span>
        )}
        {progressStalled && (
          <span className="ocr-progress-hint">
            Still working — add a cloud OCR key in .env for much faster scans.
          </span>
        )}
        {onCancel && (
          <button type="button" className="btn btn-secondary btn-sm ocr-cancel-btn" onClick={onCancel}>
            Cancel scan
          </button>
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
    <div className="save-success">
      <div className="save-success-icon" aria-hidden="true">
        ✓
      </div>
      <h2>Attendance saved</h2>
      <p>
        <strong>{formatDateLabel(meta.date)}</strong>
        {classLabel && <> — {classLabel}</>}
      </p>
      <p className="save-success-counts">
        {savedCount.total} students ·{' '}
        <span className={savedCount.absent > 0 ? 'absent-highlight' : ''}>
          {savedCount.absent} absent
        </span>
      </p>
      {resetCountdown > 0 && (
        <p className="save-success-reset muted small" role="status">
          Ready for the next import in {resetCountdown}s — or use a button below.
        </p>
      )}
      <div className="save-success-actions">
        {savedCount.absent > 0 && (
          <button type="button" className="btn btn-primary" onClick={onGoToWarnings}>
            View Dashboard →
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onImportAnother}>
          Import another now
        </button>
      </div>
    </div>
  )
}

const SUCCESS_RESET_SECONDS = 5

export default function AttendanceImport({
  importPortalSession,
  classes,
  attendance,
  isActive = true,
  onGoToWarnings,
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
  const savedRef = useRef(false)

  const hasUnsavedDraft = useCallback(() => {
    return (
      students.length > 0 ||
      Boolean(jsonText.trim()) ||
      Boolean(pendingScreenshot) ||
      processing
    )
  }, [students.length, jsonText, pendingScreenshot, processing])

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

  const {
    visibleCount: visibleStudentCount,
    rootRef: studentScrollRef,
    sentinelRef: studentSentinelRef,
    hasMore: hasMoreStudents,
  } = useScrollLoadMore({
    total: students.length,
    batchSize: 30,
    resetKey: `${meta.date}-${students.length}`,
  })

  const visibleImportStudents = students.slice(0, visibleStudentCount)

  if (saved) {
    return (
      <section className="panel portal-panel">
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
    <section className="panel portal-panel">
      <header className="panel-header">
        <h2>Record attendance</h2>
        <p className="panel-desc">
          Upload or paste a screenshot, preview it, then scan. JSON import is instant if your
          portal exports a file.
          {isCloudOcrConfigured() && (
            <> Cloud OCR is enabled for fast scans (usually a few seconds).</>
          )}
        </p>
      </header>

      <div className="import-mode-tabs" role="tablist" aria-label="Import method">
        <button
          type="button"
          role="tab"
          className={`import-mode-tab ${importMode === 'json' ? 'import-mode-active' : ''}`}
          aria-selected={importMode === 'json'}
          onClick={() => setImportMode('json')}
        >
          JSON
        </button>
        <button
          type="button"
          role="tab"
          className={`import-mode-tab ${importMode === 'screenshot' ? 'import-mode-active' : ''}`}
          aria-selected={importMode === 'screenshot'}
          onClick={() => setImportMode('screenshot')}
        >
          Screenshot
        </button>
      </div>

      {importMode === 'json' ? (
        <div className="json-import-panel">
          <p className="muted small">
            Paste JSON exported from your attendance platform, or upload a <code>.json</code> file.
          </p>
          <textarea
            className="json-textarea"
            rows={12}
            placeholder={'Paste JSON here…\n\nExpected keys: session_details, attendance[]'}
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value)
              if (parseMessage) setParseMessage('')
            }}
            spellCheck={false}
          />
          <div className="json-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleParseJson}
              disabled={!jsonText.trim()}
            >
              Parse JSON
            </button>
            <label className="btn btn-secondary file-label">
              Upload .json
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => {
                  handleJsonFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
      ) : (
        <>
          {isCloudOcrConfigured() ? (
            <p className="auth-message cloud-ocr-banner" role="status">
              Cloud OCR active — fast and full scans use OCR.space.
              {isRoboflowCheckboxConfigured()
                ? ' Full scan uses Roboflow AI for checkbox detection.'
                : ' Full scan uses local pixel detection for checkboxes; add VITE_ROBOFLOW_API_KEY for better accuracy.'}
            </p>
          ) : (
            <p className="info-banner">
              For faster scans, add a free <strong>OCR.space</strong> API key to your{' '}
              <code>.env</code> as <code>VITE_OCR_SPACE_API_KEY</code>. Without it, scanning runs
              slowly in your browser.
            </p>
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

              <div className="json-actions screenshot-actions">
                <label className="btn btn-secondary file-label">
                  Choose image
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      stageScreenshot(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
                <button type="button" className="btn btn-secondary" onClick={pasteScreenshotFromClipboard}>
                  Paste screenshot
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!pendingScreenshot}
                  onClick={handleScanScreenshot}
                >
                  Scan screenshot
                </button>
                {pendingScreenshot && (
                  <button type="button" className="btn btn-ghost" onClick={clearPendingScreenshot}>
                    Clear
                  </button>
                )}
              </div>
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
            <fieldset className="scan-mode-fieldset">
              <legend className="sr-only">Screenshot scan mode</legend>
              <label className="notice-inline">
                <input
                  type="radio"
                  name="scanMode"
                  checked={scanMode === 'full'}
                  onChange={() => setScanMode('full')}
                />
                Full — detect present/absent from checkboxes
                {isCloudOcrConfigured() && ' (recommended)'}
              </label>
              <label className="notice-inline">
                <input
                  type="radio"
                  name="scanMode"
                  checked={scanMode === 'fast'}
                  onChange={() => setScanMode('fast')}
                />
                Fast — names only; mark absences yourself
              </label>
            </fieldset>
            {scanMode === 'full' && (
              <label className="notice-inline">
                <input
                  type="checkbox"
                  checked={highAccuracy}
                  onChange={(e) => setHighAccuracy(e.target.checked)}
                />
                High resolution checkbox scan (slower)
              </label>
            )}
          </div>
        </>
      )}

      {error && <p className="error-banner" role="alert">{error}</p>}
      {parseMessage && !error && (
        <p className="auth-message" role="status">
          {parseMessage}
        </p>
      )}

      {students.length > 0 && !processing && (
        <>
          {previewUrl && (
            <figure className="screenshot-preview">
              <img src={previewUrl} alt="Screenshot preview" />
            </figure>
          )}

          <SaveFieldOverlay busy={saving} label="Saving attendance…">
            <form className="portal-form" onSubmit={handleSave}>
            <fieldset className="portal-form-fields" disabled={saving}>
            <p className="portal-class-header">
              Class: <strong>{classLabel || 'Review class details below'}</strong>
            </p>

            <div className="portal-meta-grid">
              <label>
                Intake
                <input
                  type="number"
                  value={meta.intake}
                  onChange={(e) => setMeta((m) => ({ ...m, intake: e.target.value }))}
                />
              </label>
              <label>
                Level
                <input
                  type="number"
                  value={meta.level}
                  onChange={(e) => setMeta((m) => ({ ...m, level: e.target.value }))}
                />
              </label>
              <label>
                Group
                <input
                  type="number"
                  value={meta.group}
                  onChange={(e) => setMeta((m) => ({ ...m, group: e.target.value }))}
                />
              </label>
              <label className="span-2">
                Qualification / programme
                <input
                  type="text"
                  value={meta.qualification}
                  onChange={(e) => setMeta((m) => ({ ...m, qualification: e.target.value }))}
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={meta.date}
                  onChange={(e) => setMeta((m) => ({ ...m, date: e.target.value }))}
                />
              </label>
              <label className="span-2">
                Module
                <input
                  type="text"
                  value={meta.module}
                  onChange={(e) => setMeta((m) => ({ ...m, module: e.target.value }))}
                />
              </label>
              <label>
                Start time
                <input
                  type="text"
                  value={meta.startTime}
                  onChange={(e) => setMeta((m) => ({ ...m, startTime: e.target.value }))}
                />
              </label>
              <label>
                Duration
                <input
                  type="text"
                  value={meta.duration}
                  onChange={(e) => setMeta((m) => ({ ...m, duration: e.target.value }))}
                />
              </label>
            </div>

            <div className="portal-bulk-actions">
              <button type="button" className="btn btn-primary" onClick={() => setAllPresent(true)}>
                Check all
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setAllPresent(false)}>
                Uncheck all
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleCopyJson}>
                Copy as JSON
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleDownloadJson}>
                Download JSON
              </button>
              <span className="muted">Checked = present · Unchecked = absent</span>
            </div>
            {jsonExportMessage && (
              <p className="auth-message" role="status">
                {jsonExportMessage}
              </p>
            )}

            {students.length > 30 && (
              <p className="list-scroll-hint muted small">
                {students.length} students · scroll the list below for more
              </p>
            )}

            <div className="scroll-panel portal-student-list-scroll" ref={studentScrollRef}>
              <ol className="portal-student-list portal-student-list-inset">
                {visibleImportStudents.map((row) => (
                  <li key={`${row.index}-${row.name}`}>
                    <span className="row-num">{row.index}</span>
                    <input
                      type="checkbox"
                      checked={row.present}
                      onChange={() => togglePresent(row.name)}
                      aria-label={`${row.name} present`}
                    />
                    <span className="student-name">{row.name}</span>
                    {!row.present && <span className="absent-tag">Absent</span>}
                  </li>
                ))}
              </ol>
              <ScrollSentinel
                sentinelRef={studentSentinelRef}
                hasMore={hasMoreStudents}
                label="Loading more students…"
              />
            </div>

            <p className="muted summary-line">
              {formatDateLabel(meta.date)} · {students.length} students ·{' '}
              <strong>{students.filter((s) => !s.present).length} absent</strong>
            </p>

            <button type="submit" className="btn btn-primary btn-submit" disabled={saving}>
              {saving ? 'Saving attendance…' : 'Save daily attendance'}
            </button>
            </fieldset>
            </form>
          </SaveFieldOverlay>
        </>
      )}

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
          <p className="modal-lead">
            Save attendance for <strong>{confirmSummary.classLabel}</strong>
            {confirmSummary.isNewClass ? ' (new class will be created)' : ''} on{' '}
            <strong>{formatDateLabel(pendingImport.date)}</strong>
            {confirmSummary.module ? (
              <>
                {' '}
                · Module: <strong>{confirmSummary.module}</strong>
              </>
            ) : null}
            ?{' '}
            <strong>{pendingImport.students.length}</strong> students,{' '}
            <strong>{pendingImport.students.filter((s) => !s.present).length}</strong> marked
            absent.
          </p>
        )}
      </ConfirmDialog>
    </section>
  )
}
