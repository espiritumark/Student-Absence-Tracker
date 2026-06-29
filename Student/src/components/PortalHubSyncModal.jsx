import { CaretDownOutlined, CloseOutlined, CloudDownloadOutlined } from '@ant-design/icons'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  Empty,
  Input,
  Menu,
  Modal,
  Progress,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppNotifier } from '../hooks/useAppNotifier'
import {
  fetchPortalBridgeStatus,
  fetchPortalClassIds,
  fetchPortalMonitoringSnapshot,
} from '../lib/portalBridgeClient'
import { NOTIFIER_KEYS } from '../utils/appNotifications'
import {
  buildPortalHubSyncApplyPayload,
  buildPortalHubSyncReviewDraft,
  getModuleViewRows,
  summarizePortalHubSyncDraft,
} from '../utils/portalHubSync'
import {
  fullClassLabel,
  getStudentModuleSummaries,
  moduleCodePrefix,
  moduleSubjectTitle,
  rosterStatusSummary,
  sectionCohortLine,
  studentInitials,
} from '../utils/portalHubSyncDisplay'
import {
  formatPortalCacheAge,
  loadPortalMonitoringSnapshot,
  savePortalMonitoringSnapshot,
} from '../utils/portalMonitoringCache'
import {
  PORTAL_HUB_SYNC_MODAL_WIDTH,
  portalHubSyncModalStyles,
} from '../utils/portalSyncModalLayout'
import { UI } from '../utils/uiCopy'

const MODAL_Z_INDEX = 1200

const brand = {
  navy900: '#161D3D',
  navy800: '#202959',
  navy700: '#2E3A7A',
  navy400: '#6B77B0',
  navy200: '#C4C8E2',
  navy50: '#EDEEF7',
  yellow: '#FDD00D',
  yellowHover: '#E6BC00',
  yellowBg: '#FFF8CC',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F6FB',
  sidebar: '#202959',
  success: '#0B7A4B',
  successBg: '#F0FDF4',
  successBorder: '#BBF7D0',
  warning: '#B45309',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',
  warningDot: '#F59E0B',
  error: '#B91C1C',
  errorBg: '#FEF2F2',
  errorBorder: '#FECACA',
  textPrimary: '#161D3D',
  textSecondary: '#4A5280',
  textMuted: '#6B77B0',
  textOnNavy: '#FFFFFF',
  textOnNavyMuted: 'rgba(255,255,255,0.55)',
  textOnNavySoft: 'rgba(255,255,255,0.70)',
  border: '#C4C8E2',
  borderStrong: '#A0A7D1',
  moduleInset: 'rgba(0,0,0,0.15)',
  moduleSelectedBg: 'rgba(255,255,255,0.08)',
  yellowTagBg: 'rgba(253,208,13,0.15)',
  yellowTagBorder: 'rgba(253,208,13,0.3)',
  scrollbarOnNavy: 'rgba(255,255,255,0.15)',
  dotInactive: 'rgba(255,255,255,0.25)',
}

const portalHubSyncBrandTheme = {
  token: {
    colorPrimary: brand.navy800,
    colorPrimaryHover: brand.navy700,
    colorBgContainer: brand.surface,
    colorBgLayout: brand.surfaceAlt,
    colorBorderSecondary: brand.navy200,
    colorTextBase: brand.textPrimary,
    colorTextSecondary: brand.textSecondary,
    colorTextTertiary: brand.textMuted,
    colorSuccess: brand.success,
    colorWarning: brand.warning,
    colorError: brand.error,
    borderRadius: 6,
    fontFamily: 'Inter, -apple-system, sans-serif',
    fontSize: 13,
  },
  components: {
    Menu: {
      darkItemBg: brand.navy800,
      darkItemSelectedBg: brand.navy700,
      darkItemSelectedColor: brand.yellow,
      darkItemColor: 'rgba(255,255,255,0.75)',
      darkItemHoverBg: brand.navy700,
      darkItemHoverColor: brand.textOnNavy,
    },
    Table: {
      headerBg: brand.surfaceAlt,
      headerColor: brand.textSecondary,
      rowHoverBg: brand.navy50,
      borderColor: brand.navy200,
    },
    Button: {
      primaryColor: brand.textOnNavy,
      defaultBorderColor: brand.navy200,
      defaultColor: brand.textSecondary,
    },
    Tag: {
      borderRadiusSM: 4,
    },
    Progress: {
      defaultColor: brand.navy800,
    },
  },
}

const ATTENDANCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All attendance' },
  { value: 'watch', label: 'Below 85%' },
  { value: 'low', label: 'Below 75%' },
]

const SIDEBAR_WIDTH = 248
const DETAIL_PANEL_WIDTH = 220

function percentStrokeColor(percent) {
  if (percent == null) return brand.navy200
  if (percent >= 75) return brand.success
  if (percent >= 50) return brand.warning
  return brand.error
}

function attendanceTagStyle(percent) {
  if (percent == null) {
    return { background: brand.surfaceAlt, color: brand.textMuted, border: `0.5px solid ${brand.border}` }
  }
  if (percent >= 75) {
    return { background: brand.successBg, color: brand.success, border: `0.5px solid ${brand.successBorder}` }
  }
  if (percent >= 50) {
    return { background: brand.warningBg, color: brand.warning, border: `0.5px solid ${brand.warningBorder}` }
  }
  return { background: brand.errorBg, color: brand.error, border: `0.5px solid ${brand.errorBorder}` }
}

function classDotColor(section, classIdx, activeClassIndex, isOpen) {
  if (classIdx === activeClassIndex) return brand.yellow
  if (section.classStatus === 'portal_only') return brand.warningDot
  if (isOpen) return brand.textOnNavyMuted
  return brand.dotInactive
}

function PortalHubClassSidebar({
  sections,
  classIndex,
  moduleIndex,
  openClassKeys,
  onToggleClass,
  onSelectModule,
}) {
  const menuItems = useMemo(() => {
    const items = []
    sections.forEach((section, classIdx) => {
      const classKey = `class-${classIdx}`
      const isOpen = openClassKeys.includes(classKey)
      const isActiveClass = classIndex === classIdx
      items.push({
        key: classKey,
        className: [
          'portal-hub-sync-class-menu-item',
          isActiveClass ? 'is-active' : '',
          isOpen ? 'is-open' : '',
        ]
          .filter(Boolean)
          .join(' '),
        label: (
          <span className="portal-hub-sync-class-menu-label">
            <CaretDownOutlined
              className={`portal-hub-sync-class-caret${isOpen ? ' is-open' : ''}`}
              aria-hidden
            />
            <Badge dot color={classDotColor(section, classIdx, classIndex, isOpen)} />
            <span className="portal-hub-sync-sidebar-label">{fullClassLabel(section)}</span>
          </span>
        ),
        onClick: () => onToggleClass(classIdx),
      })

      if (isOpen) {
        ;(section.modules ?? []).forEach((mod, modIdx) => {
          const code = moduleCodePrefix(mod.moduleLabel)
          const isSelectedModule = classIdx === classIndex && modIdx === moduleIndex
          items.push({
            key: `mod-${classIdx}-${modIdx}`,
            className: [
              'portal-hub-sync-module-menu-item',
              isSelectedModule ? 'is-selected' : '',
            ]
              .filter(Boolean)
              .join(' '),
            label: (
              <span className="portal-hub-sync-module-menu-label">
                {code ? (
                  <Tag bordered={false} className="portal-hub-sync-module-code-tag">
                    {code}
                  </Tag>
                ) : null}
                <span className="portal-hub-sync-sidebar-label portal-hub-sync-module-name">
                  {moduleSubjectTitle(mod.moduleLabel)}
                </span>
                {mod.sessionChanges > 0 ? (
                  <span className="portal-hub-sync-module-sessions">{mod.sessionChanges}</span>
                ) : null}
              </span>
            ),
            onClick: () => onSelectModule(classIdx, modIdx),
          })
        })
      }
    })
    return items
  }, [classIndex, moduleIndex, onSelectModule, onToggleClass, openClassKeys, sections])

  const selectedKeys = useMemo(() => {
    if (!sections.length) return []
    return [`class-${classIndex}`, `mod-${classIndex}-${moduleIndex}`]
  }, [classIndex, moduleIndex, sections.length])

  const panelStyle = {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRight: `1px solid ${brand.navy700}`,
    background: brand.sidebar,
  }

  const labelStyle = {
    flexShrink: 0,
    padding: '8px 12px 4px',
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: brand.textOnNavyMuted,
  }

  const scrollStyle = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
  }

  return (
    <div style={panelStyle} aria-label="Classes">
      <div style={labelStyle}>Classes</div>
      <div style={scrollStyle} className="portal-hub-sync-sidebar-scroll">
        {sections.length > 0 ? (
          <Menu
            theme="dark"
            mode="inline"
            size="small"
            selectable
            selectedKeys={selectedKeys}
            items={menuItems}
            style={{ border: 'none', background: 'transparent' }}
          />
        ) : (
          <span
            style={{
              display: 'block',
              padding: '8px 12px',
              fontSize: 12,
              color: brand.textOnNavyMuted,
            }}
          >
            No classes loaded
          </span>
        )}
      </div>
    </div>
  )
}

