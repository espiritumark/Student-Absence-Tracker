import { LinkOutlined } from '@ant-design/icons'
import {
  Button,
  Checkbox,
  Col,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PortalSyncReviewModal from './PortalSyncReviewModal'
import { useAppNotifier } from '../hooks/useAppNotifier'
import {
  ANT_TABLE_HEADER_OFFSET,
  ANT_TABLE_PAGINATION_OFFSET,
  useScrollRegionHeight,
} from '../hooks/useScrollRegionHeight'
import {
  fetchPortalBridgeStatus,
  fetchPortalClassMarkAttendance,
  fetchPortalClassRoster,
  fetchPortalClassesWithRosters,
  portalClassNeedsModules,
  resolvePortalModuleIdOnBridge,
} from '../lib/portalBridgeClient'
import { NOTIFIER_KEYS } from '../utils/appNotifications'
import {
  buildPortalSyncApplyPlan,
  buildPortalSyncReviewDraft,
  buildApplyPayloadFromReview,
  applyClassIdsToReviewDraft,
} from '../utils/portalRosterMatch'
import {
  applyModuleSyncPick,
  buildModuleRowsForPortalClass,
  classModuleCheckboxState,
  countModuleSyncSelected,
  hubMatchedModuleRows,
  moduleStatusTagMeta,
  matchedModuleKeysForPortalRow,
  normalizeModuleSyncPick,
  portalSyncModuleRows,
  refreshModuleSyncPick,
  resolvePortalModuleId,
  mergePortalModuleId,
} from '../utils/portalModuleSync'
import { loadPortalPullCache, savePortalPullCache } from '../utils/portalPullCache'
import {
  buildPortalClassLinkPlan,
  hubClassOptions,
  linkPlanSummary,
} from '../utils/portalClassMatch'
import { UI } from '../utils/uiCopy'
import { PORTAL_SYNC_MODAL_WIDTH, portalSyncModalStyles } from '../utils/portalSyncModalLayout'
import { formatClassLabel } from '../utils/classFormat'
import SaveFieldOverlay from './SaveFieldOverlay'

const TABLE_PAGE_SIZE = 8
const PORTAL_SYNC_MODAL_Z_INDEX = 1200
const CREATE_HUB_CLASS_OPTION = '__create_hub_class__'

function portalClassMetaToForm(portal) {
  const meta = portal?.classMeta ?? {}
  return {
    intake: meta.intake ?? '',
    level: meta.level ?? '',
    group: meta.group ?? '',
    qualification: meta.qualification || portal?.label || '',
  }
}

function mergePortalRosterOntoClass(portalClass, roster) {
  const students = roster?.students ?? []
  return {
    ...portalClass,
    students,
    studentCount: students.length,
    session: roster?.session ?? {},
    hasAttendance:
      roster?.hasAttendance ?? students.some((student) => student.present != null),
    rosterLoaded: true,
    modules: roster?.modules ?? portalClass.modules ?? [],
    modulesFetched:
      Array.isArray(roster?.modules) ||
      portalClass.modulesFetched === true ||
      (portalClass.modules?.length ?? 0) > 0,
  }
}

function formatPortalSyncError(message) {
  const text = String(message || '').trim()
  if (!text) return 'The college portal request failed.'
  if (/email address or password is wrong/i.test(text)) {
    return `${text} Use the same email and password as attendance.ccct.edu.bn/login.php — not your Learning Partner Hub sign-in.`
  }
  if (/portal login failed/i.test(text)) {
    return `${text} These are your college attendance portal credentials in Student/.env, not your hub account.`
  }
  return text
}

function statusTag(status) {
  if (status === 'linked') return <Tag color="green">Linked</Tag>
  if (status === 'matched') return <Tag color="blue">Matched</Tag>
  if (status === 'portal_only') return <Tag color="orange">Portal only</Tag>
  if (status === 'hub_only') return <Tag>Hub only</Tag>
  return <Tag>Unknown</Tag>
}

function applyHubPicks(plan, classes, hubPick) {
  return plan.map((row) => {
    if (!row.portal || !(row.key in hubPick)) return row
    const selectedHubId = hubPick[row.key]
    const hub = selectedHubId ? classes.find((cls) => cls.id === selectedHubId) || null : null
    return {
      ...row,
      selectedHubId,
      hub,
      status: selectedHubId
        ? row.status === 'linked'
          ? 'linked'
          : 'matched'
        : 'portal_only',
    }
  })
}

function emptySyncPick() {
  return { classKeys: [], moduleKeys: [], deselectedModuleKeys: [] }
}

export default function PortalClassSyncModal({
  open,
  onClose,
  classes,
  attendance = {},
  applyPortalClassSync,
  addClass,
  busy = false,
}) {
  const notify = useAppNotifier()
  const [portalClasses, setPortalClasses] = useState(() => loadPortalPullCache()?.portalClasses ?? [])
  const [hubPick, setHubPick] = useState(() => loadPortalPullCache()?.hubPick ?? {})
  const [syncPick, setSyncPick] = useState(
    () => normalizeModuleSyncPick(loadPortalPullCache()?.syncPick).moduleKeys.length
      ? normalizeModuleSyncPick(loadPortalPullCache()?.syncPick)
      : emptySyncPick(),
  )
  const [pulledAt, setPulledAt] = useState(() => loadPortalPullCache()?.pulledAt ?? null)
  const [pulling, setPulling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewDraft, setReviewDraft] = useState(null)
  const [moduleLoadingIds, setModuleLoadingIds] = useState(() => new Set())
  const [expandedRowKeys, setExpandedRowKeys] = useState([])
  const [pullProgress, setPullProgress] = useState('')
  const [createHubClassRow, setCreateHubClassRow] = useState(null)
  const [createHubClassForm, setCreateHubClassForm] = useState(null)
  const [createHubClassBusy, setCreateHubClassBusy] = useState(false)
  const [createHubClassError, setCreateHubClassError] = useState('')

  const hubOptions = useMemo(() => hubClassOptions(classes), [classes])
  const basePlan = useMemo(
    () => buildPortalClassLinkPlan(portalClasses, classes),
    [portalClasses, classes],
  )

  const modulesSignature = useMemo(
    () =>
      portalClasses
        .map(
          (portalClass) =>
            `${portalClass.portalClassId}:${portalClass.modules?.length ?? 0}:${portalClass.modulesFetched ? 1 : 0}`,
        )
        .join('|'),
    [portalClasses],
  )

  const patchPortalModules = useCallback((portalClassId, modules, { modulesFetched = true } = {}) => {
    setPortalClasses((current) =>
      current.map((portalClass) =>
        portalClass.portalClassId === portalClassId
          ? { ...portalClass, modules, modulesFetched }
          : portalClass,
      ),
    )
  }, [])

  const patchPortalModuleId = useCallback(
    (portalClassId, moduleLabel, moduleId) => {
      setPortalClasses((current) =>
        current.map((portalClass) => {
          if (portalClass.portalClassId !== portalClassId) return portalClass
          return {
            ...portalClass,
            modules: mergePortalModuleId(portalClass.modules ?? [], moduleLabel, moduleId),
            modulesFetched: true,
          }
        }),
      )
    },
    [],
  )

  const loadPortalModules = useCallback(
    async (portalClassId, { quiet = false } = {}) => {
      const id = Number(portalClassId)
      if (!Number.isFinite(id) || id <= 0) return

      let shouldRun = false
      setModuleLoadingIds((current) => {
        if (current.has(id)) return current
        shouldRun = true
        return new Set(current).add(id)
      })
      if (!shouldRun) return

      try {
        const { roster } = await fetchPortalClassRoster(id)
        patchPortalModules(id, roster?.modules ?? [], { modulesFetched: true })
      } catch (e) {
        if (!quiet) {
          notify.error({
            key: NOTIFIER_KEYS.portalSyncError,
            title: `Could not load modules for portal class ${id}`,
            description: formatPortalSyncError(e.message),
            duration: 8,
          })
        }
      } finally {
        setModuleLoadingIds((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }
    },
    [notify, patchPortalModules],
  )

  useEffect(() => {
    if (!open) return
    const plan = applyHubPicks(basePlan, classes, hubPick)
    setSyncPick((current) => refreshModuleSyncPick(plan, current, { classes, attendance }))
  }, [open, portalClasses, modulesSignature, hubPick, basePlan, classes, attendance])

  useEffect(() => {
    if (!open) return
    const missingIds = portalClasses
      .filter((portalClass) => portalClassNeedsModules(portalClass))
      .map((portalClass) => portalClass.portalClassId)
    if (!missingIds.length) return

    let cancelled = false
    ;(async () => {
      for (const portalClassId of missingIds) {
        if (cancelled) return
        try {
          const { roster } = await fetchPortalClassRoster(portalClassId)
          if (cancelled) return
          setPortalClasses((current) =>
            current.map((portalClass) =>
              portalClass.portalClassId === portalClassId
                ? {
                    ...portalClass,
                    modules: roster?.modules ?? [],
                    modulesFetched: (roster?.modules?.length ?? 0) > 0,
                  }
                : portalClass,
            ),
          )
        } catch {
          // Leave for a later pull or row expand.
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, modulesSignature])

  useEffect(() => {
    if (!portalClasses.length && !Object.keys(hubPick).length && !syncPick.moduleKeys?.length) return
    savePortalPullCache({ portalClasses, hubPick, syncPick, pulledAt: pulledAt ?? Date.now() })
  }, [portalClasses, hubPick, syncPick, pulledAt])

  const rows = useMemo(
    () =>
      applyModuleSyncPick(applyHubPicks(basePlan, classes, hubPick), syncPick, {
        classes,
        attendance,
      }),
    [basePlan, classes, hubPick, syncPick, attendance],
  )
  const summary = useMemo(() => linkPlanSummary(rows), [rows])
  const portalRows = rows.filter((row) => row.portal)
  const matchedCount = portalRows.filter((row) => row.status === 'matched').length
  const syncCounts = useMemo(() => countModuleSyncSelected(rows), [rows])
  const syncSelectedCount = syncCounts.modules

  const tableChromeOffset = ANT_TABLE_HEADER_OFFSET + ANT_TABLE_PAGINATION_OFFSET
  const [tableRef, tableBodyHeight] = useScrollRegionHeight(
    320,
    tableChromeOffset,
    `${open}:${portalRows.length}`,
  )

  const patchPortalRoster = useCallback((portalClassId, roster) => {
    setPortalClasses((current) =>
      current.map((portalClass) =>
        portalClass.portalClassId === portalClassId
          ? mergePortalRosterOntoClass(portalClass, roster)
          : portalClass,
      ),
    )
  }, [])

  async function hydratePortalRostersForReview(selectedRows) {
    const portalClassIds = [
      ...new Set(
        selectedRows
          .map((row) => row.portal?.portalClassId)
          .filter((id) => Number.isFinite(Number(id)) && Number(id) > 0),
      ),
    ]
    if (!portalClassIds.length) return portalClasses

    const rosterById = new Map()
    const failures = []

    await Promise.all(
      portalClassIds.map(async (portalClassId) => {
        try {
          const { roster } = await fetchPortalClassRoster(portalClassId)
          rosterById.set(portalClassId, roster ?? {})
        } catch (error) {
          failures.push({ portalClassId, message: error?.message || 'Portal request failed.' })
        }
      }),
    )

    if (failures.length) {
      const summary = failures
        .slice(0, 3)
        .map((entry) => `class ${entry.portalClassId}`)
        .join(', ')
      throw new Error(
        `Could not load portal roster for ${summary}${failures.length > 3 ? ` (+${failures.length - 3} more)` : ''}.`,
      )
    }

    const hydrated = portalClasses.map((portalClass) =>
      rosterById.has(portalClass.portalClassId)
        ? mergePortalRosterOntoClass(portalClass, rosterById.get(portalClass.portalClassId))
        : portalClass,
    )
    setPortalClasses(hydrated)
    return hydrated
  }

  function buildReviewRows(hydratedPortalClasses) {
    const plan = buildPortalClassLinkPlan(hydratedPortalClasses, classes)
    return applyModuleSyncPick(applyHubPicks(plan, classes, hubPick), syncPick, {
      classes,
      attendance,
    })
  }

  function openCreateHubClassModal(row) {
    if (!row?.portal || !addClass) return
    setCreateHubClassError('')
    setCreateHubClassRow(row)
    setCreateHubClassForm(portalClassMetaToForm(row.portal))
  }

  async function handleCreateHubClass() {
    if (!createHubClassRow?.portal || !createHubClassForm || !addClass) return
    if (!String(createHubClassForm.qualification || '').trim()) {
      setCreateHubClassError('Qualification / programme is required.')
      return
    }

    setCreateHubClassBusy(true)
    setCreateHubClassError('')
    try {
      const fields = {
        intake: createHubClassForm.intake === '' ? null : Number(createHubClassForm.intake),
        level: createHubClassForm.level === '' ? null : Number(createHubClassForm.level),
        group: createHubClassForm.group === '' ? null : Number(createHubClassForm.group),
        qualification: String(createHubClassForm.qualification).trim(),
      }
      let newClassId = await addClass(fields)

      if (!newClassId) {
        const label = formatClassLabel(fields)
        const created = classes.find((cls) => formatClassLabel(cls) === label)
        newClassId = created?.id ?? null
      }

      if (!newClassId) {
        throw new Error('Class was created but could not be selected. Pick it from the hub list.')
      }

      updateRowHub(createHubClassRow.key, newClassId)
      setCreateHubClassRow(null)
      setCreateHubClassForm(null)
      notify.success({
        key: NOTIFIER_KEYS.portalSync,
        title: 'Hub class created',
        description: `"${formatClassLabel(fields)}" is ready to link for this portal class.`,
      })
    } catch (error) {
      setCreateHubClassError(formatPortalSyncError(error.message))
    } finally {
      setCreateHubClassBusy(false)
    }
  }

  async function handlePull() {
    setPulling(true)
    setPullProgress('')
    try {
      const status = await fetchPortalBridgeStatus()
      if (!status.configured) {
        notify.warning({
          key: NOTIFIER_KEYS.portalSyncError,
          title: 'Portal bridge not configured',
          description:
            'Add PORTAL_BASE_URL, PORTAL_USERNAME, and PORTAL_PASSWORD to Student/.env, then restart npm run dev.',
          duration: 8,
        })
        return
      }

      const result = await fetchPortalClassesWithRosters({
        onProgress: (done, total) => {
          setPullProgress(`Loading classes, rosters, and modules (${done}/${total})…`)
        },
      })
      const nextPortal = (result.classes || []).map((portalClass) => ({
        ...portalClass,
        modules: portalClass.modules ?? [],
        modulesFetched: (portalClass.modules?.length ?? 0) > 0,
      }))
      const pulledPlan = buildPortalClassLinkPlan(nextPortal, classes)
      const moduleTotal = nextPortal.reduce(
        (sum, portalClass) => sum + (portalClass.modules?.length ?? 0),
        0,
      )
      const classesWithoutModules = nextPortal.filter((portalClass) =>
        portalClassNeedsModules(portalClass),
      ).length
      setPortalClasses(nextPortal)
      setPulledAt(Date.now())
      setHubPick((currentHub) => {
        const nextHub = {}
        for (const row of pulledPlan) {
          if (!row.portal || !(row.key in currentHub) || !currentHub[row.key]) continue
          nextHub[row.key] = currentHub[row.key]
        }

        setSyncPick((currentSync) => {
          const normalized = normalizeModuleSyncPick(currentSync)
          const portalKeys = new Set(
            pulledPlan.filter((row) => row.portal).map((row) => row.key),
          )
          const keptModuleKeys = normalized.moduleKeys.filter((key) => {
            const portalClassId = String(key).split('::')[0]
            return portalKeys.has(`portal-${portalClassId}`)
          })
          const withHub = applyHubPicks(pulledPlan, classes, nextHub)
          return refreshModuleSyncPick(
            withHub,
            {
              moduleKeys: keptModuleKeys,
              deselectedModuleKeys: normalized.deselectedModuleKeys,
            },
            {
              classes,
              attendance,
            },
          )
        })

        return nextHub
      })

      const planSummary = linkPlanSummary(pulledPlan.filter((row) => row.portal))
      const nextMatched = pulledPlan.filter((row) => row.portal && row.status === 'matched').length
      const rosterTotal = result.rosterTotal ?? 0

      if (nextPortal.length > 0 && rosterTotal === 0) {
        notify.warning({
          key: NOTIFIER_KEYS.portalSyncError,
          title: 'Class list pulled, but no portal rosters loaded',
          description:
            'Restart npm run dev from the Student folder, then pull again. Review sync will load rosters automatically when you are ready.',
          duration: 10,
        })
      } else if (classesWithoutModules > 0) {
        notify.warning({
          key: NOTIFIER_KEYS.portalSyncError,
          title: 'Class list pulled, but some module lists are missing',
          description: `Loaded ${moduleTotal} module${moduleTotal === 1 ? '' : 's'} across ${nextPortal.length} classes, but ${classesWithoutModules} class${classesWithoutModules === 1 ? '' : 'es'} still have no portal modules. Restart npm run dev from the Student folder, then pull again.`,
          duration: 10,
        })
      } else {
        notify.success({
          key: NOTIFIER_KEYS.portalSync,
          title: UI.portalClassSyncPulled,
          description: `Pulled ${nextPortal.length} class${nextPortal.length === 1 ? '' : 'es'}, ${rosterTotal} portal student${rosterTotal === 1 ? '' : 's'}, and ${moduleTotal} module${moduleTotal === 1 ? '' : 's'} · ${nextMatched} auto-matched · ${planSummary.portalOnly} need manual linking. Check Sync for classes to include, then ${UI.portalClassSyncSave}.`,
        })
      }
    } catch (e) {
      notify.error({
        key: NOTIFIER_KEYS.portalSyncError,
        title: 'Could not pull class list',
        description: formatPortalSyncError(e.message),
        duration: 10,
      })
    } finally {
      setPulling(false)
      setPullProgress('')
    }
  }

  function updateRowHub(rowKey, hubId) {
    setHubPick((current) => ({
      ...current,
      [rowKey]: hubId || null,
    }))

    if (!hubId) return
    const row = basePlan.find((entry) => entry.key === rowKey)
    if (!row?.portal) return
    const hubClass = classes.find((cls) => cls.id === hubId)
    const moduleRows = buildModuleRowsForPortalClass(row.portal, hubClass, attendance)
    const matchedKeys = moduleRows
      .filter((moduleRow) => moduleRow.status === 'matched')
      .map((moduleRow) => moduleRow.key)
    setSyncPick((current) => ({
      classKeys: [],
      moduleKeys: [...new Set([...(current.moduleKeys ?? []), ...matchedKeys])],
      deselectedModuleKeys: (current.deselectedModuleKeys ?? []).filter(
        (key) => !matchedKeys.includes(key),
      ),
    }))
  }

  async function requestSave() {
    if (!syncSelectedCount) {
      notify.warning({
        key: NOTIFIER_KEYS.portalSyncError,
        title: 'No classes selected for sync',
        description:
          `Check the classes you want to sync in the table, then try ${UI.portalClassSyncSave} again.`,
      })
      return
    }

    const plan = buildPortalSyncApplyPlan(rows, classes)
    if (!plan.classPlans.length) {
      notify.warning({
        key: NOTIFIER_KEYS.portalSyncError,
        title: 'No modules selected for sync',
        description:
          'Expand a class, check the modules you want, then try Review sync again.',
      })
      return
    }

    setReviewLoading(true)
    setReviewError('')
    try {
      const selectedRows = rows.filter((row) => row.syncSelected && row.portal)
      const hydratedPortalClasses = await hydratePortalRostersForReview(selectedRows)
      const hydratedRows = buildReviewRows(hydratedPortalClasses)
      const reviewPlan = buildPortalSyncApplyPlan(hydratedRows, classes)

      if (!reviewPlan.classPlans.length) {
        notify.warning({
          key: NOTIFIER_KEYS.portalSyncError,
          title: 'No roster data to review',
          description:
            'Check at least one module for each class, then try Review sync again.',
        })
        return
      }

      const markAttendanceByReviewKey = {}
      await Promise.all(
        reviewPlan.classPlans.map(async (classPlan) => {
          const rosterStudents = classPlan.portal?.students ?? []
          let moduleId =
            classPlan.moduleId ?? resolvePortalModuleId(classPlan.portal, classPlan.moduleLabel)

          if (!moduleId && classPlan.moduleLabel) {
            try {
              moduleId = await resolvePortalModuleIdOnBridge(classPlan.portalClassId, {
                moduleLabel: classPlan.moduleLabel,
                rosterStudents,
              })
            } catch {
              moduleId = null
            }
          }

          try {
            const result = await fetchPortalClassMarkAttendance(classPlan.portalClassId, {
              includeDetails: true,
              rosterStudents,
              moduleId,
              classModuleId: classPlan.classModuleId ?? moduleId,
              moduleLabel: classPlan.moduleLabel,
            })
            const markAttendance = result.markAttendance ?? null
            markAttendanceByReviewKey[classPlan.reviewKey] = markAttendance
            const resolvedId = markAttendance?.moduleId ?? moduleId
            if (resolvedId && classPlan.moduleLabel) {
              patchPortalModuleId(classPlan.portalClassId, classPlan.moduleLabel, resolvedId)
            }
          } catch {
            markAttendanceByReviewKey[classPlan.reviewKey] = null
          }
        }),
      )

      setReviewDraft(
        buildPortalSyncReviewDraft(reviewPlan, {
          classes,
          attendance,
          markAttendanceByReviewKey,
          syncMode: 'merge',
        }),
      )
      setReviewOpen(true)
    } catch (e) {
      notify.error({
        key: NOTIFIER_KEYS.portalSyncError,
        title: 'Could not prepare review sync',
        description: formatPortalSyncError(e.message),
        duration: 10,
      })
    } finally {
      setReviewLoading(false)
    }
  }

  async function handleConfirmReview(confirmedDraft) {
    if (!confirmedDraft || saving) return

    const pendingCreates = confirmedDraft.classCreates ?? []
    if (pendingCreates.length && !addClass) {
      setReviewError('Cannot create new hub classes from this screen.')
      return
    }

    setSaving(true)
    setReviewError('')
    try {
      let draft = confirmedDraft
      const classIdByPortalClassId = new Map()

      for (const entry of pendingCreates) {
        const classId = await addClass(entry.fields)
        if (!classId) {
          throw new Error(`Could not create hub class for “${entry.portalLabel}”.`)
        }
        classIdByPortalClassId.set(entry.portalClassId, classId)
      }

      if (classIdByPortalClassId.size) {
        draft = applyClassIdsToReviewDraft(draft, classIdByPortalClassId)
      }

      const payload = buildApplyPayloadFromReview(draft)
      const result = await applyPortalClassSync(payload)
      setHubPick({})
      setReviewOpen(false)
      setReviewDraft(null)

      const parts = []
      if (classIdByPortalClassId.size) {
        parts.push(
          `Created ${classIdByPortalClassId.size} new hub class${classIdByPortalClassId.size === 1 ? '' : 'es'}`,
        )
      }
      if (result.linksSaved > 0) {
        parts.push(`Saved ${result.linksSaved} class link${result.linksSaved === 1 ? '' : 's'}`)
      }
      if (result.studentsUpdated > 0) {
        parts.push(`updated ${result.studentsUpdated} name${result.studentsUpdated === 1 ? '' : 's'}`)
      }
      if (result.studentsAdded > 0) {
        parts.push(
          `added ${result.studentsAdded} new ${result.studentsAdded === 1 ? 'Learning Partner' : 'Learning Partners'}`,
        )
      }
      if (result.studentsRemoved > 0) {
        parts.push(`removed ${result.studentsRemoved} hub-only`)
      }
      if (result.attendanceUpdated > 0) {
        parts.push(
          `overwrote ${result.attendanceUpdated} absence count${result.attendanceUpdated === 1 ? '' : 's'} from portal`,
        )
      }

      notify.success({
        key: NOTIFIER_KEYS.portalSync,
        title: UI.portalClassSyncSaved,
        description: parts.length ? `${parts.join(', ')}.` : 'Portal sync completed.',
      })
    } catch (e) {
      setReviewError(formatPortalSyncError(e.message))
      notify.error({
        key: NOTIFIER_KEYS.portalSyncError,
        title: 'Could not save portal sync',
        description: formatPortalSyncError(e.message),
        duration: 10,
      })
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (pulling || saving) return
    setReviewOpen(false)
    setReviewDraft(null)
    setExpandedRowKeys([])
    setCreateHubClassRow(null)
    setCreateHubClassForm(null)
    setCreateHubClassError('')
    onClose()
  }

  function setModulePick(moduleKeys) {
    setSyncPick({ classKeys: [], moduleKeys, deselectedModuleKeys: [] })
  }

  function toggleModuleRow(moduleKey, checked) {
    setSyncPick((current) => {
      const pick = normalizeModuleSyncPick(current)
      const moduleKeys = new Set(pick.moduleKeys)
      const deselectedModuleKeys = new Set(pick.deselectedModuleKeys)
      if (checked) {
        moduleKeys.add(moduleKey)
        deselectedModuleKeys.delete(moduleKey)
      } else {
        moduleKeys.delete(moduleKey)
        deselectedModuleKeys.add(moduleKey)
      }
      return {
        classKeys: [],
        moduleKeys: [...moduleKeys],
        deselectedModuleKeys: [...deselectedModuleKeys],
      }
    })
  }

  function toggleClassModules(row, checked) {
    const moduleRows = portalSyncModuleRows(row.moduleRows)
    setSyncPick((current) => {
      const pick = normalizeModuleSyncPick(current)
      const moduleKeys = new Set(pick.moduleKeys)
      const deselectedModuleKeys = new Set(pick.deselectedModuleKeys)
      for (const moduleRow of moduleRows) {
        if (checked) {
          moduleKeys.add(moduleRow.key)
          deselectedModuleKeys.delete(moduleRow.key)
        } else {
          moduleKeys.delete(moduleRow.key)
          deselectedModuleKeys.add(moduleRow.key)
        }
      }
      return {
        classKeys: [],
        moduleKeys: [...moduleKeys],
        deselectedModuleKeys: [...deselectedModuleKeys],
      }
    })
  }

  function toggleAllModules(checked) {
    if (!checked) {
      setModulePick([])
      return
    }
    const keys = []
    for (const row of portalRows) {
      for (const moduleRow of portalSyncModuleRows(row.moduleRows)) keys.push(moduleRow.key)
    }
    setModulePick(keys)
  }

  const locked = busy || pulling || saving || reviewLoading

  const allModuleKeys = useMemo(
    () => portalRows.flatMap((row) => portalSyncModuleRows(row.moduleRows).map((moduleRow) => moduleRow.key)),
    [portalRows],
  )
  const selectedModuleKeyCount = (syncPick.moduleKeys ?? []).filter((key) =>
    allModuleKeys.includes(key),
  ).length

  const columns = [
    {
      title: (
        <Checkbox
          disabled={locked || !allModuleKeys.length}
          checked={selectedModuleKeyCount === allModuleKeys.length && allModuleKeys.length > 0}
          indeterminate={
            selectedModuleKeyCount > 0 && selectedModuleKeyCount < allModuleKeys.length
          }
          onChange={(event) => toggleAllModules(event.target.checked)}
        />
      ),
      key: 'sync',
      width: 52,
      align: 'center',
      render: (_, row) => {
        if (!row.portal) return null
        const syncRows = portalSyncModuleRows(row.moduleRows)
        const state = classModuleCheckboxState(row.moduleRows)
        return (
          <Checkbox
            checked={state.checked}
            indeterminate={state.indeterminate}
            disabled={locked || !syncRows.length}
            onChange={(event) => toggleClassModules(row, event.target.checked)}
          />
        )
      },
    },
    {
      title: 'Portal ID',
      dataIndex: ['portal', 'portalClassId'],
      width: 88,
      render: (value) => value ?? '—',
    },
    {
      title: 'College portal class',
      dataIndex: ['portal', 'label'],
      ellipsis: true,
      render: (value) => value || '—',
    },
    {
      title: 'Hub class',
      key: 'hub',
      render: (_, row) => {
        if (!row.portal) return '—'
        return (
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Select hub class"
            style={{ width: '100%' }}
            value={row.selectedHubId || undefined}
            disabled={locked || row.status === 'linked'}
            options={[
              ...(addClass
                ? [{ value: CREATE_HUB_CLASS_OPTION, label: '+ Create new hub class…' }]
                : []),
              ...hubOptions.map((option) => ({
                value: option.value,
                label:
                  option.portalClassId != null
                    ? `${option.label} (portal ${option.portalClassId})`
                    : option.label,
              })),
            ]}
            onChange={(value) => {
              if (value === CREATE_HUB_CLASS_OPTION) {
                openCreateHubClassModal(row)
                return
              }
              updateRowHub(row.key, value)
            }}
          />
        )
      },
    },
    {
      title: UI.status,
      key: 'status',
      width: 108,
      render: (_, row) => statusTag(row.status),
    },
  ]

  return (
    <>
      <Modal
        title={UI.portalClassSyncTitle}
        open={open}
        onCancel={handleClose}
        width={PORTAL_SYNC_MODAL_WIDTH}
        centered
        footer={null}
        zIndex={PORTAL_SYNC_MODAL_Z_INDEX}
        wrapClassName="portal-class-sync-modal-wrap"
        className="portal-class-sync-modal"
        styles={portalSyncModalStyles}
      >
        <div className="portal-class-sync-body">
          <div className="portal-class-sync-toolbar">
            <Typography.Paragraph type="secondary" className="portal-class-sync-description">
              {UI.portalClassSyncDescription}
            </Typography.Paragraph>

            <Space wrap className="portal-class-sync-actions">
              <Button
                type="primary"
                icon={<LinkOutlined />}
                onClick={handlePull}
                loading={pulling}
                disabled={locked}
              >
                {UI.portalClassSyncPull}
              </Button>
              <Button
                onClick={requestSave}
                loading={saving || reviewLoading}
                disabled={locked || reviewLoading || !portalRows.length || syncSelectedCount === 0}
              >
                {UI.portalClassSyncSave}
              </Button>
            </Space>

            {portalRows.length > 0 && (
              <Typography.Paragraph className="portal-class-sync-summary">
                {summary.alreadyLinked} already linked · {matchedCount} new matches ·{' '}
                {summary.portalOnly} portal-only · {summary.hubOnly} hub-only
                {syncSelectedCount > 0
                  ? ` · ${syncCounts.classes} class${syncCounts.classes === 1 ? '' : 'es'} · ${syncSelectedCount} module${syncSelectedCount === 1 ? '' : 's'} selected`
                  : ''}
                {pulledAt ? (
                  <>
                    {' '}
                    · Last pulled{' '}
                    {new Date(pulledAt).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </>
                ) : null}
              </Typography.Paragraph>
            )}
          </div>

          <SaveFieldOverlay
            busy={pulling || saving || reviewLoading}
            label={
              pulling
                ? pullProgress || 'Pulling classes, rosters, and modules…'
                : reviewLoading
                  ? 'Loading portal rosters and attendance…'
                  : 'Saving sync…'
            }
            className="portal-class-sync-table-overlay"
          >
            <div ref={tableRef} className="portal-class-sync-table-region table-scroll-region">
              <Table
                size="small"
                rowKey="key"
                columns={columns}
                dataSource={portalRows}
                expandable={{
                  expandedRowKeys,
                  onExpandedRowsChange: (keys) => setExpandedRowKeys(keys),
                  onExpand: (expanded, row) => {
                    if (!expanded || !row.portal) return
                    if (portalClassNeedsModules(row.portal)) {
                      loadPortalModules(row.portal.portalClassId)
                    }
                  },
                  expandedRowRender: (row) => {
                    const portalClassId = row.portal?.portalClassId
                    const loadingModules =
                      portalClassId != null && moduleLoadingIds.has(portalClassId)
                    const moduleRows = row.moduleRows ?? []

                    return (
                    <div className="portal-class-sync-module-list">
                      {loadingModules && moduleRows.length === 0 ? (
                        <Typography.Text type="secondary">Loading portal modules…</Typography.Text>
                      ) : null}
                      {!loadingModules && moduleRows.length === 0 ? (
                        <Typography.Text type="secondary">No modules loaded for this class.</Typography.Text>
                      ) : null}
                      {moduleRows.map((moduleRow) => {
                        const meta = moduleStatusTagMeta(moduleRow.status)
                        return (
                          <label key={moduleRow.key} className="portal-class-sync-module-row">
                            <Checkbox
                              checked={moduleRow.syncSelected}
                              disabled={locked}
                              onChange={(event) =>
                                toggleModuleRow(moduleRow.key, event.target.checked)
                              }
                            />
                            <Typography.Text className="portal-class-sync-module-label">
                              {moduleRow.label}
                            </Typography.Text>
                            <Tag color={meta.color}>{meta.label}</Tag>
                          </label>
                        )
                      })}
                    </div>
                    )
                  },
                  rowExpandable: (row) => Boolean(row.portal),
                }}
                pagination={
                  portalRows.length > 0
                    ? {
                        pageSize: TABLE_PAGE_SIZE,
                        showSizeChanger: false,
                        hideOnSinglePage: true,
                        size: 'small',
                      }
                    : false
                }
                scroll={open ? { y: Math.max(200, tableBodyHeight) } : undefined}
                locale={{ emptyText: 'Pull the class list to begin linking.' }}
              />
            </div>
          </SaveFieldOverlay>
        </div>
      </Modal>

      <Modal
        title="Create hub class"
        open={Boolean(createHubClassRow)}
        onCancel={() => {
          if (createHubClassBusy) return
          setCreateHubClassRow(null)
          setCreateHubClassForm(null)
          setCreateHubClassError('')
        }}
        footer={null}
        destroyOnHidden
        width={520}
        zIndex={PORTAL_SYNC_MODAL_Z_INDEX + 1}
      >
        <SaveFieldOverlay busy={createHubClassBusy} label="Creating hub class…">
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            {createHubClassRow?.portal?.label
              ? `Create a hub class for “${createHubClassRow.portal.label}”.`
              : 'Create a new hub class for this portal row.'}
          </Typography.Paragraph>
          <Row gutter={[12, 12]}>
            <Col span={8}>
              <Typography.Text className="field-label">Intake</Typography.Text>
              <InputNumber
                value={createHubClassForm?.intake === '' ? null : Number(createHubClassForm?.intake)}
                onChange={(value) =>
                  setCreateHubClassForm((current) => ({ ...current, intake: value ?? '' }))
                }
                style={{ width: '100%' }}
              />
            </Col>
            <Col span={8}>
              <Typography.Text className="field-label">Level</Typography.Text>
              <InputNumber
                value={createHubClassForm?.level === '' ? null : Number(createHubClassForm?.level)}
                onChange={(value) =>
                  setCreateHubClassForm((current) => ({ ...current, level: value ?? '' }))
                }
                style={{ width: '100%' }}
              />
            </Col>
            <Col span={8}>
              <Typography.Text className="field-label">Group</Typography.Text>
              <InputNumber
                value={createHubClassForm?.group === '' ? null : Number(createHubClassForm?.group)}
                onChange={(value) =>
                  setCreateHubClassForm((current) => ({ ...current, group: value ?? '' }))
                }
                style={{ width: '100%' }}
              />
            </Col>
            <Col span={24}>
              <Typography.Text className="field-label">Qualification / Programme</Typography.Text>
              <Input
                placeholder="HND IN COMPUTING"
                value={createHubClassForm?.qualification ?? ''}
                onChange={(event) =>
                  setCreateHubClassForm((current) => ({
                    ...current,
                    qualification: event.target.value,
                  }))
                }
              />
            </Col>
          </Row>
          {createHubClassError ? (
            <Typography.Paragraph type="danger" role="alert" style={{ marginTop: '0.75rem' }}>
              {createHubClassError}
            </Typography.Paragraph>
          ) : null}
          <Space style={{ marginTop: '1rem' }}>
            <Button
              type="primary"
              disabled={createHubClassBusy || locked}
              loading={createHubClassBusy}
              onClick={handleCreateHubClass}
            >
              Create class
            </Button>
            <Button
              disabled={createHubClassBusy}
              onClick={() => {
                setCreateHubClassRow(null)
                setCreateHubClassForm(null)
                setCreateHubClassError('')
              }}
            >
              Cancel
            </Button>
          </Space>
        </SaveFieldOverlay>
      </Modal>

      <PortalSyncReviewModal
        open={reviewOpen}
        draft={reviewDraft}
        classes={classes}
        attendance={attendance}
        busy={saving}
        error={reviewError}
        onCancel={() => {
          if (saving) return
          setReviewOpen(false)
          setReviewDraft(null)
          setReviewError('')
        }}
        onConfirm={handleConfirmReview}
      />
    </>
  )
}
