import { formatClassLabel } from './classFormat'
import { compareAbsenceRisk, getOverallAbsenceRisk } from './absenceRisk'
import { addDaysToKey, isConsecutiveDays, parseDateKey } from './dates'
import {
  filterAttendanceByModule,
  sessionDateFromKey,
  listAbsentModulesForStudent,
} from './sessionKeys'

export function getStudentAbsenceStats(classAttendance, studentId) {
  const absentDates = new Set()

  for (const [sessionKey, session] of Object.entries(classAttendance || {})) {
    const rec = session?.records?.[studentId] ?? session?.[studentId]
    if (rec?.status === 'absent') {
      absentDates.add(sessionDateFromKey(sessionKey))
    }
  }

  const sorted = [...absentDates].sort((a, b) => parseDateKey(a) - parseDateKey(b))

  let consecutive = 0
  if (sorted.length) {
    let cur = 1
    let best = 1
    for (let i = 1; i < sorted.length; i++) {
      if (isConsecutiveDays(sorted[i - 1], sorted[i])) {
        cur += 1
      } else {
        cur = 1
      }
      if (cur > best) best = cur
    }
    let recent = 1
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (isConsecutiveDays(sorted[i], sorted[i + 1])) recent += 1
      else break
    }
    consecutive = Math.max(best, recent)
  }

  return {
    total: sorted.length,
    consecutive,
    absentDays: sorted,
  }
}

/** Consecutive absent days ending on `dayKey` (inclusive). */
export function streakEndingOn(dayKey, absentDayKeys) {
  const absentSet = absentDayKeys instanceof Set ? absentDayKeys : new Set(absentDayKeys)
  if (!dayKey || !absentSet.has(dayKey)) return 0

  let streak = 1
  let cursor = dayKey
  while (absentSet.has(addDaysToKey(cursor, -1))) {
    streak += 1
    cursor = addDaysToKey(cursor, -1)
  }
  return streak
}

