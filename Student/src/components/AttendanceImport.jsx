import {
  Button,
  Checkbox,
  Empty,
  Input,
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
import { createElement, useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useAppNotifier } from '../hooks/useAppNotifier'
import { NOTIFIER_KEYS } from '../utils/appNotifications'
import { formatSimilarityPercent } from '../utils/nameMatching'
import { useReportTabActivity } from '../hooks/useReportTabActivity'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import { formatClassLabel, syncPartTimeFromClassLabel } from '../utils/classFormat'
import { dateKey, formatDateLabel } from '../utils/dates'
import { buildAttendanceLogFromSummary } from '../utils/activityLog'
import {
  buildImportPayload,
  buildImportRosterPreviews,
  computeImportSaveSummary,
} from '../utils/importReview'
import {
  cancelOcrJob,
  consumeOcrResult,
  runOcrJob,
  subscribeOcr,
} from '../utils/ocrSession'
import {
  applyImportMetaChange,
  copyImportMeta,
  reEnrichImportStudents,
} from '../utils/importMetaApply'
import { filterByNameSearch } from '../utils/tableNameSearch'
import { UI, formatLpCount } from '../utils/uiCopy'
import ImportReviewTableSummary from './ImportReviewTableSummary'
import TableNameSearch from './TableNameSearch'
import BulkScreenshotImport from './BulkScreenshotImport'
import {
  clearAllImportDraftSessions,
  clearJsonImportSession,
  clearScreenshotImportSession,
  loadJsonImportSession,
  loadScreenshotImportSession,
  saveJsonImportSession,
  saveScreenshotImportSession,
} from '../utils/importDraftSession.js'
import {
  confirmImportNavigationLeave,
  getImportTabActivity,
} from '../utils/importDraftGuard.jsx'
import {
  hasJsonImportDraft,
  hasScreenshotImportDraft,
} from '../utils/importDraftState.js'
import {
  fileToDataUrl,
  isVisionEngineConfigured,
  checkVisionLlmConnection,
  prewarmVisionModel,
  VISION_SCAN_ENGINE,
} from '../utils/parseScreenshot'
import { buildPortalJson, parseAttendanceJson } from '../utils/parseAttendanceJson'
import {
  enrichImportStudentsWithRoster,
  hasUnresolvedSimilarNames,
  linkImportRowToRoster,
  markImportRowAsNewStudent,
  mergeImportEnrichmentWithResolved,
  countSimilarPending,
  polishImportRow,
  needsSimilarReviewWarning,
  shouldShowRosterNameReplacement,
  topSimilarityScore,
} from '../utils/importNameResolution'
import ImportSessionMetaFields from './ImportSessionMetaFields'
import ImportSaveConfirmModal from './ImportSaveConfirmModal'
import SimilarNameResolveModal from './SimilarNameResolveModal'
import BackButton from './BackButton'
import ImportScanEngineSwitch from './ImportScanEngineSwitch'
import ImportTabInfoTip from './ImportTabInfoTip'
import PanelChrome from './PanelChrome'
import SaveFieldOverlay from './SaveFieldOverlay'
import { IMPORT_TAB_TIPS } from '../utils/importTabTips'
import {
  loadStoredScreenshotEngine,
  storeScreenshotEngine,
} from '../utils/screenshotEnginePreference'

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

const SUCCESS_RESET_SECONDS = 5

export default function AttendanceImport({
  importPortalSession,
  recordAction,
  classes,
  attendance,
  isActive = true,
  onGoToWarnings,
  onTabActivityChange,
  navigationGuardRef,
}) {
  const [importMode, setImportMode] = useState('json')
  const bulkLeaveGuardRef = useRef(null)
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
  const [screenshotEngine, setScreenshotEngine] = useState(loadStoredScreenshotEngine)
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
  const [resetCountdown, setResetCountdown] = useState(0)
  const [importView, setImportView] = useState('input')
  const [importWarnings, setImportWarnings] = useState([])
  const [scannedMeta, setScannedMeta] = useState(null)
  const [scannedWarnings, setScannedWarnings] = useState([])
  const [lastScannedScreenshot, setLastScannedScreenshot] = useState(null)
  const [lastScanModalOpen, setLastScanModalOpen] = useState(false)
  const [similarModalKey, setSimilarModalKey] = useState(null)
  const [reviewNameSearch, setReviewNameSearch] = useState('')
  const [bulkPanelActivity, setBulkPanelActivity] = useState(null)
  const [jsonDraftRestored, setJsonDraftRestored] = useState(false)
  const [screenshotDraftRestored, setScreenshotDraftRestored] = useState(false)
  const savedRef = useRef(false)
  const savedNotifyRef = useRef(false)
  const jsonDraftNotifyRef = useRef(false)
  const screenshotDraftNotifyRef = useRef(false)
  const screenshotSessionRef = useRef(null)
  const jsonSessionRef = useRef(null)
  const notify = useAppNotifier()

  const jsonHasDraft = hasJsonImportDraft({
    jsonText,
    reviewSource,
    studentsLength: students.length,
  })
  const screenshotHasDraft = hasScreenshotImportDraft({
    pendingScreenshot,
    lastScannedScreenshot,
    reviewSource,
    studentsLength: students.length,
  })

  const hasUnsavedDraft = useCallback(() => {
    return jsonHasDraft || screenshotHasDraft || processing
  }, [jsonHasDraft, screenshotHasDraft, processing])

  useEffect(() => {
    const json = loadJsonImportSession()
    if (json) jsonSessionRef.current = json
    const shot = loadScreenshotImportSession()
    if (shot) screenshotSessionRef.current = shot
  }, [])

  const resetJsonImportReview = useCallback(() => {
    setStudents([])
    setMeta(emptyMeta)
    setParseMessage('')
    setError('')
    setReviewSource(null)
    setImportWarnings([])
    setScannedMeta(null)
    setScannedWarnings([])
    setImportView('input')
  }, [])

  const buildScreenshotSnapshot = useCallback(() => {
    if (!screenshotHasDraft) return null
    return {
      students,
      meta,
      importView,
      importWarnings,
      scannedMeta,
      scannedWarnings,
      parseMessage,
      reviewSource,
      lastScannedScreenshot,
      pendingScreenshot,
      previewUrl,
      portalJson: reviewSource === 'screenshot' ? jsonText : '',
    }
  }, [
    screenshotHasDraft,
    students,
    meta,
    importView,
    importWarnings,
    scannedMeta,
    scannedWarnings,
    parseMessage,
    reviewSource,
    lastScannedScreenshot,
    pendingScreenshot,
    previewUrl,
    jsonText,
  ])

  const snapshotScreenshotSession = useCallback(() => {
    const snap = buildScreenshotSnapshot()
    if (!snap) {
      screenshotSessionRef.current = null
      clearScreenshotImportSession()
      return
    }
    screenshotSessionRef.current = snap
    saveScreenshotImportSession(snap)
  }, [buildScreenshotSnapshot])

  const restoreScreenshotSession = useCallback(() => {
    const snap = screenshotSessionRef.current || loadScreenshotImportSession()
    if (!snap) return

    screenshotSessionRef.current = snap
    setStudents(snap.students ?? [])
    setMeta(snap.meta ?? emptyMeta)
    setImportView(snap.importView ?? 'input')
    setImportWarnings(snap.importWarnings ?? [])
    setScannedMeta(snap.scannedMeta ?? null)
    setScannedWarnings(snap.scannedWarnings ?? [])
    setParseMessage(snap.parseMessage ?? '')
    setReviewSource(snap.reviewSource ?? null)
    setLastScannedScreenshot(snap.lastScannedScreenshot ?? null)
    setPendingScreenshot(snap.pendingScreenshot ?? null)
    setPreviewUrl(snap.previewUrl ?? null)
    if (snap.portalJson) setJsonText(snap.portalJson)
    setError('')
    setScreenshotDraftRestored(true)
  }, [])

  const clearScreenshotSession = useCallback(() => {
    screenshotSessionRef.current = null
    clearScreenshotImportSession()
    setLastScannedScreenshot(null)
    setPendingScreenshot(null)
    setPreviewUrl(null)
    setStudents([])
    setMeta(emptyMeta)
    setImportView('input')
    setReviewSource(null)
    setImportWarnings([])
    setScannedMeta(null)
    setScannedWarnings([])
    setParseMessage('')
    setError('')
    setLastScanModalOpen(false)
    setScreenshotDraftRestored(false)
  }, [])

  const buildJsonSnapshot = useCallback(() => {
    if (!jsonHasDraft) return null
    return {
      jsonText,
      students: reviewSource === 'json' ? students : [],
      meta: reviewSource === 'json' ? meta : emptyMeta(),
      importView: reviewSource === 'json' ? importView : 'input',
      importWarnings: reviewSource === 'json' ? importWarnings : [],
      scannedMeta: reviewSource === 'json' ? scannedMeta : null,
      scannedWarnings: reviewSource === 'json' ? scannedWarnings : [],
      parseMessage: reviewSource === 'json' ? parseMessage : '',
      reviewSource: reviewSource === 'json' ? reviewSource : null,
    }
  }, [
    jsonHasDraft,
    jsonText,
    students,
    meta,
    importView,
    importWarnings,
    scannedMeta,
    scannedWarnings,
    parseMessage,
    reviewSource,
  ])

  const snapshotJsonSession = useCallback(() => {
    const snap = buildJsonSnapshot()
    if (!snap) {
      jsonSessionRef.current = null
      clearJsonImportSession()
      return
    }
    jsonSessionRef.current = snap
    saveJsonImportSession(snap)
  }, [buildJsonSnapshot])

  const restoreJsonSession = useCallback(() => {
    const snap = jsonSessionRef.current || loadJsonImportSession()
    if (!snap) return

    jsonSessionRef.current = snap
    setJsonText(snap.jsonText ?? '')
    setStudents(snap.students ?? [])
    setMeta(snap.meta ?? emptyMeta)
    setImportView(snap.importView ?? 'input')
    setImportWarnings(snap.importWarnings ?? [])
    setScannedMeta(snap.scannedMeta ?? null)
    setScannedWarnings(snap.scannedWarnings ?? [])
    setParseMessage(snap.parseMessage ?? '')
    setReviewSource(snap.reviewSource ?? null)
    setError('')
    setJsonDraftRestored(true)
  }, [])

  const clearJsonSession = useCallback(() => {
    jsonSessionRef.current = null
    clearJsonImportSession()
    setJsonText('')
    setJsonDraftRestored(false)
  }, [])

  const handleImportModeChange = useCallback(
    async (mode) => {
      if (mode === importMode) return

      const ok = await confirmImportNavigationLeave({
        fromMode: importMode,
        bulkLeaveGuard: bulkLeaveGuardRef.current,
        processing: importMode === 'screenshot' && processing,
        hasJsonDraft: importMode === 'json' && jsonHasDraft,
        hasScreenshotDraft: importMode === 'screenshot' && screenshotHasDraft,
      })
      if (!ok) return

      if (importMode === 'json') snapshotJsonSession()
      if (importMode === 'screenshot') snapshotScreenshotSession()

      resetJsonImportReview()

      if (mode === 'json') {
        setPendingScreenshot(null)
        setPreviewUrl(null)
        setLastScannedScreenshot(null)
        setLastScanModalOpen(false)
        restoreJsonSession()
      } else if (mode === 'screenshot') {
        setJsonText('')
        restoreScreenshotSession()
      } else {
        setJsonText('')
        setPendingScreenshot(null)
        setPreviewUrl(null)
        setLastScannedScreenshot(null)
        setLastScanModalOpen(false)
      }

      setImportMode(mode)
    },
    [
      importMode,
      processing,
      jsonHasDraft,
      screenshotHasDraft,
      snapshotJsonSession,
      snapshotScreenshotSession,
      resetJsonImportReview,
      restoreJsonSession,
      restoreScreenshotSession,
    ],
  )

  useEffect(() => {
    if (!navigationGuardRef) return undefined
    navigationGuardRef.current = async (targetTabId) => {
      if (targetTabId === 'import') return true
      return confirmImportNavigationLeave({
        fromMode: importMode,
        bulkLeaveGuard: bulkLeaveGuardRef.current,
        processing: importMode === 'screenshot' && processing,
        hasJsonDraft: importMode === 'json' && jsonHasDraft,
        hasScreenshotDraft: importMode === 'screenshot' && screenshotHasDraft,
      })
    }
    return () => {
      navigationGuardRef.current = null
    }
  }, [
    navigationGuardRef,
    importMode,
    processing,
    jsonHasDraft,
    screenshotHasDraft,
  ])

  useEffect(() => {
    if (importMode !== 'json') return undefined
    const t = setTimeout(() => {
      if (jsonHasDraft) {
        const snap = buildJsonSnapshot()
        if (snap) {
          jsonSessionRef.current = snap
          saveJsonImportSession(snap)
        }
      } else {
        clearJsonImportSession()
      }
    }, 400)
    return () => clearTimeout(t)
  }, [
    importMode,
    jsonHasDraft,
    buildJsonSnapshot,
    jsonText,
    students,
    meta,
    importView,
    importWarnings,
    parseMessage,
    reviewSource,
  ])

  useEffect(() => {
    if (importMode !== 'screenshot') return undefined
    const t = setTimeout(() => {
      if (screenshotHasDraft) {
        snapshotScreenshotSession()
      } else {
        clearScreenshotImportSession()
      }
    }, 400)
    return () => clearTimeout(t)
  }, [
    importMode,
    screenshotHasDraft,
    snapshotScreenshotSession,
    students,
    meta,
    importView,
    pendingScreenshot,
    lastScannedScreenshot,
    previewUrl,
    reviewSource,
  ])

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
    setImportMode('json')
    setImportView('input')
    setConfirmOpen(false)
    setPendingImport(null)
    setConfirmSummary(null)
    setConfirmError('')
    setReviewSource(null)
    setImportWarnings([])
    setScannedMeta(null)
    setScannedWarnings([])
    screenshotSessionRef.current = null
    jsonSessionRef.current = null
    clearAllImportDraftSessions()
    setJsonDraftRestored(false)
    setScreenshotDraftRestored(false)
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

  useEffect(() => {
    if (!error) return
    notify.error({
      key: NOTIFIER_KEYS.importError,
      title: error,
      duration: 8,
    })
  }, [error, notify])

  useEffect(() => {
    if (!jsonDraftRestored || !jsonHasDraft || jsonDraftNotifyRef.current) return
    jsonDraftNotifyRef.current = true
    notify.draft({
      key: NOTIFIER_KEYS.importDraftJson,
      title: 'JSON draft restored',
      description:
        'Your pasted JSON and review data from this browser session were loaded. Save to your roster when review is complete.',
      onClose: () => setJsonDraftRestored(false),
    })
  }, [jsonDraftRestored, jsonHasDraft, notify])

  useEffect(() => {
    if (!screenshotDraftRestored || !screenshotHasDraft || screenshotDraftNotifyRef.current) return
    screenshotDraftNotifyRef.current = true
    notify.draft({
      key: NOTIFIER_KEYS.importDraftScreenshot,
      title: 'Screenshot draft restored',
      description:
        'Your screenshot preview and scan review from this browser session were loaded. Save to your roster when review is complete.',
      onClose: () => setScreenshotDraftRestored(false),
    })
  }, [screenshotDraftRestored, screenshotHasDraft, notify])

  const applyParsed = useCallback(
    (parsed, source = 'json') => {
      const cm = parsed.meta.classMeta
      const nextMeta = syncPartTimeFromClassLabel(
        {
          intake: cm?.intake ?? '',
          level: cm?.level ?? '',
          qualification: cm?.qualification ?? parsed.meta.classLabel ?? '',
          group: cm?.group ?? '',
          date: parsed.meta.date || dateKey(),
          module: parsed.meta.module || '',
          startTime: parsed.meta.startTime || '',
          duration: parsed.meta.duration || '',
        },
        parsed.meta.classLabel ?? '',
      )
      const enriched = enrichImportStudentsWithRoster(parsed.students, classes, nextMeta)
      const pendingSimilar = countSimilarPending(enriched)
      const warnings = parsed.warnings ?? []
      const missingClass = warnings.includes('missing_class')
      const count = parsed.students.length
      const studentWord = formatLpCount(count)

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
      setScannedMeta(copyImportMeta(nextMeta))
      setScannedWarnings([...warnings])

      let message = ''
      if (pendingSimilar > 0) {
        message = `${source === 'screenshot' ? 'Scanned' : 'Parsed'} ${studentWord}. ${pendingSimilar} name${pendingSimilar === 1 ? '' : 's'} under 95% match need review in the table.`
      } else if (missingClass && source === 'screenshot') {
        message = `Scanned ${studentWord}. Class header was not detected — fill Intake, Level, Group, and Programme below before saving.`
      } else if (warnings.includes('missing_module') && source === 'screenshot') {
        message = `Scanned ${studentWord}. Module not detected — enter the module/subject line before saving.`
      } else if (source === 'screenshot') {
        message = `Scanned ${studentWord}. Review attendance in the table below, then save.`
      } else {
        message = `Parsed ${studentWord}. Review details below, then save.`
      }
      if (warnings.includes('missing_date') && source === 'screenshot') {
        message += ' Date was not detected — confirm the session date below.'
      }

      setParseMessage(message)
      notify.success({
        key: NOTIFIER_KEYS.importParse,
        title: message,
      })
      setImportView('review')
    },
    [classes, notify],
  )

  const applyMetaPatch = useCallback(
    (patch) => {
      const result = applyImportMetaChange({
        currentMeta: meta,
        patch,
        classes,
        students,
        warnings: importWarnings,
      })
      if (!result.ok) {
        notify.error({
          key: 'import-meta-class-match',
          title: 'No matching class found',
          description: result.error,
          duration: 8,
        })
        return false
      }

      setMeta(result.nextMeta)
      setStudents(result.nextStudents)
      setImportWarnings(result.nextWarnings)

      if (result.classMatched && result.matchedClassLabel) {
        notify.success({
          key: 'import-meta-class-match',
          title: 'Class matched',
          description: `${result.matchedClassLabel} — Learning Partner list updated for review.`,
          duration: 5,
        })
      }
      return true
    },
    [meta, classes, students, importWarnings, notify],
  )

  const patchMeta = useCallback(
    (field, value) => applyMetaPatch({ [field]: value }),
    [applyMetaPatch],
  )

  const revertToScannedMeta = useCallback(() => {
    if (!scannedMeta) return
    const restoredMeta = copyImportMeta(scannedMeta)
    setMeta(restoredMeta)
    setImportWarnings([...(scannedWarnings || [])])
    setStudents((current) => reEnrichImportStudents(current, restoredMeta, classes))
    notify.info({
      key: 'import-meta-revert',
      title: 'Session details restored',
      description: 'Reverted to values from the original scan.',
      duration: 4,
    })
  }, [scannedMeta, scannedWarnings, classes, notify])

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
      return mergeImportEnrichmentWithResolved(current, enriched)
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
    const usesVision = importMode === 'screenshot' || importMode === 'bulk-screenshots'
    if (!usesVision || !isVisionEngineConfigured(screenshotEngine)) {
      setVisionConnection(null)
      return undefined
    }

    let cancelled = false
    checkVisionLlmConnection(screenshotEngine).then((result) => {
      if (!cancelled) setVisionConnection(result)
      if (!cancelled && result?.ok && screenshotEngine === VISION_SCAN_ENGINE.local) {
        prewarmVisionModel(screenshotEngine)
      }
    })

    return () => {
      cancelled = true
    }
  }, [importMode, screenshotEngine])

  function handleScreenshotEngineChange(value) {
    setScreenshotEngine(value)
    storeScreenshotEngine(value)
  }

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
        setError(`Click the paste area below, then press Ctrl+V. Or use ${UI.chooseImage}.`)
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
      const result = await runOcrJob(
        source,
        ({ progress, label }) => {
          setOcrProgress(progress)
          setOcrStageLabel(label)
          ocrProgressAtRef.current = Date.now()
          setOcrProgressStalled(false)
        },
        { engine: screenshotEngine },
      )
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
    if (reviewSource === 'json') clearJsonSession()
    if (reviewSource === 'screenshot') clearScreenshotSession()
  }

  async function handleSave(e) {
    e.preventDefault()
    if (saving) return
    if (!students.length) {
      setError(`No ${UI.learningPartners} to save.`)
      return
    }
    if (hasUnresolvedSimilarNames(students)) {
      setError(
        `Resolve similar ${UI.learningPartner} names in the table before saving.`,
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
    const summaryForLog = confirmSummary
    try {
      await commitImport(pendingImport)
      recordAction?.(
        buildAttendanceLogFromSummary('import', pendingImport, summaryForLog, { success: true }),
      )
    } catch (err) {
      const message = err.message || 'Failed to save attendance. Please try again.'
      setConfirmError(message)
      recordAction?.(
        buildAttendanceLogFromSummary('import', pendingImport, summaryForLog, {
          success: false,
          error: message,
        }),
      )
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
      notify.success({
        key: NOTIFIER_KEYS.importExport,
        title: 'JSON copied to clipboard.',
      })
    } catch {
      notify.warning({
        key: NOTIFIER_KEYS.importExport,
        title: 'Could not copy JSON. Try downloading instead.',
      })
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
    notify.success({
      key: NOTIFIER_KEYS.importExport,
      title: 'JSON file downloaded.',
    })
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

  const [studentTableRef, studentTableHeight] = useScrollRegionHeight(280)

  const reviewTableRows = useMemo(
    () =>
      students.map((row) => ({
        key: `${row.index}-${row.importName || row.name}`,
        ...row,
      })),
    [students],
  )

  const filteredReviewRows = useMemo(
    () =>
      filterByNameSearch(reviewTableRows, reviewNameSearch, (row) => row.name || row.importName),
    [reviewTableRows, reviewNameSearch],
  )

  useEffect(() => {
    if (!students.length) setReviewNameSearch('')
  }, [students.length])

  const rosterPreviews = useMemo(
    () => buildImportRosterPreviews(meta, students, classes, attendance),
    [meta, students, classes, attendance],
  )
  const showReview = importView === 'review' && students.length > 0 && !processing
  const showImportInput = !showReview
  const backToInputLabel = importMode === 'json' ? 'Back to JSON' : 'Back to Screenshot'

  const cloudScanConfigured = isVisionEngineConfigured(VISION_SCAN_ENGINE.cloud)
  const visionReady =
    isVisionEngineConfigured(screenshotEngine) && visionConnection?.ok !== false

  const similarPendingCount = countSimilarPending(students)

  const similarModalRow = useMemo(() => {
    if (!similarModalKey) return null
    return students.find((r) => importRowKey(r) === similarModalKey) ?? null
  }, [similarModalKey, students])

  const importTabActivity = useMemo(
    () =>
      getImportTabActivity({
        importMode,
        bulkPanelActivity,
        saving,
        processing,
        hasJsonDraft: jsonHasDraft,
        hasScreenshotDraft: screenshotHasDraft,
      }),
    [
      importMode,
      bulkPanelActivity,
      saving,
      processing,
      jsonHasDraft,
      screenshotHasDraft,
    ],
  )

  useReportTabActivity('import', importTabActivity, onTabActivityChange)

  useEffect(() => {
    if (!saved) {
      savedNotifyRef.current = false
      return
    }
    if (savedNotifyRef.current) return
    savedNotifyRef.current = true
    notify.success({
      key: NOTIFIER_KEYS.importSave,
      title: UI.attendanceSaved,
      description: (
        <>
          <strong>{formatDateLabel(meta.date)}</strong>
          {classLabel ? ` — ${classLabel}` : ''}
          <br />
          {formatLpCount(savedCount.total)} · {savedCount.absent} absent
          {resetCountdown > 0 ? ` · Next import in ${resetCountdown}s` : ''}
        </>
      ),
      duration: 8,
      btn:
        savedCount.absent > 0
          ? createElement(
              Button,
              { size: 'small', type: 'primary', onClick: handleGoToDashboard },
              UI.viewDashboard,
            )
          : undefined,
    })
  }, [
    saved,
    meta.date,
    classLabel,
    savedCount,
    resetCountdown,
    notify,
    handleGoToDashboard,
  ])

  useEffect(() => {
    if (importMode !== 'screenshot') {
      notify.destroy(NOTIFIER_KEYS.importVision)
      return
    }
    if (visionConnection?.ok === false) {
      notify.error({
        key: NOTIFIER_KEYS.importVision,
        title:
          screenshotEngine === VISION_SCAN_ENGINE.local
            ? 'Ollama is not reachable'
            : 'Cloud API unavailable',
        description: visionConnection.message,
        duration: 0,
        minimizable: true,
      })
      return
    }
    if (isVisionEngineConfigured(screenshotEngine) && !visionConnection?.ok) {
      notify.progress({
        key: NOTIFIER_KEYS.importVision,
        title: 'Checking vision AI connection',
        description:
          screenshotEngine === VISION_SCAN_ENGINE.local
            ? 'Connecting to Ollama on this device…'
            : 'Connecting to cloud vision API…',
      })
      return
    }
    notify.destroy(NOTIFIER_KEYS.importVision)
  }, [importMode, screenshotEngine, visionConnection, notify])

  useEffect(() => {
    const showPending =
      reviewSource === 'screenshot' &&
      students.length > 0 &&
      importView === 'input' &&
      !processing
    if (!showPending) {
      notify.destroy(NOTIFIER_KEYS.importReviewPending)
      return
    }
    notify.draft({
      key: NOTIFIER_KEYS.importReviewPending,
      title: `Screenshot scan review — ${formatLpCount(students.length)}`,
      description: 'Continue review before saving to your roster.',
      duration: 0,
      minimizable: true,
      btn: createElement(
        Button,
        { size: 'small', type: 'primary', onClick: () => setImportView('review') },
        UI.continueReview,
      ),
    })
  }, [reviewSource, students.length, importView, processing, notify])

  useEffect(() => {
    if (!processing) {
      notify.destroy(NOTIFIER_KEYS.screenshotScan)
      return undefined
    }
    const pct = Math.round((ocrProgress ?? 0) * 100)
    const stalledNote = ocrProgressStalled
      ? 'Still working — large screenshots can take a minute.'
      : null
    notify.progress({
      key: NOTIFIER_KEYS.screenshotScan,
      title: ocrStageLabel || 'Reading screenshot…',
      description: (
        <>
          <div>
            {pct}% complete · {formatElapsed(ocrElapsedSeconds)} elapsed
          </div>
          {stalledNote && (
            <Typography.Text type="warning" style={{ fontSize: '0.82rem' }}>
              {stalledNote}
            </Typography.Text>
          )}
        </>
      ),
      btn: createElement(Button, { size: 'small', onClick: handleCancelOcr }, 'Cancel scan'),
    })
    return undefined
  }, [
    processing,
    ocrProgress,
    ocrStageLabel,
    ocrElapsedSeconds,
    ocrProgressStalled,
    notify,
  ])

  useEffect(() => {
    if (!showReview || similarPendingCount <= 0) {
      notify.destroy('import-similar-names')
      return
    }
    notify.warning({
      key: 'import-similar-names',
      title: `${similarPendingCount} name${similarPendingCount === 1 ? '' : 's'} under 95% match`,
      description: 'Click Review in the table to confirm each match before saving.',
      duration: 0,
      minimizable: true,
    })
  }, [showReview, similarPendingCount, notify])

  useEffect(() => {
    if (!showReview || !importWarnings.includes('missing_class')) {
      notify.destroy('import-missing-class')
      return
    }
    notify.warning({
      key: 'import-missing-class',
      title: 'Class header not detected from screenshot',
      description: 'Enter Intake, Level, Group, and Programme below before saving.',
      duration: 0,
      minimizable: true,
    })
  }, [showReview, importWarnings, notify])

  useEffect(() => {
    if (!showReview || !importWarnings.includes('missing_module')) {
      notify.destroy('import-missing-module')
      return
    }
    notify.warning({
      key: 'import-missing-module',
      title: 'Module not detected from screenshot',
      description:
        'Enter the module/subject line (e.g. L5CPT | SECURITY) before saving. Without it, attendance saves as a general session.',
      duration: 0,
      minimizable: true,
    })
  }, [showReview, importWarnings, notify])

  return (
    <section className="panel portal-panel workspace-panel">
      {showReview && (
        <div className="panel-nav-bar">
          <BackButton onClick={backFromReview}>{backToInputLabel}</BackButton>
        </div>
      )}

      <PanelChrome title="Record Attendance" />

      <div className="import-workspace">
      {showImportInput && (
      <div className="import-mode-region">
      <Tabs
        activeKey={importMode}
        onChange={(mode) => {
          handleImportModeChange(mode)
        }}
        items={[
          {
            key: 'json',
            label: (
              <span className="import-tab-label">
                JSON
                <ImportTabInfoTip tabId="json" active={importMode === 'json'} {...IMPORT_TAB_TIPS.json} />
              </span>
            ),
          },
          {
            key: 'screenshot',
            label: (
              <span className="import-tab-label">
                Screenshot
                <ImportTabInfoTip
                  tabId="screenshot"
                  active={importMode === 'screenshot'}
                  {...IMPORT_TAB_TIPS.screenshot}
                />
              </span>
            ),
          },
          {
            key: 'bulk-screenshots',
            label: (
              <span className="import-tab-label">
                Bulk Screenshots <Tag className="import-tab-beta-tag">Beta</Tag>
                <ImportTabInfoTip
                  tabId="bulk-screenshots"
                  active={importMode === 'bulk-screenshots'}
                  {...IMPORT_TAB_TIPS['bulk-screenshots']}
                />
              </span>
            ),
          },
        ]}
        className="import-tabs"
      />

      {importMode === 'bulk-screenshots' ? (
        <BulkScreenshotImport
          classes={classes}
          attendance={attendance}
          importPortalSession={importPortalSession}
          recordAction={recordAction}
          onActivityChange={setBulkPanelActivity}
          leaveGuardRef={bulkLeaveGuardRef}
          screenshotEngine={screenshotEngine}
          onScreenshotEngineChange={handleScreenshotEngineChange}
          cloudScanConfigured={cloudScanConfigured}
        />
      ) : importMode === 'json' ? (
        <div className="json-import-panel">
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
              {UI.parseJson}
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
          <ImportScanEngineSwitch
            value={screenshotEngine}
            onChange={handleScreenshotEngineChange}
            cloudConfigured={cloudScanConfigured}
          />
          <SaveFieldOverlay busy={processing} label="Scanning screenshot…">
            <>
              {lastScannedScreenshot && (
                <div className="import-screenshot-toolbar">
                  <Button onClick={() => setLastScanModalOpen(true)}>View Last Scanned Screenshot</Button>
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
                      Preview ready — click <strong>{UI.scanScreenshot}</strong> when it looks correct.
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
                  <Button>{UI.chooseImage}</Button>
                </Upload>
                <Button onClick={pasteScreenshotFromClipboard}>{UI.pasteScreenshot}</Button>
                <Button type="primary" disabled={!pendingScreenshot || !visionReady} onClick={handleScanScreenshot}>
                  {UI.scanScreenshot}
                </Button>
                {pendingScreenshot && <Button type="link" onClick={clearPendingScreenshot}>Clear</Button>}
              </Space>
            </>
          </SaveFieldOverlay>
        </div>
      )}
      </div>
      )}

      {showReview && (
        <>
          <SaveFieldOverlay busy={saving} label="Saving attendance…" className="import-review-overlay">
            <form className="portal-form import-review-form" onSubmit={handleSave}>
              <fieldset className="portal-form-fields import-review-fields" disabled={saving}>
                <div className="import-review-toolbar">
                  <ImportSessionMetaFields
                    meta={meta}
                    scannedMeta={scannedMeta}
                    onPatchMeta={patchMeta}
                    onApplyBulkPatch={applyMetaPatch}
                    onRevertScanned={revertToScannedMeta}
                    classes={classes}
                    attendance={attendance}
                    disabled={saving}
                  />
                  <Row gutter={[12, 12]} className="portal-meta-row">
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

                  <div className="import-review-toolbar-row">
                    <Space wrap className="import-review-actions">
                      <Button type="primary" onClick={() => setAllPresent(true)}>
                        Check All
                      </Button>
                      <Button onClick={() => setAllPresent(false)}>Uncheck All</Button>
                      {reviewSource === 'screenshot' && lastScannedScreenshot && (
                        <Button onClick={() => setLastScanModalOpen(true)}>
                          View Screenshot
                        </Button>
                      )}
                      <Button onClick={handleCopyJson}>Copy as JSON</Button>
                      <Button onClick={handleDownloadJson}>Download JSON</Button>
                    </Space>
                    <ImportReviewTableSummary students={reviewTableRows} />
                    <TableNameSearch
                      className="import-review-name-search"
                      value={reviewNameSearch}
                      onChange={setReviewNameSearch}
                      matchCount={filteredReviewRows.length}
                      totalCount={reviewTableRows.length}
                    />
                  </div>
                  <Typography.Text type="secondary" className="import-review-hint">
                    Checked = present · Unchecked = absent
                  </Typography.Text>
                </div>

                <div className="table-scroll-region portal-student-list-scroll import-review-table-region table-scroll-region-with-search">
                  <div className="import-review-table-wrap" ref={studentTableRef}>
                  {filteredReviewRows.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No names match this search."
                    />
                  ) : (
                  <Table
                    size="small"
                    pagination={{ pageSize: 30, showSizeChanger: false, hideOnSinglePage: true }}
                    scroll={{ y: studentTableHeight }}
                    rowClassName={(row) =>
                      needsSimilarReviewWarning(row) ? 'import-row-similar-pending' : ''
                    }
                    dataSource={filteredReviewRows}
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
                                title="Review Roster Match"
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
                      {
                        title: UI.streak,
                        key: 'rosterStreak',
                        width: 88,
                        align: 'center',
                        render: (_, row) => {
                          const preview = rosterPreviews.get(
                            `${row.index}-${row.importName || row.name}`,
                          )
                          if (preview?.rosterStreak == null) return '—'
                          return (
                            <Typography.Text
                              className="import-save-count-delta"
                              type={
                                !row.present && preview.rosterStreakDelta ? 'danger' : undefined
                              }
                            >
                              {preview.rosterStreak}
                            </Typography.Text>
                          )
                        },
                      },
                      {
                        title: UI.total,
                        key: 'rosterTotal',
                        width: 72,
                        align: 'center',
                        render: (_, row) => {
                          const preview = rosterPreviews.get(
                            `${row.index}-${row.importName || row.name}`,
                          )
                          if (preview?.rosterTotal == null) return '—'
                          return (
                            <Typography.Text
                              className="import-save-count-delta"
                              type={
                                !row.present && preview.rosterTotalDelta ? 'danger' : undefined
                              }
                            >
                              {preview.rosterTotal}
                            </Typography.Text>
                          )
                        },
                      },
                    ]}
                  />
                  )}
                  </div>
                </div>

                <div className="import-review-footer">
                  <Typography.Paragraph type="secondary" className="import-review-summary">
                    {formatDateLabel(meta.date)} · {formatLpCount(students.length)} ·{' '}
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
                </div>
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
        title="Last Scanned Screenshot"
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
          <Empty description="No Screenshot Saved" />
        )}
      </Modal>
    </section>
  )
}
