import {
  findMatchingClass,
  isLikelyFalsePartTimeFromModule,
  isPartTimeQualification,
  qualificationBaseEqual,
  resolveImportClassLabel,
  syncPartTimeFromClassLabel,
} from './classFormat'
import { dateKey } from './dates'
import {
  enrichImportStudentsWithRoster,
  polishImportRow,
} from './importNameResolution'
import { parseAttendanceJson } from './parseAttendanceJson'
import { extractJsonFromLlmText } from './visionLlm'

export const BULK_QUEUE_STATUS = {
  queued: 'queued',
  scanning: 'scanning',
  ready: 'ready',
  error: 'error',
  saved: 'saved',
}

export function createQueueItem({ id, fileName, previewUrl }) {
  return {
    id,
    fileName: fileName || 'Screenshot',
    previewUrl,
    status: BULK_QUEUE_STATUS.queued,
    progress: 0,
    stageLabel: '',
    error: '',
    meta: null,
    students: [],
    warnings: [],
    portalJson: '',
    parseMessage: '',
  }
}

export function queueItemClassLabel(meta) {
  if (!meta) return ''
  const parts = [meta.intake, meta.level, meta.qualification, meta.group].filter(Boolean)
  if (parts.length >= 2) return parts.join(' ')
  return meta.qualification || meta.module || 'Class'
}

function alignMetaWithRoster(meta, classes) {
  const scannedPt = isPartTimeQualification(meta.qualification)
  const matched = findMatchingClass(classes, {
    intake: Number(meta.intake) || null,
    level: Number(meta.level) || null,
    qualification: meta.qualification,
    group: Number(meta.group) || null,
  })
  if (!matched?.qualification) {
    return { meta, extraWarnings: [] }
  }

  const scannedQual = String(meta.qualification || '').trim()
  const rosterQual = matched.qualification || ''
  const rosterPt = isPartTimeQualification(rosterQual)
  const extraWarnings = []

  // False-positive PT from module codes (e.g. L5CPT) — align to full-time roster programme.
  if (scannedPt && !rosterPt && isLikelyFalsePartTimeFromModule(meta)) {
    extraWarnings.push('qualification_roster_sync')
    return {
      meta: { ...meta, qualification: rosterQual },
      matchedClassLabel: resolveImportClassLabel(meta, matched),
      extraWarnings,
    }
  }

  const qualMismatch = scannedQual && !qualificationBaseEqual(scannedQual, rosterQual)
  if (qualMismatch && !scannedPt) {
    extraWarnings.push('qualification_roster_sync')
    return {
      meta: { ...meta, qualification: rosterQual },
      matchedClassLabel: resolveImportClassLabel(meta, matched),
      extraWarnings,
    }
  }

  return {
    meta,
    matchedClassLabel: resolveImportClassLabel(meta, matched),
    extraWarnings: [],
  }
}

export function applyVisionResultToQueueItem(item, result, classes = []) {
  let parsed = result
  if (result?.portalJson) {
    const jsonText = extractJsonFromLlmText(result.portalJson)
    parsed = parseAttendanceJson(jsonText, { lenient: true, repairSession: true })
    parsed = { ...parsed, previewUrl: result.previewUrl ?? item.previewUrl }
  }

  const cm = parsed.meta?.classMeta
  let meta = syncPartTimeFromClassLabel(
    {
      intake: cm?.intake ?? '',
      level: cm?.level ?? '',
      qualification: cm?.qualification ?? parsed.meta?.classLabel ?? '',
      group: cm?.group ?? '',
      date: parsed.meta?.date || dateKey(),
      module: parsed.meta?.module || '',
      startTime: parsed.meta?.startTime || '',
      duration: parsed.meta?.duration || '',
    },
    parsed.meta?.classLabel ?? '',
  )

  const aligned = alignMetaWithRoster(meta, classes)
  meta = aligned.meta

  const enriched = enrichImportStudentsWithRoster(parsed.students ?? [], classes, meta).map(
    polishImportRow,
  )

  const warnings = [...(parsed.warnings ?? []), ...aligned.extraWarnings]
  const count = enriched.length
  let parseMessage = `Scanned ${count} Learning Partner${count === 1 ? '' : 's'}. Review, then save this session.`
  if (warnings.includes('missing_class')) {
    parseMessage =
      'Class header not detected — fill Intake, Level, Group, and Programme before saving.'
  } else if (warnings.includes('missing_module')) {
    parseMessage = `Scanned ${count} Learning Partner${count === 1 ? '' : 's'}. Module not detected — enter the module/subject line before saving.`
  }

  return {
    ...item,
    status: BULK_QUEUE_STATUS.ready,
    progress: 1,
    stageLabel: '',
    error: '',
    meta,
    students: [...enriched].sort((a, b) => a.name.localeCompare(b.name)),
    warnings,
    portalJson: result?.portalJson || '',
    previewUrl: parsed.previewUrl ?? item.previewUrl,
    parseMessage,
  }
}

export function countByStatus(items, status) {
  return items.filter((item) => item.status === status).length
}

/** All image files from a paste or drag-and-drop DataTransfer. */
export function imageFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return []
  const fromFiles = [...(dataTransfer.files || [])].filter((f) =>
    f.type?.startsWith('image/'),
  )
  if (fromFiles.length) return fromFiles
  return imageFilesFromClipboardData(dataTransfer)
}

/** Every image on the clipboard from a paste event (supports multiple items). */
export function imageFilesFromClipboardData(clipboardData) {
  if (!clipboardData?.items?.length) return []
  const files = []
  for (const item of clipboardData.items) {
    if (item.kind !== 'file' || !item.type?.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return files
}

/** Read all images via the async Clipboard API (when permitted). */
export async function imageFilesFromNavigatorClipboard() {
  if (!navigator.clipboard?.read) return []
  const files = []
  let n = 0
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      for (const type of item.types) {
        if (!type.startsWith('image/')) continue
        const blob =
          typeof item.getType === 'function'
            ? await item.getType(type)
            : await item.getAsType(type)
        n += 1
        files.push(
          new File([blob], `clipboard-${n}.png`, { type: blob.type || type }),
        )
      }
    }
  } catch {
    return []
  }
  return files
}

export function isEditablePasteTarget(element) {
  if (!element || typeof element !== 'object') return false
  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (element.isContentEditable) return true
  return !!element.closest?.(
    '.ant-input, .ant-input-number, .ant-picker, [contenteditable="true"]',
  )
}
