import { findMatchingClass } from './classFormat'
import {
  findSimilarRosterMatches,
  formatSimilarityPercent,
  nameSimilarity,
  namesMatchBySpelling,
  normalizeName,
  similarityDisplayPercent,
} from './nameMatching'

/** Display % at or above this value: treat as exact match, keep scanned name (no Review). */
export const HIGH_CONFIDENCE_DISPLAY_MIN = 95

export function shouldAutoLinkSimilarScore(score) {
  return similarityDisplayPercent(score) >= HIGH_CONFIDENCE_DISPLAY_MIN
}

/**
 * @typedef {'exact' | 'similar_pending' | 'linked_roster' | 'new'} ImportMatchStatus
 */

/** True when two import rows refer to the same learning partner spelling. */
export function importRowsMatchByName(a, b) {
  return namesMatchBySpelling(a?.importName || a?.name, b?.importName || b?.name)
}

/** Stable row key for import tables (spelling match ignores case). */
export function importRowKey(row) {
  const name = normalizeName(row?.importName || row?.name)
  const index = row?.index ?? 0
  return name ? `${index}-${name}` : `row-${index}`
}

function mergeImportStudentRows(a, b) {
  const importName = a.importName || a.name || b.importName || b.name
  const rosterStudentId = a.rosterStudentId || b.rosterStudentId || null
  const matchStatus =
    a.matchStatus === 'exact' || b.matchStatus === 'exact'
      ? 'exact'
      : a.matchStatus === 'linked_roster' || b.matchStatus === 'linked_roster'
        ? 'linked_roster'
        : a.matchStatus === 'similar_pending' || b.matchStatus === 'similar_pending'
          ? 'similar_pending'
          : a.matchStatus || b.matchStatus

  return {
    ...a,
    index: Math.min(a.index ?? 9999, b.index ?? 9999),
    importName,
    name: importName,
    present: a.present && b.present,
    rosterStudentId,
    matchStatus,
    similarCandidates: a.similarCandidates?.length
      ? a.similarCandidates
      : b.similarCandidates || [],
    suggestedRosterId: a.suggestedRosterId ?? b.suggestedRosterId,
  }
}

/** Collapse duplicate scan rows that differ only by case/spacing. */
export function dedupeImportStudentsByName(students) {
  if (!students?.length) return []

  const order = []
  const byName = new Map()

  for (const row of students) {
    const key = normalizeName(row.importName || row.name)
    if (!key) continue

    if (!byName.has(key)) {
      order.push(key)
      byName.set(key, {
        ...row,
        importName: row.importName || row.name,
        name: row.importName || row.name,
      })
      continue
    }

    byName.set(key, mergeImportStudentRows(byName.get(key), row))
  }

  return order.map((key) => byName.get(key)).sort((a, b) => a.index - b.index)
}

/**
 * @param {object} row - import row with index, name, present
 * @param {object[]} rosterStudents
 */
export function matchImportRowToRoster(row, rosterStudents) {
  const importName = row.name?.trim() || ''

  const exact = (rosterStudents ?? []).find((st) =>
    namesMatchBySpelling(st.name, importName),
  )
  if (exact) {
    return autoResolveHighConfidenceMatch(row, { id: exact.id, name: exact.name })
  }

  const similarCandidates = findSimilarRosterMatches(importName, rosterStudents)
  if (similarCandidates.length) {
    const top = similarCandidates[0]

    if (shouldAutoLinkSimilarScore(top.score)) {
      return autoResolveHighConfidenceMatch(row, { id: top.id, name: top.name })
    }

    const second = similarCandidates[1]
    const clearWinner =
      !second || top.score - second.score >= 0.06 || top.score >= 0.94

    return {
      ...row,
      importName,
      name: importName,
      rosterStudentId: null,
      matchStatus: 'similar_pending',
      similarCandidates,
      suggestedRosterId: clearWinner ? top.id : null,
    }
  }

  return {
    ...row,
    importName,
    name: importName,
    rosterStudentId: null,
    matchStatus: 'new',
    similarCandidates: [],
  }
}

