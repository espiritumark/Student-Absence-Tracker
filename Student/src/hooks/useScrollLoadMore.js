import { useEffect, useRef, useState } from 'react'

export function useScrollLoadMore({ total, batchSize = 20, resetKey = '' }) {
  const [visibleCount, setVisibleCount] = useState(batchSize)
  const rootRef = useRef(null)
  const sentinelRef = useRef(null)

  useEffect(() => {
    setVisibleCount(batchSize)
  }, [total, batchSize, resetKey])

  useEffect(() => {
    const root = rootRef.current
    const sentinel = sentinelRef.current
    if (!sentinel || visibleCount >= total) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + batchSize, total))
        }
      },
      { root, rootMargin: '80px', threshold: 0.01 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleCount, total, batchSize])

  return { visibleCount, rootRef, sentinelRef, hasMore: visibleCount < total }
}
