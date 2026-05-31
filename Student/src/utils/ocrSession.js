import { parseAttendanceScreenshot, prewarmOcrWorker, terminateOcrWorker } from './parseScreenshot'

let activeJob = null
let pendingResult = null
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

export function prewarmOcr() {
  prewarmOcrWorker()
}

export async function cancelOcrJob() {
  pendingResult = null
  activeJob = null
  await terminateOcrWorker()
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

  activeJob.promise = parseAttendanceScreenshot(source, wrappedProgress, opts)
    .then((result) => {
      pendingResult = result
      return result
    })
    .finally(() => {
      activeJob = null
      notify()
    })

  return activeJob.promise
}
