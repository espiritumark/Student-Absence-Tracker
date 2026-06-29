import { formatClassLabel, parseClassHeader } from './classFormat'
import {
  buildPortalClassLinkPlan,
  collectLinkPayload,
  portalClassToHubFields,
} from './portalClassMatch'
import { normalizeName } from './nameMatching'
import { buildPortalRosterMatchPlan } from './portalRosterMatch'
import {
  findSessionKey,
  normalizeModuleKey,
  sessionDateFromKey,
  sessionModuleFromKey,
} from './sessionKeys'

function modulesMatch(a, b) {
  return normalizeModuleKey(a) === normalizeModuleKey(b)
}

function hubStudentModuleCounts(classAttendance, studentId, moduleLabel) {
  let present = 0
  let absent = 0
  for (const [key, session] of Object.entries(classAttendance || {})) {
    const mod = session?.module || sessionModuleFromKey(key, session)
    if (!modulesMatch(mod, moduleLabel)) continue
    const status = session?.records?.[studentId]?.status
    if (status === 'present') present += 1
    else if (status === 'absent') absent += 1
  }
  return { present, absent }
}

function diffPortalSessions(portalSessions, classAttendance, studentId, moduleLabel) {
  const changes = []
  for (const session of portalSessions ?? []) {
    if (!session?.date) continue
    if (session.status !== 'P' && session.status !== 'A') continue
    const portalStatus = session.status === 'P' ? 'present' : 'absent'
    const key = findSessionKey(classAttendance, session.date, moduleLabel)
    const hubSession = classAttendance?.[key]
    const hubStatus = hubSession?.records?.[studentId]?.status ?? null
    if (!hubStatus) {
      changes.push({
        date: session.date,
        portalStatus,
        hubStatus: null,
        kind: 'new',
      })
    } else if (hubStatus !== portalStatus) {
      changes.push({
        date: session.date,
        portalStatus,
        hubStatus,
        kind: 'update',
      })
    }
  }
  return changes
}

function resolveHubClass(portalClass, hubClasses) {
  const linked = (hubClasses || []).find(
    (hub) => hub.portalClassId != null && hub.portalClassId === portalClass.portalClassId,
  )
  if (linked) return { hub: linked, status: 'linked' }

  const plan = buildPortalClassLinkPlan([portalClass], hubClasses)
  const row = plan.find((entry) => entry.portal?.portalClassId === portalClass.portalClassId)
  if (row?.hub) {
    return { hub: row.hub, status: row.status === 'linked' ? 'linked' : 'matched' }
  }
  return { hub: null, status: 'portal_only' }
}

function rosterKindForStudent(matchPlan, portalStudentId, portalName) {
  const norm = normalizeName(portalName)
  for (const entry of matchPlan.matched) {
    if (entry.portal.portalStudentId === portalStudentId || normalizeName(entry.portal.name) === norm) {
      return { kind: 'matched', hub: entry.hub }
    }
  }
  for (const entry of matchPlan.similar) {
    if (entry.portal.portalStudentId === portalStudentId || normalizeName(entry.portal.name) === norm) {
      return { kind: 'similar', hub: entry.hub, score: entry.score }
    }
  }
  return { kind: 'new', hub: null }
}

function buildStudentItem({
  portalClass,
  moduleEntry,
  studentEntry,
  matchPlan,
  hubClassId,
  classAttendance,
  moduleLabel,
}) {
  const roster = rosterKindForStudent(matchPlan, studentEntry.portalStudentId, studentEntry.name)
  const hubStudentId = roster.hub?.id ?? null
  const hubName = roster.hub?.name ?? null
  const portalSessions = studentEntry.sessions ?? []
  const sessionChanges =
    hubClassId && hubStudentId
      ? diffPortalSessions(portalSessions, classAttendance, hubStudentId, moduleLabel)
      : portalSessions
          .filter((session) => session.status === 'P' || session.status === 'A')
          .map((session) => ({
            date: session.date,
            portalStatus: session.status === 'P' ? 'present' : 'absent',
            hubStatus: null,
            kind: 'new',
          }))

  const hubCounts =
    hubClassId && hubStudentId
      ? hubStudentModuleCounts(classAttendance, hubStudentId, moduleLabel)
      : { present: null, absent: null }

  const hasGrid =
    studentEntry.presentCount != null ||
    studentEntry.absentCount != null ||
    portalSessions.length > 0
  const needsRoster = roster.kind === 'new' || roster.kind === 'similar'
  const hasSessionWork = sessionChanges.length > 0

  return {
    id: `${portalClass.portalClassId}-${moduleEntry.moduleId}-${studentEntry.portalStudentId}`,
    kind: roster.kind,
    portalName: normalizeName(studentEntry.name) || studentEntry.name,
    hubName,
    hubStudentId,
    portalStudentId: studentEntry.portalStudentId,
    moduleId: moduleEntry.moduleId,
    moduleLabel,
    portalPresent: studentEntry.presentCount,
    portalAbsent: studentEntry.absentCount,
    portalPercent: studentEntry.percentPresent,
    hubPresent: hubCounts.present,
    hubAbsent: hubCounts.absent,
    sessionChanges,
    hasGrid,
    selected: hasSessionWork || needsRoster,
    canToggle: hasSessionWork || needsRoster,
    action:
      roster.kind === 'new'
        ? 'add'
        : roster.kind === 'similar'
          ? 'update'
          : hasSessionWork
            ? 'sessions'
            : 'keep',
  }
}

