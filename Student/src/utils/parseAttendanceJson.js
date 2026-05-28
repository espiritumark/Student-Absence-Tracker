import { parseClassHeader } from './classFormat'
import { parsePortalDate } from './dates'

function normalizeStatus(status) {
  const s = String(status ?? '').trim().toLowerCase()
  if (s === 'absent' || s === 'a' || s === 'false' || s === '0') return 'absent'
  return 'present'
}

/**
 * Parse portal export JSON into the same shape used by screenshot import.
 */
export function parseAttendanceJson(raw) {
  let data
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    throw new Error('Invalid JSON. Check brackets, commas, and quotes.')
  }

  if (!data || typeof data !== 'object') {
    throw new Error('JSON must be an object.')
  }

  const session = data.session_details ?? data.sessionDetails ?? data.session ?? {}
  const classText = session.class ?? session.class_name ?? session.className ?? ''
  const classMeta = parseClassHeader(classText)

  const dateRaw = session.date ?? session.session_date ?? ''
  const date = parsePortalDate(String(dateRaw)) || parsePortalDate(classText)

  const module = session.module ?? ''
  const startTime = session.start_time ?? session.startTime ?? ''
  const duration = session.duration ?? ''

  const rows = data.attendance ?? data.students ?? data.records ?? []
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('JSON must include a non-empty "attendance" array.')
  }

  const students = rows
    .map((row, i) => {
      const name = String(row.name ?? row.student ?? row.student_name ?? '').trim()
      if (!name) return null
      const status = normalizeStatus(row.status ?? row.present)
      const index = Number(row.no ?? row.index ?? row.number ?? i + 1)
      return {
        index,
        name: name.toUpperCase(),
        present: status === 'present',
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index)

  if (!students.length) {
    throw new Error('No valid student names found in attendance array.')
  }

  if (!classMeta && !classText.trim()) {
    throw new Error('session_details.class is required (e.g. INTAKE 17 LEVEL 5 … GROUP 1).')
  }

  if (!date) {
    throw new Error('session_details.date is required (e.g. 05/05/2026).')
  }

  return {
    meta: {
      classMeta: classMeta ?? {
        intake: null,
        level: null,
        qualification: classText.trim(),
        group: null,
      },
      date,
      module: String(module).trim(),
      startTime: String(startTime).trim(),
      duration: String(duration).trim(),
      classLabel: classText.trim(),
    },
    students,
    summary: data.summary ?? null,
  }
}
