import { Col, Modal, Row, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import {
  buildImportMetaOptions,
  IMPORT_META_FIELD_LABELS,
} from '../utils/importMetaOptions'
import { copyImportMeta, SESSION_META_FIELDS } from '../utils/importMetaApply'
import ImportCreatableSelect from './ImportCreatableSelect'
import ImportDateField from './ImportDateField'

function draftEqualsMeta(draft, meta) {
  return SESSION_META_FIELDS.every(
    (field) => String(draft[field] ?? '') === String(meta[field] ?? ''),
  )
}

export default function ImportSessionMetaBulkModal({
  open,
  meta,
  classes,
  attendance,
  disabled = false,
  busy = false,
  error = '',
  onCancel,
  onApply,
}) {
  const [draft, setDraft] = useState(() => copyImportMeta(meta))

  const options = useMemo(
    () => buildImportMetaOptions(classes, attendance, draft),
    [classes, attendance, draft],
  )

  useEffect(() => {
    if (open) setDraft(copyImportMeta(meta))
  }, [open, meta])

  function patchDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function handleApply() {
    if (draftEqualsMeta(draft, meta)) {
      onCancel?.()
      return
    }
    const patch = {}
    for (const field of SESSION_META_FIELDS) {
      if (String(draft[field] ?? '') !== String(meta[field] ?? '')) {
        patch[field] = draft[field]
      }
    }
    onApply(patch)
  }

  return (
    <Modal
      open={open}
      title="Edit All Session Details"
      okText={busy ? 'Applying…' : 'Apply Changes'}
      cancelText="Cancel"
      confirmLoading={busy}
      okButtonProps={{ disabled: disabled || busy }}
      cancelButtonProps={{ disabled: busy }}
      onCancel={busy ? undefined : onCancel}
      onOk={handleApply}
      destroyOnHidden
      centered
      width={720}
      className="import-session-meta-bulk-modal"
    >
      <Typography.Paragraph type="secondary" className="modal-lead">
        Update every session field at once. When Intake, Level, Group, and Programme are all filled,
        they must match a saved class or changes will not be applied. The Learning Partner list
        refreshes when a class is matched.
      </Typography.Paragraph>

      <Row gutter={[12, 12]} className="portal-meta-row">
        <Col xs={12} sm={8} md={6}>
          <Typography.Text className="field-label">{IMPORT_META_FIELD_LABELS.intake}</Typography.Text>
          <ImportCreatableSelect
            options={options.intakes}
            value={draft.intake}
            numeric
            disabled={disabled || busy}
            placeholder="Search or type intake…"
            onRequestChange={(next) => patchDraft('intake', next)}
          />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Typography.Text className="field-label">{IMPORT_META_FIELD_LABELS.level}</Typography.Text>
          <ImportCreatableSelect
            options={options.levels}
            value={draft.level}
            numeric
            disabled={disabled || busy}
            placeholder="Search or type level…"
            onRequestChange={(next) => patchDraft('level', next)}
          />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Typography.Text className="field-label">{IMPORT_META_FIELD_LABELS.group}</Typography.Text>
          <ImportCreatableSelect
            options={options.groups}
            value={draft.group}
            numeric
            disabled={disabled || busy}
            placeholder="Search or type group…"
            onRequestChange={(next) => patchDraft('group', next)}
          />
        </Col>
        <Col xs={24} md={12}>
          <Typography.Text className="field-label">
            {IMPORT_META_FIELD_LABELS.qualification}
          </Typography.Text>
          <ImportCreatableSelect
            options={options.qualifications}
            value={draft.qualification}
            disabled={disabled || busy}
            placeholder="Search or type programme…"
            onRequestChange={(next) => patchDraft('qualification', next)}
          />
        </Col>
        <Col xs={24} sm={12}>
          <Typography.Text className="field-label">Date</Typography.Text>
          <ImportDateField
            value={draft.date}
            disabled={disabled || busy}
            onChange={(next) => patchDraft('date', next)}
          />
        </Col>
        <Col xs={24} sm={12}>
          <Typography.Text className="field-label">{IMPORT_META_FIELD_LABELS.module}</Typography.Text>
          <ImportCreatableSelect
            options={options.modules}
            value={draft.module}
            disabled={disabled || busy}
            placeholder="Search or type module…"
            onRequestChange={(next) => patchDraft('module', next)}
          />
        </Col>
      </Row>

      {error ? (
        <Typography.Paragraph type="danger" className="import-session-meta-bulk-error">
          {error}
        </Typography.Paragraph>
      ) : null}
    </Modal>
  )
}
