import { computeImportSaveSummary } from './importReview'
import { normalizeName } from './nameMatching'
import { buildPortalAttendanceImportPayload } from './portalAttendanceImport'

export function buildPortalAttendancePreview(hubClass, portalPage, classes, attendance) {
  const payload = buildPortalAttendanceImportPayload(hubClass, portalPage)
  const summary = computeImportSaveSummary(payload, classes, attendance)

  const summaryWithCaps = {
    ...summary,
    studentRows: (summary.studentRows ?? []).map((row) => ({
      ...row,
      name: normalizeName(row.name),
    })),
  }

  return { payload, summary: summaryWithCaps }
}

export function buildPortalAttendanceReviewDraft({ payload, summary }) {
  const rowByKey = new Map((summary?.studentRows ?? []).map((row) => [row.key, row]))

  const items = (payload?.students ?? []).map((student) => {
    const reviewRow = rowByKey.get(student.rosterStudentId)
    const isAbsent = !student.present

    return {
      id: student.rosterStudentId,
      studentId: student.rosterStudentId,
      name: normalizeName(student.name),
      previousLabel: reviewRow?.previousLabel ?? '—',
      nextLabel: reviewRow?.nextLabel ?? (isAbsent ? 'Absent' : 'Present'),
      changeLabel:
        reviewRow?.changeLabel ?? (isAbsent ? 'Mark absent from portal' : 'Present on portal'),
      changeType: reviewRow?.changeType ?? (isAbsent ? 'new_absent' : 'unchanged'),
      rosterStreak: reviewRow?.rosterStreak ?? null,
      rosterTotal: reviewRow?.rosterTotal ?? null,
      rosterStreakDelta: reviewRow?.rosterStreakDelta ?? false,
      rosterTotalDelta: reviewRow?.rosterTotalDelta ?? false,
      present: student.present,
      selected: true,
      canToggle: true,
    }
  })

  items.sort((a, b) => {
    if (a.present !== b.present) return a.present ? 1 : -1
    if (Boolean(a.rosterStreakDelta) !== Boolean(b.rosterStreakDelta)) {
      return a.rosterStreakDelta ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return {
    payload,
    summary,
    items,
    unmatched: payload?.unmatched ?? [],
  }
}

export function summarizeAttendanceReviewDraft(draft) {
  const items = draft?.items ?? []
  const selected = items.filter((item) => item.selected)
  return {
    total: items.length,
    selected: selected.length,
    absent: selected.filter((item) => !item.present).length,
    present: selected.filter((item) => item.present).length,
    streakChanges: selected.filter((item) => item.rosterStreakDelta).length,
    totalChanges: selected.filter((item) => item.rosterTotalDelta).length,
    unmatched: draft?.unmatched?.length ?? 0,
  }
}

export function buildApplyPayloadFromAttendanceReview(draft) {
  const selectedIds = new Set(
    (draft?.items ?? []).filter((item) => item.selected).map((item) => item.studentId),
  )
  const students = (draft?.payload?.students ?? []).filter((student) =>
    selectedIds.has(student.rosterStudentId),
  )

  if (!students.length) {
    throw new Error('Select at least one Learning Partner to merge from the portal.')
  }

  return {
    ...draft.payload,
    students,
    absentCount: students.filter((row) => !row.present).length,
    presentCount: students.filter((row) => row.present).length,
  }
}
