async function readJson(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      data?.message ||
      (response.status === 502
        ? 'Portal bridge is not reachable. Stop npm run dev, then start it again from the Student folder (not npm run dev:vite).'
        : response.status === 503
          ? 'Portal bridge is not configured. Add PORTAL_* to Student/.env and restart npm run dev.'
          : `Portal request failed (${response.status})`)
    throw new Error(message)
  }
  return data
}

export async function fetchPortalBridgeStatus() {
  const response = await fetch('/api/portal/status', { cache: 'no-store' })
  return readJson(response)
}

export async function fetchPortalClasses({ includeRosters = false } = {}) {
  const query = includeRosters ? '?includeRosters=1' : ''
  const response = await fetch(`/api/portal/classes${query}`, { cache: 'no-store' })
  return readJson(response)
}

/** Lightweight class list — returns numeric portal class ids for snapshot pulls. */
export async function fetchPortalClassIds() {
  const result = await fetchPortalClasses()
  const ids = (result.classes ?? [])
    .map((portalClass) => Number(portalClass?.portalClassId))
    .filter((id) => Number.isFinite(id) && id > 0)
  if (!ids.length) {
    throw new Error(
      'No portal class IDs found. Sign in to the college portal in a browser, confirm PORTAL_CLASSES_PATH in Student/.env, then restart npm run dev.',
    )
  }
  return ids
}

/**
 * One authenticated pull: classes, rosters, modules, and LP×module P/A grids.
 * Uses server-side PORTAL_USERNAME / PORTAL_PASSWORD (.env).
 */
export async function fetchPortalMonitoringSnapshot({
  portalClassIds = null,
  concurrency = 6,
} = {}) {
  let ids = Array.isArray(portalClassIds)
    ? portalClassIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : []
  if (!ids.length) {
    ids = await fetchPortalClassIds()
  }

  const response = await fetch('/api/portal/monitoring-snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      portalClassIds: ids,
      concurrency,
    }),
  })
  const data = await readJson(response)
  return data.snapshot
}

export async function fetchPortalClassRoster(portalClassId) {
  const id = Number(portalClassId)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid portal class id.')
  }
  const response = await fetch(`/api/portal/class/${id}/roster`, { cache: 'no-store' })
  return readJson(response)
}

