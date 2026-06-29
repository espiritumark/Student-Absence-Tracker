import { formatClassLabel } from './classFormat'
import {
  findSimilarRosterMatches,
  formatPersonName,
  formatSimilarityPercent,
  normalizeName,
} from './nameMatching'
import { collectLinkPayload, portalClassToHubFields } from './portalClassMatch'
import {
  applySyncModeToReviewDraft,
  buildAttendanceOverwritePayload,
  enrichReviewItemsWithMarkAttendance,
} from './portalMarkAttendance'

const SIMILAR_MIN_SCORE = 0.88

/**
 * Compare portal roster names to a hub class roster.
 * Portal is treated as the source of truth for who should be in the class.
 */
export function buildPortalRosterMatchPlan(portalStudents = [], hubStudents = []) {
  const hubList = hubStudents ?? []
  const hubByNorm = new Map(hubList.map((student) => [normalizeName(student.name), student]))
  const usedHubIds = new Set()

  const matched = []
  const similar = []
  const newFromPortal = []

  for (const portalStudent of portalStudents ?? []) {
    const norm = normalizeName(portalStudent.name)
    if (!norm) continue

    const exact = hubByNorm.get(norm)
    if (exact && !usedHubIds.has(exact.id)) {
      matched.push({ portal: portalStudent, hub: exact })
      usedHubIds.add(exact.id)
      continue
    }

    const candidates = hubList.filter((student) => !usedHubIds.has(student.id))
    const close = findSimilarRosterMatches(portalStudent.name, candidates, {
      minScore: SIMILAR_MIN_SCORE,
    })
    if (close.length > 0) {
      const best = close[0]
      const hub = hubList.find((student) => student.id === best.id)
      if (hub) {
        similar.push({ portal: portalStudent, hub, score: best.score })
        usedHubIds.add(hub.id)
        continue
      }
    }

    newFromPortal.push({ portal: portalStudent })
  }

  const notOnPortal = hubList
    .filter((student) => !usedHubIds.has(student.id))
    .map((hub) => ({ hub }))

  return {
    matched,
    similar,
    newFromPortal,
    notOnPortal,
    counts: {
      portalTotal: (portalStudents ?? []).length,
      hubTotal: hubList.length,
      matched: matched.length,
      similar: similar.length,
      newFromPortal: newFromPortal.length,
      notOnPortal: notOnPortal.length,
    },
  }
}

export function rosterDataReady(portal) {
  if (!portal) return false
  return portal.rosterLoaded === true
}

export function portalRosterStudents(portal) {
  if (!rosterDataReady(portal)) return []
  return portal.students ?? []
}

/**
 * Build the full apply plan for class links + roster imports from the sync modal rows.
 */
