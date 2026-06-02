import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  dbAddClass,
  dbAddStudent,
  dbImportPortalSession,
  dbImportStudentsBulk,
  dbRemoveClass,
  dbRemoveStudent,
  dbSetAttendance,
  dbSetSessionMeta,
  dbUpdateStudent,
  fetchAppState,
} from '../lib/database'
import { isSupabaseConfigured } from '../lib/supabase'
import { findMatchingClass, formatClassLabel } from '../utils/classFormat'
import { dateKey } from '../utils/dates'
import { makeSessionKey } from '../utils/sessionKeys'

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
  const hasInitialLoadedRef = useRef(false)

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
      if (useCloud) {
        try {
          await dbAddClass(user.id, fields)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(e.message)
          throw e
        }
        return null
      }
      const meta =
        typeof fields === 'string'
          ? { name: fields.trim(), intake: null, level: null, group: null, qualification: fields.trim() }
          : fields
      if (!meta.qualification && !meta.name) return null
      const id = createId()
      const cls = {
        id,
        intake: meta.intake ?? null,
        level: meta.level ?? null,
        qualification: meta.qualification || meta.name,
        group: meta.group ?? null,
        name: meta.name || formatClassLabel(meta),
        students: [],
      }
      runLocal((s) => ({ ...s, classes: [...s.classes, cls] }))
      return id
    },
    [useCloud, user, refreshFromCloud, runLocal],
  )

  const removeClass = useCallback(
    async (classId) => {
      if (useCloud) {
        try {
          await dbRemoveClass(classId)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(e.message)
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
    },
    [useCloud, refreshFromCloud, runLocal],
  )

  const addStudent = useCallback(
    async (classId, name) => {
      if (useCloud) {
        try {
          await dbAddStudent(user.id, classId, name)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(e.message)
        }
        return
      }
      const trimmed = normalizeName(name)
      if (!trimmed) return
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
    },
    [useCloud, user, refreshFromCloud, runLocal],
  )

  const updateStudent = useCallback(
    async (classId, studentId, patch) => {
      if (useCloud) {
        try {
          await dbUpdateStudent(studentId, patch)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(e.message)
          throw e
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
                  st.id === studentId ? { ...st, ...patch } : st,
                ),
              }
            : c,
        ),
      }))
    },
    [useCloud, refreshFromCloud, runLocal],
  )

  const bulkUpdateStudents = useCallback(
    async (classId, updates) => {
      if (!updates?.length) return
      if (useCloud) {
        try {
          for (const { studentId, patch } of updates) {
            await dbUpdateStudent(studentId, patch)
          }
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(e.message)
          throw e
        }
        return
      }
      runLocal((s) => ({
        ...s,
        classes: s.classes.map((c) => {
          if (c.id !== classId) return c
          const patchById = Object.fromEntries(
            updates.map(({ studentId, patch }) => [studentId, patch]),
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
    [useCloud, refreshFromCloud, runLocal],
  )

  const removeStudent = useCallback(
    async (classId, studentId) => {
      if (useCloud) {
        try {
          await dbRemoveStudent(studentId)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(e.message)
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
    },
    [useCloud, refreshFromCloud, runLocal],
  )

  const setAttendance = useCallback(
    async (classId, day, studentId, patch) => {
      if (useCloud) {
        try {
          await dbSetAttendance(user.id, classId, day, studentId, patch)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(e.message)
        }
        return
      }
      runLocal((s) => {
        const classAtt = s.attendance[classId] || {}
        const session = normalizeSession(classAtt[day])
        const current = session.records[studentId] || { status: 'present', priorNotice: false }
        const next = { ...current, ...patch }
        if (next.status === 'present') next.priorNotice = false
        return {
          ...s,
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

  const setSessionMeta = useCallback(
    async (classId, day, meta) => {
      if (useCloud) {
        try {
          await dbSetSessionMeta(user.id, classId, day, meta)
          await refreshFromCloud({ silent: true })
        } catch (e) {
          setSyncError(e.message)
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
          setSyncError(e.message)
          throw e
        }
        return
      }
      runLocal((s) => {
        const { classMeta, date, module, startTime, duration, students } = payload
        let classes = s.classes.map(normalizeClass)
        let classId = findMatchingClass(classes, classMeta)?.id

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
          }
        }
        classes[clsIndex] = cls

        const day = date || dateKey()
        const sessionKey = makeSessionKey(day, module)
        const classAtt = s.attendance[classId] || {}
        const session = normalizeSession(classAtt[sessionKey])
        const records = { ...session.records }

        for (const row of students) {
          let id = row.rosterStudentId || nameToId.get(normalizeName(row.name))
          if (!id) continue
          records[id] = { status: row.present ? 'present' : 'absent', priorNotice: false }
        }

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
    async (classId, namesText) => {
      if (useCloud) {
        try {
          const count = await dbImportStudentsBulk(user.id, classId, namesText)
          await refreshFromCloud({ silent: true })
          return count
        } catch (e) {
          setSyncError(e.message)
          throw e
        }
      }
      const names = namesText.split(/[\n,;]+/).map(normalizeName).filter(Boolean)
      if (!names.length) return 0
      runLocal((s) => ({
        ...s,
        classes: s.classes.map((c) => {
          if (c.id !== classId) return c
          const existing = new Set(c.students.map((st) => st.name))
          const added = names
            .filter((n) => !existing.has(n))
            .map((name) => ({ id: createId(), name }))
          return { ...c, students: [...c.students, ...added] }
        }),
      }))
      return names.length
    },
    [useCloud, user, refreshFromCloud, runLocal],
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
    addClass,
    removeClass,
    addStudent,
    updateStudent,
    bulkUpdateStudents,
    removeStudent,
    setAttendance,
    setSessionMeta,
    importPortalSession,
    importStudentsBulk,
  }
}
