import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Progress,
  Result,
  Row,
  Col,
  Space,
  Table,
  Tag,
  Modal,
  Tabs,
  Typography,
  Upload,
} from 'antd'
import { ExclamationCircleFilled } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { formatSimilarityPercent } from '../utils/nameMatching'
import { useAutoDismiss } from '../hooks/useAutoDismiss'
import { useReportTabActivity } from '../hooks/useReportTabActivity'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import { formatClassLabel } from '../utils/classFormat'
import { dateKey, formatDateLabel } from '../utils/dates'
import {
  buildImportPayload,
  computeImportSaveSummary,
} from '../utils/importReview'
import {
  cancelOcrJob,
  consumeOcrResult,
  runOcrJob,
  subscribeOcr,
} from '../utils/ocrSession'
import { UI } from '../utils/uiCopy'
import {
  fileToDataUrl,
  isVisionLlmConfigured,
  checkVisionLlmConnection,
  isLocalVisionSetup,
  prewarmVisionModel,
} from '../utils/parseScreenshot'
import { buildPortalJson, parseAttendanceJson } from '../utils/parseAttendanceJson'
import {
  enrichImportStudentsWithRoster,
  hasUnresolvedSimilarNames,
  linkImportRowToRoster,
  markImportRowAsNewStudent,
  countSimilarPending,
  polishImportRow,
  needsSimilarReviewWarning,
  shouldShowRosterNameReplacement,
  topSimilarityScore,
} from '../utils/importNameResolution'
import ImportSaveConfirmModal from './ImportSaveConfirmModal'
import SimilarNameResolveModal from './SimilarNameResolveModal'
import BackButton from './BackButton'
import PanelChrome from './PanelChrome'
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

