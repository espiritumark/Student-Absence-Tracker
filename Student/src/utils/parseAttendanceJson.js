import { parseClassHeader, formatClassLabel } from './classFormat'
import { dateKey, formatPortalDate, parsePortalDate } from './dates'

/** Pull class header text from session fields when the model left class empty. */
export function repairPortalSessionData(data) {
  if (!data || typeof data !== 'object') return data

  const session = data.session_details ?? data.sessionDetails ?? data.session ?? {}
  if (!data.session_details) data.session_details = session

  let classText = String(session.class ?? session.class_name ?? session.className ?? '').trim()
  if (classText) return data

  const candidates = [
    session.module,
    session.title,
    session.programme,
    session.course,
    data.class,
    data.class_name,
    data.className,
  ]

  for (const value of Object.values(session)) {
    if (typeof value === 'string') candidates.push(value)
  }

  for (const text of candidates) {
    const candidate = String(text ?? '').trim()
    if (!candidate) continue
    if (parseClassHeader(candidate) || /INTAKE\s*\d+\s*LEVEL\s*\d+/i.test(candidate)) {
      session.class = candidate
      break
    }
  }

  return data
}

function firstClassHeaderMatch(...texts) {
  for (const text of texts) {
    const candidate = String(text ?? '').trim()
    if (!candidate) continue
    if (parseClassHeader(candidate) || /INTAKE\s*\d+\s*LEVEL\s*\d+/i.test(candidate)) {
      return candidate
    }
  }
  return ''
}

function normalizeStatus(status) {
  const s = String(status ?? '').trim().toLowerCase()
  if (s === 'absent' || s === 'a' || s === 'false' || s === '0') return 'absent'
  return 'present'
}

function pickNumber(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseClassMetaFromSession(session, classText) {
  const fromHeader = parseClassHeader(classText)
  if (fromHeader) return fromHeader

  const intake = pickNumber(session.intake ?? session.Intake)
  const level = pickNumber(session.level ?? session.Level)
  const group = pickNumber(session.group ?? session.Group ?? session.class_group)
  const qualification = String(
    session.qualification ?? session.programme ?? session.course ?? classText ?? '',
  ).trim()

  if (intake != null && level != null && group != null) {
    return {
      intake,
      level,
      group,
      qualification: qualification || 'Unknown programme',
    }
  }

  if (qualification) {
    const fromQual = parseClassHeader(qualification)
    if (fromQual) return fromQual
    return { intake, level, group, qualification }
  }

  return null
}

/**
 * Build portal-style JSON from parsed import data (e.g. after screenshot scan).
 */
export function buildPortalJson(meta, students) {
  const sorted = [...students].sort((a, b) => a.index - b.index)
  const presentCount = sorted.filter((row) => row.present).length

  const classMeta = {
    intake: Number(meta.intake) || null,
    level: Number(meta.level) || null,
    qualification: meta.qualification?.trim() || '',
    group: Number(meta.group) || null,
  }
  const classLabel =
    classMeta.intake != null && classMeta.level != null && classMeta.group != null
      ? formatClassLabel(classMeta)
      : meta.qualification || meta.classLabel || ''

  return JSON.stringify(
    {
      session_details: {
        class: classLabel,
        date: formatPortalDate(meta.date),
        module: meta.module || '',
        start_time: meta.startTime || '',
        duration: meta.duration || '',
      },
      attendance: sorted.map((row) => ({
        no: row.index,
        name: row.name,
        status: row.present ? 'Present' : 'Absent',
      })),
      summary: {
        total_students: sorted.length,
        present: presentCount,
        absent: sorted.length - presentCount,
      },
    },
    null,
    2,
  )
}

/**
 * Parse portal export JSON into the same shape used by screenshot import.
 * @param {object} [options]
 * @param {boolean} [options.lenient] — allow missing class/date (screenshot review); sets warnings
 * @param {boolean} [options.repairSession] — infer class from other session fields before validate
 */
export function parseAttendanceJson(raw, options = {}) {
  const { lenient = false, repairSession = false } = options
  const warnings = []

  let data
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : { ...raw }
  } catch {
    throw new Error('Invalid JSON. Check brackets, commas, and quotes.')
  }

  if (!data || typeof data !== 'object') {
    throw new Error('JSON must be an object.')
  }

  if (repairSession) {
    repairPortalSessionData(data)
  }

  const session = data.session_details ?? data.sessionDetails ?? data.session ?? {}
  let classText = String(session.class ?? session.class_name ?? session.className ?? '').trim()

  if (!classText) {
    classText = firstClassHeaderMatch(
      session.module,
      session.title,
      session.programme,
      session.course,
      ...Object.values(session),
    )
    if (classText) session.class = classText
  }

  const classMeta = parseClassMetaFromSession(session, classText)

  const dateRaw = session.date ?? session.session_date ?? ''
  let date = parsePortalDate(String(dateRaw)) || parsePortalDate(classText)

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
    throw new Error('No valid Learning Partner names found in attendance array.')
  }

  const hasClass = Boolean(classMeta) || Boolean(classText.trim())

  if (!hasClass) {
    if (!lenient) {
      throw new Error('session_details.class is required (e.g. INTAKE 17 LEVEL 5 … GROUP 1).')
    }
    warnings.push('missing_class')
  }

  if (!date) {
    if (!lenient) {
      throw new Error('session_details.date is required (e.g. 02/06/2026 as DD/MM/YYYY).')
    }
    date = dateKey()
    warnings.push('missing_date')
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
    warnings,
  }
}
