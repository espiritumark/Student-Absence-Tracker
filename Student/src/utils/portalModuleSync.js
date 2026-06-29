import { listModulesForClass, normalizeModuleKey } from './sessionKeys'

export function moduleSyncKey(portalClassId, module) {
  const id = Number(portalClassId)
  if (!Number.isFinite(id) || id <= 0) return ''
  if (module?.classModuleId != null) return `${id}::class-mod:${module.classModuleId}`
  if (module?.moduleId != null) return `${id}::id:${module.moduleId}`
  const label = normalizeModuleKey(module?.label || '')
  return label ? `${id}::label:${label}` : ''
}

function moduleSubjectKey(label) {
  const text = String(label || '').trim().toUpperCase()
  const pipe = text.indexOf('|')
  if (pipe === -1) return normalizeModuleKey(text)
  return text
    .slice(pipe + 1)
    .trim()
    .replace(/\s+/g, ' ')
}

function moduleCodeKey(label) {
  const text = String(label || '').trim().toUpperCase()
  const pipe = text.indexOf('|')
  const code = (pipe === -1 ? text : text.slice(0, pipe)).trim().replace(/\s+/g, ' ')
  return code.replace(/PT$/i, '')
}

function moduleLabelsMatch(a, b) {
  const left = normalizeModuleKey(a)
  const right = normalizeModuleKey(b)
  if (!left || !right) return false
  if (left === right) return true
  if (left.includes(right) || right.includes(left)) return true

  const subA = moduleSubjectKey(a)
  const subB = moduleSubjectKey(b)
  if (!subA || !subB || subA !== subB) return false

  const codeA = moduleCodeKey(a)
  const codeB = moduleCodeKey(b)
  if (!codeA || !codeB) return true
  return codeA === codeB || codeA.includes(codeB) || codeB.includes(codeA)
}

function isRealModuleLabel(label) {
  const text = String(label || '').trim()
  if (!text) return false
  return !/^(general session|class attendance|class module)$/i.test(text)
}

