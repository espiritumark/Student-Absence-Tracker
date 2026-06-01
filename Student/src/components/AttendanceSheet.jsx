import { useEffect, useMemo, useState } from 'react'
import { formatClassLabel } from '../utils/classFormat'
import { dateKey } from '../utils/dates'
import {
  findSessionKey,
  listSessionsForDate,
  normalizeModuleKey,
} from '../utils/sessionKeys'
import SearchableSelect from './SearchableSelect'

function getSessionRecords(classAttendance, sessionKey) {
  return classAttendance?.[sessionKey]?.records ?? {}
}

function getSessionMeta(classAttendance, sessionKey) {
  const s = classAttendance?.[sessionKey]
  return { module: s?.module ?? '', startTime: s?.startTime ?? '', duration: s?.duration ?? '' }
}

export default function AttendanceSheet({ classes, attendance, setAttendance, setSessionMeta }) {
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? '')
  const [selectedDate, setSelectedDate] = useState(dateKey())
  const [moduleInput, setModuleInput] = useState('')

  const sortedClasses = [...classes].sort((a, b) =>
    formatClassLabel(a).localeCompare(formatClassLabel(b)),
  )
  const classOptions = sortedClasses.map((c) => ({ value: c.id, label: formatClassLabel(c) }))

  const selectedClass = classes.find((c) => c.id === selectedClassId)
  const sortedStudents = selectedClass
    ? [...selectedClass.students].sort((a, b) => a.name.localeCompare(b.name))
    : []

  const classAttendance = selectedClassId ? attendance?.[selectedClassId] || {} : {}

  useEffect(() => {
    if (classes.length === 0) {
      setSelectedClassId('')
      return
    }
    if (!classes.some((c) => c.id === selectedClassId)) {
      const sorted = [...classes].sort((a, b) =>
        formatClassLabel(a).localeCompare(formatClassLabel(b)),
      )
      setSelectedClassId(sorted[0]?.id ?? '')
    }
  }, [classes, selectedClassId])

  useEffect(() => {
    const sessions = listSessionsForDate(classAttendance, selectedDate)
    setModuleInput((prev) => {
      if (prev && sessions.some((s) => normalizeModuleKey(s.module) === normalizeModuleKey(prev))) {
        return prev
      }
      return sessions[0]?.module ?? ''
    })
  }, [selectedClassId, selectedDate, classAttendance])

  const sessionKey = findSessionKey(classAttendance, selectedDate, moduleInput)
  const dayRecords = getSessionRecords(classAttendance, sessionKey)
  const sessionMeta = getSessionMeta(classAttendance, sessionKey)

  const otherModules = useMemo(() => {
    return listSessionsForDate(classAttendance, selectedDate).filter(
      (entry) => normalizeModuleKey(entry.module) !== normalizeModuleKey(moduleInput),
    )
  }, [classAttendance, selectedDate, moduleInput])

  function setStatus(studentId, status) {
    setAttendance(selectedClassId, sessionKey, studentId, { status })
  }

  function setPriorNotice(studentId, priorNotice) {
    setAttendance(selectedClassId, sessionKey, studentId, { priorNotice })
  }

  function markAll(status) {
    if (!selectedClass) return
    for (const st of selectedClass.students) {
      setAttendance(selectedClassId, sessionKey, st.id, {
        status,
        priorNotice: false,
      })
    }
  }

  function selectModule(module) {
    setModuleInput(module)
  }

  return (
    <section className="panel portal-panel">
      <header className="panel-header">
        <h2>Daily attendance (manual)</h2>
        <p className="panel-desc">
          Mark attendance by hand for any class and date. The same class can have separate
          sessions per module or subject on the same day.
        </p>
      </header>

      {classes.length === 0 ? (
        <p className="empty-state">Import a screenshot or add a class under Classes.</p>
      ) : (
        <>
          <div className="portal-meta-grid attendance-meta">
            <div className="ss-field">
              <SearchableSelect
                options={classOptions}
                value={selectedClassId}
                onChange={setSelectedClassId}
                placeholder="Search class…"
                label="Class"
              />
            </div>
            <label>
              Date
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </label>
            <label className="span-2">
              Module / subject
              <input
                type="text"
                value={moduleInput}
                placeholder="e.g. Maths, English…"
                onChange={(e) => setModuleInput(e.target.value)}
                onBlur={() => {
                  if (moduleInput !== sessionMeta.module) {
                    setSessionMeta(selectedClassId, sessionKey, { module: moduleInput })
                  }
                }}
              />
            </label>
            {otherModules.length > 0 && (
              <div className="span-full session-module-hints">
                <span className="muted small">Other sessions this date:</span>
                {otherModules.map(({ key, module }) => (
                  <button
                    key={key}
                    type="button"
                    className="btn btn-ghost btn-sm session-module-chip"
                    onClick={() => selectModule(module)}
                  >
                    {module || 'General session'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedClass && (
            <p className="portal-class-header">
              Class: <strong>{formatClassLabel(selectedClass)}</strong>
              {moduleInput.trim() && (
                <>
                  {' '}
                  · Module: <strong>{moduleInput.trim()}</strong>
                </>
              )}
            </p>
          )}

          <div className="portal-bulk-actions">
            <button type="button" className="btn btn-primary" onClick={() => markAll('present')}>
              Check all
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => markAll('absent')}>
              Uncheck all
            </button>
          </div>

          {!selectedClass?.students.length ? (
            <p className="empty-state">No students in this class.</p>
          ) : (
            <ol className="portal-student-list">
              {sortedStudents.map((st, i) => {
                const rec = dayRecords[st.id] || { status: 'present', priorNotice: false }
                const present = rec.status !== 'absent'
                return (
                  <li key={st.id} className={!present ? 'row-absent' : ''}>
                    <span className="row-num">{i + 1}</span>
                    <input
                      type="checkbox"
                      checked={present}
                      onChange={() => setStatus(st.id, present ? 'absent' : 'present')}
                      aria-label={`${st.name} present`}
                    />
                    <span className="student-name">{st.name}</span>
                    {!present && (
                      <label className="notice-inline">
                        <input
                          type="checkbox"
                          checked={rec.priorNotice}
                          onChange={(e) => setPriorNotice(st.id, e.target.checked)}
                        />
                        Prior notice
                      </label>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </>
      )}
    </section>
  )
}
