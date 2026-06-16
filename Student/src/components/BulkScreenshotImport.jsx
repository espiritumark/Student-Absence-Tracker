import {
  Button,
  Checkbox,
  Empty,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppNotifier } from '../hooks/useAppNotifier'
import { NOTIFIER_KEYS } from '../utils/appNotifications'
import { findMatchingClass, formatClassLabel, resolveImportClassLabel } from '../utils/classFormat'
import { dateKey } from '../utils/dates'
import { buildAttendanceLogFromSummary } from '../utils/activityLog'
import {
  buildImportPayload,
  computeImportSaveSummary,
} from '../utils/importReview'
import {
  countSimilarPending,
  enrichImportStudentsWithRoster,
  hasUnresolvedSimilarNames,
  importRowKey,
  importRowsMatchByName,
  linkImportRowToRoster,
  markImportRowAsNewStudent,
  mergeImportEnrichmentWithResolved,
  reopenImportRowForNameReviewInClass,
  resolveImportRowRosterStudent,
  needsSimilarReviewWarning,
} from '../utils/importNameResolution'
import {
  applyVisionResultToQueueItem,
  BULK_QUEUE_STATUS,
  countByStatus,
  createQueueItem,
  imageFilesFromClipboardData,
  imageFilesFromDataTransfer,
  imageFilesFromNavigatorClipboard,
  isEditablePasteTarget,
  queueItemClassLabel,
} from '../utils/bulkScreenshotQueue'
import { confirmAsync } from '../utils/confirmAsync'
import { confirmBulkDraftLeave } from '../utils/importDraftGuard.jsx'
import {
  clearBulkScreenshotSession,
  loadBulkScreenshotSession,
  maxBulkIdFromQueue,
  saveBulkScreenshotSession,
} from '../utils/importDraftSession.js'
import ImportReviewTableSummary from './ImportReviewTableSummary'
import { applyImportMetaChange, copyImportMeta } from '../utils/importMetaApply'
import { filterByNameSearch } from '../utils/tableNameSearch'
import { UI, formatLpCount } from '../utils/uiCopy'
import {
  fileToDataUrl,
  isVisionEngineConfigured,
  parseAttendanceScreenshot,
  VISION_SCAN_ENGINE,
} from '../utils/parseScreenshot'
import BulkQueueAdvancePrompt from './BulkQueueAdvancePrompt'
import ImportSessionMetaFields from './ImportSessionMetaFields'
import BulkQueueDock from './BulkQueueDock'
import ImportScanEngineSwitch from './ImportScanEngineSwitch'
import ImportSaveConfirmModal from './ImportSaveConfirmModal'
import SimilarNameResolveModal from './SimilarNameResolveModal'
import ImportMatchColumn from './ImportMatchColumn'
import ImportLearningPartnerCell from './ImportLearningPartnerCell'
import SaveFieldOverlay from './SaveFieldOverlay'
import TableNameSearch from './TableNameSearch'

const MAX_QUEUE = 30
const emptyMeta = () => ({
  intake: '',
  level: '',
  qualification: '',
  group: '',
  date: dateKey(),
  module: '',
  startTime: '',
  duration: '',
})

function isBulkItemReviewable(item) {
  return (
    item?.status === BULK_QUEUE_STATUS.ready ||
    item?.status === BULK_QUEUE_STATUS.saved ||
    item?.status === BULK_QUEUE_STATUS.error
  )
}

/** Keep reviewing a finished item while later queue images still scan. */
function pickSelectionAfterItemDone(selectedId, items, finishedId) {
  const current = items.find((item) => item.id === selectedId)
  if (current && isBulkItemReviewable(current) && current.id !== finishedId) {
    return selectedId
  }
  return finishedId
}

function readInitialBulkState() {
  const snap = loadBulkScreenshotSession()
  if (!snap?.queue?.length) {
    return { queue: [], selectedId: null, restored: false, maxId: 0 }
  }
  return {
    queue: snap.queue.map((item) => ({
      ...item,
      scannedMeta:
        item.scannedMeta ?? (item.meta ? copyImportMeta(item.meta) : null),
      scannedWarnings: item.scannedWarnings ?? [...(item.warnings ?? [])],
    })),
    selectedId: snap.selectedId ?? snap.queue[0]?.id ?? null,
    restored: true,
    maxId: maxBulkIdFromQueue(snap.queue),
  }
}

function scanEngineMetaLabel(engine) {
  return engine === VISION_SCAN_ENGINE.local
    ? `${UI.scanEngineLocal} (Ollama)`
    : UI.scanEngineCloud
}

function nextQueueItemAfter(queue, currentId) {
  const idx = queue.findIndex((item) => item.id === currentId)
  if (idx < 0 || idx >= queue.length - 1) return null
  return queue[idx + 1]
}