export function buildPortalSyncApplyPlan(rows, classes) {
  const links = collectLinkPayload(rows)
  const classPlans = []
  const classCreates = []
  const classCreatesSeen = new Set()
  let totalMatched = 0
  let totalSimilar = 0
  let totalNew = 0
  let totalNotOnPortal = 0
  let totalPortalStudents = 0

  for (const row of rows) {
    if (!row.portal || row.syncSelected === false) continue
    if (!rosterDataReady(row.portal)) continue

    const selectedModules = (row.moduleRows ?? []).filter((moduleRow) => moduleRow.syncSelected)
    if (!selectedModules.length) continue

    const hubClass = row.selectedHubId
      ? (classes || []).find((cls) => cls.id === row.selectedHubId)
      : null
    const portalStudents = portalRosterStudents(row.portal)
    const matchPlan = buildPortalRosterMatchPlan(portalStudents, hubClass?.students ?? [])
    const namesToAdd = matchPlan.newFromPortal.map((entry) => entry.portal.name)

    if (!hubClass && !classCreatesSeen.has(row.portal.portalClassId)) {
      classCreatesSeen.add(row.portal.portalClassId)
      classCreates.push({
        rowKey: row.key,
        portalClassId: row.portal.portalClassId,
        portalLabel: row.portal.label,
        fields: portalClassToHubFields(row.portal),
      })
    }

    totalMatched += matchPlan.counts.matched
    totalSimilar += matchPlan.counts.similar
    totalNew += matchPlan.counts.newFromPortal
    totalNotOnPortal += matchPlan.counts.notOnPortal
    totalPortalStudents += matchPlan.counts.portalTotal

    for (const moduleRow of selectedModules) {
      if (moduleRow.status === 'hub_only') continue
      classPlans.push({
        rowKey: row.key,
        reviewKey: `${row.key}::${moduleRow.key}`,
        classId: hubClass?.id ?? null,
        createHubClass: !hubClass,
        portalClassId: row.portal.portalClassId,
        hubLabel: hubClass ? formatClassLabel(hubClass) : row.portal.label,
        portalLabel: row.portal.label,
        moduleId: moduleRow.moduleId,
        classModuleId: moduleRow.classModuleId,
        moduleLabel: moduleRow.label,
        moduleSyncKey: moduleRow.key,
        moduleStatus: moduleRow.status,
        status: row.status,
        portal: row.portal,
        matchPlan,
        namesToAdd,
      })
    }
  }

  const rosterAdds = []
  const rosterAddsSeen = new Set()
  for (const plan of classPlans) {
    if (!plan.namesToAdd.length) continue
    const rosterKey = plan.classId ?? `portal-${plan.portalClassId}`
    if (rosterAddsSeen.has(rosterKey)) continue
    rosterAddsSeen.add(rosterKey)
    rosterAdds.push({
      classId: plan.classId,
      portalClassId: plan.portalClassId,
      namesText: plan.namesToAdd.join('\n'),
      count: plan.namesToAdd.length,
      hubLabel: plan.hubLabel,
    })
  }

  return {
    links,
    classPlans,
    classCreates,
    rosterAdds,
    totals: {
      links: links.length,
      classesWithRoster: classPlans.length,
      portalStudents: totalPortalStudents,
      matched: totalMatched,
      similar: totalSimilar,
      studentsToAdd: totalNew,
      notOnPortal: totalNotOnPortal,
      newClasses: classCreates.length,
    },
  }
}

export function formatLpMatchSummary(matchPlan) {
  if (!matchPlan) return null
  const { matched, similar, newFromPortal, portalTotal } = matchPlan.counts
  if (!portalTotal) return 'Empty roster'

  const parts = []
  if (matched > 0) parts.push(`${matched} matched`)
  if (similar > 0) parts.push(`${similar} similar`)
  if (newFromPortal > 0) parts.push(`${newFromPortal} new`)
  if (!parts.length) return `${portalTotal} on portal`
  return parts.join(' · ')
}

const REVIEW_KIND_META = {
  matched: { label: 'Matched', color: 'green', action: 'keep' },
  normalize: { label: 'Update name', color: 'blue', action: 'update' },
  similar: { label: 'Almost matched', color: 'cyan', action: 'update' },
  new: { label: 'New from portal', color: 'orange', action: 'add' },
  hubOnly: { label: 'Hub only', color: 'default', action: 'remove' },
}

export function getReviewKindMeta(kind) {
  return REVIEW_KIND_META[kind] ?? REVIEW_KIND_META.matched
}

function buildAttendancePreviewFromMark(markAttendance, items, syncMode) {
  const linkedItems = (items ?? []).filter((item) => item.hubStudentId)
  if (!linkedItems.length && !markAttendance?.students?.length) return null

  const withPortalData = linkedItems.filter(
    (item) =>
      (item.portalSessions ?? []).length > 0 ||
      item.portalAbsentDays != null ||
      item.portalPresentDays != null,
  )
  const streakChanges = linkedItems.filter((item) => item.streakDelta).length
  const totalChanges = linkedItems.filter((item) => item.totalDelta).length
  const gridLoaded = (markAttendance?.fetchedStudentCount ?? 0) > 0

  return {
    source: gridLoaded ? 'module_grid' : 'hub_only',
    classLabel: markAttendance?.classLabel || '',
    moduleLabel: markAttendance?.moduleLabel || '',
    studentCount: markAttendance?.students?.length ?? 0,
    fetchedStudentCount: markAttendance?.fetchedStudentCount ?? 0,
    streakChanges,
    totalChanges,
    syncMode,
    comparedStudents: withPortalData.length,
    linkedStudents: linkedItems.length,
  }
}

