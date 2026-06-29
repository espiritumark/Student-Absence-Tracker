import { stripHtml } from './parsePortalClassList.js'

function readStudentIdFromHref(href) {
  const text = String(href || '')
  const viewStudent = text.match(/view_student(?:=|%3D)(\d+)/i)
  if (viewStudent) return Number(viewStudent[1])
  const studentId = text.match(/student_id(?:=|%3D)(\d+)/i)
  if (studentId) return Number(studentId[1])
  return null
}

function readStudentModuleLink(href, defaultStudentId = null) {
  const text = String(href || '')
  const moduleMatch = text.match(/view_studentmodule(?:=|%3D)(\d+)/i)
  if (!moduleMatch) return null
  const studentId = readStudentIdFromHref(text) ?? defaultStudentId
  if (!studentId) return null
  return {
    moduleId: Number(moduleMatch[1]),
    studentId: Number(studentId),
  }
}

/** Parse module links from `view_student=ID`. */
export function extractPortalStudentModules(html, defaultStudentId = null) {
  const text = String(html || '')
  const modules = []
  const seen = new Set()

  for (const link of text.matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const parsed = readStudentModuleLink(link[1], defaultStudentId)
    if (!parsed) continue
    const key = `${parsed.moduleId}-${parsed.studentId}`
    if (seen.has(key)) continue
    seen.add(key)
    modules.push({
      moduleId: parsed.moduleId,
      studentId: parsed.studentId,
      label: stripHtml(link[2]).replace(/\s+/g, ' ').trim(),
      percentPresent: null,
    })
  }

  if (!modules.length) {
    for (const link of text.matchAll(/href=["']([^"']*view_studentmodule=\d+[^"']*)["']/gi)) {
      const parsed = readStudentModuleLink(link[1], defaultStudentId)
      if (!parsed) continue
      const key = `${parsed.moduleId}-${parsed.studentId}`
      if (seen.has(key)) continue
      seen.add(key)
      modules.push({
        moduleId: parsed.moduleId,
        studentId: parsed.studentId,
        label: '',
        percentPresent: null,
      })
    }
  }

  return modules.sort((a, b) => a.label.localeCompare(b.label))
}

export function normalizePortalModuleLabel(label) {
  return String(label || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\|\s*/g, ' | ')
    .toUpperCase()
}

/**
 * Pick the portal module row that belongs to the class being synced.
 * Prefer an explicit module id (from view_markatd links), then label match.
 */
export function pickMatchingPortalModule(modules = [], { moduleId = null, moduleLabel = '' } = {}) {
  if (!modules.length) return null

  if (moduleId != null) {
    const byId = modules.find((mod) => mod.moduleId === moduleId)
    if (byId) return { module: byId, match: 'id' }
  }

  const normTarget = normalizePortalModuleLabel(moduleLabel)
  if (normTarget) {
    const exact = modules.find(
      (mod) => normalizePortalModuleLabel(mod.label) === normTarget,
    )
    if (exact) return { module: exact, match: 'label' }

    const partial = modules.find((mod) => {
      const norm = normalizePortalModuleLabel(mod.label)
      return norm.includes(normTarget) || normTarget.includes(norm)
    })
    if (partial) return { module: partial, match: 'label_partial' }
  }

  return null
}

/** Build normalized label → view_studentmodule id map from a student's module list. */
export function buildPortalModuleIdMap(modules = []) {
  const map = new Map()
  for (const mod of modules ?? []) {
    if (mod?.moduleId == null) continue
    const norm = normalizePortalModuleLabel(mod.label)
    if (norm) map.set(norm, mod.moduleId)
  }
  return map
}

/** Resolve view_studentmodule id for a class module label using a label map. */
export function resolveViewModuleId(moduleIdMap, label) {
  if (!moduleIdMap?.size) return null
  const norm = normalizePortalModuleLabel(label)
  if (!norm) return null
  if (moduleIdMap.has(norm)) return moduleIdMap.get(norm)
  for (const [candidate, id] of moduleIdMap) {
    if (candidate === norm || candidate.includes(norm) || norm.includes(candidate)) {
      return id
    }
  }
  return null
}

function trailingAbsentStreak(marks) {
  let streak = 0
  for (let index = marks.length - 1; index >= 0; index -= 1) {
    if (marks[index] !== 'A') break
    streak += 1
  }
  return streak
}

/** Pair date headers with P/A marks for storage (not shown in sync review UI). */
export function zipPortalSessionMarks(dates = [], marks = [], moduleId = null) {
  const sessions = []
  const count = Math.max(dates.length, marks.length)
  for (let index = 0; index < count; index += 1) {
    const status = marks[index]
    if (status !== 'P' && status !== 'A') continue
    sessions.push({
      date: dates[index] || null,
      status,
      ...(moduleId != null ? { moduleId } : {}),
    })
  }
  return sessions
}

function countSessionMarks(sessions = []) {
  let presentCount = 0
  let absentCount = 0
  for (const session of sessions) {
    if (session.status === 'P') presentCount += 1
    else if (session.status === 'A') absentCount += 1
  }
  return { presentCount, absentCount }
}

/** Parse session grid from `view_studentmodule=MODULE&student_id=ID`. */
export function extractPortalStudentModuleAttendance(html) {
  const text = String(html || '')
  const dates = []
  for (const header of text.matchAll(/<th[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/th>/gi)) {
    dates.push(header[1])
  }

  let marks = []
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch
  while ((rowMatch = rowRe.exec(text)) !== null) {
    const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      stripHtml(cell[1]).trim().toUpperCase(),
    )
    if (!cells.length) continue
    const attendanceMarks = cells.filter((cell) => cell === 'P' || cell === 'A')
    if (attendanceMarks.length >= Math.max(dates.length, 1)) {
      marks = attendanceMarks.slice(0, Math.max(dates.length, attendanceMarks.length))
      if (dates.length > 0) break
    }
  }

  const sessions = zipPortalSessionMarks(dates, marks)
  const { presentCount, absentCount } = countSessionMarks(sessions)
  const totalSessions = sessions.length || dates.length || marks.length
  const percentMatch = text.match(/Total[\s\S]*?(\d+(?:\.\d+)?)\s*%/i)
  const percentPresent =
    percentMatch != null
      ? Number(percentMatch[1])
      : totalSessions > 0
        ? Math.round((presentCount / totalSessions) * 10000) / 100
        : null

  return {
    dates,
    marks,
    sessions,
    presentCount,
    absentCount,
    totalSessions,
    percentPresent,
    consecutiveAbsent: trailingAbsentStreak(marks),
  }
}