function PortalHubRosterPanel({
  reviewDraft,
  pulling,
  classIndex,
  moduleIndex,
  selectedStudentId,
  onSelectStudent,
  onToggleItem,
  onToggleAll,
}) {
  const [searchText, setSearchText] = useState('')
  const [attendanceFilter, setAttendanceFilter] = useState('all')

  const sections = reviewDraft?.sections ?? []
  const classCount = sections.length
  const safeClassIndex = classCount > 0 ? Math.min(classIndex, classCount - 1) : 0
  const currentSection = classCount > 0 ? sections[safeClassIndex] : null
  const modules = currentSection?.modules ?? []
  const moduleCount = modules.length
  const safeModuleIndex = moduleCount > 0 ? Math.min(moduleIndex, moduleCount - 1) : 0
  const currentModule = moduleCount > 0 ? modules[safeModuleIndex] : null

  useEffect(() => {
    setSearchText('')
    setAttendanceFilter('all')
  }, [safeClassIndex, safeModuleIndex])

  const tableRows = useMemo(() => {
    if (!currentSection || !currentModule) return []
    let rows = getModuleViewRows(currentSection, currentModule)
    const query = searchText.trim().toLowerCase()
    if (query) {
      rows = rows.filter((row) => (row.portalName || '').toLowerCase().includes(query))
    }
    if (attendanceFilter === 'watch') {
      rows = rows.filter((row) => row.portalPercent != null && row.portalPercent < 85)
    } else if (attendanceFilter === 'low') {
      rows = rows.filter((row) => row.portalPercent != null && row.portalPercent < 75)
    }
    return rows
  }, [attendanceFilter, currentModule, currentSection, searchText])

  const moduleItems = currentModule?.items ?? []
  const selectedCount = moduleItems.filter((item) => item.selected && item.canToggle).length
  const toggleableCount = moduleItems.filter((item) => item.canToggle).length

  const columns = useMemo(
    () => [
      {
        title: UI.learningPartner,
        key: 'lp',
        ellipsis: true,
        render: (_, item) => (
          <span style={{ fontSize: 12, color: brand.textPrimary }}>{item.portalName || '—'}</span>
        ),
      },
      {
        title: 'Present',
        key: 'present',
        width: 64,
        align: 'center',
        render: (_, item) => (
          <span style={{ fontSize: 12, color: brand.success }}>
            {item.portalPresent == null ? '—' : String(item.portalPresent)}
          </span>
        ),
      },
      {
        title: 'Absent',
        key: 'absent',
        width: 64,
        align: 'center',
        render: (_, item) => {
          const absent = item.portalAbsent
          const color =
            absent != null && absent > 3 ? brand.error : brand.textMuted
          return (
            <span style={{ fontSize: 12, color }}>
              {absent == null ? '—' : String(absent)}
            </span>
          )
        },
      },
      {
        title: 'Attendance %',
        key: 'percent',
        width: 96,
        align: 'center',
        render: (_, item) => {
          const pct = item.portalPercent
          if (pct == null) return '—'
          return (
            <Tag bordered={false} style={{ margin: 0, borderRadius: 4, ...attendanceTagStyle(pct) }}>
              {pct}%
            </Tag>
          )
        },
      },
      {
        title: 'New Sess.',
        key: 'sessions',
        width: 72,
        align: 'center',
        render: (_, item) => (
          <span style={{ fontSize: 12, color: brand.textPrimary }}>
            {item.sessionChanges?.length ? String(item.sessionChanges.length) : '—'}
          </span>
        ),
      },
      {
        title: 'Apply',
        key: 'apply',
        width: 56,
        align: 'center',
        render: (_, item) =>
          item.canToggle ? (
            <Checkbox
              size="small"
              checked={item.selected}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                onToggleItem(
                  currentSection.rowKey,
                  currentModule.rowKey,
                  item.id,
                  event.target.checked,
                )
              }
            />
          ) : (
            '—'
          ),
      },
    ],
    [currentModule?.rowKey, currentSection?.rowKey, onToggleItem],
  )

  const panelStyle = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: brand.surface,
  }

  const infoRowStyle = {
    flexShrink: 0,
    padding: '8px 12px',
    borderBottom: `1px solid ${brand.border}`,
    background: brand.surfaceAlt,
  }

  const toolbarStyle = {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderBottom: `1px solid ${brand.border}`,
    background: brand.surface,
  }

  const tableWrapStyle = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
  }

  if (pulling) {
    return (
      <div style={panelStyle}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
          }}
        >
          <Progress percent={99} status="active" size="small" showInfo={false} strokeColor={brand.navy800} />
          <span style={{ fontSize: 12, color: brand.textMuted }}>
            Pulling classes, modules, and attendance grids…
          </span>
        </div>
      </div>
    )
  }

  if (!reviewDraft || !currentSection || !currentModule) {
    return (
      <div style={panelStyle}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Pull from the portal to review classes, modules, and attendance."
          />
        </div>
      </div>
    )
  }

  const moduleTitle = moduleSubjectTitle(currentModule.moduleLabel)
  const moduleCode = moduleCodePrefix(currentModule.moduleLabel)
  const rosterLine = rosterStatusSummary(currentSection)
  const sessionLabel =
    currentModule.sessionChanges > 0
      ? ` · ${currentModule.sessionChanges} session${currentModule.sessionChanges === 1 ? '' : 's'} to import`
      : ''

  return (
    <div style={panelStyle}>
      <div style={infoRowStyle}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: brand.textPrimary }}>
          {fullClassLabel(currentSection)}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: brand.textSecondary, marginTop: 2 }}>
          {moduleCode ? (
            <span style={{ fontWeight: 500, color: brand.navy800 }}>{moduleCode}</span>
          ) : null}
          {moduleCode ? ' · ' : ''}
          {moduleTitle}
          {sessionLabel}
        </span>
        {rosterLine || sectionCohortLine(currentSection) ? (
          <span style={{ display: 'block', fontSize: 11, color: brand.textMuted, marginTop: 2 }}>
            {[rosterLine, sectionCohortLine(currentSection)].filter(Boolean).join(' · ')}
          </span>
        ) : null}
      </div>

      <div style={toolbarStyle}>
        <Input.Search
          size="small"
          allowClear
          placeholder={`Search ${UI.learningPartners.toLowerCase()}…`}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Select
          size="small"
          value={attendanceFilter}
          options={ATTENDANCE_FILTER_OPTIONS}
          onChange={setAttendanceFilter}
          style={{ width: 130, flexShrink: 0 }}
        />
        <span style={{ fontSize: 11, color: brand.textMuted, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {tableRows.length} shown · {selectedCount}/{toggleableCount || tableRows.length} selected
        </span>
        {toggleableCount > 0 ? (
          <Checkbox
            size="small"
            checked={selectedCount === toggleableCount}
            indeterminate={selectedCount > 0 && selectedCount < toggleableCount}
            onChange={(event) =>
              onToggleAll(currentSection.rowKey, currentModule.rowKey, event.target.checked)
            }
          >
            All
          </Checkbox>
        ) : null}
      </div>

      <div style={tableWrapStyle} className="portal-hub-sync-table-scroll">
        <Table
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={tableRows}
          pagination={false}
          sticky
          rowClassName={(record) =>
            record.portalStudentId === selectedStudentId ? 'portal-hub-sync-row-selected' : ''
          }
          onRow={(record) => ({
            onClick: () => onSelectStudent(record.portalStudentId),
          })}
        />
      </div>
    </div>
  )
}

