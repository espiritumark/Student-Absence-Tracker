import { findMatchingClass, formatClassLabel } from '../utils/classFormat'
import { supabase } from './supabase'

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ').toUpperCase()
}

function mapStudent(row) {
  return {
    id: row.id,
    name: row.name,
    manualTotalAbsences: row.manual_total_absences,
    manualConsecutiveAbsences: row.manual_consecutive_absences,
    manualNoPriorNotice: row.manual_no_prior_notice,
  }
}

function mapClass(row, students) {
  return {
    id: row.id,
    intake: row.intake,
    level: row.level,
    group: row.class_group,
    qualification: row.qualification,
    name: row.name,
    students: students.filter((s) => s.class_id === row.id).map(mapStudent),
  }
}

export async function fetchAppState(userId) {
  const [classesRes, studentsRes, sessionsRes, recordsRes] = await Promise.all([
    supabase.from('classes').select('*').eq('user_id', userId).order('name'),
    supabase.from('students').select('*').eq('user_id', userId).order('name'),
    supabase.from('attendance_sessions').select('*').eq('user_id', userId),
    supabase.from('attendance_records').select('*').eq('user_id', userId),
  ])

  if (classesRes.error) throw classesRes.error
  if (studentsRes.error) throw studentsRes.error
  if (sessionsRes.error) throw sessionsRes.error
  if (recordsRes.error) throw recordsRes.error

  const classes = classesRes.data.map((c) => mapClass(c, studentsRes.data))
  const sessionById = Object.fromEntries(sessionsRes.data.map((s) => [s.id, s]))
  const attendance = {}

  for (const session of sessionsRes.data) {
    if (!attendance[session.class_id]) attendance[session.class_id] = {}
    const records = {}
    for (const rec of recordsRes.data.filter((r) => r.session_id === session.id)) {
      records[rec.student_id] = {
        status: rec.status,
        priorNotice: rec.prior_notice,
      }
    }
    attendance[session.class_id][session.session_date] = {
      module: session.module || '',
      startTime: session.start_time || '',
      duration: session.duration || '',
      records,
    }
  }

  return { classes, attendance, sessionById }
}

export async function dbAddClass(userId, fields) {
  const meta =
    typeof fields === 'string'
      ? { qualification: fields.trim(), intake: null, level: null, group: null }
      : fields

  const row = {
    user_id: userId,
    intake: meta.intake ?? null,
    level: meta.level ?? null,
    class_group: meta.group ?? null,
    qualification: meta.qualification || meta.name || '',
    name: meta.name || formatClassLabel(meta),
  }

  const { data, error } = await supabase.from('classes').insert(row).select().single()
  if (error) throw error
  return mapClass(data, [])
}

export async function dbRemoveClass(classId) {
  const { error } = await supabase.from('classes').delete().eq('id', classId)
  if (error) throw error
}

export async function dbAddStudent(userId, classId, name) {
  const trimmed = normalizeName(name)
  if (!trimmed) return null

  const { data: existing } = await supabase
    .from('students')
    .select('*')
    .eq('class_id', classId)
    .eq('name', trimmed)
    .maybeSingle()

  if (existing) return mapStudent(existing)

  const { data, error } = await supabase
    .from('students')
    .insert({ user_id: userId, class_id: classId, name: trimmed })
    .select()
    .single()
  if (error) throw error
  return mapStudent(data)
}

export async function dbUpdateStudent(studentId, patch) {
  const row = {}
  if ('manualTotalAbsences' in patch) {
    row.manual_total_absences = patch.manualTotalAbsences
  }
  if ('manualConsecutiveAbsences' in patch) {
    row.manual_consecutive_absences = patch.manualConsecutiveAbsences
  }
  if ('manualNoPriorNotice' in patch) {
    row.manual_no_prior_notice = patch.manualNoPriorNotice
  }
  const { error } = await supabase.from('students').update(row).eq('id', studentId)
  if (error) throw error
}

export async function dbRemoveStudent(studentId) {
  const { error } = await supabase.from('students').delete().eq('id', studentId)
  if (error) throw error
}

