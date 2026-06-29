import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPortalClassRoster } from '../lib/portalBridgeClient'
import {
  buildApplyPayloadFromAttendanceReview,
  buildPortalAttendancePreview,
  buildPortalAttendanceReviewDraft,
} from '../utils/portalAttendanceReview'
import { useAuth } from '../contexts/AuthContext'
import {
  dbAddClass,
  dbAddStudent,
  dbDeleteSession,
  dbDeleteModuleSessions,
  dbImportPortalSession,
  dbImportStudentsBulk,
  dbLinkPortalClasses,
  dbRemoveClass,
  dbRemoveStudent,
  dbSetAttendance,
  dbSetSessionMeta,
  dbUpdateStudent,
  fetchAppState,
  formatDbError,
} from '../lib/database'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  appendActivityLog,
  buildActivityEntry,
  clearActivityLog,
  loadActivityLog,
} from '../utils/activityLog'
import { listSessionKeysForModule } from '../utils/sessionKeys'
import {
  applyStudentPatches,
  collectRosterPatchesForSession,
  manualOverridePatchAfterSession,
} from '../utils/attendanceStats'
import { findMatchingClass, formatClassLabel } from '../utils/classFormat'
import { dateKey } from '../utils/dates'
import { findSessionKey, makeSessionKey } from '../utils/sessionKeys'

const STORAGE_KEY = 'student-absence-tracker-v2'

const emptyState = { classes: [], attendance: {} }

function normalizeRecord(rec) {
  if (!rec) return { status: 'present', priorNotice: false }
  return {
    status: rec.status === 'absent' ? 'absent' : 'present',
    priorNotice: Boolean(rec.priorNotice),
  }
}

function normalizeSession(session) {
  if (!session) return { module: '', startTime: '', duration: '', records: {} }
  if (session.records) {
    return {
      module: session.module || '',
      startTime: session.startTime || '',
      duration: session.duration || '',
      records: Object.fromEntries(
        Object.entries(session.records).map(([id, rec]) => [id, normalizeRecord(rec)]),
      ),
    }
  }
  const records = {}
  for (const [id, rec] of Object.entries(session)) {
    if (id === 'module' || id === 'startTime' || id === 'duration') continue
    if (rec && typeof rec === 'object' && 'status' in rec) {
      records[id] = normalizeRecord(rec)
    }
  }
  return {
    module: session.module || '',
    startTime: session.startTime || '',
    duration: session.duration || '',
    records,
  }
}

function migrateClass(cls) {
  if (cls.intake != null) return normalizeClass(cls)
  const parsed = cls.name?.match(
    /INTAKE\s*(\d+)\s*LEVEL\s*(\d+)\s+(.+?)\s+GROUP\s*(\d+)/i,
  )
  if (parsed) {
    return normalizeClass({
      ...cls,
      intake: Number(parsed[1]),
      level: Number(parsed[2]),
      qualification: parsed[3].trim(),
      group: Number(parsed[4]),
    })
  }
  return normalizeClass(cls)
}

function normalizeClass(cls) {
  return {
    ...cls,
    students: Array.isArray(cls.students) ? cls.students : [],
  }
}

export function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState
    const parsed = JSON.parse(raw)
    const attendance = {}
    for (const [classId, byDay] of Object.entries(parsed.attendance || {})) {
      attendance[classId] = {}
      for (const [day, session] of Object.entries(byDay)) {
        attendance[classId][day] = normalizeSession(session)
      }
    }
    return {
      classes: (parsed.classes || []).map(migrateClass),
      attendance,
    }
  } catch {
    return emptyState
  }
}

function saveLocalState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function createId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ').toUpperCase()
}

