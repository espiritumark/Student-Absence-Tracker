import { formatClassLabel } from './classFormat'
import { dateKey } from './dates'
import { parseMetadataFromText, parseStudentsFromText } from './screenshotTextParse'

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ').toUpperCase()
}

function parsePlainNameList(text) {
  const lines = text.split(/\r?\n/)
  const students = []
  let index = 1

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const numbered = line.match(/^(\d{1,3})[\s.:)\-]+(.+)$/)
    const name = normalizeName(numbered ? numbered[2] : line)
    if (name.length < 2) continue

    students.push({
      index: numbered ? Number(numbered[1]) : index,
      name,
      present: true,
    })
    index += 1
  }

  return students
}

/**
 * Instant import from pasted portal text or a plain student name list.
 */
export function parseQuickPaste(text) {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Paste student names or copied portal text first.')
  }

  const portalMeta = parseMetadataFromText(trimmed)
  const portalStudents = parseStudentsFromText(trimmed)
  const plainStudents = parsePlainNameList(trimmed)
  const students =
    portalStudents.length >= plainStudents.length ? portalStudents : plainStudents

  if (students.length === 0) {
    throw new Error('No student names found. Use one name per line.')
  }

  const classMeta = portalMeta.classMeta ?? {
    intake: null,
    level: null,
    qualification: '',
    group: null,
  }

  return {
    meta: {
      classMeta,
      date: portalMeta.date || dateKey(),
      module: portalMeta.module || '',
      startTime: portalMeta.startTime || '',
      duration: portalMeta.duration || '',
      classLabel: portalMeta.classMeta ? formatClassLabel(portalMeta.classMeta) : '',
    },
    students: [...students].sort((a, b) => a.index - b.index),
  }
}
