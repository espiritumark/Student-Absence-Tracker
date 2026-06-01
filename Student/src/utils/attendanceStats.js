import { formatClassLabel } from './classFormat'
import { compareAbsenceRisk, getOverallAbsenceRisk } from './absenceRisk'
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

/**
 * All students with at least one recorded or manual absence count, sorted highest first.
 */
export function getAllStudentAbsenceSummaries(classes, attendance) {
  const rows = []

  for (const cls of classes) {
    const classAttendance = attendance[cls.id] || {}
    const className = formatClassLabel(cls)

    for (const student of cls.students) {
      const counts = getEffectiveAbsenceCounts(student, classAttendance)
      if (counts.total <= 0 && counts.consecutive <= 0) continue

      rows.push({
        id: `${cls.id}-${student.id}`,
        studentId: student.id,
        studentName: student.name,
        classId: cls.id,
        className,
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