/** Keep manual similar-name resolutions when class meta or roster re-enrichment runs. */
export function mergeImportEnrichmentWithResolved(prevRows, enrichedRows) {
  const prevByNormName = new Map()
  for (const row of prevRows) {
    const key = normalizeName(row.importName || row.name)
    if (key && !prevByNormName.has(key)) {
      prevByNormName.set(key, row)
    }
  }
  const prevByIndex = new Map(prevRows.map((row) => [row.index, row]))

  return enrichedRows
    .map((fresh) => {
      const nameKey = normalizeName(fresh.importName || fresh.name)
      const prev =
        (nameKey && prevByNormName.get(nameKey)) || prevByIndex.get(fresh.index)

      if (!prev) return polishImportRow(fresh)

      if (prev.manualRosterResolution === 'new') {
        return polishImportRow(prev)
      }

      if (prev.matchStatus === 'linked_roster' && prev.rosterStudentId) {
        return polishImportRow({
          ...prev,
          manualRosterResolution: prev.manualRosterResolution ?? 'linked',
          linkedNameChoice:
            prev.linkedNameChoice ??
            (namesMatchBySpelling(prev.importName || prev.name, prev.name) ? 'scanned' : 'roster'),
        })
      }

      if (prev.matchStatus === 'exact' && prev.rosterStudentId) {
        return polishImportRow(prev)
      }

      return polishImportRow(fresh)
    })
    .map(polishImportRow)
}

export function enrichImportStudentsWithRoster(students, classes, classMeta) {
  const deduped = dedupeImportStudentsByName(students)
  const cls = findMatchingClass(classes, {
    intake: Number(classMeta?.intake) || null,
    level: Number(classMeta?.level) || null,
    qualification: classMeta?.qualification?.trim() || '',
    group: Number(classMeta?.group) || null,
  })

  if (!cls?.students?.length) {
    return deduped.map((row) => ({
      ...row,
      importName: row.importName || row.name,
      rosterStudentId: null,
      matchStatus: 'new',
      similarCandidates: [],
    }))
  }

  return deduped.map((row) => polishImportRow(matchImportRowToRoster(row, cls.students)))
}

export function polishImportRow(row) {
  return normalizeHighConfidenceLinkedRow(finalizeImportRowMatch(row))
}

/** Promote stale similar_pending rows that display at 95%+ to linked roster. */
export function finalizeImportRowMatch(row) {
  if (row.matchStatus !== 'similar_pending' || !row.similarCandidates?.length) {
    return row
  }
  const top = row.similarCandidates[0]
  if (!shouldAutoLinkSimilarScore(top.score)) return row
  return autoResolveHighConfidenceMatch(row, { id: top.id, name: top.name })
}

/** Upgrade old linked_roster rows that are 95%+ to single-line exact display. */
export function normalizeHighConfidenceLinkedRow(row) {
  if (row.matchStatus !== 'linked_roster' || !row.rosterStudentId) return row
  const scanned = row.importName || row.name
  if (shouldAutoLinkSimilarScore(nameSimilarity(scanned, row.name))) {
    return autoResolveHighConfidenceMatch(row, {
      id: row.rosterStudentId,
      name: row.name,
    })
  }
  return row
}

/** Strikethrough + roster name only for manual links under 95% similar. */
export function shouldShowRosterNameReplacement(row) {
  if (row.matchStatus !== 'linked_roster') return false
  if (row.linkedNameChoice === 'scanned') return false
  const scanned = row.importName || row.name
  return !shouldAutoLinkSimilarScore(nameSimilarity(scanned, row.name))
}

/** 95%+ match: keep scanned name, attach roster id for save (no Review). */
export function autoResolveHighConfidenceMatch(row, rosterStudent) {
  const importName = row.importName || row.name
  return {
    ...row,
    importName,
    name: importName,
    rosterStudentId: rosterStudent.id,
    matchStatus: 'exact',
    similarCandidates: [],
    suggestedRosterId: undefined,
  }
}

export function countSimilarPending(students) {
  return students.filter((row) => needsSimilarReviewWarning(row)).length
}

export function hasUnresolvedSimilarNames(students) {
  return students.some((row) => needsSimilarReviewWarning(row))
}