async function upsertSession(userId, classId, day, meta) {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .upsert(
      {
        user_id: userId,
        class_id: classId,
        session_date: day,
        module: meta.module || '',
        start_time: meta.startTime || '',
        duration: meta.duration || '',
      },
      { onConflict: 'class_id,session_date' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function dbSetAttendance(userId, classId, day, studentId, patch) {
  const { data: existingSession } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('class_id', classId)
    .eq('session_date', day)
    .maybeSingle()

  const session = await upsertSession(userId, classId, day, {
    module: existingSession?.module || '',
    startTime: existingSession?.start_time || '',
    duration: existingSession?.duration || '',
  })

  const { data: current } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('session_id', session.id)
    .eq('student_id', studentId)
    .maybeSingle()

  const next = {
    status: patch.status ?? current?.status ?? 'present',
    prior_notice: patch.priorNotice ?? current?.prior_notice ?? false,
  }
  if (next.status === 'present') next.prior_notice = false

  const { error } = await supabase.from('attendance_records').upsert(
    {
      user_id: userId,
      session_id: session.id,
      student_id: studentId,
      status: next.status,
      prior_notice: next.prior_notice,
    },
    { onConflict: 'session_id,student_id' },
  )
  if (error) throw error
}

export async function dbSetSessionMeta(userId, classId, day, meta) {
  await upsertSession(userId, classId, day, meta)
}

export async function dbImportPortalSession(userId, payload) {
  const { classMeta, date, module, startTime, duration, students } = payload

  const { data: existingClasses } = await supabase
    .from('classes')
    .select('*')
    .eq('user_id', userId)

  const mappedClasses = (existingClasses || []).map((c) => ({
    ...c,
    group: c.class_group,
  }))

  let cls = findMatchingClass(mappedClasses, classMeta)
  if (!cls) {
    cls = await dbAddClass(userId, classMeta)
  }

  const classId = cls.id
  const { data: existingStudents } = await supabase
    .from('students')
    .select('*')
    .eq('class_id', classId)

  const nameToId = new Map((existingStudents || []).map((s) => [s.name, s.id]))

  for (const row of students) {
    const name = normalizeName(row.name)
    if (!nameToId.has(name)) {
      const created = await dbAddStudent(userId, classId, name)
      if (created) nameToId.set(name, created.id)
    }
  }

  const session = await upsertSession(userId, classId, date, {
    module,
    startTime,
    duration,
  })

  const records = students.map((row) => ({
    user_id: userId,
    session_id: session.id,
    student_id: nameToId.get(normalizeName(row.name)),
    status: row.present ? 'present' : 'absent',
    prior_notice: false,
  })).filter((r) => r.student_id)

  if (records.length) {
    const { error } = await supabase
      .from('attendance_records')
      .upsert(records, { onConflict: 'session_id,student_id' })
    if (error) throw error
  }

  return classId
}

export async function dbImportStudentsBulk(userId, classId, namesText) {
  const names = namesText
    .split(/[\n,;]+/)
    .map(normalizeName)
    .filter(Boolean)
  let count = 0
  for (const name of names) {
    const added = await dbAddStudent(userId, classId, name)
    if (added) count += 1
  }
  return count
}

export async function dbMigrateLocalState(userId, localState) {
  for (const cls of localState.classes || []) {
    const created = await dbAddClass(userId, cls)
    const classId = created.id
    const idMap = new Map()

    for (const st of cls.students || []) {
      const added = await dbAddStudent(userId, classId, st.name)
      if (added) {
        idMap.set(st.id, added.id)
        if (st.manualTotalAbsences != null || st.manualConsecutiveAbsences != null) {
          await dbUpdateStudent(added.id, {
            manualTotalAbsences: st.manualTotalAbsences ?? null,
            manualConsecutiveAbsences: st.manualConsecutiveAbsences ?? null,
            manualNoPriorNotice: st.manualNoPriorNotice ?? false,
          })
        }
      }
    }

    const classAtt = localState.attendance?.[cls.id] || {}
    for (const [day, session] of Object.entries(classAtt)) {
      await upsertSession(userId, classId, day, session)
      const { data: sess } = await supabase
        .from('attendance_sessions')
        .select('id')
        .eq('class_id', classId)
        .eq('session_date', day)
        .single()

      const records = Object.entries(session.records || {}).map(([oldStId, rec]) => ({
        user_id: userId,
        session_id: sess.id,
        student_id: idMap.get(oldStId),
        status: rec.status,
        prior_notice: rec.priorNotice,
      })).filter((r) => r.student_id)

      if (records.length) {
        await supabase.from('attendance_records').upsert(records, {
          onConflict: 'session_id,student_id',
        })
      }
    }
  }
}
