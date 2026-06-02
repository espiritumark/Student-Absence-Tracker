export function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function dateKey(date = new Date()) {
  return formatDate(date)
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDateLabel(key) {
  if (!key || typeof key !== 'string') return 'Unknown date'
  const parsed = parseDateKey(key)
  if (Number.isNaN(parsed.getTime())) return key
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function daysBetween(earlierKey, laterKey) {
  const a = parseDateKey(earlierKey).getTime()
  const b = parseDateKey(laterKey).getTime()
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

export function isConsecutiveDays(dayA, dayB) {
  return daysBetween(dayA, dayB) === 1
}

export function addDaysToKey(key, deltaDays) {
  const date = parseDateKey(key)
  date.setDate(date.getDate() + deltaDays)
  return formatDate(date)
}

/** Portal / vision JSON display format: DD/MM/YYYY */
export function formatPortalDate(key) {
  if (!key) return ''
  const [y, m, d] = key.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

/** Parse portal dates as DD/MM/YYYY (matches on-screen format and vision LLM output). */
export function parsePortalDate(text) {
  const labeled = text.match(/Date:?\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/i)
  const m = labeled || text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (Number.isNaN(d.getTime())) return null
  if (d.getDate() !== day || d.getMonth() !== month - 1 || d.getFullYear() !== year) {
    return null
  }
  return formatDate(d)
}

export function getRecentDateKeys(count = 14) {
  const keys = []
  const d = new Date()
  for (let i = 0; i < count; i++) {
    keys.push(formatDate(d))
    d.setDate(d.getDate() - 1)
  }
  return keys
}

/** Monday of the week containing `date` (for week rollup in alerts). */
export function weekKey(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return formatDate(d)
}

export function parseWeekKey(key) {
  return parseDateKey(key)
}
