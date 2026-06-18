import { PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Row,
  Col,
  Segmented,
  Space,
  Table,
  Typography,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useAutoDismiss } from '../hooks/useAutoDismiss'
import { useReportTabActivity } from '../hooks/useReportTabActivity'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import { formatClassLabel } from '../utils/classFormat'
import { formatModuleLabel, listModulesAcrossClasses } from '../utils/sessionKeys'
import AbsenceBulkEditor from './AbsenceBulkEditor'
import ClassStudentPanel from './ClassStudentPanel'
import ConfirmDialog from './ConfirmDialog'
import ModuleSearchSelect from './ModuleSearchSelect'
import SearchableSelect from './SearchableSelect'
import FormField from './FormField'
import PanelChrome from './PanelChrome'
import WorkspaceSectionTitle from './WorkspaceSectionTitle'
import { UI, formatLpCount } from '../utils/uiCopy'
import SaveFieldOverlay from './SaveFieldOverlay'

export default function ClassManager({
  classes,
  attendance,
  syncing = false,
  addClass,
  removeClass,
  deleteModuleSessions,
  addStudent,
  removeStudent,
  updateStudent,
  importStudentsBulk,
  bulkUpdateStudents,
  recordActivity,
  initialFocus = null,
  onFocusApplied,
  onTabActivityChange,
}) {
  const [browseMode, setBrowseMode] = useState('module')
  const [addClassOpen, setAddClassOpen] = useState(false)
  const [bulkEditorBusy, setBulkEditorBusy] = useState(false)
  const [bulkEditorDraftCount, setBulkEditorDraftCount] = useState(0)
  const [panelActivity, setPanelActivity] = useState({ processing: false, draft: false })
  const [selectedModule, setSelectedModule] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [bulkEditClassId, setBulkEditClassId] = useState('')
  const [bulkEditClassIds, setBulkEditClassIds] = useState(null)
  const [deleteTargetClassId, setDeleteTargetClassId] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [addConfirmOpen, setAddConfirmOpen] = useState(false)
  const [pendingClassFields, setPendingClassFields] = useState(null)
  const [addClassBusy, setAddClassBusy] = useState(false)
  const [addClassMessage, setAddClassMessage] = useState('')
  const [addClassError, setAddClassError] = useState('')
  const [form, setForm] = useState({
    intake: '',
    level: '',
    qualification: '',
    group: '',
  })

  useAutoDismiss(Boolean(addClassMessage) && !form.qualification.trim(), () => setAddClassMessage(''))

  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => formatClassLabel(a).localeCompare(formatClassLabel(b))),
    [classes],
  )

  const allModules = useMemo(
    () => listModulesAcrossClasses(classes, attendance),
    [classes, attendance],
  )

  const moduleOptions = useMemo(
    () => allModules.map(({ value, label }) => ({ value, label })),
    [allModules],
  )

  useEffect(() => {
    if (!initialFocus) return
    if (initialFocus.module) {
      setBrowseMode('module')
      setSelectedModule(initialFocus.module)
    } else {
      setBrowseMode('class')
    }
    if (initialFocus.classId) {
      setSelectedClassId(initialFocus.classId)
    }
    onFocusApplied?.()
  }, [initialFocus, onFocusApplied])

  useEffect(() => {
    if (browseMode !== 'module' || allModules.length === 0) return
    if (!selectedModule || !allModules.some((m) => m.value === selectedModule)) {
      setSelectedModule(allModules[0]?.value ?? '')
    }
  }, [browseMode, allModules, selectedModule])

  const classesForBrowse = useMemo(() => {
    if (browseMode !== 'module' || !selectedModule) return sortedClasses
    const match = allModules.find((m) => m.value === selectedModule)
    if (!match) return sortedClasses
    const idSet = new Set(match.classIds)
    return sortedClasses.filter((cls) => idSet.has(cls.id))
  }, [browseMode, selectedModule, sortedClasses, allModules])

  const classBrowseOptions = useMemo(
    () =>
      classesForBrowse.map((cls) => ({
        value: cls.id,
        label: formatClassLabel(cls),
      })),
    [classesForBrowse],
  )

  const moduleClassIds = useMemo(
    () => classesForBrowse.map((c) => c.id),
    [classesForBrowse],
  )

  const [masterTableRef, masterTableHeight] = useScrollRegionHeight(200)

  const classTableData = classesForBrowse.map((cls) => ({
    key: cls.id,
    id: cls.id,
    name: formatClassLabel(cls),
    count: cls.students?.length ?? 0,
  }))
  const selectedClass = classes.find((c) => c.id === selectedClassId)
  const deleteTargetClass = classes.find((c) => c.id === deleteTargetClassId)
  const addClassLocked = addClassBusy || syncing

  const addClassHasDraft =
    addClassOpen &&
    (form.intake !== '' ||
      form.level !== '' ||
      form.group !== '' ||
      Boolean(form.qualification.trim()))

  const classesTabActivity = useMemo(() => {
    if (
      syncing ||
      addClassBusy ||
      deleteBusy ||
      bulkEditorBusy ||
      panelActivity.processing
    ) {
      return 'processing'
    }
    if ((bulkEditMode && bulkEditorDraftCount > 0) || addClassHasDraft || panelActivity.draft) {
      return 'draft'
    }
    return null
  }, [
    syncing,
    addClassBusy,
    deleteBusy,
    bulkEditorBusy,
    panelActivity,
    bulkEditMode,
    bulkEditorDraftCount,
    addClassHasDraft,
  ])

  useReportTabActivity('classes', classesTabActivity, onTabActivityChange)

  useEffect(() => {
    if (selectedClassId && !classesForBrowse.some((cls) => cls.id === selectedClassId)) {
      setSelectedClassId('')
    }
  }, [classesForBrowse, selectedClassId])

  function handleBrowseModeChange(mode) {
    if (mode === browseMode) return
    setBrowseMode(mode)
    setSelectedClassId('')
  }

  async function handleAddClass(e) {
    e.preventDefault()
    if (!form.qualification.trim() || addClassLocked) return
    setPendingClassFields({
      intake: Number(form.intake) || null,
      level: Number(form.level) || null,
      qualification: form.qualification.trim(),
      group: Number(form.group) || null,
    })
    setAddConfirmOpen(true)
  }

  async function handleConfirmAddClass() {
    if (!pendingClassFields || addClassLocked) return
    setAddConfirmOpen(false)
    setAddClassBusy(true)
    setAddClassMessage('')
    setAddClassError('')
    try {
      const newId = await addClass(pendingClassFields)
      if (newId) {
        setSelectedClassId(newId)
        setBrowseMode('class')
      }
      setForm({ intake: '', level: '', qualification: '', group: '' })
      setAddClassMessage(`"${formatClassLabel(pendingClassFields)}" added successfully.`)
      setAddClassOpen(false)
    } catch (err) {
      setAddClassError(err.message || 'Failed to add class. Try again.')
    } finally {
      setAddClassBusy(false)
      setPendingClassFields(null)
    }
  }

  async function handleConfirmDeleteClass() {
    if (!deleteTargetClassId || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await removeClass(deleteTargetClassId)
      if (selectedClassId === deleteTargetClassId) {
        setSelectedClassId('')
      }
      setDeleteOpen(false)
      setDeleteTargetClassId('')
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete class. Try again.')
    } finally {
      setDeleteBusy(false)
    }
  }

  function openModuleBulkEdit() {
    if (moduleClassIds.length === 0) return
    setBulkEditClassIds(moduleClassIds)
    setBulkEditClassId(moduleClassIds[0])
    setBulkEditMode(true)
  }

  if (bulkEditMode) {
    return (
      <AbsenceBulkEditor
        classes={classes}
        attendance={attendance}
        initialClassId={bulkEditClassId || sortedClasses[0]?.id || ''}
        restrictToClassIds={bulkEditClassIds}
        bulkUpdateStudents={bulkUpdateStudents}
        recordActivity={recordActivity}
        onActivityChange={({ busy, draftCount }) => {
          setBulkEditorBusy(busy)
          setBulkEditorDraftCount(draftCount)
        }}
        onClose={() => {
          setBulkEditMode(false)
          setBulkEditClassId('')
          setBulkEditClassIds(null)
          setBulkEditorBusy(false)
          setBulkEditorDraftCount(0)
        }}
      />
    )
  }

  return (
    <section className="panel classes-panel workspace-panel">
      <PanelChrome
        className="classes-panel-header"
        title={UI.classesAndRosters}
        description="Browse by module to see every intake and group in a subject, or switch to all classes for per-class bulk edits."
        actions={
          <Button type="default" icon={<PlusOutlined />} onClick={() => setAddClassOpen(true)}>
            Add Class Manually
          </Button>
        }
      />

      <Modal
        title="Add Class Manually"
        open={addClassOpen}
        onCancel={() => {
          if (addClassBusy) return
          setAddClassOpen(false)
        }}
        footer={null}
        destroyOnHidden
        width={520}
      >
        <SaveFieldOverlay busy={addClassBusy} label="Adding class…">
          <form className="add-class-form-modal" onSubmit={handleAddClass}>
            <Row gutter={[12, 12]}>
              <Col span={8}>
                <Typography.Text className="field-label">Intake</Typography.Text>
                <InputNumber
                  value={form.intake === '' ? null : Number(form.intake)}
                  onChange={(value) => setForm((f) => ({ ...f, intake: value ?? '' }))}
                  style={{ width: '100%' }}
                />
              </Col>
              <Col span={8}>
                <Typography.Text className="field-label">Level</Typography.Text>
                <InputNumber
                  value={form.level === '' ? null : Number(form.level)}
                  onChange={(value) => setForm((f) => ({ ...f, level: value ?? '' }))}
                  style={{ width: '100%' }}
                />
              </Col>
              <Col span={8}>
                <Typography.Text className="field-label">Group</Typography.Text>
                <InputNumber
                  value={form.group === '' ? null : Number(form.group)}
                  onChange={(value) => setForm((f) => ({ ...f, group: value ?? '' }))}
                  style={{ width: '100%' }}
                />
              </Col>
              <Col span={24}>
                <Typography.Text className="field-label">Qualification / Programme</Typography.Text>
                <Input
                  placeholder="HND IN COMPUTING"
                  value={form.qualification}
                  onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))}
                  required
                />
              </Col>
            </Row>
            <Space style={{ marginTop: '1rem' }}>
              <Button type="primary" htmlType="submit" disabled={addClassLocked} loading={addClassBusy}>
                Add Class
              </Button>
              <Button disabled={addClassBusy} onClick={() => setAddClassOpen(false)}>
                Cancel
              </Button>
            </Space>
            {addClassMessage && (
              <Typography.Paragraph type="success" role="status" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                {addClassMessage}
              </Typography.Paragraph>
            )}
            {addClassError && (
              <Typography.Paragraph type="danger" role="alert" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                {addClassError}
              </Typography.Paragraph>
            )}
          </form>
        </SaveFieldOverlay>
      </Modal>

      <div className="workspace-body classes-workspace">
        <div className="master-detail-workspace">
          <aside className="master-pane" aria-label="Class list">
            <div className="master-pane-toolbar filter-toolbar">
              <Segmented
                block
                className="master-mode-segmented"
                options={[
                  { label: 'By Module', value: 'module' },
                  { label: 'By Class', value: 'class' },
                ]}
                value={browseMode}
                onChange={handleBrowseModeChange}
              />

              {browseMode === 'module' && (
                <ModuleSearchSelect
                  options={moduleOptions}
                  value={selectedModule}
                  onChange={setSelectedModule}
                  placeholder={
                    moduleOptions.length ? 'Search module or subject…' : 'No modules recorded yet'
                  }
                  label="Module / Subject"
                  disabled={moduleOptions.length === 0}
                />
              )}

              <SearchableSelect
                options={classBrowseOptions}
                value={selectedClassId}
                onChange={setSelectedClassId}
                allowEmpty
                emptyLabel="All Classes"
                placeholder={
                  classBrowseOptions.length ? 'Search class…' : 'No classes recorded yet'
                }
                label="Search Classes"
                disabled={classBrowseOptions.length === 0}
              />

              {browseMode === 'module' && moduleClassIds.length > 1 && (
                <Button block onClick={openModuleBulkEdit}>
                  Bulk Edit All {moduleClassIds.length} Classes in Module
                </Button>
              )}
            </div>

            <Typography.Text type="secondary" className="master-pane-hint">
              {classesForBrowse.length} class{classesForBrowse.length === 1 ? '' : 'es'}
              {browseMode === 'module' && selectedModule
                ? ` · ${formatModuleLabel(selectedModule)}`
                : ''}
            </Typography.Text>

            {classes.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No classes yet. Import attendance or add one above." />
            ) : browseMode === 'module' && allModules.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No modules yet — import attendance with a module name, or use By Class."
              />
            ) : classesForBrowse.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No classes in this module." />
            ) : (
              <div className="table-scroll-region master-list-scroll" ref={masterTableRef}>
                <Table
                  size="small"
                  showHeader={false}
                  pagination={{ pageSize: 30, showSizeChanger: false, hideOnSinglePage: true }}
                  scroll={{ y: masterTableHeight }}
                  dataSource={classTableData}
                  columns={[
                    {
                      key: 'name',
                      render: (_, row) => (
                        <div>
                          <Typography.Text strong>{row.name}</Typography.Text>
                          <div>
                            <Typography.Text type="secondary" style={{ fontSize: '0.78rem' }}>
                              {formatLpCount(row.count)}
                            </Typography.Text>
                          </div>
                        </div>
                      ),
                    },
                  ]}
                  rowClassName={(row) =>
                    `master-list-item-ant ${selectedClassId === row.id ? 'is-selected' : ''}`
                  }
                  onRow={(row) => ({
                    onClick: () => setSelectedClassId(row.id),
                    style: { cursor: 'pointer' },
                  })}
                />
              </div>
            )}
          </aside>

          <div className="detail-pane" aria-label="Class roster">
            {selectedClass ? (
              <>
                <div className="detail-pane-header">
                  <WorkspaceSectionTitle>{formatClassLabel(selectedClass)}</WorkspaceSectionTitle>
                </div>
                <div className="detail-pane-body">
                  <ClassStudentPanel
                    cls={selectedClass}
                    attendance={attendance?.[selectedClass.id] || {}}
                    moduleFilter={browseMode === 'module' ? selectedModule : ''}
                    onModuleFilter={() => {}}
                    lockModuleFilter={browseMode === 'module' && Boolean(selectedModule)}
                    syncing={syncing}
                    onBulkEdit={() => {
                      setBulkEditClassId(selectedClass.id)
                      setBulkEditClassIds(null)
                      setBulkEditMode(true)
                    }}
                    onDeleteRequest={() => {
                      setDeleteTargetClassId(selectedClass.id)
                      setDeleteError('')
                      setDeleteOpen(true)
                    }}
                    deleteModuleSessions={deleteModuleSessions}
                    addStudent={addStudent}
                    removeStudent={removeStudent}
                    updateStudent={updateStudent}
                    importStudentsBulk={importStudentsBulk}
                    onActivityChange={setPanelActivity}
                  />
                </div>
              </>
            ) : (
              <div className="detail-pane-empty">
                <Empty
                  description={`Select a class on the left to manage ${UI.learningPartners}, absence overrides, and bulk edits.`}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Class?"
        confirmLabel="Delete Class"
        cancelLabel="Keep Class"
        danger
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => {
          if (deleteBusy) return
          setDeleteOpen(false)
          setDeleteTargetClassId('')
          setDeleteError('')
        }}
        onConfirm={handleConfirmDeleteClass}
      >
        {deleteTargetClass ? (
          <p className="modal-lead">
            Delete <strong>{formatClassLabel(deleteTargetClass)}</strong> and all of its attendance
            records? This cannot be undone.
          </p>
        ) : (
          <p className="modal-lead">
            Delete this class and all of its attendance records? This cannot be undone.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={addConfirmOpen}
        title="Add This Class?"
        confirmLabel="Add Class"
        cancelLabel="Cancel"
        busy={addClassBusy}
        onCancel={() => {
          if (addClassBusy) return
          setAddConfirmOpen(false)
          setPendingClassFields(null)
        }}
        onConfirm={handleConfirmAddClass}
      >
        {pendingClassFields && (
          <p className="modal-lead">
            Create class <strong>{formatClassLabel(pendingClassFields)}</strong>? You can add
            {UI.learningPartners} after it is created.
          </p>
        )}
      </ConfirmDialog>
    </section>
  )
}
