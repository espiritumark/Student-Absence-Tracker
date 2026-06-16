import { parsePortalDate } from './dates'
import { parseClassHeader } from './classFormat'

const SKIP_LINE =
  /^(class|date|module|start\s*time|duration|check\s*all|uncheck\s*all|submit|present|absent)\b/i

import { dedupeImportStudentsByName } from './importNameResolution'

export function parseStudentLine(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned || SKIP_LINE.test(cleaned)) return null

  const m = cleaned.match(/^(\d{1,3})[\s.:)\-]+(.+)$/)
  if (!m) return null

  let name = m[2]
    .replace(/\s*[\[\(]?\s*[-–]\s*[\]\)]?\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()

  if (name.length < 4) return null
  if (/^(AM|PM|SESSION|\d{1,2}:\d{2})/.test(name)) return null

  return { index: Number(m[1]), name }
}

export function parseMetadataFromText(text) {
  const classMeta = parseClassHeader(text)
  const date = parsePortalDate(text)
  const moduleMatch =
    text.match(/Module:?\s*([A-Z0-9]+\s*\|\s*[^\n\r]+)/i) ||
    text.match(/\b(L\d+[A-Z]?\s*\|\s*[^\n\r]+)/i)
  const startMatch = text.match(/Start\s*Time:?\s*([^\n\r]+)/i)
  const durationMatch = text.match(/Duration:?\s*([^\n\r]+)/i)

  return {
    classMeta,
    date,
    module: moduleMatch?.[1]?.trim() ?? '',
    startTime: startMatch?.[1]?.trim() ?? '',
    duration: durationMatch?.[1]?.trim() ?? '',
  }
}

export function parseStudentsFromText(text) {
  const students = []
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseStudentLine(line)
    if (parsed) {
      students.push({ ...parsed, present: true })
    }
  }
  return dedupeImportStudentsByName(students)
}