/** Build per-class review rows with default selections before Save & Sync. */
export function buildPortalSyncReviewDraft(
  plan,
  {
    classes = [],
    attendance = {},
    markAttendanceByReviewKey = {},
    markAttendanceByPortalClassId = {},
    syncMode = 'merge',
  } = {},
) {
  const sections = (plan?.classPlans ?? []).map((classPlan) => {
    const items = []
    const matchPlan = classPlan.matchPlan

    for (const entry of matchPlan.matched) {
      const portalName = normalizeName(entry.portal.name)
      const hubName = entry.hub.name
      const needsNormalize = hubName !== portalName
      items.push({
        id: `matched-${entry.hub.id}`,
        kind: needsNormalize ? 'normalize' : 'matched',
        portalName,
        hubName,
        hubStudentId: entry.hub.id,
        portalStudentId: entry.portal.portalStudentId ?? null,
        selected: needsNormalize,
        canToggle: needsNormalize,
        action: needsNormalize ? 'update' : 'keep',
      })
    }

    for (const entry of matchPlan.similar) {
      const portalName = normalizeName(entry.portal.name)
      items.push({
        id: `similar-${entry.hub.id}`,
        kind: 'similar',
        portalName,
        hubName: entry.hub.name,
        hubStudentId: entry.hub.id,
        portalStudentId: entry.portal.portalStudentId ?? null,
        score: entry.score,
        selected: true,
        canToggle: true,
        action: 'update',
      })
    }

    for (const entry of matchPlan.newFromPortal) {
      const portalName = normalizeName(entry.portal.name)
      items.push({
        id: `new-${entry.portal.portalStudentId ?? portalName}`,
        kind: 'new',
        portalName,
        hubName: null,
        hubStudentId: null,
        portalStudentId: entry.portal.portalStudentId ?? null,
        selected: true,
        canToggle: true,
        action: 'add',
      })
    }

    for (const entry of matchPlan.notOnPortal) {
      items.push({
        id: `hub-${entry.hub.id}`,
        kind: 'hubOnly',
        portalName: null,
        hubName: entry.hub.name,
        hubStudentId: entry.hub.id,
        portalStudentId: null,
        selected: false,
        canToggle: true,
        action: 'remove',
      })
    }

    const hubClass = (classes || []).find((cls) => cls.id === classPlan.classId)
    const markAttendance =
      markAttendanceByReviewKey[classPlan.reviewKey] ??
      markAttendanceByPortalClassId[classPlan.portalClassId] ??
      null
    const enrichedItems = enrichReviewItemsWithMarkAttendance({
      items,
      hubClass,
      classAttendance: attendance?.[classPlan.classId] ?? {},
      markStudents: markAttendance?.students ?? [],
      studentSummaries: markAttendance?.studentSummaries ?? {},
      portalRosterStudents: classPlan.portal?.students ?? [],
      syncMode,
    })
    const attendancePreview =
      buildAttendancePreviewFromMark(
        markAttendance
          ? { ...markAttendance, moduleLabel: classPlan.moduleLabel || markAttendance.moduleLabel }
          : markAttendance,
        enrichedItems,
        syncMode,
      ) ??
      (hubClass ? { source: 'hub_only', linkedStudents: enrichedItems.filter((i) => i.hubStudentId).length } : null)

    return {
      rowKey: classPlan.reviewKey || classPlan.rowKey,
      classRowKey: classPlan.rowKey,
      classId: classPlan.classId,
      portalClassId: classPlan.portalClassId,
      hubLabel: classPlan.hubLabel,
      portalLabel: classPlan.portalLabel,
      moduleId: classPlan.moduleId ?? null,
      moduleLabel: classPlan.moduleLabel || markAttendance?.moduleLabel || '',
      moduleStatus: classPlan.moduleStatus ?? null,
      portalStudentCount: matchPlan.counts.portalTotal,
      hubStudentCount: matchPlan.counts.hubTotal,
      markAttendance,
      portalStudents: classPlan.portal?.students ?? [],
      rawItems: items,
      attendancePreview,
      items: enrichedItems,
    }
  })

  return applySyncModeToReviewDraft(
    {
      links: plan?.links ?? [],
      classCreates: plan?.classCreates ?? [],
      sections,
    },
    syncMode,
  )
}

export function applyClassIdsToReviewDraft(draft, classIdByPortalClassId) {
  if (!draft || !classIdByPortalClassId?.size) return draft

  const resolveClassId = (section) =>
    classIdByPortalClassId.get(section.portalClassId) ?? section.classId

  const links = (draft.links ?? []).map((link) => ({
    ...link,
    classId: classIdByPortalClassId.get(link.portalClassId) ?? link.classId,
  }))

  for (const [portalClassId, classId] of classIdByPortalClassId) {
    if (!links.some((link) => link.portalClassId === portalClassId)) {
      links.push({ classId, portalClassId })
    }
  }

  const sections = (draft.sections ?? []).map((section) => {
    const classId = resolveClassId(section)
    return {
      ...section,
      classId,
      hubLabel: section.hubLabel || section.portalLabel,
    }
  })

  return {
    ...draft,
    links,
    classCreates: [],
    sections,
  }
}

