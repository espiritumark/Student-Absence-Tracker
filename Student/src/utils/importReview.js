import { findMatchingClass, formatClassLabel } from './classFormat'
import { previewRosterImpact } from './attendanceStats'
import { UI } from './uiCopy'
import { findSessionKey, makeSessionKey, normalizeModuleKey } from './sessionKeys'

export function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ').toUpperCase()
}

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

function shouldShowStudentInConfirm({ existingId, nextStatus, impact }) {
  if (!existingId) {
    return nextStatus === 'absent'
  }

  if (!impact) return false

  if (
    nextStatus === 'present' &&
    impact.beforeStreak > 0 &&
    impact.afterStreak < impact.beforeStreak
  ) {
    return true
  }

  return impact.beforeStreak !== impact.afterStreak || impact.beforeTotal !== impact.afterTotal
}

/**
 * Build a detailed save preview for the confirmation modal.
 */
export function computeImportSaveSummary(
  { classMeta, date, module, startTime, duration, students: incoming },
  classes,
  attendance,
) {
  const cls = findMatchingClass(classes, classMeta)
  const classId = cls?.id ?? null
  const classAttendance = classId ? attendance?.[classId] || {} : {}
  const sessionKey = classId ? findSessionKey(classAttendance, date, module) : makeSessionKey(date, module)
  const existingSession = classId && sessionKey ? classAttendance[sessionKey] : null
  const existingRecords = existingSession?.records ?? null
  const hasExistingSession = Boolean(
    existingRecords && Object.keys(existingRecords).length > 0,
  )

  const classLabel = cls ? formatClassLabel(cls) : formatClassLabel(classMeta)
  const moduleLabel = normalizeModuleKey(module) || 'General session'
  const nameToId = new Map((cls?.students ?? []).map((st) => [normalizeName(st.name), st.id]))
  const nameToStudent = new Map((cls?.students ?? []).map((st) => [normalizeName(st.name), st]))

  const studentRows = []
  const incomingIds = new Set()
  let toAbsent = 0
  let toPresent = 0
  let unchanged = 0
  let newStudents = 0
  const newStudentNames = []

  const baseRecordPatch = {}
  for (const row of incoming) {
    const nameKey = normalizeName(row.name)
    const existingId = nameToId.get(nameKey) || null
    const nextStatus = row.present ? 'present' : 'absent'
    if (existingId) {
      incomingIds.add(existingId)
      baseRecordPatch[existingId] = { status: nextStatus, priorNotice: false }
    }
  }

  const projectedAttendance =
    classId && sessionKey
      ? buildProjectedAttendance(classAttendance, sessionKey, {
          module,
          startTime,
          duration,
        }, baseRecordPatch)
      : classAttendance

  for (const row of incoming) {
    const nameKey = normalizeName(row.name)
    const displayName = row.name.trim()
    const existingId = nameToId.get(nameKey) || null
    const nextStatus = row.present ? 'present' : 'absent'
    const nextLabel = statusLabel(nextStatus)

    if (!existingId) {
      if (nextStatus !== 'absent') continue

      newStudents += 1
      newStudentNames.push(displayName)
      studentRows.push({
        key: `new:${nameKey}`,
        name: displayName,
        previousLabel: cls ? UI.notInRoster : 'New Class',
        nextLabel,
        changeLabel: cls ? 'New Student · Absent' : 'New Class · Absent',
        changeType: 'new',
        rosterStreak: '0 → 1',
        rosterTotal: '0 → 1',
      })
      continue
    }

    const student = nameToStudent.get(nameKey)
    const prevStatus = existingRecords?.[existingId]?.status ?? null
    const previousLabel =
      prevStatus != null ? statusLabel(prevStatus) : UI.noSessionRecord
    const effectivePrev = prevStatus ?? 'present'

    let changeType = 'unchanged'
    let changeLabel = 'Unchanged'

    if (prevStatus == null) {
      changeType = nextStatus === 'absent' ? 'new_absent' : 'new_record'
      changeLabel =
        nextStatus === 'absent' ? 'Mark Absent (New Record)' : 'Mark Present (New Record)'
      if (nextStatus === 'absent') toAbsent += 1
    } else if (effectivePrev === nextStatus) {
      changeType = 'unchanged'
      changeLabel = 'Unchanged'
      unchanged += 1
    } else if (nextStatus === 'absent') {
      changeType = 'to_absent'
      changeLabel = 'Present → Absent'
      toAbsent += 1
    } else {
      changeType = 'to_present'
      changeLabel = 'Absent → Present'
      toPresent += 1
    }

    let rosterStreak = null
    let rosterTotal = null
    let impact = null
    if (student && classId) {
      impact = previewRosterImpact(
        student,
        classAttendance,
        projectedAttendance,
        date,
        prevStatus,
        nextStatus,
      )
      rosterStreak = formatCountDelta(impact.beforeStreak, impact.afterStreak)
      rosterTotal = formatCountDelta(impact.beforeTotal, impact.afterTotal)

      if (nextStatus === 'present' && impact.beforeStreak > 0 && impact.afterStreak < impact.beforeStreak) {
        changeType = 'to_present'
        changeLabel = UI.presentStreakReset
      } else if (nextStatus === 'absent' && impact.afterStreak > impact.beforeStreak) {
        if (changeType === 'new_record' || changeType === 'new_absent' || changeType === 'to_absent') {
          changeLabel = UI.absentStreakUp
        }
      }
    }

    if (
      !shouldShowStudentInConfirm({
        existingId,
        nextStatus,
        impact,
      })
    ) {
      continue
    }

    studentRows.push({
      key: existingId,
      name: displayName,
      previousLabel,
      nextLabel,
      changeLabel,
      changeType,
      rosterStreak,
      rosterTotal,
    })
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

  const prevAbsent = hasExistingSession
    ? Object.values(existingRecords).filter((r) => r?.status === 'absent').length
    : 0
  const nextAbsent = incoming.filter((s) => !s.present).length
  const rosterUpdateCount = studentRows.length

  return {
    needsConfirm: hasExistingSession,
    classId,
    classLabel,
    date,
    module: moduleLabel,
    isNewClass: !cls,
    isNewSession: !hasExistingSession,
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
    students,
  }
}