function PortalHubStudentPanel({
  student,
  moduleSummaries,
  activeModuleIndex,
  onClose,
  onSelectModule,
}) {
  if (!student) return null

  const panelStyle = {
    width: DETAIL_PANEL_WIDTH,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderLeft: `1px solid ${brand.border}`,
    background: brand.surface,
  }

  const headerStyle = {
    flexShrink: 0,
    position: 'relative',
    padding: '10px 12px',
    borderBottom: `1px solid ${brand.border}`,
    background: brand.surfaceAlt,
  }

  const labelStyle = {
    flexShrink: 0,
    padding: '6px 12px 4px',
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: brand.textMuted,
  }

  const scrollStyle = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '0 10px 10px',
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          aria-label="Close student detail"
          onClick={onClose}
          style={{ position: 'absolute', top: 4, right: 4, color: brand.textMuted }}
        />
        <Space align="start" size={8}>
          <Avatar
            size={32}
            style={{
              background: brand.navy50,
              color: brand.navy800,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {studentInitials(student.portalName)}
          </Avatar>
          <div style={{ minWidth: 0, paddingRight: 20 }}>
            <span
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: brand.textPrimary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {student.portalName || UI.learningPartner}
            </span>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              <Statistic
                title={<span style={{ fontSize: 10, textTransform: 'uppercase', color: brand.textMuted }}>Present</span>}
                value={student.portalPresent ?? '—'}
                valueStyle={{ fontSize: 16, fontWeight: 600, color: brand.success }}
              />
              <Statistic
                title={<span style={{ fontSize: 10, textTransform: 'uppercase', color: brand.textMuted }}>Absent</span>}
                value={student.portalAbsent ?? '—'}
                valueStyle={{ fontSize: 16, fontWeight: 600, color: brand.error }}
              />
            </div>
          </div>
        </Space>
      </div>

      <div style={labelStyle}>Modules</div>

      <div style={scrollStyle} className="portal-hub-sync-detail-scroll">
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {moduleSummaries.map((mod) => {
            const isSelected = mod.moduleIndex === activeModuleIndex
            return (
              <Card
                key={mod.moduleIndex}
                size="small"
                hoverable
                className={isSelected ? 'portal-hub-sync-module-card is-selected' : 'portal-hub-sync-module-card'}
                styles={{ body: { padding: '7px 10px' } }}
                style={{
                  borderRadius: 8,
                  background: isSelected ? brand.navy50 : brand.surfaceAlt,
                  borderColor: isSelected ? brand.navy800 : brand.navy200,
                  borderWidth: isSelected ? 1.5 : 0.5,
                }}
                onClick={() => onSelectModule(mod.moduleIndex)}
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  {mod.code ? (
                    <Tag
                      bordered={false}
                      style={{
                        margin: 0,
                        fontSize: 10,
                        borderRadius: 4,
                        background: isSelected ? brand.navy50 : brand.surfaceAlt,
                        color: isSelected ? brand.navy800 : brand.textMuted,
                        border: `0.5px solid ${isSelected ? brand.navy200 : brand.border}`,
                      }}
                    >
                      {mod.code}
                    </Tag>
                  ) : null}
                  <span style={{ fontSize: 12, color: brand.textPrimary, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mod.subject}
                  </span>
                  <Progress
                    percent={mod.percent ?? 0}
                    size="small"
                    showInfo={false}
                    strokeColor={percentStrokeColor(mod.percent)}
                    trailColor={brand.navy200}
                  />
                </Space>
              </Card>
            )
          })}
        </Space>
      </div>
    </div>
  )
}

export default function PortalHubSyncModal({
  open,
  onClose,
  classes = [],
  attendance = {},
  applyPortalHubMonitoringSync,
  busy = false,
}) {
  const notifier = useAppNotifier()
  const [bridgeReady, setBridgeReady] = useState(null)
  const [pulling, setPulling] = useState(false)
  const [pullStatus, setPullStatus] = useState('')
  const [pullError, setPullError] = useState('')
  const [reviewDraft, setReviewDraft] = useState(null)
  const [classIndex, setClassIndex] = useState(0)
  const [moduleIndex, setModuleIndex] = useState(0)
  const [openClassKeys, setOpenClassKeys] = useState(['class-0'])
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [cacheLoading, setCacheLoading] = useState(false)
  const cacheNotifiedRef = useRef(false)

  const sections = reviewDraft?.sections ?? []
  const safeClassIndex =
    sections.length > 0 ? Math.min(classIndex, sections.length - 1) : 0
  const currentSection = sections.length > 0 ? sections[safeClassIndex] : null
  const modules = currentSection?.modules ?? []
  const safeModuleIndex = modules.length > 0 ? Math.min(moduleIndex, modules.length - 1) : 0
  const currentModule = modules.length > 0 ? modules[safeModuleIndex] : null

  const selectedStudent = useMemo(() => {
    if (!selectedStudentId || !currentSection || !currentModule) return null
    return getModuleViewRows(currentSection, currentModule).find(
      (row) => row.portalStudentId === selectedStudentId,
    )
  }, [currentModule, currentSection, selectedStudentId])

  const moduleSummaries = useMemo(() => {
    if (!selectedStudentId || !currentSection) return []
    return getStudentModuleSummaries(currentSection, selectedStudentId)
  }, [currentSection, selectedStudentId])

  useEffect(() => {
    if (!open) return
    setPullError('')
    setConfirmError('')
    fetchPortalBridgeStatus()
      .then((status) => setBridgeReady(status))
      .catch(() => setBridgeReady({ configured: false, loggedIn: false }))
  }, [open])

  useEffect(() => {
    if (!open) {
      setClassIndex(0)
      setModuleIndex(0)
      setOpenClassKeys(['class-0'])
      setSelectedStudentId(null)
      setPulling(false)
      setPullStatus('')
      cacheNotifiedRef.current = false
      return
    }

    let cancelled = false
    setCacheLoading(true)
    loadPortalMonitoringSnapshot()
      .then((cached) => {
        if (cancelled || !cached?.snapshot) return
        const draft = buildPortalHubSyncReviewDraft(cached.snapshot, { classes, attendance })
        setReviewDraft(draft)
        if (!cacheNotifiedRef.current) {
          cacheNotifiedRef.current = true
          notifier.info({
            key: NOTIFIER_KEYS.portalSync,
            title: UI.portalMonitoringCacheHint,
            description: `Loaded from your last pull (${formatPortalCacheAge(cached.savedAt)}). Use "${UI.portalMonitoringRefresh}" for live portal data.`,
            duration: 5,
          })
        }
      })
      .finally(() => {
        if (!cancelled) setCacheLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, classes, attendance, notifier])

  useEffect(() => {
    setModuleIndex(0)
    setSelectedStudentId(null)
    setOpenClassKeys([`class-${classIndex}`])
  }, [classIndex])

  const totals = useMemo(
    () => (reviewDraft ? summarizePortalHubSyncDraft(reviewDraft) : null),
    [reviewDraft],
  )

  async function handlePull() {
    setPulling(true)
    setPullError('')
    setPullStatus('')
    setReviewDraft(null)
    setClassIndex(0)
    setModuleIndex(0)
    setOpenClassKeys(['class-0'])
    setSelectedStudentId(null)
    try {
      setPullStatus('Loading portal class list…')
      const portalClassIds = await fetchPortalClassIds()
      setPullStatus(
        `Pulling ${portalClassIds.length} class${portalClassIds.length === 1 ? '' : 'es'}…`,
      )
      const snapshot = await fetchPortalMonitoringSnapshot({ portalClassIds, concurrency: 6 })
      const draft = buildPortalHubSyncReviewDraft(snapshot, { classes, attendance })
      await savePortalMonitoringSnapshot(snapshot)
      setReviewDraft(draft)
      setPullStatus('')
      notifier.success({
        key: NOTIFIER_KEYS.portalClassSync,
        title: UI.portalMonitoringPulled,
        description: `${draft.stats?.classCount ?? 0} classes · ${draft.stats?.gridsLoaded ?? 0} grids loaded.`,
      })
    } catch (error) {
      setPullError(error?.message || 'Portal pull failed.')
      setPullStatus('')
    } finally {
      setPulling(false)
    }
  }

  function updateModule(sectionRowKey, moduleRowKey, updater) {
    setReviewDraft((current) => ({
      ...current,
      sections: (current?.sections ?? []).map((section) => {
        if (section.rowKey !== sectionRowKey) return section
        return {
          ...section,
          modules: (section.modules ?? []).map((mod) => {
            if (mod.rowKey !== moduleRowKey) return mod
            const next = updater(mod)
            const stats = {
              selected: (next.items ?? []).filter((item) => item.selected).length,
              sessionChanges: (next.items ?? []).reduce(
                (sum, item) => sum + (item.selected ? item.sessionChanges?.length ?? 0 : 0),
                0,
              ),
              toggleable: (next.items ?? []).filter((item) => item.canToggle).length,
              students: next.items?.length ?? 0,
            }
            return { ...next, ...stats }
          }),
        }
      }),
    }))
  }

  async function handleConfirm() {
    if (!reviewDraft) return
    setConfirmBusy(true)
    setConfirmError('')
    try {
      const payload = buildPortalHubSyncApplyPayload(reviewDraft)
      const result = await applyPortalHubMonitoringSync(payload)
      notifier.success({
        key: NOTIFIER_KEYS.portalClassSync,
        title: UI.portalMonitoringSaved,
        description: [
          result.classesCreated ? `${result.classesCreated} classes created` : null,
          result.studentsAdded ? `${result.studentsAdded} LPs added` : null,
          result.sessionsImported ? `${result.sessionsImported} sessions imported` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Hub is up to date with portal.',
      })
      onClose()
    } catch (error) {
      setConfirmError(error?.message || 'Sync failed.')
    } finally {
      setConfirmBusy(false)
    }
  }

  function handleToggleClass(classIdx) {
    const classKey = `class-${classIdx}`
    setOpenClassKeys((current) =>
      current.includes(classKey)
        ? current.filter((key) => key !== classKey)
        : [...current, classKey],
    )
    if (classIdx !== classIndex) {
      setClassIndex(classIdx)
      setModuleIndex(0)
    }
  }

  function handleSelectModule(classIdx, modIdx) {
    const classKey = `class-${classIdx}`
    setOpenClassKeys((current) => (current.includes(classKey) ? current : [...current, classKey]))
    setClassIndex(classIdx)
    setModuleIndex(modIdx)
    setSelectedStudentId(null)
  }

  const overviewLine = totals
    ? [
        `${totals.classes} classes`,
        `${totals.modules} modules`,
        `${totals.gridsLoaded} grids`,
        totals.selected > 0
          ? `${totals.selected} selected · ${totals.sessionChanges} session changes`
          : 'nothing to apply',
      ].join(' · ')
    : ''

  const titleSubtitle = reviewDraft
    ? overviewLine
    : UI.portalMonitoringDescription

  const shellStyle = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: brand.surface,
    fontFamily: 'Inter, -apple-system, sans-serif',
  }

  const titleBarStyle = {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 16px',
    borderBottom: `1px solid ${brand.navy700}`,
    background: brand.navy900,
  }

  const panelsRowStyle = {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  }

  const footerStyle = {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '8px 12px',
    borderTop: `1px solid ${brand.border}`,
    background: brand.surfaceAlt,
  }

  const canClose = !busy && !confirmBusy && !pulling

  const pullButtonLabel = pulling
    ? 'Pulling…'
    : reviewDraft && !pulling
      ? 'Refresh From Portal'
      : 'Pull From Portal'

  return (
    <ConfigProvider theme={portalHubSyncBrandTheme}>
      <Modal
        open={open}
        footer={null}
        closable={false}
        title={null}
        width={PORTAL_HUB_SYNC_MODAL_WIDTH}
        centered
        zIndex={MODAL_Z_INDEX}
        destroyOnClose
        wrapClassName="portal-hub-sync-modal-wrap"
        className="portal-hub-sync-modal"
        styles={portalHubSyncModalStyles}
        onCancel={canClose ? onClose : undefined}
      >
        <div className="portal-hub-sync-shell" style={shellStyle}>
          <div className="portal-hub-sync-title-bar" style={titleBarStyle}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: brand.textOnNavy }}>
                {UI.portalMonitoringTitle}
              </span>
              <span
                title={titleSubtitle}
                style={{
                  display: 'block',
                  fontSize: 12,
                  marginTop: 2,
                  color: brand.textOnNavyMuted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {titleSubtitle}
              </span>
            </div>
            <Space size={8} style={{ flexShrink: 0 }}>
              <Button
                type="primary"
                size="small"
                icon={<CloudDownloadOutlined />}
                loading={pulling}
                disabled={!bridgeReady?.configured || pulling || confirmBusy || cacheLoading}
                onClick={handlePull}
                style={{
                  background: brand.navy800,
                  borderColor: brand.navy800,
                  color: brand.textOnNavy,
                }}
              >
                {pullButtonLabel}
              </Button>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                disabled={!canClose}
                onClick={onClose}
                aria-label="Close"
                style={{ color: brand.textOnNavyMuted }}
              />
            </Space>
          </div>

        {bridgeReady && !bridgeReady.configured ? (
          <Alert
            type="warning"
            showIcon
            banner
            message="Portal credentials not configured"
            description="Add PORTAL_BASE_URL, PORTAL_USERNAME, and PORTAL_PASSWORD to Student/.env, then restart npm run dev."
            style={{ flexShrink: 0 }}
          />
        ) : null}

        {pulling && pullStatus ? (
          <span style={{ flexShrink: 0, fontSize: 12, padding: '4px 16px', color: brand.textMuted }}>
            {pullStatus}
          </span>
        ) : null}

        {pullError ? (
          <span style={{ flexShrink: 0, fontSize: 12, padding: '4px 16px', color: brand.error }}>
            {pullError}
          </span>
        ) : null}

        <div style={panelsRowStyle}>
          <PortalHubClassSidebar
            sections={sections}
            classIndex={safeClassIndex}
            moduleIndex={safeModuleIndex}
            openClassKeys={openClassKeys}
            onToggleClass={handleToggleClass}
            onSelectModule={handleSelectModule}
          />
          <PortalHubRosterPanel
            reviewDraft={reviewDraft}
            pulling={pulling}
            classIndex={classIndex}
            moduleIndex={moduleIndex}
            selectedStudentId={selectedStudentId}
            onSelectStudent={setSelectedStudentId}
            onToggleItem={(sectionRowKey, moduleRowKey, itemId, selected) => {
              updateModule(sectionRowKey, moduleRowKey, (mod) => ({
                ...mod,
                items: mod.items.map((item) => (item.id === itemId ? { ...item, selected } : item)),
              }))
            }}
            onToggleAll={(sectionRowKey, moduleRowKey, selected) => {
              updateModule(sectionRowKey, moduleRowKey, (mod) => ({
                ...mod,
                items: mod.items.map((item) => (item.canToggle ? { ...item, selected } : item)),
              }))
            }}
          />
          {selectedStudent ? (
            <PortalHubStudentPanel
              student={selectedStudent}
              moduleSummaries={moduleSummaries}
              activeModuleIndex={safeModuleIndex}
              onClose={() => setSelectedStudentId(null)}
              onSelectModule={setModuleIndex}
            />
          ) : null}
        </div>

        <div style={footerStyle}>
          {confirmError ? (
            <span style={{ flex: 1, fontSize: 12, color: brand.error }}>{confirmError}</span>
          ) : (
            <span style={{ flex: 1 }} />
          )}
          <Space size={8}>
            <Button size="small" disabled={!canClose} onClick={onClose}>
              Close
            </Button>
            <Button
              size="small"
              type="primary"
              disabled={!reviewDraft || pulling || !totals?.selected}
              loading={confirmBusy}
              onClick={handleConfirm}
              style={{ background: brand.navy800, borderColor: brand.navy800 }}
            >
              {confirmBusy ? 'Saving…' : 'Confirm Sync'}
            </Button>
          </Space>
        </div>
      </div>
    </Modal>
    </ConfigProvider>
  )
}
