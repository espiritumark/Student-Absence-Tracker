import { findMatchingClass, formatClassLabel } from './classFormat'

export function portalClassToHubFields(portal) {
  const meta = portal?.classMeta ?? {}
  return {
    intake: meta.intake ?? null,
    level: meta.level ?? null,
    group: meta.group ?? null,
    qualification: meta.qualification || portal?.label || '',
  }
}

/**
 * @typedef {{ portalClassId: number, label: string, classMeta: object }} PortalClass
 * @typedef {{ id: string, portalClassId?: number|null, intake?: number|null, level?: number|null, qualification?: string, group?: number|null }} HubClass
 */

/**
 * Build link rows between portal classes and existing hub classes.
 * Does not create new hub classes — only matches existing records.
 */
export function buildPortalClassLinkPlan(portalClasses, hubClasses) {
  const usedHubIds = new Set()
  const usedPortalIds = new Set()
  const rows = []

  for (const portal of portalClasses || []) {
    const linked = (hubClasses || []).find(
      (hub) => hub.portalClassId != null && hub.portalClassId === portal.portalClassId,
    )
    if (linked) {
      rows.push({
        key: `portal-${portal.portalClassId}`,
        portal,
        hub: linked,
        status: 'linked',
        matchReason: 'portal_id',
        selectedHubId: linked.id,
      })
      usedHubIds.add(linked.id)
      usedPortalIds.add(portal.portalClassId)
    }
  }

  for (const portal of portalClasses || []) {
    if (usedPortalIds.has(portal.portalClassId)) continue

    const candidates = (hubClasses || []).filter((hub) => !usedHubIds.has(hub.id))
    const matched = findMatchingClass(candidates, portal.classMeta)

    if (matched) {
      rows.push({
        key: `portal-${portal.portalClassId}`,
        portal,
        hub: matched,
        status: 'matched',
        matchReason: 'class_meta',
        selectedHubId: matched.id,
      })
      usedHubIds.add(matched.id)
      usedPortalIds.add(portal.portalClassId)
      continue
    }

    rows.push({
      key: `portal-${portal.portalClassId}`,
      portal,
      hub: null,
      status: 'portal_only',
      matchReason: null,
      selectedHubId: null,
    })
    usedPortalIds.add(portal.portalClassId)
  }

  for (const hub of hubClasses || []) {
    if (usedHubIds.has(hub.id)) continue
    rows.push({
      key: `hub-${hub.id}`,
      portal: null,
      hub,
      status: 'hub_only',
      matchReason: null,
      selectedHubId: hub.id,
    })
  }

  return rows
}

export function hubClassOptions(hubClasses) {
  return (hubClasses || [])
    .map((hub) => ({
      value: hub.id,
      label: formatClassLabel(hub),
      portalClassId: hub.portalClassId ?? null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function collectLinkPayload(rows) {
  const links = []
  const seenHub = new Set()
  const seenPortal = new Set()

  for (const row of rows) {
    if (!row.portal || !row.selectedHubId) continue
    if (row.syncSelected === false) continue
    if (seenHub.has(row.selectedHubId) || seenPortal.has(row.portal.portalClassId)) continue
    links.push({
      classId: row.selectedHubId,
      portalClassId: row.portal.portalClassId,
    })
    seenHub.add(row.selectedHubId)
    seenPortal.add(row.portal.portalClassId)
  }

  return links
}

export function linkPlanSummary(rows) {
  const portalRows = (rows || []).filter((row) => row.portal)
  const matched = portalRows.filter((row) => row.selectedHubId).length
  const portalOnly = portalRows.filter((row) => !row.selectedHubId).length
  const hubOnly = (rows || []).filter((row) => row.status === 'hub_only').length
  const alreadyLinked = portalRows.filter((row) => row.status === 'linked').length

  return { matched, portalOnly, hubOnly, alreadyLinked, totalPortal: portalRows.length }
}
