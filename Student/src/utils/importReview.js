import { findMatchingClass, formatClassLabel } from './classFormat'
import { findSessionKey, normalizeModuleKey } from './sessionKeys'

export function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ').toUpperCase()
}

export function computeOverwriteSummary(
  { classMeta, date, module, students: incoming },
  classes,
  attendance,
) {
  const cls = findMatchingClass(classes, classMeta)
  const classId = cls?.id ?? null
  const classAttendance = classId ? attendance?.[classId] || {} : {}
  const sessionKey = classId ? findSessionKey(classAttendance, date, module) : null
  const existingSession = sessionKey ? classAttendance[sessionKey] : null
  const existingRecords = existingSession?.records ?? null

  const classLabel = cls ? formatClassLabel(cls) : formatClassLabel(classMeta)
  const moduleLabel = normalizeModuleKey(module) || 'General session'

  if (!cls || !existingRecords || Object.keys(existingRecords).length === 0) {
    return { needsConfirm: false, classId, classLabel, module: moduleLabel, isNewClass: !cls }
  }

  const nameToId = new Map((cls.students ?? []).map((st) => [normalizeName(st.name), st.id]))

  const prevAbsent = Object.values(existingRecords).filter((r) => r?.status === 'absent').length
  const nextAbsent = incoming.filter((s) => !s.present).length

  let toAbsent = 0
  let toPresent = 0
  let unchanged = 0
  const newStudentNames = []

  for (const row of incoming) {
    const nameKey = normalizeName(row.name)
    const existingId = nameToId.get(nameKey) || null
    if (!existingId) {
      newStudentNames.push(nameKey)
      unchanged += 1
      continue
    }
    const prevStatus = existingRecords[existingId]?.status ?? 'present'
    const nextStatus = row.present ? 'present' : 'absent'
    if (prevStatus !== nextStatus) {
      if (nextStatus === 'absent') toAbsent += 1
      else toPresent += 1
    } else {
      unchanged += 1
    }
  }

  newStudentNames.sort((a, b) => a.localeCompare(b))

  return {
    needsConfirm: true,
    classId,
    classLabel,
    date,
    module: moduleLabel,
    prevAbsent,
    nextAbsent,
    toAbsent,
    toPresent,
    unchanged,
    newStudents: newStudentNames.length,
    newStudentNames,
    isNewClass: false,
  }
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
