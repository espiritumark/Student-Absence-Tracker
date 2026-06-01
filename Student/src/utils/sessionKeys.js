/** Composite keys: YYYY-MM-DD or YYYY-MM-DD::MODULE for multiple subjects same day. */

export function normalizeModuleKey(module) {
  return String(module || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

export function makeSessionKey(date, module) {
  const day = String(date || '').trim()
  const mod = normalizeModuleKey(module)
  if (!day) return ''
  return mod ? `${day}::${mod}` : day
}

export function sessionDateFromKey(sessionKey) {
  const key = String(sessionKey || '')
  const idx = key.indexOf('::')
  return idx === -1 ? key : key.slice(0, idx)
}

export function sessionModuleFromKey(sessionKey, session) {
  const key = String(sessionKey || '')
  const idx = key.indexOf('::')
  if (idx === -1) return session?.module || ''
  return key.slice(idx + 2)
}

export function listSessionsForDate(classAttendance, date) {
  const day = String(date || '').trim()
  if (!day || !classAttendance) return []

  return Object.entries(classAttendance)
    .filter(([key]) => sessionDateFromKey(key) === day)
    .map(([key, session]) => ({
      key,
      module: sessionModuleFromKey(key, session) || session?.module || '',
      session,
    }))
    .sort((a, b) => a.module.localeCompare(b.module))
}

export function findSessionKey(classAttendance, date, module) {
  const target = makeSessionKey(date, module)
  if (classAttendance?.[target]) return target

  const mod = normalizeModuleKey(module)
  if (!mod) return target

  const match = listSessionsForDate(classAttendance, date).find(
    (entry) => normalizeModuleKey(entry.module) === mod,
  )
  return match?.key ?? target
}

export function formatModuleLabel(module) {
  const mod = String(module || '').trim()
  return mod || 'General session'
}

export function listModulesForClass(classAttendance) {
  const seen = new Map()

  for (const [key, session] of Object.entries(classAttendance || {})) {
    const raw = sessionModuleFromKey(key, session) || session?.module || ''
    const normalized = normalizeModuleKey(raw)
    const label = formatModuleLabel(raw)
    if (!seen.has(normalized)) {
      seen.set(normalized, label)
    }
  }

  return [...seen.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }))
}

export function filterAttendanceByModule(classAttendance, moduleFilter) {
  const target = normalizeModuleKey(moduleFilter)
  const filtered = {}

  for (const [key, session] of Object.entries(classAttendance || {})) {
    const mod = sessionModuleFromKey(key, session) || session?.module || ''
    if (normalizeModuleKey(mod) === target) {
      filtered[key] = session
    }
  }

  return filtered
}

export function listAbsentModulesForStudent(classAttendance, studentId) {
  const modules = new Set()

  for (const [key, session] of Object.entries(classAttendance || {})) {
    const rec = session?.records?.[studentId] ?? session?.[studentId]
    if (rec?.status !== 'absent') continue
    modules.add(formatModuleLabel(sessionModuleFromKey(key, session) || session?.module || ''))
  }

  return [...modules].sort((a, b) => a.localeCompare(b))
}
