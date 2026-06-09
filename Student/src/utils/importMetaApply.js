import {
  findMatchingClass,
  isLikelyFalsePartTimeFromModule,
  isPartTimeQualification,
  qualificationBaseEqual,
  resolveImportClassLabel,
} from './classFormat'
import {
  enrichImportStudentsWithRoster,
  mergeImportEnrichmentWithResolved,
  polishImportRow,
} from './importNameResolution'

export const CLASS_HEADER_FIELDS = ['intake', 'level', 'group', 'qualification']

export const SESSION_META_FIELDS = [
  ...CLASS_HEADER_FIELDS,
  'date',
  'module',
  'startTime',
  'duration',
]

export function copyImportMeta(meta) {
  return {
    intake: meta?.intake ?? '',
    level: meta?.level ?? '',
    qualification: meta?.qualification ?? '',
    group: meta?.group ?? '',
    date: meta?.date ?? '',
    module: meta?.module ?? '',
    startTime: meta?.startTime ?? '',
    duration: meta?.duration ?? '',
  }
}

export function isClassHeaderComplete(meta) {
  return CLASS_HEADER_FIELDS.every((field) => String(meta?.[field] ?? '').trim() !== '')
}

export function patchTouchesClassHeader(patch) {
  return CLASS_HEADER_FIELDS.some((field) => field in patch)
}

export function importMetaIsDirty(current, scanned) {
  if (!scanned) return false
  const live = copyImportMeta(current)
  const original = copyImportMeta(scanned)
  return SESSION_META_FIELDS.some(
    (field) => String(live[field] ?? '') !== String(original[field] ?? ''),
  )
}

export function alignMetaWithRoster(meta, classes) {
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

export function validateImportClassMatch(meta, classes) {
  if (!isClassHeaderComplete(meta)) {
    return { ok: true, matchedClass: null, incomplete: true }
  }

  const matchedClass = findMatchingClass(classes, {
    intake: Number(meta.intake) || null,
    level: Number(meta.level) || null,
    qualification: String(meta.qualification || '').trim(),
    group: Number(meta.group) || null,
  })

  if (!matchedClass) {
    return {
      ok: false,
      matchedClass: null,
      error:
        'No matching class found in your saved classes. Check Intake, Level, Group, and Programme against an existing class, then try again.',
    }
  }

  return {
    ok: true,
    matchedClass,
    matchedClassLabel: resolveImportClassLabel(meta, matchedClass),
  }
}

export function refreshImportWarnings(warnings, meta, classes) {
  const list = [...(warnings || [])].filter((warning) => warning !== 'missing_class')
  const validation = validateImportClassMatch(meta, classes)
  if (validation.incomplete || !validation.ok) {
    list.push('missing_class')
  }
  return list
}

export function reEnrichImportStudents(students, meta, classes) {
  if (!students?.length) return students
  const base = students.map((row) => ({
    index: row.index,
    name: row.importName || row.name,
    present: row.present,
  }))
  const enriched = enrichImportStudentsWithRoster(base, classes, meta)
  return mergeImportEnrichmentWithResolved(students, enriched).map(polishImportRow)
}

export function applyImportMetaChange({
  currentMeta,
  patch,
  classes,
  students = [],
  warnings = [],
}) {
  const nextMeta = { ...copyImportMeta(currentMeta), ...patch }
  const touchesHeader = patchTouchesClassHeader(patch)

  if (!touchesHeader) {
    return {
      ok: true,
      nextMeta,
      nextStudents: reEnrichImportStudents(students, nextMeta, classes),
      nextWarnings: refreshImportWarnings(warnings, nextMeta, classes),
    }
  }

  const aligned = alignMetaWithRoster(nextMeta, classes)
  const meta = aligned.meta

  if (isClassHeaderComplete(meta)) {
    const validation = validateImportClassMatch(meta, classes)
    if (!validation.ok) {
      return { ok: false, error: validation.error }
    }
  }

  const nextWarnings = refreshImportWarnings(
    [
      ...(warnings || []).filter((warning) => warning !== 'qualification_roster_sync'),
      ...aligned.extraWarnings,
    ],
    meta,
    classes,
  )

  return {
    ok: true,
    nextMeta: meta,
    nextStudents: reEnrichImportStudents(students, meta, classes),
    nextWarnings,
    matchedClass: validateImportClassMatch(meta, classes).matchedClass,
    matchedClassLabel: aligned.matchedClassLabel,
    classMatched: isClassHeaderComplete(meta),
  }
}
