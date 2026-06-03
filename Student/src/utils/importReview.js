import { findMatchingClass, formatClassLabel } from './classFormat'
import { previewRosterImpact } from './attendanceStats'
import { UI } from './uiCopy'
import { findSessionKey, makeSessionKey, normalizeModuleKey } from './sessionKeys'
import { normalizeName } from './nameMatching'

export { normalizeName } from './nameMatching'

function statusLabel(status) {
  if (status === 'absent') return 'Absent'
  if (status === 'present') return 'Present'
  return '—'
}

function buildProjectedAttendance(classAttendance, sessionKey, payload, recordPatch) {
  const existingSession = classAttendance[sessionKey] || {}
  return {
    ...classAttendance,
    [sessionKey]: {
      ...existingSession,
      module: payload.module,
      startTime: payload.startTime,
      duration: payload.duration,
      records: {
        ...(existingSession.records || {}),
        ...recordPatch,
      },
    },
  }
}

function formatCountDelta(before, after) {
  if (before === after) return String(before)
  return `${before} → ${after}`
}

function shouldShowStudentInConfirm({ existingId, nextStatus, impact, prevStatus }) {
  if (!existingId) {
    return nextStatus === 'absent'
  }

  if (!impact) {
    return nextStatus === 'absent' && (prevStatus == null || prevStatus === 'present')
  }

  if (
    nextStatus === 'present' &&
    impact.beforeStreak > 0 &&
    impact.afterStreak < impact.beforeStreak
  ) {
    return true
  }

  // Always show new absent marks even when calendar streak/total already counted (e.g. second module same day).
  if (nextStatus === 'absent' && (prevStatus == null || prevStatus === 'present')) {
    return true
  }

  return impact.beforeStreak !== impact.afterStreak || impact.beforeTotal !== impact.afterTotal
}

function prepareImportSummaryContext(
  { classMeta, date, module, startTime, duration, students: incoming },
  classes,
  attendance,
) {
  const cls = findMatchingClass(classes, classMeta)
  const classId = cls?.id ?? null
  const classAttendance = classId ? attendance?.[classId] || {} : {}
  const sessionKey = classId
    ? findSessionKey(classAttendance, date, module)
    : makeSessionKey(date, module)
  const existingSession = classId && sessionKey ? classAttendance[sessionKey] : null
  const existingRecords = existingSession?.records ?? null
  const hasExistingSession = Boolean(
    existingRecords && Object.keys(existingRecords).length > 0,
  )

  const classLabel = cls ? formatClassLabel(cls) : formatClassLabel(classMeta)
  const moduleLabel = normalizeModuleKey(module) || 'General session'
  const nameToId = new Map((cls?.students ?? []).map((st) => [normalizeName(st.name), st.id]))
  const nameToStudent = new Map((cls?.students ?? []).map((st) => [normalizeName(st.name), st]))
  const idToStudent = new Map((cls?.students ?? []).map((st) => [st.id, st]))

  const baseRecordPatch = {}
  for (const row of incoming) {
    const nameKey = normalizeName(row.name)
    const existingId = row.rosterStudentId || nameToId.get(nameKey) || null
    const nextStatus = row.present ? 'present' : 'absent'
    if (existingId) {
      baseRecordPatch[existingId] = { status: nextStatus, priorNotice: false }
    }
  }

  const projectedAttendance =
    classId && sessionKey
      ? buildProjectedAttendance(
          classAttendance,
          sessionKey,
          { module, startTime, duration },
          baseRecordPatch,
        )
      : classAttendance

  return {
    cls,
    classId,
    classLabel,
    date,
    module: moduleLabel,
    classAttendance,
    sessionKey,
    existingRecords,
    hasExistingSession,
    nameToId,
    nameToStudent,
    idToStudent,
    projectedAttendance,
  }
}

/** Resolve roster student by linked id first (scan name may differ from roster spelling). */
function resolveImportRosterStudent(row, ctx) {
  if (row.rosterStudentId && ctx.idToStudent?.has(row.rosterStudentId)) {
    return ctx.idToStudent.get(row.rosterStudentId)
  }
  return ctx.nameToStudent.get(normalizeName(row.name)) ?? null
}

