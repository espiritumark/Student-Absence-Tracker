import { useEffect, useRef, useState } from 'react'

/** Reserve space for a fixed Ant Design table header when using scroll.y. */
export const ANT_TABLE_HEADER_OFFSET = 41

/**
 * Measure a flex scroll region so Ant Design Table scroll.y fits without double scrollbars.
 * Pass headerOffset when the ref wraps the full table (header + body) — scroll.y is body-only.
 */
export function useScrollRegionHeight(defaultHeight = 200, headerOffset = 0) {
  const ref = useRef(null)
  const [height, setHeight] = useState(Math.max(120, defaultHeight - headerOffset))

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    function update() {
      const available = el.clientHeight - headerOffset
      setHeight(available > 0 ? Math.max(120, available) : Math.max(120, defaultHeight - headerOffset))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [defaultHeight, headerOffset])

  return [ref, height]
}