export function useStore() {
  const { user, cloudEnabled } = useAuth()
  const userId = user?.id
  const useCloud = cloudEnabled && Boolean(userId)
  const [state, setState] = useState(emptyState)
  const [initialLoading, setInitialLoading] = useState(useCloud)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [activityLog, setActivityLog] = useState(() => loadActivityLog())
  const hasInitialLoadedRef = useRef(false)

  const recordActivity = useCallback((entry) => {
    const next = appendActivityLog(entry)
    setActivityLog(next)
    return next
  }, [])

  const dismissActivityLog = useCallback(() => {
    setActivityLog(clearActivityLog())
  }, [])

  const getClassLabel = useCallback(
    (classId) => {
      const cls = state.classes.find((c) => c.id === classId)
      return cls ? formatClassLabel(cls) : 'Unknown class'
    },
    [state.classes],
  )

  const getStudentName = useCallback(
    (classId, studentId) => {
      const cls = state.classes.find((c) => c.id === classId)
      const st = cls?.students?.find((s) => s.id === studentId)
      return st?.name || 'Learning Partner'
    },
    [state.classes],
  )

  const refreshFromCloud = useCallback(async ({ silent = false } = {}) => {
    if (!userId) return
    if (silent) {
      setSyncing(true)
    } else {
      setInitialLoading(true)
    }
    setSyncError('')
    try {
      const data = await fetchAppState(userId)
      setState({ classes: data.classes, attendance: data.attendance })
    } catch (e) {
      setSyncError(e.message || 'Failed to load from cloud')
    } finally {
      hasInitialLoadedRef.current = true
      if (silent) {
        setSyncing(false)
      } else {
        setInitialLoading(false)
      }
    }
  }, [userId])

  useEffect(() => {
    if (useCloud) {
      refreshFromCloud({ silent: hasInitialLoadedRef.current })
    } else {
      hasInitialLoadedRef.current = false
      setState(loadLocalState())
      setInitialLoading(false)
    }
  }, [useCloud, refreshFromCloud])

  useEffect(() => {
    if (!useCloud) saveLocalState(state)
  }, [state, useCloud])

  const runLocal = useCallback((updater) => {
    setState((s) => (typeof updater === 'function' ? updater(s) : updater))
  }, [])

  const addClass = useCallback(
    async (fields) => {
      const meta =
        typeof fields === 'string'
          ? { name: fields.trim(), intake: null, level: null, group: null, qualification: fields.trim() }
          : fields
      if (!meta.qualification && !meta.name) return null
      const classLabel = meta.name || formatClassLabel(meta)

      if (useCloud) {
        try {
          const created = await dbAddClass(user.id, fields)
          await refreshFromCloud({ silent: true })
          recordActivity(
            buildActivityEntry({
              category: 'class',
              verb: 'added',
              title: `Added Class — ${classLabel}`,
            }),
          )
          return created?.id ?? null
        } catch (e) {
          recordActivity(
            buildActivityEntry({
              category: 'class',
              verb: 'added',
              title: `Add Class — ${classLabel}`,
              success: false,
              error: e.message,
            }),
          )
          setSyncError(formatDbError(e))
          throw e
        }
      }

      const id = createId()
      const cls = {
        id,
        intake: meta.intake ?? null,
        level: meta.level ?? null,
        qualification: meta.qualification || meta.name,
        group: meta.group ?? null,
        name: classLabel,
        students: [],
      }
      runLocal((s) => ({ ...s, classes: [...s.classes, cls] }))
      recordActivity(
        buildActivityEntry({
          category: 'class',
          verb: 'added',
          title: `Added Class — ${classLabel}`,
        }),
      )
      return id
    },
    [useCloud, user, refreshFromCloud, runLocal, recordActivity],
  )

  const removeClass = useCallback(
    async (classId) => {
      const classLabel = getClassLabel(classId)

      if (useCloud) {
        try {
          await dbRemoveClass(classId)
          await refreshFromCloud({ silent: true })
          recordActivity(
            buildActivityEntry({
              category: 'class',
              verb: 'removed',
              title: `Removed Class — ${classLabel}`,
            }),
          )
        } catch (e) {
          recordActivity(
            buildActivityEntry({
              category: 'class',
              verb: 'removed',
              title: `Remove Class — ${classLabel}`,
              success: false,
              error: e.message,
            }),
          )
          setSyncError(formatDbError(e))
          throw e
        }
        return
      }
      runLocal((s) => {
        const { [classId]: _, ...restAttendance } = s.attendance
        return {
          classes: s.classes.filter((c) => c.id !== classId),
          attendance: restAttendance,
        }
      })
      recordActivity(
        buildActivityEntry({
          category: 'class',
          verb: 'removed',
          title: `Removed Class — ${classLabel}`,
        }),
      )
    },
    [useCloud, refreshFromCloud, runLocal, recordActivity, getClassLabel],
  )

  const addStudent = useCallback(
    async (classId, name) => {
      const trimmed = normalizeName(name)
      if (!trimmed) return
      const classLabel = getClassLabel(classId)

      if (useCloud) {
        try {
          await dbAddStudent(user.id, classId, name)
          await refreshFromCloud({ silent: true })
          recordActivity(
            buildActivityEntry({
              category: 'student',
              verb: 'added',
              title: `Added ${trimmed} — ${classLabel}`,
            }),
          )
        } catch (e) {
          recordActivity(
            buildActivityEntry({
              category: 'student',
              verb: 'added',
              title: `Add ${trimmed} — ${classLabel}`,
              success: false,
              error: e.message,
            }),
          )
          setSyncError(formatDbError(e))
        }
        return
      }

      runLocal((s) => ({
        ...s,
        classes: s.classes.map((c) =>
          c.id === classId
            ? {
                ...c,
                students: c.students.some((st) => st.name === trimmed)
                  ? c.students
                  : [...c.students, { id: createId(), name: trimmed }],
              }
            : c,
        ),
      }))
      recordActivity(
        buildActivityEntry({
          category: 'student',
          verb: 'added',
          title: `Added ${trimmed} — ${classLabel}`,
        }),
      )
    },
    [useCloud, user, refreshFromCloud, runLocal, recordActivity, getClassLabel],
  )

  const updateStudent = useCallback(
    async (classId, studentId, patch) => {
      let nextPatch = patch
      if ('name' in patch) {
        const trimmed = normalizeName(patch.name)
        if (!trimmed) throw new Error('Name cannot be empty.')
        const roster = state.classes.find((c) => c.id === classId)?.students ?? []
        const duplicate = roster.some(
          (st) => st.id !== studentId && normalizeName(st.name) === trimmed,
        )
        if (duplicate) {
          throw new Error('A learning partner with this name already exists in this class.')
        }
        nextPatch = { ...patch, name: trimmed }
      }

      if (useCloud) {
        try {
          await dbUpdateStudent(studentId, nextPatch)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          const message = formatDbError(e)
          setSyncError(message)
          throw new Error(message)
        }
        return
      }
      runLocal((s) => ({
        ...s,
        classes: s.classes.map((c) =>
          c.id === classId
            ? {
                ...c,
                students: c.students.map((st) =>
                  st.id === studentId ? { ...st, ...nextPatch } : st,
                ),
              }
            : c,
        ),
      }))
    },
    [useCloud, refreshFromCloud, runLocal, state.classes],
  )

  const bulkUpdateStudents = useCallback(
    async (classId, updates) => {
      if (!updates?.length) return

      const roster = state.classes.find((c) => c.id === classId)?.students ?? []
      const normalizedUpdates = updates.map(({ studentId, patch }) => {
        if (!('name' in patch)) return { studentId, patch }
        const trimmed = normalizeName(patch.name)
        if (!trimmed) throw new Error('Name cannot be empty.')
        const duplicate = roster.some(
          (st) => st.id !== studentId && normalizeName(st.name) === trimmed,
        )
        if (duplicate) {
          throw new Error('A learning partner with this name already exists in this class.')
        }
        return { studentId, patch: { ...patch, name: trimmed } }
      })

      if (useCloud) {
        try {
          for (const { studentId, patch } of normalizedUpdates) {
            await dbUpdateStudent(studentId, patch)
          }
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(formatDbError(e))
          throw e
        }
        return
      }
      runLocal((s) => ({
        ...s,
        classes: s.classes.map((c) => {
          if (c.id !== classId) return c
          const patchById = Object.fromEntries(
            normalizedUpdates.map(({ studentId, patch }) => [studentId, patch]),
          )
          return {
            ...c,
            students: c.students.map((st) =>
              patchById[st.id] ? { ...st, ...patchById[st.id] } : st,
            ),
          }
        }),
      }))
    },
    [useCloud, refreshFromCloud, runLocal, state.classes],
  )

  const removeStudent = useCallback(
    async (classId, studentId) => {
      const studentName = getStudentName(classId, studentId)
      const classLabel = getClassLabel(classId)

      if (useCloud) {
        try {
          await dbRemoveStudent(studentId)
          await refreshFromCloud({ silent: true })
          recordActivity(
            buildActivityEntry({
              category: 'student',
              verb: 'removed',
              title: `Removed ${studentName} — ${classLabel}`,
            }),
          )
        } catch (e) {
          recordActivity(
            buildActivityEntry({
              category: 'student',
              verb: 'removed',
              title: `Remove ${studentName} — ${classLabel}`,
              success: false,
              error: e.message,
            }),
          )
          setSyncError(formatDbError(e))
        }
        return
      }
      runLocal((s) => {
        const classAttendance = s.attendance[classId]
        let nextAttendance = s.attendance
        if (classAttendance) {
          const nextClass = {}
          for (const [day, session] of Object.entries(classAttendance)) {
            const { [studentId]: _, ...rest } = session.records || {}
            if (Object.keys(rest).length) nextClass[day] = { ...session, records: rest }
          }
          nextAttendance = { ...s.attendance, [classId]: nextClass }
          if (!Object.keys(nextClass).length) {
            const { [classId]: __, ...restAtt } = nextAttendance
            nextAttendance = restAtt
          }
        }
        return {
          classes: s.classes.map((c) =>
            c.id === classId
              ? { ...c, students: c.students.filter((st) => st.id !== studentId) }
              : c,
          ),
          attendance: nextAttendance,
        }
      })
      recordActivity(
        buildActivityEntry({
          category: 'student',
          verb: 'removed',
          title: `Removed ${studentName} — ${classLabel}`,
        }),
      )
    },
    [useCloud, refreshFromCloud, runLocal, recordActivity, getClassLabel, getStudentName],
  )

  const setAttendance = useCallback(
    async (classId, day, studentId, patch) => {
      if (useCloud) {
        try {
          await dbSetAttendance(user.id, classId, day, studentId, patch)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(formatDbError(e))
        }
        return
      }
      runLocal((s) => {
        const classAtt = s.attendance[classId] || {}
        const session = normalizeSession(classAtt[day])
        const current = session.records[studentId] || { status: 'present', priorNotice: false }
        const prevStatus = current.status
        const next = { ...current, ...patch }
        if (next.status === 'present') next.priorNotice = false

        let classes = s.classes
        const cls = classes.find((c) => c.id === classId)
        const student = cls?.students?.find((st) => st.id === studentId)
        const manualPatch = student
          ? manualOverridePatchAfterSession(student, prevStatus, next.status)
          : null
        if (manualPatch && cls) {
          classes = classes.map((c) =>
            c.id !== classId
              ? c
              : {
                  ...c,
                  students: c.students.map((st) =>
                    st.id === studentId ? { ...st, ...manualPatch } : st,
                  ),
                },
          )
        }

        return {
          classes,
          attendance: {
            ...s.attendance,
            [classId]: {
              ...classAtt,
              [day]: { ...session, records: { ...session.records, [studentId]: next } },
            },
          },
        }
      })
    },
    [useCloud, user, refreshFromCloud, runLocal],
  )

  const deleteSession = useCallback(
    async (classId, sessionKey) => {
      if (useCloud) {
        try {
          await dbDeleteSession(user.id, classId, sessionKey)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(formatDbError(e))
          throw e
        }
        return
      }
      runLocal((s) => {
        const classAtt = s.attendance[classId]
        if (!classAtt?.[sessionKey]) return s
        const { [sessionKey]: _removed, ...restSessions } = classAtt
        return {
          ...s,
          attendance: {
            ...s.attendance,
            [classId]: restSessions,
          },
        }
      })
    },
    [useCloud, user, refreshFromCloud, runLocal],
  )

  const deleteModuleSessions = useCallback(
    async (classId, moduleFilter) => {
      if (useCloud) {
        try {
          await dbDeleteModuleSessions(user.id, classId, moduleFilter)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(formatDbError(e))
          throw e
        }
        return 0
      }

      let removed = 0
      runLocal((s) => {
        const classAtt = s.attendance[classId]
        if (!classAtt) return s
        const keys = listSessionKeysForModule(classAtt, moduleFilter)
        if (!keys.length) return s
        removed = keys.length
        const nextSessions = { ...classAtt }
        for (const key of keys) {
          delete nextSessions[key]
        }
        return {
          ...s,
          attendance: {
            ...s.attendance,
            [classId]: nextSessions,
          },
        }
      })
      return removed
    },
    [useCloud, user, refreshFromCloud, runLocal],
  )

  const setSessionMeta = useCallback(
    async (classId, day, meta) => {
      if (useCloud) {
        try {
          await dbSetSessionMeta(user.id, classId, day, meta)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(formatDbError(e))
        }
        return
      }
      runLocal((s) => {
        const classAtt = s.attendance[classId] || {}
        const session = normalizeSession(classAtt[day])
        return {
          ...s,
          attendance: {
            ...s.attendance,
            [classId]: { ...classAtt, [day]: { ...session, ...meta } },
          },
        }
      })
    },
    [useCloud, user, refreshFromCloud, runLocal],
  )

  const importPortalSession = useCallback(
    async (payload) => {
      if (useCloud) {
        try {
          await dbImportPortalSession(user.id, payload)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(formatDbError(e))
          throw e
        }
        return
      }
      runLocal((s) => {
        const { classId: targetClassId, classMeta, date, module, startTime, duration, students } =
          payload
        let classes = s.classes.map(normalizeClass)
        let classId = targetClassId || findMatchingClass(classes, classMeta)?.id

        if (!classId) {
          classId = createId()
          classes = [
            ...classes,
            normalizeClass({
              id: classId,
              ...classMeta,
              name: formatClassLabel(classMeta),
              students: [],
            }),
          ]
        }

        const clsIndex = classes.findIndex((c) => c.id === classId)
        if (clsIndex < 0) {
          throw new Error('Could not resolve class for this import.')
        }

        const cls = { ...classes[clsIndex], students: [...(classes[clsIndex].students ?? [])] }
        const nameToId = new Map(
          cls.students.map((st) => [normalizeName(st.name), st.id]),
        )

        for (const row of students) {
          let id = row.rosterStudentId || null
          const name = normalizeName(row.name)

          if (!id) {
            id = nameToId.get(name)
          }

          if (!id) {
            const newId = createId()
            nameToId.set(name, newId)
            cls.students = [...cls.students, { id: newId, name: row.name }]
            id = newId
          } else if (row.rosterStudentId && row.linkedNameChoice === 'scanned') {
            const studentIndex = cls.students.findIndex((st) => st.id === id)
            if (studentIndex >= 0 && normalizeName(cls.students[studentIndex].name) !== name) {
              const updated = { ...cls.students[studentIndex], name: row.name }
              cls.students = [
                ...cls.students.slice(0, studentIndex),
                updated,
                ...cls.students.slice(studentIndex + 1),
              ]
              nameToId.set(name, id)
            }
          }
        }
        classes[clsIndex] = cls

        const day = date || dateKey()
        const classAtt = s.attendance[classId] || {}
        const sessionKey = findSessionKey(classAtt, day, module)
        const session = normalizeSession(classAtt[sessionKey])
        const priorRecords = { ...session.records }
        const records = { ...priorRecords }

        for (const row of students) {
          let id = row.rosterStudentId || nameToId.get(normalizeName(row.name))
          if (!id) continue
          records[id] = {
            status: row.present ? 'present' : 'absent',
            priorNotice: false,
          }
        }

        const rosterPatches = collectRosterPatchesForSession(cls.students, priorRecords, records)
        cls.students = applyStudentPatches(cls.students, rosterPatches)
        classes[clsIndex] = cls

        return {
          classes,
          attendance: {
            ...s.attendance,
            [classId]: {
              ...classAtt,
              [sessionKey]: {
                module: module || session.module || '',
                startTime: startTime || session.startTime,
                duration: duration || session.duration,
                records,
              },
            },
          },
        }
      })
    },
    [useCloud, user, refreshFromCloud, runLocal],
  )

  const importStudentsBulk = useCallback(
    async (classId, namesText, options = {}) => {
      const { skipActivity = false } = options
      const classLabel = getClassLabel(classId)

      if (useCloud) {
        try {
          const count = await dbImportStudentsBulk(user.id, classId, namesText)
          await refreshFromCloud({ silent: true })
          if (count > 0) {
            if (!skipActivity) {
              recordActivity(
                buildActivityEntry({
                  category: 'student',
                  verb: 'imported',
                  title: `Bulk import — ${classLabel}`,
                  lines: [`${count} ${count === 1 ? 'Learning Partner' : 'Learning Partners'} added`],
                }),
              )
            }
          }
          return count
        } catch (e) {
          if (!skipActivity) {
            recordActivity(
              buildActivityEntry({
                category: 'student',
                verb: 'imported',
                title: `Bulk import — ${classLabel}`,
                success: false,
                error: e.message,
              }),
            )
          }
          setSyncError(formatDbError(e))
          throw e
        }
      }
      const names = namesText.split(/[\n,;]+/).map(normalizeName).filter(Boolean)
      if (!names.length) return 0
      let addedCount = 0
      runLocal((s) => ({
        ...s,
        classes: s.classes.map((c) => {
          if (c.id !== classId) return c
          const existing = new Set(c.students.map((st) => st.name))
          const added = names
            .filter((n) => !existing.has(n))
            .map((name) => ({ id: createId(), name }))
          addedCount = added.length
          return { ...c, students: [...c.students, ...added] }
        }),
      }))
      if (addedCount > 0) {
        if (!skipActivity) {
          recordActivity(
            buildActivityEntry({
              category: 'student',
              verb: 'imported',
              title: `Bulk import — ${classLabel}`,
              lines: [`${addedCount} ${addedCount === 1 ? 'Learning Partner' : 'Learning Partners'} added`],
            }),
          )
        }
      }
      return addedCount
    },
    [useCloud, user, refreshFromCloud, runLocal, recordActivity, getClassLabel],
  )

  const syncRosterFromPortal = useCallback(
    async (classId) => {
      const cls = state.classes.find((c) => c.id === classId)
      if (!cls?.portalClassId) {
        throw new Error(
          'This class is not linked to the college portal. Use Sync College Portal Classes first.',
        )
      }

      const classLabel = getClassLabel(classId)
      const { roster } = await fetchPortalClassRoster(cls.portalClassId)
      const portalStudents = roster?.students ?? []
      if (!portalStudents.length) {
        throw new Error('The college portal returned an empty roster for this class.')
      }

      const existing = new Set((cls.students ?? []).map((st) => normalizeName(st.name)))
      const alreadyPresent = portalStudents.filter((row) =>
        existing.has(normalizeName(row.name)),
      ).length
      const namesText = portalStudents.map((row) => row.name).join('\n')

      let added = 0
      try {
        added = await importStudentsBulk(classId, namesText, { skipActivity: true })
      } catch (e) {
        setSyncError(formatDbError(e))
        throw e
      }

      recordActivity(
        buildActivityEntry({
          category: 'student',
          verb: 'imported',
          title: `Portal roster — ${classLabel}`,
          lines: [
            `${portalStudents.length} on college portal`,
            `${added} new ${added === 1 ? 'Learning Partner' : 'Learning Partners'} added`,
            `${alreadyPresent} already in hub`,
          ],
        }),
      )

      return {
        portalCount: portalStudents.length,
        added,
        alreadyPresent,
        portalClassLabel: roster?.classLabel || '',
      }
    },
    [state.classes, getClassLabel, importStudentsBulk, recordActivity],
  )

  const previewPortalAttendance = useCallback(
    async (classId) => {
      const cls = state.classes.find((c) => c.id === classId)
      if (!cls?.portalClassId) {
        throw new Error(
          'This class is not linked to the college portal. Use Sync College Portal Classes first.',
        )
      }

      const { roster } = await fetchPortalClassRoster(cls.portalClassId)
      const preview = buildPortalAttendancePreview(cls, roster, state.classes, state.attendance)

      if (!preview.payload.hasAttendance) {
        throw new Error(
          'The portal page did not include attendance checkboxes for this session. Open the class on attendance.ccct.edu.bn for today’s session, then try again.',
        )
      }

      return {
        ...preview,
        reviewDraft: buildPortalAttendanceReviewDraft(preview),
        classLabel: getClassLabel(classId),
      }
    },
    [state.classes, state.attendance, getClassLabel],
  )

  const applyPortalAttendance = useCallback(
    async (reviewDraft) => {
      const payload = buildApplyPayloadFromAttendanceReview(reviewDraft)
      const classLabel = getClassLabel(payload.classId)

      await importPortalSession(payload)

      recordActivity(
        buildActivityEntry({
          category: 'attendance',
          verb: 'imported',
          title: `Portal attendance — ${classLabel}`,
          lines: [
            payload.module || 'General session',
            payload.date,
            `${payload.presentCount} present · ${payload.absentCount} absent merged`,
            payload.unmatched?.length
              ? `${payload.unmatched.length} portal name${payload.unmatched.length === 1 ? '' : 's'} not in hub roster`
              : 'All selected portal names matched hub roster',
          ],
        }),
      )

      return {
        date: payload.date,
        module: payload.module,
        presentCount: payload.presentCount,
        absentCount: payload.absentCount,
        matchedCount: payload.students.length,
        unmatchedCount: payload.unmatched?.length ?? 0,
      }
    },
    [getClassLabel, importPortalSession, recordActivity],
  )

  const syncAttendanceFromPortal = useCallback(
    async (classId) => {
      const preview = await previewPortalAttendance(classId)
      const result = await applyPortalAttendance(preview.reviewDraft)
      return result
    },
    [previewPortalAttendance, applyPortalAttendance],
  )

  const linkPortalClasses = useCallback(
    async (links) => {
      const payload = (links || []).filter(
        (link) => link?.classId && link.portalClassId != null,
      )
      if (!payload.length) return 0

      if (useCloud) {
        try {
          await dbLinkPortalClasses(payload)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(formatDbError(e))
          throw e
        }
      } else {
        runLocal((s) => ({
          ...s,
          classes: s.classes.map((cls) => {
            const link = payload.find((row) => row.classId === cls.id)
            return link ? { ...cls, portalClassId: link.portalClassId } : cls
          }),
        }))
      }

      recordActivity(
        buildActivityEntry({
          category: 'class',
          verb: 'linked',
          title: `Linked ${payload.length} class${payload.length === 1 ? '' : 'es'} to college portal`,
        }),
      )
      return payload.length
    },
    [useCloud, refreshFromCloud, runLocal, recordActivity],
  )

  const applyPortalClassSync = useCallback(
    async ({
      links = [],
      rosterAdds = [],
      updates = [],
      removes = [],
      attendanceUpdates = [],
    } = {}) => {
      const linkPayload = (links || []).filter(
        (link) => link?.classId && link.portalClassId != null,
      )
      const rosterPayload = (rosterAdds || []).filter(
        (row) => row?.classId && String(row.namesText || '').trim(),
      )
      const updatePayload = (updates || []).filter(
        (row) => row?.classId && row?.studentId && String(row.name || '').trim(),
      )
      const removePayload = (removes || []).filter((row) => row?.classId && row?.studentId)
      const attendancePayload = (attendanceUpdates || []).filter(
        (row) => row?.classId && row?.studentId && row?.patch,
      )

      if (
        !linkPayload.length &&
        !rosterPayload.length &&
        !updatePayload.length &&
        !removePayload.length &&
        !attendancePayload.length
      ) {
        return {
          linksSaved: 0,
          studentsAdded: 0,
          studentsUpdated: 0,
          studentsRemoved: 0,
          attendanceUpdated: 0,
        }
      }

      try {
        if (linkPayload.length) {
          if (useCloud) {
            await dbLinkPortalClasses(linkPayload)
          } else {
            runLocal((s) => ({
              ...s,
              classes: s.classes.map((cls) => {
                const link = linkPayload.find((row) => row.classId === cls.id)
                return link ? { ...cls, portalClassId: link.portalClassId } : cls
              }),
            }))
          }
        }

        const updatesByClass = new Map()
        for (const row of updatePayload) {
          const list = updatesByClass.get(row.classId) ?? []
          list.push({ studentId: row.studentId, patch: { name: row.name } })
          updatesByClass.set(row.classId, list)
        }
        for (const [classId, classUpdates] of updatesByClass) {
          await bulkUpdateStudents(classId, classUpdates)
        }

        let studentsAdded = 0
        for (const row of rosterPayload) {
          const added = await importStudentsBulk(row.classId, row.namesText, {
            skipActivity: true,
          })
          studentsAdded += added
        }

        if (removePayload.length) {
          if (useCloud) {
            for (const row of removePayload) {
              await dbRemoveStudent(row.studentId)
            }
          } else {
            runLocal((s) => {
              let nextAttendance = s.attendance
              const classesNext = s.classes.map((cls) => {
                const removeIds = new Set(
                  removePayload.filter((row) => row.classId === cls.id).map((row) => row.studentId),
                )
                if (!removeIds.size) return cls

                let classAttendance = nextAttendance[cls.id]
                if (classAttendance) {
                  const nextClassAttendance = {}
                  for (const [day, session] of Object.entries(classAttendance)) {
                    const nextRecords = { ...(session.records || {}) }
                    for (const studentId of removeIds) {
                      delete nextRecords[studentId]
                    }
                    if (Object.keys(nextRecords).length) {
                      nextClassAttendance[day] = { ...session, records: nextRecords }
                    }
                  }
                  nextAttendance = { ...nextAttendance, [cls.id]: nextClassAttendance }
                  if (!Object.keys(nextClassAttendance).length) {
                    const { [cls.id]: _, ...restAtt } = nextAttendance
                    nextAttendance = restAtt
                  }
                }

                return {
                  ...cls,
                  students: cls.students.filter((student) => !removeIds.has(student.id)),
                }
              })

              return { ...s, classes: classesNext, attendance: nextAttendance }
            })
          }
        }

        const attendanceByClass = new Map()
        for (const row of attendancePayload) {
          const list = attendanceByClass.get(row.classId) ?? []
          list.push({ studentId: row.studentId, patch: row.patch })
          attendanceByClass.set(row.classId, list)
        }
        let attendanceUpdated = 0
        for (const [classId, classAttendanceUpdates] of attendanceByClass) {
          await bulkUpdateStudents(classId, classAttendanceUpdates)
          attendanceUpdated += classAttendanceUpdates.length
        }

        if (
          useCloud &&
          (linkPayload.length ||
            studentsAdded > 0 ||
            updatePayload.length > 0 ||
            removePayload.length ||
            attendanceUpdated > 0)
        ) {
          await refreshFromCloud({ silent: true })
        }

        const lines = []
        if (linkPayload.length) {
          lines.push(
            `${linkPayload.length} class link${linkPayload.length === 1 ? '' : 's'} saved`,
          )
        }
        if (updatePayload.length > 0) {
          lines.push(
            `${updatePayload.length} ${updatePayload.length === 1 ? 'name' : 'names'} updated to match portal`,
          )
        }
        if (studentsAdded > 0) {
          lines.push(
            `${studentsAdded} new ${studentsAdded === 1 ? 'Learning Partner' : 'Learning Partners'} added from portal`,
          )
        }
        if (removePayload.length > 0) {
          lines.push(
            `${removePayload.length} hub-only ${removePayload.length === 1 ? 'name' : 'names'} removed`,
          )
        }
        if (attendanceUpdated > 0) {
          lines.push(
            `${attendanceUpdated} absence count${attendanceUpdated === 1 ? '' : 's'} overwritten from portal`,
          )
        }

        recordActivity(
          buildActivityEntry({
            category: 'class',
            verb: 'linked',
            title: 'College portal sync',
            lines,
          }),
        )

        return {
          linksSaved: linkPayload.length,
          studentsAdded,
          studentsUpdated: updatePayload.length,
          studentsRemoved: removePayload.length,
          attendanceUpdated,
        }
      } catch (e) {
        setSyncError(formatDbError(e))
        throw e
      }
    },
    [useCloud, refreshFromCloud, runLocal, importStudentsBulk, bulkUpdateStudents, recordActivity],
  )

  const applyPortalHubMonitoringSync = useCallback(
    async ({
      links = [],
      classCreates = [],
      rosterAdds = [],
      updates = [],
      sessionImports = [],
    } = {}) => {
      const classIdByPortal = new Map()
      for (const link of links || []) {
        if (link?.classId && link.portalClassId != null) {
          classIdByPortal.set(link.portalClassId, link.classId)
        }
      }

      let classesCreated = 0
      for (const row of classCreates || []) {
        const classId = await addClass(row.fields)
        if (classId && row.portalClassId != null) {
          classIdByPortal.set(row.portalClassId, classId)
          classesCreated += 1
        }
      }

      const resolveClassId = (classId, portalClassId) =>
        classId ?? (portalClassId != null ? classIdByPortal.get(portalClassId) : null)

      const linkPayload = [
        ...(links || []).map((link) => ({
          classId: resolveClassId(link.classId, link.portalClassId),
          portalClassId: link.portalClassId,
        })),
        ...[...classIdByPortal.entries()].map(([portalClassId, classId]) => ({
          classId,
          portalClassId,
        })),
      ].filter((link) => link.classId && link.portalClassId != null)

      const uniqueLinks = []
      const seenLink = new Set()
      for (const link of linkPayload) {
        const key = `${link.classId}:${link.portalClassId}`
        if (seenLink.has(key)) continue
        seenLink.add(key)
        uniqueLinks.push(link)
      }

      if (uniqueLinks.length) {
        if (useCloud) {
          await dbLinkPortalClasses(uniqueLinks)
        } else {
          runLocal((s) => ({
            ...s,
            classes: s.classes.map((cls) => {
              const link = uniqueLinks.find((row) => row.classId === cls.id)
              return link ? { ...cls, portalClassId: link.portalClassId } : cls
            }),
          }))
        }
      }

      const updatesByClass = new Map()
      for (const row of updates || []) {
        const classId = resolveClassId(row.classId, row.portalClassId)
        if (!classId || !row.studentId) continue
        const list = updatesByClass.get(classId) ?? []
        list.push({ studentId: row.studentId, patch: { name: row.name } })
        updatesByClass.set(classId, list)
      }
      for (const [classId, classUpdates] of updatesByClass) {
        await bulkUpdateStudents(classId, classUpdates)
      }

      let studentsAdded = 0
      for (const row of rosterAdds || []) {
        const classId = resolveClassId(row.classId, row.portalClassId)
        if (!classId || !String(row.namesText || '').trim()) continue
        const added = await importStudentsBulk(classId, row.namesText, { skipActivity: true })
        studentsAdded += added
      }

      let sessionsImported = 0
      for (const payload of sessionImports || []) {
        const classId = resolveClassId(payload.classId, payload.portalClassId)
        if (!classId || !payload.students?.length) continue
        await importPortalSession({
          classId,
          classMeta: {},
          date: payload.date,
          module: payload.module || '',
          startTime: '',
          duration: '',
          students: payload.students,
        })
        sessionsImported += 1
      }

      if (useCloud && (uniqueLinks.length || studentsAdded || updates.length || sessionsImported)) {
        await refreshFromCloud({ silent: true })
      }

      const lines = []
      if (uniqueLinks.length) {
        lines.push(`${uniqueLinks.length} class link${uniqueLinks.length === 1 ? '' : 's'} saved`)
      }
      if (classesCreated > 0) {
        lines.push(`${classesCreated} new class${classesCreated === 1 ? '' : 'es'} created from portal`)
      }
      if (studentsAdded > 0) {
        lines.push(
          `${studentsAdded} new Learning Partner${studentsAdded === 1 ? '' : 's'} added from portal`,
        )
      }
      if (updates.length > 0) {
        lines.push(`${updates.length} name${updates.length === 1 ? '' : 's'} updated to match portal`)
      }
      if (sessionsImported > 0) {
        lines.push(
          `${sessionsImported} session${sessionsImported === 1 ? '' : 's'} imported from portal grids`,
        )
      }

      if (lines.length) {
        recordActivity(
          buildActivityEntry({
            category: 'class',
            verb: 'linked',
            title: 'College portal monitoring sync',
            lines,
          }),
        )
      }

      return {
        linksSaved: uniqueLinks.length,
        classesCreated,
        studentsAdded,
        studentsUpdated: updates.length,
        sessionsImported,
      }
    },
    [useCloud, refreshFromCloud, runLocal, addClass, importStudentsBulk, bulkUpdateStudents, importPortalSession, recordActivity],
  )

  const clearSyncError = useCallback(() => setSyncError(''), [])

  return {
    classes: state.classes,
    attendance: state.attendance,
    loading: initialLoading,
    initialLoading,
    syncing,
    syncError,
    useCloud,
    clearSyncError,
    activityLog,
    recordActivity,
    /** @deprecated use recordActivity */
    recordAction: recordActivity,
    dismissActivityLog,
    /** @deprecated use dismissActivityLog */
    dismissActionLog: dismissActivityLog,
    /** @deprecated use activityLog */
    actionLog: activityLog,
    addClass,
    removeClass,
    addStudent,
    updateStudent,
    bulkUpdateStudents,
    removeStudent,
    setAttendance,
    setSessionMeta,
    deleteSession,
    deleteModuleSessions,
    importPortalSession,
    importStudentsBulk,
    linkPortalClasses,
    applyPortalClassSync,
    applyPortalHubMonitoringSync,
    syncRosterFromPortal,
    previewPortalAttendance,
    applyPortalAttendance,
    syncAttendanceFromPortal,
  }
}