function summarizeModuleItems(items = []) {
  let selected = 0
  let sessionChanges = 0
  let toggleable = 0
  for (const item of items) {
    if (item.canToggle) toggleable += 1
    if (!item.selected) continue
    selected += 1
    sessionChanges += item.sessionChanges?.length ?? 0
  }
  return { selected, sessionChanges, toggleable, students: items.length }
}

/** Flatten section modules for apply/summary (backward compatible). */
export function sectionStudentItems(section) {
  if (section?.modules?.length) {
    return section.modules.flatMap((mod) => mod.items ?? [])
  }
  return section?.items ?? []
}

/**
 * Build review draft from a portal monitoring snapshot vs current hub state.
 * Organized as class → modules[] → students (one module grid per student).
 */
export function buildPortalHubSyncReviewDraft(snapshot, { classes = [], attendance = {} } = {}) {
  const sections = []
  const classCreates = []
  const linkRows = []

  for (const portalClass of snapshot?.classes ?? []) {
    const { hub, status: classStatus } = resolveHubClass(portalClass, classes)
    const hubClassId = hub?.id ?? null
    const hubLabel = hub ? formatClassLabel(hub) : ''
    const portalLabel = portalClass.label || ''
    const classAttendance = hubClassId ? attendance[hubClassId] ?? {} : {}

    if (classStatus === 'portal_only') {
      classCreates.push({
        portalClassId: portalClass.portalClassId,
        portalLabel,
        fields: portalClassToHubFields(portalClass),
      })
    } else if (hubClassId) {
      linkRows.push({
        classId: hubClassId,
        portalClassId: portalClass.portalClassId,
      })
    }

    const matchPlan = buildPortalRosterMatchPlan(portalClass.students ?? [], hub?.students ?? [])
    const modules = []

    for (const moduleEntry of portalClass.moduleAttendance ?? []) {
      const moduleLabel = moduleEntry.moduleLabel || ''
      const items = (moduleEntry.students ?? [])
        .map((studentEntry) =>
          buildStudentItem({
            portalClass,
            moduleEntry,
            studentEntry,
            matchPlan,
            hubClassId,
            classAttendance,
            moduleLabel,
          }),
        )
        .sort((a, b) => (a.portalName || '').localeCompare(b.portalName || ''))

      const moduleStats = summarizeModuleItems(items)
      modules.push({
        rowKey: `portal-${portalClass.portalClassId}-mod-${moduleEntry.moduleId}`,
        moduleId: moduleEntry.moduleId,
        moduleLabel,
        items,
        ...moduleStats,
      })
    }

    modules.sort((a, b) => (a.moduleLabel || '').localeCompare(b.moduleLabel || ''))

    const roster = (portalClass.students ?? [])
      .map((portalStudent) => {
        const rosterMatch = rosterKindForStudent(
          matchPlan,
          portalStudent.portalStudentId,
          portalStudent.name,
        )
        return {
          portalStudentId: portalStudent.portalStudentId,
          portalName: normalizeName(portalStudent.name) || portalStudent.name,
          hubName: rosterMatch.hub?.name ?? null,
          hubStudentId: rosterMatch.hub?.id ?? null,
          kind: rosterMatch.kind,
        }
      })
      .sort((a, b) => (a.portalName || '').localeCompare(b.portalName || ''))

    sections.push({
      rowKey: `portal-${portalClass.portalClassId}`,
      portalClassId: portalClass.portalClassId,
      classId: hubClassId,
      classStatus,
      hubLabel,
      portalLabel,
      classMeta:
        portalClass.classMeta ??
        parseClassHeader(portalLabel) ?? {
          intake: null,
          level: null,
          qualification: portalLabel,
          group: null,
        },
      moduleCount: modules.length,
      gridsLoaded: portalClass.gridsLoaded ?? 0,
      roster,
      modules,
    })
  }

  return {
    pulledAt: snapshot?.pulledAt ?? null,
    stats: snapshot?.stats ?? {},
    syncMode: 'merge',
    links: linkRows,
    classCreates,
    sections,
  }
}

/** Stable class roster merged with the active module's attendance (same students, switch module). */
export function getModuleViewRows(section, moduleRow) {
  const moduleItems = moduleRow?.items ?? []
  const byStudentId = new Map(
    moduleItems.map((item) => [item.portalStudentId, item]),
  )

  const roster =
    section?.roster?.length > 0
      ? section.roster
      : [...byStudentId.values()]
          .map((item) => ({
            portalStudentId: item.portalStudentId,
            portalName: item.portalName,
            hubName: item.hubName,
            hubStudentId: item.hubStudentId,
            kind: item.kind,
          }))
          .sort((a, b) => (a.portalName || '').localeCompare(b.portalName || ''))

  return roster.map((student) => {
    const moduleItem = byStudentId.get(student.portalStudentId)
    if (moduleItem) {
      return { ...student, ...moduleItem, hasModuleData: true }
    }
    return {
      ...student,
      id: `${moduleRow?.rowKey ?? 'mod'}-${student.portalStudentId}`,
      moduleId: moduleRow?.moduleId ?? null,
      moduleLabel: moduleRow?.moduleLabel ?? '',
      portalPresent: null,
      portalAbsent: null,
      portalPercent: null,
      hubPresent: null,
      hubAbsent: null,
      sessionChanges: [],
      hasModuleData: false,
      hasGrid: false,
      selected: false,
      canToggle: false,
      action: 'keep',
    }
  })
}

