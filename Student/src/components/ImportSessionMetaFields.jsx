import { Button, Col, Row, Space, Typography } from 'antd'
import { useMemo, useState } from 'react'
import {
  buildImportMetaOptions,
  formatImportMetaFieldValue,
  IMPORT_META_FIELD_LABELS,
} from '../utils/importMetaOptions'
import { importMetaIsDirty } from '../utils/importMetaApply'
import ConfirmDialog from './ConfirmDialog'
import ImportCreatableSelect from './ImportCreatableSelect'
import ImportDateField from './ImportDateField'
import ImportSessionMetaBulkModal from './ImportSessionMetaBulkModal'

export default function ImportSessionMetaFields({
  meta,
  onPatchMeta,
  onApplyBulkPatch,
  onRevertScanned,
  scannedMeta = null,
  classes,
  attendance,
  disabled = false,
}) {
  const [pending, setPending] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [revertOpen, setRevertOpen] = useState(false)

  const options = useMemo(
    () => buildImportMetaOptions(classes, attendance, meta),
    [classes, attendance, meta],
  )

  const metaDirty = useMemo(() => importMetaIsDirty(meta, scannedMeta), [meta, scannedMeta])
  const showMetaActions = Boolean(scannedMeta && (onApplyBulkPatch || onRevertScanned))

  function requestChange(field, nextValue) {
    const current = meta[field]
    if (String(current ?? '') === String(nextValue ?? '')) return
    setPending({ field, nextValue })
  }

  function confirmChange() {
    if (!pending) return
    const ok = onPatchMeta(pending.field, pending.nextValue)
    if (ok !== false) setPending(null)
  }

  function handleBulkApply(patch) {
    if (!onApplyBulkPatch) return
    setBulkError('')
    const ok = onApplyBulkPatch(patch)
    if (ok === false) {
      setBulkError(
        'No matching class found in your saved classes. Check Intake, Level, Group, and Programme, then try again.',
      )
      return
    }
    setBulkOpen(false)
    setBulkError('')
  }

  function confirmRevert() {
    onRevertScanned?.()
    setRevertOpen(false)
  }

  const pendingLabel = pending ? IMPORT_META_FIELD_LABELS[pending.field] : ''

  return (
    <>
      {showMetaActions ? (
        <div className="import-session-meta-actions">
          <Space wrap size={[8, 8]}>
            {onApplyBulkPatch ? (
              <Button size="small" disabled={disabled} onClick={() => setBulkOpen(true)}>
                Edit All Session Details
              </Button>
            ) : null}
            {onRevertScanned ? (
              <Button size="small" disabled={disabled || !metaDirty} onClick={() => setRevertOpen(true)}>
                Revert to Scanned
              </Button>
            ) : null}
          </Space>
        </div>
      ) : null}

      <Row gutter={[12, 12]} className="portal-meta-row">
        <Col xs={12} sm={8} md={4}>
          <Typography.Text className="field-label">Intake</Typography.Text>
          <ImportCreatableSelect
            options={options.intakes}
            value={meta.intake}
            numeric
            disabled={disabled}
            placeholder="Search or type intake…"
            onRequestChange={(next) => requestChange('intake', next)}
          />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Typography.Text className="field-label">Level</Typography.Text>
          <ImportCreatableSelect
            options={options.levels}
            value={meta.level}
            numeric
            disabled={disabled}
            placeholder="Search or type level…"
            onRequestChange={(next) => requestChange('level', next)}
          />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Typography.Text className="field-label">Group</Typography.Text>
          <ImportCreatableSelect
            options={options.groups}
            value={meta.group}
            numeric
            disabled={disabled}
            placeholder="Search or type group…"
            onRequestChange={(next) => requestChange('group', next)}
          />
        </Col>
        <Col xs={24} md={12}>
          <Typography.Text className="field-label">Qualification / Programme</Typography.Text>
          <ImportCreatableSelect
            options={options.qualifications}
            value={meta.qualification}
            disabled={disabled}
            placeholder="Search or type programme…"
            onRequestChange={(next) => requestChange('qualification', next)}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Typography.Text className="field-label">Date</Typography.Text>
          <ImportDateField
            value={meta.date}
            onChange={(next) => onPatchMeta('date', next)}
            disabled={disabled}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Typography.Text className="field-label">Module</Typography.Text>
          <ImportCreatableSelect
            options={options.modules}
            value={meta.module}
            disabled={disabled}
            placeholder="Search or type module…"
            onRequestChange={(next) => requestChange('module', next)}
          />
        </Col>
      </Row>

      <ConfirmDialog
        open={Boolean(pending)}
        title={`Change ${pendingLabel}?`}
        confirmLabel="Apply Change"
        cancelLabel="Keep Current"
        onCancel={() => setPending(null)}
        onConfirm={confirmChange}
      >
        {pending ? (
          <p className="modal-lead">
            Change <strong>{pendingLabel}</strong> from{' '}
            <strong>{formatImportMetaFieldValue(pending.field, meta[pending.field])}</strong> to{' '}
            <strong>{formatImportMetaFieldValue(pending.field, pending.nextValue)}</strong>? When
            Intake, Level, Group, and Programme are all filled, they must match a saved class or
            the change will not be applied. The Learning Partner list refreshes when a class is
            matched.
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={revertOpen}
        title="Revert to scanned session details?"
        confirmLabel="Revert"
        cancelLabel="Keep Edits"
        onCancel={() => setRevertOpen(false)}
        onConfirm={confirmRevert}
      >
        <p className="modal-lead">
          Restore Intake, Level, Group, Programme, Date, and Module to the values from the original
          scan. The Learning Partner list will refresh to match those scanned details.
        </p>
      </ConfirmDialog>

      <ImportSessionMetaBulkModal
        open={bulkOpen}
        meta={meta}
        classes={classes}
        attendance={attendance}
        disabled={disabled}
        error={bulkError}
        onCancel={() => {
          setBulkOpen(false)
          setBulkError('')
        }}
        onApply={handleBulkApply}
      />
    </>
  )
}
