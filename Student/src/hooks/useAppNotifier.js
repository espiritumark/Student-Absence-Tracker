import { App } from 'antd'
import { useEffect, useMemo } from 'react'
import { createNotifier, registerNotificationApi } from '../utils/appNotifications'

export function useAppNotifier() {
  const { notification } = App.useApp()
  const notify = useMemo(() => createNotifier(notification), [notification])

  useEffect(() => {
    registerNotificationApi(notification)
  }, [notification])

  return notify
}
