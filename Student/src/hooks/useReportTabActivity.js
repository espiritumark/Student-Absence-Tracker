import { useEffect } from 'react'

/** Report draft / in-progress state to the app tab bar. Clears on unmount. */
export function useReportTabActivity(tabId, activity, onTabActivityChange) {
  useEffect(() => {
    onTabActivityChange?.(tabId, activity ?? null)
    return () => onTabActivityChange?.(tabId, null)
  }, [tabId, activity, onTabActivityChange])
}
