import { useEffect, useRef } from 'react'

/**
 * Calls onDismiss after delayMs while active is true. Clears on deactivate or unmount.
 */
export function useAutoDismiss(active, onDismiss, delayMs = 5000) {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!active) return undefined
    const timer = setTimeout(() => onDismissRef.current(), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])
}
