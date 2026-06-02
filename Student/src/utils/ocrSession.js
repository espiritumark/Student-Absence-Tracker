import { parseAttendanceScreenshot } from './parseScreenshot'

let activeJob = null
let pendingResult = null
let activeAbortController = null
const listeners = new Set()

function snapshot() {
  if (!activeJob) return null
  return {
    progress: activeJob.progress,
    label: activeJob.label,
    startedAt: activeJob.startedAt,
    previewUrl: activeJob.previewUrl,
  }
}

function notify() {
  const snap = snapshot()
  for (const listener of listeners) {
    listener(snap)
  }
}

export function isOcrRunning() {
  return Boolean(activeJob)
}

export function getOcrSnapshot() {
  return snapshot()
}

export function consumeOcrResult() {
  const result = pendingResult
  pendingResult = null
  return result
}

export function subscribeOcr(listener) {
  listeners.add(listener)
  listener(snapshot())
  return () => listeners.delete(listener)
}

export async function cancelOcrJob() {
  activeAbortController?.abort()
  activeAbortController = null
  pendingResult = null
  activeJob = null
  notify()
}

export async function runOcrJob(source, onProgress, opts) {
  if (activeJob?.promise) {
    return activeJob.promise
  }

  activeJob = {
    progress: 0,
    label: 'Preparing image…',
    startedAt: Date.now(),
    previewUrl: typeof source === 'string' ? source : null,
    promise: null,
  }
  notify()

  const wrappedProgress = (info) => {
    if (!activeJob) return
    activeJob.progress = info.progress
    activeJob.label = info.label
    notify()
    onProgress?.(info)
  }

  activeAbortController = new AbortController()

  activeJob.promise = parseAttendanceScreenshot(source, wrappedProgress, opts)
    .then((result) => {
      pendingResult = result
      return result
    })
    .catch((err) => {
      if (err?.name === 'AbortError') {
        throw new Error('Scan cancelled.')
      }
      throw err
    })
    .finally(() => {
      activeAbortController = null
      activeJob = null
      notify()
    })

  return activeJob.promise
}