export function markImportRowAsNewStudent(row) {
  return {
    ...row,
    name: row.importName || row.name,
    rosterStudentId: null,
    matchStatus: 'new',
    linkedNameChoice: undefined,
    similarCandidates: [],
    suggestedRosterId: undefined,
    manualRosterResolution: 'new',
  }
}

export function topSimilarityScore(row) {
  return row.similarCandidates?.[0]?.score ?? 0
}

/** Row still needs manual similar-name resolution (display % under 95). */
export function needsSimilarReviewWarning(row) {
  if (row.matchStatus !== 'similar_pending') return false
  return !shouldAutoLinkSimilarScore(topSimilarityScore(row))
}

/** @param {'roster' | 'scanned'} nameChoice */
export function linkImportRowToRoster(row, rosterStudent, { nameChoice = 'roster' } = {}) {
  const importName = row.importName || row.name
  const useScannedName = nameChoice === 'scanned'

  return {
    ...row,
    importName,
    name: useScannedName ? importName : rosterStudent.name,
    rosterStudentId: rosterStudent.id,
    matchStatus: 'linked_roster',
    linkedNameChoice: nameChoice,
    similarCandidates: [],
    suggestedRosterId: undefined,
    manualRosterResolution: 'linked',
  }
}

/** Manual link / mark-new decisions can be reversed back into name review. */
export function canUndoImportNameResolution(row) {
  if (row?.manualRosterResolution === 'linked' || row?.manualRosterResolution === 'new') {
    return true
  }
  if (row?.matchStatus === 'linked_roster' && row?.rosterStudentId) {
    return true
  }
  return false
}

export function resolveImportRowRosterStudent(row, classes, classMeta) {
  if (!row?.rosterStudentId) return null
  const cls = findMatchingClass(classes, {
    intake: Number(classMeta?.intake) || null,
    level: Number(classMeta?.level) || null,
    qualification: classMeta?.qualification?.trim() || '',
    group: Number(classMeta?.group) || null,
  })
  return cls?.students?.find((student) => student.id === row.rosterStudentId) ?? null
}

/** Linked to roster but still showing the roster spelling — offer scanned name inline. */
export function canSwitchLinkedImportRowToScannedName(row) {
  if (!row?.rosterStudentId) return false
  if (row.linkedNameChoice === 'scanned') return false
  return shouldShowRosterNameReplacement(row)
}

/** Linked with scanned spelling — offer roster name inline. */
export function canSwitchLinkedImportRowToRosterName(row) {
  return (
    Boolean(row?.rosterStudentId) &&
    row?.matchStatus === 'linked_roster' &&
    row?.linkedNameChoice === 'scanned'
  )
}

/** Restore a manually resolved row to similar-name review (or new if no candidates). */
export function reopenImportRowForNameReview(row, rosterStudents) {
  const importName = row.importName || row.name
  const base = {
    ...row,
    importName,
    name: importName,
    rosterStudentId: null,
    linkedNameChoice: undefined,
    manualRosterResolution: undefined,
    similarCandidates: [],
    suggestedRosterId: undefined,
  }

  const similarCandidates = findSimilarRosterMatches(importName, rosterStudents)
  if (!similarCandidates.length) {
    return { ...base, matchStatus: 'new' }
  }

  const top = similarCandidates[0]
  const second = similarCandidates[1]
  const clearWinner =
    !second || top.score - second.score >= 0.06 || top.score >= 0.94

  return {
    ...base,
    matchStatus: 'similar_pending',
    similarCandidates,
    suggestedRosterId: clearWinner ? top.id : null,
  }
}

export function reopenImportRowForNameReviewInClass(row, classes, classMeta) {
  const cls = findMatchingClass(classes, {
    intake: Number(classMeta?.intake) || null,
    level: Number(classMeta?.level) || null,
    qualification: classMeta?.qualification?.trim() || '',
    group: Number(classMeta?.group) || null,
  })
  return reopenImportRowForNameReview(row, cls?.students ?? [])
}

export function similarMatchSummary(row) {
  const top = row.similarCandidates?.[0]
  if (!top) return ''
  return `Closest roster match: ${top.name} (${formatSimilarityPercent(top.score)} similar)`
}
