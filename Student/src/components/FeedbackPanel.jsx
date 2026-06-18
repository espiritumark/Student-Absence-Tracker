import { DownloadOutlined, EditOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Table, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useAppNotifier } from '../hooks/useAppNotifier'
import {
  ANT_TABLE_HEADER_OFFSET,
  ANT_TABLE_PAGINATION_OFFSET,
  useScrollRegionHeight,
} from '../hooks/useScrollRegionHeight'
import { formatClassLabel } from '../utils/classFormat'
import { formatDbError, isFeedbackColumnMissingError, isFeedbackNotesColumnMissingError } from '../lib/database'
import { downloadCsv, slugifyFilenamePart } from '../utils/csvExport'
import {
  countFeedbackWords,
  FEEDBACK_WORD_MAX,
  FEEDBACK_WORD_MIN,
  truncateFeedbackPreview,
} from '../utils/feedbackWords'
import { filterByNameSearch } from '../utils/tableNameSearch'
import { formatPersonName } from '../utils/nameMatching'
import { UI } from '../utils/uiCopy'
import CopyIconButton from './CopyIconButton'
import FeedbackStudentModal from './FeedbackStudentModal'
import PanelChrome from './PanelChrome'
import SearchableSelect from './SearchableSelect'
import TableNameSearch from './TableNameSearch'

