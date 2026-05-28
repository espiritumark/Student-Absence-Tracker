import { useEffect, useState } from 'react'
import { formatClassLabel } from '../utils/classFormat'
import { dateKey, formatDateLabel } from '../utils/dates'
import SearchableSelect from './SearchableSelect'

function getSessionRecords(attendance, classId, day) {
  return attendance[classId]?.[day]?.records ?? {}
}

function getSessionMeta(attendance, classId, day) {
  const s = attendance[classId]?.[day]
  return { module: s?.module ?? '', startTime: s?.startTime ?? '', duration: s?.duration ?? '' }
}

export default function AttendanceSheet({ classes, attendance, setAttendance, setSessionMeta }) {
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? '')
  const [selectedDate, setSelectedDate] = useState(dateKey())

  const sortedClasses = [...classes].sort((a, b) =>
    formatClassLabel(a).localeCompare(formatClassLabel(b)),
  )
  const classOptions = sortedClasses.map((c) => ({ value: c.id, label: formatClassLabel(c) }))

  const selectedClass = classes.find((c) => c.id === selectedClassId)
  const sortedStudents = selectedClass
    ? [...selectedClass.students].sort((a, b) => a.name.localeCompare(b.name))
    : []

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

  const dayRecords = getSessionRecords(attendance, selectedClassId, selectedDate)
  const sessionMeta = getSessionMeta(attendance, selectedClassId, selectedDate)

  function setStatus(studentId, status) {
    setAttendance(selectedClassId, selectedDate, studentId, { status })
  }

  function setPriorNotice(studentId, priorNotice) {
    setAttendance(selectedClassId, selectedDate, studentId, { priorNotice })
  }

  function markAll(status) {
    if (!selectedClass) return
    for (const st of selectedClass.students) {
      setAttendance(selectedClassId, selectedDate, st.id, {
        status,
        priorNotice: false,
      })
    }
  }

  return (
    <section className="panel portal-panel">
      <header className="panel-header">
        <h2>Daily attendance (manual)</h2>
        <p className="panel-desc">
          Mark attendance by hand for any class and date. Checked = present.
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
              Module
              <input
                type="text"
                value={sessionMeta.module}
                onChange={(e) =>
                  setSessionMeta(selectedClassId, selectedDate, { module: e.target.value })
                }
              />
            </label>
          </div>

          {selectedClass && (
            <p className="portal-class-header">
              Class: <strong>{formatClassLabel(selectedClass)}</strong>
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
