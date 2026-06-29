import { getEffectiveAbsenceCounts, manualOverridePatchAfterSession } from './attendanceStats'
import { normalizeName } from './nameMatching'

function formatCountDelta(before, after) {
  if (before == null || after == null) return null
  if (before === after) return String(after)
  return `${before} → ${after}`
}

function indexMarkStudents(markStudents = []) {
  const byNorm = new Map()
  const byId = new Map()
  for (const student of markStudents) {
    if (student.portalStudentId != null) {
      byId.set(student.portalStudentId, student)
    }
    const norm = normalizeName(student.name)
    if (norm) byNorm.set(norm, student)
  }
  return { byNorm, byId }
}

function indexPortalRosterPresent(portalStudents = []) {
  const map = new Map()
  for (const student of portalStudents) {
    if (student.present == null) continue
    const norm = normalizeName(student.name)
    if (norm) map.set(norm, student.present)
  }
  return map
}

function lookupMarkRow(item, { byNorm, byId }) {
  if (item.portalStudentId != null && byId.has(item.portalStudentId)) {
    return byId.get(item.portalStudentId)
  }
  if (item.portalName) {
    return byNorm.get(normalizeName(item.portalName)) ?? null
  }
  return null
}

function lookupStudentSummary(markRow, item, studentSummaries, portalRosterStudents = []) {
  const resolveSummary = (portalStudentId) => {
    if (portalStudentId == null) return null
    return (
      studentSummaries[portalStudentId] ??
      studentSummaries[String(portalStudentId)] ??
      null
    )
  }

  let portalStudentId = item.portalStudentId ?? markRow?.portalStudentId ?? null
  if (portalStudentId == null && item.portalName) {
    const target = normalizeName(item.portalName)
    const rosterMatch = (portalRosterStudents ?? []).find(
      (student) => normalizeName(student.name) === target,
    )
    portalStudentId = rosterMatch?.portalStudentId ?? null
  }

  return resolveSummary(portalStudentId)
}

function streakContinuationNote({ hubStreak, todayPortalPresent, afterStreak, syncMode }) {
  if (todayPortalPresent === true) {
    return hubStreak > 0 ? `Resets from ${hubStreak}` : 'Stays at 0'
  }
  if (todayPortalPresent === false) {
    const next = hubStreak + 1
    return `Continues → ${next}`
  }
  if (syncMode === 'overwrite' && afterStreak != null) {
    return `Set to ${afterStreak}`
  }
  return null
}

function computeTodaySessionPreview(hubStudent, hubStreak, hubTotal, todayPortalPresent) {
  if (!hubStudent || todayPortalPresent == null) return null
  const nextStatus = todayPortalPresent ? 'present' : 'absent'
  const patch = manualOverridePatchAfterSession(hubStudent, null, nextStatus)

  let afterStreak = hubStreak ?? 0
  let afterTotal = hubTotal ?? 0

  if (patch?.manualConsecutiveAbsences != null) {
    afterStreak = patch.manualConsecutiveAbsences
  } else if (nextStatus === 'present') {
    afterStreak = 0
  } else if (nextStatus === 'absent') {
    afterStreak = (hubStreak ?? 0) + 1
  }

  if (patch?.manualTotalAbsences != null) {
    afterTotal = patch.manualTotalAbsences
  } else if (nextStatus === 'absent') {
    afterTotal = (hubTotal ?? 0) + 1
  }

  return { afterStreak, afterTotal }
}

/**
 * Attach hub vs portal attendance comparison to roster review items.
 */