export function formatPortalModuleLabel(label) {
  return String(label || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

/** Module rows that exist in both portal and hub for a linked class. */
export function hubMatchedModuleRows(moduleRows = []) {
  return (moduleRows ?? []).filter((moduleRow) => moduleRow.status === 'matched')
}

/** Portal modules that can be selected for sync (excludes hub-only extras). */
export function portalSyncModuleRows(moduleRows = []) {
  return (moduleRows ?? []).filter((moduleRow) => moduleRow.status !== 'hub_only')
}

export function normalizeModuleSyncPick(raw) {
  if (Array.isArray(raw)) {
    return { classKeys: [...raw], moduleKeys: [], deselectedModuleKeys: [] }
  }
  return {
    classKeys: raw?.classKeys ?? [],
    moduleKeys: raw?.moduleKeys ?? [],
    deselectedModuleKeys: raw?.deselectedModuleKeys ?? [],
  }
}

function isModuleRowSelected(moduleRow, { modulePick, deselected, classLinked }) {
  if (deselected.has(moduleRow.key)) return false
  if (modulePick.has(moduleRow.key)) return true
  return classLinked && moduleRow.status === 'matched'
}

/**
 * Build module child rows for a portal class (all portal modules + hub-only extras).
 */
export function buildModuleRowsForPortalClass(portal, hubClass, attendance = {}) {
  const portalClassId = portal?.portalClassId
  const portalModules = (portal?.modules ?? []).filter((mod) => isRealModuleLabel(mod.label))

  const hubModules = hubClass
    ? listModulesForClass(attendance?.[hubClass.id] ?? {}).filter((mod) =>
        isRealModuleLabel(mod.label),
      )
    : []

  const rows = []
  const usedHubKeys = new Set()

  for (const portalModule of portalModules) {
    const label = formatPortalModuleLabel(portalModule.label)
    const hubMatch = hubModules.find((hubModule) => moduleLabelsMatch(hubModule.label, label))
    if (hubMatch) usedHubKeys.add(hubMatch.value)

    rows.push({
      key: moduleSyncKey(portalClassId, portalModule),
      classModuleId: portalModule.classModuleId ?? null,
      moduleId: portalModule.moduleId ?? portalModule.classModuleId ?? null,
      label,
      hubModuleKey: hubMatch?.value ?? null,
      status: hubMatch ? 'matched' : 'portal_only',
    })
  }

  for (const hubModule of hubModules) {
    if (usedHubKeys.has(hubModule.value)) continue
    rows.push({
      key: moduleSyncKey(portalClassId, { label: hubModule.label }),
      classModuleId: null,
      moduleId: null,
      label: formatPortalModuleLabel(hubModule.label),
      hubModuleKey: hubModule.value,
      status: 'hub_only',
    })
  }

  return rows
}

export function resolvePortalModuleId(portal, moduleLabel) {
  const modules = portal?.modules ?? []
  for (const mod of modules) {
    if (!moduleLabelsMatch(mod.label, moduleLabel)) continue
    const id = mod.moduleId ?? mod.classModuleId
    if (id != null) return id
  }
  return null
}

export function mergePortalModuleId(modules = [], moduleLabel, moduleId) {
  const id = Number(moduleId)
  if (!Number.isFinite(id) || id <= 0 || !moduleLabel) return modules ?? []
  return (modules ?? []).map((mod) =>
    moduleLabelsMatch(mod.label, moduleLabel) ? { ...mod, moduleId: id } : mod,
  )
}

export function matchedModuleKeysForPortalRow(row, hubClass, attendance = {}) {
  if (!row?.portal) return []
  if (row.status !== 'linked' && row.status !== 'matched') return []
  return buildModuleRowsForPortalClass(row.portal, hubClass, attendance)
    .filter((moduleRow) => moduleRow.status === 'matched')
    .map((moduleRow) => moduleRow.key)
}

export function defaultModuleSyncKeys(rows = [], { classes = [], attendance = {} } = {}) {
  const keys = []
  for (const row of rows) {
    if (!row.portal) continue
    if (row.status !== 'linked' && row.status !== 'matched') continue
    const hubClass = row.selectedHubId
      ? (classes || []).find((cls) => cls.id === row.selectedHubId)
      : null
    keys.push(...matchedModuleKeysForPortalRow(row, hubClass, attendance))
  }
  return keys
}

export function applyModuleSyncPick(plan, syncPick, { classes = [], attendance = {} } = {}) {
  const pick = normalizeModuleSyncPick(syncPick)
  const modulePick = new Set(pick.moduleKeys)
  const deselected = new Set(pick.deselectedModuleKeys)

  return plan.map((row) => {
    if (!row.portal) return { ...row, moduleRows: [], syncSelected: false }

    const hubClass = row.selectedHubId
      ? (classes || []).find((cls) => cls.id === row.selectedHubId)
      : null
    const classLinked = row.status === 'linked' || row.status === 'matched'

    const moduleRows = buildModuleRowsForPortalClass(row.portal, hubClass, attendance).map(
      (moduleRow) => ({
        ...moduleRow,
        syncSelected: isModuleRowSelected(moduleRow, { modulePick, deselected, classLinked }),
      }),
    )

    return {
      ...row,
      moduleRows,
      syncSelected: moduleRows.some((moduleRow) => moduleRow.syncSelected),
    }
  })
}

export function refreshModuleSyncPick(rows = [], syncPick, { classes = [], attendance = {} } = {}) {
  const pick = normalizeModuleSyncPick(syncPick)
  const validKeys = new Set()
  for (const row of rows) {
    if (!row.portal) continue
    const hubClass = row.selectedHubId
      ? (classes || []).find((cls) => cls.id === row.selectedHubId)
      : null
    for (const moduleRow of buildModuleRowsForPortalClass(row.portal, hubClass, attendance)) {
      validKeys.add(moduleRow.key)
    }
  }

  return {
    classKeys: [],
    moduleKeys: pick.moduleKeys.filter((key) => validKeys.has(key)),
    deselectedModuleKeys: pick.deselectedModuleKeys.filter((key) => validKeys.has(key)),
  }
}

export function moduleSyncPickFromRows(rows = []) {
  const moduleKeys = []
  const deselectedModuleKeys = []
  for (const row of rows) {
    if (!row.portal) continue
    for (const moduleRow of row.moduleRows ?? []) {
      if (moduleRow.syncSelected) moduleKeys.push(moduleRow.key)
      else if (moduleRow.status === 'matched') deselectedModuleKeys.push(moduleRow.key)
    }
  }
  return { classKeys: [], moduleKeys, deselectedModuleKeys }
}

export function countModuleSyncSelected(rows = []) {
  let modules = 0
  let classes = 0
  for (const row of rows) {
    if (!row.portal) continue
    const selected = (row.moduleRows ?? []).filter(
      (moduleRow) => moduleRow.syncSelected && moduleRow.status !== 'hub_only',
    )
    if (selected.length) {
      classes += 1
      modules += selected.length
    }
  }
  return { classes, modules }
}

export function classModuleCheckboxState(moduleRows = []) {
  const rows = portalSyncModuleRows(moduleRows)
  const selected = rows.filter((row) => row.syncSelected).length
  if (!rows.length || selected === 0) return { checked: false, indeterminate: false }
  if (selected === rows.length) return { checked: true, indeterminate: false }
  return { checked: false, indeterminate: true }
}

export function moduleStatusTagMeta(status) {
  if (status === 'matched') return { label: 'Matched', color: 'blue' }
  if (status === 'portal_only') return { label: 'Portal only', color: 'orange' }
  if (status === 'hub_only') return { label: 'Hub only', color: 'default' }
  return { label: 'Unknown', color: 'default' }
}