export function summarizePortalHubSyncDraft(draft) {
  const sections = draft?.sections ?? []
  let selected = 0
  let sessionChanges = 0
  let rosterAdds = 0
  let rosterUpdates = 0
  let gridsLoaded = 0
  let withGrid = 0

  for (const section of sections) {
    gridsLoaded += section.gridsLoaded ?? 0
    for (const item of sectionStudentItems(section)) {
      if (item.hasGrid) withGrid += 1
      if (!item.selected) continue
      selected += 1
      sessionChanges += item.sessionChanges?.length ?? 0
      if (item.action === 'add') rosterAdds += 1
      if (item.action === 'update') rosterUpdates += 1
    }
  }

  return {
    classes: sections.length,
    modules: sections.reduce((sum, section) => sum + (section.moduleCount ?? 0), 0),
    gridsLoaded,
    withGrid,
    selected,
    sessionChanges,
    rosterAdds,
    rosterUpdates,
    classCreates: draft?.classCreates?.length ?? 0,
  }
}

/** Group session imports by class + date + module for importPortalSession. */
export function buildSessionImportsFromDraft(draft) {
  const importsByKey = new Map()

  for (const section of draft?.sections ?? []) {
    for (const item of sectionStudentItems(section)) {
      if (!item.selected || !(item.sessionChanges?.length)) continue
      for (const change of item.sessionChanges ?? []) {
        if (!change.date) continue
        const classKey = section.classId ?? `portal:${section.portalClassId}`
        const key = `${classKey}::${change.date}::${normalizeModuleKey(item.moduleLabel)}`
        if (!importsByKey.has(key)) {
          importsByKey.set(key, {
            classId: section.classId,
            portalClassId: section.portalClassId,
            date: change.date,
            module: item.moduleLabel,
            students: [],
          })
        }
        const bucket = importsByKey.get(key)
        const existing = item.hubStudentId
          ? bucket.students.find((row) => row.rosterStudentId === item.hubStudentId)
          : bucket.students.find((row) => normalizeName(row.name) === normalizeName(item.portalName))
        if (existing) {
          existing.present = change.portalStatus === 'present'
        } else {
          bucket.students.push({
            name: item.portalName,
            rosterStudentId: item.hubStudentId || undefined,
            present: change.portalStatus === 'present',
          })
        }
      }
    }
  }

  return [...importsByKey.values()].filter((payload) => payload.students.length > 0)
}

export function buildPortalHubSyncApplyPayload(draft) {
  const rosterAdds = []
  const updates = []
  const addsByClass = new Map()

  for (const section of draft?.sections ?? []) {
    const seenStudents = new Set()
    for (const item of sectionStudentItems(section)) {
      if (!item.selected) continue
      if (item.action === 'add' && !seenStudents.has(item.portalName)) {
        seenStudents.add(item.portalName)
        const list = addsByClass.get(section.portalClassId) ?? []
        list.push(item.portalName)
        addsByClass.set(section.portalClassId, list)
      } else if (item.action === 'update' && item.hubStudentId && section.classId) {
        updates.push({
          classId: section.classId,
          portalClassId: section.portalClassId,
          studentId: item.hubStudentId,
          name: item.portalName,
        })
      }
    }
  }

  for (const [portalClassId, names] of addsByClass) {
    const section = (draft?.sections ?? []).find((row) => row.portalClassId === portalClassId)
    rosterAdds.push({
      classId: section?.classId ?? null,
      portalClassId,
      namesText: names.join('\n'),
      count: names.length,
    })
  }

  const links = (draft?.links ?? []).filter((link) => link.classId && link.portalClassId != null)
  const sessionImports = buildSessionImportsFromDraft(draft)

  return {
    links,
    classCreates: draft?.classCreates ?? [],
    rosterAdds,
    updates,
    removes: [],
    sessionImports,
    syncMode: draft?.syncMode ?? 'merge',
  }
}

export function applyClassIdsToHubSyncDraft(draft, classIdByPortalClassId) {
  if (!draft || !classIdByPortalClassId?.size) return draft

  const sections = (draft.sections ?? []).map((section) => {
    const classId = classIdByPortalClassId.get(section.portalClassId) ?? section.classId
    return { ...section, classId }
  })

  const links = (draft.links ?? []).map((link) => ({
    ...link,
    classId: classIdByPortalClassId.get(link.portalClassId) ?? link.classId,
  }))

  return { ...draft, sections, links }
}

export { collectLinkPayload, sessionDateFromKey }
