import { useCallback, useEffect, useState } from 'react'
import { studentReportKey } from '../utils/reportingQueue'

const REPORTS_STORAGE_KEY = 'student-absence-tracker-reports-v1'

function loadAllReports() {
  try {
    return JSON.parse(localStorage.getItem(REPORTS_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function loadReportedViolations(userKey) {
  const all = loadAllReports()
  return all[userKey] || {}
}

function saveReportedViolations(userKey, reports) {
  const all = loadAllReports()
  all[userKey] = reports
  localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(all))
}

export function useReportedViolations(userKey = 'local') {
  const [reportedViolations, setReportedViolations] = useState(() =>
    loadReportedViolations(userKey),
  )

  useEffect(() => {
    setReportedViolations(loadReportedViolations(userKey))
  }, [userKey])

  useEffect(() => {
    saveReportedViolations(userKey, reportedViolations)
  }, [userKey, reportedViolations])

  const markStudentReported = useCallback((classId, studentId, meta = {}) => {
    const key = studentReportKey(classId, studentId)
    setReportedViolations((prev) => ({
      ...prev,
      [key]: {
        reportedAt: new Date().toISOString(),
        ...meta,
      },
    }))
  }, [])

  const clearStudentReported = useCallback((classId, studentId) => {
    const key = studentReportKey(classId, studentId)
    setReportedViolations((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  return { reportedViolations, markStudentReported, clearStudentReported }
}
