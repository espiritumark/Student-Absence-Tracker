import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  SaveOutlined,
  SyncOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { notification } from 'antd'
import { createElement } from 'react'
import NotificationNoticeContent from '../components/NotificationNoticeContent'
import { minimizeNotification, removeMinimized } from './notificationMinibar'

export const NOTIFIER_KEYS = {
  authTransition: 'auth-transition',
  authSignIn: 'auth-signin-success',
  authSignOut: 'auth-signout-success',
  bulkScan: 'bulk-scan-progress',
  bulkDraftRestored: 'bulk-draft-restored',
  screenshotScan: 'screenshot-scan-progress',
  cloudSync: 'cloud-sync',
  cloudSyncError: 'cloud-sync-error',
  importDraftJson: 'import-draft-json',
  importDraftScreenshot: 'import-draft-screenshot',
  importParse: 'import-parse',
  importExport: 'import-export',
  importSave: 'import-save',
  importError: 'import-error',
  importVision: 'import-vision-status',
  importReviewPending: 'import-review-pending',
  attendanceSave: 'attendance-save',
  attendanceSaving: 'attendance-saving',
  attendanceDraft: 'attendance-draft',
  rosterBulk: 'roster-bulk',
  absenceBulk: 'absence-bulk',
}

let registeredApi = null
const restoreHandlers = new Map()

export function registerNotificationApi(api) {
  registeredApi = api
}

export function getRegisteredNotifier() {
  if (!registeredApi) return null
  return createNotifier(registeredApi)
}

export const APP_NOTIFICATION_CONFIG = {
  placement: 'top',
  top: 12,
  duration: 3,
  maxCount: 5,
  rtl: false,
  getContainer: () => document.body,
}

export function configureAppNotifications() {
  notification.config(APP_NOTIFICATION_CONFIG)
}

function iconFor(type) {
  const className = `app-notification-icon app-notification-icon--${type}`
  const icons = {
    success: CheckCircleOutlined,
    error: CloseCircleOutlined,
    info: InfoCircleOutlined,
    warning: WarningOutlined,
    loading: LoadingOutlined,
    draft: EditOutlined,
    save: SaveOutlined,
    delete: DeleteOutlined,
    sync: SyncOutlined,
  }
  const Icon = icons[type] || InfoCircleOutlined
  return createElement(Icon, {
    className,
    ...(type === 'loading' || type === 'sync' ? { spin: true } : {}),
  })
}

function wrapDescription(opts, type) {
  const duration = opts.duration ?? (type === 'loading' ? 0 : 3)
  const minimizable = opts.minimizable ?? duration === 0
  const body = opts.description

  if (!body && !minimizable && duration <= 0) return undefined

  const restorePayload = { ...opts, duration: opts.duration ?? duration }

  function registerRestore() {
    if (!opts.key) return
    restoreHandlers.set(opts.key, () => {
      const api = registeredApi
      if (!api) return
      const notifier = createNotifier(api)
      const method =
        type === 'success'
          ? 'success'
          : type === 'error'
            ? 'error'
            : type === 'warning'
              ? 'warning'
              : type === 'draft'
                ? 'draft'
                : type === 'loading'
                  ? 'progress'
                  : 'info'
      notifier[method](restorePayload)
    })
  }

  registerRestore()

  return createElement(NotificationNoticeContent, {
    body,
    noticeKey: opts.key,
    minimizable,
    onMinimize: minimizable
      ? () => {
          if (!opts.key || !registeredApi) return
          registeredApi.destroy(opts.key)
          minimizeNotification({
            key: opts.key,
            title: opts.title,
            type,
            restore: restoreHandlers.get(opts.key),
          })
        }
      : undefined,
  })
}

function baseOptions(opts, type) {
  const duration = opts.duration ?? (type === 'loading' ? 0 : 3)
  return {
    key: opts.key,
    title: opts.title,
    description: wrapDescription({ ...opts, duration }, type),
    placement: 'top',
    duration,
    className: `app-notification app-notification--${type}`,
    icon: opts.icon ?? iconFor(type),
    onClose: () => {
      if (opts.key) {
        removeMinimized(opts.key)
        restoreHandlers.delete(opts.key)
      }
      opts.onClose?.()
    },
    btn: opts.btn,
  }
}

export function createNotifier(api) {
  return {
    success: (opts) => api.success(baseOptions(opts, 'success')),
    error: (opts) => api.error(baseOptions(opts, 'error')),
    info: (opts) => api.info(baseOptions(opts, 'info')),
    warning: (opts) => api.warning(baseOptions(opts, 'warning')),
    draft: (opts) =>
      api.info(
        baseOptions({
          ...opts,
          icon: iconFor('draft'),
          duration: opts.duration ?? 8,
        }, 'draft'),
      ),
    progress: (opts) =>
      api.open(
        baseOptions({
          ...opts,
          icon: iconFor('loading'),
          duration: 0,
          minimizable: opts.minimizable ?? true,
        }, 'loading'),
      ),
    save: (opts) =>
      api.success(
        baseOptions({ ...opts, icon: iconFor('save') }, 'success'),
      ),
    destroy: (key) => {
      removeMinimized(key)
      restoreHandlers.delete(key)
      api.destroy(key)
    },
    destroyAll: () => {
      restoreHandlers.clear()
      api.destroy()
    },
  }
}
