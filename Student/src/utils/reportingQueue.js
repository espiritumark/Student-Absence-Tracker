import { getAllAlerts } from './alerts'
import { getEffectiveAbsenceCounts } from './attendanceStats'
import { CONSECUTIVE_REPORT_DAYS, MONTH_REPORT_DAYS } from './alerts'
import { formatDateLabel } from './dates'

export function studentReportKey(classId, studentId) {
  return `${classId}:${studentId}`
}

export function parseStudentReportKey(key) {
  const raw = String(key || '')
  const idx = raw.indexOf(':')
  if (idx === -1) return { classId: '', studentId: '' }
  return {
    classId: raw.slice(0, idx),
    studentId: raw.slice(idx + 1),
  }
}

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

function alertRequiresOfficialReport(alert) {
  if (alert.type === 'month_no_notice') return true
  if (alert.severity === 'high') return true
  if (alert.streakLength >= CONSECUTIVE_REPORT_DAYS) return true
  return false
}

function pickPrimaryAlert(existing, next) {
  if (!existing) return next
  const existingRank = SEVERITY_RANK[existing.severity] ?? 9
  const nextRank = SEVERITY_RANK[next.severity] ?? 9
  if (nextRank < existingRank) return next
  if (nextRank > existingRank) return existing
  return (next.streakLength ?? 0) >= (existing.streakLength ?? 0) ? next : existing
}

/**
 * Students who must use the official violation report form (14+ consecutive days, etc.).
 */
export function buildReportCandidates(classes, attendance) {
  const alerts = getAllAlerts(classes, attendance)
  const byStudent = new Map()

  for (const alert of alerts) {
    if (!alertRequiresOfficialReport(alert)) continue
    const key = studentReportKey(alert.classId, alert.studentId)
    byStudent.set(key, pickPrimaryAlert(byStudent.get(key), alert))
  }

  return [...byStudent.values()]
    .map((alert) => {
      const cls = classes.find((c) => c.id === alert.classId)
      const student = cls?.students?.find((s) => s.id === alert.studentId)
      const classAttendance = attendance[alert.classId] || {}
      const counts = student
        ? getEffectiveAbsenceCounts(student, classAttendance)
        : { total: 0, consecutive: alert.streakLength ?? 0 }

      return {
        key: studentReportKey(alert.classId, alert.studentId),
        classId: alert.classId,
        studentId: alert.studentId,
        studentName: alert.studentName,
        className: alert.className,
        alertType: alert.type,
        alertMessage: alert.message,
        severity: alert.severity,
        streakLength: alert.streakLength ?? counts.consecutive,
        streakDays: alert.streakDays ?? [],
        totalAbsences: counts.total,
        consecutiveAbsences: counts.consecutive,
        usesManual: Boolean(
          counts.usesManualTotal || counts.usesManualConsecutive || student?.manualNoPriorNotice,
        ),
      }
    })
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
        b.streakLength - a.streakLength ||
        a.className.localeCompare(b.className) ||
        a.studentName.localeCompare(b.studentName),
    )
}

export function splitReportLists(candidates, reportedViolations = {}) {
  const pending = []
  const reported = []

  for (const candidate of candidates) {
    const record = reportedViolations[candidate.key]
    if (record) {
      reported.push({ ...candidate, ...record })
    } else {
      pending.push(candidate)
    }
  }

  reported.sort(
    (a, b) =>
      new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime() ||
      a.studentName.localeCompare(b.studentName),
  )

  return { pending, reported }
}

/**
 * Split unreported candidates between Dashboard (not yet opened) and Reporting tab queue.
 */
export function splitReportingWorkflow(candidates, reportedViolations = {}, reportingQueue = {}) {
  const { pending, reported } = splitReportLists(candidates, reportedViolations)
  const dashboardPending = []
  const reportingPending = []

  for (const candidate of pending) {
    const queueRecord = reportingQueue[candidate.key]
    if (queueRecord) {
      reportingPending.push({ ...candidate, queuedAt: queueRecord.queuedAt })
    } else {
      dashboardPending.push(candidate)
    }
  }

  reportingPending.sort(
    (a, b) =>
      new Date(b.queuedAt || 0).getTime() - new Date(a.queuedAt || 0).getTime() ||
      a.studentName.localeCompare(b.studentName),
  )

  return { dashboardPending, reportingPending, reported, pending }
}

export function isPendingReportStudent(classId, studentId, candidates, reportedViolations) {
  const key = studentReportKey(classId, studentId)
  if (reportedViolations[key]) return false
  return candidates.some((c) => c.key === key)
}

export function buildReportCopyFields(candidate) {
  const streakDates =
    candidate.streakDays?.length > 0
      ? candidate.streakDays.map((d) => formatDateLabel(d)).join(', ')
      : '—'

  return [
    { label: 'Student name', value: candidate.studentName },
    { label: 'Class', value: candidate.className },
    { label: 'Consecutive absence days', value: String(candidate.consecutiveAbsences ?? candidate.streakLength) },
    { label: 'Total absences', value: String(candidate.totalAbsences ?? 0) },
    { label: 'Policy trigger', value: candidate.alertMessage },
    { label: 'Recent absence dates', value: streakDates },
  ]
}
