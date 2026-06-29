const DB_NAME = 'lph-portal-monitoring-v1'
const STORE = 'snapshots'
const RECORD_ID = 'latest'
const CACHE_VERSION = 1

/** How long a cached snapshot is shown on modal open without re-pulling. */
export const PORTAL_MONITORING_CACHE_TTL_MS = 45 * 60 * 1000

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readRecord() {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(RECORD_ID)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function savePortalMonitoringSnapshot(snapshot) {
  if (!snapshot) return false
  try {
    const db = await openDb()
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(
          {
            version: CACHE_VERSION,
            savedAt: Date.now(),
            snapshot,
          },
          RECORD_ID,
        )
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      return true
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}

export async function loadPortalMonitoringSnapshot({
  maxAgeMs = PORTAL_MONITORING_CACHE_TTL_MS,
} = {}) {
  try {
    const record = await readRecord()
    if (!record || record.version !== CACHE_VERSION || !record.snapshot) return null
    if (maxAgeMs > 0 && Date.now() - record.savedAt > maxAgeMs) return null
    return {
      snapshot: record.snapshot,
      savedAt: record.savedAt,
    }
  } catch {
    return null
  }
}

export async function clearPortalMonitoringSnapshotCache() {
  try {
    const db = await openDb()
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(RECORD_ID)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  } catch {
    // ignore
  }
}

export function formatPortalCacheAge(savedAt) {
  if (!savedAt) return ''
  const minutes = Math.max(1, Math.round((Date.now() - savedAt) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `${hours} hr${hours === 1 ? '' : 's'} ago`
}