export function enrichReviewItemsWithMarkAttendance({
  items,
  hubClass,
  classAttendance,
  markStudents = [],
  studentSummaries = {},
  portalRosterStudents = [],
  syncMode = 'merge',
}) {
  const { byNorm, byId } = indexMarkStudents(markStudents)
  const todayPresentByNorm = indexPortalRosterPresent(portalRosterStudents)

  return items.map((item) => {
    const hubStudent =
      item.hubStudentId != null
        ? (hubClass?.students ?? []).find((student) => student.id === item.hubStudentId)
        : null
    const hubCounts = hubStudent
      ? getEffectiveAbsenceCounts(hubStudent, classAttendance ?? {})
      : null

    const markRow = lookupMarkRow(item, { byNorm, byId })
    const summary = lookupStudentSummary(markRow, item, studentSummaries, portalRosterStudents)
    const portalSessions = summary?.sessions ?? []

    const todayPortalPresent =
      item.portalName != null
        ? (todayPresentByNorm.get(normalizeName(item.portalName)) ?? null)
        : null

    const sessionPresent = portalSessions.filter((session) => session.status === 'P').length
    const sessionAbsent = portalSessions.filter((session) => session.status === 'A').length

    let portalPresent =
      portalSessions.length > 0 ? sessionPresent : (summary?.presentCount ?? null)
    let portalAbsent =
      portalSessions.length > 0 ? sessionAbsent : (summary?.absentCount ?? null)
    let portalStreak = summary?.consecutiveAbsent ?? null

    let portalAttendanceSource = null
    if (portalSessions.length > 0) {
      portalAttendanceSource = 'grid'
    } else if (portalPresent != null || portalAbsent != null) {
      portalAttendanceSource = summary?.moduleMatch === 'none' ? 'summary' : 'grid'
    }

    const portalPercent = summary?.percentPresent ?? markRow?.percentPresent ?? null

    const hubStreak = hubCounts?.consecutive ?? null
    const hubTotal = hubCounts?.total ?? null

    const todayPreview = computeTodaySessionPreview(
      hubStudent,
      hubStreak,
      hubTotal,
      todayPortalPresent,
    )

    const portalTargetStreak = portalStreak
    const portalTargetTotal = portalAbsent
    const hasOverallPortal =
      portalPresent != null || portalAbsent != null || portalStreak != null

    const afterStreak =
      syncMode === 'overwrite' && portalTargetStreak != null ? portalTargetStreak : hubStreak
    const afterTotal =
      syncMode === 'overwrite' && portalTargetTotal != null ? portalTargetTotal : hubTotal

    const previewStreak = hasOverallPortal ? portalTargetStreak : hubStreak
    const previewTotal = hasOverallPortal ? portalTargetTotal : hubTotal

    const streakWillChange =
      hasOverallPortal &&
      hubStreak != null &&
      previewStreak != null &&
      hubStreak !== previewStreak
    const totalWillChange =
      hasOverallPortal &&
      hubTotal != null &&
      previewTotal != null &&
      hubTotal !== previewTotal

    const streakNote = hasOverallPortal
      ? streakWillChange
        ? `Portal streak ${previewStreak} (hub ${hubStreak})`
        : totalWillChange
          ? `Portal total ${previewTotal} (hub ${hubTotal})`
          : 'Matches hub'
      : streakContinuationNote({
          hubStreak: hubStreak ?? 0,
          todayPortalPresent,
          afterStreak: todayPreview?.afterStreak ?? hubStreak,
          syncMode,
        })

    return {
      ...item,
      hubStreak,
      hubTotalAbsent: hubTotal,
      portalPresentDays: portalPresent,
      portalAbsentDays: portalAbsent,
      portalSessions,
      portalPercent,
      portalStreak,
      portalAttendanceSource,
      todayPortalPresent,
      todayPortalLabel:
        todayPortalPresent == null ? null : todayPortalPresent ? 'Present' : 'Absent',
      afterSyncStreak: afterStreak,
      afterSyncTotal: afterTotal,
      syncStreakDisplay: hasOverallPortal ? formatCountDelta(hubStreak, previewStreak) : null,
      syncTotalDisplay: hasOverallPortal ? formatCountDelta(hubTotal, previewTotal) : null,
      streakDelta: streakWillChange,
      totalDelta: totalWillChange,
      streakNote,
      attendanceOverwrite:
        syncMode === 'overwrite' &&
        hubStudent &&
        portalTargetTotal != null &&
        portalTargetStreak != null &&
        (totalWillChange || streakWillChange),
    }
  })
}

export function applySyncModeToReviewDraft(draft, syncMode = 'merge') {
  if (!draft || syncMode !== 'overwrite') {
    return { ...draft, syncMode: syncMode || 'merge' }
  }

  return {
    ...draft,
    syncMode: 'overwrite',
    sections: (draft.sections ?? []).map((section) => ({
      ...section,
      items: (section.items ?? []).map((item) => ({
        ...item,
        selected: item.canToggle ? true : item.selected,
      })),
    })),
  }
}

export function buildAttendanceOverwritePayload(draft) {
  if (draft?.syncMode !== 'overwrite') return []

  const updates = []
  for (const section of draft?.sections ?? []) {
    for (const item of section.items ?? []) {
      if (!item.attendanceOverwrite || !item.hubStudentId) continue
      if (item.portalAbsentDays == null || item.portalStreak == null) continue
      updates.push({
        classId: section.classId,
        studentId: item.hubStudentId,
        patch: {
          manualTotalAbsences: item.portalAbsentDays,
          manualConsecutiveAbsences: item.portalStreak,
        },
      })
    }
  }
  return updates
}
