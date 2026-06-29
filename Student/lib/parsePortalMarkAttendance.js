import { stripHtml } from './parsePortalClassList.js'
import { extractPortalSessionMeta, normalizePortalName } from './parsePortalRoster.js'

function readStudentIdFromHref(href) {
  const text = String(href || '')
  const viewStudent = text.match(/view_student(?:=|%3D)(\d+)/i)
  if (viewStudent) return Number(viewStudent[1])
  const studentId = text.match(/student_id(?:=|%3D)(\d+)/i)
  if (studentId) return Number(studentId[1])
  return null
}

function readModuleIdFromHref(href) {
  const match = String(href || '').match(/view_studentmodule(?:=|%3D)(\d+)/i)
  return match ? Number(match[1]) : null
}

function readPercent(block) {
  const match = String(block || '').match(/(\d+(?:\.\d+)?)\s*%/)
  return match ? Number(match[1]) : null
}

function readNameFromRow(block) {
  const text = stripHtml(block)
  const withoutNoise = text
    .replace(/\bview\b/gi, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\d+(?:\.\d+)?\s*%/g, ' ')
    .replace(/^\d+\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalizePortalName(withoutNoise)
}

function pushStudent(students, seen, entry) {
  if (!entry.name) return
  const key = entry.portalStudentId ?? entry.name
  if (seen.has(key)) return
  seen.add(key)
  students.push(entry)
}

/**
 * Parse class summary attendance (`index.php?view_markatd=CLASS_ID`).
 */
export function extractPortalMarkAttendance(html) {
  const text = String(html || '')
  const classLabelMatch =
    text.match(/SUMMARY\s+ATTENDANCE\s*:?\s*([^<\n]+)/i) ||
    text.match(/<h[1-6][^>]*>\s*SUMMARY\s+ATTENDANCE\s*:?\s*([^<]+)/i)
  const classLabel = classLabelMatch ? stripHtml(classLabelMatch[1]).trim() : ''

  const students = []
  const seen = new Set()

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch
  while ((rowMatch = rowRe.exec(text)) !== null) {
    const block = rowMatch[1]
    const percent = readPercent(block)
    if (percent == null) continue

    let portalStudentId = null
    let moduleId = null
    for (const link of block.matchAll(/href=["']([^"']+)["']/gi)) {
      const href = link[1]
      const modId = readModuleIdFromHref(href)
      if (modId) moduleId = modId
      const id = readStudentIdFromHref(href)
      if (id) portalStudentId = id
    }

    const name = readNameFromRow(block)
    pushStudent(students, seen, { portalStudentId, name, percentPresent: percent, moduleId })
  }

  if (!students.length) {
    for (const link of text.matchAll(
      /href=["']([^"']*(?:view_student|view_studentmodule)=\d+[^"']*)["']/gi,
    )) {
      const href = link[1]
      const portalStudentId = readStudentIdFromHref(href)
      const moduleId = readModuleIdFromHref(href)
      const contextStart = Math.max(0, link.index - 40)
      const contextEnd = Math.min(text.length, link.index + link[0].length + 220)
      const block = text.slice(contextStart, contextEnd)
      const percent = readPercent(block)
      if (percent == null) continue
      const name = readNameFromRow(block)
      pushStudent(students, seen, { portalStudentId, name, percentPresent: percent, moduleId })
    }
  }

  if (!students.length) {
    const listRe = /<div class="student_list">([\s\S]*?)<\/div>/gi
    let listMatch
    while ((listMatch = listRe.exec(text)) !== null) {
      const block = listMatch[1]
      const percent = readPercent(block)
      if (percent == null) continue

      let portalStudentId = null
      let moduleId = null
      for (const link of block.matchAll(/href=["']([^"']+)["']/gi)) {
        const href = link[1]
        const modId = readModuleIdFromHref(href)
        if (modId) moduleId = modId
        const id = readStudentIdFromHref(href)
        if (id) portalStudentId = id
      }

      const labelMatch = block.match(/<label>([\s\S]*?)<\/label>/i)
      const name = normalizePortalName(stripHtml(labelMatch?.[1] || readNameFromRow(block)))
      pushStudent(students, seen, {
        portalStudentId,
        name,
        percentPresent: percent,
        moduleId,
      })
    }
  }

  return {
    classLabel,
    moduleLabel: extractPortalSessionMeta(text).module || '',
    students,
  }
}
