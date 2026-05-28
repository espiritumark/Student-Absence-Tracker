import { useCallback, useEffect, useState } from 'react'
import { formatClassLabel } from '../utils/classFormat'
import { dateKey, formatDateLabel } from '../utils/dates'
import {
  buildImportPayload,
  computeOverwriteSummary,
} from '../utils/importReview'
import { parseAttendanceJson } from '../utils/parseAttendanceJson'
import {
  fileToDataUrl,
  parseAttendanceScreenshot,
} from '../utils/parseScreenshot'
import ConfirmOverwriteModal from './ConfirmOverwriteModal'

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

function OcrSpinner({ progress }) {
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
        <strong>Reading screenshot…</strong>
        <span>{pct > 0 ? `${pct}%` : 'Loading OCR — first run may take ~1 min'}</span>
      </div>
    </div>
  )
}

function SaveSuccess({ meta, classLabel, savedCount, onGoToWarnings, onImportAnother }) {
  return (
    <section className="panel">
      <div className="save-success">
        <div className="save-success-icon" aria-hidden="true">✓</div>
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
        <div className="save-success-actions">
          {savedCount.absent > 0 && (
            <button type="button" className="btn btn-primary" onClick={onGoToWarnings}>
              View Warnings →
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onImportAnother}>
            Import another
          </button>
        </div>
      </div>
    </section>
  )
}

export default function AttendanceImport({
  importPortalSession,
  classes,
  attendance,
  onGoToWarnings,
}) {
  const [importMode, setImportMode] = useState('json')
  const [jsonText, setJsonText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [highAccuracy, setHighAccuracy] = useState(false)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState(emptyMeta)
  const [students, setStudents] = useState([])
  const [previewUrl, setPreviewUrl] = useState(null)
  const [saved, setSaved] = useState(false)
  const [savedCount, setSavedCount] = useState({ total: 0, absent: 0 })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [confirmSummary, setConfirmSummary] = useState(null)

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
  }, [])

  function handleParseJson() {
    setError('')
    setSaved(false)
    try {
      const parsed = parseAttendanceJson(jsonText)
      applyParsed(parsed)
    } catch (e) {
      setError(e.message || 'Failed to parse JSON.')
      setStudents([])
    }
  }

  function handleJsonFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setJsonText(String(reader.result || ''))
      setError('')
    }
    reader.onerror = () => setError('Could not read JSON file.')
    reader.readAsText(file)
  }

  async function processImage(source) {
    setProcessing(true)
    setOcrProgress(0)
    setError('')
    setSaved(false)
    try {
      const parsed = await parseAttendanceScreenshot(source, setOcrProgress, {
        highAccuracy,
      })
      applyParsed(parsed)
    } catch (e) {
      setError(e.message || 'Failed to read screenshot.')
    } finally {
      setProcessing(false)
    }
  }

  async function handleImageFile(file) {
    if (!file?.type.startsWith('image/')) {
      setError('Please upload an image file.')
      return
    }
    const dataUrl = await fileToDataUrl(file)
    setPreviewUrl(dataUrl)
    await processImage(dataUrl)
  }

  useEffect(() => {
    if (importMode !== 'screenshot') return
    function onPaste(e) {
      const item = [...(e.clipboardData?.items || [])].find((i) =>
        i.type.startsWith('image/'),
      )
      if (!item) return
      e.preventDefault()
      const file = item.getAsFile()
      if (file) handleImageFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [importMode, highAccuracy])

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
    setConfirmOpen(false)
    setPendingImport(null)
    setConfirmSummary(null)
  }

  async function handleSave(e) {
    e.preventDefault()
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
      setConfirmOpen(true)
      return
    }
    try {
      await commitImport(payload)
    } catch {
      setError('Failed to save attendance. Check your connection and try again.')
    }
  }

  function handleImportAnother() {
    setSaved(false)
    setMeta(emptyMeta)
    setStudents([])
    setPreviewUrl(null)
    setJsonText('')
    setError('')
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

  if (saved) {
    return (
      <SaveSuccess
        meta={meta}
        classLabel={classLabel}
        savedCount={savedCount}
        onGoToWarnings={onGoToWarnings}
        onImportAnother={handleImportAnother}
      />
    )
  }

  return (
    <section className="panel portal-panel">
      <header className="panel-header">
        <h2>Record attendance</h2>
        <p className="panel-desc">
          Import from JSON (recommended) or use a screenshot with OCR.
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
          Screenshot (OCR)
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
            onChange={(e) => setJsonText(e.target.value)}
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
          {!processing ? (
            <div
              className="drop-zone"
              onDragOver={(e) => {
                e.preventDefault()
                e.currentTarget.classList.add('drop-zone-active')
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove('drop-zone-active')}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('drop-zone-active')
                handleImageFile(e.dataTransfer.files?.[0])
              }}
            >
              <input
                type="file"
                accept="image/*"
                id="screenshot-file"
                className="sr-only"
                onChange={(e) => {
                  handleImageFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <label htmlFor="screenshot-file" className="drop-zone-label">
                <strong>Click to choose</strong> or drag an image here
                <br />
                <span className="muted">Or paste screenshot (Ctrl+V)</span>
              </label>
            </div>
          ) : (
            <OcrSpinner progress={ocrProgress} />
          )}
          <div className="import-options">
            <label className="notice-inline">
              <input
                type="checkbox"
                checked={highAccuracy}
                onChange={(e) => setHighAccuracy(e.target.checked)}
              />
              High accuracy OCR (slower)
            </label>
          </div>
        </>
      )}

      {error && <p className="error-banner">{error}</p>}

      {students.length > 0 && !processing && (
        <>
          {previewUrl && (
            <figure className="screenshot-preview">
              <img src={previewUrl} alt="Screenshot preview" />
            </figure>
          )}

          <form className="portal-form" onSubmit={handleSave}>
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
              <span className="muted">Checked = present · Unchecked = absent</span>
            </div>

            <ol className="portal-student-list">
              {students.map((row) => (
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

            <p className="muted summary-line">
              {formatDateLabel(meta.date)} · {students.length} students ·{' '}
              <strong>{students.filter((s) => !s.present).length} absent</strong>
            </p>

            <button type="submit" className="btn btn-primary btn-submit">
              Save daily attendance
            </button>
          </form>
        </>
      )}

      <ConfirmOverwriteModal
        open={confirmOpen}
        summary={confirmSummary}
        onCancel={() => {
          setConfirmOpen(false)
          setPendingImport(null)
          setConfirmSummary(null)
        }}
        onConfirm={async () => {
          if (pendingImport) {
            try {
              await commitImport(pendingImport)
            } catch {
              setError('Failed to save attendance. Check your connection and try again.')
            }
          }
        }}
      />
    </section>
  )
}
