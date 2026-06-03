import { formatClassLabel } from './classFormat'
import { formatDateLabel } from './dates'
import { formatModuleLabel } from './sessionKeys'

const STORAGE_KEY = 'learning-partner-hub-activity-log-v2'
const MAX_ENTRIES = 50

export const ACTIVITY_CATEGORY = {
  attendance: { key: 'attendance', label: 'Attendance', order: 0 },
  roster: { key: 'roster', label: 'Roster Counts', order: 1 },
  student: { key: 'student', label: 'Learning Partners', order: 2 },
  class: { key: 'class', label: 'Classes', order: 3 },
}

const VERB_LABEL = {
  saved: 'Saved',
  updated: 'Updated',
  added: 'Added',
  removed: 'Removed',
  imported: 'Imported',
  cleared: 'Cleared',
}

const LEGACY_SOURCE_LABEL = {
  import: 'Record Attendance',
  manual: 'Mark Manually',
}

export function buildActivityEntry({
  category,
  verb,
  title,
  lines = [],
  success = true,
  error = '',
  rosterRows = null,
  sessionStats = null,
}) {
  return {
    category,
    verb,
    title,
    lines: lines.filter(Boolean),
    success: success !== false,
    error: error || '',
    rosterRows: rosterRows ?? undefined,
    sessionStats: sessionStats ?? undefined,
  }
}

export function normalizeActivityEntry(entry) {
  if (!entry || typeof entry !== 'object') return null

  if (entry.category && entry.title) {
    return {
      ...entry,
      lines: entry.lines ?? [],
      success: entry.success !== false,
    }
  }

  if (entry.source) {
    const classLabel = entry.classLabel || 'Unknown class'
    const parts = [classLabel]
    if (entry.dateLabel) parts.push(entry.dateLabel)
    if (entry.moduleLabel) parts.push(entry.moduleLabel)
    return {
      category: 'attendance',
      verb: 'saved',
      title: `${LEGACY_SOURCE_LABEL[entry.source] || entry.source} — ${classLabel}`,
      lines: parts.slice(1).length ? [parts.slice(1).join(' · ')] : [],
      success: entry.success !== false,
      error: entry.error || '',
      rosterRows: entry.rosterRows,
      sessionStats: entry.sessionStats,
      at: entry.at,
      id: entry.id,
    }
  }

  return null
}

export function loadActivityLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const legacy = localStorage.getItem('learning-partner-hub-action-log-v1')
      if (legacy) {
        const parsed = JSON.parse(legacy)
        const migrated = (Array.isArray(parsed) ? parsed : [])
          .map(normalizeActivityEntry)
          .filter(Boolean)
        saveActivityLog(migrated)
        return migrated
      }
      return []
    }
    const parsed = JSON.parse(raw)
    return (Array.isArray(parsed) ? parsed : [])
      .map(normalizeActivityEntry)
      .filter(Boolean)
  } catch {
    return []
  }
}

function saveActivityLog(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

export function appendActivityLog(entry) {
  const normalized = normalizeActivityEntry(entry)
  if (!normalized) return loadActivityLog()

  const next = [
    {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      at: new Date().toISOString(),
      ...normalized,
    },
    ...loadActivityLog(),
  ].slice(0, MAX_ENTRIES)
  saveActivityLog(next)
  return next
}

export function clearActivityLog() {
  saveActivityLog([])
  return []
}

export function formatActivityTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export function getVerbLabel(verb) {
  return VERB_LABEL[verb] || verb
}

export function getCategoryLabel(category) {
  return ACTIVITY_CATEGORY[category]?.label || category
}

export function groupActivityByCategory(entries) {
  const groups = new Map()
  for (const entry of entries ?? []) {
    const key = entry.category || 'other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }

  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      label: getCategoryLabel(key),
      order: ACTIVITY_CATEGORY[key]?.order ?? 99,
      items,
    }))
    .sort((a, b) => a.order - b.order)
}

export function buildAttendanceLogFromSummary(source, payload, summary, { success, error } = {}) {
  const classLabel =
    summary?.classLabel ||
    (payload?.classMeta ? formatClassLabel(payload.classMeta) : 'Unknown class')
  const date = payload?.date || summary?.date || ''
  const module = payload?.module ?? summary?.module ?? ''

  const rosterRows = (summary?.studentRows ?? []).map((row) => ({
    name: row.name,
    change: row.changeLabel,
    streak: row.rosterStreak,
    total: row.rosterTotal,
  }))

  const lines = []
  if (date) lines.push(formatDateLabel(date))
  if (module) lines.push(formatModuleLabel(module))
  if (payload?.students?.length) {
    lines.push(
      `${payload.students.length} in session · ${payload.students.filter((s) => !s.present).length} absent`,
    )
  }

  return buildActivityEntry({
    category: 'attendance',
    verb: 'saved',
    title: `${LEGACY_SOURCE_LABEL[source] || source} — ${classLabel}`,
    lines,
    success,
    error,
    rosterRows,
    sessionStats: {
      total: payload?.students?.length ?? 0,
      absent: payload?.students?.filter((s) => !s.present)?.length ?? 0,
      rosterUpdates: rosterRows.length,
    },
  })
}

/** @deprecated use buildAttendanceLogFromSummary */
export const buildActionLogFromSummary = buildAttendanceLogFromSummary

export function loadActionLog() {
  return loadActivityLog()
}

export function appendActionLog(entry) {
  return appendActivityLog(entry)
}

export function clearActionLog() {
  return clearActivityLog()
}