export default function FeedbackPanel({
  classes = [],
  attendance = {},
  updateStudent,
  useCloud = false,
  syncError = '',
}) {
  const notify = useAppNotifier()
  const [classId, setClassId] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [modalPartnerId, setModalPartnerId] = useState(null)
  const [saving, setSaving] = useState(false)

  const classOptions = useMemo(
    () =>
      [...classes]
        .sort((a, b) => formatClassLabel(a).localeCompare(formatClassLabel(b)))
        .map((cls) => ({ value: cls.id, label: formatClassLabel(cls) })),
    [classes],
  )

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId],
  )

  const classAttendance = attendance[classId] || {}

  const rosterRows = useMemo(() => {
    if (!selectedClass) return []
    return [...(selectedClass.students ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((student) => {
        const feedback = String(student.feedback ?? '').trim()
        return {
          key: student.id,
          id: student.id,
          name: student.name,
          displayName: formatPersonName(student.name),
          student,
          feedback,
          wordCount: countFeedbackWords(feedback),
          preview: truncateFeedbackPreview(feedback),
        }
      })
  }, [selectedClass])

  const filteredRows = useMemo(
    () => filterByNameSearch(rosterRows, nameSearch, (row) => row.name),
    [rosterRows, nameSearch],
  )

  const modalPartner = useMemo(
    () => selectedClass?.students?.find((s) => s.id === modalPartnerId) ?? null,
    [selectedClass, modalPartnerId],
  )

  const withFeedbackCount = rosterRows.filter((row) => row.feedback).length
  const needsFeedbackMigration = useCloud && isFeedbackColumnMissingError(syncError)
  const needsNotesMigration = useCloud && isFeedbackNotesColumnMissingError(syncError)
  const needsCloudMigration = needsFeedbackMigration || needsNotesMigration

  useEffect(() => {
    if (classId && !classOptions.some((o) => o.value === classId)) {
      setClassId('')
      setModalPartnerId(null)
    }
  }, [classId, classOptions])

  useEffect(() => {
    if (modalPartnerId && !rosterRows.some((row) => row.id === modalPartnerId)) {
      setModalPartnerId(null)
    }
  }, [modalPartnerId, rosterRows])

  useEffect(() => {
    setNameSearch('')
  }, [classId])

  const showTablePagination = filteredRows.length > 40
  const tableChromeOffset =
    ANT_TABLE_HEADER_OFFSET + (showTablePagination ? ANT_TABLE_PAGINATION_OFFSET : 0)
  const tableRemeasureKey = `${selectedClass?.id ?? ''}:${filteredRows.length}:${showTablePagination ? 1 : 0}`
  const [tableRef, tableHeight] = useScrollRegionHeight(320, tableChromeOffset, tableRemeasureKey)

  function handleExportCsv() {
    if (!selectedClass || filteredRows.length === 0) return

    downloadCsv(
      `feedback-${slugifyFilenamePart(formatClassLabel(selectedClass)) || 'class'}.csv`,
      [UI.learningPartnerName, 'Feedback', 'Words', UI.feedbackExtraNotes],
      filteredRows.map((row) => [
        row.displayName,
        row.feedback,
        row.feedback ? String(row.wordCount) : '',
        String(row.student.feedbackNotes ?? '').trim(),
      ]),
    )
    notify.success({ title: 'CSV exported.' })
  }

  async function handleSaveStudentFields(targetClassId, studentId, patch) {
    if (!updateStudent) {
      notify.error({ title: 'Saving is not available.' })
      return
    }
    setSaving(true)
    try {
      await updateStudent(targetClassId, studentId, patch)
      const savedFeedback = 'feedback' in patch
      const savedNotes = 'feedbackNotes' in patch
      if (savedFeedback && savedNotes) {
        notify.success({ title: 'Feedback and notes saved.' })
      } else if (savedFeedback) {
        notify.success({
          title: patch.feedback?.trim() ? 'Feedback saved.' : 'Feedback removed.',
        })
      } else if (savedNotes) {
        notify.success({
          title: patch.feedbackNotes?.trim() ? 'Extra notes saved.' : 'Extra notes removed.',
        })
      }
    } catch (err) {
      notify.error({
        title: 'Could not save.',
        description: formatDbError(err),
      })
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleRenameStudent(targetClassId, studentId, name) {
    if (!updateStudent) {
      notify.error({ title: 'Renaming is not available.' })
      throw new Error('Renaming is not available.')
    }
    try {
      await updateStudent(targetClassId, studentId, { name })
      notify.success({ title: 'Name updated.' })
    } catch (err) {
      notify.error({
        title: 'Could not update name.',
        description: formatDbError(err),
      })
      throw err
    }
  }

  return (
    <section className="panel feedback-panel workspace-panel">
      <PanelChrome
        title="Feedback"
        description={`Choose a class to review every ${UI.learningPartner} and their saved feedback. Click a row to open the feedback editor (${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words per save).`}
      />

      <div className="workspace-body">
        {needsFeedbackMigration ? (
          <Alert
            type="error"
            showIcon
            className="feedback-setup-alert"
            title="Cloud database update required before saving feedback"
            description={
              <>
                Run this once in your Supabase project&apos;s SQL Editor, then refresh and save
                again:
                <pre className="feedback-setup-sql">
                  alter table public.students{'\n'}
                  {'  '}add column if not exists feedback text;{'\n'}
                  alter table public.students{'\n'}
                  {'  '}add column if not exists feedback_notes text;
                </pre>
                File: <code>supabase/migrate-feedback.sql</code>
              </>
            }
          />
        ) : null}
        {needsNotesMigration && !needsFeedbackMigration ? (
          <Alert
            type="error"
            showIcon
            className="feedback-setup-alert"
            title="Cloud database update required before saving extra notes"
            description={
              <>
                Run this once in your Supabase project&apos;s SQL Editor, then refresh and save
                again:
                <pre className="feedback-setup-sql">
                  alter table public.students{'\n'}
                  {'  '}add column if not exists feedback text;{'\n'}
                  alter table public.students{'\n'}
                  {'  '}add column if not exists feedback_notes text;
                </pre>
                File: <code>supabase/migrate-feedback.sql</code>
              </>
            }
          />
        ) : null}

        <div className="feedback-roster-toolbar filter-toolbar">
          <SearchableSelect
            placeholder="Choose class…"
            options={classOptions}
            value={classId || undefined}
            onChange={(v) => {
              setClassId(v ?? '')
              setModalPartnerId(null)
            }}
            allowClear
            label="Class"
          />
        </div>
        {selectedClass && (
          <Typography.Text type="secondary" className="master-pane-hint feedback-roster-summary">
            {withFeedbackCount} of {rosterRows.length} with saved feedback
          </Typography.Text>
        )}

        {!selectedClass ? (
          <Empty
            className="workspace-empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`Select a class to view ${UI.learningPartners} and their feedback.`}
          />
        ) : (
          <div className="table-scroll-region portal-student-list-scroll feedback-roster-region table-scroll-region-with-search">
            <div className="feedback-roster-table-toolbar">
              <TableNameSearch
                value={nameSearch}
                onChange={setNameSearch}
                matchCount={filteredRows.length}
                totalCount={rosterRows.length}
                className="feedback-roster-name-search"
                placeholder={UI.feedbackSearchPlaceholder}
                showSearchIcon
                compact
              />
              <Button
                size="small"
                className="feedback-roster-export-btn"
                icon={<DownloadOutlined />}
                onClick={handleExportCsv}
                disabled={filteredRows.length === 0}
              >
                Export CSV
              </Button>
            </div>
            <div className="feedback-roster-table-wrap" ref={tableRef}>
              {filteredRows.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No names match this search."
                />
              ) : (
                <Table
                  size="small"
                  pagination={{ pageSize: 40, showSizeChanger: false, hideOnSinglePage: true }}
                  scroll={{ y: tableHeight }}
                  rowClassName={(row) =>
                    row.feedback ? 'feedback-roster-row-has-feedback' : 'feedback-roster-row-empty'
                  }
                  dataSource={filteredRows}
                  onRow={(row) => ({
                    onClick: () => setModalPartnerId(row.id),
                    className: 'feedback-roster-row-clickable',
                  })}
                  columns={[
                    {
                      title: UI.learningPartnerName,
                      dataIndex: 'name',
                      ellipsis: true,
                      render: (_, row) => (
                        <span className="feedback-roster-name-link">
                          <EditOutlined className="feedback-roster-edit-icon" aria-hidden />
                          <span className="feedback-roster-name-text">{row.displayName}</span>
                        </span>
                      ),
                    },
                    {
                      title: 'Feedback',
                      key: 'feedback',
                      ellipsis: true,
                      render: (_, row) =>
                        row.feedback ? (
                          <Typography.Text className="feedback-roster-preview">
                            {row.preview}
                          </Typography.Text>
                        ) : (
                          <Typography.Text type="secondary">No feedback saved</Typography.Text>
                        ),
                    },
                    {
                      title: '',
                      key: 'copy',
                      width: 44,
                      align: 'center',
                      className: 'feedback-roster-copy-col',
                      render: (_, row) => (
                        <CopyIconButton
                          text={row.feedback}
                          className="feedback-roster-copy-btn"
                          emptyTooltip="No feedback saved"
                          stopPropagation
                          onCopyError={() =>
                            notify.error({
                              title: 'Could not copy — select the text and copy manually.',
                            })
                          }
                        />
                      ),
                    },
                  ]}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <FeedbackStudentModal
        open={Boolean(modalPartner && selectedClass)}
        classId={classId}
        classMeta={selectedClass}
        partner={modalPartner}
        classAttendance={classAttendance}
        saving={saving}
        needsCloudMigration={needsCloudMigration}
        onClose={() => setModalPartnerId(null)}
        onSaveStudentFields={handleSaveStudentFields}
        onRenameStudent={handleRenameStudent}
      />
    </section>
  )
}
