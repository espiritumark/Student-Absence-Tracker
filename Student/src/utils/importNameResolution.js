import { findMatchingClass } from './classFormat'
import { normalizeName } from './nameMatching'
import {
  findSimilarRosterMatches,
  formatSimilarityPercent,
  nameSimilarity,
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

/**
 * @param {object} row - import row with index, name, present
 * @param {object[]} rosterStudents
 */
export function matchImportRowToRoster(row, rosterStudents) {
  const importName = row.name?.trim() || ''
  const normalizedImport = normalizeName(importName)

  const exact = (rosterStudents ?? []).find(
    (st) => normalizeName(st.name) === normalizedImport,
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
  return enrichedRows
    .map((fresh) => {
      const prev = prevRows.find(
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
    })
    .map(polishImportRow)
}

export function enrichImportStudentsWithRoster(students, classes, classMeta) {
  const cls = findMatchingClass(classes, {
    intake: Number(classMeta?.intake) || null,
    level: Number(classMeta?.level) || null,
    qualification: classMeta?.qualification?.trim() || '',
    group: Number(classMeta?.group) || null,
  })

  if (!cls?.students?.length) {
    return students.map((row) => ({
      ...row,
      importName: row.name,
      rosterStudentId: null,
      matchStatus: 'new',
      similarCandidates: [],
    }))
  }

  return students.map((row) => polishImportRow(matchImportRowToRoster(row, cls.students)))
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

export function linkImportRowToRoster(row, rosterStudent) {
  return {
    ...row,
    name: rosterStudent.name,
    rosterStudentId: rosterStudent.id,
    matchStatus: 'linked_roster',
    similarCandidates: [],
    suggestedRosterId: undefined,
  }
}

export function markImportRowAsNewStudent(row) {
  return {
    ...row,
    name: row.importName || row.name,
    rosterStudentId: null,
    matchStatus: 'new',
    similarCandidates: [],
    suggestedRosterId: undefined,
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

export function similarMatchSummary(row) {
  const top = row.similarCandidates?.[0]
  if (!top) return ''
  return `Closest roster match: ${top.name} (${formatSimilarityPercent(top.score)} similar)`
}
