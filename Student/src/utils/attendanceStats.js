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

/**
 * Preview roster streak/total before and after saving one session.
 * Present on the session date resets an active streak; absent can extend it.
 */
export function previewRosterImpact(
  student,
  classAttendance,
  projectedAttendance,
  sessionDateKey,
  prevSessionStatus,
  nextSessionStatus,
) {
  const beforeCounts = getEffectiveAbsenceCounts(student, classAttendance)
  const afterCounts = getEffectiveAbsenceCounts(student, projectedAttendance)
  const beforeAbsent = new Set(beforeCounts.recorded.absentDays)
  const afterAbsent = new Set(getStudentAbsenceStats(projectedAttendance, student.id).absentDays)

  let beforeStreak = 0
  let afterStreak = 0

  if (nextSessionStatus === 'present') {
    // Match roster consecutive; present clears an active streak in the preview.
    beforeStreak = beforeCounts.consecutive
    afterStreak = 0
  } else {
    if (prevSessionStatus === 'absent') {
      beforeStreak = streakEndingOn(sessionDateKey, beforeAbsent)
    } else if (prevSessionStatus == null) {
      beforeStreak = streakEndingOn(addDaysToKey(sessionDateKey, -1), beforeAbsent)
    }

    afterStreak = streakEndingOn(sessionDateKey, afterAbsent)
    if (afterStreak === 0) {
      const yesterday = addDaysToKey(sessionDateKey, -1)
      const yesterdayStreak = streakEndingOn(yesterday, afterAbsent)
      afterStreak = yesterdayStreak > 0 ? yesterdayStreak + 1 : 1
    }
  }

  const beforeTotal = beforeCounts.total
  const afterTotal = afterCounts.total

  return { beforeStreak, afterStreak, beforeTotal, afterTotal }
}

export function getEffectiveAbsenceCounts(student, classAttendance) {
  const recorded = getStudentAbsenceStats(classAttendance, student.id)
  const hasManualTotal = student.manualTotalAbsences != null
  const hasManualConsecutive = student.manualConsecutiveAbsences != null

  return {
    recorded,
    total: hasManualTotal ? student.manualTotalAbsences : recorded.total,
    consecutive: hasManualConsecutive
      ? student.manualConsecutiveAbsences
      : recorded.consecutive,
    usesManualTotal: hasManualTotal,
    usesManualConsecutive: hasManualConsecutive,
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