export function rebuildReviewDraftSyncMode(draft, syncMode, classes, attendance) {
  if (!draft) return draft
  const sections = (draft.sections ?? []).map((section) => {
    const hubClass = (classes || []).find((cls) => cls.id === section.classId)
    const enrichedItems = enrichReviewItemsWithMarkAttendance({
      items: section.rawItems ?? section.items ?? [],
      hubClass,
      classAttendance: attendance?.[section.classId] ?? {},
      markStudents: section.markAttendance?.students ?? [],
      studentSummaries: section.markAttendance?.studentSummaries ?? {},
      portalRosterStudents: section.portalStudents ?? [],
      syncMode,
    })
    return {
      ...section,
      items: enrichedItems,
      attendancePreview: buildAttendancePreviewFromMark(
        section.markAttendance,
        enrichedItems,
        syncMode,
      ),
    }
  })

  return applySyncModeToReviewDraft({ ...draft, sections }, syncMode)
}

export function getReviewSections(draft) {
  return draft?.sections ?? []
}

export function summarizeReviewSection(section) {
  const portalCount = section?.portalStudentCount ?? 0
  const hubCount = section?.hubStudentCount ?? 0
  const totals = {
    students: section?.items?.length ?? 0,
    portalCount,
    hubCount,
    countsMatch: portalCount === hubCount,
    countDelta: portalCount - hubCount,
    matched: 0,
    add: 0,
    update: 0,
    remove: 0,
    addSelected: 0,
    updateSelected: 0,
    removeSelected: 0,
    selectedChanges: 0,
    toggleable: 0,
    hubAfterSelected: hubCount,
    attendancePreview: section?.attendancePreview ?? null,
    attendanceStreakChanges: 0,
    attendanceTotalChanges: 0,
  }

  if (section?.attendancePreview) {
    totals.attendanceStreakChanges = section.attendancePreview.streakChanges ?? 0
    totals.attendanceTotalChanges = section.attendancePreview.totalChanges ?? 0
    totals.hasMarkAttendance = section.attendancePreview.source === 'view_markatd'
  }

  for (const item of section?.items ?? []) {
    if (item.kind === 'matched' && item.action === 'keep') {
      totals.matched += 1
      continue
    }
    if (item.canToggle) totals.toggleable += 1
    if (item.action === 'add') {
      totals.add += 1
      if (item.selected) {
        totals.addSelected += 1
        totals.selectedChanges += 1
      }
    } else if (item.action === 'update') {
      totals.update += 1
      if (item.selected) {
        totals.updateSelected += 1
        totals.selectedChanges += 1
      }
    } else if (item.action === 'remove') {
      totals.remove += 1
      if (item.selected) {
        totals.removeSelected += 1
        totals.selectedChanges += 1
      }
    }
  }

  totals.hubAfterSelected = hubCount + totals.addSelected - totals.removeSelected

  return totals
}

export function summarizeReviewDraft(draft) {
  const sections = getReviewSections(draft)
  const totals = {
    links: sections.length,
    classes: sections.length,
    add: 0,
    update: 0,
    remove: 0,
    keep: 0,
    selectedChanges: 0,
    attendanceMismatchStudents: 0,
    attendanceLoadedClasses: 0,
    portalStudentsWithSessions: 0,
  }

  for (const section of sections) {
    const sectionTotals = summarizeReviewSection(section)
    totals.add += sectionTotals.addSelected
    totals.update += sectionTotals.updateSelected
    totals.remove += sectionTotals.removeSelected
    totals.keep += sectionTotals.matched
    totals.selectedChanges += sectionTotals.selectedChanges
    totals.attendanceMismatchStudents +=
      (sectionTotals.attendanceStreakChanges ?? 0) +
      (sectionTotals.attendanceTotalChanges ?? 0)
    if (
      (section.items ?? []).some((item) => (item.portalSessions ?? []).length > 0) ||
      (section.attendancePreview?.fetchedStudentCount ?? 0) > 0
    ) {
      totals.attendanceLoadedClasses += 1
    }
    for (const item of section.items ?? []) {
      if ((item.portalSessions ?? []).length > 0) totals.portalStudentsWithSessions += 1
    }
  }

  return totals
}

