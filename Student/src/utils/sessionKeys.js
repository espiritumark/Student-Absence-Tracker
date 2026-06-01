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
