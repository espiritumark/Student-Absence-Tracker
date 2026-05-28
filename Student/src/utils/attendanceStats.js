import { isConsecutiveDays, parseDateKey } from './dates'

export function getStudentAbsenceStats(classAttendance, studentId) {
  const absentDays = []

  for (const [dayKey, session] of Object.entries(classAttendance || {})) {
    const rec = session?.records?.[studentId] ?? session?.[studentId]
    if (rec?.status === 'absent') absentDays.push(dayKey)
  }

  const sorted = [...absentDays].sort(
    (a, b) => parseDateKey(a) - parseDateKey(b),
  )

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