/** Compact headline for the current class panel in sync review. */
export function getReviewClassHeadline(section, classTotals, syncMode) {
  const preview = section?.attendancePreview
  const hasSessions = (section?.items ?? []).some(
    (item) => (item.portalSessions ?? []).length > 0,
  )
  const fetched = hasSessions
    ? (section?.items ?? []).filter((item) => (item.portalSessions ?? []).length > 0).length
    : (preview?.fetchedStudentCount ?? 0)
  const linked = preview?.linkedStudents ?? classTotals?.portalCount ?? 0
  const moduleLabel = preview?.moduleLabel || section?.markAttendance?.moduleLabel || ''
  const parts = []

  if (hasSessions) {
    parts.push(
      moduleLabel
        ? `Portal P/A for ${moduleLabel} · ${fetched}/${linked} students`
        : `Portal P/A loaded for ${fetched}/${linked} students`,
    )
    const mismatches =
      (classTotals?.attendanceStreakChanges ?? 0) + (classTotals?.attendanceTotalChanges ?? 0)
    parts.push(
      mismatches > 0
        ? `${mismatches} hub count mismatch${mismatches === 1 ? '' : 'es'}`
        : 'hub counts match portal',
    )
  } else {
    parts.push(
      moduleLabel
        ? `Portal P/A not loaded for module ${moduleLabel}`
        : 'Portal P/A not loaded',
    )
  }

  const rosterParts = []
  if (classTotals?.addSelected) rosterParts.push(`${classTotals.addSelected} add`)
  if (classTotals?.updateSelected) rosterParts.push(`${classTotals.updateSelected} update`)
  if (classTotals?.removeSelected) rosterParts.push(`${classTotals.removeSelected} remove`)
  if (rosterParts.length) {
    parts.push(`Roster on confirm: ${rosterParts.join(', ')}`)
  } else if ((classTotals?.toggleable ?? 0) === 0) {
    parts.push('Roster: no changes')
  }

  if (
    syncMode === 'overwrite' &&
    ((classTotals?.attendanceStreakChanges ?? 0) > 0 ||
      (classTotals?.attendanceTotalChanges ?? 0) > 0)
  ) {
    parts.push('overwrite aligns hub streak/totals to portal')
  }

  return parts.join(' · ')
}

export function buildApplyPayloadFromReview(draft) {
  const adds = []
  const updates = []
  const removes = []
  const selectedSections = getReviewSections(draft)
  const selectedClassIds = new Set(selectedSections.map((section) => section.classId))
  const rosterProcessedClassIds = new Set()

  for (const section of selectedSections) {
    const rosterAlreadyDone = rosterProcessedClassIds.has(section.classId)
    if (!rosterAlreadyDone) rosterProcessedClassIds.add(section.classId)

    for (const item of section.items) {
      if (!item.selected || item.action === 'keep') continue
      if (rosterAlreadyDone) continue
      if (item.action === 'add') {
        adds.push({ classId: section.classId, name: item.portalName })
      } else if (item.action === 'update' && item.hubStudentId) {
        updates.push({
          classId: section.classId,
          studentId: item.hubStudentId,
          name: item.portalName,
        })
      } else if (item.action === 'remove' && item.hubStudentId) {
        removes.push({ classId: section.classId, studentId: item.hubStudentId })
      }
    }
  }

  const addsByClass = new Map()
  for (const row of adds) {
    const list = addsByClass.get(row.classId) ?? []
    list.push(row.name)
    addsByClass.set(row.classId, list)
  }

  const rosterAdds = [...addsByClass.entries()].map(([classId, names]) => ({
    classId,
    namesText: names.join('\n'),
    count: names.length,
  }))

  const links = (draft?.links ?? []).filter(
    (link) =>
      link.classId &&
      selectedSections.some(
        (section) =>
          section.classId === link.classId || section.portalClassId === link.portalClassId,
      ),
  )

  return {
    links,
    adds,
    updates,
    removes,
    rosterAdds,
    attendanceUpdates: buildAttendanceOverwritePayload(draft),
    syncMode: draft?.syncMode ?? 'merge',
  }
}

export { formatPersonName, formatSimilarityPercent }
