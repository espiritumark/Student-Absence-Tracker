import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Table, Tooltip, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useAppNotifier } from '../hooks/useAppNotifier'
import { useScrollRegionHeight } from '../hooks/useScrollRegionHeight'
import { formatClassLabel } from '../utils/classFormat'
import { formatDbError, isFeedbackColumnMissingError } from '../lib/database'
import { downloadCsv, slugifyFilenamePart } from '../utils/csvExport'
import {
  countFeedbackWords,
  FEEDBACK_WORD_MAX,
  FEEDBACK_WORD_MIN,
  truncateFeedbackPreview,
} from '../utils/feedbackWords'
import { filterByNameSearch } from '../utils/tableNameSearch'
import { UI } from '../utils/uiCopy'
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

  const [tableRef, tableHeight] = useScrollRegionHeight(320)

  async function handleCopyFeedback(text) {
    if (!text?.trim()) return
    try {
      await navigator.clipboard.writeText(text.trim())
      notify.success({ title: 'Copied to clipboard.' })
    } catch {
      notify.error({ title: 'Could not copy — select the text and copy manually.' })
    }
  }

  function handleExportCsv() {
    if (!selectedClass || filteredRows.length === 0) return

    downloadCsv(
      `feedback-${slugifyFilenamePart(formatClassLabel(selectedClass)) || 'class'}.csv`,
      [UI.learningPartnerName, 'Feedback', 'Words'],
      filteredRows.map((row) => [
        row.name,
        row.feedback,
        row.feedback ? String(row.wordCount) : '',
      ]),
    )
    notify.success({ title: 'CSV exported.' })
  }

  async function handleSaveFeedback(targetClassId, studentId, feedbackText) {
    if (!updateStudent) {
      notify.error({ title: 'Saving feedback is not available.' })
      return
    }
    setSaving(true)
    try {
      await updateStudent(targetClassId, studentId, {
        feedback: feedbackText?.trim() ? feedbackText.trim() : null,
      })
      notify.success({
        title: feedbackText?.trim() ? 'Feedback saved.' : 'Feedback removed.',
      })
    } catch (err) {
      notify.error({
        title: 'Could not save feedback.',
        description: formatDbError(err),
      })
      throw err
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel feedback-panel workspace-panel">
      <PanelChrome
        title="Feedback"
        description={`Choose a class to review every ${UI.learningPartner.toLowerCase()} and their saved feedback. Click a row to open the feedback editor (${FEEDBACK_WORD_MIN}–${FEEDBACK_WORD_MAX} words per save).`}
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
                  {'  '}add column if not exists feedback text;
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
            description="Select a class to view learning partners and their feedback."
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
              />
              <Button
                size="small"
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
                  })}
                  columns={[
                    {
                      title: UI.learningPartnerName,
                      dataIndex: 'name',
                      ellipsis: true,
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
                        <Tooltip title={row.feedback ? 'Copy feedback' : 'No feedback saved'}>
                          <Button
                            type="text"
                            size="small"
                            className="feedback-roster-copy-btn"
                            icon={<CopyOutlined />}
                            disabled={!row.feedback}
                            aria-label={
                              row.feedback
                                ? `Copy feedback for ${row.name}`
                                : `No feedback to copy for ${row.name}`
                            }
                            onClick={(event) => {
                              event.stopPropagation()
                              handleCopyFeedback(row.feedback)
                            }}
                          />
                        </Tooltip>
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
        onClose={() => setModalPartnerId(null)}
        onSaveFeedback={handleSaveFeedback}
      />
    </section>
  )
}
