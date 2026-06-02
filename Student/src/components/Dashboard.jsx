import { Empty, Input, Popover, Select, Table, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import { getAtRiskStudentSummaries } from '../utils/attendanceStats'
import { RISK_META } from '../utils/absenceRisk'
import { formatModuleLabel, listModulesAcrossClasses } from '../utils/sessionKeys'
import { studentReportKey } from '../utils/reportingQueue'
import { DashboardRiskSummary } from './AbsenceCountBadge'
import { UI } from '../utils/uiCopy'
import FormField from './FormField'
import ModuleSearchSelect from './ModuleSearchSelect'
import SearchableSelect from './SearchableSelect'

function sortStudentRows(rows, sortBy) {
  const copy = [...rows]
  if (sortBy === 'name') {
    return copy.sort(
      (a, b) =>
        a.studentName.localeCompare(b.studentName) || a.className.localeCompare(b.className),
    )
  }
  if (sortBy === 'class') {
    return copy.sort(
      (a, b) =>
        a.className.localeCompare(b.className) || a.studentName.localeCompare(b.studentName),
    )
  }
  return copy
}

const SORT_OPTIONS = [
  { value: 'risk', label: 'Risk (highest first)' },
  { value: 'name', label: 'Student name' },
  { value: 'class', label: 'Class' },
]

export default function Dashboard({
  classes,
  attendance,
  dashboardPendingKeys = [],
  reportingQueuedKeys = [],
  onOpenInClasses,
  onOpenReporting,
}) {
  const [selectedModule, setSelectedModule] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [sortBy, setSortBy] = useState('risk')
  const [searchQuery, setSearchQuery] = useState('')

  const dashboardPendingKeySet = useMemo(
    () => new Set(dashboardPendingKeys),
    [dashboardPendingKeys],
  )

  const reportingQueuedKeySet = useMemo(
    () => new Set(reportingQueuedKeys),
    [reportingQueuedKeys],
  )

  const allModules = useMemo(
    () => listModulesAcrossClasses(classes, attendance),
    [classes, attendance],
  )
  const moduleOptions = useMemo(
    () =>
      allModules
        .filter(
          ({ value }) =>
            getAtRiskStudentSummaries(classes, attendance, { moduleFilter: value }).length > 0,
        )
        .map(({ value, label }) => ({ value, label })),
    [classes, attendance, allModules],
  )

  useEffect(() => {
    if (selectedModule && !moduleOptions.some((option) => option.value === selectedModule)) {
      setSelectedModule('')
    }
  }, [selectedModule, moduleOptions])

  const moduleScopedAtRisk = useMemo(() => {
    const rows = getAtRiskStudentSummaries(classes, attendance, {
      moduleFilter: selectedModule,
    })
    return rows
      .filter(
        (row) => !reportingQueuedKeySet.has(studentReportKey(row.classId, row.studentId)),
      )
      .map((row) => ({
        ...row,
        needsReport: dashboardPendingKeySet.has(studentReportKey(row.classId, row.studentId)),
      }))
  }, [classes, attendance, selectedModule, dashboardPendingKeySet, reportingQueuedKeySet])

  const classOptions = useMemo(() => {
    const seen = new Map()
    for (const row of moduleScopedAtRisk) {
      if (!seen.has(row.classId)) {
        seen.set(row.classId, { value: row.classId, label: row.className })
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [moduleScopedAtRisk])

  useEffect(() => {
    if (selectedClassId && !classOptions.some((option) => option.value === selectedClassId)) {
      setSelectedClassId('')
    }
  }, [selectedClassId, classOptions])

  const atRiskRows = useMemo(() => {
    if (!selectedClassId) return moduleScopedAtRisk
    return moduleScopedAtRisk.filter((row) => row.classId === selectedClassId)
  }, [moduleScopedAtRisk, selectedClassId])

  const activeRiskTiers = useMemo(() => {
    const tiers = { watch: false, warning: false, critical: false }
    for (const row of moduleScopedAtRisk) {
      if (row.risk in tiers) tiers[row.risk] = true
    }
    return tiers
  }, [moduleScopedAtRisk])

  const pendingReportCount = useMemo(
    () => moduleScopedAtRisk.filter((row) => row.needsReport).length,
    [moduleScopedAtRisk],
  )

  const sortedStudents = useMemo(
    () => sortStudentRows(atRiskRows, sortBy),
    [atRiskRows, sortBy],
  )

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sortedStudents
    return sortedStudents.filter(
      (row) =>
        row.studentName.toLowerCase().includes(q) ||
        row.className.toLowerCase().includes(q) ||
        row.absentModules?.some((m) => m.toLowerCase().includes(q)),
    )
  }, [sortedStudents, searchQuery])

  const [tableRegionRef, tableHeight] = useScrollRegionHeight(280)

  const tableColumns = useMemo(() => {
    const columns = [
      {
        title: 'Student',
        dataIndex: 'studentName',
        key: 'studentName',
        ellipsis: true,
        render: (_, row) => {
          if (!row.needsReport) return row.studentName

          const reportKey = studentReportKey(row.classId, row.studentId)
          return (
            <Popover
              title={UI.officialReportingRequired}
              content="This student must be reported on the official form. Click to open the Reporting tab."
            >
              <Typography.Link
                type="danger"
                strong
                className="dashboard-student-report-link"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenReporting?.(reportKey)
                }}
              >
                {row.studentName}
              </Typography.Link>
            </Popover>
          )
        },
      },
    ]

    if (!selectedClassId) {
      columns.push({
        title: 'Class',
        dataIndex: 'className',
        key: 'className',
        ellipsis: true,
      })
    }

    columns.push({
      title: 'Level',
      key: 'risk',
      width: 92,
      render: (_, row) => (
        <Tag
          variant="filled"
          className={`absence-risk-tag absence-risk-tag-${row.risk}`}
          title={RISK_META[row.risk]?.description}
        >
          {RISK_META[row.risk]?.shortLabel ?? row.risk}
        </Tag>
      ),
    })

    columns.push({
      title: 'Days',
      key: 'consecutive',
      width: 72,
      align: 'center',
      render: (_, row) => {
        const dayClass = row.needsReport
          ? 'dashboard-student-days-report'
          : row.risk === 'critical'
            ? 'dashboard-student-days-critical'
            : row.risk === 'warning'
              ? 'dashboard-student-days-warning'
              : row.risk === 'watch'
                ? 'dashboard-student-days-watch'
                : ''

        return (
          <span className={`dashboard-student-days ${dayClass}`.trim()}>
            {row.consecutive}
          </span>
        )
      },
    })

    columns.push({
      title: 'Total',
      key: 'total',
      width: 64,
      align: 'center',
      render: (_, row) => (
        <Typography.Text strong className="dashboard-student-total">
          {row.total}
        </Typography.Text>
      ),
    })

    if (pendingReportCount > 0) {
      columns.push({
        title: 'Report',
        key: 'report',
        width: 118,
        render: (_, row) =>
          row.needsReport ? (
            <Tag variant="filled" className="dashboard-student-report-tag">
              {UI.reportRequired}
            </Tag>
          ) : null,
      })
    }

    return columns
  }, [selectedClassId, onOpenReporting, pendingReportCount])

  function openInClasses(classId, module = '') {
    onOpenInClasses?.({ classId, module })
  }

  function openFromRow(row) {
    if (row.needsReport) {
      onOpenReporting?.(studentReportKey(row.classId, row.studentId))
      return
    }

    const module =
      selectedModule ||
      (row.absentModules?.[0]
        ? listModulesAcrossClasses(classes, attendance).find((m) =>
            m.label === row.absentModules[0],
          )?.value
        : '') ||
      ''
    openInClasses(row.classId, module)
  }

  return (
    <section className="panel dashboard-panel workspace-panel">
      <header className="panel-header dashboard-header-compact">
        <div className="panel-header-copy">
          <Typography.Title level={4} style={{ margin: 0 }}>
            Dashboard
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="panel-desc-compact" style={{ marginBottom: 0 }}>
            Warnings and students who need follow-up. Safe counts are hidden — manage rosters on
            Classes &amp; rosters.
          </Typography.Paragraph>
        </div>
        <DashboardRiskSummary
          activeTiers={activeRiskTiers}
          showReportRequired={pendingReportCount > 0}
        />
      </header>

      {classes.length === 0 ? (
        <Empty
          className="workspace-empty"
          description="Import attendance or add a class on Classes & rosters."
        />
      ) : (
        <div className="workspace-body dashboard-workspace dashboard-workspace-simple">
          <div className="dashboard-at-risk-panel">
            <div className="dashboard-at-risk-toolbar filter-toolbar dashboard-filter-toolbar">
              <ModuleSearchSelect
                options={moduleOptions}
                value={selectedModule}
                onChange={(value) => {
                  setSelectedModule(value)
                  setSelectedClassId('')
                }}
                allowEmpty
                emptyLabel="All modules"
                placeholder={
                  moduleOptions.length ? 'Filter by module…' : 'No at-risk students by module'
                }
                label="Module"
                disabled={moduleOptions.length === 0}
              />
              <SearchableSelect
                options={classOptions}
                value={selectedClassId}
                onChange={setSelectedClassId}
                allowEmpty
                emptyLabel="All classes"
                placeholder={
                  classOptions.length ? 'Filter by class…' : 'No at-risk students in any class'
                }
                label="Class"
                disabled={classOptions.length === 0}
              />
              <FormField label="Sort">
                <Select
                  value={sortBy}
                  onChange={setSortBy}
                  options={SORT_OPTIONS}
                  style={{ width: '100%' }}
                />
              </FormField>
              <FormField label="Search" grow>
                <Input
                  allowClear
                  placeholder="Name, class, module…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </FormField>
            </div>

            <Typography.Text type="secondary" className="master-pane-hint">
              {filteredStudents.length} student{filteredStudents.length === 1 ? '' : 's'} · click a
              row to open · red names move to the Reporting tab
              {selectedModule ? ` · ${formatModuleLabel(selectedModule)}` : ''}
              {selectedClassId
                ? ` · ${classOptions.find((option) => option.value === selectedClassId)?.label ?? ''}`
                : ''}
            </Typography.Text>

            <div className="table-scroll-region dashboard-at-risk-scroll" ref={tableRegionRef}>
              {filteredStudents.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    atRiskRows.length === 0
                      ? 'No students need follow-up right now.'
                      : 'No matches for this search.'
                  }
                />
              ) : (
                <Table
                  size="small"
                  rowKey="id"
                  columns={tableColumns}
                  dataSource={filteredStudents}
                  pagination={{ pageSize: 40, showSizeChanger: false, hideOnSinglePage: true }}
                  scroll={{ y: tableHeight }}
                  rowClassName={(row) =>
                    [
                      'dashboard-student-item',
                      `dashboard-student-item-${row.risk}`,
                      row.needsReport ? 'dashboard-student-item-report' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                  }
                  onRow={(row) => ({
                    onClick: () => openFromRow(row),
                    style: { cursor: 'pointer' },
                  })}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
