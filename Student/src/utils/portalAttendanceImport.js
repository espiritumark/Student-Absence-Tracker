import { dateKey } from './dates'
import { normalizeName } from './nameMatching'

/**
 * Build an importPortalSession payload from a linked hub class and portal class page data.
 */
export function buildPortalAttendanceImportPayload(hubClass, portalPage) {
  if (!hubClass?.id) {
    throw new Error('Hub class is required for portal attendance import.')
  }

  const portalStudents = portalPage?.students ?? []
  if (!portalStudents.length) {
    throw new Error('The college portal returned no students for this class.')
  }

  const hubByNorm = new Map(
    (hubClass.students ?? []).map((student) => [normalizeName(student.name), student]),
  )

  const students = []
  const unmatched = []

  for (const portalStudent of portalStudents) {
    const norm = normalizeName(portalStudent.name)
    const hubStudent = hubByNorm.get(norm)
    if (!hubStudent) {
      unmatched.push(portalStudent.name)
      continue
    }

    students.push({
      name: norm,
      present: portalStudent.present ?? true,
      rosterStudentId: hubStudent.id,
    })
  }

  if (!students.length) {
    throw new Error(
      'No portal students matched your hub roster. Sync the roster first, then pull attendance again.',
    )
  }

  const session = portalPage?.session ?? {}

  return {
    classId: hubClass.id,
    classMeta: {
      intake: hubClass.intake ?? null,
      level: hubClass.level ?? null,
      group: hubClass.group ?? null,
      qualification: hubClass.qualification ?? '',
    },
    date: session.date || dateKey(),
    module: session.module || '',
    startTime: session.startTime || '',
    duration: session.duration || '',
    students,
    unmatched,
    hasAttendance: Boolean(portalPage?.hasAttendance),
    absentCount: students.filter((row) => !row.present).length,
    presentCount: students.filter((row) => row.present).length,
  }
}
