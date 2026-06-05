const STORAGE_KEY = 'lp-hub-bulk-screenshot-session'

/** @returns {{ queue: object[], selectedId: string | null, savedAt?: number } | null} */
export function loadBulkScreenshotSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.queue)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Persist bulk queue draft for this browser tab (survives refresh & sub-tab switches).
 * Drops preview images for queued-only items if the payload is too large.
 */
export function saveBulkScreenshotSession({ queue, selectedId }) {
  if (!queue?.length) {
    clearBulkScreenshotSession()
    return { cleared: true }
  }

  const base = { queue, selectedId, savedAt: Date.now() }

  try {
    let payload = JSON.stringify(base)
    if (payload.length <= 4_000_000) {
      sessionStorage.setItem(STORAGE_KEY, payload)
      return { saved: true, trimmed: false }
    }

    const trimmedQueue = queue.map((item) =>
      item.status === 'queued'
        ? { ...item, previewUrl: '' }
        : item,
    )
    payload = JSON.stringify({ ...base, queue: trimmedQueue, previewsTrimmed: true })
    sessionStorage.setItem(STORAGE_KEY, payload)
    return { saved: true, trimmed: true }
  } catch {
    return { saved: false }
  }
}

export function clearBulkScreenshotSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function maxBulkIdFromQueue(queue) {
  let max = 0
  for (const item of queue) {
    const match = String(item.id || '').match(/bulk-(\d+)/)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max
}