function ScanSpinner({ progress, stageLabel, elapsedSeconds = 0, progressStalled = false, onCancel }) {
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
        {progressStalled && (
          <Typography.Text type="warning" style={{ display: 'block', fontSize: '0.85rem' }}>
            Still working — large screenshots can take a minute with vision AI.
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
      title={UI.attendanceSaved}
      subTitle={
        <>
          <strong>{formatDateLabel(meta.date)}</strong>
          {classLabel && <> — {classLabel}</>}
        </>
      }
      extra={
        <div className="import-save-success-extra">
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {savedCount.total} {UI.learningPartners.toLowerCase()} ·{' '}
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
                {UI.viewDashboard}
              </Button>
            )}
            <Button onClick={onImportAnother}>{UI.importAnotherNow}</Button>
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
  const [reviewSource, setReviewSource] = useState(null)
  const [visionConnection, setVisionConnection] = useState(null)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState(emptyMeta)
  const [students, setStudents] = useState([])
  const [previewUrl, setPreviewUrl] = useState(null)
  const [saved, setSaved] = useState(false)
  const [savedCount, setSavedCount] = useState({ total: 0, absent: 0 })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [confirmSummary, setConfirmSummary] = useState(null)
  const [confirmError, setConfirmError] = useState('')
  const [saving, setSaving] = useState(false)
  const [parseMessage, setParseMessage] = useState('')
  const [jsonExportMessage, setJsonExportMessage] = useState('')
  const [resetCountdown, setResetCountdown] = useState(0)
  const [importView, setImportView] = useState('input')
  const [importWarnings, setImportWarnings] = useState([])
  const [lastScannedScreenshot, setLastScannedScreenshot] = useState(null)
  const [lastScanModalOpen, setLastScanModalOpen] = useState(false)
  const [similarModalKey, setSimilarModalKey] = useState(null)
  const savedRef = useRef(false)
  const screenshotSessionRef = useRef(null)

  const hasUnsavedDraft = useCallback(() => {
    return (
      students.length > 0 ||
      Boolean(jsonText.trim()) ||
      Boolean(pendingScreenshot) ||
      processing
    )
  }, [students.length, jsonText, pendingScreenshot, processing])

  const resetJsonImportReview = useCallback(() => {
    setStudents([])
    setMeta(emptyMeta)
    setParseMessage('')
    setJsonExportMessage('')
    setError('')
    setReviewSource(null)
    setImportWarnings([])
    setImportView('input')
  }, [])

  const snapshotScreenshotSession = useCallback(() => {
    const hasScreenshotWork =
      lastScannedScreenshot ||
      pendingScreenshot ||
      (reviewSource === 'screenshot' && students.length > 0)

    if (!hasScreenshotWork) {
      screenshotSessionRef.current = null
      return
    }

    screenshotSessionRef.current = {
      students,
      meta,
      importView,
      importWarnings,
      parseMessage,
      reviewSource,
      lastScannedScreenshot,
      pendingScreenshot,
      previewUrl,
      portalJson: reviewSource === 'screenshot' ? jsonText : '',
    }
  }, [
    students,
    meta,
    importView,
    importWarnings,
    parseMessage,
    reviewSource,
    lastScannedScreenshot,
    pendingScreenshot,
    previewUrl,
    jsonText,
  ])

  const restoreScreenshotSession = useCallback(() => {
    const snap = screenshotSessionRef.current
    if (!snap) return

    setStudents(snap.students ?? [])
    setMeta(snap.meta ?? emptyMeta)
    setImportView(snap.importView ?? 'input')
    setImportWarnings(snap.importWarnings ?? [])
    setParseMessage(snap.parseMessage ?? '')
    setReviewSource(snap.reviewSource ?? null)
    setLastScannedScreenshot(snap.lastScannedScreenshot ?? null)
    setPendingScreenshot(snap.pendingScreenshot ?? null)
    setPreviewUrl(snap.previewUrl ?? null)
    setError('')
  }, [])

  const clearScreenshotSession = useCallback(() => {
    screenshotSessionRef.current = null
    setLastScannedScreenshot(null)
    setPendingScreenshot(null)
    setPreviewUrl(null)
    setStudents([])
    setMeta(emptyMeta)
    setImportView('input')
    setReviewSource(null)
    setImportWarnings([])
    setParseMessage('')
    setError('')
    setLastScanModalOpen(false)
  }, [])

  const handleImportModeChange = useCallback(
    (mode) => {
      if (mode === importMode) return

      if (importMode === 'screenshot') {
        snapshotScreenshotSession()
      }

      resetJsonImportReview()

      if (mode === 'json') {
        setPendingScreenshot(null)
        setPreviewUrl(null)
        setLastScannedScreenshot(null)
        setLastScanModalOpen(false)
        if (importMode === 'screenshot') {
          setJsonText('')
        }
      } else {
        restoreScreenshotSession()
      }

      setImportMode(mode)
    },
    [
      importMode,
      snapshotScreenshotSession,
      resetJsonImportReview,
      restoreScreenshotSession,
    ],
  )

  const backFromReview = useCallback(() => {
    if (reviewSource === 'json') {
      resetJsonImportReview()
      return
    }
    setImportView('input')
    setError('')
  }, [reviewSource, resetJsonImportReview])

  const resetToFreshForm = useCallback(() => {
    savedRef.current = false
    setSaved(false)
    setResetCountdown(0)
    setMeta(emptyMeta)
    setStudents([])
    setPreviewUrl(null)
    setPendingScreenshot(null)
    setLastScannedScreenshot(null)
    setLastScanModalOpen(false)
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
    setReviewSource(null)
    setImportWarnings([])
    screenshotSessionRef.current = null
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

  const applyParsed = useCallback(
    (parsed, source = 'json') => {
      const cm = parsed.meta.classMeta
      const nextMeta = {
        intake: cm?.intake ?? '',
        level: cm?.level ?? '',
        qualification: cm?.qualification ?? parsed.meta.classLabel ?? '',
        group: cm?.group ?? '',
        date: parsed.meta.date || dateKey(),
        module: parsed.meta.module || '',
        startTime: parsed.meta.startTime || '',
        duration: parsed.meta.duration || '',
      }
      const enriched = enrichImportStudentsWithRoster(parsed.students, classes, nextMeta)
      const pendingSimilar = countSimilarPending(enriched)
      const warnings = parsed.warnings ?? []
      const missingClass = warnings.includes('missing_class')
      const count = parsed.students.length
      const studentWord = `${count} ${UI.learningPartner.toLowerCase()}${count === 1 ? '' : 's'}`

      setMeta(nextMeta)
      setStudents(
        [...enriched].sort((a, b) => a.name.localeCompare(b.name)).map(polishImportRow),
      )
      if (parsed.previewUrl) setPreviewUrl(parsed.previewUrl)
      if (source === 'screenshot' && parsed.previewUrl) {
        setLastScannedScreenshot(parsed.previewUrl)
      }
      setError('')
      setReviewSource(source)
      setImportWarnings(warnings)

      let message = ''
      if (pendingSimilar > 0) {
        message = `${source === 'screenshot' ? 'Scanned' : 'Parsed'} ${studentWord}. ${pendingSimilar} name${pendingSimilar === 1 ? '' : 's'} under 95% match need Review in the table.`
      } else if (missingClass && source === 'screenshot') {
        message = `Scanned ${studentWord}. Class header was not detected — fill Intake, Level, Group, and Programme below before saving.`
      } else if (source === 'screenshot') {
        message = `Scanned ${studentWord}. Review attendance in the table below, then save.`
      } else {
        message = `Parsed ${studentWord}. Review details below, then save.`
      }
      if (warnings.includes('missing_date') && source === 'screenshot') {
        message += ' Date was not detected — confirm the session date below.'
      }

      setParseMessage(message)
      setImportView('review')
    },
    [classes],
  )

  const applyFromExtractedJson = useCallback(
    (jsonRaw, source, { previewUrl } = {}) => {
      const parsed = parseAttendanceJson(jsonRaw, {
        lenient: source === 'screenshot',
        repairSession: source === 'screenshot',
      })
      applyParsed({ ...parsed, previewUrl }, source)
    },
    [applyParsed],
  )

  const finishScreenshotScan = useCallback(
    (result) => {
      if (!result) return

      if (result.portalJson) {
        setJsonText(result.portalJson)
        try {
          applyFromExtractedJson(result.portalJson, 'screenshot', {
            previewUrl: result.previewUrl,
          })
          return
        } catch (e) {
          setError(e.message || 'Failed to parse extracted JSON.')
          setStudents([])
          setImportView('input')
          return
        }
      }

      applyParsed(result, 'screenshot')
    },
    [applyFromExtractedJson, applyParsed],
  )

  useEffect(() => {
    if (importView !== 'review' || !students.length) return

    setStudents((current) => {
      const base = current.map((row) => ({
        index: row.index,
        name: row.importName || row.name,
        present: row.present,
      }))
      const enriched = enrichImportStudentsWithRoster(base, classes, meta)

      return enriched.map((fresh) => {
        const prev = current.find(
          (p) =>
            p.index === fresh.index &&
            (p.importName || p.name) === (fresh.importName || fresh.name),
        )
        if (prev?.matchStatus === 'exact' || prev?.matchStatus === 'new') {
          return prev
        }
        if (prev?.matchStatus === 'linked_roster') {
          return polishImportRow(prev)
        }
        return fresh
      }).map(polishImportRow)
    })
  }, [meta.intake, meta.level, meta.group, meta.qualification, classes, importView])

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

      const leftover = consumeOcrResult()
      if (leftover) finishScreenshotScan(leftover)
      setProcessing(false)
    })
  }, [finishScreenshotScan])

  useEffect(() => {
    if (importMode === 'screenshot') {
      setTimeout(() => pasteZoneRef.current?.focus(), 50)
    }
  }, [importMode])

  useEffect(() => {
    if (importMode !== 'screenshot' || !isVisionLlmConfigured()) {
      setVisionConnection(null)
      return undefined
    }

    let cancelled = false
    checkVisionLlmConnection().then((result) => {
      if (!cancelled) setVisionConnection(result)
      if (!cancelled && result?.ok) prewarmVisionModel()
    })

    return () => {
      cancelled = true
    }
  }, [importMode])

  const stageScreenshot = useCallback(async (file) => {
    if (!file?.type.startsWith('image/')) {
      setError('Please use an image file (PNG, JPG, etc.).')
      return
    }
    const dataUrl = await fileToDataUrl(file)
    clearScreenshotSession()
    setPendingScreenshot(dataUrl)
    setPreviewUrl(dataUrl)
    setSaved(false)
  }, [clearScreenshotSession])

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
    if (!students.length) {
      setPreviewUrl(null)
    }
    setError('')
  }

  function handleParseJson() {
    setError('')
    setParseMessage('')
    setSaved(false)
    screenshotSessionRef.current = null
    try {
      applyFromExtractedJson(jsonText, 'json')
    } catch (e) {
      setError(e.message || 'Failed to parse JSON.')
      resetJsonImportReview()
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
    setProcessing(true)
    setOcrElapsedSeconds(0)
    setOcrProgressStalled(false)
    ocrStartedAtRef.current = Date.now()
    ocrProgressAtRef.current = Date.now()
    setError('')
    setParseMessage('')
    setSaved(false)
    try {
      const result = await runOcrJob(source, ({ progress, label }) => {
        setOcrProgress(progress)
        setOcrStageLabel(label)
        ocrProgressAtRef.current = Date.now()
        setOcrProgressStalled(false)
      })
      finishScreenshotScan(result)
      consumeOcrResult()
    } catch (e) {
      setError(e.message || 'Failed to read screenshot.')
      consumeOcrResult()
    } finally {
      setProcessing(false)
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

  function togglePresent(importName) {
    setStudents((rows) =>
      rows.map((r) =>
        (r.importName || r.name) === importName ? { ...r, present: !r.present } : r,
      ),
    )
  }

  function importRowKey(row) {
    return `${row.index}-${row.importName || row.name}`
  }

  function openSimilarModal(row) {
    setSimilarModalKey(importRowKey(row))
  }

  function handleLinkSimilarRow(row, candidate) {
    setStudents((rows) =>
      rows.map((r) =>
        (r.importName || r.name) === (row.importName || row.name)
          ? linkImportRowToRoster(r, candidate)
          : r,
      ),
    )
    setSimilarModalKey(null)
    setError('')
  }

  function handleMarkSimilarRowAsNew(row) {
    setStudents((rows) =>
      rows.map((r) =>
        (r.importName || r.name) === (row.importName || row.name)
          ? markImportRowAsNewStudent(r)
          : r,
      ),
    )
    setSimilarModalKey(null)
    setError('')
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
    setPendingImport(null)
    setConfirmSummary(null)
    setConfirmError('')
  }

  async function handleSave(e) {
    e.preventDefault()
    if (saving) return
    if (!students.length) {
      setError(`No ${UI.learningPartners.toLowerCase()} to save.`)
      return
    }
    if (hasUnresolvedSimilarNames(students)) {
      setError(
        `Resolve similar ${UI.learningPartner.toLowerCase()} names in the table before saving.`,
      )
      return
    }

    const payload = buildImportPayload(meta, students)
    if (!payload.classMeta.qualification && !payload.classMeta.intake) {
      setError('Class details are required.')
      return
    }

    const summary = computeImportSaveSummary(payload, classes, attendance)
    setPendingImport(payload)
    setConfirmSummary(summary)
    setConfirmError('')
    setConfirmOpen(true)
  }

  async function handleConfirmSaveImport() {
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

  const visionReady = isVisionLlmConfigured() && visionConnection?.ok !== false

  const similarPendingCount = countSimilarPending(students)

  const similarModalRow = useMemo(() => {
    if (!similarModalKey) return null
    return students.find((r) => importRowKey(r) === similarModalKey) ?? null
  }, [similarModalKey, students])

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
          <BackButton onClick={backFromReview}>{backToInputLabel}</BackButton>
        </div>
      )}

      <PanelChrome
        title="Record Attendance"
        description={
          <span>
            Use <strong>Screenshot</strong> for vision AI import, or <strong>JSON</strong> to paste
            portal export manually if a scan fails.
          </span>
        }
      />

      {showReview && parseMessage && (
        <Alert
          type="success"
          showIcon
          className="import-alert-banner"
          title={parseMessage}
        />
      )}

      <div className="import-workspace">
      {showImportInput && (
      <div className="import-mode-region">
      <Tabs
        activeKey={importMode}
        onChange={handleImportModeChange}
        items={[
          { key: 'json', label: 'JSON' },
          { key: 'screenshot', label: 'Screenshot' },
        ]}
        className="import-tabs"
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
        <div className="import-screenshot-panel">
          {isVisionLlmConfigured() ? (
            visionConnection?.ok === false ? (
              <Alert
                type="error"
                showIcon
                className="import-alert-banner"
                title="Ollama is not reachable"
                description={visionConnection.message}
              />
            ) : (
              <Alert
                type="success"
                showIcon
                className="import-alert-banner"
                title="Vision AI ready — full screenshot scan (class, names, checkboxes)."
                description={
                  visionConnection?.ok
                    ? isLocalVisionSetup()
                      ? 'Paste your screenshot and scan. First scan may take a minute on CPU — keep this tab open so the model stays loaded. For fastest import, paste Copilot JSON on the JSON tab.'
                      : 'Paste your portal screenshot and click Scan screenshot. Attendance opens in the review table (same as JSON import).'
                    : 'Checking connection to Ollama…'
                }
              />
            )
          ) : (
            <Alert
              type="warning"
              showIcon
              className="import-alert-banner"
              title="Vision AI is not configured."
              description={
                <>
                  Add <code>VITE_VISION_LLM_*</code> to your <code>.env</code> file. For free local
                  scanning, install Ollama and run <code>ollama pull qwen2.5vl:7b</code> (see{' '}
                  <code>.env.example</code>).
                </>
              }
            />
          )}

          {!processing ? (
            <>
              {reviewSource === 'screenshot' &&
                students.length > 0 &&
                importView === 'input' && (
                  <Alert
                    type="info"
                    showIcon
                    className="import-alert-banner import-alert-with-action"
                    title={`Screenshot scan review — ${students.length} student${students.length === 1 ? '' : 's'}`}
                    action={
                      <Button size="small" type="primary" onClick={() => setImportView('review')}>
                        Continue review
                      </Button>
                    }
                  />
                )}

              {lastScannedScreenshot && (
                <div className="import-screenshot-toolbar">
                  <Button onClick={() => setLastScanModalOpen(true)}>View last scanned screenshot</Button>
                  {!pendingScreenshot && (
                    <Typography.Text type="secondary" className="import-screenshot-hint">
                      Pasting a new image replaces this scan and clears review data.
                    </Typography.Text>
                  )}
                </div>
              )}

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
                <Button type="primary" disabled={!pendingScreenshot || !visionReady} onClick={handleScanScreenshot}>
                  Scan screenshot
                </Button>
                {pendingScreenshot && <Button type="link" onClick={clearPendingScreenshot}>Clear</Button>}
              </Space>
            </>
          ) : (
            <ScanSpinner
              progress={ocrProgress}
              stageLabel={ocrStageLabel}
              elapsedSeconds={ocrElapsedSeconds}
              progressStalled={ocrProgressStalled}
              onCancel={handleCancelOcr}
            />
          )}
        </div>
      )}
      </div>
      )}

      {showImportInput && (error || (parseMessage && !error)) && (
        <div className="import-status-stack">
          {error && <Alert type="error" showIcon className="import-alert-banner" title={error} />}
          {parseMessage && !error && (
            <Alert type="success" showIcon className="import-alert-banner" title={parseMessage} />
          )}
        </div>
      )}

      {showReview && (
        <>
          <SaveFieldOverlay busy={saving} label="Saving attendance…" className="import-review-overlay">
            <form className="portal-form import-review-form" onSubmit={handleSave}>
              <fieldset className="portal-form-fields import-review-fields" disabled={saving}>
                <div className="import-review-toolbar">
                  {importWarnings.includes('missing_class') && (
                    <Alert
                      type="warning"
                      showIcon
                      className="import-alert-banner"
                      title="Class header not detected from screenshot"
                      description="The scan could not read the INTAKE / LEVEL / GROUP line. Enter those fields below before saving."
                    />
                  )}

                  <Alert
                    type="info"
                    showIcon={false}
                    className="import-alert-banner import-alert-class-summary"
                    title={
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
                    {reviewSource === 'screenshot' && lastScannedScreenshot && (
                      <Button onClick={() => setLastScanModalOpen(true)}>
                        View screenshot
                      </Button>
                    )}
                    <Button onClick={handleCopyJson}>Copy as JSON</Button>
                    <Button onClick={handleDownloadJson}>Download JSON</Button>
                  </Space>
                  <Typography.Text type="secondary" className="import-review-hint">
                    Checked = present · Unchecked = absent
                  </Typography.Text>
                  {jsonExportMessage && (
                    <Alert
                      type="success"
                      showIcon
                      className="import-alert-banner"
                      title={jsonExportMessage}
                    />
                  )}
                </div>

                <div className="table-scroll-region portal-student-list-scroll" ref={studentTableRef}>
                  {similarPendingCount > 0 && (
                    <Alert
                      type="warning"
                      showIcon
                      className="import-similar-notice import-alert-banner"
                      title={`${similarPendingCount} name${similarPendingCount === 1 ? '' : 's'} under 95% match — click Review in the table to confirm`}
                    />
                  )}

                  <Table
                    size="small"
                    pagination={{ pageSize: 30, showSizeChanger: false, hideOnSinglePage: true }}
                    scroll={{ y: studentTableHeight }}
                    rowClassName={(row) =>
                      needsSimilarReviewWarning(row) ? 'import-row-similar-pending' : ''
                    }
                    dataSource={students.map((row) => ({
                      key: `${row.index}-${row.importName || row.name}`,
                      ...row,
                    }))}
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
                            onChange={() => togglePresent(row.importName || row.name)}
                          />
                        ),
                      },
                      {
                        title: UI.learningPartner,
                        key: 'name',
                        ellipsis: true,
                        render: (_, row) => {
                          if (shouldShowRosterNameReplacement(row)) {
                            return (
                              <>
                                <Typography.Text type="secondary" delete style={{ display: 'block' }}>
                                  {row.importName}
                                </Typography.Text>
                                <Typography.Text strong>{row.name}</Typography.Text>
                              </>
                            )
                          }

                          if (needsSimilarReviewWarning(row)) {
                            const score = topSimilarityScore(row)
                            return (
                              <button
                                type="button"
                                className="import-similar-name-trigger"
                                onClick={() => openSimilarModal(row)}
                                title="Review roster match"
                              >
                                <ExclamationCircleFilled aria-hidden />
                                <span className="import-similar-name-text">{row.name}</span>
                                <Typography.Text type="secondary" className="import-similar-score">
                                  {formatSimilarityPercent(score)}
                                </Typography.Text>
                              </button>
                            )
                          }

                          return <Typography.Text>{row.name}</Typography.Text>
                        },
                      },
                      {
                        title: 'Match',
                        key: 'match',
                        width: 120,
                        render: (_, row) => {
                          if (needsSimilarReviewWarning(row)) {
                            return (
                              <Tag
                                color="warning"
                                className="import-similar-match-tag import-similar-match-tag-review"
                                onClick={() => openSimilarModal(row)}
                              >
                                Review
                              </Tag>
                            )
                          }
                          if (shouldShowRosterNameReplacement(row)) {
                            return <Tag color="processing">Roster</Tag>
                          }
                          if (row.matchStatus === 'exact' || row.matchStatus === 'linked_roster') {
                            return <Tag color="success">Exact</Tag>
                          }
                          if (row.matchStatus === 'new') {
                            return <Tag>New</Tag>
                          }
                          return null
                        },
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
                  {similarPendingCount > 0 ? (
                    <> · {similarPendingCount} similar name{similarPendingCount === 1 ? '' : 's'} pending</>
                  ) : null}
                </Typography.Paragraph>

                <Button
                  type="primary"
                  htmlType="submit"
                  loading={saving}
                  disabled={similarPendingCount > 0}
                  block
                >
                  {UI.saveDailyAttendance}
                </Button>
              </fieldset>
            </form>
          </SaveFieldOverlay>
        </>
      )}
      </div>

      <SimilarNameResolveModal
        open={Boolean(similarModalKey && similarModalRow?.matchStatus === 'similar_pending')}
        row={similarModalRow?.matchStatus === 'similar_pending' ? similarModalRow : null}
        onClose={() => setSimilarModalKey(null)}
        onLinkRoster={handleLinkSimilarRow}
        onMarkNew={handleMarkSimilarRowAsNew}
      />

      <ImportSaveConfirmModal
        open={confirmOpen}
        summary={confirmSummary}
        pendingImport={pendingImport}
        error={confirmError}
        busy={saving}
        onCancel={() => {
          if (saving) return
          setConfirmOpen(false)
          setPendingImport(null)
          setConfirmSummary(null)
          setConfirmError('')
        }}
        onConfirm={handleConfirmSaveImport}
      />

      <Modal
        title="Last scanned screenshot"
        open={lastScanModalOpen}
        onCancel={() => setLastScanModalOpen(false)}
        footer={
          <Button type="primary" onClick={() => setLastScanModalOpen(false)}>
            Close
          </Button>
        }
        width="min(920px, 96vw)"
        destroyOnHidden
        className="last-scan-modal"
      >
        {lastScannedScreenshot ? (
          <img
            src={lastScannedScreenshot}
            alt="Last scanned attendance screenshot"
            className="last-scan-modal-img"
          />
        ) : (
          <Empty description="No screenshot saved" />
        )}
      </Modal>
    </section>
  )
}
