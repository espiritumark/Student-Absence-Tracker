const CACHE_KEY = 'lph-portal-pull-cache'
const CACHE_VERSION = 2

function normalizeSyncPick(raw) {
  if (Array.isArray(raw)) {
    return { classKeys: [...raw], moduleKeys: [], deselectedModuleKeys: [] }
  }
  return {
    classKeys: raw?.classKeys ?? [],
    moduleKeys: raw?.moduleKeys ?? [],
    deselectedModuleKeys: raw?.deselectedModuleKeys ?? [],
  }
}

/** Keep modules in cache but drop heavy roster payloads so sessionStorage can save. */
export function slimPortalClassesForCache(portalClasses) {
  return (portalClasses ?? []).map((portalClass) => ({
    portalClassId: portalClass.portalClassId,
    label: portalClass.label,
    classMeta: portalClass.classMeta,
    studentCount: portalClass.studentCount ?? portalClass.students?.length ?? 0,
    students: [],
    modules: portalClass.modules ?? [],
    modulesFetched: (portalClass.modules?.length ?? 0) > 0,
    rosterLoaded: false,
    session: portalClass.session ?? {},
    hasAttendance: portalClass.hasAttendance ?? false,
  }))
}

export function loadPortalPullCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== CACHE_VERSION) return null
    if (!Array.isArray(parsed?.portalClasses)) return null
    return {
      portalClasses: parsed.portalClasses.map((portalClass) => ({
        ...portalClass,
        modules: portalClass.modules ?? [],
        modulesFetched: (portalClass.modules?.length ?? 0) > 0,
      })),
      hubPick: parsed.hubPick ?? {},
      syncPick: normalizeSyncPick(parsed.syncPick),
      pulledAt: parsed.pulledAt ?? null,
    }
  } catch {
    return null
  }
}

export function savePortalPullCache({
  portalClasses,
  hubPick,
  syncPick,
  pulledAt = Date.now(),
}) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        version: CACHE_VERSION,
        portalClasses: slimPortalClassesForCache(portalClasses),
        hubPick: hubPick ?? {},
        syncPick: normalizeSyncPick(syncPick),
        pulledAt,
      }),
    )
  } catch {
    // sessionStorage may be unavailable or full
  }
}

export function clearPortalPullCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
