import { useCallback, useEffect, useState } from 'react'
import { parseStudentReportKey, studentReportKey } from '../utils/reportingQueue'

const QUEUE_STORAGE_KEY = 'student-absence-tracker-report-queue-v1'

function loadAllQueues() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function loadReportingQueue(userKey) {
  return loadAllQueues()[userKey] || {}
}

function saveReportingQueue(userKey, queue) {
  const all = loadAllQueues()
  all[userKey] = queue
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(all))
}

export function pruneReportingQueue(queue, validKeys, reportedViolations = {}) {
  let changed = false
  const next = { ...queue }

  for (const key of Object.keys(next)) {
    if (reportedViolations[key] || !validKeys.has(key)) {
      delete next[key]
      changed = true
    }
  }

  return changed ? next : queue
}

export function useReportingQueue(userKey = 'local') {
  const [reportingQueue, setReportingQueue] = useState(() => loadReportingQueue(userKey))

  useEffect(() => {
    setReportingQueue(loadReportingQueue(userKey))
  }, [userKey])

  useEffect(() => {
    saveReportingQueue(userKey, reportingQueue)
  }, [userKey, reportingQueue])

  const queueStudent = useCallback((classId, studentId) => {
    const key = studentReportKey(classId, studentId)
    setReportingQueue((prev) => ({
      ...prev,
      [key]: {
        queuedAt: prev[key]?.queuedAt ?? new Date().toISOString(),
      },
    }))
  }, [])

  const queueStudentByKey = useCallback((key) => {
    const { classId, studentId } = parseStudentReportKey(key)
    if (!classId || !studentId) return
    setReportingQueue((prev) => ({
      ...prev,
      [key]: {
        queuedAt: prev[key]?.queuedAt ?? new Date().toISOString(),
      },
    }))
  }, [])

  const dequeueStudent = useCallback((classId, studentId) => {
    const key = studentReportKey(classId, studentId)
    setReportingQueue((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const replaceReportingQueue = useCallback((nextQueue) => {
    setReportingQueue(nextQueue)
  }, [])

  return {
    reportingQueue,
    queueStudent,
    queueStudentByKey,
    dequeueStudent,
    replaceReportingQueue,
  }
}
