/**
 * Session-scoped import drafts (browser tab). Scan/parse = draft; Save = roster.
 * Bulk queue lives in bulkScreenshotSession; JSON & screenshot use keys below.
 */

const JSON_KEY = 'lp-hub-import-json-session'
const SCREENSHOT_KEY = 'lp-hub-import-screenshot-session'

function read(key) {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key, data) {
  try {
    if (!data) {
      sessionStorage.removeItem(key)
      return true
    }
    sessionStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }))
    return true
  } catch {
    return false
  }
}

function clear(key) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function loadJsonImportSession() {
  return read(JSON_KEY)
}

export function saveJsonImportSession(session) {
  return write(JSON_KEY, session)
}

export function clearJsonImportSession() {
  clear(JSON_KEY)
}

export function loadScreenshotImportSession() {
  return read(SCREENSHOT_KEY)
}

export function saveScreenshotImportSession(session) {
  const payload = JSON.stringify({ ...session, savedAt: Date.now() })
  try {
    if (payload.length > 4_000_000) {
      const trimmed = {
        ...session,
        pendingScreenshot: '',
        lastScannedScreenshot: '',
        previewUrl: '',
      }
      sessionStorage.setItem(SCREENSHOT_KEY, JSON.stringify({ ...trimmed, savedAt: Date.now() }))
      return { saved: true, trimmed: true }
    }
    sessionStorage.setItem(SCREENSHOT_KEY, payload)
    return { saved: true, trimmed: false }
  } catch {
    return { saved: false }
  }
}

export function clearScreenshotImportSession() {
  clear(SCREENSHOT_KEY)
}

/** Clear JSON, screenshot, and bulk drafts after a successful roster save or full reset. */
export function clearAllImportDraftSessions() {
  clearJsonImportSession()
  clearScreenshotImportSession()
  clearBulkScreenshotSession()
}

import {
  clearBulkScreenshotSession,
  loadBulkScreenshotSession,
  maxBulkIdFromQueue,
  saveBulkScreenshotSession,
} from './bulkScreenshotSession.js'

export {
  clearBulkScreenshotSession,
  loadBulkScreenshotSession,
  maxBulkIdFromQueue,
  saveBulkScreenshotSession,
}