function showQueueAdvancePrompt(savedId, queue, savedLabel, wasOverwrite = false) {
  const next = nextQueueItemAfter(queue, savedId)
  if (!next) return null
  return {
    promptKey: Date.now(),
    savedId,
    nextId: next.id,
    nextFileName: next.fileName || 'next item',
    savedLabel,
    wasOverwrite,
  }
}

export default function BulkScreenshotImport({
  classes,
  attendance,
  importPortalSession,
  recordAction,
  onActivityChange,
  leaveGuardRef,
  screenshotEngine,
  onScreenshotEngineChange,
  cloudScanConfigured = false,
}) {
  const initial = useMemo(() => readInitialBulkState(), [])
  const [queue, setQueue] = useState(initial.queue)
  const [selectedId, setSelectedId] = useState(initial.selectedId)
  const [restoredDraft, setRestoredDraft] = useState(initial.restored)
  const [scanning, setScanning] = useState(false)
  const [scanBatch, setScanBatch] = useState({ done: 0, total: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [confirmSummary, setConfirmSummary] = useState(null)
  const [confirmError, setConfirmError] = useState('')
  const [similarModalKey, setSimilarModalKey] = useState(null)
  const [advancePrompt, setAdvancePrompt] = useState(null)
  const cancelScanRef = useRef(false)
  const idRef = useRef(initial.maxId)
  const pasteZoneRef = useRef(null)
  const restoredNotifyRef = useRef(false)
  const notify = useAppNotifier()

  const selectedItem = useMemo(
    () => queue.find((item) => item.id === selectedId) ?? null,
    [queue, selectedId],
  )

  const meta = selectedItem?.meta ?? emptyMeta()
  const students = useMemo(() => {
    if (!selectedItem?.students?.length) return []
    const raw = selectedItem.students
    const editable =
      selectedItem.status === BULK_QUEUE_STATUS.ready ||
      selectedItem.status === BULK_QUEUE_STATUS.saved
    if (!editable || !selectedItem.meta) {
      return raw
    }
    const base = raw.map((row) => ({
      index: row.index,
      name: row.importName || row.name,
      present: row.present,
    }))
    const enriched = enrichImportStudentsWithRoster(base, classes, selectedItem.meta)
    return mergeImportEnrichmentWithResolved(raw, enriched)
  }, [selectedItem, classes])

  const filteredRows = useMemo(() => {
    const rows = students.map((row, i) => ({
      key: importRowKey(row) || `bulk-row-${i}`,
      ...row,
    }))
    return filterByNameSearch(rows, nameSearch, (row) => row.name || row.importName)
  }, [students, nameSearch])

  const similarPendingCount = useMemo(() => countSimilarPending(students), [students])

  const similarModalRow = useMemo(() => {
    if (!similarModalKey) return null
    return students.find((r) => importRowKey(r) === similarModalKey) ?? null
  }, [similarModalKey, students])

  const classLabel = useMemo(() => {
    if (!selectedItem?.meta) return ''
    const matched = findMatchingClass(classes, {
      intake: Number(meta.intake) || null,
      level: Number(meta.level) || null,
      qualification: meta.qualification,
      group: Number(meta.group) || null,
    })
    const formClass = {
      intake: meta.intake,
      level: meta.level,
      qualification: meta.qualification,
      group: meta.group,
    }
    return (
      resolveImportClassLabel(formClass, matched) ||
      queueItemClassLabel(meta)
    )
  }, [selectedItem, meta, classes])

  const updateItem = useCallback((id, patch) => {
    setQueue((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const updateSelected = useCallback(
    (patch) => {
      if (!selectedId) return
      setQueue((items) =>
        items.map((item) => {
          if (item.id !== selectedId) return item
          if (typeof patch === 'function') return patch(item)
          return { ...item, ...patch }
        }),
      )
    },
    [selectedId],
  )

  const applyMetaPatch = useCallback(
    (patch) => {
      if (!selectedItem?.meta) return false
      const result = applyImportMetaChange({
        currentMeta: selectedItem.meta,
        patch,
        classes,
        students: selectedItem.students,
        warnings: selectedItem.warnings,
      })
      if (!result.ok) {
        notify.error({
          key: 'bulk-meta-class-match',
          title: 'No matching class found',
          description: result.error,
          duration: 8,
        })
        return false
      }

      updateSelected({
        meta: result.nextMeta,
        warnings: result.nextWarnings,
      })

      if (result.classMatched && result.matchedClassLabel) {
        notify.success({
          key: 'bulk-meta-class-match',
          title: 'Class matched',
          description: `${result.matchedClassLabel} — Learning Partner list updated for review.`,
          duration: 5,
        })
      }
      return true
    },
    [selectedItem, classes, updateSelected, notify],
  )

  const patchMeta = useCallback(
    (field, value) => applyMetaPatch({ [field]: value }),
    [applyMetaPatch],
  )

  const revertToScannedMeta = useCallback(() => {
    if (!selectedItem?.scannedMeta) return
    const restoredMeta = copyImportMeta(selectedItem.scannedMeta)
    updateSelected({
      meta: restoredMeta,
      warnings: [...(selectedItem.scannedWarnings ?? selectedItem.warnings ?? [])],
    })
    notify.info({
      key: 'bulk-meta-revert',
      title: 'Session details restored',
      description: 'Reverted to values from the original scan.',
      duration: 4,
    })
  }, [selectedItem, classes, updateSelected, notify])

  const addFilesToQueue = useCallback(async (fileList) => {
    const files = [...fileList].filter((f) => f.type?.startsWith('image/'))
    if (!files.length) {
      setError('Choose image files only (PNG, JPG, etc.).')
      return
    }

    setError('')
    const room = MAX_QUEUE - queue.length
    if (room <= 0) {
      setError(`Queue is full (${MAX_QUEUE} screenshots max). Remove some or save completed ones.`)
      return
    }

    const toAdd = files.slice(0, room)
    const newItems = []
    for (const file of toAdd) {
      const previewUrl = await fileToDataUrl(file)
      idRef.current += 1
      const index = queue.length + newItems.length + 1
      newItems.push(
        createQueueItem({
          id: `bulk-${idRef.current}`,
          fileName: file.name?.trim() || `Screenshot ${index}`,
          previewUrl,
        }),
      )
    }

    setQueue((prev) => [...prev, ...newItems])
    if (!selectedId && newItems[0]) setSelectedId(newItems[0].id)
    if (files.length > room) {
      setError(`Added ${room} image${room === 1 ? '' : 's'}; ${files.length - room} skipped (queue limit).`)
    }
  }, [queue.length, selectedId])

  const handlePasteImageEvent = useCallback(
    (e) => {
      const files = imageFilesFromClipboardData(e.clipboardData)
      if (!files.length) return
      e.preventDefault()
      e.stopPropagation()
      addFilesToQueue(files)
    },
    [addFilesToQueue],
  )

  const pasteScreenshotsFromClipboard = useCallback(async () => {
    if (queue.length === 0) pasteZoneRef.current?.focus()
    const files = await imageFilesFromNavigatorClipboard()
    if (files.length) {
      await addFilesToQueue(files)
      return
    }
    setError(
      'No images on clipboard. Copy screenshots (Win+Shift+S), click the paste area, then Ctrl+V — you can paste several times to build the queue.',
    )
  }, [addFilesToQueue, queue.length])

  useEffect(() => {
    if (queue.length > 0) return undefined
    const t = setTimeout(() => pasteZoneRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [queue.length])

  useEffect(() => {
    if (scanning) return undefined
    function onDocumentPaste(e) {
      if (e.defaultPrevented || isEditablePasteTarget(document.activeElement)) return
      const files = imageFilesFromClipboardData(e.clipboardData)
      if (!files.length) return
      e.preventDefault()
      addFilesToQueue(files)
    }
    document.addEventListener('paste', onDocumentPaste)
    return () => document.removeEventListener('paste', onDocumentPaste)
  }, [scanning, addFilesToQueue])

  const clearQueue = useCallback(async () => {
    if (!queue.length) return
    const ok = await confirmAsync({
      title: 'Clear bulk queue?',
      content:
        'Removes all queued and scanned drafts from this tab. Nothing is saved to your roster until you use Save on each reviewed session.',
      okText: UI.clearQueue,
      okType: 'danger',
      cancelText: 'Keep',
    })
    if (!ok) return
    setQueue([])
    setSelectedId(null)
    setAdvancePrompt(null)
    setError('')
    clearBulkScreenshotSession()
    setRestoredDraft(false)
  }, [queue.length])

  const processQueue = useCallback(async () => {
    if (scanning) return
    const queued = queue.filter((item) => item.status === BULK_QUEUE_STATUS.queued)
    if (!queued.length) {
      setError('No queued screenshots to scan.')
      return
    }
    if (!isVisionEngineConfigured(screenshotEngine)) {
      setError('Vision AI is not configured. Use Local with Ollama, or set up Cloud vision.')
      return
    }

    cancelScanRef.current = false
    setScanning(true)
    setError('')
    setScanBatch({ done: 0, total: queued.length })

    for (const item of queued) {
      if (cancelScanRef.current) break

      updateItem(item.id, {
        status: BULK_QUEUE_STATUS.scanning,
        progress: 0,
        stageLabel: 'Starting…',
        error: '',
      })

      try {
        const result = await parseAttendanceScreenshot(
          item.previewUrl,
          ({ progress, label }) => {
            updateItem(item.id, { progress, stageLabel: label })
          },
          { engine: screenshotEngine },
        )

        if (cancelScanRef.current) break

        const updatedItem = applyVisionResultToQueueItem(item, result, classes)
        if (updatedItem.parseMessage) {
          notify.success({
            key: `bulk-scan-result-${item.id}`,
            title: updatedItem.parseMessage,
          })
        }
        setQueue((items) => {
          const next = items.map((current) => (current.id === item.id ? updatedItem : current))
          setSelectedId((sel) => pickSelectionAfterItemDone(sel, next, item.id))
          return next
        })
      } catch (e) {
        setQueue((items) => {
          const next = items.map((current) =>
            current.id === item.id
              ? {
                  ...current,
                  status: BULK_QUEUE_STATUS.error,
                  error: e.message || 'Scan failed.',
                  progress: 0,
                  stageLabel: '',
                }
              : current,
          )
          setSelectedId((sel) => pickSelectionAfterItemDone(sel, next, item.id))
          return next
        })
      } finally {
        setScanBatch((b) => ({ ...b, done: b.done + 1 }))
      }
    }

    setScanning(false)
    setScanBatch({ done: 0, total: 0 })
  }, [scanning, queue, screenshotEngine, classes, updateItem, notify])

  function cancelScan() {
    cancelScanRef.current = true
    setScanning(false)
    setQueue((items) =>
      items.map((item) =>
        item.status === BULK_QUEUE_STATUS.scanning
          ? { ...item, status: BULK_QUEUE_STATUS.queued, progress: 0, stageLabel: '' }
          : item,
      ),
    )
  }

  function removeItem(id) {
    setQueue((items) => {
      const next = items.filter((item) => item.id !== id)
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null)
      }
      return next
    })
  }

  function togglePresent(importName) {
    updateSelected((item) => ({
      ...item,
      students: item.students.map((r) =>
        importRowsMatchByName(r, { name: importName }) ? { ...r, present: !r.present } : r,
      ),
    }))
  }

  function setAllPresent(present) {
    updateSelected((item) => ({
      ...item,
      students: item.students.map((r) => ({ ...r, present })),
    }))
  }

  function openSimilarModal(row) {
    setSimilarModalKey(importRowKey(row))
  }

  function handleLinkSimilarRow(row, candidate, nameChoice = 'roster') {
    updateSelected((item) => ({
      ...item,
      students: item.students.map((r) =>
        importRowsMatchByName(r, row)
          ? linkImportRowToRoster(r, candidate, { nameChoice })
          : r,
      ),
    }))
    setSimilarModalKey(null)
  }

  function handleMarkSimilarRowAsNew(row) {
    updateSelected((item) => ({
      ...item,
      students: item.students.map((r) =>
        importRowsMatchByName(r, row) ? markImportRowAsNewStudent(r) : r,
      ),
    }))
    setSimilarModalKey(null)
  }

  function handleUndoNameResolution(row) {
    updateSelected((item) => ({
      ...item,
      students: item.students.map((r) =>
        importRowsMatchByName(r, row)
          ? reopenImportRowForNameReviewInClass(r, classes, item.meta)
          : r,
      ),
    }))
    setSimilarModalKey(null)
  }

  function handleUseScannedName(row) {
    updateSelected((item) => {
      const rosterStudent = resolveImportRowRosterStudent(row, classes, item.meta)
      if (!rosterStudent) return item
      return {
        ...item,
        students: item.students.map((r) =>
          importRowsMatchByName(r, row)
            ? linkImportRowToRoster(r, rosterStudent, { nameChoice: 'scanned' })
            : r,
        ),
      }
    })
  }

  function handleUseRosterName(row) {
    updateSelected((item) => {
      const rosterStudent = resolveImportRowRosterStudent(row, classes, item.meta)
      if (!rosterStudent) return item
      return {
        ...item,
        students: item.students.map((r) =>
          importRowsMatchByName(r, row)
            ? linkImportRowToRoster(r, rosterStudent, { nameChoice: 'roster' })
            : r,
        ),
      }
    })
  }

  async function handleSaveSession(e) {
    e?.preventDefault?.()
    const canSave =
      selectedItem?.status === BULK_QUEUE_STATUS.ready ||
      selectedItem?.status === BULK_QUEUE_STATUS.saved
    if (!selectedItem || !canSave) return
    if (saving) return
    if (!students.length) {
      setError(`No ${UI.learningPartners} to save.`)
      return
    }
    if (hasUnresolvedSimilarNames(students)) {
      setError(`Resolve similar ${UI.learningPartner} names before saving this session.`)
      return
    }

    const payload = buildImportPayload(meta, students)
    if (!payload.classMeta.qualification && !payload.classMeta.intake) {
      setError('Class details are required before saving.')
      return
    }

    setPendingImport(payload)
    setConfirmSummary(computeImportSaveSummary(payload, classes, attendance))
    setConfirmError('')
    setConfirmOpen(true)
  }

  async function handleConfirmSave() {
    if (!pendingImport || saving) return
    setSaving(true)
    setConfirmError('')
    const summaryForLog = confirmSummary
    try {
      await importPortalSession(pendingImport)
      recordAction?.(
        buildAttendanceLogFromSummary('import', pendingImport, summaryForLog, { success: true }),
      )
      setConfirmOpen(false)
      setPendingImport(null)
      setConfirmSummary(null)

      const savedId = selectedId
      const wasOverwrite = selectedItem?.status === BULK_QUEUE_STATUS.saved
      updateItem(savedId, { status: BULK_QUEUE_STATUS.saved })

      const advance = showQueueAdvancePrompt(
        savedId,
        queue,
        classLabel || 'This session',
        wasOverwrite,
      )
      if (advance) {
        setAdvancePrompt(advance)
      } else {
        notify.success({
          key: `bulk-saved-${savedId}`,
          title: 'Session saved',
          description: `${classLabel || 'This class'} was saved. You can edit and save again here to overwrite.`,
        })
      }
    } catch (err) {
      const message = err.message || 'Failed to save attendance.'
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

  useEffect(() => {
    const ready = countByStatus(queue, BULK_QUEUE_STATUS.ready)
    const queued = countByStatus(queue, BULK_QUEUE_STATUS.queued)
    const hasDraft = ready > 0 || queued > 0
    if (scanning) {
      onActivityChange?.({
        busy: true,
        draft: hasDraft,
        lockNavigation: true,
        readyCount: ready,
        queuedCount: queued,
      })
    } else if (saving) {
      onActivityChange?.({ busy: true, draft: hasDraft, readyCount: ready, queuedCount: queued })
    } else if (hasDraft) {
      onActivityChange?.({ busy: false, draft: true, readyCount: ready, queuedCount: queued })
    } else {
      onActivityChange?.(null)
    }
  }, [queue, scanning, saving, onActivityChange])

  useEffect(() => {
    if (!queue.length) {
      clearBulkScreenshotSession()
      return undefined
    }
    const t = setTimeout(() => {
      saveBulkScreenshotSession({ queue, selectedId })
    }, 400)
    return () => clearTimeout(t)
  }, [queue, selectedId])

  useEffect(() => {
    if (!leaveGuardRef) return undefined
    leaveGuardRef.current = () =>
      confirmBulkDraftLeave({
        scanning,
        readyCount: countByStatus(queue, BULK_QUEUE_STATUS.ready),
        queuedCount: countByStatus(queue, BULK_QUEUE_STATUS.queued),
      })
    return () => {
      leaveGuardRef.current = null
    }
  }, [leaveGuardRef, scanning, queue])

  useEffect(() => {
    if (!scanning) return undefined
    function onBeforeUnload(e) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [scanning])

  const queuedCount = countByStatus(queue, BULK_QUEUE_STATUS.queued)
  const readyCount = countByStatus(queue, BULK_QUEUE_STATUS.ready)
  const savedCount = countByStatus(queue, BULK_QUEUE_STATUS.saved)
  const bulkQueueAllSaved = useMemo(
    () =>
      queue.length > 0 &&
      !scanning &&
      queuedCount === 0 &&
      readyCount === 0 &&
      savedCount === queue.length,
    [queue.length, scanning, queuedCount, readyCount, savedCount],
  )
  const scanningItem = queue.find((item) => item.status === BULK_QUEUE_STATUS.scanning)
  const scanOverallPercent =
    scanning && scanBatch.total > 0
      ? Math.round(
          ((scanBatch.done + (scanningItem?.progress ?? 0)) / scanBatch.total) * 100,
        )
      : 0

  const canAddMore = !scanning && queue.length < MAX_QUEUE
  const scanCirclePercent = scanningItem
    ? Math.round((scanningItem.progress ?? 0) * 100)
    : scanOverallPercent

  useEffect(() => {
    if (!restoredDraft || !queue.length || restoredNotifyRef.current) return
    restoredNotifyRef.current = true
    notify.draft({
      key: NOTIFIER_KEYS.bulkDraftRestored,
      title: 'Draft queue restored',
      description:
        'Bulk screenshots from this session were loaded. Save each reviewed session to your roster, or clear the queue when finished.',
      onClose: () => setRestoredDraft(false),
    })
  }, [restoredDraft, queue.length, notify])

  useEffect(() => {
    if (!scanning) {
      notify.destroy(NOTIFIER_KEYS.bulkScan)
      return undefined
    }
    const index = Math.min(scanBatch.done + 1, scanBatch.total)
    notify.progress({
      key: NOTIFIER_KEYS.bulkScan,
      title: `Scanning ${index} of ${scanBatch.total}`,
      description: (
        <>
          <div>{scanningItem?.fileName || 'Processing screenshots'}</div>
          <Typography.Text type="secondary" style={{ fontSize: '0.82rem' }}>
            {scanningItem?.stageLabel || 'Vision AI analysis…'} · Other tabs paused
          </Typography.Text>
        </>
      ),
    })
    return undefined
  }, [
    scanning,
    scanBatch.done,
    scanBatch.total,
    scanningItem?.id,
    scanningItem?.fileName,
    scanningItem?.stageLabel,
    notify,
  ])

  useEffect(() => {
    if (!error) return
    notify.error({
      key: 'bulk-import-error',
      title: error,
      duration: 8,
    })
  }, [error, notify])

  useEffect(() => {
    if (!selectedItem || similarPendingCount <= 0) {
      notify.destroy('bulk-similar-names')
      return
    }
    notify.warning({
      key: 'bulk-similar-names',
      title: `${similarPendingCount} name${similarPendingCount === 1 ? '' : 's'} need review`,
      description: 'Confirm matches under 95% before saving this session.',
      duration: 0,
      minimizable: true,
    })
  }, [selectedItem?.id, similarPendingCount, notify])

  useEffect(() => {
    const missingClass = selectedItem?.warnings?.includes('missing_class')
    if (!selectedItem || !missingClass) {
      notify.destroy('bulk-missing-class')
      return
    }
    notify.warning({
      key: 'bulk-missing-class',
      title: 'Class header not detected',
      description: 'Fill Intake, Level, Group, and Programme before saving.',
      duration: 0,
      minimizable: true,
    })
  }, [selectedItem?.id, selectedItem?.warnings, notify])

  useEffect(() => {
    const missingModule = selectedItem?.warnings?.includes('missing_module')
    if (!selectedItem || !missingModule) {
      notify.destroy('bulk-missing-module')
      return
    }
    notify.warning({
      key: 'bulk-missing-module',
      title: 'Module not detected',
      description:
        'Enter the module/subject line (e.g. L5CPT | SECURITY) before saving. Without it, attendance saves as a general session and will not appear under By Module.',
      duration: 0,
      minimizable: true,
    })
  }, [selectedItem?.id, selectedItem?.warnings, notify])

  useEffect(() => {
    const qualSync = selectedItem?.warnings?.includes('qualification_roster_sync')
    if (!selectedItem || !qualSync) {
      notify.destroy('bulk-qualification-sync')
      return
    }
    notify.info({
      key: 'bulk-qualification-sync',
      title: 'Programme matched to roster',
      description:
        'Part-time (PT) and full-time are separate classes. The programme field was aligned to your saved roster class for this intake.',
      duration: 6,
    })
  }, [selectedItem?.id, selectedItem?.warnings, notify])

  const selectedNavIndex = useMemo(
    () => queue.findIndex((item) => item.id === selectedId),
    [queue, selectedId],
  )
  const nextQueueItem =
    selectedNavIndex >= 0 && selectedNavIndex < queue.length - 1
      ? queue[selectedNavIndex + 1]
      : null
  const nextQueueItemReviewable = isBulkItemReviewable(nextQueueItem)
  const nextQueueItemScanning = nextQueueItem?.status === BULK_QUEUE_STATUS.scanning
  const showDoneButton =
    bulkQueueAllSaved && selectedNavIndex >= 0 && selectedNavIndex >= queue.length - 1

  const completeQueueAdvance = useCallback(() => {
    setAdvancePrompt((prompt) => {
      if (prompt) {
        setSelectedId(prompt.nextId)
        setError('')
        setNameSearch('')
      }
      return null
    })
  }, [])

  const cancelQueueAdvance = useCallback(() => {
    setAdvancePrompt(null)
  }, [])

  const finishBulkSession = useCallback(() => {
    setAdvancePrompt(null)
    setQueue([])
    setSelectedId(null)
    setError('')
    setNameSearch('')
    clearBulkScreenshotSession()
    setRestoredDraft(false)
    notify.success({
      key: 'bulk-finished',
      title: 'Bulk import complete',
      description: 'Queue cleared. Add screenshots to start another batch.',
    })
  }, [notify])

  const goToQueueNeighbor = useCallback(
    (delta) => {
      const nextIndex = selectedNavIndex + delta
      if (nextIndex < 0 || nextIndex >= queue.length) return
      const next = queue[nextIndex]
      setAdvancePrompt(null)
      setSelectedId(next.id)
      setError('')
      setNameSearch('')
    },
    [queue, selectedNavIndex],
  )

  const showReviewFooter = selectedItem && isBulkItemReviewable(selectedItem)

  const pasteZoneProps = {
    onPaste: handlePasteImageEvent,
    onClick: () => pasteZoneRef.current?.focus(),
    onDragOver: (e) => {
      e.preventDefault()
      e.currentTarget.classList.add('drop-zone-active')
    },
    onDragLeave: (e) => e.currentTarget.classList.remove('drop-zone-active'),
    onDrop: (e) => {
      e.preventDefault()
      e.currentTarget.classList.remove('drop-zone-active')
      const files = imageFilesFromDataTransfer(e.dataTransfer)
      if (files.length) addFilesToQueue(files)
    },
  }

  return (
    <div
      className={`bulk-screenshot-import${queue.length > 0 ? ' bulk-screenshot-import-has-queue' : ''}${scanning ? ' bulk-screenshot-import-scanning' : ''}`}
    >
      <div className="bulk-screenshot-toolbar">
        <ImportScanEngineSwitch
          value={screenshotEngine}
          onChange={onScreenshotEngineChange}
          cloudConfigured={cloudScanConfigured}
          className="bulk-screenshot-engine-row"
        />
        <div className="bulk-screenshot-toolbar-main">
          <Upload
            accept="image/*"
            multiple
            showUploadList={false}
            disabled={!canAddMore}
            beforeUpload={(file, fileList) => {
              addFilesToQueue(fileList)
              return false
            }}
          >
            <Button disabled={!canAddMore}>Add Images</Button>
          </Upload>
          {queue.length === 0 && (
            <Button disabled={!canAddMore} onClick={pasteScreenshotsFromClipboard}>
              {UI.pasteScreenshot}
            </Button>
          )}
          <Button
            type="primary"
            disabled={scanning || queuedCount === 0}
            loading={scanning}
            onClick={processQueue}
          >
            {scanning ? UI.scanningQueue : `Scan ${queuedCount || ''} Queued`.trim()}
          </Button>
          {scanning && <Button onClick={cancelScan}>Cancel Scan</Button>}
          {queue.length > 0 && (
            <Button danger disabled={scanning || saving} onClick={clearQueue}>
              {UI.clearQueue}
            </Button>
          )}
          <Typography.Text type="secondary" className="bulk-screenshot-toolbar-meta">
            {queue.length} in queue · {readyCount} ready · {savedCount} saved ·{' '}
            {scanEngineMetaLabel(screenshotEngine)}
          </Typography.Text>
          {queue.length > 0 && (
            <BulkQueueDock
              queue={queue}
              selectedId={selectedId}
              scanning={scanning}
              scanningItem={scanningItem}
              scanCirclePercent={scanCirclePercent}
              maxQueue={MAX_QUEUE}
              disabled={scanning}
              onSelect={(id) => {
                setAdvancePrompt(null)
                setSelectedId(id)
                setError('')
                setNameSearch('')
              }}
              onRemove={removeItem}
            />
          )}
        </div>
      </div>

      {canAddMore && queue.length === 0 && (
        <div
          ref={pasteZoneRef}
          tabIndex={0}
          role="button"
          aria-label="Paste screenshots. Click here then Ctrl+V to add one or more images, or drag files onto this area."
          className="drop-zone drop-zone-paste bulk-screenshot-paste-zone"
          {...pasteZoneProps}
        >
          <div className="drop-zone-label">
            <strong>Click here to paste screenshots</strong> (Ctrl+V)
            <br />
            <span className="muted">Or drag images here — paste again to add more</span>
          </div>
        </div>
      )}

      {queue.length === 0 ? null : (
        <div className="bulk-screenshot-workspace">
          <div className="bulk-screenshot-detail-pane detail-pane">
            {!selectedItem ? (
              <div className="detail-pane-empty">
                <Empty description="Open the queue icon above to pick a screenshot." />
              </div>
            ) : selectedItem.status === BULK_QUEUE_STATUS.scanning ? (
              <div className="detail-pane-empty bulk-screenshot-scanning-compact">
                <Typography.Text type="secondary">
                  Scanning <strong>{selectedItem.fileName}</strong> — watch progress on the queue
                  icon (top right) or the notification.
                </Typography.Text>
              </div>
            ) : selectedItem.status === BULK_QUEUE_STATUS.error ? (
              <div className="detail-pane-empty bulk-screenshot-error-pane">
                <Typography.Text type="danger" strong>
                  Scan failed
                </Typography.Text>
                <Typography.Paragraph type="secondary" style={{ marginBottom: '0.75rem' }}>
                  {selectedItem.error}
                </Typography.Paragraph>
                <Button
                  size="small"
                  onClick={() =>
                    updateItem(selectedItem.id, { status: BULK_QUEUE_STATUS.queued, error: '' })
                  }
                >
                  Retry later
                </Button>
              </div>
            ) : selectedItem.status === BULK_QUEUE_STATUS.queued ? (
              <div className="detail-pane-empty">
                <Empty description="Click Scan Queued to process this image, or wait for the queue runner." />
              </div>
            ) : selectedItem.status === BULK_QUEUE_STATUS.ready ||
              selectedItem.status === BULK_QUEUE_STATUS.saved ? (
              <SaveFieldOverlay busy={saving} label="Saving attendance…">
                <form
                  className="portal-form import-review-form bulk-screenshot-review-form"
                  onSubmit={handleSaveSession}
                >
                  <div className="bulk-screenshot-review-header">
                  <ImportSessionMetaFields
                    meta={meta}
                    scannedMeta={selectedItem.scannedMeta}
                    onPatchMeta={patchMeta}
                    onApplyBulkPatch={applyMetaPatch}
                    onRevertScanned={revertToScannedMeta}
                    classes={classes}
                    attendance={attendance}
                    disabled={saving}
                  />

                  <div className="import-review-toolbar-row">
                    <Space wrap className="import-review-actions">
                      <Button type="primary" onClick={() => setAllPresent(true)}>
                        Check All
                      </Button>
                      <Button onClick={() => setAllPresent(false)}>Uncheck All</Button>
                    </Space>
                    <ImportReviewTableSummary students={students} />
                    <TableNameSearch
                      className="import-review-name-search"
                      value={nameSearch}
                      onChange={setNameSearch}
                      matchCount={filteredRows.length}
                      totalCount={students.length}
                    />
                  </div>

                  {selectedItem.status === BULK_QUEUE_STATUS.saved && !advancePrompt && (
                    <Typography.Text type="secondary" className="bulk-saved-hint">
                      Saved — edit below and save again to overwrite this session. A confirmation
                      summary appears before changes are applied.
                    </Typography.Text>
                  )}
                  </div>

                  <div className="bulk-screenshot-review-table-region portal-student-list-scroll">
                  <div className="bulk-screenshot-review-table-wrap">
                    <Table
                      size="small"
                      rowKey="key"
                      pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
                      dataSource={filteredRows}
                      rowClassName={(row) =>
                        needsSimilarReviewWarning(row) ? 'import-row-similar-pending' : ''
                      }
                      columns={[
                        { title: '#', dataIndex: 'index', width: 48 },
                        {
                          title: 'Present',
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
                          ellipsis: true,
                          render: (_, row) => (
                            <ImportLearningPartnerCell
                              row={row}
                              onReview={openSimilarModal}
                              onUndo={handleUndoNameResolution}
                              onUseScannedName={handleUseScannedName}
                              onUseRosterName={handleUseRosterName}
                            />
                          ),
                        },
                        {
                          title: 'Match',
                          key: 'match',
                          width: 120,
                          render: (_, row) => (
                            <ImportMatchColumn row={row} onReview={openSimilarModal} />
                          ),
                        },
                        {
                          title: 'Status',
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
                  </div>
                </form>
              </SaveFieldOverlay>
            ) : null}
          </div>
          {showReviewFooter && (
            <div className="bulk-screenshot-review-footer">
              <Button disabled={selectedNavIndex <= 0} onClick={() => goToQueueNeighbor(-1)}>
                Previous
              </Button>
              <Typography.Text type="secondary" className="bulk-screenshot-review-footer-meta">
                {selectedItem.fileName}
                {classLabel ? ` · ${classLabel}` : ''} · {selectedNavIndex + 1} of {queue.length}
                {scanning && scanningItem ? (
                  <>
                    {' '}
                    · Scanning <strong>{scanningItem.fileName}</strong> in background
                  </>
                ) : null}
              </Typography.Text>
              {selectedItem.status === BULK_QUEUE_STATUS.ready ||
              selectedItem.status === BULK_QUEUE_STATUS.saved ? (
                <Button
                  type={showDoneButton ? 'default' : 'primary'}
                  loading={saving}
                  disabled={saving || !students.length}
                  onClick={() => handleSaveSession()}
                >
                  {selectedItem.status === BULK_QUEUE_STATUS.saved
                    ? UI.saveAgain
                    : UI.saveAttendance}{' '}
                  ({formatLpCount(students.length)})
                </Button>
              ) : (
                <Button
                  size="small"
                  onClick={() =>
                    updateItem(selectedItem.id, {
                      status: BULK_QUEUE_STATUS.queued,
                      error: '',
                    })
                  }
                >
                  Re-queue
                </Button>
              )}
              {showDoneButton ? (
                <Button
                  type="primary"
                  disabled={scanning || saving}
                  onClick={finishBulkSession}
                >
                  {UI.done}
                </Button>
              ) : (
                <Button
                  disabled={selectedNavIndex >= queue.length - 1 || !nextQueueItemReviewable}
                  loading={nextQueueItemScanning}
                  onClick={() => goToQueueNeighbor(1)}
                >
                  Next
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <BulkQueueAdvancePrompt
        key={advancePrompt?.promptKey}
        open={Boolean(advancePrompt && selectedId === advancePrompt.savedId)}
        nextFileName={advancePrompt?.nextFileName ?? ''}
        savedLabel={advancePrompt?.savedLabel ?? ''}
        wasOverwrite={advancePrompt?.wasOverwrite}
        onCancel={cancelQueueAdvance}
        onComplete={completeQueueAdvance}
      />

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
        onCancel={() => !saving && setConfirmOpen(false)}
        onConfirm={handleConfirmSave}
        error={confirmError}
        busy={saving}
      />
    </div>
  )
}