export async function fetchPortalClassMarkAttendance(
  portalClassId,
  {
    includeDetails = true,
    rosterStudents = [],
    moduleId = null,
    classModuleId = null,
    moduleLabel = '',
  } = {},
) {
  const id = Number(portalClassId)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid portal class id.')
  }

  const students = (rosterStudents ?? [])
    .filter((student) => student?.portalStudentId)
    .map((student) => ({
      name: student.name,
      portalStudentId: student.portalStudentId,
      present: student.present ?? null,
    }))

  const response = await fetch(`/api/portal/class/${id}/mark-attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      includeDetails,
      rosterStudents: students,
      moduleId: moduleId != null ? Number(moduleId) : null,
      classModuleId: classModuleId != null ? Number(classModuleId) : null,
      moduleLabel: moduleLabel || '',
    }),
  })
  return readJson(response)
}

export async function resolvePortalModuleIdOnBridge(
  portalClassId,
  { moduleLabel = '', rosterStudents = [] } = {},
) {
  const id = Number(portalClassId)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid portal class id.')
  }

  const students = (rosterStudents ?? [])
    .filter((student) => student?.portalStudentId)
    .map((student) => ({
      name: student.name,
      portalStudentId: student.portalStudentId,
      present: student.present ?? null,
    }))

  const response = await fetch(`/api/portal/class/${id}/resolve-module`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      moduleLabel: moduleLabel || '',
      rosterStudents: students,
    }),
  })
  const data = await readJson(response)
  const moduleId = Number(data?.moduleId)
  return Number.isFinite(moduleId) && moduleId > 0 ? moduleId : null
}

const ROSTER_FETCH_CONCURRENCY = 4

export function portalClassNeedsModules(portalClass) {
  if (!portalClass) return false
  return !(portalClass.modules?.length > 0)
}

function markPortalClassRoster(portalClass, rosterOrStudents = []) {
  const fromRoster = !Array.isArray(rosterOrStudents)
  const students = Array.isArray(rosterOrStudents)
    ? rosterOrStudents
    : rosterOrStudents?.students ?? []
  const session = Array.isArray(rosterOrStudents) ? {} : rosterOrStudents?.session ?? {}
  const modules = fromRoster
    ? rosterOrStudents?.modules ?? portalClass.modules ?? []
    : portalClass.modules ?? []
  const hasAttendance = Array.isArray(rosterOrStudents)
    ? students.some((student) => student.present != null)
    : Boolean(rosterOrStudents?.hasAttendance)
  const modulesFetched = fromRoster
    ? rosterOrStudents?.modulesFetched === true || modules.length > 0
    : portalClass.modulesFetched === true || modules.length > 0

  return {
    ...portalClass,
    students,
    studentCount: students.length,
    session,
    modules,
    modulesFetched,
    hasAttendance,
    rosterLoaded: true,
  }
}

async function hydratePortalClassModules(classes, { onProgress } = {}) {
  const list = classes || []
  if (!list.length) return list

  const missing = list.filter((portalClass) => portalClassNeedsModules(portalClass))
  if (!missing.length) {
    onProgress?.(list.length, list.length)
    return list.map((portalClass) => ({
      ...portalClass,
      modulesFetched: portalClass.modulesFetched ?? (portalClass.modules?.length ?? 0) > 0,
    }))
  }

  let done = list.length - missing.length
  onProgress?.(done, list.length)

  const results = await Promise.all(
    missing.map(async (portalClass) => {
      try {
        const { roster } = await fetchPortalClassRoster(portalClass.portalClassId)
        done += 1
        onProgress?.(done, list.length)
        return markPortalClassRoster(portalClass, roster ?? {})
      } catch {
        done += 1
        onProgress?.(done, list.length)
        return portalClass
      }
    }),
  )

  const byId = new Map(results.map((portalClass) => [portalClass.portalClassId, portalClass]))
  return list.map(
    (portalClass) => byId.get(portalClass.portalClassId) ?? portalClass,
  )
}

/** Fetch rosters for classes that came back without student arrays (older bridge builds). */
export async function hydratePortalClassRosters(classes, { onProgress } = {}) {
  const list = classes || []
  if (!list.length) return { classes: [], rosterTotal: 0, hydratedIndividually: false }

  if (list.every((portalClass) => portalClass.rosterLoaded)) {
    const rosterTotal = list.reduce((sum, portalClass) => sum + (portalClass.students?.length ?? 0), 0)
    return { classes: list, rosterTotal, hydratedIndividually: false }
  }

  const byId = new Map()
  let done = 0

  for (let index = 0; index < list.length; index += ROSTER_FETCH_CONCURRENCY) {
    const batch = list.slice(index, index + ROSTER_FETCH_CONCURRENCY)
    await Promise.all(
      batch.map(async (portalClass) => {
        if (portalClass.rosterLoaded) {
          byId.set(portalClass.portalClassId, portalClass)
          return
        }
        try {
          const { roster } = await fetchPortalClassRoster(portalClass.portalClassId)
          byId.set(portalClass.portalClassId, markPortalClassRoster(portalClass, roster ?? {}))
        } catch {
          byId.set(portalClass.portalClassId, markPortalClassRoster(portalClass, {}))
        } finally {
          done += 1
          onProgress?.(done, list.length)
        }
      }),
    )
  }

  const hydrated = list.map((portalClass) => byId.get(portalClass.portalClassId) ?? portalClass)
  const rosterTotal = hydrated.reduce((sum, portalClass) => sum + (portalClass.students?.length ?? 0), 0)
  return { classes: hydrated, rosterTotal, hydratedIndividually: true }
}

export async function fetchPortalClassesWithRosters(options = {}) {
  const result = await fetchPortalClasses({ includeRosters: true })
  const normalized = (result.classes || []).map((portalClass) => {
    if (!portalClass?.portalClassId) return portalClass
    if (!Array.isArray(portalClass.students)) return portalClass
    return markPortalClassRoster(portalClass, {
      students: portalClass.students,
      session: portalClass.session ?? {},
      hasAttendance: portalClass.hasAttendance,
      modules: portalClass.modules ?? [],
      modulesFetched:
        portalClass.modulesFetched === true || (portalClass.modules?.length ?? 0) > 0,
    })
  })

  const rosterTotal = normalized.reduce(
    (sum, portalClass) => sum + (portalClass.students?.length ?? 0),
    0,
  )
  const needsRosterHydration = normalized.some((portalClass) => !portalClass.rosterLoaded)
  const needsModuleHydration = normalized.some((portalClass) => portalClassNeedsModules(portalClass))

  let classes = normalized
  let hydratedIndividually = false

  if (needsRosterHydration) {
    const hydrated = await hydratePortalClassRosters(normalized, options)
    classes = hydrated.classes
    hydratedIndividually = hydrated.hydratedIndividually
  }

  if (needsModuleHydration) {
    classes = await hydratePortalClassModules(classes, options)
  }

  options.onProgress?.(classes.length, classes.length)

  const stillMissingModules = classes.some((portalClass) => portalClassNeedsModules(portalClass))
  if (stillMissingModules) {
    classes = await hydratePortalClassModules(classes, options)
  }

  return {
    ...result,
    classes,
    rosterTotal: needsRosterHydration
      ? classes.reduce((sum, portalClass) => sum + (portalClass.students?.length ?? 0), 0)
      : rosterTotal,
    hydratedIndividually,
  }
}
