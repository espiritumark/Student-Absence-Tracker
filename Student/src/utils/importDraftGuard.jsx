import { confirmAsync } from './confirmAsync'

const SUB_TAB_LABELS = {
  json: 'JSON',
  screenshot: 'Screenshot',
  'bulk-screenshots': 'Bulk Screenshots',
}

/**
 * Bulk queue leave (scan in progress or unsaved scanned/queued items).
 * @returns {Promise<boolean>}
 */
export async function confirmBulkDraftLeave({ scanning, readyCount, queuedCount }) {
  if (scanning) {
    return confirmAsync({
      title: 'Queue scan in progress',
      content:
        'Leaving now can interrupt the current vision AI scan. Scanned drafts stay in Bulk Screenshots when you return, but the active scan may fail.',
      okText: 'Leave anyway',
      okType: 'danger',
      cancelText: 'Stay',
    })
  }

  const unsaved = readyCount + queuedCount
  if (unsaved > 0) {
    const parts = []
    if (readyCount > 0) {
      parts.push(
        `${readyCount} scanned session${readyCount === 1 ? '' : 's'} not saved to your roster`,
      )
    }
    if (queuedCount > 0) {
      parts.push(`${queuedCount} still queued for scan`)
    }
    return confirmAsync({
      title: 'Unsaved bulk import drafts',
      content: (
        <>
          <p style={{ margin: '0 0 0.5rem' }}>
            {parts.join(' · ')}. Drafts stay in{' '}
            <strong>Record Attendance → Bulk Screenshots</strong> until you save each session or clear
            the queue.
          </p>
          <p style={{ margin: 0 }}>
            Leaving does <strong>not</strong> save attendance to your classes.
          </p>
        </>
      ),
      okText: 'Leave anyway',
      cancelText: 'Stay',
    })
  }

  return true
}

/**
 * Unified guard for import sub-tabs and leaving Record Attendance.
 * @returns {Promise<boolean>} true = navigation may proceed
 */
export async function confirmImportNavigationLeave({
  fromMode,
  bulkLeaveGuard = null,
  processing = false,
  hasJsonDraft = false,
  hasScreenshotDraft = false,
}) {
  if (fromMode === 'bulk-screenshots' && bulkLeaveGuard) {
    return bulkLeaveGuard()
  }

  if (fromMode === 'screenshot' && processing) {
    return confirmAsync({
      title: 'Screenshot scan in progress',
      content:
        'Leaving Record Attendance can interrupt the vision AI scan. Stay on this tab until the scan finishes.',
      okText: 'Leave anyway',
      okType: 'danger',
      cancelText: 'Stay',
    })
  }

  if (fromMode === 'json' && hasJsonDraft) {
    return confirmAsync({
      title: 'Unsaved JSON import draft',
      content: (
        <>
          <p style={{ margin: '0 0 0.5rem' }}>
            Parsed JSON and review data stay in <strong>Record Attendance → JSON</strong> when you
            return.
          </p>
          <p style={{ margin: 0 }}>
            Leaving does <strong>not</strong> save attendance to your classes until you review and
            save.
          </p>
        </>
      ),
      okText: 'Leave anyway',
      cancelText: 'Stay',
    })
  }

  if (fromMode === 'screenshot' && hasScreenshotDraft) {
    return confirmAsync({
      title: 'Unsaved screenshot import draft',
      content: (
        <>
          <p style={{ margin: '0 0 0.5rem' }}>
            Screenshot preview and scan review stay in{' '}
            <strong>Record Attendance → Screenshot</strong> when you return.
          </p>
          <p style={{ margin: 0 }}>
            Leaving does <strong>not</strong> save attendance to your classes until you review and
            save.
          </p>
        </>
      ),
      okText: 'Leave anyway',
      cancelText: 'Stay',
    })
  }

  return true
}

export function getImportTabActivity({
  importMode,
  bulkPanelActivity,
  saving,
  processing,
  hasJsonDraft,
  hasScreenshotDraft,
}) {
  if (importMode === 'bulk-screenshots') {
    if (bulkPanelActivity?.busy) return 'processing'
    if (bulkPanelActivity?.draft) return 'draft'
    return null
  }
  if (saving || processing) return 'processing'
  if (importMode === 'json' && hasJsonDraft) return 'draft'
  if (importMode === 'screenshot' && hasScreenshotDraft) return 'draft'
  return null
}

export function importSubTabLabel(mode) {
  return SUB_TAB_LABELS[mode] || 'Import'
}