function processImportRow(row, ctx) {
  const { cls, classId, existingRecords, nameToId, projectedAttendance, date } = ctx
  const nameKey = normalizeName(row.name)
  const displayName = row.name.trim()
  const existingId = row.rosterStudentId || nameToId.get(nameKey) || null
  const nextStatus = row.present ? 'present' : 'absent'
  const nextLabel = statusLabel(nextStatus)

  if (!existingId) {
    if (nextStatus !== 'absent') return null

    return {
      key: `new:${nameKey}`,
      name: displayName,
      previousLabel: cls ? UI.notInRoster : 'New Class',
      nextLabel,
      changeLabel: cls ? 'New Learning Partner · Absent' : 'New Class · Absent',
      changeType: 'new',
      rosterStreak: '0 → 1',
      rosterTotal: '0 → 1',
      rosterStreakDelta: true,
      rosterTotalDelta: true,
    }
  }

  const student = resolveImportRosterStudent(row, ctx)
  const prevStatus = existingRecords?.[existingId]?.status ?? null
  const previousLabel = prevStatus != null ? statusLabel(prevStatus) : UI.noSessionRecord
  const effectivePrev = prevStatus ?? 'present'

  let changeType = 'unchanged'
  let changeLabel = 'Unchanged'

  if (prevStatus == null) {
    changeType = nextStatus === 'absent' ? 'new_absent' : 'new_record'
    changeLabel =
      nextStatus === 'absent' ? UI.absentFirstSession : UI.presentFirstSession
  } else if (effectivePrev === nextStatus) {
    changeType = 'unchanged'
    changeLabel = 'Unchanged'
  } else if (nextStatus === 'absent') {
    changeType = 'to_absent'
    changeLabel = 'Present → Absent'
  } else {
    changeType = 'to_present'
    changeLabel = 'Absent → Present'
  }

  let rosterStreak = null
  let rosterTotal = null
  let impact = null
  let rosterStreakDelta = false
  let rosterTotalDelta = false

  if (student && classId) {
    impact = previewRosterImpact(
      student,
      ctx.classAttendance,
      projectedAttendance,
      date,
      prevStatus,
      nextStatus,
    )
    rosterStreak = formatCountDelta(impact.beforeStreak, impact.afterStreak)
    rosterTotal = formatCountDelta(impact.beforeTotal, impact.afterTotal)
    rosterStreakDelta = impact.beforeStreak !== impact.afterStreak
    rosterTotalDelta = impact.beforeTotal !== impact.afterTotal

    if (nextStatus === 'present' && impact.beforeStreak > 0 && impact.afterStreak < impact.beforeStreak) {
      changeType = 'to_present'
      changeLabel = UI.presentStreakReset
    } else if (nextStatus === 'absent' && impact.afterStreak > impact.beforeStreak) {
      if (changeType === 'new_record' || changeType === 'new_absent' || changeType === 'to_absent') {
        changeLabel = UI.absentStreakUp
      }
    } else if (
      nextStatus === 'absent' &&
      (prevStatus == null || prevStatus === 'present') &&
      !rosterStreakDelta &&
      !rosterTotalDelta
    ) {
      changeLabel = UI.absentRosterUnchanged
    }
  }

  const confirmRow = {
    key: existingId,
    name: displayName,
    previousLabel,
    nextLabel,
    changeLabel,
    changeType,
    rosterStreak,
    rosterTotal,
    rosterStreakDelta,
    rosterTotalDelta,
  }

  if (
    !shouldShowStudentInConfirm({
      existingId,
      nextStatus,
      impact,
      prevStatus,
    })
  ) {
    return { previewOnly: true, ...confirmRow }
  }

  return confirmRow
}

/** Roster streak/total preview per import review row (table key → preview). */
export function buildImportRosterPreviews(meta, students, classes, attendance) {
  const payload = buildImportPayload(meta, students)
  const ctx = prepareImportSummaryContext(payload, classes, attendance)
  const map = new Map()

  for (const row of students) {
    const tableKey = `${row.index}-${row.importName || row.name}`
    const result = processImportRow(row, ctx)
    if (!result) continue
    map.set(tableKey, {
      rosterStreak: result.rosterStreak,
      rosterTotal: result.rosterTotal,
      rosterStreakDelta: result.rosterStreakDelta,
      rosterTotalDelta: result.rosterTotalDelta,
      changeLabel: result.changeLabel,
    })
  }

  return map
}

/**
 * Build a detailed save preview for the confirmation modal.
 */
export function computeImportSaveSummary(
  { classMeta, date, module, startTime, duration, students: incoming },
  classes,
  attendance,
) {
  const ctx = prepareImportSummaryContext(
    { classMeta, date, module, startTime, duration, students: incoming },
    classes,
    attendance,
  )

  const studentRows = []
  let toAbsent = 0
  let toPresent = 0
  let unchanged = 0
  let newStudents = 0
  const newStudentNames = []

  for (const row of incoming) {
    const result = processImportRow(row, ctx)
    if (!result) continue

    if (result.previewOnly) continue

    if (result.changeType === 'new') {
      newStudents += 1
      newStudentNames.push(result.name)
    } else if (result.changeType === 'to_absent' || result.changeType === 'new_absent') {
      toAbsent += 1
    } else if (result.changeType === 'to_present') {
      toPresent += 1
    } else if (result.changeType === 'unchanged') {
      unchanged += 1
    }

    studentRows.push(result)
  }

  newStudentNames.sort((a, b) => a.localeCompare(b))

  const changeOrder = {
    to_absent: 0,
    to_present: 1,
    new_absent: 2,
    new: 3,
  }

  studentRows.sort(
    (a, b) =>
      (changeOrder[a.changeType] ?? 9) - (changeOrder[b.changeType] ?? 9) ||
      a.name.localeCompare(b.name),
  )

  const prevAbsent = ctx.hasExistingSession
    ? Object.values(ctx.existingRecords).filter((r) => r?.status === 'absent').length
    : 0
  const nextAbsent = incoming.filter((s) => !s.present).length
  const rosterUpdateCount = studentRows.length

  return {
    needsConfirm: ctx.hasExistingSession,
    classId: ctx.classId,
    classLabel: ctx.classLabel,
    date: ctx.date,
    module: ctx.module,
    isNewClass: !ctx.cls,
    isNewSession: !ctx.hasExistingSession,
    prevAbsent,
    nextAbsent,
    toAbsent,
    toPresent,
    unchanged,
    newStudents,
    newStudentNames,
    studentRows,
    rosterUpdateCount,
    changingCount: rosterUpdateCount,
  }
}

/** @deprecated Use computeImportSaveSummary */
export function computeOverwriteSummary(payload, classes, attendance) {
  return computeImportSaveSummary(payload, classes, attendance)
}

export function buildImportPayload(meta, students) {
  return {
    classMeta: {
      intake: Number(meta.intake) || null,
      level: Number(meta.level) || null,
      qualification: meta.qualification.trim(),
      group: Number(meta.group) || null,
    },
    date: meta.date,
    module: meta.module,
    startTime: meta.startTime,
    duration: meta.duration,
    students: students.map((row) => ({
      index: row.index,
      name: row.name,
      present: row.present,
      rosterStudentId: row.rosterStudentId ?? null,
      importName: row.importName ?? row.name,
    })),
  }
}