/** Coerce DB/local manual counts to numbers (avoids "5" + 1 → "51"). */
export function asManualCount(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Adjust manual roster overrides when a session status is saved.
 * Manual streak increments on a new absent mark and resets on present.
 */
export function manualOverridePatchAfterSession(student, prevStatus, nextStatus) {
  const manualStreak = asManualCount(student.manualConsecutiveAbsences)
  const manualTotal = asManualCount(student.manualTotalAbsences)
  if (manualStreak == null && manualTotal == null) return null

  const wasPresent = prevStatus == null || prevStatus === 'present'
  const patch = {}

  if (manualStreak != null) {
    if (nextStatus === 'present') {
      if (manualStreak !== 0) patch.manualConsecutiveAbsences = 0
    } else if (nextStatus === 'absent' && wasPresent) {
      patch.manualConsecutiveAbsences = manualStreak + 1
    }
  }

  if (manualTotal != null) {
    if (nextStatus === 'absent' && wasPresent) {
      patch.manualTotalAbsences = manualTotal + 1
    }
  }

  return Object.keys(patch).length ? patch : null
}

/** All manual roster patches when session records change (import / manual save). */
export function collectRosterPatchesForSession(students, priorRecords, nextRecords) {
  const updates = []
  for (const st of students || []) {
    const prev = priorRecords[st.id]?.status ?? null
    const next = nextRecords[st.id]?.status ?? null
    if (next == null || prev === next) continue
    const patch = manualOverridePatchAfterSession(st, prev, next)
    if (patch) updates.push({ studentId: st.id, patch })
  }
  return updates
}

export function applyStudentPatches(students, updates) {
  if (!updates.length) return students
  const patchById = Object.fromEntries(updates.map((u) => [u.studentId, u.patch]))
  return students.map((st) => (patchById[st.id] ? { ...st, ...patchById[st.id] } : st))
}

function projectedManualCounts(student, prevSessionStatus, nextSessionStatus) {
  const patch = manualOverridePatchAfterSession(student, prevSessionStatus, nextSessionStatus)
  const manualStreak = asManualCount(student.manualConsecutiveAbsences)
  const manualTotal = asManualCount(student.manualTotalAbsences)
  return {
    streak: patch?.manualConsecutiveAbsences ?? manualStreak,
    total: patch?.manualTotalAbsences ?? manualTotal,
  }
}

export function previewRosterImpact(
  student,
  classAttendance,
  projectedAttendance,
  _sessionDateKey,
  prevSessionStatus,
  nextSessionStatus,
) {
  const beforeCounts = getEffectiveAbsenceCounts(student, classAttendance)
  const afterRecorded = getStudentAbsenceStats(projectedAttendance, student.id)
  const manualAfter = projectedManualCounts(student, prevSessionStatus, nextSessionStatus)

  let beforeStreak = 0
  let afterStreak = 0

  const hasManualStreak = asManualCount(student.manualConsecutiveAbsences) != null
  const hasManualTotal = asManualCount(student.manualTotalAbsences) != null

  if (nextSessionStatus === 'present') {
    beforeStreak = beforeCounts.consecutive
    afterStreak = hasManualStreak ? (manualAfter.streak ?? 0) : afterRecorded.consecutive
  } else {
    beforeStreak = beforeCounts.consecutive
    afterStreak = hasManualStreak ? (manualAfter.streak ?? beforeStreak) : afterRecorded.consecutive
  }

  const beforeTotal = beforeCounts.total
  const afterTotal = hasManualTotal ? (manualAfter.total ?? beforeTotal) : afterRecorded.total

  return { beforeStreak, afterStreak, beforeTotal, afterTotal }
}

export function getEffectiveAbsenceCounts(student, classAttendance) {
  const recorded = getStudentAbsenceStats(classAttendance, student.id)
  const manualTotal = asManualCount(student.manualTotalAbsences)
  const manualConsecutive = asManualCount(student.manualConsecutiveAbsences)

  return {
    recorded,
    total: manualTotal != null ? manualTotal : recorded.total,
    consecutive: manualConsecutive != null ? manualConsecutive : recorded.consecutive,
    usesManualTotal: manualTotal != null,
    usesManualConsecutive: manualConsecutive != null,
  }
}

/**
 * All students with at least one recorded or manual absence count, sorted highest first.
 */
export function getAllStudentAbsenceSummaries(classes, attendance) {
  const rows = []

  for (const cls of classes) {
    const classAttendance = attendance[cls.id] || {}
    const className = formatClassLabel(cls)

    for (const student of cls.students ?? []) {
      const counts = getEffectiveAbsenceCounts(student, classAttendance)
      if (counts.total <= 0 && counts.consecutive <= 0) continue

      const absentModules = listAbsentModulesForStudent(classAttendance, student.id)

      rows.push({
        id: `${cls.id}-${student.id}`,
        studentId: student.id,
        studentName: student.name,
        classId: cls.id,
        className,
        absentModules,
        total: counts.total,
        consecutive: counts.consecutive,
        usesManualTotal: counts.usesManualTotal,
        usesManualConsecutive: counts.usesManualConsecutive,
        risk: getOverallAbsenceRisk(counts),
      })
    }
  }

  return rows.sort((a, b) => compareAbsenceRisk(a, b))
}

/**
 * Students at watch level or above (Safe tier excluded), optionally scoped to one module.
 */
export function getAtRiskStudentSummaries(classes, attendance, options = {}) {
  const { moduleFilter = '' } = options
  const rows = []

  for (const cls of classes) {
    const classAttendance = attendance[cls.id] || {}
    const scopedAttendance = moduleFilter
      ? filterAttendanceByModule(classAttendance, moduleFilter)
      : classAttendance

    if (moduleFilter && Object.keys(scopedAttendance).length === 0) continue

    const className = formatClassLabel(cls)

    for (const student of cls.students ?? []) {
      const counts = getEffectiveAbsenceCounts(student, scopedAttendance)
      if (counts.total <= 0 && counts.consecutive <= 0) continue

      const risk = getOverallAbsenceRisk(counts)
      if (risk === 'safe') continue

      const absentModules = listAbsentModulesForStudent(
        moduleFilter ? scopedAttendance : classAttendance,
        student.id,
      )

      rows.push({
        id: `${cls.id}-${student.id}`,
        studentId: student.id,
        studentName: student.name,
        classId: cls.id,
        className,
        absentModules,
        total: counts.total,
        consecutive: counts.consecutive,
        usesManualTotal: counts.usesManualTotal,
        usesManualConsecutive: counts.usesManualConsecutive,
        risk,
      })
    }
  }

  return rows.sort((a, b) => compareAbsenceRisk(a, b))
}
