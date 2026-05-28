import { formatClassLabel } from './classFormat'
import { getStudentAbsenceStats } from './attendanceStats'
import { isConsecutiveDays, parseDateKey, weekKey } from './dates'

const CONSECUTIVE_WEEKS_DAYS = 14
const MONTH_DAYS = 30

function getDayStreak(sortedAbsentKeys) {
  if (!sortedAbsentKeys.length) {
    return { length: 0, days: [] }
  }

  let best = { length: 1, days: [sortedAbsentKeys[0]] }
  let current = { length: 1, days: [sortedAbsentKeys[0]] }

  for (let i = 1; i < sortedAbsentKeys.length; i++) {
    const d = sortedAbsentKeys[i]
    if (isConsecutiveDays(current.days[current.days.length - 1], d)) {
      current.days.push(d)
      current.length += 1
    } else {
      current = { length: 1, days: [d] }
    }
    if (current.length > best.length) best = { ...current, days: [...current.days] }
  }

  const recent = sortedAbsentKeys[sortedAbsentKeys.length - 1]
  let recentLen = 1
  const recentDays = [recent]
  for (let i = sortedAbsentKeys.length - 2; i >= 0; i--) {
    if (isConsecutiveDays(sortedAbsentKeys[i], recentDays[0])) {
      recentDays.unshift(sortedAbsentKeys[i])
      recentLen += 1
    } else break
  }

  return recentLen >= best.length
    ? { length: recentLen, days: recentDays }
    : best
}

function getAbsentWeeks(classAttendance, studentId) {
  const byWeek = {}
  for (const [dayKey, session] of Object.entries(classAttendance || {})) {
    const rec = session?.records?.[studentId] ?? session?.[studentId]
    if (rec?.status !== 'absent') continue
    const wk = weekKey(parseDateKey(dayKey))
    if (!byWeek[wk]) byWeek[wk] = { absent: 0, total: 0, noNotice: true }
    byWeek[wk].absent += 1
    byWeek[wk].total += 1
    if (rec.priorNotice) byWeek[wk].noNotice = false
  }
  return Object.entries(byWeek)
    .filter(([, v]) => v.absent > 0 && v.absent === v.total)
    .map(([wk]) => wk)
    .sort((a, b) => parseDateKey(a) - parseDateKey(b))
}

function getConsecutiveWeekStreak(weekKeys) {
  if (!weekKeys.length) return { length: 0, weeks: [] }
  let best = { length: 1, weeks: [weekKeys[0]] }
  let cur = { length: 1, weeks: [weekKeys[0]] }
  for (let i = 1; i < weekKeys.length; i++) {
    const prev = parseDateKey(weekKeys[i - 1])
    const next = parseDateKey(weekKeys[i])
    const diff = Math.round((next - prev) / (7 * 24 * 60 * 60 * 1000))
    if (diff === 1) {
      cur.weeks.push(weekKeys[i])
      cur.length += 1
    } else {
      cur = { length: 1, weeks: [weekKeys[i]] }
    }
    if (cur.length > best.length) best = { ...cur, weeks: [...cur.weeks] }
  }
  return best
}

export function evaluateStudentAlerts({
  student,
  classId,
  className,
  classAttendance,
}) {
  const studentId = student.id
  const studentName = student.name
  const stats = getStudentAbsenceStats(classAttendance, studentId)
  const sorted = stats.absentDays

  const noticeByDay = {}
  for (const dayKey of sorted) {
    const rec =
      classAttendance[dayKey]?.records?.[studentId] ??
      classAttendance[dayKey]?.[studentId]
    noticeByDay[dayKey] = Boolean(rec?.priorNotice)
  }

  const dayStreak = getDayStreak(sorted)
  const usesManualConsecutive = student.manualConsecutiveAbsences != null
  const consecutive = usesManualConsecutive
    ? student.manualConsecutiveAbsences
    : dayStreak.length

  const alerts = []
  const manualNote = usesManualConsecutive ? ' (manual count)' : ''

  if (consecutive >= CONSECUTIVE_WEEKS_DAYS) {
    alerts.push({
      id: `${classId}-${studentId}-consecutive-days`,
      type: 'consecutive_weeks',
      severity: consecutive >= MONTH_DAYS ? 'high' : 'medium',
      studentId,
      studentName,
      classId,
      className,
      streakDays: dayStreak.days,
      streakLength: consecutive,
      message: `Absent ${consecutive} consecutive days (2+ weeks)${manualNote}`,
    })
  }

  const noNoticeFromRecords =
    dayStreak.length >= MONTH_DAYS &&
    dayStreak.days.every((d) => !noticeByDay[d])
  const noNoticeManual =
    usesManualConsecutive &&
    consecutive >= MONTH_DAYS &&
    student.manualNoPriorNotice

  if (noNoticeFromRecords || noNoticeManual) {
    const len = usesManualConsecutive ? consecutive : dayStreak.length
    alerts.push({
      id: `${classId}-${studentId}-month-no-notice`,
      type: 'month_no_notice',
      severity: 'high',
      studentId,
      studentName,
      classId,
      className,
      streakDays: dayStreak.days,
      streakLength: len,
      message: `Absent ~1 month (${len} days) with no prior notice${noNoticeManual ? ' (manual)' : ''}`,
    })
  }

  const absentWeeks = getAbsentWeeks(classAttendance, studentId)
  const weekStreak = getConsecutiveWeekStreak(absentWeeks)
  if (
    weekStreak.length >= 2 &&
    consecutive < CONSECUTIVE_WEEKS_DAYS &&
    !usesManualConsecutive
  ) {
    alerts.push({
      id: `${classId}-${studentId}-consecutive-weeks`,
      type: 'consecutive_weeks',
      severity: 'medium',
      studentId,
      studentName,
      classId,
      className,
      streakWeeks: weekStreak.weeks,
      streakLength: weekStreak.length,
      message: `Absent every recorded session for ${weekStreak.length} consecutive weeks`,
    })
  }

  return alerts
}

export function getAllAlerts(classes, attendance) {
  const all = []
  for (const cls of classes) {
    const classAttendance = attendance[cls.id] || {}
    const className = formatClassLabel(cls)
    for (const student of cls.students) {
      all.push(
        ...evaluateStudentAlerts({
          student,
          classId: cls.id,
          className,
          classAttendance,
        }),
      )
    }
  }
  const severityOrder = { high: 0, medium: 1, low: 2 }
  return all.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) ||
      a.className.localeCompare(b.className) ||
      a.studentName.localeCompare(b.studentName),
  )
}
